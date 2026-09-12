import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { ComponentProps, PropsWithChildren, ReactNode, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  GestureResponderEvent,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, Mic, Pencil } from "lucide-react-native";
import { Alarm, createAlarm, deleteAlarm, fetchAlarms, updateAlarm } from "../services/alarms";
import { GlassCard } from "../components/GlassCard";
import { LiveKitChatScreen } from "./chat/LiveKitChatScreen";
import { IncomingCallOverlay } from "../components/IncomingCallOverlay";
import { playUiSound, playUiSoundLoop, stopUiSoundLoop, unlockUiSounds } from "../services/uiSounds";
import { AnnotationContext, DEFAULT_ANNOTATION_CONTEXT, loadAnnotationContext, saveAnnotationContext } from "../services/annotationContext";

gsap.registerPlugin(useGSAP);

const colors = {
  background: "#f4f3f8",
  drawerSurface: "#faf9fe",
  surface: "rgba(255,255,255,0.68)",
  surfaceSoft: "rgba(250,249,254,0.62)",
  surfaceMuted: "rgba(233,231,237,0.58)",
  divider: "#dcd9e2",
  text: "#1a1b1f",
  textMuted: "#4f4634",
  textSoft: "#8e8e93",
  accent: "#d4a017",
  accentDark: "#795900",
  warningAccent: "#e28a16",
  danger: "#ba1a1a",
};

type AnimationOrigin = { x: number; y: number };

export function AurelianCalendarScreen() {
  const [fontsLoaded] = useFonts({ Kalmansk: require("../../assets/Kalmansk-2.otf") });
  const [alarmItems, setAlarmItems] = useState<Alarm[]>([]);
  const [alarmLoading, setAlarmLoading] = useState(true);
  const [alarmError, setAlarmError] = useState<string | null>(null);
  const [alarmEditor, setAlarmEditor] = useState<Alarm | "new" | null>(null);
  const [activeAlarmChat, setActiveAlarmChat] = useState<Alarm | null>(null);
  const [incomingCall, setIncomingCall] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotationEditorOpen, setAnnotationEditorOpen] = useState(false);
  const [annotationContext, setAnnotationContext] = useState<AnnotationContext>(DEFAULT_ANNOTATION_CONTEXT);
  const [alarmAnimationOrigin, setAlarmAnimationOrigin] = useState<AnimationOrigin | null>(null);
  const apiBaseUrl = getApiBaseUrl();

  const refreshAlarms = async () => {
    setAlarmLoading(true);
    setAlarmError(null);
    try {
      setAlarmItems(await fetchAlarms(apiBaseUrl));
    } catch (error) {
      setAlarmError(error instanceof Error ? error.message : String(error));
    } finally {
      setAlarmLoading(false);
    }
  };

  useEffect(() => {
    void refreshAlarms();
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadAnnotationContext().then(setAnnotationContext);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (incomingCall) {
      void unlockUiSounds().then(() => {
        if (!cancelled) playUiSoundLoop("incoming-call");
      });
    } else {
      stopUiSoundLoop("incoming-call");
    }
    return () => {
      cancelled = true;
      stopUiSoundLoop("incoming-call");
    };
  }, [incomingCall]);

  const openAlarmChat = (alarm: Alarm) => {
    void unlockUiSounds();
    setCallAccepted(false);
    setIncomingCall(true);
    setActiveAlarmChat(alarm);
  };

  const closeAlarmChat = () => {
    stopUiSoundLoop("incoming-call");
    setIncomingCall(false);
    setCallAccepted(false);
    setActiveAlarmChat(null);
  };

  return (
    <View style={styles.webViewport}>
      <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <TopBar onMenuPress={() => { void unlockUiSounds().then(() => playUiSound("expand")); setSettingsOpen(true); }} fontLoaded={fontsLoaded} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <AlarmsView
            alarms={alarmItems}
            isLoading={alarmLoading}
            error={alarmError}
            onAdd={(origin) => {
              setAlarmAnimationOrigin(origin);
              setAlarmEditor("new");
            }}
            onEdit={setAlarmEditor}
            onDelete={async (alarm) => {
              try {
                await deleteAlarm(apiBaseUrl, alarm.id);
                await refreshAlarms();
              } catch (error) {
                setAlarmError(error instanceof Error ? error.message : String(error));
              }
            }}
            activeAlarmId={activeAlarmChat?.id ?? null}
            onChat={openAlarmChat}
            fontLoaded={fontsLoaded}
          />
        </ScrollView>
      </SafeAreaView>
      {settingsOpen && (
        <SettingsDrawer
          onCloseComplete={() => { playUiSound("collapse"); setSettingsOpen(false); }}
          onProfilePress={() => { setSettingsOpen(false); setAnnotationEditorOpen(true); }}
          fontLoaded={fontsLoaded}
        />
      )}
      {alarmEditor && (
        <AlarmEditPage
          alarm={alarmEditor === "new" ? null : alarmEditor}
          apiBaseUrl={apiBaseUrl}
          animationOrigin={alarmAnimationOrigin}
          onCloseComplete={() => setAlarmEditor(null)}
          onSaved={async () => {
            await refreshAlarms();
          }}
        />
      )}
      {activeAlarmChat && (
        <View style={[styles.alarmChatOverlay, !callAccepted && styles.backgroundChat]} pointerEvents={callAccepted ? "auto" : "none"}>
          <LiveKitChatScreen
            alarmId={activeAlarmChat.id}
            alarmTitle={activeAlarmChat.title}
            alarmGoal={activeAlarmChat.goal}
            autoStart
            callAccepted={callAccepted}
            onIncomingCall={setIncomingCall}
            onBack={closeAlarmChat}
            annotationContext={annotationContext}
            alarm={activeAlarmChat}
          />
        </View>
      )}
      {activeAlarmChat && incomingCall && (
        <IncomingCallOverlay
          callerName={activeAlarmChat.goal}
          subtitle={activeAlarmChat.title}
          onAccept={() => {
            stopUiSoundLoop("incoming-call");
            setIncomingCall(false);
            setCallAccepted(true);
          }}
          onDecline={closeAlarmChat}
        />
      )}
      {annotationEditorOpen && (
        <BackgroundContextPage
          value={annotationContext}
          onClose={() => setAnnotationEditorOpen(false)}
          onSaved={(next) => { setAnnotationContext(next); setAnnotationEditorOpen(false); }}
        />
      )}
      </View>
    </View>
  );
}

function TopBar({ onMenuPress, fontLoaded }: { onMenuPress: () => void; fontLoaded: boolean }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.menuButton} onPress={onMenuPress} hitSlop={10}>
        <Text style={styles.menuIcon}>☰</Text>
      </Pressable>
      <Text style={[styles.brandTitle, fontLoaded && styles.kalmanskText]} numberOfLines={1}>
        chronos
      </Text>
      <Pressable style={styles.avatar} hitSlop={8}>
        <Text style={styles.avatarText}>AR</Text>
      </Pressable>
    </View>
  );
}

/* Calendar and task views were retired; alarms are the app's sole surface. */
/*
function CalendarView({
  calendar,
  isLoading,
  error,
  mode,
  selectedDate,
  selectedEvents,
  onSelectDate,
  onMonthChange,
  onDeleteEvent,
  onCreateEventFromAlarm,
}: {
  calendar: CalendarMonth | null;
  isLoading: boolean;
  error: string | null;
  mode: CalendarMode;
  selectedDate: string;
  selectedEvents: CalendarEvent[];
  onSelectDate: (date: string) => void;
  onMonthChange: (delta: number) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  onCreateEventFromAlarm: (event: CalendarEvent) => void;
}) {
  if (mode === "timeline") {
    return (
      <TimelineCalendarView
        selectedDate={selectedDate}
        selectedEvents={selectedEvents}
        onMonthChange={onMonthChange}
      />
    );
  }

  return (
    <GridCalendarView
      calendar={calendar}
      isLoading={isLoading}
      error={error}
      selectedDate={selectedDate}
      selectedEvents={selectedEvents}
      onSelectDate={onSelectDate}
      onMonthChange={onMonthChange}
      onDeleteEvent={onDeleteEvent}
      onCreateEventFromAlarm={onCreateEventFromAlarm}
    />
  );
}

function GridCalendarView({
  calendar,
  isLoading,
  error,
  selectedDate,
  selectedEvents,
  onSelectDate,
  onMonthChange,
  onDeleteEvent,
  onCreateEventFromAlarm,
}: {
  calendar: CalendarMonth | null;
  isLoading: boolean;
  error: string | null;
  selectedDate: string;
  selectedEvents: CalendarEvent[];
  onSelectDate: (date: string) => void;
  onMonthChange: (delta: number) => void;
  onDeleteEvent: (event: CalendarEvent) => void;
  onCreateEventFromAlarm: (event: CalendarEvent) => void;
}) {
  return (
    <>
      <GlassCard style={styles.monthCard}>
        <View style={styles.monthHeader}>
          <View style={styles.monthTitleBlock}>
            <Text style={styles.monthTitle}>{calendar?.monthLabel ?? "Chronos"}</Text>
            <Text style={styles.monthSubtitle} numberOfLines={1}>
              {calendar?.dbPath ? `SQLite · ${shortDbName(calendar.dbPath)}` : "Live Chronos database"}
            </Text>
          </View>
          <View style={styles.monthControls}>
            <Pressable style={styles.roundIconButton} onPress={() => onMonthChange(-1)}>
              <Text style={styles.chevron}>‹</Text>
            </Pressable>
            <Pressable style={styles.roundIconButton} onPress={() => onMonthChange(1)}>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.calendarDivider} />
        <View style={styles.weekdayRow}>
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
            <Text key={day} style={styles.weekdayLabel}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.dateGrid}>
          {calendar?.weeks.map((week, index) => (
            <View key={`week-${index}`} style={styles.dateRow}>
              {week.map((day) => (
                <Pressable key={day.date} style={styles.dateCell} onPress={() => onSelectDate(day.date)}>
                  <View
                    style={[
                      styles.dateBubble,
                      day.date === selectedDate && styles.dateBubbleSelected,
                      day.isToday && day.date !== selectedDate && styles.dateBubbleToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateText,
                        !day.inMonth && styles.dateTextMuted,
                        day.date === selectedDate && styles.dateTextSelected,
                      ]}
                    >
                      {day.date.slice(-2)}
                    </Text>
                  </View>
                  <EventDots day={day} />
                </Pressable>
              ))}
            </View>
          ))}
        </View>
        {(isLoading || error || calendar?.errors?.length) && (
          <View style={styles.statusStrip}>
            <Text style={styles.statusText} numberOfLines={2}>
              {isLoading
                ? "Loading Chronos events..."
                : error
                  ? `Using fallback calendar: ${error}`
                  : `${calendar?.errors?.length ?? 0} database validation issue(s)`}
            </Text>
          </View>
        )}
      </GlassCard>

      <SectionTitle>{selectedDateLabel(selectedDate)}</SectionTitle>
      <GlassCard style={styles.listCard}>
        {selectedEvents.length > 0 ? (
          selectedEvents.map((event, index) => (
            <EventRow
              key={event.id}
              event={event}
              isLast={index === selectedEvents.length - 1}
              onDelete={onDeleteEvent}
              onCreateEvent={onCreateEventFromAlarm}
            />
          ))
        ) : (
          <View style={styles.emptyEventsRow}>
            <Text style={styles.emptyEventsText}>No scheduled Chronos events</Text>
          </View>
        )}
      </GlassCard>
    </>
  );
}

function EventDots({ day }: { day: CalendarDay }) {
  if (day.events.length === 0) {
    return <View style={styles.eventDotSpacer} />;
  }
  return (
    <View style={styles.eventDots}>
      {day.events.slice(0, 3).map((event) => (
        <View key={event.id} style={[styles.eventDot, { backgroundColor: event.color ?? colors.accent }]} />
      ))}
    </View>
  );
}

function EventRow({
  event,
  isLast,
  onDelete,
  onCreateEvent,
}: {
  event: CalendarEvent;
  isLast: boolean;
  onDelete: (event: CalendarEvent) => void;
  onCreateEvent: (event: CalendarEvent) => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 42) {
          setActionsOpen(true);
        } else if (gestureState.dx < -24) {
          setActionsOpen(false);
        }
      },
    }),
  ).current;

  const handleDelete = (pressEvent: GestureResponderEvent) => {
    pressEvent.stopPropagation();
    setActionsOpen(false);
    onDelete(event);
  };

  const handleCreateEvent = (pressEvent: GestureResponderEvent) => {
    pressEvent.stopPropagation();
    setActionsOpen(false);
    onCreateEvent(event);
  };

  const handleEventPress = () => {
    if (Platform.OS === "web") {
      setActionsOpen((current) => !current);
    }
  };

  return (
    <View style={[styles.eventRowShell, !isLast && styles.rowDivider]} {...panResponder.panHandlers}>
      {actionsOpen && (
        <View style={styles.eventActions}>
          <Pressable style={[styles.eventActionButton, styles.eventActionDelete]} onPress={handleDelete}>
            <Text style={styles.eventActionIcon}>⌫</Text>
          </Pressable>
          <Pressable style={[styles.eventActionButton, styles.eventActionAlarm]} onPress={handleCreateEvent}>
            <Text style={styles.eventActionIcon}>◷</Text>
          </Pressable>
        </View>
      )}
      <Pressable style={[styles.eventRow, actionsOpen && styles.eventRowShifted]} onPress={handleEventPress}>
        <View style={[styles.eventColorBar, { backgroundColor: event.color ?? colors.accent }]} />
        <View style={styles.eventCopy}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventDetail} numberOfLines={2}>
            {event.description || event.notes || event.tag || event.location || "Chronos timeline item"}
          </Text>
        </View>
        <Text style={styles.eventTime}>{formatEventRange(event)}</Text>
      </Pressable>
    </View>
  );
}

function TimelineCalendarView({
  selectedDate,
  selectedEvents,
  onMonthChange,
}: {
  selectedDate: string;
  selectedEvents: CalendarEvent[];
  onMonthChange: (delta: number) => void;
}) {
  const positionedEvents = selectedEvents.map(positionTimelineEvent);
  return (
    <GlassCard style={styles.timelineShell}>
      <View style={styles.timelineHeader}>
        <Text style={styles.timelineTitle}>{selectedDateLabel(selectedDate)}</Text>
        <View style={styles.timelineControls}>
          <Pressable onPress={() => onMonthChange(-1)}>
            <Text style={styles.timelineControlText}>‹</Text>
          </Pressable>
          <Pressable onPress={() => onMonthChange(1)}>
            <Text style={styles.timelineControlText}>›</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.timelineCanvas}>
        {["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM"].map((hour, index) => (
          <View key={hour} style={[styles.timelineHour, { top: index * 78 }]}>
            <Text style={styles.timelineHourText}>{hour}</Text>
            <View style={styles.timelineLine} />
          </View>
        ))}
        <View style={styles.currentTimeRow}>
          <Text style={styles.currentTimeText}>11:15</Text>
          <View style={styles.currentTimeLine} />
        </View>
        {positionedEvents.map((event) => (
          <View
            key={event.id}
            style={[styles.timelineEvent, { top: event.top, height: event.height, borderLeftColor: event.color ?? colors.accent }]}
          >
            <View style={styles.timelineEventHeader}>
              <Text style={styles.timelineEventTitle}>{event.title}</Text>
              <Text style={styles.timelineEventTime}>{event.time}</Text>
            </View>
            <Text style={styles.timelineEventDetail} numberOfLines={1}>
            {event.detail}
            </Text>
          </View>
        ))}
        {positionedEvents.length === 0 && (
          <View style={styles.timelineEmpty}>
            <Text style={styles.emptyEventsText}>No events on this day</Text>
          </View>
        )}
      </View>
    </GlassCard>
  );
}

*/
function AlarmsView({
  alarms,
  isLoading,
  error,
  onAdd,
  onEdit,
  onDelete,
  activeAlarmId,
  onChat,
  fontLoaded,
}: {
  alarms: Alarm[];
  isLoading: boolean;
  error: string | null;
  onAdd: (origin: AnimationOrigin) => void;
  onEdit: (alarm: Alarm) => void;
  onDelete: (alarm: Alarm) => void;
  activeAlarmId: string | null;
  onChat: (alarm: Alarm) => void;
  fontLoaded: boolean;
}) {
  return (
    <>
      <View style={styles.screenHeader}>
            <Text style={[styles.screenTitle, styles.alarmScreenTitle, fontLoaded && styles.kalmanskText]}>Alarms</Text>
        <Pressable
          accessibilityLabel="Add alarm"
          style={({ pressed }) => [styles.addButton, pressed && styles.iconButtonPressed]}
          onPress={(event) => {
            void unlockUiSounds().then(() => playUiSound("progress-step"));
            const target = event.currentTarget as unknown as HTMLElement;
            const rect = target?.getBoundingClientRect?.();
            if (rect) {
              onAdd({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            } else {
              onAdd({ x: 345, y: 325 });
            }
          }}
        >
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.alarmList}>
        {isLoading && (
          <View style={[styles.alarmCard, styles.alarmMessageRow]}>
            <Text style={styles.alarmMessageText}>Loading alarms...</Text>
          </View>
        )}
        {!isLoading && !error && alarms.length === 0 && (
          <View style={[styles.alarmCard, styles.alarmMessageRow]}>
            <Text style={styles.alarmMessageText}>No alarms</Text>
          </View>
        )}
        {alarms.map((alarm, index) => (
          <View key={alarm.id} style={styles.alarmCard}>
            <AlarmRow
              alarm={alarm}
              chatActive={activeAlarmId === alarm.id}
              isLast={index === alarms.length - 1}
              onEdit={() => onEdit(alarm)}
              onDelete={() => onDelete(alarm)}
              onChat={() => onChat(alarm)}
            />
          </View>
        ))}
      </View>
    </>
  );
}

function AlarmRow({
  alarm,
  chatActive,
  isLast,
  onEdit,
  onDelete,
  onChat,
}: {
  alarm: Alarm;
  chatActive: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChat: () => void;
}) {
  const displayTime = formatAlarmTime(alarm.activationTime);

  return (
    <View style={styles.alarmRow}>
      <View style={styles.alarmCopy}>
        <View style={styles.alarmTimeLine}>
          <Text style={styles.alarmTime}>{displayTime.time}</Text>
          <Text style={styles.alarmPeriod}>{displayTime.period}</Text>
        </View>
        <View style={styles.alarmLabelLine}>
          <Text style={styles.alarmLabel}>{alarm.title}</Text>
        </View>
      </View>
      <View style={styles.alarmActions}>
        <AlarmIconButton
          label={`Delete ${alarm.title}`}
          icon={(color) => <Text style={{ color, fontSize: 24, lineHeight: 24, fontWeight: "700" }}>×</Text>}
          onPress={() => {
            void unlockUiSounds().then(() => playUiSound("skip-previous"));
            onDelete();
          }}
        />
        <AlarmIconButton
          label={`Edit ${alarm.title}`}
          icon={(color) => <Pencil color={color} size={18} strokeWidth={2} />}
          onPress={() => {
            void unlockUiSounds().then(() => playUiSound("progress-step"));
            onEdit();
          }}
        />
        <AlarmIconButton
          label={`Enter chat for ${alarm.title}`}
          icon={(color) => <Mic color={color} size={19} strokeWidth={2} />}
          active={chatActive}
          onPress={onChat}
        />
      </View>
    </View>
  );
}

function AlarmIconButton({
  label,
  icon,
  active = false,
  onPress,
}: {
  label: string;
  icon: (color: string) => ReactNode;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.alarmActionButton,
        active && styles.alarmActionButtonActive,
        pressed && styles.iconButtonPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.alarmActionIcon}>{icon(active ? "#ffffff" : colors.textMuted)}</View>
    </Pressable>
  );
}

type FloatingInputProps = ComponentProps<typeof TextInput> & {
  label: string;
};

function FloatingInput({ label, value, style, onFocus, onBlur, ...props }: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || String(value ?? "").length > 0;
  const groupRef = useRef<View>(null);
  const labelRef = useRef<Text>(null);
  const inputRef = useRef<TextInput>(null);

  useGSAP(() => {
    if (Platform.OS !== "web" || !labelRef.current) return;
    gsap.to(labelRef.current, {
      y: lifted ? -25 : 0,
      scale: lifted ? 0.82 : 1,
      color: lifted ? colors.textMuted : "rgb(100, 100, 100)",
      backgroundColor: lifted ? colors.background : "transparent",
      duration: 0.32,
      ease: "power3.out",
      transformOrigin: "left center",
    });
    if (inputRef.current) {
      gsap.to(inputRef.current, {
        borderColor: focused ? "rgb(150, 150, 200)" : "rgb(200, 200, 200)",
        duration: 0.28,
        ease: "power2.out",
      });
    }
  }, { scope: groupRef, dependencies: [lifted, focused], revertOnUpdate: false });

  return (
    <View ref={groupRef} style={styles.floatingInputGroup}>
      <TextInput
        {...props}
        ref={inputRef}
        value={value}
        style={[styles.alarmEditPageInput, style, focused && styles.alarmEditPageInputFocused]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      <Text
        ref={labelRef}
        style={[styles.floatingInputLabel, Platform.OS !== "web" && lifted && styles.floatingInputLabelLifted]}
      >
        {label}
      </Text>
    </View>
  );
}

function AlarmEditPage({
  alarm,
  apiBaseUrl,
  onCloseComplete,
  onSaved,
  animationOrigin,
}: {
  alarm: Alarm | null;
  apiBaseUrl: string;
  onCloseComplete: () => void;
  onSaved: () => Promise<void>;
  animationOrigin: AnimationOrigin | null;
}) {
  const pageRef = useRef<View>(null);
  const [isClosing, setIsClosing] = useState(false);
  const origin = animationOrigin ?? { x: 345, y: 325 };
  const circleOrigin = `${origin.x}px ${origin.y}px`;

  useGSAP(() => {
    if (Platform.OS !== "web" || !pageRef.current) return;
    gsap.fromTo(
      pageRef.current,
      { clipPath: `circle(0px at ${circleOrigin})` },
      { clipPath: `circle(150% at ${circleOrigin})`, duration: 0.72, ease: "power3.out" },
    );
  }, { scope: pageRef });

  const close = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (Platform.OS !== "web" || !pageRef.current) {
      onCloseComplete();
      return;
    }
    gsap.to(pageRef.current, {
      clipPath: `circle(0px at ${circleOrigin})`,
      duration: 0.48,
      ease: "power3.in",
      onComplete: onCloseComplete,
    });
  };

  const [activationTime, setActivationTime] = useState(alarm?.activationTime ?? "0800");
  const [title, setTitle] = useState(alarm?.title ?? "New Alarm");
  const [context, setContext] = useState(alarm?.context ?? "");
  const [goal, setGoal] = useState(alarm?.goal ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timeIsValid = isValidAlarmTime(activationTime);
  const canSave = timeIsValid && title.trim().length > 0 && !isSaving;

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);
    const input = {
      activationTime,
      title: title.trim(),
      context,
      goal,
    };
    try {
      if (alarm) {
        await updateAlarm(apiBaseUrl, alarm.id, input);
      } else {
        await createAlarm(apiBaseUrl, input);
      }
      await onSaved();
      playUiSound("success");
      close();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setIsSaving(false);
    }
  };

  return (
    <View ref={pageRef} style={styles.alarmEditPage}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.alarmEditSafeArea}>
        <View style={styles.alarmEditHeader}>
          <Pressable
            accessibilityLabel="Back to alarms"
            style={({ pressed }) => [styles.alarmEditBackButton, pressed && styles.iconButtonPressed]}
            onPress={() => {
              void unlockUiSounds().then(() => playUiSound("queued"));
              close();
            }}
          >
            <ArrowLeft color={colors.text} size={23} strokeWidth={2} />
          </Pressable>
          <Text style={styles.alarmEditTitle}>{alarm ? "Edit Alarm" : "New Alarm"}</Text>
          <View style={styles.alarmEditHeaderSpacer} />
        </View>
        <ScrollView
          style={styles.alarmEditScroll}
          contentContainerStyle={styles.alarmEditContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.alarmEditFieldGroup}>
            <FloatingInput
              label="Activation time"
              accessibilityLabel="Activation time"
              style={[styles.alarmEditPageInput, !timeIsValid && styles.alarmEditPageInputError]}
              value={activationTime}
              onChangeText={(value) => setActivationTime(value.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={[styles.alarmEditFieldHint, !timeIsValid && styles.alarmEditFieldHintError]}>
              {timeIsValid ? "24-hour hhmm format" : "Enter a valid four-digit time, for example 0630"}
            </Text>
          </View>

          <View style={styles.alarmEditFieldGroup}>
            <FloatingInput
              label="Title"
              accessibilityLabel="Alarm title"
              style={styles.alarmEditPageInput}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />
          </View>

          <View style={styles.alarmEditFieldGroup}>
            <FloatingInput
              label="Context"
              accessibilityLabel="Alarm context"
              style={[styles.alarmEditPageInput, styles.alarmEditPageTextArea]}
              value={context}
              onChangeText={setContext}
              maxLength={4000}
              multiline
            />
          </View>

          <View style={styles.alarmEditFieldGroup}>
            <FloatingInput
              label="Goal"
              accessibilityLabel="Alarm goal"
              style={[styles.alarmEditPageInput, styles.alarmEditPageTextArea]}
              value={goal}
              onChangeText={setGoal}
              maxLength={4000}
              multiline
            />
          </View>

          {!!saveError && <Text style={styles.alarmEditSaveError}>{saveError}</Text>}

          <Pressable
            accessibilityLabel="Save alarm"
            disabled={!canSave}
            style={({ pressed }) => [
              styles.alarmEditSaveButton,
              !canSave && styles.alarmEditSaveButtonDisabled,
              pressed && canSave && styles.iconButtonPressed,
            ]}
            onPress={save}
          >
            <Text style={styles.alarmEditSaveText}>{isSaving ? "Saving..." : "Save"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/*
function TasksView() {
  return (
    <>
      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.screenTitle}>Tasks</Text>
          <Text style={styles.screenSubtitle}>5 remaining today</Text>
        </View>
        <Pressable style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.chipRow}>
        <Chip label="All Tasks" active />
        <Chip label="Work" />
        <Chip label="Personal" />
      </View>
      <TaskSection title="Work" tasks={workTasks} />
      <TaskSection title="Personal" tasks={personalTasks} />
    </>
  );
}

function TaskSection({
  title,
  tasks,
}: {
  title: string;
  tasks: Array<{ title: string; time: string; done: boolean }>;
}) {
  return (
    <View style={styles.taskSection}>
      <Text style={styles.groupLabel}>{title}</Text>
      <GlassCard style={styles.listCard}>
        {tasks.map((task, index) => (
          <View key={task.title} style={[styles.taskRow, index !== tasks.length - 1 && styles.rowDivider]}>
            <View style={[styles.checkCircle, task.done && styles.checkCircleDone]}>
              {task.done && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]} numberOfLines={2}>
              {task.title}
            </Text>
            <Text style={styles.taskMeta}>{task.time}</Text>
          </View>
        ))}
      </GlassCard>
    </View>
  );
}

function Chip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function BottomNav({
  selectedTab,
  onSelect,
}: {
  selectedTab: TabKey;
  onSelect: (tab: TabKey) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const active = selectedTab === tab.key;
        return (
          <Pressable key={tab.key} style={styles.navItem} onPress={() => onSelect(tab.key)}>
            <Text style={[styles.navIcon, active && styles.navIconActive]}>{tab.icon}</Text>
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
*/

function SettingsDrawer({
  onCloseComplete,
  onProfilePress,
  fontLoaded,
}: {
  onCloseComplete: () => void;
  onProfilePress: () => void;
  fontLoaded: boolean;
}) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.86, 320);
  const layerRef = useRef<View>(null);
  const drawerRef = useRef<View>(null);
  const [isClosing, setIsClosing] = useState(false);

  useGSAP(() => {
    if (Platform.OS !== "web" || !drawerRef.current) return;
    gsap.fromTo(drawerRef.current, { xPercent: -108, skewX: -3 }, { xPercent: 0, skewX: 0, duration: 0.62, ease: "expo.out" });
    if (layerRef.current) gsap.fromTo(layerRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: "power2.out" });
  }, { scope: layerRef });

  const close = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (Platform.OS !== "web" || !drawerRef.current) {
      onCloseComplete();
      return;
    }
    const timeline = gsap.timeline({ onComplete: onCloseComplete });
    timeline.to(drawerRef.current, { xPercent: -108, skewX: -3, duration: 0.48, ease: "expo.in" });
    if (layerRef.current) timeline.to(layerRef.current, { autoAlpha: 0, duration: 0.26, ease: "power2.in" }, "<0.08");
  };

  return (
    <View ref={layerRef} style={styles.drawerLayer}>
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={close} />
      <SafeAreaView ref={drawerRef} style={[styles.drawer, { width: drawerWidth }]}>
        <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
          <View style={styles.drawerHeader}>
            <Text style={[styles.drawerTitle, fontLoaded && styles.kalmanskText]}>Settings</Text>
            <Pressable style={styles.closeButton} onPress={close}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.drawerDivider} />

          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>AR</Text>
            </View>
            <View style={styles.profileCopy}>
              <View style={styles.profileLine}>
                <Text style={styles.profileName}>Alex Rivers</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.profilePlan}>Personal Plan</Text>
            </View>
          </View>

          <View style={styles.drawerNav}>
            <DrawerNavItem icon="♙" label="Profile" active onPress={onProfilePress} />
            <DrawerNavItem icon="⚙" label="Preferences" />
            <DrawerNavItem icon="♢" label="Notification Settings" />
            <DrawerNavItem icon="◈" label="Privacy" />
          </View>

          <DrawerGroup title="Theme Configuration" fontLoaded={fontLoaded}>
            <SettingRow icon="◌" label="Color Palette" value="Minimal" />
            <SettingRow icon="☾" label="Dark Mode" accessory={<SwitchTrack enabled={false} compact />} showChevron={false} />
            <SettingRow icon="▣" label="Accent Color" accessory={<AccentSwatch />} />
          </DrawerGroup>

          <DrawerGroup title="Component Layout" fontLoaded={fontLoaded}>
            <SettingRow icon="▤" label="Adjust Navigation" />
            <SettingRow icon="□" label="Toolbar Position" value="Top" />
          </DrawerGroup>

          <Pressable style={styles.logoutRow}>
            <Text style={styles.logoutIcon}>↳</Text>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DrawerNavItem({ icon, label, active = false, onPress }: { icon: string; label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={[styles.drawerNavItem, active && styles.drawerNavItemActive]} onPress={onPress}>
      <Text style={[styles.drawerNavIcon, active && styles.drawerNavIconActive]}>{icon}</Text>
      <Text style={[styles.drawerNavText, active && styles.drawerNavTextActive]}>{label}</Text>
      <Text style={styles.drawerNavChevron}>›</Text>
    </Pressable>
  );
}

function BackgroundContextPage({
  value,
  onClose,
  onSaved,
}: {
  value: AnnotationContext;
  onClose: () => void;
  onSaved: (value: AnnotationContext) => void;
}) {
  const pageRef = useRef<View>(null);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useGSAP(() => {
    if (Platform.OS !== "web" || !pageRef.current) return;
    gsap.fromTo(pageRef.current, { clipPath: "circle(0% at 85% 8%)" }, { clipPath: "circle(150% at 85% 8%)", duration: 0.72, ease: "power3.out" });
  }, { scope: pageRef });

  const close = () => {
    if (Platform.OS !== "web" || !pageRef.current) return onClose();
    gsap.to(pageRef.current, { clipPath: "circle(0% at 85% 8%)", duration: 0.42, ease: "power3.in", onComplete: onClose });
  };

  const update = (key: keyof AnnotationContext, next: string) => setDraft((current) => ({ ...current, [key]: next }));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveAnnotationContext(draft);
      setSaved(true);
      playUiSound("success");
      setTimeout(() => onSaved(draft), 420);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View ref={pageRef} style={styles.contextPage}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.contextSafeArea}>
        <View style={styles.contextHeader}>
          <Pressable accessibilityLabel="Back to settings" style={styles.alarmEditBackButton} onPress={close}>
            <ArrowLeft color={colors.text} size={23} strokeWidth={2} />
          </Pressable>
          <Text style={styles.contextTitle}>Background context</Text>
          <View style={styles.alarmEditHeaderSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.contextContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.contextIntro}>批注对象会在新的通话开始时作为背景提示注入。闹钟的标题、目标和简要上下文仍由各个闹钟单独管理。</Text>
          <View style={styles.contextFieldGroup}><FloatingInput label="Current place or activity" value={draft.location} onChangeText={(text) => update("location", text)} maxLength={160} /></View>
          <View style={styles.contextFieldGroup}><FloatingInput label="Coach name" value={draft.coachName} onChangeText={(text) => update("coachName", text)} maxLength={80} /></View>
          <View style={styles.contextFieldGroup}>
            <Text style={styles.contextFieldLabel}>Conversation language</Text>
            <View style={styles.languagePicker}>
              {(["中文", "EN"] as const).map((language) => (
                <Pressable
                  key={language}
                  accessibilityRole="button"
                  accessibilityState={{ selected: draft.language === language }}
                  accessibilityLabel={`Conversation language ${language}`}
                  style={[styles.languageOption, draft.language === language && styles.languageOptionActive]}
                  onPress={() => update("language", language)}
                >
                  <Text style={[styles.languageOptionText, draft.language === language && styles.languageOptionTextActive]}>{language}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.contextFieldGroup}><FloatingInput label="Preferred tone" value={draft.tone} onChangeText={(text) => update("tone", text)} maxLength={160} /></View>
          <View style={styles.contextFieldGroup}><FloatingInput label="Personal notes" value={draft.personalNotes} onChangeText={(text) => update("personalNotes", text)} maxLength={1200} multiline style={styles.alarmEditPageTextArea} /></View>
          <Pressable accessibilityLabel="Save background context" style={[styles.contextSaveButton, saved && styles.contextSaveButtonDone]} onPress={save} disabled={saving}>
            <Text style={styles.contextSaveText}>{saved ? "Saved" : saving ? "Saving…" : "Save context"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DrawerGroup({ title, children, fontLoaded }: PropsWithChildren<{ title: string; fontLoaded: boolean }>) {
  return (
    <View style={styles.drawerGroup}>
      <Text style={[styles.drawerGroupTitle, fontLoaded && styles.kalmanskText]}>{title}</Text>
      <View style={styles.drawerGroupBody}>{children}</View>
    </View>
  );
}

/*
function CreateEventPage({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [dateValue, setDateValue] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime);
  const [endTime, setEndTime] = useState(event.endTime);
  const [notes, setNotes] = useState(event.description || event.notes || "由闹钟入口创建");
  const [purpose, setPurpose] = useState("");

  return (
    <View style={styles.createEventPage}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.createEventSafeArea}>
        <View style={styles.createEventHeader}>
          <Text style={styles.createEventTitle}>创建闹钟</Text>
          <Pressable style={styles.createEventCloseButton} onPress={onClose} hitSlop={12}>
            <Text style={styles.createEventCloseText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.createEventBody}>
          <GlassCard style={styles.createEventField} cornerRadius={10}>
            <Text style={styles.createEventLabel}>标题</Text>
            <TextInput
              style={styles.createEventInput}
              value={title}
              onChangeText={setTitle}
              placeholder="输入闹钟标题"
              placeholderTextColor={colors.textSoft}
            />
          </GlassCard>
          <GlassCard style={styles.createEventField} cornerRadius={10}>
            <Text style={styles.createEventLabel}>日期</Text>
            <TextInput
              style={styles.createEventInput}
              value={dateValue}
              onChangeText={setDateValue}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSoft}
            />
          </GlassCard>
          <GlassCard style={styles.createEventField} cornerRadius={10}>
            <Text style={styles.createEventLabel}>时间</Text>
            <View style={styles.createEventTimeRow}>
              <TextInput
                style={[styles.createEventInput, styles.createEventTimeInput]}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="HH:MM"
                placeholderTextColor={colors.textSoft}
              />
              <Text style={styles.createEventTimeSeparator}>-</Text>
              <TextInput
                style={[styles.createEventInput, styles.createEventTimeInput]}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="HH:MM"
                placeholderTextColor={colors.textSoft}
              />
            </View>
          </GlassCard>
          <GlassCard style={styles.createEventField} cornerRadius={10}>
            <Text style={styles.createEventLabel}>备注</Text>
            <TextInput
              style={[styles.createEventInput, styles.createEventMultilineInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="输入备注"
              placeholderTextColor={colors.textSoft}
              multiline
            />
          </GlassCard>
          <GlassCard style={styles.createEventField} cornerRadius={10}>
            <Text style={styles.createEventLabel}>目的</Text>
            <TextInput
              style={styles.createEventInput}
              value={purpose}
              onChangeText={setPurpose}
              placeholder="输入创建目的"
              placeholderTextColor={colors.textSoft}
            />
          </GlassCard>
          <Pressable style={styles.createEventSubmitButton} onPress={onClose}>
            <Text style={styles.createEventSubmitText}>创建</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  value,
  accessory,
}: {
  icon: string;
  label: string;
  value?: string;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingTrailing}>
        {!!value && <Text style={styles.settingValue}>{value}</Text>}
        {accessory ?? <Text style={styles.settingChevron}>›</Text>}
      </View>
    </View>
  );
}

function AccentSwatch() {
  return (
    <View style={styles.swatchOuter}>
      <View style={styles.swatchInner} />
    </View>
  );
}

function SwitchTrack({ enabled, compact = false }: { enabled: boolean; compact?: boolean }) {
  const trackStyle = compact ? styles.switchTrackCompact : styles.switchTrack;
  const thumbStyle = compact ? styles.switchThumbCompact : styles.switchThumb;
  const thumbEnabledStyle = compact ? styles.switchThumbCompactEnabled : styles.switchThumbEnabled;

  return (
    <View style={[trackStyle, enabled ? styles.switchTrackOn : styles.switchTrackOff]}>
      <View style={[thumbStyle, enabled && thumbEnabledStyle]} />
    </View>
  );
}

function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function getApiBaseUrl() {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl ?? "http://127.0.0.1:8000";
}

function shortDbName(path: string) {
  return path.split(/[\\/]/).slice(-2).join("/");
}

}
*/
function getApiBaseUrl() {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl ?? "http://127.0.0.1:8000";
}

function SettingRow({ icon, label, value, accessory, showChevron = true }: { icon: string; label: string; value?: string; accessory?: ReactNode; showChevron?: boolean }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingTrailing}>
        {!!value && <Text style={styles.settingValue}>{value}</Text>}
        {accessory}
        {showChevron && <Text style={styles.settingChevron}>›</Text>}
      </View>
    </View>
  );
}

function AccentSwatch() {
  return <View style={styles.swatchOuter}><View style={styles.swatchInner} /></View>;
}

function SwitchTrack({ enabled, compact = false }: { enabled: boolean; compact?: boolean }) {
  const trackStyle = compact ? styles.switchTrackCompact : styles.switchTrack;
  const thumbStyle = compact ? styles.switchThumbCompact : styles.switchThumb;
  const thumbEnabledStyle = compact ? styles.switchThumbCompactEnabled : styles.switchThumbEnabled;
  return <View style={[trackStyle, enabled ? styles.switchTrackOn : styles.switchTrackOff]}><View style={[thumbStyle, enabled && thumbEnabledStyle]} /></View>;
}

function isValidAlarmTime(value: string) {
  if (!/^\d{4}$/.test(value)) return false;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2));
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function formatAlarmTime(value: string) {
  if (!isValidAlarmTime(value)) return { time: value, period: "" };
  const hours = Number(value.slice(0, 2));
  const minutes = value.slice(2);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return { time: `${displayHours}:${minutes}`, period };
}

/* Calendar-only formatting helpers retained in the archived block above. */
/*
function selectedDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function isValidAlarmTime(value: string) {
  if (!/^\d{4}$/.test(value)) return false;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2));
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function formatAlarmTime(value: string) {
  if (!isValidAlarmTime(value)) return { time: value, period: "" };
  const hours = Number(value.slice(0, 2));
  const minutes = value.slice(2);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return { time: `${displayHours}:${minutes}`, period };
}

function formatEventRange(event: CalendarEvent) {
  return event.startTime === event.endTime ? event.startTime : `${event.startTime} - ${event.endTime}`;
}

function positionTimelineEvent(event: CalendarEvent) {
  const start = minuteOfDay(event.startTime);
  const end = Math.max(minuteOfDay(event.endTime), start + 20);
  const visibleStart = 8 * 60;
  const visibleEnd = 21 * 60;
  const pxPerMinute = 78 / 120;
  const clampedStart = Math.min(Math.max(start, visibleStart), visibleEnd);
  const clampedEnd = Math.min(Math.max(end, clampedStart + 20), visibleEnd);
  return {
    id: event.id,
    title: event.title,
    time: formatEventRange(event),
    detail: event.description || event.tag || "Chronos timeline item",
    color: event.color,
    top: Math.round((clampedStart - visibleStart) * pxPerMinute),
    height: Math.max(42, Math.round((clampedEnd - clampedStart) * pxPerMinute)),
  };
}

function minuteOfDay(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function removeEventFromCalendar(calendar: CalendarMonth | null, eventId: string): CalendarMonth | null {
  if (!calendar) return calendar;
  return {
    ...calendar,
    events: calendar.events?.filter((event) => event.id !== eventId),
    weeks: calendar.weeks.map((week) =>
      week.map((day) => ({
        ...day,
        events: day.events.filter((event) => event.id !== eventId),
      })),
    ),
  };
}
*/

const styles = StyleSheet.create({
  webViewport: {
    width: Platform.OS === "web" ? 393 : "100%",
    height: Platform.OS === "web" ? 852 : "100%",
    maxWidth: Platform.OS === "web" ? 393 : undefined,
    maxHeight: Platform.OS === "web" ? 852 : undefined,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    position: "relative",
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    width: "100%",
    maxWidth: 1024,
    alignSelf: "center",
    minHeight: 72,
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
  },
  menuButton: {
    width: 34,
    height: 34,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  menuIcon: {
    color: colors.accentDark,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
  },
  brandTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#d7d8dd",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: {
    color: colors.accentDark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 1024,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 32,
  },
  monthCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  monthHeader: {
    minHeight: 82,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 16,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: 0,
  },
  monthSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  monthControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  roundIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 36,
    lineHeight: 36,
    fontWeight: "600",
  },
  calendarDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  weekdayRow: {
    flexDirection: "row",
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0,
  },
  dateGrid: {
    paddingHorizontal: 28,
    paddingBottom: 26,
  },
  dateRow: {
    height: 58,
    flexDirection: "row",
  },
  dateCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  dateBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  dateBubbleSelected: {
    backgroundColor: colors.accent,
  },
  dateBubbleToday: {
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  dateText: {
    color: "#000000",
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "400",
    letterSpacing: 0,
  },
  dateTextMuted: {
    color: "#aaa59c",
  },
  dateTextSelected: {
    color: colors.surface,
    fontSize: 21,
    lineHeight: 24,
    fontWeight: "600",
  },
  eventDotSpacer: {
    height: 8,
    marginTop: 3,
  },
  eventDots: {
    height: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginTop: 3,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSoft,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 14,
    marginLeft: 8,
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: 0,
  },
  listCard: {
    backgroundColor: "transparent",
  },
  alarmList: {
    width: "100%",
    gap: 18,
  },
  alarmCard: {
    width: "100%",
    minHeight: 112,
    borderRadius: 50,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
    shadowColor: "#bebebe",
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 20, height: 20 },
    elevation: 8,
    ...(Platform.OS === "web" ? { boxShadow: "20px 20px 60px #bebebe, -20px -20px 60px #ffffff" } : {}),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  eventRowShell: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  eventActions: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 116,
    flexDirection: "row",
    zIndex: 0,
  },
  eventActionButton: {
    width: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  eventActionDelete: {
    backgroundColor: colors.danger,
  },
  eventActionAlarm: {
    backgroundColor: colors.accent,
  },
  eventActionIcon: {
    color: colors.surface,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
  },
  eventRow: {
    minHeight: 88,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  eventRowShifted: {
    transform: [{ translateX: 116 }],
  },
  eventColorBar: {
    width: 4,
    height: 46,
    borderRadius: 2,
    marginRight: 14,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: 0,
  },
  eventDetail: {
    color: "#6f6f75",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "400",
    letterSpacing: 0,
  },
  eventTime: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "400",
    marginLeft: 12,
  },
  emptyEventsRow: {
    minHeight: 72,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  emptyEventsText: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 20,
  },
  timelineShell: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  timelineTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  timelineControls: {
    flexDirection: "row",
    gap: 10,
  },
  timelineControlText: {
    color: colors.textMuted,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "600",
  },
  timelineCanvas: {
    height: 548,
    position: "relative",
    overflow: "hidden",
  },
  timelineHour: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  timelineHourText: {
    width: 46,
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  timelineLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  currentTimeRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 154,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 2,
  },
  currentTimeText: {
    width: 46,
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.accent,
  },
  timelineEvent: {
    position: "absolute",
    left: 58,
    right: 0,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    borderRadius: 8,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  timelineEventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  timelineEventTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  timelineEventTime: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  timelineEventDetail: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  timelineEmpty: {
    position: "absolute",
    left: 58,
    right: 0,
    top: 170,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  screenHeader: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "400",
    letterSpacing: 0,
    zIndex: 10,
  },
  alarmScreenTitle: {
    color: colors.warningAccent,
    fontSize: 60,
    lineHeight: 68,
  },
  kalmanskText: {
    fontFamily: "Kalmansk",
  },
  screenSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 6,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: "rgba(121, 89, 0, 0.25)",
    shadowColor: "#795900",
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 4, height: 4 },
    elevation: 4,
    ...(Platform.OS === "web" ? { boxShadow: "inset 4px 4px 10px rgba(121, 89, 0, 0.45), inset -4px -4px 10px rgba(255, 239, 177, 0.75)" } : {}),
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
    marginTop: -2,
  },
  alarmRow: {
    minHeight: 112,
    paddingHorizontal: 22,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  alarmCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  alarmTimeLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 10,
  },
  alarmTime: {
    color: "#000000",
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "400",
  },
  alarmPeriod: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 25,
  },
  alarmLabelLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  alarmLabel: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "400",
  },
  alarmMessageRow: {
    minHeight: 112,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  alarmMessageText: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 20,
  },
  alarmErrorText: {
    color: "#555555",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  alarmErrorContent: {
    flex: 1,
    minHeight: 254,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  orangeErrorBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0e0e0",
    marginBottom: 18,
    shadowColor: "#bebebe",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 6, height: 6 },
    elevation: 3,
    ...(Platform.OS === "web" ? { boxShadow: "6px 6px 12px #bebebe, -6px -6px 12px #ffffff" } : {}),
  } as any,
  orangeErrorBadgeText: {
    color: colors.warningAccent,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
  },
  orangeErrorCopy: {
    alignItems: "center",
  },
  orangeErrorTitle: {
    color: "#303030",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    marginBottom: 6,
  },
  alarmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  alarmActionButton: {
    width: 54,
    height: 48,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0e0e0",
    borderWidth: 2,
    borderColor: "rgb(206, 206, 206)",
    shadowColor: "#bcbcbc",
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 4, height: 4 },
    elevation: 3,
    ...(Platform.OS === "web" ? { boxShadow: "inset 4px 4px 10px #bcbcbc, inset -4px -4px 10px #ffffff" } : {}),
  },
  alarmActionButtonActive: {
    backgroundColor: "#e0e0e0",
    borderColor: "rgb(150, 150, 200)",
    ...(Platform.OS === "web" ? { boxShadow: "inset 2px 2px 5px #bcbcbc, inset -2px -2px 5px #ffffff, 2px 2px 5px #bcbcbc, -2px -2px 5px #ffffff" } : {}),
  },
  alarmActionIcon: {
    color: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  alarmEditPage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 30,
  },
  contextPage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 35,
  },
  contextSafeArea: { flex: 1 },
  contextHeader: {
    minHeight: 78,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#faf9fe",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  contextTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: "700" },
  contextContent: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 40, gap: 18 },
  contextIntro: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginBottom: 4 },
  contextFieldGroup: { gap: 8 },
  contextFieldLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontWeight: "700", marginLeft: 4 },
  languagePicker: { minHeight: 56, borderRadius: 20, borderWidth: 2, borderColor: "rgb(200, 200, 200)", padding: 4, flexDirection: "row", gap: 4 },
  languageOption: { flex: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  languageOptionActive: { backgroundColor: colors.accent },
  languageOptionText: { color: colors.textMuted, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  languageOptionTextActive: { color: colors.surface },
  contextSaveButton: { minHeight: 56, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginTop: 6 },
  contextSaveButtonDone: { backgroundColor: "#4b8d68" },
  contextSaveText: { color: colors.surface, fontSize: 17, lineHeight: 22, fontWeight: "800" },
  alarmChatOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  backgroundChat: {
    opacity: 0,
  },
  alarmEditSafeArea: {
    flex: 1,
  },
  alarmEditHeader: {
    minHeight: 78,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#faf9fe",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  alarmEditBackButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  alarmEditTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
  },
  alarmEditHeaderSpacer: {
    width: 42,
    height: 42,
  },
  alarmEditScroll: {
    flex: 1,
  },
  alarmEditContent: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 40,
    gap: 22,
  },
  alarmEditFieldGroup: {
    gap: 8,
  },
  floatingInputGroup: {
    position: "relative",
    width: "100%",
  },
  alarmEditPageInput: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgb(200, 200, 200)",
    backgroundColor: "transparent",
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    zIndex: 1,
  },
  alarmEditPageInputFocused: {
    borderColor: "rgb(150, 150, 200)",
  },
  alarmEditPageInputError: {
    borderColor: colors.danger,
  },
  alarmEditPageTextArea: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  floatingInputLabel: {
    position: "absolute",
    left: 12,
    top: 16,
    paddingHorizontal: 6,
    color: "rgb(100, 100, 100)",
    fontSize: 16,
    lineHeight: 22,
    zIndex: 2,
    pointerEvents: "none",
  },
  floatingInputLabelLifted: {
    top: -9,
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: colors.background,
    color: colors.textMuted,
    fontWeight: "600",
  },
  alarmEditFieldHint: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  alarmEditFieldHintError: {
    color: colors.danger,
  },
  alarmEditSaveError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  alarmEditSaveButton: {
    minHeight: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  alarmEditSaveButtonDisabled: {
    backgroundColor: "#d7d8dd",
  },
  alarmEditSaveText: {
    color: "#ffffff",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  switchTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
  },
  switchTrackCompact: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
  },
  switchTrackOn: {
    backgroundColor: colors.accent,
  },
  switchTrackOff: {
    backgroundColor: "#dedde4",
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  switchThumbEnabled: {
    transform: [{ translateX: 20 }],
  },
  switchThumbCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  switchThumbCompactEnabled: {
    transform: [{ translateX: 18 }],
  },
  chipRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
  },
  chip: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d3c5ae",
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.surface,
  },
  taskSection: {
    marginBottom: 24,
  },
  groupLabel: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0,
    marginLeft: 16,
    marginBottom: 8,
  },
  taskRow: {
    minHeight: 66,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#d3c5ae",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  checkCircleDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkMark: {
    color: colors.surface,
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "700",
  },
  taskTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
  },
  taskTitleDone: {
    color: colors.textSoft,
    textDecorationLine: "line-through",
  },
  taskMeta: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 18,
    marginLeft: 12,
  },
  bottomNav: {
    minHeight: 62,
    paddingTop: 6,
    paddingHorizontal: 24,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(250,249,254,0.94)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  navItem: {
    width: 86,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  navIcon: {
    color: "#646464",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "600",
  },
  navIconActive: {
    color: colors.accentDark,
  },
  navLabel: {
    color: "#646464",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "500",
    marginTop: 2,
  },
  navLabelActive: {
    color: colors.accentDark,
    fontWeight: "700",
  },
  drawerLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  scrim: {
    backgroundColor: "rgba(26,27,31,0.18)",
  },
  drawer: {
    flex: 1,
    backgroundColor: colors.drawerSurface,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 6, height: 0 },
    elevation: 9,
  },
  drawerContent: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 42,
  },
  drawerHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: 0,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: colors.textMuted,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "400",
  },
  drawerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginBottom: 24,
  },
  profileCard: {
    minHeight: 88,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 28,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#d7d8dd",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  profileAvatarText: {
    color: colors.accentDark,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileName: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
  },
  proBadge: {
    borderRadius: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  proBadgeText: {
    color: colors.accentDark,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800",
  },
  profilePlan: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 21,
    marginTop: 2,
  },
  drawerNav: {
    gap: 8,
    marginBottom: 30,
  },
  drawerNavItem: {
    minHeight: 54,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
  },
  drawerNavItemActive: {
    backgroundColor: colors.surfaceMuted,
  },
  drawerNavIcon: {
    width: 36,
    color: colors.textMuted,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "600",
    marginRight: 0,
  },
  drawerNavIconActive: {
    color: colors.accentDark,
  },
  drawerNavText: {
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "400",
  },
  drawerNavTextActive: {
    color: colors.accentDark,
    fontWeight: "600",
  },
  drawerNavChevron: {
    width: 24,
    marginLeft: "auto",
    color: colors.textMuted,
    fontSize: 24,
    lineHeight: 28,
  },
  drawerGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: 24,
    marginBottom: 26,
  },
  drawerGroupTitle: {
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 12,
  },
  drawerGroupBody: {
    gap: 0,
  },
  settingRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
  },
  settingIcon: {
    width: 36,
    color: colors.textMuted,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600",
  },
  settingLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
  },
  settingTrailing: {
    width: 88,
    minWidth: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  settingValue: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 22,
  },
  settingChevron: {
    width: 24,
    color: colors.textMuted,
    fontSize: 28,
    lineHeight: 30,
  },
  swatchOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  segmentedControl: {
    minHeight: 72,
    borderRadius: 10,
    backgroundColor: colors.surfaceSoft,
    flexDirection: "row",
    padding: 3,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  segmentActive: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentIcon: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600",
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  createEventPage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 30,
  },
  createEventSafeArea: {
    flex: 1,
  },
  createEventHeader: {
    minHeight: 82,
    paddingHorizontal: 28,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSoft,
  },
  createEventTitle: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
  },
  createEventCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  createEventCloseText: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: "400",
    marginTop: -1,
  },
  createEventBody: {
    paddingHorizontal: 28,
    paddingTop: 28,
    gap: 14,
  },
  createEventField: {
    minHeight: 74,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
  },
  createEventLabel: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  createEventValue: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
  },
  createEventInput: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    padding: 0,
  },
  createEventTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  createEventTimeInput: {
    flex: 1,
  },
  createEventTimeSeparator: {
    color: colors.textSoft,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  createEventMultilineInput: {
    minHeight: 48,
    textAlignVertical: "top",
  },
  createEventSubmitButton: {
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  createEventSubmitText: {
    color: colors.surface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  voiceAssistantPage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 30,
  },
  voiceAssistantCloseButton: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  voiceAssistantCloseText: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: "400",
    marginTop: -1,
  },
  voiceAssistantStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  logoutRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  logoutIcon: {
    color: colors.danger,
    fontSize: 26,
    lineHeight: 30,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
  },
});
