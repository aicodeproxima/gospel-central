import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Server-side auth gate.
 *
 * Renamed from `middleware.ts` → `proxy.ts` (audit M-08) — the
 * `middleware` filename + export was deprecated in Next.js 16 in favor of
 * `proxy`.
 *
 * MOCK MODE (NEXT_PUBLIC_MOCK_API === 'true' — permanent dev/demo layer):
 * tokens are minted by the MSW mock login handler and mirrored from
 * localStorage into a `gospel-central-session` cookie (see
 * lib/stores/auth-store.ts) so this proxy can observe them. The cookie is
 * NOT httpOnly (audit C-2, accepted for the demo layer) and this gate only
 * checks presence, not validity.
 *
 * SUPABASE MODE (Phase C of the cutover): the session lives in supabase's
 * own `sb-*` auth cookies (set by createBrowserClient in
 * src/lib/api/supabase.ts). Here we build an @supabase/ssr server client
 * bound to the request cookies and call getUser(), which BOTH validates the
 * session against GoTrue AND refreshes an expired access token — the
 * refreshed cookies are written onto the response. A request with no valid
 * session is redirected to /login. This replaces the presence-only check
 * with real validation; the legacy gospel-central-session cookie is ignored
 * in this mode.
 *
 * Role-based gating (Reports/Admin = Branch Leader+) remains client-side
 * UX; in supabase mode the actual enforcement is RLS in the database, so a
 * spoofed client can render a shell but reads/writes come back empty/403.
 */
const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';

const PUBLIC_PREFIXES = [
  '/login',
  '/_next',
  '/favicon.ico',
  '/avatars',
  // Public build manifest for the "update available" check (no secrets). Must
  // bypass the auth gate, or the detector's cookieless fetch gets redirected to
  // the login HTML and JSON.parse fails.
  '/version.json',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root is handled client-side by src/app/page.tsx, which hydrates
  // the auth store and does the correct redirect. Letting middleware
  // see it would bounce returning users whose client-side session is
  // valid but whose cookies haven't refreshed yet.
  if (pathname === '/') {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Let React Server Component fetches (client-side nav + prefetches)
  // through regardless of cookie state. Next.js sets the `RSC` header
  // (value "1") on these requests. Blocking them was what caused the
  // "menus don't work" regression for users whose localStorage token
  // was valid but whose diamond-session cookie had gone missing — the
  // client router would silently follow the middleware redirect chain
  // and leave them on the page they started from. Full document loads
  // still get gated below.
  if (request.headers.get('RSC') || request.headers.get('Next-Router-Prefetch')) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!IS_MOCK && supabaseUrl && supabaseAnon) {
    // `response` is recreated inside setAll so refreshed auth cookies land on
    // whatever we ultimately return (the documented @supabase/ssr pattern).
    let response = NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // getUser() validates against GoTrue (not just cookie presence) and
    // performs the token refresh when the access token has expired.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(url);
      // Carry over any cookie mutations (e.g. cleared stale auth cookies).
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }

    return response;
  }

  // Mock mode (and the defensive fallback for a real build missing its
  // Supabase env — the client-side dead-backend banner surfaces that case):
  // presence-only cookie gate. Accept the legacy `diamond-session` cookie
  // from the Diamond→Gospel Central rename so active sessions aren't booted.
  const session =
    request.cookies.get('gospel-central-session')?.value ||
    request.cookies.get('diamond-session')?.value;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
