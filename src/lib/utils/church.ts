/**
 * Gospel Central — church-scoped reporting/metrics helpers.
 *
 * Self-contained logic cluster: pure functions only (no React, no I/O). Every
 * helper takes plain data (users/contacts/bookings) plus an explicit `now`
 * so callers can pin time for deterministic tests and callers can compose
 * these with any data-fetching strategy they like.
 *
 * LOCKED BUSINESS RULES (do not reinterpret without a decision record):
 *   - Metrics (studies, fruit, teacher leaderboards) count ONLY bookings with
 *     status === 'completed'.
 *   - "Upcoming Studies" = bookings with status 'bible_study' from `now`
 *     through the END OF SATURDAY of the current week (Sun–Sat weeks, i.e.
 *     `endOfWeek(now, { weekStartsOn: 0 })`).
 *   - "This month" = the current calendar month of `now`.
 */

import { endOfMonth, endOfWeek, isWithinInterval, startOfMonth } from 'date-fns';
import type { Booking } from '../types/booking';
import type { Contact } from '../types/contact';
import type { User } from '../types/user';
import { UserRole } from '../types/user';

const COMPLETED = 'completed';
const BIBLE_STUDY_ACTIVITY = 'bible_study';
const BIBLE_STUDY_STATUS = 'bible_study';

/**
 * getChurchUserIds — the ids of every user whose home location (`locationId`)
 * matches the given area. Returns a Set for O(1) membership checks by the
 * other helpers in this file.
 */
export function getChurchUserIds(users: User[], areaId: string): Set<string> {
  const ids = new Set<string>();
  for (const u of users) {
    if (u.locationId === areaId) ids.add(u.id);
  }
  return ids;
}

/**
 * contactBelongsToChurch — true when the contact's assigned teacher OR its
 * creator is a member of the given church (as computed by
 * `getChurchUserIds`). Either relationship is sufficient — a contact can be
 * "owned" by the church via whoever is teaching it today or whoever
 * originally logged it.
 */
export function contactBelongsToChurch(
  contact: Contact,
  churchUserIds: Set<string>,
): boolean {
  if (contact.assignedTeacherId && churchUserIds.has(contact.assignedTeacherId)) {
    return true;
  }
  return churchUserIds.has(contact.createdBy);
}

/** True when `date` falls inside the calendar month containing `now`. */
function isInCurrentMonth(date: Date, now: Date): boolean {
  return isWithinInterval(date, { start: startOfMonth(now), end: endOfMonth(now) });
}

/**
 * Internal: completed bible_study bookings for an area, filtered to the
 * current calendar month of `now`. Shared by #3, #4, and #6 so the "what
 * counts toward monthly KPIs" definition lives in exactly one place.
 */
function completedStudiesThisMonthFor(
  bookings: Booking[],
  areaId: string,
  now: Date,
): Booking[] {
  return bookings.filter(
    (b) =>
      b.areaId === areaId &&
      b.status === COMPLETED &&
      b.activity === BIBLE_STUDY_ACTIVITY &&
      isInCurrentMonth(new Date(b.startTime), now),
  );
}

/**
 * contactsStudyingThisMonth — distinct contacts with at least one completed
 * bible_study booking in the given area during the current calendar month.
 * Order is stable: a contact appears at the position of its FIRST qualifying
 * booking (bookings are scanned in the order given, not re-sorted).
 */
export function contactsStudyingThisMonth(
  bookings: Booking[],
  contacts: Contact[],
  areaId: string,
  now: Date,
): Contact[] {
  const qualifying = completedStudiesThisMonthFor(bookings, areaId, now);
  const contactsById = new Map(contacts.map((c) => [c.id, c] as const));
  const seen = new Set<string>();
  const result: Contact[] = [];
  for (const b of qualifying) {
    if (!b.contactId || seen.has(b.contactId)) continue;
    const contact = contactsById.get(b.contactId);
    if (!contact) continue;
    seen.add(b.contactId);
    result.push(contact);
  }
  return result;
}

/**
 * bibleStudiesThisMonth — the completed bible_study bookings themselves for
 * an area during the current calendar month, sorted by startTime ascending.
 */
export function bibleStudiesThisMonth(
  bookings: Booking[],
  areaId: string,
  now: Date,
): Booking[] {
  return completedStudiesThisMonthFor(bookings, areaId, now).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

/**
 * upcomingStudies — bookings in the area still on the calendar as a
 * scheduled study: status AND activity both 'bible_study', starting at or
 * after `now` and no later than the end of the current week's Saturday
 * (Sun–Sat weeks). Sorted by startTime ascending.
 */
export function upcomingStudies(
  bookings: Booking[],
  areaId: string,
  now: Date,
): Booking[] {
  const windowEnd = endOfWeek(now, { weekStartsOn: 0 });
  return bookings
    .filter((b) => {
      if (b.areaId !== areaId) return false;
      if (b.status !== BIBLE_STUDY_STATUS) return false;
      if (b.activity !== BIBLE_STUDY_ACTIVITY) return false;
      const start = new Date(b.startTime);
      return start.getTime() >= now.getTime() && start.getTime() <= windowEnd.getTime();
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

/** Shared sort: highest count first, then name (first+last) ascending. */
function sortByCountThenName(
  entries: { user: User; count: number }[],
): { user: User; count: number }[] {
  return entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const nameA = `${a.user.firstName} ${a.user.lastName}`.trim();
    const nameB = `${b.user.firstName} ${b.user.lastName}`.trim();
    return nameA.localeCompare(nameB);
  });
}

/**
 * topTeachersByCompletedStudies — ranks teachers by how many completed
 * bible_study bookings they led in the given area during the current
 * calendar month. Bookings whose `teacherId` doesn't resolve to a known user
 * are skipped (defensive — a dangling id shouldn't crash the leaderboard).
 * Ties break by name (first + last) ascending. Returns at most `limit`.
 */
export function topTeachersByCompletedStudies(
  bookings: Booking[],
  users: User[],
  areaId: string,
  now: Date,
  limit = 10,
): { user: User; count: number }[] {
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const counts = new Map<string, number>();
  for (const b of completedStudiesThisMonthFor(bookings, areaId, now)) {
    if (!b.teacherId || !usersById.has(b.teacherId)) continue;
    counts.set(b.teacherId, (counts.get(b.teacherId) ?? 0) + 1);
  }
  const entries: { user: User; count: number }[] = [];
  for (const [teacherId, count] of counts) {
    const user = usersById.get(teacherId);
    if (!user) continue;
    entries.push({ user, count });
  }
  return sortByCountThenName(entries).slice(0, limit);
}

/**
 * topTeachersByFruit — ranks teachers by "fruit this month": contacts whose
 * `pipelineStage` is currently 'baptized' AND whose timeline contains a
 * `stage_change` entry that (a) mentions 'Baptized' in its `details` text and
 * (b) falls inside the current calendar month of `now`.
 *
 * Timeline heuristic: the seed (and the live handler) record a baptism as a
 * TimelineEntry with `action: 'stage_change'` and
 * `details: 'Pipeline stage changed to Baptized'` (the human label for
 * PipelineStage.BAPTIZED). There's no dedicated "baptism" action, so we treat
 * any stage_change entry whose details contain the substring 'Baptized' as
 * the baptism event and use ITS date for the "this month" window — a
 * contact's CURRENT stage can be baptized while the actual baptism happened
 * in an earlier month, which should NOT count as "fruit this month".
 *
 * Each qualifying contact is attributed to its `assignedTeacherId`. Contacts
 * without an assigned teacher, or whose teacher is not in `churchUserIds`
 * (i.e. not a member of this church), are skipped. Ties break by name
 * ascending. Returns at most `limit`.
 */
export function topTeachersByFruit(
  contacts: Contact[],
  users: User[],
  churchUserIds: Set<string>,
  now: Date,
  limit = 10,
): { user: User; count: number }[] {
  const usersById = new Map(users.map((u) => [u.id, u] as const));
  const counts = new Map<string, number>();
  for (const contact of contacts) {
    if (contact.pipelineStage !== 'baptized') continue;
    const teacherId = contact.assignedTeacherId;
    if (!teacherId || !churchUserIds.has(teacherId)) continue;
    const baptizedThisMonth = (contact.timeline ?? []).some(
      (entry) =>
        entry.action === 'stage_change' &&
        entry.details.includes('Baptized') &&
        isInCurrentMonth(new Date(entry.date), now),
    );
    if (!baptizedThisMonth) continue;
    counts.set(teacherId, (counts.get(teacherId) ?? 0) + 1);
  }
  const entries: { user: User; count: number }[] = [];
  for (const [teacherId, count] of counts) {
    const user = usersById.get(teacherId);
    if (!user) continue;
    entries.push({ user, count });
  }
  return sortByCountThenName(entries).slice(0, limit);
}

/**
 * buildYourGroup — the viewer's "org neighborhood": ancestors above, peers
 * beside, direct reports, and the full reporting subtree below.
 *
 *   - `above`: the parentId ancestor chain walking UP from the viewer,
 *     root-most ancestor first, excluding the viewer and excluding any
 *     DEV-role user (Devs are the platform operators, not part of anyone's
 *     visible chain of command). Cycle-safe. This is DIRECT by construction —
 *     a team leader's chain contains only THEIR group leader, THEIR branch
 *     leader, the overseer.
 *   - `lateral`: other users sharing the viewer's parentId AND the viewer's
 *     role (peers at the same level under the same parent — for a member,
 *     their team-mates). Excludes the viewer.
 *   - `directReports`: ONLY the viewer's immediate children
 *     (parentId === viewer.id), grouped by role, sorted by firstName. This is
 *     what the dashboard's Your Group sections display (user decision
 *     2026-07-03: direct relationships only — a TL sees just their team's
 *     members, a GL just their own TLs, never the whole Zion's).
 *   - `below`: the viewer's full subtree, walking parentId children
 *     transitively (cycle-safe), grouped by role, each group's users sorted
 *     by firstName. Kept for rollups (member totals + the GL+ full member
 *     export), NOT for section display.
 *   - `memberCount`: convenience shorthand for `below.get(MEMBER)?.length`.
 *
 * Everything derives from the live `users` array — a role change, a
 * reassignment, or a contact converted onto a team re-shapes the result on
 * the next computation with zero special-casing.
 */
export function buildYourGroup(
  viewer: User,
  users: User[],
): {
  above: User[];
  lateral: User[];
  directReports: Map<UserRole, User[]>;
  below: Map<UserRole, User[]>;
  memberCount: number;
} {
  const usersById = new Map(users.map((u) => [u.id, u] as const));

  // --- above: ancestor chain, root-most first, no viewer, no DEV ---
  const ancestorsBottomUp: User[] = [];
  const seenUp = new Set<string>([viewer.id]);
  let cur = viewer.parentId ? usersById.get(viewer.parentId) : undefined;
  while (cur && !seenUp.has(cur.id)) {
    seenUp.add(cur.id);
    if (cur.role !== UserRole.DEV) ancestorsBottomUp.push(cur);
    cur = cur.parentId ? usersById.get(cur.parentId) : undefined;
  }
  const above = ancestorsBottomUp.reverse();

  // --- lateral: same parentId + same role, excluding viewer ---
  const lateral = users.filter(
    (u) =>
      u.id !== viewer.id &&
      u.role === viewer.role &&
      viewer.parentId !== undefined &&
      u.parentId === viewer.parentId,
  );

  // --- directReports: immediate children only, grouped by role ---
  const directReports = new Map<UserRole, User[]>();
  for (const u of users) {
    if (u.parentId !== viewer.id) continue;
    const bucket = directReports.get(u.role);
    if (bucket) bucket.push(u);
    else directReports.set(u.role, [u]);
  }
  for (const bucket of directReports.values()) {
    bucket.sort((a, b) => a.firstName.localeCompare(b.firstName));
  }

  // --- below: full subtree grouped by role, cycle-safe transitive walk ---
  const reach = new Set<string>([viewer.id]);
  const subtree: User[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const u of users) {
      if (u.id === viewer.id) continue;
      if (u.parentId && reach.has(u.parentId) && !reach.has(u.id)) {
        reach.add(u.id);
        subtree.push(u);
        added = true;
      }
    }
  }
  const below = new Map<UserRole, User[]>();
  for (const u of subtree) {
    const bucket = below.get(u.role);
    if (bucket) bucket.push(u);
    else below.set(u.role, [u]);
  }
  for (const bucket of below.values()) {
    bucket.sort((a, b) => a.firstName.localeCompare(b.firstName));
  }

  return {
    above,
    lateral,
    directReports,
    below,
    memberCount: below.get(UserRole.MEMBER)?.length ?? 0,
  };
}
