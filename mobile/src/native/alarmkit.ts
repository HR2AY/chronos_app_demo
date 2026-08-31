import { NativeModules, Platform } from "react-native";

type AlarmKitBridge = {
  requestAuthorization(): Promise<string>;
  scheduleAlarm(input: {
    id?: string;
    title: string;
    fireAt: string;
    repeats?: boolean;
  }): Promise<string>;
  cancelAlarm(id: string): Promise<void>;
};

const nativeBridge = NativeModules.AlarmKitBridge as AlarmKitBridge | undefined;

export const AlarmKit: AlarmKitBridge = Platform.OS === "ios" && nativeBridge
  ? nativeBridge
  : {
      async requestAuthorization() {
        return "unavailable";
      },
      async scheduleAlarm() {
        throw new Error("AlarmKit is only available in an iOS development build.");
      },
      async cancelAlarm() {
        return undefined;
      },
    };
