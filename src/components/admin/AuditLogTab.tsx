'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/stores/auth-store';
import { groupsApi } from '@/lib/api/groups';
import type { AuditLogEntry } from '@/lib/types';
import { ExportDropdown } from '@/components/shared/ExportDropdown';
import { format, parseISO } from 'date-fns';

/**
 * AuditLogTab — admin view of the audit trail.
 *
 * Phase 7a — read-only audit log with filters by entityType / action /
 * search / pagination. Reuses the same API as /reports but trimmed to
 * fit the admin-tab shell.
 *
 * Branch Leader sees a branch-scoped subset (server-side filter — Mike-
 * side; today still global per the C-1 carryover); Overseer + Dev see
 * all entries.
 */

const PAGE_SIZE = 25;

const ENTITY_TYPES = [
  'all', 'booking', 'contact', 'user', 'group', 'report',
  'tag', 'permission', 'blocked_slot', 'password_reset',
  'username_change', 'login_success', 'login_failed',
  'role_change', 'group_assignment',
];

const ACTIONS = [
  'all', 'create', 'update', 'delete', 'cancel', 'restore', 'export',
  'login', 'login_failed', 'reset_password', 'rename',
  'tag_grant', 'tag_revoke', 'role_change', 'reassign',
];

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/20 text-green-500 border-green-500/30',
  update: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  delete: 'bg-red-500/20 text-red-500 border-red-500/30',
  cancel: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  restore: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  export: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
  login: 'bg-sky-500/20 text-sky-500 border-sky-500/30',
  login_failed: 'bg-red-500/20 text-red-500 border-red-500/30',
  reset_password: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
  rename: 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30',
  tag_grant: 'bg-teal-500/20 text-teal-500 border-teal-500/30',
  tag_revoke: 'bg-rose-500/20 text-rose-500 border-rose-500/30',
  role_change: 'bg-fuchsia-500/20 text-fuchsia-500 border-fuchsia-500/30',
  reassign: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/30',
};

export function AuditLogTab() {
  const viewer = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<AuditLogEntry | null>(null);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  // For ExportDropdown's "All in scope" (we cap at 9999 to avoid runaway).
  const [allEntries, setAllEntries] = useState<AuditLogEntry[]>([]);

  const reload = useMemo(() => () => {
    setLoading(true);
    setLoadError(null);
    groupsApi
      .getAuditLog({
        page,
        limit: PAGE_SIZE,
        action: actionFilter === 'all' ? undefined : actionFilter,
        entityType: entityFilter === 'all' ? undefined : entityFilter,
        search: search || undefined,
      })
      .then((data) => {
        setEntries(data.entries ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((e) => {
        setEntries([]);
        setLoadError(e instanceof Error ? e.message : 'Failed to load audit log');
      })
      .finally(() => setLoading(false));
  }, [page, actionFilter, entityFilter, search]);

  useEffect(() => { reload(); }, [reload]);

  // Lazy-load the "all" snapshot only when ExportDropdown asks for it.
  const loadAll = async () => {
    if (allEntries.length > 0) return allEntries;
    const data = await groupsApi.getAuditLog({ limit: 9999 });
    const fresh = data.entries ?? [];
    setAllEntries(fresh);
    return fresh;
  };

  useEffect(() => { setPage(1); }, [actionFilter, entityFilter, search]);

  if (!viewer) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = actionFilter !== 'all' || entityFilter !== 'all' || !!search;

  const auditColumns = ['Timestamp', 'Action', 'Entity', 'Entity ID', 'Actor', 'Details'];
  const auditToRow = (e: AuditLogEntry) => [
    format(parseISO(e.timestamp), 'yyyy-MM-dd HH:mm:ss'),
    e.action,
    e.entityType,
    e.entityId,
    e.userName,
    e.details,
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Audit log
          </h2>
          <p className="text-xs text-muted-foreground">
            Append-only record of every state-changing action. Branch Leaders see their
            branch&apos;s entries; Overseer + Dev see global. Filter by action / entity /
            free-text search.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={reload}
          title="Refresh"
          aria-label="Refresh audit log"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar — search + filters + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-auto md:flex-1 md:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search details, actor, entity ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={actionFilter} onValueChange={(v) => v && setActionFilter(v)}>
          <SelectTrigger className="w-[160px]">
            {/* H-04: explicit children so the trigger renders the friendly
                label ('All actions') instead of the raw value ('all').
                Mirrors UsersTab's pattern. */}
            <SelectValue>{actionFilter === 'all' ? 'All actions' : actionFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a === 'all' ? 'All actions' : a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={(v) => v && setEntityFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue>{entityFilter === 'all' ? 'All entities' : entityFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((e) => (
              <SelectItem key={e} value={e}>
                {e === 'all' ? 'All entities' : e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setActionFilter('all'); setEntityFilter('all'); setSearch(''); }}
            className="gap-1.5"
          >
            <Filter className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}

        <ExportDropdown
          currentRows={entries}
          loadAll={loadAll}
          columns={auditColumns}
          toRow={auditToRow}
          filenamePrefix="diamond-audit"
          allLabel="All entries (cap 9999)"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Timestamp</TableHead>
                <TableHead className="w-[120px]">Action</TableHead>
                <TableHead className="w-[150px]">Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-[140px]">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading audit entries…
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <div className="text-sm font-medium text-destructive">Failed to load audit log</div>
                    <div className="mt-1 text-xs text-muted-foreground">{loadError}</div>
                    <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    No audit entries match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-accent/30"
                    onClick={() => setDetailOpen(e)}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {format(parseISO(e.timestamp), 'MMM d, HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${ACTION_COLORS[e.action] ?? 'bg-muted text-muted-foreground'} text-[10px]`}
                      >
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.entityType}</TableCell>
                    <TableCell className="text-xs max-w-[400px] truncate">{e.details}</TableCell>
                    <TableCell className="text-xs">{e.userName}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && !loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {detailOpen && (
        <Dialog open onOpenChange={(o) => !o && setDetailOpen(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`${ACTION_COLORS[detailOpen.action] ?? 'bg-muted'} text-xs`}
                >
                  {detailOpen.action}
                </Badge>
                {detailOpen.entityType}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <DetailRow label="When" value={format(parseISO(detailOpen.timestamp), 'EEEE, MMM d yyyy · HH:mm:ss')} />
              <DetailRow label="Actor" value={detailOpen.userName} />
              <DetailRow label="Entity ID" value={detailOpen.entityId} mono />
              <DetailRow label="Details" value={detailOpen.details} />
              {detailOpen.reason && <DetailRow label="Reason" value={detailOpen.reason} />}
              {detailOpen.before !== undefined && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Before</div>
                  <pre className="rounded-md bg-muted/50 p-2 text-[11px] overflow-x-auto">
                    {JSON.stringify(detailOpen.before, null, 2)}
                  </pre>
                </div>
              )}
              {detailOpen.after !== undefined && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">After</div>
                  <pre className="rounded-md bg-muted/50 p-2 text-[11px] overflow-x-auto">
                    {JSON.stringify(detailOpen.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</div>
    </div>
  );
}
