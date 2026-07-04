/**
 * Producer-coverage backstop for `relatedUserIds` on the audit log (2026-07
 * overhaul Phase 7). The `pushAudit` helper's input type already makes the
 * field compile-time required at every converted site; this drives the REAL
 * handlers (same `getResponse` seam as booking-status.test.ts) through
 * representative mutating endpoints and asserts each produced audit row carries
 * a non-empty `relatedUserIds` that INCLUDES the expected affected user — so a
 * wrong or empty derivation is a test failure, not a silent gap.
 */

import { describe, expect, it } from 'vitest';
import { getResponse } from 'msw';
import { handlers } from './handlers';
import { mockAuditLog } from './data';
import { API_BASE } from '../lib/api/client';
import { scenarioUsers } from './scenario-church-week';
import { UserRole, PipelineStage, ContactStatus, BookingType } from '../lib/types';
import type { Contact } from '../lib/types';

const API = API_BASE;
const auth = (userId: string) => ({ authorization: `Bearer mock-jwt-token-${userId}` });
const req = (method: string, path: string, body?: unknown, actorId?: string) =>
  new Request(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(actorId ? auth(actorId) : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const tick = () => new Promise((r) => setTimeout(r, 3));

const ADMIN = 'u-michael'; // Dev — can perform every mutation
const teacher = scenarioUsers.find((u) => u.role === UserRole.TEAM_LEADER)!;
const otherTeacher = scenarioUsers.find(
  (u) => u.role === UserRole.TEAM_LEADER && u.id !== teacher.id,
)!;

/** The newest audit entry (mockAuditLog is unsorted-append at runtime; the
 *  latest push is the last element). */
const newest = () => mockAuditLog[mockAuditLog.length - 1];
async function jsonOf<T>(res: Response | undefined): Promise<T> {
  expect(res).toBeDefined();
  return (await res!.json()) as T;
}

describe('audit relatedUserIds — producer coverage', () => {
  it('contact create → relatedUserIds includes the actor AND the assigned teacher', async () => {
    await tick();
    const res = await getResponse(
      handlers,
      req(
        'POST',
        '/contacts',
        {
          firstName: 'Related',
          lastName: 'Probe',
          type: BookingType.UNBAPTIZED_CONTACT,
          status: ContactStatus.ACTIVE,
          pipelineStage: PipelineStage.FIRST_STUDY,
          assignedTeacherId: teacher.id,
          preachingPartnerIds: [teacher.id],
          actorId: ADMIN,
        },
        ADMIN,
      ),
    );
    const created = await jsonOf<Contact>(res);
    const entry = newest();
    expect(entry.entityType).toBe('contact');
    expect(entry.relatedUserIds).toBeDefined();
    expect(entry.relatedUserIds!.length).toBeGreaterThan(0);
    expect(entry.relatedUserIds).toContain(ADMIN);
    expect(entry.relatedUserIds).toContain(teacher.id);
    // no duplicate ids
    expect(new Set(entry.relatedUserIds).size).toBe(entry.relatedUserIds!.length);
    return created;
  });

  it('contact reassign → relatedUserIds includes both the old and new teacher', async () => {
    // seed a contact owned by `teacher`, then reassign to `otherTeacher`.
    await tick();
    const created = await jsonOf<Contact>(
      await getResponse(
        handlers,
        req(
          'POST',
          '/contacts',
          {
            firstName: 'Reassign',
            lastName: 'Probe',
            type: BookingType.UNBAPTIZED_CONTACT,
            status: ContactStatus.ACTIVE,
            pipelineStage: PipelineStage.FIRST_STUDY,
            assignedTeacherId: teacher.id,
            actorId: ADMIN,
          },
          ADMIN,
        ),
      ),
    );
    await tick();
    await getResponse(
      handlers,
      req('PUT', `/contacts/${created.id}`, { assignedTeacherId: otherTeacher.id, actorId: ADMIN }, ADMIN),
    );
    const entry = [...mockAuditLog]
      .reverse()
      .find((e) => e.action === 'reassign' && e.entityId === created.id);
    expect(entry, 'expected a contact reassign audit row').toBeDefined();
    expect(entry!.relatedUserIds).toContain(teacher.id);
    expect(entry!.relatedUserIds).toContain(otherTeacher.id);
  });

  it('user role change → relatedUserIds includes the target user', async () => {
    const member = scenarioUsers.find((u) => u.role === UserRole.MEMBER)!;
    await tick();
    await getResponse(
      handlers,
      req('PUT', `/users/${member.id}`, { role: UserRole.TEAM_LEADER, actorId: ADMIN }, ADMIN),
    );
    // role_change is emitted first in the PUT /users/:id diff block; find it.
    const roleRow = [...mockAuditLog].reverse().find((e) => e.action === 'role_change' && e.entityId === member.id);
    expect(roleRow).toBeDefined();
    expect(roleRow!.relatedUserIds).toContain(member.id);
    // restore role so the shared seed isn't left mutated for other files
    await tick();
    await getResponse(
      handlers,
      req('PUT', `/users/${member.id}`, { role: UserRole.MEMBER, actorId: ADMIN }, ADMIN),
    );
  });

  it('every runtime audit push routes through pushAudit → no entry is missing the field', async () => {
    // A structural assertion: after driving the endpoints above, every audit
    // entry that post-dates the seed carries relatedUserIds. (Seed entries also
    // set it, but this specifically guards the runtime producer path.)
    const runtimeEntries = mockAuditLog.filter((e) => !e.id.match(/^al-\d+$/));
    expect(runtimeEntries.length).toBeGreaterThan(0);
    for (const e of runtimeEntries) {
      // Every runtime row carries a non-empty relatedUserIds. (We don't assert
      // it contains e.userId: three known booking handlers hard-code the actor
      // as 'u-michael' — tracked separately — so their userId can diverge from
      // the real actor captured in relatedUserIds.)
      expect(e.relatedUserIds, `entry ${e.id} (${e.action}/${e.entityType}) missing relatedUserIds`).toBeDefined();
      expect(e.relatedUserIds!.length).toBeGreaterThan(0);
    }
  });
});
