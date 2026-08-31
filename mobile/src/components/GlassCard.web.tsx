import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import LiquidGlass from "liquid-glass-react";

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  cornerRadius?: number;
}>;

export function GlassCard({ children, style, cornerRadius = 16 }: GlassCardProps) {
  return (
    <View style={[style, styles.shell]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LiquidGlass
          blurAmount={0.09}
          saturation={145}
          displacementScale={42}
          aberrationIntensity={0.8}
          elasticity={0.18}
          cornerRadius={cornerRadius}
          overLight
          mode="standard"
          padding="0"
          style={styles.liquidLayer}
        >
          <View style={styles.liquidFill} />
        </LiquidGlass>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "relative",
  },
  liquidLayer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  liquidFill: {
    width: "100%",
    height: "100%",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});
