import { describe, it, expect } from 'vitest';
import { buildOrgTree } from './org-tree';
import { UserRole } from '@/lib/types/user';
import type { User } from '@/lib/types/user';
import type { OrgNode } from '@/lib/types/group';
import type { Area } from '@/lib/types/booking';

const base = (over: Partial<User>): User => ({
  id: 'x',
  username: 'x',
  firstName: 'X',
  lastName: '',
  email: 'x@e.com',
  role: UserRole.MEMBER,
  tags: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});

const AREAS: Area[] = [
  { id: 'area-nn', name: 'Newport News', rooms: [] },
  { id: 'area-vb', name: 'VA Beach', rooms: [] },
];

function ids(node: OrgNode): string[] {
  return [node.id, ...node.children.flatMap(ids)];
}

describe('buildOrgTree', () => {
  it('builds the hierarchy from parentId and roots the parentless node', () => {
    const users = [
      base({ id: 'branch', role: UserRole.BRANCH_LEADER, locationId: 'area-nn' }),
      base({ id: 'group', role: UserRole.GROUP_LEADER, parentId: 'branch', locationId: 'area-nn' }),
      base({ id: 'mem', role: UserRole.MEMBER, parentId: 'group', locationId: 'area-nn' }),
    ];
    const tree = buildOrgTree(users, [], AREAS);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('branch');
    expect(ids(tree[0])).toEqual(['branch', 'group', 'mem']);
  });

  it('RESTRUCTURES when a member is re-parented (the org-churn guarantee)', () => {
    const users = [
      base({ id: 'g1', role: UserRole.GROUP_LEADER }),
      base({ id: 'g2', role: UserRole.GROUP_LEADER }),
      base({ id: 'mem', role: UserRole.MEMBER, parentId: 'g1' }),
    ];
    const under = (id: string) =>
      buildOrgTree(users, [], AREAS).find((n) => n.id === id)!.children.map((c) => c.id);
    expect(under('g1')).toContain('mem');
    expect(under('g2')).not.toContain('mem');
    // Relocate the member's reporting line — same mutation a reassignment does.
    users[2].parentId = 'g2';
    expect(under('g1')).not.toContain('mem');
    expect(under('g2')).toContain('mem');
  });

  it('moving a leader carries its whole subtree (children follow by id)', () => {
    const users = [
      base({ id: 'root', role: UserRole.OVERSEER }),
      base({ id: 'b1', role: UserRole.BRANCH_LEADER, parentId: 'root' }),
      base({ id: 'g', role: UserRole.GROUP_LEADER, parentId: 'b1' }),
      base({ id: 'm', role: UserRole.MEMBER, parentId: 'g' }),
    ];
    // Detach the branch from root → it becomes its own root WITH its subtree.
    users[1].parentId = undefined;
    const tree = buildOrgTree(users, [], AREAS);
    const b1 = tree.find((n) => n.id === 'b1')!;
    expect(ids(b1)).toEqual(['b1', 'g', 'm']);
  });

  it('exposes location as groupName and reflects a relocation', () => {
    const users = [base({ id: 'm', role: UserRole.MEMBER, locationId: 'area-nn' })];
    expect(buildOrgTree(users, [], AREAS)[0].groupName).toBe('Newport News');
    users[0].locationId = 'area-vb';
    expect(buildOrgTree(users, [], AREAS)[0].groupName).toBe('VA Beach');
  });

  it('hides soft-deleted users but keeps orphaned subtrees visible as roots', () => {
    const users = [
      base({ id: 'branch', role: UserRole.BRANCH_LEADER, isActive: false }),
      base({ id: 'group', role: UserRole.GROUP_LEADER, parentId: 'branch' }),
    ];
    const tree = buildOrgTree(users, [], AREAS);
    expect(tree.map((n) => n.id)).toEqual(['group']); // branch gone, group surfaces
  });

  it('rolls metrics up from descendants without double-counting', () => {
    const users = [
      base({ id: 'g', role: UserRole.GROUP_LEADER }),
      base({ id: 'm1', role: UserRole.MEMBER, parentId: 'g' }),
      base({ id: 'm2', role: UserRole.MEMBER, parentId: 'g' }),
    ];
    const metrics = [
      { userId: 'm1', totalStudents: 2, activeStudents: 1, currentlyStudying: 1, continuedStudying: 0, baptizedSinceStudying: 0, totalSessionsLed: 0 },
      { userId: 'm2', totalStudents: 3, activeStudents: 2, currentlyStudying: 0, continuedStudying: 1, baptizedSinceStudying: 1, totalSessionsLed: 0 },
    ];
    const g = buildOrgTree(users, metrics, AREAS)[0];
    expect(g.metrics?.totalStudents).toBe(5);
    expect(g.metrics?.baptizedSinceStudying).toBe(1);
  });
});
