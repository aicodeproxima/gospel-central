'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Sprout, Clock, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import { useTimeFormat } from '@/lib/hooks/useTimeFormat';
import {
  bibleStudiesThisMonth,
  isInLast30Days,
  topTeachersByCompletedStudies,
  topTeachersByFruit,
} from '@/lib/utils/church';
import type { Booking } from '@/lib/types/booking';
import type { Contact } from '@/lib/types/contact';
import type { User } from '@/lib/types/user';
import { cn } from '@/lib/utils';

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

interface LeaderboardsProps {
  bookings: Booking[];
  contacts: Contact[];
  users: User[];
  areaId: string;
  now: Date;
}

type OpenBoard = { kind: 'studies' | 'fruit'; userId: string } | null;

export function Leaderboards({
  bookings,
  contacts,
  users,
  areaId,
  now,
}: LeaderboardsProps) {
  const { t } = useTranslation();
  const { withDate } = useTimeFormat();
  const [open, setOpen] = useState<OpenBoard>(null);

  const topStudies = useMemo(
    () => topTeachersByCompletedStudies(bookings, users, areaId, now),
    [bookings, users, areaId, now],
  );
  // Fruit is app-wide by design (user decision): last 30 days, regardless of
  // the church toggle or any hierarchical grouping.
  const topFruit = useMemo(
    () => topTeachersByFruit(contacts, users, now),
    [contacts, users, now],
  );

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  const openUser = open ? usersById.get(open.userId) : undefined;

  const openStudies = useMemo(() => {
    if (!open || open.kind !== 'studies') return [];
    return bibleStudiesThisMonth(bookings, areaId, now).filter(
      (b) => b.teacherId === open.userId,
    );
  }, [open, bookings, areaId, now]);

  const openFruit = useMemo(() => {
    if (!open || open.kind !== 'fruit') return [];
    // Mirrors topTeachersByFruit's window: rolling last 30 days.
    return contacts.filter((c) => {
      if (c.assignedTeacherId !== open.userId) return false;
      if (c.pipelineStage !== 'baptized') return false;
      return (c.timeline ?? []).some(
        (entry) =>
          entry.action === 'stage_change' &&
          entry.details.includes('Baptized') &&
          isInLast30Days(new Date(entry.date), now),
      );
    });
  }, [open, contacts, now]);

  return (
    <motion.div variants={item}>
      <h2 className="mb-4 text-xl font-semibold">{t('dash.leaderboards')}</h2>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{t('dash.topStudies')}</h3>
            </div>
            {topStudies.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('dash.noStudiesYet')}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {topStudies.map(({ user, count }, i) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: 'studies', userId: user.id })}
                      className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {user.firstName} {user.lastName}
                      </span>
                      <Badge variant="outline" className="shrink-0">{count}</Badge>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sprout className="h-5 w-5 text-green-500" />
              <h3 className="font-semibold">{t('dash.topFruit')}</h3>
            </div>
            {topFruit.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('dash.noFruitYet')}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {topFruit.map(({ user, count }, i) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: 'fruit', userId: user.id })}
                      className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {user.firstName} {user.lastName}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-green-500 border-green-500/40">
                        {count}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drill-down: teacher's completed studies this month */}
      <Dialog open={open?.kind === 'studies'} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              {openUser ? `${openUser.firstName} ${openUser.lastName}` : ''}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{t('dash.topStudies')}</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {openStudies.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noStudiesYet')}</p>
            ) : (
              openStudies.map((b) => (
                <div key={b.id} className="rounded-md border border-border px-3 py-2.5">
                  <div className="text-sm font-semibold truncate">{b.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {withDate(b.startTime, 'EEE, MMM d').toLowerCase()}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(null)}>{t('btn.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drill-down: teacher's fruit (baptized-this-month) contacts */}
      <Dialog open={open?.kind === 'fruit'} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sprout className="h-5 w-5 text-green-500" />
              {openUser ? `${openUser.firstName} ${openUser.lastName}` : ''}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{t('dash.topFruit')}</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {openFruit.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('dash.noFruitYet')}</p>
            ) : (
              openFruit.map((c) => (
                <div key={c.id} className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">
                        {c.firstName} {c.lastName}
                      </div>
                      {c.groupName && (
                        <div className={cn('mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground')}>
                          <MapPin className="h-3 w-3" />
                          {c.groupName}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] text-green-400 border-green-500/40">
                      Baptized
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(null)}>{t('btn.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
