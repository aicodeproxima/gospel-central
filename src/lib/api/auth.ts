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
};
