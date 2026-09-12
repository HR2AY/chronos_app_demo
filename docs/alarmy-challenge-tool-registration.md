# Alarmy Challenge Tool Registration

本文件给负责 LiveKit Agent 的实现 agent。目标是在 LiveKit + OpenAI Realtime 通话中注册一个“唤醒挑战”工具：AI 可以启动一道算术题或要求用户输入指定文字，但题目生成、答案校验和完成状态必须由代码负责。

## 结论与边界

这个功能可实现。OpenAI Realtime 支持 function calling，LiveKit Agents 会把 Python `@function_tool` 自动转换为 Realtime 的 function tool，并负责解析 `function_call`、执行 Python 函数、把结果回传到模型。

不要让模型自己计算正确答案、决定挑战是否成功或直接声称“已完成”。模型输出是不确定的；工具返回值和服务端状态才是事实来源。

## Mandatory consent gate

挑战工具有一个硬门槛：

1. 先完成 **3 轮常规对话**。一轮指一次有效的用户发言以及对应的普通 agent 回复；initial greeting 不计入，challenge/tool call 也不计入。
2. 第 3 轮普通回复结束后，agent 只能询问用户是否要完成这个任务。
3. 在用户明确同意前，`start_alarm_challenge` 和 `get_alarm_challenge_result` 不得注册到 Realtime session 的 `tools` 列表，因此模型没有机会调用它们。
4. 只有识别到明确肯定（例如“是”“好”“可以”“开始”/英文 `yes`, `ok`, `start`）后，代码才通过 `agent.update_tools()` 动态加入 challenge tools，然后触发下一次 response。
5. 否定、沉默、模糊回答或拒绝时，不调用任何 challenge tool；“嗯”“随便”“再说吧”不能当作同意。

同意识别最好使用前端明确的确认按钮/RPC；如果使用语音 transcript，必须采用有限的肯定短语白名单，不要让模型仅凭语义自行把 consent 状态改成 true。

## Realtime wire format

OpenAI Realtime 在 `session.update` 中期望扁平的 function 定义：

```json
{
  "type": "function",
  "name": "start_alarm_challenge",
  "description": "Start a deterministic wake-up challenge and show it to the user.",
  "parameters": {
    "type": "object",
    "properties": {
      "alarm_id": {
        "type": "string",
        "description": "The alarm identifier for this call."
      },
      "kind": {
        "type": "string",
        "enum": ["arithmetic", "text"],
        "description": "Challenge kind. Use arithmetic for a calculation, text for exact text entry."
      },
      "difficulty": {
        "type": "string",
        "enum": ["easy", "medium"],
        "description": "Difficulty requested by the alarm policy."
      }
    },
    "required": ["alarm_id", "kind", "difficulty"],
    "additionalProperties": false
  }
}
```

Realtime 工具定义**没有** Chat Completions 风格的 `function: { ... }` 嵌套。`arguments` 在模型返回的 `function_call` item 中是 JSON 字符串：

```json
{
  "type": "function_call",
  "name": "start_alarm_challenge",
  "call_id": "call_abc",
  "arguments": "{\"alarm_id\":\"alarm-123\",\"kind\":\"arithmetic\",\"difficulty\":\"easy\"}"
}
```

LiveKit 会将工具结果作为 `function_call_output` 回传，然后继续 response loop。业务代码不需要手写这些底层事件。

## Python registration

优先使用类型注解，让 LiveKit 从签名生成 schema：

```python
import json
from typing import Literal
from livekit.agents import Agent, RunContext, function_tool


class ChronosAgent(Agent):
    def __init__(self, instructions: str, challenge_service) -> None:
        super().__init__(instructions=instructions)
        self.challenge_service = challenge_service

    @function_tool()
    async def start_alarm_challenge(
        self,
        context: RunContext,
        alarm_id: str,
        kind: Literal["arithmetic", "text"],
        difficulty: Literal["easy", "medium"],
    ) -> str:
        """Start one wake-up challenge for the current alarm.

        Call this only when the alarm challenge should begin. The server creates
        the deterministic prompt and stores the answer; do not invent an answer.
        Return the challenge id and the user-facing prompt, but never reveal the
        expected answer to the user.
        """
        result = await self.challenge_service.start(
            alarm_id=alarm_id,
            kind=kind,
            difficulty=difficulty,
        )
        return json.dumps(result, ensure_ascii=False)

    @function_tool()
    async def get_alarm_challenge_result(
        self,
        context: RunContext,
        challenge_id: str,
    ) -> str:
        """Read the server-validated result of a submitted wake-up challenge.

        Call this after the frontend reports that the user submitted an answer.
        Treat status from this tool as authoritative.
        """
        result = await self.challenge_service.get_result(challenge_id)
        return json.dumps(result, ensure_ascii=False)
```

The `RunContext` parameter is injected by LiveKit and is not exposed in the JSON schema.

> **Important for this product gate:** the class-method example above is useful for
> showing the tool signature, but do not leave these challenge methods as decorated
> methods on the live `ChronosAgent` when the three-round consent gate is enabled.
> LiveKit auto-discovers decorated methods during agent construction. In production,
> define the challenge functions outside the class and pass them only after consent,
> as shown below.

### Dynamic registration (required for the consent gate)

不要把 challenge methods 直接定义为 `ChronosAgent` 的 `@function_tool` 方法，因为这会在 agent 创建时自动发现并暴露。将 challenge tools 定义在 agent 类外部，创建 session 时只传基础工具；同意后再动态加入：

```python
challenge_tools = [start_alarm_challenge, get_alarm_challenge_result]
agent = ChronosAgent(instructions=instructions)
base_tools = agent.tools

async def on_explicit_consent() -> None:
    # update_tools replaces the complete set and sends a Realtime session.update.
    await agent.update_tools(agent.tools + challenge_tools)
    await agent.session.generate_reply(
        instructions="The user explicitly consented. Start the challenge by calling start_alarm_challenge."
    )
```

`update_tools()` 会替换完整工具集并同步 Realtime session。实现时由代码保存“常规轮数”和 `consent_state`，只允许 `rounds >= 3 and consent_state == granted` 的路径调用 `on_explicit_consent()`。如果用户拒绝，永远不要加入 challenge tools。

如果产品需要在同一通话中再次发起挑战，先撤销工具（`await agent.update_tools(base_tools)`），重新完成 3 轮和同意门槛；不能因为上一次同意而永久保留权限。

### Tool placement

Pass tools through `Agent(tools=...)` or define them as decorated methods on the agent, as above. The current repository's `ChronosAgent` has only instructions; it must be changed so the decorated methods are discovered. Keep the challenge tool set small (normally two or three tools).

Do not put the challenge answer in the tool description, tool arguments, LiveKit room metadata, logs, or spoken prompt. Store it server-side, preferably as a hash or opaque verifier.

## Tool result contract

`start_alarm_challenge` should return a compact JSON string for the LLM:

```json
{
  "ok": true,
  "challenge_id": "challenge-7f3b",
  "alarm_id": "alarm-123",
  "kind": "arithmetic",
  "prompt": "What is 7 + 5?",
  "input_mode": "numeric",
  "expires_at": "2026-09-04T07:02:00+08:00",
  "attempts_remaining": 3
}
```

The prompt is safe to show to the user. The expected answer is never included. For a text challenge, use `input_mode: "text"`, an exact or normalized comparison policy, and a prompt such as `Type: MORNING READY`.

`get_alarm_challenge_result` should return one of:

```json
{"ok": true, "challenge_id": "challenge-7f3b", "status": "passed", "attempts_remaining": 3}
```

```json
{"ok": true, "challenge_id": "challenge-7f3b", "status": "failed", "reason": "incorrect", "attempts_remaining": 2}
```

```json
{"ok": true, "challenge_id": "challenge-7f3b", "status": "expired", "attempts_remaining": 0}
```

The tool should raise `ToolError` for transport or server failures with an actionable message. A normal user mistake is a valid result (`status: failed`), not an exception.

## Frontend handoff

The tool result must reach the mobile/web UI through a structured LiveKit data event or agent-to-frontend RPC. Do not parse spoken transcript text to discover the arithmetic expression. Suggested event:

```json
{
  "event": "alarm_challenge.created",
  "version": 1,
  "challenge_id": "challenge-7f3b",
  "kind": "arithmetic",
  "prompt": "What is 7 + 5?",
  "input_mode": "numeric",
  "expires_at": "2026-09-04T07:02:00+08:00",
  "attempts_remaining": 3
}
```

The frontend submits input with a structured event/RPC containing `challenge_id` and `value`. The server validates it and emits `alarm_challenge.result`; the agent may then call `get_alarm_challenge_result` or receive the result through the session integration.

## Reliability requirements

- Use an idempotency key such as `alarm_id + challenge_round` so Realtime retries cannot create two active challenges.
- Make `start_alarm_challenge` reject a second active challenge for the same alarm, or return the existing challenge.
- Use a server timeout and attempt counter. Client timers are only for display.
- Return small, speech-ready summaries; do not return the answer or a large database record.
- Set `max_tool_steps` high enough for the intended loop, but keep it bounded (for this flow, 3 is usually enough).
- For mutating operations, consider `ctx.disallow_interruptions()` after the server write begins.
- Treat room disconnects and Realtime reconnects as recoverable transport events. The challenge state remains on the server and is resumed or expired explicitly.

## References

- OpenAI: https://developers.openai.com/api/docs/guides/realtime-conversations#function-calling
- LiveKit: https://docs.livekit.io/agents/logic/tools/definition/
- LiveKit frontend forwarding/RPC: https://docs.livekit.io/agents/logic/tools/forwarding/
