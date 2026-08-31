import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import {
  AudioSession,
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/react-native";
import type { AgentState } from "@livekit/react-native";
import { ArrowLeft, Mic, MicOff, PhoneOff } from "lucide-react-native";
import { ConnectionState } from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AgentAudioVisualizerAura, type AuraAgentState } from "../../components/AgentAudioVisualizerAura";
import { requestLiveKitToken, type LiveKitTokenResponse } from "../../services/livekit";

type SessionPhase = "idle" | "requesting" | "connecting" | "active" | "ended" | "error";

type ChatConfig = {
  apiBaseUrl: string;
  roomPrefix: string;
  location: string;
  coachName: string;
  statusText: string;
};

export type LiveKitChatScreenProps = {
  onBack?: () => void;
  onError?: (message: string) => void;
  alarmId?: string;
  autoStart?: boolean;
  alarmTitle?: string;
  alarmGoal?: string;
};

export function LiveKitChatScreen({ onBack, onError, alarmId, autoStart = false, alarmTitle, alarmGoal }: LiveKitChatScreenProps) {
  const config = useMemo(readChatConfig, []);
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [credentials, setCredentials] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const disconnectPhase = useRef<SessionPhase>("ended");
  const autoStarted = useRef(false);
  const stoppingRef = useRef(false);

  const stopSession = useCallback(async (nextPhase: SessionPhase = "ended") => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    requestId.current += 1;
    disconnectPhase.current = nextPhase;
    setCredentials(null);
    setPhase(nextPhase);
    if (Platform.OS !== "web") {
      await AudioSession.stopAudioSession().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (Platform.OS !== "web") {
        void AudioSession.stopAudioSession().catch(() => undefined);
      }
    };
  }, []);

  const startSession = useCallback(async () => {
    if (Platform.OS === "web") {
      setError("实时语音需要在 Expo development build 中运行");
      setPhase("error");
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    stoppingRef.current = false;
    setError(null);
    disconnectPhase.current = "ended";
    setPhase("requesting");

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await AudioSession.startAudioSession();
      const token = await requestLiveKitToken(config.apiBaseUrl, {
        roomName: `${config.roomPrefix}-${suffix}`,
        participantName: "Chronos member",
        participantIdentity: `chronos-member-${suffix}`,
        alarmId,
        sessionContext: {
          location: config.location,
          coachName: config.coachName,
        },
      });
      if (requestId.current !== currentRequest) return;
      setCredentials(token);
      setPhase("connecting");
    } catch (caughtError) {
      if (requestId.current !== currentRequest) return;
      await AudioSession.stopAudioSession().catch(() => undefined);
      setError(readError(caughtError));
      onError?.(readError(caughtError));
      setPhase("error");
    }
  }, [alarmId, config, onError]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void startSession();
  }, [alarmId, autoStart, startSession]);

  const handleBack = useCallback(() => {
    void stopSession("idle").then(() => onBack?.());
  }, [onBack, stopSession]);

  if (credentials) {
    return (
      <LiveKitRoom
        serverUrl={credentials.server_url}
        token={credentials.participant_token}
        connect
        audio
        video={false}
        onConnected={() => setPhase("active")}
        onDisconnected={() => void stopSession(disconnectPhase.current)}
        onError={(roomError) => {
          const message = readError(roomError);
          setError(message);
          onError?.(message);
          void stopSession("error").then(() => onBack?.());
        }}
      >
        <ConnectedCoachView
          config={config}
          alarmTitle={alarmTitle}
          alarmGoal={alarmGoal}
          phase={phase}
          error={error}
          onBack={handleBack}
          onEnded={() => void stopSession("ended").then(() => onBack?.())}
        />
      </LiveKitRoom>
    );
  }

  return (
      <CoachLayout
        config={config}
        alarmTitle={alarmTitle}
        alarmGoal={alarmGoal}
      phase={phase}
      agentState="disconnected"
      transcriptLines={[]}
      error={error}
      microphoneEnabled={false}
      onBack={handleBack}
      onEnd={() => void stopSession("ended").then(() => onBack?.())}
      onMicrophone={startSession}
    />
  );
}

function ConnectedCoachView({
  config,
  alarmTitle,
  alarmGoal,
  phase,
  error,
  onBack,
  onEnded,
}: {
  config: ChatConfig;
  alarmTitle?: string;
  alarmGoal?: string;
  phase: SessionPhase;
  error: string | null;
  onBack: () => void;
  onEnded: () => void;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();

  useEffect(() => {
    // LiveKitRoom normally disconnects on unmount; keep this explicit so a
    // navigation/unmount path also releases the realtime room immediately.
    return () => {
      room.disconnect();
      if (Platform.OS !== "web") {
        void AudioSession.stopAudioSession().catch(() => undefined);
      }
    };
  }, [room]);
  const transcriptLines = useMemo(() => {
    const latestById = new Map<string, string>();
    for (const segment of agentTranscriptions) {
      if (segment.text.trim()) latestById.set(segment.id, segment.text.trim());
    }
    const latest = Array.from(latestById.values()).slice(-3);
    return latest;
  }, [agentTranscriptions]);

  const toggleMicrophone = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      // LiveKit reports the concrete media failure through the room callback.
    }
  }, [isMicrophoneEnabled, localParticipant]);

  const endCall = useCallback(() => {
    room.disconnect();
    onEnded();
  }, [onEnded, room]);

  const resolvedPhase = connectionState === ConnectionState.Reconnecting ? "connecting" : phase;
  return (
    <CoachLayout
      config={config}
      alarmTitle={alarmTitle}
      alarmGoal={alarmGoal}
      phase={resolvedPhase}
      agentState={state}
      audioTrack={audioTrack}
      transcriptLines={transcriptLines}
      error={error}
      microphoneEnabled={isMicrophoneEnabled}
      onBack={onBack}
      onEnd={endCall}
      onMicrophone={toggleMicrophone}
    />
  );
}

function CoachLayout({
  config,
  alarmTitle,
  alarmGoal,
  phase,
  agentState,
  audioTrack,
  transcriptLines,
  error,
  microphoneEnabled,
  onBack,
  onEnd,
  onMicrophone,
}: {
  config: ChatConfig;
  alarmTitle?: string;
  alarmGoal?: string;
  phase: SessionPhase;
  agentState: AgentState;
  audioTrack?: unknown;
  transcriptLines: string[];
  error: string | null;
  microphoneEnabled: boolean;
  onBack: () => void;
  onEnd: () => void;
  onMicrophone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const viewportWidth = Math.min(width, 480);
  const compact = height < 720 || width < 360;
  const auraSize = Math.min(viewportWidth * (compact ? 0.66 : 0.76), compact ? 242 : 304);
  const visibleLines = transcriptLines.slice(-3);
  const waiting = phase === "requesting" || phase === "connecting";
  const canEnd = phase === "active" || phase === "connecting";

  return (
    <View style={styles.viewport}>
      <StatusBar style="dark" />
      <SafeAreaView style={[styles.safeArea, { width: viewportWidth }]}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <RoundButton label="返回" onPress={onBack}>
            <ArrowLeft color={palette.ink} size={compact ? 25 : 29} strokeWidth={2.4} />
          </RoundButton>
          <Text style={styles.location} numberOfLines={1}>{alarmTitle ?? config.location}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.coachCard, compact && styles.coachCardCompact]}>
          <Text style={[styles.coachName, compact && styles.coachNameCompact]} numberOfLines={1} adjustsFontSizeToFit>
            {alarmGoal ?? config.coachName}
          </Text>
        </View>

        <View style={[styles.auraStage, compact && styles.auraStageCompact]}>
          <AgentAudioVisualizerAura
            audioTrack={audioTrack}
            state={toAuraState(agentState)}
            volume={agentState === "speaking" ? 1 : 0}
            size={auraSize}
            color="#d4a017"
            colorShift={0.18}
            themeMode="light"
          />
        </View>

        <View style={[styles.transcript, compact && styles.transcriptCompact]}>
          {visibleLines.map((line, index) => (
            <Text
              key={`${index}-${line}`}
              style={[
                styles.transcriptLine,
                index === 0 && styles.transcriptFaded,
                index === 1 && styles.transcriptSecondary,
                index === 2 && styles.transcriptPrimary,
                compact && index === 2 && styles.transcriptPrimaryCompact,
              ]}
              numberOfLines={index === 2 ? 2 : 1}
              adjustsFontSizeToFit
            >
              {line}
            </Text>
          ))}
        </View>

        <View style={[styles.controlsArea, compact && styles.controlsAreaCompact]}>
          <View style={styles.controlsRow}>
            <RoundButton label="结束会话" onPress={onEnd} disabled={!canEnd} danger={canEnd}>
              <PhoneOff color={canEnd ? palette.danger : palette.muted} size={25} strokeWidth={2.1} />
            </RoundButton>
            <View style={styles.statusBlock}>
              {waiting && <ActivityIndicator size="small" color={palette.accentDark} />}
              <Text style={[styles.statusText, error && styles.statusError]} numberOfLines={2}>
                {error ?? sessionStatus(phase, agentState, microphoneEnabled, config.statusText)}
              </Text>
            </View>
            <RoundButton
              label={phase === "idle" || phase === "ended" || phase === "error" ? "开始会话" : microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
              onPress={onMicrophone}
              active={phase === "active" && microphoneEnabled}
            >
              {phase === "active" && !microphoneEnabled ? (
                <MicOff color={palette.ink} size={25} strokeWidth={2.1} />
              ) : (
                <Mic color={palette.ink} size={25} strokeWidth={2.1} />
              )}
            </RoundButton>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({
  children,
  label,
  onPress,
  disabled = false,
  active = false,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.roundButton,
        active && styles.roundButtonActive,
        danger && styles.roundButtonDanger,
        disabled && styles.roundButtonDisabled,
        pressed && !disabled && styles.roundButtonPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function readChatConfig(): ChatConfig {
  const extra = Constants.expoConfig?.extra ?? {};
  return {
    apiBaseUrl: String(extra.apiBaseUrl ?? "http://127.0.0.1:8000"),
    roomPrefix: String(extra.livekitRoomName ?? "chronos-coach"),
    location: String(extra.chatLocation ?? "徐汇体育馆游泳"),
    coachName: String(extra.chatCoachName ?? "Chronos教练"),
    statusText: String(extra.chatStatusText ?? "（更新了记忆）"),
  };
}

function toAuraState(state: AgentState): AuraAgentState {
  switch (state) {
    case "speaking":
    case "listening":
    case "thinking":
    case "connecting":
    case "initializing":
    case "failed":
    case "idle":
      return state;
    default:
      return "disconnected";
  }
}

function sessionStatus(phase: SessionPhase, agentState: AgentState, microphoneEnabled: boolean, fallback: string) {
  if (phase === "requesting") return "正在准备教练...";
  if (phase === "connecting") return "正在连接...";
  if (phase === "ended") return "会话已结束";
  if (phase === "error") return "轻触麦克风重试";
  if (phase === "idle") return "轻触麦克风开始";
  if (!microphoneEnabled) return "麦克风已关闭";
  if (agentState === "listening") return "正在聆听";
  if (agentState === "thinking") return "正在思考";
  if (agentState === "speaking") return "教练正在说话";
  if (agentState === "initializing" || agentState === "connecting") return "教练正在加入";
  if (agentState === "failed") return "教练暂时不可用";
  return fallback;
}

function readError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "无法连接 LiveKit，请稍后重试";
}

const palette = {
  background: "#fffaf2",
  surface: "rgba(255, 253, 248, 0.88)",
  ink: "#20150e",
  muted: "#b9ab8b",
  accent: "#f4c45c",
  accentDark: "#7b6534",
  danger: "#b84b3e",
  border: "rgba(91, 62, 35, 0.16)",
};

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: "center",
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    maxWidth: 480,
    backgroundColor: palette.background,
  },
  header: {
    height: 92,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
  },
  headerCompact: {
    height: 70,
    paddingHorizontal: 16,
  },
  headerSpacer: {
    width: 58,
  },
  location: {
    flex: 1,
    textAlign: "center",
    color: palette.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: 0,
  },
  coachCard: {
    minHeight: 96,
    marginHorizontal: 44,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    shadowColor: "#4f2d15",
    shadowOpacity: 0.22,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  taskGoal: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  coachCardCompact: {
    minHeight: 74,
    marginHorizontal: 34,
  },
  coachName: {
    color: palette.ink,
    fontSize: 39,
    lineHeight: 46,
    fontWeight: "800",
    letterSpacing: 0,
  },
  coachNameCompact: {
    fontSize: 31,
    lineHeight: 37,
  },
  auraStage: {
    flex: 1.12,
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
  },
  auraStageCompact: {
    minHeight: 150,
  },
  transcript: {
    minHeight: 176,
    paddingHorizontal: 28,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  transcriptCompact: {
    minHeight: 112,
    gap: 5,
  },
  transcriptLine: {
    width: "100%",
    textAlign: "center",
    letterSpacing: 0,
  },
  transcriptFaded: {
    color: "rgba(63, 57, 49, 0.24)",
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "400",
  },
  transcriptSecondary: {
    color: "rgba(43, 41, 37, 0.66)",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "500",
  },
  transcriptPrimary: {
    color: "#090806",
    fontSize: 31,
    lineHeight: 39,
    fontWeight: "500",
  },
  transcriptPrimaryCompact: {
    fontSize: 26,
    lineHeight: 33,
  },
  controlsArea: {
    minHeight: 134,
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 16,
  },
  controlsAreaCompact: {
    minHeight: 88,
    paddingBottom: 8,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBlock: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  statusText: {
    color: palette.muted,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: 0,
  },
  statusError: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 17,
  },
  roundButton: {
    width: 58,
    height: 58,
    flexShrink: 0,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    shadowColor: "#58361d",
    shadowOpacity: 0.13,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  roundButtonActive: {
    borderColor: "rgba(197, 142, 40, 0.46)",
    backgroundColor: "rgba(255, 225, 154, 0.62)",
  },
  roundButtonDanger: {
    borderColor: "rgba(184, 75, 62, 0.28)",
  },
  roundButtonDisabled: {
    opacity: 0.42,
  },
  roundButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});
