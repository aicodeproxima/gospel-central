import { describe, it, expect, afterEach } from 'vitest';
import { API_BASE } from '@/lib/api/client';
import { resetMockState } from '@/mocks/handlers';

/**
 * Run 2 (List B) INTEGRATION lane — handler authz for the gated endpoints, plus
 * backend-acceptance `it.todo`s for the UI-ONLY-enforced gaps the 2026-06-25
 * Explore found (the mock allows them; Mike's Go backend must gate them).
 * Cell isolation (audit-anti-drift G6): resetMockState between cells.
 */
const API = API_BASE;
afterEach(() => resetMockState());

async function login(username: string) {
  const r = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'admin' }),
  });
  expect(r.status, `login ${username}`).toBe(200);
  return (await r.json()) as { token: string; user: { id: string; role: string } };
}
function authed(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}
const not403 = (s: number) => s !== 403;

describe('List B INT — gated-endpoint authz (negative path)', () => {
  it('B32/B33 create-user respects the grant ceiling', async () => {
    const member = await login('member3');
    const group = await login('group1');
    const branch = await login('branch1');
    const overseer = await login('overseer1');
    const team = { firstName: 'R2', lastName: 'Team', username: 'r2_team', role: 'team_leader', parentId: group.user.id };
    expect((await authed('POST', '/users', member.token, team)).status).toBe(403); // member can't create
    expect(not403((await authed('POST', '/users', group.token, team)).status)).toBe(true); // Group Leader can
    const branchUser = { firstName: 'R2', lastName: 'Branch', username: 'r2_branch', role: 'branch_leader' };
    expect((await authed('POST', '/users', branch.token, branchUser)).status).toBe(403); // can't create at own level
    expect(not403((await authed('POST', '/users', overseer.token, branchUser)).status)).toBe(true); // Overseer can
  });

  it('B40 blocked-slot create is Branch Leader+', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    const slot = { scope: 'global', recurrence: 'weekly', dayOfWeek: 3, start: '13:00', end: '14:00', reason: 'R2' };
    expect((await authed('POST', '/blocked-slots', member.token, slot)).status).toBe(403);
    expect(not403((await authed('POST', '/blocked-slots', branch.token, slot)).status)).toBe(true);
  });

  it('B38/B39 room manage is admin-tier', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    expect((await authed('PUT', '/rooms/rm-nn-bs1', member.token, { capacity: 99 })).status).toBe(403);
    expect(not403((await authed('PUT', '/rooms/rm-nn-bs1', branch.token, { capacity: 99 })).status)).toBe(true);
    expect((await authed('POST', '/rooms/rm-nn-bs1/deactivate', member.token)).status).toBe(403);
  });

  it('B36 export-rights toggle is admin-tier (Member 403)', async () => {
    const member = await login('member3');
    expect((await authed('PUT', '/settings/export-import', member.token, { nodeId: 'x', value: true })).status).toBe(403);
  });

  it('B34 a Member cannot manage another user’s tags (403)', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    expect((await authed('PUT', `/users/${branch.user.id}/tags`, member.token, { tags: ['teacher'] })).status).toBe(403);
  });

  // NOW ENFORCED (2026-07-09, built to real-backend parity).
  it('PUT /users/:id/username enforces canChangeUsername (Overseer+; below-Overseer rejected)', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    const overseer = await login('overseer1');
    const target = overseer.user.id; // renaming someone else, not self
    // below Overseer → 403
    expect((await authed('PUT', `/users/${target}/username`, member.token, { username: 'hacked1' })).status).toBe(403);
    expect((await authed('PUT', `/users/${target}/username`, branch.token, { username: 'hacked2' })).status).toBe(403);
    // anon → 401
    expect((await authed('PUT', `/users/${target}/username`, null, { username: 'x' })).status).toBe(401);
  });

  it('GET /audit-log row-scopes non-admins to their own/related events (audit_select RLS parity)', async () => {
    const member = await login('member3');
    const overseer = await login('overseer1');
    expect((await authed('GET', '/audit-log?limit=500', null)).status).toBe(401);
    const mem = await (await authed('GET', '/audit-log?limit=500', member.token)).json();
    const memList = mem.data ?? mem.entries ?? mem.rows ?? mem;
    const ov = await (await authed('GET', '/audit-log?limit=500', overseer.token)).json();
    const ovList = ov.data ?? ov.entries ?? ov.rows ?? ov;
    // a Member sees ONLY rows where they are the actor or a related party
    expect(memList.every((e: { userId: string; relatedUserIds?: string[] }) =>
      e.userId === member.user.id || (e.relatedUserIds ?? []).includes(member.user.id))).toBe(true);
    // an admin-tier viewer sees strictly more (the whole log)
    expect(ovList.length).toBeGreaterThan(memList.length);
  });

  // NOW ENFORCED (2026-07-11, built to real-backend parity): PUT & DELETE
  // /contacts/:id gate by canEditContact/canDeleteContact against the viewer's
  // MANAGEABLE subtree (contacts_update RLS + set_contact_inactive RPC). A
  // teacher change is re-gated like set_contact_teacher. The REGRESSION GUARD
  // below (a Branch Leader editing an in-branch contact they didn't create must
  // NOT 403) fails if the handler ever regresses to the visibility scope, which
  // is EMPTY for a Branch Leader.
  it('PUT/DELETE /contacts/:id enforce canEditContact — member edits foreign 403, anon 401, BL edits in-branch NOT 403', async () => {
    const member = await login('member3');
    const branch = await login('branch1'); // Branch Leader, Newport News
    // A contact NOT created by member3 (discover via branch1, who sees all).
    const raw = await (await authed('GET', '/contacts', branch.token)).json();
    const all = Array.isArray(raw) ? raw : raw.data || raw.contacts || [];
    const foreign = all.find(
      (c: { id: string; status: string; createdBy?: string; assignedTeacherId?: string }) =>
        c.status !== 'inactive' && c.createdBy && c.createdBy !== member.user.id,
    );
    expect(foreign, 'a seed contact not created by member3').toBeTruthy();
    // Member outside scope → 403 (edit + delete); anon → 401.
    expect((await authed('PUT', `/contacts/${foreign.id}`, member.token, { notes: 'x' })).status).toBe(403);
    expect((await authed('DELETE', `/contacts/${foreign.id}`, member.token, {})).status).toBe(403);
    expect((await authed('PUT', `/contacts/${foreign.id}`, null, { notes: 'x' })).status).toBe(401);

    // REGRESSION GUARD (BL false-403): branch1 must be able to edit an in-branch
    // contact they did NOT personally create. Build one owned by a subordinate:
    // branch1 is admin-tier so canCreateContact lets them set an arbitrary owner.
    const usersRaw = await (await authed('GET', '/users', branch.token)).json();
    const users = (Array.isArray(usersRaw) ? usersRaw : usersRaw.data || usersRaw.users || []) as Array<{
      id: string;
      parentId?: string;
    }>;
    // Fixed-point descendant walk from branch1 (mirrors buildManageableScope).
    const reach = new Set<string>([branch.user.id]);
    for (let added = true; added; ) {
      added = false;
      for (const u of users) {
        if (u.parentId && reach.has(u.parentId) && !reach.has(u.id)) {
          reach.add(u.id);
          added = true;
        }
      }
    }
    const sub = users.find((u) => u.id !== branch.user.id && reach.has(u.id));
    expect(sub, 'branch1 should have at least one subordinate').toBeTruthy();
    const created = await (
      await authed('POST', '/contacts', branch.token, {
        firstName: 'Reg',
        lastName: 'Guard',
        type: 'contact',
        pipelineStage: 'first_study',
        createdBy: sub!.id,
      })
    ).json();
    expect(created.createdBy, 'owner forced to the subordinate').toBe(sub!.id);
    const guard = await authed('PUT', `/contacts/${created.id}`, branch.token, { notes: 'edited by BL' });
    expect(guard.status, 'BL editing an in-branch contact must NOT be 403').not.toBe(403);
  });
  // NOW ENFORCED (2026-07-09): the mock's PUT/cancel/delete/restore booking handlers
  // gate by canEditBooking, matching the real bookings_update RLS policy.
  it('PUT /bookings/:id + POST /bookings/:id/cancel enforce canEditBooking (out-of-scope actor → 403, anon → 401)', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    const raw = await (await authed('GET', '/bookings', branch.token)).json();
    const all = Array.isArray(raw) ? raw : raw.data || raw.bookings || [];
    const b = all.find(
      (x: { id: string; status: string; createdBy?: string; teacherId?: string }) =>
        x.status !== 'cancelled' && x.createdBy !== member.user.id && x.teacherId !== member.user.id,
    );
    expect(b).toBeTruthy();
    expect((await authed('PUT', `/bookings/${b.id}`, member.token, { editReason: 'x' })).status).toBe(403);
    expect((await authed('POST', `/bookings/${b.id}/cancel`, member.token, { reason: 'x' })).status).toBe(403);
    expect((await authed('PUT', `/bookings/${b.id}`, null, { editReason: 'x' })).status).toBe(401);
  });
});
