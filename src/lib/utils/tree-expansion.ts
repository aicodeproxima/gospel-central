import type { OrgNode } from '@/lib/types/group';
import { collectSubtreeUserIds } from './org-metrics';

/**
 * Expansion-state helpers that keep the org-tree's `expandedIds` set
 * ANCESTOR-CLOSED — a node id is only ever in the set if its parent is too.
 *
 * The flat Set used to keep a collapsed node's descendant ids around, so
 * re-expanding replayed the whole deep path down to members. These helpers make
 * collapse forget everything below, and give Search/Jump a single "isolate to a
 * path" primitive — one consistent model for every expander.
 */

/**
 * Toggle a node's expansion while preserving the ancestor-closed invariant.
 *
 * - EXPAND: add the node id. Its ancestors are already in the set (you can only
 *   toggle a VISIBLE node, whose parent chain is expanded), so a bare add keeps
 *   the invariant. `ancestorIds` is optional insurance for any future caller that
 *   toggles a non-visible node (keyboard shortcut, deep link) — harmless when
 *   omitted.
 * - COLLAPSE: remove the node id AND every descendant id, so re-expanding later
 *   shows only the immediate children (no resume memory).
 *
 * Pure — returns a new Set; never mutates the input.
 */
export function toggleExpanded(
  expanded: ReadonlySet<string>,
  id: string,
  node: OrgNode,
  ancestorIds?: readonly string[],
): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) {
    // collapse → prune self + all descendant org-node ids
    for (const sub of collectSubtreeUserIds(node)) next.delete(sub);
  } else {
    // expand → add the node (and any supplied ancestors, defensively)
    if (ancestorIds) for (const a of ancestorIds) next.add(a);
    next.add(id);
  }
  return next;
}

/**
 * Replace the expansion set with EXACTLY the target's ancestor path. The target
 * itself is intentionally excluded → it lands collapsed. Used by Search and Jump
 * so navigating to a person isolates just the path to them (everything else
 * collapses). Ancestor-closed by construction (the ids form a root→…→parent chain).
 */
export function isolatePath(ancestorIds: readonly string[]): Set<string> {
  return new Set(ancestorIds);
}

/**
 * Like isolatePath, but the TARGET is included so the found person lands
 * EXPANDED — their children/contacts are immediately visible (packet: "org
 * search auto-expands the person's children/fruits"). Ancestor-closed by
 * construction: ancestors ∪ target forms a root→…→target chain.
 */
export function expandPath(ancestorIds: readonly string[], targetId: string): Set<string> {
  return new Set([...ancestorIds, targetId]);
}
