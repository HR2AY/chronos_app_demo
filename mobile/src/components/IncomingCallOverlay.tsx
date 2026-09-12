import { Phone, PhoneOff } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  callerName: string;
  subtitle: string;
  onAccept: () => void;
  onDecline: () => void;
};

export function IncomingCallOverlay({ callerName, subtitle, onAccept, onDecline }: Props) {
  const translateY = useRef(new Animated.Value(-190)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 180, mass: 0.8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <View style={styles.layer} pointerEvents="auto">
      <Animated.View style={[styles.card, Platform.OS === "web" && styles.webCard, { opacity, transform: [{ translateY }] }]}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>C</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.eyebrow}>来电</Text>
            <Text style={styles.callerName} numberOfLines={1}>{callerName}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <View style={styles.waveform}>
            {[12, 20, 29, 17, 25, 14].map((height, index) => (
              <View key={index} style={[styles.wave, { height }]} />
            ))}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="拒绝来电" onPress={onDecline} style={({ pressed }) => [styles.action, styles.decline, pressed && styles.pressed]}>
            <PhoneOff color="#b3261e" size={21} strokeWidth={2.4} />
            <Text style={[styles.actionText, styles.declineText]}>拒绝</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="接听来电" onPress={onAccept} style={({ pressed }) => [styles.action, styles.accept, pressed && styles.pressed]}>
            <Phone color="#ffffff" size={21} strokeWidth={2.5} />
            <Text style={[styles.actionText, styles.acceptText]}>接听</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    alignItems: "center",
    pointerEvents: "auto",
  } as never,
  card: {
    width: "92%",
    maxWidth: 430,
    marginTop: 14,
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: 24,
    backgroundColor: "rgba(250, 251, 253, 0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#40382e",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  webCard: {
    backdropFilter: "blur(24px) saturate(145%)",
    WebkitBackdropFilter: "blur(24px) saturate(145%)",
  } as never,
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9c875",
    borderWidth: 1,
    borderColor: "rgba(139, 104, 29, 0.18)",
  },
  avatarText: {
    color: "#59430f",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 13,
  },
  eyebrow: {
    color: "#7f7d78",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  callerName: {
    color: "#171717",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#7d7c79",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  waveform: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 8,
  },
  wave: {
    width: 3,
    borderRadius: 2,
    backgroundColor: "#d4a017",
    opacity: 0.72,
  },
  actions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
  },
  action: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  decline: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(179, 38, 30, 0.18)",
  },
  accept: {
    backgroundColor: "#2f9d62",
    shadowColor: "#216c43",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  declineText: { color: "#a72b25" },
  acceptText: { color: "#ffffff" },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});
