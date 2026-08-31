# LiveKit Setup

The app uses two separate LiveKit pieces:

- `server/app/livekit_service.py` creates room join tokens for mobile users.
- `agent/main.py` runs the LiveKit Agents worker.

The mobile AI voice screen currently uses the local microphone animation only. It is not connected to a LiveKit room.

## Mobile token flow

1. The app posts room and participant details to `/livekit/token`.
2. The server signs a LiveKit token with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
3. The app receives `server_url` and `participant_token`.
4. The next step is to render a real LiveKit room screen with `@livekit/react-native`.

## Frontend SDK env

Create `mobile/.env` or set these before starting Expo:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT=http://127.0.0.1:8000/livekit/token
EXPO_PUBLIC_LIVEKIT_ROOM_NAME=chronos-demo
```

For a physical phone, replace `127.0.0.1` with your computer LAN IP, for example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8000
EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT=http://192.168.1.20:8000/livekit/token
```

Do not put `LIVEKIT_API_SECRET` in the mobile app. The frontend only talks to the token endpoint.

## Expo SDK notes

The installed frontend packages are:

```bash
@livekit/react-native
@livekit/react-native-webrtc
@livekit/react-native-expo-plugin
@config-plugins/react-native-webrtc
livekit-client
```

Because LiveKit React Native depends on native WebRTC modules, use an Expo dev client or native build:

```bash
cd mobile
npm run prebuild
npm run ios
npm run android
```

`expo start --web` can be used for basic connection debugging, but Expo Go is not enough for native LiveKit audio.

## Required env values

Both `server` and `agent` need:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

The agent also needs:

```bash
OPENAI_API_KEY=your_openai_api_key
```

## HR2AY fork

You mentioned `HR2AY/livekit-agents`. I left the agent dependency on the published `livekit-agents` package for now because it is the safest install path. If you specifically need that fork, replace the dependency in `agent/requirements.txt` with a Git URL after confirming the exact branch or commit:

```bash
livekit-agents @ git+https://github.com/HR2AY/livekit-agents.git@main
```
