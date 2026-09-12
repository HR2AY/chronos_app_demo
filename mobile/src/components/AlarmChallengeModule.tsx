import { Check, RotateCcw, Send } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from "react-native";

export const ALARM_CHALLENGE_PHRASE = "今天上午我一定要抓住这次FDE活动的机会";

const COLORS = {
  ink: "#20150e",
  softInk: "#8f806d",
  whisper: "#d8cebd",
  line: "#e6dccb",
  accent: "#e2ae39",
  accentDeep: "#8b691e",
  green: "#2f7655",
  red: "#b84b3e",
};

type AlarmChallengeModuleProps = {
  compact?: boolean;
  style?: ViewStyle;
  cardRef?: React.RefObject<View | null>;
  contentRef?: React.RefObject<View | null>;
  hideCardChrome?: boolean;
  hideMeta?: boolean;
  onCompleted?: () => void;
  prompt?: string;
  onSubmitValue?: (value: string) => Promise<{ status: string }>;
};

export function AlarmChallengeModule({ compact = false, style, cardRef, contentRef, hideCardChrome = false, hideMeta = false, onCompleted, prompt = ALARM_CHALLENGE_PHRASE, onSubmitValue }: AlarmChallengeModuleProps) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const successRef = useRef<View>(null);
  const chars = useMemo(() => Array.from(prompt), [prompt]);
  const progress = Math.min(value.length, chars.length);
  const canSubmit = value.length > 0;

  const submit = async () => {
    if (submitted) return;
    if (onSubmitValue) {
      try {
        const result = await onSubmitValue(value);
        if (result.status === "passed") {
          setSubmitted(true);
          setError(false);
          onCompleted?.();
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
      return;
    }
    if (value === prompt) {
      setSubmitted(true);
      setError(false);
      onCompleted?.();
      return;
    }
    setError(true);
  };

  const reset = () => {
    setValue("");
    setSubmitted(false);
    setError(false);
    requestAnimationFrame(() => {
      inputRef.current?.clear();
      inputRef.current?.focus();
    });
  };

  return (
    <View ref={cardRef} style={[styles.challengeCard, hideCardChrome && styles.chromeLess, compact && styles.challengeCardCompact, style]}>
      <View ref={contentRef}>
        {!hideMeta && <View style={styles.cardTopline}>
          <View><Text style={styles.cardKicker}>CHALLENGE 01</Text><Text style={styles.cardHint}>请完整输入下方句子</Text></View>
          <Text style={styles.counter}>{String(progress).padStart(2, "0")} / {String(chars.length).padStart(2, "0")}</Text>
        </View>}

        <Pressable style={[styles.typingSurface, compact && styles.typingSurfaceCompact]} onPress={() => inputRef.current?.focus()} accessibilityRole="button" accessibilityLabel="输入任务句子">
          <View pointerEvents="none" style={styles.textLayer}>
            <View style={styles.phraseStack}>
              <Text style={[styles.phrase, compact && styles.phraseCompact]}>{prompt}</Text>
              <Text style={[styles.typedPhrase, compact && styles.phraseCompact]}>{value}<Text style={styles.caretGlyph}>{!submitted ? "|" : ""}</Text></Text>
            </View>
          </View>
          <TextInput ref={inputRef} defaultValue="" maxLength={chars.length} onChangeText={(next) => { setValue(next); setError(false); }} autoFocus multiline={false} autoCorrect={false} spellCheck={false} selectionColor={COLORS.accentDeep} style={styles.hiddenInput} accessibilityLabel="任务输入框" onSubmitEditing={submit} />
        </Pressable>

        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(progress / chars.length) * 100}%` }]} /></View>
        <View style={styles.helperRow}><Text style={[styles.helper, error && styles.errorText]}>{error ? "还差一点，再对照浅色提示试一次" : submitted ? "已完成，教练会继续和你聊下去" : "浅色是提示，深色是你的输入"}</Text>{!submitted && <Text style={styles.timer}>00:27</Text>}</View>

        {submitted ? (
          <View style={styles.successPanel} ref={successRef}>
            <View style={styles.successIcon}><Check color={COLORS.green} size={20} strokeWidth={2.5} /></View>
            <View style={styles.successCopy}><Text style={styles.successTitle}>任务完成</Text><Text style={styles.successSubtitle}>这次机会，已经被你抓住了。</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="重新开始任务" onPress={reset} style={styles.resetButton}><RotateCcw color={COLORS.accentDeep} size={17} strokeWidth={2.1} /></Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="提交任务" onPress={submit} disabled={!canSubmit} style={({ pressed }) => [styles.submitButton, !canSubmit && styles.submitDisabled, pressed && canSubmit && styles.submitPressed]}>
            <Text style={styles.submitText}>提交任务</Text><Send color={COLORS.ink} size={18} strokeWidth={2.1} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  challengeCard: { width: "100%", paddingHorizontal: 28, paddingTop: 25, paddingBottom: 23, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.line, backgroundColor: "rgba(255,255,255,0.8)", shadowColor: "#6c4a20", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 4 },
  chromeLess: { borderWidth: 0, borderColor: "transparent", backgroundColor: "transparent", shadowOpacity: 0, elevation: 0 },
  challengeCardCompact: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 19 },
  cardTopline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardKicker: { color: COLORS.accentDeep, fontSize: 11, lineHeight: 16, fontWeight: "800", letterSpacing: 1.3 },
  cardHint: { color: COLORS.softInk, fontSize: 14, lineHeight: 20, marginTop: 3 },
  counter: { color: COLORS.softInk, fontSize: 13, lineHeight: 18, fontWeight: "700", letterSpacing: 0.8 },
  typingSurface: { minHeight: 170, marginTop: 32, position: "relative", overflow: "hidden" },
  typingSurfaceCompact: { minHeight: 145, marginTop: 24 },
  textLayer: { ...StyleSheet.absoluteFill, justifyContent: "center", alignItems: "center" },
  phraseStack: { width: "100%", position: "relative" },
  phrase: { width: "100%", color: COLORS.whisper, fontSize: 31, lineHeight: 47, fontWeight: "500", textAlign: "left", letterSpacing: 0 },
  phraseCompact: { fontSize: 20, lineHeight: 32 },
  typedPhrase: { position: "absolute", left: 0, top: 0, width: "100%", color: COLORS.ink, fontSize: 31, lineHeight: 47, fontWeight: "600", textAlign: "left", letterSpacing: 0 },
  caretGlyph: { color: COLORS.accent, fontWeight: "500" } as never,
  hiddenInput: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", color: "transparent", backgroundColor: "transparent", opacity: 0.02, fontSize: 28, outlineStyle: "none" as never },
  progressTrack: { height: 3, width: "100%", marginTop: 20, borderRadius: 2, backgroundColor: "#eee7db", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: COLORS.accent },
  helperRow: { minHeight: 24, marginTop: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  helper: { flex: 1, color: COLORS.softInk, fontSize: 13, lineHeight: 18 },
  errorText: { color: COLORS.red },
  timer: { color: COLORS.accentDeep, fontSize: 13, lineHeight: 18, fontWeight: "700", letterSpacing: 0.8 },
  submitButton: { height: 52, width: "100%", marginTop: 17, borderRadius: 26, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, backgroundColor: COLORS.accent, borderWidth: 1, borderColor: "#d4a02c", shadowColor: "#8a641c", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  submitDisabled: { opacity: 0.45 },
  submitPressed: { transform: [{ scale: 0.985 }], opacity: 0.82 },
  submitText: { color: COLORS.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  successPanel: { width: "100%", minHeight: 64, marginTop: 17, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(47,118,85,0.28)", backgroundColor: "rgba(233,246,237,0.7)", flexDirection: "row", alignItems: "center" },
  successIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(47,118,85,0.13)", alignItems: "center", justifyContent: "center" },
  successCopy: { flex: 1, marginLeft: 10 },
  successTitle: { color: COLORS.green, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  successSubtitle: { color: "#547363", fontSize: 12, lineHeight: 17, marginTop: 1 },
  resetButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.7)" },
});
