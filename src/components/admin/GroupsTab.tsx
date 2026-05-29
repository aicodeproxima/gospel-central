'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Building2,
  Users as UsersIcon,
  User as UserIcon,
  Plus,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usersApi } from '@/lib/api/users';
import {
  ROLE_LABELS,
  UserRole,
  type User,
} from '@/lib/types';
import {
  buildVisibilityScope,
  canCreateGroupNode,
  canEditUser,
  canCreateUser,
} from '@/lib/utils/permissions';
import { CreateUserWizard } from '@/components/users/CreateUserWizard';
import { EditUserDialog } from '@/components/admin/dialogs/EditUserDialog';
import { ExportDropdown } from '@/components/shared/ExportDropdown';

/**
 * GroupsTab — admin view of the org tree. Branches → Groups → Teams → Members.
 *
 * In Diamond's data model, each "node" in the tree IS a User record:
 *   - Branch  = User with role=BRANCH_LEADER
 *   - Group   = User with role=GROUP_LEADER  (parentId = a Branch leader)
 *   - Team    = User with role=TEAM_LEADER   (parentId = a Group leader,
 *                                              OR directly a Branch leader if
 *                                              that branch has no Group tier)
 *   - Member  = User with role=MEMBER        (parentId = a Team leader)
 *
 * So "rename a group" = rename the Group leader's display name (via
 * EditUserDialog), "deactivate a team" = deactivate the Team leader (and
 * orphans their Members until they're reassigned). All edit/create actions
 * are delegated to the dialogs we already built in Phase 3.
 */
export function GroupsTab() {
  const viewer = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  // UI-8: error state distinct from empty.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [createCtx, setCreateCtx] = useState<{ parent: User; childRole: UserRole } | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    usersApi
      .getAll()
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((e) => {
        setUsers([]);
        setLoadError(e instanceof Error ? e.message : 'Failed to load org tree');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  // Build the tree once per users[]
  const tree = useMemo(() => buildTree(users), [users]);

  // M-01 / M-02: viewer's subtree, used by canCreateGroupNode +
  // canRenameGroup + canDeactivateGroup to enforce the matrix's
  // own-branch / own-group scope restrictions on sub-Admin viewers.
  // Branch Leader+ get scope.kind === 'all' so the empty userIds
  // array is the correct sentinel to bypass the subtree check.
  const subtreeUserIds = useMemo(
    () => buildVisibilityScope(viewer ?? null, users).userIds,
    [viewer, users],
  );

  // Auto-expand the top branches on first load so the tab isn't all collapsed
  useEffect(() => {
    if (loading || users.length === 0) return;
    setExpanded((s) => {
      if (s.size > 0) return s;
      const next = new Set<string>();
      tree.branches.forEach((b) => next.add(b.user.id));
      return next;
    });
  }, [loading, users, tree]);

  if (!viewer) return null;

  const toggle = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // EXPORT-3: row mapper + columns. Each row represents one tree node
  // (i.e. a Branch / Group / Team leader User). Members are excluded
  // from the tree itself, so they're excluded from the export too — use
  // the Users tab Export for member-level CSV.
  const userById = new Map(users.map((u) => [u.id, u]));
  const branchOf = (u: User): User | undefined => {
    let cur: User | undefined = u;
    while (cur && cur.role !== UserRole.BRANCH_LEADER) {
      cur = cur.parentId ? userById.get(cur.parentId) : undefined;
    }
    return cur;
  };
  const nodeColumns = [
    'Name',
    'Username',
    'Role',
    'Parent',
    'Branch',
    'Tags',
    'Active',
  ];
  const nodeToRow = (u: User) => {
    const parent = u.parentId ? userById.get(u.parentId) : undefined;
    const branch = branchOf(u);
    return [
      `${u.firstName} ${u.lastName}`.trim(),
      u.username,
      ROLE_LABELS[u.role] ?? u.role,
      parent ? `${parent.firstName} ${parent.lastName}`.trim() : '',
      branch ? `${branch.firstName} ${branch.lastName}`.trim() : '',
      (u.tags ?? []).join('; '),
      u.isActive === false ? 'inactive' : 'active',
    ];
  };

  // "Current view" — flatten only the expanded subtree.
  const flattenExpanded = (nodes: NodeData[]): User[] => {
    const out: User[] = [];
    const walk = (list: NodeData[]) => {
      for (const n of list) {
        out.push(n.user);
        if (expanded.has(n.user.id)) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };
  const currentNodes = flattenExpanded(tree.branches);
  // "All" — every leader (Branch / Group / Team) in the org. Excludes Members.
  const allLeaders = users.filter((u) => u.role !== UserRole.MEMBER);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Org tree</h2>
          <p className="text-xs text-muted-foreground">
            Branches → Groups → Teams → Members. Click any node to expand it. Use the action buttons to rename a leader or add a child.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            title="Refresh"
            aria-label="Refresh org tree"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {/* EXPORT-3: dual-mode tree CSV. "Current view" = expanded
               subtree; "All" = every leader in the org. */}
          <ExportDropdown
            currentRows={currentNodes}
            allRows={allLeaders}
            columns={nodeColumns}
            toRow={nodeToRow}
            filenamePrefix="diamond-org"
            currentLabel="Current view"
            allLabel="All leaders"
          />
          {canCreateGroupNode(viewer, 'branch') && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setCreateCtx({ parent: viewer, childRole: UserRole.BRANCH_LEADER })}
            >
              <Plus className="h-4 w-4" />
              Add Branch
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent align-middle" />
              <span className="ml-2">Loading org tree…</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-destructive">Failed to load org tree</p>
              <p className="text-xs text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={reload} className="mt-2 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          ) : tree.branches.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-1">
              {tree.branches.map((b) => (
                <BranchRow
                  key={b.user.id}
                  branch={b}
                  viewer={viewer}
                  subtreeUserIds={subtreeUserIds}
                  expanded={expanded}
                  onToggle={toggle}
                  onAddChild={(parent, childRole) => setCreateCtx({ parent, childRole })}
                  onEdit={(u) => setEditTarget(u)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create-user dialog (re-used Phase 0 wizard) — pre-fills role + parent */}
      {createCtx && (
        <CreateUserWizard
          open
          creator={viewer}
          users={users}
          initialRole={createCtx.childRole}
          initialParentId={createCtx.parent.id}
          onClose={() => setCreateCtx(null)}
          onCreated={() => {
            setCreateCtx(null);
            reload();
          }}
        />
      )}

      {/* Edit any node by editing its leader's user record */}
      {editTarget && (
        <EditUserDialog
          open
          user={editTarget}
          viewer={viewer}
          allUsers={users}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree builder + row components
// ---------------------------------------------------------------------------

interface NodeData<T extends User = User> {
  user: T;
  children: NodeData[];
  memberCount: number;
}
interface Tree {
  branches: NodeData[];
  /** Counts for the legend / summary header. */
  totals: { branches: number; groups: number; teams: number; members: number };
}

function buildTree(users: User[]): Tree {
  const byParent = new Map<string, User[]>();
  users.forEach((u) => {
    const p = u.parentId ?? '__root__';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(u);
  });

  const totals = { branches: 0, groups: 0, teams: 0, members: 0 };
  const branchUsers = users.filter((u) => u.role === UserRole.BRANCH_LEADER);
  totals.branches = branchUsers.length;

  function build(u: User): NodeData {
    const kids = (byParent.get(u.id) ?? []).filter((k) => k.role !== UserRole.MEMBER);
    const children = kids.map((k) => {
      if (k.role === UserRole.GROUP_LEADER) totals.groups += 1;
      if (k.role === UserRole.TEAM_LEADER) totals.teams += 1;
      return build(k);
    });
    const directMembers = (byParent.get(u.id) ?? []).filter((k) => k.role === UserRole.MEMBER).length;
    totals.members += directMembers;
    return {
      user: u,
      children,
      memberCount: directMembers + children.reduce((s, c) => s + c.memberCount, 0),
    };
  }

  const branches = branchUsers.map((b) => build(b));
  return { branches, totals };
}

function BranchRow({
  branch,
  viewer,
  subtreeUserIds,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
}: {
  branch: NodeData;
  viewer: User;
  subtreeUserIds: string[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (parent: User, childRole: UserRole) => void;
  onEdit: (u: User) => void;
}) {
  const isOpen = expanded.has(branch.user.id);
  return (
    <div className="rounded-lg border border-border">
      <NodeHeader
        kindLabel="Branch"
        kindIcon={Building2}
        node={branch}
        viewer={viewer}
        isOpen={isOpen}
        onToggle={() => onToggle(branch.user.id)}
        onAddChild={() => onAddChild(branch.user, UserRole.GROUP_LEADER)}
        onEdit={() => onEdit(branch.user)}
        // M-01: pass parentNodeId so Branch Leaders only see Add Group on
        // their OWN branch (matrix line 95). canCreateUser already enforces
        // the role-tier check via subtree membership.
        canAddChild={
          canCreateGroupNode(viewer, 'group', branch.user.id, subtreeUserIds) &&
          canCreateUser(viewer, UserRole.GROUP_LEADER, branch.user.id, subtreeUserIds)
        }
        addChildLabel="Add Group"
        canAlsoAddTeam={
          canCreateGroupNode(viewer, 'team', branch.user.id, subtreeUserIds) &&
          canCreateUser(viewer, UserRole.TEAM_LEADER, branch.user.id, subtreeUserIds)
        }
        onAddAlt={() => onAddChild(branch.user, UserRole.TEAM_LEADER)}
        addAltLabel="Add Team"
      />
      {isOpen && (
        <div className="border-t border-border bg-muted/20 p-2 space-y-1">
          {branch.children.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No groups or teams yet. Use <span className="font-medium">Add Group</span> or
              <span className="font-medium"> Add Team</span> above to create the first one.
            </p>
          )}
          {branch.children.map((child) => (
            <ChildNodeRow
              key={child.user.id}
              node={child}
              viewer={viewer}
              subtreeUserIds={subtreeUserIds}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChildNodeRow({
  node,
  viewer,
  subtreeUserIds,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
}: {
  node: NodeData;
  viewer: User;
  subtreeUserIds: string[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (parent: User, childRole: UserRole) => void;
  onEdit: (u: User) => void;
}) {
  const isOpen = expanded.has(node.user.id);
  const isGroup = node.user.role === UserRole.GROUP_LEADER;
  const isTeam = node.user.role === UserRole.TEAM_LEADER;
  return (
    <div className="rounded-lg border border-border bg-card">
      <NodeHeader
        kindLabel={isGroup ? 'Group' : isTeam ? 'Team' : 'Node'}
        kindIcon={UsersIcon}
        node={node}
        viewer={viewer}
        isOpen={isOpen}
        onToggle={() => onToggle(node.user.id)}
        onAddChild={
          isGroup
            ? () => onAddChild(node.user, UserRole.TEAM_LEADER)
            : () => onAddChild(node.user, UserRole.MEMBER)
        }
        onEdit={() => onEdit(node.user)}
        // M-01: pass parentNodeId so Group Leaders only see Add Team on
        // their OWN group (matrix line 96). canCreateUser does the
        // tier-+-subtree gate for the resulting Team Leader / Member.
        canAddChild={
          isGroup
            ? canCreateGroupNode(viewer, 'team', node.user.id, subtreeUserIds) &&
              canCreateUser(viewer, UserRole.TEAM_LEADER, node.user.id, subtreeUserIds)
            : isTeam && canCreateUser(viewer, UserRole.MEMBER, node.user.id, subtreeUserIds)
        }
        addChildLabel={isGroup ? 'Add Team' : 'Add Member'}
      />
      {isOpen && node.children.length > 0 && (
        <div className="border-t border-border bg-muted/30 p-2 space-y-1">
          {node.children.map((c) => (
            <ChildNodeRow
              key={c.user.id}
              node={c}
              viewer={viewer}
              subtreeUserIds={subtreeUserIds}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeHeader({
  kindLabel,
  kindIcon: KindIcon,
  node,
  viewer,
  isOpen,
  onToggle,
  onAddChild,
  onEdit,
  canAddChild,
  addChildLabel,
  canAlsoAddTeam,
  onAddAlt,
  addAltLabel,
}: {
  kindLabel: string;
  kindIcon: typeof Building2;
  node: NodeData;
  viewer: User;
  isOpen: boolean;
  onToggle: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  canAddChild: boolean;
  addChildLabel: string;
  canAlsoAddTeam?: boolean;
  onAddAlt?: () => void;
  addAltLabel?: string;
}) {
  const editable = canEditUser(viewer, node.user);
  const childCount = node.children.length;
  const memberCount = node.memberCount;
  return (
    <div className="flex items-center gap-2 p-2.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        aria-label={isOpen ? 'Collapse' : 'Expand'}
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <KindIcon className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {node.user.firstName} {node.user.lastName}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {ROLE_LABELS[node.user.role] ?? node.user.role}
          </Badge>
          {node.user.isActive === false && (
            <Badge variant="outline" className="text-[10px] border-orange-600/40 text-orange-600">
              Inactive
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {kindLabel} · {childCount} child node{childCount === 1 ? '' : 's'} · {memberCount} member{memberCount === 1 ? '' : 's'} in subtree
        </div>
      </div>
      {canAddChild && (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onAddChild}>
          <Plus className="h-3.5 w-3.5" />
          {addChildLabel}
        </Button>
      )}
      {canAlsoAddTeam && onAddAlt && addAltLabel && (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onAddAlt}>
          <Plus className="h-3.5 w-3.5" />
          {addAltLabel}
        </Button>
      )}
      {editable && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label="Edit node">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <UserIcon className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">No branches yet</p>
      <p className="max-w-md text-xs text-muted-foreground">
        Use <span className="font-medium">Add Branch</span> above to create the first physical
        church location. Then add Groups under it, Teams under those, and Members under the Teams.
      </p>
    </div>
  );
}
