'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '../stores/auth-store';
import { authApi } from '../api/auth';
import { isApiError } from '../api/client';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

export function useAuth() {
  const { user, isAuthenticated, login, logout, hydrate } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleLogin = async (username: string, password: string) => {
    try {
      const res = await authApi.login(username, password);
      login(res.token, res.user);
      toast.success(`Welcome, ${res.user.firstName}!`);
      // Honor ?next= so middleware-triggered redirects send the user
      // back to where they were trying to go (audit follow-up for the
      // "menus don't work" regression).
      const next = searchParams?.get('next');
      const safeNext =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : '/dashboard';
      router.push(safeNext);
    } catch (e) {
      if (isApiError(e) && e.status === 401) {
        toast.error('Invalid credentials');
      } else if (isApiError(e) && e.code === 'NETWORK_ERROR') {
        toast.error('Can’t reach the server — please try again.');
      } else {
        toast.error('Login failed — please try again.');
      }
      throw new Error('Login failed');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return { user, isAuthenticated, login: handleLogin, logout: handleLogout };
}
