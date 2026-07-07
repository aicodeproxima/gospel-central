import { api } from './client';
import type { AuthResponse } from '../types';

export const authApi = {
  login(username: string, password: string) {
    // skipAuthRedirect: a wrong-password 401 must reach the login form as a
    // typed ApiError, not trigger the global wipe-token + /login redirect.
    return api.post<AuthResponse>(
      '/login',
      { username, password },
      { skipAuthRedirect: true },
    );
  },
  me() {
    return api.get<AuthResponse['user']>('/me');
  },
  // Real mode (Phase C): clears the HttpOnly session cookie server-side via the
  // route handler → supabase-router /logout → auth.signOut(). No-op-safe if the
  // session is already gone. Mock mode never calls this (auth-store resets MSW).
  logout() {
    return api.post<Record<string, never>>('/logout');
  },
};
