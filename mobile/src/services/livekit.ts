import Constants from "expo-constants";

const isFrontendPreview = process.env.EXPO_PUBLIC_FRONTEND_PREVIEW !== "false";

export type LiveKitTokenRequest = {
  roomName: string;
  participantName: string;
  participantIdentity?: string;
  alarmId?: string;
  sessionContext?: {
    location?: string;
    coachName?: string;
    /** User-editable background context (alarm title/goal/brief context excluded). */
    annotation?: Record<string, unknown>;
    /** Descriptive alias accepted by the API; merged with annotation server-side. */
    backgroundContext?: Record<string, unknown>;
    // Legacy editor fields accepted by older chat screens.
    language?: string;
    tone?: string;
    personalNotes?: string;
    alarm?: { id: string; activationTime: string; title: string; context: string; goal: string };
  };
};

export type LiveKitTokenResponse = {
  server_url: string;
  participant_token: string;
};

export async function requestLiveKitToken(
  apiBaseUrl: string,
  request: LiveKitTokenRequest,
): Promise<LiveKitTokenResponse> {
  const endpoint = String(
    Constants.expoConfig?.extra?.livekitTokenEndpoint ?? `${apiBaseUrl.replace(/\/$/, "")}/livekit/token`,
  );

  const body: Record<string, unknown> = {
    room_name: request.roomName,
    participant_name: request.participantName,
    participant_identity:
      request.participantIdentity ??
      request.participantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
  };
  if (request.alarmId && !isFrontendPreview) {
    body.alarm_id = request.alarmId;
  }
  const hasBackgroundContext = Boolean(
    request.sessionContext?.annotation || request.sessionContext?.backgroundContext ||
      request.sessionContext?.language || request.sessionContext?.tone || request.sessionContext?.personalNotes ||
      request.sessionContext?.alarm,
  );
  if (request.sessionContext && (!request.alarmId || isFrontendPreview || hasBackgroundContext)) {
    const sessionContext: Record<string, unknown> = {};
    if (request.sessionContext.location) sessionContext.location = request.sessionContext.location;
    if (request.sessionContext.coachName) sessionContext.coach_name = request.sessionContext.coachName;
    const annotation: Record<string, unknown> = { ...(request.sessionContext.annotation ?? {}) };
    for (const key of ["language", "tone", "personalNotes"] as const) {
      const value = request.sessionContext[key];
      if (value) annotation[key] = value;
    }
    if (Object.keys(annotation).length) sessionContext.annotation = annotation;
    if (request.sessionContext.backgroundContext) {
      sessionContext.background_context = request.sessionContext.backgroundContext;
    }
    if (request.sessionContext.alarm) {
      sessionContext.alarm_id = request.sessionContext.alarm.id;
      sessionContext.alarm = request.sessionContext.alarm;
    }
    body.session_context = sessionContext;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail ? `: ${payload.detail}` : "";
    } catch {
      // Preserve the HTTP status when the response is not JSON.
    }
    throw new Error(`LiveKit token endpoint returned ${response.status}${detail}`);
  }

  return (await response.json()) as LiveKitTokenResponse;
}
