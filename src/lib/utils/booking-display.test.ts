/**
 * Pins the booking DISPLAY derivation helpers (2026-07 overhaul, Decision C):
 * card color from the teacher's Brother/Sister tag, baptism top-border from
 * the linked contact's LIVE status (falling back to the stored type), and the
 * activity-group/zoom/baptism splits of the internal BookingType.
 */

import { describe, expect, test } from 'vitest';
import {
  activityGroupOf,
  isZoomType,
  isBaptizedType,
  genderOf,
  getBookingCardColor,
  getBaptismBorder,
  bookingStatusI18nKey,
} from './booking-display';
import { BookingStatus, BookingType, type Booking } from '../types/booking';
import { PipelineStage, ContactStatus, type Contact } from '../types/contact';
import { scenarioUsers } from '@/mocks/scenario-church-week';

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: 'b-test',
    roomId: 'r',
    areaId: 'a',
    type: BookingType.UNBAPTIZED_CONTACT,
    title: 't',
    startTime: '2027-01-05T10:00:00Z',
    endTime: '2027-01-05T11:00:00Z',
    createdBy: 'u',
    participants: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Booking;

const contact = (stage: PipelineStage): Contact =>
  ({
    id: 'c-test',
    firstName: 'C',
    lastName: 'T',
    type: BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    pipelineStage: stage,
    totalSessions: 0,
    createdBy: 'u',
    createdAt: '',
    updatedAt: '',
  }) as Contact;

describe('activity group / zoom / baptism splits', () => {
  test('groups', () => {
    expect(activityGroupOf(BookingType.GROUP_ACTIVITIES)).toBe('group');
    expect(activityGroupOf(BookingType.TEAM_ACTIVITIES)).toBe('team');
    expect(activityGroupOf(BookingType.UNBAPTIZED_CONTACT)).toBe('bible_study');
    expect(activityGroupOf(BookingType.BAPTIZED_ZOOM)).toBe('bible_study');
  });
  test('zoom + baptism facts', () => {
    expect(isZoomType(BookingType.UNBAPTIZED_ZOOM)).toBe(true);
    expect(isZoomType(BookingType.BAPTIZED_IN_PERSON)).toBe(false);
    expect(isBaptizedType(BookingType.BAPTIZED_PERSECUTED)).toBe(true);
    expect(isBaptizedType(BookingType.UNBAPTIZED_CONTACT)).toBe(false);
  });
});

describe('genderOf (Decision 4 input)', () => {
  test('explicit gender field wins', () => {
    expect(genderOf({ firstName: 'Anyone', gender: 'sister' })).toBe('sister');
    expect(genderOf({ firstName: 'Anyone', gender: 'brother' })).toBe('brother');
  });

  test('falls back to name inference when the field is unset', () => {
    // Self-validating against the seed: every seeded user's stored gender was
    // derived from the same inference, so stripping the field must round-trip.
    const sister = scenarioUsers.find((u) => u.gender === 'sister')!;
    const brother = scenarioUsers.find((u) => u.gender === 'brother')!;
    expect(genderOf({ firstName: sister.firstName, gender: undefined })).toBe('sister');
    expect(genderOf({ firstName: brother.firstName, gender: undefined })).toBe('brother');
  });

  test('null/undefined user defaults to brother', () => {
    expect(genderOf(null)).toBe('brother');
    expect(genderOf(undefined)).toBe('brother');
  });
});

describe('getBookingCardColor (Decision 4: teacher tag → blue/pink)', () => {
  test('brother → blue classes, sister → pink classes', () => {
    expect(getBookingCardColor({ firstName: 'X', gender: 'brother' }).bgColor).toContain('blue');
    expect(getBookingCardColor({ firstName: 'X', gender: 'sister' }).bgColor).toContain('pink');
    expect(getBookingCardColor({ firstName: 'X', gender: 'sister' }).label).toBe('Sister');
  });
});

describe('getBaptismBorder (contact LIVE status wins over stored type)', () => {
  test('non-study activities get no border', () => {
    expect(getBaptismBorder(booking({ type: BookingType.GROUP_ACTIVITIES }))).toBeNull();
    expect(getBaptismBorder(booking({ type: BookingType.TEAM_ACTIVITIES }))).toBeNull();
  });

  test('linked contact overrides the type-derived fact', () => {
    // Booking stored as UNBAPTIZED, but the contact has since been baptized:
    // the border must reflect the live status.
    expect(
      getBaptismBorder(booking({ type: BookingType.UNBAPTIZED_CONTACT }), contact(PipelineStage.BAPTIZED)),
    ).toBe('baptized');
    expect(
      getBaptismBorder(booking({ type: BookingType.BAPTIZED_IN_PERSON }), contact(PipelineStage.POTENTIAL)),
    ).toBe('unbaptized');
  });

  test('no linked contact → falls back to the stored type', () => {
    expect(getBaptismBorder(booking({ type: BookingType.BAPTIZED_ZOOM }))).toBe('baptized');
    expect(getBaptismBorder(booking({ type: BookingType.UNBAPTIZED_ZOOM }))).toBe('unbaptized');
  });
});

describe('bookingStatusI18nKey (Phase 3: status line labels)', () => {
  test('study bookings use the study labels; missing status = scheduled default', () => {
    expect(bookingStatusI18nKey(booking({}))).toBe('bstatus.bible_study');
    expect(bookingStatusI18nKey(booking({ status: BookingStatus.COMPLETED }))).toBe(
      'bstatus.completed',
    );
    expect(bookingStatusI18nKey(booking({ status: BookingStatus.CANCELLED }))).toBe(
      'bstatus.cancelled',
    );
  });

  test('non-study activities use the neutral variants where they differ', () => {
    const committee = { type: BookingType.TEAM_ACTIVITIES } as const;
    expect(bookingStatusI18nKey({ ...committee, status: undefined })).toBe(
      'bstatus.ns.bible_study', // renders "Scheduled"
    );
    expect(bookingStatusI18nKey({ ...committee, status: BookingStatus.COMPLETED })).toBe(
      'bstatus.ns.completed',
    );
    // No neutral variant needed for these — same wording either way.
    expect(bookingStatusI18nKey({ ...committee, status: BookingStatus.NO_SHOW })).toBe(
      'bstatus.no_show',
    );
    expect(bookingStatusI18nKey({ ...committee, status: BookingStatus.RESCHEDULED })).toBe(
      'bstatus.rescheduled',
    );
  });
});
