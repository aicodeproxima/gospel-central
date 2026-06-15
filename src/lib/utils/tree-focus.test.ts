import { describe, it, expect } from 'vitest';
import { topBandBounds, type FocusableNode, type FocusableContact } from './tree-focus';

// Synthetic tree (mirrors the real org shape: root at the TOP = highest y,
// members/contacts at the BOTTOM = lowest y). This is exactly the geometry that
// makes a full-tree fit center on the member band; topBandBounds must instead
// frame the high-y top band. Note b2 is given a LOW y (-30) to mimic a
// row-wrapped branch leader that sank below — a Y-band must EXCLUDE it even
// though it's a shallow node, which a depth filter would wrongly include.
const NODES: FocusableNode[] = [
  { id: 'r1', x: -5, y: 20 }, // root
  { id: 'r2', x: 5, y: 20 }, // second root
  { id: 'o1', x: 0, y: 12 }, // overseer
  { id: 'b1', x: -8, y: 4 }, // branch leader (top row)
  { id: 'b2', x: 8, y: -30 }, // branch leader sunk by row-wrapping (shallow but LOW)
  { id: 'm1', x: -20, y: -20 }, // member (deep)
];
const CONTACTS: FocusableContact[] = [
  { x: -8, y: 0, parentId: 'b1' }, // owned by an in-band node, but below the cutoff
  { x: -20, y: -24, parentId: 'm1' }, // deep, off-band
];

const centerY = (b: { minY: number; maxY: number }) => (b.minY + b.maxY) / 2;

describe('topBandBounds', () => {
  it('keeps only nodes within bandHeight of the top (excludes sunk + deep nodes)', () => {
    const b = topBandBounds(NODES, CONTACTS, 16)!; // cutoff = 20 - 16 = 4
    expect(b.maxY).toBe(20); // roots
    expect(b.minY).toBe(4); // b1 is the lowest kept; b2(-30)/m1(-20) excluded
  });

  it('always includes the root band (frame spans both roots when band is tight)', () => {
    const b = topBandBounds(NODES, [], 0)!; // only the topmost (both roots at y=20)
    expect(b.minX).toBe(-5);
    expect(b.maxX).toBe(5);
    expect(b.minY).toBe(20);
  });

  it('frames the TOP, not the middle: band centerY is ABOVE the full-tree centerY', () => {
    const band = topBandBounds(NODES, CONTACTS, 16)!;
    const full = topBandBounds(NODES, CONTACTS, 1000)!; // whole tree
    expect(centerY(band)).toBeGreaterThan(centerY(full));
  });

  it('bandHeight controls how far down the frame reaches', () => {
    const tight = topBandBounds(NODES, [], 8)!; // cutoff 12 → root + overseer only
    expect(tight.minY).toBe(12);
    const wider = topBandBounds(NODES, [], 16)!; // reaches the top branch leader
    expect(wider.minY).toBe(4);
  });

  it('returns null when there are no nodes', () => {
    expect(topBandBounds([], [], 16)).toBeNull();
  });
});
