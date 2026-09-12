# LiveKit / OpenAI Realtime 当前架构

最后核对：2026-09-12

本文描述当前工作区 `E:\code\chronos _web` 中的 **Web 端实现**。当前验证范围只包含浏览器，
不包含原生 iOS/Android 客户端。

## 组件与职责

| 层 | 当前实现 | 职责 |
| --- | --- | --- |
| Web 客户端 | `mobile/src/screens/chat/LiveKitChatScreen.web.tsx` | 使用 `livekit-client` 创建 `Room`，处理浏览器麦克风、远端音轨、房间事件、转写和 challenge data event |
| 客户端服务 | `mobile/src/services/livekit.ts` | 调用 token endpoint，组装 room、participant 和 session context |
| API | `server/app/main.py`、`server/app/livekit_service.py` | 签发 LiveKit token，写入 Agent dispatch metadata，并提供 challenge API |
| Agent | `agent/main.py` | 加入 LiveKit 房间，创建 `AgentSession`，运行 Realtime 或 STT-LLM-TTS，执行 function tools |

Web 客户端通过共享 token endpoint 连接同一套 API、LiveKit Agent 和服务端数据。

## 会话流程

1. Web 客户端生成唯一 room name 和 participant identity。
2. 客户端调用 `POST /livekit/token`。
3. API 使用 LiveKit API key/secret 签发 token，并通过 `RoomAgentDispatch` 指定 `chronos-agent`。
4. `session_context` 被放入 dispatch metadata，Agent 从 `ctx.job.metadata` 读取 location、coach、annotation 和 alarm。
5. Web 客户端加入 LiveKit 房间并发布麦克风音频。
6. Agent Worker 接收调度，调用 `ctx.connect()`，然后创建 `AgentSession`。
7. Agent 根据 `OPENAI_REALTIME_ENABLED` 选择：
   - `true`：`openai.realtime.RealtimeModel`；
   - `false`：Silero VAD + OpenAI STT + LLM + TTS。
8. Agent 启动后调用 `session.generate_reply()` 发送 greeting。
9. Web 客户端播放 Agent 音频并显示 Agent 状态、转写和 challenge UI。
10. 会话结束时 Web 客户端断开房间，Agent shutdown callback 调用 `AgentSession.aclose()`。

## Web 客户端实现

`LiveKitChatScreen.web.tsx` 直接使用 `livekit-client`：

- `Room.connect(serverUrl, token)` 加入房间；
- `TrackSubscribed` 挂载远端音频到隐藏的 HTML audio element；
- `setMicrophoneEnabled()` 控制浏览器麦克风；
- `DataReceived` 接收 topic 为 `alarm_challenge` 的结构化事件；
- 当前代码仍监听 `RoomEvent.TranscriptionReceived`。

LiveKit 新版推荐使用 `registerTextStreamHandler("lk.transcription", ...)` 接收转写 text stream；
`TranscriptionReceived` 属于兼容/旧路径。若 Web 端出现有声音但无文本，应优先迁移到 text stream，
并按 `lk.segment_id`、`lk.transcribed_track_id`、`lk.transcription_final` 合并 segment。

当前 Web 架构不依赖原生 WebRTC 模块或 Expo development build。

## 转写链路

LiveKit AgentSession 默认可以把用户 STT 和 Agent speech transcript 发布到房间的 `lk.transcription`
text stream。服务端诊断应监听：

- `user_input_transcribed`：用户最终转写；
- `conversation_item_added`：用户和 Agent 的 conversation message；
- `error`、`speech_created`：异常和 Agent 输出状态。

Realtime 模型不保证提供可靠的 interim transcript；用户输入转写可能晚于 Agent 回复。实时字幕要求较高时，
使用 STT-LLM-TTS 或为 Realtime 会话增加独立 STT。

## Tools / Function calling

当前 Agent 已定义两个 function tools：

- `start_alarm_challenge`：调用 `POST /api/alarm-challenges`，并发布 `alarm_challenge.created` data event；
- `get_alarm_challenge_result`：读取服务端 challenge 状态。

Agent 初始化时使用 `tools=[]`。完成三轮普通对话、Agent 询问同意、用户 transcript 命中肯定词白名单后，
才调用 `agent.update_tools([...])` 动态加入 challenge tools。

真实工具调用的成功判据不是“函数存在”，而是完整链路：

```text
模型 function call
-> Agent Python tool execute
-> 结果或 ToolError
-> 相同 call_id 的 function_call_output
-> 后续 assistant reply
```

## Challenge 数据流

```text
Agent start_alarm_challenge
  -> API 创建 challenge
  -> Agent publish_data(topic="alarm_challenge")
  -> Web UI 显示题目
  -> UI POST /api/alarm-challenges/{id}/submit
  -> API 返回 passed / failed / expired
```

服务端是 challenge 的事实来源；客户端不能根据语音 transcript 或本地状态判断成功。

## 配置与启动

`server` 和 `agent` 需要 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`；Agent 还需要
`OPENAI_API_KEY`。Realtime 网络不稳定时，可只配置 Agent 专用的 `OPENAI_HTTP_PROXY`，不要默认设置全局
`HTTP_PROXY`/`HTTPS_PROXY`。

```powershell
# API
cd E:\code\chronos _web\server
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Agent
cd E:\code\chronos _web\agent
.venv\Scripts\python.exe main.py start

# Web
cd E:\code\chronos _web\mobile
npx expo start --web --port 8082
```

## 当前验证状态

已验证：

- Agent 依赖和 Python 语法；
- Mobile TypeScript；
- OpenAI Realtime WebSocket 可收到 `session.created`；
- Agent Worker 可向 LiveKit Cloud 注册 `chronos-agent`。

仍需真实房间会话确认：用户 transcript 是否在两端稳定显示，以及 challenge tool 的调用、执行、结果回传和后续回复是否完整闭环。

## 相关文档

- `agent/README_REALTIME_NETWORK.md`：Realtime 网络和代理排障
- `docs/alarmy-challenge-implementation.md`：challenge 状态机和 API 设计
- `docs/alarmy-challenge-tool-registration.md`：工具 schema、动态注册和 consent gate
- `docs/livechat-alarm-integration-analysis.md`：LiveKit 与闹钟域集成分析
