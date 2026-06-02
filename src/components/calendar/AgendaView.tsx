'use client';

import { useMemo } from 'react';
import { Clock, MapPin, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  format,
  parseISO,
  formatTimeRange,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from '@/lib/utils/date';
import { BOOKING_TYPE_CONFIG, BookingStatus } from '@/lib/types';
import type { Booking, Room } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';

interface AgendaViewProps {
  date: Date;
  view: 'day' | 'week' | 'month';
  rooms: Room[];
  bookings: Booking[];
  onBookingClick: (booking: Booking) => void;
  onCreate?: () => void;
}

/**
 * Mobile-first chronological list of bookings, grouped by day. Replaces the
 * room-column grid on small screens (the grid's fixed min-width and absolute
 * time positioning are unreadable at ~412px and hide which room each booking
 * belongs to). Every row states the room name explicitly. Scoped to the active
 * day/week/month range (the mock /api/bookings ignores start/end and a real
 * backend can over-return, so filter client-side — same as the grid views).
 */
export function AgendaView({ date, view, rooms, bookings, onBookingClick, onCreate }: AgendaViewProps) {
  const { tBookingType } = useTranslation();

  const roomName = useMemo(() => {
    const map = new Map(rooms.map((r) => [r.id, r.name]));
    return (id: string) => map.get(id) ?? 'Unknown room';
  }, [rooms]);

  const groups = useMemo(() => {
    const rangeStart =
      view === 'day' ? startOfDay(date)
        : view === 'week' ? startOfWeek(date, { weekStartsOn: 1 })
          : startOfMonth(date);
    const rangeEnd =
      view === 'day' ? endOfDay(date)
        : view === 'week' ? endOfWeek(date, { weekStartsOn: 1 })
          : endOfMonth(date);
    const startMs = rangeStart.getTime();
    const endMs = rangeEnd.getTime();

    const byDay = new Map<string, Booking[]>();
    for (const b of bookings) {
      const t = parseISO(b.startTime).getTime();
      if (t < startMs || t > endMs) continue;
      const key = format(parseISO(b.startTime), 'yyyy-MM-dd');
      const arr = byDay.get(key);
      if (arr) arr.push(b);
      else byDay.set(key, [b]);
    }
    return [...byDay.entries()]
      .sort(([a], [c]) => a.localeCompare(c))
      .map(([key, items]) => ({
        key,
        date: parseISO(`${key}T00:00:00`),
        items: items.sort((x, y) => x.startTime.localeCompare(y.startTime)),
      }));
  }, [bookings, date, view]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 py-16 text-center">
        <p className="text-sm text-muted-foreground">No bookings in this period.</p>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground active:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New booking
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="sticky top-0 z-10 mb-2 bg-background/95 py-1 backdrop-blur">
            <h3 className="text-sm font-semibold">
              {format(g.date, 'EEEE')}
              <span className="ml-2 font-normal text-muted-foreground">{format(g.date, 'MMM d')}</span>
            </h3>
          </div>

          <ul className="space-y-2">
            {g.items.map((b) => {
              const cfg = BOOKING_TYPE_CONFIG[b.type];
              const cancelled = b.status === BookingStatus.CANCELLED;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onBookingClick(b)}
                    className={cn(
                      'flex min-h-[44px] w-full items-stretch gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors active:bg-accent',
                      cancelled && 'opacity-60',
                    )}
                  >
                    <span className={cn('w-1.5 shrink-0 rounded-full', cfg?.bgColor)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('min-w-0 flex-1 truncate font-medium', cancelled && 'line-through')}>
                          {b.title}
                        </p>
                        <span
                          className={cn(
                            'shrink-0 rounded-full border px-2 py-0.5 text-[10px]',
                            cfg?.bgColor,
                            cfg?.color,
                          )}
                        >
                          {tBookingType(b.type)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" /> {formatTimeRange(b.startTime, b.endTime)}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{roomName(b.roomId)}</span>
                        </span>
                      </div>
                    </div>
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
