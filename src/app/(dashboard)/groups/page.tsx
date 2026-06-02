'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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

// 3D scene is heavy — load it lazily so it doesn't bloat the initial bundle.
const Tree3D = dynamic(() => import('@/components/groups/Tree3D').then((m) => m.Tree3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-[75vh] items-center justify-center rounded-lg border border-border bg-card">
      <div className="text-sm text-muted-foreground animate-pulse">Loading 3D view...</div>
    </div>
  ),
});
import { groupsApi } from '@/lib/api/groups';
import { contactsApi } from '@/lib/api/contacts';
import type { OrgNode } from '@/lib/types';
import type { TeacherMetrics } from '@/lib/types/user';
import { ChevronsDownUp, ChevronsUpDown, Box, List, Maximize2, Crosshair, UserPlus } from 'lucide-react';
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
  const themeHasGlobalBg =
    ANIMATED_DARK_THEMES.has(colorTheme) || ANIMATED_LIGHT_THEMES.has(colorTheme);
  const renderPageStarfield = !themeHasGlobalBg;
  const [orgTree, setOrgTree] = useState<OrgNode[]>([]);
  const [metrics, setMetrics] = useState<TeacherMetrics[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Map<string, ContactFilter>>(new Map());
  const [viewMode, setViewMode] = useState<'3d' | 'list'>('3d');
  const [focusRequest, setFocusRequest] = useState<FocusRequest>({ kind: 'none' });
  const [users, setUsers] = useState<User[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const showAddUser = !!currentUser && canCreateUsers(currentUser.role);

  // Mobile de-occlusion: the floating toolbar overlays the top of the 3D
  // canvas. Measure its height and (on <xl) push the canvas BELOW it so tree
  // nodes are never hidden behind it; clear the bottom nav on phones too.
  // Desktop (≥xl) keeps the canvas at inset-0 (unchanged).
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Sane default (~2-row mobile toolbar) so the canvas is offset on the very
  // first paint even before the ResizeObserver measures; refined below.
  const [toolbarH, setToolbarH] = useState(150);
  const [isBelowXl, setIsBelowXl] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const xl = window.matchMedia('(max-width: 1279px)');
    const phone = window.matchMedia('(max-width: 767px)');
    const apply = () => {
      setIsBelowXl(xl.matches);
      setIsPhone(phone.matches);
    };
    apply();
    xl.addEventListener('change', apply);
    phone.addEventListener('change', apply);
    return () => {
      xl.removeEventListener('change', apply);
      phone.removeEventListener('change', apply);
    };
  }, []);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    // Only accept positive measurements — keep the sane default if a layout
    // race ever reports 0 (observed on cold mount).
    const update = () => {
      const h = el.offsetHeight;
      if (h > 0) setToolbarH(h);
    };
    update();
    requestAnimationFrame(update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
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

  // Load preferred view mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('diamond-tree-view');
    if (stored === 'list' || stored === '3d') setViewMode(stored);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('diamond-tree-view', viewMode);
  }, [viewMode]);

  useEffect(() => {
    Promise.all([
      groupsApi.getOrgTree(),
      groupsApi.getTeacherMetrics(),
      contactsApi.getContacts(),
      usersApi.getAll().catch(() => [] as User[]),
    ]).then(([tree, met, con, usr]) => {
      setOrgTree(tree);
      setMetrics(met);
      setContacts(con);
      setUsers(usr);
      // Default: fully collapsed tree, snapped onto the top Developer (Michael).
      setExpandedIds(new Set());
    }).finally(() => {
      setLoading(false);
      // After the scene has had a moment to lay itself out, focus Michael
      // in tight 'node' mode so he's centered in the viewport at startup.
      setTimeout(
        () => setFocusRequest({ kind: 'node', id: 'u-michael' }),
        80,
      );
    });
  }, []);

  const allIds = useMemo(() => collectAllIds(orgTree, contacts), [orgTree, contacts]);
  const allExpanded = expandedIds.size === allIds.length && allIds.length > 0;

  // useCallback so Tree3D's per-id stable-callback maps don't get
  // invalidated on every parent render (audit H-3 follow-up).
  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(allIds));
  }, [allIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
    setFilters(new Map());
    setTimeout(() => setResetSignal((n) => n + 1), 60);
  }, []);

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
    await contactsApi.deleteContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelectedContactId(null);
  }, []);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );

  /** Walk the tree and return the node whose id matches. Memoized so
   *  re-renders caused by unrelated state don't repeat the walk. */
  const nodeIndex = useMemo(() => {
    const m = new Map<string, OrgNode>();
    const walk = (n: OrgNode) => {
      m.set(n.id, n);
      n.children.forEach(walk);
    };
    orgTree.forEach(walk);
    return m;
  }, [orgTree]);

  const handleJumpSelect = (sel: JumpSelection) => {
    if (!nodeIndex.has(sel.id)) return;
    // Replace the expansion set with ONLY the ancestors of the target.
    // Keeps the target itself collapsed so the snap-to-person view isn't
    // fighting a large subtree layout.
    setExpandedIds(new Set(sel.ancestorIds));
    setFilters(new Map());
    requestFocus({ kind: 'node', id: sel.id });
  };

  const handleSearchSelect = (entry: SearchEntry) => {
    // Expand every ancestor so the target is visible in the layout
    setExpandedIds((prev) => {
      const next = new Set(prev);
      entry.ancestorIds.forEach((id) => next.add(id));
      next.add(entry.id);
      return next;
    });
    requestFocus({ kind: 'subtree', id: entry.id });
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
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
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
          <StarfieldBackground fixed={false} />
        </div>
      )}

      {/* Fullscreen tree/list takes the entire viewport */}
      <TabsContent value="tree" className="absolute inset-0 m-0">
        {viewMode === '3d' ? (
          <div
            className="absolute inset-x-0"
            style={{ top: isBelowXl ? toolbarH : 0, bottom: isPhone ? 64 : 0 }}
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
          <div className="h-full w-full overflow-auto px-4 pb-6 pt-40 sm:px-8 sm:pt-24">
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
                />
              ))}
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="metrics" className="absolute inset-0 m-0 overflow-auto px-4 pb-6 pt-40 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-6xl">
          <TeacherMetricsCards metrics={metrics} users={getUserNames(orgTree)} />
        </div>
      </TabsContent>

      <TabsContent value="pipeline" className="absolute inset-0 m-0 overflow-auto px-4 pb-6 pt-40 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-6xl">
          <StudentPipeline contacts={contacts} />
        </div>
      </TabsContent>

      {/* Floating top-right toolbar — search + tabs + buttons hover over the scene.
          z-[45] sits above the 3D HTML card overlays (40) but below dialogs (50). */}
      <div
        ref={toolbarRef}
        className="pointer-events-none absolute left-0 right-0 top-0 z-[45] flex flex-col gap-2 p-3 pl-20 sm:p-4 sm:pl-20"
      >
        {/* Single row: title + search + action buttons all on the same line */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-card/75 px-3 py-1.5 shadow-lg backdrop-blur-md">
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
                onClick={() => setViewMode('3d')}
                aria-label={t('groups.3d')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === '3d' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Box className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t('groups.3d')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-label={t('groups.list')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t('groups.list')}</span>
              </button>
            </div>
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
                title="Fit the whole tree in view without changing expansion"
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
        </div>

        {/* Tabs row — sits just below the main toolbar */}
        <div className="pointer-events-auto flex">
          <TabsList className="rounded-full border border-white/15 bg-card/75 shadow-lg backdrop-blur-md">
            <TabsTrigger value="tree" className="rounded-full">{t('groups.orgTree')}</TabsTrigger>
            <TabsTrigger value="metrics" className="rounded-full">{t('groups.teacherMetrics')}</TabsTrigger>
            <TabsTrigger value="pipeline" className="rounded-full">{t('groups.studentPipeline')}</TabsTrigger>
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
