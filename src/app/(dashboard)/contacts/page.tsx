'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
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
  Table2,
  CheckSquare,
  Square,
  ArrowUpDown,
  MoreHorizontal,
  Trash2,
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
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { ContactDetailDialog } from '@/components/groups/ContactDetailDialog';
import { ImportCSVDialog } from '@/components/contacts/ImportCSVDialog';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/lib/stores/auth-store';
import {
  buildManageableScope,
  buildVisibilityScope,
  canDeleteContact,
  canEditContact,
  canExportImport,
  canExportMemberList,
  canViewContact,
} from '@/lib/utils/permissions';
import {
  PIPELINE_STAGE_CONFIG,
  PipelineStage,
  UserRole,
} from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { prefixMatch } from '@/lib/utils/text-match';
import { useCustomEntitiesStore, isBackendManagedId } from '@/lib/stores/custom-entities-store';
import { InfoButton } from '@/components/shared/InfoButton';
import { contactsHelp } from '@/components/shared/pageHelp';
import { exportCSV } from '@/lib/utils/csv';
import { type ContactSortKey } from '@/lib/utils/contact-helpers';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import toast from 'react-hot-toast';

type ViewMode = 'grid' | 'kanban' | 'table';
type SortKey = ContactSortKey;

/** Phase 5 scoped search: which resolved name the prefix matcher runs against. */
type SearchField = 'all' | 'contact' | 'teacher' | 'team_leader' | 'group_leader' | 'branch';
const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  all: 'All fields',
  contact: 'Contact',
  teacher: 'Teacher',
  team_leader: 'Team Leader',
  group_leader: 'Group Leader',
  branch: 'Branch',
};

export default function ContactsPage() {
  const { t, tStage } = useTranslation();
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
  const [loadError, setLoadError] = useState(false);

  const scope = useMemo(
    () => buildVisibilityScope(viewer, users),
    [viewer, users],
  );
  // Decision 10 (2026-07): WRITE gates take the MANAGEABLE scope — a Branch
  // Leader reads all branches but edits/deletes only inside their own.
  const manageScope = useMemo(
    () => buildManageableScope(viewer, users),
    [viewer, users],
  );

  // CONT-4 / Decision 10: per-row WRITE gate (manageable scope, not
  // visibility) — passed into ContactCard / Kanban / dialogs / the ?edit=
  // deep-link so action affordances only appear when the viewer can act on
  // the row. Declared here (before the URL-init effect) so that effect can
  // gate the deep-link on it.
  const canEditAny = useCallback(
    (contact: Contact) =>
      !!viewer && canEditContact(viewer, contact, manageScope.userIds),
    [viewer, manageScope.userIds],
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

  const userById = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  // For resolving custom (localStorage) preaching-partner entities into names.
  const customEntities = useCustomEntitiesStore((s) => s.entities);

  // Phase 5 search index (R4: precompute once per contact, match once per
  // keystroke). Resolves the names the packet's scoped search + leader
  // filters run against: contact / teacher / team leader / group leader /
  // branch. TL/GL come from walking the assigned teacher's (or creator's)
  // parent chain. IMPORTANT SEMANTIC (user, 2026-07-04): a contact's
  // "Branches" are their up-to-3 PREACHING PARTNERS (preachingPartnerIds —
  // the people whose "fruit" the contact will become), NOT the org-tree /
  // church branch. The church (groupName) stays searchable under All fields.
  const searchIndex = useMemo(() => {
    const chainOf = (startId?: string) => {
      let tl = '';
      let gl = '';
      const seen = new Set<string>();
      let cur = startId ? userById.get(startId) : undefined;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const name = `${cur.firstName} ${cur.lastName}`.trim();
        if (!tl && cur.role === UserRole.TEAM_LEADER) tl = name;
        if (!gl && cur.role === UserRole.GROUP_LEADER) gl = name;
        cur = cur.parentId ? userById.get(cur.parentId) : undefined;
      }
      return { tl, gl };
    };
    // Partner ids may be real users, localStorage custom entities, or legacy
    // free-text names — resolve in that order.
    const partnerName = (pid: string | null): string => {
      if (!pid) return '';
      const u = userById.get(pid);
      if (u) return `${u.firstName} ${u.lastName}`.trim();
      const custom = customEntities.find((e) => e.id === pid);
      if (custom) return custom.name;
      return isBackendManagedId(pid) ? '' : pid; // unknown backend id → skip; free text → keep
    };
    const m = new Map<
      string,
      {
        contact: string;
        teacher: string;
        tl: string;
        gl: string;
        branches: string[];
        church: string;
        email: string;
        phone: string;
      }
    >();
    for (const c of visibleContacts) {
      const teacher = c.assignedTeacherId ? userById.get(c.assignedTeacherId) : undefined;
      const chain = chainOf(c.assignedTeacherId ?? c.createdBy);
      m.set(c.id, {
        contact: `${c.firstName} ${c.lastName}`.trim(),
        teacher: teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : '',
        tl: chain.tl,
        gl: chain.gl,
        branches: (c.preachingPartnerIds ?? []).map(partnerName).filter(Boolean),
        church: c.groupName || '',
        email: c.email || '',
        phone: c.phone || '',
      });
    }
    return m;
  }, [visibleContacts, userById, customEntities]);

  // Leader-name filter options — ONLY names that currently have contacts
  // (packet requirement). "Branches" = preaching-partner names (user
  // semantic, 2026-07-04).
  const leaderFilterOptions = useMemo(() => {
    const gl = new Set<string>();
    const tl = new Set<string>();
    const br = new Set<string>();
    for (const f of searchIndex.values()) {
      if (f.gl) gl.add(f.gl);
      if (f.tl) tl.add(f.tl);
      for (const b of f.branches) br.add(b);
    }
    const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { gl: sorted(gl), tl: sorted(tl), branch: sorted(br) };
  }, [searchIndex]);

  // Filters. Phase 5 (packet): search is PREFIX-matching (Outlook-style,
  // matched letters highlighted on cards) and can be scoped to one field;
  // the old booking-type filter is replaced by the 6-status dropdown
  // (Decision 2 — it drives the same stageFilter as the pills); plus
  // leader-name filters listing only names that currently have contacts.
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [glFilter, setGlFilter] = useState('all');
  const [tlFilter, setTlFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  // Views — table (desktop) / grid / kanban. Default: table on >=lg, grid below;
  // remembers the viewer's explicit choice in localStorage. Table is desktop-only,
  // so a saved 'table' on a small screen falls back to grid.
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const saved = (localStorage.getItem('contacts.view') as ViewMode | null) || null;
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    let next: ViewMode = saved || (desktop ? 'table' : 'grid');
    if (next === 'table' && !desktop) next = 'grid';
    setViewMode(next);
  }, []);
  const changeView = useCallback((v: ViewMode) => {
    setViewMode(v);
    try {
      localStorage.setItem('contacts.view', v);
    } catch {
      /* ignore */
    }
  }, []);
  const effectiveView: ViewMode = viewMode === 'table' && !isDesktop ? 'grid' : viewMode;

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  // REV3 #4: ContactDetailDialog is THE edit surface — the pencil / ?edit=
  // open it straight in edit mode; ContactForm is create-only now.
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [viewingContactId, setViewingContactId] = useState<string | null>(null);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);

  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Load data
  const loadContacts = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      contactsApi.getContacts(),
      usersApi.getAll().catch(() => [] as User[]),
    ]).then(([con, usr]) => {
      setContacts(con);
      setUsers(usr);
    }).catch((e) => {
      console.error('Failed to load contacts', e);
      setLoadError(true);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // ── Deep-link query params ─────────────────────────────────────
  // Read once (after data loads so ?id/?edit can resolve): ?stage=, ?type=,
  // ?q=, ?view=, ?id=<open detail>, ?edit=<open form>. Filter state is then
  // written back to the URL (below) so a filtered view is shareable.
  const didInitFromUrl = useRef(false);
  useEffect(() => {
    if (didInitFromUrl.current || contacts.length === 0) return;
    didInitFromUrl.current = true;
    const sp = searchParams;
    const stage = sp.get('stage');
    if (stage && (stage === 'all' || stage in PIPELINE_STAGE_CONFIG)) setStageFilter(stage);
    // Legacy ?type= deep-links: the booking-type filter is gone (Decision 2);
    // accept the param only when it names one of the 6 statuses.
    const type = sp.get('type');
    if (type && type in PIPELINE_STAGE_CONFIG) setStageFilter(type);
    const q = sp.get('q');
    if (q) setSearch(q);
    const view = sp.get('view');
    if (view === 'grid' || view === 'kanban' || view === 'table') setViewMode(view);
    const id = sp.get('id');
    // Only honor ?id= for contacts the viewer may actually SEE.
    if (id && visibleContacts.some((c) => c.id === id)) {
      setDetailMode('view');
      setViewingContactId(id);
    }
    const editId = sp.get('edit');
    if (editId) {
      // SECURITY (Decision 10): the ?edit= deep-link must apply the SAME
      // write gate as every other edit opener — resolve against
      // visibleContacts and require canEditAny, else fall back to the
      // read-only detail dialog (or nothing). Without this a member could
      // open the editable surface for ANY contact via a crafted URL
      // (contact ids are discoverable). Found by the Phase-5 permission
      // refuters. REV3 #4: the editable surface is ContactDetailDialog now.
      const target = visibleContacts.find((c) => c.id === editId);
      if (target && canEditAny(target)) {
        setDetailMode('edit');
        setViewingContactId(target.id);
      } else if (target) {
        setDetailMode('view');
        setViewingContactId(target.id); // view-only fallback
      }
    }
  }, [searchParams, visibleContacts, canEditAny]);

  // Mirror the active filters into the URL (shareable) via history.replaceState
  // — lighter than router.replace (no soft-navigation / re-render) and reliably
  // updates the address bar. view/id/edit are not continuously synced (view is
  // an entry-only deep-link, id/edit are one-shot openers).
  useEffect(() => {
    if (!didInitFromUrl.current) return;
    const params = new URLSearchParams();
    if (stageFilter !== 'all') params.set('stage', stageFilter);
    if (search.trim()) params.set('q', search.trim());
    const qs = params.toString();
    const tmr = setTimeout(() => {
      const url = qs ? `${pathname}?${qs}` : pathname;
      window.history.replaceState(window.history.state, '', url);
    }, 300);
    return () => clearTimeout(tmr);
  }, [stageFilter, search, pathname]);

  // Client-side filtering + sorting (all data is in memory from MSW)
  const filtered = useMemo(() => {
    let result = visibleContacts;
    // REV3 #3 (user spec 2026-07-17): the DEFAULT ('All fields') search is
    // tiered full-label prefix — tier 1 = contact NAME starts with the query
    // (alphabetical), tier 2 = a preaching-PARTNER name starts with it
    // (following, alphabetical). Typing "B" no longer surfaces "Abidan
    // Ben-Gideoni" via the surname or church metadata. Teacher/TL/GL/partner
    // scoping stays available — explicitly, via the field dropdown.
    let tiered = false;
    if (search.trim()) {
      if (searchField === 'all') {
        const q = search.trim().toLowerCase();
        const nameOf = (c: (typeof result)[number]) => searchIndex.get(c.id)?.contact ?? '';
        const tier1 = result
          .filter((c) => nameOf(c).toLowerCase().startsWith(q))
          .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        const tier2 = result
          .filter((c) => {
            if (nameOf(c).toLowerCase().startsWith(q)) return false;
            return (searchIndex.get(c.id)?.branches ?? []).some((b) => b.toLowerCase().startsWith(q));
          })
          .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        result = [...tier1, ...tier2];
        tiered = true; // tier order IS the result order — skip the sort below
      } else {
        // Scoped fields keep the Outlook-style word-start matcher.
        result = result.filter((c) => {
          const f = searchIndex.get(c.id);
          if (!f) return false;
          const fields =
            searchField === 'contact'
              ? [f.contact]
              : searchField === 'teacher'
                ? [f.teacher]
                : searchField === 'team_leader'
                  ? [f.tl]
                  : searchField === 'group_leader'
                    ? [f.gl]
                    : f.branches;
          return fields.some((t) => !!t && prefixMatch(t, search) !== null);
        });
      }
    }
    const effectiveStage = stageFilter.startsWith('all') ? '' : stageFilter;
    if (effectiveStage) result = result.filter((c) => c.pipelineStage === effectiveStage);
    // Leader-name filters (exact name match against the resolved chain).
    if (glFilter !== 'all') result = result.filter((c) => searchIndex.get(c.id)?.gl === glFilter);
    if (tlFilter !== 'all') result = result.filter((c) => searchIndex.get(c.id)?.tl === tlFilter);
    if (branchFilter !== 'all')
      result = result.filter((c) => searchIndex.get(c.id)?.branches.includes(branchFilter));

    // Sort — skipped while a tiered default search is active: the user-specced
    // order there is name-tier (alphabetical) then partner-tier (alphabetical).
    if (!tiered) {
      const stageOrder: Record<string, number> = {
        first_study: 0, unbaptized: 1, potential: 2, baptism_ready: 3, needs_help: 4, baptized: 5,
      };
      result = [...result].sort((a, b) => {
        switch (sortKey) {
          case 'sessions': return b.totalSessions - a.totalSessions;
          case 'stage': return (stageOrder[b.pipelineStage] || 0) - (stageOrder[a.pipelineStage] || 0);
          case 'updated': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          default: return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        }
      });
    }

    return result;
  }, [visibleContacts, search, searchField, stageFilter, glFilter, tlFilter, branchFilter, sortKey, searchIndex]);

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
  // (canEditAny is declared up near the scope memos so the URL-deep-link
  // effect can gate ?edit= on it — see above.)

  const hasFilters =
    search ||
    stageFilter !== 'all' ||
    glFilter !== 'all' ||
    tlFilter !== 'all' ||
    branchFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setSearchField('all');
    setStageFilter('all');
    setGlFilter('all');
    setTlFilter('all');
    setBranchFilter('all');
  };

  // ── Contact actions ────────────────────────────────────────────
  const refetchContacts = useCallback(async () => {
    const fresh = await contactsApi.getContacts();
    setContacts(fresh);
  }, []);

  // REV3 #4: ContactForm is CREATE-only — updates all flow through
  // ContactDetailDialog's onSave (handleDetailSave below).
  const handleFormSubmit = async (data: Partial<Contact>) => {
    await contactsApi.createContact(data);
    toast.success('Contact created');
    await refetchContacts();
  };

  /** Single opener for the detail dialog — every entry point states the mode
   *  explicitly so a previous pencil-edit can never leak into a plain view. */
  const openDetail = useCallback((id: string, mode: 'view' | 'edit' = 'view') => {
    setDetailMode(mode);
    setViewingContactId(id);
  }, []);

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

  // Decision 10: bulk actions apply the per-row WRITE gate — rows outside
  // the viewer's manageable scope are skipped with an explanation instead
  // of silently written (the selection UI may hold mixed rows after a
  // filter change, so the gate lives on the ACTION, not just the checkbox).
  const splitByWritable = useCallback(
    (ids: string[]) => {
      const writable: string[] = [];
      let skipped = 0;
      for (const id of ids) {
        const c = contacts.find((x) => x.id === id);
        if (c && viewer && canDeleteContact(viewer, c, manageScope.userIds)) writable.push(id);
        else skipped++;
      }
      return { writable, skipped };
    },
    [contacts, viewer, manageScope.userIds],
  );

  const handleBulkStageChange = async (newStage: string) => {
    const { writable, skipped } = splitByWritable(Array.from(selectedIds));
    if (writable.length === 0) {
      toast.error('None of the selected contacts are in your manageable scope');
      return;
    }
    await Promise.all(writable.map((id) =>
      contactsApi.updateContact(id, { pipelineStage: newStage as PipelineStage }),
    ));
    toast.success(
      `${writable.length} contacts updated${skipped ? ` — ${skipped} skipped (outside your scope)` : ''}`,
    );
    await refetchContacts();
    setSelectedIds(new Set());
  };

  const handleExportSelected = () => {
    const selected = contacts.filter((c) => selectedIds.has(c.id));
    doExport(selected);
  };

  const handleBulkDelete = async () => {
    const { writable, skipped } = splitByWritable(Array.from(selectedIds));
    if (writable.length === 0) {
      if (selectedIds.size > 0) toast.error('None of the selected contacts are in your manageable scope');
      return;
    }
    if (!window.confirm(
      `Delete ${writable.length} selected contact${writable.length > 1 ? 's' : ''}?` +
      (skipped ? ` (${skipped} outside your scope will be skipped.)` : ''),
    )) return;
    await Promise.all(writable.map((id) => contactsApi.deleteContact(id)));
    // Optimistic local removal — GET /contacts still returns soft-deleted
    // (status:'inactive') rows, so a refetch would resurrect them; mirror the
    // single-delete pattern (handleFormDelete / handleDetailDelete).
    const deleted = new Set(writable);
    setContacts((prev) => prev.filter((c) => !deleted.has(c.id)));
    toast.success(
      `${writable.length} contact${writable.length > 1 ? 's' : ''} deleted${skipped ? ` — ${skipped} skipped (outside your scope)` : ''}`,
    );
    setSelectedIds(new Set());
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
    exportCSV(headers, rows, 'gospel-central-contacts.csv'); // exportCSV already toasts "Exported N rows"
  };

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load contacts.</p>
        <Button variant="outline" size="sm" onClick={loadContacts}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-xl:space-y-3 mx-auto w-full max-w-[1600px]">
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
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4" /> {t('btn.import')}
                  </DropdownMenuItem>
                )}
                {/* Decision 13: EXPORT is GL+ with no exceptions (the
                    per-group canExportImport flag no longer grants it
                    below Group Leader). Import keeps its own gate. */}
                {!!viewer && canExportMemberList(viewer) && (
                  <>
                    <DropdownMenuItem onClick={() => doExport(filtered)}>
                      <Download className="h-4 w-4" /> Export current view
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => doExport(visibleContacts)}>
                      <Download className="h-4 w-4" /> Export all I can see
                    </DropdownMenuItem>
                  </>
                )}
                {((canExportImport(viewer) || (!!viewer && canExportMemberList(viewer)))) && (
                  <DropdownMenuSeparator />
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
            {/* Import keeps the canExportImport gate; EXPORT is Decision 13
                GL+ with no exceptions. */}
            {canExportImport(viewer) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('btn.import')}
              </Button>
            )}
            {!!viewer && canExportMemberList(viewer) && (
              /* EXPORT-1: dual-mode dropdown — current view vs. all-in-scope */
              <Select
                onValueChange={(v) => {
                  if (v === 'current') doExport(filtered);
                  else if (v === 'all') doExport(visibleContacts);
                }}
              >
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {/* Action-style select: always show the action label, never
                      the raw 'current' / 'all' value base-ui would render. */}
                  <SelectValue>{t('btn.export')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Export current view</SelectItem>
                  <SelectItem value="all">Export all I can see</SelectItem>
                </SelectContent>
              </Select>
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
            onClick={() => setFormOpen(true)}
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
          className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2 shadow-sm"
        >
          <span className="text-sm font-medium">{selectedIds.size} {t('contacts.selected')}</span>
          <Select onValueChange={(v) => { if (v) handleBulkStageChange(String(v)); }}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              {/* Action-style select: keep the label fixed instead of showing
                  the raw pipeline-stage key after a bulk change. */}
              <SelectValue>Change stage...</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PIPELINE_STAGE_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!!viewer && canExportMemberList(viewer) && (
            <Button variant="outline" size="sm" onClick={handleExportSelected} className="gap-1 h-8 text-xs">
              <Download className="h-3 w-3" /> {t('btn.export')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={selectAll} className="h-8 text-xs">{t('btn.selectAll')}</Button>
          {/* Delete is available to EVERYONE, but NEVER when all (filtered)
              contacts are selected — a guard against an accidental delete-all.
              Sits immediately left of Clear. */}
          {filtered.length > 0 && !filtered.every((c) => selectedIds.has(c.id)) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDelete}
              className="gap-1 h-8 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> {t('btn.delete')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={deselectAll} className="h-8 text-xs">{t('btn.clearSelected')}</Button>
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

        {/* Scoped-field search dropdown (packet): constrains what the prefix
            matcher runs against. */}
        <Select value={searchField} onValueChange={(v) => setSearchField((v ?? 'all') as SearchField)}>
          <SelectTrigger className="w-[150px] max-md:flex-1">
            <SelectValue>{SEARCH_FIELD_LABELS[searchField]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SEARCH_FIELD_LABELS) as SearchField[]).map((k) => (
              <SelectItem key={k} value={k}>{SEARCH_FIELD_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Decision 2: the old booking-type filter is replaced by the 6
            statuses — this dropdown drives the SAME stageFilter as the pills. */}
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v ?? 'all')}>
          <SelectTrigger className="w-[170px] max-md:flex-1">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue>
              {stageFilter === 'all'
                ? t('contacts.allTypes')
                : PIPELINE_STAGE_CONFIG[stageFilter as keyof typeof PIPELINE_STAGE_CONFIG]?.label ?? stageFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('contacts.allTypes')}</SelectItem>
            {Object.entries(PIPELINE_STAGE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Leader-name filters — only names currently having contacts. */}
        <Select value={glFilter} onValueChange={(v) => setGlFilter(v ?? 'all')}>
          <SelectTrigger className="w-[170px] max-md:flex-1">
            <SelectValue>{glFilter === 'all' ? 'All Group Leaders' : glFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Group Leaders</SelectItem>
            {leaderFilterOptions.gl.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tlFilter} onValueChange={(v) => setTlFilter(v ?? 'all')}>
          <SelectTrigger className="w-[170px] max-md:flex-1">
            <SelectValue>{tlFilter === 'all' ? 'All Team Leaders' : tlFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team Leaders</SelectItem>
            {leaderFilterOptions.tl.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={(v) => setBranchFilter(v ?? 'all')}>
          <SelectTrigger className="w-[160px] max-md:flex-1">
            <SelectValue>{branchFilter === 'all' ? 'All Branches' : branchFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {leaderFilterOptions.branch.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(v) => setSortKey((v ?? 'name') as SortKey)}>
          <SelectTrigger className="w-[160px] max-md:flex-1">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue>{SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? sortKey}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-md border border-border p-0.5">
          {/* icon toggles: Table (desktop-only) / Grid / Kanban. Larger tap area below xl (touch). */}
          <button
            type="button"
            onClick={() => changeView('table')}
            className={cn(
              'hidden lg:inline-flex rounded px-2 py-1 transition-colors touch-manipulation',
              effectiveView === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Table view"
          >
            <Table2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => changeView('grid')}
            className={cn(
              'rounded px-2 py-1 transition-colors touch-manipulation max-xl:px-3 max-xl:py-2.5 max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center',
              effectiveView === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={t('contacts.gridView')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => changeView('kanban')}
            className={cn(
              'rounded px-2 py-1 transition-colors touch-manipulation max-xl:px-3 max-xl:py-2.5 max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center',
              effectiveView === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
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
          <Filter className="h-10 w-10 max-sm:h-8 max-sm:w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('contacts.noMatch')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{t('contacts.tryBroadening')}</p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 gap-1.5">
              <X className="h-3.5 w-3.5" /> {t('btn.clearAll')}
            </Button>
          )}
        </div>
      ) : effectiveView === 'table' ? (
        <ContactsTable
          contacts={filtered}
          users={users}
          query={search}
          searchField={searchField}
          sortKey={sortKey}
          onSort={(k) => setSortKey(k)}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onRowClick={(id) => openDetail(id)}
          onEdit={(c) => openDetail(c.id, 'edit')}
          onDelete={(id) => {
            if (window.confirm('Delete this contact?')) handleFormDelete(id);
          }}
          canEdit={canEditAny}
        />
      ) : effectiveView === 'kanban' ? (
        <KanbanView
          contacts={filtered}
          users={users}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onCardClick={(id) => openDetail(id)}
          onStageChange={async (id, stage) => {
            // Decision 10: kanban drag is a WRITE — same per-row gate as
            // edit/delete (a member could otherwise re-stage anyone's
            // contact by dragging its card).
            const target = contacts.find((c) => c.id === id);
            if (!target || !viewer || !canEditContact(viewer, target, manageScope.userIds)) {
              toast.error('Outside your manageable scope');
              return;
            }
            await contactsApi.updateContact(id, { pipelineStage: stage });
            await refetchContacts();
            toast.success('Stage updated');
          }}
        />
      ) : (
        // mobile: 1-col phone, 2-col tablet (max-xl) — desktop ≥xl unchanged
        <div className="grid gap-3 sm:grid-cols-2 max-xl:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
                  onClick={() => openDetail(contact.id)}
                  selectMode={selectMode}
                  selected={selectedIds.has(contact.id)}
                  onToggleSelect={() => toggleSelect(contact.id)}
                  query={search}
                  searchField={searchField}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Contact detail popup — THE canonical view/edit surface (REV3 #4).
          The pencil and ?edit= open it straight in edit mode. */}
      <ContactDetailDialog
        open={!!viewingContact}
        onClose={() => setViewingContactId(null)}
        initialMode={detailMode}
        contact={viewingContact}
        users={users}
        allContacts={contacts}
        onSave={handleDetailSave}
        onDelete={handleDetailDelete}
        viewer={viewer ?? undefined}
        subtreeUserIds={manageScope.userIds}
        onConvert={handleDetailConvert}
      />

      {/* CREATE-only form dialog (REV3 #4: edits go through the detail
          dialog above; this form's edit path is retired). */}
      <ContactForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        users={users}
        allContacts={contacts}
        // Decision 10: creating is always allowed (owner = self). Assignment
        // is bounded to the viewer's manageable scope ∪ self.
        assignableTeacherIds={!viewer ? undefined : manageScope.kind === 'all' ? undefined : [...manageScope.userIds, viewer.id]}
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
            'min-w-[260px] flex-1 rounded-lg border bg-accent/20 p-3 transition-colors',
            dragOverCol === col.key && 'border-primary bg-primary/10 ring-2 ring-primary',
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
