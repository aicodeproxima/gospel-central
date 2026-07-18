import type { AuditLogEntry } from '@/lib/types';
import type { NotificationPreferences } from '@/lib/stores/preferences-store';

/**
 * Alerts (2026-07 overhaul Phase 7) — pure mapping/util layer over the
 * existing audit log. No new data model: this maps AuditLogEntry ->
 * the Settings > Alerts notification toggles that gate it.
 */

export type AlertToggleKey = 'bookingConfirmations' | 'bookingCancellations' | 'contactStageChanges';

/** Map an audit event to the toggle that gates it, or 'account' for events
 *  about the user directly (role/reassign/password/tag/rename) which are always
 *  shown regardless of toggles. */
export function alertCategory(e: AuditLogEntry): AlertToggleKey | 'account' {
  if (e.entityType === 'booking') {
    return e.action === 'cancel' || e.action === 'delete' ? 'bookingCancellations' : 'bookingConfirmations';
  }
  if (e.entityType === 'contact') return 'contactStageChanges';
  return 'account';
}

export function isAlertEnabled(e: AuditLogEntry, n: NotificationPreferences): boolean {
  const c = alertCategory(e);
  return c === 'account' ? true : n[c];
}

/** Events newer than lastSeen that are also enabled by the toggles. */
export function unseenCount(entries: AuditLogEntry[], lastSeenAt: string | null, n: NotificationPreferences): number {
  const cutoff = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  return entries.filter((e) => isAlertEnabled(e, n) && new Date(e.timestamp).getTime() > cutoff).length;
}

export function newestTimestamp(entries: AuditLogEntry[]): string | null {
  return entries.reduce<string | null>((m, e) => (!m || new Date(e.timestamp) > new Date(m) ? e.timestamp : m), null);
}

/**
 * REV3 #16 — resolve WHO/WHAT an audit event acted on, not just who did it.
 * The model already carries entityType/entityId/relatedUserIds/reason; the
 * feed just dropped them. The join happens here so the row component stays
 * dumb. Lookup maps are built client-side from the already-loaded users +
 * contacts lists; an unresolvable id falls back to the raw id (never blank —
 * a wrong-looking id is more debuggable than silence).
 */
export interface AlertTarget {
  /** Human chip for the entity kind, or null for pure account events. */
  entityLabel: string | null;
  /** Display names of who/what the action was on/for (actor excluded). */
  targetNames: string[];
  reason?: string;
}

const ENTITY_LABELS: Partial<Record<AuditLogEntry['entityType'], string>> = {
  booking: 'Booking',
  contact: 'Contact',
  user: 'User',
  group: 'Group',
  area: 'Area',
  room: 'Room',
  blocked_slot: 'Blocked slot',
  role_change: 'Role',
  group_assignment: 'Assignment',
  password_reset: 'Password',
  username_change: 'Username',
};

export function resolveAlertTarget(
  e: AuditLogEntry,
  userNameById: Map<string, string>,
  contactNameById: Map<string, string>,
): AlertTarget {
  const snap = (e.after ?? e.before ?? {}) as Record<string, unknown>;
  const names: string[] = [];
  const push = (n: unknown) => {
    if (typeof n === 'string' && n.trim() && !names.includes(n)) names.push(n);
  };

  const snapName =
    [snap.firstName, snap.lastName].filter((v) => typeof v === 'string' && v).join(' ').trim() ||
    undefined;

  if (e.entityType === 'user' || e.entityType === 'role_change' || e.entityType === 'password_reset' || e.entityType === 'username_change' || e.entityType === 'group_assignment') {
    push(userNameById.get(e.entityId) ?? snapName ?? e.entityId);
  } else if (e.entityType === 'contact') {
    push(contactNameById.get(e.entityId) ?? snapName ?? e.entityId);
  } else if (e.entityType === 'booking') {
    // The booking's own title, then the contact it's for (the "on whom").
    push(snap.title);
    const cid = snap.contactId;
    if (typeof cid === 'string') push(contactNameById.get(cid));
  } else {
    push(snap.name);
  }

  // relatedUserIds = actor + affected users; surface the affected ones the
  // entity resolution didn't already name.
  for (const id of e.relatedUserIds ?? []) {
    if (id === e.userId) continue; // the actor is already on the row
    push(userNameById.get(id));
  }

  return {
    entityLabel: ENTITY_LABELS[e.entityType] ?? null,
    targetNames: names,
    reason: e.reason?.trim() || undefined,
  };
}
