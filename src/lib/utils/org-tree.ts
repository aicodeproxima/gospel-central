import { ROLE_HIERARCHY, UserRole } from '@/lib/types/user';
import type { TeacherMetrics, User } from '@/lib/types/user';
import type { OrgNode } from '@/lib/types/group';
import type { Area } from '@/lib/types/booking';

/**
 * Build the org tree from live user records — the SINGLE source of the
 * Branch → Group → Team → Member hierarchy.
 *
 * The tree is DERIVED from each user's `parentId`, never stored. So a role
 * change or a reassignment (which mutate the user record) restructure the
 * tree the next time it's built — which is exactly how a real backend's
 * `/groups/tree` endpoint behaves, and what lets the app adapt to org churn.
 *
 * `groupName` carries the person's LOCATION (their area's name, resolved from
 * `locationId`) so the tree visualizes *where* everyone is — the VA-Beach-style
 * "who relocated" question is answerable at a glance.
 *
 * Metrics roll up from the leaves: a node's metrics = its own + the sum of its
 * children's (already-rolled) metrics. Subtrees are disjoint, so no double count.
 */

type RolledMetrics = NonNullable<OrgNode['metrics']>;

const EMPTY_METRICS: RolledMetrics = {
  totalStudents: 0,
  activeStudents: 0,
  currentlyStudying: 0,
  continuedStudying: 0,
  baptizedSinceStudying: 0,
};

function addMetricsInto(acc: RolledMetrics, m: RolledMetrics): void {
  acc.totalStudents += m.totalStudents;
  acc.activeStudents += m.activeStudents;
  acc.currentlyStudying += m.currentlyStudying;
  acc.continuedStudying += m.continuedStudying;
  acc.baptizedSinceStudying += m.baptizedSinceStudying;
}

const roleRank = (r: UserRole) => ROLE_HIERARCHY.indexOf(r);

export function buildOrgTree(
  users: User[],
  metrics: TeacherMetrics[] = [],
  areas: Area[] = [],
): OrgNode[] {
  // Only active people appear in the tree (soft-deleted users are hidden).
  const active = users.filter((u) => u.isActive !== false);
  // byId collapses any duplicate ids to one row; build the adjacency list from
  // byId.values() (not `active`) so a duplicate id can never double-build a
  // subtree or double-count metrics under two clones (audit #6).
  const byId = new Map(active.map((u) => [u.id, u] as const));
  const metricsById = new Map(metrics.map((m) => [m.userId, m] as const));
  const areaNameById = new Map(areas.map((a) => [a.id, a.name] as const));
  const areaName = (id?: string) => (id ? areaNameById.get(id) : undefined); // O(1)

  // Adjacency list. A user whose parent is missing/inactive becomes a root,
  // so an orphaned subtree (e.g. after a branch was deactivated) still renders
  // rather than vanishing.
  const childrenOf = new Map<string | undefined, User[]>();
  for (const u of byId.values()) {
    const pid = u.parentId && byId.has(u.parentId) ? u.parentId : undefined;
    const arr = childrenOf.get(pid);
    if (arr) arr.push(u);
    else childrenOf.set(pid, [u]);
  }

  const sortUsers = (arr: User[]) =>
    [...arr].sort(
      (a, b) =>
        roleRank(b.role) - roleRank(a.role) ||
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`) ||
        a.id.localeCompare(b.id), // final tiebreak → deterministic order
    );

  // visited guards against a parentId cycle or a self-parent: without it those
  // users are unreachable from a real root and silently VANISH from the tree
  // (audit #2/#5). We mark each id as it's built and skip any child already
  // built, which both prevents infinite recursion when a cycle is forced to a
  // root below and guarantees every active person appears exactly once.
  const visited = new Set<string>();
  const buildNode = (u: User): OrgNode => {
    visited.add(u.id);
    const childNodes = sortUsers(childrenOf.get(u.id) ?? [])
      .filter((c) => !visited.has(c.id))
      .map(buildNode);

    const rolled: RolledMetrics = { ...EMPTY_METRICS };
    const self = metricsById.get(u.id);
    if (self) addMetricsInto(rolled, self);
    for (const c of childNodes) if (c.metrics) addMetricsInto(rolled, c.metrics);

    return {
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      role: u.role,
      avatarUrl: u.avatarUrl,
      groupName: areaName(u.locationId),
      metrics: rolled,
      children: childNodes,
    };
  };

  const roots = sortUsers(childrenOf.get(undefined) ?? []).map(buildNode);
  // No-vanish guarantee: any active user not reached from a real root (caught
  // in a parentId cycle or self-parenting) is surfaced as a forced root so a
  // bad reassignment can never make a leader and their reports disappear.
  // Re-check visited inside the loop: building one cycle member visits its
  // partners, so they must not be built again as separate roots.
  const orphaned: OrgNode[] = [];
  for (const u of sortUsers(active.filter((u) => !visited.has(u.id)))) {
    if (!visited.has(u.id)) orphaned.push(buildNode(u));
  }
  return [...roots, ...orphaned];
}
