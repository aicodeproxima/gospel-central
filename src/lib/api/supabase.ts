// Supabase transport adapter (Phase B→C of the FE↔BE cutover).
//
// The rest of src/lib/api/* keeps speaking camelCase + the ApiError contract. This
// module is the pure, CLIENT-AGNOSTIC boundary that: (1) deep-converts snake_case DB
// rows ↔ camelCase app shapes, and (2) maps PostgREST / PG (P0001 + token) errors →
// the typed ApiError the UI already handles. A SupabaseClient is INJECTED by the
// caller — Phase C runs the router SERVER-SIDE (src/app/api/[...path]/route.ts) with
// an @supabase/ssr client bound to HttpOnly cookies (supabase-server.ts), so the
// access token never reaches browser JS (closes audit C-2). There is no browser
// Supabase client anymore. Used only when NEXT_PUBLIC_MOCK_API !== 'true'; mock mode
// keeps the fetch layer in client.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type ApiErrorCode } from './client';

/* ---------------------------------------------------------------- case transforms */
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

function deepMap(value: unknown, keyFn: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => deepMap(v, keyFn));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[keyFn(k)] = deepMap(v, keyFn);
    }
    return out;
  }
  return value;
}
/** DB row(s) → app shape. */
export const camelize = <T = unknown>(v: unknown): T => deepMap(v, toCamel) as T;
/** App payload → DB columns. */
export const snakeize = <T = unknown>(v: unknown): T => deepMap(v, toSnake) as T;

/* ---------------------------------------------------------------- error mapping */
// Backend RPCs raise `<TOKEN>: message` on PG errcode P0001; PostgREST surfaces that as
// HTTP 400 with { code:'P0001', message:'<TOKEN>: ...' }. Map TOKEN → ApiErrorCode + the
// HTTP status the UI expects, so `e.status === 409` / `e.code === 'PERMISSION_DENIED'`
// call sites keep working. (RLS-denied SELECTs return no error, just [] — handled by callers.)
const TOKEN_TO_CODE: Record<string, { code: ApiErrorCode; status: number }> = {
  PERMISSION_DENIED: { code: 'PERMISSION_DENIED', status: 403 },
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401 },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
  BLOCKED_SLOT_CONFLICT: { code: 'BLOCKED_SLOT_CONFLICT', status: 409 },
  ROOM_CONFLICT: { code: 'ROOM_CONFLICT', status: 409 },
  TEACHER_CONFLICT: { code: 'TEACHER_CONFLICT', status: 409 },
  INVALID_TEACHER: { code: 'VALIDATION_ERROR', status: 400 },
  USERNAME_TAKEN: { code: 'USERNAME_TAKEN', status: 409 },
  EMAIL_TAKEN: { code: 'EMAIL_TAKEN', status: 409 },
  ROOM_NAME_TAKEN: { code: 'ROOM_NAME_TAKEN', status: 409 },
  INVALID_USERNAME: { code: 'INVALID_USERNAME', status: 400 },
};

interface PgLikeError { message?: string; code?: string; details?: string; hint?: string; status?: number }

/** Convert a supabase-js / PostgREST error into the app's typed ApiError. */
export function pgErrorToApiError(err: PgLikeError | null | undefined): ApiError {
  const msg = err?.message ?? 'Request failed';
  const token = msg.includes(':') ? msg.split(':')[0].trim() : '';
  const mapped = TOKEN_TO_CODE[token];
  if (mapped) {
    return new ApiError({ status: mapped.status, code: mapped.code, message: msg, details: err });
  }
  // PostgREST unique-violation (23505) etc. or a raw HTTP status on the error.
  if (err?.code === '23505') {
    return new ApiError({ status: 409, code: 'VALIDATION_ERROR', message: msg, details: err });
  }
  const httpStatus = typeof err?.status === 'number' ? err.status : 400;
  const code: ApiErrorCode = httpStatus === 401 ? 'UNAUTHORIZED' : httpStatus === 403 ? 'PERMISSION_DENIED'
    : httpStatus === 404 ? 'NOT_FOUND' : 'UNKNOWN';
  return new ApiError({ status: httpStatus, code, message: msg, details: err });
}

/* ---------------------------------------------------------------- thin helpers */
/** Run a PostgREST/RPC promise, throw a typed ApiError on error, camelize the data. */
export async function sb<T = unknown>(
  p: PromiseLike<{ data: unknown; error: PgLikeError | null }>,
): Promise<T> {
  const { data, error } = await p;
  if (error) throw pgErrorToApiError(error);
  return camelize<T>(data);
}

/** Call a SECURITY-DEFINER RPC with a camelCase arg object (snakeized for the DB). */
export async function rpc<T = unknown>(
  client: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return sb<T>(client.rpc(fn, args ? (snakeize(args) as Record<string, unknown>) : undefined));
}
