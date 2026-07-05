'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Building2,
  Users as UsersIcon,
  User as UserIcon,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usersApi } from '@/lib/api/users';
import { groupsApi, type ExportImportSettings } from '@/lib/api/groups';
import { ROLE_LABELS, UserRole, type User } from '@/lib/types';
import {
  buildManageableScope,
  resolveExportImportDetailed,
} from '@/lib/utils/permissions';
import { isApiError } from '@/lib/api/client';

/**
 * ExportImportTab — per-group control of the CSV export/import affordances
 * (calendar booking export, contacts import + export) that non-admins can
 * reach.
 *
 * Toggles exist at EVERY org level — Branch, Group, Team. Lower levels
 * inherit the nearest ancestor's setting unless they override it; the org
 * default (EXPORT_IMPORT_FOR_NON_ADMINS) backstops the chain. Each node IS
 * its leader's User record (same model as GroupsTab), so the tri-state here
 * writes an override keyed by that leader's id.
 *
 * EDIT scope: admin-tier only (the tab is admin-only), restricted to the
 * viewer's own subtree — a Branch Leader may toggle only nodes inside their
 * branch; Overseer / Dev may toggle anything. Out-of-scope nodes still
 * render so admins see the whole picture, but read-only.
 *
 * NOTE: admin-tier (Branch Leader+) always has export/import via
 * canExportImport's short-circuit, and Decision 13 adds a GL+ FLOOR — a Team
 * Leader or Member NEVER gets export/import regardless of any override. So
 * these toggles only meaningfully change what GROUP LEADERS get; a toggle on a
 * Team or Member node is inert (kept visible for the inheritance picture).
 */

type TriValue = boolean | null; // true = On, false = Off, null = Inherit

interface NodeData {
  user: User;
  children: NodeData[];
}

export function ExportImportTab() {
  const viewer = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<ExportImportSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([usersApi.getAll(), groupsApi.getExportImportSettings()])
      .then(([u, s]) => {
        setUsers(Array.isArray(u) ? u : []);
        setSettings(s);
      })
      .catch((e) => {
        setUsers([]);
        setSettings(null);
        setLoadError(e instanceof Error ? e.message : 'Failed to load settings');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const tree = useMemo(() => buildLeaderTree(users), [users]);

  // Own-subtree edit authority: Overseer/Dev get kind 'all' (toggle anything);
  // Branch Leaders get a populated userIds set (their branch only). NOTE: this
  // is buildManageableScope, NOT buildVisibilityScope — a Branch Leader can SEE
  // the whole org but may only TOGGLE their own branch.
  const scope = useMemo(
    () => buildManageableScope(viewer ?? null, users),
    [viewer, users],
  );
  const canToggle = (nodeId: string) =>
    scope.kind === 'all' || scope.userIds.includes(nodeId);

  // Auto-expand top branches on first load.
  useEffect(() => {
    if (loading || tree.length === 0) return;
    setExpanded((s) => {
      if (s.size > 0) return s;
      const next = new Set<string>();
      tree.forEach((b) => next.add(b.user.id));
      return next;
    });
  }, [loading, tree]);

  if (!viewer) return null;

  const overrides = settings?.overrides ?? {};
  const globalDefault = settings?.default ?? false;

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSet = async (nodeId: string, value: TriValue) => {
    setSavingId(nodeId);
    setSaveError(null);
    try {
      const updated = await groupsApi.setExportImportOverride(nodeId, value);
      setSettings(updated);
    } catch (e) {
      setSaveError(isApiError(e) ? e.message : 'Failed to save change');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Export / Import by group</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Turn the CSV export &amp; import tools (calendar export, contacts
            import/export) on or off per Branch, Group, or Team. Lower levels{' '}
            <span className="font-medium">inherit</span> the nearest setting
            above them unless you override it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            Org default: {globalDefault ? 'On' : 'Off'}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            title="Refresh"
            aria-label="Refresh settings"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Branch Leaders and above always have export/import regardless of these
        toggles — the switches govern Group Leaders, Team Leaders, and Members.
        {scope.kind !== 'all' && (
          <> You can change toggles inside your own branch only.</>
        )}
      </p>

      {saveError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </p>
      )}

      <Card>
        <CardContent className="p-3">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent align-middle" />
              <span className="ml-2">Loading settings…</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-destructive">Failed to load</p>
              <p className="text-xs text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={reload} className="mt-2 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <UserIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No groups yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Create branches, groups, and teams in the Groups tab first.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {tree.map((b) => (
                <NodeRow
                  key={b.user.id}
                  node={b}
                  depth={0}
                  users={users}
                  overrides={overrides}
                  globalDefault={globalDefault}
                  expanded={expanded}
                  onToggle={toggle}
                  canToggle={canToggle}
                  savingId={savingId}
                  onSet={handleSet}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree builder — leaders only (Branch / Group / Team), mirrors GroupsTab.
// ---------------------------------------------------------------------------

function buildLeaderTree(users: User[]): NodeData[] {
  const byParent = new Map<string, User[]>();
  users.forEach((u) => {
    const p = u.parentId ?? '__root__';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(u);
  });

  const build = (u: User): NodeData => {
    const kids = (byParent.get(u.id) ?? []).filter((k) => k.role !== UserRole.MEMBER);
    return { user: u, children: kids.map(build) };
  };

  return users
    .filter((u) => u.role === UserRole.BRANCH_LEADER)
    .map(build);
}

// ---------------------------------------------------------------------------
// Row + tri-state control
// ---------------------------------------------------------------------------

function NodeRow({
  node,
  depth,
  users,
  overrides,
  globalDefault,
  expanded,
  onToggle,
  canToggle,
  savingId,
  onSet,
}: {
  node: NodeData;
  depth: number;
  users: User[];
  overrides: Record<string, boolean>;
  globalDefault: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  canToggle: (id: string) => boolean;
  savingId: string | null;
  onSet: (nodeId: string, value: TriValue) => void;
}) {
  const { user } = node;
  const isOpen = expanded.has(user.id);
  const hasChildren = node.children.length > 0;
  const KindIcon = user.role === UserRole.BRANCH_LEADER ? Building2 : UsersIcon;
  const kindLabel =
    user.role === UserRole.BRANCH_LEADER
      ? 'Branch'
      : user.role === UserRole.GROUP_LEADER
        ? 'Group'
        : 'Team';

  // Explicit override on THIS node (undefined = inheriting).
  const own: TriValue = Object.prototype.hasOwnProperty.call(overrides, user.id)
    ? overrides[user.id]
    : null;

  // What this node would inherit if cleared: resolve from the parent chain.
  const inherited = user.parentId
    ? resolveExportImportDetailed(user.parentId, users, overrides)
    : { enabled: globalDefault, sourceNodeId: null };
  const inheritedFrom = inherited.sourceNodeId
    ? users.find((u) => u.id === inherited.sourceNodeId)
    : undefined;
  const inheritedSourceLabel = inheritedFrom
    ? `${inheritedFrom.firstName} ${inheritedFrom.lastName}`.trim() || inheritedFrom.username
    : 'org default';

  const effectiveOn = own === null ? inherited.enabled : own;
  const editable = canToggle(user.id);
  const busy = savingId === user.id;

  return (
    <div>
      {/* Indent without JS media queries: two CSS-gated spacer divs —
          8px/level on phone (<md; 16px/level would eat too much of a 275px
          viewport on deep nests), 16px/level ≥md (identical geometry to the
          old `marginLeft: depth * 16`). */}
      <div className="flex">
        <div style={{ width: depth * 8 }} className="shrink-0 md:hidden" aria-hidden="true" />
        <div style={{ width: depth * 16 }} className="hidden shrink-0 md:block" aria-hidden="true" />
        {/* Phone (<md): two-line card — line 1 = chevron/icon/name/badge,
            line 2 = compact meta + tri-state — so the name keeps the
            remaining width instead of being starved by the shrink-0 control.
            ≥md: single row, unchanged. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-border bg-card p-2.5 md:flex-row md:items-center md:gap-2">
          <div className="flex min-w-0 items-center gap-2 md:flex-1">
            <button
              type="button"
              onClick={() => hasChildren && onToggle(user.id)}
              className={cn(
                // h-6/w-6 at ≥1280 (unchanged); ≥44px touch target below xl.
                'flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground touch-manipulation max-xl:h-11 max-xl:w-11',
                hasChildren ? 'hover:bg-accent' : 'opacity-0 pointer-events-none',
              )}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <KindIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {/* overflow-hidden: defensive truncation guard (≥md too). */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium max-md:min-w-0 max-md:flex-1">
                  {user.firstName} {user.lastName}
                </span>
                {/* <360px: hide the role badge — kind is conveyed by the
                    icon, and the name must keep the width. */}
                <Badge variant="outline" className="hidden text-[10px] min-[360px]:inline-flex">
                  {ROLE_LABELS[user.role] ?? user.role}
                </Badge>
              </div>
              {/* Full meta string ≥md only; phone gets the compact line below. */}
              <div className="hidden text-[11px] text-muted-foreground md:block">
                {kindLabel} · Effective:{' '}
                <span className={cn('font-medium', effectiveOn ? 'text-emerald-600' : 'text-muted-foreground')}>
                  {effectiveOn ? 'On' : 'Off'}
                </span>
                {own === null ? (
                  <> · inheriting from {inheritedSourceLabel}</>
                ) : (
                  <> · set on this {kindLabel.toLowerCase()}</>
                )}
              </div>
            </div>
          </div>

          {/* Line 2 on phone: deliberately NO alignment indent — the tri-state
              needs ~149px min, so a 76px indent + gap would overflow the row
              at 275px (~233px > the ~179px available at depth 2). The flex-1
              meta truncates and absorbs the slack instead. ≥md: just the
              control at the right of the single row. */}
          <div className="flex min-w-0 items-center gap-2 md:shrink-0">
            <div className="min-w-0 flex-1 truncate whitespace-nowrap text-[11px] text-muted-foreground md:hidden">
              Effective:{' '}
              <span className={cn('font-medium', effectiveOn ? 'text-emerald-600' : 'text-muted-foreground')}>
                {effectiveOn ? 'On' : 'Off'}
              </span>
              {own === null ? <> · inherited</> : <> · set here</>}
            </div>
            {editable ? (
              <TriState value={own} busy={busy} onChange={(v) => onSet(user.id, v)} />
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                {effectiveOn ? 'On' : 'Off'}
              </span>
            )}
          </div>
        </div>
      </div>

      {isOpen && hasChildren && (
        <div className="mt-1 space-y-1">
          {node.children.map((c) => (
            <NodeRow
              key={c.user.id}
              node={c}
              depth={depth + 1}
              users={users}
              overrides={overrides}
              globalDefault={globalDefault}
              expanded={expanded}
              onToggle={onToggle}
              canToggle={canToggle}
              savingId={savingId}
              onSet={onSet}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TriState({
  value,
  busy,
  onChange,
}: {
  value: TriValue;
  busy: boolean;
  onChange: (v: TriValue) => void;
}) {
  const current = value === null ? 'inherit' : value ? 'on' : 'off';
  const opts: { key: string; label: string; v: TriValue }[] = [
    { key: 'inherit', label: 'Inherit', v: null },
    { key: 'on', label: 'On', v: true },
    { key: 'off', label: 'Off', v: false },
  ];
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group">
      {opts.map((o, i) => {
        const active = o.key === current;
        return (
          <button
            key={o.key}
            type="button"
            disabled={busy}
            onClick={() => !active && onChange(o.v)}
            className={cn(
              // ≥44px touch target below xl (h-11); h-7 (28px, was 24px via
              // py-1) at ≥1280 for a slightly more comfortable click target.
              'inline-flex h-7 items-center px-2.5 text-xs transition-colors touch-manipulation max-xl:h-11 max-xl:px-3',
              i > 0 && 'border-l border-border',
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent',
              busy && 'cursor-not-allowed opacity-50',
            )}
            aria-pressed={active}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
