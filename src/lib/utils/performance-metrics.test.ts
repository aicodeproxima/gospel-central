import { describe, it, expect } from 'vitest';
import {
  computeTeacherPerformance,
  computeMemberPerformance,
  HIGH_NO_SHOW_RATE_THRESHOLD,
  MIN_BOOKINGS_FOR_NO_SHOW_FLAG,
  HIGH_STUDENT_COUNT_THRESHOLD,
  HIGH_CONTACTS_CREATED_THRESHOLD,
} from './performance-metrics';
import { UserRole } from '@/lib/types/user';
import type { User, TeacherMetrics } from '@/lib/types/user';
import { BookingStatus, BookingType } from '@/lib/types/booking';
import type { Booking } from '@/lib/types/booking';
import type { Contact } from '@/lib/types/contact';
import { PipelineStage, ContactStatus } from '@/lib/types/contact';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeUser = (overrides: Partial<User> & Pick<User, 'id' | 'firstName' | 'lastName'>): User =>
  ({
    username: overrides.id,
    email: `${overrides.id}@example.com`,
    role: UserRole.MEMBER,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as User;

const teacher1 = makeUser({ id: 't1', firstName: 'John', lastName: 'Doe' });
const teacher2 = makeUser({ id: 't2', firstName: 'Jane', lastName: 'Smith' });
const teacher3 = makeUser({ id: 't3', firstName: 'Mark', lastName: 'Lee' });
const member1 = makeUser({ id: 'm1', firstName: 'Alice', lastName: 'Brown' });
const member2 = makeUser({ id: 'm2', firstName: 'Bob', lastName: 'Green' });

const makeMetrics = (overrides: Partial<TeacherMetrics> & Pick<TeacherMetrics, 'userId'>): TeacherMetrics => ({
  totalStudents: 0,
  activeStudents: 0,
  currentlyStudying: 0,
  continuedStudying: 0,
  baptizedSinceStudying: 0,
  totalSessionsLed: 0,
  ...overrides,
});

const makeBooking = (overrides: Partial<Booking> & Pick<Booking, 'id' | 'teacherId'>): Booking =>
  ({
    roomId: 'r1',
    areaId: 'a1',
    type: BookingType.UNBAPTIZED_CONTACT,
    title: 'Study',
    startTime: '2026-01-01T10:00:00.000Z',
    endTime: '2026-01-01T11:00:00.000Z',
    createdBy: 'someone',
    participants: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Booking;

const makeContact = (overrides: Partial<Contact> & Pick<Contact, 'id'>): Contact =>
  ({
    firstName: overrides.id,
    lastName: '',
    type: BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    pipelineStage: PipelineStage.FIRST_STUDY,
    totalSessions: 0,
    createdBy: 'unknown',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Contact;

// ---------------------------------------------------------------------------
// computeTeacherPerformance
// ---------------------------------------------------------------------------

describe('computeTeacherPerformance', () => {
  it('maps completedStudies from totalSessionsLed and fruit from baptizedSinceStudying', () => {
    const metrics = [makeMetrics({ userId: 't1', totalSessionsLed: 12, baptizedSinceStudying: 3, totalStudents: 5 })];
    const [result] = computeTeacherPerformance(metrics, [teacher1], []);
    expect(result.completedStudies).toBe(12);
    expect(result.fruit).toBe(3);
    expect(result.totalStudents).toBe(5);
    expect(result.name).toBe('John Doe');
  });

  it('computes no-show rate as noShow / (noShow + completed)', () => {
    const metrics = [makeMetrics({ userId: 't1', totalSessionsLed: 2 })];
    const bookings = [
      makeBooking({ id: 'b1', teacherId: 't1', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b2', teacherId: 't1', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b3', teacherId: 't1', status: BookingStatus.COMPLETED }),
      makeBooking({ id: 'b4', teacherId: 't1', status: BookingStatus.COMPLETED }),
      // Other statuses/teachers must not affect the rate.
      makeBooking({ id: 'b5', teacherId: 't1', status: BookingStatus.CANCELLED }),
      makeBooking({ id: 'b6', teacherId: 't2', status: BookingStatus.NO_SHOW }),
    ];
    const [result] = computeTeacherPerformance(metrics, [teacher1], bookings);
    expect(result.noShowRate).toBe(0.5);
  });

  it('no-show rate is 0 when there are no completed/no_show bookings for the teacher', () => {
    const metrics = [makeMetrics({ userId: 't1' })];
    const [result] = computeTeacherPerformance(metrics, [teacher1], []);
    expect(result.noShowRate).toBe(0);
  });

  it('flags high no-show rate only once the volume threshold is met, and not below the rate threshold', () => {
    // Exactly at MIN_BOOKINGS_FOR_NO_SHOW_FLAG (5) with rate > 0.4 (3/5 = 0.6) → fires.
    const metricsHigh = [makeMetrics({ userId: 't1' })];
    const bookingsHigh: Booking[] = [
      makeBooking({ id: 'b1', teacherId: 't1', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b2', teacherId: 't1', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b3', teacherId: 't1', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b4', teacherId: 't1', status: BookingStatus.COMPLETED }),
      makeBooking({ id: 'b5', teacherId: 't1', status: BookingStatus.COMPLETED }),
    ];
    expect(bookingsHigh.length).toBe(MIN_BOOKINGS_FOR_NO_SHOW_FLAG);
    const [resultHigh] = computeTeacherPerformance(metricsHigh, [teacher1], bookingsHigh);
    expect(resultHigh.noShowRate).toBeGreaterThan(HIGH_NO_SHOW_RATE_THRESHOLD);
    expect(resultHigh.anomalies.some((a) => a.startsWith('High no-show rate'))).toBe(true);

    // Below the volume threshold (only 4 qualifying bookings) — same 0.75 rate must NOT fire.
    const metricsLowVolume = [makeMetrics({ userId: 't2' })];
    const bookingsLowVolume: Booking[] = [
      makeBooking({ id: 'b1', teacherId: 't2', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b2', teacherId: 't2', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b3', teacherId: 't2', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b4', teacherId: 't2', status: BookingStatus.COMPLETED }),
    ];
    expect(bookingsLowVolume.length).toBeLessThan(MIN_BOOKINGS_FOR_NO_SHOW_FLAG);
    const [resultLowVolume] = computeTeacherPerformance(metricsLowVolume, [teacher2], bookingsLowVolume);
    expect(resultLowVolume.noShowRate).toBeGreaterThan(HIGH_NO_SHOW_RATE_THRESHOLD);
    expect(resultLowVolume.anomalies.some((a) => a.startsWith('High no-show rate'))).toBe(false);

    // At the volume threshold but rate exactly at (not above) the threshold — must NOT fire.
    const metricsAtRate = [makeMetrics({ userId: 't3' })];
    const bookingsAtRate: Booking[] = [
      makeBooking({ id: 'b1', teacherId: 't3', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b2', teacherId: 't3', status: BookingStatus.NO_SHOW }),
      makeBooking({ id: 'b3', teacherId: 't3', status: BookingStatus.COMPLETED }),
      makeBooking({ id: 'b4', teacherId: 't3', status: BookingStatus.COMPLETED }),
      makeBooking({ id: 'b5', teacherId: 't3', status: BookingStatus.COMPLETED }),
    ];
    const [resultAtRate] = computeTeacherPerformance(metricsAtRate, [teacher3], bookingsAtRate);
    expect(resultAtRate.noShowRate).toBe(HIGH_NO_SHOW_RATE_THRESHOLD);
    expect(resultAtRate.anomalies.some((a) => a.startsWith('High no-show rate'))).toBe(false);
  });

  it('flags unusually high student count above threshold, not at/below it', () => {
    const metricsAbove = [makeMetrics({ userId: 't1', totalStudents: HIGH_STUDENT_COUNT_THRESHOLD + 1 })];
    const [resultAbove] = computeTeacherPerformance(metricsAbove, [teacher1], []);
    expect(resultAbove.anomalies.some((a) => a.startsWith('Unusually high student count'))).toBe(true);

    const metricsAt = [makeMetrics({ userId: 't1', totalStudents: HIGH_STUDENT_COUNT_THRESHOLD })];
    const [resultAt] = computeTeacherPerformance(metricsAt, [teacher1], []);
    expect(resultAt.anomalies.some((a) => a.startsWith('Unusually high student count'))).toBe(false);
  });

  it('flags students assigned with zero completed studies', () => {
    const metrics = [makeMetrics({ userId: 't1', totalStudents: 5, totalSessionsLed: 0 })];
    const [result] = computeTeacherPerformance(metrics, [teacher1], []);
    expect(result.anomalies).toContain('Students assigned but no completed studies');
  });

  it('does not flag zero completed studies when there are also zero students', () => {
    const metrics = [makeMetrics({ userId: 't1', totalStudents: 0, totalSessionsLed: 0 })];
    const [result] = computeTeacherPerformance(metrics, [teacher1], []);
    expect(result.anomalies).not.toContain('Students assigned but no completed studies');
  });

  it('skips metrics rows whose user is not found', () => {
    const metrics = [
      makeMetrics({ userId: 't1', totalSessionsLed: 5 }),
      makeMetrics({ userId: 'ghost', totalSessionsLed: 99 }),
    ];
    const results = computeTeacherPerformance(metrics, [teacher1], []);
    expect(results).toHaveLength(1);
    expect(results[0].userId).toBe('t1');
  });

  it('sorts by completedStudies descending', () => {
    const metrics = [
      makeMetrics({ userId: 't1', totalSessionsLed: 5 }),
      makeMetrics({ userId: 't2', totalSessionsLed: 20 }),
      makeMetrics({ userId: 't3', totalSessionsLed: 10 }),
    ];
    const results = computeTeacherPerformance(metrics, [teacher1, teacher2, teacher3], []);
    expect(results.map((r) => r.userId)).toEqual(['t2', 't3', 't1']);
  });
});

// ---------------------------------------------------------------------------
// computeMemberPerformance
// ---------------------------------------------------------------------------

describe('computeMemberPerformance', () => {
  it('counts contactsCreated by createdBy', () => {
    const contacts = [
      makeContact({ id: 'c1', createdBy: 'm1' }),
      makeContact({ id: 'c2', createdBy: 'm1' }),
      makeContact({ id: 'c3', createdBy: 'm2' }),
    ];
    const results = computeMemberPerformance([member1, member2], contacts);
    const m1Result = results.find((r) => r.userId === 'm1');
    const m2Result = results.find((r) => r.userId === 'm2');
    expect(m1Result?.contactsCreated).toBe(2);
    expect(m2Result?.contactsCreated).toBe(1);
  });

  it('falls back to assignedTeacherId when createdBy is absent', () => {
    const contacts = [
      makeContact({ id: 'c1', createdBy: undefined as unknown as string, assignedTeacherId: 'm1' }),
    ];
    const results = computeMemberPerformance([member1], contacts);
    expect(results.find((r) => r.userId === 'm1')?.contactsCreated).toBe(1);
  });

  it('sums totalSessions across a member\'s contacts as studies', () => {
    const contacts = [
      makeContact({ id: 'c1', createdBy: 'm1', totalSessions: 4 }),
      makeContact({ id: 'c2', createdBy: 'm1', totalSessions: 6 }),
    ];
    const results = computeMemberPerformance([member1], contacts);
    expect(results.find((r) => r.userId === 'm1')?.studies).toBe(10);
  });

  it('flags unusually high contacts created above threshold, not at/below it', () => {
    const aboveContacts = Array.from({ length: HIGH_CONTACTS_CREATED_THRESHOLD + 1 }, (_, i) =>
      makeContact({ id: `above-${i}`, createdBy: 'm1' }),
    );
    const aboveResults = computeMemberPerformance([member1], aboveContacts);
    expect(aboveResults[0].anomalies.some((a) => a.startsWith('Unusually high contacts created'))).toBe(true);

    const atContacts = Array.from({ length: HIGH_CONTACTS_CREATED_THRESHOLD }, (_, i) =>
      makeContact({ id: `at-${i}`, createdBy: 'm2' }),
    );
    const atResults = computeMemberPerformance([member2], atContacts);
    expect(atResults[0].anomalies.some((a) => a.startsWith('Unusually high contacts created'))).toBe(false);
  });

  it('excludes members with no owned contacts', () => {
    const contacts = [makeContact({ id: 'c1', createdBy: 'm1' })];
    const results = computeMemberPerformance([member1, member2], contacts);
    expect(results.map((r) => r.userId)).toEqual(['m1']);
  });

  it('sorts by contactsCreated descending', () => {
    const contacts = [
      makeContact({ id: 'c1', createdBy: 'm1' }),
      makeContact({ id: 'c2', createdBy: 'm2' }),
      makeContact({ id: 'c3', createdBy: 'm2' }),
      makeContact({ id: 'c4', createdBy: 'm2' }),
    ];
    const results = computeMemberPerformance([member1, member2], contacts);
    expect(results.map((r) => r.userId)).toEqual(['m2', 'm1']);
  });
});
