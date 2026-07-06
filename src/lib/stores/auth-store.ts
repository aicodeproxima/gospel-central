import { create } from 'zustand';
import type { User } from '../types';

/**
 * Auth store — mode-split since Phase C of the Supabase cutover.
 *
 * MOCK MODE (NEXT_PUBLIC_MOCK_API === 'true' — the permanent dev/demo layer):
 * unchanged legacy behavior. Tokens are minted by the MSW login handler and
 * live in localStorage plus a non-httpOnly `gospel-central-session` cookie so
 * src/proxy.ts can gate routes (audit C-2's known, accepted demo-mode risk).
 *
 * SUPABASE MODE (real backend): the session is OWNED by supabase-js.
 * `createBrowserClient` (src/lib/api/supabase.ts) persists it in
 * `sb-<ref>-auth-token*` cookies that the middleware validates + refreshes.
 * This store no longer writes any token to localStorage and no longer mirrors
 * a session cookie — it only caches the PROFILE (`user`) for fast first paint
 * and re-derives truth from `supabase.auth.getSession()` + `/me` on hydrate.
 * Residual C-2 note: supabase's cookies are JS-set and thus not httpOnly;
 * that is inherent to the browser-side data plane (see supabase.ts).
 */

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';

const SESSION_COOKIE = 'gospel-central-session';
// Legacy cookie name (pre Diamond→Gospel Central rename). Still ACCEPTED by the
// proxy in mock mode and CLEARED on logout so the rename neither strands an
// active session nor leaves a stale cookie that defeats logout.
const LEGACY_SESSION_COOKIES = ['diamond-session'];
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function setSessionCookie(token: string) {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; ` +
    `max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax; secure`;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  for (const name of [SESSION_COOKIE, ...LEGACY_SESSION_COOKIES]) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax; secure`;
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
// only one getSession()+/me round should run at a time.
let hydrating = false;
// onAuthStateChange must be registered exactly once per page lifetime.
let authListenerRegistered = false;

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
        // Revoke the real session (clears the sb-* auth cookies). Fire-and-
        // forget: local state is already cleared below either way.
        import('@/lib/api/supabase')
          .then((m) => m.supabase().auth.signOut())
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

    // Supabase mode: truth = the supabase session (cookie-backed). Async, but
    // getSession() reads local cookie state (no network), so `hydrated` settles
    // within a tick; /me then refreshes the cached profile in the background.
    if (hydrating) return;
    hydrating = true;
    (async () => {
      try {
        const { supabase } = await import('@/lib/api/supabase');
        const client = supabase();

        if (!authListenerRegistered) {
          authListenerRegistered = true;
          client.auth.onAuthStateChange((event, session) => {
            // SIGNED_OUT covers cross-tab logout AND a failed token refresh
            // (revoked session): drop local state; layouts route to /login.
            if (event === 'SIGNED_OUT') {
              try {
                localStorage.removeItem('user');
              } catch {
                /* noop */
              }
              set({ token: null, user: null, isAuthenticated: false, hydrated: true });
            } else if (event === 'TOKEN_REFRESHED' && session) {
              set({ token: session.access_token });
            }
          });
        }

        const { data } = await client.auth.getSession();
        const session = data.session;
        if (!session) {
          set({ token: null, user: null, isAuthenticated: false, hydrated: true });
          return;
        }

        const cached = readCachedUser();
        if (cached) {
          // Instant paint from cache, then refresh the profile from the DB
          // (role/tags may have changed since last visit).
          set({ token: session.access_token, user: cached, isAuthenticated: true, hydrated: true });
        }
        try {
          const { authApi } = await import('@/lib/api/auth');
          const fresh = await authApi.me();
          get().setUser(fresh);
          if (!cached) {
            set({ token: session.access_token, isAuthenticated: true, hydrated: true });
          }
        } catch {
          // /me failed. With a cached profile we stay optimistic (transient
          // network blip); without one we cannot render the app — treat as
          // signed out rather than presenting an empty shell.
          if (!cached) {
            set({ token: null, user: null, isAuthenticated: false, hydrated: true });
          }
        }
      } catch {
        // supabase client unavailable (misconfigured build) — fail closed.
        set({ token: null, user: null, isAuthenticated: false, hydrated: true });
      } finally {
        hydrating = false;
      }
    })();
  },
}));
