import type { Contact, OrgNode } from '../types';

/**
 * 3D-friendly tidy tree layout with ROW WRAPPING.
 *
 * Each subtree is laid out bottom-up: we first compute its "width" and
 * "height" in world units assuming any crowded row will wrap onto multiple
 * vertical rows beneath its parent. Then we position each node using that
 * pre-computed geometry.
 *
 * Row wrapping kicks in when a parent has more than MAX_COLS_PER_ROW
 * children. Those children get distributed over multiple stacked rows.
 * Each row's grandchildren are offset further down so they don't crash
 * into the next row of their aunts and uncles.
 */

export interface LaidOutNode {
  id: string;
  node: OrgNode;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
}

export interface LaidOutContact {
  id: string;
  contact: Contact;
  x: number;
  y: number;
  parentId: string;
}

export interface TreeLayout {
  nodes: LaidOutNode[];
  contacts: LaidOutContact[];
  edges: Array<{ from: string; to: string }>;
  bounds: { minX: number; maxX: number; maxDepth: number };
}

// NODE_SCALE — SINGLE SOURCE OF TRUTH for the enlarged-node experiment
// (2026-06-19). Tree3D imports this and derives the card/avatar/platform sizes +
// framing pads from it; the gaps below scale by the SAME factor, so the enlarged
// cards (card world width 5.4*NODE_SCALE / 4.8*NODE_SCALE in Tree3D) always stay
// below HORIZONTAL_GAP (7*NODE_SCALE) → siblings can never overlap at any value.
// Set to 1 to revert to the original sizing. (Invariant pinned by tree-layout.test.ts.)
export const NODE_SCALE = 1.5;

// Tight gaps — G3 tightening (2026-07-04): base H 7→6.2, LEVEL 8→7, ROW 5→4.5.
// Invariants pinned by tree-layout.test.ts: the widest card (5.4 base) stays
// narrower than HORIZONTAL_GAP, and a node's vertical extent
// (NODE_WORLD_TOP + NODE_WORLD_DROP = 6.1 base) stays inside LEVEL_GAP.
export const HORIZONTAL_GAP = 6.2 * NODE_SCALE;
export const LEVEL_GAP = 7 * NODE_SCALE; // vertical gap between tree levels
export const CONTACT_GAP = 3.5 * NODE_SCALE; // vertical gap between contact GRID rows
const MAX_COLS_PER_ROW = 3; // wrap children onto new rows beyond this count
export const ROW_GAP = 4.5 * NODE_SCALE; // extra vertical gap between wrapped rows of siblings

// A node's world extents around its layout point — avatar sticks up
// NODE_WORLD_TOP above center, the hanging DOM card reaches NODE_WORLD_DROP
// below. SINGLE SOURCE for layout collision math AND Tree3D's camera-framing
// pads (Tree3D imports these; keep them here so gaps and extents can never
// drift apart — same rationale as NODE_SCALE).
export const NODE_WORLD_TOP = 2.1 * NODE_SCALE;
export const NODE_WORLD_DROP = 4.0 * NODE_SCALE;

// Contacts render in a wrapped GRID below their owner (mirrors the sibling
// row-wrap): CONTACT_COLS per row, rows CONTACT_GAP apart. The FIRST row
// starts below the owner's hanging card (NODE_WORLD_DROP + clearance) — the
// old flat CONTACT_GAP first-offset put the first contact disc behind the
// parent's DOM card (the long-documented "stacked contacts overlap" risk).
export const CONTACT_COLS = 3;
export const FIRST_CONTACT_DROP = NODE_WORLD_DROP + 1.5;

/** Vertical depth (world units below the owner) to the LAST contact row's center. */
export function contactStackDepth(count: number): number {
  if (count <= 0) return 0;
  const rows = Math.ceil(count / CONTACT_COLS);
  return FIRST_CONTACT_DROP + CONTACT_GAP * (rows - 1);
}

/** Same depth padded by one CONTACT_GAP so the last row's hanging card is inside the reservation. */
function contactStackDepthPadded(count: number): number {
  return count > 0 ? contactStackDepth(count) + CONTACT_GAP : 0;
}

/** Horizontal slots a contact grid occupies. */
function contactCols(count: number): number {
  return Math.min(Math.max(count, 0), CONTACT_COLS);
}

/**
 * Pre-compute the width + height of a subtree assuming row wrapping.
 * Returns a metrics tree we walk a second time to actually place nodes.
 */
interface SubtreeMetrics {
  width: number; // in HORIZONTAL_GAP units (so width=3 means 3 slots wide)
  height: number; // in LEVEL_GAP units below this node
  isLeaf: boolean;
  rows?: SubtreeMetrics[][]; // for branches, chunked child metrics
  contactCount: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function measure(
  node: OrgNode,
  expandedIds: Set<string>,
  ownedContacts: (id: string) => Contact[],
): SubtreeMetrics {
  const isExpanded = expandedIds.has(node.id);
  const myContacts = isExpanded ? ownedContacts(node.id).length : 0;

  if (!isExpanded || node.children.length === 0) {
    return {
      // Contacts wrap into a CONTACT_COLS grid, so a big contact list costs
      // at most CONTACT_COLS slots of width (the old `max(1, count)` reserved
      // one whole slot per contact while stacking them vertically — a
      // 15-contact member claimed ~15 empty slots of horizontal space).
      width: Math.max(1, contactCols(myContacts)),
      height: contactStackDepthPadded(myContacts) / LEVEL_GAP, // level-units
      isLeaf: true,
      contactCount: myContacts,
    };
  }

  // Chunk children into rows of MAX_COLS_PER_ROW
  const childMetrics = node.children.map((c) => measure(c, expandedIds, ownedContacts));
  const rows = chunk(childMetrics, MAX_COLS_PER_ROW);

  // The node's OWN contact grid renders between the node and its first child
  // row (place() shifts every child row down by this much) — account for it.
  const ownStackLevels = contactStackDepthPadded(myContacts) / LEVEL_GAP;

  // Each row's width = sum of its children's widths (in slots)
  // The whole branch's width = MAX row width across all rows
  let maxRowWidth = 0;
  let totalHeight = ownStackLevels;
  rows.forEach((row, idx) => {
    const rowWidth = row.reduce((sum, m) => sum + m.width, 0);
    if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
    // Row's height = max child height in this row + 1 level gap for the row itself
    const rowContentHeight = row.reduce((max, m) => Math.max(max, m.height), 0);
    totalHeight += 1 + rowContentHeight; // "1" accounts for the row's own level
    if (idx < rows.length - 1) {
      // Extra gap between rows so the next row's tops don't hit previous row's bottoms
      totalHeight += ROW_GAP / LEVEL_GAP + rowContentHeight;
    }
  });

  return {
    width: Math.max(maxRowWidth, 1, contactCols(myContacts)),
    height: totalHeight,
    isLeaf: false,
    rows,
    contactCount: myContacts,
  };
}

export function layoutTree(
  roots: OrgNode[],
  expandedIds: Set<string>,
  visibleContactsByNode: Map<string, Contact[]>,
): TreeLayout {
  const layoutNodes: LaidOutNode[] = [];
  const layoutContacts: LaidOutContact[] = [];
  const edges: Array<{ from: string; to: string }> = [];
  const ownedContacts = (id: string): Contact[] => visibleContactsByNode.get(id) || [];

  let maxDepth = 0;

  /**
   * Place a node's own contacts in a CONTACT_COLS grid below it. The grid is
   * centered under the node but clamped inside [minX, minX + reservedW] so a
   * wide grid under an off-center branch node can never spill into a sibling's
   * reservation.
   */
  function placeContactGrid(
    ownerId: string,
    list: Contact[],
    ownerCenter: number,
    absY: number,
    minX: number,
    reservedW: number,
  ): void {
    if (list.length === 0) return;
    const cols = contactCols(list.length);
    const gridHalf = ((cols - 1) / 2) * HORIZONTAL_GAP;
    const lo = minX + gridHalf + HORIZONTAL_GAP / 2;
    const hi = minX + reservedW - gridHalf - HORIZONTAL_GAP / 2;
    const gridCenter =
      hi < lo ? minX + reservedW / 2 : Math.min(Math.max(ownerCenter, lo), hi);
    list.forEach((contact, i) => {
      const col = i % CONTACT_COLS;
      const row = Math.floor(i / CONTACT_COLS);
      layoutContacts.push({
        id: contact.id,
        contact,
        x: gridCenter + (col - (cols - 1) / 2) * HORIZONTAL_GAP,
        y: absY - FIRST_CONTACT_DROP - CONTACT_GAP * row,
        parentId: ownerId,
      });
      edges.push({ from: ownerId, to: contact.id });
    });
  }

  /**
   * Place a node at the given position and recursively place its descendants.
   * Returns the node's center x and the max x it occupies.
   */
  function place(
    node: OrgNode,
    depth: number,
    parentId: string | null,
    minX: number,
    absY: number,
    metrics: SubtreeMetrics,
  ): { center: number; maxX: number } {
    maxDepth = Math.max(maxDepth, depth);
    const isExpanded = expandedIds.has(node.id);
    const nodeContacts = isExpanded ? ownedContacts(node.id) : [];

    // Leaf (or collapsed)
    if (metrics.isLeaf) {
      const width = Math.max(1, contactCols(nodeContacts.length));
      const reservedW = width * HORIZONTAL_GAP;
      const center = minX + reservedW / 2;
      layoutNodes.push({ id: node.id, node, x: center, y: absY, depth, parentId });
      if (parentId) edges.push({ from: parentId, to: node.id });
      placeContactGrid(node.id, nodeContacts, center, absY, minX, reservedW);
      return { center, maxX: minX + reservedW };
    }

    // Branch with rows
    const rows = metrics.rows!;
    const reservedW = metrics.width * HORIZONTAL_GAP;
    const allChildCenters: number[] = [];
    let branchMaxX = minX;
    // Current y for the next row — one level below the parent, pushed further
    // down past the node's OWN contact grid (branch nodes render their direct
    // contacts between themselves and their first child row; previously the
    // branch path silently DROPPED its own contacts — an overseer/leader with
    // a direct contact never showed it in the 3D tree).
    let rowY = absY - LEVEL_GAP - contactStackDepthPadded(nodeContacts.length);

    // When the node's own contact grid is wider than its children (e.g. one
    // child + many contacts), center the child rows inside the reservation so
    // the node lands mid-reservation and the grid stays under it.
    const maxRowWidth = rows.reduce(
      (mx, row) => Math.max(mx, row.reduce((s, m) => s + m.width, 0)),
      0,
    );
    const childOffset = Math.max(0, ((metrics.width - maxRowWidth) / 2) * HORIZONTAL_GAP);

    rows.forEach((row, rowIdx) => {
      let cur = minX + childOffset;
      const rowChildMetrics = row;
      const rowChildren = node.children.slice(
        rowIdx * MAX_COLS_PER_ROW,
        rowIdx * MAX_COLS_PER_ROW + row.length,
      );
      // Track the tallest child in this row to know how far to drop the next row
      let rowContentHeight = 0;
      rowChildren.forEach((child, i) => {
        const childMetrics = rowChildMetrics[i];
        const { center, maxX } = place(
          child,
          depth + 1,
          node.id,
          cur,
          rowY,
          childMetrics,
        );
        allChildCenters.push(center);
        cur = maxX;
        if (childMetrics.height > rowContentHeight) rowContentHeight = childMetrics.height;
      });
      if (cur > branchMaxX) branchMaxX = cur;
      // Drop down past this row's content before placing the next row
      rowY -= (1 + rowContentHeight) * LEVEL_GAP + ROW_GAP;
    });

    // Guard against the pathological case where an expanded branch ended
    // up with zero placed children (malformed metrics, empty rows, etc.).
    // Spreading an empty array into Math.min/max yields Infinity/-Infinity
    // and produces NaN positions that silently break the whole layout.
    let center: number;
    if (allChildCenters.length === 0) {
      center = minX;
    } else {
      let lo = allChildCenters[0];
      let hi = allChildCenters[0];
      for (const c of allChildCenters) {
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
      center = (lo + hi) / 2;
    }
    layoutNodes.push({ id: node.id, node, x: center, y: absY, depth, parentId });
    if (parentId) edges.push({ from: parentId, to: node.id });

    // The node's OWN direct contacts — grid directly below the node card,
    // clamped inside this branch's reservation (children start below it).
    placeContactGrid(node.id, nodeContacts, center, absY, minX, reservedW);

    // Advance the sibling cursor past whichever is wider: the children rows
    // or this node's own reservation (contact grid included).
    return { center, maxX: Math.max(branchMaxX, minX + reservedW) };
  }

  // Lay out each root side by side
  let cursorX = 0;
  for (const root of roots) {
    const metrics = measure(root, expandedIds, ownedContacts);
    const { maxX } = place(root, 0, null, cursorX, 0, metrics);
    cursorX = maxX + HORIZONTAL_GAP;
  }

  // Center horizontally
  if (layoutNodes.length > 0) {
    const allX = layoutNodes.map((n) => n.x);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const shift = -(minX + maxX) / 2;
    layoutNodes.forEach((n) => (n.x += shift));
    layoutContacts.forEach((c) => (c.x += shift));
    return {
      nodes: layoutNodes,
      contacts: layoutContacts,
      edges,
      bounds: { minX: minX + shift, maxX: maxX + shift, maxDepth },
    };
  }

  return {
    nodes: layoutNodes,
    contacts: layoutContacts,
    edges,
    bounds: { minX: 0, maxX: 0, maxDepth },
  };
}
