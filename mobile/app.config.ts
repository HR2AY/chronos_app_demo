import type { ConfigContext, ExpoConfig } from "expo/config";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const livekitTokenEndpoint =
  process.env.EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT ?? "http://127.0.0.1:8000/livekit/token";
const livekitRoomName = process.env.EXPO_PUBLIC_LIVEKIT_ROOM_NAME ?? "chronos-demo";
const previewScreen = process.env.EXPO_PUBLIC_PREVIEW_SCREEN ?? "calendar";
const chatLocation = process.env.EXPO_PUBLIC_CHAT_LOCATION ?? "徐汇体育馆游泳";
const chatCoachName = process.env.EXPO_PUBLIC_CHAT_COACH_NAME ?? "Chronos教练";
const chatStatusText = process.env.EXPO_PUBLIC_CHAT_STATUS_TEXT ?? "（更新了记忆）";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Chronos",
  slug: "chronos",
  version: "0.1.0",
  scheme: "chronos",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.chronos.mobile",
  },
  android: {
    package: "com.chronos.mobile",
  },
  plugins: [
    "expo-dev-client",
    "@livekit/react-native-expo-plugin",
    [
      "@config-plugins/react-native-webrtc",
      {
        cameraPermission: "Chronos uses the camera for LiveKit calls.",
        microphonePermission: "Chronos uses the microphone for LiveKit calls.",
      },
    ],
  ],
  extra: {
    apiBaseUrl,
    livekitTokenEndpoint,
    livekitRoomName,
    previewScreen,
    chatLocation,
    chatCoachName,
    chatStatusText,
  },
});
