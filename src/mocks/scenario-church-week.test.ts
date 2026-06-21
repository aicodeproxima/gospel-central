import { describe, it, expect } from 'vitest';
import { mockBookings, mockBlockedSlots } from './data';
import { findOverlappingBlockedSlot } from '@/lib/utils/availability';

/**
 * Seed invariants for the church-week scenario. There was NO test pinning these
 * before (3AgentScan, 2026-06-21), so a future edit could silently place a study
 * on a blocked Sabbath slot (it would just vanish via tryAddBooking's guard),
 * double-book a room, drift off the current week, or leave a weekday empty. These
 * assert the contract the live handler + Mike's backend mirror.
 */

/** Mirror of scenario-church-week's weekStart(): this week's Monday (local). */
function weekStart(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

describe('scenario-church-week seed invariants', () => {
  const active = mockBookings.filter((b) => b.status !== 'cancelled');

  it('no booking overlaps an active blocked (Sabbath service) slot', () => {
    for (const b of mockBookings) {
      const hit = findOverlappingBlockedSlot(
        new Date(b.startTime),
        new Date(b.endTime),
        b.areaId,
        mockBlockedSlots,
      );
      expect(hit, `"${b.title}" overlaps blocked slot "${hit?.reason}"`).toBeUndefined();
    }
  });

  it('no two active bookings double-book the same room', () => {
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (active[i].roomId !== active[j].roomId) continue;
        const aS = +new Date(active[i].startTime);
        const aE = +new Date(active[i].endTime);
        const bS = +new Date(active[j].startTime);
        const bE = +new Date(active[j].endTime);
        const overlap = aS < bE && bS < aE;
        expect(
          overlap,
          `"${active[i].title}" and "${active[j].title}" clash in room ${active[i].roomId}`,
        ).toBe(false);
      }
    }
  });

  it('every booking falls within the current Mon–Sun week', () => {
    const ws = weekStart().getTime();
    const we = ws + 7 * 86_400_000;
    for (const b of mockBookings) {
      const t = new Date(b.startTime).getTime();
      expect(t, `"${b.title}" (${b.startTime}) is before this week`).toBeGreaterThanOrEqual(ws);
      expect(t, `"${b.title}" (${b.startTime}) is after this week`).toBeLessThan(we);
    }
  });

  it('every weekday has a booking — the calendar is never empty on "today"', () => {
    const weekdays = new Set(mockBookings.map((b) => new Date(b.startTime).getDay()));
    for (let d = 0; d <= 6; d++) {
      expect(weekdays.has(d), `no booking on weekday ${d} (0=Sun … 6=Sat)`).toBe(true);
    }
  });
});
