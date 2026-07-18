import { ROLE_LABELS } from '../types';
import type { OrgNode } from '../types';
import type { Contact } from '../types/contact';

export interface SearchEntry {
  id: string;
  /** 'user' = an org-tree node; 'contact' = a contact leaf under its teacher
   *  (REV3 #1: contacts render in the tree, so search must resolve them). */
  kind: 'user' | 'contact';
  name: string;
  role: string;
  roleLabel: string;
  groupName?: string;
  /** Full chain from root to this node, e.g. ["Michael", "Gabriel", "Joseph"] */
  ancestors: string[];
  /** Ancestor IDs for expansion. For a contact this INCLUDES its assigned
   *  teacher (the leaf renders only when the teacher itself is expanded). */
  ancestorIds: string[];
  /** For kind 'contact': the assigned teacher's node id (focus target). */
  teacherId?: string;
  /** For kind 'contact': preaching-partner display names (the contact's
   *  "Branches") — the tier-2 match per the REV3 #3 user spec. */
  partnerNames?: string[];
  /** Lowercase haystack for fuzzy match */
  haystack: string;
}

/**
 * Walk the org tree and build a flat searchable index of every node, plus an
 * entry per contact (name-only haystack) parented under its assigned teacher.
 */
export function buildSearchIndex(roots: OrgNode[], contacts: Contact[] = []): SearchEntry[] {
  const entries: SearchEntry[] = [];
  // teacher node id -> its full ancestor chain (for contact expansion paths)
  const chains = new Map<string, { names: string[]; ids: string[] }>();

  const walk = (
    node: OrgNode,
    ancestorNames: string[],
    ancestorIds: string[],
  ) => {
    entries.push({
      id: node.id,
      kind: 'user',
      name: node.name,
      role: node.role,
      roleLabel: ROLE_LABELS[node.role],
      groupName: node.groupName,
      ancestors: [...ancestorNames],
      ancestorIds: [...ancestorIds],
      haystack: `${node.name} ${ROLE_LABELS[node.role]} ${node.groupName || ''} ${ancestorNames.join(' ')}`.toLowerCase(),
    });
    chains.set(node.id, { names: ancestorNames, ids: ancestorIds });
    const nextNames = [...ancestorNames, node.name];
    const nextIds = [...ancestorIds, node.id];
    node.children.forEach((c) => walk(c, nextNames, nextIds));
  };

  roots.forEach((r) => walk(r, [], []));

  const nameById = new Map(entries.map((e) => [e.id, e.name]));
  for (const c of contacts) {
    const teacherId = c.assignedTeacherId;
    if (!teacherId) continue;
    const chain = chains.get(teacherId);
    if (!chain) continue; // teacher not in the visible tree
    const teacherEntryName = nameById.get(teacherId) ?? '';
    const name = `${c.firstName} ${c.lastName}`.trim();
    entries.push({
      id: c.id,
      kind: 'contact',
      name,
      role: 'contact',
      roleLabel: 'Contact',
      groupName: c.groupName,
      ancestors: [...chain.names, teacherEntryName].filter(Boolean),
      // Include the teacher itself: expanding this path makes the leaf visible.
      ancestorIds: [...chain.ids, teacherId],
      teacherId,
      partnerNames: (c.preachingPartnerIds ?? [])
        .filter((id): id is string => !!id)
        .map((id) => nameById.get(id))
        .filter((n): n is string => !!n),
      // Name-only on purpose (REV3 #1 + the #3 search spec): metadata matches
      // are what made app search feel random.
      haystack: name.toLowerCase(),
    });
  }

  return entries;
}

/**
 * REV3 #3 (user spec 2026-07-17) — TIERED PREFIX matching, replacing the old
 * metadata-substring scoring ("iel" matched Gabriel mid-name; "Newport"
 * returned people via church/ancestor metadata with no visible reason):
 *   Tier 1: entries whose NAME starts with the query — alphabetical.
 *   Tier 2: contacts whose preaching-PARTNER name starts with the query —
 *           following tier 1, alphabetical.
 * No role/church/ancestor matching in the default path.
 */
function tieredMatch(entries: SearchEntry[], q: string): SearchEntry[] {
  const byName = (a: SearchEntry, b: SearchEntry) => a.name.localeCompare(b.name);
  const tier1 = entries.filter((e) => e.name.toLowerCase().startsWith(q)).sort(byName);
  const tier2 = entries
    .filter(
      (e) =>
        !e.name.toLowerCase().startsWith(q) &&
        (e.partnerNames ?? []).some((p) => p.toLowerCase().startsWith(q)),
    )
    .sort(byName);
  return [...tier1, ...tier2];
}

export function searchEntries(
  entries: SearchEntry[],
  query: string,
  limit = 8,
): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tieredMatch(entries, q).slice(0, limit);
}

/**
 * searchEntries + the pre-slice match count, so dropdowns can render an
 * overflow hint instead of silently truncating (finding 349: a role search
 * matching 18 people showed 10 with no indication more existed).
 */
export function searchEntriesWithTotal(
  entries: SearchEntry[],
  query: string,
  limit = 8,
): { entries: SearchEntry[]; total: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { entries: [], total: 0 };
  const all = tieredMatch(entries, q);
  return { entries: all.slice(0, limit), total: all.length };
}
