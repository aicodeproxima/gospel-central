/**
 * TEST-3: pure-function tests for the blocked-slot overlap helper. The
 * MSW handler in src/mocks/handlers.ts mirrors this same logic for its
 * 409 conflict check (see findBookingBlockedConflict there) — keep both
 * in sync if behavior changes.
 */

import { describe, expect, test } from 'vitest';
import { findOverlappingBlockedSlot } from './availability';
import type { BlockedSlot } from '../types';

function weeklySlot(
  id: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  scope: 'global' | 'area' = 'global',
  areaId?: string,
): BlockedSlot {
  return {
    id,
    scope,
    areaId,
    recurrence: 'weekly',
    dayOfWeek,
    startTime,
    endTime,
    reason: `Test ${id}`,
    createdBy: 'u-test',
    createdAt: '2026-01-01T00:00:00Z',
    isActive: true,
  };
}

function oneOffSlot(
  id: string,
  startISO: string,
  endISO: string,
  scope: 'global' | 'area' = 'global',
  areaId?: string,
): BlockedSlot {
  return {
    id,
    scope,
    areaId,
    recurrence: 'one-off',
    startDateTime: startISO,
    endDateTime: endISO,
    reason: `Test ${id}`,
    createdBy: 'u-test',
    createdAt: '2026-01-01T00:00:00Z',
    isActive: true,
  };
}

// Pick a known weekday so dayOfWeek calculations are deterministic.
// 2026-05-09 is a Saturday (dayOfWeek === 6).
const SATURDAY = new Date('2026-05-09T00:00:00');
// 2026-05-12 is a Tuesday (dayOfWeek === 2).
const TUESDAY = new Date('2026-05-12T00:00:00');

describe('findOverlappingBlockedSlot — weekly slots', () => {
  // Sabbath morning service Saturday 09:00–10:00 (matrix-seeded slot).
  const sat9am = weeklySlot('bs-sab-am', 6, '09:00', '10:00');
  // Tuesday service 20:00–21:00.
  const tue8pm = weeklySlot('bs-tue', 2, '20:00', '21:00');
  const slots = [sat9am, tue8pm];

  test('Saturday 09:00–10:00 overlaps Sabbath morning service', () => {
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, slots)?.id).toBe('bs-sab-am');
  });

  test('Saturday 11:00–12:00 is clear', () => {
    const start = new Date(SATURDAY); start.setHours(11, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(12, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, slots)).toBeUndefined();
  });

  test('Tuesday 20:00–21:00 overlaps Tuesday service', () => {
    const start = new Date(TUESDAY); start.setHours(20, 0, 0, 0);
    const end = new Date(TUESDAY); end.setHours(21, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, slots)?.id).toBe('bs-tue');
  });

  test('Saturday 08:30–09:30 partially overlaps the start of the service', () => {
    const start = new Date(SATURDAY); start.setHours(8, 30, 0, 0);
    const end = new Date(SATURDAY); end.setHours(9, 30, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, slots)?.id).toBe('bs-sab-am');
  });

  test('Saturday 09:30–10:30 partially overlaps the end of the service', () => {
    const start = new Date(SATURDAY); start.setHours(9, 30, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 30, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, slots)?.id).toBe('bs-sab-am');
  });

  test('Saturday 10:00–11:00 (touching end exactly) does NOT overlap', () => {
    // [9:00, 10:00) blocked window — a slot starting AT 10:00 is fine.
    const start = new Date(SATURDAY); start.setHours(10, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(11, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, slots)).toBeUndefined();
  });

  test('inactive slots are ignored', () => {
    const inactive = { ...sat9am, isActive: false };
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, [inactive])).toBeUndefined();
  });
});

describe('findOverlappingBlockedSlot — area scoping', () => {
  const globalSat = weeklySlot('bs-global', 6, '09:00', '10:00', 'global');
  const branchA = weeklySlot('bs-area-A', 6, '09:00', '10:00', 'area', 'area-A');
  const branchB = weeklySlot('bs-area-B', 6, '09:00', '10:00', 'area', 'area-B');
  const slots = [globalSat, branchA, branchB];

  test('global slot blocks every area', () => {
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, 'area-A', [globalSat])?.id).toBe('bs-global');
    expect(findOverlappingBlockedSlot(start, end, 'area-B', [globalSat])?.id).toBe('bs-global');
    expect(findOverlappingBlockedSlot(start, end, undefined, [globalSat])?.id).toBe('bs-global');
  });

  test('area-scoped slot only blocks its own area', () => {
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    // area-A booking hits area-A slot
    expect(findOverlappingBlockedSlot(start, end, 'area-A', [branchA])?.id).toBe('bs-area-A');
    // area-B booking ignores the area-A slot
    expect(findOverlappingBlockedSlot(start, end, 'area-B', [branchA])).toBeUndefined();
  });

  test('returns the first matching slot when multiple overlap', () => {
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    const found = findOverlappingBlockedSlot(start, end, 'area-A', slots);
    // Either global or area-A would match — the helper returns the first
    // it finds; assertion is just that something blocks.
    expect(found).toBeDefined();
    expect(['bs-global', 'bs-area-A']).toContain(found?.id);
  });
});

describe('findOverlappingBlockedSlot — one-off slots', () => {
  // Christmas Day all-day blackout (one-off, global).
  const xmas = oneOffSlot(
    'bs-xmas',
    '2026-12-25T00:00:00',
    '2026-12-26T00:00:00',
  );

  test('booking on Christmas hits the one-off block', () => {
    const start = new Date('2026-12-25T14:00:00');
    const end = new Date('2026-12-25T15:00:00');
    expect(findOverlappingBlockedSlot(start, end, undefined, [xmas])?.id).toBe('bs-xmas');
  });

  test('booking on the day after Christmas does not', () => {
    const start = new Date('2026-12-26T10:00:00');
    const end = new Date('2026-12-26T11:00:00');
    expect(findOverlappingBlockedSlot(start, end, undefined, [xmas])).toBeUndefined();
  });
});

describe('findOverlappingBlockedSlot — empty / malformed', () => {
  test('empty blockedSlots array returns undefined', () => {
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, [])).toBeUndefined();
  });

  test('weekly slot missing startTime/endTime is skipped', () => {
    const broken: BlockedSlot = {
      id: 'broken',
      scope: 'global',
      recurrence: 'weekly',
      dayOfWeek: 6,
      reason: 'broken',
      createdBy: 'u-test',
      createdAt: '2026-01-01T00:00:00Z',
      isActive: true,
    };
    const start = new Date(SATURDAY); start.setHours(9, 0, 0, 0);
    const end = new Date(SATURDAY); end.setHours(10, 0, 0, 0);
    expect(findOverlappingBlockedSlot(start, end, undefined, [broken])).toBeUndefined();
  });
});

/**
 * Phase 4 self-conflict fix: when editing a booking, its OWN time window
 * must not mark slots occupied — neither via the same-room check nor via
 * the teacher-busy check. (The old behavior made a teacher-only edit fail
 * with "time isn't available" because the booking collided with itself.)
 */
import { getDaySlots } from './availability';
import { BookingType, type Booking } from '../types/booking';

const mkBooking = (over: Partial<Booking>): Booking =>
  ({
    id: 'b-self',
    roomId: 'room-1',
    areaId: 'area-1',
    type: BookingType.UNBAPTIZED_CONTACT,
    title: 'Study: Self',
    startTime: '2026-05-12T10:00:00',
    endTime: '2026-05-12T11:00:00',
    createdBy: 'u-1',
    teacherId: 'teacher-1',
    participants: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Booking;

describe('getDaySlots excludeBookingId (Phase 4 self-conflict fix)', () => {
  const day = new Date('2026-05-12T00:00:00');
  const own = mkBooking({});

  test('edit-same-slot: own window occupies WITHOUT exclude, frees WITH it', () => {
    const before = getDaySlots(day, 'room-1', [own]);
    const at10 = before.find((s) => s.hour === 10 && s.minute === 0)!;
    expect(at10.occupied).toBe(true);

    const after = getDaySlots(day, 'room-1', [own], { excludeBookingId: 'b-self' });
    expect(after.find((s) => s.hour === 10 && s.minute === 0)!.occupied).toBe(false);
    expect(after.find((s) => s.hour === 10 && s.minute === 30)!.occupied).toBe(false);
  });

  test('teacher-swap: own window does not mark the incoming teacher busy, other bookings still do', () => {
    // The edited booking sits in room-1 at 10:00; the NEW teacher also has a
    // REAL other booking at 14:00 in another room, which must stay busy.
    const otherBusy = mkBooking({
      id: 'b-other',
      roomId: 'room-9',
      teacherId: 'teacher-2',
      startTime: '2026-05-12T14:00:00',
      endTime: '2026-05-12T15:00:00',
    });
    const editedNowTeacher2 = mkBooking({ teacherId: 'teacher-2' });
    const slots = getDaySlots(day, 'room-1', [editedNowTeacher2, otherBusy], {
      teacherId: 'teacher-2',
      teacherBookings: [editedNowTeacher2, otherBusy],
      excludeBookingId: 'b-self',
    });
    // Own 10:00 window: free (no self-conflict on the teacher axis either).
    expect(slots.find((s) => s.hour === 10 && s.minute === 0)!.occupied).toBe(false);
    // The teacher's genuinely-other booking at 14:00 still blocks.
    const at14 = slots.find((s) => s.hour === 14 && s.minute === 0)!;
    expect(at14.occupied).toBe(true);
    expect(at14.teacherBusy).toBe(true);
  });

  test('exclude of a non-matching id changes nothing', () => {
    const slots = getDaySlots(day, 'room-1', [own], { excludeBookingId: 'b-unrelated' });
    expect(slots.find((s) => s.hour === 10 && s.minute === 0)!.occupied).toBe(true);
  });
});

describe('getDaySlots ignores soft-cancelled bookings (ultracode-gate F5)', () => {
  const day = new Date('2026-05-12T00:00:00');

  test('a cancelled booking frees its room slot AND its teacher', () => {
    const cancelled = mkBooking({ id: 'b-cxl', status: 'cancelled' } as Partial<Booking>);
    const roomSlots = getDaySlots(day, 'room-1', [cancelled]);
    expect(roomSlots.find((s) => s.hour === 10 && s.minute === 0)!.occupied).toBe(false);

    const teacherSlots = getDaySlots(day, 'room-other', [cancelled], {
      teacherId: 'teacher-1',
      teacherBookings: [cancelled],
    });
    expect(teacherSlots.find((s) => s.hour === 10 && s.minute === 0)!.occupied).toBe(false);
  });
});
