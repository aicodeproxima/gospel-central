/**
 * Booking status transitions — the Decision 9/11 contract (2026-07 overhaul).
 *
 * Drives the REAL handlers through msw's `getResponse` (same seam as
 * login-contract.test.ts). Pins the structural fix for "a future-dated study
 * already counted toward the teacher log / contact card":
 *
 *   - creation NEVER touches the contact card (side-effects moved off POST)
 *   - PATCH /bookings/:id/status → 'completed' applies them
 *   - leaving 'completed' reverses the session counter
 *   - First Study auto-promotes to Unbaptized at 2 completed studies,
 *     one-way, with manual overrides respected afterwards
 *   - the endpoint is auth-gated (401) + permission-gated (403, Decision 11)
 *
 * NOTE: handlers module state is shared across this file — every test creates
 * its own contact/booking (with unique far-future time slots) so tests don't
 * couple. Handler ids derive from Date.now(), so creates are spaced by a tick.
 */

import { describe, expect, it } from 'vitest';
import { getResponse } from 'msw';
import { handlers } from './handlers';
import { API_BASE } from '../lib/api/client';
import { scenarioUsers } from './scenario-church-week';
import { canSetBookingStatus, buildVisibilityScope } from '../lib/utils/permissions';
import { PipelineStage, ContactStatus, BookingType, UserRole } from '../lib/types';
import type { Booking, Contact, User } from '../lib/types';

const API = API_BASE;
const auth = (userId: string) => ({ authorization: `Bearer mock-jwt-token-${userId}` });

const req = (
  method: string,
  path: string,
  body?: unknown,
  actorId?: string,
) =>
  new Request(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(actorId ? auth(actorId) : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const tick = () => new Promise((r) => setTimeout(r, 3));

async function jsonOf<T>(res: Response | undefined): Promise<T> {
  expect(res).toBeDefined();
  return (await res!.json()) as T;
}

// Far-future weekday slots (Mon 2027-01-04 base) so nothing collides with the
// seeded week or the weekly blocked slots (Tue 20–21, Sat 9–10/15–16/20–21).
let slotCounter = 0;
function nextSlot(): { startTime: string; endTime: string } {
  const n = slotCounter++;
  const day = 4 + Math.floor(n / 8); // Jan 2027, 8 slots/day from 09:00
  const hour = 9 + (n % 8);
  const d = (h: number) =>
    `2027-01-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;
  return { startTime: d(hour), endTime: d(hour + 1) };
}

async function createContact(over: Partial<Contact> = {}): Promise<Contact> {
  await tick();
  const res = await getResponse(
    handlers,
    req('POST', '/contacts', {
      firstName: 'Statusflow',
      lastName: `Case${slotCounter}`,
      type: BookingType.UNBAPTIZED_CONTACT,
      status: ContactStatus.ACTIVE,
      pipelineStage: PipelineStage.FIRST_STUDY,
      assignedTeacherId: 'u-mem-1',
      totalSessions: 0,
      timeline: [],
      subjectsStudied: [],
      createdBy: 'u-mem-1',
      ...over,
    }),
  );
  expect(res!.status).toBe(201);
  return jsonOf<Contact>(res);
}

async function createStudyBooking(
  contactId: string,
  over: Partial<Record<string, unknown>> = {},
): Promise<Booking> {
  await tick();
  const res = await getResponse(
    handlers,
    req('POST', '/bookings', {
      areaId: 'area-newport-news',
      roomId: 'rm-nn-conf',
      type: BookingType.UNBAPTIZED_CONTACT,
      activity: 'bible_study',
      title: 'Status-flow test study',
      subject: 'Keep the Sabbath Day Holy',
      subjectsStudied: ['Keep the Sabbath Day Holy'],
      createdBy: 'u-mem-1',
      teacherId: 'u-mem-1',
      contactId,
      participants: [],
      ...nextSlot(),
      ...over,
    }),
  );
  expect(res!.status).toBe(201);
  return jsonOf<Booking>(res);
}

async function getContact(id: string): Promise<Contact> {
  const res = await getResponse(handlers, req('GET', '/contacts', undefined, 'u-michael'));
  const all = await jsonOf<Contact[]>(res);
  const found = all.find((c) => c.id === id);
  expect(found).toBeDefined();
  return found!;
}

async function setStatus(bookingId: string, status: string, actorId?: string) {
  return getResponse(handlers, req('PATCH', `/bookings/${bookingId}/status`, { status }, actorId));
}

describe('booking creation is side-effect free (the future-study bug fix)', () => {
  it('POST /bookings does NOT touch the contact card', async () => {
    const contact = await createContact();
    await createStudyBooking(contact.id);
    const after = await getContact(contact.id);
    expect(after.totalSessions).toBe(0);
    expect((after.timeline ?? []).filter((t) => t.action === 'session')).toHaveLength(0);
    expect(after.subjectsStudied ?? []).toHaveLength(0);
  });

  it('a smuggled status:"completed" in the POST body is forced back to scheduled', async () => {
    const contact = await createContact();
    const booking = await createStudyBooking(contact.id, { status: 'completed' });
    expect(booking.status).toBe('bible_study');
    const after = await getContact(contact.id);
    expect(after.totalSessions).toBe(0);
  });
});

describe('PATCH /bookings/:id/status — completed edge applies/reverses metrics', () => {
  it('→ completed increments totals, merges subject, stamps timeline + step', async () => {
    const contact = await createContact();
    const booking = await createStudyBooking(contact.id);
    const res = await setStatus(booking.id, 'completed', 'u-mem-1');
    expect(res!.status).toBe(200);

    const after = await getContact(contact.id);
    expect(after.totalSessions).toBe(1);
    expect(after.lastSessionDate).toBe(booking.startTime);
    expect(after.subjectsStudied).toContain('Keep the Sabbath Day Holy');
    expect(after.currentStep).toBe(2); // 'Keep the Sabbath Day Holy' = study #2
    expect((after.timeline ?? []).some((t) => t.action === 'session')).toBe(true);
  });

  it('completed → no_show reverses the counter (subjects stay)', async () => {
    const contact = await createContact();
    const booking = await createStudyBooking(contact.id);
    await setStatus(booking.id, 'completed', 'u-mem-1');
    const res = await setStatus(booking.id, 'no_show', 'u-mem-1');
    expect(res!.status).toBe(200);

    const after = await getContact(contact.id);
    expect(after.totalSessions).toBe(0);
    // Deliberate: subjects genuinely covered are not un-learned by a correction.
    expect(after.subjectsStudied).toContain('Keep the Sabbath Day Holy');
  });

  it('auto-promotes First Study → Unbaptized at the 2nd completed study (one-way)', async () => {
    const contact = await createContact();
    const b1 = await createStudyBooking(contact.id);
    const b2 = await createStudyBooking(contact.id);

    await setStatus(b1.id, 'completed', 'u-mem-1');
    expect((await getContact(contact.id)).pipelineStage).toBe(PipelineStage.FIRST_STUDY);

    await setStatus(b2.id, 'completed', 'u-mem-1');
    const promoted = await getContact(contact.id);
    expect(promoted.pipelineStage).toBe(PipelineStage.UNBAPTIZED);
    expect(
      (promoted.timeline ?? []).some(
        (t) => t.action === 'stage_change' && /Auto-promoted/.test(t.details),
      ),
    ).toBe(true);
  });

  it('manual stage override after auto-promotion is respected', async () => {
    const contact = await createContact();
    const b1 = await createStudyBooking(contact.id);
    const b2 = await createStudyBooking(contact.id);
    const b3 = await createStudyBooking(contact.id);
    await setStatus(b1.id, 'completed', 'u-mem-1');
    await setStatus(b2.id, 'completed', 'u-mem-1');

    // Leader manually reclassifies the contact...
    await tick();
    await getResponse(
      handlers,
      req('PUT', `/contacts/${contact.id}`, { pipelineStage: PipelineStage.POTENTIAL }, 'u-michael'),
    );
    // ...a third completed study must NOT drag them back to unbaptized.
    await setStatus(b3.id, 'completed', 'u-mem-1');
    expect((await getContact(contact.id)).pipelineStage).toBe(PipelineStage.POTENTIAL);
  });
});

describe('PATCH /bookings/:id/status — gates (Decision 11)', () => {
  it('401 without a token', async () => {
    const contact = await createContact();
    const booking = await createStudyBooking(contact.id);
    const res = await setStatus(booking.id, 'completed');
    expect(res!.status).toBe(401);
  });

  it('403 for an unrelated member (not creator, not teacher, not leader)', async () => {
    const contact = await createContact();
    const booking = await createStudyBooking(contact.id);
    const res = await setStatus(booking.id, 'completed', 'u-mem-99');
    expect(res!.status).toBe(403);
    expect((await getContact(contact.id)).totalSessions).toBe(0);
  });

  it("400 for 'cancelled' (must go through /cancel) and unknown statuses", async () => {
    const contact = await createContact();
    const booking = await createStudyBooking(contact.id);
    expect((await setStatus(booking.id, 'cancelled', 'u-mem-1'))!.status).toBe(400);
    expect((await setStatus(booking.id, 'bogus', 'u-mem-1'))!.status).toBe(400);
  });
});

describe('canSetBookingStatus matrix (pure helper)', () => {
  const member = scenarioUsers.find((u) => u.id === 'u-mem-1')! as User;
  const otherMember = scenarioUsers.find((u) => u.id === 'u-mem-99')! as User;
  const dev = scenarioUsers.find((u) => u.id === 'u-michael')! as User;
  const teamLeader = scenarioUsers.find((u) => u.id === member.parentId)! as User;

  const booking = {
    id: 'b-matrix',
    createdBy: member.id,
    teacherId: member.id,
  } as Booking;

  it('creator and teacher may set status', () => {
    expect(canSetBookingStatus(member, booking)).toBe(true);
  });

  it('admin-tier may set status anywhere', () => {
    expect(canSetBookingStatus(dev, booking)).toBe(true);
  });

  it("a leader may set status when the creator is in their subtree", () => {
    expect(teamLeader.role).toBe(UserRole.TEAM_LEADER);
    const subtree = buildVisibilityScope(teamLeader, scenarioUsers as User[]).userIds;
    expect(canSetBookingStatus(teamLeader, booking, subtree)).toBe(true);
  });

  it('an unrelated member may not', () => {
    expect(canSetBookingStatus(otherMember, booking)).toBe(false);
  });
});

describe('teacher double-booking is server-rejected (Phase 4 ultracode-gate F6)', () => {
  // The client cannot catch cross-area teacher conflicts (the wizard only
  // sees the viewed area's bookings) — the server is the only layer that can.
  it('same teacher, same slot, DIFFERENT area/room → 409 TEACHER_CONFLICT', async () => {
    const contact = await createContact();
    const slot = nextSlot();
    await createStudyBooking(contact.id, { ...slot });
    await tick();
    const res = await getResponse(
      handlers,
      req('POST', '/bookings', {
        areaId: 'area-virginia-beach',
        roomId: 'rm-vb-sr1',
        type: BookingType.UNBAPTIZED_CONTACT,
        activity: 'bible_study',
        title: 'Cross-area double-booking attempt',
        createdBy: 'u-mem-1',
        teacherId: 'u-mem-1',
        contactId: contact.id,
        participants: [],
        ...slot,
      }),
    );
    expect(res!.status).toBe(409);
    const body = await jsonOf<{ code: string }>(res);
    expect(body.code).toBe('TEACHER_CONFLICT');
  });

  it('a no-op edit does not self-conflict (excludeId), and a cancelled booking frees the teacher', async () => {
    const contact = await createContact();
    const slot = nextSlot();
    const b1 = await createStudyBooking(contact.id, { ...slot });
    // Self: PUT with unchanged time must not 409 against itself.
    await tick();
    const put = await getResponse(
      handlers,
      req('PUT', `/bookings/${b1.id}`, { editReason: 'no-op edit' }, 'u-michael'),
    );
    expect(put!.status).toBe(200);
    // Cancel b1 → the same teacher/slot becomes bookable again.
    await tick();
    const cancel = await getResponse(
      handlers,
      req('POST', `/bookings/${b1.id}/cancel`, { reason: 'F6 test' }, 'u-michael'),
    );
    expect(cancel!.status).toBe(200);
    await tick();
    const res = await getResponse(
      handlers,
      req('POST', '/bookings', {
        areaId: 'area-newport-news',
        roomId: 'rm-nn-conf',
        type: BookingType.UNBAPTIZED_CONTACT,
        activity: 'bible_study',
        title: 'Rebooked after cancel',
        createdBy: 'u-mem-1',
        teacherId: 'u-mem-1',
        contactId: contact.id,
        participants: [],
        ...slot,
      }),
    );
    expect(res!.status).toBe(201);
  });
});
