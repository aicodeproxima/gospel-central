import { describe, test, expect } from 'vitest';
import {
  getChurchUserIds,
  contactBelongsToChurch,
  contactsStudyingThisMonth,
  bibleStudiesThisMonth,
  upcomingStudies,
  topTeachersByCompletedStudies,
  topTeachersByFruit,
  buildYourGroup,
} from './church';
import { BookingType } from '../types/booking';
import type { Booking } from '../types/booking';
import type { Contact, TimelineEntry } from '../types/contact';
import { ContactStatus, PipelineStage } from '../types/contact';
import type { User } from '../types/user';
import { UserRole } from '../types/user';
import { scenarioUsers, scenarioContacts, scenarioBookings } from '@/mocks/scenario-church-week';

const AREA_A = 'area-a';
const AREA_B = 'area-b';

// ---------------------------------------------------------------------------
// Fixture builders — minimal, explicit, only the fields each test needs.
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> & Pick<User, 'id'>): User {
  return {
    username: overrides.id,
    firstName: overrides.id,
    lastName: '',
    email: `${overrides.id}@example.com`,
    role: UserRole.MEMBER,
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id'>): Booking {
  return {
    roomId: 'room-1',
    areaId: AREA_A,
    type: BookingType.UNBAPTIZED_CONTACT,
    activity: 'bible_study',
    title: 'Study',
    startTime: '2026-07-10T10:00:00',
    endTime: '2026-07-10T11:00:00',
    createdBy: 'u-creator',
    participants: [],
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> & Pick<Contact, 'id'>): Contact {
  return {
    firstName: overrides.id,
    lastName: '',
    type: BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    pipelineStage: PipelineStage.FIRST_STUDY,
    totalSessions: 0,
    createdBy: 'u-creator',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function stageChange(date: string, details: string): TimelineEntry {
  return { date, action: 'stage_change', details, userId: 'u-x', userName: 'X' };
}

const NOW = new Date('2026-07-15T12:00:00');

describe('getChurchUserIds', () => {
  test('returns ids of users whose locationId matches the area', () => {
    const users = [
      makeUser({ id: 'u1', locationId: AREA_A }),
      makeUser({ id: 'u2', locationId: AREA_B }),
      makeUser({ id: 'u3', locationId: AREA_A }),
      makeUser({ id: 'u4' }), // no locationId
    ];
    const ids = getChurchUserIds(users, AREA_A);
    expect(ids).toEqual(new Set(['u1', 'u3']));
  });

  test('empty when no users match', () => {
    const users = [makeUser({ id: 'u1', locationId: AREA_B })];
    expect(getChurchUserIds(users, AREA_A).size).toBe(0);
  });

  test('real scenario data: both seeded areas are non-empty and disjoint', () => {
    const nn = getChurchUserIds(scenarioUsers, 'area-newport-news');
    const vb = getChurchUserIds(scenarioUsers, 'area-virginia-beach');
    expect(nn.size).toBeGreaterThan(0);
    expect(vb.size).toBeGreaterThan(0);
    for (const id of nn) expect(vb.has(id)).toBe(false);
  });
});

describe('contactBelongsToChurch', () => {
  test('true when assignedTeacherId is in the church', () => {
    const church = new Set(['teacher-1']);
    const contact = makeContact({ id: 'c1', assignedTeacherId: 'teacher-1', createdBy: 'nobody' });
    expect(contactBelongsToChurch(contact, church)).toBe(true);
  });

  test('true when createdBy is in the church (no matching teacher)', () => {
    const church = new Set(['creator-1']);
    const contact = makeContact({ id: 'c1', assignedTeacherId: 'other', createdBy: 'creator-1' });
    expect(contactBelongsToChurch(contact, church)).toBe(true);
  });

  test('false when neither teacher nor creator is in the church', () => {
    const church = new Set(['someone-else']);
    const contact = makeContact({ id: 'c1', assignedTeacherId: 'teacher-1', createdBy: 'creator-1' });
    expect(contactBelongsToChurch(contact, church)).toBe(false);
  });
});

describe('contactsStudyingThisMonth', () => {
  test('includes a contact with a completed bible_study booking this month, in the right area', () => {
    const contacts = [makeContact({ id: 'c1' })];
    const bookings = [
      makeBooking({
        id: 'b1',
        areaId: AREA_A,
        status: 'completed' as Booking['status'],
        activity: 'bible_study',
        contactId: 'c1',
        startTime: '2026-07-10T10:00:00',
      }),
    ];
    expect(contactsStudyingThisMonth(bookings, contacts, AREA_A, NOW)).toEqual([contacts[0]]);
  });

  test('boundary: first day of month counts, first day of NEXT month does not', () => {
    const contacts = [makeContact({ id: 'c1' }), makeContact({ id: 'c2' })];
    const bookings = [
      makeBooking({
        id: 'b1',
        areaId: AREA_A,
        status: 'completed' as Booking['status'],
        activity: 'bible_study',
        contactId: 'c1',
        startTime: '2026-07-01T00:00:00',
      }),
      makeBooking({
        id: 'b2',
        areaId: AREA_A,
        status: 'completed' as Booking['status'],
        activity: 'bible_study',
        contactId: 'c2',
        startTime: '2026-08-01T00:00:00',
      }),
    ];
    const result = contactsStudyingThisMonth(bookings, contacts, AREA_A, NOW);
    expect(result.map((c) => c.id)).toEqual(['c1']);
  });

  test('excludes other areas, other statuses, and non-bible_study activities', () => {
    const contacts = [
      makeContact({ id: 'c-wrong-area' }),
      makeContact({ id: 'c-no-show' }),
      makeContact({ id: 'c-cancelled' }),
      makeContact({ id: 'c-rescheduled' }),
      makeContact({ id: 'c-scheduled' }),
      makeContact({ id: 'c-wrong-activity' }),
    ];
    const bookings: Booking[] = [
      makeBooking({ id: 'b1', areaId: AREA_B, status: 'completed' as Booking['status'], activity: 'bible_study', contactId: 'c-wrong-area' }),
      makeBooking({ id: 'b2', areaId: AREA_A, status: 'no_show' as Booking['status'], activity: 'bible_study', contactId: 'c-no-show' }),
      makeBooking({ id: 'b3', areaId: AREA_A, status: 'cancelled' as Booking['status'], activity: 'bible_study', contactId: 'c-cancelled' }),
      makeBooking({ id: 'b4', areaId: AREA_A, status: 'rescheduled' as Booking['status'], activity: 'bible_study', contactId: 'c-rescheduled' }),
      makeBooking({ id: 'b5', areaId: AREA_A, status: 'bible_study' as Booking['status'], activity: 'bible_study', contactId: 'c-scheduled' }),
      makeBooking({ id: 'b6', areaId: AREA_A, status: 'completed' as Booking['status'], activity: 'group_activity', contactId: 'c-wrong-activity' }),
    ];
    expect(contactsStudyingThisMonth(bookings, contacts, AREA_A, NOW)).toEqual([]);
  });

  test('distinct contacts, order-stable by first qualifying booking', () => {
    const contacts = [makeContact({ id: 'c1' }), makeContact({ id: 'c2' })];
    const bookings = [
      makeBooking({ id: 'b1', status: 'completed' as Booking['status'], activity: 'bible_study', contactId: 'c2', startTime: '2026-07-05T10:00:00' }),
      makeBooking({ id: 'b2', status: 'completed' as Booking['status'], activity: 'bible_study', contactId: 'c1', startTime: '2026-07-08T10:00:00' }),
      makeBooking({ id: 'b3', status: 'completed' as Booking['status'], activity: 'bible_study', contactId: 'c2', startTime: '2026-07-12T10:00:00' }),
    ];
    const result = contactsStudyingThisMonth(bookings, contacts, AREA_A, NOW);
    expect(result.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  test('skips bookings with no contactId or a dangling contactId', () => {
    const contacts = [makeContact({ id: 'c1' })];
    const bookings = [
      makeBooking({ id: 'b1', status: 'completed' as Booking['status'], activity: 'bible_study', contactId: undefined }),
      makeBooking({ id: 'b2', status: 'completed' as Booking['status'], activity: 'bible_study', contactId: 'ghost' }),
    ];
    expect(contactsStudyingThisMonth(bookings, contacts, AREA_A, NOW)).toEqual([]);
  });
});

describe('bibleStudiesThisMonth', () => {
  test('returns completed bible_study bookings for the area/month, sorted ascending', () => {
    const bookings = [
      makeBooking({ id: 'b-late', status: 'completed' as Booking['status'], activity: 'bible_study', startTime: '2026-07-20T10:00:00' }),
      makeBooking({ id: 'b-early', status: 'completed' as Booking['status'], activity: 'bible_study', startTime: '2026-07-02T10:00:00' }),
      makeBooking({ id: 'b-other-area', areaId: AREA_B, status: 'completed' as Booking['status'], activity: 'bible_study', startTime: '2026-07-10T10:00:00' }),
      makeBooking({ id: 'b-not-completed', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-10T10:00:00' }),
    ];
    const result = bibleStudiesThisMonth(bookings, AREA_A, NOW);
    expect(result.map((b) => b.id)).toEqual(['b-early', 'b-late']);
  });

  test('boundary: last moment of the month counts, first moment of next month does not', () => {
    const bookings = [
      makeBooking({ id: 'b-last', status: 'completed' as Booking['status'], activity: 'bible_study', startTime: '2026-07-31T23:59:59' }),
      makeBooking({ id: 'b-next', status: 'completed' as Booking['status'], activity: 'bible_study', startTime: '2026-08-01T00:00:00' }),
    ];
    const result = bibleStudiesThisMonth(bookings, AREA_A, NOW);
    expect(result.map((b) => b.id)).toEqual(['b-last']);
  });
});

describe('upcomingStudies', () => {
  // NOW = 2026-07-15T12:00:00 is a Wednesday. Week is Sun 2026-07-12 .. Sat 2026-07-18.
  test('includes bible_study bookings from now through end of this Saturday', () => {
    const bookings = [
      makeBooking({ id: 'b-today', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-15T14:00:00' }),
      makeBooking({ id: 'b-saturday', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-18T20:00:00' }),
    ];
    const result = upcomingStudies(bookings, AREA_A, NOW);
    expect(result.map((b) => b.id)).toEqual(['b-today', 'b-saturday']);
  });

  test('boundary: Saturday counts, next Sunday does not', () => {
    const bookings = [
      makeBooking({ id: 'b-sat-late', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-18T23:59:59' }),
      makeBooking({ id: 'b-sun-next', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-19T00:00:00' }),
    ];
    const result = upcomingStudies(bookings, AREA_A, NOW);
    expect(result.map((b) => b.id)).toEqual(['b-sat-late']);
  });

  test('excludes past bookings, wrong area, wrong status, and wrong activity', () => {
    const bookings = [
      makeBooking({ id: 'b-past', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-14T10:00:00' }),
      makeBooking({ id: 'b-other-area', areaId: AREA_B, status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-16T10:00:00' }),
      makeBooking({ id: 'b-completed', status: 'completed' as Booking['status'], activity: 'bible_study', startTime: '2026-07-16T10:00:00' }),
      makeBooking({ id: 'b-wrong-activity', status: 'bible_study' as Booking['status'], activity: 'group_activity', startTime: '2026-07-16T10:00:00' }),
    ];
    expect(upcomingStudies(bookings, AREA_A, NOW)).toEqual([]);
  });

  test('sorted ascending by startTime', () => {
    const bookings = [
      makeBooking({ id: 'b-later', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-17T10:00:00' }),
      makeBooking({ id: 'b-sooner', status: 'bible_study' as Booking['status'], activity: 'bible_study', startTime: '2026-07-15T13:00:00' }),
    ];
    const result = upcomingStudies(bookings, AREA_A, NOW);
    expect(result.map((b) => b.id)).toEqual(['b-sooner', 'b-later']);
  });
});

describe('topTeachersByCompletedStudies', () => {
  test('groups by teacherId, sorts by count desc then name asc, respects limit', () => {
    const users = [
      makeUser({ id: 't1', firstName: 'Bob' }),
      makeUser({ id: 't2', firstName: 'Alice' }),
      makeUser({ id: 't3', firstName: 'Carl' }),
    ];
    const bookings = [
      makeBooking({ id: 'b1', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
      makeBooking({ id: 'b2', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't2' }),
      makeBooking({ id: 'b3', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't2' }),
      makeBooking({ id: 'b4', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't3' }),
      makeBooking({ id: 'b5', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't3' }),
    ];
    const result = topTeachersByCompletedStudies(bookings, users, AREA_A, NOW, 10);
    // t2 and t3 tie at 2 -> name asc (Alice before Carl); t1 has 1.
    expect(result.map((r) => [r.user.id, r.count])).toEqual([
      ['t2', 2],
      ['t3', 2],
      ['t1', 1],
    ]);
  });

  test('teacher missing from users list is skipped', () => {
    const users = [makeUser({ id: 't1' })];
    const bookings = [
      makeBooking({ id: 'b1', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
      makeBooking({ id: 'b2', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 'ghost-teacher' }),
    ];
    const result = topTeachersByCompletedStudies(bookings, users, AREA_A, NOW, 10);
    expect(result.map((r) => r.user.id)).toEqual(['t1']);
  });

  test('bookings without a teacherId are ignored', () => {
    const users = [makeUser({ id: 't1' })];
    const bookings = [
      makeBooking({ id: 'b1', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: undefined }),
    ];
    expect(topTeachersByCompletedStudies(bookings, users, AREA_A, NOW, 10)).toEqual([]);
  });

  test('respects the limit parameter', () => {
    const users = [makeUser({ id: 't1' }), makeUser({ id: 't2' }), makeUser({ id: 't3' })];
    const bookings = [
      makeBooking({ id: 'b1', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
      makeBooking({ id: 'b2', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't2' }),
      makeBooking({ id: 'b3', status: 'completed' as Booking['status'], activity: 'bible_study', teacherId: 't3' }),
    ];
    const result = topTeachersByCompletedStudies(bookings, users, AREA_A, NOW, 2);
    expect(result.length).toBe(2);
  });

  test('non-completed statuses (no_show/rescheduled/cancelled/bible_study) do not count', () => {
    const users = [makeUser({ id: 't1' })];
    const bookings = [
      makeBooking({ id: 'b1', status: 'no_show' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
      makeBooking({ id: 'b2', status: 'rescheduled' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
      makeBooking({ id: 'b3', status: 'cancelled' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
      makeBooking({ id: 'b4', status: 'bible_study' as Booking['status'], activity: 'bible_study', teacherId: 't1' }),
    ];
    expect(topTeachersByCompletedStudies(bookings, users, AREA_A, NOW, 10)).toEqual([]);
  });
});

describe('topTeachersByFruit', () => {
  test('counts baptized contacts with a stage_change "Baptized" entry this month, attributed to teacher', () => {
    const users = [makeUser({ id: 't1', firstName: 'Bob' })];
    const church = new Set(['t1']);
    const contacts = [
      makeContact({
        id: 'c1',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-07-10T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    const result = topTeachersByFruit(contacts, users, church, NOW, 10);
    expect(result).toEqual([{ user: users[0], count: 1 }]);
  });

  test('boundary: first day of month counts, next-month first day does not', () => {
    const users = [makeUser({ id: 't1' })];
    const church = new Set(['t1']);
    const contacts = [
      makeContact({
        id: 'c-in',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-07-01T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
      makeContact({
        id: 'c-out',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-08-01T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    const result = topTeachersByFruit(contacts, users, church, NOW, 10);
    expect(result).toEqual([{ user: users[0], count: 1 }]);
  });

  test('skips contacts without an assignedTeacherId', () => {
    const users = [makeUser({ id: 't1' })];
    const church = new Set(['t1']);
    const contacts = [
      makeContact({
        id: 'c1',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: undefined,
        timeline: [stageChange('2026-07-10T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    expect(topTeachersByFruit(contacts, users, church, NOW, 10)).toEqual([]);
  });

  test('skips contacts whose teacher is not in churchUserIds', () => {
    const users = [makeUser({ id: 't1' })];
    const church = new Set(['someone-else']);
    const contacts = [
      makeContact({
        id: 'c1',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-07-10T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    expect(topTeachersByFruit(contacts, users, church, NOW, 10)).toEqual([]);
  });

  test('non-baptized pipelineStage never counts, even with a matching timeline entry', () => {
    const users = [makeUser({ id: 't1' })];
    const church = new Set(['t1']);
    const contacts = [
      makeContact({
        id: 'c1',
        pipelineStage: PipelineStage.BAPTISM_READY,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-07-10T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    expect(topTeachersByFruit(contacts, users, church, NOW, 10)).toEqual([]);
  });

  test('teacher missing from users list is skipped', () => {
    const users: User[] = [];
    const church = new Set(['t1']);
    const contacts = [
      makeContact({
        id: 'c1',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-07-10T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    expect(topTeachersByFruit(contacts, users, church, NOW, 10)).toEqual([]);
  });

  test('sorts by count desc then name asc and respects limit', () => {
    const users = [
      makeUser({ id: 't1', firstName: 'Zack' }),
      makeUser({ id: 't2', firstName: 'Amy' }),
    ];
    const church = new Set(['t1', 't2']);
    const contacts = [
      makeContact({
        id: 'c1',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't1',
        timeline: [stageChange('2026-07-05T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
      makeContact({
        id: 'c2',
        pipelineStage: PipelineStage.BAPTIZED,
        assignedTeacherId: 't2',
        timeline: [stageChange('2026-07-06T00:00:00', 'Pipeline stage changed to Baptized')],
      }),
    ];
    const result = topTeachersByFruit(contacts, users, church, NOW, 1);
    expect(result.length).toBe(1);
    // t1 and t2 tie at count 1 -> name asc breaks the tie: "Amy" (t2) before "Zack" (t1).
    expect(result[0].user.id).toBe('t2');
    expect(result[0].count).toBe(1);
  });
});

describe('buildYourGroup', () => {
  // Small synthetic hierarchy:
  //   dev (DEV)
  //     -> branch (BRANCH_LEADER)
  //          -> group (GROUP_LEADER)
  //               -> teamA (TEAM_LEADER)      -> memberA1, memberA2 (MEMBER)
  //               -> teamB (TEAM_LEADER, peer of teamA)
  const dev = makeUser({ id: 'dev', role: UserRole.DEV });
  const branch = makeUser({ id: 'branch', role: UserRole.BRANCH_LEADER, parentId: 'dev' });
  const group = makeUser({ id: 'group', role: UserRole.GROUP_LEADER, parentId: 'branch' });
  const teamA = makeUser({ id: 'teamA', role: UserRole.TEAM_LEADER, parentId: 'group' });
  const teamB = makeUser({ id: 'teamB', role: UserRole.TEAM_LEADER, parentId: 'group' });
  const memberA1 = makeUser({ id: 'memberA1', firstName: 'Zed', role: UserRole.MEMBER, parentId: 'teamA' });
  const memberA2 = makeUser({ id: 'memberA2', firstName: 'Amy', role: UserRole.MEMBER, parentId: 'teamA' });
  const memberB1 = makeUser({ id: 'memberB1', firstName: 'Mike', role: UserRole.MEMBER, parentId: 'teamB' });
  const allUsers = [dev, branch, group, teamA, teamB, memberA1, memberA2, memberB1];

  test('above excludes the viewer and DEV, root-most first', () => {
    const { above } = buildYourGroup(teamA, allUsers);
    expect(above.map((u) => u.id)).toEqual(['branch', 'group']);
  });

  test('lateral finds same-parent same-role peers, excluding self', () => {
    const { lateral } = buildYourGroup(teamA, allUsers);
    expect(lateral.map((u) => u.id)).toEqual(['teamB']);
  });

  test('lateral is empty for a user with no parentId', () => {
    const { lateral } = buildYourGroup(dev, allUsers);
    expect(lateral).toEqual([]);
  });

  test('below walks the full transitive subtree, grouped by role and sorted by firstName', () => {
    const { below, memberCount } = buildYourGroup(group, allUsers);
    expect(below.get(UserRole.TEAM_LEADER)?.map((u) => u.id)).toEqual(['teamA', 'teamB']);
    // firstName asc: Amy (memberA2), Mike (memberB1), Zed (memberA1).
    expect(below.get(UserRole.MEMBER)?.map((u) => u.id)).toEqual(['memberA2', 'memberB1', 'memberA1']);
    expect(memberCount).toBe(3);
  });

  test('memberCount is 0 when there are no members below', () => {
    const { memberCount, below } = buildYourGroup(teamB, allUsers);
    expect(below.get(UserRole.MEMBER)?.map((u) => u.id)).toEqual(['memberB1']);
    expect(memberCount).toBe(1);
  });

  test('a leaf user (no children) has an empty below and memberCount 0', () => {
    const { below, memberCount } = buildYourGroup(memberA1, allUsers);
    expect(below.size).toBe(0);
    expect(memberCount).toBe(0);
  });

  test('is cycle-safe for a malformed parentId cycle', () => {
    const x = makeUser({ id: 'x', role: UserRole.TEAM_LEADER, parentId: 'y' });
    const y = makeUser({ id: 'y', role: UserRole.TEAM_LEADER, parentId: 'x' });
    expect(() => buildYourGroup(x, [x, y])).not.toThrow();
    const { above, below } = buildYourGroup(x, [x, y]);
    expect(above.map((u) => u.id)).toEqual(['y']);
    expect(below.get(UserRole.TEAM_LEADER)?.map((u) => u.id)).toEqual(['y']);
  });

  // --- directReports: DIRECT relationships only (user decision 2026-07-03) ---

  test('directReports: a TL sees ONLY their own team members, not the sibling team', () => {
    const { directReports } = buildYourGroup(teamA, allUsers);
    // firstName asc: Amy (memberA2), Zed (memberA1). memberB1 (teamB's) excluded.
    expect(directReports.get(UserRole.MEMBER)?.map((u) => u.id)).toEqual(['memberA2', 'memberA1']);
    expect(directReports.size).toBe(1);
  });

  test('directReports: a GL sees ONLY their own TLs — never members two levels down', () => {
    const { directReports } = buildYourGroup(group, allUsers);
    expect(directReports.get(UserRole.TEAM_LEADER)?.map((u) => u.id)).toEqual(['teamA', 'teamB']);
    expect(directReports.get(UserRole.MEMBER)).toBeUndefined();
  });

  test('directReports: a BL sees only their GLs; the overseer/root only their BLs', () => {
    expect(buildYourGroup(branch, allUsers).directReports.get(UserRole.GROUP_LEADER)?.map((u) => u.id)).toEqual(['group']);
    expect(buildYourGroup(dev, allUsers).directReports.get(UserRole.BRANCH_LEADER)?.map((u) => u.id)).toEqual(['branch']);
  });

  test('re-derives automatically when the tree changes: a role change / conversion re-shapes the result', () => {
    // memberA1 gets promoted to TEAM_LEADER under the group (position change):
    const promoted = { ...memberA1, role: UserRole.TEAM_LEADER, parentId: 'group' };
    const changed = allUsers.map((u) => (u.id === 'memberA1' ? promoted : u));
    const glView = buildYourGroup(group, changed);
    expect(glView.directReports.get(UserRole.TEAM_LEADER)?.map((u) => u.id)).toEqual([
      'teamA', 'teamB', 'memberA1',
    ]);
    // teamA no longer has memberA1 as a direct report:
    expect(buildYourGroup(teamA, changed).directReports.get(UserRole.MEMBER)?.map((u) => u.id)).toEqual(['memberA2']);

    // A freshly converted contact placed on teamA immediately sees the chain
    // + their team-mates (packet: converted members get the full neighborhood):
    const convert = makeUser({ id: 'newConvert', firstName: 'Nia', role: UserRole.MEMBER, parentId: 'teamA' });
    const withConvert = [...changed, convert];
    const newbie = buildYourGroup(convert, withConvert);
    expect(newbie.above.map((u) => u.id)).toEqual(['branch', 'group', 'teamA']);
    expect(newbie.lateral.map((u) => u.id)).toEqual(['memberA2']);
  });

  test('real scenario data: u-mem-1 has a TEAM_LEADER ancestor in `above`', () => {
    const viewer = scenarioUsers.find((u) => u.id === 'u-mem-1');
    expect(viewer).toBeDefined();
    const { above } = buildYourGroup(viewer as User, scenarioUsers);
    expect(above.some((u) => u.role === UserRole.TEAM_LEADER)).toBe(true);
    // above must never contain a DEV.
    expect(above.some((u) => u.role === UserRole.DEV)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A light end-to-end sanity pass against the full real seed, using the
// module's own "now" so it stays correct regardless of when the suite runs
// (this test file runs in the `unit` vitest project — real clock, no
// __MOCK_DATE__ pin — see vitest.config.ts).
// ---------------------------------------------------------------------------
describe('real scenario data — cross-helper sanity', () => {
  test('helpers run over the full seed without throwing and return arrays/maps', () => {
    const now = new Date();
    const nnIds = getChurchUserIds(scenarioUsers, 'area-newport-news');
    expect(
      scenarioContacts.filter((c) => contactBelongsToChurch(c, nnIds)).length,
    ).toBeGreaterThanOrEqual(0);
    expect(
      contactsStudyingThisMonth(scenarioBookings, scenarioContacts, 'area-newport-news', now),
    ).toBeInstanceOf(Array);
    expect(
      bibleStudiesThisMonth(scenarioBookings, 'area-newport-news', now),
    ).toBeInstanceOf(Array);
    expect(
      upcomingStudies(scenarioBookings, 'area-newport-news', now),
    ).toBeInstanceOf(Array);
    expect(
      topTeachersByCompletedStudies(scenarioBookings, scenarioUsers, 'area-newport-news', now),
    ).toBeInstanceOf(Array);
    expect(
      topTeachersByFruit(scenarioContacts, scenarioUsers, nnIds, now),
    ).toBeInstanceOf(Array);
  });
});
