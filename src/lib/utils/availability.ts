import type { BlockedSlot, Booking } from '../types';
import { formatHour12 } from './date';

/**
 * Compute 30-minute time slots for a given day and mark which are occupied
 * by existing bookings in a specific room.
 *
 * Phase 2 (BLOCK-1, CAL-2): now accepts optional `blockedSlots` (service
 * times that no role can override) and `teacherBookings` (other rooms'
 * bookings for the same teacher) so the wizard's time-picker can grey out
 * slots that violate either constraint.
 */
export interface TimeSlot {
  label: string;
  hour: number;
  minute: number;
  start: Date;
  end: Date; // start + 30 min
  occupied: boolean;
  occupiedBy?: string;
  /** Set when the slot is blocked by a `BlockedSlot` window (service time, etc.) */
  blockedReason?: string;
  /** Set when the slot is occupied because the chosen teacher is busy
   *  in another room/booking at that time. */
  teacherBusy?: boolean;
}

export interface GetDaySlotsOptions {
  startHour?: number;
  endHour?: number;
  blockedSlots?: BlockedSlot[];
  /** Optional area id for area-scoped blocked-slot resolution. */
  areaId?: string;
  /** Optional teacher id; if set, the slot is also marked occupied when
   *  this teacher has another booking overlapping (any room). */
  teacherId?: string;
  /** Optional list of all bookings (any room) to evaluate teacher
   *  conflicts against. Defaults to the same `bookings` arg. */
  teacherBookings?: Booking[];
}

/**
 * Returns the BlockedSlot record covering [slotStart, slotEnd) in the given
 * area, or undefined if no block applies. Pure function — exported for use
 * by handler-side conflict checks (BLOCK-2/BE-2 enforcement).
 */
export function findOverlappingBlockedSlot(
  slotStart: Date,
  slotEnd: Date,
  areaId: string | undefined,
  blockedSlots: BlockedSlot[],
): BlockedSlot | undefined {
  for (const slot of blockedSlots) {
    if (slot.isActive === false) continue;
    if (slot.scope === 'area' && slot.areaId !== areaId) continue;

    if (slot.recurrence === 'weekly') {
      if (slot.dayOfWeek !== slotStart.getDay()) continue;
      if (!slot.startTime || !slot.endTime) continue;
      const [bsh, bsm] = slot.startTime.split(':').map(Number);
      const [beh, bem] = slot.endTime.split(':').map(Number);
      const bsMin = bsh * 60 + bsm;
      const beMin = beh * 60 + bem;
      const ssMin = slotStart.getHours() * 60 + slotStart.getMinutes();
      const seMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();
      if (bsMin < seMin && beMin > ssMin) return slot;
    } else if (slot.recurrence === 'one-off') {
      if (!slot.startDateTime || !slot.endDateTime) continue;
      const bs = new Date(slot.startDateTime).getTime();
      const be = new Date(slot.endDateTime).getTime();
      if (bs < slotEnd.getTime() && be > slotStart.getTime()) return slot;
    }
  }
  return undefined;
}

export function getDaySlots(
  date: Date,
  roomId: string,
  bookings: Booking[],
  startHourOrOptions?: number | GetDaySlotsOptions,
  legacyEndHour?: number,
): TimeSlot[] {
  // Backwards-compat: callers historically passed (startHour, endHour) as
  // positional args. New callers pass an options object.
  const opts: GetDaySlotsOptions =
    typeof startHourOrOptions === 'object' && startHourOrOptions !== null
      ? startHourOrOptions
      : {
          startHour: typeof startHourOrOptions === 'number' ? startHourOrOptions : undefined,
          endHour: legacyEndHour,
        };
  const startHour = opts.startHour ?? 8;
  const endHour = opts.endHour ?? 24;
  const blockedSlots = opts.blockedSlots ?? [];
  const teacherBookings = opts.teacherBookings ?? bookings;

  const slots: TimeSlot[] = [];
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Same-room bookings
  const dayBookings = bookings.filter((b) => {
    if (b.roomId !== roomId) return false;
    const bs = new Date(b.startTime);
    return bs >= dayStart && bs < dayEnd;
  });

  // Teacher's bookings that day (any room) — used to detect cross-room
  // double-bookings of the same teacher.
  const teacherDayBookings = opts.teacherId
    ? teacherBookings.filter((b) => {
        if (b.teacherId !== opts.teacherId) return false;
        const bs = new Date(b.startTime);
        return bs >= dayStart && bs < dayEnd;
      })
    : [];

  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      const slotStart = new Date(date);
      slotStart.setHours(h, m, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + 30);

      const sameRoom = dayBookings.find((b) => {
        const bs = new Date(b.startTime).getTime();
        const be = new Date(b.endTime).getTime();
        return bs < slotEnd.getTime() && be > slotStart.getTime();
      });

      const blocked = findOverlappingBlockedSlot(
        slotStart,
        slotEnd,
        opts.areaId,
        blockedSlots,
      );

      const teacherBusy = opts.teacherId
        ? teacherDayBookings.find((b) => {
            const bs = new Date(b.startTime).getTime();
            const be = new Date(b.endTime).getTime();
            return bs < slotEnd.getTime() && be > slotStart.getTime();
          })
        : undefined;

      slots.push({
        label: formatHour12(h, m),
        hour: h,
        minute: m,
        start: slotStart,
        end: slotEnd,
        occupied: !!sameRoom || !!blocked || !!teacherBusy,
        occupiedBy: sameRoom?.title ?? (teacherBusy ? `Teacher busy: ${teacherBusy.title}` : undefined),
        blockedReason: blocked?.reason,
        teacherBusy: !!teacherBusy,
      });
    }
  }

  return slots;
}

/**
 * Returns true if the room has any free slot on the given day.
 */
export function roomHasAvailability(date: Date, roomId: string, bookings: Booking[]): boolean {
  return getDaySlots(date, roomId, bookings).some((s) => !s.occupied);
}

/**
 * Count of free slots on the day for summary display.
 */
export function roomFreeSlotCount(date: Date, roomId: string, bookings: Booking[]): number {
  return getDaySlots(date, roomId, bookings).filter((s) => !s.occupied).length;
}

/**
 * Given a start slot, find which consecutive slots are free for a duration.
 * Used to grey out slots that can't fit a multi-slot booking.
 */
export function canFitDuration(
  startIndex: number,
  slots: TimeSlot[],
  durationMinutes: number,
): boolean {
  const slotsNeeded = Math.ceil(durationMinutes / 30);
  for (let i = 0; i < slotsNeeded; i++) {
    const slot = slots[startIndex + i];
    if (!slot || slot.occupied) return false;
  }
  return true;
}
