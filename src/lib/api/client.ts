// Default to a RELATIVE base so MSW (and any same-origin backend) intercepts.
// An absolute 'http://localhost:8080/api' default is fatal on real devices:
// "localhost" there is the phone itself, so every call dies with "Failed to
// fetch". Override with NEXT_PUBLIC_API_URL to point at a real backend.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Thin fetch wrapper with:
 *  - Bearer auth pulled from localStorage.
 *  - Global 401 → wipe token + redirect to /login.
 *  - **Per-call AbortSignal** (audit M-2). Pages kick off queries inside
 *    useEffect; when the user navigates or a new query supersedes the
 *    old one, they can abort via `AbortController.abort()` and we'll
 *    throw a typed `AbortError` instead of racing out-of-order writes
 *    into component state.
 *
 * Error thrown is `AbortError` (DOMException name) when cancelled,
 * regular `Error` otherwise. Callers can do:
 *
 *     try { await api.get(path, { signal: ctrl.signal }); }
 *     catch (e) { if (isAbortError(e)) return; throw e; }
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
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message || `Request failed: ${res.status}`);
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
