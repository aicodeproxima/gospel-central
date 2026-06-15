/**
 * Pure geometry helper for the Groups 3D tree's "Expand all" camera framing.
 *
 * The tree is laid out top-down: the root card sits at the HIGHEST `y`, and each
 * step down the hierarchy drops lower. A full-tree fit therefore centers on the
 * vertical MIDDLE of the bounding box — which on a tall, fully-expanded org is
 * the member band, stranding the user there with the root off-screen above.
 *
 * NOTE: we frame by Y, not by hierarchy depth. `tree-layout.ts` ROW-WRAPS wide
 * sibling sets onto stacked rows that drop further down, so same-depth nodes are
 * NOT at the same height — a branch leader in a wrapped row can sink below
 * members of an earlier branch. A depth filter therefore spans the whole tree;
 * a Y-band ("everything within `bandHeight` world units of the topmost node")
 * reliably captures the visual TOP of the org. The camera consumer then anchors
 * the root near the top of the view so the user reads top-down and pans to drill
 * in. Kept pure (no THREE/React) so the "top, not middle" invariant is testable.
 */

/** Minimal structural shape this helper needs from a `LaidOutNode`. */
export interface FocusableNode {
  id: string;
  x: number;
  y: number;
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
 * Bounding box of every node whose `y` is within `bandHeight` world units of the
 * topmost node (`maxY - bandHeight <= y <= maxY`), plus the contacts in that band
 * that are owned by an in-band node. The root(s) sit at the top, so they are
 * always included. Returns null if there are no nodes.
 */
export function topBandBounds(
  nodes: readonly FocusableNode[],
  contacts: readonly FocusableContact[],
  bandHeight: number,
): Bounds | null {
  if (nodes.length === 0) return null;
  let topY = -Infinity;
  for (const n of nodes) if (n.y > topY) topY = n.y;
  const cutoff = topY - bandHeight;

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
    if (n.y >= cutoff) {
      inFrame.add(n.id);
      acc(n.x, n.y);
    }
  }
  // inFrame is complete after the node pass, so contacts can be filtered by owner.
  for (const c of contacts) {
    if (c.y >= cutoff && inFrame.has(c.parentId)) acc(c.x, c.y);
  }

  if (count === 0) return null;
  return { minX, maxX, minY, maxY };
}
