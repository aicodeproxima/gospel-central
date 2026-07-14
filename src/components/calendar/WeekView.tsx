'use client';

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWeekDays, getTimeSlots, format, isSameDay, parseISO } from '@/lib/utils/date';
import { now as clockNow } from '@/mocks/mock-clock';
import { useTimeFormat } from '@/lib/hooks/useTimeFormat';
import { BookingCard } from './BookingCard';
import type { Booking, Room } from '@/lib/types';
import type { User } from '@/lib/types/user';
import type { Contact } from '@/lib/types/contact';

interface WeekViewProps {
  date: Date;
  rooms: Room[];
  bookings: Booking[];
  onSlotClick: (roomId: string, date: Date, time24: string) => void;
  onBookingClick: (booking: Booking) => void;
  userById: Map<string, User>;
  contactById: Map<string, Contact>;
}

const START_HOUR = 8;
const END_HOUR = 23;
const SLOT_HEIGHT = 48;

export function WeekView({ date, rooms, bookings, onSlotClick, onBookingClick, userById, contactById }: WeekViewProps) {
  const days = useMemo(() => getWeekDays(date), [date]);
  const { clock } = useTimeFormat();
  const timeSlots = useMemo(() => getTimeSlots(START_HOUR, END_HOUR, clock), [clock]);
  const today = new Date();

  const getBookingsForDayRoom = (day: Date, roomId: string) =>
    bookings.filter((b) => isSameDay(parseISO(b.startTime), day) && b.roomId === roomId);

  const getBookingPosition = (booking: Booking) => {
    const start = parseISO(booking.startTime);
    const end = parseISO(booking.endTime);
    const startMin = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
    const duration = (end.getTime() - start.getTime()) / 60000;
    return {
      top: (startMin / 30) * SLOT_HEIGHT,
      height: (duration / 30) * SLOT_HEIGHT,
    };
  };

  // Check if a specific slot has a booking conflict for any room we'd default to
  const isSlotOccupied = (day: Date, roomId: string, hour: number, minute: number) => {
    return bookings.some((b) => {
      if (b.roomId !== roomId) return false;
      const bs = parseISO(b.startTime);
      if (!isSameDay(bs, day)) return false;
      const be = parseISO(b.endTime);
      const slotStart = new Date(day);
      slotStart.setHours(hour, minute, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
      return bs.getTime() < slotEnd.getTime() && be.getTime() > slotStart.getTime();
    });
  };

  // MOBILE APPROACH (week): keep all 7 day-columns and let them scroll
  // HORIZONTALLY *inside* this `overflow-auto` container rather than collapsing
  // to a single day. Rationale: the page-level swipe gesture already maps to
  // week±1 (see calendar/page.tsx), so a single-day phone view would make a
  // swipe jump 7 days — confusing. Keeping the 7 columns preserves week
  // semantics; the left time-axis and the top day-header are both sticky so
  // they stay anchored while the user scrolls the week sideways. The page body
  // itself never scrolls horizontally (overscroll-contain stops scroll-chain).
  // Desktop ≥xl is byte-identical (min-w-[800px], 80px time col, 1fr days);
  // below xl we drop the hard min and below md we shrink the time column and
  // give each day a tappable minmax width.
  return (
    <div
      data-calendar-surface="grid"
      className="max-w-full touch-manipulation overflow-auto overscroll-contain rounded-lg border border-border bg-card md:flex-1 md:min-h-[360px]"
    >
      {/* ONE grid owns the column tracks (same subgrid remedy as DayView: two
          sibling grids resolve `fr` tracks + subpixel rounding per-container,
          so identical templates can still stagger while the window scales;
          subgrid children inherit the SAME resolved tracks and cannot drift).
          Templates stay class-driven with the responsive `max-*` overrides;
          xl keeps the exact desktop template. */}
      <div className="grid min-w-[800px] max-xl:min-w-0 [grid-template-columns:80px_repeat(7,1fr)] max-xl:[grid-template-columns:64px_repeat(7,minmax(96px,1fr))] max-md:[grid-template-columns:48px_repeat(7,minmax(72px,1fr))]">
        {/* Header: Day columns — a subgrid row spanning every column. */}
        <div data-calendar-surface="header" className="sticky top-0 z-20 grid [grid-column:1/-1] [grid-template-columns:subgrid] border-b border-border bg-card">
          <div className="sticky left-0 z-10 border-r border-border bg-card p-2 text-xs font-medium text-muted-foreground">Time</div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                'border-r border-border p-2 text-center last:border-r-0 max-md:p-1',
                isSameDay(day, today) && 'bg-primary/5'
              )}
            >
              <div className="text-xs text-muted-foreground">{format(day, 'EEE')}</div>
              <div className={cn(
                'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                isSameDay(day, today) && 'bg-primary text-primary-foreground'
              )}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Time grid — a subgrid row inheriting the identical tracks, so
            columns line up with the header by construction. */}
        <div className="relative grid [grid-column:1/-1] [grid-template-columns:subgrid]">
          {/* Time labels — sticky-left so they stay put during horizontal scroll */}
          <div className="sticky left-0 z-10 border-r border-border bg-card">
            {timeSlots.map((slot) => (
              <div
                key={slot.key}
                className="flex h-12 items-start justify-end border-b border-border/50 pr-2 pt-0.5 text-xs text-muted-foreground max-md:pr-1"
              >
                {!slot.isHalfHour ? slot.label : ''}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                'relative border-r border-border last:border-r-0',
                isSameDay(day, today) && 'bg-primary/[0.02]'
              )}
            >
              {/* Slot cells — click to book with the first available room */}
              {timeSlots.map((slot) => {
                const targetRoom = rooms.find((r) => !isSlotOccupied(day, r.id, slot.hour, slot.minute)) || rooms[0];
                // Same past-slot retirement as DayView (remediation decision
                // 2026-07-13): fully-elapsed slots stop inviting clicks; the
                // wizard remains the deliberate retroactive-entry path.
                const slotEnd = new Date(day);
                slotEnd.setHours(slot.hour, slot.minute + 30, 0, 0);
                const past = slotEnd.getTime() <= clockNow().getTime();
                return (
                  <button
                    key={slot.key}
                    type="button"
                    disabled={past}
                    onClick={() => targetRoom && onSlotClick(targetRoom.id, day, slot.key)}
                    title={past ? 'This time has passed' : `Click to book ${slot.label}`}
                    className={cn(
                      'group relative block h-12 w-full border-b border-border/30 transition-colors',
                      !past && 'hover:bg-primary/10 cursor-pointer',
                      past && 'cursor-default bg-muted/20 opacity-50',
                    )}
                  >
                    {!past && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="rounded-full bg-primary text-primary-foreground p-1 shadow-lg">
                          <Plus className="h-3 w-3" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Bookings overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {rooms.map((room, ri) => {
                  const dayBookings = getBookingsForDayRoom(day, room.id);
                  const colWidth = 100 / rooms.length;
                  return dayBookings.map((booking) => {
                    const pos = getBookingPosition(booking);
                    return (
                      <div
                        key={booking.id}
                        className="pointer-events-auto"
                        style={{
                          position: 'absolute',
                          top: pos.top,
                          height: pos.height,
                          left: `${ri * colWidth}%`,
                          width: `${colWidth}%`,
                        }}
                      >
                        <BookingCard
                          booking={booking}
                          onClick={onBookingClick}
                          teacher={booking.teacherId ? userById.get(booking.teacherId) ?? null : null}
                          contact={booking.contactId ? contactById.get(booking.contactId) ?? null : null}
                        />
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
