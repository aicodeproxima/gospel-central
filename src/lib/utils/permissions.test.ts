/**
 * Permission utility tests.
 *
 * These tests pin every cell of the matrix in docs/PERMISSIONS.md to a
 * concrete, executable assertion. If a future refactor breaks any of them,
 * either the doc is wrong (update doc) or the helper is wrong (update code).
 *
 * Run: npm test
 */

import { describe, expect, test } from 'vitest';
import {
  assignableRoles,
  buildVisibilityScope,
  canAccessReports,
  canChangeOwnPassword,
  canChangeOwnUsername,
  canChangeRole,
  canChangeUsername,
  canConvertContact,
  canCreateArea,
  canCreateContact,
  canCreateGroupNode,
  canCreateRoom,
  canCreateUser,
  canDeactivateGroup,
  canDeactivateUser,
  canEditBooking,
  canEditContact,
  canEditSystemConfig,
  canEditUser,
  canEditUserField,
  canExportImport,
  canExportReports,
  canManageArea,
  canManageBlockedSlot,
  canManageRoom,
  canManageTagDefinitions,
  canManageTags,
  canReassignContact,
  canReassignUserToGroup,
  canRenameGroup,
  canResetPassword,
  canSeeAdminPage,
  canSeeAdminTab,
  canViewArea,
  canViewContact,
  canViewGroup,
  canViewUser,
  getRoleLevel,
  isAdminTier,
  isLeader,
  scopeForRole,
  EXPORT_IMPORT_FOR_NON_ADMINS,
} from './permissions';
import type { Booking, Contact, User } from '../types';
import { UserRole } from '../types';

// ---------------------------------------------------------------------------
// Test fixtures — one user per role, plus a few edge users
// ---------------------------------------------------------------------------

function mkUser(id: string, role: UserRole, extras: Partial<User> = {}): User {
  return {
    id,
    username: id,
    firstName: id,
    lastName: '',
    email: `${id}@diamond.test`,
    role,
    tags: [],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...extras,
  };
}

const dev1     = mkUser('dev1',     UserRole.DEV);
const dev2     = mkUser('dev2',     UserRole.DEV);
const overseer = mkUser('over',     UserRole.OVERSEER);
const branchA  = mkUser('branchA',  UserRole.BRANCH_LEADER);
const branchB  = mkUser('branchB',  UserRole.BRANCH_LEADER);
const groupA   = mkUser('groupA',   UserRole.GROUP_LEADER);
const groupB   = mkUser('groupB',   UserRole.GROUP_LEADER);
const teamA    = mkUser('teamA',    UserRole.TEAM_LEADER);
const teamB    = mkUser('teamB',    UserRole.TEAM_LEADER);
const memberA  = mkUser('memberA',  UserRole.MEMBER);
const memberB  = mkUser('memberB',  UserRole.MEMBER);

// ===========================================================================
// Hierarchy primitives
// ===========================================================================

describe('hierarchy primitives', () => {
  test('getRoleLevel ordering matches PERMISSIONS.md', () => {
    expect(getRoleLevel(UserRole.MEMBER)).toBe(0);
    expect(getRoleLevel(UserRole.TEAM_LEADER)).toBe(1);
    expect(getRoleLevel(UserRole.GROUP_LEADER)).toBe(2);
    expect(getRoleLevel(UserRole.BRANCH_LEADER)).toBe(3);
    expect(getRoleLevel(UserRole.OVERSEER)).toBe(4);
    expect(getRoleLevel(UserRole.DEV)).toBe(5);
  });

  test('isLeader = Team Leader and above', () => {
    expect(isLeader(memberA)).toBe(false);
    expect(isLeader(teamA)).toBe(true);
    expect(isLeader(groupA)).toBe(true);
    expect(isLeader(branchA)).toBe(true);
    expect(isLeader(overseer)).toBe(true);
    expect(isLeader(dev1)).toBe(true);
    expect(isLeader(null)).toBe(false);
  });

  test('isAdminTier = Branch Leader and above', () => {
    expect(isAdminTier(memberA)).toBe(false);
    expect(isAdminTier(teamA)).toBe(false);
    expect(isAdminTier(groupA)).toBe(false);
    expect(isAdminTier(branchA)).toBe(true);
    expect(isAdminTier(overseer)).toBe(true);
    expect(isAdminTier(dev1)).toBe(true);
  });

  test('assignableRoles excludes own level except for Dev', () => {
    expect(assignableRoles(UserRole.MEMBER)).toEqual([]);
    expect(assignableRoles(UserRole.TEAM_LEADER)).toEqual([UserRole.MEMBER]);
    expect(assignableRoles(UserRole.GROUP_LEADER)).toEqual([
      UserRole.MEMBER,
      UserRole.TEAM_LEADER,
    ]);
    expect(assignableRoles(UserRole.BRANCH_LEADER)).toEqual([
      UserRole.MEMBER,
      UserRole.TEAM_LEADER,
      UserRole.GROUP_LEADER,
    ]);
    expect(assignableRoles(UserRole.OVERSEER)).toEqual([
      UserRole.MEMBER,
      UserRole.TEAM_LEADER,
      UserRole.GROUP_LEADER,
      UserRole.BRANCH_LEADER,
    ]);
    // Dev is the only role that can create another Dev.
    expect(assignableRoles(UserRole.DEV)).toContain(UserRole.DEV);
    expect(assignableRoles(UserRole.DEV)).toContain(UserRole.MEMBER);
  });
});

// ===========================================================================
// Users
// ===========================================================================

describe('canViewUser', () => {
  test('self is always viewable', () => {
    expect(canViewUser(memberA, memberA)).toBe(true);
  });

  test('Member cannot view other users', () => {
    expect(canViewUser(memberA, memberB)).toBe(false);
    expect(canViewUser(memberA, branchA)).toBe(false);
  });

  test('Leaders see all users (read-all matrix row)', () => {
    expect(canViewUser(teamA, memberA)).toBe(true);
    expect(canViewUser(branchA, dev1)).toBe(true);
    expect(canViewUser(branchA, branchB)).toBe(true);   // peer
    expect(canViewUser(overseer, dev1)).toBe(true);
  });
});

describe('canEditUser — peer-edit + cross-branch', () => {
  test('Member cannot edit other Members', () => {
    expect(canEditUser(memberA, memberB)).toBe(false);
  });

  test('Member can edit self (safe fields gated by caller)', () => {
    expect(canEditUser(memberA, memberA)).toBe(true);
  });

  test('Branch Leader can edit anyone at-or-below Branch Leader, in any branch', () => {
    expect(canEditUser(branchA, groupA)).toBe(true);
    expect(canEditUser(branchA, teamB)).toBe(true);
    expect(canEditUser(branchA, memberA)).toBe(true);
    expect(canEditUser(branchA, branchB)).toBe(true);  // peer-edit
  });

  test('Branch Leader CANNOT edit Overseer or Dev', () => {
    expect(canEditUser(branchA, overseer)).toBe(false);
    expect(canEditUser(branchA, dev1)).toBe(false);
  });

  test('Overseer can edit anyone except Devs', () => {
    expect(canEditUser(overseer, branchA)).toBe(true);
    expect(canEditUser(overseer, dev1)).toBe(false);
  });

  test('Dev can edit anyone including peers', () => {
    expect(canEditUser(dev1, dev2)).toBe(true);
    expect(canEditUser(dev1, overseer)).toBe(true);
    expect(canEditUser(dev1, memberA)).toBe(true);
  });
});

describe('canChangeRole — universal "cannot grant at-or-above own level" rule', () => {
  test('Branch Leader can promote a Member to Group Leader, but not Branch Leader', () => {
    expect(canChangeRole(branchA, memberA, UserRole.GROUP_LEADER)).toBe(true);
    expect(canChangeRole(branchA, memberA, UserRole.BRANCH_LEADER)).toBe(false);
    expect(canChangeRole(branchA, memberA, UserRole.OVERSEER)).toBe(false);
  });

  test('Only a Dev can grant the Dev role', () => {
    expect(canChangeRole(overseer, branchA, UserRole.DEV)).toBe(false);
    expect(canChangeRole(dev1, branchA, UserRole.DEV)).toBe(true);
  });

  test('Cannot change role of someone above your level', () => {
    expect(canChangeRole(branchA, dev1, UserRole.MEMBER)).toBe(false);
  });
});

describe('canDeactivateUser — no self-deactivation', () => {
  test('cannot deactivate self', () => {
    expect(canDeactivateUser(branchA, branchA)).toBe(false);
    expect(canDeactivateUser(dev1, dev1)).toBe(false);
  });

  test('Branch Leader can deactivate anyone at-or-below Branch Leader (cross-branch)', () => {
    expect(canDeactivateUser(branchA, branchB)).toBe(true);
    expect(canDeactivateUser(branchA, memberB)).toBe(true);
    expect(canDeactivateUser(branchA, dev1)).toBe(false);
  });

  test('Member cannot deactivate', () => {
    expect(canDeactivateUser(memberA, memberB)).toBe(false);
  });
});

describe('canResetPassword', () => {
  test('self-reset is denied (use canChangeOwnPassword instead)', () => {
    // ADMIN-2: helper is the source of truth — admins cannot reset
    // their own password through the admin "Reset Password" action;
    // the change-password flow on /settings is the legitimate path.
    expect(canResetPassword(memberA, memberA)).toBe(false);
    expect(canResetPassword(branchA, branchA)).toBe(false);
    expect(canResetPassword(dev1, dev1)).toBe(false);
  });

  test('mirrors canEditUser for others', () => {
    expect(canResetPassword(branchA, memberA)).toBe(true);
    expect(canResetPassword(branchA, dev1)).toBe(false);
    expect(canResetPassword(memberA, memberB)).toBe(false);
  });
});

describe('canChangeOwnPassword', () => {
  test('always true for any authenticated user', () => {
    expect(canChangeOwnPassword(memberA)).toBe(true);
    expect(canChangeOwnPassword(branchA)).toBe(true);
    expect(canChangeOwnPassword(dev1)).toBe(true);
  });
  test('false for null/undefined viewer', () => {
    expect(canChangeOwnPassword(null)).toBe(false);
    expect(canChangeOwnPassword(undefined)).toBe(false);
  });
});

describe('canEditUserField — SEC-2 self-edit field gate', () => {
  test('self can edit safe fields', () => {
    expect(canEditUserField(memberA, memberA, 'firstName')).toBe(true);
    expect(canEditUserField(memberA, memberA, 'lastName')).toBe(true);
    expect(canEditUserField(memberA, memberA, 'email')).toBe(true);
    expect(canEditUserField(memberA, memberA, 'phone')).toBe(true);
    expect(canEditUserField(memberA, memberA, 'avatarUrl')).toBe(true);
  });
  test('self CANNOT escalate role / tags / parent / username through generic edit', () => {
    expect(canEditUserField(memberA, memberA, 'role')).toBe(false);
    expect(canEditUserField(memberA, memberA, 'tags')).toBe(false);
    expect(canEditUserField(memberA, memberA, 'parentId')).toBe(false);
    expect(canEditUserField(memberA, memberA, 'username')).toBe(false);
    expect(canEditUserField(branchA, branchA, 'role')).toBe(false);
  });
  test('for others, mirrors canEditUser', () => {
    expect(canEditUserField(branchA, memberA, 'role')).toBe(true);
    expect(canEditUserField(branchA, dev1, 'role')).toBe(false);
    expect(canEditUserField(memberA, memberB, 'firstName')).toBe(false);
  });
});

describe('canCreateUser', () => {
  test('Member cannot create users', () => {
    expect(canCreateUser(memberA, UserRole.MEMBER)).toBe(false);
  });

  test('Team Leader can create Members only', () => {
    expect(canCreateUser(teamA, UserRole.MEMBER)).toBe(true);
    expect(canCreateUser(teamA, UserRole.TEAM_LEADER)).toBe(false);
  });

  test('Group Leader can create up to Team Leader', () => {
    expect(canCreateUser(groupA, UserRole.TEAM_LEADER)).toBe(true);
    expect(canCreateUser(groupA, UserRole.GROUP_LEADER)).toBe(false);
  });

  test('Overseer can create Branch Leaders but not other Overseers', () => {
    expect(canCreateUser(overseer, UserRole.BRANCH_LEADER)).toBe(true);
    expect(canCreateUser(overseer, UserRole.OVERSEER)).toBe(false);
    expect(canCreateUser(overseer, UserRole.DEV)).toBe(false);
  });

  test('Dev can create another Dev', () => {
    expect(canCreateUser(dev1, UserRole.DEV)).toBe(true);
  });

  // PERM-3 / USER-3: parent-subtree gate
  test('Team Leader: with parent in subtree → allowed', () => {
    expect(canCreateUser(teamA, UserRole.MEMBER, memberA.id, [memberA.id])).toBe(true);
  });
  test('Team Leader: with parent NOT in subtree → denied', () => {
    expect(canCreateUser(teamA, UserRole.MEMBER, memberB.id, [memberA.id])).toBe(false);
  });
  test('Team Leader: parent === viewer is always allowed', () => {
    expect(canCreateUser(teamA, UserRole.MEMBER, teamA.id, [])).toBe(true);
  });
  test('Branch Leader+ skips the subtree check (cross-branch)', () => {
    expect(canCreateUser(branchA, UserRole.MEMBER, memberB.id, [])).toBe(true);
    expect(canCreateUser(overseer, UserRole.BRANCH_LEADER, memberB.id, [])).toBe(true);
  });
});

describe('canManageTags', () => {
  test('cannot self-manage tags (capability flags)', () => {
    expect(canManageTags(branchA, branchA)).toBe(false);
  });

  test('mirrors canEditUser for others', () => {
    expect(canManageTags(branchA, memberA)).toBe(true);
    expect(canManageTags(branchA, dev1)).toBe(false);
    expect(canManageTags(memberA, memberB)).toBe(false);
  });
});

describe('canChangeUsername', () => {
  test('self-rename always allowed (industry-standard with confirm)', () => {
    expect(canChangeUsername(memberA, memberA)).toBe(true);
    expect(canChangeOwnUsername(memberA)).toBe(true);
  });

  test('renaming someone else requires Overseer+', () => {
    expect(canChangeUsername(branchA, memberA)).toBe(false);
    expect(canChangeUsername(overseer, memberA)).toBe(true);
    expect(canChangeUsername(overseer, dev1)).toBe(false);   // can't reach above
    expect(canChangeUsername(dev1, overseer)).toBe(true);
  });

  // SEC-4: Overseer cannot rename peer Overseer
  test('Overseer cannot rename a peer Overseer (only a Dev can)', () => {
    const overseerB = mkUser('over2', UserRole.OVERSEER);
    expect(canChangeUsername(overseer, overseerB)).toBe(false);
    expect(canChangeUsername(dev1, overseerB)).toBe(true);
  });
});

describe('canManageTagDefinitions — PERM-2', () => {
  test('Branch Leader sees the Tags tab as VIEW-ONLY', () => {
    expect(canManageTagDefinitions(branchA)).toBe(false);
  });
  test('Overseer+ has full edit on tag definitions', () => {
    expect(canManageTagDefinitions(overseer)).toBe(true);
    expect(canManageTagDefinitions(dev1)).toBe(true);
  });
  test('null viewer fails closed', () => {
    expect(canManageTagDefinitions(null)).toBe(false);
    expect(canManageTagDefinitions(undefined)).toBe(false);
  });
});

// ===========================================================================
// Org tree nodes
// ===========================================================================

describe('canCreateGroupNode', () => {
  test('only Overseer+ creates Branches', () => {
    expect(canCreateGroupNode(branchA, 'branch')).toBe(false);
    expect(canCreateGroupNode(overseer, 'branch')).toBe(true);
    expect(canCreateGroupNode(dev1, 'branch')).toBe(true);
  });

  test('Branch Leader+ creates Groups', () => {
    expect(canCreateGroupNode(groupA, 'group')).toBe(false);
    expect(canCreateGroupNode(branchA, 'group')).toBe(true);
  });

  test('Group Leader+ creates Teams', () => {
    expect(canCreateGroupNode(teamA, 'team')).toBe(false);
    expect(canCreateGroupNode(groupA, 'team')).toBe(true);
  });
});

describe('canRenameGroup', () => {
  test('rename requires viewer level >= node leader level', () => {
    expect(canRenameGroup(teamA, UserRole.TEAM_LEADER)).toBe(true);
    expect(canRenameGroup(teamA, UserRole.GROUP_LEADER)).toBe(false);
    expect(canRenameGroup(branchA, UserRole.GROUP_LEADER)).toBe(true);
  });
});

describe('canDeactivateGroup', () => {
  test('Branch only by Overseer+', () => {
    expect(canDeactivateGroup(branchA, 'branch')).toBe(false);
    expect(canDeactivateGroup(overseer, 'branch')).toBe(true);
  });
  test('Group/Team by Branch Leader+', () => {
    expect(canDeactivateGroup(branchA, 'group')).toBe(true);
    expect(canDeactivateGroup(branchA, 'team')).toBe(true);
    expect(canDeactivateGroup(groupA, 'team')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M-01 / M-02: org-tree subtree-restricted behaviour
// ---------------------------------------------------------------------------

describe('canCreateGroupNode — subtree-restricted (M-01)', () => {
  test('Branch Leader cannot create a group under a different branch', () => {
    // branchA's subtree (own branch) — does not contain branchB.
    const subtree = [branchA.id, groupA.id, teamA.id, memberA.id];
    expect(canCreateGroupNode(branchA, 'group', branchA.id, subtree)).toBe(true);
    expect(canCreateGroupNode(branchA, 'group', branchB.id, subtree)).toBe(false);
  });

  test('Group Leader cannot create a team under a different group', () => {
    const subtree = [groupA.id, teamA.id, memberA.id];
    expect(canCreateGroupNode(groupA, 'team', groupA.id, subtree)).toBe(true);
    expect(canCreateGroupNode(groupA, 'team', groupB.id, subtree)).toBe(false);
  });

  test('Overseer creates anywhere — subtree ignored', () => {
    expect(canCreateGroupNode(overseer, 'group', branchA.id, [])).toBe(true);
    expect(canCreateGroupNode(overseer, 'group', branchB.id, [])).toBe(true);
    expect(canCreateGroupNode(overseer, 'team', groupA.id, [])).toBe(true);
  });

  test('Branch Leader+ creates teams in any branch', () => {
    expect(canCreateGroupNode(branchA, 'team', groupB.id, [])).toBe(true);
  });

  test('absent parent context preserves tier-only check (UI affordance can render)', () => {
    expect(canCreateGroupNode(branchA, 'group')).toBe(true);
    expect(canCreateGroupNode(groupA, 'team')).toBe(true);
    expect(canCreateGroupNode(memberA, 'team')).toBe(false);
  });
});

describe('canRenameGroup — subtree-restricted (M-02)', () => {
  test('Group Leader can only rename within own group', () => {
    const subtree = [groupA.id, teamA.id, memberA.id];
    expect(canRenameGroup(groupA, UserRole.TEAM_LEADER, teamA.id, subtree)).toBe(true);
    expect(canRenameGroup(groupA, UserRole.TEAM_LEADER, teamB.id, subtree)).toBe(false);
  });

  test('Branch Leader+ renames any node cross-branch', () => {
    expect(canRenameGroup(branchA, UserRole.GROUP_LEADER, groupB.id, [])).toBe(true);
    expect(canRenameGroup(overseer, UserRole.BRANCH_LEADER, branchB.id, [])).toBe(true);
  });

  test('cannot rename above own level even with subtree match', () => {
    expect(canRenameGroup(teamA, UserRole.GROUP_LEADER, groupA.id, [groupA.id])).toBe(false);
  });

  test('legacy 2-arg signature still tier-only', () => {
    expect(canRenameGroup(teamA, UserRole.TEAM_LEADER)).toBe(true);
    expect(canRenameGroup(teamA, UserRole.GROUP_LEADER)).toBe(false);
    expect(canRenameGroup(branchA, UserRole.GROUP_LEADER)).toBe(true);
  });
});

describe('canDeactivateGroup — subtree-restricted (M-02)', () => {
  test('Branch Leader can only deactivate group/team within own branch', () => {
    const subtree = [branchA.id, groupA.id, teamA.id];
    expect(canDeactivateGroup(branchA, 'group', groupA.id, subtree)).toBe(true);
    expect(canDeactivateGroup(branchA, 'group', groupB.id, subtree)).toBe(false);
    expect(canDeactivateGroup(branchA, 'team', teamA.id, subtree)).toBe(true);
    expect(canDeactivateGroup(branchA, 'team', teamB.id, subtree)).toBe(false);
  });

  test('Overseer deactivates any group/team', () => {
    expect(canDeactivateGroup(overseer, 'group', groupA.id, [])).toBe(true);
    expect(canDeactivateGroup(overseer, 'team', teamB.id, [])).toBe(true);
  });

  test('Branch Leader still cannot deactivate a Branch (Overseer-only)', () => {
    expect(canDeactivateGroup(branchA, 'branch', branchA.id, [branchA.id])).toBe(false);
  });

  test('legacy 2-arg signature still tier-only', () => {
    expect(canDeactivateGroup(branchA, 'group')).toBe(true);
    expect(canDeactivateGroup(groupA, 'team')).toBe(false);
  });
});

describe('canReassignUserToGroup — PERM-1', () => {
  test('Member cannot reassign anyone', () => {
    expect(canReassignUserToGroup(memberA, memberB, teamA.id)).toBe(false);
  });
  test('Branch Leader+ can reassign anyone, anywhere (cross-branch)', () => {
    expect(canReassignUserToGroup(branchA, memberA, teamB.id)).toBe(true);
    expect(canReassignUserToGroup(overseer, branchB, branchA.id)).toBe(true);
  });
  test('Team Leader: both user and new parent must be in subtree', () => {
    expect(canReassignUserToGroup(teamA, memberA, teamA.id, [memberA.id, teamA.id])).toBe(true);
    expect(canReassignUserToGroup(teamA, memberA, teamB.id, [memberA.id])).toBe(false);
    expect(canReassignUserToGroup(teamA, memberB, teamA.id, [teamA.id])).toBe(false);
  });
  test('null viewer / null user fails closed', () => {
    expect(canReassignUserToGroup(null as unknown as User, memberA, teamA.id)).toBe(false);
    expect(canReassignUserToGroup(branchA, null as unknown as User, teamA.id)).toBe(false);
  });
});

// ===========================================================================
// Areas / Rooms
// ===========================================================================

describe('areas + rooms', () => {
  // PERM-5: canViewArea now requires a viewer (deny-by-default for null).
  test('canViewArea returns true for any authenticated user', () => {
    expect(canViewArea(memberA)).toBe(true);
    expect(canViewArea(branchA)).toBe(true);
  });
  test('canViewArea fails closed for null viewer (deny-by-default)', () => {
    expect(canViewArea(null)).toBe(false);
    expect(canViewArea(undefined)).toBe(false);
  });
  test('canCreateArea is Overseer+', () => {
    expect(canCreateArea(branchA)).toBe(false);
    expect(canCreateArea(overseer)).toBe(true);
  });
  test('canManageArea / Room are Branch Leader+', () => {
    expect(canManageArea(groupA)).toBe(false);
    expect(canManageArea(branchA)).toBe(true);
    expect(canCreateRoom(branchA)).toBe(true);
    expect(canManageRoom(branchA)).toBe(true);
  });
});

// ===========================================================================
// Blocked slots
// ===========================================================================

describe('blocked slots', () => {
  test('Branch Leader+ may manage any blocked slot', () => {
    expect(canManageBlockedSlot(memberA)).toBe(false);
    expect(canManageBlockedSlot(teamA)).toBe(false);
    expect(canManageBlockedSlot(groupA)).toBe(false);
    expect(canManageBlockedSlot(branchA)).toBe(true);
    expect(canManageBlockedSlot(overseer)).toBe(true);
    expect(canManageBlockedSlot(dev1)).toBe(true);
  });
});

// ===========================================================================
// Contacts
// ===========================================================================

function mkContact(id: string, ownerId: string): Contact {
  // Using a minimal cast — the Contact type has many optional fields the
  // permission helpers don't read.
  return {
    id,
    firstName: id,
    lastName: '',
    assignedTeacherId: ownerId,
    createdBy: ownerId,
  } as unknown as Contact;
}

describe('canViewContact', () => {
  const cMemberA = mkContact('cA', memberA.id);

  test('owner sees own contact', () => {
    expect(canViewContact(memberA, cMemberA)).toBe(true);
  });

  test('non-owner Member cannot see', () => {
    expect(canViewContact(memberB, cMemberA)).toBe(false);
  });

  test('Team Leader sees contacts in their team subtree', () => {
    expect(canViewContact(teamA, cMemberA, [memberA.id])).toBe(true);
    expect(canViewContact(teamA, cMemberA, [])).toBe(false);
  });

  test('Branch Leader+ sees ALL contacts across branches', () => {
    expect(canViewContact(branchB, cMemberA)).toBe(true);
    expect(canViewContact(overseer, cMemberA)).toBe(true);
  });
});

describe('canCreateContact', () => {
  test('self-owner always allowed', () => {
    expect(canCreateContact(memberA, memberA.id)).toBe(true);
  });
  test('Member cannot create-for-others', () => {
    expect(canCreateContact(memberA, memberB.id)).toBe(false);
  });
  test('leader can create-for-subtree', () => {
    expect(canCreateContact(teamA, memberA.id, [memberA.id])).toBe(true);
    expect(canCreateContact(teamA, memberA.id, [])).toBe(false);
  });
  test('Branch Leader+ can create for anyone', () => {
    expect(canCreateContact(branchA, memberB.id)).toBe(true);
  });
});

describe('canEditContact', () => {
  const cMemberA = mkContact('cA', memberA.id);
  test('owner edits own', () => {
    expect(canEditContact(memberA, cMemberA)).toBe(true);
  });
  test(`Member cannot edit others' contacts`, () => {
    expect(canEditContact(memberB, cMemberA)).toBe(false);
  });
  test('Branch Leader+ edits any contact', () => {
    expect(canEditContact(branchB, cMemberA)).toBe(true);
  });
});

describe('canConvertContact', () => {
  const cMemberA = mkContact('cA', memberA.id);
  test('Member cannot convert', () => {
    expect(canConvertContact(memberA, cMemberA)).toBe(false);
  });
  test('Team Leader can convert if scope matches', () => {
    expect(canConvertContact(teamA, cMemberA, [memberA.id])).toBe(true);
  });
  test('Branch Leader+ always can', () => {
    expect(canConvertContact(branchB, cMemberA)).toBe(true);
  });
});

describe('canReassignContact', () => {
  const cMemberA = mkContact('cA', memberA.id);
  test('combined edit + create rights', () => {
    expect(canReassignContact(branchB, cMemberA, memberB.id)).toBe(true);
    expect(canReassignContact(memberA, cMemberA, memberB.id)).toBe(false);
  });
});

// ===========================================================================
// Bookings
// ===========================================================================

function mkBooking(id: string, createdBy: string, teacherId?: string): Booking {
  return {
    id,
    createdBy,
    teacherId,
  } as unknown as Booking;
}

describe('canEditBooking', () => {
  test('owner edits own', () => {
    const b = mkBooking('b1', memberA.id);
    expect(canEditBooking(memberA, b)).toBe(true);
  });
  test('teacher edits when listed as teacher', () => {
    const b = mkBooking('b1', memberA.id, teamA.id);
    expect(canEditBooking(teamA, b)).toBe(true);
  });
  test(`Member cannot edit others'`, () => {
    const b = mkBooking('b1', memberA.id);
    expect(canEditBooking(memberB, b)).toBe(false);
  });
  test('Branch Leader+ can edit any booking', () => {
    const b = mkBooking('b1', memberA.id);
    expect(canEditBooking(branchB, b)).toBe(true);
  });
  test('leader edits within subtree', () => {
    const b = mkBooking('b1', memberA.id);
    expect(canEditBooking(teamA, b, [memberA.id])).toBe(true);
    expect(canEditBooking(teamA, b, [])).toBe(false);
  });
});

// ===========================================================================
// Reports
// ===========================================================================

describe('reports', () => {
  test('Branch Leader+ can access reports (matrix updated from Overseer+)', () => {
    expect(canAccessReports(memberA)).toBe(false);
    expect(canAccessReports(teamA)).toBe(false);
    expect(canAccessReports(groupA)).toBe(false);
    expect(canAccessReports(branchA)).toBe(true);
    expect(canAccessReports(overseer)).toBe(true);
    expect(canAccessReports(dev1)).toBe(true);
  });
  test('export tier matches access tier', () => {
    expect(canExportReports(branchA)).toBe(true);
    expect(canExportReports(groupA)).toBe(false);
  });
  test('legacy role-string overload still works', () => {
    expect(canAccessReports(UserRole.BRANCH_LEADER)).toBe(true);
    expect(canAccessReports(UserRole.MEMBER)).toBe(false);
  });
});

// ===========================================================================
// Data export / import (CSV affordances on shared pages)
// ===========================================================================

describe('export / import (CSV)', () => {
  test('feature flag defaults OFF (export/import is admin-only for now)', () => {
    expect(EXPORT_IMPORT_FOR_NON_ADMINS).toBe(false);
  });
  test('admin-tier (Branch Leader+) always has export/import', () => {
    expect(canExportImport(branchA)).toBe(true);
    expect(canExportImport(overseer)).toBe(true);
    expect(canExportImport(dev1)).toBe(true);
  });
  test('non-admins are denied while the flag is off', () => {
    expect(canExportImport(memberA)).toBe(false);
    expect(canExportImport(teamA)).toBe(false);
    expect(canExportImport(groupA)).toBe(false);
  });
  test('null / undefined viewer denied (deny-by-default)', () => {
    expect(canExportImport(null)).toBe(false);
    expect(canExportImport(undefined)).toBe(false);
  });
});

// ===========================================================================
// Admin page
// ===========================================================================

describe('admin page', () => {
  test('canSeeAdminPage = Branch Leader+', () => {
    expect(canSeeAdminPage(memberA)).toBe(false);
    expect(canSeeAdminPage(groupA)).toBe(false);
    expect(canSeeAdminPage(branchA)).toBe(true);
  });

  test('all operational tabs visible to Branch L+', () => {
    expect(canSeeAdminTab(branchA, 'users')).toBe(true);
    expect(canSeeAdminTab(branchA, 'groups')).toBe(true);
    expect(canSeeAdminTab(branchA, 'rooms')).toBe(true);
    expect(canSeeAdminTab(branchA, 'blocked')).toBe(true);
    expect(canSeeAdminTab(branchA, 'contacts')).toBe(true);
    expect(canSeeAdminTab(branchA, 'audit')).toBe(true);
    expect(canSeeAdminTab(branchA, 'tags')).toBe(true);
    expect(canSeeAdminTab(branchA, 'permissions')).toBe(true);
  });

  test('system config tab is Dev-only', () => {
    expect(canSeeAdminTab(overseer, 'system')).toBe(false);
    expect(canSeeAdminTab(dev1, 'system')).toBe(true);
  });

  test('group leaders never see admin tabs', () => {
    expect(canSeeAdminTab(groupA, 'users')).toBe(false);
    expect(canSeeAdminTab(memberA, 'users')).toBe(false);
  });

  test('canEditSystemConfig is Dev-only', () => {
    expect(canEditSystemConfig(overseer)).toBe(false);
    expect(canEditSystemConfig(dev1)).toBe(true);
  });
});

// ===========================================================================
// Scope summary
// ===========================================================================

describe('scopeForRole', () => {
  test('matches matrix kinds', () => {
    expect(scopeForRole(memberA)).toBe('self');
    expect(scopeForRole(teamA)).toBe('team');
    expect(scopeForRole(groupA)).toBe('group');
    expect(scopeForRole(branchA)).toBe('all');     // Branch L sees all per peer+cross-branch rule
    expect(scopeForRole(overseer)).toBe('all');
    expect(scopeForRole(dev1)).toBe('all');
  });
});

// ===========================================================================
// Org tree visibility
// ===========================================================================

describe('canViewGroup', () => {
  test('every authenticated role sees the org tree page', () => {
    expect(canViewGroup(memberA)).toBe(true);
    expect(canViewGroup(branchA)).toBe(true);
  });
  // PERM-5: deny-by-default for null viewer
  test('null viewer fails closed', () => {
    expect(canViewGroup(null)).toBe(false);
    expect(canViewGroup(undefined)).toBe(false);
  });
});

// ===========================================================================
// buildVisibilityScope — CONT-2
// ===========================================================================

describe('buildVisibilityScope', () => {
  // Build a tiny org tree:
  //   overseer (root)
  //     branchA
  //       groupA
  //         teamA
  //           memberA
  //         teamB
  //           memberB
  const _overseer = { ...overseer, parentId: undefined };
  const _branchA  = { ...branchA,  parentId: _overseer.id };
  const _groupA   = { ...groupA,   parentId: _branchA.id  };
  const _teamA    = { ...teamA,    parentId: _groupA.id   };
  const _teamB    = { ...teamB,    parentId: _groupA.id   };
  const _memberA  = { ...memberA,  parentId: _teamA.id    };
  const _memberB  = { ...memberB,  parentId: _teamB.id    };
  const all = [_overseer, _branchA, _groupA, _teamA, _teamB, _memberA, _memberB];

  test('null viewer returns empty self scope', () => {
    const s = buildVisibilityScope(null, all);
    expect(s.kind).toBe('self');
    expect(s.userIds).toEqual([]);
  });

  test('Member returns just self', () => {
    const s = buildVisibilityScope(_memberA, all);
    expect(s.kind).toBe('self');
    expect(s.userIds).toEqual([_memberA.id]);
  });

  test('Team Leader reaches own team only', () => {
    const s = buildVisibilityScope(_teamA, all);
    expect(s.kind).toBe('team');
    expect(s.userIds).toContain(_teamA.id);
    expect(s.userIds).toContain(_memberA.id);
    expect(s.userIds).not.toContain(_memberB.id);
    expect(s.userIds).not.toContain(_teamB.id);
  });

  test('Group Leader reaches whole group', () => {
    const s = buildVisibilityScope(_groupA, all);
    expect(s.userIds).toContain(_teamA.id);
    expect(s.userIds).toContain(_teamB.id);
    expect(s.userIds).toContain(_memberA.id);
    expect(s.userIds).toContain(_memberB.id);
    expect(s.teamIds).toEqual(expect.arrayContaining([_teamA.id, _teamB.id]));
  });

  test('Branch Leader+ returns kind="all" with empty IDs ("everything in scope")', () => {
    const s = buildVisibilityScope(_branchA, all);
    expect(s.kind).toBe('all');
    expect(s.userIds).toEqual([]);
    const so = buildVisibilityScope(_overseer, all);
    expect(so.kind).toBe('all');
  });
});
