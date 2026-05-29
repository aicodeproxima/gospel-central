import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side auth gate.
 *
 * Renamed from `middleware.ts` → `proxy.ts` (audit M-08) — the
 * `middleware` filename + export was deprecated in Next.js 16 in favor of
 * `proxy`. Behavior is unchanged.
 *
 * Current state: there is no real backend, so tokens are minted by the
 * MSW mock login handler and mirrored from localStorage into a
 * `diamond-session` cookie (see lib/stores/auth-store.ts) so this
 * proxy can observe them. The cookie is NOT httpOnly — it is
 * readable from JS — so XSS exfiltration is still a risk. This is a
 * known deferred item (audit C-2). When the real Go backend is wired,
 * tokens must move to a Set-Cookie httpOnly SameSite=Lax flow and the
 * localStorage/cookie mirror must be removed.
 *
 * For now this proxy does:
 *   - allow `/login`, `/_next`, `/favicon.ico`, `/mockServiceWorker.js`,
 *     and avatar assets through unconditionally
 *   - redirect any other route to `/login` when the session cookie is
 *     missing or empty
 *   - forward everything else
 *
 * Role-based gating (Reports = Branch Leader+, Admin = Branch Leader+,
 * Settings avatar picker = Team Leader+) is still client-side only until
 * the real backend can attest a role claim we can trust. Pages that need
 * gating call canSeeX() in a useEffect and redirect to /dashboard.
 * Flagged in audit C-1.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/_next',
  '/favicon.ico',
  '/mockServiceWorker.js',
  '/avatars',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root is handled client-side by src/app/page.tsx, which hydrates
  // the auth store and does the correct redirect. Letting middleware
  // see it would bounce returning users whose localStorage token is
  // valid but whose cookie mirror has expired.
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

  const session = request.cookies.get('diamond-session')?.value;
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
