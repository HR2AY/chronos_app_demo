import { StyleSheet, Text, View } from "react-native";
import type { CalendarDay, CalendarMonth } from "../services/calendar";

type MonthCalendarProps = {
  calendar: CalendarMonth | null;
  fallbackYear: number;
  fallbackMonth: number;
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export function MonthCalendar({ calendar, fallbackYear, fallbackMonth }: MonthCalendarProps) {
  const view = calendar ?? null;
  const weeks = view?.weeks ?? buildEmptyWeeks(fallbackYear, fallbackMonth);

  return (
    <View>
      <View style={styles.weekHeader}>
        {weekdayLabels.map((label) => (
          <View key={label} style={styles.weekHeaderCell}>
            <Text style={styles.weekHeaderText}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {weeks.map((week, weekIndex) => (
          <View key={`${weekIndex}-${week[0].date}`} style={styles.weekRow}>
            {week.map((day) => (
              <DayCell key={day.date} day={day} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function DayCell({ day }: { day: CalendarDay }) {
  return (
    <View style={[styles.dayCell, !day.inMonth && styles.dayCellMuted, day.isToday && styles.dayCellToday]}>
      <Text style={[styles.dayNumber, !day.inMonth && styles.dayNumberMuted]}>{day.date.slice(-2)}</Text>
      <View style={styles.eventList}>
        {day.events.slice(0, 2).map((event) => (
          <Text key={event.id} numberOfLines={1} style={styles.eventText}>
            {event.title}
          </Text>
        ))}
        {day.events.length > 2 && <Text style={styles.moreText}>+{day.events.length - 2}</Text>}
      </View>
    </View>
  );
}

function buildEmptyWeeks(year: number, month: number): CalendarDay[][] {
  const firstDay = new Date(year, month - 1, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const weeks: CalendarDay[][] = [];
  let cursor = new Date(start);

  while (weeks.length < 6) {
    const week: CalendarDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(cursor);
      week.push({
        date: toDateKey(date),
        inMonth: date.getMonth() === month - 1,
        isToday: isSameDate(date, new Date()),
        events: [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    const lastDay = week[6];
    if (!lastDay.inMonth && cursor.getMonth() !== month - 1) {
      break;
    }
  }

  return weeks;
}

function isSameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  weekHeader: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  weekHeaderText: {
    fontSize: 11,
    color: "#657488",
    fontWeight: "600",
  },
  grid: {
    gap: 6,
  },
  weekRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayCell: {
    flex: 1,
    minHeight: 88,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d9e1ec",
    padding: 8,
  },
  dayCellMuted: {
    backgroundColor: "#eef3f8",
    opacity: 0.72,
  },
  dayCellToday: {
    borderColor: "#102033",
    backgroundColor: "#eef4ff",
  },
  dayNumber: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#102033",
    marginBottom: 6,
  },
  dayNumberMuted: {
    color: "#7a8797",
  },
  eventList: {
    gap: 4,
  },
  eventText: {
    fontSize: 11,
    lineHeight: 14,
    color: "#334155",
  },
  moreText: {
    fontSize: 11,
    lineHeight: 14,
    color: "#607087",
  },
});
