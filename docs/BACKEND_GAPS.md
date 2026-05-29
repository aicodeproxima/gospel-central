# Diamond — Backend Gaps Inventory

> **Audience:** Mike's Go backend team. **Status:** Living doc — expand as
> the frontend adds new endpoints. Born from Phase 2 audit finding BE-1.
>
> **Updated 2026-05-07:** the deep stress-test audit
> ([`docs/AUDIT_REPORT.md`](AUDIT_REPORT.md)) verified the C-1 / BE-5 /
> BLOCK-3 enforcement gaps live and produced a clearer prioritized list.
> Read [`docs/MIKE_HANDOFF.md` §0 "Audit-confirmed musts"](MIKE_HANDOFF.md#0-audit-confirmed-musts-critical--read-these-before-1)
> first — that section consolidates the seven backend-side findings the
> audit confirmed are exploitable today and includes the reproductions.
> This file remains the per-endpoint reference; §0 is the prioritized
> "what to fix first" list.

This file enumerates every endpoint the Diamond frontend calls today and
the contract Mike's Go backend must honor when it replaces MSW. It also
calls out items that are deliberately client-side-only on the frontend
and rely entirely on the server to enforce.

The browser-side helpers in `src/lib/utils/permissions.ts` are the
**source-of-truth permission rules**. They are also gates the server
**must re-run** on every mutation — the frontend gate is for UX only.

## How the frontend talks to the backend

Base URL: `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'`.
Auth: `Authorization: Bearer <jwt>` header on every request.
Wire format: JSON in / JSON out. Soft-delete via `isActive: false`; never
hard-delete from any UI surface (universal rule #7 in `PERMISSIONS.md`).

## Cross-cutting error envelopes

The frontend's `src/lib/api/client.ts` throws an `ApiError` with `status`,
`code`, `message`, and optional `details`. The backend should reply with:

```jsonc
// 401 — generic, no code needed
{ "message": "Invalid credentials" }

// 403 — permission-based denial
{ "code": "PERMISSION_DENIED", "message": "Branch Leader required", "details": { "required": "branch_leader" } }

// 409 — conflict (blocked slot, taken name, etc.)
{ "code": "BLOCKED_SLOT_CONFLICT", "message": "Overlaps Tuesday service",
  "details": { "type": "blocked_slot", "slot": { /* BlockedSlot */ } } }

// 400 — validation
{ "code": "VALIDATION_ERROR", "message": "Username must be 3-32 chars: a-z, 0-9, dot, dash, underscore" }
```

Documented codes (extend as needed):

| Code | When |
|---|---|
| `PERMISSION_DENIED` | 403 — actor is not allowed to perform this action |
| `BLOCKED_SLOT_CONFLICT` | 409 — booking overlaps a blocked window |
| `USERNAME_TAKEN` | 409 — another user already has this username |
| `EMAIL_TAKEN` | 409 — another user already has this email |
| `ROOM_NAME_TAKEN` | 409 — another room in the same area has this name |
| `INVALID_USERNAME` | 400 — fails the username regex |
| `NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `UNKNOWN` | client-side fallback when no code is supplied |

## Server middleware

The Go backend's auth middleware MUST:

1. Verify the JWT and resolve `viewer = User`.
2. For `/admin/*` routes — call `canSeeAdminPage(viewer)` and 403 if false.
3. For `/reports/*` routes — call `canAccessReports(viewer)` and 403 if false.
4. For every mutation endpoint — re-run the per-resource helper
   (`canEditUser`, `canEditBooking`, `canManageBlockedSlot`, etc.) with
   the parsed body; reject with 403 + `PERMISSION_DENIED` if false.
5. Verify scope filtering on read endpoints — see "Scope filtering" below.

## Scope filtering (per role)

The frontend's `buildVisibilityScope(viewer, allUsers)` walks the org tree
and returns the `userIds`/`branchIds`/`groupIds`/`teamIds` the viewer can
see. The backend should compute the same scope server-side and apply it as:

| Resource | Scope source |
|---|---|
| `GET /users` | Member: `[viewer]` only. Team/Group L: subtree. Branch L+: all. |
| `GET /contacts` | Member: own + assigned-to-me. Team/Group L: subtree. Branch L+: all. |
| `GET /bookings` | Everyone sees all calendars (matrix line 149) but mutations gated by `canEditBooking`. |
| `GET /audit-log` | Branch L: filter by branch derivable from entity. Overseer/Dev: all. |

## Auth + session

- `POST /api/login` — body `{ username, password }`. Returns `200 { token, user }` on success or `401 { message }` on bad creds. **Must emit** `login_success` audit row on 200, `login_failed` on 401 (entityId = attempted username).
- `GET /api/me` — Bearer → `200 User` | 401.
- `POST /api/logout` — clears session (deferred — no frontend caller yet).
- `POST /api/refresh` — refreshes JWT (deferred).

## Users

- `GET /api/users` — `200 User[]`. Server-side scope filter per matrix.
- `GET /api/users/:id` — single fetch. **(Missing in MSW — backend should add.)**
- `POST /api/users` — `CreateUserPayload` → `201 User` | `400 INVALID_USERNAME` | `409 USERNAME_TAKEN`/`EMAIL_TAKEN` | `403`. Server recomputes `canCreateUser` AND validates `targetParentId` is in viewer's subtree (Team/Group L only — Branch L+ is exempt). **Username regex:** `^[a-z0-9_.-]{3,32}$`. **Audit:** `user.create`. If `role > MEMBER`, optionally also emit `role_change`.
- `PUT /api/users/:id` — `UpdatePayload` → `200 User`. Server recomputes `canEditUser`, AND `canChangeRole` if role differs. **Must reject** `isActive` mutations on this endpoint (force soft-delete through `/deactivate`). **Audit:** diff before/after; emit `role_change` on role diff, `group_assignment` on `parentId`/`groupId` diff, `user.update` for safe-fields.
- `POST /api/users/:id/deactivate` — `200 User`. Audit: `user.delete`.
- `POST /api/users/:id/restore` — `200 User`. Audit: `user.update`.
- `POST /api/users/:id/reset-password` — `200 { tempPassword: string, user: User }`. tempPassword shown once and never logged. Sets `mustChangePassword=true`. **Audit:** `password_reset` (entityType, NOT just `user`). The audit row must NOT contain the temp password — only that one was issued.
- `PUT /api/users/:id/tags` — `{ tags: string[] }` → `200 User`. Server recomputes `canManageTags`. **Audit:** one `tag` entry per add (`action: 'tag_grant'`) and per remove (`action: 'tag_revoke'`); `entityId = tagId`.
- `PUT /api/users/:id/username` — `{ username: string }` → `200 User` | `400 INVALID_USERNAME` | `409 USERNAME_TAKEN`. Server recomputes `canChangeUsername` (Overseer+ for others, anyone for self). **Audit:** `username_change` with before/after.

## Areas + rooms

- `GET /api/areas?includeInactive=1` — `200 Area[]`. Default returns active areas with active rooms only.
- `POST /api/areas` — `{ name, description? }` → `201 Area` | `400`.
- `PUT /api/areas/:id` — `{ name?, description?, isActive? }` → `200 Area`.
- `POST /api/areas/:id/deactivate` / `/restore`.
- `POST /api/areas/:areaId/rooms` — `{ name, capacity?, features? }` → `201 Room` | `409 ROOM_NAME_TAKEN`.
- `PUT /api/rooms/:id` — `{ name?, capacity?, features?, isActive? }` → `200 Room`.
- `POST /api/rooms/:id/deactivate` / `/restore`.

## Blocked slots

- `GET /api/blocked-slots?areaId=` — `200 BlockedSlot[]`. Returns global slots + area-specific when filter given.
- `POST /api/blocked-slots` — `Omit<BlockedSlot, 'id' | 'createdAt'>` → `201`. Server recomputes `canManageBlockedSlot` (Branch L+). **Audit:** `blocked_slot.create`.
- `PUT /api/blocked-slots/:id` — `200`. **Audit:** `blocked_slot.update` with before/after.
- `DELETE /api/blocked-slots/:id` — soft-delete via isActive. **Audit:** `blocked_slot.delete`.

## Bookings

- `GET /api/bookings?start&end&areaId&roomId` — `200 Booking[]`.
- `GET /api/bookings/:id` — `200 Booking` | `404`.
- `POST /api/bookings` — `BookingFormData` → `201 Booking` | `409 BLOCKED_SLOT_CONFLICT` if overlaps a blocked window | `403`. Server **MUST** check overlap with `blocked_slots` and reject regardless of role (universal rule — "no one overrides"). **Audit:** `booking.create`.
- `PUT /api/bookings/:id` — same 409 contract as POST. `editReason` (optional) is recorded in the audit `reason` field. Server recomputes `canEditBooking`. **Audit:** `booking.update` with before/after.
- `POST /api/bookings/:id/cancel` — `{ reason: string }` → `200`. Soft-cancel; sets `status='cancelled'`, `cancelReason`, `cancelledBy`, `cancelledAt`. **Audit:** `booking.cancel`.
- `POST /api/bookings/:id/restore` — un-cancels. **Audit:** `booking.restore`.
- `DELETE /api/bookings/:id` — **DEPRECATED.** Frontend no longer hard-deletes bookings (CAL-5 fix). Backend should reject with 405 or implement as soft-delete; cancel is the only path.
- **Side-effect:** when a booking with `type=bible_study` and a `contactId` is created, the contact's `currentlyStudying`, `currentStep`, `totalSessions`, `lastSessionDate` SHOULD update. Mirrored on cancel. (CONT-6.)

## Contacts

- `GET /api/contacts?search&type&stage&sort&sortDir` — `200 Contact[]`. Server-side scope filter per matrix.
- `GET /api/contacts/:id`, `POST /api/contacts`, `PUT /api/contacts/:id`. Server recomputes the relevant `can*Contact` helper.
- `DELETE /api/contacts/:id` — soft-delete only.
- `POST /api/contacts/:id/convert` — `{ role, groupId }` → converts contact to user. Server recomputes `canConvertContact`. Sets `Contact.convertedToUserId` for traceability. **Audit:** `contact.update` + `user.create`.

## Org tree + metrics

- `GET /api/groups` — `200 Group[]`.
- `GET /api/groups/tree` — `200 OrgNode[]` (assembled tree).
- `GET /api/metrics/teachers?userId=` — `200 TeacherMetrics[]`.

## Audit log

- `GET /api/audit-log?page&limit&action&entityType&userId&search&startDate&endDate&branchId` — `200 { entries, total, page, limit }` (envelope shape — BE-7 locks this in).
- Branch Leaders pass `branchId=viewer.branchId`; server filters entries whose entity resolves into that branch's subtree.
- **No** `POST` / `PUT` / `DELETE` for audit log — append-only.
- `GET /api/audit-log/:id` — single entry fetch. **(Missing in MSW — for the Phase 7 audit-detail drawer.)**

## Audit log entry schema

Per `src/lib/types/group.ts` (expanded in AUDIT-1):

```ts
interface AuditLogEntry {
  id: string;
  action: 'create' | 'update' | 'delete' | 'cancel' | 'restore' | 'export'
        | 'login' | 'login_failed' | 'reset_password' | 'rename'
        | 'tag_grant' | 'tag_revoke' | 'role_change' | 'reassign';
  entityType: 'booking' | 'contact' | 'user' | 'group' | 'report'
            | 'tag' | 'permission' | 'blocked_slot'
            | 'password_reset' | 'username_change'
            | 'login_success' | 'login_failed'
            | 'role_change' | 'group_assignment';
  entityId: string;
  userId: string;       // actor
  userName: string;     // denormalized for fast UI render
  details: string;      // human-readable summary
  before?: unknown;     // pre-mutation snapshot of changed fields
  after?: unknown;      // post-mutation snapshot
  reason?: string;      // optional actor-supplied reason (booking edits, etc.)
  timestamp: string;    // ISO 8601
}
```

## Items NOT YET on the backend (reference)

These remain client-side until Mike's backend is ready. They are not bugs;
they are documented gaps from AUDIT_REPORT.md (2026-04-11):

- **C-1**: Server-side route enforcement on `/admin/*` and `/reports/*`.
  Today the frontend redirects on `useEffect`; once the JWT contains a
  role claim, the middleware in `src/middleware.ts` should 403 directly.
- **C-2**: Tokens currently mirror localStorage → cookie. When backend
  is live, switch to `Set-Cookie httpOnly SameSite=Lax` and remove the
  localStorage write entirely.
- **M-7**: CSRF protection — depends on whichever cookie scheme the Go
  backend chooses (double-submit token or SameSite=Strict).
- **BE-5**: Even though the frontend filters role/parent in `EditUserDialog`,
  the server MUST re-run `canChangeRole` and parent-subtree validation on
  every PUT.

## Open questions for the backend

- Should `POST /api/users` accept tags in the create payload, or always
  `[]` and force a follow-up `PUT /tags` call? Frontend currently sends
  `[]`; an audit finding (USER-2) asks for sensible defaults at create
  time. Decide where the role→tag default mapping lives.
- Audit log `before`/`after`: how much of the entity is snapshotted? The
  current frontend types accept `unknown`; recommend serializing only
  the changed fields, not the whole record.
- Booking edit history: today, only `editReason` (single-shot, last-write-
  wins) is on the booking. Audit log carries the full history. Confirm
  this is the intended source of truth or add `editHistory[]` to the
  booking row (CAL-8 deferred decision).
