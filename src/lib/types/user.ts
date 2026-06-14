/**
 * User identity, role, and tags.
 *
 * NOTE: Teacher used to be a role; in v1 of the admin overhaul it became a
 * tag (see `KNOWN_TAGS` below + docs/PERMISSIONS.md). The reason: many people
 * teach without being team/group/branch leaders, and many leaders teach
 * across multiple groups. Tag is orthogonal to role and easy to add to any
 * user without re-jiggering the org tree.
 */

export enum UserRole {
  MEMBER = 'member',
  TEAM_LEADER = 'team_leader',
  GROUP_LEADER = 'group_leader',
  BRANCH_LEADER = 'branch_leader',
  OVERSEER = 'overseer',
  DEV = 'dev',
}

/** Lowest → highest. Index = role level used by permissions. */
export const ROLE_HIERARCHY: UserRole[] = [
  UserRole.MEMBER,
  UserRole.TEAM_LEADER,
  UserRole.GROUP_LEADER,
  UserRole.BRANCH_LEADER,
  UserRole.OVERSEER,
  UserRole.DEV,
];

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.MEMBER]: 'Member',
  [UserRole.TEAM_LEADER]: 'Team Leader',
  [UserRole.GROUP_LEADER]: 'Group Leader',
  [UserRole.BRANCH_LEADER]: 'Branch Leader',
  [UserRole.OVERSEER]: 'Overseer',
  [UserRole.DEV]: 'Developer',
};

// ---------------------------------------------------------------------------
// Tags — orthogonal capability flags. A user can have any combination.
// ---------------------------------------------------------------------------

/**
 * Tag ids the seed scenario knows about. The data model accepts ANY string
 * here (admins can add new tags via the admin page), so this list is just
 * the seeded baseline — code that filters by tag should NOT exhaustively
 * enumerate this enum-like object.
 */
export const KNOWN_TAGS = {
  TEACHER: 'teacher',
  CO_GROUP_LEADER: 'co_group_leader',
  CO_TEAM_LEADER: 'co_team_leader',
} as const;

export const TAG_LABELS: Record<string, string> = {
  [KNOWN_TAGS.TEACHER]: 'Teacher',
  [KNOWN_TAGS.CO_GROUP_LEADER]: 'Co-Group Leader',
  [KNOWN_TAGS.CO_TEAM_LEADER]: 'Co-Team Leader',
};

/**
 * Tag id format. Single source of truth for both the Tags-tab "Define Tag"
 * dialog AND the per-user "Manage tags" dialog so the two surfaces don't
 * accept ids the other rejects (audit M-04).
 */
export const TAG_ID_REGEX = /^[a-z0-9_]{3,32}$/;
export const TAG_ID_HINT = 'Use 3–32 chars: a–z, 0–9, underscore.';

/** Helper — returns the human label for a tag, falling back to the raw id. */
export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag;
}

/** Helper — does this user carry the given tag? */
export function hasTag(user: Pick<User, 'tags'>, tag: string): boolean {
  return Array.isArray(user.tags) && user.tags.includes(tag);
}

/** Convenience — most-asked-for tag check. */
export function isTeacher(user: Pick<User, 'tags'>): boolean {
  return hasTag(user, KNOWN_TAGS.TEACHER);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  /**
   * Capability flags. Empty array if no tags. See KNOWN_TAGS for the seeded
   * baseline. Replaces the old `Teacher` role.
   */
  tags: string[];
  groupId?: string;
  parentId?: string;
  /**
   * Home physical location — an `Area` id (the "Church" a person is based at).
   * People relocate by changing this; "who's at <location>" = users whose
   * locationId matches. Overseers/Dev span all locations and may be unset.
   * Orthogonal to `parentId` (reporting line) — a person can report to a leader
   * at one location while being based at another during a transition.
   */
  locationId?: string;
  /** Soft-delete flag. Inactive users cannot log in but their historical
   *  records (bookings, contacts, audit entries) are preserved. */
  isActive?: boolean;
  /** Server-managed batch id stamped when a user is deactivated as part of a
   *  cascade. A cascade-restore only revives members sharing the root's batch,
   *  so it never resurrects someone who was deactivated independently. */
  deactivatedCascadeId?: string;
  /** Set by admin password reset; UI must route to forced-change page. */
  mustChangePassword?: boolean;
  avatarUrl?: string;
  /**
   * Server-computed effective CSV export/import flag for THIS user, resolved
   * from the per-group override tree (nearest Branch/Group/Team override
   * walking up parentId, else the global EXPORT_IMPORT_FOR_NON_ADMINS
   * default). Attached on /login + /me; consumed by canExportImport for
   * non-admin viewers. Not persisted on the User record itself.
   */
  exportImportEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface TeacherMetrics {
  userId: string;
  totalStudents: number;
  activeStudents: number;
  currentlyStudying: number;
  continuedStudying: number;
  baptizedSinceStudying: number;
  totalSessionsLed: number;
}
