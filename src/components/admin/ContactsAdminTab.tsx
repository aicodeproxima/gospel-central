'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  Pencil,
  Power,
  Contact as ContactIcon,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/lib/stores/auth-store';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import {
  PIPELINE_STAGE_CONFIG,
  type Contact,
  type PipelineStage,
  type User,
} from '@/lib/types';
import {
  buildManageableScope,
  buildVisibilityScope,
  canViewContact,
} from '@/lib/utils/permissions';
import { ExportDropdown } from '@/components/shared/ExportDropdown';
import { ContactDetailDialog } from '@/components/groups/ContactDetailDialog';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

/**
 * ContactsAdminTab — branch-scoped contact management for admins.
 *
 * Differs from /contacts (which is the everyone-page) by:
 *   - admin-tier-only access (matrix gates this tab to Branch Leader+)
 *   - explicit branch + stage + status filters
 *   - per-row action menu surfaces Edit + Convert + Delete in one place
 *   - dual-mode CSV export with the same scope rules as the rest of admin
 *
 * Phase 5 — closes the original audit's "Contacts admin tab" placeholder.
 */

const PAGE_SIZE = 25;

type StageFilter = 'all' | string;
type ConvertedFilter = 'all' | 'converted' | 'unconverted';

export function ContactsAdminTab() {
  const viewer = useAuthStore((s) => s.user);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [convertedFilter, setConvertedFilter] = useState<ConvertedFilter>('all');
  const [page, setPage] = useState(1);

  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  // Credentials of a just-converted contact — shown ONCE so the admin can hand
  // over the initial password (mirrors ResetPasswordDialog; see handleConvert).
  const [convertedCreds, setConvertedCreds] = useState<{ username: string; tempPassword: string } | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      contactsApi.getContacts(),
      usersApi.getAll(),
    ])
      .then(([c, u]) => {
        setContacts(Array.isArray(c) ? c : []);
        setUsers(Array.isArray(u) ? u : []);
      })
      .catch((e) => {
        setContacts([]);
        setUsers([]);
        setLoadError(e instanceof Error ? e.message : 'Failed to load contacts');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  // Reset paging when filters change
  useEffect(() => { setPage(1); }, [search, stageFilter, convertedFilter]);

  const scope = useMemo(
    () => buildVisibilityScope(viewer ?? null, users),
    [viewer, users],
  );
  // Decision 10 (2026-07): the detail dialog's WRITE gates (convert /
  // reassign / edit) take the MANAGEABLE scope — a Branch Leader reads all
  // branches but writes only inside their own.
  const manageScope = useMemo(
    () => buildManageableScope(viewer ?? null, users),
    [viewer, users],
  );

  // Branch-scope at the page level (the matrix says Branch Leader sees all
  // branches, but Group / Team see only their subtree — for completeness).
  const visibleContacts = useMemo(() => {
    if (!viewer) return [];
    return contacts.filter((c) => canViewContact(viewer, c, scope.userIds));
  }, [contacts, viewer, scope.userIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleContacts.filter((c) => {
      if (stageFilter !== 'all' && c.pipelineStage !== stageFilter) return false;
      if (convertedFilter === 'converted' && !c.convertedToUserId) return false;
      if (convertedFilter === 'unconverted' && c.convertedToUserId) return false;
      if (!q) return true;
      const hay = `${c.firstName} ${c.lastName} ${c.email ?? ''} ${c.phone ?? ''} ${c.groupName ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [visibleContacts, search, stageFilter, convertedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pagedContacts = useMemo(
    () => filtered.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE),
    [filtered, visiblePage],
  );

  // Resolve owner display name
  const userById = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  if (!viewer) return null;

  const ownerName = (c: Contact) => {
    if (!c.assignedTeacherId) return '—';
    const u = userById.get(c.assignedTeacherId);
    return u ? `${u.firstName} ${u.lastName}`.trim() : c.assignedTeacherId;
  };

  // Export columns
  const columns = ['ID', 'First name', 'Last name', 'Email', 'Phone', 'Group', 'Pipeline stage', 'Owner', 'Status', 'Converted to', 'Created'];
  const toRow = (c: Contact) => [
    c.id,
    c.firstName,
    c.lastName,
    c.email ?? '',
    c.phone ?? '',
    c.groupName ?? '',
    c.pipelineStage,
    ownerName(c),
    c.status ?? 'active',
    c.convertedToUserId ?? '',
    c.createdAt,
  ];

  const detailContact = detailContactId
    ? contacts.find((c) => c.id === detailContactId) ?? null
    : null;

  const handleSave = async (id: string, data: Partial<Contact>) => {
    try {
      await contactsApi.updateContact(id, data);
      toast.success('Contact updated');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
      throw e;
    }
  };

  const handleConvert = async (
    id: string,
    payload: { role: string; parentId?: string; groupId?: string; actorId?: string },
  ) => {
    try {
      const res = await contactsApi.convertToUser(id, payload as never);
      // Surface the initial credentials ONCE — without this the admin can't give
      // the converted user their password (they'd need a follow-up reset).
      setConvertedCreds({ username: res.user.username, tempPassword: res.tempPassword });
      setCredsCopied(false);
      toast.success('Converted to user account');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Convert failed');
      throw e;
    }
  };

  const stageOptions = Object.entries(PIPELINE_STAGE_CONFIG);
  const hasFilters = stageFilter !== 'all' || convertedFilter !== 'all' || !!search;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="max-xl:min-w-0 max-xl:flex-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ContactIcon className="h-5 w-5 text-primary" />
            Contacts
          </h2>
          <p className="text-xs text-muted-foreground">
            Branch-scoped contact management. Click any row to open the detail
            dialog with edit + convert-to-user actions. {scope.kind === 'all'
              ? 'You see all contacts.'
              : `Scope: ${scope.kind}.`}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={reload}
          title="Refresh"
          aria-label="Refresh contacts"
          className="shrink-0 touch-manipulation max-xl:h-11 max-xl:w-11"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-auto md:flex-1 md:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, group"
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

        <Select value={stageFilter} onValueChange={(v) => v && setStageFilter(v)}>
          <SelectTrigger className="w-[160px]">
            {/* H-04 follow-up: explicit children so the trigger renders
                'All stages' / friendly stage labels instead of raw 'all'. */}
            <SelectValue>
              {stageFilter === 'all'
                ? 'All stages'
                : PIPELINE_STAGE_CONFIG[stageFilter as PipelineStage]?.label ?? stageFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stageOptions.map(([k, cfg]) => (
              <SelectItem key={k} value={k}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={convertedFilter} onValueChange={(v) => v && setConvertedFilter(v as ConvertedFilter)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue>
              {convertedFilter === 'all'
                ? 'All'
                : convertedFilter === 'converted'
                  ? 'Converted'
                  : 'Not converted'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unconverted">Not converted</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStageFilter('all'); setConvertedFilter('all'); setSearch(''); }}
          >
            Clear
          </Button>
        )}

        <ExportDropdown
          currentRows={filtered}
          allRows={visibleContacts}
          columns={columns}
          toRow={toRow}
          filenamePrefix="gospel-central-contacts-admin"
          allLabel="All in scope"
          triggerClassName="touch-manipulation max-xl:h-11"
        />
      </div>

      {/* Desktop table (≥1280). Below xl, the same rows render as stacked
          cards (dual-render — see the card list further down). */}
      <Card className="hidden xl:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[160px]">Stage</TableHead>
                <TableHead className="w-[180px]">Owner</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[120px]">Sessions</TableHead>
                <TableHead className="w-[120px]">Last session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading contacts…
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <div className="text-sm font-medium text-destructive">Failed to load contacts</div>
                    <div className="mt-1 text-xs text-muted-foreground">{loadError}</div>
                    <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : pagedContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No contacts match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                pagedContacts.map((c) => {
                  const stage = PIPELINE_STAGE_CONFIG[c.pipelineStage];
                  const inactive = c.status === 'inactive';
                  const converted = !!c.convertedToUserId;
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-accent/30 ${inactive ? 'opacity-60' : ''}`}
                      onClick={() => setDetailContactId(c.id)}
                    >
                      <TableCell>
                        <div className="font-medium">{c.firstName} {c.lastName}</div>
                        <div className="text-[11px] text-muted-foreground">{c.email ?? c.phone ?? ''}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${stage?.color ?? 'bg-muted'}`} />
                          {stage?.label ?? c.pipelineStage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{ownerName(c)}</TableCell>
                      <TableCell>
                        {converted ? (
                          <Badge variant="outline" className="text-[10px]">Converted</Badge>
                        ) : inactive ? (
                          <Badge variant="outline" className="text-[10px] border-orange-600/40 text-orange-600">Inactive</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-500">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{c.totalSessions ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.lastSessionDate ? format(parseISO(c.lastSessionDate), 'MMM d') : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile / tablet card list (<1280). Each card is tappable to open the
          same detail dialog as the desktop row click. */}
      <div className="xl:hidden space-y-2">
        {loading ? (
          <Card>
            <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading contacts…
            </CardContent>
          </Card>
        ) : loadError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-destructive">Failed to load contacts</p>
              <p className="text-xs text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={reload} className="mt-2 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : pagedContacts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No contacts match these filters.
            </CardContent>
          </Card>
        ) : (
          pagedContacts.map((c) => {
            const stage = PIPELINE_STAGE_CONFIG[c.pipelineStage];
            const inactive = c.status === 'inactive';
            const converted = !!c.convertedToUserId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setDetailContactId(c.id)}
                className={`w-full touch-manipulation rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/30 ${
                  inactive ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.firstName} {c.lastName}</div>
                    {(c.email || c.phone) && (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {c.email ?? c.phone}
                      </div>
                    )}
                  </div>
                  {converted ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">Converted</Badge>
                  ) : inactive ? (
                    <Badge variant="outline" className="shrink-0 text-[10px] border-orange-600/40 text-orange-600">Inactive</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px] border-green-500/40 text-green-500">Active</Badge>
                  )}
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Stage</dt>
                    <dd>
                      <Badge variant="outline" className="text-xs">
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${stage?.color ?? 'bg-muted'}`} />
                        {stage?.label ?? c.pipelineStage}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Owner</dt>
                    <dd className="min-w-0 truncate text-xs">{ownerName(c)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Sessions</dt>
                    <dd className="text-xs">{c.totalSessions ?? 0}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Last session</dt>
                    <dd className="text-xs text-muted-foreground">
                      {c.lastSessionDate ? format(parseISO(c.lastSessionDate), 'MMM d') : '—'}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && !loadError && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Showing {(visiblePage - 1) * PAGE_SIZE + 1}–{Math.min(visiblePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={visiblePage === 1}
              aria-label="Previous page"
              className="touch-manipulation max-xl:h-11 max-xl:w-11"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">{visiblePage} / {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={visiblePage >= totalPages}
              aria-label="Next page"
              className="touch-manipulation max-xl:h-11 max-xl:w-11"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Reuse the existing ContactDetailDialog for edit + convert flows */}
      <ContactDetailDialog
        open={!!detailContact}
        onClose={() => setDetailContactId(null)}
        contact={detailContact}
        users={users}
        allContacts={contacts}
        onSave={handleSave}
        viewer={viewer}
        subtreeUserIds={manageScope.userIds}
        onConvert={handleConvert}
      />

      {/* Converted-contact credentials reveal — shown ONCE (mirrors ResetPasswordDialog). */}
      <Dialog open={!!convertedCreds} onOpenChange={(o) => !o && setConvertedCreds(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Account created
            </DialogTitle>
            <DialogDescription>
              The contact is now a user. Give them these credentials via a secure channel — they&apos;ll
              set their own password on first login.
            </DialogDescription>
          </DialogHeader>
          {convertedCreds && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                <strong>Save this now.</strong> The temporary password cannot be retrieved after you close this dialog.
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Username</div>
                <div className="font-mono text-sm">{convertedCreds.username}</div>
                <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Temp password</div>
                <div className="font-mono text-sm">{convertedCreds.tempPassword}</div>
              </div>
              <Button
                variant="outline"
                className="w-full touch-manipulation max-md:h-11"
                onClick={() => {
                  navigator.clipboard
                    .writeText(`Username: ${convertedCreds.username}\nPassword: ${convertedCreds.tempPassword}`)
                    .then(() => {
                      setCredsCopied(true);
                      toast.success('Credentials copied');
                      setTimeout(() => setCredsCopied(false), 2000);
                    });
                }}
              >
                {credsCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {credsCopied ? 'Copied' : 'Copy credentials'}
              </Button>
              <Button className="w-full touch-manipulation max-md:h-11" onClick={() => setConvertedCreds(null)}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
