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

  // NOW ENFORCED (2026-07-09, built to real-backend parity: create_contact RPC
  // gate + convert_contact RPC gate + create_user role ceiling).
  it('POST /contacts enforces canCreateContact on the owner + strips mass-assigned server fields', async () => {
    const member = await login('member3');
    // owner = someone else → 403 (a Member may only own their own creations)
    expect(
      (await authed('POST', '/contacts', member.token, { firstName: 'Mass', lastName: 'Assign', createdBy: 'u-branch-1' })).status,
    ).toBe(403);
    // anon → 401
    expect((await authed('POST', '/contacts', null, { firstName: 'X', lastName: 'Y' })).status).toBe(401);
    // own contact → 201; createdBy forced to the actor, convertedToUserId NOT mass-assignable
    const ok = await authed('POST', '/contacts', member.token, {
      firstName: 'Mass', lastName: 'Own', createdBy: member.user.id, convertedToUserId: 'u-branch-1',
    });
    expect(ok.status).toBe(201);
    const c = await ok.json();
    expect(c.createdBy).toBe(member.user.id);
    expect(c.convertedToUserId).toBeUndefined();
    await authed('DELETE', `/contacts/${c.id}`, member.token).catch(() => {}); // best-effort cleanup
  });

  it('POST /contacts/:id/convert enforces leader-scope + the create_user role ceiling (no priv-esc)', async () => {
    const member = await login('member3');   // not a leader
    const overseer = await login('overseer1'); // leader; canEditContact allows any
    const raw = await (await authed('GET', '/contacts', overseer.token)).json();
    const list = Array.isArray(raw) ? raw : raw.data || raw.contacts || [];
    const c = list.find((x: { id: string; status: string }) => x.status !== 'converted');
    expect(c).toBeTruthy();
    // a Member cannot convert at all → 403
    expect((await authed('POST', `/contacts/${c.id}/convert`, member.token, { role: 'member' })).status).toBe(403);
    // even an Overseer cannot mint a user at or above their own level → 403 (ceiling)
    expect((await authed('POST', `/contacts/${c.id}/convert`, overseer.token, { role: 'dev' })).status).toBe(403);
    // anon → 401
    expect((await authed('POST', `/contacts/${c.id}/convert`, null, { role: 'member' })).status).toBe(401);
  });
  // NOW ENFORCED in the mock (2026-07-09, built to real-backend parity: the real
  // cancel_booking RPC gates by canEditBooking + attributes cancelledBy=auth.uid()).
  it('POST /bookings/:id/cancel: rejects an out-of-scope actor (403) and attributes to the JWT actor, not a hardcoded Michael', async () => {
    const member = await login('member3'); // plain Member — no subtree
    const branch = await login('branch1'); // admin-tier (branch_leader)
    const raw = await (await authed('GET', '/bookings', branch.token)).json();
    const all = Array.isArray(raw) ? raw : raw.data || raw.bookings || [];
    // a SCHEDULED booking member3 neither created nor teaches (out of scope)
    const b = all.find(
      (x: { id: string; status: string; createdBy?: string; teacherId?: string }) =>
        x.status === 'bible_study' && x.createdBy !== member.user.id && x.teacherId !== member.user.id,
    );
    expect(b).toBeTruthy();
    // out-of-scope Member → 403 (authz gate mirrors the RLS bookings_update policy)
    expect((await authed('POST', `/bookings/${b.id}/cancel`, member.token, { reason: 'nope' })).status).toBe(403);
    // anonymous → 401 (JWT-only actor resolution)
    expect((await authed('POST', `/bookings/${b.id}/cancel`, null, { reason: 'nope' })).status).toBe(401);
    // admin-tier actor → 200, and cancelledBy is the REAL actor (B3 regression guard)
    const ok = await authed('POST', `/bookings/${b.id}/cancel`, branch.token, { reason: 'QA parity' });
    expect(ok.status).toBe(200);
    const cancelled = await ok.json();
    expect(cancelled.cancelledBy).toBe(branch.user.id);
    expect(cancelled.cancelledBy).not.toBe('u-michael');
    // restore to leave the shared seed state net-zero
    await authed('POST', `/bookings/${b.id}/restore`, branch.token);
  });
});
