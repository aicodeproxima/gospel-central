import { describe, it, expect, afterEach } from 'vitest';
import { API_BASE } from '@/lib/api/client';
import { resetMockState } from '@/mocks/handlers';

/**
 * REGRESSION GATE — POST /users must not be a user-directory oracle.
 *
 * Found by the 2026-07-19 account-creation audit and live-verified on prod at
 * BOTH `27ab8db` and `2504e54`: the handler ran its username/email uniqueness
 * probes BEFORE resolving the viewer, so an unauthenticated caller could tell a
 * real account from a fake one purely by status code —
 *   POST {username:'admin'}          -> 409 "Username already taken"
 *   POST {username:'zzz_nobody_here'} -> 401 "Authentication required"
 * That is a working enumeration oracle against the whole seed directory, usable
 * with no credentials at all.
 *
 * The fix reorders the handler to authenticate -> authorize -> validate ->
 * conflict. These tests pin that ORDER, not just the individual gates: each one
 * sends a payload that WOULD trip a 409 and asserts the caller is turned away by
 * an earlier gate instead. A future refactor that hoists the uniqueness checks
 * back above the auth/authz gates fails here.
 *
 * Parity note: the real backend already behaves this way — create_user
 * (supabase/migrations/0003_admin_rpcs.sql) raises PERMISSION_DENIED before the
 * insert ever reaches the unique constraints.
 *
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

function post(path: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** A payload whose username is guaranteed to collide with a seeded account. */
const takenUsername = { firstName: 'X', lastName: 'Y', username: 'admin', email: 'x@y.com', role: 'member' };
/** Same shape, but a username nothing in the seed uses. */
const freeUsername = { firstName: 'X', lastName: 'Y', username: 'zzz_nobody_here', email: 'q@y.com', role: 'member' };

describe('POST /users — enumeration oracle is closed', () => {
  it('anonymous callers get 401 for a TAKEN username, not 409', async () => {
    const res = await post('/users', null, takenUsername);
    expect(res.status).toBe(401);
  });

  it('anonymous callers get 401 for a FREE username too', async () => {
    const res = await post('/users', null, freeUsername);
    expect(res.status).toBe(401);
  });

  it('anonymous taken vs free are INDISTINGUISHABLE (the actual oracle test)', async () => {
    // This is the assertion that matters. Pre-fix these were 409 vs 401, which
    // is exactly what let an attacker sort real usernames from fake ones.
    const taken = await post('/users', null, takenUsername);
    const free = await post('/users', null, freeUsername);
    expect(taken.status).toBe(free.status);
    expect(await taken.text()).toBe(await free.text());
  });

  it('an authenticated caller who lacks create permission gets 403, not 409', async () => {
    // A Member may not create anyone, so they must never learn that 'admin' exists.
    const member = await login('member3');
    const res = await post('/users', member.token, takenUsername);
    expect(res.status).toBe(403);
  });

  it('permission-denied is also indistinguishable between taken and free', async () => {
    const member = await login('member3');
    const taken = await post('/users', member.token, takenUsername);
    const free = await post('/users', member.token, freeUsername);
    expect(taken.status).toBe(free.status);
    expect(await taken.text()).toBe(await free.text());
  });

  it('a PERMITTED creator still gets a real, typed 409 on a duplicate', async () => {
    // The gate must not swallow the genuine conflict — an admin creating a user
    // needs to know the username is taken, and needs a machine-readable code.
    const overseer = await login('overseer1');
    const res = await post('/users', overseer.token, takenUsername);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { message: string; code?: string };
    expect(body.code).toBe('USERNAME_TAKEN');
  });

  it('a PERMITTED creator gets a typed 409 on a duplicate email', async () => {
    const overseer = await login('overseer1');
    const seeded = await fetch(`${API}/users`, {
      headers: { Authorization: `Bearer ${overseer.token}` },
    }).then((r) => r.json() as Promise<Array<{ email: string }>>);
    const existingEmail = seeded.find((u) => !!u.email)!.email;
    const res = await post('/users', overseer.token, {
      firstName: 'X',
      lastName: 'Y',
      username: 'zzz_fresh_name',
      email: existingEmail,
      role: 'member',
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('EMAIL_TAKEN');
  });

  it('a PERMITTED creator still succeeds on a clean payload', async () => {
    // Guard against "fixed it by breaking creation entirely".
    const overseer = await login('overseer1');
    const res = await post('/users', overseer.token, freeUsername);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { username: string }; tempPassword: string };
    expect(body.user.username).toBe('zzz_nobody_here');
    expect(body.tempPassword).toBeTruthy();
  });
});
