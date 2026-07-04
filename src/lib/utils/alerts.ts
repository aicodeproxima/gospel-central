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
