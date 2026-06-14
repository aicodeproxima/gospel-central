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
import {
  buildVisibilityScope,
  buildManageableScope,
  canChangeRole,
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
  isAdminTier,
  resolveExportImportEnabled,
  EXPORT_IMPORT_FOR_NON_ADMINS,
} from '../lib/utils/permissions';
import type { User } from '../lib/types/user';
import { UserRole } from '../lib/types/user';
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
 * GETs reflect the change. This keeps everything client-side and ephemeral —
 * a refresh resets everything back to the scenario.
 *
 * Call `resetMockState()` from auth-store.logout() so a second demo-user
 * session starts with a clean slate instead of carrying over the previous
 * user's mutations (audit L-6).
 *
 * NOTE: `resetMockState` truncates the audit log on logout. This is a
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

/**
 * Resolve the full viewer User record for permission checks. Tries
 * `actorId` body field first (the FE's convention), then falls back to
 * the mock JWT in the Authorization header (`mock-jwt-token-${userId}`)
 * so a malicious direct-API call without an `actorId` is still gated.
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

/** Helper for visibility-scope-restricted permission checks. */
function viewerSubtreeUserIds(viewer: User): string[] {
  return buildVisibilityScope(viewer, usersState as User[]).userIds;
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

export const handlers = [
  // Auth
  http.post(`${API}/login`, async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    const username = String(body.username || '');
    const user = usersState.find((u) => u.username === username);
    const now = new Date().toISOString();

    const fail = (reason: string) => {
      // AUDIT-2: emit a login_failed entry with the attempted username so
      // brute-force / probing patterns can be reconstructed. entityId is
      // the attempted username (no user id available).
      mockAuditLog.push({
        id: 'al-' + Date.now() + '-lf',
        action: 'login_failed',
        entityType: 'login_failed',
        entityId: username || 'unknown',
        userId: 'anonymous',
        userName: username || 'unknown',
        details: `Failed login: ${reason}`,
        timestamp: now,
      });
      return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    };

    if (!user) return fail('unknown user');
    // Seeded users use 'admin'; users created via the registry wizard
    // accept any non-empty password (prototype — Mike's backend will own
    // real password storage).
    const isSeeded = mockUsers.some((u) => u.id === user.id);
    if (isSeeded && body.password !== 'admin') return fail('bad password');
    if (!isSeeded && !body.password) return fail('empty password');

    // AUDIT-2: emit login_success
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-ls',
      action: 'login',
      entityType: 'login_success',
      entityId: user.id,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`.trim() || user.username,
      details: `Login success: @${user.username}`,
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

    mockAuditLog.push({
      id: 'al-' + Date.now() + '-eii',
      action: 'update',
      entityType: 'permission',
      entityId: nodeId,
      userId: viewer.id,
      userName: `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.username,
      details: `Export/import for "${nodeName}" set to ${label(clearing ? undefined : !!body.value)}`,
      before: { exportImport: label(prev) },
      after: { exportImport: label(clearing ? undefined : !!body.value) },
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
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-ac',
      action: 'create',
      entityType: 'area',
      entityId: newArea.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created area: ${newArea.name}`,
      after: { name: newArea.name },
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
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-au',
      action: 'update',
      entityType: 'area',
      entityId: areasState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated area: ${areasState[idx].name}`,
      before: { name: before.name },
      after: { name: areasState[idx].name },
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
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-ad',
      action: 'delete',
      entityType: 'area',
      entityId: areasState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Deactivated area: ${areasState[idx].name}`,
      before: { isActive: true },
      after: { isActive: false },
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
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-ar',
      action: 'restore',
      entityType: 'area',
      entityId: areasState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Restored area: ${areasState[idx].name}`,
      before: { isActive: false },
      after: { isActive: true },
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
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-rc',
      action: 'create',
      entityType: 'room',
      entityId: newRoom.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created room: ${newRoom.name} in ${areasState[idx].name}`,
      after: { name: newRoom.name, areaId },
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
      mockAuditLog.push({
        id: 'al-' + Date.now() + '-ru',
        action: 'update',
        entityType: 'room',
        entityId: area.rooms[ridx].id,
        userId: actor.id,
        userName: actor.name,
        details: `Updated room: ${area.rooms[ridx].name}`,
        before: { name: before.name, capacity: before.capacity },
        after: { name: area.rooms[ridx].name, capacity: area.rooms[ridx].capacity },
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
      mockAuditLog.push({
        id: 'al-' + Date.now() + '-rd',
        action: 'delete',
        entityType: 'room',
        entityId: area.rooms[ridx].id,
        userId: actor.id,
        userName: actor.name,
        details: `Deactivated room: ${area.rooms[ridx].name}`,
        before: { isActive: true },
        after: { isActive: false },
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
      mockAuditLog.push({
        id: 'al-' + Date.now() + '-rr',
        action: 'restore',
        entityType: 'room',
        entityId: area.rooms[ridx].id,
        userId: actor.id,
        userName: actor.name,
        details: `Restored room: ${area.rooms[ridx].name}`,
        before: { isActive: false },
        after: { isActive: true },
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
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'create',
      entityType: 'blocked_slot',
      entityId: newSlot.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created blocked slot: ${reason}`,
      after: newSlot,
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
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'blocked_slot',
      entityId: updated.id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated blocked slot: ${updated.reason ?? ''}`,
      before,
      after: updated,
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
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'delete',
      entityType: 'blocked_slot',
      entityId: before.id,
      userId: actor.id,
      userName: actor.name,
      details: `Removed blocked slot: ${before.reason ?? ''}`,
      before,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json({ success: true });
  }),

  // Bookings
  http.get(`${API}/bookings`, ({ request }) => {
    const url = new URL(request.url);
    const areaId = url.searchParams.get('areaId');
    let filtered = bookingsState;
    if (areaId) filtered = filtered.filter((b) => b.areaId === areaId);
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
    const newBooking = {
      id: 'b' + Date.now(),
      ...body,
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
      mockAuditLog.push({
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
        timestamp: newBooking.createdAt,
      });
    }
    // CONT-6: when a Bible-study booking is created with a contactId,
    // bump that contact's session counters so the pipeline reflects the
    // session in real time. Mirrored on cancel below.
    const contactId = typeof body.contactId === 'string' ? body.contactId : undefined;
    const isStudy = typeof body.activity === 'string' && body.activity === 'bible_study';
    if (contactId && isStudy) {
      const cidx = contactsState.findIndex((c) => c.id === contactId);
      if (cidx !== -1) {
        const c = contactsState[cidx];
        contactsState[cidx] = {
          ...c,
          totalSessions: (c.totalSessions ?? 0) + 1,
          lastSessionDate: typeof body.startTime === 'string' ? body.startTime : c.lastSessionDate,
          currentlyStudying: true,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return HttpResponse.json(newBooking, { status: 201 });
  }),

  http.put(`${API}/bookings/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
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
      mockAuditLog.push({
        id: 'al-' + Date.now(),
        action: 'update',
        entityType: 'booking',
        entityId: updated.id,
        userId: 'u-michael',
        userName: 'Michael',
        details: `Edited booking: ${reason}`,
        timestamp: new Date().toISOString(),
      });
    }
    return HttpResponse.json(updated);
  }),

  // CAL-5: convert hard-delete to soft-cancel so booking history is
  // preserved and the audit trail captures the deletion. Universal rule
  // #7 in PERMISSIONS.md ("Soft delete only") applies.
  http.delete(`${API}/bookings/:id`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = bookingsState[idx];
    const updated = {
      ...before,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelReason: 'Booking deleted',
      cancelledBy: typeof body.actorId === 'string' ? body.actorId : 'unknown',
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    const actor = resolveActor(body.actorId);
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'delete',
      entityType: 'booking',
      entityId: before.id,
      userId: actor.id,
      userName: actor.name,
      details: `Deleted booking "${before.title}" (soft-cancelled, history preserved)`,
      before,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json({ success: true });
  }),

  // Cancel a booking (soft-delete with reason tracking + audit log)
  http.post(`${API}/bookings/:id/cancel`, async ({ request, params }) => {
    const body = (await request.json()) as { reason?: string };
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    const updated = {
      ...booking,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelReason: (body.reason || '').trim(),
      cancelledBy: 'u-michael',
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'cancel',
      entityType: 'booking',
      entityId: updated.id,
      userId: 'u-michael',
      userName: 'Michael',
      details: `Cancelled booking "${booking.title}": ${body.reason || 'No reason'}`,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // Restore a cancelled booking
  http.post(`${API}/bookings/:id/restore`, ({ params }) => {
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    const updated = {
      ...booking,
      status: 'active',
      cancelledAt: undefined,
      cancelReason: undefined,
      cancelledBy: undefined,
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'booking',
      entityId: updated.id,
      userId: 'u-michael',
      userName: 'Michael',
      details: `Restored cancelled booking "${booking.title}"`,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // Contacts — supports search, type, stage, sort
  http.get(`${API}/contacts`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.toLowerCase();
    const type = url.searchParams.get('type');
    const stage = url.searchParams.get('stage');
    const sort = url.searchParams.get('sort') || 'name';
    const sortDir = url.searchParams.get('sortDir') || 'asc';

    let filtered = [...contactsState];
    if (search) filtered = filtered.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.email || ''} ${c.phone || ''} ${c.groupName || ''}`.toLowerCase().includes(search),
    );
    if (type && type !== 'all') filtered = filtered.filter((c) => c.type === type);
    if (stage && stage !== 'all') filtered = filtered.filter((c) => c.pipelineStage === stage);

    // Sort
    const dir = sortDir === 'desc' ? -1 : 1;
    const stageOrder: Record<string, number> = {
      first_study: 0, regular_study: 1, progressing: 2, baptism_ready: 3, baptized: 4,
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
    const newContact = {
      id: 'c' + Date.now(),
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as typeof contactsState[number];
    contactsState.push(newContact);
    // §7 SHIM (H-01 audit gap): emit contact.create row.
    const actor = resolveActor(
      typeof body.actorId === 'string' ? body.actorId : undefined,
    );
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-cc',
      action: 'create',
      entityType: 'contact',
      entityId: newContact.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created contact: ${newContact.firstName} ${newContact.lastName}`,
      after: { type: newContact.type, pipelineStage: newContact.pipelineStage },
      timestamp: newContact.createdAt,
    });
    return HttpResponse.json(newContact, { status: 201 });
  }),

  http.put(`${API}/contacts/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = contactsState[idx];
    const updated = { ...before, ...body, updatedAt: new Date().toISOString() };
    contactsState[idx] = updated as typeof contactsState[number];
    // §7 SHIM (H-01 audit gap): emit contact.update row.
    const actor = resolveActor(
      typeof body.actorId === 'string' ? body.actorId : undefined,
    );
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-cu',
      action: 'update',
      entityType: 'contact',
      entityId: updated.id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated contact ${updated.firstName} ${updated.lastName}`,
      before: { pipelineStage: before.pipelineStage, status: before.status },
      after: { pipelineStage: updated.pipelineStage, status: updated.status },
      timestamp: updated.updatedAt,
    });
    return HttpResponse.json(updated);
  }),

  // §7 SHIM (C-04): soft-delete contacts instead of splice. Universal rule
  // #7 from PERMISSIONS.md ("Soft delete only. No hard delete from any UI
  // surface."). Sets status='inactive' so the record is preserved for the
  // audit trail and a future restore. Pre-shim behavior was a hard splice
  // (line 621-625 of the AUDIT_REPORT.md repro).
  http.delete(`${API}/contacts/:id`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { actorId?: string };
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const before = contactsState[idx];
    const updated = {
      ...before,
      status: 'inactive',
      updatedAt: new Date().toISOString(),
    } as typeof contactsState[number];
    contactsState[idx] = updated;
    const actor = resolveActor(body.actorId);
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-cd',
      action: 'delete',
      entityType: 'contact',
      entityId: before.id,
      userId: actor.id,
      userName: actor.name,
      details: `Soft-deleted contact ${before.firstName} ${before.lastName}`,
      before: { status: before.status },
      after: { status: 'inactive' },
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
    const cidx = contactsState.findIndex((c) => c.id === params.id);
    if (cidx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const contact = contactsState[cidx];

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
      role: body.role,
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
      updatedAt: now,
    } as typeof contactsState[number];
    contactsState[cidx] = updatedContact;

    const actor = resolveActor(body.actorId);
    // Pair the audit rows under the same Date.now() prefix so they sort
    // together in the Reports table.
    const ts = Date.now();
    mockAuditLog.push({
      id: `al-${ts}-uc`,
      action: 'create',
      entityType: 'user',
      entityId: newUser.id,
      userId: actor.id,
      userName: actor.name,
      details: `Converted contact ${contact.firstName} ${contact.lastName} → user @${username} (${String(body.role)})`,
      after: { sourceContactId: contact.id, role: newUser.role, parentId: newUser.parentId },
      timestamp: now,
    });
    mockAuditLog.push({
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
    });

    return HttpResponse.json({ user: newUser, contact: updatedContact }, { status: 201 });
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

  http.get(`${API}/metrics/teachers`, () => {
    return HttpResponse.json(mockTeacherMetrics);
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
    const action = url.searchParams.get('action');
    const entityType = url.searchParams.get('entityType');
    const userId = url.searchParams.get('userId');
    const search = url.searchParams.get('search')?.toLowerCase();
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '25', 10);

    let filtered = [...mockAuditLog];
    if (action) filtered = filtered.filter((e) => e.action === action);
    if (entityType) filtered = filtered.filter((e) => e.entityType === entityType);
    if (userId) filtered = filtered.filter((e) => e.userId === userId);
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

    const total = filtered.length;
    const start = (page - 1) * limit;
    const entries = filtered.slice(start, start + limit);

    return HttpResponse.json({ entries, total, page, limit });
  }),

  // Users
  http.get(`${API}/users`, () => {
    return HttpResponse.json(usersState);
  }),

  http.post(`${API}/users`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const username = String(body.username || '').trim().toLowerCase();
    if (!username) return validationError('Username required');
    // §7 SHIM (C-05): apply the same regex as PUT /users/:id/username.
    // Pre-shim, only PUT validated; POST accepted spaces, uppercase, etc.
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      return validationError('Use 3-32 chars: a-z, 0-9, dot, dash, underscore');
    }
    if (usersState.some((u) => u.username.toLowerCase() === username)) {
      return HttpResponse.json({ message: 'Username already taken' }, { status: 409 });
    }
    const email = String(body.email || '').trim().toLowerCase();
    if (email && usersState.some((u) => u.email.toLowerCase() === email)) {
      return HttpResponse.json({ message: 'Email already in use' }, { status: 409 });
    }
    // §7 SHIM (C-01): re-run canCreateUser with the resolved viewer.
    // Pre-shim, a Member calling POST /users with role='overseer' got 201.
    // The FE creator's id arrives as `createdById`; we accept either that
    // or `actorId` for symmetry with the rest of the API.
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
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'create',
      entityType: 'user',
      entityId: newUser.id,
      userId: actor.id,
      userName: actor.name,
      details: `Created ${String(body.role)} account for ${newUser.firstName} ${newUser.lastName} (@${newUser.username})`,
      after: { role: newUser.role, parentId: newUser.parentId, groupId: newUser.groupId },
      timestamp: now,
    });

    return HttpResponse.json(newUser, { status: 201 });
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
    if (typeof body.parentId === 'string' && body.parentId !== before.parentId) {
      if (body.parentId === before.id) {
        return permissionDenied('A user cannot report to themselves');
      }
      // Walk the proposed parent chain; if we reach the user being moved, the
      // move would create a cycle.
      const seen = new Set<string>([before.id]);
      let cursor: User | undefined = usersState.find((u) => u.id === body.parentId);
      while (cursor) {
        if (seen.has(cursor.id)) {
          return permissionDenied('That reassignment would create a reporting cycle');
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
      mockAuditLog.push({
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
      });
    }
    // Parent/group reassignment row
    if (before.parentId !== updated.parentId || before.groupId !== updated.groupId) {
      mockAuditLog.push({
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
      });
    }
    // Relocation row — moving a person to a different physical location (Area).
    // entityType 'area' (not 'group_assignment') so the audit filter can tell a
    // location move apart from a reporting-line move (audit #7/#9).
    if (before.locationId !== updated.locationId) {
      mockAuditLog.push({
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
      });
    }
    // Generic safe-fields update row (always emit so the page-level summary
    // shows that the record was touched even when nothing privileged moved).
    mockAuditLog.push({
      id: 'al-' + Date.now() + '-uu',
      action: 'update',
      entityType: 'user',
      entityId: updated.id,
      userId: actor.id,
      userName: actor.name,
      details: `Updated profile for @${updated.username}`,
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
    for (const u of targets) {
      const i = usersState.findIndex((x) => x.id === u.id);
      if (i === -1 || usersState[i].isActive === false) continue;
      usersState[i] = { ...usersState[i], isActive: false, updatedAt: now };
      mockAuditLog.push({
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
      });
    }
    return HttpResponse.json({ ...usersState[idx], deactivatedCount: targets.length });
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
    const targets =
      body.cascade === true
        ? subtreeUserRecords(params.id as string)
        : [usersState[idx]];
    for (const u of targets) {
      const i = usersState.findIndex((x) => x.id === u.id);
      if (i === -1 || usersState[i].isActive !== false) continue;
      usersState[i] = { ...usersState[i], isActive: true, updatedAt: now };
      mockAuditLog.push({
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
      });
    }
    return HttpResponse.json({ ...usersState[idx], restoredCount: targets.length });
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
    usersState[idx] = {
      ...usersState[idx],
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    };
    const actor = resolveActor(body.actorId);
    // AUDIT-1/BE-9: use entityType='password_reset' + action='reset_password'
    // so a Reports-tab filter for password resets can isolate them. The
    // audit row never carries the temp password.
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'reset_password',
      entityType: 'password_reset',
      entityId: usersState[idx].id,
      userId: actor.id,
      userName: actor.name,
      details: `Reset password for @${usersState[idx].username}`,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json({ tempPassword, user: usersState[idx] });
  }),

  // POST /users/:id/change-password — Phase 6 self password change.
  // Clears mustChangePassword. Real backend will hash + persist; the mock
  // doesn't actually store passwords (login accepts any value for non-
  // seeded users) so we just acknowledge.
  http.post(`${API}/users/:id/change-password`, async ({ request, params }) => {
    const body = (await request.json().catch(() => ({}))) as { newPassword?: string };
    const idx = usersState.findIndex((u) => u.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    if (!body.newPassword || body.newPassword.length < 6) {
      return HttpResponse.json(
        { message: 'Password must be at least 6 characters', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    usersState[idx] = {
      ...usersState[idx],
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    };
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'password_reset',
      entityId: usersState[idx].id,
      userId: usersState[idx].id,
      userName: `${usersState[idx].firstName} ${usersState[idx].lastName}`.trim() || usersState[idx].username,
      details: `Self password change for @${usersState[idx].username}`,
      timestamp: new Date().toISOString(),
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
      mockAuditLog.push({
        id: 'al-' + Date.now() + '-tg' + (seq++),
        action: 'tag_grant',
        entityType: 'tag',
        entityId: tag,
        userId: actor.id,
        userName: actor.name,
        details: `Granted tag '${tag}' to @${username}`,
        after: { userId: usersState[idx].id, tag },
        timestamp: now,
      });
    }
    for (const tag of removed) {
      mockAuditLog.push({
        id: 'al-' + Date.now() + '-tr' + (seq++),
        action: 'tag_revoke',
        entityType: 'tag',
        entityId: tag,
        userId: actor.id,
        userName: actor.name,
        details: `Revoked tag '${tag}' from @${username}`,
        before: { userId: usersState[idx].id, tag },
        timestamp: now,
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
    const taken = usersState.some(
      (u) => u.id !== params.id && u.username.toLowerCase() === desired,
    );
    if (taken) return HttpResponse.json({ message: 'Username already taken' }, { status: 409 });
    const previousUsername = usersState[idx].username;
    usersState[idx] = { ...usersState[idx], username: desired, updatedAt: new Date().toISOString() };
    const actor = resolveActor(body.actorId);
    // AUDIT-1: dedicated entityType='username_change' + action='rename'.
    mockAuditLog.push({
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
    });
    return HttpResponse.json(usersState[idx]);
  }),
];
