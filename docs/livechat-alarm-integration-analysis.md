# Livechat to Alarm Integration Analysis

Date: 2026-07-31

## Current Shape

Chronos is a three-part scaffold:

- Mobile: Expo + React Native, rendering a calendar-first shell in `mobile/App.tsx` and `mobile/src/screens/AurelianCalendarScreen.tsx`.
- Server: FastAPI + SQLite, exposing calendar/event endpoints and a LiveKit token endpoint in `server/app/main.py`.
- Agent: LiveKit Agents Python worker in `agent/main.py`, currently configured as a concise calendar assistant.

The current alarm screen is UI-only. `AlarmsView` renders a static local `alarms` array, and toggles are visual only. There is no alarm persistence endpoint, no alarm table, no link between alarms and calendar events, and no call to `AlarmKit.scheduleAlarm`.

The current AlarmKit integration is an interface wrapper only. `mobile/src/native/alarmkit.ts` exposes:

- `requestAuthorization()`
- `scheduleAlarm({ id, title, fireAt, repeats })`
- `cancelAlarm(id)`

On non-iOS or without the native bridge, scheduling throws.

The current LiveKit integration is partially scaffolded. The mobile service can request a token from `/livekit/token`; the server can sign a token; the agent can join a LiveKit room. There is no mobile room/chat screen yet.

## Evidence

- `mobile/src/screens/AurelianCalendarScreen.tsx:38` defines static alarm data.
- `mobile/src/screens/AurelianCalendarScreen.tsx:397` renders the alarm list from that static data.
- `mobile/src/native/alarmkit.ts:16` falls back when the iOS native bridge is absent.
- `mobile/src/services/livekit.ts:14` requests LiveKit room credentials.
- `server/app/main.py:124` exposes `/livekit/token`.
- `server/app/livekit_service.py:23` creates a LiveKit access token with publish, subscribe, and data permissions.
- `agent/main.py:15` defines `ChronosAgent`.
- `server/app/calendar_service.py:99` persists calendar events to `timeline_items`.
- `server/app/calendar_service.py:252` maps `timeline_items` rows into mobile `CalendarEvent` payloads.
- `server/app/db.py:41` creates `timeline_items`, but no alarm table.

## Recommended Architecture

Livechat should connect to the alarm feature through the agent and server, not directly to the local AlarmKit wrapper.

The recommended path is:

1. Mobile opens a LiveKit conversation from the Alarms tab.
2. Mobile requests `/livekit/token` and joins a room.
3. The LiveKit agent receives user intent, for example "wake me 20 minutes before my 8 AM meeting".
4. The agent calls server-side tools such as `list_events`, `create_alarm`, `update_alarm`, or `cancel_alarm`.
5. The server persists alarm records and returns an alarm command payload.
6. Mobile syncs alarm records and calls `AlarmKit.scheduleAlarm` locally on iOS.

AlarmKit scheduling should remain mobile-local because iOS alarm authorization and native scheduling live on device. The server should store intent/state; the client should be the executor for native alarms.

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

## Mobile Changes

The mobile app needs three pieces:

1. Alarm service:
   - fetch alarm list
   - create/update/delete alarms
   - sync persisted alarm records into AlarmKit

2. Alarm UI:
   - replace static `alarms` array with fetched data
   - make toggles call update + schedule/cancel
   - add a "talk/chat" entry point in the Alarms tab

3. LiveKit room:
   - request token with `requestLiveKitToken`
   - join a LiveKit room using `@livekit/react-native`
   - support voice first; optionally add data/RPC for structured "schedule this alarm" commands

## Critical Sync Rule

The safest source of truth split is:

- Server: alarm intent, enabled state, event linkage, smart rules.
- Mobile: native alarm scheduling state and returned `native_alarm_id`.

When the server creates or updates an enabled alarm, the mobile app should schedule it locally and PATCH back the `native_alarm_id`. If native scheduling fails, mobile should mark the alarm as `sync_status = failed` or keep a local error state visible in the Alarms tab.

## Risks

- iOS-only AlarmKit: Android and web need fallback behavior.
- Authorization: `requestAuthorization()` must be called before scheduling; denial must be represented in UI and API sync state.
- Agent hallucination risk: the agent must use typed tools and return structured commands, not free-form "I scheduled it" text.
- Time zones: `fire_at` should be ISO with offset or UTC plus a user timezone field.
- Race conditions: event updates can invalidate smart alarms; server needs a recompute path.
- Current DB mismatch: committed `server/chronos.sqlite3` has old `calendar_events`, while runtime code expects `topics/timeline_items` or an external Chronos v2 DB.

## Implementation Order

1. Add server alarm model, service, and REST endpoints.
2. Add mobile alarm service and replace static alarm data.
3. Implement iOS `AlarmKitBridge` on macOS/Xcode.
4. Add LiveKit room UI entry from Alarms tab.
5. Add agent function tools that create/update/cancel alarms through the server API.
6. Add structured result events from agent to mobile so the app can schedule native AlarmKit alarms.
7. Add tests for alarm CRUD, tool validation, and mobile scheduling failure states.

## Decision

Livechat is feasible to connect to the alarm section with the existing stack, but the current project is only about one layer deep into that integration. The best next engineering move is not to wire LiveKit directly into `AlarmKit.scheduleAlarm`; it is to introduce a server-backed alarm domain first, then let LiveKit agent tools write alarm intent and let the mobile client execute native scheduling.
