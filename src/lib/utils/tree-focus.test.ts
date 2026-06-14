import { describe, it, expect } from 'vitest';
import { topLevelsBounds, type FocusableNode, type FocusableContact } from './tree-focus';

// Synthetic TALL tree (mirrors the real org shape: root at the TOP = highest y,
// members/contacts at the BOTTOM = lowest y). This is exactly the geometry that
// makes computeFullTreeFocus center on the member band; topLevelsBounds must
// instead frame the high-y top tiers.
const NODES: FocusableNode[] = [
  { id: 'r1', x: -5, y: 20, depth: 0 }, // root (Dev)
  { id: 'r2', x: 5, y: 20, depth: 0 }, // second root (Dev)
  { id: 'o1', x: 0, y: 12, depth: 1 }, // overseer
  { id: 'b1', x: -8, y: 4, depth: 2 }, // branch leader
  { id: 'b2', x: 8, y: 4, depth: 2 }, // branch leader
  { id: 'g1', x: -12, y: -4, depth: 3 }, // group leader (below the cut)
  { id: 'm1', x: -20, y: -20, depth: 5 }, // member (deep, off-frame)
];
const CONTACTS: FocusableContact[] = [
  { x: -8, y: 0, parentId: 'b1' }, // owned by an in-frame branch leader → counts at cap>=2
  { x: -20, y: -24, parentId: 'm1' }, // owned by a deep member → must NOT count at cap=2
];
const LAYOUT_MAX_DEPTH = 5;

const centerY = (b: { minY: number; maxY: number }) => (b.minY + b.maxY) / 2;

describe('topLevelsBounds', () => {
  it('excludes nodes deeper than the cap (and their contacts)', () => {
    const b = topLevelsBounds(NODES, CONTACTS, 2, LAYOUT_MAX_DEPTH)!;
    // Lowest point kept is the branch-leader's contact at y=0; g1(-4)/m1(-20)/
    // the member contact(-24) are all excluded.
    expect(b.minY).toBe(0);
    expect(b.maxY).toBe(20);
  });

  it('always includes BOTH depth-0 roots (frame spans both root x-positions)', () => {
    const b = topLevelsBounds(NODES, CONTACTS, 0, LAYOUT_MAX_DEPTH)!;
    expect(b.minX).toBe(-5);
    expect(b.maxX).toBe(5);
  });

  it('clamps maxDepth DOWN to the layout max depth', () => {
    // Ask for depth 2 but tell it the tree only goes 1 deep → branch leaders drop out.
    const clamped = topLevelsBounds(NODES, CONTACTS, 2, 1)!;
    expect(clamped.minY).toBe(12); // o1 (depth 1) is the lowest; b1/b2 (depth 2) excluded
    // Asking for a huge depth is identical to asking for the true max depth.
    const huge = topLevelsBounds(NODES, CONTACTS, 99, LAYOUT_MAX_DEPTH);
    const exact = topLevelsBounds(NODES, CONTACTS, LAYOUT_MAX_DEPTH, LAYOUT_MAX_DEPTH);
    expect(huge).toEqual(exact);
  });

  it('frames the TOP, not the middle: top-tiers centerY is ABOVE the full-tree centerY', () => {
    const top = topLevelsBounds(NODES, CONTACTS, 2, LAYOUT_MAX_DEPTH)!;
    const full = topLevelsBounds(NODES, CONTACTS, LAYOUT_MAX_DEPTH, LAYOUT_MAX_DEPTH)!;
    expect(centerY(top)).toBeGreaterThan(centerY(full));
  });

  it('returns null when nothing qualifies (empty tree)', () => {
    expect(topLevelsBounds([], [], 2, 0)).toBeNull();
  });
});
