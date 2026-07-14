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

describe('pgErrorToApiError — validation tokens WEAK_PASSWORD / MISSING_FIELDS / CYCLE map to 400 / VALIDATION_ERROR', () => {
  // Input-validation sentinels raised by `create_user` (0003:42, MISSING_FIELDS),
  // `reset_user_password` (0003:88, WEAK_PASSWORD) and `reassign_user` (0004:44
  // MISSING_FIELDS, 0004:54 CYCLE). Pre-fix they fell through to 400 / UNKNOWN — a code
  // the UI can't act on. They now carry VALIDATION_ERROR (status stays 400, which is
  // correct for bad input). CYCLE stays 400/VALIDATION_ERROR (not 409): there is no
  // generic CONFLICT ApiErrorCode, and a would-be-cycle parent is bad input.
  //
  // Reachability (see supabase.ts): only CYCLE fires through an HTTP route
  // (PUT /users/:id { parentId } → reassign_user). WEAK_PASSWORD / MISSING_FIELDS are
  // unreachable via the router by construction — these cases pin the mapping as
  // defense-in-depth, which is exactly why they are unit-tested rather than probed live.
  it('bare WEAK_PASSWORD → 400 / VALIDATION_ERROR', () => {
    const e = pgErrorToApiError(p0001('WEAK_PASSWORD'));
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
  });

  it('bare MISSING_FIELDS → 400 / VALIDATION_ERROR', () => {
    const e = pgErrorToApiError(p0001('MISSING_FIELDS'));
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
  });

  it('colon MISSING_FIELDS: email, password, username required → 400 / VALIDATION_ERROR (message preserved)', () => {
    const e = pgErrorToApiError(p0001('MISSING_FIELDS: email, password, username required'));
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe('MISSING_FIELDS: email, password, username required');
  });

  it('colon CYCLE: new parent is within the target subtree → 400 / VALIDATION_ERROR', () => {
    const e = pgErrorToApiError(p0001('CYCLE: new parent is within the target subtree'));
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
