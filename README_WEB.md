# Chronos Web 独立副本

这是 Chronos 的独立 Web 副本，包含：

- `mobile`：Expo Web 日历和 Chat 覆盖层
- `server`：FastAPI API
- `agent`：LiveKit Agent 和 OpenAI Realtime
- `docs`、`STARTUP.md`：设计、集成和网络排障说明

## 只启动 Web 日历

```powershell
cd "E:\code\chronos _web\mobile"
npm install
npx expo start --web --port 8082
```

浏览器打开：`http://127.0.0.1:8082/`

当前 `.env` 已配置 `EXPO_PUBLIC_PREVIEW_SCREEN=calendar`，Web 默认进入日历。

没有后端时，日历页面仍可通过前端 fallback 数据预览；闹钟 CRUD、登录和语音 Chat 需要 API、Supabase 或 LiveKit 服务。

## Demo 数据

`server/demo_alarms.sql` 是不含个人信息的 SQLite 闹钟示例数据。启动 API 时，`server/app/db.py` 会自动创建表并写入相同的演示闹钟；也可以手动导入这份 SQL 到自己的 SQLite 数据库。

请勿提交本地 `.env`、真实 API token、`server/chronos.sqlite3`、日志、`node_modules` 或 Python 虚拟环境。

## 启动 API

首次安装：

```powershell
cd "E:\code\chronos _web\server"
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

运行：

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 启动 Agent

首次安装：

```powershell
cd "E:\code\chronos _web\agent"
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

运行：

```powershell
.venv\Scripts\python.exe main.py start
```

Agent 的 Realtime 网络配置和诊断命令见 `agent/README_REALTIME_NETWORK.md`。

## 端口

- Web：`8082`
- API：`8000`
- Agent 管理端口：`8081`

依赖目录（`mobile/node_modules`、`server/.venv`、`agent/.venv`）和构建缓存未复制，按上面的命令在本副本中重新生成。
