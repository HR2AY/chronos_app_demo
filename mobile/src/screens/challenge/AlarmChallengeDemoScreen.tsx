import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowLeft, Sparkles } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AlarmChallengeModule } from "../../components/AlarmChallengeModule";

export function AlarmChallengeDemoScreen() {
  const { width, height } = useWindowDimensions();
  const compact = width < 430 || height < 740;
  const stageRef = useRef<View>(null);
  const cardRef = useRef<View>(null);
  useGSAP(() => {
    gsap.fromTo(stageRef.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" });
    gsap.fromTo(cardRef.current, { opacity: 0, y: 22, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.72, delay: 0.1, ease: "power3.out" });
  }, { scope: stageRef });
  return (
    <View style={styles.viewport} ref={stageRef}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回聊天" style={styles.iconButton}><ArrowLeft color="#20150e" size={23} strokeWidth={2.2} /></Pressable>
          <View style={styles.headerTitle}><Text style={styles.roomName}>FDE 机会捕捉</Text><View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>正在通话</Text></View></View>
          <View style={styles.headerMark}><Sparkles color="#8b691e" size={18} strokeWidth={1.8} /></View>
        </View>
        <View style={[styles.intro, compact && styles.introCompact]}><Text style={styles.eyebrow}>教练任务 · 文字挑战</Text><Text style={[styles.title, compact && styles.titleCompact]}>把这句话，变成今天的行动</Text><Text style={styles.subtitle}>跟着提示打完一遍，完成这次晨间对话。</Text></View>
        <AlarmChallengeModule compact={compact} cardRef={cardRef} />
        <Text style={styles.footerNote}>完成后才能结束本次晨间挑战</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: "center", backgroundColor: "#fffaf2" },
  safeArea: { flex: 1, width: "100%", maxWidth: 620, paddingHorizontal: 28 },
  header: { height: 84, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerCompact: { height: 68 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e6dccb", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.6)" },
  headerTitle: { alignItems: "center", gap: 3 }, roomName: { color: "#20150e", fontSize: 17, lineHeight: 22, fontWeight: "700" }, liveRow: { flexDirection: "row", alignItems: "center", gap: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2f7655" }, liveText: { color: "#2f7655", fontSize: 12, lineHeight: 16, fontWeight: "600" }, headerMark: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242,207,130,0.28)" },
  intro: { paddingTop: 30, paddingBottom: 30, alignItems: "center" }, introCompact: { paddingTop: 17, paddingBottom: 20 }, eyebrow: { color: "#8b691e", fontSize: 12, lineHeight: 17, fontWeight: "700", letterSpacing: 1.2 }, title: { color: "#20150e", fontSize: 34, lineHeight: 44, fontWeight: "800", marginTop: 10, textAlign: "center" }, titleCompact: { fontSize: 27, lineHeight: 35, marginTop: 8 }, subtitle: { color: "#8f806d", fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: "center" }, footerNote: { color: "#b3a691", fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 19 },
});
