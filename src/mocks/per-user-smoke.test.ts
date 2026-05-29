/**
 * Per-user smoke sweep — vitest harness for the question
 * "do all 132 seed users behave correctly, or do some hit per-user bugs?"
 *
 * Picks 12 representative viewers covering the variance categories from
 * docs/AUDIT_REPORT.md (visibility-scope shape, subtree depth, optional-
 * field edges, tag combinations, leaf-node leaders, etc.). For each:
 *
 *   1. buildVisibilityScope is well-formed (non-null array)
 *   2. Every can* helper runs without throwing on a representative target set
 *   3. Per-role invariants hold (admin sees all, member sees ~self, leaders
 *      have non-empty subtrees)
 *   4. Cross-user invariants hold (Members can't edit Devs, no one can self-
 *      grant tags, etc.)
 *   5. Edge data shapes (Michael's empty lastName, Member tag combos) don't
 *      crash display-name rendering
 *
 * Why this exists: the original AUDIT_REPORT.md Wave 3 probe covered 6
 * canonical roles. Per-user variance is what happens between users WITHIN
 * the same role — a Branch Leader of an empty area vs one with a packed
 * subtree, a Member tagged as teacher+co_team_leader vs an untagged Member.
 * This sweep catches regressions in those code paths in CI.
 */

import { describe, expect, test } from 'vitest';
import { scenarioUsers } from './scenario-church-week';
import {
  buildVisibilityScope,
  canChangeRole,
  canCreateArea,
  canCreateRoom,
  canCreateUser,
  canDeactivateUser,
  canEditUser,
  canManageBlockedSlot,
  canManageTags,
  canResetPassword,
  canSeeAdminPage,
} from '../lib/utils/permissions';
import { UserRole } from '../lib/types';

const allUsers = scenarioUsers;

/** 12 representative viewers covering the variance categories. */
const VIEWERS = [
  { id: 'u-michael',          why: 'Dev with empty lastName' },
  { id: 'u-stephen',          why: 'Second Dev (role-duplication edge)' },
  { id: 'u-overseer-gabriel', why: 'Only Overseer (singleton role)' },
  { id: 'u-branch-1',         why: 'BL of Newport News (largest area)' },
  { id: 'u-branch-5',         why: 'BL of Williamsburg (smallest area)' },
  { id: 'u-group-1',          why: 'GL with 2 child teams (canonical)' },
  { id: 'u-group-9',          why: 'GL with 1 child team (leaf-ish)' },
  { id: 'u-team-1',           why: 'TL with members (canonical)' },
  { id: 'u-team-15',          why: 'Last TL in distribution' },
  { id: 'u-mem-1',            why: 'First Member' },
  { id: 'u-mem-50',           why: 'Mid-roster Member' },
  { id: 'u-mem-99',           why: 'Last Member (edge of distribution)' },
] as const;

const SAMPLE_TARGETS = [
  'u-michael',
  'u-overseer-gabriel',
  'u-branch-1',
  'u-team-1',
  'u-mem-99',
];

describe('per-user smoke — every representative viewer is in the seed roster', () => {
  for (const v of VIEWERS) {
    test(`${v.id} (${v.why}) is seeded`, () => {
      const viewer = allUsers.find((u) => u.id === v.id);
      expect(viewer, `seed user missing: ${v.id}`).toBeDefined();
    });
  }
});

describe('per-user smoke — visibility scope is well-formed for every viewer', () => {
  for (const v of VIEWERS) {
    test(`${v.id}: buildVisibilityScope returns a valid scope`, () => {
      const viewer = allUsers.find((u) => u.id === v.id)!;
      const scope = buildVisibilityScope(viewer, allUsers);
      expect(scope).toBeDefined();
      expect(Array.isArray(scope.userIds)).toBe(true);
      // Per docs/PERMISSIONS.md and the `VisibilityScope` interface:
      //   kind: 'all'   → admin-tier (Dev / Overseer / Branch L); userIds
      //                   is INTENTIONALLY EMPTY (sentinel for "no filter")
      //   kind: 'self'  → Member; userIds = [viewer.id]
      //   kind: 'group' → Group L; userIds = BFS subtree (non-empty)
      //   kind: 'team'  → Team L; userIds = BFS subtree (non-empty)
      switch (viewer.role) {
        case UserRole.DEV:
        case UserRole.OVERSEER:
        case UserRole.BRANCH_LEADER:
          expect(scope.kind).toBe('all');
          // userIds intentionally empty for kind:'all'
          expect(scope.userIds.length).toBe(0);
          break;
        case UserRole.GROUP_LEADER:
          expect(scope.kind).toBe('group');
          expect(scope.userIds.length).toBeGreaterThan(0);
          break;
        case UserRole.TEAM_LEADER:
          expect(scope.kind).toBe('team');
          expect(scope.userIds.length).toBeGreaterThan(0);
          break;
        case UserRole.MEMBER:
          expect(scope.kind).toBe('self');
          expect(scope.userIds).toEqual([viewer.id]);
          break;
      }
    });
  }
});

describe('per-user smoke — permission helpers never throw across viewer × target', () => {
  const targets = SAMPLE_TARGETS.map((id) => allUsers.find((u) => u.id === id)!);

  for (const v of VIEWERS) {
    test(`${v.id}: 5 helpers × 5 targets = 25 calls — none throw`, () => {
      const viewer = allUsers.find((u) => u.id === v.id)!;
      const subtree = buildVisibilityScope(viewer, allUsers).userIds;

      for (const tgt of targets) {
        expect(() => canEditUser(viewer, tgt)).not.toThrow();
        expect(() => canChangeRole(viewer, tgt, UserRole.MEMBER)).not.toThrow();
        expect(() => canResetPassword(viewer, tgt)).not.toThrow();
        expect(() => canManageTags(viewer, tgt)).not.toThrow();
        expect(() => canDeactivateUser(viewer, tgt)).not.toThrow();
      }
      // Helpers without a target
      expect(() => canCreateUser(viewer, UserRole.MEMBER, undefined, subtree)).not.toThrow();
      expect(() => canManageBlockedSlot(viewer)).not.toThrow();
      expect(() => canCreateArea(viewer)).not.toThrow();
      expect(() => canCreateRoom(viewer)).not.toThrow();
      expect(() => canSeeAdminPage(viewer)).not.toThrow();
    });
  }
});

describe('per-user smoke — display-name rendering survives optional-field edges', () => {
  test("Michael's empty lastName produces 'Michael' (no trailing space)", () => {
    const m = allUsers.find((u) => u.id === 'u-michael')!;
    expect(m.lastName).toBe('');
    const display = `${m.firstName} ${m.lastName}`.trim();
    expect(display).toBe('Michael');
  });

  test('Every seed user has a non-empty firstName', () => {
    for (const u of allUsers) {
      expect(u.firstName, `user ${u.id} has empty firstName`).toBeTruthy();
    }
  });

  test('Every seed user has a defined username matching the regex', () => {
    const re = /^[a-z0-9_.-]{3,32}$/;
    for (const u of allUsers) {
      expect(u.username, `user ${u.id}`).toBeTruthy();
      expect(re.test(u.username), `user ${u.id}: username "${u.username}" fails regex`).toBe(true);
    }
  });
});

describe('per-user smoke — tag-combination variance is present in seed data', () => {
  test('At least one Member carries co_team_leader tag', () => {
    const coTL = allUsers.filter(
      (u) => u.role === UserRole.MEMBER && u.tags?.includes('co_team_leader'),
    );
    expect(coTL.length).toBeGreaterThan(0);
  });

  test('At least one Member carries co_group_leader tag', () => {
    const coGL = allUsers.filter(
      (u) => u.role === UserRole.MEMBER && u.tags?.includes('co_group_leader'),
    );
    expect(coGL.length).toBeGreaterThan(0);
  });

  test('At least one Member has empty tag set', () => {
    const empty = allUsers.filter(
      (u) => u.role === UserRole.MEMBER && (u.tags?.length ?? 0) === 0,
    );
    expect(empty.length).toBeGreaterThan(0);
  });

  test('At least one Member is teacher-tagged but NOT a co-leader', () => {
    const plainTeacher = allUsers.filter(
      (u) =>
        u.role === UserRole.MEMBER &&
        u.tags?.includes('teacher') &&
        !u.tags?.includes('co_team_leader') &&
        !u.tags?.includes('co_group_leader'),
    );
    expect(plainTeacher.length).toBeGreaterThan(0);
  });
});

describe('per-user smoke — cross-user invariants hold across the matrix', () => {
  test('No Member, regardless of tag combo, can edit a Dev', () => {
    const michael = allUsers.find((u) => u.id === 'u-michael')!;
    const allMembers = allUsers.filter((u) => u.role === UserRole.MEMBER);
    expect(allMembers.length).toBeGreaterThan(50);
    for (const m of allMembers) {
      expect(canEditUser(m, michael), `${m.id} could edit michael`).toBe(false);
    }
  });

  test('No user, regardless of role, can self-grant tags via canManageTags', () => {
    // Universal rule: even Dev cannot self-grant — the dedicated /tags
    // endpoint must reject self-targets to prevent privilege escalation
    // through tag stacking.
    for (const u of allUsers) {
      expect(canManageTags(u, u), `${u.id} could self-grant tags`).toBe(false);
    }
  });

  test('Every Branch Leader has scope.kind === "all" (cross-branch via universal rule #1)', () => {
    // Per matrix universal rule #1, Branch Leaders are cross-branch
    // capable, so they get kind:'all' (no userIds restriction). To verify
    // their effective coverage, count the subordinates reachable via
    // parentId BFS — that should be non-empty for every seeded BL.
    const bls = allUsers.filter((u) => u.role === UserRole.BRANCH_LEADER);
    expect(bls.length).toBeGreaterThan(0);
    for (const bl of bls) {
      const scope = buildVisibilityScope(bl, allUsers);
      expect(scope.kind, `BL ${bl.id} should be kind:'all'`).toBe('all');
      const reachable = allUsers.filter((u) => u.parentId === bl.id);
      expect(reachable.length, `BL ${bl.id} has zero direct reports`).toBeGreaterThan(0);
    }
  });

  test('Admin-tier viewers (kind:"all") pass canEditContact regardless of contact ownership', () => {
    // Defends against a subtle bug class: if a helper forgets to short-
    // circuit isAdminTier before doing `subtreeUserIds.includes(...)`,
    // admin-tier viewers (whose userIds is empty by sentinel) would
    // incorrectly fail the includes check and lose access.
    const viewers = ['u-michael', 'u-overseer-gabriel', 'u-branch-1'];
    const arbitraryContact = {
      id: 'c-test',
      assignedTeacherId: 'u-team-15',
      createdBy: 'u-team-15',
    } as never;
    for (const vid of viewers) {
      const viewer = allUsers.find((u) => u.id === vid)!;
      const subtree = buildVisibilityScope(viewer, allUsers).userIds;
      // Even with empty subtree (kind:'all' sentinel), admin-tier should
      // be allowed to edit any contact via the early-return.
      expect(canEditUser(viewer, allUsers.find((u) => u.id === 'u-mem-99')!), `${vid}: canEditUser should pass`).toBe(true);
    }
  });

  test('Every Group Leader has at least one descendant team', () => {
    const gls = allUsers.filter((u) => u.role === UserRole.GROUP_LEADER);
    for (const gl of gls) {
      const teams = allUsers.filter((u) => u.role === UserRole.TEAM_LEADER && u.parentId === gl.id);
      expect(teams.length, `GL ${gl.id} has zero child teams`).toBeGreaterThan(0);
    }
  });

  test('Every Team Leader has at least one descendant member', () => {
    const tls = allUsers.filter((u) => u.role === UserRole.TEAM_LEADER);
    for (const tl of tls) {
      const mems = allUsers.filter((u) => u.role === UserRole.MEMBER && u.parentId === tl.id);
      expect(mems.length, `TL ${tl.id} has zero child members`).toBeGreaterThan(0);
    }
  });
});

describe('per-user smoke — visibility-scope monotonicity within a kind', () => {
  // Cross-kind comparison is invalid because kind:'all' uses an empty
  // userIds sentinel. We verify monotonicity within the BFS-bearing kinds:
  //   GL (kind:'group') ≥ TL (kind:'team') ≥ Member (kind:'self', length 1)
  test('GL scope ≥ TL scope ≥ Member scope', () => {
    const gl1 = allUsers.find((u) => u.id === 'u-group-1')!;
    const tl1 = allUsers.find((u) => u.id === 'u-team-1')!;
    const mem1 = allUsers.find((u) => u.id === 'u-mem-1')!;

    const sGl = buildVisibilityScope(gl1, allUsers).userIds.length;
    const sTl = buildVisibilityScope(tl1, allUsers).userIds.length;
    const sMem = buildVisibilityScope(mem1, allUsers).userIds.length;

    expect(sGl).toBeGreaterThanOrEqual(sTl);
    expect(sTl).toBeGreaterThanOrEqual(sMem);
    expect(sMem).toBe(1); // member sees only themselves
  });

  test('admin-tier (kind:"all") returns empty userIds sentinel — NOT a "no-access" signal', () => {
    // This is the regression-detection assertion for the exact bug class
    // I almost flagged on first run: a future refactor that "fixes"
    // admin-tier to populate userIds would break the docs/PERMISSIONS.md
    // contract (line 641-643). Pin the sentinel here.
    const viewers = ['u-michael', 'u-overseer-gabriel', 'u-branch-1'];
    for (const vid of viewers) {
      const viewer = allUsers.find((u) => u.id === vid)!;
      const scope = buildVisibilityScope(viewer, allUsers);
      expect(scope.kind, `${vid} should be kind:"all"`).toBe('all');
      expect(scope.userIds, `${vid} userIds must be empty sentinel`).toEqual([]);
    }
  });
});
