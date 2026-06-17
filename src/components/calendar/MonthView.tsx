'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { BOOKING_TYPE_CONFIG } from '@/lib/types';
import type { Booking } from '@/lib/types';

interface MonthViewProps {
  date: Date;
  bookings: Booking[];
  onDayClick: (date: Date) => void;
  onBookingClick: (booking: Booking) => void;
}

export function MonthView({ date, bookings, onDayClick, onBookingClick }: MonthViewProps) {
  const today = new Date();

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [date]);

  const getBookingsForDay = (day: Date) =>
    bookings.filter((b) => isSameDay(parseISO(b.startTime), day));

  // MOBILE: the 7-col month grid already divides the container width evenly so
  // it never causes PAGE overflow at any width. Below xl we just make the cells
  // shorter and the type fluid so a 6-row month fits a phone screen without a
  // ton of vertical scroll, while day cells stay ≥40px tall and tappable.
  // Event chips truncate (single line) and we show fewer of them on phones.
  // Desktop ≥xl is byte-identical (min-h-[100px], p-1.5, h-7 circle, 3 chips).
  return (
    <div data-calendar-surface="grid" className="rounded-lg border border-border bg-card overflow-hidden md:overflow-auto md:overscroll-contain md:flex-1 md:min-h-[360px]">
      {/* Day headers — abbreviate to a single letter on the narrowest phones so
           the 7 labels never wrap or clip. */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground max-md:p-1">
            <span className="max-[400px]:hidden">{d}</span>
            <span className="hidden max-[400px]:inline" aria-hidden="true">{d[0]}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day) => {
          const dayBookings = getBookingsForDay(day);
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, date);
          // Phones get less vertical room, so cap visible chips lower there.
          const chipLimitDesktop = 3;

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[100px] cursor-pointer border-b border-r border-border/50 p-1.5 transition-colors hover:bg-accent/30',
                // max-* overrides: shorter cells + tighter padding below xl/md.
                // min-h stays ≥40px so each day remains an easy tap target.
                'touch-manipulation max-xl:min-h-[76px] max-md:min-h-[48px] max-md:p-1',
                !isCurrentMonth && 'opacity-40'
              )}
              onClick={() => onDayClick(day)}
            >
              <div className={cn(
                'mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm max-md:mb-0.5 max-md:h-6 max-md:w-6 max-md:text-xs',
                isToday && 'bg-primary text-primary-foreground font-bold'
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayBookings.slice(0, chipLimitDesktop).map((booking, i) => {
                  const config = BOOKING_TYPE_CONFIG[booking.type];
                  return (
                    <button
                      key={booking.id}
                      onClick={(e) => { e.stopPropagation(); onBookingClick(booking); }}
                      className={cn(
                        'w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium border touch-manipulation max-md:px-1 max-md:text-[9px] max-md:leading-tight',
                        // On the narrowest phones only the first chip is shown to
                        // keep the month compact; the "+N more" line covers the rest.
                        i > 0 && 'max-[400px]:hidden',
                        config.bgColor, config.color
                      )}
                    >
                      {format(parseISO(booking.startTime), 'h:mm a').toLowerCase()} {booking.title}
                    </button>
                  );
                })}
                {/* "+N more" for >400px: 3 chips shown, so the overflow is
                    length-3. Hidden on the narrowest phones where only 1 chip
                    shows (its own count line below handles that case). */}
                {dayBookings.length > chipLimitDesktop && (
                  <div className="text-[10px] text-muted-foreground pl-1 max-[400px]:hidden">
                    +{dayBookings.length - chipLimitDesktop} more
                  </div>
                )}
                {/* "+N more" for ≤400px: only the first chip shows there, so the
                    overflow is length-1. CSS-gated so the count is always correct
                    for the width actually rendering. */}
                {dayBookings.length > 1 && (
                  <div className="hidden text-[9px] text-muted-foreground pl-1 max-[400px]:block">
                    +{dayBookings.length - 1} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
