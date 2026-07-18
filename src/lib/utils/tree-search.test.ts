import { describe, it, expect } from 'vitest';
import { buildSearchIndex, searchEntries } from './tree-search';
import { fullPrefixRange } from './text-match';
import type { OrgNode } from '../types';
import type { Contact } from '../types/contact';

/**
 * REV3 #3 — the user-specced search semantics (2026-07-17), pinned:
 *   tier 1: NAME starts with the query, alphabetical;
 *   tier 2: a preaching-PARTNER's name starts with it, following, alphabetical;
 *   metadata (church/role/ancestors) matches NOTHING by default.
 */

const node = (id: string, name: string, role: string, children: OrgNode[] = [], groupName?: string): OrgNode =>
  ({ id, name, role, groupName, children }) as unknown as OrgNode;

const contact = (id: string, first: string, last: string, teacherId: string, partners: string[] = []): Contact =>
  ({
    id,
    firstName: first,
    lastName: last,
    assignedTeacherId: teacherId,
    preachingPartnerIds: partners,
    groupName: 'Newport News Zion',
  }) as unknown as Contact;

const roots = [
  node('u-root', 'Michael', 'dev', [
    node('u-joseph', 'Joseph', 'branch_leader', [node('u-barnabas', 'Barnabas', 'team_leader')], 'Newport News Zion'),
  ]),
];

const contacts = [
  contact('c-abidan', 'Abidan', 'Ben-Gideoni', 'u-joseph', ['u-barnabas']),
  contact('c-ben', 'Ben', 'Adam', 'u-joseph'),
];

describe('tiered prefix search (REV3 #3)', () => {
  const index = buildSearchIndex(roots, contacts);

  it('tier 1 is full-name prefix only — "b" must NOT match Abidan via his surname', () => {
    const names = searchEntries(index, 'b').map((e) => e.name);
    // Tier 1 alphabetical: Barnabas (user), Ben Adam (contact).
    // Tier 2 following: Abidan Ben-Gideoni via partner Barnabas.
    expect(names).toEqual(['Barnabas', 'Ben Adam', 'Abidan Ben-Gideoni']);
  });

  it('tier-2 entries carry the partner that matched', () => {
    const abidan = searchEntries(index, 'barn').find((e) => e.id === 'c-abidan');
    expect(abidan?.partnerNames).toContain('Barnabas');
  });

  it('metadata never matches: church and role labels return nothing', () => {
    expect(searchEntries(index, 'newport')).toEqual([]);
    expect(searchEntries(index, 'branch leader')).toEqual([]);
  });

  it('mid-name substrings no longer match ("iel" vs Gabriel-style names)', () => {
    const withGabriel = buildSearchIndex([node('u-g', 'Gabriel', 'overseer')], []);
    expect(searchEntries(withGabriel, 'iel')).toEqual([]);
    expect(searchEntries(withGabriel, 'gab').map((e) => e.name)).toEqual(['Gabriel']);
  });
});

describe('fullPrefixRange', () => {
  it('returns the prefix range only when the FULL label starts with the query', () => {
    expect(fullPrefixRange('Abidan Ben-Gideoni', 'ab')).toEqual([{ start: 0, end: 2 }]);
    expect(fullPrefixRange('Abidan Ben-Gideoni', 'ben')).toBeNull();
    expect(fullPrefixRange('Abidan Ben-Gideoni', '')).toBeNull();
  });
});
