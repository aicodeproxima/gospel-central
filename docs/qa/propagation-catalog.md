# Propagation action catalog — batch-2+ (entity batches) — derived 2026-06-25 via ultracode workflow

> Ready-to-execute recipes (UI trigger · code-cited reflection sites · reliable selectors · must-NOT-change · scope-negative pairs). Source: parallel derive workflow wf_343a5f3e-2a1.

# BATCH-2 PROPAGATION EXECUTION CELLS — diamond-live `feat/mobile-opt-main`

Grounding: handlers `src/mocks/handlers.ts`; UI surfaces verified line-by-line. All admin entities (rooms/areas/blocked-slots/users) live in the ADMIN CONSOLE (`/admin?tab=<key>`), NOT the calendar. Admin tab keys: `users`, `groups`, `rooms`, `blocked`, `audit`, `tags` (page.tsx:62-104). The reports Change Log is a tab at `/reports` (`TabsContent value="changelog"`, reports/page.tsx:843) whose rows render the RAW `entry.action` string in a Badge + `entityType` + `entry.details` (reports/page.tsx:498-506). Role thresholds: `isAdminTier`=branch_leader+ (permissions.ts:39-42); `canManageTags`/`canDeactivateUser`/`canEditUser` reject self and higher-rank (98-105,144-148,213-217); `canManageBlockedSlot`/`canManageArea`/`canManageRoom`/`canCreateRoom`=admin-tier (433-456); `canCreateArea`=overseer+ (437-440); `canChangeRole`=below-own-level unless Dev (134-138). Clock is `mock` for every cell (seed audit/log timestamps pinned to MOCK_DATE 2026-06-22; `assertClockActor` re-asserts `__MOCK_DATE__`).

---

## RANKING (most automatable + highest leak-surfacing first)

| rank | cell | why ranked here | clock |
|---|---|---|---|
| **1** | **(a) tags grant/revoke** | Pure admin form (`ManageTagsDialog`), deterministic 2-site reflection (row Tags badge + reports `tag_grant`/`tag_revoke` rows), scope-sensitive negative pair (member3 has no menu item). Highest reliability + leak weight. | mock |
| **2** | **(d) room create/update/deactivate** | Stable `AreaCard`/`RoomRow` DOM, in-place reload, area-selector + wizard reflection, audit `room` rows. No tree/wizard fragility. | mock |
| **3** | **(e) area create/update** | Same RoomsTab surface; area name propagates to UsersTab location filter + EditUser location select + wizard. Overseer-gated create = clean scope negative. | mock |
| **4** | **(b) role change + reparent** | `EditUserDialog` form is reliable; reflection spans audit `role_change`+`reassign` rows + **WebGL Tree3D/OrgNode (FRAGILE)** + scope. Reparent eligibility = strong leak surface. | mock |
| **5** | **(c) deactivate↔restore (cascade)** | `ConfirmDialog` + cascade checkbox reliable; subtree cascade + scope-visibility is the richest leak surface but multi-row assertion is heavier; restore inverse is clean. | mock |
| **6** | **(f) blocked-slot create/delete** | Admin form reliable, BUT reflection is INDIRECT (only the BookingWizard time-step grey-out, calendar.page.tsx:693 → wizard) and **one-off path has a confirmed STATIC data bug** (handler drops `startDateTime`/`endDateTime`). Weekly path is the only clean cell; observation is fragile (booking wizard). | mock |

---

## CELL (a) — TAGS grant/revoke · `PUT /users/:id/tags` (handlers.ts:2001-2054)

- **UI trigger** (actor `branch1`, Branch Leader): `/admin?tab=users` → locate target row (use a Member, e.g. search "member" or pick `member3`) → row `⋯` button `[aria-label="Row actions"]` (UsersTab.tsx:786) → DropdownMenuItem **"Manage tags"** (UsersTab.tsx:799, gated by `canManageTags`) → in `ManageTagsDialog` click an unselected pill (e.g. `teacher`) to GRANT and click an active pill to REVOKE (ManageTagsDialog.tsx:113-127, `aria-pressed`) → **"Save tags"** (line 171). Calls `usersApi.manageTags(id, Array.from(selected), actorId)`.
- **Expected reflection sites:**
  1. `usersTab.row.tags` — `UserRowComponent` Tags cell badges `TAG_LABELS[t]` (UsersTab.tsx:862-868) + `UserCard` (970-975). After reload (UsersTab.tsx:719-722 `onClose→reload`), the granted tag badge appears / revoked disappears.
  2. `reports.audit.tag_grant` / `reports.audit.tag_revoke` — one audit row PER add (`action:'tag_grant'`, handlers.ts:2030) and PER remove (`action:'tag_revoke'`, 2043); `entityId=tagId`. Rendered at `/reports` Change Log tab as a Badge showing literal `tag_grant`/`tag_revoke` (reports/page.tsx:498-500; ACTION_COLORS teal/rose, AuditLogTab.tsx:83-84).
  3. `usersTab.tagFilter.options` (secondary) — a brand-new custom tag id added via the dialog's "+add custom" enters `allTagOptions` on reload (UsersTab.tsx:190-195) and becomes a Tag-filter Select option.
- **Reliable Playwright observation:**
  - Tags badge: `page.locator('table tr', { hasText: '@<username>' }).locator('text=Teacher')` count before/after; mobile fallback `[class*="rounded-lg"]:has-text("@<username>")`.
  - Audit row: `/reports` → click tab `page.getByRole('tab', { name: /change log/i })` (NOT a button) → `page.getByRole('row').filter({ hasText: /tag_grant/i }).first()` visible; count delta `getByText('tag_grant').count()` +1.
- **must-NOT-change:** `user.role`, `user.parentId`, `user.username` (tags endpoint touches only `tags`+`updatedAt`, handlers.ts:2022); NO `role_change`/`reassign` audit rows emitted.
- **clock:** `mock` · **Classification:** **FRONTEND** (reflection wired). Note: handler enforces `canManageTags` server-side (out-of-scope-findings.md §SHIM line 35 — this IS gated). Scope negative `(a')`: as `member3`, the row `⋯` menu omits "Manage tags" entirely (`tagsAllowed=canManageTags→false` for self/peers, UsersTab.tsx:773,798) — assert DropdownMenuItem ABSENT = PASS.

---

## CELL (b) — ROLE change + REPARENT · `PUT /users/:id` (handlers.ts:1638-1802)

- **UI trigger** (actor `branch1`): `/admin?tab=users` → target row `⋯` → **"Edit details"** (UsersTab.tsx:794, `canEditUser`) → `EditUserDialog`: change **Role** select (`#role`, EditUserDialog.tsx:186, options = `assignableRoles(viewer)`) AND/OR **"Reports to"** `<select id="parent">` (line 207, options=`eligibleParents`) → **"Save changes"** (line 267). Sends `{role, parentId?, actorId}` only when changed (143-145). **Reparent ONLY sent when `canMoveTarget`** (admin-tier OR target in subtree, line 123) — else the select is `disabled` (211).
- **Expected reflection sites:**
  1. `reports.audit.role_change` — emitted only if `before.role !== updated.role` (handlers.ts:1729-1742, `action:'role_change'`, `entityType:'role_change'`). Change Log Badge literal `role_change` (fuchsia, AuditLogTab.tsx:85).
  2. `reports.audit.reassign` — emitted if `parentId`||`groupId` differ (handlers.ts:1744-1757, `action:'reassign'`, `entityType:'group_assignment'`). Badge literal `reassign` (cyan, :86). (A generic `user.update` row ALSO always emits, 1777-1800.)
  3. `usersTab.row.role` — Role Badge `ROLE_LABELS[u.role]` updates after reload (UsersTab.tsx:857-859).
  4. **`groups.tree.orgNode`** (FRAGILE — WebGL) — `/groups` Tree3D + `OrgNode` re-render the node's role badge `ROLE_LABELS[node.role]` (OrgNode.tsx:162,168) and re-parent the node edge. **Flag: Tree3D is a WebGL/three.js canvas (`src/components/groups/Tree3D.tsx`) — not DOM-queryable; assert via OrgNode list fallback or the `/groups` list view, NOT the canvas.**
  5. `scope.visibility` (scope-sensitive) — reparenting moves the user into/out of a leader's `buildVisibilityScope` subtree, changing `GET /users` visibility for sub-admin viewers.
- **Reliable Playwright observation:**
  - Audit: `/reports` Change Log → `getByText('role_change').count()` +1 and/or `getByText('reassign').count()` +1.
  - Row role: `page.locator('tr', { hasText:'@<username>' }).getByText(/<new role label>/)`.
  - Tree: AVOID canvas; use OrgNode DOM list `page.locator('[class*="OrgNode"]')` text, or skip with INCONCLUSIVE if only WebGL renders.
- **must-NOT-change:** `username`, `tags`, `isActive` (all stripped by sanitizer, handlers.ts:1714-1720); a role-only change must NOT emit a `reassign` row and vice-versa.
- **clock:** `mock` · **Classification:** **FRONTEND** (gated + reflected). Reparent eligibility is **scope-sensitive** → pair with a sub-scope actor (`group1`/`team1`) where the cross-branch parent is ABSENT from `eligibleParents` (EditUserDialog.tsx:108-114) = PASS-absent.

---

## CELL (c) — DEACTIVATE↔RESTORE user (subtree cascade) · `POST /users/:id/deactivate|restore` (handlers.ts:1804-1921)

- **UI trigger** (actor `branch1`): `/admin?tab=users` → target row `⋯` → **"Deactivate"** (UsersTab.tsx:813, `canDeactivateUser`, hidden if already inactive) → `ConfirmDialog` (UsersTab.tsx:652). If target has reports, a **cascade checkbox** appears (`affectedDescendantCount>0`, line 672-697, default checked) → confirm **"Deactivate"**. INVERSE: filter Status=`Inactive only` (UserFilters), row `⋯` → **"Restore"** (818) → cascade-restore checkbox → confirm.
- **Expected reflection sites:**
  1. `usersTab.row.status` — Status Badge flips Active↔Inactive (`ShieldCheck`/`ShieldAlert`, UsersTab.tsx:872-880) + row `opacity-60` (841).
  2. `reports.audit.delete` (cascade: one row PER deactivated subtree member, handlers.ts:1849-1862, `action:'delete'` entityType `user`, details append "(subtree of deactivated leader)") / `reports.audit.restore` (1907-1918). Change Log Badge literals `delete`/`restore`.
  3. `scope.visibility` (scope-sensitive) — deactivated users drop from default `GET /users` views and from booking/teacher pickers; `deactivatedCount`/`restoredCount` returned (1864,1920) drives toast "+N reports".
  4. **`groups.tree`** (FRAGILE WebGL) — orphaned subtree surfaces as a forced root (buildOrgTree, per handler comment 1819-1820).
- **Reliable Playwright observation:**
  - Status: `getByText(/Showing/)` count of Inactive badges before/after; or row `tr:has-text('@<username>') >> text=Inactive`.
  - Cascade count: assert toast `getByText(/Deactivated .* \+ \d+ reports/)` (UsersTab.tsx:283).
  - Audit: `/reports` Change Log → `getByText('delete').count()` delta == affected subtree size (cross-check vs `deactivatedCount`).
- **must-NOT-change:** target `role`/`tags`/`parentId` (only `isActive`+`updatedAt`+`deactivatedCascadeId` set, 1842-1847); restore must revive ONLY the batch `deactivatedCascadeId` (1882-1888) — independently-deactivated members must NOT be restored (R: handlers.ts:1882; assert a separately-deactivated user stays inactive).
- **clock:** `mock` · **Classification:** **FRONTEND**. Scope-sensitive negative: a junior leader cannot deactivate a superior grafted into their subtree — handler all-or-nothing rejects (1830-1834, 403) and `canDeactivateUser` hides the menu item; pair as scope negative.

---

## CELL (d) — ROOM create/update/deactivate · `POST /areas/:areaId/rooms` (645-684) / `PUT /rooms/:id` (687-721) / `POST /rooms/:id/deactivate` (723-751)

- **UI trigger** (actor `branch1`, admin-tier): `/admin?tab=rooms` → in an `AreaCard` click **"Add Room"** (RoomsTab.tsx:381, `canCreateRoom`) → `RoomFormDialog`: fill `#room-name`, `#room-capacity`, `#room-features` → **"Create room"** (line 674). UPDATE: `RoomRow` Edit `[aria-label="Edit room"]` (433) → change name → "Save changes". DEACTIVATE: RoomRow `[aria-label="Deactivate room"]` (442) → `ConfirmDialog` "Deactivate". (Toggle **"Show inactive"** line 139 to see/restore inactive rooms.)
- **Expected reflection sites:**
  1. `roomsTab.area.roomCount` — AreaCard badge `{area.rooms.length} rooms` (RoomsTab.tsx:317-319) +1 after reload; new `RoomRow` appears (366).
  2. `reports.audit.create|update|delete (entityType:room)` — handlers.ts:672-683 (create), 706-717 (update), 736-747 (deactivate). Change Log shows Badge `create`/`update`/`delete` with `entityType` cell = "room" (reports/page.tsx:503 capitalizes).
  3. `calendar.wizard.roomPicker` (cross-surface) — `/calendar` BookingWizard room step gains the new room / loses the deactivated room (deactivate filters `r.isActive!==false`, areas GET handlers.ts:517).
- **Reliable Playwright observation:**
  - Room presence: `page.locator('text=<RoomName>')` visible; area badge `getByText(/\d+ rooms?/)` text delta.
  - Audit: `/reports` Change Log → row filter `getByRole('row').filter({ hasText:'<RoomName>' })` with action Badge.
- **must-NOT-change:** ROOM_NAME_TAKEN guard — duplicate active name in same area returns 409 (handlers.ts:658-660); other areas' rooms untouched; `areaId` immutable on PUT (stripped 701).
- **clock:** `mock` · **Classification:** **FRONTEND** (gated admin-tier per SHIM, out-of-scope-findings.md line 35). Scope negative: `team1`/`group1` (non-admin) — `canCreateRoom`/`canManageRoom` false → Add Room button + room Edit/Power buttons ABSENT (RoomsTab.tsx:183,379,429).

---

## CELL (e) — AREA create/update · `POST /areas` (521-553) / `PUT /areas/:id` (555-586)

- **UI trigger** — CREATE needs **Overseer+** (`canCreateArea`, overseer1 actor): `/admin?tab=rooms` → **"Add Area"** (RoomsTab.tsx:148-153) → `AreaFormDialog`: `#area-name`, `#area-desc` → **"Create area"** (574). UPDATE needs admin-tier (`canManageArea`, branch1 OK): AreaCard Edit `[aria-label="Edit area"]` (327) → change name → "Save changes".
- **Expected reflection sites:**
  1. `roomsTab.areaCard` — new AreaCard `<h3>{area.name}` (RoomsTab.tsx:311) appears after reload; edited name updates in place.
  2. `reports.audit.create|update (entityType:area)` — handlers.ts:541-551 (create, details "Created area: <name>"), 573-584 (update). Change Log Badge `create`/`update`, entity "area".
  3. `usersTab.locationFilter` + `editUser.location` (cross-surface) — new active area enters UsersTab Location-filter Select options (UsersTab.tsx:1058) and EditUserDialog `#location` options (EditUserDialog.tsx:243); area name labels user location badges (UsersTab.tsx:199-202).
  4. `calendar.areaSelector` — `/calendar` area dropdown gains the new area (areas GET active-only, handlers.ts:514-518).
- **Reliable Playwright observation:** AreaCard `page.getByRole('heading', { name:'<AreaName>' })` visible; audit `/reports` Change Log row `hasText:'<AreaName>'`; UsersTab Location Select `getByRole('option', { name:'<AreaName>' })` after navigating to users tab.
- **must-NOT-change:** `rooms` array stripped on PUT (sanitized, handlers.ts:568); other areas untouched; create returns 201 with empty `rooms:[]`.
- **clock:** `mock` · **Classification:** **FRONTEND** (gated). Scope negative: branch1 (admin-tier but below Overseer) — "Add Area" button ABSENT (`canCreateArea` overseer+, RoomsTab.tsx:148) yet Edit-area PRESENT (`canManageArea` branch+) — strong split-gate cell distinguishing the two thresholds.

---

## CELL (f) — BLOCKED-SLOT create/delete · `POST /blocked-slots` (796-846) / `DELETE /blocked-slots/:id` (884+)

- **UI trigger** (actor `branch1`, admin-tier `canManageBlockedSlot`): `/admin?tab=blocked` → **"Add Blocked Slot"** (BlockedSlotsTab.tsx:148) → `SlotFormDialog`: `#bs-reason`, Scope, Recurrence=**Weekly** (default), Day/`#bs-start`/`#bs-end` → **"Create slot"** (559). DELETE: `SlotRow` Delete `[aria-label="Delete slot"]` (304) → `ConfirmDialog` "Remove".
- **Expected reflection sites:**
  1. `blockedTab.slotRow` — new `SlotRow` (BlockedSlotsTab.tsx:189) with reason+Day+time appears after reload; delete soft-removes (handler sets `isActive:false`, 898) → row disappears (GET filters active, 789).
  2. `reports.audit.create|delete (entityType:blocked_slot)` — handlers.ts:834-844 (create), 901+ (delete). Change Log Badge `create`/`delete`, entity "blocked_slot".
  3. **`calendar.wizard.timeStep` (INDIRECT, FRAGILE)** — blocked slots feed ONLY the BookingWizard time-step grey-out (calendar/page.tsx:693 `blockedSlots={blockedSlots}` → BookingWizard greys overlapping times, BookingWizard.tsx:241,273,343). **There is NO blocked-slot block painted on the calendar grid itself** — observation requires driving the booking wizard to the time step.
- **Reliable Playwright observation:** Slot row `page.getByText('<reason>')` visible/absent after create/delete; audit `/reports` Change Log row `hasText:'<reason>'`. Wizard grey-out is fragile — prefer the admin-row + audit assertion; treat wizard time-step as INCONCLUSIVE-tolerant.
- **must-NOT-change:** existing bookings/other slots; soft-delete only (no hard delete).
- **clock:** `mock` · **Classification (weekly):** **FRONTEND** (gated, reflected to admin+audit). **⚠ ONE-OFF path = KNOWN-backend-gap / STATIC-data bug:** `SlotFormDialog` sends `startDateTime`/`endDateTime` for one-off (BlockedSlotsTab.tsx:417-418), but `POST /blocked-slots` persists only `date` and **never reads `startDateTime`/`endDateTime`** (handlers.ts:824-828) — while the overlap check requires them (`if (!slot.startDateTime||!slot.endDateTime) continue`, handlers.ts:314-315). Result: a UI-created one-off blocked slot is stored without its window and silently NEVER blocks any booking (a no-op block). **Classify the one-off cell as KNOWN-backend-gap (mock handler field mismatch) — cite handlers.ts:824-828 vs 314-315; not in BACKEND_GAPS.md yet, candidate finding.** Scope negative: `team1`/`group1` → "Add Blocked Slot" + row actions ABSENT (`canManage` false, BlockedSlotsTab.tsx:147,295).

---

## Cross-cell fragility + integrity notes
- **WebGL Tree3D** (`src/components/groups/Tree3D.tsx`, three.js `<Canvas>`) is NOT DOM-queryable — for cells (b)/(c) tree reflection assert via the `/groups` OrgNode DOM list (`OrgNode.tsx:162` role badge) or mark tree-site INCONCLUSIVE; never assert on canvas pixels.
- **Booking wizard** (cell f, and any cancel/restore reuse) is the known renderer-crash surface (cascades.spec C3 deferred the inverse for this reason) — keep blocked-slot verification on the admin row + audit, not the wizard.
- **Reports Change Log is a TAB** — open via `page.getByRole('tab', { name:/change log/i })` then assert rows; the badge text is the RAW action enum (`tag_grant`, `reassign`, `role_change`, `delete`, `restore`), not the humanized label — match on the enum string.
- All cells: harness per `e2e/propagation/_lib.ts` (fresh context per `test()`, `appendJsonl('propagation.jsonl', …)`, `assertClockActor` asserting clock===MOCK_DATE 2026-06-22, `visibleText`/`:visible` filtering to defeat the dual-render hidden-node false-pass). Login via `loginAs(page, '<role>')` (all pw `admin`).

Files: handlers `C:\Users\aicod\Projects\_src\diamond-live\src\mocks\handlers.ts`; UI `src\components\admin\{UsersTab,RoomsTab,BlockedSlotsTab}.tsx` + `dialogs\{EditUserDialog,ManageTagsDialog}.tsx`; reflection `src\app\(dashboard)\reports\page.tsx`, `src\components\groups\OrgNode.tsx`; harness `e2e\propagation\_lib.ts`; scope docs `docs\qa\out-of-scope-findings.md`, `docs\BACKEND_GAPS.md`.