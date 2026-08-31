export type Alarm = {
  id: string;
  activationTime: string;
  title: string;
  context: string;
  goal: string;
};

export type AlarmInput = Omit<Alarm, "id">;

export async function fetchAlarms(apiBaseUrl: string): Promise<Alarm[]> {
  const response = await fetch(new URL("/api/alarms", apiBaseUrl).toString());
  if (!response.ok) {
    throw new Error(`alarm request failed: ${response.status}`);
  }
  const payload = (await response.json()) as { alarms: Alarm[] };
  return payload.alarms;
}

export async function createAlarm(apiBaseUrl: string, alarm: AlarmInput): Promise<Alarm> {
  const response = await fetch(new URL("/api/alarms", apiBaseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alarm),
  });
  return readAlarmResponse(response, "create");
}

export async function updateAlarm(apiBaseUrl: string, alarmId: string, alarm: AlarmInput): Promise<Alarm> {
  const response = await fetch(new URL(`/api/alarms/${encodeURIComponent(alarmId)}`, apiBaseUrl).toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alarm),
  });
  return readAlarmResponse(response, "update");
}

export async function deleteAlarm(apiBaseUrl: string, alarmId: string): Promise<void> {
  const response = await fetch(new URL(`/api/alarms/${encodeURIComponent(alarmId)}`, apiBaseUrl).toString(), { method: "DELETE" });
  if (!response.ok) throw new Error(`alarm delete failed: ${response.status}`);
}

export const AlarmRepository = {
  fetchAlarms,
  createAlarm,
  updateAlarm,
  deleteAlarm,
};

async function readAlarmResponse(response: Response, action: string): Promise<Alarm> {
  if (!response.ok) {
    let message = `alarm ${action} failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Preserve the status-based error when the response is not JSON.
    }
    throw new Error(message);
  }
  const payload = (await response.json()) as { alarm: Alarm };
  return payload.alarm;
}
