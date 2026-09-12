import Constants from "expo-constants";
import { Platform } from "react-native";
import { AurelianCalendarScreen } from "./src/screens/AurelianCalendarScreen";
import { LiveKitChatScreen } from "./src/screens/chat/LiveKitChatScreen";
import { AlarmChallengeDemoScreen } from "./src/screens/challenge/AlarmChallengeDemoScreen";
import { AlarmChallengeAnimationDemoScreen } from "./src/screens/challenge/AlarmChallengeAnimationDemoScreen";

export default function App() {
  const challengePreview = Platform.OS === "web" && typeof window !== "undefined" && window.location.pathname === "/challenge-module";
  if (challengePreview) return <AlarmChallengeDemoScreen />;
  const challengeAnimationPreview = Platform.OS === "web" && typeof window !== "undefined" && ["/challenge-demo", "/challenge-animation"].includes(window.location.pathname);
  if (challengeAnimationPreview) return <AlarmChallengeAnimationDemoScreen />;
  // The browser app always opens at the calendar; Chat is an in-app overlay.
  // Keep the standalone Chat preview available only for native development builds.
  const content = Platform.OS !== "web" && Constants.expoConfig?.extra?.previewScreen === "chat"
    ? <LiveKitChatScreen />
    : <AurelianCalendarScreen />;
  return content;
}
