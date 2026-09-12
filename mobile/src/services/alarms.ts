import AsyncStorage from "@react-native-async-storage/async-storage";

export type Alarm = { id: string; activationTime: string; title: string; context: string; goal: string };
export type AlarmInput = Omit<Alarm, "id">;

const defaultAlarms: Alarm[] = [
  { id: "preview-morning", activationTime: "0630", title: "Morning Routine", context: "", goal: "" },
  { id: "preview-commute", activationTime: "0700", title: "Commute Warning", context: "", goal: "" },
  { id: "preview-lunch", activationTime: "1215", title: "Lunch Sync", context: "", goal: "" },
  { id: "preview-wrap", activationTime: "1700", title: "Wrap Up", context: "", goal: "" },
];

const STORAGE_KEY = "chronos.alarms.v1";
let alarmStore: Alarm[] | null = null;
let loadPromise: Promise<Alarm[]> | null = null;

async function readStore(): Promise<Alarm[]> {
  if (alarmStore) return alarmStore.map((alarm) => ({ ...alarm }));
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        alarmStore = Array.isArray(parsed) ? parsed as Alarm[] : [...defaultAlarms];
      } catch {
        alarmStore = [...defaultAlarms];
      }
      return alarmStore.map((alarm) => ({ ...alarm }));
    }).finally(() => { loadPromise = null; });
  }
  return loadPromise;
}

async function writeStore(next: Alarm[]): Promise<void> {
  alarmStore = next.map((alarm) => ({ ...alarm }));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarmStore));
}

// apiBaseUrl remains in the signatures so existing screen call sites stay stable.
export async function fetchAlarms(_apiBaseUrl?: string): Promise<Alarm[]> { return readStore(); }

export async function createAlarm(_apiBaseUrl: string, alarm: AlarmInput): Promise<Alarm> {
  const created = { ...alarm, id: `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  await writeStore([...(await readStore()), created]);
  return created;
}

export async function updateAlarm(_apiBaseUrl: string, alarmId: string, alarm: AlarmInput): Promise<Alarm> {
  const current = await readStore();
  const updated = { ...alarm, id: alarmId };
  if (!current.some((item) => item.id === alarmId)) throw new Error("alarm not found");
  await writeStore(current.map((item) => item.id === alarmId ? updated : item));
  return updated;
}

export async function deleteAlarm(_apiBaseUrl: string, alarmId: string): Promise<void> {
  await writeStore((await readStore()).filter((item) => item.id !== alarmId));
}

export const AlarmRepository = { fetchAlarms, createAlarm, updateAlarm, deleteAlarm };
