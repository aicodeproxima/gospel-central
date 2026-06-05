'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import {
  Calendar,
  Users,
  Contact,
  Settings,
  BookOpen,
  TrendingUp,
  Clock,
  BarChart3,
  MapPin,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/stores/auth-store';
import { canAccessReports } from '@/lib/utils/permissions';
import { InfoButton } from '@/components/shared/InfoButton';
import { dashboardHelp } from '@/components/shared/pageHelp';
import { bookingsApi } from '@/lib/api/bookings';
import { contactsApi } from '@/lib/api/contacts';
import {
  BOOKING_TYPE_CONFIG,
  PIPELINE_STAGE_CONFIG,
  PipelineStage,
} from '@/lib/types';
import type { Booking, Contact as ContactType, Area } from '@/lib/types';
import {
  format,
  parseISO,
  isAfter,
  startOfMonth,
  compareAsc,
} from 'date-fns';
import { cn } from '@/lib/utils';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

type StatKey = 'bookings' | 'contacts' | 'sessions' | 'baptisms';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { t, tStage, tBookingType } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [contacts, setContacts] = useState<ContactType[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [openStat, setOpenStat] = useState<StatKey | null>(null);

  useEffect(() => {
    const now = new Date();
    // Fetch last 30 days + next 30 days (not the entire year)
    bookingsApi
      .getBookings({
        start: new Date(now.getTime() - 30 * 86400000).toISOString(),
        end: new Date(now.getTime() + 30 * 86400000).toISOString(),
      })
      .then(setBookings)
      .catch(() => {});
    contactsApi.getContacts().then(setContacts).catch(() => {});
    bookingsApi.getAreas().then(setAreas).catch(() => {});
  }, []);

  const roomMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of areas) for (const r of a.rooms) m.set(r.id, r.name);
    return m;
  }, [areas]);

  const now = new Date();
  const monthStart = startOfMonth(now);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== 'cancelled' && isAfter(parseISO(b.startTime), now))
        .sort((a, b) => compareAsc(parseISO(a.startTime), parseISO(b.startTime)))
        .slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings],
  );

  const activeContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.pipelineStage !== PipelineStage.BAPTIZED &&
          c.currentlyStudying,
      ),
    [contacts],
  );

  const sessionsThisMonth = useMemo(
    () =>
      bookings
        .filter((b) => b.status !== 'cancelled' && isAfter(parseISO(b.startTime), monthStart))
        .sort((a, b) => compareAsc(parseISO(a.startTime), parseISO(b.startTime))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings],
  );

  const baptisms = useMemo(
    () => contacts.filter((c) => c.pipelineStage === PipelineStage.BAPTIZED),
    [contacts],
  );

  const progressingCount = contacts.filter(
    (c) => c.pipelineStage === PipelineStage.PROGRESSING,
  ).length;

  const stats: Array<{
    key: StatKey;
    label: string;
    value: string;
    icon: typeof Clock;
    trend: string;
  }> = [
    {
      key: 'bookings',
      label: t('dash.upcomingBookings'),
      value: String(upcoming.length),
      icon: Clock,
      trend: `${upcoming.filter((b) => { const d = parseISO(b.startTime); return d.getTime() - now.getTime() < 7 * 86400000; }).length} ${t('dash.thisWeek')}`,
    },
    {
      key: 'contacts',
      label: t('dash.activeContacts'),
      value: String(activeContacts.length),
      icon: Contact,
      trend: `${progressingCount} ${t('dash.progressing')}`,
    },
    {
      key: 'sessions',
      label: t('dash.sessionsThisMonth'),
      value: String(sessionsThisMonth.length),
      icon: BookOpen,
      trend: format(monthStart, 'MMMM yyyy'),
    },
    {
      key: 'baptisms',
      label: t('dash.baptismsThisYear'),
      value: String(baptisms.length),
      icon: TrendingUp,
      trend: baptisms.length > 0 ? t('dash.keepGoing') : t('dash.prayForFruit'),
    },
  ];

  const quickLinks = [
    { href: '/calendar', label: t('nav.calendar'), icon: Calendar, desc: t('dash.bookRooms'), color: 'from-blue-500/20 to-blue-600/10' },
    { href: '/contacts', label: t('nav.contacts'), icon: Contact, desc: t('dash.manageContacts'), color: 'from-green-500/20 to-green-600/10' },
    { href: '/groups', label: t('nav.groups'), icon: Users, desc: t('dash.viewOrgTree'), color: 'from-purple-500/20 to-purple-600/10' },
    { href: '/settings', label: t('nav.settings'), icon: Settings, desc: t('dash.profilePrefs'), color: 'from-orange-500/20 to-orange-600/10' },
  ];
  if (user && canAccessReports(user.role)) {
    quickLinks.push({ href: '/reports', label: t('nav.reports'), icon: BarChart3, desc: t('dash.viewLogs'), color: 'from-red-500/20 to-red-600/10' });
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

      {/* Quick Links */}
      <motion.div variants={item}>
        <h2 className="mb-4 text-xl font-semibold">{t('dash.quickAccess')}</h2>
        {/* 1-col phone (horizontal icon+text needs the full width), 2-col >=sm, 3-col >=lg */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className={`bg-gradient-to-br ${link.color} p-6`}>
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-card p-3 shadow-sm">
                      <link.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{link.label}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{link.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── Detail Dialogs ─────────────────────────────────────────── */}

      {/* Upcoming Bookings */}
      <Dialog open={openStat === 'bookings'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> {t('dash.upcomingBookings')}
            </DialogTitle>
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
                            {format(parseISO(b.startTime), 'EEE, MMM d · h:mm a').toLowerCase()}
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
                <Calendar className="h-3.5 w-3.5" /> View Calendar
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Contacts */}
      <Dialog open={openStat === 'contacts'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Contact className="h-5 w-5 text-primary" /> {t('dash.activeContacts')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Contacts currently being studied with (not yet baptized)
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {activeContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noActive')}</p>
            ) : (
              activeContacts.map((c) => {
                const stage = PIPELINE_STAGE_CONFIG[c.pipelineStage];
                return (
                  <div key={c.id} className="rounded-md border border-border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className={cn('h-2 w-2 rounded-full', stage.color)} />
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
                        {c.totalSessions} sessions
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
                <Users className="h-3.5 w-3.5" /> View All Contacts
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sessions This Month */}
      <Dialog open={openStat === 'sessions'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> {t('dash.sessionsThisMonth')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {sessionsThisMonth.length} bookings since {format(monthStart, 'MMM d')}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {sessionsThisMonth.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noSessions')}</p>
            ) : (
              sessionsThisMonth.map((b) => {
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
                          {format(parseISO(b.startTime), 'EEE, MMM d · h:mm a').toLowerCase()}
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
                <Calendar className="h-3.5 w-3.5" /> View Calendar
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Baptisms This Year */}
      <Dialog open={openStat === 'baptisms'} onOpenChange={(o) => !o && setOpenStat(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" /> {t('dash.baptismsThisYear')}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {baptisms.length} contacts have been baptized
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
                        {c.totalSessions} total sessions
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
                <Users className="h-3.5 w-3.5" /> View Baptized
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setOpenStat(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
