/**
 * supabase-errors — pins pgErrorToApiError()'s PG-token → typed ApiError mapping.
 *
 * The SECURITY-DEFINER RPCs across supabase/migrations/0002–0014 raise their
 * sentinel token in TWO shapes:
 *   - BARE:  `raise exception 'PERMISSION_DENIED'`               (the common case:
 *            PERMISSION_DENIED ×33, NOT_FOUND ×18, UNAUTHORIZED ×2, all colon-less)
 *   - COLON: `raise exception 'ROOM_CONFLICT: room already booked …'`
 *
 * PostgREST surfaces both as HTTP 400 { code:'P0001', message:'<token…>' }. The
 * mapper must recover the token from EITHER shape so the UI's `e.status === 403`
 * / `e.code === 'PERMISSION_DENIED'` branches fire. A regression here (only the
 * colon shape mapped) silently downgraded every bare denial to 400 / UNKNOWN.
 */

import { describe, expect, it } from 'vitest';
import { pgErrorToApiError } from './supabase';

const p0001 = (message: string) => ({ message, code: 'P0001' });

describe('pgErrorToApiError — bare tokens (no colon) map to their real status', () => {
  it('bare PERMISSION_DENIED → 403 / PERMISSION_DENIED', () => {
    const e = pgErrorToApiError(p0001('PERMISSION_DENIED'));
    expect(e.status).toBe(403);
    expect(e.code).toBe('PERMISSION_DENIED');
  });

  it('bare NOT_FOUND → 404 / NOT_FOUND', () => {
    const e = pgErrorToApiError(p0001('NOT_FOUND'));
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
  });

  it('bare UNAUTHORIZED → 401 / UNAUTHORIZED', () => {
    const e = pgErrorToApiError(p0001('UNAUTHORIZED'));
    expect(e.status).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('bare ALREADY_CONVERTED → 409 / ALREADY_CONVERTED', () => {
    const e = pgErrorToApiError(p0001('ALREADY_CONVERTED'));
    expect(e.status).toBe(409);
    expect(e.code).toBe('ALREADY_CONVERTED');
  });
});

describe('pgErrorToApiError — colon-bearing tokens still map (regression guard)', () => {
  it('PERMISSION_DENIED: cannot edit this contact → 403', () => {
    const e = pgErrorToApiError(p0001('PERMISSION_DENIED: cannot edit this contact'));
    expect(e.status).toBe(403);
    expect(e.code).toBe('PERMISSION_DENIED');
    // full message preserved for the UI toast
    expect(e.message).toBe('PERMISSION_DENIED: cannot edit this contact');
  });

  it('ROOM_CONFLICT: room already booked … → 409 / ROOM_CONFLICT', () => {
    const e = pgErrorToApiError(p0001('ROOM_CONFLICT: room already booked for that time'));
    expect(e.status).toBe(409);
    expect(e.code).toBe('ROOM_CONFLICT');
  });

  it('INVALID_TEACHER: … → 400 / VALIDATION_ERROR', () => {
    const e = pgErrorToApiError(p0001('INVALID_TEACHER: assigned teacher must be active'));
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
  });
});

describe('pgErrorToApiError — non-token messages fall through unchanged', () => {
  it('a plain colon-bearing PostgREST message is NOT mistaken for a token', () => {
    // A colon here must not misfire the token path — the head is not in the map,
    // so it falls through to the default 400 / UNKNOWN.
    const e = pgErrorToApiError(
      p0001('duplicate key value violates unique constraint: contacts_pkey'),
    );
    expect(e.status).toBe(400);
    expect(e.code).toBe('UNKNOWN');
  });

  it('a bare non-token sentence stays 400 / UNKNOWN', () => {
    const e = pgErrorToApiError(p0001('Request failed'));
    expect(e.status).toBe(400);
    expect(e.code).toBe('UNKNOWN');
  });

  it('leading/trailing whitespace around a bare token is tolerated', () => {
    const e = pgErrorToApiError(p0001('  NOT_FOUND  '));
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
  });

  it('a raw PostgREST unique-violation (23505) → 409 / VALIDATION_ERROR', () => {
    const e = pgErrorToApiError({ message: 'dup', code: '23505' });
    expect(e.status).toBe(409);
    expect(e.code).toBe('VALIDATION_ERROR');
  });

  it('an error carrying an explicit HTTP status is honored', () => {
    const e = pgErrorToApiError({ message: 'nope', status: 403 });
    expect(e.status).toBe(403);
    expect(e.code).toBe('PERMISSION_DENIED');
  });
});
