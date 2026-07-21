import { http, HttpResponse } from 'msw';
import {
  mockUsers,
  mockAreas,
  mockBookings,
  mockBlockedSlots,
  mockContacts,
  mockTeacherMetrics,
  mockAuditLog,
} from './data';
import { getStudyByTitle } from '../lib/curriculum';
import {
  buildVisibilityScope,
  buildManageableScope,
  canChangeRole,
  canEditBooking,
  canSetBookingStatus,
  canCreateContact,
  canConvertContact,
  canEditContact,
  canDeleteContact,
  canViewContact,
  canViewUser,
  canReassignContact,
  canChangeUsername,
  canAccessReports,
  assignableRoles,
  canCreateArea,
  canCreateRoom,
  canCreateUser,
  canDeactivateUser,
  canEditUser,
  canManageArea,
  canManageBlockedSlot,
  canManageRoom,
  canManageTags,
  canReassignUserToGroup,
  canResetPassword,
  getRoleLevel,
  isAdminTier,
  resolveExportImportEnabled,
  EXPORT_IMPORT_FOR_NON_ADMINS,
} from '../lib/utils/permissions';
import type { User } from '../lib/types/user';
import type { Contact } from '../lib/types/contact';
import { UserRole } from '../lib/types/user';
import { PipelineStage, PIPELINE_STAGE_CONFIG } from '../lib/types/contact';
import { BOOKING_STATUS_CONFIG, type Booking, type BookingStatus } from '../lib/types/booking';
import type { AuditLogEntry } from '../lib/types/group';
import { buildOrgTree } from '../lib/utils/org-tree';
import { API_BASE } from '../lib/api/client';

// IMPORTS the single source of truth (API_BASE in src/lib/api/client.ts), so
// the handler patterns match whatever URL the client actually requests by
// construction. In Node/vitest it resolves to the absolute localhost URL
// (NEXT_PUBLIC_MOCK_API unset); in the browser mock build it resolves '/api',
// and MSW resolves relative handler patterns against location.origin.
const API = API_BASE;

/**
 * Mutable in-memory copies so PUT/DELETE/POST actually mutate and subsequent
 * GETs reflect the change.
 *
 * PERSISTENCE (2026-07-18, product decision): in the browser, state is
 * snapshotted to localStorage after every mocked response and rehydrated on
 * load — created accounts and edits survive reload AND logout on the same
 * device. (Cross-device is impossible for an in-page mock; the real backend
 * is the multi-device answer.) Persistence is armed ONLY by
 * initMockPersistence() from src/mocks/browser.ts — in vitest the save/load
 * paths stay inert, so tests always see the seed. resetMockState() remains as
 * the manual reseed escape hatch (test cell-isolation) and deletes the
 * snapshot so a reset stays reset.
 *
 * NOTE: `resetMockState` truncates the audit log to the seed. This is a
 * MOCK-ONLY behavior — the real backend's audit log is append-only per
 * docs/PERMISSIONS.md and must NEVER expose anything analogous. Do not
 * generalize this pattern. (AUDIT-6.)
 */
const contactsState = [...mockContacts];
const bookingsState = [...mockBookings];
const usersState = [...mockUsers];
const blockedSlotsState = [...mockBlockedSlots];
// Areas state — deep-cloned so room mutations don't leak into mockAreas.
const areasState = mockAreas.map((a) => ({ ...a, rooms: a.rooms.map((r) => ({ ...r })) }));
const initialAuditLogLength = mockAuditLog.length;

/**
 * Per-group CSV export/import overrides, keyed by org-node id (the Branch /
 * Group / Team leader's user id). Value true = On, false = Off; an absent
 * key = "inherit from the parent node, else the global
 * EXPORT_IMPORT_FOR_NON_ADMINS default". Resolved per user by
 * resolveExportImportEnabled and stamped onto the user at /login + /me.
 *
 * DELIBERATELY NOT cleared by resetMockState(): this models server-side org
 * configuration, not per-demo-session data, so an admin can set a toggle,
 * log out, and log back in as an affected member to see the effect. It still
 * resets on a full page reload (module scope). The seed re-inserts the SAME
 * user objects on reset, so these node-id keys stay valid across a reset.
 */
const orgExportImportOverrides: Record<string, boolean> = {};

/**
 * Stamp the server-computed effective `exportImportEnabled` flag onto a user
 * before returning it (login / me). Keeps the User record itself clean — the
 * flag is derived, never stored.
 */
function withEffectiveFlags(user: User): User {
  return {
    ...user,
    exportImportEnabled: resolveExportImportEnabled(
      user.id,
      usersState as User[],
      orgExportImportOverrides,
    ),
  };
}

/**
 * Error-log buffer for the per-user audit's recommended insurance:
 * the dashboard's <ErrorBoundary> POSTs structured reports here when
 * a render / lifecycle error escapes. Mike's backend swaps this for
 * Sentry/Datadog. Capped at the most recent 200 entries so a chatty
 * runaway loop doesn't blow up MSW memory.
 */
interface ErrorLogEntry {
  id: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  viewerId: string;
  viewerRole: string;
  viewerUsername: string | null;
  url: string;
  userAgent: string;
  timestamp: string;
}
const errorLogState: ErrorLogEntry[] = [];
const ERROR_LOG_CAP = 200;

/**
 * Per-user password store (userId → password), kept OUT of the User record so
 * it can never leak into an API response. Seeded users absent here fall back
 * to 'admin'. Wizard/convert temp passwords, admin resets, and self
 * change-password all write REAL entries (2026-07-18 hardening): the old
 * "any non-empty password logs in a non-seeded user" demo bypass is gone, so
 * a credential behaves like the real backend's — a reset password actually
 * takes effect, and a temp password is required for the account it was
 * issued to.
 */
const mockPasswords: Record<string, string> = {};
const passwordFor = (userId: string): string => mockPasswords[userId] ?? 'admin';

export function resetMockState() {
  contactsState.splice(0, contactsState.length, ...mockContacts);
  bookingsState.splice(0, bookingsState.length, ...mockBookings);
  usersState.splice(0, usersState.length, ...mockUsers);
  blockedSlotsState.splice(0, blockedSlotsState.length, ...mockBlockedSlots);
  areasState.splice(
    0,
    areasState.length,
    ...mockAreas.map((a) => ({ ...a, rooms: a.rooms.map((r) => ({ ...r })) })),
  );
  // Trim any audit log entries that accumulated during this session.
  if (mockAuditLog.length > initialAuditLogLength) {
    mockAuditLog.splice(initialAuditLogLength);
  }
  // Clear the error-log buffer so a fresh demo session starts clean.
  errorLogState.splice(0, errorLogState.length);
  // Passwords fall back to 'admin' for every account again.
  for (const k of Object.keys(mockPasswords)) delete mockPasswords[k];
  // A manual reset deletes the snapshot so the reseed survives the next load.
  clearMockSnapshot();
}

/* ---- per-device persistence (browser only; armed by initMockPersistence) ---- */
const SNAPSHOT_KEY = 'gc-mock-v1';
let persistenceArmed = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Delete the persisted snapshot (no-op until armed / outside a browser). */
export function clearMockSnapshot() {
  if (!persistenceArmed || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Write the full mutable state to localStorage (no-op until armed). */
export function saveMockSnapshot() {
  if (!persistenceArmed || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        v: 1,
        users: usersState,
        contacts: contactsState,
        bookings: bookingsState,
        blockedSlots: blockedSlotsState,
        areas: areasState,
        auditLog: mockAuditLog,
        errorLog: errorLogState,
        overrides: orgExportImportOverrides,
        passwords: mockPasswords,
      }),
    );
  } catch {
    /* quota / private mode — stay in-memory for this session */
  }
}

/** Debounced save fired by browser.ts after every mocked response. */
export function scheduleMockSnapshot() {
  if (!persistenceArmed || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveMockSnapshot();
  }, 400);
}

/**
 * Rehydrate mutable state from the last snapshot (exported for tests;
 * browser startup goes through initMockPersistence). A version or shape
 * mismatch leaves the seed standing.
 */
export function loadMockSnapshot() {
  if (!persistenceArmed || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s?.v !== 1 || !Array.isArray(s.users) || !Array.isArray(s.contacts) || !Array.isArray(s.bookings)) return;
    usersState.splice(0, usersState.length, ...s.users);
    contactsState.splice(0, contactsState.length, ...s.contacts);
    bookingsState.splice(0, bookingsState.length, ...s.bookings);
    if (Array.isArray(s.blockedSlots)) blockedSlotsState.splice(0, blockedSlotsState.length, ...s.blockedSlots);
    if (Array.isArray(s.areas)) areasState.splice(0, areasState.length, ...s.areas);
    if (Array.isArray(s.auditLog)) mockAuditLog.splice(0, mockAuditLog.length, ...s.auditLog);
    if (Array.isArray(s.errorLog)) errorLogState.splice(0, errorLogState.length, ...s.errorLog);
    if (s.overrides && typeof s.overrides === 'object') Object.assign(orgExportImportOverrides, s.overrides);
    if (s.passwords && typeof s.passwords === 'object') Object.assign(mockPasswords, s.passwords);
  } catch {
    /* corrupt snapshot — the seed stands */
  }
}

/**
 * Arm persistence and rehydrate — called ONCE from startMockNetwork (browser
 * only). Also flushes on tab-hide so a session's final mutation isn't lost
 * to the debounce window. Never armed in vitest: tests always see the seed.
 */
export function initMockPersistence() {
  if (persistenceArmed || typeof localStorage === 'undefined') return;
  persistenceArmed = true;
  loadMockSnapshot();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveMockSnapshot();
    });
  }
}

/**
 * Resolve an actor user record from an `actorId` body field. The mock
 * frontend passes the current user's id with every mutation so the audit
 * log can attribute the action; real backend will read this from the JWT.
 */
function resolveActor(actorId: string | undefined): { id: string; name: string } {
  const id = actorId ?? 'unknown';
  const u = usersState.find((x) => x.id === id);
  const name = u
    ? `${u.firstName} ${u.lastName}`.trim() || u.username
    : id;
  return { id, name };
}

/** Flatten + drop falsy + dedupe user ids for an audit entry's relatedUserIds. */
function relatedUsers(...ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

/** Typed choke point for audit rows. Requires relatedUserIds (compile-time
 *  omission-proofing — a push that forgets it fails tsc), otherwise identical
 *  to mockAuditLog.push (preserves each site's own id/timestamp semantics). */
type AuditInput = Omit<AuditLogEntry, 'relatedUserIds'> & { relatedUserIds: string[] };
function pushAudit(entry: AuditInput): void {
  mockAuditLog.push(entry);
}

/**
 * Resolve the full viewer User record for permission checks. The mock JWT in
 * the Authorization header (`mock-jwt-token-${userId}`) is the ONLY canonical
 * source — `body.actorId` is deliberately IGNORED (see the impersonation-hole
 * fix below), so a spoofed actorId can never override the authenticated user.
 * The `_body` param is retained only for call-site signature compatibility.
 *
 * §7 SHIM: returning `undefined` on no match means the permission helpers
 * receive a missing viewer and return false → 403 PERMISSION_DENIED.
 * This mirrors what Mike's middleware will do once the real JWT is wired
 * up: every mutation re-runs the appropriate helper from permissions.ts
 * with the resolved viewer.
 */
function resolveViewer(
  request: Request,
  _body?: { actorId?: string } | Record<string, unknown>,
): User | undefined {
  // Non-Critical scenario #11-b fix (impersonation hole): the JWT in the
  // Authorization header is the ONLY canonical viewer source.
  //
  // Pre-fix path 1: `body.actorId` was checked BEFORE the JWT, letting a
  //   Member impersonate Dev by setting `actorId: 'u-michael'` in the body.
  // Pre-fix path 2: even after flipping the order so JWT was checked first,
  //   the fallback to `body.actorId` STILL allowed anonymous impersonation
  //   (no JWT + body.actorId='u-michael' → resolved as Dev).
  //
  // Mike's real backend will only trust the JWT — no body-supplied actor
  // ever overrides the authenticated user. The shim now mirrors that:
  // when no JWT is present (or it's unparseable), return undefined so the
  // calling handler responds with 401 UNAUTHORIZED.
  //
  // The `_body` parameter is kept (prefixed with underscore) for backward
  // signature-compatibility with existing call sites; it is intentionally
  // unused. The FE convention of redundantly sending `actorId` in mutation
  // bodies still works because the JWT resolves first.
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+mock-jwt-token-(.+)$/i);
  if (!match) return undefined;
  const u = usersState.find((x) => x.id === match[1]);
  return u ? (u as User) : undefined;
}

/**
 * Standard 403 response for the §7 permission shim. Uses
 * `code: 'PERMISSION_DENIED'` to match the contract Mike will ship so
 * the FE error handler can render a consistent toast in either mode.
 *
 * SEMANTIC NOTE (Critical scenario #21 fix): use this ONLY when the
 * viewer is authenticated but the action is forbidden. For "no viewer
 * found / token expired / missing auth" use `unauthorized()` below
 * which returns 401 — the FE error handler branches on the difference
 * to route the user to /login (401) vs show a "you don't have
 * permission" toast (403).
 */
function permissionDenied(reason = 'Permission denied') {
  return HttpResponse.json(
    { message: reason, code: 'PERMISSION_DENIED' },
    { status: 403 },
  );
}

/**
 * Standard 401 response for "no viewer / expired token / missing auth"
 * paths. This is the HTTP-correct semantic for "authentication required"
 * — distinct from `permissionDenied()` which means "authenticated but
 * forbidden". Critical scenario #21 from docs/SCENARIO_TESTS.md surfaced
 * the conflation: the §7 shim originally returned 403 for both cases,
 * making it impossible for the FE to distinguish "log in again" from
 * "you don't have permission".
 */
function unauthorized(reason = 'Authentication required') {
  return HttpResponse.json(
    { message: reason, code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}

/**
 * Standard 400 with `code: 'VALIDATION_ERROR'` so the FE error renderer
 * can disambiguate between "bad input" and "permission denied".
 */
function validationError(reason: string) {
  return HttpResponse.json(
    { message: reason, code: 'VALIDATION_ERROR' },
    { status: 400 },
  );
}

/**
 * Standard 405 Method Not Allowed for write attempts against append-only
 * resources. Critical scenario #22 from docs/SCENARIO_TESTS.md (audit log
 * tamper) drove this: the audit log MUST reject PUT/PATCH/DELETE/POST
 * tamper attempts even from the highest-privilege user. Without explicit
 * 405 handlers the requests fall through to Next.js routing and return
 * 404 — technically 4xx but ambiguous about *why*. The §7.7 contract
 * Mike will ship deserves an explicit 405.
 */
function methodNotAllowed(reason: string) {
  return HttpResponse.json(
    { message: reason, code: 'METHOD_NOT_ALLOWED' },
    { status: 405 },
  );
}

/** Helper for visibility-scope-restricted permission checks (READ scope; a
 *  Branch Leader sees the whole org, so this returns an EMPTY userIds set for a
 *  BL — kind 'all'). Correct for READ gates and for helpers that short-circuit
 *  on isAdminTier (canEditBooking, canCreateContact). WRONG for the contact
 *  edit/delete/convert gates below — those helpers have NO isAdminTier
 *  short-circuit, so an empty set false-403s a Branch Leader. Use
 *  `viewerManageableUserIds` there. */
function viewerSubtreeUserIds(viewer: User): string[] {
  return buildVisibilityScope(viewer, usersState as User[]).userIds;
}

/** Helper for WRITE-scope permission checks — the subtree a viewer may
 *  *administer* (buildManageableScope). REV3 #20 (user-approved reversal): a
 *  Branch Leader's set now spans EVERY branch subtree — exactly what the real
 *  backend's `manageable_user_ids(auth.uid())` (migration 0018) returns inside
 *  the contacts_update RLS / set_contact_teacher / set_contact_inactive RPCs.
 *  Pass this to canEditContact / canDeleteContact / canConvertContact. */
function viewerManageableUserIds(viewer: User): string[] {
  return buildManageableScope(viewer, usersState as User[]).userIds;
}

/** REV3 #20: a Branch Leader's peer-branch write is LEGAL now, but audit-
 *  flagged — true when a BL acts on a contact owned outside their OWN branch
 *  subtree. Mirrors audit_log.cross_branch (0018's audit_row computes the
 *  same predicate server-side). */
function isCrossBranchWrite(viewer: User, ownerId: string | undefined): boolean {
  if (viewer.role !== UserRole.BRANCH_LEADER || !ownerId) return false;
  if (ownerId === viewer.id) return false;
  return !subtreeUserRecords(viewer.id).some((u) => u.id === ownerId);
}

/**
 * Every user record in a node's subtree — the node itself plus all descendants
 * reached via parentId. Cycle-safe (a `seen` set). Used by the cascade
 * deactivate/restore so a whole branch can be removed without orphaning its
 * members. Returns the root first.
 */
function subtreeUserRecords(rootId: string): User[] {
  const out: User[] = [];
  const seen = new Set<string>();
  const queue: string[] = [rootId];
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const u = usersState.find((x) => x.id === id);
    if (!u) continue;
    out.push(u as User);
    for (const c of usersState) {
      if (c.parentId === id && !seen.has(c.id)) queue.push(c.id);
    }
  }
  return out;
}

/**
 * BLOCK-2 helper: returns the active blocked-slot record that the booking's
 * (areaId, startTime, endTime) tuple would overlap, or undefined.
 * Mirrors the logic in `src/lib/utils/availability.ts:findOverlappingBlockedSlot`
 * but reads from the live `blockedSlotsState` so admin-created blocks take
 * effect immediately.
 */
function findBookingBlockedConflict(body: Record<string, unknown>):
  | { id: string; reason: string; scope: string }
  | undefined {
  const start = typeof body.startTime === 'string' ? new Date(body.startTime) : null;
  const end = typeof body.endTime === 'string' ? new Date(body.endTime) : null;
  const areaId = typeof body.areaId === 'string' ? body.areaId : undefined;
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return undefined;

  for (const slot of blockedSlotsState) {
    if (slot.isActive === false) continue;
    if (slot.scope === 'area' && slot.areaId !== areaId) continue;

    if (slot.recurrence === 'weekly') {
      if (slot.dayOfWeek !== start.getDay()) continue;
      if (!slot.startTime || !slot.endTime) continue;
      const [bsh, bsm] = slot.startTime.split(':').map(Number);
      const [beh, bem] = slot.endTime.split(':').map(Number);
      const bsMin = bsh * 60 + bsm;
      const beMin = beh * 60 + bem;
      const ssMin = start.getHours() * 60 + start.getMinutes();
      const seMin = end.getHours() * 60 + end.getMinutes();
      if (bsMin < seMin && beMin > ssMin) {
        return { id: slot.id, reason: slot.reason, scope: slot.scope };
      }
    } else if (slot.recurrence === 'one-off') {
      if (!slot.startDateTime || !slot.endDateTime) continue;
      const bs = new Date(slot.startDateTime).getTime();
      const be = new Date(slot.endDateTime).getTime();
      if (bs < end.getTime() && be > start.getTime()) {
        return { id: slot.id, reason: slot.reason, scope: slot.scope };
      }
    }
  }
  return undefined;
}

/**
 * findBookingRoomConflict — Critical scenarios #7, #16, #25 fix.
 *
 * Detects whether the requested booking would overlap an *existing* active
 * booking on the same room. Catches three production landmines surfaced by
 * the Critical scenarios campaign:
 *   - #25 Button-mash: 5 rapid identical POSTs created 5 duplicate bookings
 *   - #16 Network-drop retry: 2 sequential POSTs created 2 duplicate bookings
 *   - #7 Concurrent two-tab race: 2 parallel POSTs created 2 overlapping bookings
 *
 * Pre-fix the handler had no room-uniqueness check at all; any number of
 * bookings for the same (roomId, startTime) could land. Mike's real backend
 * will need a unique index on (room_id, start_time) WHERE status <> 'cancelled'
 * (or equivalent transactional check); the MSW shim mirrors that contract
 * here.
 *
 * The check INCLUDES the calling booking's own id when provided as
 * `excludeId` — used by PUT /bookings/:id so an edit doesn't conflict with
 * itself.
 */
function findBookingRoomConflict(
  body: Record<string, unknown>,
  excludeId?: string,
): { id: string; title: string } | undefined {
  const roomId = typeof body.roomId === 'string' ? body.roomId : undefined;
  const start = typeof body.startTime === 'string' ? new Date(body.startTime) : null;
  const end = typeof body.endTime === 'string' ? new Date(body.endTime) : null;
  if (!roomId || !start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return undefined;
  }
  for (const b of bookingsState) {
    if (b.id === excludeId) continue;
    if (b.roomId !== roomId) continue;
    // Soft-cancelled bookings free up the slot
    if (b.status === 'cancelled') continue;
    const bs = typeof b.startTime === 'string' ? new Date(b.startTime).getTime() : NaN;
    const be = typeof b.endTime === 'string' ? new Date(b.endTime).getTime() : NaN;
    if (isNaN(bs) || isNaN(be)) continue;
    // Overlap = start < otherEnd && end > otherStart
    if (start.getTime() < be && end.getTime() > bs) {
      return { id: b.id, title: typeof b.title === 'string' ? b.title : 'untitled' };
    }
  }
  return undefined;
}

/**
 * Phase 4 ultracode-gate fix (F6): a teacher must not be double-booked, and
 * the CLIENT cannot fully enforce this — the wizard only ever sees the
 * currently-viewed area's bookings, so a teacher already booked in the OTHER
 * church looks free. The server sees all areas; it is the only layer that
 * can hold this invariant. Mirrors findBookingRoomConflict's contract
 * (cancelled bookings free the teacher; `excludeId` for self-edits). Mike's
 * real backend needs the equivalent check on (teacher_id, time range)
 * WHERE status <> 'cancelled'.
 */
function findBookingTeacherConflict(
  body: Record<string, unknown>,
  excludeId?: string,
): { id: string; title: string } | undefined {
  const teacherId = typeof body.teacherId === 'string' ? body.teacherId : undefined;
  const start = typeof body.startTime === 'string' ? new Date(body.startTime) : null;
  const end = typeof body.endTime === 'string' ? new Date(body.endTime) : null;
  if (!teacherId || !start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return undefined;
  }
  for (const b of bookingsState) {
    if (b.id === excludeId) continue;
    if (b.teacherId !== teacherId) continue;
    if (b.status === 'cancelled') continue;
    const bs = typeof b.startTime === 'string' ? new Date(b.startTime).getTime() : NaN;
    const be = typeof b.endTime === 'string' ? new Date(b.endTime).getTime() : NaN;
    if (isNaN(bs) || isNaN(be)) continue;
    if (start.getTime() < be && end.getTime() > bs) {
      return { id: b.id, title: typeof b.title === 'string' ? b.title : 'untitled' };
    }
  }
  return undefined;
}

/**
 * Side-effects of a booking transitioning INTO 'completed' (2026-07 overhaul,
 * Decision 9/11). Moved here from the booking POST handler — a study counts
 * toward the contact card / teacher log ONLY once someone marks it Completed.
 * Also runs the one-way auto-promotion: First Study → Unbaptized once the
 * contact has 2+ completed studies (manual stage changes afterwards are
 * always respected — this never fires again once the contact leaves
 * first_study).
 */
function applyStudyCompletion(
  booking: (typeof bookingsState)[number],
  fallbackActorId?: string,
): void {
  const contactId = typeof booking.contactId === 'string' ? booking.contactId : undefined;
  const isStudy = booking.activity === 'bible_study';
  if (!contactId || !isStudy) return;
  const cidx = contactsState.findIndex((c) => c.id === contactId);
  if (cidx === -1) return;
  const c = contactsState[cidx];
  const when = typeof booking.startTime === 'string' ? booking.startTime : new Date().toISOString();
  const raw = (booking as unknown as { subjectsStudied?: unknown }).subjectsStudied;
  const sessionSubjects = Array.isArray(raw)
    ? (raw as unknown[]).filter(
        (s): s is string => typeof s === 'string' && s.trim() !== '',
      )
    : typeof booking.subject === 'string' && booking.subject.trim() !== ''
      ? [booking.subject]
      : [];
  const primary = sessionSubjects[0];
  const primaryStep = primary ? getStudyByTitle(primary)?.number : undefined;
  const actor = resolveActor(
    typeof booking.teacherId === 'string' ? booking.teacherId : fallbackActorId,
  );
  const sessionEntry = {
    date: when,
    action: 'session' as const,
    details: sessionSubjects.length
      ? `Completed Bible study — ${sessionSubjects.join(', ')}`
      : 'Completed Bible study session (subject TBD)',
    userId: actor.id,
    userName: actor.name,
  };
  contactsState[cidx] = {
    ...c,
    totalSessions: (c.totalSessions ?? 0) + 1,
    // Keep the MOST RECENT session date: completing a back-dated study (logged
    // after a newer one) must not regress lastSessionDate to the older study's
    // date. `when` is the completed booking's start time (may be in the past).
    lastSessionDate:
      c.lastSessionDate && new Date(c.lastSessionDate).getTime() > new Date(when).getTime()
        ? c.lastSessionDate
        : when,
    currentlyStudying: true,
    // Only touch the study fields when a subject was actually chosen
    // (Add-subject-later leaves them as-is but still logs the session).
    ...(primary
      ? {
          currentSubject: primary,
          ...(primaryStep ? { currentStep: primaryStep } : {}),
          subjectsStudied: Array.from(
            new Set([...(c.subjectsStudied ?? []), ...sessionSubjects]),
          ),
        }
      : {}),
    timeline: [...(c.timeline ?? []), sessionEntry],
    updatedAt: new Date().toISOString(),
  };
  // Auto-promotion (packet: Contact details > Status): once 2 studies have
  // been logged for a First Study contact, promote to Unbaptized. One-way.
  const bumped = contactsState[cidx];
  if (bumped.pipelineStage === PipelineStage.FIRST_STUDY && (bumped.totalSessions ?? 0) >= 2) {
    contactsState[cidx] = {
      ...bumped,
      pipelineStage: PipelineStage.UNBAPTIZED,
      timeline: [
        ...(bumped.timeline ?? []),
        {
          date: new Date().toISOString(),
          action: 'stage_change' as const,
          details: 'Auto-promoted First Study → Unbaptized (2 completed studies)',
          userId: actor.id,
          userName: actor.name,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    pushAudit({
      id: 'al-' + Date.now() + '-ap',
      action: 'update',
      entityType: 'contact',
      entityId: bumped.id,
      userId: actor.id,
      userName: actor.name,
      details: `Auto-promoted "${bumped.firstName} ${bumped.lastName}" First Study → Unbaptized after 2 completed studies`,
      before: { pipelineStage: PipelineStage.FIRST_STUDY },
      after: { pipelineStage: PipelineStage.UNBAPTIZED },
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Reverse of applyStudyCompletion for a booking leaving 'completed' (status
 * correction, or cancel/delete of an already-completed study). Decrements the
 * session counter and notes the correction on the timeline. Deliberately does
 * NOT remove subjectsStudied or demote the stage — subjects may genuinely have
 * been covered, and auto-promotion is one-way by design.
 */
function reverseStudyCompletion(
  booking: (typeof bookingsState)[number],
  fallbackActorId?: string,
): void {
  const contactId = typeof booking.contactId === 'string' ? booking.contactId : undefined;
  const isStudy = booking.activity === 'bible_study';
  if (!contactId || !isStudy) return;
  const cidx = contactsState.findIndex((c) => c.id === contactId);
  if (cidx === -1) return;
  const c = contactsState[cidx];
  const actor = resolveActor(
    typeof booking.teacherId === 'string' ? booking.teacherId : fallbackActorId,
  );
  contactsState[cidx] = {
    ...c,
    totalSessions: Math.max(0, (c.totalSessions ?? 0) - 1),
    timeline: [
      ...(c.timeline ?? []),
      {
        date: new Date().toISOString(),
        action: 'updated' as const,
        details: `Study completion reverted for "${booking.title}"`,
        userId: actor.id,
        userName: actor.name,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export const handlers = [
  // Auth
  http.post(`${API}/login`, async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    const username = String(body.username || '');
    // Parity with the real login route: the username field also accepts the
    // account's email (supabase-router passes any '@' value through verbatim).
    // Phone keyboards autocapitalize/autocorrect plain text inputs and predictive
    // text appends spaces — match case-insensitively and trim, or those devices
    // get an indistinguishable "Invalid credentials" (live-verified 2026-07-18).
    const uname = username.trim().toLowerCase();
    const user = usersState.find(
      (u) => u.username.toLowerCase() === uname || u.email.toLowerCase() === uname,
    );
    const now = new Date().toISOString();

    const fail = (reason: string) => {
      // AUDIT-2: emit a login_failed entry with the attempted username so
      // brute-force / probing patterns can be reconstructed. entityId is
      // the attempted username (no user id available).
      pushAudit({
        id: 'al-' + Date.now() + '-lf',
        action: 'login_failed',
        entityType: 'login_failed',
        entityId: username || 'unknown',
        userId: 'anonymous',
        userName: username || 'unknown',
        details: `Failed login: ${reason}`,
        relatedUserIds: relatedUsers('anonymous'),
        timestamp: now,
      });
      return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    };

    if (!user) return fail('unknown user');
    // Every account has a REAL password (2026-07-18 hardening): seeded users
    // default to 'admin' until changed; created/converted accounts require the
    // temp password they were issued; reset/change-password overwrite it.
    if (body.password !== passwordFor(user.id)) return fail('bad password');

    // AUDIT-2: emit login_success
    pushAudit({
      id: 'al-' + Date.now() + '-ls',
      action: 'login',
      entityType: 'login_success',
      entityId: user.id,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`.trim() || user.username,
      details: `Login success: @${user.username}`,
      relatedUserIds: relatedUsers(user.id),
      timestamp: now,
    });

    return HttpResponse.json({ token: 'mock-jwt-token-' + user.id, user: withEffectiveFlags(user) });
  }),

  // §7 SHIM (M-07): resolve viewer from the mock JWT in the Authorization
  // header (`Bearer mock-jwt-token-${userId}`) instead of returning
  // mockUsers[0] regardless of who's authenticated. Pre-shim, every caller
  // got Michael (Dev). Mike's backend will JWT-resolve the same way.
  http.get(`${API}/me`, ({ request }) => {
    const viewer = resolveViewer(request);
    if (!viewer) return HttpResponse.json(withEffectiveFlags(mockUsers[0]));
    return HttpResponse.json(withEffectiveFlags(viewer));
  }),

  // Per-group export/import settings.
  // GET → the current override map + the global default. Visible to any
  // admin-tier viewer (the tab is admin-only); the FE scopes which nodes
  // are *editable* to the viewer's own subtree.
  http.get(`${API}/settings/export-import`, ({ request }) => {
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    if (!isAdminTier(viewer)) return permissionDenied('Admin access required');
    return HttpResponse.json({
      overrides: orgExportImportOverrides,
      default: EXPORT_IMPORT_FOR_NON_ADMINS,
    });
  }),

  // PUT → set or clear one node's override.
  //   body: { nodeId: string, value: boolean | null }
  //   value true/false = explicit On/Off; null = clear (inherit from parent).
  // Scoping: Overseer/Dev (scope 'all') may toggle any node; a Branch Leader
  // may only toggle nodes inside their own subtree (matrix: own-branch only).
  http.put(`${API}/settings/export-import`, async ({ request }) => {
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    if (!isAdminTier(viewer)) return permissionDenied('Admin access required');

    const body = (await request.json()) as { nodeId?: string; value?: boolean | null };
    const nodeId = body?.nodeId;
    if (!nodeId) return validationError('nodeId is required');

    const node = usersState.find((u) => u.id === nodeId) as User | undefined;
    if (!node) return HttpResponse.json({ message: 'Node not found', code: 'NOT_FOUND' }, { status: 404 });
    if (node.role === UserRole.MEMBER) {
      return validationError('Members are not togglable nodes — toggle their Team / Group / Branch');
    }

    // Own-subtree EDIT-authority check (Branch Leaders); Overseer/Dev get
    // kind 'all'. Must use buildManageableScope, not buildVisibilityScope —
    // the latter returns 'all' for Branch Leaders (they can SEE everything),
    // which would silently skip this guard and let a Branch Leader toggle
    // any branch.
    const scope = buildManageableScope(viewer, usersState as User[]);
    if (scope.kind !== 'all' && !scope.userIds.includes(nodeId)) {
      return permissionDenied('That group is outside your branch');
    }

    const prev = Object.prototype.hasOwnProperty.call(orgExportImportOverrides, nodeId)
      ? orgExportImportOverrides[nodeId]
      : undefined;
    const clearing = body.value === null || body.value === undefined;
    if (clearing) {
      delete orgExportImportOverrides[nodeId];
    } else {
      orgExportImportOverrides[nodeId] = !!body.value;
    }
    const label = (v: boolean | undefined) => (v === undefined ? 'Inherit' : v ? 'On' : 'Off');
    const nodeName = `${node.firstName} ${node.lastName}`.trim() || node.username;

    pushAudit({
      id: 'al-' + Date.now() + '-eii',
      action: 'update',
      entityType: 'permission',
      entityId: nodeId,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Export/import for "${nodeName}" set to ${label(clearing ? undefined : !!body.value)}`,
      before: { exportImport: label(prev) },
      after: { exportImport: label(clearing ? undefined : !!body.value) },
      relatedUserIds: relatedUsers(viewer.id, nodeId),
      timestamp: new Date().toISOString(),
    });

    return HttpResponse.json({
      overrides: orgExportImportOverrides,
      default: EXPORT_IMPORT_FOR_NON_ADMINS,
    });
  }),

  // Areas & Rooms
  // GET /areas — by default returns ACTIVE areas with their ACTIVE rooms.
  // Pass ?includeInactive=1 to see soft-deleted records (used by the admin
  // RoomsTab to show restorable items).
  http.get(`${API}/areas`, ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === '1';
    if (includeInactive) {
      return HttpResponse.json(areasState);
    }
    return HttpResponse.json(
      areasState
        .filter((a) => a.isActive !== false)
        .map((a) => ({ ...a, rooms: a.rooms.filter((r) => r.isActive !== false) })),
    );
  }),

  http.post(`${API}/areas`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // §7 SHIM (C-01): canCreateArea gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canCreateArea(viewer)) {
      return permissionDenied('You cannot create areas');
    }
    const name = String(body.name || '').trim();
    if (!name) return validationError('Name required');
    const newArea = {
      id: 'area-' + Date.now(),
      name,
      description: typeof body.description === 'string' ? body.description : '',
      rooms: [],
      isActive: true,
    } as typeof areasState[number];
    areasState.push(newArea);
    // §7 SHIM (H-01): emit area.create audit row.
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-ac',
      action: 'create',
      entityType: 'area',
      entityId: newArea.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created area: ${newArea.name}`,
      after: { name: newArea.name },
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(newArea, { status: 201 });
  }),

  http.put(`${API}/areas/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = areasState.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canManageArea gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageArea(viewer)) {
      return permissionDenied('You cannot manage areas');
    }
    const before = areasState[idx];
    const sanitized = { ...body };
    delete sanitized.id;
    delete sanitized.rooms;
    delete sanitized.actorId;
    areasState[idx] = { ...before, ...sanitized } as typeof areasState[number];
    // §7 SHIM (H-01): emit area.update audit row.
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-au',
      action: 'update',
      entityType: 'area',
      entityId: areasState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated area: ${areasState[idx].name}`,
      before: { name: before.name },
      after: { name: areasState[idx].name },
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(areasState[idx]);
  }),

  http.post(`${API}/areas/:id/deactivate`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    const idx = areasState.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canManageArea gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageArea(viewer)) {
      return permissionDenied('You cannot deactivate areas');
    }
    areasState[idx] = { ...areasState[idx], isActive: false };
    // §7 SHIM (H-01): emit area.delete audit row.
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-ad',
      action: 'delete',
      entityType: 'area',
      entityId: areasState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Deactivated area: ${areasState[idx].name}`,
      before: { isActive: true },
      after: { isActive: false },
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(areasState[idx]);
  }),

  http.post(`${API}/areas/:id/restore`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    const idx = areasState.findIndex((a) => a.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canManageArea gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageArea(viewer)) {
      return permissionDenied('You cannot restore areas');
    }
    areasState[idx] = { ...areasState[idx], isActive: true };
    // §7 SHIM (H-01): emit area.restore audit row.
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-ar',
      action: 'restore',
      entityType: 'area',
      entityId: areasState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Restored area: ${areasState[idx].name}`,
      before: { isActive: false },
      after: { isActive: true },
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(areasState[idx]);
  }),

  // POST /areas/:areaId/rooms — add a room to a specific area.
  http.post(`${API}/areas/:areaId/rooms`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // §7 SHIM (C-01): canCreateRoom gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canCreateRoom(viewer)) {
      return permissionDenied('You cannot create rooms');
    }
    const areaId = String(params.areaId);
    const idx = areasState.findIndex((a) => a.id === areaId);
    if (idx === -1) return HttpResponse.json({ message: 'Area not found' }, { status: 404 });
    const name = String(body.name || '').trim();
    if (!name) return validationError('Name required');
    if (areasState[idx].rooms.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.isActive !== false)) {
      return HttpResponse.json({ message: 'A room with that name already exists in this area' }, { status: 409 });
    }
    const newRoom = {
      id: 'room-' + Date.now(),
      areaId,
      name,
      capacity: typeof body.capacity === 'number' ? body.capacity : 6,
      features: Array.isArray(body.features) ? (body.features as string[]) : [],
      isActive: true,
    } as typeof areasState[number]['rooms'][number];
    areasState[idx].rooms.push(newRoom);
    // §7 SHIM (H-01): emit room.create audit row.
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-rc',
      action: 'create',
      entityType: 'room',
      entityId: newRoom.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created room: ${newRoom.name} in ${areasState[idx].name}`,
      after: { name: newRoom.name, areaId },
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(newRoom, { status: 201 });
  }),

  // PUT /rooms/:id — update room fields. Looks up by room id across all areas.
  http.put(`${API}/rooms/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // §7 SHIM (C-01): canManageRoom gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageRoom(viewer)) {
      return permissionDenied('You cannot manage rooms');
    }
    for (const area of areasState) {
      const ridx = area.rooms.findIndex((r) => r.id === params.id);
      if (ridx === -1) continue;
      const before = area.rooms[ridx];
      const sanitized = { ...body };
      delete sanitized.id;
      delete sanitized.areaId;
      delete sanitized.actorId;
      area.rooms[ridx] = { ...before, ...sanitized } as typeof area.rooms[number];
      // §7 SHIM (H-01): emit room.update audit row.
      const actor = resolveActor(viewer.id);
      pushAudit({
        id: 'al-' + Date.now() + '-ru',
        action: 'update',
        entityType: 'room',
        entityId: area.rooms[ridx].id,
        userId: actor.id,
        userName: actor.name,
        details: `Updated room: ${area.rooms[ridx].name}`,
        before: { name: before.name, capacity: before.capacity },
        after: { name: area.rooms[ridx].name, capacity: area.rooms[ridx].capacity },
        relatedUserIds: relatedUsers(actor.id),
        timestamp: new Date().toISOString(),
      });
      return HttpResponse.json(area.rooms[ridx]);
    }
    return HttpResponse.json({ message: 'Not found' }, { status: 404 });
  }),

  http.post(`${API}/rooms/:id/deactivate`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    // §7 SHIM (C-01): canManageRoom gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageRoom(viewer)) {
      return permissionDenied('You cannot deactivate rooms');
    }
    for (const area of areasState) {
      const ridx = area.rooms.findIndex((r) => r.id === params.id);
      if (ridx === -1) continue;
      area.rooms[ridx] = { ...area.rooms[ridx], isActive: false };
      const actor = resolveActor(viewer.id);
      pushAudit({
        id: 'al-' + Date.now() + '-rd',
        action: 'delete',
        entityType: 'room',
        entityId: area.rooms[ridx].id,
        userId: actor.id,
        userName: actor.name,
        details: `Deactivated room: ${area.rooms[ridx].name}`,
        before: { isActive: true },
        after: { isActive: false },
        relatedUserIds: relatedUsers(actor.id),
        timestamp: new Date().toISOString(),
      });
      return HttpResponse.json(area.rooms[ridx]);
    }
    return HttpResponse.json({ message: 'Not found' }, { status: 404 });
  }),

  http.post(`${API}/rooms/:id/restore`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    // §7 SHIM (C-01): canManageRoom gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageRoom(viewer)) {
      return permissionDenied('You cannot restore rooms');
    }
    for (const area of areasState) {
      const ridx = area.rooms.findIndex((r) => r.id === params.id);
      if (ridx === -1) continue;
      area.rooms[ridx] = { ...area.rooms[ridx], isActive: true };
      const actor = resolveActor(viewer.id);
      pushAudit({
        id: 'al-' + Date.now() + '-rr',
        action: 'restore',
        entityType: 'room',
        entityId: area.rooms[ridx].id,
        userId: actor.id,
        userName: actor.name,
        details: `Restored room: ${area.rooms[ridx].name}`,
        before: { isActive: false },
        after: { isActive: true },
        relatedUserIds: relatedUsers(actor.id),
        timestamp: new Date().toISOString(),
      });
      return HttpResponse.json(area.rooms[ridx]);
    }
    return HttpResponse.json({ message: 'Not found' }, { status: 404 });
  }),

  // Blocked time slots — service times and admin-defined blackout windows.
  // GET supports an optional ?areaId filter; when set, returns global blocks
  // plus that area's blocks. Without filter, returns everything.
  http.get(`${API}/blocked-slots`, ({ request }) => {
    const url = new URL(request.url);
    const areaId = url.searchParams.get('areaId');
    const active = blockedSlotsState.filter((s) => s.isActive !== false);
    if (!areaId) return HttpResponse.json(active);
    return HttpResponse.json(
      active.filter((s) => s.scope === 'global' || s.areaId === areaId),
    );
  }),

  http.post(`${API}/blocked-slots`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // §7 SHIM (C-01): canManageBlockedSlot gate. Pre-shim, a Member could
    // POST /blocked-slots and the handler created the row.
    {
      const viewer = resolveViewer(request, body);
      if (!viewer) return unauthorized('Authentication required');
      if (!canManageBlockedSlot(viewer)) {
        return permissionDenied('You cannot manage blocked slots');
      }
    }
    // BLOCK-4: validate required fields explicitly; do not spread unsanitized.
    const scope = body.scope === 'global' || body.scope === 'area' ? body.scope : 'global';
    const recurrence = body.recurrence === 'weekly' || body.recurrence === 'one-off'
      ? body.recurrence
      : 'weekly';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return HttpResponse.json({ message: 'Reason required' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const newSlot = {
      id: 'bs-' + Date.now(),
      isActive: true,
      createdAt: now,
      scope,
      recurrence,
      reason,
      areaId: typeof body.areaId === 'string' ? body.areaId : undefined,
      dayOfWeek: typeof body.dayOfWeek === 'number' ? body.dayOfWeek : undefined,
      startTime: typeof body.startTime === 'string' ? body.startTime : undefined,
      endTime: typeof body.endTime === 'string' ? body.endTime : undefined,
      date: typeof body.date === 'string' ? body.date : undefined,
      createdBy: typeof body.actorId === 'string' ? body.actorId : undefined,
    } as typeof blockedSlotsState[number];
    blockedSlotsState.push(newSlot);
    // AUDIT-3: emit blocked_slot create entry.
    const actor = resolveActor(typeof body.actorId === 'string' ? body.actorId : undefined);
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'create',
      entityType: 'blocked_slot',
      entityId: newSlot.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created blocked slot: ${reason}`,
      after: newSlot,
      relatedUserIds: relatedUsers(actor.id),
      timestamp: now,
    });
    return HttpResponse.json(newSlot, { status: 201 });
  }),

  http.put(`${API}/blocked-slots/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = blockedSlotsState.findIndex((s) => s.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canManageBlockedSlot gate.
    {
      const viewer = resolveViewer(request, body);
      if (!viewer) return unauthorized('Authentication required');
      if (!canManageBlockedSlot(viewer)) {
        return permissionDenied('You cannot manage blocked slots');
      }
    }
    const before = blockedSlotsState[idx];
    const sanitized = { ...body };
    delete sanitized.id;
    delete sanitized.createdAt;
    delete sanitized.actorId;
    const updated = { ...before, ...sanitized };
    blockedSlotsState[idx] = updated as typeof blockedSlotsState[number];
    // AUDIT-3: emit blocked_slot update entry.
    const actor = resolveActor(typeof body.actorId === 'string' ? body.actorId : undefined);
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'blocked_slot',
      entityId: updated.id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated blocked slot: ${updated.reason ?? ''}`,
      before,
      after: updated,
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  http.delete(`${API}/blocked-slots/:id`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    const idx = blockedSlotsState.findIndex((s) => s.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canManageBlockedSlot gate.
    {
      const viewer = resolveViewer(request, body);
      if (!viewer) return unauthorized('Authentication required');
      if (!canManageBlockedSlot(viewer)) {
        return permissionDenied('You cannot manage blocked slots');
      }
    }
    const before = blockedSlotsState[idx];
    // Soft-delete via isActive=false (consistent with PERMISSIONS.md rule).
    blockedSlotsState[idx] = { ...before, isActive: false };
    // AUDIT-3: emit blocked_slot delete entry.
    const actor = resolveActor(body.actorId);
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'delete',
      entityType: 'blocked_slot',
      entityId: before.id,
      userId: actor.id,
      userName: actor.name,
      details: `Removed blocked slot: ${before.reason ?? ''}`,
      before,
      relatedUserIds: relatedUsers(actor.id),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json({ success: true });
  }),

  // Bookings
  http.get(`${API}/bookings`, ({ request }) => {
    const url = new URL(request.url);
    const areaId = url.searchParams.get('areaId');
    const roomId = url.searchParams.get('roomId');
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    // Parity with supabase-router GET /bookings (H-scan medium, salvaged
    // wt-mock-parity patch): filter by areaId/roomId + the [start, end)
    // window (start = gte start_time, end = lt start_time) and return in
    // start_time ascending order.
    let filtered = [...bookingsState];
    if (areaId) filtered = filtered.filter((b) => b.areaId === areaId);
    if (roomId) filtered = filtered.filter((b) => b.roomId === roomId);
    if (start) filtered = filtered.filter((b) => new Date(b.startTime).getTime() >= new Date(start).getTime());
    if (end) filtered = filtered.filter((b) => new Date(b.startTime).getTime() < new Date(end).getTime());
    filtered.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return HttpResponse.json(filtered);
  }),

  http.get(`${API}/bookings/:id`, ({ params }) => {
    const booking = bookingsState.find((b) => b.id === params.id);
    if (!booking) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    return HttpResponse.json(booking);
  }),

  http.post(`${API}/bookings`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // BLOCK-2/BE-2: reject overlap with blocked slots with 409. The matrix's
    // "no one overrides a blocked slot" rule must hold even at the mock-API
    // layer because that is the demo's effective backend.
    const conflict = findBookingBlockedConflict(body);
    if (conflict) {
      return HttpResponse.json(
        {
          message: `Overlaps blocked window: ${conflict.reason}`,
          code: 'BLOCKED_SLOT_CONFLICT',
          details: { type: 'blocked_slot', slot: conflict },
        },
        { status: 409 },
      );
    }
    // Critical scenarios #7, #16, #25 fix: room+startTime uniqueness check.
    // Pre-fix, N parallel POSTs for the same room/slot all returned 201,
    // creating N duplicate bookings. Now any overlap with an existing
    // active booking on the same room returns 409 ROOM_CONFLICT.
    const roomConflict = findBookingRoomConflict(body);
    if (roomConflict) {
      return HttpResponse.json(
        {
          message: `Room is already booked: ${roomConflict.title}`,
          code: 'ROOM_CONFLICT',
          details: { type: 'room', booking: roomConflict },
        },
        { status: 409 },
      );
    }
    // Phase 4 (F6): cross-area teacher double-booking — server-only invariant.
    const teacherConflict = findBookingTeacherConflict(body);
    if (teacherConflict) {
      return HttpResponse.json(
        {
          message: `Teacher is already booked at that time: ${teacherConflict.title}`,
          code: 'TEACHER_CONFLICT',
          details: { type: 'teacher', booking: teacherConflict },
        },
        { status: 409 },
      );
    }
    const newBooking = {
      id: 'b' + Date.now(),
      ...body,
      // 2026-07 overhaul Decision 11: every new booking starts as scheduled
      // ('bible_study'); outcome statuses are set later via PATCH :id/status.
      // Forced AFTER the body spread so a client can't create pre-Completed
      // bookings (that would bypass the status-gated metrics).
      status: 'bible_study',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as typeof bookingsState[number];
    bookingsState.push(newBooking);
    // §7 SHIM (H-01): emit booking.create audit row.
    {
      const actor = resolveActor(
        typeof body.actorId === 'string'
          ? body.actorId
          : typeof body.userId === 'string'
            ? (body.userId as string)
            : undefined,
      );
      pushAudit({
        id: 'al-' + Date.now() + '-bc',
        action: 'create',
        entityType: 'booking',
        entityId: newBooking.id,
        userId: actor.id,
        userName: actor.name,
        details: `Created booking "${
          typeof body.title === 'string' ? body.title : 'untitled'
        }"`,
        after: {
          activity: typeof body.activity === 'string' ? body.activity : undefined,
          areaId: typeof body.areaId === 'string' ? body.areaId : undefined,
          startTime: typeof body.startTime === 'string' ? body.startTime : undefined,
        },
        relatedUserIds: relatedUsers(
          actor.id,
          typeof body.teacherId === 'string' ? body.teacherId : undefined,
        ),
        timestamp: newBooking.createdAt,
      });
    }
    // 2026-07 overhaul (Decision 9/11): contact side-effects (totalSessions,
    // subjectsStudied, timeline) NO LONGER fire at creation — they fire when
    // the booking transitions to 'completed' (PATCH :id/status below). This
    // is the structural fix for "a future-dated study already counted toward
    // the teacher's log and the contact card". (Mike's backend mirrors this.)
    return HttpResponse.json(newBooking, { status: 201 });
  }),

  http.put(`${API}/bookings/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // Parity with the real backend: JWT-resolved actor + the bookings_update RLS
    // scope (canEditBooking = owner/teacher/admin-tier/in-scope leader). The real
    // backend gates every booking UPDATE; the mock must too — no body.actorId trust.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    if (!canEditBooking(viewer, bookingsState[idx] as Booking, viewerSubtreeUserIds(viewer))) {
      return permissionDenied(
        'Only the teacher, the booking creator, or a leader in scope can edit this booking',
      );
    }
    // BLOCK-2/BE-2: reject 409 on edit-into-blocked-slot.
    const conflict = findBookingBlockedConflict({ ...bookingsState[idx], ...body });
    if (conflict) {
      return HttpResponse.json(
        {
          message: `Overlaps blocked window: ${conflict.reason}`,
          code: 'BLOCKED_SLOT_CONFLICT',
          details: { type: 'blocked_slot', slot: conflict },
        },
        { status: 409 },
      );
    }
    // Critical scenarios #7/#16/#25 fix on the edit path: reject if the
    // edited fields would overlap a DIFFERENT booking. Self-overlap (same
    // id) is excluded so a no-op edit doesn't reject itself.
    const teacherConflictPut = findBookingTeacherConflict(
      { ...bookingsState[idx], ...body },
      String(params.id),
    );
    if (teacherConflictPut) {
      return HttpResponse.json(
        {
          message: `Teacher is already booked at that time: ${teacherConflictPut.title}`,
          code: 'TEACHER_CONFLICT',
          details: { type: 'teacher', booking: teacherConflictPut },
        },
        { status: 409 },
      );
    }
    const roomConflict = findBookingRoomConflict(
      { ...bookingsState[idx], ...body },
      String(params.id),
    );
    if (roomConflict) {
      return HttpResponse.json(
        {
          message: `Room is already booked: ${roomConflict.title}`,
          code: 'ROOM_CONFLICT',
          details: { type: 'room', booking: roomConflict },
        },
        { status: 409 },
      );
    }
    const updated = { ...bookingsState[idx], ...body, updatedAt: new Date().toISOString() };
    bookingsState[idx] = updated as typeof bookingsState[number];
    // M-6 follow-up: when the BookingWizard supplies an editReason,
    // persist an audit log entry so the Reports page reflects it.
    const reason =
      typeof body.editReason === 'string' ? body.editReason.trim() : '';
    if (reason) {
      pushAudit({
        id: 'al-' + Date.now(),
        action: 'update',
        entityType: 'booking',
        entityId: updated.id,
        userId: viewer.id,
        userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
        details: `Edited booking: ${reason}`,
        relatedUserIds: relatedUsers(
          viewer.id,
          typeof updated.teacherId === 'string' ? updated.teacherId : undefined,
        ),
        timestamp: new Date().toISOString(),
      });
    }
    return HttpResponse.json(updated);
  }),

  // 2026-07 overhaul (Decision 11): set a booking's outcome status.
  // 'cancelled' is NOT settable here — it goes through /cancel (with reason)
  // so the cancel/restore lifecycle and slot-freeing stay in one place.
  // Metrics side-effects fire exactly on the edges into/out of 'completed'.
  http.patch(`${API}/bookings/:id/status`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      actorId?: string;
    };
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    const allowed = ['bible_study', 'completed', 'no_show', 'rescheduled'];
    if (!body.status || !allowed.includes(body.status)) {
      return validationError(
        `status must be one of: ${allowed.join(', ')} (cancel via POST /bookings/:id/cancel)`,
      );
    }
    if (booking.status === 'cancelled') {
      return validationError('Booking is cancelled — restore it before setting a status');
    }
    if (!canSetBookingStatus(viewer, booking as Booking, viewerSubtreeUserIds(viewer))) {
      return permissionDenied(
        'Only the teacher, the booking creator, or a leader in scope can set booking status',
      );
    }
    const prev = (booking.status ?? 'bible_study') as string;
    if (prev === body.status) return HttpResponse.json(booking);
    const updated = {
      ...booking,
      status: body.status,
      updatedAt: new Date().toISOString(),
    } as typeof bookingsState[number];
    bookingsState[idx] = updated;
    if (body.status === 'completed') applyStudyCompletion(updated, viewer.id);
    else if (prev === 'completed') reverseStudyCompletion(updated, viewer.id);
    const label =
      BOOKING_STATUS_CONFIG[body.status as BookingStatus]?.label ?? body.status;
    pushAudit({
      id: 'al-' + Date.now() + '-bs',
      action: 'update',
      entityType: 'booking',
      entityId: updated.id,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Set booking "${updated.title}" status to ${label}`,
      before: { status: prev },
      after: { status: body.status },
      relatedUserIds: relatedUsers(
        viewer.id,
        typeof updated.teacherId === 'string' ? updated.teacherId : undefined,
      ),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // CAL-5: convert hard-delete to soft-cancel so booking history is
  // preserved and the audit trail captures the deletion. Universal rule
  // #7 in PERMISSIONS.md ("Soft delete only") applies.
  http.delete(`${API}/bookings/:id`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    // Parity: JWT-resolved actor + canEditBooking scope, matching the real
    // bookings_update RLS. Do NOT trust body.actorId (it was spoofable).
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = bookingsState[idx];
    if (!canEditBooking(viewer, before as Booking, viewerSubtreeUserIds(viewer))) {
      return permissionDenied(
        'Only the teacher, the booking creator, or a leader in scope can delete this booking',
      );
    }
    // Deleting an already-Completed study takes its session back off the
    // contact card / teacher log (defensive guard for the status-gated metrics).
    if (before.status === 'completed') reverseStudyCompletion(before, viewer.id);
    const updated = {
      ...before,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelReason: 'Booking deleted',
      cancelledBy: viewer.id,
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'delete',
      entityType: 'booking',
      entityId: before.id,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Deleted booking "${before.title}" (soft-cancelled, history preserved)`,
      before,
      relatedUserIds: relatedUsers(
        viewer.id,
        typeof before.teacherId === 'string' ? before.teacherId : undefined,
      ),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json({ success: true });
  }),

  // Cancel a booking (soft-delete with reason tracking + audit log)
  http.post(`${API}/bookings/:id/cancel`, async ({ request, params }) => {
    const body = (await request.json()) as { reason?: string };
    // Parity with the real cancel_booking RPC: gate by canEditBooking (owner/
    // teacher/admin-tier/in-scope leader) and attribute cancelledBy + the audit
    // row to the JWT-resolved actor — NOT a hardcoded 'u-michael' (was B3: every
    // cancel credited Michael on Reports Top Contributors regardless of actor).
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    if (!canEditBooking(viewer, booking as Booking, viewerSubtreeUserIds(viewer))) {
      return permissionDenied(
        'Only the teacher, the booking creator, or a leader in scope can cancel this booking',
      );
    }
    // Cancelling an already-Completed study reverses its metrics side-effects.
    if (booking.status === 'completed') reverseStudyCompletion(booking, viewer.id);
    const updated = {
      ...booking,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelReason: (body.reason || '').trim(),
      cancelledBy: viewer.id,
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'cancel',
      entityType: 'booking',
      entityId: updated.id,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Cancelled booking "${booking.title}": ${body.reason || 'No reason'}`,
      // Structured copy of the actor's explanation — feeds the audit detail
      // dialog's Reason row (parity: real backend cancel_booking writes
      // audit_log.reason from the same payload field).
      reason: (typeof body.reason === 'string' && body.reason.trim()) || undefined,
      relatedUserIds: relatedUsers(
        viewer.id,
        typeof booking.teacherId === 'string' ? booking.teacherId : undefined,
      ),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // Restore a cancelled booking
  http.post(`${API}/bookings/:id/restore`, ({ request, params }) => {
    // Parity: JWT-resolved actor + canEditBooking scope (the real restore path
    // is a bookings_update, gated by the same RLS policy as cancel/edit).
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    if (!canEditBooking(viewer, booking as Booking, viewerSubtreeUserIds(viewer))) {
      return permissionDenied(
        'Only the teacher, the booking creator, or a leader in scope can restore this booking',
      );
    }
    const updated = {
      ...booking,
      // Restore always lands back on 'bible_study' (scheduled) — if the study
      // actually happened, someone re-marks it Completed explicitly.
      status: 'bible_study',
      cancelledAt: undefined,
      cancelReason: undefined,
      cancelledBy: undefined,
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'booking',
      entityId: updated.id,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Restored cancelled booking "${booking.title}"`,
      relatedUserIds: relatedUsers(
        viewer.id,
        typeof booking.teacherId === 'string' ? booking.teacherId : undefined,
      ),
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // Contacts — supports search, type, stage, sort
  http.get(`${API}/contacts`, ({ request }) => {
    const url = new URL(request.url);
    // Parity with the contacts_select RLS (salvaged wt-mock-parity patch, H3):
    // admin-tier (BL+) see all; everyone else only contacts they created /
    // are assigned / that sit in their subtree (canViewContact). Previously
    // the mock returned ALL contacts to ANY authenticated caller.
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    // Per-column substring search (real does per-column ILIKE with %/, stripped;
    // accepts ?search and ?q).
    const rawSearch = url.searchParams.get('search') ?? url.searchParams.get('q') ?? '';
    const search = rawSearch.replace(/[%,]/g, '').toLowerCase();
    const type = url.searchParams.get('type');
    const stage = url.searchParams.get('stage');
    const sort = url.searchParams.get('sort') || 'name';
    const sortDir = url.searchParams.get('sortDir') || 'asc';

    // Phase 5 retention: flag converted contacts whose retainUntil window
    // has lapsed — computed ON READ (the mock has no background job). The
    // record itself is kept until a GL+ deletes it or the real backend's
    // retention job runs; the flag lets the UI badge it and prompt cleanup.
    const nowMs = Date.now();
    // Parity with the real backend GET /contacts (supabase-router.ts `.neq('status','inactive')`):
    // soft-deleted contacts must NOT resurface in the collection on refetch. Only the
    // collection is filtered; GET /contacts/:id returns a single contact regardless of status.
    // Admin surfaces pass includeInactive=1 to see soft-deleted rows (dimmed), same as areas.
    const includeInactive = url.searchParams.get('includeInactive');
    const scope = viewerSubtreeUserIds(viewer);
    let filtered = contactsState
      .filter((c) => includeInactive ? true : c.status !== 'inactive')
      .filter((c) => canViewContact(viewer, c as Contact, scope))
      .map((c) =>
        c.retainUntil && Date.parse(String(c.retainUntil)) < nowMs
          ? { ...c, retentionExpired: true }
          : c,
      );
    if (search) filtered = filtered.filter((c) =>
      [c.firstName, c.lastName, c.email, c.phone, c.groupName].some(
        (f) => typeof f === 'string' && f.toLowerCase().includes(search),
      ),
    );
    if (type && type !== 'all') filtered = filtered.filter((c) => c.type === type);
    if (stage && stage !== 'all') filtered = filtered.filter((c) => c.pipelineStage === stage);

    // Sort
    const dir = sortDir === 'desc' ? -1 : 1;
    const stageOrder: Record<string, number> = {
      first_study: 0, unbaptized: 1, potential: 2, baptism_ready: 3, needs_help: 4, baptized: 5,
    };
    filtered.sort((a, b) => {
      switch (sort) {
        case 'sessions': return (a.totalSessions - b.totalSessions) * dir;
        case 'stage': return ((stageOrder[a.pipelineStage] || 0) - (stageOrder[b.pipelineStage] || 0)) * dir;
        case 'updated': return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
        default: return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`) * dir;
      }
    });

    return HttpResponse.json(filtered);
  }),

  http.post(`${API}/contacts`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // Parity with the create_contact RPC: JWT actor + canCreateContact on the
    // owner (v_owner = body.createdBy ?? auth.uid()). A caller may only set an
    // owner they are (self), or that falls in their subtree (leader), or any
    // (admin-tier). Server-owned fields (convertedToUserId, id) are NOT mass-
    // assignable — a new contact is never pre-converted.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const owner = typeof body.createdBy === 'string' ? body.createdBy : viewer.id;
    // Parity: contacts.created_by is a uuid FK on the real backend — an owner that
    // doesn't resolve to a user fails there (22P02 non-uuid / 23503 unknown uuid).
    // The old silent-accept here is how `createdBy: 'import'` hid until cutover.
    if (typeof body.createdBy === 'string' && !usersState.some((u) => u.id === body.createdBy)) {
      return validationError('createdBy must reference an existing user (omit it to default to the authenticated viewer)');
    }
    if (!canCreateContact(viewer, owner, viewerSubtreeUserIds(viewer))) {
      return permissionDenied('You can only create contacts you own or within your scope');
    }
    const {
      actorId: _actorId,
      convertedToUserId: _cvt,
      createdBy: _cb,
      id: _id,
      ...safe
    } = body;
    void _actorId; void _cvt; void _cb; void _id;
    const newContact = {
      id: 'c' + Date.now(),
      ...safe,
      createdBy: owner,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as typeof contactsState[number];
    contactsState.push(newContact);
    // §7 SHIM (H-01 audit gap): emit contact.create row, attributed to the actor.
    pushAudit({
      id: 'al-' + Date.now() + '-cc',
      action: 'create',
      entityType: 'contact',
      entityId: newContact.id,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Created contact: ${newContact.firstName} ${newContact.lastName}`,
      after: { type: newContact.type, pipelineStage: newContact.pipelineStage },
      relatedUserIds: relatedUsers(
        viewer.id,
        typeof newContact.assignedTeacherId === 'string' ? newContact.assignedTeacherId : undefined,
        ...(Array.isArray(newContact.preachingPartnerIds) ? newContact.preachingPartnerIds : []),
      ),
      timestamp: newContact.createdAt,
    });
    return HttpResponse.json(newContact, { status: 201 });
  }),

  http.put(`${API}/contacts/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // Parity with the real PUT /contacts/:id path (supabase-router.ts:192 +
    // contacts_update RLS + set_contact_teacher RPC):
    //   • JWT actor ONLY — body.actorId is ignored (spoof-proof).
    //   • Row edit gate = canEditContact against the viewer's MANAGEABLE subtree.
    //     canEditContact has NO isAdminTier short-circuit, so the visibility
    //     scope (EMPTY for a Branch Leader) would false-403 a BL on an own-branch
    //     contact they didn't create — use viewerManageableUserIds, never
    //     viewerSubtreeUserIds. (This is the bug the convert handler shipped with.)
    //   • created_by / assigned_teacher_id are NOT column-update-granted (0005):
    //     created_by is stripped; a teacher REASSIGN is re-gated exactly like
    //     set_contact_teacher (edit gate + the new teacher must be admin-assignable
    //     or inside the viewer's manageable subtree). Other server-owned fields
    //     (id, convertedToUserId, createdAt) are stripped. type/status ARE granted
    //     — do NOT strip them.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = contactsState[idx];
    const scope = viewerManageableUserIds(viewer);
    if (!canEditContact(viewer, before as Contact, scope)) {
      return permissionDenied('You can only edit contacts within your scope');
    }
    // set_contact_teacher parity (0014): a teacher reassignment additionally
    // requires the new teacher to be inside the viewer's manageable subtree —
    // cross-branch placement is Overseer/Dev only (matrix "Reassign owner";
    // the old isAdminTier shortcut let a Branch Leader reassign cross-branch).
    const reassigning =
      typeof body.assignedTeacherId === 'string' &&
      body.assignedTeacherId !== before.assignedTeacherId;
    if (reassigning) {
      const newTeacher = body.assignedTeacherId as string;
      if (!canReassignContact(viewer, before as Contact, newTeacher, scope)) {
        return permissionDenied('You can only assign a teacher within your scope');
      }
    }
    // Mass-assignment strip (mirror supabase-router.strip() + withheld columns).
    const {
      actorId: _actorId,
      id: _id,
      createdBy: _createdBy,
      convertedToUserId: _cvt,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...safe
    } = body;
    void _actorId; void _id; void _createdBy; void _cvt; void _createdAt; void _updatedAt;
    const updated = { ...before, ...safe, updatedAt: new Date().toISOString() };
    const actor = resolveActor(viewer.id);
    // F2 (routine cell 68/77): a runtime pipelineStage change appends a `stage_change`
    // timeline row, mirroring the seed + booking-completion path, so the fruit/baptism
    // leaderboards (church.ts scans the timeline for a 'Baptized' stage_change) reflect
    // runtime stage changes, not only seeded ones. Real-backend parity needs the same via
    // an AFTER UPDATE trigger on public.contacts.
    if (
      typeof safe.pipelineStage === 'string' &&
      updated.pipelineStage !== before.pipelineStage
    ) {
      const cfg = PIPELINE_STAGE_CONFIG[updated.pipelineStage as PipelineStage];
      updated.timeline = [
        ...(before.timeline ?? []),
        {
          date: updated.updatedAt,
          action: 'stage_change',
          details: `Pipeline stage changed to ${cfg?.label ?? updated.pipelineStage}`,
          userId: actor.id,
          userName: actor.name,
        },
      ];
    }
    contactsState[idx] = updated as typeof contactsState[number];
    // §7 SHIM (H-01 audit gap): emit contact.update row, attributed to the JWT actor.
    pushAudit({
      id: 'al-' + Date.now() + '-cu',
      action: 'update',
      entityType: 'contact',
      entityId: updated.id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated contact ${updated.firstName} ${updated.lastName}`,
      before: { pipelineStage: before.pipelineStage, status: before.status },
      after: { pipelineStage: updated.pipelineStage, status: updated.status },
      relatedUserIds: relatedUsers(actor.id, before.assignedTeacherId, updated.assignedTeacherId),
      crossBranch: isCrossBranchWrite(viewer, before.createdBy) || undefined,
      timestamp: updated.updatedAt,
    });
    // F1: distinct `reassign` audit row when the owner (assignedTeacherId) changed,
    // so reports/audit can trace contact hand-offs (was previously folded into a
    // generic `update`). The real backend should do the same.
    if (reassigning) {
      const nameOf = (uid?: string) => {
        const u = usersState.find((x) => x.id === uid);
        return u ? `${u.firstName} ${u.lastName}` : uid || 'Unassigned';
      };
      pushAudit({
        id: 'al-' + Date.now() + '-cr',
        action: 'reassign',
        entityType: 'contact',
        entityId: updated.id,
        userId: actor.id,
        userName: actor.name,
        details: `Reassigned ${updated.firstName} ${updated.lastName} from ${nameOf(before.assignedTeacherId)} to ${nameOf(updated.assignedTeacherId)}`,
        before: { assignedTeacherId: before.assignedTeacherId },
        after: { assignedTeacherId: updated.assignedTeacherId },
        relatedUserIds: relatedUsers(actor.id, before.assignedTeacherId, updated.assignedTeacherId),
        crossBranch: isCrossBranchWrite(viewer, before.createdBy) || undefined,
        timestamp: updated.updatedAt,
      });
    }
    return HttpResponse.json(updated);
  }),

  // §7 SHIM (C-04): soft-delete contacts instead of splice. Universal rule
  // #7 from PERMISSIONS.md ("Soft delete only. No hard delete from any UI
  // surface."). Sets status='inactive' so the record is preserved for the
  // audit trail and a future restore. Pre-shim behavior was a hard splice
  // (line 621-625 of the AUDIT_REPORT.md repro).
  http.delete(`${API}/contacts/:id`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    // Parity with set_contact_inactive RPC (0002:200): JWT actor + the same
    // row gate as edit (canDeleteContact === canEditContact against the MANAGEABLE
    // subtree — never the visibility scope, per the BL false-403 note on PUT).
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = contactsState[idx];
    if (!canDeleteContact(viewer, before as Contact, viewerManageableUserIds(viewer))) {
      return permissionDenied('You can only delete contacts within your scope');
    }
    const updated = {
      ...before,
      status: 'inactive',
      updatedAt: new Date().toISOString(),
    } as typeof contactsState[number];
    contactsState[idx] = updated;
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-cd',
      action: 'delete',
      entityType: 'contact',
      entityId: before.id,
      userId: actor.id,
      userName: actor.name,
      details: `Soft-deleted contact ${before.firstName} ${before.lastName}`,
      before: { status: before.status },
      after: { status: 'inactive' },
      relatedUserIds: relatedUsers(actor.id, before.assignedTeacherId),
      crossBranch: isCrossBranchWrite(viewer, before.createdBy) || undefined,
      timestamp: updated.updatedAt,
    });
    return HttpResponse.json({ success: true, contact: updated });
  }),

  // Finding 151 (wave 2): restore a soft-deleted contact. Inverse of the
  // DELETE above — same permission gate (set_contact_active parity, 0015).
  http.post(`${API}/contacts/:id/restore`, ({ request, params }) => {
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = contactsState[idx];
    if (!canDeleteContact(viewer, before as Contact, viewerManageableUserIds(viewer))) {
      return permissionDenied('You can only restore contacts within your scope');
    }
    if (before.status !== 'inactive') {
      return HttpResponse.json(
        { message: 'Contact is not deleted', code: 'NOT_INACTIVE' },
        { status: 409 },
      );
    }
    const updated = {
      ...before,
      status: 'active',
      updatedAt: new Date().toISOString(),
    } as typeof contactsState[number];
    contactsState[idx] = updated;
    const actor = resolveActor(viewer.id);
    pushAudit({
      id: 'al-' + Date.now() + '-cr',
      action: 'restore',
      entityType: 'contact',
      entityId: before.id,
      userId: actor.id,
      userName: actor.name,
      details: `Restored contact ${before.firstName} ${before.lastName}`,
      before: { status: before.status },
      after: { status: 'active' },
      relatedUserIds: relatedUsers(actor.id, before.assignedTeacherId),
      crossBranch: isCrossBranchWrite(viewer, before.createdBy) || undefined,
      timestamp: updated.updatedAt,
    });
    return HttpResponse.json({ success: true, contact: updated });
  }),

  // CONT-5: convert a Contact into a full User account.
  // Atomic: if user creation fails (e.g. username collision after suffix
  // attempts), the contact is NOT mutated. On success: contact gains
  // convertedToUserId + status='converted', and two audit rows fire
  // (user.create + contact.update) so the Reports page shows the
  // conversion as a single visible event.
  http.post(`${API}/contacts/:id/convert`, async ({ request, params }) => {
    const body = (await request.json()) as {
      role: string;
      parentId?: string;
      groupId?: string;
      actorId?: string;
    };
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const cidx = contactsState.findIndex((c) => c.id === params.id);
    if (cidx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const contact = contactsState[cidx];
    // Parity with convert_contact RPC: a leader in-scope may convert
    // (canConvertContact), AND the new user's role must be strictly below the
    // actor's own level (create_user ceiling) -- a Member cannot convert, and
    // no one may mint a user at or above their level (was priv-esc: a Member
    // could pass role:'dev').
    // canConvertContact delegates to canEditContact (NO isAdminTier short-circuit),
    // so it MUST receive the MANAGEABLE subtree — the visibility scope is empty for
    // a Branch Leader and false-403'd a BL converting an own-branch contact.
    if (!canConvertContact(viewer, contact as Contact, viewerManageableUserIds(viewer))) {
      return permissionDenied('Only a leader in scope can convert this contact');
    }
    const requestedRole = (typeof body.role === 'string' && body.role ? body.role : 'member') as UserRole;
    if (!assignableRoles(viewer.role).includes(requestedRole)) {
      return permissionDenied(`You cannot create a user with role '${requestedRole}'`);
    }

    // Critical scenario #13 fix: idempotency check. Pre-fix, calling
    // /convert twice on the same contact created TWO users and orphaned
    // the first (contact.convertedToUserId was overwritten with the
    // second user's id, leaving the first user with no contact link).
    // Now: if the contact is already converted, return 409 with the
    // existing user's id so the FE can refresh without creating a dup.
    if (contact.convertedToUserId || contact.status === 'converted') {
      const existing = usersState.find((u) => u.id === contact.convertedToUserId);
      return HttpResponse.json(
        {
          message: `Contact already converted to @${existing?.username ?? 'unknown'}`,
          code: 'ALREADY_CONVERTED',
          details: {
            convertedToUserId: contact.convertedToUserId,
            existingUsername: existing?.username,
          },
        },
        { status: 409 },
      );
    }

    // Username = first.last lowercased, with numeric suffix on collision.
    const slug = `${contact.firstName} ${contact.lastName}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9_.-]/g, '');
    let username = slug || `contact-${contact.id}`;
    let suffix = 1;
    while (usersState.some((u) => u.username.toLowerCase() === username)) {
      suffix += 1;
      username = `${slug}${suffix}`;
    }

    const now = new Date().toISOString();
    const newUser = {
      id: 'u-' + Date.now(),
      username,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? `${username}@diamond.local`,
      phone: contact.phone,
      role: requestedRole,
      groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
      parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
      tags: [],
      isActive: true,
      mustChangePassword: true,    // converted user must set their own password on first login
      createdAt: now,
      updatedAt: now,
    } as typeof usersState[number];
    usersState.push(newUser);

    const updatedContact = {
      ...contact,
      convertedToUserId: newUser.id,
      status: 'converted',
      // Phase 5 (packet): timed data retention after conversion — the contact
      // record is kept ~6 months (GL+ can extend or delete sooner), then
      // flagged expired on read (no background job in the mock).
      retainUntil: new Date(Date.parse(now) + 183 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
    } as typeof contactsState[number];
    contactsState[cidx] = updatedContact;

    const actor = { id: viewer.id, name: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username };
    // Pair the audit rows under the same Date.now() prefix so they sort
    // together in the Reports table.
    const ts = Date.now();
    pushAudit({
      id: `al-${ts}-uc`,
      action: 'create',
      entityType: 'user',
      entityId: newUser.id,
      userId: actor.id,
      userName: actor.name,
      details: `Converted contact ${contact.firstName} ${contact.lastName} → user @${username} (${String(body.role)})`,
      after: { sourceContactId: contact.id, role: newUser.role, parentId: newUser.parentId },
      timestamp: now,
      relatedUserIds: relatedUsers(actor.id, newUser.id, newUser.parentId),
    });
    pushAudit({
      id: `al-${ts}-cu`,
      action: 'update',
      entityType: 'contact',
      entityId: contact.id,
      userId: actor.id,
      userName: actor.name,
      details: `Marked contact converted; linked to @${username}`,
      before: { status: contact.status, convertedToUserId: contact.convertedToUserId },
      after: { status: 'converted', convertedToUserId: newUser.id },
      timestamp: now,
      relatedUserIds: relatedUsers(actor.id, newUser.id, contact.assignedTeacherId),
      crossBranch: isCrossBranchWrite(viewer, contact.createdBy) || undefined,
    });

    // Parity with the Supabase router: return the temp password so the admin
    // can hand the converted user their initial credential. Stored for real —
    // login demands it from this account (2026-07-18 hardening).
    const tempPassword = 'Gc-' + Math.random().toString(36).slice(2, 10) + 'X9';
    mockPasswords[newUser.id] = tempPassword;
    return HttpResponse.json({ user: newUser, contact: updatedContact, tempPassword }, { status: 201 });
  }),

  // Groups / Org
  http.get(`${API}/groups/tree`, () => {
    // Built LIVE from current user state — NOT the frozen scenarioOrgTree
    // snapshot. So a role change, a reassignment, or a relocation (all of
    // which mutate usersState) restructure the tree on the very next fetch,
    // exactly as a real backend rebuilding from parentId would. This is what
    // lets the Groups view actually reflect org churn.
    return HttpResponse.json(
      buildOrgTree(usersState as User[], mockTeacherMetrics, areasState),
    );
  }),

  // Parity with teacher_metrics() / teacher_metrics_guarded (0002 + 0007):
  // computed LIVE from contacts + completed bookings — NOT the static seed — so a
  // study marked Completed (or a stage/teacher change) immediately moves the
  // teacher's card. Guarded by canAccessReports (Branch Leader+ → else 403) and
  // scoped exactly like the RPC: Overseer/Dev see all teachers, a Branch Leader
  // only their manageable subtree. Each teacher-tagged in-scope user gets a row
  // (zeros included), matching the real `from users where tags @> ['teacher']`.
  http.get(`${API}/metrics/teachers`, ({ request }) => {
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    if (!canAccessReports(viewer)) {
      return permissionDenied('Reports access is Branch Leader and above');
    }
    const scope = buildManageableScope(viewer, usersState as User[]);
    const inScope = (uid: string) => scope.kind === 'all' || scope.userIds.includes(uid);
    const metrics = usersState
      .filter((u) => Array.isArray(u.tags) && u.tags.includes('teacher') && inScope(u.id))
      .map((u) => {
        const students = contactsState.filter((c) => c.assignedTeacherId === u.id);
        const totalStudents = students.length;
        return {
          userId: u.id,
          totalStudents,
          // mock parity: the real RPC returns 6 fields; activeStudents mirrors total.
          activeStudents: totalStudents,
          currentlyStudying: students.filter((c) => c.currentlyStudying).length,
          continuedStudying: students.filter((c) => (c.totalSessions ?? 0) > 1).length,
          baptizedSinceStudying: students.filter((c) => c.pipelineStage === PipelineStage.BAPTIZED).length,
          totalSessionsLed: bookingsState.filter(
            (b) => b.teacherId === u.id && b.status === 'completed',
          ).length,
        };
      });
    return HttpResponse.json(metrics);
  }),

  // §7.7 Append-only audit log contract (Critical scenario #22).
  // The audit log is the security record of last resort — even the highest-
  // privilege user must NOT be able to mutate it. These 5 explicit 405
  // handlers reject every tamper vector with a clear contract; otherwise
  // unmocked routes would fall through to Next.js routing and return 404
  // (still 4xx, but ambiguous about *why* the write was rejected).
  http.put(`${API}/audit-log/:id`, () =>
    methodNotAllowed('Audit log is append-only — entries cannot be edited'),
  ),
  http.patch(`${API}/audit-log/:id`, () =>
    methodNotAllowed('Audit log is append-only — entries cannot be edited'),
  ),
  http.delete(`${API}/audit-log/:id`, () =>
    methodNotAllowed('Audit log is append-only — entries cannot be deleted'),
  ),
  http.post(`${API}/audit-log`, () =>
    methodNotAllowed(
      'Audit log is append-only — entries are written by the server, not the client',
    ),
  ),
  http.delete(`${API}/audit-log`, () =>
    methodNotAllowed('Audit log is append-only — bulk delete is not supported'),
  ),

  // Audit — supports filtering, search, and pagination
  http.get(`${API}/audit-log`, ({ request }) => {
    const url = new URL(request.url);
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    const action = url.searchParams.get('action');
    const entityType = url.searchParams.get('entityType');
    const userId = url.searchParams.get('userId');
    // Phase 7 (Alerts): scope to events RELEVANT to a user — actor OR any
    // affected party (relatedUserIds). Legacy entries without the field fall
    // back to actor match so nothing vanishes. This is what the real backend's
    // per-user alert feed should scope; the mock returns the whole log
    // otherwise (existing authz gap — Mike-side).
    const relatedTo = url.searchParams.get('relatedTo');
    const search = url.searchParams.get('search')?.toLowerCase();
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '25', 10);

    let filtered = [...mockAuditLog];
    if (action) filtered = filtered.filter((e) => e.action === action);
    if (entityType) filtered = filtered.filter((e) => e.entityType === entityType);
    if (userId) filtered = filtered.filter((e) => e.userId === userId);
    if (relatedTo)
      filtered = filtered.filter(
        (e) => e.relatedUserIds?.includes(relatedTo) || e.userId === relatedTo,
      );
    if (search) {
      filtered = filtered.filter(
        (e) =>
          e.details.toLowerCase().includes(search) ||
          e.userName.toLowerCase().includes(search) ||
          e.action.includes(search) ||
          e.entityType.includes(search) ||
          e.entityId.toLowerCase().includes(search),
      );
    }
    if (startDate) {
      const s = new Date(startDate).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= s);
    }
    if (endDate) {
      const en = new Date(endDate).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= en);
    }

    // Parity with the audit_select RLS: admin-tier (Branch Leader+) see the whole
    // log; everyone else sees ONLY rows where they are the actor or a related
    // party (the Alerts feed). The mock previously returned the whole log to any
    // authed user (self-documented authz gap).
    if (!canAccessReports(viewer)) {
      filtered = filtered.filter(
        (e) => e.userId === viewer.id || (e.relatedUserIds?.includes(viewer.id) ?? false),
      );
    }
    const total = filtered.length;
    const start = (page - 1) * limit;
    const entries = filtered.slice(start, start + limit);

    return HttpResponse.json({ entries, total, page, limit });
  }),

  // Users
  http.get(`${API}/users`, ({ request }) => {
    // Parity with users_select-style visibility (salvaged wt-mock-parity
    // patch): a Member sees only their own record; leaders (Team Leader+)
    // see everyone. Previously returned the full list to any caller.
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized();
    return HttpResponse.json(usersState.filter((u) => canViewUser(viewer, u as User)));
  }),

  http.post(`${API}/users`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    // ORDER IS SECURITY-CRITICAL: authenticate -> authorize -> validate -> conflict.
    // The uniqueness probes below are an ORACLE: 409 means "this username/email
    // exists", anything else means it doesn't. Running them before the auth and
    // permission gates let an ANONYMOUS caller enumerate the whole user directory
    // (live-verified on prod 2026-07-18: POST {username:'admin'} with no
    // Authorization header returned 409 "Username already taken", while an unused
    // name returned 401). Auth and authz now run FIRST so only a caller who is
    // actually permitted to create users can learn that a name is taken — which is
    // inherent to the feature and unavoidable. Do not reorder these blocks.
    // Mirrors the real backend, where create_user (0003_admin_rpcs.sql) raises
    // PERMISSION_DENIED before it ever reaches the unique constraints.
    //
    // §7 SHIM (C-01): re-run canCreateUser with the resolved viewer.
    // Pre-shim, a Member calling POST /users with role='overseer' got 201.
    // resolveViewer reads the JWT ONLY — the second arg is inert (kept for
    // signature compatibility); body.createdById can never confer authority.
    const viewer = resolveViewer(request, {
      actorId:
        typeof body.actorId === 'string'
          ? body.actorId
          : typeof body.createdById === 'string'
            ? (body.createdById as string)
            : undefined,
    });
    if (!viewer) return unauthorized('Authentication required');
    const targetRole = String(body.role) as UserRole;
    const targetParentId =
      typeof body.parentId === 'string' ? (body.parentId as string) : undefined;
    if (
      !canCreateUser(
        viewer,
        targetRole,
        targetParentId,
        viewerSubtreeUserIds(viewer),
      )
    ) {
      return permissionDenied(
        `You cannot create a ${targetRole} account in this scope`,
      );
    }

    const username = String(body.username || '').trim().toLowerCase();
    if (!username) return validationError('Username required');
    // §7 SHIM (C-05): apply the same regex as PUT /users/:id/username.
    // Pre-shim, only PUT validated; POST accepted spaces, uppercase, etc.
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      return validationError('Use 3-32 chars: a-z, 0-9, dot, dash, underscore');
    }
    if (usersState.some((u) => u.username.toLowerCase() === username)) {
      return HttpResponse.json(
        { message: 'Username already taken', code: 'USERNAME_TAKEN' },
        { status: 409 },
      );
    }
    const email = String(body.email || '').trim().toLowerCase();
    if (email && usersState.some((u) => u.email.toLowerCase() === email)) {
      return HttpResponse.json(
        { message: 'Email already in use', code: 'EMAIL_TAKEN' },
        { status: 409 },
      );
    }

    // PARENT INTEGRITY (audit 2026-07-19). The handler previously wrote
    // body.parentId verbatim with no checks at all, and canCreateUser
    // short-circuits for admin tier before any parent inspection — so a stale
    // parentId left in the wizard (pick a parent, then raise the role: the
    // <select> silently keeps the now-ineligible id) persisted an INVERTED org
    // edge, e.g. a Group Leader reporting to a Team Leader. Every descendant
    // consumer then inherits the corruption: viewerSubtreeUserIds,
    // buildVisibilityScope, the GroupsTab tree, the /groups 3D layout.
    // The wizard now reconciles on role change (root cause); this is the guard
    // that makes the bad state unrepresentable regardless of client.
    let parent: (typeof usersState)[number] | undefined;
    if (targetParentId !== undefined) {
      parent = usersState.find((u) => u.id === targetParentId);
      if (!parent) {
        return validationError(`Parent ${targetParentId} does not exist`);
      }
      if (parent.isActive === false) {
        return validationError(`Parent @${parent.username} is deactivated`);
      }
      if (parent.role === UserRole.MEMBER) {
        return validationError('A Member cannot be a parent');
      }
      // Rank: a parent must outrank (or match) the role being created.
      if (getRoleLevel(parent.role as UserRole) < getRoleLevel(targetRole)) {
        return validationError(
          `A ${parent.role} cannot be the parent of a ${targetRole}`,
        );
      }
    }

    // HOME LOCATION (audit 2026-07-19). Creation never set locationId, so every
    // wizard-created account had no church: dropped by the Users-tab location
    // filter, excluded from getChurchUserIds, and rendered with no location on
    // its org-tree node — the person appeared not to have been created at all.
    // Mirror the seed's convention (scenario-church-week.ts:594-605): walk the
    // parent chain to the nearest ancestor that HAS a location and inherit it.
    // Inheriting beats re-deriving from the branch seeds because it also works
    // for users created under previously-created users. Overseer/Dev span all
    // locations and stay unset, exactly as the seed leaves them.
    function inheritedLocationId(): string | undefined {
      if (targetRole === UserRole.OVERSEER || targetRole === UserRole.DEV) return undefined;
      const seen = new Set<string>(); // parentId cycle guard (audit #10)
      let cur = parent;
      while (cur && !seen.has(cur.id)) {
        if (cur.locationId) return cur.locationId;
        seen.add(cur.id);
        cur = cur.parentId ? usersState.find((u) => u.id === cur!.parentId) : undefined;
      }
      return undefined;
    }
    const explicitLocationId =
      typeof body.locationId === 'string' ? (body.locationId as string) : undefined;
    if (
      explicitLocationId &&
      !areasState.some((a) => a.id === explicitLocationId && a.isActive !== false)
    ) {
      return validationError(`Unknown or inactive area ${explicitLocationId}`);
    }
    const locationId = explicitLocationId ?? inheritedLocationId();

    const now = new Date().toISOString();
    // USER-2: auto-assign sensible default tags so newly-created leaders
    // are immediately eligible to lead Bible Studies. Group + Team Leaders
    // get the 'teacher' tag by default; the matrix says all leaders teach
    // unless explicitly tagged out. Caller-supplied `tags` always wins
    // (set-union with auto-defaults so admins can opt-out by passing []).
    const explicitTags = Array.isArray(body.tags) ? (body.tags as string[]) : null;
    const role = String(body.role);
    const autoTags: string[] = [];
    if (role === 'group_leader' || role === 'team_leader' || role === 'branch_leader') {
      autoTags.push('teacher');
    }
    const tags = explicitTags ?? autoTags;

    const newUser = {
      id: 'u-' + Date.now(),
      username,
      firstName: String(body.firstName || ''),
      lastName: String(body.lastName || ''),
      email,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      role: body.role,
      locationId,
      groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
      parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
      avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : undefined,
      tags,
      isActive: true,
      mustChangePassword: true,    // new accounts are forced through Phase 6 first-login
      createdAt: now,
      updatedAt: now,
    } as typeof usersState[number];
    usersState.push(newUser);

    const actor = resolveActor(typeof body.createdById === 'string' ? body.createdById : undefined);
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'create',
      entityType: 'user',
      entityId: newUser.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created ${String(body.role)} account for ${newUser.firstName} ${newUser.lastName} (@${newUser.username})`,
      after: { role: newUser.role, parentId: newUser.parentId, groupId: newUser.groupId },
      timestamp: now,
      relatedUserIds: relatedUsers(actor.id, newUser.id, newUser.parentId),
    });

    // Return the temp password alongside the user (parity with the Supabase
    // router) so the wizard shows the ACTUAL initial credential, not a
    // locally-generated string. Stored for real — login demands it from this
    // account (2026-07-18 hardening).
    const tempPassword = 'Gc-' + Math.random().toString(36).slice(2, 10) + 'X9';
    mockPasswords[newUser.id] = tempPassword;
    return HttpResponse.json({ user: newUser, tempPassword }, { status: 201 });
  }),

  // PUT /users/:id — partial update (firstName, lastName, email, phone, role,
  // parentId, etc.). Username is changed via the dedicated /username endpoint.
  // USER-1: diff before/after; emit a paired role_change row when role
  // differs and a group_assignment row when parent/group differs. Strip
  // isActive — soft-delete must go through /deactivate so the audit row
  // reflects intent, not a back-door PUT.
  http.put(`${API}/users/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = usersState[idx];
    // §7 SHIM (C-01): authenticate + canEditUser gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canEditUser(viewer, before as User)) {
      return permissionDenied('You cannot edit this user');
    }
    // §7 SHIM (C-03): when role differs, recompute canChangeRole and 403
    // on false. Pre-shim, a Member could PUT { role: 'overseer' } and the
    // handler accepted it (only emitted a role_change audit row).
    if (typeof body.role === 'string' && body.role !== before.role) {
      if (!canChangeRole(viewer, before as User, body.role as UserRole)) {
        return permissionDenied(
          `You cannot change role from ${before.role} to ${body.role}`,
        );
      }
    }
    // §7 SHIM (C-04, audit #1/#2/#5): when parentId differs, enforce the same
    // canReassignUserToGroup scope the UI applies — the dedicated helper exists
    // but was never called server-side, so a direct PUT let any leader re-graft
    // a cross-branch user under any parent. Also reject a self-parent or a
    // descendant target, which would create a reporting cycle.
    //
    // PARITY (2026-07-14): the self-parent / cycle rejections are BAD INPUT →
    // `validationError` (400 VALIDATION_ERROR), matching the real backend, whose
    // `reassign_user` RPC raises the CYCLE sentinel (0004:53-54) that
    // pgErrorToApiError maps to 400/VALIDATION_ERROR. Only the SCOPE check below
    // stays 403 — it mirrors that RPC's PERMISSION_DENIED branch.
    if (typeof body.parentId === 'string' && body.parentId !== before.parentId) {
      if (body.parentId === before.id) {
        return validationError('A user cannot report to themselves');
      }
      // Walk the proposed parent chain; if we reach the user being moved, the
      // move would create a cycle.
      const seen = new Set<string>([before.id]);
      let cursor: User | undefined = usersState.find((u) => u.id === body.parentId);
      while (cursor) {
        if (seen.has(cursor.id)) {
          return validationError('That reassignment would create a reporting cycle');
        }
        seen.add(cursor.id);
        cursor = cursor.parentId ? usersState.find((u) => u.id === cursor!.parentId) : undefined;
      }
      if (
        !canReassignUserToGroup(
          viewer,
          before as User,
          body.parentId,
          viewerSubtreeUserIds(viewer),
        )
      ) {
        return permissionDenied('You cannot reassign this user to that parent');
      }
    }
    // Relocation scope (audit #3): locationId had NO check — anyone who could
    // edit the user could relocate them to ANY branch's area. Gate it the same
    // way as reassignment (admin-tier OR within own subtree) and reject unknown/
    // inactive target areas.
    if (typeof body.locationId === 'string' && body.locationId !== before.locationId) {
      const inScope =
        isAdminTier(viewer) || viewerSubtreeUserIds(viewer).includes(before.id);
      if (!inScope) return permissionDenied('You cannot relocate this user');
      if (
        body.locationId &&
        !areasState.some((a) => a.id === body.locationId && a.isActive !== false)
      ) {
        return HttpResponse.json(
          { message: 'Unknown or inactive location' },
          { status: 400 },
        );
      }
    }
    // Phase 3: gender ('brother' | 'sister') is editable via the generic PUT
    // (Settings profile + admin EditUserDialog) — validate the value so a
    // typo'd payload can't corrupt the booking-card color derivation.
    if (
      body.gender !== undefined &&
      body.gender !== 'brother' &&
      body.gender !== 'sister'
    ) {
      return validationError("gender must be 'brother' or 'sister'");
    }
    // Sanitize body — never let username/id/createdAt or status flags sneak
    // in via the generic PUT (USER-1).
    // §7 SHIM (C-02): strip `tags` so the dedicated /tags endpoint is the
    // only path; pre-shim, a direct API caller could replace tags via PUT
    // bypassing canManageTags.
    const sanitized = { ...body };
    delete sanitized.id;
    delete sanitized.username;
    delete sanitized.createdAt;
    delete sanitized.isActive;       // force soft-delete through /deactivate
    delete sanitized.mustChangePassword;
    delete sanitized.actorId;
    delete sanitized.tags;           // §7 SHIM C-02: dedicated endpoint only
    const updated = { ...before, ...sanitized, updatedAt: new Date().toISOString() };
    usersState[idx] = updated as typeof usersState[number];
    // Audit #4: attribute the actor to the JWT-authenticated viewer, NOT the
    // client-supplied body.actorId (which a caller could forge to frame anyone).
    const actor = resolveActor(viewer.id);
    const now = new Date().toISOString();

    // Role change row
    if (before.role !== updated.role) {
      pushAudit({
        id: 'al-' + Date.now() + '-rc',
        action: 'role_change',
        entityType: 'role_change',
        entityId: updated.id,
        userId: actor.id,
        userName: actor.name,
        details: `Role for @${updated.username}: ${before.role} → ${updated.role}`,
        before: { role: before.role },
        after: { role: updated.role },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, updated.id),
      });
    }
    // Parent/group reassignment row
    if (before.parentId !== updated.parentId || before.groupId !== updated.groupId) {
      pushAudit({
        id: 'al-' + Date.now() + '-ga',
        action: 'reassign',
        entityType: 'group_assignment',
        entityId: updated.id,
        userId: actor.id,
        userName: actor.name,
        details: `Reassignment for @${updated.username}: parent ${before.parentId ?? '∅'} → ${updated.parentId ?? '∅'}`,
        before: { parentId: before.parentId, groupId: before.groupId },
        after: { parentId: updated.parentId, groupId: updated.groupId },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, updated.id, before.parentId, updated.parentId),
      });
    }
    // Relocation row — moving a person to a different physical location (Area).
    // entityType 'area' (not 'group_assignment') so the audit filter can tell a
    // location move apart from a reporting-line move (audit #7/#9).
    if (before.locationId !== updated.locationId) {
      pushAudit({
        id: 'al-' + Date.now() + '-loc',
        action: 'reassign',
        entityType: 'area',
        entityId: updated.id,
        userId: actor.id,
        userName: actor.name,
        details: `Location for @${updated.username}: ${before.locationId ?? '∅'} → ${updated.locationId ?? '∅'}`,
        before: { locationId: before.locationId },
        after: { locationId: updated.locationId },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, updated.id),
      });
    }
    // Generic safe-fields update row (always emit so the page-level summary
    // shows that the record was touched even when nothing privileged moved).
    pushAudit({
      id: 'al-' + Date.now() + '-uu',
      action: 'update',
      entityType: 'user',
      entityId: updated.id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated profile for @${updated.username}`,
      relatedUserIds: relatedUsers(actor.id, updated.id),
      before: {
        firstName: before.firstName,
        lastName: before.lastName,
        email: before.email,
        phone: before.phone,
        avatarUrl: before.avatarUrl,
      },
      after: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl,
      },
      timestamp: now,
    });
    return HttpResponse.json(updated);
  }),

  http.post(`${API}/users/:id/deactivate`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string; cascade?: boolean };
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canDeactivateUser gate.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canDeactivateUser(viewer, usersState[idx] as User)) {
      return permissionDenied('You cannot deactivate this user');
    }
    const actor = resolveActor(viewer.id);
    const now = new Date().toISOString();
    // Phase C — orphan-gap closer: deactivating a leader leaves their reports
    // pointing at an inactive parent. `cascade` deactivates the WHOLE subtree
    // so a branch can be cleanly removed without dangling members. Default
    // (no cascade) keeps the single-user behavior; buildOrgTree surfaces any
    // orphaned subtree as a forced root so nobody silently vanishes either way.
    const targets =
      body.cascade === true
        ? subtreeUserRecords(params.id as string)
        : [usersState[idx]];
    // AUDIT #1/#6 (critical): a cascade must NOT let the viewer disable someone
    // who outranks them just because they sit inside the subtree (the tree is
    // mutable — a higher-ranked user can be grafted under a lower node). The
    // root gate alone is insufficient. All-or-nothing: reject the whole request
    // if ANY target is above the viewer's authority.
    if (targets.some((t) => !canDeactivateUser(viewer, t as User))) {
      return permissionDenied(
        'You cannot deactivate one or more people in this branch — they are above your authority',
      );
    }
    // Batch id so a later cascade-restore revives ONLY this removal, never people
    // who were deactivated independently (audit #3).
    const cascadeId = body.cascade === true ? 'cas-' + Date.now() : undefined;
    let changed = 0;
    for (const u of targets) {
      const i = usersState.findIndex((x) => x.id === u.id);
      if (i === -1 || usersState[i].isActive === false) continue;
      usersState[i] = {
        ...usersState[i],
        isActive: false,
        updatedAt: now,
        ...(cascadeId ? { deactivatedCascadeId: cascadeId } : {}),
      };
      changed++;
      pushAudit({
        id: 'al-' + Date.now() + '-' + usersState[i].id,
        action: 'delete', // closest existing action; entityType disambiguates
        entityType: 'user',
        entityId: usersState[i].id,
        userId: actor.id,
        userName: actor.name,
        details:
          `Deactivated ${usersState[i].firstName} ${usersState[i].lastName} (@${usersState[i].username})` +
          (body.cascade && usersState[i].id !== params.id ? ' (subtree of deactivated leader)' : ''),
        before: { isActive: true },
        after: { isActive: false },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, usersState[i].id, usersState[i].parentId),
      });
    }
    return HttpResponse.json({ ...usersState[idx], deactivatedCount: changed });
  }),

  http.post(`${API}/users/:id/restore`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string; cascade?: boolean };
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canDeactivateUser gates restore as well.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canDeactivateUser(viewer, usersState[idx] as User)) {
      return permissionDenied('You cannot restore this user');
    }
    const actor = resolveActor(viewer.id);
    const now = new Date().toISOString();
    // AUDIT #3: scope a cascade-restore to the root's deactivation BATCH so it
    // never resurrects someone who was deactivated independently before the
    // leader. Members without the root's batch id are left as the admin set them.
    const rootBatch = usersState[idx].deactivatedCascadeId;
    const targets =
      body.cascade === true
        ? subtreeUserRecords(params.id as string).filter(
            (t) => t.id === params.id || (rootBatch != null && t.deactivatedCascadeId === rootBatch),
          )
        : [usersState[idx]];
    // AUDIT #2: per-node authority — symmetric with deactivate, so a junior
    // leader can't re-enable a superior a higher authority intentionally disabled.
    if (targets.some((t) => !canDeactivateUser(viewer, t as User))) {
      return permissionDenied(
        'You cannot restore one or more people in this branch — they are above your authority',
      );
    }
    let changed = 0;
    for (const u of targets) {
      const i = usersState.findIndex((x) => x.id === u.id);
      if (i === -1 || usersState[i].isActive !== false) continue;
      usersState[i] = {
        ...usersState[i],
        isActive: true,
        updatedAt: now,
        deactivatedCascadeId: undefined, // clear the batch stamp on restore
      };
      changed++;
      pushAudit({
        id: 'al-' + Date.now() + '-' + usersState[i].id,
        action: 'restore',
        entityType: 'user',
        entityId: usersState[i].id,
        userId: actor.id,
        userName: actor.name,
        details: `Restored ${usersState[i].firstName} ${usersState[i].lastName} (@${usersState[i].username})`,
        before: { isActive: false },
        after: { isActive: true },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, usersState[i].id, usersState[i].parentId),
      });
    }
    return HttpResponse.json({ ...usersState[idx], restoredCount: changed });
  }),

  // POST /users/:id/reset-password — generates a one-time temp password,
  // forces a change on first login. Returns the temp password ONCE so the
  // resetter can hand it off (or read it from a future email).
  http.post(`${API}/users/:id/reset-password`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01): canResetPassword gate. Pre-shim, any caller could
    // reset any user's password by id (audit S05_reset_others_password).
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canResetPassword(viewer, usersState[idx] as User)) {
      return permissionDenied('You cannot reset this user’s password');
    }
    const adj = ['Bright', 'Quiet', 'Eager', 'Kind', 'Steady', 'Bold', 'Humble'];
    const noun = ['River', 'Mountain', 'Lantern', 'Harbor', 'Garden', 'Compass', 'Anchor'];
    const tempPassword =
      adj[Math.floor(Math.random() * adj.length)] +
      noun[Math.floor(Math.random() * noun.length)] +
      (Math.floor(Math.random() * 90) + 10);
    // The reset actually takes effect (2026-07-18 hardening) — the old
    // password stops working the moment this lands.
    mockPasswords[usersState[idx].id] = tempPassword;
    usersState[idx] = {
      ...usersState[idx],
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    };
    const actor = resolveActor(body.actorId);
    // AUDIT-1/BE-9: use entityType='password_reset' + action='reset_password'
    // so a Reports-tab filter for password resets can isolate them. The
    // audit row never carries the temp password.
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'reset_password',
      entityType: 'password_reset',
      entityId: usersState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Reset password for @${usersState[idx].username}`,
      timestamp: new Date().toISOString(),
      relatedUserIds: relatedUsers(actor.id, usersState[idx].id),
    });
    return HttpResponse.json({ tempPassword, user: usersState[idx] });
  }),

  // POST /users/:id/change-password — Phase 6 self password change.
  // Clears mustChangePassword AND stores the new password for real
  // (2026-07-18 hardening) — subsequent logins require it. Self-only, gated
  // via the JWT-resolved viewer (parity with the real route's auth.updateUser,
  // which only ever touches the SESSION user's password; closes the ungated
  // anyone-can-clear-mustChangePassword hole). Auth before 404 so the route
  // can't probe user ids.
  http.post(`${API}/users/:id/change-password`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { newPassword?: string };
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized('Authentication required');
    if (viewer.id !== params.id) return permissionDenied('You can only change your own password');
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    if (!body.newPassword || body.newPassword.length < 6) {
      return HttpResponse.json(
        { message: 'Password must be at least 6 characters', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    mockPasswords[usersState[idx].id] = body.newPassword;
    usersState[idx] = {
      ...usersState[idx],
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    };
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'password_reset',
      entityId: usersState[idx].id,
      userId: usersState[idx].id,
      userName: `${usersState[idx].firstName} ${usersState[idx].lastName}`.trim() || usersState[idx].username,
      details: `Self password change for @${usersState[idx].username}`,
      timestamp: new Date().toISOString(),
      relatedUserIds: relatedUsers(usersState[idx].id),
    });
    return HttpResponse.json(usersState[idx]);
  }),

  // PUT /users/:id/tags — replace the user's tag set.
  // AUDIT-4: emit ONE entry per added/removed tag (entityType 'tag',
  // action 'tag_grant' / 'tag_revoke') so a future filter for tag-grant
  // history can return precise matches. entityId is the tag id.
  http.put(`${API}/users/:id/tags`, async ({ request, params }) => {
    const body = (await request.json()) as { tags: string[]; actorId?: string };
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // §7 SHIM (C-01 + H-02): canManageTags gate. Pre-shim, a Member could
    // PUT { tags: ['teacher', 'co_team_leader'] } to /users/<self>/tags
    // and the handler accepted it (audit S15_tag_bypass_put_users).
    // canManageTags returns false for self, so self-grants are also blocked.
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized('Authentication required');
    if (!canManageTags(viewer, usersState[idx] as User)) {
      return permissionDenied('You cannot manage tags on this user');
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];
    const before = usersState[idx].tags ?? [];
    const beforeSet = new Set(before);
    const afterSet = new Set(tags);
    const added = tags.filter((t) => !beforeSet.has(t));
    const removed = before.filter((t) => !afterSet.has(t));
    usersState[idx] = { ...usersState[idx], tags, updatedAt: new Date().toISOString() };
    const actor = resolveActor(body.actorId);
    const username = usersState[idx].username;
    const now = new Date().toISOString();
    let seq = 0;
    for (const tag of added) {
      pushAudit({
        id: 'al-' + Date.now() + '-tg' + (seq++),
        action: 'tag_grant',
        entityType: 'tag',
        entityId: tag,
        userId: actor.id,
        userName: actor.name,
        details: `Granted tag '${tag}' to @${username}`,
        after: { userId: usersState[idx].id, tag },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, usersState[idx].id),
      });
    }
    for (const tag of removed) {
      pushAudit({
        id: 'al-' + Date.now() + '-tr' + (seq++),
        action: 'tag_revoke',
        entityType: 'tag',
        entityId: tag,
        userId: actor.id,
        userName: actor.name,
        details: `Revoked tag '${tag}' from @${username}`,
        before: { userId: usersState[idx].id, tag },
        timestamp: now,
        relatedUserIds: relatedUsers(actor.id, usersState[idx].id),
      });
    }
    return HttpResponse.json(usersState[idx]);
  }),

  /**
   * POST /api/error-log — receive structured error reports from the
   * dashboard's <ErrorBoundary> (per-user audit insurance, see
   * docs/PER_USER_AUDIT.md). Capped at ERROR_LOG_CAP entries; oldest
   * dropped first. Anonymous (auth-required) — the boundary should fire
   * before the FE realizes the session is broken.
   */
  http.post(`${API}/error-log`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Partial<ErrorLogEntry>;
    const entry: ErrorLogEntry = {
      id: 'err-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      message: typeof body.message === 'string' ? body.message.slice(0, 500) : 'unknown',
      stack: typeof body.stack === 'string' ? body.stack.slice(0, 4000) : null,
      componentStack:
        typeof body.componentStack === 'string'
          ? body.componentStack.slice(0, 4000)
          : null,
      viewerId: typeof body.viewerId === 'string' ? body.viewerId : 'anonymous',
      viewerRole: typeof body.viewerRole === 'string' ? body.viewerRole : 'anonymous',
      viewerUsername:
        typeof body.viewerUsername === 'string' ? body.viewerUsername : null,
      url: typeof body.url === 'string' ? body.url : 'unknown',
      userAgent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : 'unknown',
      timestamp:
        typeof body.timestamp === 'string'
          ? body.timestamp
          : new Date().toISOString(),
    };
    errorLogState.unshift(entry);
    if (errorLogState.length > ERROR_LOG_CAP) {
      errorLogState.length = ERROR_LOG_CAP;
    }
    return HttpResponse.json({ id: entry.id }, { status: 201 });
  }),

  /**
   * GET /api/error-log — admin-only reader. Returns the most recent
   * entries (newest first, capped at limit). FE has no consumer yet —
   * intended for `curl` inspection during ops triage. Mike's backend
   * replaces with Sentry/Datadog query.
   */
  http.get(`${API}/error-log`, ({ request }) => {
    const viewer = resolveViewer(request);
    if (!viewer) return unauthorized('Authentication required');
    // Reuse canSeeAdminPage as the gate — the audit log already uses
    // admin-tier visibility, error log is the same ops-tier surface.
    const isAdminTier =
      viewer.role === 'dev' ||
      viewer.role === 'overseer' ||
      viewer.role === 'branch_leader';
    if (!isAdminTier) {
      return permissionDenied('Admin tier required to view error log');
    }
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    return HttpResponse.json({
      entries: errorLogState.slice(0, limit),
      total: errorLogState.length,
    });
  }),

  // PUT /users/:id/username — rename with collision check (case-insensitive).
  http.put(`${API}/users/:id/username`, async ({ request, params }) => {
    const body = (await request.json()) as { username: string; actorId?: string };
    const viewer = resolveViewer(request, body);
    if (!viewer) return unauthorized();
    const desired = String(body.username || '').trim().toLowerCase();
    if (!desired) return HttpResponse.json({ message: 'Username required' }, { status: 400 });
    if (!/^[a-z0-9_.-]{3,32}$/.test(desired)) {
      return HttpResponse.json(
        { message: 'Use 3-32 chars: a-z, 0-9, dot, dash, underscore' },
        { status: 400 },
      );
    }
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    // Parity: canChangeUsername (Overseer+, and only a Dev may rename a peer
    // Overseer/above) -- the handler was ungated (anyone could rename anyone).
    if (!canChangeUsername(viewer, usersState[idx] as User)) {
      return permissionDenied('Only an Overseer or Dev in scope can rename this user');
    }
    const taken = usersState.some(
      (u) => u.id !== params.id && u.username.toLowerCase() === desired,
    );
    if (taken) return HttpResponse.json({ message: 'Username already taken' }, { status: 409 });
    const previousUsername = usersState[idx].username;
    usersState[idx] = { ...usersState[idx], username: desired, updatedAt: new Date().toISOString() };
    const actor = { id: viewer.id, name: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username };
    // AUDIT-1: dedicated entityType='username_change' + action='rename'.
    pushAudit({
      id: 'al-' + Date.now(),
      action: 'rename',
      entityType: 'username_change',
      entityId: usersState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Username @${previousUsername} → @${desired}`,
      before: { username: previousUsername },
      after: { username: desired },
      timestamp: new Date().toISOString(),
      relatedUserIds: relatedUsers(actor.id, usersState[idx].id),
    });
    return HttpResponse.json(usersState[idx]);
  }),
];
