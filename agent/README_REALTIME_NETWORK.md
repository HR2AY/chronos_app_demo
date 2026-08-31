# Chronos OpenAI Realtime 网络排障经验

这份文档给后续 coding AI 和维护者使用。它记录 Chronos Agent 如何连接 LiveKit 和 OpenAI Realtime，以及在不同网络环境之间切换时应该修改哪里、如何判断问题在哪一层。

## 先记住结论

Chronos Agent 同时需要两条不同的网络链路：

1. Agent -> LiveKit Cloud：用于加入 LiveKit 房间、接收麦克风音频、发布 Agent 音频。
2. Agent -> OpenAI Realtime：用于连接 OpenAI Realtime WebSocket、生成语音回复。

这两条链路不一定需要同一个代理。当前机器的实际情况是：

- LiveKit 可以直连。
- `api.openai.com` 的 HTTPS 可以直连。
- OpenAI Realtime WebSocket 直连会超时。
- 本机代理 `http://127.0.0.1:7890` 可以连接 Realtime。

因此当前使用的是“LiveKit 直连 + OpenAI Realtime 单独走代理”。

## 端点不要混淆

OpenAI 文档中的 WebSocket Mode 页面主要介绍 Responses API：

```text
wss://api.openai.com/v1/responses
```

LiveKit Agents 的语音插件使用的是 Realtime API：

```text
wss://api.openai.com/v1/realtime?model=gpt-realtime
```

两者都是 WebSocket，但协议和用途不同。排查 LiveKit 语音 Agent 时，应以第二个端点和 `livekit.plugins.openai.realtime.RealtimeModel` 的实现为准，不要因为 Responses WebSocket 文档中的示例不同就修改 LiveKit 插件的 URL 或请求头。

Realtime 连接使用标准鉴权：

```text
Authorization: Bearer $OPENAI_API_KEY
```

当前 LiveKit 插件已经负责构造 URL 和鉴权头，不需要在业务代码中手写 WebSocket 协议。

## 配置位置

### 实际运行配置

```text
C:\Users\lenovo\Documents\chronos_app\agent\.env
```

关键变量：

```env
OPENAI_REALTIME_ENABLED=true
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=shimmer
OPENAI_HTTP_PROXY=http://127.0.0.1:7890
```

`OPENAI_HTTP_PROXY` 是本项目自定义变量，由 [main.py](./main.py) 读取，并只用于 OpenAI Realtime 的 `aiohttp.ClientSession`。

### 配置模板

```text
C:\Users\lenovo\Documents\chronos_app\agent\.env.example
```

模板中不要写真实 API key 或真实代理账号密码。复制模板后，在本机 `.env` 中填写值。

### Agent 启动入口

```text
C:\Users\lenovo\Documents\chronos_app\agent\start_agent.bat
C:\Users\lenovo\Documents\chronos_app\agent\main.py
```

修改 `.env` 后必须重启 Agent Worker；已经运行的 Python 进程不会自动读取新的环境变量。

## 最重要的代理规则

### 正确配置

只设置：

```env
OPENAI_HTTP_PROXY=http://127.0.0.1:7890
```

这样可以保持：

```text
LiveKit -> 直连
OpenAI Realtime -> 127.0.0.1:7890
```

### 不要直接设置全局 HTTPS_PROXY

不要为了 Realtime 在 `agent/.env` 中设置：

```env
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
```

LiveKit Agents Worker 会读取 `HTTPS_PROXY` / `HTTP_PROXY`，并把它们用于自己的 HTTP 和进程网络上下文。结果可能是：

- Realtime 能走代理；
- 但 Agent 无法连接 LiveKit 房间；
- 日志出现 `signal connection failed`、`transport timed out`；
- 看起来像 Agent 没有被调度或没有 AI 回复。

如果确实需要让 LiveKit 也走代理，应显式确认代理支持 LiveKit Cloud 的 WebSocket/信令和相关 RTC 流量，并在 Worker 级别配置；不要仅为了 OpenAI Realtime 设置全局代理。

## 切换网络环境的操作流程

### 情况 A：当前网络可以直连 Realtime

1. 确认代理程序没有被强制要求。
2. 在 `agent/.env` 中清空：

   ```env
   OPENAI_HTTP_PROXY=
   ```

3. 保持：

   ```env
   OPENAI_REALTIME_ENABLED=true
   ```

4. 重启 Agent Worker。
5. 运行诊断脚本确认 `proxy=disabled` 且收到 `session.created`。

### 情况 B：当前网络需要本机代理访问 Realtime

1. 启动代理程序。
2. 确认代理监听端口，例如 `127.0.0.1:7890`。
3. 设置：

   ```env
   OPENAI_HTTP_PROXY=http://127.0.0.1:7890
   OPENAI_REALTIME_ENABLED=true
   ```

4. 不要设置 `HTTPS_PROXY` 或 `HTTP_PROXY`，除非 LiveKit 也明确需要代理。
5. 重启 Agent Worker。
6. 运行诊断脚本确认 `proxy=enabled` 且收到 `session.created`。

### 情况 C：无法连接 Realtime，但需要先让 Chat 可用

临时使用 HTTPS STT + LLM + TTS 管线：

```env
OPENAI_REALTIME_ENABLED=false
```

此模式不需要 Realtime WebSocket，仍然会产生普通 OpenAI 模型用量。恢复网络后改回 `true`，并重启 Worker。

## 诊断命令

所有命令默认在 `agent` 目录执行：

```powershell
cd C:\Users\lenovo\Documents\chronos_app\agent
```

### 1. 检查代理端口

```powershell
Test-NetConnection 127.0.0.1 -Port 7890
```

预期：`TcpTestSucceeded : True`。如果端口不同，更新 `OPENAI_HTTP_PROXY`。

### 2. 检查 OpenAI HTTPS 鉴权和基础网络

不要打印 API key：

```powershell
@'
import os, urllib.request
from dotenv import load_dotenv
load_dotenv('.env', override=True)
key = os.environ['OPENAI_API_KEY']
req = urllib.request.Request(
    'https://api.openai.com/v1/models',
    headers={'Authorization': 'Bearer ' + key},
)
with urllib.request.urlopen(req, timeout=15) as response:
    print('openai_https_status', response.status)
'@ | .venv\Scripts\python.exe -
```

`200` 表示 key 和普通 HTTPS 链路可用，但不代表 Realtime WebSocket 一定可用。

### 3. 检查 Realtime WebSocket

```powershell
.venv\Scripts\python.exe test_realtime_ws.py
```

成功示例：

```text
RESULT connected model=gpt-realtime proxy=enabled
RESULT first_event=session.created
```

直连成功时应显示 `proxy=disabled`。失败时脚本只输出错误类型和简短信息，不应输出 token。

### 4. 检查 Agent Worker 日志

```powershell
Get-Content .\agent-worker.log -Tail 120
```

成功链路应依次看到：

```text
registered worker
received job request
connected to LiveKit room
OPENAI_REALTIME_ENABLED raw='true' parsed=True
using OpenAI Realtime model
OpenAI Realtime using dedicated HTTP proxy ...   # 使用代理时
connecting to Realtime API: wss://api.openai.com/v1/realtime?... 
agent session started; generating greeting
initial greeting generated
```

退出 Chat 后应看到：

```text
closing agent session due to participant disconnect
session closed
```

## 症状到原因的对应关系

| 症状 | 优先判断 |
| --- | --- |
| `OpenAI Realtime API connection timed out` | Realtime WebSocket 网络链路或代理问题 |
| `test_realtime_ws.py` 直连失败、加 `OPENAI_HTTP_PROXY` 成功 | 本机网络需要专用 OpenAI 代理 |
| LiveKit `signal connection failed`，同时设置了 `HTTPS_PROXY` | 全局代理误影响 LiveKit；移除全局代理变量 |
| `connected to LiveKit room`，但没有 `agent session started` | Agent 内部初始化或 OpenAI 连接失败 |
| `agent session started`、`initial greeting generated`，但浏览器无声音 | 前端音频权限、自动播放策略或远端音轨挂载问题 |
| HTTPS `/v1/models` 为 401 | API key 错误、过期或 `.env` 未被正确加载 |
| Realtime 收到 `session.created`，但无回复 | 继续看 Realtime 事件和 LiveKit 音频输出，不要先改网络配置 |

## 重启 Worker

修改 `.env` 后执行：

```powershell
$p = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'agent\\.venv\\Scripts\\python.exe.*main.py start' }
foreach ($item in $p) { Stop-Process -Id $item.ProcessId -Force }

Start-Process `
  -FilePath 'C:\Users\lenovo\Documents\chronos_app\agent\.venv\Scripts\python.exe' `
  -ArgumentList 'main.py','start' `
  -WorkingDirectory 'C:\Users\lenovo\Documents\chronos_app\agent' `
  -WindowStyle Hidden
```

也可以直接运行 `start_agent.bat`，但要确保旧 Worker 已停止，避免多个同名 Worker 同时注册。

## 代码约定

- [main.py](./main.py) 负责选择 Realtime 或 HTTPS 管线，并创建专用 OpenAI HTTP session。
- `OPENAI_HTTP_PROXY` 只能传给 OpenAI Realtime session。
- 不要把 API key、代理账号密码、完整 token 写进日志或 README。
- [test_realtime_ws.py](./test_realtime_ws.py) 是最小连接诊断，不负责测试 LiveKit 房间。
- 修改 Agent 生命周期时，保持 `AgentSession.aclose()` 和 Worker shutdown callback；离开 Chat 必须释放 Realtime WebSocket。
- 网络切换后先做“代理端口检查 -> Realtime 最小连接检查 -> Agent Worker 重启 -> LiveKit 房间测试”，不要一开始修改前端。

## 当前已验证环境

截至本次排查，以下组合验证通过：

```env
OPENAI_REALTIME_ENABLED=true
OPENAI_HTTP_PROXY=http://127.0.0.1:7890
```

结果：

- Agent 成功加入 LiveKit 房间；
- Realtime 收到 `session.created`；
- Agent 成功生成 greeting；
- 客户端退出后 Agent session 正常关闭。

