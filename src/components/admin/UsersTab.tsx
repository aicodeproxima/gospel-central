'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Plus,
  Pencil,
  Power,
  KeyRound,
  Tag as TagIcon,
  AtSign,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  MoreHorizontal,
  SlidersHorizontal,
  MapPin,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExportDropdown } from '@/components/shared/ExportDropdown';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usersApi } from '@/lib/api/users';
import { bookingsApi } from '@/lib/api/bookings';
import {
  ROLE_HIERARCHY,
  ROLE_LABELS,
  TAG_LABELS,
  KNOWN_TAGS,
  UserRole,
  type User,
  type Area,
  tagLabel,
} from '@/lib/types';
import {
  canEditUser,
  canDeactivateUser,
  canResetPassword,
  canManageTags,
  canChangeUsername,
  canCreateUsers,
} from '@/lib/utils/permissions';
import toast from 'react-hot-toast';
import { CreateUserWizard } from '@/components/users/CreateUserWizard';
import { EditUserDialog } from '@/components/admin/dialogs/EditUserDialog';
import { ConfirmDialog } from '@/components/admin/dialogs/ConfirmDialog';
import { ResetPasswordDialog } from '@/components/admin/dialogs/ResetPasswordDialog';
import { ManageTagsDialog } from '@/components/admin/dialogs/ManageTagsDialog';
import { RenameUsernameDialog } from '@/components/admin/dialogs/RenameUsernameDialog';

const PAGE_SIZE = 25;

type ActiveFilter = 'all' | 'active' | 'inactive';

export function UsersTab() {
  const viewer = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  // `areas` = active only (pickable filter options); `allAreas` = incl. inactive,
  // used ONLY to resolve location NAMES so a user based at a now-deactivated area
  // still shows their location badge during a branch transition (audit #6).
  const [areas, setAreas] = useState<Area[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  // UI-8: distinct error state so a fetch failure doesn't masquerade as
  // "no users match your filters". Set on catch; cleared on every reload().
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters / search / pagination
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [tagFilter, setTagFilter] = useState<'all' | string>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<ActiveFilter>('all');
  const [page, setPage] = useState(1);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<
    | { kind: 'deactivate' | 'restore'; user: User }
    | null
  >(null);
  // Cascade choice for deactivate/restore — defaults on (remove/restore the
  // whole branch so nobody is orphaned); reset each time a confirm opens.
  const [cascade, setCascade] = useState(true);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [tagsTarget, setTagsTarget] = useState<User | null>(null);
  const [renameTarget, setRenameTarget] = useState<User | null>(null);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    usersApi
      .getAll()
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((e) => {
        setUsers([]);
        setLoadError(e instanceof Error ? e.message : 'Failed to load users');
      })
      .finally(() => setLoading(false));
    bookingsApi
      .getAreas()
      .then((a) => setAreas(a.filter((x) => x.isActive !== false)))
      .catch(() => {});
    bookingsApi
      .getAreasFull({ includeInactive: true })
      .then((a) => setAllAreas(Array.isArray(a) ? a : []))
      .catch(() => {});
  };

  useEffect(() => {
    reload();
  }, []);

  // Reset paging when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, tagFilter, locationFilter, statusFilter]);

  // Self-heal a stale location filter WITHOUT a setState-in-effect: if the
  // filtered-on area was deactivated (dropped from `areas`), derive it back to
  // "all" so the list never shows an unexplained empty result (audit #5). The
  // raw setter stays the source of truth; only the *effective* value is healed.
  const effectiveLocationFilter = useMemo(
    () =>
      locationFilter !== 'all' && !areas.some((a) => a.id === locationFilter)
        ? 'all'
        : locationFilter,
    [locationFilter, areas],
  );

  // Compute the filtered set
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (tagFilter !== 'all' && !(Array.isArray(u.tags) && u.tags.includes(tagFilter))) return false;
      if (effectiveLocationFilter !== 'all' && u.locationId !== effectiveLocationFilter) return false;
      if (statusFilter === 'active' && u.isActive === false) return false;
      if (statusFilter === 'inactive' && u.isActive !== false) return false;
      if (!q) return true;
      const hay = `${u.firstName} ${u.lastName} ${u.username} ${u.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, roleFilter, tagFilter, effectiveLocationFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pagedUsers = useMemo(
    () => filtered.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE),
    [filtered, visiblePage],
  );

  const allTagOptions = useMemo(() => {
    const seen = new Set<string>();
    Object.values(KNOWN_TAGS).forEach((t) => seen.add(t));
    users.forEach((u) => (u.tags ?? []).forEach((t) => seen.add(t)));
    return Array.from(seen).sort();
  }, [users]);

  // Resolve names from the FULL set (incl. inactive) so a deactivated location
  // still labels its users; the filter/picker options stay active-only.
  const areaNameById = useMemo(
    () => new Map(allAreas.map((a) => [a.id, a.name] as const)),
    [allAreas],
  );

  // UI-2: count of currently-active filter Selects, for the mobile
  // "Filters · N" badge.
  const activeFilterCount =
    (roleFilter !== 'all' ? 1 : 0) +
    (tagFilter !== 'all' ? 1 : 0) +
    (effectiveLocationFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  // Count the confirm target's descendants that the cascade would affect:
  // ACTIVE reports for a deactivate, INACTIVE reports for a restore. Walks the
  // loaded user set via parentId, cycle-safe. Drives the "X has N people under
  // them" cascade prompt so a branch is never silently orphaned (Phase C).
  // MUST stay above the early return below — it's a hook (Rules of Hooks).
  const affectedDescendantCount = useMemo(() => {
    if (!confirmTarget || !viewer) return 0;
    const childrenOf = new Map<string, User[]>();
    for (const u of users) {
      if (!u.parentId) continue;
      const arr = childrenOf.get(u.parentId);
      if (arr) arr.push(u);
      else childrenOf.set(u.parentId, [u]);
    }
    const rootBatch = confirmTarget.user.deactivatedCascadeId;
    const seen = new Set<string>([confirmTarget.user.id]);
    const stack = [confirmTarget.user.id];
    let n = 0;
    while (stack.length) {
      const id = stack.pop() as string;
      for (const c of childrenOf.get(id) ?? []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        stack.push(c.id);
        // Only count people the viewer is actually authorized to flip (audit #7),
        // and for a restore only those removed in THIS leader's cascade batch
        // (audit #3) — so the "N people" prompt matches what the server will do.
        if (!canDeactivateUser(viewer, c)) continue;
        const relevant =
          confirmTarget.kind === 'deactivate'
            ? c.isActive !== false
            : c.isActive === false && rootBatch != null && c.deactivatedCascadeId === rootBatch;
        if (relevant) n++;
      }
    }
    return n;
  }, [confirmTarget, users, viewer]);

  if (!viewer) return null;

  // ExportDropdown row mapper — shared CSV format for the User entity.
  const userToRow = (u: User) => [
    u.id,
    u.username,
    u.firstName,
    u.lastName,
    u.email,
    u.phone ?? '',
    ROLE_LABELS[u.role] ?? u.role,
    (u.tags ?? []).join('; '),
    u.isActive === false ? 'inactive' : 'active',
    u.createdAt,
  ];
  const userColumns = [
    'ID',
    'Username',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Role',
    'Tags',
    'Active',
    'Created',
  ];

  const handleDeactivate = async (user: User, withCascade: boolean) => {
    try {
      const res = await usersApi.deactivate(user.id, viewer.id, withCascade);
      const n = res.deactivatedCount ?? 1;
      toast.success(
        withCascade && n > 1 ? `Deactivated ${user.firstName} + ${n - 1} reports` : `Deactivated ${user.firstName}`,
      );
      setConfirmTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Deactivate failed');
    }
  };
  const handleRestore = async (user: User, withCascade: boolean) => {
    try {
      const res = await usersApi.restore(user.id, viewer.id, withCascade);
      const n = res.restoredCount ?? 1;
      toast.success(
        withCascade && n > 1 ? `Restored ${user.firstName} + ${n - 1} reports` : `Restored ${user.firstName}`,
      );
      setConfirmTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-2"
      >
        {/* Search — UI-9: full width on mobile so the filter/refresh/export/add
             buttons wrap to their own row instead of being pushed offscreen. */}
        <div className="relative w-full md:w-auto md:flex-1 md:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, username, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* UI-2: 3 filter selects shown inline at md+, collapsed into a
             bottom Sheet at < md. The same setters drive both surfaces;
             extracted into <UserFilters> below so JSX isn't duplicated. */}
        <div className="hidden md:contents">
          <UserFilters
            roleFilter={roleFilter}
            tagFilter={tagFilter}
            locationFilter={effectiveLocationFilter}
            statusFilter={statusFilter}
            allTagOptions={allTagOptions}
            areas={areas}
            onRoleChange={setRoleFilter}
            onTagChange={setTagFilter}
            onLocationChange={setLocationFilter}
            onStatusChange={setStatusFilter}
          />
        </div>

        {/* Mobile filters trigger */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 touch-manipulation max-xl:h-11"
                  aria-label={`Filters · ${activeFilterCount} active`}
                  aria-haspopup="dialog"
                />
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </SheetTrigger>
            <SheetContent side="bottom" className="space-y-3 pb-6">
              <SheetHeader>
                <SheetTitle>Filter users</SheetTitle>
              </SheetHeader>
              <UserFilters
                roleFilter={roleFilter}
                tagFilter={tagFilter}
                locationFilter={effectiveLocationFilter}
                statusFilter={statusFilter}
                allTagOptions={allTagOptions}
                areas={areas}
                onRoleChange={setRoleFilter}
                onTagChange={setTagFilter}
                onLocationChange={setLocationFilter}
                onStatusChange={setStatusFilter}
                stacked
              />
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setRoleFilter('all');
                    setTagFilter('all');
                    setLocationFilter('all');
                    setStatusFilter('all');
                  }}
                >
                  Clear all filters
                </Button>
              )}
            </SheetContent>
          </Sheet>
        </div>

        {/* Refresh — UI-4: aria-label so screen readers announce it
             alongside the title (M-10 follow-up). */}
        <Button
          variant="outline"
          size="icon"
          onClick={reload}
          title="Refresh"
          aria-label="Refresh users list"
          className="touch-manipulation max-xl:h-11 max-xl:w-11"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Export — shared dual-mode dropdown (current view + all in scope).
            xl:h-8 lifts the size-sm trigger (28px) to the toolbar's uniform
            32px control height at desktop; below xl the 44px floor applies. */}
        <ExportDropdown
          currentRows={filtered}
          allRows={users}
          columns={userColumns}
          toRow={userToRow}
          filenamePrefix="diamond-users"
          allLabel="All users"
          triggerClassName="touch-manipulation max-xl:h-11 xl:h-8"
        />

        {/* Create — ml-auto pins the CTA to the row end so a toolbar wrap
            breaks among the filters instead of orphaning Add User alone
            left-aligned on a second row. */}
        {canCreateUsers(viewer.role) && (
          <Button onClick={() => setCreateOpen(true)} className="ml-auto gap-1.5 touch-manipulation max-xl:h-11">
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </motion.div>

      {/* Result count — below xl it doubles as a top pager (page indicator +
          the SAME prev/next handlers as the bottom pager) so phone users can
          page without first scrolling past a full page of cards. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Showing {pagedUsers.length} of {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          {filtered.length !== users.length && ` · ${users.length} total`}
          {totalPages > 1 && (
            <span className="xl:hidden"> · page {visiblePage}/{totalPages}</span>
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1 xl:hidden">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={visiblePage === 1}
              aria-label="Previous page"
              className="h-11 w-11 touch-manipulation"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={visiblePage === totalPages}
              aria-label="Next page"
              className="h-11 w-11 touch-manipulation"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Table — UI-3: overflow-x-auto wrapper so the 6-column table
           horizontally scrolls inside its card on 390-wide viewports
           instead of forcing page-level horizontal pan.
           MOBILE: dual-render — the table renders from lg (≥1024; the
           overflow-x-auto wrapper absorbs the ~1024px content width); below
           lg the same rows render as <UserCard>s (see card list below). */}
      <div className="hidden lg:block rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent align-middle" />
                  <span className="ml-2">Loading users…</span>
                </TableCell>
              </TableRow>
            ) : loadError ? (
              /* UI-8: distinct error state — fetch failure used to fall
                 through to the "no users match your filters" empty state
                 which was misleading ("did the API drop?"). */
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="text-sm font-medium text-destructive">Failed to load users</div>
                  <div className="mt-1 text-xs text-muted-foreground">{loadError}</div>
                  <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : pagedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="text-sm font-medium">No users match your filters</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Adjust the search or filters above, or click <span className="font-medium">Add User</span> to create a new account.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pagedUsers.map((u) => (
                <UserRowComponent
                  key={u.id}
                  user={u}
                  viewer={viewer}
                  locationName={u.locationId ? areaNameById.get(u.locationId) : undefined}
                  onEdit={() => setEditTarget(u)}
                  onDeactivate={() => { setCascade(true); setConfirmTarget({ kind: 'deactivate', user: u }); }}
                  onRestore={() => { setCascade(true); setConfirmTarget({ kind: 'restore', user: u }); }}
                  onResetPassword={() => setResetTarget(u)}
                  onManageTags={() => setTagsTarget(u)}
                  onRenameUsername={() => setRenameTarget(u)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet card list (<1024). Mirrors the table rows above as
          cards; same handlers, same per-row action menu. One column below sm
          (unchanged on phones), 2-up grid in the sm–lg band so tablet cards
          don't stretch to ~660px. */}
      <div className="lg:hidden grid gap-2 sm:grid-cols-2">
        {loading ? (
          <div className="sm:col-span-2 rounded-lg border border-border bg-card py-8 text-center text-sm text-muted-foreground">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent align-middle" />
            <span className="ml-2">Loading users…</span>
          </div>
        ) : loadError ? (
          <div className="sm:col-span-2 rounded-lg border border-border bg-card py-12 text-center">
            <div className="text-sm font-medium text-destructive">Failed to load users</div>
            <div className="mt-1 text-xs text-muted-foreground">{loadError}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : pagedUsers.length === 0 ? (
          <div className="sm:col-span-2 rounded-lg border border-border bg-card py-12 text-center">
            <div className="text-sm font-medium">No users match your filters</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Adjust the search or filters above, or click <span className="font-medium">Add User</span> to create a new account.
            </div>
          </div>
        ) : (
          pagedUsers.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              viewer={viewer}
              locationName={u.locationId ? areaNameById.get(u.locationId) : undefined}
              onEdit={() => setEditTarget(u)}
              onDeactivate={() => { setCascade(true); setConfirmTarget({ kind: 'deactivate', user: u }); }}
              onRestore={() => { setCascade(true); setConfirmTarget({ kind: 'restore', user: u }); }}
              onResetPassword={() => setResetTarget(u)}
              onManageTags={() => setTagsTarget(u)}
              onRenameUsername={() => setRenameTarget(u)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {visiblePage} of {totalPages}
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
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={visiblePage === totalPages}
              aria-label="Next page"
              className="touch-manipulation max-xl:h-11 max-xl:w-11"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateUserWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        creator={viewer}
        users={users}
        onCreated={() => reload()}
      />

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

      {confirmTarget && (
        <ConfirmDialog
          open
          title={confirmTarget.kind === 'deactivate' ? 'Deactivate user?' : 'Restore user?'}
          description={
            confirmTarget.kind === 'deactivate'
              ? `${confirmTarget.user.firstName} ${confirmTarget.user.lastName} (@${confirmTarget.user.username}) will be unable to log in. Their bookings, contacts, and audit history are preserved.`
              : `Re-enable ${confirmTarget.user.firstName} ${confirmTarget.user.lastName} (@${confirmTarget.user.username}). They'll be able to log in again immediately.`
          }
          confirmLabel={confirmTarget.kind === 'deactivate' ? 'Deactivate' : 'Restore'}
          confirmVariant={confirmTarget.kind === 'deactivate' ? 'destructive' : 'default'}
          onClose={() => setConfirmTarget(null)}
          onConfirm={() =>
            confirmTarget.kind === 'deactivate'
              ? handleDeactivate(confirmTarget.user, affectedDescendantCount > 0 && cascade)
              : handleRestore(confirmTarget.user, affectedDescendantCount > 0 && cascade)
          }
        >
          {/* Cascade choice — only when the target actually has reports that the
              action would otherwise orphan (deactivate) or leave behind (restore). */}
          {affectedDescendantCount > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                {confirmTarget.kind === 'deactivate' ? (
                  <>
                    Also deactivate the <strong>{affectedDescendantCount}</strong>{' '}
                    {affectedDescendantCount === 1 ? 'person' : 'people'} reporting under
                    them. Leaving this unchecked deactivates only{' '}
                    {confirmTarget.user.firstName} and leaves their reports without a leader.
                  </>
                ) : (
                  <>
                    Also restore the <strong>{affectedDescendantCount}</strong>{' '}
                    {affectedDescendantCount === 1 ? 'person' : 'people'} under them who were
                    deactivated with them.
                  </>
                )}
              </span>
            </label>
          )}
        </ConfirmDialog>
      )}

      {resetTarget && (
        <ResetPasswordDialog
          open
          user={resetTarget}
          actorId={viewer.id}
          onClose={() => {
            setResetTarget(null);
            reload();
          }}
        />
      )}

      {tagsTarget && (
        <ManageTagsDialog
          open
          user={tagsTarget}
          actorId={viewer.id}
          allTagOptions={allTagOptions}
          onClose={() => {
            setTagsTarget(null);
            reload();
          }}
        />
      )}

      {renameTarget && (
        <RenameUsernameDialog
          open
          user={renameTarget}
          actorId={viewer.id}
          allUsers={users}
          onClose={() => {
            setRenameTarget(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface UserRowActions {
  onEdit: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
  onResetPassword: () => void;
  onManageTags: () => void;
  onRenameUsername: () => void;
}

// Shared per-user action menu — used by both the desktop table row and the
// mobile/tablet card so the permission gating + menu items stay in one place.
function UserActionsMenu({
  user,
  viewer,
  actions,
  triggerClassName,
}: {
  user: User;
  viewer: User;
  actions: UserRowActions;
  /** Extra classes on the trigger Button (e.g. larger touch target). */
  triggerClassName?: string;
}) {
  const inactive = user.isActive === false;
  const editAllowed = canEditUser(viewer, user);
  const deactivateAllowed = canDeactivateUser(viewer, user);
  // Phase 3 audit Bug 3-A: the admin "Reset password" flow generates a
  // one-time temp password. That makes no sense as a self-service option
  // (you'd have to use it to log yourself out and back in). Hide for self;
  // self password change happens in Settings → Profile.
  const resetAllowed = canResetPassword(viewer, user) && viewer.id !== user.id;
  const tagsAllowed = canManageTags(viewer, user);
  const renameAllowed = canChangeUsername(viewer, user);

  // If the viewer can't do ANY of the per-row actions, hide the menu trigger.
  const anyAction = editAllowed || deactivateAllowed || resetAllowed || tagsAllowed || renameAllowed;
  if (!anyAction) return null;

  return (
    <DropdownMenu>
      {/* Phase 3 audit Bug 3-H: was Pencil; clashed with the inner
          "Edit details" item that ALSO uses Pencil. MoreHorizontal
          is the conventional row-actions trigger. */}
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Row actions" className={triggerClassName} />}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>{user.firstName} {user.lastName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {editAllowed && (
          <DropdownMenuItem onClick={actions.onEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Edit details
          </DropdownMenuItem>
        )}
        {tagsAllowed && (
          <DropdownMenuItem onClick={actions.onManageTags}>
            <TagIcon className="mr-2 h-4 w-4" /> Manage tags
          </DropdownMenuItem>
        )}
        {renameAllowed && (
          <DropdownMenuItem onClick={actions.onRenameUsername}>
            <AtSign className="mr-2 h-4 w-4" /> Rename username
          </DropdownMenuItem>
        )}
        {resetAllowed && (
          <DropdownMenuItem onClick={actions.onResetPassword}>
            <KeyRound className="mr-2 h-4 w-4" /> Reset password
          </DropdownMenuItem>
        )}
        {deactivateAllowed && !inactive && (
          <DropdownMenuItem onClick={actions.onDeactivate} className="text-destructive">
            <Power className="mr-2 h-4 w-4" /> Deactivate
          </DropdownMenuItem>
        )}
        {deactivateAllowed && inactive && (
          <DropdownMenuItem onClick={actions.onRestore}>
            <Power className="mr-2 h-4 w-4" /> Restore
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// One row of the table — extracted so the action menu logic stays readable.
// (≥1024 only; below lg uses <UserCard>.)
// ---------------------------------------------------------------------------
function UserRowComponent({
  user,
  viewer,
  locationName,
  ...actions
}: { user: User; viewer: User; locationName?: string } & UserRowActions) {
  const inactive = user.isActive === false;

  return (
    <TableRow className={inactive ? 'opacity-60' : undefined}>
      <TableCell>
        <div className="font-medium">
          {user.firstName} {user.lastName}
        </div>
        {locationName && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {locationName}
          </div>
        )}
      </TableCell>
      <TableCell>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">@{user.username}</code>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {(user.tags ?? []).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {TAG_LABELS[t] ?? t}
            </Badge>
          ))}
          {(user.tags ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </TableCell>
      <TableCell>
        {inactive ? (
          <Badge variant="outline" className="gap-1 text-[10px] text-orange-600 border-orange-600/40">
            <ShieldAlert className="h-3 w-3" /> Inactive
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[10px] text-green-600 border-green-600/40">
            <ShieldCheck className="h-3 w-3" /> Active
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {/* Table is visible from lg now — keep the 44px tap floor in the
            lg–xl touch band, per the admin-wide convention. */}
        <UserActionsMenu
          user={user}
          viewer={viewer}
          actions={actions}
          triggerClassName="touch-manipulation max-xl:h-11 max-xl:w-11"
        />
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Card variant of a user row — rendered below lg (<1024). Name as the bold
// title, remaining columns as label/value rows, actions in the ⋯ menu with a
// ≥44px touch trigger.
// ---------------------------------------------------------------------------
function UserCard({
  user,
  viewer,
  locationName,
  ...actions
}: { user: User; viewer: User; locationName?: string } & UserRowActions) {
  const inactive = user.isActive === false;
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3',
        inactive && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {user.firstName} {user.lastName}
          </div>
          <code className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
            @{user.username}
          </code>
        </div>
        {/* ≥44px touch target for the actions menu trigger. */}
        <UserActionsMenu
          user={user}
          viewer={viewer}
          actions={actions}
          triggerClassName="h-11 w-11 touch-manipulation"
        />
      </div>

      <dl className="mt-2 space-y-2 text-sm">
        {/* Role + Status are each a single badge — render them side by side
            on ONE row under the name/@username instead of a label/value line
            per field (~165px → ~90px cards). text-xs (not 10px) on the card
            variant for phone readability; the table badges stay 10px. */}
        {/* relative: sr-only is position:absolute — without a positioned
            ancestor it resolves against the initial containing block and
            extends the DOCUMENT's scroll height past the app shell (25
            cards × sr-only dt ≈ 3100px of phantom page scroll below the
            bottom nav). The row being relative contains it. */}
        <div className="relative flex flex-wrap items-center gap-1.5">
          <dt className="sr-only">Role and status</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-xs">
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
            {inactive ? (
              <Badge variant="outline" className="gap-1 text-xs text-orange-600 border-orange-600/40">
                <ShieldAlert className="h-3 w-3" /> Inactive
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-600/40">
                <ShieldCheck className="h-3 w-3" /> Active
              </Badge>
            )}
            {locationName && (
              <Badge variant="outline" className="gap-1 text-xs">
                <MapPin className="h-3 w-3" />
                {locationName}
              </Badge>
            )}
          </dd>
        </div>
        {/* Tags row only when the user HAS tags — no "Tags —" filler row. */}
        {(user.tags ?? []).length > 0 && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Tags</dt>
            <dd className="flex min-w-0 flex-wrap justify-end gap-1">
              {(user.tags ?? []).map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {TAG_LABELS[t] ?? t}
                </Badge>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UI-2: filter Selects extracted so the same setters drive the inline
// desktop layout AND the mobile bottom-Sheet without duplicate JSX.
// ---------------------------------------------------------------------------
function UserFilters({
  roleFilter,
  tagFilter,
  locationFilter,
  statusFilter,
  allTagOptions,
  areas,
  onRoleChange,
  onTagChange,
  onLocationChange,
  onStatusChange,
  stacked = false,
}: {
  roleFilter: 'all' | UserRole;
  tagFilter: 'all' | string;
  locationFilter: 'all' | string;
  statusFilter: ActiveFilter;
  allTagOptions: string[];
  areas: Area[];
  onRoleChange: (v: 'all' | UserRole) => void;
  onTagChange: (v: 'all' | string) => void;
  onLocationChange: (v: 'all' | string) => void;
  onStatusChange: (v: ActiveFilter) => void;
  /** When true, render Selects full-width stacked vertically (mobile sheet). */
  stacked?: boolean;
}) {
  const widthClass = stacked ? 'w-full' : undefined;
  return (
    <>
      {/* Role filter */}
      <Select value={String(roleFilter)} onValueChange={(v) => onRoleChange(v as 'all' | UserRole)}>
        <SelectTrigger className={cn(stacked ? 'w-full' : 'w-[160px]')}>
          <SelectValue>{roleFilter === 'all' ? 'All roles' : ROLE_LABELS[roleFilter as UserRole]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          {[...ROLE_HIERARCHY].reverse().map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Tag filter */}
      <Select value={tagFilter} onValueChange={(v) => onTagChange(v as string)}>
        <SelectTrigger className={cn(stacked ? 'w-full' : 'w-[180px]')}>
          <SelectValue>{tagFilter === 'all' ? 'All tags' : tagLabel(tagFilter)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tags</SelectItem>
          {allTagOptions.map((t) => (
            <SelectItem key={t} value={t}>
              {TAG_LABELS[t] ?? t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Location filter */}
      <Select value={locationFilter} onValueChange={(v) => onLocationChange(v as string)}>
        <SelectTrigger className={cn(stacked ? 'w-full' : 'w-[180px]')}>
          <SelectValue>
            {locationFilter === 'all'
              ? 'All locations'
              : areas.find((a) => a.id === locationFilter)?.name ?? 'All locations'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All locations</SelectItem>
          {areas.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status */}
      <Select value={String(statusFilter)} onValueChange={(v) => onStatusChange(v as ActiveFilter)}>
        <SelectTrigger className={cn(stacked ? 'w-full' : 'w-[140px]')}>
          <SelectValue>
            {statusFilter === 'all' ? 'Active + Inactive' : statusFilter === 'active' ? 'Active only' : 'Inactive only'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Active + Inactive</SelectItem>
          <SelectItem value="active">Active only</SelectItem>
          <SelectItem value="inactive">Inactive only</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
