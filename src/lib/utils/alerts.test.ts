import { describe, it, expect } from 'vitest';
import { alertCategory, isAlertEnabled, unseenCount, newestTimestamp } from './alerts';
import type { AuditLogEntry } from '@/lib/types';
import type { NotificationPreferences } from '@/lib/stores/preferences-store';

const mk = (overrides: Partial<AuditLogEntry> & Pick<AuditLogEntry, 'entityType' | 'action'>): AuditLogEntry =>
  ({
    id: 'e1',
    userId: 'u1',
    userName: 'Test User',
    entityId: 'x1',
    details: 'did a thing',
    timestamp: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }) as AuditLogEntry;

const ALL_ON: NotificationPreferences = {
  bookingConfirmations: true,
  bookingCancellations: true,
  contactStageChanges: true,
  weeklySummary: true,
};

describe('alertCategory', () => {
  it('maps booking create -> bookingConfirmations', () => {
    expect(alertCategory(mk({ entityType: 'booking', action: 'create' }))).toBe('bookingConfirmations');
  });

  it('maps booking update -> bookingConfirmations', () => {
    expect(alertCategory(mk({ entityType: 'booking', action: 'update' }))).toBe('bookingConfirmations');
  });

  it('maps booking cancel -> bookingCancellations', () => {
    expect(alertCategory(mk({ entityType: 'booking', action: 'cancel' }))).toBe('bookingCancellations');
  });

  it('maps booking delete -> bookingCancellations', () => {
    expect(alertCategory(mk({ entityType: 'booking', action: 'delete' }))).toBe('bookingCancellations');
  });

  it('maps contact events -> contactStageChanges', () => {
    expect(alertCategory(mk({ entityType: 'contact', action: 'update' }))).toBe('contactStageChanges');
  });

  it('maps user role_change -> account (always enabled)', () => {
    expect(alertCategory(mk({ entityType: 'user', action: 'role_change' }))).toBe('account');
  });

  it('maps other entity types (group, tag, etc.) -> account', () => {
    expect(alertCategory(mk({ entityType: 'group', action: 'reassign' }))).toBe('account');
    expect(alertCategory(mk({ entityType: 'tag', action: 'tag_grant' }))).toBe('account');
  });
});

describe('isAlertEnabled', () => {
  it('account-category events are always enabled regardless of toggles', () => {
    const allOff: NotificationPreferences = {
      bookingConfirmations: false,
      bookingCancellations: false,
      contactStageChanges: false,
      weeklySummary: false,
    };
    expect(isAlertEnabled(mk({ entityType: 'user', action: 'role_change' }), allOff)).toBe(true);
  });

  it('respects a disabled toggle for its category', () => {
    const prefs: NotificationPreferences = { ...ALL_ON, contactStageChanges: false };
    expect(isAlertEnabled(mk({ entityType: 'contact', action: 'update' }), prefs)).toBe(false);
  });

  it('respects an enabled toggle for its category', () => {
    expect(isAlertEnabled(mk({ entityType: 'booking', action: 'create' }), ALL_ON)).toBe(true);
  });
});

describe('unseenCount', () => {
  const entries: AuditLogEntry[] = [
    mk({ id: 'a', entityType: 'booking', action: 'create', timestamp: '2026-07-01T00:00:00.000Z' }),
    mk({ id: 'b', entityType: 'contact', action: 'update', timestamp: '2026-07-02T00:00:00.000Z' }),
    mk({ id: 'c', entityType: 'user', action: 'role_change', timestamp: '2026-07-03T00:00:00.000Z' }),
  ];

  it('counts all enabled entries when lastSeenAt is null', () => {
    expect(unseenCount(entries, null, ALL_ON)).toBe(3);
  });

  it('respects the cutoff — only entries strictly newer than lastSeenAt count', () => {
    expect(unseenCount(entries, '2026-07-01T00:00:00.000Z', ALL_ON)).toBe(2);
    expect(unseenCount(entries, '2026-07-03T00:00:00.000Z', ALL_ON)).toBe(0);
  });

  it('respects a disabled toggle even for events newer than the cutoff', () => {
    const prefs: NotificationPreferences = { ...ALL_ON, contactStageChanges: false };
    // entry 'b' (contact) is newer than lastSeenAt but its toggle is off.
    expect(unseenCount(entries, '2026-07-01T00:00:00.000Z', prefs)).toBe(1);
  });
});

describe('newestTimestamp', () => {
  it('picks the max timestamp among entries', () => {
    const entries: AuditLogEntry[] = [
      mk({ id: 'a', entityType: 'booking', action: 'create', timestamp: '2026-07-01T00:00:00.000Z' }),
      mk({ id: 'b', entityType: 'contact', action: 'update', timestamp: '2026-07-03T00:00:00.000Z' }),
      mk({ id: 'c', entityType: 'user', action: 'role_change', timestamp: '2026-07-02T00:00:00.000Z' }),
    ];
    expect(newestTimestamp(entries)).toBe('2026-07-03T00:00:00.000Z');
  });

  it('returns null for an empty list', () => {
    expect(newestTimestamp([])).toBeNull();
  });
});
