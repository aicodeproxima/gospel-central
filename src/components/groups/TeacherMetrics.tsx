'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, Award, BookOpen, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeacherMetrics as TMetrics } from '@/lib/types/user';

interface TeacherMetricsProps {
  metrics: TMetrics[];
  users: { id: string; name: string }[];
  /**
   * When set (from the shared tree search bar), scroll that teacher's card to
   * center and pulse a ring so the result is found on THIS tab — the same
   * "snap to the person" behavior the 3D tree and list view already have.
   * Null / a person with no metrics card → no-op (nothing to center).
   */
  highlightId?: string | null;
}

export function TeacherMetricsCards({ metrics, users, highlightId }: TeacherMetricsProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [pulseId, setPulseId] = useState<string | null>(null);

  // Search-to-center for the Metrics tab. externalFocusId arrives via the
  // search bar's requestFocus (none → id), so this re-fires even when the
  // same person is chosen twice. The 120ms delay lets the tab's layout settle.
  useEffect(() => {
    if (!highlightId) return;
    const el = cardRefs.current.get(highlightId);
    if (!el) return; // searched person isn't a teacher with a metrics card
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseId(highlightId);
    }, 120);
    const clear = setTimeout(() => setPulseId(null), 2200);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [highlightId]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Teacher Performance</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {metrics.map((m, i) => {
          const user = users.find((u) => u.id === m.userId);
          const continuedPct = m.totalStudents > 0 ? Math.round((m.continuedStudying / m.totalStudents) * 100) : 0;
          const baptizedPct = m.totalStudents > 0 ? Math.round((m.baptizedSinceStudying / m.totalStudents) * 100) : 0;

          return (
            <motion.div
              key={m.userId}
              ref={(el) => {
                if (el) cardRefs.current.set(m.userId, el);
                else cardRefs.current.delete(m.userId);
              }}
              data-metric-id={m.userId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                'scroll-mt-28 rounded-xl transition-shadow',
                pulseId === m.userId &&
                  'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
            >
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{user?.name || m.userId}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-500/10 p-2">
                      <Users className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{m.totalStudents}</p>
                      <p className="text-[10px] text-muted-foreground">Total Students</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-cyan-500/10 p-2">
                      <GraduationCap className="h-4 w-4 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{m.currentlyStudying}</p>
                      <p className="text-[10px] text-muted-foreground">Currently Studying</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-green-500/10 p-2">
                      <BookOpen className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{m.activeStudents}</p>
                      <p className="text-[10px] text-muted-foreground">Active Now</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-purple-500/10 p-2">
                      <TrendingUp className="h-4 w-4 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{continuedPct}%</p>
                      <p className="text-[10px] text-muted-foreground">Continued</p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="rounded-lg bg-amber-500/10 p-2">
                      <Award className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{baptizedPct}%</p>
                      <p className="text-[10px] text-muted-foreground">Baptized Since Studying</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
