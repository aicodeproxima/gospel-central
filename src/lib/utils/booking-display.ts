/**
 * Booking DISPLAY derivation helpers (2026-07 overhaul, Decision C).
 *
 * `BookingType` stays as internal storage (it encodes activity group × mode ×
 * baptism), but the UI no longer colors/labels by it. The new display axes:
 *   - card color   = teacher/leader's Brother/Sister tag (blue/pink)
 *   - top border   = contact baptism status (blue baptized / red unbaptized)
 *   - status line  = BookingStatus (BOOKING_STATUS_CONFIG in types/booking.ts)
 * Every UI consumer should derive through these helpers, never through
 * BOOKING_TYPE_CONFIG (deprecated for display).
 */

import { BookingType, type Booking } from '@/lib/types/booking';
import type { Contact } from '@/lib/types/contact';
import { PipelineStage } from '@/lib/types/contact';
import type { User, UserGender } from '@/lib/types/user';
import { isFemaleFirstName } from '@/lib/avatars';

export type ActivityGroup = 'bible_study' | 'group' | 'team';

/** Which activity family a stored BookingType belongs to. */
export function activityGroupOf(type: BookingType): ActivityGroup {
  switch (type) {
    case BookingType.GROUP_ACTIVITIES:
      return 'group';
    case BookingType.TEAM_ACTIVITIES:
      return 'team';
    default:
      return 'bible_study';
  }
}

export function isZoomType(type: BookingType): boolean {
  return type === BookingType.UNBAPTIZED_ZOOM || type === BookingType.BAPTIZED_ZOOM;
}

/** Baptism fact encoded in the stored type (fallback when no contact is linked). */
export function isBaptizedType(type: BookingType): boolean {
  return (
    type === BookingType.BAPTIZED_IN_PERSON ||
    type === BookingType.BAPTIZED_ZOOM ||
    type === BookingType.BAPTIZED_PERSECUTED
  );
}

/**
 * A user's Brother/Sister tag, falling back to first-name inference for
 * records seeded/created before the gender field existed.
 */
export function genderOf(user: Pick<User, 'firstName' | 'gender'> | null | undefined): UserGender {
  if (!user) return 'brother';
  if (user.gender) return user.gender;
  return isFemaleFirstName(user.firstName) ? 'sister' : 'brother';
}

/** Card colors: Blue for Brothers, Pink for Sisters (Decision 4: keyed to the teacher/leader). */
export const CARD_COLOR_CONFIG: Record<
  UserGender,
  { label: string; color: string; bgColor: string }
> = {
  brother: {
    label: 'Brother',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/20 border-blue-500/40',
  },
  sister: {
    label: 'Sister',
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-500/20 border-pink-500/40',
  },
};

/** Booking-card color classes from the teacher/leader (NOT the booking creator). */
export function getBookingCardColor(teacher: Pick<User, 'firstName' | 'gender'> | null | undefined) {
  return CARD_COLOR_CONFIG[genderOf(teacher)];
}

export type BaptismBorder = 'baptized' | 'unbaptized' | null;

/**
 * Baptism top-border for a booking card: blue = baptized, red = unbaptized,
 * null = not a contact study (no border). Prefers the linked contact's LIVE
 * status; falls back to the baptism fact stored in the booking type.
 */
export function getBaptismBorder(booking: Booking, contact?: Contact | null): BaptismBorder {
  if (activityGroupOf(booking.type) !== 'bible_study') return null;
  if (contact) {
    return contact.pipelineStage === PipelineStage.BAPTIZED ? 'baptized' : 'unbaptized';
  }
  return isBaptizedType(booking.type) ? 'baptized' : 'unbaptized';
}

export const BAPTISM_BORDER_CLASS: Record<Exclude<BaptismBorder, null>, string> = {
  baptized: 'border-t-2 border-t-blue-500',
  unbaptized: 'border-t-2 border-t-red-500',
};
