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

// ---------------------------------------------------------------------------
// fitBboxIntoBand — fit a world bounding box into the on-screen frame band.
//
// The /groups toolbar (search bar, top) and the "Drag to pan…" hint (bottom)
// are OVERLAYS floating over a full-bleed canvas — they are not real frame
// edges. So "fit the focused subtree centered vertically, with the search bar
// as the top frame and the pan hint as the bottom frame" means: fit the padded
// bbox into the vertical BAND between those two overlays and center it there,
// using the full available height. The band is given as FRACTIONS of the canvas
// height (topFrac/bottomFrac), which makes the whole thing zoom-invariant — a
// CSS `zoom` scales the canvas, search bar and hint together, so their pixel
// RATIOS are unchanged. Pure (no THREE/React) so the no-clip invariant is
// unit-testable.
// ---------------------------------------------------------------------------

/** The on-screen frame band, measured from the live DOM by the caller. */
export interface FrameBand {
  /** Canvas drawing-surface width/height (same coord space for both — CSS px). */
  viewportW: number;
  viewportH: number;
  /** Fraction of the canvas height the TOP overlay (search/toolbar) covers. */
  topFrac: number;
  /** Fraction of the canvas height the BOTTOM overlay (pan hint) covers. */
  bottomFrac: number;
}

export interface FitBboxOptions {
  /** World extent the node card/avatar sticks ABOVE its center (avatar top). */
  padTop: number;
  /** World extent the card hangs BELOW its center (card bottom). */
  padBottom: number;
  /** World half-padding to add on each side so edge cards don't clip. */
  padSide: number;
  /** Visible world-height per unit camera distance = 2·tan(fov/2). */
  worldPerDist: number;
  /** Min/max camera dolly distance (the reachable OrbitControls range). */
  minDist: number;
  maxDist: number;
  /** No-clip safety margin on the fit distance. Default 1.06. */
  safety?: number;
  /**
   * Extra downward bias on the CENTERED look-at, as a fraction of the visible
   * world height: raises the look-at so the tree drops lower in frame. Corrects
   * the camera rig's downward tilt, which otherwise makes a multi-node bbox
   * appear high. Default 0. (Not applied to the top-anchored/clamped case.)
   */
  liftFrac?: number;
  /**
   * What to do when the bbox is too big to fully fit at `maxDist`:
   *  - 'top'    → anchor the bbox TOP just under the top overlay and let the
   *               rest run off the bottom (user pans down). Default.
   *  - 'center' → still center (the overflow splits top+bottom).
   */
  anchorWhenClamped?: 'top' | 'center';
}

export interface FitResult {
  center: [number, number, number];
  distance: number;
  /** True when the padded bbox could NOT fully fit within the band at maxDist. */
  clamped: boolean;
}

/**
 * Fit `bbox` (node-CENTER bounds) into the band between the top and bottom
 * overlays, centered vertically, padded by the node's world extents so nothing
 * (avatar, hanging card, side cards) clips. Returns the camera look-at center +
 * dolly distance, and whether it had to clamp (didn't fully fit).
 */
export function fitBboxIntoBand(
  bbox: Bounds,
  band: FrameBand,
  opts: FitBboxOptions,
): FitResult {
  const { minX, maxX, minY, maxY } = bbox;
  const centerX = (minX + maxX) / 2;
  // Real visual extent (avatar sticks up; card hangs down).
  const visTop = maxY + opts.padTop;
  const visBottom = minY - opts.padBottom;
  const bboxCenterY = (visTop + visBottom) / 2;
  const worldH = visTop - visBottom;
  const worldW = maxX - minX + opts.padSide;

  const aspect = band.viewportW / Math.max(1, band.viewportH);
  // Fraction of the canvas height available for the tree (between the overlays).
  const usableFrac = Math.max(0.1, 1 - band.topFrac - band.bottomFrac);

  // Smallest distance that fits the padded bbox: height into the usable band,
  // width into the full canvas width. The binding dimension fills edge-to-edge.
  const distForHeight = worldH / (usableFrac * opts.worldPerDist);
  const distForWidth = worldW / (opts.worldPerDist * aspect);
  const safety = opts.safety ?? 1.06;
  const rawDist = Math.max(distForHeight, distForWidth) * safety;
  const distance = Math.min(opts.maxDist, Math.max(opts.minDist, rawDist));
  const clamped = rawDist > opts.maxDist + 1e-6;

  const visH = distance * opts.worldPerDist; // visible world height at this distance

  if (clamped && (opts.anchorWhenClamped ?? 'top') === 'top') {
    // Too big to fit — pin the bbox TOP just under the top overlay; the rest
    // runs off the bottom and the user pans down. A screen point at fraction
    // `topFrac` from the top maps to world Y = lookY + (0.5 - topFrac)·visH.
    const lookY = visTop - (0.5 - band.topFrac) * visH;
    return { center: [centerX, lookY, 0], distance, clamped };
  }

  // Center the bbox in the usable band. The band's center sits below the screen
  // center by (topFrac - bottomFrac)/2 of the height (the top overlay is taller
  // than the bottom one), so bias the look-at up by that same fraction of visH.
  const bandBiasFrac = (band.topFrac - band.bottomFrac) / 2;
  const lookY = bboxCenterY + (bandBiasFrac + (opts.liftFrac ?? 0)) * visH;
  return { center: [centerX, lookY, 0], distance, clamped };
}
