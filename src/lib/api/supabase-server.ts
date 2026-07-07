// Server-side Supabase client factory (Phase C — httpOnly cookie sessions).
//
// In real mode (NEXT_PUBLIC_MOCK_API !== 'true') ALL Supabase access runs
// server-side: the browser never holds the access/refresh token. @supabase/ssr
// stores the session in `sb-<ref>-auth-token` cookies; we force them to
// **HttpOnly + Secure + SameSite=Lax** here, which closes audit C-2 — an XSS
// payload can no longer read the session out of document.cookie / localStorage.
//
// This is only safe because there is NO browser Supabase client in this
// architecture (the old client-side adapter is gone). Nothing client-side needs
// to read the cookie, so HttpOnly costs us nothing. @supabase/ssr's default is
// httpOnly:false precisely because its browser client DOES need to read it —
// see node_modules/@supabase/ssr/dist/main/utils/constants.js.
//
// This module imports `next/headers`, which is only available in Route Handlers
// / Server Components — NOT in proxy.ts (middleware). proxy.ts builds its own
// server client inline against the request/response cookie jars and keeps its
// own copy of SUPABASE_COOKIE_OPTIONS (the constant is duplicated on purpose to
// keep this next/headers import out of the middleware bundle).

import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Force the Supabase auth cookies HttpOnly so JS (and thus XSS) can't read the token. */
export const SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

export function supabaseEnv(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing)',
    );
  }
  return { url, anon };
}

/**
 * Supabase client for a Route Handler. Reads the httpOnly session cookies via
 * next/headers `cookies()` and writes refreshed/new session cookies back onto
 * the outgoing response. Create a NEW client per request — never share one.
 */
export async function serverClientFromCookieStore(): Promise<SupabaseClient> {
  const { url, anon } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        // In a Route Handler cookieStore.set() persists to the response. It
        // throws if called during a pure Server Component render; swallow so a
        // read-only render can't crash. Auth mutations always run in the POST
        // handler, where set() is allowed.
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* set() not allowed in this context — ignore */
        }
      },
    },
  });
}
