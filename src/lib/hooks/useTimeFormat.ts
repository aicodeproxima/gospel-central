'use client';

import { useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { formatClock, type Clock } from '@/lib/utils/date';

type DateInput = Date | string | number;

const toDate = (d: DateInput): Date => (typeof d === 'string' ? parseISO(d) : new Date(d));

/**
 * Clock-aware time formatting bound to the user's 12h/24h preference
 * (Settings ▸ Calendar ▸ Time format). Every user-facing booking/calendar time
 * should go through this hook so the preference actually takes effect — before
 * this, the toggle persisted but nothing read it.
 *
 *  - `time(d)`     → a single clock time:  "1:30 pm" / "13:30"
 *  - `hm(h, m)`    → from raw hour/minute (slot grids): "1:30 pm" / "13:30"
 *  - `range(a, b)` → "1:30 pm – 2:30 pm" / "13:30 – 14:30"
 *  - `withDate(d, pattern)` → "Thu, Jun 19 · 1:30 pm" (date pattern + clock time)
 */
export function useTimeFormat() {
  const timeFormat = usePreferencesStore((s) => s.timeFormat);
  const clock: Clock = timeFormat === '24h' ? '24h' : '12h';
  const is24 = clock === '24h';

  const time = useCallback(
    (d: DateInput) => {
      const date = toDate(d);
      return is24 ? format(date, 'HH:mm') : format(date, 'h:mm a').toLowerCase();
    },
    [is24],
  );

  const hm = useCallback((hour: number, minute = 0) => formatClock(hour, minute, clock), [clock]);

  const range = useCallback(
    (start: DateInput, end: DateInput) => `${time(start)} – ${time(end)}`,
    [time],
  );

  const withDate = useCallback(
    (d: DateInput, datePattern: string, sep = ' · ') => {
      const date = toDate(d);
      return `${format(date, datePattern)}${sep}${time(date)}`;
    },
    [time],
  );

  return { clock, is24, time, hm, range, withDate };
}
