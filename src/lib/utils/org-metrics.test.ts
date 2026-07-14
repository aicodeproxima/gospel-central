import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectSubtreeUserIds,
  getContactsForSubtree,
  filterRecentlyStudying,
  computeNodeMetrics,
} from './org-metrics';
import { UserRole } from '@/lib/types/user';
import type { OrgNode } from '@/lib/types/group';
import type { Contact } from '@/lib/types/contact';
import { PipelineStage } from '@/lib/types/contact';
import type { TeacherMetrics } from '@/lib/types/user';

// Minimal OrgNode factory — mirrors the one in tree-expansion.test.ts.
const mk = (id: string, children: OrgNode[] = []): OrgNode => ({
  id,
  name: id,
  role: UserRole.MEMBER,
  children,
});

// Fixture: tl → {m1, m2}; m1 → {m1a} (nested descendant).
const m1a = mk('m1a');
const m1 = mk('m1', [m1a]);
const m2 = mk('m2');
const tl = mk('tl', [m1, m2]);

// Contact fixture — partial casts, following the `as unknown as Contact`
// idiom used in permissions.test.ts.
const makeContact = (overrides: Partial<Contact> & Pick<Contact, 'id'>): Contact =>
  ({
    firstName: overrides.id,
    lastName: '',
    totalSessions: 0,
    ...overrides,
  }) as unknown as Contact;

describe('collectSubtreeUserIds', () => {
  it('includes self + all descendants (including nested)', () => {
    expect(collectSubtreeUserIds(tl).sort()).toEqual(['m1', 'm1a', 'm2', 'tl'].sort());
  });

  it('a leaf node returns only itself', () => {
    expect(collectSubtreeUserIds(m2)).toEqual(['m2']);
  });
});

describe('getContactsForSubtree', () => {
  it('returns only contacts whose assignedTeacherId is in the subtree', () => {
    const contacts: Contact[] = [
      makeContact({ id: 'c1', assignedTeacherId: 'tl' }),
      makeContact({ id: 'c2', assignedTeacherId: 'm1' }),
      makeContact({ id: 'c3', assignedTeacherId: 'm1a' }),
      makeContact({ id: 'c4', assignedTeacherId: 'm2' }),
      makeContact({ id: 'c5', assignedTeacherId: 'outsider' }),
      makeContact({ id: 'c6' }), // no assignedTeacherId at all
    ];
    const result = getContactsForSubtree(tl, contacts);
    expect(result.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
});

describe('filterRecentlyStudying', () => {
  const NOW = new Date('2026-07-04T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes when lastSessionDate is within the last 30 days', () => {
    const recentDate = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const contact = makeContact({ id: 'c1', lastSessionDate: recentDate });
    expect(filterRecentlyStudying([contact])).toEqual([contact]);
  });

  it('fails when lastSessionDate is older than 30 days', () => {
    const oldDate = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const contact = makeContact({ id: 'c1', lastSessionDate: oldDate });
    expect(filterRecentlyStudying([contact])).toEqual([]);
  });

  it('falls back to the currentlyStudying flag when lastSessionDate is missing', () => {
    const flaggedTrue = makeContact({ id: 'c1', currentlyStudying: true });
    const flaggedFalse = makeContact({ id: 'c2', currentlyStudying: false });
    const flaggedMissing = makeContact({ id: 'c3' });
    expect(filterRecentlyStudying([flaggedTrue, flaggedFalse, flaggedMissing])).toEqual([flaggedTrue]);
  });
});

describe('computeNodeMetrics', () => {
  const NOW = new Date('2026-07-04T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the extended shape with existing fields unchanged for the fixture', () => {
    const recentDate = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const contacts: Contact[] = [
      makeContact({ id: 'c1', assignedTeacherId: 'tl', totalSessions: 3, lastSessionDate: recentDate }),
      makeContact({ id: 'c2', assignedTeacherId: 'm1', totalSessions: 2, lastSessionDate: oldDate, pipelineStage: PipelineStage.BAPTIZED }),
      makeContact({ id: 'c3', assignedTeacherId: 'm1a', totalSessions: 5, currentlyStudying: true }),
      makeContact({ id: 'c4', assignedTeacherId: 'm2', totalSessions: 1, currentlyStudying: false, pipelineStage: PipelineStage.BAPTIZED }),
      makeContact({ id: 'c5', assignedTeacherId: 'outsider', totalSessions: 99, currentlyStudying: true, pipelineStage: PipelineStage.BAPTIZED }),
    ];

    const teacherMetrics: TeacherMetrics[] = [
      { userId: 'tl', totalStudents: 0, activeStudents: 0, currentlyStudying: 0, continuedStudying: 0, baptizedSinceStudying: 1, totalSessionsLed: 0 },
      { userId: 'm1', totalStudents: 0, activeStudents: 0, currentlyStudying: 0, continuedStudying: 0, baptizedSinceStudying: 2, totalSessionsLed: 0 },
      { userId: 'outsider', totalStudents: 0, activeStudents: 0, currentlyStudying: 0, continuedStudying: 0, baptizedSinceStudying: 100, totalSessionsLed: 0 },
    ];

    const result = computeNodeMetrics(tl, contacts, teacherMetrics);

    // Existing fields — byte-identical computation to before this change.
    // subtreeContacts = c1, c2, c3, c4 (c5 excluded — outsider)
    // recent (within 30 days OR currentlyStudying flag when date missing): c1, c3
    expect(result.currentlyStudying).toBe(2);
    expect(result.totalStudies).toBe(3 + 2 + 5 + 1); // 11
    // Bearing Fruit is now the LIVE count of baptized contacts in the subtree,
    // NOT the static teacherMetrics rollup. c2 + c4 are baptized (subtree); c5 is
    // baptized but outside the subtree (excluded). The teacherMetrics fixture above
    // still totals 3 for the subtree — asserting 2 proves it is no longer used.
    expect(result.bearingFruit).toBe(2);

    // New fields.
    expect(result.totalMembers).toBe(3); // m1, m1a, m2 — excludes tl itself
    expect(result.totalContacts).toBe(4); // c1, c2, c3, c4
  });

  it('totalMembers excludes self and counts nested descendants for a leaf-ish node', () => {
    const result = computeNodeMetrics(m1, [], []);
    expect(result.totalMembers).toBe(1); // only m1a
  });

  it('totalContacts counts contacts assigned anywhere in the subtree, node included', () => {
    const contacts: Contact[] = [
      makeContact({ id: 'c1', assignedTeacherId: 'm2' }),
      makeContact({ id: 'c2', assignedTeacherId: 'tl' }),
      makeContact({ id: 'c3', assignedTeacherId: 'not-in-tree' }),
    ];
    const result = computeNodeMetrics(tl, contacts, []);
    expect(result.totalContacts).toBe(2);
  });
});
