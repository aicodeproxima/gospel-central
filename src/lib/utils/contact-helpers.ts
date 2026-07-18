import type { Contact, User } from '@/lib/types';
import { CURRICULUM_STUDY_COUNT } from '@/lib/curriculum';

/** Sort keys shared by the Contacts page Sort dropdown and the Table view headers. */
export type ContactSortKey = 'name' | 'sessions' | 'stage' | 'updated';

/** "First Last" for a user id, or null if the id is empty / not found. */
export function resolveUserName(users: User[], id?: string | null): string | null {
  if (!id) return null;
  const u = users.find((x) => x.id === id);
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}

/** The User a contact is assigned to (their teacher), or null. */
export function getAssignedTeacher(users: User[], contact: Contact): User | null {
  if (!contact.assignedTeacherId) return null;
  return users.find((u) => u.id === contact.assignedTeacherId) || null;
}

/** Up to-3 resolved preaching-partner names (skips empty/unknown ids). */
export function resolvePartnerNames(users: User[], contact: Contact): string[] {
  return (contact.preachingPartnerIds || [])
    .map((id) => resolveUserName(users, id))
    .filter((n): n is string => !!n);
}

/** Like resolvePartnerNames but keeps each name's ORIGINAL array slot.
 *  Main Branch is strictly `preachingPartnerIds[0]` — after slot 0 is
 *  emptied (stored as null, never compacted), NO partner is Main Branch.
 *  Display code must highlight on `slot === 0`, not on render index
 *  (finding 102: compact-then-highlight silently promoted partner 2). */
export function resolvePartnerSlots(
  users: User[],
  contact: Contact,
): { slot: number; name: string }[] {
  return (contact.preachingPartnerIds || []).flatMap((id, slot) => {
    const name = resolveUserName(users, id);
    return name ? [{ slot, name }] : [];
  });
}

/** Two-letter initials for an avatar fallback. */
export function initialsOf(firstName?: string, lastName?: string): string {
  const a = (firstName || '').trim();
  const b = (lastName || '').trim();
  return `${a ? a[0]! : ''}${b ? b[0]! : ''}`.toUpperCase() || '•';
}

/** "Sermon 17/35" while studying, else null. currentStep = the contact's
 *  current study number in the 35-study curriculum (src/lib/curriculum.ts).
 *  REV3 #14 renamed the curriculum label Step→Sermon; callers pass the
 *  translated word (t('contact.sermon')) — the default keeps non-i18n
 *  callers (exports, tests) working in English. */
export const STUDY_STEP_COUNT = CURRICULUM_STUDY_COUNT;
export function stepLabel(contact: Contact, word: string = 'Sermon'): string | null {
  if (contact.currentStep && contact.currentStep > 0) {
    return `${word} ${Math.min(contact.currentStep, STUDY_STEP_COUNT)}/${STUDY_STEP_COUNT}`;
  }
  return null;
}
