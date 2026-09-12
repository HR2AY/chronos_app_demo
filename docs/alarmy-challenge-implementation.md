# Alarmy-Style Wake-up Challenge Implementation

本文件给负责完整功能的实现 agent。它描述在 Chronos 的 LiveKit + OpenAI Realtime 通话中，如何实现类似 Alarmy 的算术题/文字输入挑战。

## Feasibility assessment

可实现，且调用/回传链路足够稳定，前提是把职责拆开：

| 部分 | 负责内容 | 是否交给模型 |
| --- | --- | --- |
| OpenAI Realtime | 语音对话、决定何时请求开始挑战、口头提示 | 是，但只作为 orchestration |
| LiveKit Agent tool | 调用服务端、返回结构化结果、触发 UI 事件 | 是，工具由代码实现 |
| Server | 生成题目、保存答案验证器、超时、次数、幂等、最终状态 | 否，必须确定性 |
| Mobile/Web UI | 显示题目、接收键盘输入、提交 challenge_id/value | 否，必须确定性 |
| AlarmKit | 本地闹钟触发和授权 | 否 |

不能依赖以下不稳定方案：让模型在语音中生成算式并自行记住答案；从 LiveKit transcript 猜题目；让模型根据用户的“我答对了”决定成功；让客户端本地判断成功后直接解锁闹钟。

## Consent and three-round gate

挑战不是通话一开始就可调用的能力。一次有效的用户发言及其普通 agent 回复计为 1 轮；initial greeting、打断、空 transcript、challenge 调用和 challenge 结果均不计入。代码维护 `conversation_rounds`，模型不得自行报告轮数。

状态必须按以下顺序推进：

```text
normal(round 0..2) -> awaiting_consent
awaiting_consent -> consent_granted -> challenge_tools_enabled
awaiting_consent -> consent_denied/ambiguous -> tools remain disabled
challenge_tools_enabled -> challenge_running -> challenge_finished
```

前 3 轮和等待同意阶段，Realtime `session.tools` 中不得出现 challenge tools。第 3 轮普通回复结束后先询问是否同意；只有明确肯定才由代码通过 `agent.update_tools()` 动态加入工具。优先使用确认按钮/RPC；语音只接受有限白名单（如“是/好/可以/开始”、`yes/ok/start`），不能把“嗯”“随便”“再说吧”当同意。

## Recommended flow

1. AlarmKit 或服务端确定闹钟触发，移动端加入 LiveKit 房间。
2. Agent session 建立，完成 3 轮常规对话；challenge tools 尚未注册。
3. 第 3 轮普通回复结束后，agent 询问“是否要完成这个任务”，保持 challenge tools 禁用。
4. 用户通过确认按钮/RPC 或明确肯定语音表示同意；代码将 consent 设为 `granted`，通过 `agent.update_tools()` 加入 challenge tools。
5. Agent 下一轮调用 `start_alarm_challenge`；如果用户拒绝、沉默或回答不明确，则不调用任何 challenge tool。
6. Agent tool 向服务端 `POST /api/alarm-challenges`，携带 `alarm_id`、`kind`、`difficulty` 和幂等键。
7. 服务端生成挑战并保存 `challenge_id`、安全验证器、过期时间、最大尝试次数和 `pending` 状态。
8. Agent 将不含答案的 challenge payload 通过 LiveKit data/RPC 发给前端；tool 返回 speech-ready 摘要，模型告诉用户“请在屏幕上输入”。
9. 前端渲染 numeric 或 text 输入框。用户提交 `{challenge_id, value}` 到服务端（推荐 HTTPS），或通过 LiveKit RPC 转发到 Agent 再由 Agent 调服务端。
10. 服务端原子校验并更新状态为 `passed`、`failed` 或 `expired`，返回剩余次数。
11. 服务端/Agent 发送 `alarm_challenge.result` 结构化事件。Agent 可以调用 `get_alarm_challenge_result` 获取权威状态并口头反馈。
12. 只有 `passed` 才能标记 alarm challenge 完成；失败达到上限或过期时进入失败处理（重试、延迟、关闭本次 alarm，按产品策略执行）。

## State machine

```text
pending -> presented -> submitted -> passed
                         |          -> failed -> submitted (if attempts remain)
                         |          -> failed (attempts exhausted)
                         -> expired
pending/presented/submitted -> cancelled  (call/room explicitly ended)
```

建议状态字段：

```text
challenge_id
alarm_id
kind                  arithmetic | text
prompt                user-facing prompt, no answer
input_mode            numeric | text
verifier               server-only hash/structured verifier
normalization_policy   exact | trim_upper | numeric
status                 pending | presented | passed | failed | expired | cancelled
attempts_used
max_attempts
expires_at             ISO 8601 with timezone offset or UTC
round                  monotonic integer per alarm
idempotency_key
created_at
updated_at
```

不要把 `verifier`、明文答案或生成随机数写进客户端 payload、LiveKit metadata 或普通日志。

## Challenge generation

### Arithmetic

服务端生成并保存结构化题目，例如：

```json
{
  "kind": "arithmetic",
  "input_mode": "numeric",
  "operands": [7, 5],
  "operator": "+",
  "expected": 12
}
```

客户端只收到：

```json
{
  "prompt": "What is 7 + 5?",
  "input_mode": "numeric"
}
```

支持的第一版题型建议限制为加减法、结果非负、最多两位数，避免语音/输入歧义。答案校验必须使用服务端保存的结构化表达式或哈希验证器，而不是重新解析模型文本。

### Exact text

服务端生成或从白名单选择短语，例如 `MORNING READY`，保存规范化规则：

```text
normalization_policy = trim_upper
expected = "MORNING READY"
```

第一版只允许 ASCII 大写短语，长度限制 4 到 40，避免中文输入法、全角字符和语音识别带来的歧义。后续如需中文，必须明确 Unicode normalization 和空白折叠规则。

## API contract

建议新增：

```text
POST /api/alarm-challenges
GET  /api/alarm-challenges/{challenge_id}
POST /api/alarm-challenges/{challenge_id}/submit
POST /api/alarm-challenges/{challenge_id}/cancel
```

创建请求：

```json
{
  "alarm_id": "alarm-123",
  "kind": "arithmetic",
  "difficulty": "easy",
  "round": 1,
  "idempotency_key": "alarm-123:1"
}
```

提交请求：

```json
{
  "value": "12"
}
```

提交响应：

```json
{
  "challenge_id": "challenge-7f3b",
  "status": "passed",
  "attempts_remaining": 2
}
```

服务端必须在一次事务中完成：检查状态/过期/次数、比较答案、递增次数、写入最终状态。重复提交同一个已结束 challenge 应返回相同终态，不得再次扣次数。

## LiveKit transport

推荐使用两条结构化消息：

```text
agent -> frontend: alarm_challenge.created
frontend -> server: HTTPS submit
server -> frontend/agent: alarm_challenge.result
```

如果必须由 Agent 作为中转，可使用 LiveKit RPC：

```text
Agent perform_rpc("presentAlarmChallenge")  // 只负责展示，快速 ack
Frontend perform_rpc("submitAlarmChallenge", payload) // 只负责转发，短超时
```

不要让一个 Agent tool 阻塞等待用户输入几十秒。长时间等待会遇到 Realtime interruption、RPC timeout、房间断开和重复 tool call。`start_alarm_challenge` 应快速返回；用户输入是独立事件。LiveKit 官方也建议通过 RPC 将前端专有动作结构化转发。

## Agent behavior

模型提示应要求：

- 前 3 轮只进行常规对话，不调用 challenge tools。
- 第 3 轮普通回复后先询问用户是否同意完成任务；没有明确同意时不调用 challenge tools。
- 只有收到 `start_alarm_challenge` 成功结果后，才告诉用户挑战已经开始。
- 不朗读答案，不猜测用户输入是否正确。
- 收到 `passed` 才说完成；`failed` 时鼓励重试并说明剩余次数；`expired`/`cancelled` 时说明本轮结束。
- 不要在同一轮重复调用 start tool；服务端返回已有 active challenge 时继续该 challenge。
- 先使用工具结果中的 prompt，不要自行改写算式或指定文字。

工具调用稳定性主要取决于：小而清晰的 schema、幂等服务端、短结果、显式状态机和结构化 UI 事件。不要通过 prompt 试图把确定性问题“教给模型”。

## Failure and recovery

| 场景 | 处理 |
| --- | --- |
| 前 3 轮内模型尝试 challenge tool | challenge tool 未注册；保持禁用并记录违规 |
| 第 3 轮后用户拒绝/沉默/模糊回答 | 不调用 tool，保持 `consent != granted` |
| 同意判断不确定 | 重新询问一次或提供确认按钮，不猜测 |
| Realtime 重连发生在同意前 | 重连后仍不注册 challenge tools，恢复轮数和 `awaiting_consent` 状态 |
| Realtime 重连发生在同意后 | 恢复服务端 consent/session 状态并重新校验 active challenge |
| Realtime 重试同一 tool call | 幂等键返回同一 active challenge |
| Agent 掉线 | challenge 保留到 expires_at；前端可重新连接并拉取 active challenge |
| 前端掉线 | challenge 不自动通过；超时后 expired |
| 提交网络重试 | 使用 submission id 或 challenge 状态幂等，终态响应可重复返回 |
| 服务端 5xx/超时 | tool 返回 `ToolError`，模型不要声称已开始；显示“暂时无法验证” |
| 用户说“我答对了”但没有提交 | 仍为 pending，要求屏幕提交 |
| 输入法/格式不合法 | 返回 `failed` 或 `invalid_input`，不让模型解释内部错误 |
| 通话中断 | 记录 `cancelled` 或保留 pending，按产品策略恢复；不可默认 passed |

## Security and abuse controls

- challenge payload 不包含答案。
- challenge_id 使用不可预测随机值；服务端仍要校验当前用户/设备/room 绑定。
- 限制题目长度、尝试次数和有效期，避免刷接口。
- 日志只记录 challenge_id、状态和耗时，不记录答案或完整用户输入。
- 服务端是 alarm challenge 的 source of truth；客户端本地状态只能显示，不可直接解锁。

## Implementation order

1. 新增 challenge 表、服务和 REST endpoints；先写状态机/幂等/过期测试。
2. 在 Agent 中以外部 function tool 形式实现 `start_alarm_challenge` 和 `get_alarm_challenge_result`，接入服务端 HTTP client；同意前不放入 `session.tools`，同意后用 `agent.update_tools()` 动态加入。
3. 增加 LiveKit data/RPC 的 `created`/`result` 消息协议。
4. 移动端和 Web 端实现 challenge overlay、numeric/text 输入和提交状态。
5. 将 AlarmKit 触发流程与 challenge 的 passed/failed 策略接起来。
6. 做断线、重复调用、重复提交、超时、错误恢复和多设备测试。

## Acceptance criteria

- 前 3 轮常规对话期间，Realtime `session.tools` 不含 challenge tools。
- 第 3 轮结束后，agent 明确询问同意；用户未明确同意时没有 challenge tool call。
- 用户明确同意后，工具通过动态注册加入，且只加入一次。
- 同一个 `alarm_id + round` 重复调用 start 不会生成两个 active challenge。
- 模型从不需要知道答案也能完成整个交互。
- 前端展示内容与 tool 返回的 `challenge_id/prompt` 一致。
- 只有服务端返回 `passed` 才能完成挑战。
- Realtime 重连、Agent 重启、HTTP 重试不会把失败变成成功，也不会重复扣次数。
- 用户可以在通话中完成算术和文字两种输入；过期和失败状态可见且可恢复。
