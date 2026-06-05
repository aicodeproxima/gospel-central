import type { Contact, User } from '@/lib/types';

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

/** Two-letter initials for an avatar fallback. */
export function initialsOf(firstName?: string, lastName?: string): string {
  const a = (firstName || '').trim();
  const b = (lastName || '').trim();
  return `${a ? a[0]! : ''}${b ? b[0]! : ''}`.toUpperCase() || '•';
}

/** Bible-study curriculum has 5 numbered steps. "Step 3/5" while studying, else null. */
export const STUDY_STEP_COUNT = 5;
export function stepLabel(contact: Contact): string | null {
  if (contact.currentStep && contact.currentStep > 0) {
    return `Step ${Math.min(contact.currentStep, STUDY_STEP_COUNT)}/${STUDY_STEP_COUNT}`;
  }
  return null;
}
