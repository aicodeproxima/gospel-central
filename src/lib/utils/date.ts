import {
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO,
} from 'date-fns';

export {
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO,
};

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

/** Matches the preferences-store TimeFormat; kept local so this pure util never
 *  imports the React store. */
export type Clock = '12h' | '24h';

/**
 * Format an hour-of-day (+ optional minute) for the given clock.
 *  12h → "12:00 am", "1:00 pm", "11:30 pm"
 *  24h → "00:00", "13:00", "23:30"
 */
export function formatClock(hour: number, minute = 0, clock: Clock = '12h'): string {
  if (clock === '24h') {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${h}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

/**
 * 12-hour formatter (back-compat thin wrapper over formatClock). Prefer the
 * clock-aware `useTimeFormat()` hook in UI; this stays for callers that always
 * want 12h regardless of preference.
 */
export function formatHour12(hour: number, minute = 0): string {
  return formatClock(hour, minute, '12h');
}

export interface GridSlot {
  /** Raw 24h key, e.g. "08:00" — stable identifier */
  key: string;
  /** 12-hour display label, e.g. "8:00 am" */
  label: string;
  hour: number;
  minute: number;
  isHalfHour: boolean;
}

export function getTimeSlots(startHour = 8, endHour = 23, clock: Clock = '12h'): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (const m of [0, 30]) {
      slots.push({
        key: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
        label: formatClock(h, m, clock),
        hour: h,
        minute: m,
        isHalfHour: m === 30,
      });
    }
  }
  return slots;
}

export function formatTimeRange(start: string, end: string, clock: Clock = '12h'): string {
  const pattern = clock === '24h' ? 'HH:mm' : 'h:mm aaa';
  return `${format(parseISO(start), pattern)} - ${format(parseISO(end), pattern)}`;
}

export function getBookingPosition(startTime: string, endTime: string, dayStart = 7) {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
  const startMinutes = start.getHours() * 60 + start.getMinutes() - dayStart * 60;
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  return { top: startMinutes, height: durationMinutes };
}
