import { describe, it, expect } from 'vitest';
import { layoutTree, HORIZONTAL_GAP, NODE_SCALE } from './tree-layout';
import type { OrgNode } from '../types';

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

  it('HORIZONTAL_GAP scales with NODE_SCALE', () => {
    expect(HORIZONTAL_GAP).toBeCloseTo(7 * NODE_SCALE);
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
