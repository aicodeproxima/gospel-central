/**
 * Login contract — pins the SW-free mock transport seam.
 *
 * `src/mocks/browser.ts` patches window.fetch/XHR in-page via
 * @mswjs/interceptors and routes matched requests through MSW's public
 * `getResponse(handlers, request)`. Nothing else exercises that seam in
 * Node — the other mock tests only regex over handlers.ts source. This
 * file drives `getResponse` against the REAL handlers and guards the
 * getResponse half of the SW-free seam (the interceptor half runs
 * browser-only in src/mocks/browser.ts and is browser-verified): an msw
 * bump that breaks request matching, JSON body parsing, or the
 * login → /me token round-trip fails CI instead of silently bricking
 * the deployed demo login.
 *
 * Companion to:
 *   - src/mocks/browser.ts (the production consumer of getResponse)
 *   - src/mocks/handlers.ts (POST /login, GET /me)
 *   - src/lib/types/user.ts AuthResponse ({ token, user })
 */

import { describe, expect, it, vi } from 'vitest';
import { getResponse } from 'msw';
import {
  handlers,
  initMockPersistence,
  saveMockSnapshot,
  loadMockSnapshot,
  resetMockState,
} from './handlers';
import { API_BASE } from '../lib/api/client';
import type { AuthResponse } from '../lib/types';

// Import the single source of truth (client.ts API_BASE — the same value
// handlers.ts builds its route patterns from), so test request URLs can
// never drift from the handler patterns.
const API = API_BASE;

const post = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const login = (username: string, password: string) =>
  getResponse(handlers, post(`${API}/login`, { username, password }));

describe('getResponse → login contract (SW-free transport seam)', () => {
  it('POST /login with seeded admin/admin returns 200 and a mock-jwt token', async () => {
    const response = await login('admin', 'admin');

    expect(response).toBeDefined();
    expect(response!.status).toBe(200);

    const body = (await response!.json()) as AuthResponse;
    expect(body.token).toMatch(/^mock-jwt-token-/);
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe('admin');
  });

  it('POST /login with a wrong password returns 401', async () => {
    const response = await login('admin', 'nope');

    expect(response).toBeDefined();
    expect(response!.status).toBe(401);
  });

  it('GET /me with the Bearer token from login resolves the same viewer with 200', async () => {
    // Logging in as a NON-default user is load-bearing here: the /me
    // handler's no-auth fallback (handlers.ts) returns mockUsers[0] —
    // which is u-michael/admin — with a 200. If this test logged in as
    // admin, a broken Bearer-header round-trip through getResponse would
    // hit that fallback and return the SAME user, so the assertions below
    // would still pass and mask exactly the failure class this test pins.
    // stephen (u-stephen, seeded password 'admin') is not mockUsers[0],
    // so a broken round-trip yields u-michael from the fallback while the
    // token expects u-stephen → loud failure.
    const loginResponse = await login('stephen', 'admin');
    expect(loginResponse).toBeDefined();
    expect(loginResponse!.status).toBe(200);
    const { token, user } = (await loginResponse!.json()) as AuthResponse;

    const meResponse = await getResponse(
      handlers,
      new Request(`${API}/me`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(meResponse).toBeDefined();
    expect(meResponse!.status).toBe(200);

    const me = (await meResponse!.json()) as AuthResponse['user'];
    // The viewer must be resolved FROM the token (mock-jwt-token-<userId>),
    // not from a default — pin the id round-trip.
    expect(`mock-jwt-token-${me.id}`).toBe(token);
    expect(me.username).toBe(user.username);
  });
});

/**
 * Password realism + per-device persistence (2026-07-18 hardening).
 * Every account now has a REAL password: seeded users default to 'admin',
 * created accounts require their issued temp password, reset/change take
 * effect immediately — and state survives a save → reseed → load cycle.
 */
const authedPost = (url: string, token: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

describe('mock password realism (2026-07-18 hardening)', () => {
  it('a wizard-created account requires its issued temp password (any-password bypass is gone)', async () => {
    const { token: adminToken } = (await (await login('admin', 'admin'))!.json()) as AuthResponse;
    const created = await getResponse(
      handlers,
      authedPost(`${API}/users`, adminToken, {
        firstName: 'Contract', lastName: 'Probe', username: 'contract_probe',
        email: 'contract.probe@example.com', role: 'member',
      }),
    );
    expect(created!.status).toBe(201);
    const { tempPassword } = (await created!.json()) as { tempPassword: string };

    expect((await login('contract_probe', tempPassword))!.status).toBe(200);
    // The old demo bypass — any non-empty password — must NOT work anymore.
    expect((await login('contract_probe', 'admin'))!.status).toBe(401);
    expect((await login('contract_probe', 'whatever'))!.status).toBe(401);
  });

  it('admin reset-password takes effect: new temp works, previous password dies', async () => {
    const { token: adminToken } = (await (await login('admin', 'admin'))!.json()) as AuthResponse;
    const loginAs = async (pw: string) => (await login('contract_probe', pw))!.status;

    // Current password is the issued temp password from the previous test.
    // GET /users requires auth since the mock-parity patch (RLS-style scoping).
    const createdList = await getResponse(
      handlers,
      new Request(`${API}/users`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    );
    const probe = ((await createdList!.json()) as { id: string; username: string }[])
      .find((u) => u.username === 'contract_probe')!;

    const reset = await getResponse(
      handlers,
      authedPost(`${API}/users/${probe.id}/reset-password`, adminToken, {}),
    );
    expect(reset!.status).toBe(200);
    const { tempPassword: newTemp } = (await reset!.json()) as { tempPassword: string };

    expect(await loginAs(newTemp)).toBe(200);
    expect(await loginAs('admin')).toBe(401);

    // Self change-password takes effect too.
    const { token: probeToken } = (await (await login('contract_probe', newTemp))!.json()) as AuthResponse;
    const change = await getResponse(
      handlers,
      authedPost(`${API}/users/${probe.id}/change-password`, probeToken, { newPassword: 'MyOwn2026!' }),
    );
    expect(change!.status).toBe(200);
    expect(await loginAs('MyOwn2026!')).toBe(200);
    expect(await loginAs(newTemp)).toBe(401);
  });

  it('change-password is self-only: anonymous 401, other user 403', async () => {
    // GET /users requires auth since the mock-parity patch (RLS-style scoping).
    const { token: adminToken } = (await (await login('admin', 'admin'))!.json()) as AuthResponse;
    const createdList = await getResponse(
      handlers,
      new Request(`${API}/users`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    );
    const probe = ((await createdList!.json()) as { id: string; username: string }[])
      .find((u) => u.username === 'contract_probe')!;

    const anon = await getResponse(
      handlers,
      post(`${API}/users/${probe.id}/change-password`, { newPassword: 'hijack1' }),
    );
    expect(anon!.status).toBe(401);

    const { token: memberToken } = (await (await login('member3', 'admin'))!.json()) as AuthResponse;
    const other = await getResponse(
      handlers,
      authedPost(`${API}/users/${probe.id}/change-password`, memberToken, { newPassword: 'hijack1' }),
    );
    expect(other!.status).toBe(403);
    // And the password is provably untouched.
    expect((await login('contract_probe', 'MyOwn2026!'))!.status).toBe(200);
  });

  it('snapshot round-trip: created account + its password survive save → reseed → load', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      initMockPersistence(); // arms persistence against the stubbed storage
      saveMockSnapshot(); // captures the state incl. contract_probe (from earlier tests)
      const saved = store.get('gc-mock-v1');
      expect(saved).toBeDefined();
      expect(saved).toContain('contract_probe');

      // Simulate a fresh page load: state reseeds…
      resetMockState();
      expect((await login('contract_probe', 'MyOwn2026!'))!.status).toBe(401);
      // …but the snapshot is intact and restores it — password map included.
      store.set('gc-mock-v1', saved!);
      loadMockSnapshot();
      expect((await login('contract_probe', 'MyOwn2026!'))!.status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
      resetMockState(); // leave the seed clean for any later tests in this file
    }
  });
});
