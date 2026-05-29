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
import {
  ROLE_HIERARCHY,
  ROLE_LABELS,
  TAG_LABELS,
  KNOWN_TAGS,
  UserRole,
  type User,
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
  const [loading, setLoading] = useState(true);
  // UI-8: distinct error state so a fetch failure doesn't masquerade as
  // "no users match your filters". Set on catch; cleared on every reload().
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters / search / pagination
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [tagFilter, setTagFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<ActiveFilter>('all');
  const [page, setPage] = useState(1);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<
    | { kind: 'deactivate' | 'restore'; user: User }
    | null
  >(null);
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
  };

  useEffect(() => {
    reload();
  }, []);

  // Reset paging when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, tagFilter, statusFilter]);

  // Compute the filtered set
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (tagFilter !== 'all' && !(Array.isArray(u.tags) && u.tags.includes(tagFilter))) return false;
      if (statusFilter === 'active' && u.isActive === false) return false;
      if (statusFilter === 'inactive' && u.isActive !== false) return false;
      if (!q) return true;
      const hay = `${u.firstName} ${u.lastName} ${u.username} ${u.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, roleFilter, tagFilter, statusFilter]);

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

  // UI-2: count of currently-active filter Selects, for the mobile
  // "Filters · N" badge.
  const activeFilterCount =
    (roleFilter !== 'all' ? 1 : 0) +
    (tagFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

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

  const handleDeactivate = async (user: User) => {
    try {
      await usersApi.deactivate(user.id, viewer.id);
      toast.success(`Deactivated ${user.firstName}`);
      setConfirmTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Deactivate failed');
    }
  };
  const handleRestore = async (user: User) => {
    try {
      await usersApi.restore(user.id, viewer.id);
      toast.success(`Restored ${user.firstName}`);
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
            statusFilter={statusFilter}
            allTagOptions={allTagOptions}
            onRoleChange={setRoleFilter}
            onTagChange={setTagFilter}
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
                  className="gap-1.5"
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
                statusFilter={statusFilter}
                allTagOptions={allTagOptions}
                onRoleChange={setRoleFilter}
                onTagChange={setTagFilter}
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
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Export — shared dual-mode dropdown (current view + all in scope). */}
        <ExportDropdown
          currentRows={filtered}
          allRows={users}
          columns={userColumns}
          toRow={userToRow}
          filenamePrefix="diamond-users"
          allLabel="All users"
        />

        {/* Create */}
        {canCreateUsers(viewer.role) && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </motion.div>

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        Showing {pagedUsers.length} of {filtered.length} match{filtered.length === 1 ? '' : 'es'}
        {filtered.length !== users.length && ` · ${users.length} total`}
      </p>

      {/* Table — UI-3: overflow-x-auto wrapper so the 6-column table
           horizontally scrolls inside its card on 390-wide viewports
           instead of forcing page-level horizontal pan. */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
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
                  onEdit={() => setEditTarget(u)}
                  onDeactivate={() => setConfirmTarget({ kind: 'deactivate', user: u })}
                  onRestore={() => setConfirmTarget({ kind: 'restore', user: u })}
                  onResetPassword={() => setResetTarget(u)}
                  onManageTags={() => setTagsTarget(u)}
                  onRenameUsername={() => setRenameTarget(u)}
                />
              ))
            )}
          </TableBody>
        </Table>
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
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={visiblePage === totalPages}
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
              ? handleDeactivate(confirmTarget.user)
              : handleRestore(confirmTarget.user)
          }
        />
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

// ---------------------------------------------------------------------------
// One row of the table — extracted so the action menu logic stays readable.
// ---------------------------------------------------------------------------
function UserRowComponent({
  user,
  viewer,
  onEdit,
  onDeactivate,
  onRestore,
  onResetPassword,
  onManageTags,
  onRenameUsername,
}: {
  user: User;
  viewer: User;
  onEdit: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
  onResetPassword: () => void;
  onManageTags: () => void;
  onRenameUsername: () => void;
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

  return (
    <TableRow className={inactive ? 'opacity-60' : undefined}>
      <TableCell>
        <div className="font-medium">
          {user.firstName} {user.lastName}
        </div>
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
        {anyAction && (
          <DropdownMenu>
            {/* Phase 3 audit Bug 3-H: was Pencil; clashed with the inner
                "Edit details" item that ALSO uses Pencil. MoreHorizontal
                is the conventional row-actions trigger. */}
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Row actions" />}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>{user.firstName} {user.lastName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {editAllowed && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit details
                </DropdownMenuItem>
              )}
              {tagsAllowed && (
                <DropdownMenuItem onClick={onManageTags}>
                  <TagIcon className="mr-2 h-4 w-4" /> Manage tags
                </DropdownMenuItem>
              )}
              {renameAllowed && (
                <DropdownMenuItem onClick={onRenameUsername}>
                  <AtSign className="mr-2 h-4 w-4" /> Rename username
                </DropdownMenuItem>
              )}
              {resetAllowed && (
                <DropdownMenuItem onClick={onResetPassword}>
                  <KeyRound className="mr-2 h-4 w-4" /> Reset password
                </DropdownMenuItem>
              )}
              {deactivateAllowed && !inactive && (
                <DropdownMenuItem onClick={onDeactivate} className="text-destructive">
                  <Power className="mr-2 h-4 w-4" /> Deactivate
                </DropdownMenuItem>
              )}
              {deactivateAllowed && inactive && (
                <DropdownMenuItem onClick={onRestore}>
                  <Power className="mr-2 h-4 w-4" /> Restore
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// UI-2: filter Selects extracted so the same setters drive the inline
// desktop layout AND the mobile bottom-Sheet without duplicate JSX.
// ---------------------------------------------------------------------------
function UserFilters({
  roleFilter,
  tagFilter,
  statusFilter,
  allTagOptions,
  onRoleChange,
  onTagChange,
  onStatusChange,
  stacked = false,
}: {
  roleFilter: 'all' | UserRole;
  tagFilter: 'all' | string;
  statusFilter: ActiveFilter;
  allTagOptions: string[];
  onRoleChange: (v: 'all' | UserRole) => void;
  onTagChange: (v: 'all' | string) => void;
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
