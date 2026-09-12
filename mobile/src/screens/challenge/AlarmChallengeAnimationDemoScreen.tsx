import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowLeft, Mic, PhoneOff, Sparkles } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AlarmChallengeModule } from "../../components/AlarmChallengeModule";

export function AlarmChallengeAnimationDemoScreen() {
  const { width, height } = useWindowDimensions();
  const compact = width < 430 || height < 740;
  const stageRef = useRef<View>(null);
  const barRef = useRef<View>(null);
  const taskRef = useRef<View>(null);
  const taskContentRef = useRef<View>(null);
  const controlsRef = useRef<View>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [taskVisible, setTaskVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => () => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
  }, []);

  const playTaskTransition = () => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    setControlsVisible(false);
    setTaskVisible(true);
    requestAnimationFrame(() => {
      const bar = barRef.current;
      const task = taskRef.current;
      const content = taskContentRef.current;
      if (!bar || !task || !content) return;
      gsap.set(task, { opacity: 1, borderColor: "rgba(226,174,57,0.15)", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.04)" });
      gsap.set(content, { opacity: 0, y: 18 });
      gsap.timeline()
        .to(bar, { y: -72, duration: 0.28, ease: "power2.out" })
        .to(bar, { scaleX: 0.16, scaleY: 0.55, opacity: 0, duration: 0.3, ease: "power2.in" })
        .fromTo(task, { opacity: 0.35, scale: 0.9 }, { opacity: 1, scale: 1, borderColor: "#e6dccb", backgroundColor: "rgba(255,255,255,0.8)", duration: 0.6, ease: "expo.out" })
        .to(content, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, "-=0.25");
    });
  };

  const returnToChat = () => {
    const task = taskRef.current;
    const bar = barRef.current;
    if (!task || !bar) return;
    gsap.timeline({
      onComplete: () => {
        setTaskVisible(false);
        setControlsVisible(true);
        requestAnimationFrame(() => {
          if (controlsRef.current) gsap.fromTo(controlsRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.42, ease: "power2.out" });
        });
      },
    })
      .to(task, { opacity: 0, y: 14, duration: 0.52, ease: "power2.inOut" })
      .to(bar, { y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: 0.58, ease: "expo.out" }, "-=0.24");
  };

  const handleTaskCompleted = () => {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    // Keep the success state briefly, then finish the fade-and-return within two seconds.
    completionTimerRef.current = setTimeout(returnToChat, 1450);
  };

  useGSAP(() => {
    gsap.fromTo(stageRef.current, { opacity: 0 }, { opacity: 1, duration: 0.6 });
    gsap.fromTo(barRef.current, { scaleX: 0.15, opacity: 0.4 }, { scaleX: 1, opacity: 1, duration: 0.8, delay: 0.25, ease: "power3.out" });
  }, { scope: stageRef });

  return (
    <View style={styles.viewport} ref={stageRef}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, compact && styles.headerCompact]}><Pressable accessibilityRole="button" accessibilityLabel="返回" style={styles.circle}><ArrowLeft color="#20150e" size={24} /></Pressable><Text style={styles.roomName}>Morning Routine</Text><View style={styles.circle}><Sparkles color="#8b691e" size={19} /></View></View>
        <View style={[styles.coachCard, compact && styles.coachCardCompact]}><Text style={styles.coachText}>Chronos 教练</Text></View>
        {!taskVisible && <View style={styles.messageDot}><Text style={styles.dotText}>1</Text></View>}
        <View style={[styles.auraStage, compact && styles.auraStageCompact]}><View style={styles.auraBlob}><View style={styles.auraHole} /></View></View>
        <View style={styles.statusArea}><View style={styles.statusBar} ref={barRef} /><Text style={styles.statusText}>{taskVisible ? "请完成屏幕上的任务" : "正在准备教练..."}</Text></View>
        {taskVisible && <View ref={taskRef} style={styles.taskWrap}><AlarmChallengeModule compact={compact} hideCardChrome hideMeta contentRef={taskContentRef} onCompleted={handleTaskCompleted} /></View>}
        {!taskVisible && controlsVisible && <View ref={controlsRef} style={styles.controls}><Pressable accessibilityRole="button" accessibilityLabel="结束会话" style={[styles.circle, styles.mutedCircle]}><PhoneOff color="#cfc7b9" size={22} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="开始任务" onPress={playTaskTransition} style={styles.micButton}><Mic color="#20150e" size={25} /></Pressable></View>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: "center", backgroundColor: "#fffaf2" }, safeArea: { flex: 1, width: "100%", maxWidth: 620, paddingHorizontal: 28 },
  header: { height: 84, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerCompact: { height: 68 }, circle: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e6dccb", backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" }, roomName: { color: "#20150e", fontSize: 21, lineHeight: 27, fontWeight: "800" },
  coachCard: { height: 98, marginHorizontal: 46, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e6dccb", backgroundColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center", shadowColor: "#6c4a20", shadowOpacity: 0.14, shadowRadius: 15, shadowOffset: { width: 0, height: 9 }, elevation: 4 }, coachCardCompact: { height: 78, marginHorizontal: 30 }, coachText: { color: "#20150e", fontSize: 29, lineHeight: 36, fontWeight: "800" },
  messageDot: { alignSelf: "flex-start", marginLeft: 48, marginTop: 14, width: 31, height: 31, borderRadius: 16, backgroundColor: "#0b72ff", alignItems: "center", justifyContent: "center" }, dotText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  auraStage: { flex: 1, minHeight: 250, alignItems: "center", justifyContent: "center" }, auraStageCompact: { minHeight: 140 }, auraBlob: { width: 190, height: 150, borderRadius: 95, backgroundColor: "rgba(226,174,57,0.24)", transform: [{ rotate: "-18deg" }], shadowColor: "#d4a017", shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 5 }, elevation: 7 }, auraHole: { width: 82, height: 65, borderRadius: 42, alignSelf: "center", marginTop: 43, backgroundColor: "#fffaf2", opacity: 0.88 },
  statusArea: { minHeight: 100, alignItems: "center", justifyContent: "center" }, statusBar: { width: 180, height: 4, borderRadius: 2, backgroundColor: "#e2ae39", marginBottom: 16 }, statusText: { color: "#b9ab8b", fontSize: 17, lineHeight: 23, fontWeight: "700" },
  controls: { minHeight: 112, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22 }, mutedCircle: { opacity: 0.7 }, micButton: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.88)", alignItems: "center", justifyContent: "center", shadowColor: "#58361d", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, taskWrap: { width: "100%", marginBottom: 8 },
});
