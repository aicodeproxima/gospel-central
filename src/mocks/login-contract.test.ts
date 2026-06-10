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

import { describe, expect, it } from 'vitest';
import { getResponse } from 'msw';
import { handlers } from './handlers';
import type { AuthResponse } from '../lib/types';

// Mirror handlers.ts:33 exactly — in Node/vitest NEXT_PUBLIC_API_URL is
// unset, so handler patterns resolve against the localhost fallback base
// URL and our test requests must be built from the SAME expression to match.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

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
