# Livechat to Alarm Integration Analysis

Date: 2026-09-12

> 当前文档只描述 Web 端集成。原生 iOS/Android 客户端不在当前实现和验证范围内。

## Current Shape

Chronos 当前是 Web + API + Agent 三部分：

- Web: Expo Web 日历和 Chat 覆盖层，Chat 实现位于 `mobile/src/screens/chat/LiveKitChatScreen.web.tsx`。
- Server: FastAPI + SQLite, exposing calendar/event endpoints and a LiveKit token endpoint in `server/app/main.py`.
- Agent: LiveKit Agents Python worker in `agent/main.py`，可使用 OpenAI Realtime 或 STT-LLM-TTS 管线。

The current alarm screen is UI-only. `AlarmsView` renders a static local `alarms` array, and toggles are visual only. There is no alarm persistence endpoint, no alarm table, no link between alarms and calendar events, and no call to `AlarmKit.scheduleAlarm`.

The current AlarmKit integration is an interface wrapper only. `mobile/src/native/alarmkit.ts` exposes:

- `requestAuthorization()`
- `scheduleAlarm({ id, title, fireAt, repeats })`
- `cancelAlarm(id)`

On non-iOS or without the native bridge, scheduling throws.

The current Web LiveKit integration is connected at the transport layer. The Web client requests a token, joins a unique
LiveKit room, publishes browser microphone audio, subscribes to Agent audio, receives challenge data events, and renders
the Chat overlay. Realtime conversation and tool execution still require a real-room acceptance test for final transcript
and tool-loop evidence.

## Evidence

- `mobile/src/screens/AurelianCalendarScreen.tsx:38` defines static alarm data.
- `mobile/src/screens/AurelianCalendarScreen.tsx:397` renders the alarm list from that static data.
- `mobile/src/native/alarmkit.ts:16` falls back when the iOS native bridge is absent.
- `mobile/src/services/livekit.ts:30` requests LiveKit room credentials.
- `server/app/main.py:124` exposes `/livekit/token`.
- `server/app/livekit_service.py:23` creates a LiveKit access token with publish, subscribe, and data permissions.
- `agent/main.py:130` defines `ChronosAgent`; `agent/main.py:85` and `agent/main.py:117` define challenge tools.
- `server/app/calendar_service.py:99` persists calendar events to `timeline_items`.
- `server/app/calendar_service.py:252` maps `timeline_items` rows into mobile `CalendarEvent` payloads.
- `server/app/db.py:41` creates `timeline_items`, but no alarm table.

## Recommended Architecture

Livechat should connect to the alarm feature through the agent and server, not directly to the local AlarmKit wrapper.

The recommended path is:

1. Web opens a LiveKit conversation from the Alarms tab.
2. Web requests `/livekit/token` and joins a room.
3. The LiveKit agent receives user intent, for example "wake me 20 minutes before my 8 AM meeting".
4. The agent calls server-side tools such as `list_events`, `create_alarm`, `update_alarm`, or `cancel_alarm`.
5. The server persists alarm records and returns an alarm command payload.
6. Web displays the server result. Native AlarmKit scheduling is outside the current Web-only scope.

The server remains the source of truth for alarm and challenge intent. Native AlarmKit scheduling is outside the current Web-only architecture.

## Data Model Gap

Do not overload `timeline_items` as the alarm source of truth. Calendar events and alarms are related but not equivalent:

- A calendar event is a schedule item.
- An alarm is a notification/scheduling rule that can point at an event or stand alone.
- A smart alarm may shift when event time, travel buffer, user preference, or completion state changes.

Add a dedicated table, for example:

```sql
CREATE TABLE alarms (
  id TEXT PRIMARY KEY,
  source_event_id TEXT,
  title TEXT NOT NULL,
  fire_at TEXT NOT NULL,
  repeats INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  smart INTEGER NOT NULL DEFAULT 0,
  rule_json TEXT NOT NULL DEFAULT '{}',
  native_alarm_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Then expose:

- `GET /api/alarms`
- `POST /api/alarms`
- `PATCH /api/alarms/{id}`
- `DELETE /api/alarms/{id}`
- optionally `POST /api/alarms/preview` for AI-generated suggestions

## LiveKit Agent Changes

The agent currently has instructions only. It needs function tools. LiveKit Agents supports adding Python function tools with decorators; those tools can call external APIs, store session data, and run longer work in the background.

Minimal useful tools:

- `list_upcoming_events(date_range)`
- `create_alarm(title, fire_at, source_event_id?, repeats?, smart?)`
- `update_alarm(id, fire_at?, enabled?, title?)`
- `cancel_alarm(id)`

These tools should call the FastAPI server or directly share a small service module with it. Prefer HTTP calls first because it preserves one backend API contract for mobile, agent, and tests.

## Web Changes

The Web app needs three pieces:

1. Alarm service:
   - fetch alarm list
   - create/update/delete alarms
   - keep Web fallback state in sync with the API

2. Alarm UI:
   - replace static `alarms` array with fetched data
   - make toggles call update endpoints
   - add a "talk/chat" entry point in the Alarms tab

3. LiveKit room:
   - request token with `requestLiveKitToken`
   - join a LiveKit room using `livekit-client`
   - receive structured challenge events through `DataReceived`

## Critical Sync Rule

The safest source of truth split for the Web target is:

- Server: alarm intent, enabled state, event linkage, smart rules.
- Web: displayed alarm state and API response state.

When the server creates or updates an alarm, the Web client should refresh its API-backed state and keep submission or
transport failures visible in the Alarms tab.

## Risks

- Native AlarmKit is outside the Web-only target.
- Authorization: `requestAuthorization()` must be called before scheduling; denial must be represented in UI and API sync state.
- Agent hallucination risk: the agent must use typed tools and return structured commands, not free-form "I scheduled it" text.
- Time zones: `fire_at` should be ISO with offset or UTC plus a user timezone field.
- Race conditions: event updates can invalidate smart alarms; server needs a recompute path.
- Current DB mismatch: committed `server/chronos.sqlite3` has old `calendar_events`, while runtime code expects `topics/timeline_items` or an external Chronos v2 DB.

## Implementation Order

1. Add server alarm model, service, and REST endpoints.
2. Add Web alarm service and replace static alarm data.
3. Keep the LiveKit room UI entry in the Web Alarms tab.
5. Add agent function tools that create/update/cancel alarms through the server API.
6. Add structured result events from Agent to the Web client.
7. Add tests for alarm CRUD, tool validation, and Web submission/error states.

## Decision

Web Livechat is connected to the alarm section at the room, Agent, API, and challenge-event layers. The remaining work is acceptance testing and observability for transcript/tool loops, followed by completing server-backed alarm CRUD and structured Web state updates. Native AlarmKit scheduling is intentionally outside this Web-only architecture.
