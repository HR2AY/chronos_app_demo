# iOS AlarmKit Integration

AlarmKit is an Apple-native framework. This repository keeps the JavaScript interface ready now, then adds the native Swift implementation after the iOS project exists.

## Current JavaScript surface

The mobile app calls:

- `AlarmKit.requestAuthorization()`
- `AlarmKit.scheduleAlarm({ title, fireAt, repeats })`
- `AlarmKit.cancelAlarm(id)`

That wrapper lives in `mobile/src/native/alarmkit.ts`.

## When you have macOS + Xcode

Run:

```bash
cd mobile
npm install
npx expo prebuild --platform ios
npx expo run:ios
```

Then add a Swift native module named `AlarmKitBridge` under the generated `ios` folder.

## Native bridge checklist

- Add the AlarmKit capability and entitlement in Xcode.
- Add any required usage description keys to the iOS target.
- Implement `requestAuthorization`.
- Convert JavaScript ISO dates into Swift `Date` values.
- Return stable alarm ids so server calendar events can map to scheduled alarms.
- Keep the JavaScript API unchanged unless the app needs richer recurrence rules.

## Why the native file is not generated yet

Expo `prebuild` creates the `ios` directory, and that step requires macOS for realistic verification. Creating handwritten iOS project files on Windows is possible, but it is brittle and hard to validate without Xcode.
