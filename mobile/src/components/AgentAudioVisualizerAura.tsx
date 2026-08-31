import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

export type AuraAgentState =
  | "disconnected"
  | "connecting"
  | "initializing"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "failed";

export type AgentAudioVisualizerAuraProps = {
  state?: AuraAgentState;
  volume?: number;
  audioTrack?: unknown;
  size?: number;
  color?: `#${string}`;
  colorShift?: number;
  themeMode?: "light" | "dark";
};

export function AgentAudioVisualizerAura({
  state = "connecting",
  volume = 0,
  size = 224,
  color = "#d4a017",
}: AgentAudioVisualizerAuraProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = state === "speaking" ? 360 : state === "thinking" ? 620 : 1100;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, state]);

  const audioScale = state === "speaking" ? Math.min(0.22, Math.max(0, volume) * 0.22) : 0;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04 + audioScale] });

  return (
    <View accessibilityLabel={`Agent audio visualizer: ${state}`} style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.aura,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: state === "failed" || state === "disconnected" ? 0.22 : 0.58,
            transform: [{ scale }],
          },
        ]}
      />
      <View style={[styles.core, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  aura: {
    position: "absolute",
  },
  core: {
    position: "absolute",
    left: "29%",
    top: "29%",
    backgroundColor: "rgba(255,255,255,0.86)",
  },
});
