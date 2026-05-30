'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { BOOKING_TYPE_CONFIG } from '@/lib/types';
import type { Booking, Room } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Mobile (<md) calendar view: a chronological agenda/list of the bookings in
 * the loaded range (day / week / month), grouped by day and sorted by time.
 * Replaces the multi-room time grid on phones, which is unreadable at 412px.
 * Reuses the same booking data + BOOKING_TYPE_CONFIG; tapping a row opens the
 * existing edit modal. The grid (DayView/WeekView/MonthView) stays for ≥md.
 */
interface AgendaViewProps {
  bookings: Booking[];
  rooms: Room[];
  onBookingClick: (booking: Booking) => void;
}

export function AgendaView({ bookings, rooms, onBookingClick }: AgendaViewProps) {
  const { tBookingType } = useTranslation();

  const roomName = useMemo(() => {
    const m = new Map<string, string>();
    rooms.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [rooms]);

  // Group by calendar day (sorted by start time within each day).
  const groups = useMemo(() => {
    const sorted = [...bookings].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    const byDay = new Map<string, Booking[]>();
    for (const b of sorted) {
      const key = format(new Date(b.startTime), 'yyyy-MM-dd');
      const arr = byDay.get(key);
      if (arr) arr.push(b);
      else byDay.set(key, [b]);
    }
    return Array.from(byDay.entries()).map(([key, items]) => ({
      key,
      date: new Date(items[0].startTime),
      items,
    }));
  }, [bookings]);

  if (bookings.length === 0) {
    return (
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
        <div className="text-base font-semibold">No bookings</div>
        <p className="text-sm text-muted-foreground">
          Nothing scheduled for this period. Tap “Book” to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="sticky top-0 z-10 -mx-1 mb-2 bg-background/95 px-1 py-1 text-sm font-semibold backdrop-blur">
            {format(group.date, 'EEEE, MMM d')}
          </h3>
          <ul className="space-y-2">
            {group.items.map((b) => {
              const config = BOOKING_TYPE_CONFIG[b.type];
              const cancelled = b.status === 'cancelled';
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onBookingClick(b)}
                    style={{ minHeight: 64 }}
                    className={cn(
                      'flex w-full touch-manipulation items-stretch gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors active:bg-accent',
                      cancelled && 'opacity-60',
                    )}
                  >
                    {/* type color bar */}
                    <span
                      className={cn('w-1.5 shrink-0 rounded-full', config?.bgColor)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm font-semibold text-foreground',
                            cancelled && 'line-through',
                          )}
                        >
                          {b.title}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {format(new Date(b.startTime), 'h:mm')}–
                          {format(new Date(b.endTime), 'h:mm a')}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="truncate">{roomName.get(b.roomId) ?? '—'}</span>
                        <span aria-hidden="true">•</span>
                        <span className={cn('truncate', config?.color)}>
                          {tBookingType(b.type)}
                        </span>
                        {cancelled && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span className="text-destructive">Cancelled</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
