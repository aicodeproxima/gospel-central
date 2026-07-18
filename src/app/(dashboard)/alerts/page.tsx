'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { Bell, CalendarClock, Ban, UserCog, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/lib/i18n';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { useAlerts } from '@/lib/hooks/use-alerts';
import { alertCategory, isAlertEnabled, resolveAlertTarget, type AlertToggleKey } from '@/lib/utils/alerts';
import { usersApi } from '@/lib/api/users';
import { contactsApi } from '@/lib/api/contacts';
import type { AuditLogEntry } from '@/lib/types';

/**
 * /alerts — the per-user alert feed (2026-07 overhaul Phase 7).
 *
 * Reuses the existing audit log (scoped server-side to `relatedTo=<user.id>`
 * via useAlerts) rather than a new data model. Entries are filtered by the
 * Settings > Alerts toggles, grouped by day (newest first), and mark the
 * feed "seen" once on mount so the Sidebar/MobileNav badge clears.
 */

const CATEGORY_ICON: Record<AlertToggleKey | 'account', typeof Bell> = {
  bookingConfirmations: CalendarClock,
  bookingCancellations: Ban,
  contactStageChanges: UserCog,
  account: Bell,
};

function dayLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d');
}

export default function AlertsPage() {
  const { t } = useTranslation();
  const notifications = usePreferencesStore((s) => s.notifications);
  const { entries, loading, markSeen } = useAlerts();

  // REV3 #16: name lookups for "who the action was on". Degrade to empty maps
  // on failure — rows then fall back to raw ids rather than hiding the line.
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [contactNames, setContactNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    usersApi
      .getAll()
      .then((us) => {
        if (!cancelled) setUserNames(new Map(us.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.username])));
      })
      .catch(() => {});
    contactsApi
      .getContacts()
      .then((cs) => {
        if (!cancelled) setContactNames(new Map(cs.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark seen once entries have actually loaded — avoids marking-seen against
  // an empty pre-fetch array on first paint.
  useEffect(() => {
    if (!loading) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const visible = useMemo(
    () =>
      entries
        .filter((e) => isAlertEnabled(e, notifications))
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [entries, notifications],
  );

  const groups = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const e of visible) {
      const key = dayLabel(e.timestamp);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-3xl space-y-6 pb-12 xl:mx-auto"
    >
      <div>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('alerts.title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('alerts.settingsHint')}{' '}
          <Link href="/settings" className="text-primary underline-offset-2 hover:underline">
            {t('nav.settings')}
          </Link>
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('misc.loading', 'Loading…')}
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('alerts.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, dayEntries]) => (
            <div key={label} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </h2>
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {dayEntries.map((e) => {
                    const category = alertCategory(e);
                    const Icon = CATEGORY_ICON[category];
                    const target = resolveAlertTarget(e, userNames, contactNames);
                    return (
                      <div
                        key={e.id}
                        className="flex min-h-[44px] items-start gap-3 p-3"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm break-words">{e.details}</p>
                          {(target.targetNames.length > 0 || target.reason) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
                              {target.entityLabel && (
                                <span className="rounded bg-muted/60 px-1 py-0.5 text-muted-foreground">
                                  {target.entityLabel}
                                </span>
                              )}
                              {target.targetNames.length > 0 && (
                                <span className="font-medium text-foreground/90">
                                  {target.targetNames.join(', ')}
                                </span>
                              )}
                              {target.reason && (
                                <span className="text-muted-foreground">— “{target.reason}”</span>
                              )}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>{e.userName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{format(parseISO(e.timestamp), 'MMM d, h:mm a')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
