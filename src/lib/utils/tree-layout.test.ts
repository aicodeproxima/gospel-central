import { describe, it, expect } from 'vitest';
import {
  layoutTree,
  HORIZONTAL_GAP,
  LEVEL_GAP,
  CONTACT_GAP,
  CONTACT_COLS,
  FIRST_CONTACT_DROP,
  NODE_WORLD_TOP,
  NODE_WORLD_DROP,
  NODE_SCALE,
} from './tree-layout';
import type { Contact, OrgNode } from '../types';

// The enlarged-node experiment (NODE_SCALE) rests on ONE invariant: a card is
// never wider than the gap between sibling slots, so siblings can never visually
// overlap. The card world widths live in Tree3D (5.4*NODE_SCALE desktop /
// 4.8*NODE_SCALE compact); the sibling gap is HORIZONTAL_GAP (7*NODE_SCALE) here.
// Both scale by the SAME NODE_SCALE, so the invariant reduces to the base ratio
// (5.4 < 7). These tests pin BOTH the ratio AND the actual layout spacing, so a
// future edit to NODE_SCALE or the gaps can't silently reintroduce overlap.
const DESKTOP_CARD_WORLD_WIDTH = 5.4 * NODE_SCALE; // mirrors Tree3D.tsx
const COMPACT_CARD_WORLD_WIDTH = 4.8 * NODE_SCALE; // mirrors Tree3D.tsx

// layoutTree only reads `id` and `children`, so a minimal node is enough.
const leaf = (id: string): OrgNode =>
  ({ id, name: id, role: 'member', children: [] }) as unknown as OrgNode;

describe('tree-layout no-overlap invariant', () => {
  it('the widest card stays narrower than the sibling gap (at any NODE_SCALE)', () => {
    expect(DESKTOP_CARD_WORLD_WIDTH).toBeLessThan(HORIZONTAL_GAP);
    expect(COMPACT_CARD_WORLD_WIDTH).toBeLessThan(HORIZONTAL_GAP);
  });

  it('HORIZONTAL_GAP scales with NODE_SCALE (G3 tightened base: 6.2)', () => {
    expect(HORIZONTAL_GAP).toBeCloseTo(6.2 * NODE_SCALE);
  });

  it('places same-depth siblings at least one HORIZONTAL_GAP apart', () => {
    const root = {
      id: 'root',
      name: 'root',
      role: 'dev',
      children: [leaf('a'), leaf('b'), leaf('c')],
    } as unknown as OrgNode;

    const layout = layoutTree([root], new Set(['root']), new Map());
    const siblingXs = layout.nodes
      .filter((n) => n.parentId === 'root')
      .map((n) => n.x)
      .sort((p, q) => p - q);

    expect(siblingXs).toHaveLength(3);
    for (let i = 1; i < siblingXs.length; i++) {
      expect(siblingXs[i] - siblingXs[i - 1]).toBeGreaterThanOrEqual(HORIZONTAL_GAP - 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------
// G3 (2026-07-04): vertical-clearance + contact-grid invariants.
// A node's world extents (avatar NODE_WORLD_TOP above center, hanging DOM card
// NODE_WORLD_DROP below) now live in tree-layout.ts as the single source; the
// gaps must always clear them, and contacts render as a CONTACT_COLS grid.
// ---------------------------------------------------------------------------
const contact = (id: string): Contact => ({ id }) as unknown as Contact;

describe('tree-layout G3 collision + contact-grid invariants', () => {
  it("a node's vertical extent fits inside LEVEL_GAP (tiers can never collide)", () => {
    expect(NODE_WORLD_TOP + NODE_WORLD_DROP).toBeLessThan(LEVEL_GAP);
  });

  it("the first contact row clears the owner's hanging card", () => {
    expect(FIRST_CONTACT_DROP).toBeGreaterThan(NODE_WORLD_DROP);
  });

  it('REGRESSION: an expanded BRANCH node places its own direct contacts (contacts under ANY role)', () => {
    // The old place() branch path silently dropped a branch node's own
    // contacts — an overseer/leader with children AND a direct contact never
    // showed that contact in the 3D tree.
    const root = {
      id: 'boss',
      name: 'boss',
      role: 'overseer',
      children: [leaf('a'), leaf('b')],
    } as unknown as OrgNode;
    const owned = new Map([
      ['boss', [contact('c1'), contact('c2'), contact('c3'), contact('c4')]],
    ]);
    const layout = layoutTree([root], new Set(['boss']), owned);
    const placed = layout.contacts.filter((c) => c.parentId === 'boss');
    expect(placed).toHaveLength(4);
    placed.forEach((c) => {
      expect(layout.edges).toContainEqual({ from: 'boss', to: c.id });
    });
    // Children rows start BELOW the whole contact grid — no vertical overlap:
    // every child's avatar-top sits under the lowest contact row.
    const lowestContactY = Math.min(...placed.map((c) => c.y));
    const children = layout.nodes.filter((n) => n.parentId === 'boss');
    expect(children).toHaveLength(2);
    children.forEach((ch) => {
      expect(ch.y + NODE_WORLD_TOP).toBeLessThan(lowestContactY);
    });
  });

  it('contacts wrap into a CONTACT_COLS grid — 15 contacts → 3×5, not a 15-deep strand', () => {
    const solo = { id: 'm', name: 'm', role: 'member', children: [] } as unknown as OrgNode;
    const list = Array.from({ length: 15 }, (_, i) => contact(`c${i}`));
    const layout = layoutTree([solo], new Set(['m']), new Map([['m', list]]));
    expect(layout.contacts).toHaveLength(15);

    const round = (v: number) => Math.round(v * 1000) / 1000;
    const xs = [...new Set(layout.contacts.map((c) => round(c.x)))].sort((a, b) => a - b);
    const ys = [...new Set(layout.contacts.map((c) => round(c.y)))].sort((a, b) => b - a);
    expect(xs).toHaveLength(CONTACT_COLS); // 3 columns
    expect(ys).toHaveLength(Math.ceil(15 / CONTACT_COLS)); // 5 rows

    // First row clears the owner's card; rows are CONTACT_GAP apart.
    const node = layout.nodes.find((n) => n.id === 'm')!;
    expect(node.y - ys[0]).toBeCloseTo(FIRST_CONTACT_DROP);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i - 1] - ys[i]).toBeCloseTo(CONTACT_GAP);
    }
    // Columns are HORIZONTAL_GAP apart and centered on the owner.
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(HORIZONTAL_GAP);
    }
    expect((xs[0] + xs[xs.length - 1]) / 2).toBeCloseTo(node.x);
  });

  it('two sibling contact grids never overlap horizontally', () => {
    const root = {
      id: 'root',
      name: 'root',
      role: 'dev',
      children: [leaf('a'), leaf('b')],
    } as unknown as OrgNode;
    const owned = new Map([
      ['a', Array.from({ length: 6 }, (_, i) => contact(`a${i}`))],
      ['b', Array.from({ length: 6 }, (_, i) => contact(`b${i}`))],
    ]);
    const layout = layoutTree([root], new Set(['root', 'a', 'b']), owned);
    const ax = layout.contacts.filter((c) => c.parentId === 'a').map((c) => c.x);
    const bx = layout.contacts.filter((c) => c.parentId === 'b').map((c) => c.x);
    expect(ax).toHaveLength(6);
    expect(bx).toHaveLength(6);
    // Nearest columns of the two grids stay at least one HORIZONTAL_GAP apart.
    expect(Math.min(...bx) - Math.max(...ax)).toBeGreaterThanOrEqual(HORIZONTAL_GAP - 1e-9);
  });
});
