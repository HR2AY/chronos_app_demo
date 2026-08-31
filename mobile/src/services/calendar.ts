export type CalendarEvent = {
  id: string;
  topicId?: string | null;
  title: string;
  description?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  tag?: string | null;
  completionScore?: number | null;
  importance?: number | null;
  links?: Array<{ id: string; title: string; url: string }>;
  starts_at?: string;
  ends_at?: string;
  notes?: string | null;
  location?: string | null;
  color?: string | null;
};

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
};

export type CalendarMonth = {
  year: number;
  month: number;
  monthLabel: string;
  weeks: CalendarDay[][];
  events?: CalendarEvent[];
  tags?: Array<{ id: string; name: string; event_count: number; updated_at: string }>;
  dbPath?: string;
  errors?: Array<{ code: string; message: string; id?: string }>;
};

type MonthCalendarResponse = CalendarMonth;

export async function fetchMonthCalendar(apiBaseUrl: string, year: number, month: number): Promise<CalendarMonth> {
  const endpoint = new URL("/calendar/month", apiBaseUrl);
  endpoint.searchParams.set("year", String(year));
  endpoint.searchParams.set("month", String(month));

  try {
    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      throw new Error(`calendar request failed: ${response.status}`);
    }
    return (await response.json()) as MonthCalendarResponse;
  } catch {
    return buildFallbackCalendar(year, month);
  }
}

export async function deleteCalendarEvent(apiBaseUrl: string, eventId: string): Promise<void> {
  const endpoint = new URL("/api/events", apiBaseUrl);
  endpoint.searchParams.set("id", eventId);

  const response = await fetch(endpoint.toString(), { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`delete event request failed: ${response.status}`);
  }
}

export const CalendarRepository = {
  fetchMonthCalendar,
  deleteCalendarEvent,
};

function buildFallbackCalendar(year: number, month: number): CalendarMonth {
  const start = new Date(year, month - 1, 1);
  const today = new Date();
  const firstWeekday = start.getDay();
  const cursor = new Date(year, month - 1, 1 - firstWeekday);
  const weeks: CalendarDay[][] = [];
  const sampleEvents = sampleEventsForMonth(year, month);

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week: CalendarDay[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = new Date(cursor);
      const key = toDateKey(date);
      week.push({
        date: key,
        inMonth: date.getMonth() === month - 1,
        isToday: sameDate(date, today),
        events: sampleEvents[key] ?? [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return {
    year,
    month,
    monthLabel: formatMonthLabel(year, month),
    weeks,
  };
}

function sampleEventsForMonth(year: number, month: number) {
  const events: Record<string, CalendarEvent[]> = {};
  const base = new Date(year, month - 1, 1);

  for (let offset = 2; offset <= 8; offset += 3) {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    const key = toDateKey(date);
    events[key] = [
      {
        id: String(offset),
        title: offset === 2 ? "Design review" : "AlarmKit prep",
        date: key,
        startTime: "09:00",
        endTime: "09:30",
        starts_at: `${key}T09:00:00`,
        ends_at: `${key}T09:30:00`,
      },
    ];
  }

  return events;
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
