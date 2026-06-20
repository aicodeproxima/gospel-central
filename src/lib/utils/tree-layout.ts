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

// Tight gaps — original known-good values, scaled ×1.5 for the NODE_SCALE=1.5
// experiment (2026-06-19) so the enlarged cards/avatars in Tree3D still never
// overlap (card world widths 7.2/8.1 stay < HORIZONTAL_GAP 10.5). Revert the
// commit (or drop the * 1.5) to undo. Keep in sync with Tree3D's NODE_SCALE.
const HORIZONTAL_GAP = 7 * 1.5;
const LEVEL_GAP = 8 * 1.5; // vertical gap between tree levels
const CONTACT_GAP = 3.5 * 1.5;
const MAX_COLS_PER_ROW = 3; // wrap children onto new rows beyond this count
const ROW_GAP = 5 * 1.5; // extra vertical gap between wrapped rows of siblings

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
      width: Math.max(1, myContacts),
      height: myContacts * (CONTACT_GAP / LEVEL_GAP), // convert to level-units
      isLeaf: true,
      contactCount: myContacts,
    };
  }

  // Chunk children into rows of MAX_COLS_PER_ROW
  const childMetrics = node.children.map((c) => measure(c, expandedIds, ownedContacts));
  const rows = chunk(childMetrics, MAX_COLS_PER_ROW);

  // Each row's width = sum of its children's widths (in slots)
  // The whole branch's width = MAX row width across all rows
  let maxRowWidth = 0;
  let totalHeight = 0;
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
    width: Math.max(maxRowWidth, 1, myContacts),
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
      const width = Math.max(1, nodeContacts.length);
      const center = minX + (width * HORIZONTAL_GAP) / 2;
      layoutNodes.push({ id: node.id, node, x: center, y: absY, depth, parentId });
      if (parentId) edges.push({ from: parentId, to: node.id });
      nodeContacts.forEach((contact, i) => {
        layoutContacts.push({
          id: contact.id,
          contact,
          x: center,
          y: absY - CONTACT_GAP * (i + 1),
          parentId: node.id,
        });
        edges.push({ from: node.id, to: contact.id });
      });
      return { center, maxX: minX + width * HORIZONTAL_GAP };
    }

    // Branch with rows
    const rows = metrics.rows!;
    const allChildCenters: number[] = [];
    let branchMaxX = minX;
    // Current y for the next row (starts one level below the parent)
    let rowY = absY - LEVEL_GAP;

    rows.forEach((row, rowIdx) => {
      let cur = minX;
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

    return { center, maxX: branchMaxX };
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
