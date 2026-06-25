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

  // Backend-acceptance: UI-ONLY-enforced gaps (mock allows; the real backend MUST gate).
  it.todo('backend: PUT /users/:id/username must enforce canChangeUsername (Overseer+, peer-Overseer→Dev-only) — handler ungated');
  it.todo('backend: GET /audit-log must enforce canAccessReports (Branch Leader+) — handler returns to any authed user');
  it.todo('backend: PUT /contacts/:id {assignedTeacherId} must enforce canReassignContact — handler spreads body ungated');
  it.todo('backend: PUT /bookings/:id + POST /bookings/:id/cancel must enforce canEditBooking — handler checks only slot conflicts');
});
