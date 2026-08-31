import Constants from "expo-constants";
import { Platform } from "react-native";
import { AurelianCalendarScreen } from "./src/screens/AurelianCalendarScreen";
import { LiveKitChatScreen } from "./src/screens/chat/LiveKitChatScreen";
import { AuthGate, AuthProvider } from "./src/auth/AuthProvider";

export default function App() {
  // The browser app always opens at the calendar; Chat is an in-app overlay.
  // Keep the standalone Chat preview available only for native development builds.
  const content = Platform.OS !== "web" && Constants.expoConfig?.extra?.previewScreen === "chat"
    ? <LiveKitChatScreen />
    : <AurelianCalendarScreen />;
  return <AuthProvider><AuthGate>{content}</AuthGate></AuthProvider>;
}
