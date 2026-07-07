// The mock network layer is SW-free since Loop 10: src/mocks/browser.ts
// patches window.fetch/XHR in-page via @mswjs/interceptors — there is NO
// MSW service worker, so interception is synchronous and active before the
// first render. A mock-mode network failure is therefore genuine (no
// "SW not yet controlling the page" grace window exists), and request()
// below correctly makes exactly one attempt with no retries.
//
// Mock mode: same-origin '/api' so a request the in-page interceptor fails to
// match dies as a fast same-origin 404 instead of an iOS-Safari mixed-content
// block (http://localhost from an HTTPS page is silently blocked on WebKit).
//
// Single source of truth for the API base — import this; never re-derive
// this expression elsewhere. Both BROWSER modes resolve same-origin '/api':
//   - mock: @mswjs/interceptors matches the request in-page (SW-free).
//   - real (Phase C): the request hits the Next Route Handler at
//     src/app/api/[...path]/route.ts, which runs the RLS router server-side
//     against HttpOnly cookies. (The dead localhost:8080 backend is retired as
//     a browser target.)
// In Node (vitest / SSR) there is no page origin, so a relative '/api' can't be
// used with new URL()/fetch(); fall back to an absolute base. api.* is only ever
// called browser-side, so this Node value is used ONLY by the mock integration
// tests (which register MSW handlers against this same base) and by
// isDeadBackendBuild's localhost sentinel — never by real SSR/route handlers.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === 'undefined' ? 'http://localhost:8080/api' : '/api');

/**
 * Thin fetch wrapper with:
 *  - Bearer auth pulled from localStorage.
 *  - Global 401 → wipe token + redirect to /login.
 *  - **Per-call AbortSignal** (audit M-2).
 *  - **Typed `ApiError` for non-2xx responses** (audit BE-3) — callers can
 *    distinguish 403 (permission) from 409 (conflict, e.g. blocked-slot
 *    overlap, taken username) without parsing message strings.
 *
 * Error thrown is `AbortError` (DOMException name) when cancelled,
 * `ApiError` for HTTP failures, and `ApiError` with `status: 0` /
 * `code: 'NETWORK_ERROR'` for transport failures (fetch rejected).
 * Callers can do:
 *
 *     try { await api.get(path, { signal: ctrl.signal }); }
 *     catch (e) {
 *       if (isAbortError(e)) return;
 *       if (isApiError(e) && e.status === 409) showConflict(e.details);
 *       throw e;
 *     }
 */

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * Skip the global 401 → wipe-token + redirect-to-/login behavior.
   * Used by login itself: a wrong-password 401 must surface as a typed
   * ApiError to the caller, not bounce the user through a redirect.
   */
  skipAuthRedirect?: boolean;
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}

/**
 * Documented error codes the backend should mirror — see
 * docs/BACKEND_GAPS.md "Cross-cutting contracts" section.
 *
 * Note: `NETWORK_ERROR` (transport failure) and the global-401-path
 * `UNAUTHORIZED` are synthesized by this client, not backend body codes.
 */
export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'PERMISSION_DENIED'
  | 'BLOCKED_SLOT_CONFLICT'
  | 'ROOM_CONFLICT'
  | 'TEACHER_CONFLICT'
  | 'USERNAME_TAKEN'
  | 'EMAIL_TAKEN'
  | 'ROOM_NAME_TAKEN'
  | 'INVALID_USERNAME'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

/**
 * ApiError — typed wrapper for non-2xx responses.
 *
 * Properties:
 *   - status: HTTP status code (403, 409, etc.)
 *   - code:   stable string code from the backend body, or 'UNKNOWN'
 *   - message: human-readable text (safe to display)
 *   - details: anything extra the backend returned (conflict context, etc.)
 */
export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;
  constructor(opts: {
    status: number;
    code?: ApiErrorCode;
    message: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code ?? 'UNKNOWN';
    this.details = opts.details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  }

  private async request<T>(
    path: string,
    init: RequestInit & RequestOptions = {},
  ): Promise<T> {
    // Keep skipAuthRedirect out of the actual fetch init — it's our own
    // option, not a RequestInit field.
    const { skipAuthRedirect, ...fetchInit } = init;

    // Both modes fetch same-origin API_BASE ('/api'). Mock: @mswjs/interceptors
    // answers in-page. Real (Phase C): the fetch reaches the Next Route Handler,
    // which runs the RLS router SERVER-SIDE; the session travels as an HttpOnly
    // cookie — there is no client-side supabase-js and no bearer token. getToken()
    // is a mock-only leftover (null in real mode, since auth-store never persists
    // a token there), so no Authorization header is sent in real mode.
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchInit.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...fetchInit,
        headers,
        // Send the HttpOnly session cookie on same-origin /api requests (real
        // mode). 'same-origin' is the fetch default, set explicitly for intent.
        credentials: 'same-origin',
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network request failed',
      });
    }

    if (res.status === 401 && !skipAuthRedirect) {
      try {
        localStorage.removeItem('token');
      } catch {
        /* noop */
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError({
        status: 401,
        // 401 = "authentication required" — PERMISSION_DENIED is reserved
        // for 403 (docs/BACKEND_GAPS.md cross-cutting contracts).
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: ApiErrorCode;
        details?: unknown;
      };
      throw new ApiError({
        status: res.status,
        code: body.code,
        message: body.message || `Request failed: ${res.status}`,
        details: body.details,
      });
    }

    return res.json();
  }

  get<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, options);
  }

  post<T>(path: string, data?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options,
    });
  }

  put<T>(path: string, data?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options,
    });
  }

  patch<T>(path: string, data?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
      ...options,
    });
  }

  delete<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { method: 'DELETE', ...options });
  }
}

export const api = new ApiClient();
