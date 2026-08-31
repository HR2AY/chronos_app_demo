# Chronos App

> 本地启动请先看 [STARTUP.md](./STARTUP.md)。其中记录了 Web、API、Agent 的端口、环境变量和启动顺序。

Monorepo for a calendar-first mobile app with LiveKit voice support and an iOS AlarmKit bridge.

## Layout

- `mobile` - Expo + React Native app
- `server` - FastAPI + SQLite calendar API and LiveKit token endpoint
- `agent` - LiveKit Agents Python worker

## Why this stack

- Expo dev builds let us use native code when we need it.
- LiveKit React Native requires a development build, not Expo Go.
- AlarmKit is Apple-native, so the real iOS bridge will be added after we generate the iOS project on macOS.

## What is already scaffolded

- A mobile shell with a month calendar view
- A LiveKit token request flow
- An AlarmKit native-module wrapper
- A SQL-backed calendar API
- A LiveKit Agents worker

## Local setup

### 1. Mobile app

```bash
cd mobile
npm install
npx expo install --fix
npm run start
```

LiveKit native packages are configured for development builds. On macOS, build the iOS client with:

```bash
npx expo run:ios
```

Expo Go will not work for this stack because LiveKit needs custom native code.

### 2. Server

```bash
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

If package installation is blocked, you can still run the SQL calendar endpoint with only the Python standard library:

```bash
cd server
python dev_server.py
```

### 3. Agent

```bash
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## Environment files

- `mobile/.env.example`
- `server/.env.example`
- `agent/.env.example`

Copy each example to `.env` when you are ready to run the corresponding process.

```bash
copy mobile\.env.example mobile\.env
copy server\.env.example server\.env
copy agent\.env.example agent\.env
```

## iOS note

This Windows workspace can prepare the code, but it cannot build the iOS simulator itself. The final iOS step needs macOS, Xcode, and a development build.
