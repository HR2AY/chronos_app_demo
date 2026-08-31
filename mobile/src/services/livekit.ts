import Constants from "expo-constants";

export type LiveKitTokenRequest = {
  roomName: string;
  participantName: string;
  participantIdentity?: string;
  alarmId?: string;
  sessionContext?: {
    location: string;
    coachName: string;
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
  if (request.alarmId) {
    body.alarm_id = request.alarmId;
  } else if (request.sessionContext) {
    body.session_context = {
      location: request.sessionContext.location,
      coach_name: request.sessionContext.coachName,
    };
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
