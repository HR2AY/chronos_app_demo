# Chronos 本地启动手册

这份文档给后续 coding AI 和维护者使用。当前阶段先专注 Chronos 的前端设计与浏览器预览；API 和 LiveKit Agent 属于后续联调范围。

## 架构和端口

| 服务 | 目录 | 入口 | 默认端口 | 作用 |
| --- | --- | --- | --- | --- |
| 日历 Web | `mobile` | Expo Web | `8082` | 浏览器里的主界面、日历、闹钟、任务、设置和 Chat 覆盖层 |
| API | `server` | Uvicorn + FastAPI | `8000` | 日历/闹钟数据、LiveKit token 路由 |
| Agent | `agent` | LiveKit Agents Worker | `8081`（Worker 管理 HTTP） | 加入 LiveKit 房间、运行 OpenAI Realtime、发布 AI 音频 |

### 为什么 Web 用 8082

LiveKit Agent Worker 会启动自己的管理 HTTP 服务，当前版本默认监听 `8081`。Expo Web 也常尝试使用 `8081`，两者会冲突，因此本项目当前使用：

```text
日历 Web  http://127.0.0.1:8082/
API       http://127.0.0.1:8000/
Agent     http://127.0.0.1:8081/  （管理/健康端口，不是聊天页面）
```

如果 `8082` 也被占用，选择新的 Expo 端口，并同步使用新的浏览器 URL；API 和 Agent 端口不要随意改，除非同时修改配置和启动参数。

## 启动前检查

### 可视化启动器（推荐）

在项目根目录双击 `start_launcher.bat`，即可打开 Chronos 启动器。也可以运行：

```powershell
python launcher.py
```

启动器支持日历 Web、API、Realtime Agent 的单独启动/停止和一键启动/停止，并会自动显示端口状态与实时日志。前端启动后点击“打开日历”即可访问 `http://127.0.0.1:8082/`。

### 1. 确认日历是主界面

打开：

```text
C:\Users\lenovo\Documents\chronos_app\mobile\.env
```

日历 Web 主入口应为：

```env
EXPO_PUBLIC_PREVIEW_SCREEN=calendar
```

`chat` 只用于临时预览独立 Chat 页面。改完 `.env` 后必须重启 Expo，热更新不会总是重新读取 Expo 配置。

### 2. 确认 API 地址

`mobile/.env` 中应至少有：

```env
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT=http://127.0.0.1:8000/livekit/token
```

### 3. 确认 Agent 配置

实际配置只放在：

```text
C:\Users\lenovo\Documents\chronos_app\agent\.env
```

至少需要：

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_AGENT_NAME=chronos-agent
OPENAI_API_KEY=your_openai_api_key
OPENAI_REALTIME_ENABLED=true
```

如果当前网络不能直连 OpenAI Realtime，但本机代理监听 `127.0.0.1:7890`，使用：

```env
OPENAI_HTTP_PROXY=http://127.0.0.1:7890
```

不要仅为了 OpenAI Realtime 设置全局 `HTTPS_PROXY` / `HTTP_PROXY`，否则可能把 LiveKit 信令也错误地送进代理。网络切换的详细排障见 [agent/README_REALTIME_NETWORK.md](agent/README_REALTIME_NETWORK.md)。

## 首次安装

### Web

```powershell
cd C:\Users\lenovo\Documents\chronos_app\mobile
npm install
```

### API

```powershell
cd C:\Users\lenovo\Documents\chronos_app\server
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Agent

```powershell
cd C:\Users\lenovo\Documents\chronos_app\agent
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

如果 `.venv` 已经存在，不要每次重复创建环境；只在依赖变更后重新安装。

## 推荐启动顺序

### 当前阶段：只启动 Web

先启动 Expo Web 即可进行前端设计验收：

```powershell
cd C:\Users\lenovo\Documents\chronos_app\mobile
npx expo start --web --port 8082
```

打开 `http://127.0.0.1:8082/`。日历、闹钟、任务、设置和 Chat 覆盖层会使用前端 fallback 数据运行。

### 后续联调：API 与 Agent

建议使用三个 PowerShell 窗口，按下面顺序启动。

### 终端 1：API（8000）

```powershell
cd C:\Users\lenovo\Documents\chronos_app\server
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

健康检查：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

预期返回：

```json
{"status":"ok"}
```

### 终端 2：LiveKit Agent（8081）

```powershell
cd C:\Users\lenovo\Documents\chronos_app\agent
.venv\Scripts\python.exe main.py start
```

也可以双击：

```text
C:\Users\lenovo\Documents\chronos_app\agent\start_agent.bat
```

日志中必须看到：

```text
registered worker
agent_name=chronos-agent
```

如果使用 Realtime，进入 Chat 后还应看到：

```text
using OpenAI Realtime model
agent session started; generating greeting
initial greeting generated
```

### 终端 3：日历 Web（8082）

```powershell
cd C:\Users\lenovo\Documents\chronos_app\mobile
npx expo start --web --port 8082
```

打开：

```text
http://127.0.0.1:8082/
```

不要用 `npm run start` 启动 Web；该命令是 dev-client 入口，适合原生 development build。浏览器日历使用上面的 Expo Web 命令。

## 启动后验证

按以下顺序验证，能快速定位是哪一层出问题：

1. 浏览器能打开 `http://127.0.0.1:8082/`，且显示日历主界面。
2. API `GET http://127.0.0.1:8000/health` 返回 `{"status":"ok"}`。
3. API `POST http://127.0.0.1:8000/livekit/token` 能返回 `server_url` 和 `participant_token`。
4. Agent 日志有 `registered worker`。
5. 进入 Chat 后，Agent 日志依次出现 `received job request`、`connected to LiveKit room`、`agent session started`。
6. 退出 Chat 后出现 `session closed`，没有残留房间或音频。

### Token 路由快速检查

```powershell
$body = '{"room_name":"startup-check","participant_name":"startup","participant_identity":"startup-check"}'
Invoke-WebRequest -UseBasicParsing `
  -Method Post `
  -Uri http://127.0.0.1:8000/livekit/token `
  -ContentType 'application/json' `
  -Body $body
```

不要把返回的 token 写进 README、日志或聊天记录。

## 常见问题

### 8081 端口占用

先确认是不是 Agent Worker：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8081
Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -match 'agent.*main.py start'} | Select-Object ProcessId,CommandLine
```

不要为了绕开冲突随意启动第二个 Agent。先停止旧 Worker，确保只有一个 `chronos-agent` 注册。

### 浏览器打开的是 Chat，不是日历

检查 `mobile/.env`：

```env
EXPO_PUBLIC_PREVIEW_SCREEN=calendar
```

然后停止并重新启动 Expo Web。当前 Chat 是日历里的覆盖层，不需要把整个 Web 入口切成 Chat。

### Chat 建立房间但没有 AI 回复

先看 Agent 日志：

- `OpenAI Realtime API connection timed out`：检查 `OPENAI_HTTP_PROXY` 和代理端口。
- `signal connection failed`：通常是错误设置了全局 `HTTPS_PROXY`，先移除它，保持 LiveKit 直连。
- `initial greeting generated`：说明 Agent 已经收到 OpenAI 回复，应继续检查浏览器麦克风权限和音频播放。

最小 Realtime 检查：

```powershell
cd C:\Users\lenovo\Documents\chronos_app\agent
.venv\Scripts\python.exe test_realtime_ws.py
```

### 修改 `.env` 后仍像旧配置

三个服务都需要重启才能读取环境变量。尤其是 Agent Worker 和 Expo，它们不会因为文件改变就自动重载所有配置。

## 停止服务

在各自终端按 `Ctrl+C`。如果进程脱离终端运行，可按命令行筛选后停止，不要误杀其他 Python/Node 进程：

```powershell
Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -match 'agent.*main.py start'} | ForEach-Object { Stop-Process -Id $_.ProcessId }
Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -match 'uvicorn app.main:app'} | ForEach-Object { Stop-Process -Id $_.ProcessId }
```

## 给后续 coding AI 的快速上下文

- `mobile` 是日历 Web 和 Chat UI；主界面组件是 `AurelianCalendarScreen`。
- `server` 是 FastAPI API，默认 `8000`；LiveKit token 路由是 `POST /livekit/token`。
- `agent` 是 LiveKit Agents Worker；必须用 `main.py start`，Agent 名称是 `chronos-agent`。
- Agent 的 OpenAI Realtime 生命周期和网络代理说明在 [agent/README_REALTIME_NETWORK.md](agent/README_REALTIME_NETWORK.md)。
- 离开 Chat 时客户端断开 LiveKit，Agent 通过 shutdown callback 调用 `AgentSession.aclose()`。
- 不要把日历 Web 误认为 `agent` 目录里的 Chat；两者是同一项目里的不同层。
