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

  for (const c of contacts) {
    const teacherId = c.assignedTeacherId;
    if (!teacherId) continue;
    const chain = chains.get(teacherId);
    if (!chain) continue; // teacher not in the visible tree
    const teacherEntryName = entries.find((e) => e.id === teacherId)?.name ?? '';
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
      // Name-only on purpose (REV3 #1 + the #3 search spec): metadata matches
      // are what made app search feel random.
      haystack: name.toLowerCase(),
    });
  }

  return entries;
}

/**
 * Score + filter entries by a query string.
 * Returns top N matches sorted by relevance.
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
  limit = 8,
): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of entries) {
    if (!entry.haystack.includes(q)) continue;
    let score = 0;
    // Exact name match — highest
    if (entry.name.toLowerCase() === q) score += 100;
    // Name starts with query — high
    if (entry.name.toLowerCase().startsWith(q)) score += 50;
    // Name contains query
    if (entry.name.toLowerCase().includes(q)) score += 25;
    // Group name match
    if (entry.groupName?.toLowerCase().includes(q)) score += 10;
    // Role match
    if (entry.roleLabel.toLowerCase().includes(q)) score += 5;
    scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
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
  const total = entries.reduce((n, e) => (e.haystack.includes(q) ? n + 1 : n), 0);
  return { entries: searchEntries(entries, query, limit), total };
}
