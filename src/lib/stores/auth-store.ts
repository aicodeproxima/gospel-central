import { create } from 'zustand';
import type { User } from '../types';
import { clearFeedbackQueue } from './feedback-queue';

/**
 * Auth store — mode-split since Phase C of the Supabase cutover.
 *
 * MOCK MODE (NEXT_PUBLIC_MOCK_API === 'true' — the permanent dev/demo layer):
 * unchanged legacy behavior. Tokens are minted by the MSW login handler and
 * live in localStorage plus a non-httpOnly `gospel-central-session` cookie so
 * src/proxy.ts can gate routes (audit C-2's known, accepted demo-mode risk).
 *
 * SUPABASE MODE (real backend, Phase C — httpOnly server proxy): the session
 * is an HttpOnly `sb-<ref>-auth-token*` cookie set by the server Route Handler
 * (src/app/api/[...path]/route.ts) — browser JS CANNOT read it (closes C-2).
 * There is no browser supabase-js client. This store never persists a token or
 * a session-cookie mirror; it caches only the PROFILE (`user`) for fast first
 * paint and re-derives truth from GET /api/me (which the server answers from
 * the HttpOnly cookie) on hydrate. Logout hits POST /api/logout to revoke it.
 */

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';

const SESSION_COOKIE = 'gospel-central-session';
// Legacy cookie name (pre Diamond→Gospel Central rename). Still ACCEPTED by the
// proxy in mock mode and CLEARED on logout so the rename neither strands an
// active session nor leaves a stale cookie that defeats logout.
const LEGACY_SESSION_COOKIES = ['diamond-session'];
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

// `Secure` only where the page itself is https (prod/previews). WebKit —
// unlike Chromium — stores but NEVER SENDS a Secure cookie over plain
// http://localhost, so an unconditional `secure` sent every WebKit/Safari
// dev+e2e login into an infinite /login?next=/dashboard proxy bounce: the
// login succeeded, the proxy just never saw the cookie.
const COOKIE_SECURE_SUFFIX =
  typeof location !== 'undefined' && location.protocol === 'https:' ? '; secure' : '';

function setSessionCookie(token: string) {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; ` +
    `max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${COOKIE_SECURE_SUFFIX}`;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  for (const name of [SESSION_COOKIE, ...LEGACY_SESSION_COOKIES]) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax${COOKIE_SECURE_SUFFIX}`;
  }
}

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True once hydrate() has settled at least once — lets layouts avoid a login flash. */
  hydrated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  hydrate: () => void;
}

// Supabase-mode single-flight guard: many components call hydrate() on mount;
// only one GET /api/me round should run at a time.
let hydrating = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  hydrated: false,

  login: (token, user) => {
    try {
      // Both modes cache the profile for instant re-paint. Only the mock
      // persists the TOKEN — in supabase mode the session lives in the
      // supabase auth cookies, never in localStorage (C-2 hardening).
      localStorage.setItem('user', JSON.stringify(user));
      if (IS_MOCK) localStorage.setItem('token', token);
      else localStorage.removeItem('token'); // sweep any mock-era leftover
    } catch {
      /* storage unavailable (private mode) — tolerate */
    }
    if (IS_MOCK) setSessionCookie(token);
    else clearSessionCookie(); // stale mock cookies have no business in real mode
    set({ token, user, isAuthenticated: true, hydrated: true });
  },

  logout: () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Unsent feedback is plaintext and may name a person — it must not
      // survive into whoever signs in next on a shared device.
      clearFeedbackQueue();
    } catch {
      /* noop */
    }
    clearSessionCookie();
    if (typeof window !== 'undefined') {
      if (IS_MOCK) {
        // Reset in-memory MSW mock state (audit L-6) AND drop user-created
        // custom entities (audit H-7) so a second login as a different demo
        // user starts clean.
        import('@/mocks/handlers')
          .then((m) => m.resetMockState?.())
          .catch(() => {});
      } else {
        // Revoke the real session server-side (clears the HttpOnly sb-* cookies)
        // via POST /api/logout → supabase-router → auth.signOut(). Fire-and-
        // forget: local state is already cleared below either way.
        import('@/lib/api/auth')
          .then((m) => m.authApi.logout())
          .catch(() => {});
      }
      import('@/lib/stores/custom-entities-store')
        .then((m) => m.useCustomEntitiesStore.getState().clearAll())
        .catch(() => {});
      // Clear the profile PHOTO on logout so a different user on a shared device
      // doesn't inherit the previous user's face. Theme/language/time-format are
      // device-level prefs and intentionally persist.
      import('@/lib/stores/preferences-store')
        .then((m) => m.usePreferencesStore.getState().setProfilePhoto(null))
        .catch(() => {});
    }
    set({ token: null, user: null, isAuthenticated: false, hydrated: true });
  },

  setUser: (user) => {
    try {
      localStorage.setItem('user', JSON.stringify(user));
    } catch {
      /* noop */
    }
    set({ user });
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;

    if (IS_MOCK) {
      let token: string | null = null;
      let userStr: string | null = null;
      try {
        token = localStorage.getItem('token');
        userStr = localStorage.getItem('user');
      } catch {
        /* storage unreadable (private mode / lockdown) — treat as logged out */
      }
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr) as User;
          // Refresh the cookie mirror in case it expired while localStorage
          // still has the token (e.g. user left the tab open for >8h).
          setSessionCookie(token);
          set({ token, user, isAuthenticated: true, hydrated: true });
          return;
        } catch {
          /* fallthrough */
        }
      }
      set({ token: null, user: null, isAuthenticated: false, hydrated: true });
      return;
    }

    // Supabase mode (Phase C — httpOnly server proxy): the session cookie is
    // HttpOnly, so browser JS cannot read it. "Who am I / am I signed in?" is
    // answered ONLY by the server via GET /api/me (it reads the cookie).
    //
    // We call /me with skipAuthRedirect so a signed-out 401 does NOT trigger
    // client.ts's global /login redirect — the /login page ALSO hydrates, and a
    // hard redirect there would loop. Routing to /login for a real expired
    // session is handled by proxy.ts on full loads (and by data-call 401s during
    // in-app nav, which keep the redirect).
    if (hydrating) return;
    hydrating = true;
    (async () => {
      const cached = readCachedUser();
      if (cached) {
        // Instant paint from the cached profile; /me refreshes it below.
        set({ token: '', user: cached, isAuthenticated: true, hydrated: true });
      }
      try {
        const { api } = await import('@/lib/api/client');
        const fresh = await api.get<User>('/me', { skipAuthRedirect: true });
        get().setUser(fresh); // persists + updates state
        set({ token: '', isAuthenticated: true, hydrated: true });
      } catch (e) {
        const status =
          e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number'
            ? (e as { status: number }).status
            : 0;
        if (status === 0 && cached) {
          // Transient network blip WITH a cached profile — stay optimistic;
          // proxy.ts still gates full navigations and /me retries next hydrate.
          set({ hydrated: true });
        } else {
          // Real 401 (server refused the session) or nothing cached to fall back
          // on → signed out rather than presenting a stale/empty shell.
          try {
            localStorage.removeItem('user');
          } catch {
            /* noop */
          }
          set({ token: null, user: null, isAuthenticated: false, hydrated: true });
        }
      } finally {
        hydrating = false;
      }
    })();
  },
}));
