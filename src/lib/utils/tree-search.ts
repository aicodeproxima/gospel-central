import { ROLE_LABELS } from '../types';
import type { OrgNode } from '../types';

export interface SearchEntry {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  groupName?: string;
  /** Full chain from root to this node, e.g. ["Michael", "Gabriel", "Joseph"] */
  ancestors: string[];
  /** Ancestor IDs for expansion */
  ancestorIds: string[];
  /** Lowercase haystack for fuzzy match */
  haystack: string;
}

/**
 * Walk the org tree and build a flat searchable index of every node.
 */
export function buildSearchIndex(roots: OrgNode[]): SearchEntry[] {
  const entries: SearchEntry[] = [];

  const walk = (
    node: OrgNode,
    ancestorNames: string[],
    ancestorIds: string[],
  ) => {
    entries.push({
      id: node.id,
      name: node.name,
      role: node.role,
      roleLabel: ROLE_LABELS[node.role],
      groupName: node.groupName,
      ancestors: [...ancestorNames],
      ancestorIds: [...ancestorIds],
      haystack: `${node.name} ${ROLE_LABELS[node.role]} ${node.groupName || ''} ${ancestorNames.join(' ')}`.toLowerCase(),
    });
    const nextNames = [...ancestorNames, node.name];
    const nextIds = [...ancestorIds, node.id];
    node.children.forEach((c) => walk(c, nextNames, nextIds));
  };

  roots.forEach((r) => walk(r, [], []));
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
