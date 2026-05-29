const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

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
 * `ApiError` for HTTP failures, regular `Error` for network failures.
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
 */
export type ApiErrorCode =
  | 'PERMISSION_DENIED'
  | 'BLOCKED_SLOT_CONFLICT'
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
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        signal: init.signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(
        err instanceof Error ? err.message : 'Network request failed',
      );
    }

    if (res.status === 401) {
      try {
        localStorage.removeItem('token');
      } catch {
        /* noop */
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
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

  delete<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { method: 'DELETE', ...options });
  }
}

export const api = new ApiClient();
