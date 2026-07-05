/**
 * Teacher & Member performance reports — pure computation layer.
 *
 * IMPORTANT: study/session totals are NOT recomputed from raw bookings here.
 * `TeacherMetrics.totalSessionsLed` / `.baptizedSinceStudying` (server-computed)
 * and `Contact.totalSessions` are already Completed-gated (see
 * `BookingStatus` docs — "Metrics derive ONLY from COMPLETED"). Recomputing
 * from raw bookings would re-expose a previously-fixed future/non-completed
 * counts bug. The ONLY thing derived from raw bookings here is the no-show
 * rate, which has no equivalent pre-aggregated field.
 */
import type { User, TeacherMetrics } from '../types/user';
import type { Booking } from '../types/booking';
import { BookingStatus } from '../types/booking';
import type { Contact } from '../types/contact';

// ---------------------------------------------------------------------------
// Anomaly thresholds — named constants so the flags are self-documenting and
// easy to retune without hunting through the logic below.
// ---------------------------------------------------------------------------

/** No-show rate above this (0..1) is flagged, but only once there's enough
 *  volume to be meaningful (see MIN_BOOKINGS_FOR_NO_SHOW_FLAG). */
export const HIGH_NO_SHOW_RATE_THRESHOLD = 0.4;
/** Minimum (completed + no_show) bookings before the no-show rate is judged. */
export const MIN_BOOKINGS_FOR_NO_SHOW_FLAG = 5;
/** Student count above this is unusual for a single teacher. */
export const HIGH_STUDENT_COUNT_THRESHOLD = 40;
/** Contacts created above this is unusual for a single member. */
export const HIGH_CONTACTS_CREATED_THRESHOLD = 30;
/** Studies (sum of totalSessions across a member's contacts) above this is
 *  unusual for a single member. */
export const HIGH_MEMBER_STUDIES_THRESHOLD = 100;

export interface TeacherPerformance {
  userId: string;
  name: string;
  /** = TeacherMetrics.totalSessionsLed (server-computed, Completed-gated). */
  completedStudies: number;
  /** = TeacherMetrics.totalStudents. */
  totalStudents: number;
  /** = TeacherMetrics.baptizedSinceStudying. */
  fruit: number;
  /** 0..1. noShow / (completed + noShow) from bookings by this teacher; 0 when no such bookings exist. */
  noShowRate: number;
  /** Human-readable anomaly flags, e.g. "High no-show rate (50%)". */
  anomalies: string[];
}

export interface MemberPerformance {
  userId: string;
  name: string;
  /** Count of contacts where createdBy === userId (fallback: assignedTeacherId when createdBy is absent). */
  contactsCreated: number;
  /** Sum of totalSessions over the member's contacts. */
  studies: number;
  anomalies: string[];
}

function userName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/**
 * Computes each teacher's no-show rate from raw bookings.
 * rate = noShow / (noShow + completed); 0 when that denominator is 0.
 */
function computeNoShowRate(teacherId: string, bookings: Booking[]): number {
  let noShow = 0;
  let completed = 0;
  for (const b of bookings) {
    if (b.teacherId !== teacherId) continue;
    if (b.status === BookingStatus.NO_SHOW) noShow++;
    else if (b.status === BookingStatus.COMPLETED) completed++;
  }
  const denom = noShow + completed;
  return denom === 0 ? 0 : noShow / denom;
}

export function computeTeacherPerformance(
  metrics: TeacherMetrics[],
  users: User[],
  bookings: Booking[],
): TeacherPerformance[] {
  const userById = new Map(users.map((u) => [u.id, u]));

  const results: TeacherPerformance[] = [];
  for (const m of metrics) {
    const user = userById.get(m.userId);
    if (!user) continue; // skip metrics for users not found

    const noShowRate = computeNoShowRate(m.userId, bookings);
    const noShowDenom = bookings.filter(
      (b) =>
        b.teacherId === m.userId &&
        (b.status === BookingStatus.NO_SHOW || b.status === BookingStatus.COMPLETED),
    ).length;

    const anomalies: string[] = [];
    if (noShowRate > HIGH_NO_SHOW_RATE_THRESHOLD && noShowDenom >= MIN_BOOKINGS_FOR_NO_SHOW_FLAG) {
      anomalies.push(`High no-show rate (${Math.round(noShowRate * 100)}%)`);
    }
    if (m.totalStudents > HIGH_STUDENT_COUNT_THRESHOLD) {
      anomalies.push(`Unusually high student count (${m.totalStudents})`);
    }
    if (m.totalSessionsLed === 0 && m.totalStudents > 0) {
      anomalies.push('Students assigned but no completed studies');
    }

    results.push({
      userId: m.userId,
      name: userName(user),
      completedStudies: m.totalSessionsLed,
      totalStudents: m.totalStudents,
      fruit: m.baptizedSinceStudying,
      noShowRate,
      anomalies,
    });
  }

  return results.sort((a, b) => b.completedStudies - a.completedStudies);
}

export function computeMemberPerformance(users: User[], contacts: Contact[]): MemberPerformance[] {
  const contactsByOwner = new Map<string, Contact[]>();
  for (const c of contacts) {
    const ownerId = c.createdBy ?? c.assignedTeacherId;
    if (!ownerId) continue;
    const list = contactsByOwner.get(ownerId) ?? [];
    list.push(c);
    contactsByOwner.set(ownerId, list);
  }

  const results: MemberPerformance[] = [];
  for (const user of users) {
    const owned = contactsByOwner.get(user.id);
    if (!owned || owned.length === 0) continue;

    const contactsCreated = owned.length;
    const studies = owned.reduce((sum, c) => sum + (c.totalSessions ?? 0), 0);

    const anomalies: string[] = [];
    if (contactsCreated > HIGH_CONTACTS_CREATED_THRESHOLD) {
      anomalies.push(`Unusually high contacts created (${contactsCreated})`);
    }
    if (studies > HIGH_MEMBER_STUDIES_THRESHOLD) {
      anomalies.push(`Unusually high study count (${studies})`);
    }

    results.push({
      userId: user.id,
      name: userName(user),
      contactsCreated,
      studies,
      anomalies,
    });
  }

  return results.sort((a, b) => b.contactsCreated - a.contactsCreated);
}
