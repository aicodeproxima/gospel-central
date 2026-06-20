import { create } from 'zustand';
import type { User } from '../types';

/**
 * Auth store.
 *
 * KNOWN SECURITY GAP (audit C-2): tokens live in localStorage AND in a
 * non-httpOnly `diamond-session` cookie so the Next.js middleware can
 * gate routes. Both are readable from JS and therefore XSS-exfiltrable.
 * The cookie is marked Secure (HTTPS-only transmission; the app deploys
 * HTTPS-only on Vercel), but httpOnly is impossible to set from JS.
 * This is a deliberate compromise until the real Go backend is wired;
 * at that point, migrate to a Set-Cookie httpOnly SameSite=Lax flow
 * and remove the cookie-mirror + localStorage logic from this file.
 */

const SESSION_COOKIE = 'diamond-session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function setSessionCookie(token: string) {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; ` +
    `max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax; secure`;
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True once hydrate() has run at least once — lets layouts avoid a login flash. */
  hydrated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  hydrated: false,

  login: (token, user) => {
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } catch {
      /* storage unavailable (private mode) — tolerate */
    }
    setSessionCookie(token);
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
    // Reset in-memory MSW mock state (audit L-6) AND drop user-created
    // custom entities (audit H-7) so a second login as a different demo
    // user starts clean. Both imports are dynamic because this store
    // can be evaluated server-side in rare cases.
    if (typeof window !== 'undefined') {
      import('@/mocks/handlers')
        .then((m) => m.resetMockState?.())
        .catch(() => {});
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
  },
}));
