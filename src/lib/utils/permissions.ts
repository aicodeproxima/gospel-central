/**
 * Diamond — permission utilities.
 *
 * SOURCE OF TRUTH: docs/PERMISSIONS.md. If a helper here disagrees with that
 * doc, fix the helper — the doc wins. Every helper is a pure function of
 * (viewer, target?) so it can be unit-tested without DOM, store, or network.
 *
 * Two cross-cutting rules baked into nearly every helper:
 *   1. CROSS-BRANCH — leaders (Team Leader and above) can act on records in
 *      ANY branch, not just their own. Branches actively share caretaking.
 *   2. PEER-EDIT — leaders can edit other users at the SAME role level.
 *      A Branch Leader can edit another Branch Leader. The universal "cannot
 *      modify ABOVE your own level" rule still applies, so a Branch Leader
 *      can never edit an Overseer or a Dev.
 *
 * "deny by default" — when a rule is unclear or a required field is missing,
 * helpers return `false`. Forgetting a check fails closed, not open.
 */

import { ROLE_HIERARCHY, UserRole, type User } from '../types';
import type { Area, BlockedSlot, Booking, Contact, Group } from '../types';

// =============================================================================
// Hierarchy primitives
// =============================================================================

/** Role rank. Higher = more authority. Member=0, Dev=5. Unknown roles → -1. */
export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/** True if the viewer can act on records in any branch (Team Leader+). */
export function isLeader(viewer: User | undefined | null): boolean {
  if (!viewer) return false;
  return getRoleLevel(viewer.role) >= getRoleLevel(UserRole.TEAM_LEADER);
}

/** True if the viewer is on or above the admin tier (Branch Leader+). */
export function isAdminTier(viewer: User | undefined | null): boolean {
  if (!viewer) return false;
  return getRoleLevel(viewer.role) >= getRoleLevel(UserRole.BRANCH_LEADER);
}

/**
 * Returns the roles a creator may assign when adding a new user.
 *   - Devs may create any role including another Dev.
 *   - Anyone else can create roles strictly BELOW their own level.
 */
export function assignableRoles(creatorRole: UserRole): UserRole[] {
  const max = getRoleLevel(creatorRole);
  if (creatorRole === UserRole.DEV) return [...ROLE_HIERARCHY];
  return ROLE_HIERARCHY.slice(0, max);
}

// =============================================================================
// Users
// =============================================================================

/**
 * Fields a user is allowed to edit on their own record (universal rule #5
 * in PERMISSIONS.md).
 *
 * Username, role, tags, parentId, groupId are NOT in this list — those go
 * through dedicated helpers (canChangeUsername, canChangeRole, canManageTags,
 * canReassignUserToGroup). Password change goes through canChangeOwnPassword
 * + the dedicated /settings change-password form.
 */
export const SAFE_SELF_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'avatarUrl',
] as const;

export type SafeSelfField = (typeof SAFE_SELF_FIELDS)[number];

/**
 * canViewUser — see docs/PERMISSIONS.md → Users → "View other users"
 */
export function canViewUser(viewer: User, target: User): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return true;
  return isLeader(viewer);
}

/**
 * canEditUser — see docs/PERMISSIONS.md → Users → "Edit role / parent / status of others"
 *
 * Members cannot edit other Members. Otherwise: viewer.level >= target.level
 * (peer-edit allowed at leader tier), only Devs can edit Devs.
 *
 * NOTE: For self-edit this returns true unconditionally. Callers MUST gate
 * each individual field through `canEditUserField(viewer, target, field)` —
 * directly using canEditUser to allow a self-payload that includes role/tags
 * is a privilege-escalation vector (SEC-2).
 */
export function canEditUser(viewer: User, target: User): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return true;
  if (getRoleLevel(target.role) > getRoleLevel(viewer.role)) return false;
  if (target.role === UserRole.DEV && viewer.role !== UserRole.DEV) return false;
  if (viewer.role === UserRole.MEMBER) return false;
  return true;
}

/**
 * canEditUserField — single-field edit gate (SEC-2).
 *
 * Self-edit is permitted only for SAFE_SELF_FIELDS. Role, tags, parent,
 * group, username, password each go through their dedicated helpers.
 *
 * For other targets the rule mirrors canEditUser — the field gate exists
 * primarily to keep self-edit honest.
 */
export function canEditUserField(
  viewer: User,
  target: User,
  field: string,
): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) {
    return (SAFE_SELF_FIELDS as readonly string[]).includes(field);
  }
  return canEditUser(viewer, target);
}

/**
 * canChangeRole — assigning a role to a target user.
 *
 * Combines canEditUser with the "cannot grant a role at-or-above your own
 * level" rule (Devs are the exception — they can grant Dev).
 */
export function canChangeRole(viewer: User, target: User, newRole: UserRole): boolean {
  if (!canEditUser(viewer, target)) return false;
  if (viewer.role === UserRole.DEV) return true;
  return getRoleLevel(newRole) < getRoleLevel(viewer.role);
}

/**
 * canDeactivateUser — soft-delete (sets isActive=false). Forbids
 * self-deactivation; otherwise mirrors canEditUser.
 */
export function canDeactivateUser(viewer: User, target: User): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return false;
  return canEditUser(viewer, target);
}

/**
 * canResetPassword — admin-initiated password reset for SOMEONE ELSE.
 *
 * Self password change does NOT go through this helper — it has its own
 * dedicated /settings flow gated by canChangeOwnPassword. Returning false
 * for self ensures the admin "reset" affordance never appears on the
 * viewer's own row, matching the matrix's "Reset password (others)"
 * wording (ADMIN-2).
 */
export function canResetPassword(viewer: User, target: User): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return false;
  return canEditUser(viewer, target);
}

/**
 * canChangeOwnPassword — self password change is universally allowed for
 * any authenticated user (gated by the change-password flow's "old
 * password" check; the mock backend accepts any password).
 */
export function canChangeOwnPassword(viewer: User | undefined | null): boolean {
  return !!viewer;
}

/**
 * canCreateUser — combines (a) leader-tier required, (b) cannot grant a
 * role at-or-above own level, and (c) for non-admin-tier creators, the
 * new user's parent must sit inside the creator's subtree (PERM-3 / USER-3).
 *
 * `targetParentId` and `subtreeUserIds` are optional for backwards-compat
 * with callers that only need the role-tier check.
 */
export function canCreateUser(
  viewer: User,
  targetRole: UserRole,
  targetParentId?: string,
  subtreeUserIds: string[] = [],
): boolean {
  if (!isLeader(viewer)) return false;
  if (viewer.role === UserRole.DEV) return true;
  if (getRoleLevel(targetRole) >= getRoleLevel(viewer.role)) return false;
  // Branch Leader+ can create anywhere (cross-branch caretaking).
  if (isAdminTier(viewer)) return true;
  // Team / Group leaders without an explicit parent fall through to the
  // role-tier check only (wizard often invokes the helper before the parent
  // is picked). Once a parent IS picked, it must lie in the subtree.
  if (targetParentId === undefined) return true;
  if (targetParentId === viewer.id) return true;
  return subtreeUserIds.includes(targetParentId);
}

/**
 * @deprecated Use `canCreateUser(viewer, targetRole)` for new code.
 * Kept for backwards-compat with the contacts page header gate. (PERM-4.)
 */
export function canCreateUsers(role: UserRole): boolean {
  return getRoleLevel(role) >= getRoleLevel(UserRole.TEAM_LEADER);
}

/**
 * canManageTags — add/remove tags on a target. Self-tag-management is NOT
 * allowed (tags carry capability) — only your superior can.
 */
export function canManageTags(viewer: User, target: User): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return false;
  return canEditUser(viewer, target);
}

/**
 * canManageTagDefinitions — manage the tag-definition catalog itself in the
 * admin Tags tab. Branch Leader sees the tab as VIEW-ONLY; Overseer+ has
 * full edit. canSeeAdminTab gates visibility; this helper gates the edit
 * affordances inside the tab. (PERM-2.)
 */
export function canManageTagDefinitions(viewer: User | null | undefined): boolean {
  if (!viewer) return false;
  return getRoleLevel(viewer.role) >= getRoleLevel(UserRole.OVERSEER);
}

/**
 * canChangeUsername — admin-rename of someone else's username.
 *
 * Per matrix line 87: Overseer+ only. AND the universal "cannot modify
 * above own level" rule means an Overseer cannot rename a peer Overseer
 * either — only Devs can rename Overseers. (SEC-4.)
 *
 * Self-rename is universal with the typed-confirm dialog
 * (canChangeOwnUsername).
 */
export function canChangeUsername(viewer: User, target: User): boolean {
  if (!viewer || !target) return false;
  if (viewer.id === target.id) return canChangeOwnUsername(viewer);
  if (getRoleLevel(viewer.role) < getRoleLevel(UserRole.OVERSEER)) return false;
  // SEC-4: Overseer cannot rename peer Overseer or above. Only Devs rename
  // Overseers. canEditUser would otherwise allow peer-edit and silently
  // violate the matrix.
  if (
    getRoleLevel(target.role) >= getRoleLevel(UserRole.OVERSEER) &&
    viewer.role !== UserRole.DEV
  ) {
    return false;
  }
  return canEditUser(viewer, target);
}

/**
 * canChangeOwnUsername — see PERMISSIONS.md → Universal rule #6.
 * Industry-standard: any role can rename themselves with a typed
 * confirmation dialog. The audit log records the change.
 */
export function canChangeOwnUsername(_viewer: User): boolean {
  return true;
}

// =============================================================================
// Org tree nodes (Branch / Group / Team)
// =============================================================================

export type GroupNodeKind = 'branch' | 'group' | 'team';

/**
 * canViewGroup — page-level gate; every authenticated user sees the org
 * tree page. (Per-node subtree filtering for Members/Team/Group is applied
 * at render time when iterating the tree — separate concern.) PERM-5: now
 * deny-by-default for null viewer; group param accepted but unused for now.
 */
export function canViewGroup(
  viewer: User | undefined | null,
  _group?: Group,
): boolean {
  if (!viewer) return false;
  return true;
}

/**
 * canCreateGroupNode — kind-specific creation rules per matrix lines 94-96:
 *   - branch: Overseer+
 *   - group:  Branch Leader own-branch / Overseer+ any branch
 *   - team:   Group Leader own-group / Branch Leader+ any branch
 *
 * M-01 follow-up: optional `parentNodeId` + `subtreeUserIds` enforce the
 * matrix's scope restrictions for sub-Admin-tier creators. When the
 * caller hasn't picked a parent yet (parentNodeId === undefined), the
 * helper falls back to the role-tier check so wizard-style affordances
 * can still light up before the parent is chosen. Once a parent IS
 * supplied, sub-Admin creators must have it in their subtree.
 */
export function canCreateGroupNode(
  viewer: User,
  kind: GroupNodeKind,
  parentNodeId?: string,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer) return false;
  const tier = getRoleLevel(viewer.role);
  switch (kind) {
    case 'branch':
      return tier >= getRoleLevel(UserRole.OVERSEER);
    case 'group': {
      if (tier < getRoleLevel(UserRole.BRANCH_LEADER)) return false;
      // Overseer+ can create groups in any branch (matrix: 'any branch').
      if (tier >= getRoleLevel(UserRole.OVERSEER)) return true;
      // Branch Leader: only own branch when parent specified.
      if (parentNodeId === undefined) return true;
      if (parentNodeId === viewer.id) return true;
      return subtreeUserIds.includes(parentNodeId);
    }
    case 'team': {
      if (tier < getRoleLevel(UserRole.GROUP_LEADER)) return false;
      // Branch L+ can create teams in any branch.
      if (tier >= getRoleLevel(UserRole.BRANCH_LEADER)) return true;
      // Group Leader: only own group when parent specified.
      if (parentNodeId === undefined) return true;
      if (parentNodeId === viewer.id) return true;
      return subtreeUserIds.includes(parentNodeId);
    }
  }
}

/**
 * canRenameGroup — rename a Branch / Group / Team leader's display name
 * (matrix line 97). Branch Leader+ may rename any node; Group / Team
 * leaders are restricted to their own subtree.
 *
 * M-02 follow-up: optional `nodeId` + `subtreeUserIds` enforce the
 * matrix's scope restrictions. When `nodeId` is omitted the helper
 * remains backwards-compatible with tier-only callers.
 */
export function canRenameGroup(
  viewer: User,
  nodeRole: UserRole,
  nodeId?: string,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer) return false;
  const viewerLevel = getRoleLevel(viewer.role);
  const nodeLevel = getRoleLevel(nodeRole);
  // Cannot modify above own level (universal rule #3).
  if (nodeLevel > viewerLevel) return false;
  // Branch L+ — cross-branch allowed.
  if (viewerLevel >= getRoleLevel(UserRole.BRANCH_LEADER)) return true;
  // Sub-Admin tier must be a leader (Member can't rename anyone).
  if (!isLeader(viewer)) return false;
  // Without nodeId we fall back to tier-only (backwards-compat).
  if (nodeId === undefined) return true;
  // With nodeId, the node must lie inside viewer's subtree.
  if (nodeId === viewer.id) return true;
  return subtreeUserIds.includes(nodeId);
}

/**
 * canDeactivateGroup — soft-delete a Branch / Group / Team node (matrix
 * line 98). Branch deactivation is Overseer-only; Group / Team
 * deactivation is Branch Leader own-branch or Overseer+ any-branch.
 *
 * M-02 follow-up: optional `nodeId` + `subtreeUserIds` enforce the
 * Branch Leader own-branch restriction. Backwards-compatible with
 * tier-only callers when nodeId is omitted.
 */
export function canDeactivateGroup(
  viewer: User,
  kind: GroupNodeKind,
  nodeId?: string,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer) return false;
  if (kind === 'branch') return getRoleLevel(viewer.role) >= getRoleLevel(UserRole.OVERSEER);
  if (!isAdminTier(viewer)) return false;
  // Overseer+ can deactivate any group/team across branches.
  if (getRoleLevel(viewer.role) >= getRoleLevel(UserRole.OVERSEER)) return true;
  // Branch Leader: own branch only when target node is identified.
  if (nodeId === undefined) return true;
  if (nodeId === viewer.id) return true;
  return subtreeUserIds.includes(nodeId);
}

/**
 * canReassignUserToGroup — moving a user under a different parent / node.
 * (PERM-1.)
 *
 * Per matrix:
 *   - Member: ❌
 *   - Team Leader: within own team
 *   - Group Leader: within own group
 *   - Branch Leader+: any branch
 *
 * Caller passes `subtreeUserIds` (build via `buildVisibilityScope`). For
 * Team and Group leaders BOTH the user being moved AND the new
 * parent/node leader must be inside that scope. Branch Leader+ skip the
 * subtree check.
 */
export function canReassignUserToGroup(
  viewer: User,
  user: User,
  newParentUserId: string,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer || !user) return false;
  if (isAdminTier(viewer)) return true;
  if (!isLeader(viewer)) return false;
  return (
    subtreeUserIds.includes(user.id) &&
    subtreeUserIds.includes(newParentUserId)
  );
}

// =============================================================================
// Areas / Rooms (each Area = a branch's physical location)
// =============================================================================

/**
 * canViewArea — anyone authenticated can see the room list. PERM-5: now
 * deny-by-default for null viewer; area param accepted but unused for now.
 */
export function canViewArea(
  viewer?: User | null,
  _area?: Area,
): boolean {
  if (!viewer) return false;
  return true;
}

export function canManageArea(viewer: User): boolean {
  return isAdminTier(viewer);
}

export function canCreateArea(viewer: User): boolean {
  if (!viewer) return false;
  return getRoleLevel(viewer.role) >= getRoleLevel(UserRole.OVERSEER);
}

export function canCreateRoom(viewer: User): boolean {
  return isAdminTier(viewer);
}

export function canManageRoom(viewer: User): boolean {
  return isAdminTier(viewer);
}

// =============================================================================
// Blocked time slots
// =============================================================================

export function canManageBlockedSlot(viewer: User, _slot?: BlockedSlot): boolean {
  return isAdminTier(viewer);
}

// =============================================================================
// Contacts
// =============================================================================

export function canViewContact(
  viewer: User,
  contact: Contact,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer || !contact) return false;
  if (isAdminTier(viewer)) return true;
  if (contact.assignedTeacherId === viewer.id) return true;
  if (contact.createdBy === viewer.id) return true;
  if (contact.assignedTeacherId && subtreeUserIds.includes(contact.assignedTeacherId)) return true;
  return false;
}

export function canCreateContact(
  viewer: User,
  ownerUserId: string,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer) return false;
  if (viewer.id === ownerUserId) return true;
  if (isAdminTier(viewer)) return true;
  if (!isLeader(viewer)) return false;
  return subtreeUserIds.includes(ownerUserId);
}

export function canEditContact(
  viewer: User,
  contact: Contact,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer || !contact) return false;
  if (viewer.id === contact.assignedTeacherId) return true;
  if (isAdminTier(viewer)) return true;
  if (!isLeader(viewer)) return false;
  return contact.assignedTeacherId !== undefined &&
    subtreeUserIds.includes(contact.assignedTeacherId);
}

export function canReassignContact(
  viewer: User,
  contact: Contact,
  newOwnerId: string,
  subtreeUserIds: string[] = [],
): boolean {
  return (
    canEditContact(viewer, contact, subtreeUserIds) &&
    canCreateContact(viewer, newOwnerId, subtreeUserIds)
  );
}

export function canConvertContact(
  viewer: User,
  contact: Contact,
  subtreeUserIds: string[] = [],
): boolean {
  if (!isLeader(viewer)) return false;
  return canEditContact(viewer, contact, subtreeUserIds);
}

// =============================================================================
// Bookings
// =============================================================================

export function canEditBooking(
  viewer: User,
  booking: Booking,
  subtreeUserIds: string[] = [],
): boolean {
  if (!viewer || !booking) return false;
  if (booking.createdBy === viewer.id) return true;
  if (booking.teacherId === viewer.id) return true;
  if (isAdminTier(viewer)) return true;
  if (!isLeader(viewer)) return false;
  return (
    subtreeUserIds.includes(booking.createdBy) ||
    (booking.teacherId !== undefined && subtreeUserIds.includes(booking.teacherId))
  );
}

// =============================================================================
// Reports + audit log
// =============================================================================

export function canAccessReports(viewerOrRole: User | UserRole): boolean {
  const role = typeof viewerOrRole === 'string' ? viewerOrRole : viewerOrRole?.role;
  if (!role) return false;
  return getRoleLevel(role) >= getRoleLevel(UserRole.BRANCH_LEADER);
}

export function canExportReports(viewerOrRole: User | UserRole): boolean {
  return canAccessReports(viewerOrRole);
}

// =============================================================================
// Data export / import (CSV affordances on non-admin pages)
// =============================================================================

/**
 * Feature flag — when true, NON-admin roles also see the CSV export/import
 * affordances that live on shared pages (calendar booking export, contacts
 * import + export). Default OFF: export/import is admin-tier (Branch Leader+)
 * only for now. Flip to true — or later wire this to the admin System Config
 * tab — to roll it out to every role without touching any call site.
 */
export const EXPORT_IMPORT_FOR_NON_ADMINS = false;

/**
 * canExportImport — single gate for every CSV export/import affordance that
 * is exposed on pages non-admins can reach (calendar export, contacts
 * import + export). Admin-tier always has it; everyone else follows
 * EXPORT_IMPORT_FOR_NON_ADMINS.
 *
 * NOTE: the export buttons inside `/admin` tabs (Users / Groups / Contacts /
 * Audit) are already gated by canSeeAdminPage, so they do NOT call this. The
 * Reports-dashboard export keeps its own canExportReports gate.
 */
export function canExportImport(viewer: User | null | undefined): boolean {
  if (!viewer) return false;
  if (isAdminTier(viewer)) return true;
  return EXPORT_IMPORT_FOR_NON_ADMINS;
}

/**
 * @deprecated Use `canConvertContact(viewer, contact, ...)` for new code.
 * Kept for backwards-compat with the contacts page header gate. (PERM-4.)
 */
export function canConvertContacts(role: UserRole): boolean {
  return getRoleLevel(role) >= getRoleLevel(UserRole.TEAM_LEADER);
}

// =============================================================================
// Admin page
// =============================================================================

export function canSeeAdminPage(viewer: User | undefined | null): boolean {
  return isAdminTier(viewer);
}

export type AdminTab =
  | 'users'
  | 'groups'
  | 'rooms'
  | 'blocked'
  | 'contacts'
  | 'audit'
  | 'tags'
  | 'permissions'
  | 'system';

/**
 * canSeeAdminTab — gates VISIBILITY only. For tabs that are read/write per
 * role (e.g. Tags), the EDIT affordance inside the tab is gated separately
 * by helpers like canManageTagDefinitions.
 */
export function canSeeAdminTab(viewer: User, tab: AdminTab): boolean {
  if (!isAdminTier(viewer)) return false;
  switch (tab) {
    case 'users':
    case 'groups':
    case 'rooms':
    case 'blocked':
    case 'contacts':
    case 'audit':
      return true;
    case 'tags':
      return true;          // visibility for all admin-tier; canManageTagDefinitions gates edit
    case 'permissions':
      return true;          // read-only matrix viewer for all admin-tier
    case 'system':
      return viewer.role === UserRole.DEV;
  }
}

export function canEditSystemConfig(viewer: User): boolean {
  if (!viewer) return false;
  return viewer.role === UserRole.DEV;
}

// =============================================================================
// Scope summary
// =============================================================================

export type ScopeKind = 'self' | 'team' | 'group' | 'branch' | 'all';

/**
 * scopeForRole — coarse description of the *visibility* scope a viewer has,
 * used to build server queries / filter lists at render time.
 *
 * For a richer object that includes the actual user/branch/group/team IDs,
 * use `buildVisibilityScope(viewer, allUsers)`.
 */
export function scopeForRole(viewer: User): ScopeKind {
  if (!viewer) return 'self';
  switch (viewer.role) {
    case UserRole.MEMBER:        return 'self';
    case UserRole.TEAM_LEADER:   return 'team';
    case UserRole.GROUP_LEADER:  return 'group';
    case UserRole.BRANCH_LEADER:
    case UserRole.OVERSEER:
    case UserRole.DEV:
      return 'all';
  }
}

/**
 * VisibilityScope — rich shape promised by docs/PERMISSIONS.md (line 231).
 *
 * Returns the user / branch / group / team IDs the viewer can see under
 * their role. For `kind: 'all'` (Branch L+), every IDs field is empty by
 * convention — the caller should NOT filter; "empty" means "everything is
 * in scope." (CONT-2.)
 */
export interface VisibilityScope {
  kind: ScopeKind;
  userIds: string[];
  branchIds: string[];
  groupIds: string[];
  teamIds: string[];
}

/**
 * buildVisibilityScope — walk the user list using parentId edges to
 * collect the viewer's reachable subtree. Pure function; caller passes
 * the full user list (typically from `usersApi.getAll()` cached in the
 * page) so this helper has no I/O.
 */
export function buildVisibilityScope(
  viewer: User | null | undefined,
  allUsers: User[],
): VisibilityScope {
  const empty: VisibilityScope = {
    kind: 'self',
    userIds: [],
    branchIds: [],
    groupIds: [],
    teamIds: [],
  };
  if (!viewer) return empty;

  const kind = scopeForRole(viewer);
  if (kind === 'all') {
    return { kind: 'all', userIds: [], branchIds: [], groupIds: [], teamIds: [] };
  }
  if (kind === 'self') {
    return { ...empty, kind: 'self', userIds: [viewer.id] };
  }

  // Iterative fixed-point pass — for our scale (<200 users) this is fast.
  const reach = new Set<string>([viewer.id]);
  const branchIds = new Set<string>();
  const groupIds = new Set<string>();
  const teamIds = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const u of allUsers) {
      if (u.parentId && reach.has(u.parentId) && !reach.has(u.id)) {
        reach.add(u.id);
        added = true;
        if (u.role === UserRole.BRANCH_LEADER) branchIds.add(u.id);
        else if (u.role === UserRole.GROUP_LEADER) groupIds.add(u.id);
        else if (u.role === UserRole.TEAM_LEADER) teamIds.add(u.id);
      }
    }
  }
  return {
    kind,
    userIds: Array.from(reach),
    branchIds: Array.from(branchIds),
    groupIds: Array.from(groupIds),
    teamIds: Array.from(teamIds),
  };
}
