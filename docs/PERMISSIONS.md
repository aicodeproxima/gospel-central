# Diamond — Permission Matrix (v1)

This document is the **single source of truth** for who can do what in the
Diamond app. Every permission utility in `src/lib/utils/permissions.ts`,
every UI gate (button visibility, route gating), and every API server-side
check **must** match this matrix exactly. If the code disagrees with this
doc, this doc wins — fix the code.

## Roles

| Level | Role enum | Display | Plain English |
|---|---|---|---|
| 0 | `member` | Member | Brother / sister attending. Default role for newly-baptized. |
| 1 | `team_leader` | Team Leader | Leads a team within a group. |
| 2 | `group_leader` | Group Leader | Leads a group within a branch. |
| 3 | `branch_leader` | Branch Leader | Leads a physical church (Newport News Zion, Chesapeake Zion, etc.). Lowest tier with admin + reports access. |
| 4 | `overseer` | Overseer | Manages multiple branches. |
| 5 | `dev` | Developer | Super-admin (Michael, Stephen). |

> **Teacher is NOT a role anymore — it's a tag.** See [Tags](#tags) below.

## Tags

Tags are orthogonal flags on a User. A user can have any combination of
tags regardless of their role. Default seeded tags:

| Tag id | Display | Default seeded population |
|---|---|---|
| `teacher` | Teacher | All Group + Team Leaders + Co-leaders, plus ~20 individual Members. Required to be assigned as the leader/teacher of a Bible Study booking. |
| `co_group_leader` | Co-Group Leader | 1 per group (10 total) — supports the primary Group Leader. |
| `co_team_leader` | Co-Team Leader | 1 per team (15 total) — supports the primary Team Leader. |

The data model is `tags: string[]`. New tag ids can be added at any time
via the admin page; the code does not enumerate them.

## Universal rules (apply everywhere)

1. **Cross-branch is allowed for read access AND for users / contacts /
   rooms / blocked slots.** Leaders (Team Leader and above) can read
   the org tree across branches and can mutate users / contacts /
   rooms / blocked slots in any branch — the 5 branches actively share
   caretaking work. **Org-tree node mutations are the documented
   exception:** a Branch Leader can only create / rename /
   deactivate **groups and teams under their own branch** (matrix
   lines 95-99); cross-branch org-tree mutations are reserved for
   Overseer+. (L-01.)
2. **Peer-edit at leader tier is allowed.** A Branch Leader can edit
   another Branch Leader. A Group Leader can edit another Group Leader.
   Members and Teachers cannot edit other Members or Teachers (self-edit
   only).
3. **Cannot modify ABOVE your own level.** Branch Leader cannot edit
   Overseer or Dev. Universal — no exceptions.
4. **Cannot grant a role at-or-above your own level.** Overseer can
   create Branch Leaders but not other Overseers. Only a Dev can create
   another Dev.
5. **Self-edit is always allowed for safe profile fields** — display
   name, phone, email, avatarUrl, theme preference (the `SAFE_SELF_FIELDS`
   constant in `src/lib/types/user.ts`). **Password is NOT in this set:**
   it goes through the dedicated `POST /users/:id/change-password`
   endpoint (gated by `canChangeOwnPassword`, universally true for any
   authenticated user). Never self-edit: username (see #6), role, tags,
   parentId, groupId. (L-03.)
6. **Username self-rename:** allowed for any role with a typed-confirm
   dialog (industry-standard pattern). Username history is recorded in
   the audit log so the previous identifier can be traced.
7. **Soft delete only.** "Deactivate" sets `is_active=false`. Restore
   re-enables. No hard delete from any UI surface.
8. **Members and Teacher-tagged users have identical permissions** —
   Teacher is a capability tag, not a privilege tag. It just makes a
   user *eligible* to be the leader of a Bible Study booking.

## Resource × Role matrix

Legend:
- ✓ = permitted everywhere within their tier scope
- ❌ = denied
- "self" = own record only
- "all" = every record (including all branches)
- A scope name (team / group / branch) means: anyone in that subtree
- "≤ level X" = at-or-below that role level
- Below-level is implied by the universal "cannot modify above own level"
  rule, so e.g. Branch Leader can manage anyone whose role level is < 3.

### Users

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View own profile | ✓ self | ✓ self | ✓ self | ✓ self | ✓ self | ✓ self |
| View other users | ❌ | all (read) | all (read) | all (read) | all (read) | all (read) |
| Create user | ❌ | up to Member | up to Team L | up to Group L | up to Branch L | any role incl. Dev |
| Edit safe fields on self (name, phone, email, password) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit role / parent / status of others | ❌ | ≤ Member, peer-edit OK | ≤ Team L, peer-edit OK | ≤ Group L, peer-edit OK | ≤ Branch L, no Dev | all |
| Reset password (others) | ❌ | ≤ Member | ≤ Team L | ≤ Group L | ≤ Branch L, no Dev | all |
| Add / remove tags on others | ❌ | ≤ Member | ≤ Team L | ≤ Group L | ≤ Branch L, no Dev | all |
| Deactivate / Restore | ❌ | ≤ Member | ≤ Team L | ≤ Group L | ≤ Branch L, no Dev | all |
| Self-rename own username | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rename someone else's username | ❌ | ❌ | ❌ | ❌ | ≤ Branch L | all |

### Org tree nodes (Branch / Group / Team)

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View tree (read) | own subtree | own subtree | own subtree | all | all | all |
| Create new Branch | ❌ | ❌ | ❌ | ❌ | ✓ | ✓ |
| Create Group under Branch | ❌ | ❌ | ❌ | own branch | any branch | any branch |
| Create Team under Group | ❌ | ❌ | own group | any branch | any branch | any branch |
| Rename node | ❌ | own team | own group | any branch | all | all |
| Deactivate / Restore | ❌ | ❌ | ❌ | own branch (Group/Team only) | all | all |
| Reassign user across nodes | ❌ | within team | within group | any branch | all | all |

### Rooms / Areas

Areas correspond 1:1 with branches (a "branch" = a physical church location).

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View list (all branches) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create Area (new branch location) | ❌ | ❌ | ❌ | ❌ | ✓ | ✓ |
| Create Room | ❌ | ❌ | ❌ | any area | any area | any area |
| Edit / rename Room or Area | ❌ | ❌ | ❌ | any area | any area | any area |
| Deactivate / Restore | ❌ | ❌ | ❌ | any area | any area | any area |

### Blocked time slots

Reserved windows that prevent ANY booking (no role can override).

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| See blocked slots on calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete blocked slot | ❌ | ❌ | ❌ | ✓ (any) | ✓ (any) | ✓ (any) |

Default seeded global blocked slots (apply to all 5 branches):

- Tuesday 20:00–21:00 — *Tuesday service*
- Saturday 09:00–10:00 — *Sabbath morning service*
- Saturday 15:00–16:00 — *Sabbath afternoon service*
- Saturday 20:00–21:00 — *Sabbath evening service*

### Contacts

Visibility (READ) scope follows the leader's subtree — reachable via the
contact's **creator or assigned teacher** — plus the contact's explicit
assigned-owner / assigned-team / assigned-group fields. Branch Leaders and
above read all branches.

**Writes follow Decision 10 (2026-07 overhaul)** and take the MANAGEABLE
scope (`buildManageableScope`), not the visibility scope:

- Members create contacts, and edit/delete **only their own creations**.
  Being the assigned teacher is view-only for a member — study fields are
  updated by the booking-completion flow, not direct edits.
- Team Leaders and above change any contact **in their manageable scope**
  (creator OR assigned teacher reachable in their own subtree). A Branch
  Leader's manageable scope is their own branch — cross-branch contact
  writes are Overseer/Dev only.
- Bulk-delete applies the same gate per selected row.

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View | own-created + assigned-to-me | team | group | all branches | all | all |
| Create (owner = self) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create (assign to other user) | ❌ | within team | within group | any branch | all | all |
| Edit / Delete (own creations) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit / Delete (others') | ❌ | within team | within group | **own branch only** | all | all |
| Bulk-delete | own rows only | rows in team | rows in group | rows in own branch | all | all |
| Reassign owner | ❌ | within team | within group | own branch | all | all |
| Convert contact → user account | ❌ | within team | within group | own branch | all | all |
| CSV export (Decision 13) | ❌ | ❌ | ✓ | ✓ | ✓ | ✓ |

### Bookings (calendar)

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View calendar (all branches) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create own booking | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit / cancel own booking | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit / cancel others' bookings | ❌ | team | group | any branch | all | all |

### Reports & Audit Log

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View Reports dashboard | ❌ | ❌ | ❌ | branch-scoped | all | all |
| Export CSV (current view) | ❌ | ❌ | ❌ | branch-scoped | all | all |
| Export CSV (global) | ❌ | ❌ | ❌ | branch-scoped | all | all |
| View Audit Log | ❌ | ❌ | ❌ | branch-scoped | all | all |

### Data export / import (CSV)

The CSV affordances on the **shared** pages — calendar booking export, and the
contacts import + export buttons. (Export buttons *inside* `/admin` tabs are
already gated by the admin page; the Reports-dashboard export keeps its own
`canExportReports` gate.)

| Action | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Export / import CSV (calendar, contacts) | ❌ | ❌ | per-group | ✓ | ✓ | ✓ |

> **Decision 13 GL+ floor (2026-07 overhaul):** export/import surfaces gate on
> **Group Leader and up**. A Member or Team Leader NEVER gets the affordance,
> **regardless of their group's per-group override** (anti-scraping) — the
> floor short-circuits before the flag is read.
>
> **Admin-tier (Branch Leader+) always has access** regardless of any setting.
>
> For **Group Leaders** (the only non-admin tier at/above the floor) access is
> resolved **per group, at every org level**:
>
> - Admins set an **On / Off / Inherit** switch on any Branch, Group, or Team
>   node from the **Export / Import** admin tab.
> - A node with no explicit switch **inherits** the nearest ancestor's setting
>   (Team → Group → Branch), falling back to the global
>   `EXPORT_IMPORT_FOR_NON_ADMINS` default (**OFF**) when nothing above it is
>   set. Members inherit from their Team.
> - The server resolves this chain with `resolveExportImportEnabled(...)` and
>   stamps the effective boolean onto the user as `user.exportImportEnabled`
>   at `/login` + `/me`; `canExportImport(viewer)` then reads that flag (after
>   the admin short-circuit), so the call sites never change.
> - **Edit scope:** a Branch Leader may toggle only nodes inside their **own
>   branch** (own-subtree); Overseer / Dev may toggle any node. Out-of-scope
>   nodes render read-only. Every change writes a `permission` audit entry.

### Admin page (`/admin`)

| Tab | Member | Team L | Group L | Branch L | Overseer | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| /admin link visible in sidebar | ❌ | ❌ | ❌ | ✓ | ✓ | ✓ |
| Users tab | — | — | — | branch-scoped | all (no Dev) | all |
| Groups tab | — | — | — | branch-scoped | all | all |
| Rooms / Areas tab | — | — | — | any branch | all | all |
| Blocked Slots tab | — | — | — | any | all | all |
| Contacts tab | — | — | — | branch-scoped | all | all |
| Audit Log tab | — | — | — | branch-scoped | all | all |
| Tags tab (manage tag definitions) | — | — | — | view only | full | full |
| Permissions tab (read-only display of this matrix) | — | — | — | view only | view only | view only |
| Export / Import tab (per-group CSV toggles) | — | — | — | own branch | all | all |
| System Config tab (env, theme defaults, etc.) | — | — | — | — | — | ✓ |

> **Group / Team Leaders manage their people via the existing `/groups` org-tree's "Add User" button** — they don't need a separate /admin tab for the small surface they control.

## "No one ever" rules

- **No one** hard-deletes users, contacts, groups, rooms, blocked slots, or audit entries from the UI.
- **No one** can demote or deactivate a Dev — only another Dev.
- **No one** can create a user at a role above their own.
- **No one** can override a blocked slot. Booking attempts overlapping a blocked slot are rejected with `409 Conflict` regardless of role.
- **No one** sees raw passwords. Reset emits a one-time token + temporary password, shown to the resetter once. The temporary password forces a change on first login.
- **No one** modifies the audit log — it is append-only.

## Permission utility names (in code)

Every cell above is encoded as a pure function in `src/lib/utils/permissions.ts`:

```ts
canViewUser(viewer, target)
canEditUser(viewer, target)
canChangeRole(viewer, target, newRole)
canDeactivateUser(viewer, target)
canResetPassword(viewer, target)
canCreateUser(viewer, targetRole, targetParentId?, subtreeUserIds?)
canManageTags(viewer, target)
canChangeUsername(viewer, target)

canViewGroup(viewer, group?)
canCreateGroupNode(viewer, kind, parentNodeId?, subtreeUserIds?)   // 'branch' | 'group' | 'team'
canRenameGroup(viewer, nodeRole, nodeId?, subtreeUserIds?)
canDeactivateGroup(viewer, kind, nodeId?, subtreeUserIds?)
canReassignUserToGroup(viewer, user, newParentUserId, subtreeUserIds?)

canViewArea(viewer, area)              // always true
canManageArea(viewer, area)
canCreateRoom(viewer, area)
canManageRoom(viewer, room)

canManageBlockedSlot(viewer, slot)     // create/edit/delete

canViewContact(viewer, contact)        // READ scope (visibility subtree; creator OR assigned teacher)
canCreateContact(viewer, ownerUserId)
canEditContact(viewer, contact)        // Decision 10 WRITE gate — pass buildManageableScope userIds
canDeleteContact(viewer, contact)      // Decision 10: delete == edit gate (bulk-delete applies per row)
canReassignContact(viewer, contact, newOwnerId)
canConvertContact(viewer, contact)

canEditBooking(viewer, booking)
canSetBookingStatus(viewer, booking)   // outcome status (Completed/No Show/Rescheduled): teacher | creator | leader-in-scope | admin-tier. Metrics count ONLY Completed studies (2026-07 overhaul Decision 11).

canAccessReports(viewer)
canExportReports(viewer)
canExportImport(viewer)                // CSV export/import on shared pages; admin-tier OR (GL+ floor AND viewer.exportImportEnabled per-group) — Decision 13
resolveExportImportEnabled(userId, users, overrides)   // walk parentId; nearest On/Off override wins, else EXPORT_IMPORT_FOR_NON_ADMINS
resolveExportImportDetailed(userId, users, overrides)  // same, but also returns which node decided it (for the admin tab's "inheriting from X")

canSeeAdminPage(viewer)
canSeeAdminTab(viewer, tab)            // 'users' | 'groups' | 'rooms' | 'blocked' | 'contacts' | 'audit' | 'tags' | 'permissions' | 'export-import' | 'system'
canEditSystemConfig(viewer)

scopeForRole(viewer)                   // returns { kind, branchIds, groupIds, teamIds, userIds }
buildVisibilityScope(viewer, users)    // what a viewer can SEE — Branch L+ => kind 'all' (whole org)
buildManageableScope(viewer, users)    // what a viewer can ADMINISTER/toggle — Branch L => OWN branch subtree (NOT 'all'); only Overseer/Dev => 'all'
```

> **Visibility ≠ edit authority.** A Branch Leader can *see* the whole org
> (`buildVisibilityScope` → `'all'`) but may only *toggle* settings inside
> their own branch (`buildManageableScope` → own subtree). Admin edit gates
> (e.g. the Export / Import tab + its server endpoint) MUST use
> `buildManageableScope`; using `buildVisibilityScope` would silently let a
> Branch Leader edit every branch.

Every helper is pure `(viewer, target?) => boolean` so it's testable without DOM, store, or network.

## Last-resort rules

If two rules conflict, the **stricter** rule wins. If neither rule clearly
applies, the action is **denied by default** (deny-by-default policy).
This means new code that forgets to check permissions **fails closed**
rather than silently allowing access.

## Audit log entries

Every state-changing action listed above MUST emit an audit log entry
with at minimum: `{ actor_user_id, actor_role, action, entity_type,
entity_id, before?, after?, reason?, ip?, timestamp }`. New entity types
introduced by this overhaul:

- `user` — already existed
- `tag` — for tag-grant / tag-revoke actions
- `permission` — reserved for future per-user override system
- `blocked_slot` — for blocked-slot CRUD
- `password_reset` — when a leader resets someone's password
- `username_change` — when a username changes (self-rename or admin-rename)
- `login_success` / `login_failed` — for auth observability
- `role_change` — for role escalation/demotion
- `group_assignment` — when a user moves between groups/teams

## Backend implications

This matrix is enforced **client-side** by the helpers above (controlling
button visibility and route gating) AND **server-side** by middleware on
every API endpoint that mutates state. The frontend gate is for UX; the
backend gate is for security. Both must agree.

The Mike-side gaps that this matrix introduces are tracked in
`docs/BACKEND_GAPS.md` (created in Phase 8).
