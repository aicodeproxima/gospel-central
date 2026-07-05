'use client';

import { useEffect, useState } from 'react';
import { Loader2, GraduationCap, Users, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { groupsApi } from '@/lib/api/groups';
import { usersApi } from '@/lib/api/users';
import { contactsApi } from '@/lib/api/contacts';
import { bookingsApi } from '@/lib/api/bookings';
import {
  computeTeacherPerformance,
  computeMemberPerformance,
  type TeacherPerformance,
  type MemberPerformance,
} from '@/lib/utils/performance-metrics';
import { subDays } from 'date-fns';

/** How far back to pull bookings for the no-show rate calculation. */
const BOOKING_LOOKBACK_DAYS = 180;

/**
 * PerformanceReports — teacher & member performance tables with anomaly
 * flags, rendered inside a Reports tab.
 *
 * Self-contained: fetches its own data on mount (teacher metrics, users,
 * contacts, and a wide booking window for no-show rate) and computes
 * everything via the pure `performance-metrics` utils. Failures are
 * swallowed to empty state rather than surfaced as a hard error, since this
 * is a supplementary report panel.
 */
export default function PerformanceReports() {
  const [loading, setLoading] = useState(true);
  const [teacherRows, setTeacherRows] = useState<TeacherPerformance[]>([]);
  const [memberRows, setMemberRows] = useState<MemberPerformance[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const end = new Date();
        const start = subDays(end, BOOKING_LOOKBACK_DAYS);

        const [metrics, users, contacts, bookings] = await Promise.all([
          groupsApi.getTeacherMetrics(),
          usersApi.getAll(),
          contactsApi.getContacts(),
          bookingsApi.getBookings({ start: start.toISOString(), end: end.toISOString() }),
        ]);

        if (cancelled) return;

        setTeacherRows(computeTeacherPerformance(metrics, users, bookings));
        setMemberRows(computeMemberPerformance(users, contacts));
      } catch {
        if (cancelled) return;
        setTeacherRows([]);
        setMemberRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading performance reports" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Teacher performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <GraduationCap className="h-4 w-4 text-primary" />
            Teacher Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Completed Studies</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Fruit</TableHead>
                  <TableHead className="text-right">No-Show Rate</TableHead>
                  <TableHead>Anomalies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teacherRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No teacher performance data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  teacherRows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.completedStudies}</TableCell>
                      <TableCell className="text-right">{row.totalStudents}</TableCell>
                      <TableCell className="text-right">{row.fruit}</TableCell>
                      <TableCell className="text-right">{Math.round(row.noShowRate * 100)}%</TableCell>
                      <TableCell>
                        {row.anomalies.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.anomalies.map((a) => (
                              <Badge key={a} variant="destructive" className="gap-1 text-[10px]">
                                <AlertTriangle className="h-3 w-3" />
                                {a}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Member performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            Member Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Contacts Created</TableHead>
                  <TableHead className="text-right">Studies</TableHead>
                  <TableHead>Anomalies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      No member performance data available.
                    </TableCell>
                  </TableRow>
                ) : (
                  memberRows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.contactsCreated}</TableCell>
                      <TableCell className="text-right">{row.studies}</TableCell>
                      <TableCell>
                        {row.anomalies.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.anomalies.map((a) => (
                              <Badge key={a} variant="destructive" className="gap-1 text-[10px]">
                                <AlertTriangle className="h-3 w-3" />
                                {a}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
