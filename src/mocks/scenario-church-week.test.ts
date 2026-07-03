import { describe, it, expect } from 'vitest';
import { mockBookings, mockBlockedSlots, mockAreas, mockUsers, mockContacts } from './data';
import { findOverlappingBlockedSlot } from '@/lib/utils/availability';
import { PipelineStage, UserRole } from '@/lib/types';

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

/**
 * Phase 1 gate (2026-07 overhaul): the 2-church consolidation contract.
 * Pins the exact area set, that every user survived the reorg reachable from
 * the root, and that every one of the 6 contact statuses exists in BOTH
 * churches (the per-church pipeline demo depends on it — see CONTACT_STAGES).
 */
describe('Phase 1 — 2-church consolidation invariants', () => {
  it('exactly 2 areas: Newport News + Virginia Beach', () => {
    expect(mockAreas.map((a) => a.id).sort()).toEqual([
      'area-newport-news',
      'area-virginia-beach',
    ]);
  });

  it('all 132 users exist and every non-Dev is reachable from the root', () => {
    expect(mockUsers).toHaveLength(132);
    const byId = new Map(mockUsers.map((u) => [u.id, u]));
    for (const u of mockUsers) {
      if (u.role === UserRole.DEV) continue;
      // Walk parentId to a Dev; cycle-safe.
      const seen = new Set<string>();
      let cur = u;
      while (cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id);
        const parent = byId.get(cur.parentId);
        expect(parent, `${u.id}: dangling parentId ${cur.parentId}`).toBeDefined();
        cur = parent!;
      }
      expect(cur.role, `${u.id} does not chain up to a Dev root`).toBe(UserRole.DEV);
    }
  });

  it('every non-Dev/Overseer user resolves to one of the two churches', () => {
    for (const u of mockUsers) {
      if (u.role === UserRole.DEV || u.role === UserRole.OVERSEER) continue;
      expect(
        ['area-newport-news', 'area-virginia-beach'],
        `${u.id} has locationId ${u.locationId}`,
      ).toContain(u.locationId);
    }
  });

  it('the 3 ex-Branch-Leaders are Team Leaders at Virginia Beach (ids/logins kept)', () => {
    for (const id of ['u-branch-2', 'u-branch-3', 'u-branch-4']) {
      const u = mockUsers.find((x) => x.id === id)!;
      expect(u, `${id} missing`).toBeDefined();
      expect(u.role).toBe(UserRole.TEAM_LEADER);
      expect(u.locationId).toBe('area-virginia-beach');
    }
  });

  it('every contact status appears in BOTH churches', () => {
    const byId = new Map(mockUsers.map((u) => [u.id, u]));
    const churchOf = (teacherId?: string) => (teacherId ? byId.get(teacherId)?.locationId : undefined);
    const stages = Object.values(PipelineStage);
    for (const area of ['area-newport-news', 'area-virginia-beach']) {
      const areaContacts = mockContacts.filter((c) => churchOf(c.assignedTeacherId) === area);
      expect(areaContacts.length, `${area} has no contacts`).toBeGreaterThan(0);
      for (const stage of stages) {
        expect(
          areaContacts.some((c) => c.pipelineStage === stage),
          `${area} is missing a ${stage} contact`,
        ).toBe(true);
      }
    }
  });
});
