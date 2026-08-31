import { PropsWithChildren } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

export function GlassCard({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; cornerRadius?: number }>) {
  return <View style={style}>{children}</View>;
}
