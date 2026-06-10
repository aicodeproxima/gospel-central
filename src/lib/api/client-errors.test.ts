/**
 * client-errors — pins the typed error contract of ApiClient.request().
 *
 * Three behaviors guarded (all regressions of the iOS login bug class):
 *   (a) transport failure (fetch rejects) → ApiError { status: 0,
 *       code: 'NETWORK_ERROR' }, NOT a bare Error — callers (use-auth) can
 *       distinguish "can't reach the server" from "wrong password".
 *   (b) 401 with skipAuthRedirect (the login call) → typed ApiError 401
 *       carrying the handler body's message, with NO global side effects
 *       (token preserved, no redirect to /login).
 *   (c) 401 without skipAuthRedirect → typed ApiError 401, token wiped,
 *       redirect to /login attempted.
 *
 * Runs in the default node environment (jsdom is not a dependency of this
 * project): window / localStorage / fetch are the only globals client.ts
 * touches, so vi.stubGlobal stands in for all three and doubles as the spy
 * surface for the redirect/token assertions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, isApiError, type ApiError } from './client';

const TOKEN = 'mock-jwt-token-u-stephen';

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

/** Await a rejection and hand back the error (fails the test on resolve). */
async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected promise to reject, but it resolved');
}

describe('ApiClient typed errors (network vs 401, skipAuthRedirect)', () => {
  let storage: ReturnType<typeof makeStorage>;
  let windowStub: { location: { href: string } };

  beforeEach(() => {
    storage = makeStorage({ token: TOKEN });
    windowStub = { location: { href: '' } };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', windowStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(a) fetch rejection → ApiError status 0, code NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const err = await rejectionOf(api.get('/me'));

    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).code).toBe('NETWORK_ERROR');
    expect((err as ApiError).message).toBe('Failed to fetch');
  });

  it('(b) 401 + skipAuthRedirect → typed 401 with body message, no redirect, token kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Invalid username or password' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const err = await rejectionOf(
      api.post(
        '/login',
        { username: 'admin', password: 'nope' },
        { skipAuthRedirect: true },
      ),
    );

    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).status).toBe(401);
    // Falls through to the generic !res.ok block → handler body message.
    expect((err as ApiError).message).toBe('Invalid username or password');
    // No global 401 side effects for the login path:
    expect(storage.getItem('token')).toBe(TOKEN);
    expect(windowStub.location.href).toBe('');
  });

  it('(c) 401 without skipAuthRedirect → typed 401, token wiped, redirect attempted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    const err = await rejectionOf(api.get('/me'));

    expect(isApiError(err)).toBe(true);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).code).toBe('PERMISSION_DENIED');
    expect(storage.getItem('token')).toBeNull();
    expect(windowStub.location.href).toBe('/login');
  });

  it('skipAuthRedirect is stripped from the fetch init (not forwarded)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await api.post('/login', {}, { skipAuthRedirect: true });

    const initArg = fetchSpy.mock.calls[0][1] as Record<string, unknown>;
    expect('skipAuthRedirect' in initArg).toBe(false);
  });
});
