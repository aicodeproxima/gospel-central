'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useReducedMotion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import dynamic from 'next/dynamic';
import { OrgNodeComponent, collectAllIds, type ContactFilter } from '@/components/groups/OrgNode';
import { TeacherMetricsCards } from '@/components/groups/TeacherMetrics';
import { StudentPipeline } from '@/components/groups/StudentPipeline';
import { TreeSearchBar } from '@/components/groups/TreeSearchBar';
import { JumpToTreePicker, type JumpSelection } from '@/components/groups/JumpToTreePicker';
import { ContactDetailDialog } from '@/components/groups/ContactDetailDialog';
import { usersApi } from '@/lib/api/users';
import type { Contact, User } from '@/lib/types';
import type { SearchEntry } from '@/lib/utils/tree-search';
import { toggleExpanded, expandPath } from '@/lib/utils/tree-expansion';

// 3D scene is heavy — load it lazily so it doesn't bloat the initial bundle.
const Tree3D = dynamic(() => import('@/components/groups/Tree3D').then((m) => m.Tree3D), {
  ssr: false,
  loading: () => (
    // Full-bleed + transparent so the page starfield shows through while the
    // 3D bundle loads — no hard-edged card panel flashing under the toolbar.
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-sm text-muted-foreground animate-pulse">Loading 3D view...</div>
    </div>
  ),
});
import { groupsApi } from '@/lib/api/groups';
import { contactsApi } from '@/lib/api/contacts';
import type { OrgNode } from '@/lib/types';
import type { TeacherMetrics } from '@/lib/types/user';
import { ChevronsDownUp, ChevronsUpDown, Box, List, Maximize2, Crosshair, UserPlus, MoreHorizontal } from 'lucide-react';
import { CreateUserWizard } from '@/components/users/CreateUserWizard';
import { canCreateUsers } from '@/lib/utils/permissions';
import { useAuthStore } from '@/lib/stores/auth-store';
import { InfoButton } from '@/components/shared/InfoButton';
import { StarfieldBackground } from '@/components/shared/StarfieldBackground';
import {
  ThemedBackground,
  ANIMATED_DARK_THEMES,
  ANIMATED_LIGHT_THEMES,
} from '@/components/shared/ThemedBackground';
import { groupsHelp } from '@/components/shared/pageHelp';
import { useTranslation } from '@/lib/i18n';
import { usePreferencesStore } from '@/lib/stores/preferences-store';

/**
 * Discriminated union for the focus pipeline. Replaces the old pair of
 * `externalFocusId` + `externalFocusMode` states so we can't accidentally
 * emit one without the other, and so downstream effects have a single
 * value to depend on (audit M-4).
 */
type FocusRequest =
  | { kind: 'none' }
  | { kind: 'node'; id: string }
  | { kind: 'subtree'; id: string };

export default function GroupsPage() {
  const { t } = useTranslation();
  // When any animated theme is active, <ThemeEffects/> already mounts a
  // fullscreen canvas globally — skip the page-local starfield to avoid
  // two stacked canvases competing for the same GPU/CPU time.
  const colorTheme = usePreferencesStore((s) => s.colorTheme);
  const backgroundStyle = usePreferencesStore((s) => s.backgroundStyle);
  const reduceMotion = useReducedMotion();
  const themeHasGlobalBg =
    ANIMATED_DARK_THEMES.has(colorTheme) || ANIMATED_LIGHT_THEMES.has(colorTheme);
  // Skip the page-local starfield whenever a global backdrop already paints
  // behind the tree — an animated colorTheme OR a chosen animated background
  // (which now renders on this page too).
  const renderPageStarfield = !themeHasGlobalBg && backgroundStyle === 'none';
  const [orgTree, setOrgTree] = useState<OrgNode[]>([]);
  const [metrics, setMetrics] = useState<TeacherMetrics[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Map<string, ContactFilter>>(new Map());
  const [viewMode, setViewMode] = useState<'3d' | 'list'>('list');
  const [focusRequest, setFocusRequest] = useState<FocusRequest>({ kind: 'none' });
  const [users, setUsers] = useState<User[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const showAddUser = !!currentUser && canCreateUsers(currentUser.role);
  const groupsDefaultView = usePreferencesStore((s) => s.groupsDefaultView);
  const setGroupsDefaultView = usePreferencesStore((s) => s.setGroupsDefaultView);

  // Edge-to-edge canvas: the floating toolbar sits OVER the 3D canvas on ALL
  // breakpoints (user's edge-to-edge call, 2026-06-10) — the tree renders
  // full-bleed from the top of the viewport and its content can pan behind
  // the toolbar, matching the desktop behavior. The only inset kept is the
  // phone bottom nav (64px): it's opaque bg-card, so extending the canvas
  // behind it would just hide content and skew the auto-fit centering.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsPhone(phone.matches);
    apply();
    phone.addEventListener('change', apply);
    return () => phone.removeEventListener('change', apply);
  }, []);

  // Focus pipeline plumbing: converts the discriminated union into the
  // two props Tree3D expects. Mode is derived; id=null means "no focus".
  const externalFocusId =
    focusRequest.kind === 'none' ? null : focusRequest.id;
  const externalFocusMode: 'node' | 'subtree' =
    focusRequest.kind === 'node' ? 'node' : 'subtree';

  // Helper: re-fire a focus request even if the same target is re-chosen.
  // Setting to 'none' first guarantees Tree3D's effect re-runs when the
  // id arrives on the next tick. 50ms is a deliberate setTimeout instead
  // of rAF (see project-level ban in handoff).
  const requestFocus = (next: FocusRequest) => {
    setFocusRequest({ kind: 'none' });
    setTimeout(() => setFocusRequest(next), 50);
  };

  // Load preferred view mode. ONE-TIME migration: legacy localStorage keys
  // (per-browser) get folded into the per-user `groupsDefaultView` pref and
  // then removed, so the pref becomes the single source of truth going
  // forward. Runs before reading the pref so a legacy value wins on its
  // first mount, exactly once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const legacy = localStorage.getItem('gospel-central-tree-view') ?? localStorage.getItem('diamond-tree-view');
    if (legacy === 'list' || legacy === '3d') {
      setGroupsDefaultView(legacy);
      setViewMode(legacy);
      localStorage.removeItem('gospel-central-tree-view');
      localStorage.removeItem('diamond-tree-view');
    } else {
      setViewMode(groupsDefaultView);
    }
    // Intentionally mount-only: the pref is re-applied explicitly by the
    // toggle's onClick, not by reacting to store changes from elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F: the LIST view has no camera — when a search/jump sets the external focus,
  // scroll that node to center so the user can see where the result landed.
  // (3D handles centering via the camera rig; the ring highlight is passed as
  // highlightId to OrgNodeComponent.) Delay lets the ancestor-expand render.
  useEffect(() => {
    if (viewMode !== 'list' || !externalFocusId) return;
    const id = externalFocusId;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-node-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
    return () => clearTimeout(t);
  }, [externalFocusId, viewMode]);

  const loadTree = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      // Only the org tree is load-critical. Metrics/contacts/users degrade to
      // empty so a transient failure in one of them never blanks the whole tree.
      groupsApi.getOrgTree(),
      groupsApi.getTeacherMetrics().catch(() => [] as TeacherMetrics[]),
      contactsApi.getContacts().catch(() => [] as Contact[]),
      usersApi.getAll().catch(() => [] as User[]),
    ]).then(([tree, met, con, usr]) => {
      setOrgTree(tree);
      setMetrics(met);
      setContacts(con);
      setUsers(usr);
      // Default: fully collapsed tree, snapped onto the ROOT node in tight
      // 'node' mode so it's centered at startup. Derive the root id from the
      // loaded tree — was hardcoded 'u-michael', which silently no-ops against
      // a backend whose root node has a different id.
      setExpandedIds(new Set());
      const rootId = tree[0]?.id;
      if (rootId) {
        setTimeout(() => setFocusRequest({ kind: 'node', id: rootId }), 80);
      }
    }).catch((e) => {
      // The org-tree fetch itself failed → show an error + Retry instead of a
      // silent blank canvas (which reads as "the app is broken").
      console.error('Failed to load the org tree', e);
      setLoadError(true);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const allIds = useMemo(() => collectAllIds(orgTree, contacts), [orgTree, contacts]);
  const allExpanded = expandedIds.size === allIds.length && allIds.length > 0;

  /** Walk the tree and return the node whose id matches. Memoized so
   *  re-renders caused by unrelated state don't repeat the walk. Declared
   *  before the handlers that depend on it (handleToggle) to avoid a TDZ. */
  const nodeIndex = useMemo(() => {
    const m = new Map<string, OrgNode>();
    const walk = (n: OrgNode) => {
      m.set(n.id, n);
      n.children.forEach(walk);
    };
    orgTree.forEach(walk);
    return m;
  }, [orgTree]);

  // useCallback so Tree3D's per-id stable-callback maps don't get
  // invalidated on every parent render (audit H-3 follow-up).
  const handleToggle = useCallback((id: string) => {
    const node = nodeIndex.get(id);
    if (!node) return;
    // Ancestor-closed: collapsing a node prunes its whole subtree, so
    // re-expanding shows only immediate children (no resume memory).
    setExpandedIds((prev) => toggleExpanded(prev, id, node));
  }, [nodeIndex]);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(allIds));
    // 3D only: frame the primary root's subtree — the same readable, dolly-capped
    // path as expanding a single branch (a whole-tree fit strands the camera in
    // the member band / overlaps cards).
    // LIST view must NOT focus (REV3 #15): the root's DOM node is the container
    // of the whole expanded subtree (~18k px tall), so the auto-center effect's
    // scrollIntoView(block:'center') aligns the tree's MIDPOINT with the viewport
    // — "centering" whoever happens to live there. Expanding never moves the
    // list viewport; search/jump keep their centering (node-sized targets).
    if (viewMode === '3d') {
      const rootId = orgTree[0]?.id;
      if (rootId) requestFocus({ kind: 'subtree', id: rootId });
    }
  }, [allIds, orgTree, viewMode]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
    setFilters(new Map());
    // H: snap-center the primary root (like startup) instead of framing the
    // bbox of all roots, which left Michael off to the left of the field.
    const rootId = orgTree[0]?.id;
    if (rootId) {
      setFocusRequest({ kind: 'none' });
      setTimeout(() => setFocusRequest({ kind: 'node', id: rootId }), 60);
    } else {
      setTimeout(() => setResetSignal((n) => n + 1), 60);
    }
  }, [orgTree]);

  const handleFilter = useCallback((nodeId: string, filter: ContactFilter) => {
    setFilters((prev) => {
      const next = new Map(prev);
      if (filter === null) next.delete(nodeId);
      else next.set(nodeId, filter);
      return next;
    });
  }, []);

  // Contact detail dialog: save + delete handlers.
  //
  // M-3: update the list in place instead of refetching every contact.
  // The API (or MSW handler) returns the canonical updated record, so
  // we can splice it into state directly and skip the network round
  // trip. Tree metrics + icons re-compute from the new array via
  // useMemo inside Tree3D.
  const handleContactSave = useCallback(
    async (id: string, data: Partial<Contact>) => {
      const updated = await contactsApi.updateContact(id, data);
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updated } : c)),
      );
    },
    [],
  );

  const handleContactDelete = useCallback(async (id: string) => {
    // Packet bug "org chart not updating on delete": the state update below is
    // correct (Tree3D/OrgNode layouts + metrics recompute from `contacts` via
    // useMemo), but a failed API call used to reject silently — leaving the
    // chart stale with zero feedback. Surface failures; only update on success.
    try {
      await contactsApi.deleteContact(id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete contact',
      );
      throw err;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelectedContactId(null);
    toast.success('Contact deleted');
  }, []);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );

  // Shared "open the contact detail dialog for this id" mechanism — reused by
  // the Metrics and Pipeline tabs (packet: clicking a contact fruit/row on
  // those tabs should open the same ContactDetailDialog the 3D tree/list use).
  // Reuses the exact selectedContactId state the dialog already derives from.
  const openContactById = useCallback((contactId: string) => {
    setSelectedContactId(contactId);
  }, []);

  const handleJumpSelect = (sel: JumpSelection) => {
    if (!nodeIndex.has(sel.id)) return;
    // Expand the target's ancestor path AND the target itself, so the found
    // person lands expanded (their children/contact fruits visible) instead
    // of collapsed.
    setExpandedIds(expandPath(sel.ancestorIds, sel.id));
    setFilters(new Map());
    requestFocus({ kind: 'node', id: sel.id });
  };

  const handleSearchSelect = (entry: SearchEntry) => {
    // Expand the target's ancestor path AND the target itself — Search now
    // matches Jump: ancestors + target expanded, other branches cleared.
    setExpandedIds(expandPath(entry.ancestorIds, entry.id));
    setFilters(new Map());
    // Center tightly on the searched PERSON (was 'subtree', which framed the
    // whole descendant box and left the person off to one side).
    requestFocus({ kind: 'node', id: entry.id });
  };

  const getUserNames = (nodes: OrgNode[]): { id: string; name: string }[] => {
    const result: { id: string; name: string }[] = [];
    const walk = (n: OrgNode) => { result.push({ id: n.id, name: n.name }); n.children.forEach(walk); };
    nodes.forEach(walk);
    return result;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full min-h-64 w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load the organization tree.</p>
        <button
          type="button"
          onClick={loadTree}
          className="touch-manipulation rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <Tabs defaultValue="tree" className="relative h-full w-full">
      {/* Persistent interactive starfield backdrop for the whole Groups
          page. Sits beneath the 3D tree (which is now transparent) and
          behind the tab content. Skipped when the Starfield theme is
          active because the theme already provides a global instance. */}
      {renderPageStarfield && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none bg-[#04071a]">
          {/* prefers-reduced-motion: keep the static dark backdrop but drop the
              animated starfield (consistent with the global suppression in
              Providers — and it spares reduced-motion users the 2nd WebGL
              context on this page). */}
          {!reduceMotion && <StarfieldBackground fixed={false} />}
        </div>
      )}

      {/* Fullscreen tree/list takes the entire viewport */}
      <TabsContent value="tree" className="absolute inset-0 m-0">
        {viewMode === '3d' ? (
          <div
            className="absolute inset-x-0 top-0 transition-[padding-left] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none md:pl-20 md:[[data-dock-open=true]_&]:pl-[284px]"
            style={{ bottom: isPhone ? 64 : 0 }}
          >
            <Tree3D
              roots={orgTree}
              contacts={contacts}
              teacherMetrics={metrics}
              expandedIds={expandedIds}
              filters={filters}
              onToggle={handleToggle}
              onFilter={handleFilter}
              externalFocusId={externalFocusId}
              externalFocusMode={externalFocusMode}
              resetSignal={resetSignal}
              onContactClick={setSelectedContactId}
            />
          </div>
        ) : (
          <div className="h-full w-full overflow-auto px-4 pb-6 pt-28 transition-[padding-left] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none sm:px-8 sm:pt-24 md:pl-20 md:[[data-dock-open=true]_&]:pl-[284px]">
            <div className="mx-auto max-w-5xl space-y-3">
              {orgTree.map((node) => (
                <OrgNodeComponent
                  key={node.id}
                  node={node}
                  expandedIds={expandedIds}
                  onToggle={handleToggle}
                  contacts={contacts}
                  teacherMetrics={metrics}
                  filters={filters}
                  onFilter={handleFilter}
                  highlightId={externalFocusId}
                />
              ))}
            </div>
          </div>
        )}
      </TabsContent>

      {/* pt-28/sm:pt-24 clear the toolbar's single-row height (>=xl, >=1280px).
          Between sm and xl (~640-900px is the packet-reported trouble zone)
          the toolbar's title block is hidden and its action buttons collapse
          into an overflow menu, but the search bar + view toggle + overflow
          button + tabs row can still wrap across more lines than at >=xl,
          growing taller than the fixed pt-24 offset accounts for — the
          "teacher-performance header blocked by toolbar" bug. Bumping the
          mid-width steps here (page-side only; toolbar classes untouched)
          gives the wrapped toolbar room without affecting >=xl (pt-24) or
          the <sm phone layout (pt-28, single column, dropdown menu). */}
      <TabsContent value="metrics" className="absolute inset-0 m-0 overflow-auto px-4 pb-6 pt-28 sm:px-8 sm:pt-24 md:pt-32 lg:pt-28 xl:pt-24 transition-[padding-left] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none md:pl-20 md:[[data-dock-open=true]_&]:pl-[284px]">
        <div className="mx-auto max-w-6xl">
          <TeacherMetricsCards
            metrics={metrics}
            users={getUserNames(orgTree)}
            highlightId={externalFocusId}
            contacts={contacts}
            onContactSelect={openContactById}
          />
        </div>
      </TabsContent>

      <TabsContent value="pipeline" className="absolute inset-0 m-0 overflow-auto px-4 pb-6 pt-28 sm:px-8 sm:pt-24 transition-[padding-left] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none md:pl-20 md:[[data-dock-open=true]_&]:pl-[284px]">
        <div className="mx-auto max-w-6xl">
          <StudentPipeline contacts={contacts} users={users} onContactSelect={openContactById} />
        </div>
      </TabsContent>

      {/* Floating top-right toolbar — search + tabs + buttons hover over the scene.
          z-[45] sits above the 3D HTML card overlays (40) but below dialogs (50).
          data-tree-frame-top: its bottom edge is the TOP frame the camera-fit math
          centers the tree below (measured live, so it tracks the real toolbar height
          at any zoom). */}
      {/* Launcher clearance is md-gated because FloatingNav itself is hidden
          below md (the bottom MobileNav owns phone navigation) — reserving
          launcher space on phones would waste 64px (~23% of a 275px-wide
          viewport) on a control that never renders. At md+ the collapsed
          launcher spans 14 + 52 = 66px (< pl-20's 80px) and the OPEN panel
          reaches 284px — this page has no content margin to push things aside
          (the canvas is deliberately fullscreen), so each floating/scrolling
          surface clears the dock itself via data-dock-open. 284px matches the
          margin every other page animates to. */}
      <div
        data-tree-frame-top
        className="pointer-events-none absolute left-0 right-0 top-0 z-[45] flex flex-col gap-2 p-3 transition-[padding-left] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none sm:p-4 md:pl-20 md:[[data-dock-open=true]_&]:pl-[284px]"
      >
        {/* Single row: title + search + action buttons all on the same line */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="hidden xl:flex items-center gap-2 rounded-full border border-white/15 bg-card/75 px-3 py-1.5 shadow-lg backdrop-blur-md">
            <h1 className="text-sm font-semibold">{t('page.groups.title')}</h1>
            <InfoButton {...groupsHelp} />
          </div>
          <div className="min-w-0 flex-1 max-w-md sm:min-w-[220px]">
            <TreeSearchBar roots={orgTree} onSelect={handleSearchSelect} />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-card/75 p-1 shadow-lg backdrop-blur-md xl:rounded-full">
            <div className="flex items-center rounded-full p-0.5">
              <button
                type="button"
                onClick={() => { setViewMode('list'); setGroupsDefaultView('list'); }}
                aria-label={t('groups.list')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t('groups.list')}</span>
              </button>
              <button
                type="button"
                onClick={() => { setViewMode('3d'); setGroupsDefaultView('3d'); }}
                aria-label={t('groups.3d')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === '3d' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Box className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t('groups.3d')}</span>
              </button>
            </div>
            {/* DESKTOP (>=xl): inline action buttons — unchanged */}
            <div className="hidden xl:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setJumpOpen(true)}
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
              title="Jump to a group or team leader's subtree"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{t('groups.jumpTo')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExpandAll}
              disabled={allExpanded}
              aria-label={t('groups.expand')}
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{t('groups.expand')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCollapseAll}
              disabled={expandedIds.size === 0}
              aria-label={t('groups.collapse')}
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{t('groups.collapse')}</span>
            </Button>
            {viewMode === '3d' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResetSignal((n) => n + 1)}
                className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
                title={t('groups.resetDesc')}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t('groups.reset')}</span>
              </Button>
            )}
            {showAddUser && (
              <Button
                size="sm"
                onClick={() => setAddUserOpen(true)}
                aria-label="Add User"
                className="h-7 gap-1.5 rounded-full px-3 text-xs"
                title="Create a new account below your level"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Add User</span>
              </Button>
            )}
            </div>

            {/* MOBILE (<xl): secondary actions collapse into one overflow menu */}
            <div className="xl:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="sm" className="h-7 rounded-full px-2.5" aria-label="More tree actions" />}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setJumpOpen(true)}>
                    <Crosshair className="h-4 w-4" /> {t('groups.jumpTo')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExpandAll} disabled={allExpanded}>
                    <ChevronsUpDown className="h-4 w-4" /> {t('groups.expand')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCollapseAll} disabled={expandedIds.size === 0}>
                    <ChevronsDownUp className="h-4 w-4" /> {t('groups.collapse')}
                  </DropdownMenuItem>
                  {viewMode === '3d' && (
                    <DropdownMenuItem
                      onClick={() => setResetSignal((n) => n + 1)}
                      title={t('groups.resetDesc')}
                    >
                      <Maximize2 className="h-4 w-4" /> {t('groups.reset')}
                    </DropdownMenuItem>
                  )}
                  {showAddUser && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setAddUserOpen(true)}>
                        <UserPlus className="h-4 w-4" /> Add User
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Tabs row — sits just below the main toolbar */}
        <div className="pointer-events-auto flex max-xl:overflow-x-auto max-xl:[scrollbar-width:none] max-xl:[&::-webkit-scrollbar]:hidden">
          <TabsList className="rounded-full border border-white/15 bg-card/75 shadow-lg backdrop-blur-md">
            <TabsTrigger value="tree" className="rounded-full whitespace-nowrap">
              <span className="xl:hidden">Tree</span>
              <span className="hidden xl:inline">{t('groups.orgTree')}</span>
            </TabsTrigger>
            <TabsTrigger value="metrics" className="rounded-full whitespace-nowrap">
              <span className="xl:hidden">Metrics</span>
              <span className="hidden xl:inline">{t('groups.teacherMetrics')}</span>
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="rounded-full whitespace-nowrap">
              <span className="xl:hidden">Pipeline</span>
              <span className="hidden xl:inline">{t('groups.studentPipeline')}</span>
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      {/* Jump-to-team picker — opens from the "Jump to" toolbar button */}
      <JumpToTreePicker
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        roots={orgTree}
        onSelect={handleJumpSelect}
      />

      {/* Contact detail popup — opens when a contact leaf is clicked in the 3D tree */}
      <ContactDetailDialog
        open={!!selectedContact}
        onClose={() => setSelectedContactId(null)}
        contact={selectedContact}
        users={users}
        allContacts={contacts}
        onSave={handleContactSave}
        onDelete={handleContactDelete}
      />

      {/* Add User wizard — gated to Team Leader and above */}
      {currentUser && showAddUser && (
        <CreateUserWizard
          open={addUserOpen}
          onClose={() => setAddUserOpen(false)}
          creator={currentUser}
          users={users}
          onCreated={() => {
            usersApi.getAll().then(setUsers).catch(() => {});
          }}
        />
      )}
    </Tabs>
  );
}
