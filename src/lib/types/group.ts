import { UserRole } from './user';

export interface Group {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  leaderId: string;
  leaderRole: UserRole;
  memberCount: number;
  children?: Group[];
  createdAt: string;
}

export interface OrgNode {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  groupName?: string;
  children: OrgNode[];
  metrics?: {
    totalStudents: number;
    activeStudents: number;
    currentlyStudying: number;
    continuedStudying: number;
    baptizedSinceStudying: number;
  };
}

/**
 * Audit log action verbs.
 *
 * Expanded in Phase 2 (AUDIT-1) from the original 5 verbs to cover the
 * full action vocabulary documented in docs/PERMISSIONS.md → "Audit log
 * entries". Filter UI in /reports renders all of these.
 */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'restore'
  | 'export'
  | 'login'
  | 'login_failed'
  | 'reset_password'
  | 'rename'
  | 'tag_grant'
  | 'tag_revoke'
  | 'role_change'
  | 'reassign';

/**
 * Audit log entity types.
 *
 * Expanded in Phase 2 (AUDIT-1) per docs/PERMISSIONS.md → "Audit log
 * entries". `permission` is reserved for a future per-user override
 * system; today no handler emits it but the union accepts it so we don't
 * have to widen the type later.
 */
export type AuditEntityType =
  | 'booking'
  | 'contact'
  | 'user'
  | 'group'
  | 'report'
  | 'tag'
  | 'permission'
  | 'area'
  | 'room'
  | 'blocked_slot'
  | 'password_reset'
  | 'username_change'
  | 'login_success'
  | 'login_failed'
  | 'role_change'
  | 'group_assignment';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  /**
   * JSON-serializable snapshots of the field(s) that changed. Optional —
   * older mock entries don't carry them, and trivial actions (login,
   * export) have no diff.
   */
  before?: unknown;
  after?: unknown;
  /** Optional human-readable reason supplied by the actor (e.g. for booking edits). */
  reason?: string;
  timestamp: string;
}
