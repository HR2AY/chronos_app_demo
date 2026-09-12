import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, LoaderCircle, Mic, MicOff, PhoneOff } from "lucide-react-native";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteAudioTrack,
  type TranscriptionSegment,
} from "livekit-client";
import type { AgentState } from "@livekit/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AgentAudioVisualizerAura, type AuraAgentState } from "../../components/AgentAudioVisualizerAura";
import { AlarmChallengeModule } from "../../components/AlarmChallengeModule";
import { requestLiveKitToken } from "../../services/livekit";
import type { AnnotationContext } from "../../services/annotationContext";
import type { Alarm } from "../../services/alarms";
import { playUiSound, playUiSoundLoop, stopAllUiSoundLoops, stopUiSoundLoop, unlockUiSounds } from "../../services/uiSounds";
import gsap from "gsap";

type SessionPhase = "idle" | "requesting" | "connecting" | "active" | "ended" | "error";
type ChatConfig = { apiBaseUrl: string; roomPrefix: string; location: string; coachName: string; statusText: string };
type TranscriptEntry = TranscriptionSegment & { participantIdentity?: string };
type ChallengePayload = { challenge_id: string; prompt: string; input_mode?: string; status?: string };
type Props = {
  onBack?: () => void;
  onError?: (message: string) => void;
  alarmId?: string;
  autoStart?: boolean;
  callAccepted?: boolean;
  onIncomingCall?: (incoming: boolean) => void;
  alarmTitle?: string;
  alarmGoal?: string;
  annotationContext?: AnnotationContext;
  alarm?: Alarm;
};

export function LiveKitChatScreen({ onBack, onError, alarmId, autoStart = false, callAccepted: acceptedProp, onIncomingCall, alarmTitle, alarmGoal, annotationContext, alarm }: Props) {
  const config = useMemo(readChatConfig, []);
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [incomingCall, setIncomingCall] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const requestId = useRef(0);
  const autoStarted = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const stoppingRef = useRef(false);
  const audioTracks = useRef(new Map<string, RemoteAudioTrack>());
  const audioElements = useRef(new Map<string, HTMLMediaElement>());
  const wasAgentConnected = useRef(false);
  const accepted = acceptedProp ?? callAccepted;
  const acceptedRef = useRef(accepted);

  const cleanupAudio = useCallback(() => {
    for (const track of audioTracks.current.values()) track.detach().forEach((element) => element.remove());
    audioTracks.current.clear();
    audioElements.current.clear();
  }, []);

  const stopSession = useCallback((nextPhase: SessionPhase = "ended") => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    requestId.current += 1;
    cleanupAudio();
    const activeRoom = roomRef.current;
    roomRef.current = null;
    activeRoom?.disconnect();
    setRoom(null);
    setIncomingCall(false);
    setCallAccepted(false);
    onIncomingCall?.(false);
    setMicrophoneEnabled(false);
    setAgentConnected(false);
    setAgentSpeaking(false);
    setTranscripts([]);
    setPhase(nextPhase);
  }, [cleanupAudio]);

  useEffect(() => () => {
    stopAllUiSoundLoops();
    requestId.current += 1;
    cleanupAudio();
    roomRef.current?.disconnect();
    roomRef.current = null;
  }, [cleanupAudio]);

  useEffect(() => {
    acceptedRef.current = accepted;
    if (accepted) {
      audioElements.current.forEach((element) => {
        element.muted = false;
        void element.play().catch((playError) => {
          console.warn("[Chronos] remote audio play was blocked", playError);
        });
      });
    }
  }, [accepted]);

  useEffect(() => {
    const waitingForCall = Boolean(onIncomingCall && !accepted);
    const preparing = !waitingForCall && phase === "requesting";
    const waitingForRealtime = !waitingForCall && (phase === "connecting" || (phase === "active" && !agentConnected));
    if (preparing || waitingForRealtime) void unlockUiSounds();
    if (preparing) playUiSoundLoop("loading"); else stopUiSoundLoop("loading");
    if (waitingForRealtime) playUiSoundLoop("streaming"); else stopUiSoundLoop("streaming");
    if (waitingForCall) {
      stopUiSoundLoop("loading");
      stopUiSoundLoop("streaming");
    }

    if (agentConnected && !wasAgentConnected.current) {
      void unlockUiSounds().then(() => playUiSound("retry"));
    }
    wasAgentConnected.current = agentConnected;
    if (error) stopAllUiSoundLoops();
    return () => {
      stopUiSoundLoop("loading");
      stopUiSoundLoop("streaming");
    };
  }, [accepted, agentConnected, error, onIncomingCall, phase]);

  const attachAudio = useCallback((track: RemoteAudioTrack) => {
    const trackKey = track.sid ?? track.mediaStreamTrack.id;
    if (audioTracks.current.has(trackKey)) return;
    audioTracks.current.set(trackKey, track);
    const element = track.attach();
    element.autoplay = true;
    element.muted = !acceptedRef.current;
    element.setAttribute("playsinline", "true");
    element.style.position = "fixed";
    element.style.width = "1px";
    element.style.height = "1px";
    element.style.opacity = "0.01";
    element.style.pointerEvents = "none";
    document.body.appendChild(element);
    audioElements.current.set(trackKey, element);
    void element.play().catch((playError) => {
      console.warn("[Chronos] remote audio autoplay was blocked", playError);
    });
  }, []);

  const startSession = useCallback(async () => {
    if (phase === "requesting" || phase === "connecting" || phase === "active") return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    stoppingRef.current = false;
    setError(null);
    setTranscripts([]);
    setChallenge(null);
    setCallAccepted(false);
    setIncomingCall(Boolean(onIncomingCall));
    onIncomingCall?.(true);
    setPhase("requesting");
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nextRoom = new Room({ adaptiveStream: true, dynacast: true });

    try {
      // Prime the browser audio context during the original microphone click.
      await nextRoom.startAudio().catch(() => undefined);
      let microphoneReady = false;
      try {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permissionStream.getTracks().forEach((track) => track.stop());
        microphoneReady = true;
      } catch (permissionError) {
        // Auto-start can run outside a user gesture. Keep the room/agent alive
        // and let the microphone button retry permission from a gesture.
        console.warn("[Chronos] microphone permission deferred", permissionError);
      }
      const token = await requestLiveKitToken(config.apiBaseUrl, {
        roomName: `${config.roomPrefix}-${suffix}`,
        participantName: "Chronos member",
        participantIdentity: `chronos-member-${suffix}`,
        alarmId,
        sessionContext: { location: annotationContext?.location ?? config.location, coachName: annotationContext?.coachName ?? config.coachName, annotation: annotationContext ? { language: annotationContext.language, tone: annotationContext.tone, personalNotes: annotationContext.personalNotes } : undefined, alarm },
      });
      if (requestId.current !== currentRequest) return;

      nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          console.info("[Chronos] remote audio subscribed", track.sid);
          attachAudio(track as RemoteAudioTrack);
        }
      });
      nextRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const remoteTrack = track as RemoteAudioTrack;
        remoteTrack.detach().forEach((element) => element.remove());
        audioTracks.current.delete(remoteTrack.sid ?? remoteTrack.mediaStreamTrack.id);
      });
      nextRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setAgentSpeaking(speakers.some((participant) => participant.isAgent));
      });
      nextRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        console.info("[Chronos] participant connected", participant.identity, participant.kind, participant.isAgent);
        if (participant.isAgent) setAgentConnected(true);
      });
      nextRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.info("[Chronos] participant disconnected", participant.identity, participant.kind, participant.isAgent);
        if (participant.isAgent) {
          setAgentConnected(false);
          setAgentSpeaking(false);
        }
      });
      nextRoom.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        if (!participant || participant.identity === nextRoom?.localParticipant.identity) return;
        setTranscripts((previous) => {
          const updated = [...previous];
          for (const segment of segments) {
            const index = updated.findIndex((entry) => entry.id === segment.id);
            const entry = { ...segment, participantIdentity: participant.identity };
            if (index >= 0) updated[index] = entry;
            else updated.push(entry);
          }
          return updated.slice(-12);
        });
      });
      nextRoom.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== "alarm_challenge") return;
        try {
          const event = JSON.parse(new TextDecoder().decode(payload)) as { event?: string } & ChallengePayload;
          if (event.event === "alarm_challenge.created") setChallenge(event);
          if (event.event === "alarm_challenge.result" && event.status === "passed") setChallenge(null);
        } catch {
          // Ignore malformed data from unrelated room participants.
        }
      });
      nextRoom.on(RoomEvent.Connected, () => {
        console.info("[Chronos] room connected", nextRoom.name);
        setPhase("active");
      });
      nextRoom.on(RoomEvent.Reconnecting, () => {
        console.warn("[Chronos] room reconnecting");
        setPhase("connecting");
      });
      nextRoom.on(RoomEvent.Reconnected, () => {
        console.info("[Chronos] room reconnected");
        setPhase("active");
      });
      nextRoom.on(RoomEvent.MediaDevicesError, (mediaError) => {
        setError(`麦克风不可用：${readError(mediaError)}`);
      });
      nextRoom.on(RoomEvent.Disconnected, () => {
        cleanupAudio();
        if (roomRef.current === nextRoom) roomRef.current = null;
        setRoom(null);
        setMicrophoneEnabled(false);
        setAgentConnected(false);
        if (!stoppingRef.current && requestId.current === currentRequest) setPhase("ended");
      });

      setPhase("connecting");
      await nextRoom.connect(token.server_url, token.participant_token);
      if (requestId.current !== currentRequest) {
        nextRoom.disconnect();
        return;
      }
      // This call is required by browsers that gate remote audio behind a user gesture.
      await nextRoom.startAudio().catch(() => undefined);
      if (microphoneReady && accepted) {
        await nextRoom.localParticipant.setMicrophoneEnabled(true).catch((mediaError) => {
          console.warn("[Chronos] microphone enable deferred", mediaError);
        });
      }
      setAgentConnected(Array.from(nextRoom.remoteParticipants.values()).some((participant) => participant.isAgent));
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      setMicrophoneEnabled(microphoneReady && nextRoom.localParticipant.isMicrophoneEnabled);
    } catch (caughtError) {
      nextRoom?.disconnect();
      cleanupAudio();
      if (requestId.current !== currentRequest) return;
      const message = readError(caughtError);
      setError(message);
      onError?.(message);
      setIncomingCall(false);
      setPhase("error");
    }
  }, [alarmId, attachAudio, accepted, cleanupAudio, config, onError, onIncomingCall, phase, annotationContext, alarm]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void startSession();
  }, [alarmId, autoStart, startSession]);

  const toggleMicrophone = useCallback(async () => {
    if (!room || phase !== "active") return;
    try {
      const enabled = !microphoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
    } catch (caughtError) {
      setError(readError(caughtError));
    }
  }, [microphoneEnabled, phase, room]);

  const handleBack = useCallback(() => {
    stopSession("idle");
    onBack?.();
  }, [onBack, stopSession]);

  const acceptCall = useCallback(() => {
    acceptedRef.current = true;
    setIncomingCall(false);
    setCallAccepted(true);
    audioElements.current.forEach((element) => {
      element.muted = false;
      void element.play().catch((playError) => {
        console.warn("[Chronos] remote audio play after accept was blocked", playError);
      });
    });
  }, []);

  useEffect(() => {
    if (!accepted || phase !== "active" || !room || microphoneEnabled) return;
    void room.localParticipant.setMicrophoneEnabled(true)
      .then(() => setMicrophoneEnabled(true))
      .catch((caughtError) => setError(readError(caughtError)));
  }, [accepted, microphoneEnabled, phase, room]);

  const transcriptLines = useMemo(() => {
    const lines = transcripts.map((segment) => segment.text.trim()).filter(Boolean).slice(-3);
    return lines;
  }, [transcripts]);
  const agentState: AgentState = phase === "connecting" ? "connecting" : agentSpeaking ? "speaking" : phase === "active" && agentConnected ? "listening" : "disconnected";

  if (onIncomingCall && !accepted) return <View style={styles.backgroundSession} pointerEvents="none" />;
  const submitChallenge = async (value: string) => {
    if (!challenge) return { status: "failed" };
    const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/alarm-challenges/${challenge.challenge_id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
    if (!response.ok) throw new Error("Challenge submission failed");
    const result = await response.json() as { status: string };
    if (result.status === "passed") setChallenge(null);
    return result;
  };
  return <CoachLayout config={config} phase={phase} agentState={agentState} agentConnected={agentConnected} transcriptLines={transcriptLines} error={error} microphoneEnabled={microphoneEnabled} alarmTitle={alarmTitle} alarmGoal={alarmGoal} challenge={challenge} onSubmitChallenge={submitChallenge} onBack={handleBack} onEnd={() => { void unlockUiSounds().then(() => playUiSound("receive")); stopSession("ended"); onBack?.(); }} onMicrophone={phase === "active" ? toggleMicrophone : startSession} />;
}

function CoachLayout({ config, phase, agentState, agentConnected, transcriptLines, error, microphoneEnabled, alarmTitle, alarmGoal, challenge, onSubmitChallenge, onBack, onEnd, onMicrophone }: { config: ChatConfig; phase: SessionPhase; agentState: AgentState; agentConnected: boolean; transcriptLines: string[]; error: string | null; microphoneEnabled: boolean; alarmTitle?: string; alarmGoal?: string; challenge: ChallengePayload | null; onSubmitChallenge: (value: string) => Promise<{ status: string }>; onBack: () => void; onEnd: () => void; onMicrophone: () => void }) {
  const { width, height } = useWindowDimensions();
  const compact = height < 720 || width < 360;
  const viewportWidth = Math.min(width, 480);
  const auraSize = Math.min(viewportWidth * (compact ? 0.66 : 0.76), compact ? 242 : 304);
  const visibleLines = agentConnected ? transcriptLines.slice(-3) : [];
  const waiting = phase === "requesting" || phase === "connecting";
  const canEnd = phase === "active" || phase === "connecting";
  const errorPanelRef = useRef<View>(null);
  const lastError = useRef<string | null>(null);

  useEffect(() => {
    if (!error || error === lastError.current) return;
    lastError.current = error;
    void unlockUiSounds().then(() => playUiSound("warning"));
    if (errorPanelRef.current) {
      gsap.fromTo(
        errorPanelRef.current,
        { clipPath: "circle(0% at 50% 50%)", opacity: 0.4, scale: 0.96 },
        { clipPath: "circle(150% at 50% 50%)", opacity: 1, scale: 1, duration: 0.62, ease: "power3.out" },
      );
    }
  }, [error]);

  return <View style={styles.viewport}>
    <StatusBar style="dark" />
    <SafeAreaView style={[styles.safeArea, { width: viewportWidth }]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <RoundButton label="返回" onPress={onBack}><ArrowLeft color={palette.ink} size={compact ? 25 : 29} strokeWidth={2.4} /></RoundButton>
        <Text style={styles.location} numberOfLines={1}>{alarmTitle ?? config.location}</Text><View style={styles.headerSpacer} />
      </View>
      <View style={[styles.coachCard, compact && styles.coachCardCompact]}><Text style={[styles.coachName, compact && styles.coachNameCompact]} numberOfLines={1} adjustsFontSizeToFit>{alarmGoal ?? config.coachName}</Text></View>
      {error && <View ref={errorPanelRef} style={[styles.errorPanel, compact && styles.errorPanelCompact]}>
        <View style={styles.errorBadge}><Text style={styles.errorBadgeText}>!</Text></View>
        <Text style={styles.errorTitle}>Connection issue</Text>
        <Text style={styles.errorMessage} numberOfLines={2}>{error}</Text>
        <Text style={styles.errorHint}>轻触麦克风重试</Text>
      </View>}
      {challenge && <AlarmChallengeModule compact={compact} prompt={challenge.prompt} onSubmitValue={onSubmitChallenge} style={styles.liveChallenge} />}
      <View style={[styles.auraStage, compact && styles.auraStageCompact]}>
        <AgentAudioVisualizerAura
          state={toAuraState(agentState)}
          volume={agentState === "speaking" ? 1 : 0}
          size={auraSize}
          color="#d4a017"
          colorShift={0.18}
          themeMode="light"
        />
      </View>
      <View style={[styles.transcript, compact && styles.transcriptCompact]}>{visibleLines.map((line, index) => <Text key={`${index}-${line}`} style={[styles.transcriptLine, index === 0 && styles.transcriptFaded, index === 1 && styles.transcriptSecondary, index === 2 && styles.transcriptPrimary, compact && index === 2 && styles.transcriptPrimaryCompact]} numberOfLines={index === 2 ? 2 : 1} adjustsFontSizeToFit>{line}</Text>)}</View>
      <View style={[styles.controlsArea, compact && styles.controlsAreaCompact]}><View style={styles.controlsRow}>
        <RoundButton label="结束会话" onPress={onEnd} disabled={!canEnd} danger={canEnd}><PhoneOff color={canEnd ? palette.danger : palette.muted} size={25} strokeWidth={2.1} /></RoundButton>
        <View style={styles.statusBlock}>{waiting && <LoaderCircle size={17} color={palette.accentDark} />}<Text style={[styles.statusText, error && styles.statusError]} numberOfLines={2}>{error ?? sessionStatus(phase, agentState, agentConnected, microphoneEnabled, config.statusText)}</Text></View>
        <RoundButton label={phase === "active" ? (microphoneEnabled ? "关闭麦克风" : "打开麦克风") : "开始会话"} onPress={onMicrophone} active={phase === "active" && microphoneEnabled}>{phase === "active" && !microphoneEnabled ? <MicOff color={palette.ink} size={25} strokeWidth={2.1} /> : <Mic color={palette.ink} size={25} strokeWidth={2.1} />}</RoundButton>
      </View></View>
    </SafeAreaView>
  </View>;
}

function RoundButton({ children, label, onPress, disabled = false, active = false, danger = false }: { children: React.ReactNode; label: string; onPress: () => void; disabled?: boolean; active?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.roundButton, active && styles.roundButtonActive, danger && styles.roundButtonDanger, disabled && styles.roundButtonDisabled, pressed && !disabled && styles.roundButtonPressed]}>{children}</Pressable>;
}

function readChatConfig(): ChatConfig {
  const extra = Constants.expoConfig?.extra ?? {};
  return { apiBaseUrl: String(extra.apiBaseUrl ?? "http://127.0.0.1:8000"), roomPrefix: String(extra.livekitRoomName ?? "chronos-coach"), location: String(extra.chatLocation ?? ""), coachName: String(extra.chatCoachName ?? "Chronos教练"), statusText: String(extra.chatStatusText ?? "（更新了记忆）") };
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

function sessionStatus(phase: SessionPhase, agentState: AgentState, agentConnected: boolean, microphoneEnabled: boolean, fallback: string) {
  if (phase === "requesting") return "正在准备教练...";
  if (phase === "connecting") return "正在连接...";
  if (phase === "ended") return "会话已结束";
  if (phase === "error") return "轻触麦克风重试";
  if (phase === "idle") return "轻触麦克风开始";
  if (!microphoneEnabled) return "麦克风已关闭";
  if (!agentConnected) return "等待教练加入";
  if (agentState === "speaking") return "教练正在说话";
  if (agentState === "listening") return "正在聆听";
  return fallback;
}

function readError(error: unknown) { return error instanceof Error ? error.message : "无法连接 LiveKit，请稍后重试"; }

const palette = { background: "#fffaf2", surface: "rgba(255, 253, 248, 0.88)", ink: "#20150e", muted: "#b9ab8b", accentDark: "#7b6534", danger: "#b84b3e", border: "rgba(91, 62, 35, 0.16)" };
const styles = StyleSheet.create({
  backgroundSession: { flex: 1, opacity: 0 },
  viewport: { flex: 1, alignItems: "center", backgroundColor: palette.background }, safeArea: { flex: 1, maxWidth: 480, backgroundColor: palette.background }, header: { height: 92, paddingHorizontal: 22, flexDirection: "row", alignItems: "center" }, headerCompact: { height: 70, paddingHorizontal: 16 }, headerSpacer: { width: 58 }, location: { flex: 1, textAlign: "center", color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" }, liveChallenge: { marginHorizontal: 18, marginBottom: 12 },
  coachCard: { minHeight: 96, marginHorizontal: 44, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, boxShadow: "0 7px 11px rgba(79,45,21,0.22)" } as never, coachCardCompact: { minHeight: 74, marginHorizontal: 34 }, coachName: { color: palette.ink, fontSize: 39, lineHeight: 46, fontWeight: "800" }, coachNameCompact: { fontSize: 31, lineHeight: 37 }, auraStage: { flex: 1.12, minHeight: 250, alignItems: "center", justifyContent: "center" }, auraStageCompact: { minHeight: 150 }, transcript: { minHeight: 176, paddingHorizontal: 28, justifyContent: "center", alignItems: "center", gap: 12 }, transcriptCompact: { minHeight: 112, gap: 5 }, transcriptLine: { width: "100%", textAlign: "center" }, transcriptFaded: { color: "rgba(63,57,49,0.24)", fontSize: 19, lineHeight: 25 }, transcriptSecondary: { color: "rgba(43,41,37,0.66)", fontSize: 21, lineHeight: 27, fontWeight: "500" }, transcriptPrimary: { color: "#090806", fontSize: 31, lineHeight: 39, fontWeight: "500" }, transcriptPrimaryCompact: { fontSize: 26, lineHeight: 33 }, controlsArea: { minHeight: 134, justifyContent: "center", paddingHorizontal: 30, paddingBottom: 16 }, controlsAreaCompact: { minHeight: 88, paddingBottom: 8 }, controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, statusBlock: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", gap: 5 }, statusText: { color: palette.muted, textAlign: "center", fontSize: 17, lineHeight: 22, fontWeight: "700" }, statusError: { color: palette.danger, fontSize: 13, lineHeight: 17 }, roundButton: { width: 58, height: 58, flexShrink: 0, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.65)", borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, boxShadow: "0 5px 9px rgba(88,54,29,0.13)" } as never, roundButtonActive: { borderColor: "rgba(197, 142, 40, 0.46)", backgroundColor: "rgba(255, 225, 154, 0.62)" }, roundButtonDanger: { borderColor: "rgba(184, 75, 62, 0.28)" }, roundButtonDisabled: { opacity: 0.42 }, roundButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  taskGoal: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  errorPanel: { marginHorizontal: 32, marginTop: 14, paddingHorizontal: 24, paddingVertical: 22, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(184,75,62,0.28)", boxShadow: "0 12px 24px rgba(88,54,29,0.16)" } as never,
  errorPanelCompact: { marginHorizontal: 24, paddingVertical: 16, borderRadius: 22 },
  errorBadge: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(226,138,22,0.16)", marginBottom: 10 },
  errorBadgeText: { color: "#d47a0f", fontSize: 28, lineHeight: 32, fontWeight: "800" },
  errorTitle: { color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  errorMessage: { color: "rgba(43,41,37,0.68)", fontSize: 16, lineHeight: 22, textAlign: "center", marginTop: 4 },
  errorHint: { color: palette.danger, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 10 },
});
