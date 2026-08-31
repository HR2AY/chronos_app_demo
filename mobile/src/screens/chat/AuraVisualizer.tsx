import { BlurMask, Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import { useMultibandTrackVolume } from "@livekit/react-native";
import type { AgentState, TrackReferenceOrPlaceholder } from "@livekit/react-native";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type AuraVisualizerProps = {
  audioTrack?: TrackReferenceOrPlaceholder;
  state: AgentState;
  size: number;
};

const bandColors = ["#ff9d56", "#ffc65b", "#ffe878", "#f8b45c", "#ff8b61", "#ffd46a"];

export function AuraVisualizer({ audioTrack, state, size }: AuraVisualizerProps) {
  const magnitudes = useMultibandTrackVolume(audioTrack, {
    bands: 6,
    minFrequency: 160,
    maxFrequency: 7600,
    updateInterval: 48,
  });
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = state === "speaking" ? 760 : state === "thinking" ? 1100 : 1800;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathe, state]);

  const levels = useMemo(() => {
    const idleLevel = state === "listening" ? 0.18 : state === "thinking" ? 0.25 : 0.12;
    return Array.from({ length: 6 }, (_, index) => Math.max(idleLevel, magnitudes[index] ?? 0));
  }, [magnitudes, state]);

  const center = size / 2;
  const baseRadius = size * 0.29;
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.035] });
  const opacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={[styles.frame, { width: size, height: size }]} accessibilityLabel={`Voice aura: ${state}`}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity, transform: [{ scale }] }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Circle cx={center} cy={center} r={size * 0.39} color="rgba(255, 221, 148, 0.16)">
            <BlurMask blur={26} style="normal" />
          </Circle>
          <Group>
            {levels.map((level, index) => {
              const angle = (Math.PI * 2 * index) / levels.length - Math.PI / 2;
              const orbit = baseRadius * (0.48 + level * 0.24);
              const x = center + Math.cos(angle) * orbit;
              const y = center + Math.sin(angle) * orbit;
              const radius = baseRadius * (0.62 + level * 0.48);
              return (
                <Circle key={bandColors[index]} cx={x} cy={y} r={radius} opacity={0.43 + level * 0.38}>
                  <RadialGradient
                    c={vec(x, y)}
                    r={radius}
                    colors={[bandColors[index], `${bandColors[index]}66`, "#fff8e900"]}
                  />
                  <BlurMask blur={18 + level * 18} style="normal" />
                </Circle>
              );
            })}
          </Group>
          <Circle cx={center} cy={center} r={baseRadius * 0.83}>
            <RadialGradient
              c={vec(center - size * 0.035, center - size * 0.04)}
              r={baseRadius}
              colors={["#fffefb", "#fffaf0e8", "#fff3d34a"]}
            />
            <BlurMask blur={5} style="normal" />
          </Circle>
        </Canvas>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
});
