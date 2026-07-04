'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import {
  Calendar,
  Users,
  Contact,
  BookOpen,
  TrendingUp,
  Clock,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { InfoButton } from '@/components/shared/InfoButton';
import { dashboardHelp } from '@/components/shared/pageHelp';
import { bookingsApi } from '@/lib/api/bookings';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import {
  getChurchUserIds,
  baptismsThisMonth,
  contactsStudyingThisMonth,
  bibleStudiesThisMonth,
  upcomingStudies,
} from '@/lib/utils/church';
import { YourGroup } from '@/components/dashboard/YourGroup';
import { Leaderboards } from '@/components/dashboard/Leaderboards';
import {
  BOOKING_TYPE_CONFIG,
  PIPELINE_STAGE_CONFIG,
} from '@/lib/types';
import type { Booking, Contact as ContactType, Area, User } from '@/lib/types';
import { format, startOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTimeFormat } from '@/lib/hooks/useTimeFormat';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

type StatKey = 'contactsStudying' | 'bibleStudies' | 'upcomingStudies' | 'baptisms';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { t, tStage, tBookingType } = useTranslation();
  const { withDate } = useTimeFormat();
  const dashboardChurchId = usePreferencesStore((s) => s.dashboardChurchId);
  const setDashboardChurchId = usePreferencesStore((s) => s.setDashboardChurchId);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [contacts, setContacts] = useState<ContactType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    const now = new Date();
    // Bookings + contacts + users are the dashboard's load-critical data;
    // areas only feed roomMap, so it degrades to empty. A real failure of
    // the load-critical set now surfaces an error + Retry instead of
    // silently rendering blank zero-cards (which read as "the app is
    // broken") — matching the Groups/Contacts pages.
    Promise.all([
      bookingsApi.getBookings({
        start: startOfMonth(now).toISOString(),
        end: new Date(now.getTime() + 30 * 86400000).toISOString(),
      }),
      contactsApi.getContacts(),
      usersApi.getAll(),
      bookingsApi.getAreas().catch(() => [] as Area[]),
    ])
      .then(([bk, con, us, ar]) => {
        setBookings(bk);
        setContacts(con);
        setUsers(us);
        setAreas(ar);
      })
      .catch((e) => {
        console.error('Failed to load the dashboard', e);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Initial church selection: saved dashboardChurchId if it matches a
  // fetched area, else the first fetched area. Runs whenever the fetched
  // area list changes (e.g. after Retry) and no selection has been made yet.
  useEffect(() => {
    if (areas.length === 0) return;
    setSelectedAreaId((current) => {
      if (current && areas.some((a) => a.id === current)) return current;
      if (dashboardChurchId && areas.some((a) => a.id === dashboardChurchId)) {
        return dashboardChurchId;
      }
      return areas[0]?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas]);

  const roomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of areas) for (const r of a.rooms) m.set(r.id, r.name);
    return m;
  }, [areas]);

  const now = new Date();

  const churchUserIds = useMemo(
    () => (selectedAreaId ? getChurchUserIds(users, selectedAreaId) : new Set<string>()),
    [users, selectedAreaId],
  );

  const studyingContacts = useMemo(
    () =>
      selectedAreaId ? contactsStudyingThisMonth(bookings, contacts, selectedAreaId, now) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, contacts, selectedAreaId],
  );

  const studiesThisMonth = useMemo(
    () => (selectedAreaId ? bibleStudiesThisMonth(bookings, selectedAreaId, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, selectedAreaId],
  );

  const upcoming = useMemo(
    () => (selectedAreaId ? upcomingStudies(bookings, selectedAreaId, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, selectedAreaId],
  );

  // Current calendar month only (user decision 2026-07-03: month, not year);
  // church-scoped like the other KPI cards.
  const baptisms = useMemo(
    () => baptismsThisMonth(contacts, churchUserIds, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, churchUserIds],
  );

  const stats: Array<{
    key: StatKey;
    label: string;
    value: string;
    icon: typeof Clock;
    trend: string;
  }> = [
    {
      key: 'contactsStudying',
      label: t('dash.contactsStudyingCard'),
      value: String(studyingContacts.length),
      icon: Contact,
      trend: format(startOfMonth(now), 'MMMM yyyy'),
    },
    {
      key: 'bibleStudies',
      label: t('dash.bibleStudies'),
      value: String(studiesThisMonth.length),
      icon: BookOpen,
      trend: format(startOfMonth(now), 'MMMM yyyy'),
    },
    {
      key: 'upcomingStudies',
      label: t('dash.upcomingStudies'),
      value: String(upcoming.length),
      icon: Clock,
      trend: t('dash.throughSaturday'),
    },
    {
      key: 'baptisms',
      label: t('dash.baptismsThisMonth'),
      value: String(baptisms.length),
      icon: TrendingUp,
      trend: baptisms.length > 0 ? t('dash.keepGoing') : t('dash.prayForFruit'),
    },
  ];

  const isSavedDefault = selectedAreaId !== null && selectedAreaId === dashboardChurchId;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load your dashboard.</p>
        <Button variant="outline" size="sm" onClick={loadDashboard}>Retry</Button>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Welcome */}
      <motion.div variants={item}>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">
            {t('page.dashboard.title')}{user ? `, ${user.firstName}` : ''}
          </h1>
          <InfoButton {...dashboardHelp} />
        </div>
        <p className="mt-1 text-muted-foreground">{t('page.dashboard.subtitle')}</p>
      </motion.div>

      {/* Church toggle */}
      <motion.div variants={item} className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedAreaId ?? undefined}
          onValueChange={(v) => setSelectedAreaId(v as string)}
        >
          <SelectTrigger aria-label={t('dash.selectChurch')}>
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder={t('dash.selectChurch')} />
          </SelectTrigger>
          <SelectContent>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSavedDefault ? (
          <Badge variant="outline" className="text-xs">{t('dash.default')}</Badge>
        ) : (
          selectedAreaId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDashboardChurchId(selectedAreaId)}
            >
              {t('dash.setDefault')}
            </Button>
          )
        )}
      </motion.div>

      {/* Stats — clickable cards that expand into detail dialogs */}
      {/* mobile: 1-col phone, 2-col tablet (max-xl) — desktop ≥xl unchanged */}
      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2 max-xl:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.key}
            className="cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30"
            onClick={() => setOpenStat(stat.key)}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-3xl font-bold">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.trend}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-3">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Your Group */}
      {user && <YourGroup viewer={user} users={users} />}

      {/* ── Detail Dialogs ─────────────────────────────────────────── */}

      {/* Contacts Studying This Month */}
      <Dialog open={openStat === 'contactsStudying'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Contact className="h-5 w-5 text-primary" /> {t('dash.contactsStudyingCard')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {t('dash.contactsStudying')}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {studyingContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noActive')}</p>
            ) : (
              studyingContacts.map((c) => {
                const stage = PIPELINE_STAGE_CONFIG[c.pipelineStage];
                return (
                  <div key={c.id} className="rounded-md border border-border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className={cn('h-2 w-2 rounded-full', stage?.color)} />
                          {tStage(c.pipelineStage)}
                          {c.currentSubject && (
                            <>
                              <span>•</span>
                              <span>Step {c.currentStep}: {c.currentSubject}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">
                        {c.totalSessions} {t('dash.sessions')}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="pt-3 flex justify-between">
            <Link href="/contacts">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> {t('btn.viewAllContacts')}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>{t('btn.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bible Studies This Month */}
      <Dialog open={openStat === 'bibleStudies'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> {t('dash.bibleStudies')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {studiesThisMonth.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noSessions')}</p>
            ) : (
              studiesThisMonth.map((b) => {
                const cfg = BOOKING_TYPE_CONFIG[b.type];
                return (
                  <div
                    key={b.id}
                    className={cn('rounded-md border px-3 py-2 text-sm', cfg?.bgColor)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium truncate block">{b.title}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {withDate(b.startTime, 'EEE, MMM d').toLowerCase()}
                        </span>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px]', cfg?.color)}>
                        {tBookingType(b.type)}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="pt-3 flex justify-between">
            <Link href="/calendar">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> {t('btn.viewCalendar')}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>{t('btn.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upcoming Studies */}
      <Dialog open={openStat === 'upcomingStudies'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> {t('dash.upcomingStudies')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{t('dash.throughSaturday')}</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {upcoming.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noUpcoming')}</p>
            ) : (
              upcoming.map((b) => {
                const cfg = BOOKING_TYPE_CONFIG[b.type];
                return (
                  <div
                    key={b.id}
                    className={cn(
                      'rounded-md border px-3 py-2.5',
                      cfg?.bgColor,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{b.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {withDate(b.startTime, 'EEE, MMM d').toLowerCase()}
                          </span>
                          {roomMap.get(b.roomId) && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {roomMap.get(b.roomId)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px]', cfg?.color)}>
                        {tBookingType(b.type)}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="pt-3 flex justify-between">
            <Link href="/calendar">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> {t('btn.viewCalendar')}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>{t('btn.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Baptisms This Year */}
      <Dialog open={openStat === 'baptisms'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" /> {t('dash.baptismsThisMonth')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {baptisms.length} {t('dash.contactsBaptized')}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {baptisms.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noBaptisms')}</p>
            ) : (
              baptisms.map((c) => (
                <div key={c.id} className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {c.totalSessions} {t('dash.totalSessions')}
                        {c.groupName && <> • {c.groupName}</>}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] text-green-400 border-green-500/40">
                      Baptized
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-3 flex justify-between">
            <Link href="/contacts?stage=baptized">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> {t('btn.viewAllContacts')}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>{t('btn.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leaderboards (studies follow the church toggle; fruit is app-wide,
          last 30 days, regardless of hierarchy — user decision) */}
      {selectedAreaId && (
        <Leaderboards
          bookings={bookings}
          contacts={contacts}
          users={users}
          areaId={selectedAreaId}
          now={now}
        />
      )}
    </motion.div>
  );
}
