import { describe, it, expect } from 'vitest';
import { toggleExpanded, isolatePath } from './tree-expansion';
import { UserRole } from '@/lib/types/user';
import type { OrgNode } from '@/lib/types/group';

// Minimal OrgNode factory — toggleExpanded only needs id + children (via
// collectSubtreeUserIds, which walks node.children).
const mk = (id: string, children: OrgNode[] = []): OrgNode => ({
  id,
  name: id,
  role: UserRole.MEMBER,
  children,
});

// Fixture: r → a → {a1, a2}; b is a second child of r.
const a1 = mk('a1');
const a2 = mk('a2');
const a = mk('a', [a1, a2]);
const b = mk('b');
const r = mk('r', [a, b]);

describe('toggleExpanded', () => {
  it('expand adds the node', () => {
    const next = toggleExpanded(new Set(), 'a', a);
    expect([...next]).toEqual(['a']);
  });

  it('collapse removes the node AND all its descendants', () => {
    const next = toggleExpanded(new Set(['a', 'a1', 'a2']), 'a', a);
    expect(next.size).toBe(0); // a, a1, a2 all gone
  });

  it('re-expand after collapse yields ONLY the node — no deep cascade (core invariant)', () => {
    let s: ReadonlySet<string> = new Set(['r', 'a', 'a1', 'a2']);
    s = toggleExpanded(s, 'a', a); // collapse a
    expect([...s].sort()).toEqual(['r']); // subtree pruned
    s = toggleExpanded(s, 'a', a); // re-expand a
    expect([...s].sort()).toEqual(['a', 'r']); // a1/a2 NOT restored
  });

  it('collapsing a mid node leaves ancestors and siblings intact', () => {
    const next = toggleExpanded(new Set(['r', 'a', 'a1', 'a2', 'b']), 'a', a);
    expect([...next].sort()).toEqual(['b', 'r']);
  });

  it('collapsing a childless node removes only itself', () => {
    const next = toggleExpanded(new Set(['r', 'b']), 'b', b);
    expect([...next].sort()).toEqual(['r']);
  });

  it('optional ancestorIds are added on expand (future non-visible togglers)', () => {
    const next = toggleExpanded(new Set(['r']), 'a1', a1, ['r', 'a']);
    expect([...next].sort()).toEqual(['a', 'a1', 'r']);
  });
});

describe('isolatePath', () => {
  it('returns exactly the ancestor set (target excluded → lands collapsed)', () => {
    const s = isolatePath(['r', 'a']);
    expect([...s].sort()).toEqual(['a', 'r']);
    expect(s.has('a1')).toBe(false); // target a1 not included
  });

  it('empty path → empty set', () => {
    expect(isolatePath([]).size).toBe(0);
  });
});
