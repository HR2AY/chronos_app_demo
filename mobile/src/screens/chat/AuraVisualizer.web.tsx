import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type AuraVisualizerProps = {
  audioTrack?: unknown;
  state: string;
  size: number;
};

export function AuraVisualizer({ state, size }: AuraVisualizerProps) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: state === "speaking" ? 760 : 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: state === "speaking" ? 760 : 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathe, state]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  return (
    <Animated.View style={[styles.frame, { width: size, height: size, transform: [{ scale }] }]}>
      <View style={[styles.glow, styles.orange, { width: size * 0.62, height: size * 0.62 }]} />
      <View style={[styles.glow, styles.gold, { width: size * 0.58, height: size * 0.58 }]} />
      <View style={[styles.glow, styles.peach, { width: size * 0.54, height: size * 0.54 }]} />
      <View style={[styles.core, { width: size * 0.43, height: size * 0.43, borderRadius: size * 0.22 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    filter: "blur(18px)",
    opacity: 0.48,
  } as never,
  orange: {
    backgroundColor: "#ff9c5f",
    transform: [{ translateX: -18 }, { translateY: 9 }, { rotate: "18deg" }],
  },
  gold: {
    backgroundColor: "#ffd761",
    transform: [{ translateX: 22 }, { translateY: -13 }, { rotate: "-12deg" }],
  },
  peach: {
    backgroundColor: "#ffc58e",
    transform: [{ translateX: 12 }, { translateY: 24 }],
  },
  core: {
    backgroundColor: "rgba(255,255,255,0.92)",
    boxShadow: "0 0 30px 24px rgba(255,251,239,0.72)",
  } as never,
});
