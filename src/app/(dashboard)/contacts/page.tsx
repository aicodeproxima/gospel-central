'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  X,
  Download,
  Upload,
  LayoutGrid,
  Columns3,
  CheckSquare,
  Square,
  ArrowUpDown,
  MoreHorizontal,
} from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContactForm } from '@/components/contacts/ContactForm';
import { ContactCard } from '@/components/contacts/ContactCard';
import { ContactDetailDialog } from '@/components/groups/ContactDetailDialog';
import { ImportCSVDialog } from '@/components/contacts/ImportCSVDialog';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/lib/stores/auth-store';
import {
  buildVisibilityScope,
  canCreateContact,
  canEditContact,
  canExportImport,
  canViewContact,
} from '@/lib/utils/permissions';
import {
  BOOKING_TYPE_CONFIG,
  PIPELINE_STAGE_CONFIG,
  PipelineStage,
} from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { InfoButton } from '@/components/shared/InfoButton';
import { contactsHelp } from '@/components/shared/pageHelp';
import { exportCSV } from '@/lib/utils/csv';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import toast from 'react-hot-toast';

type ViewMode = 'grid' | 'kanban';
type SortKey = 'name' | 'sessions' | 'stage' | 'updated';

export default function ContactsPage() {
  const { t, tStage, tBookingType } = useTranslation();
  // CONT-1 / CONT-2: viewer + visibility scope so the contacts list, the
  // header buttons, and the per-card actions are all role-gated. Members
  // see only their own + assigned-to-me; Team / Group leaders see their
  // subtree; Branch Leader+ sees everything.
  const viewer = useAuthStore((s) => s.user);

  const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
    { value: 'name', label: t('contacts.sortName') },
    { value: 'sessions', label: t('contacts.sortSessions') },
    { value: 'stage', label: t('contacts.sortStage') },
    { value: 'updated', label: t('contacts.sortUpdated') },
  ];

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const scope = useMemo(
    () => buildVisibilityScope(viewer, users),
    [viewer, users],
  );

  // CONT-1: scope-filtered list — every downstream useMemo (filtered, stage
  // counts, kanban) runs against this so a Member never even sees Branch
  // Leader contacts in the empty state count.
  const visibleContacts = useMemo(
    () =>
      viewer
        ? contacts.filter((c) => canViewContact(viewer, c, scope.userIds))
        : [],
    [contacts, viewer, scope.userIds],
  );

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  // Views
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [viewingContactId, setViewingContactId] = useState<string | null>(null);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Load data
  useEffect(() => {
    Promise.all([
      contactsApi.getContacts(),
      usersApi.getAll().catch(() => [] as User[]),
    ]).then(([con, usr]) => {
      setContacts(con);
      setUsers(usr);
    }).finally(() => setLoading(false));
  }, []);

  // Auto-open edit form when navigated with ?edit=<contactId>
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && contacts.length > 0) {
      const target = contacts.find((c) => c.id === editId);
      if (target) {
        setEditing(target);
        setFormOpen(true);
      }
      router.replace(pathname);
    }
  }, [searchParams, contacts, router, pathname]);

  // Client-side filtering + sorting (all data is in memory from MSW)
  const filtered = useMemo(() => {
    let result = visibleContacts;
    if (search) {
      const q = search.toLowerCase();
      // CONT-7: predicate now also matches against notes + currentSubject so
      // imported records with metadata in those fields are findable.
      result = result.filter((c) =>
        `${c.firstName} ${c.lastName} ${c.email || ''} ${c.phone || ''} ${c.groupName || ''} ${c.notes || ''} ${c.currentSubject || ''}`
          .toLowerCase()
          .includes(q),
      );
    }
    const effectiveType = typeFilter.startsWith('all') ? '' : typeFilter;
    const effectiveStage = stageFilter.startsWith('all') ? '' : stageFilter;
    if (effectiveType) result = result.filter((c) => c.type === effectiveType);
    if (effectiveStage) result = result.filter((c) => c.pipelineStage === effectiveStage);

    // Sort
    const stageOrder: Record<string, number> = {
      first_study: 0, regular_study: 1, progressing: 2, baptism_ready: 3, baptized: 4,
    };
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'sessions': return b.totalSessions - a.totalSessions;
        case 'stage': return (stageOrder[b.pipelineStage] || 0) - (stageOrder[a.pipelineStage] || 0);
        case 'updated': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default: return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      }
    });

    return result;
  }, [visibleContacts, search, typeFilter, stageFilter, sortKey]);

  // Pipeline stage counts (from in-scope contacts; CONT-1: don't leak
  // out-of-scope counts via the chip totals).
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of Object.keys(PIPELINE_STAGE_CONFIG)) counts[stage] = 0;
    for (const c of visibleContacts) counts[c.pipelineStage] = (counts[c.pipelineStage] || 0) + 1;
    return counts;
  }, [visibleContacts]);

  // CONT-4: per-row edit gate — passed into ContactCard / Kanban / dialogs
  // so action affordances only appear when the viewer can act on the row.
  const canEditAny = useCallback(
    (contact: Contact) =>
      !!viewer && canEditContact(viewer, contact, scope.userIds),
    [viewer, scope.userIds],
  );

  const hasFilters = search || typeFilter !== 'all' || stageFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStageFilter('all');
  };

  // ── Contact actions ────────────────────────────────────────────
  const refetchContacts = useCallback(async () => {
    const fresh = await contactsApi.getContacts();
    setContacts(fresh);
  }, []);

  const handleFormSubmit = async (data: Partial<Contact>) => {
    if (editing) {
      await contactsApi.updateContact(editing.id, data);
      toast.success('Contact updated');
    } else {
      await contactsApi.createContact(data);
      toast.success('Contact created');
    }
    await refetchContacts();
    setEditing(null);
  };

  const handleFormDelete = async (id: string) => {
    await contactsApi.deleteContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
    toast.success('Contact deleted');
  };

  const handleDetailSave = useCallback(async (id: string, data: Partial<Contact>) => {
    await contactsApi.updateContact(id, data);
    toast.success('Contact updated');
    await refetchContacts();
  }, [refetchContacts]);

  const handleDetailDelete = useCallback(async (id: string) => {
    await contactsApi.deleteContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setViewingContactId(null);
    toast.success('Contact deleted');
  }, []);

  // CONT-5: Convert a contact into a User account. Refetches both contacts
  // (status flips to 'converted', convertedToUserId set) and the users
  // list (so the new User shows up immediately in /admin/users).
  const handleDetailConvert = useCallback(
    async (id: string, payload: { role: import('@/lib/types').UserRole; parentId?: string; groupId?: string; actorId?: string }) => {
      try {
        const result = await contactsApi.convertToUser(id, payload);
        toast.success(
          `Converted to user @${result.user.username}`,
        );
        await refetchContacts();
        // Refetch users so the rest of the app sees the new account.
        const fresh = await usersApi.getAll();
        setUsers(Array.isArray(fresh) ? fresh : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Conversion failed');
        throw e;
      }
    },
    [refetchContacts],
  );

  const viewingContact = useMemo(
    () => contacts.find((c) => c.id === viewingContactId) || null,
    [contacts, viewingContactId],
  );

  // ── Bulk actions ───────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedIds(new Set(filtered.map((c) => c.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleBulkStageChange = async (newStage: string) => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) =>
      contactsApi.updateContact(id, { pipelineStage: newStage as PipelineStage }),
    ));
    toast.success(`${ids.length} contacts updated`);
    await refetchContacts();
    setSelectedIds(new Set());
  };

  const handleExportSelected = () => {
    const selected = contacts.filter((c) => selectedIds.has(c.id));
    doExport(selected);
  };

  // ── CSV Export ─────────────────────────────────────────────────
  const doExport = (list: Contact[]) => {
    const headers = ['Name', 'Phone', 'Email', 'Group', 'Stage', 'Currently Studying', 'Current Subject', 'Sessions', 'Last Session', 'Notes'];
    const rows = list.map((c) => [
      `${c.firstName} ${c.lastName}`,
      c.phone || '',
      c.email || '',
      c.groupName || '',
      PIPELINE_STAGE_CONFIG[c.pipelineStage]?.label || c.pipelineStage,
      c.currentlyStudying ? 'Yes' : 'No',
      c.currentSubject || '',
      c.totalSessions,
      c.lastSessionDate ? format(parseISO(c.lastSessionDate), 'yyyy-MM-dd') : '',
      c.notes || '',
    ]);
    exportCSV(headers, rows, 'diamond-contacts.csv');
  };

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-xl:space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{t('page.contacts.title')}</h1>
            <InfoButton {...contactsHelp} />
          </div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
            {hasFilters ? ` ${t('contacts.filtered')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* MOBILE (<xl): secondary actions collapse into one overflow menu so
              the header stops eating the screen. Add Contact stays visible. */}
          <div className="xl:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="gap-1.5" aria-label="More actions" />}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {canExportImport(viewer) && (
                  <>
                    <DropdownMenuItem onClick={() => setImportOpen(true)}>
                      <Upload className="h-4 w-4" /> {t('btn.import')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => doExport(filtered)}>
                      <Download className="h-4 w-4" /> Export current view
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => doExport(visibleContacts)}>
                      <Download className="h-4 w-4" /> Export all I can see
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setSelectMode((v) => !v);
                    if (selectMode) setSelectedIds(new Set());
                  }}
                >
                  {selectMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  {t('btn.select')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* DESKTOP (>=xl): inline buttons — unchanged. */}
          <div className="hidden xl:flex items-center gap-2">
            {/* Import + export are admin-tier only unless canExportImport's
                feature flag is enabled. */}
            {canExportImport(viewer) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportOpen(true)}
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('btn.import')}
                </Button>
                {/* EXPORT-1: dual-mode dropdown — current view vs. all-in-scope */}
                <Select
                  onValueChange={(v) => {
                    if (v === 'current') doExport(filtered);
                    else if (v === 'all') doExport(visibleContacts);
                  }}
                >
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    <SelectValue placeholder={t('btn.export')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Export current view</SelectItem>
                    <SelectItem value="all">Export all I can see</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            <Button
              variant={selectMode ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectMode((v) => !v);
                if (selectMode) setSelectedIds(new Set());
              }}
              className="gap-1.5"
            >
              {selectMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {t('btn.select')}
            </Button>
          </div>

          {/* Add Contact — always visible (primary action). */}
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('btn.addContact')}
          </Button>
        </div>
      </div>

      {/* Pipeline stage summary bar — wraps on desktop, single horizontal
          scroll row on mobile so it stops stealing vertical space. */}
      <div className="flex gap-2 xl:flex-wrap max-xl:flex-nowrap max-xl:overflow-x-auto max-xl:pb-1 max-xl:[scrollbar-width:none] max-xl:[&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setStageFilter('all')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-all shrink-0 whitespace-nowrap',
            stageFilter === 'all'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40',
          )}
        >
          {t('misc.all')} ({visibleContacts.length})
        </button>
        {Object.entries(PIPELINE_STAGE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStageFilter(stageFilter === key ? 'all' : key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap',
              stageFilter === key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40',
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', cfg.color)} />
            {tStage(key)} ({stageCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2"
        >
          <span className="text-sm font-medium">{selectedIds.size} {t('contacts.selected')}</span>
          <Select onValueChange={(v) => { if (v) handleBulkStageChange(String(v)); }}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Change stage..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PIPELINE_STAGE_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canExportImport(viewer) && (
            <Button variant="outline" size="sm" onClick={handleExportSelected} className="gap-1 h-8 text-xs">
              <Download className="h-3 w-3" /> {t('btn.export')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={selectAll} className="h-8 text-xs">{t('btn.selectAll')}</Button>
          <Button variant="ghost" size="sm" onClick={deselectAll} className="h-8 text-xs">{t('btn.clear')}</Button>
        </motion.div>
      )}

      {/* Filter bar */}
      {/* mobile: search spans full width and the filter selects go full-width
          below md so the controls stack cleanly; ≥md (incl. desktop ≥xl)
          keeps the inline fixed-width row unchanged. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm max-md:w-full max-md:max-w-none max-md:flex-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 pr-9"
            placeholder={t('contacts.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="w-[170px] max-md:flex-1">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('contacts.allTypes')}</SelectItem>
            {Object.entries(BOOKING_TYPE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(v) => setSortKey((v ?? 'name') as SortKey)}>
          <SelectTrigger className="w-[160px] max-md:flex-1">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-md border border-border p-0.5">
          {/* icon toggles: larger tap area below xl (touch), desktop ≥xl unchanged */}
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'rounded px-2 py-1 transition-colors touch-manipulation max-xl:px-3 max-xl:py-2.5',
              viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={t('contacts.gridView')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={cn(
              'rounded px-2 py-1 transition-colors touch-manipulation max-xl:px-3 max-xl:py-2.5',
              viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={t('contacts.kanbanView')}
          >
            <Columns3 className="h-4 w-4" />
          </button>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-xs">
            <X className="h-3.5 w-3.5" /> {t('btn.clear')}
          </Button>
        )}
      </div>

      {/* View area */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Filter className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('contacts.noMatch')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{t('contacts.tryBroadening')}</p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 gap-1.5">
              <X className="h-3.5 w-3.5" /> {t('btn.clearAll')}
            </Button>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView
          contacts={filtered}
          users={users}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onCardClick={setViewingContactId}
          onStageChange={async (id, stage) => {
            await contactsApi.updateContact(id, { pipelineStage: stage });
            await refetchContacts();
            toast.success('Stage updated');
          }}
        />
      ) : (
        // mobile: 1-col phone, 2-col tablet (max-xl) — desktop ≥xl unchanged
        <div className="grid gap-3 sm:grid-cols-2 max-xl:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((contact) => (
              <motion.div
                key={contact.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <ContactCard
                  contact={contact}
                  users={users}
                  onClick={() => setViewingContactId(contact.id)}
                  selectMode={selectMode}
                  selected={selectedIds.has(contact.id)}
                  onToggleSelect={() => toggleSelect(contact.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Contact detail popup (view-first, then edit, then optional convert) */}
      <ContactDetailDialog
        open={!!viewingContact}
        onClose={() => setViewingContactId(null)}
        contact={viewingContact}
        users={users}
        allContacts={contacts}
        onSave={handleDetailSave}
        onDelete={handleDetailDelete}
        viewer={viewer ?? undefined}
        subtreeUserIds={scope.userIds}
        onConvert={handleDetailConvert}
      />

      {/* Create/Edit form dialog */}
      <ContactForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleFormSubmit}
        onDelete={handleFormDelete}
        contact={editing}
        users={users}
        allContacts={contacts}
      />

      {/* Import CSV dialog */}
      <ImportCSVDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={refetchContacts}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban View (inline — will be extracted to its own file in Phase 3)
// ---------------------------------------------------------------------------
function KanbanView({
  contacts,
  users,
  selectMode,
  selectedIds,
  onToggleSelect,
  onCardClick,
  onStageChange,
}: {
  contacts: Contact[];
  users: User[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCardClick: (id: string) => void;
  onStageChange: (id: string, stage: PipelineStage) => Promise<void>;
}) {
  const { t, tStage } = useTranslation();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const columns = Object.entries(PIPELINE_STAGE_CONFIG).map(([key, cfg]) => ({
    key: key as PipelineStage,
    ...cfg,
    contacts: contacts.filter((c) => c.pipelineStage === key),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div
          key={col.key}
          className={cn(
            'min-w-[220px] flex-1 rounded-lg border bg-accent/20 p-3 transition-colors',
            dragOverCol === col.key && 'border-primary bg-primary/10',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverCol(col.key);
          }}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverCol(null);
            const contactId = e.dataTransfer.getData('contactId');
            if (contactId) {
              onStageChange(contactId, col.key);
            }
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', col.color)} />
              <span className="text-xs font-semibold">{tStage(col.key)}</span>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {col.contacts.length}
            </Badge>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {col.contacts.map((contact) => (
              <div
                key={contact.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('contactId', contact.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <ContactCard
                  contact={contact}
                  users={users}
                  onClick={() => onCardClick(contact.id)}
                  compact
                  selectMode={selectMode}
                  selected={selectedIds.has(contact.id)}
                  onToggleSelect={() => onToggleSelect(contact.id)}
                />
              </div>
            ))}
            {col.contacts.length === 0 && (
              <p className="text-center text-[10px] text-muted-foreground/50 py-4">
                {t('contacts.dropHere')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
