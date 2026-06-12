'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Users,
  Network,
  DoorOpen,
  Ban,
  Contact as ContactIcon,
  Activity,
  Tag,
  Lock,
  FileSpreadsheet,
  Cog,
} from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { canSeeAdminPage, canSeeAdminTab, type AdminTab } from '@/lib/utils/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/types';
import { InfoButton } from '@/components/shared/InfoButton';
import { UsersTab } from '@/components/admin/UsersTab';
import { GroupsTab } from '@/components/admin/GroupsTab';
import { RoomsTab } from '@/components/admin/RoomsTab';
import { BlockedSlotsTab } from '@/components/admin/BlockedSlotsTab';
import { AuditLogTab } from '@/components/admin/AuditLogTab';
import { TagsTab } from '@/components/admin/TagsTab';
import { PermissionsTab } from '@/components/admin/PermissionsTab';
import { ContactsAdminTab } from '@/components/admin/ContactsAdminTab';
import { ExportImportTab } from '@/components/admin/ExportImportTab';

/**
 * Admin page shell.
 *
 * Phase 2 ships the navigation + role-gated visibility only. Each tab body
 * is a placeholder that says which Phase will populate it. The placeholders
 * intentionally render the same on every theme so we can theme-verify the
 * shell once and forget about it.
 *
 * Tab visibility is enforced by canSeeAdminTab() — tabs the current user
 * cannot see do not render in the side-nav at all (defense in depth: server
 * still enforces 403 on data endpoints).
 */

interface TabSpec {
  key: AdminTab;
  label: string;
  description: string;
  icon: typeof Shield;
  /** Explicitly false for tabs that still render PlaceholderTab; drives the
   *  user-facing 'Soon' badge in the side-nav. */
  implemented?: boolean;
  notes?: string;
}

const TAB_SPECS: TabSpec[] = [
  {
    key: 'users',
    label: 'Users',
    description: 'Create, edit, deactivate, and restore user accounts. Reset passwords, change roles, manage tags (Teacher / Co-leaders).',
    icon: Users,
  },
  {
    key: 'groups',
    label: 'Groups',
    description: 'Manage the org tree — branches, groups, teams. Reassign users between nodes.',
    icon: Network,
  },
  {
    key: 'rooms',
    label: 'Rooms & Areas',
    description: 'Create and edit rooms inside any branch\'s area. Deactivate rooms that are no longer in use.',
    icon: DoorOpen,
  },
  {
    key: 'blocked',
    label: 'Blocked Slots',
    description: 'Reserved time windows that no role can book over (Tuesday + Saturday service times by default). Add one-off or recurring blocks.',
    icon: Ban,
  },
  {
    key: 'contacts',
    label: 'Contacts',
    description: 'Branch-scoped contact CRUD with reassignment, conversion to user accounts, and bulk operations.',
    icon: ContactIcon,
  },
  {
    key: 'audit',
    label: 'Audit Log',
    description: 'Immutable record of every state-changing action: user / contact / group / room / report / login / password reset / username change / permission change.',
    icon: Activity,
  },
  {
    key: 'tags',
    label: 'Tags',
    description: 'Manage tag definitions used across users (Teacher, Co-Group Leader, Co-Team Leader, plus any custom tags).',
    icon: Tag,
  },
  {
    key: 'permissions',
    label: 'Permissions',
    description: 'Read-only view of the role × resource × action matrix from docs/PERMISSIONS.md. Devs may export.',
    icon: Lock,
  },
  {
    key: 'export-import',
    label: 'Export / Import',
    description: 'Turn CSV export & import on/off per Branch, Group, or Team. Lower levels inherit unless overridden. Branch Leaders manage their own branch; Overseer / Dev manage all.',
    icon: FileSpreadsheet,
  },
  {
    key: 'system',
    label: 'System Config',
    description: 'Application-level settings: theme defaults, maintenance mode, feature flags. Dev-only.',
    icon: Cog,
    implemented: false,
  },
];

export default function AdminPage() {
  const { user, hydrated } = useAuthStore();
  const router = useRouter();
  const sp = useSearchParams();
  // Don't trust the URL — it's user-controlled. Validate the value against
  // the known tab keys before using it (Phase 2 audit Bug A).
  const KNOWN_TAB_KEYS = TAB_SPECS.map((t) => t.key) as AdminTab[];
  const rawTab = sp.get('tab');
  const initialTab: AdminTab | null =
    rawTab && KNOWN_TAB_KEYS.includes(rawTab as AdminTab) ? (rawTab as AdminTab) : null;
  const [active, setActive] = useState<AdminTab | null>(initialTab);

  // Pill-button refs keyed by tab so the deep-link effect below can center
  // the active pill in the horizontal scroller.
  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Visible tabs = subset of TAB_SPECS that this user is allowed to see.
  const visibleTabs = useMemo(() => {
    if (!user) return [];
    return TAB_SPECS.filter((t) => canSeeAdminTab(user, t.key));
  }, [user]);

  // Default the active tab when (a) nothing is selected or (b) the deep-link
  // requested a tab the user isn't allowed to see (Phase 2 audit Bug A — was
  // rendering a blank pane for `?tab=system` as Branch Leader, etc.).
  useEffect(() => {
    if (!hydrated || visibleTabs.length === 0) return;
    const isAllowed = active !== null && visibleTabs.some((t) => t.key === active);
    if (!isAllowed) setActive(visibleTabs[0].key);
  }, [hydrated, active, visibleTabs]);

  // Center the active pill in the scroller. Covers clicks, `?tab=` deep
  // links, AND the cold-load case: on a hard load of /admin?tab=audit the
  // page renders the hydration spinner first (no pills mounted), so an
  // [active]-only effect would fire once against an empty ref map and never
  // again — `visibleTabs` in the deps re-runs it after hydration mounts the
  // pills. Centering an already-visible pill is harmless.
  useEffect(() => {
    if (!active) return;
    pillRefs.current
      .get(active)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [active, visibleTabs]);

  // Keep the URL ?tab= in sync so deep-links + browser back work.
  useEffect(() => {
    if (!active) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') !== active) {
      url.searchParams.set('tab', active);
      window.history.replaceState(null, '', url.toString());
    }
  }, [active]);

  // Route guard: redirect non-admin-tier users to the dashboard. Belt-and-
  // suspenders alongside the sidebar-link gating; users who type /admin in
  // the URL bar still get bounced.
  useEffect(() => {
    if (!hydrated) return;
    if (!canSeeAdminPage(user)) router.replace('/dashboard');
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="Loading admin"
        />
      </div>
    );
  }

  if (!canSeeAdminPage(user)) {
    // The redirect above will fire; render nothing to avoid a flash of
    // forbidden content.
    return null;
  }

  const activeSpec = visibleTabs.find((t) => t.key === active);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              Admin
              <InfoButton
                title="Admin"
                summary="Manage users, groups, rooms, contacts, audit logs, and system settings — gated by role."
                sections={[
                  {
                    heading: 'Who sees what',
                    body: 'Branch Leaders and above see the Admin link and can access operational tabs. Overseer adds full Permissions write access. Dev adds System Config. Group / Team Leaders manage their people through the /groups org-tree instead.',
                  },
                  {
                    heading: 'Cross-branch + peer-edit',
                    body: 'Per the matrix, leaders can act on records in any branch (cross-branch caretaking) and can edit peers at the same role level — but never above their own level.',
                  },
                  {
                    heading: 'Soft delete only',
                    body: 'Every "deactivate" action sets isActive=false; nothing is hard-deleted from the UI. Restore brings them back.',
                  },
                ]}
              />
            </h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium">{user.firstName} {user.lastName}</span>
              {' · '}
              <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[user.role]}</Badge>
            </p>
          </div>
        </div>
      </div>

      {/* UI-1: Sub-xl horizontally-scrollable pill row.
           Hidden at xl+ where the side-nav takes over. Sticky below the
           Topbar (which is z-30 / ~3.5rem tall) so tabs stay reachable
           while scrolling content. Distinct layoutId from desktop sidebar
           to dodge Framer Motion's shared-layout collision warning.
           flex-nowrap + scrollbar hidden so the row scrolls horizontally and
           never wraps or pushes the page wider than the viewport on <1280.
           C3: the sticky wrapper hosts the chrome (bg/blur/border) plus a
           right-edge fade overlay so users can SEE there are more tabs
           (10 tabs, ~3/4 offscreen at 275px); the inner <nav> stays the
           scroller. position:sticky establishes the containing block, so
           the absolute fade pins to the visible edge, not the scrolled
           content. pointer-events-none keeps the last pill tappable. */}
      <div className="sticky top-[3.5rem] z-20 -mx-4 border-b border-border bg-background/80 backdrop-blur-md xl:hidden">
        <nav
          /* isolate: the pills' internal z-10 (icon/label above the motion
             highlight) must not escape this scroller's stacking context, or
             they'd paint OVER the sibling fade overlay below. */
          className="isolate overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Admin tabs"
        >
          <div className="flex flex-nowrap gap-2 px-4 py-2 snap-x">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  ref={(el) => {
                    if (el) pillRefs.current.set(tab.key, el);
                    else pillRefs.current.delete(tab.key);
                  }}
                  // Scrolling is handled by the [active, visibleTabs] effect
                  // (it centers the pill on click AND on deep-link).
                  onClick={() => setActive(tab.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex min-h-11 shrink-0 snap-start touch-manipulation items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    /* UI-5: drop the static bg-primary/10 here — the
                       motion.div below already paints it, and stacking
                       both produced bg-primary/20 on saturated themes. */
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="admin-active-mobile"
                      className="absolute inset-0 rounded-full bg-primary/10"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                  <span className="relative z-10 whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        {/* Overflow affordance — fades the right edge over the scroller.
            from-background matches the page bg the blurred bar sits on. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
        />
      </div>

      {/* Two-column layout: side-nav (xl+) + tab content. The grid is
           xl+ only; below xl the scrollable pill row above takes over.
           Breakpoint moved md→xl so tablets (768–1279) use the pill row
           too; ≥1280 renders exactly as before. */}
      <div className="xl:grid xl:grid-cols-[220px_1fr] xl:gap-4">
        {/* Side-nav (desktop ≥1280 only) */}
        <aside className="hidden space-y-1 xl:block">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  /* UI-5: drop the static bg-primary/10 here — the
                     motion.div below already paints it, and stacking
                     both produced bg-primary/20 on saturated themes. */
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="admin-active-desktop"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                    transition={{ duration: 0.2 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4 shrink-0" />
                <span className="relative z-10 flex-1">{tab.label}</span>
                {tab.implemented === false && (
                  <Badge
                    variant="outline"
                    className="relative z-10 hidden text-[9px] uppercase tracking-wider xl:inline-flex"
                  >
                    Soon
                  </Badge>
                )}
              </button>
            );
          })}
        </aside>

        {/* Tab content */}
        <main className="min-h-[60vh]">
          <AnimatePresence mode="wait">
            {activeSpec && (
              <motion.div
                key={activeSpec.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {activeSpec.key === 'users' ? (
                  <UsersTab />
                ) : activeSpec.key === 'groups' ? (
                  <GroupsTab />
                ) : activeSpec.key === 'rooms' ? (
                  <RoomsTab />
                ) : activeSpec.key === 'blocked' ? (
                  <BlockedSlotsTab />
                ) : activeSpec.key === 'contacts' ? (
                  <ContactsAdminTab />
                ) : activeSpec.key === 'audit' ? (
                  <AuditLogTab />
                ) : activeSpec.key === 'tags' ? (
                  <TagsTab />
                ) : activeSpec.key === 'permissions' ? (
                  <PermissionsTab />
                ) : activeSpec.key === 'export-import' ? (
                  <ExportImportTab />
                ) : (
                  <PlaceholderTab spec={activeSpec} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function PlaceholderTab({ spec }: { spec: TabSpec }) {
  const Icon = spec.icon;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {spec.label}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{spec.description}</p>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
          <p className="text-sm font-medium">Coming soon</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This section isn&rsquo;t available yet — it arrives in an upcoming
            update.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
