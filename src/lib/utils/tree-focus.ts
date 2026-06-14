/**
 * Pure geometry helper for the Groups 3D tree's "Expand all" camera framing.
 *
 * The tree is laid out top-down: root cards sit at the HIGHEST `y`, and each
 * deeper level drops lower. A full-tree fit therefore centers on the vertical
 * MIDDLE of the bounding box — which on a tall, fully-expanded org is the
 * member band, stranding the user there with the root off-screen above.
 *
 * `topLevelsBounds` returns the bounding box of just the TOP `maxDepth` levels
 * (root depth 0 .. maxDepth) plus any contacts owned by an in-frame node, so the
 * camera can frame the org's leadership "shape" and let the user pan/scroll down
 * to drill in. Kept pure (no THREE/React) so the "top, not middle" invariant is
 * unit-testable — the distance/center math that consumes this stays in Tree3D.
 */

/** Minimal structural shape this helper needs from a `LaidOutNode`. */
export interface FocusableNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

/** Minimal structural shape this helper needs from a `LaidOutContact`. */
export interface FocusableContact {
  x: number;
  y: number;
  /** Id of the node this contact hangs under. */
  parentId: string;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Bounding box of nodes with `depth <= min(maxDepth, layoutMaxDepth)` plus the
 * contacts owned by those nodes. Depth 0 (roots) is always included — so a
 * multi-root tree's frame spans every root. Returns null if nothing qualifies.
 *
 * @param layoutMaxDepth the deepest level actually present (e.g. layout.bounds.maxDepth);
 *   clamps `maxDepth` so a shallow org still frames its whole self instead of
 *   degenerating to a 1-card box.
 */
export function topLevelsBounds(
  nodes: readonly FocusableNode[],
  contacts: readonly FocusableContact[],
  maxDepth: number,
  layoutMaxDepth: number,
): Bounds | null {
  const cap = Math.min(maxDepth, layoutMaxDepth);
  const inFrame = new Set<string>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    count++;
  };

  for (const n of nodes) {
    if (n.depth <= cap) {
      inFrame.add(n.id);
      acc(n.x, n.y);
    }
  }
  // inFrame is complete after the node pass, so contacts can be filtered by owner.
  for (const c of contacts) {
    if (inFrame.has(c.parentId)) acc(c.x, c.y);
  }

  if (count === 0) return null;
  return { minX, maxX, minY, maxY };
}
