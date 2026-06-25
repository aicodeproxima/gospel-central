import { describe, it, expect } from 'vitest';
import { API_BASE } from '@/lib/api/client';

/**
 * Adversarial / negative-path coverage of the §7 SHIM permission gates in the
 * mock backend — the security surface the happy-path manual run skipped. The
 * actor is resolved ONLY from the `Bearer mock-jwt-token-<id>` header
 * (handlers.ts resolveViewer), so these exercise the same authz the real backend
 * must mirror. `it.todo`s mark KNOWN mock-permissive gaps (contacts family,
 * booking cancel) that are backend-acceptance criteria, not mock behavior.
 */
const API = API_BASE;

async function login(username: string) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'admin' }),
  });
  expect(res.status, `login ${username}`).toBe(200);
  return (await res.json()) as { token: string; user: { id: string; role: string } };
}

function authed(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

describe('adversarial: §7 SHIM permission gates', () => {
  it('POST /areas is Overseer+ only — Member 403, Branch Leader 403, Overseer 201', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    const overseer = await login('overseer1');
    expect((await authed('POST', '/areas', member.token, { name: 'X' })).status).toBe(403);
    expect((await authed('POST', '/areas', branch.token, { name: 'X' })).status).toBe(403);
    expect((await authed('POST', '/areas', overseer.token, { name: 'QA Area' })).status).toBe(201);
  });

  it('an unauthenticated mutation is 401 (not 403)', async () => {
    expect((await authed('POST', '/areas', null, { name: 'X' })).status).toBe(401);
  });

  it('a Member cannot edit another user (403)', async () => {
    const member = await login('member3');
    const branch = await login('branch1');
    const res = await authed('PUT', `/users/${branch.user.id}`, member.token, { firstName: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('a Member cannot self-elevate their role (403 — grant ceiling)', async () => {
    const member = await login('member3');
    const res = await authed('PUT', `/users/${member.user.id}`, member.token, { role: 'overseer' });
    expect(res.status).toBe(403);
  });

  it('grant ceiling: even an Overseer cannot grant Overseer; granting below own level is allowed', async () => {
    const overseer = await login('overseer1');
    const target = await login('member5'); // a plain Member, editable by an Overseer
    // at/above own level → rejected (only Dev grants at/above)
    expect((await authed('PUT', `/users/${target.user.id}`, overseer.token, { role: 'overseer' })).status).toBe(403);
    // below own level → allowed
    expect((await authed('PUT', `/users/${target.user.id}`, overseer.token, { role: 'team_leader' })).status).toBe(200);
  });

  it('a user cannot be reparented to create a reporting cycle / self-parent (403)', async () => {
    const overseer = await login('overseer1');
    const target = await login('member7');
    expect(
      (await authed('PUT', `/users/${target.user.id}`, overseer.token, { parentId: target.user.id })).status,
    ).toBe(403);
  });

  // KNOWN mock-permissive gaps — backend-acceptance criteria for Mike's Go backend
  // (the mock is intentionally permissive here; documenting, not asserting).
  it.todo('backend: POST /contacts by a Member must reject mass-assigned createdBy/convertedToUserId');
  it.todo('backend: POST /contacts/:id/convert by a Member must not mint an elevated user (priv-esc)');
  it.todo('backend: POST /bookings/:id/cancel must reject an out-of-scope actor (UI gates via canEditBooking; handler does not)');
});
