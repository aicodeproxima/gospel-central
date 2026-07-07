// Real-mode API surface (Phase C — httpOnly server proxy).
//
// The browser's api client (src/lib/api/client.ts) fetches same-origin `/api/*`
// in BOTH modes. In mock mode, @mswjs/interceptors intercepts those fetches
// IN-PAGE and this handler is never reached. In real mode (NEXT_PUBLIC_MOCK_API
// !== 'true'), MSW is inactive, so the fetch hits THIS route handler, which runs
// the shared supabase-router against an @supabase/ssr client bound to HttpOnly
// cookies — the access token never enters browser JS (closes audit C-2).
//
// The typed ApiError contract is preserved end-to-end: the router throws
// ApiError; we serialize { message, code, details } + the HTTP status; the
// client reconstructs the same ApiError from the response body.

import { NextResponse, type NextRequest } from 'next/server';
import { serverClientFromCookieStore } from '@/lib/api/supabase-server';
import { supabaseRouter } from '@/lib/api/supabase-router';
import { isApiError } from '@/lib/api/client';

// Route Handlers are dynamic here (they read auth cookies) — never cache.
export const dynamic = 'force-dynamic';

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';

async function handle(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  // Real-mode-only surface. In mock mode MSW intercepts /api/* in-page and this
  // handler is never reached; guard defensively so a stray call can't try to
  // open a Supabase client a demo/mock build isn't configured for.
  if (IS_MOCK) {
    return NextResponse.json({ message: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const { path } = await ctx.params;
  const routePath = '/' + (path ?? []).join('/') + request.nextUrl.search;
  const method = request.method.toUpperCase();

  let body: unknown = undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    body = await request.json().catch(() => undefined);
  }

  try {
    const db = await serverClientFromCookieStore();
    const data = await supabaseRouter(db, method, routePath, body);
    return NextResponse.json(data ?? null);
  } catch (err) {
    if (isApiError(err)) {
      const status = err.status >= 400 && err.status <= 599 ? err.status : 400;
      return NextResponse.json(
        { message: err.message, code: err.code, details: err.details },
        { status },
      );
    }
    // Unexpected (non-ApiError) failure — Supabase misconfig, thrown non-Error, etc.
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ message, code: 'UNKNOWN' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
