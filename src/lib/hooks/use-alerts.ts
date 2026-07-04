'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';
import { groupsApi } from '@/lib/api/groups';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import type { AuditLogEntry } from '@/lib/types';
import { unseenCount, newestTimestamp } from '@/lib/utils/alerts';

/**
 * useAlerts — the per-user alert feed + nav badge count (2026-07 overhaul
 * Phase 7). Wraps the existing audit log (`relatedUserIds`-scoped) with the
 * Settings > Alerts toggles + the "last seen" watermark, so the Alerts page
 * and the Sidebar/MobileNav badge share one source of truth.
 *
 * Resilient by design: no user (SSR / logged out) -> empty feed, no throw.
 * Fetch errors are swallowed to an empty list — this is a convenience feed,
 * not a page that should ever hard-fail the shell.
 */
export function useAlerts() {
  const user = useAuthStore((s) => s.user);
  // Refetch on every client navigation: the dashboard shell (and thus this
  // hook) does NOT remount across route changes, so without a nav dep the
  // badge would go stale until a full reload. A user's actions are almost
  // always followed by a navigation, so this keeps the badge live cheaply
  // (the mock fetch is in-page) without a polling timer.
  const pathname = usePathname();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const alertsLastSeenAt = usePreferencesStore((s) => s.alertsLastSeenAt);
  const notifications = usePreferencesStore((s) => s.notifications);
  const setAlertsLastSeen = usePreferencesStore((s) => s.setAlertsLastSeen);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    groupsApi
      .getAuditLog({ relatedTo: user.id, limit: 200 })
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  const unseen = unseenCount(entries, alertsLastSeenAt, notifications);

  const markSeen = () => {
    const t = newestTimestamp(entries);
    if (t) setAlertsLastSeen(t);
  };

  return { entries, loading, unseen, markSeen };
}
