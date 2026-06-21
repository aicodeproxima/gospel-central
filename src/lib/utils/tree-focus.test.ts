import { describe, it, expect } from 'vitest';
import {
  topBandBounds,
  fitBboxIntoBand,
  type FocusableNode,
  type FocusableContact,
  type Bounds,
  type FrameBand,
} from './tree-focus';

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

// ---------------------------------------------------------------------------
// fitBboxIntoBand — the camera-framing math. The invariant that actually
// matters is NO-CLIP: at the returned distance, the bbox's visual top stays
// below the search bar and its visual bottom above the pan hint.
// ---------------------------------------------------------------------------
const WPD = 1.0412; // 2·tan(55°/2), the scene's worldPerDist
const BAND: FrameBand = { viewportW: 1280, viewportH: 800, topFrac: 0.18, bottomFrac: 0.06 };
const OPTS = { padTop: 3, padBottom: 6, padSide: 4, worldPerDist: WPD, minDist: 8, maxDist: 67 };

/** Screen fraction-from-top where a world Y lands for a given look-at + distance. */
function screenFrac(worldY: number, lookY: number, distance: number): number {
  const visH = distance * WPD; // top of screen (frac 0) = lookY + visH/2
  return 0.5 - (worldY - lookY) / visH;
}

describe('fitBboxIntoBand', () => {
  const small: Bounds = { minX: -10, maxX: 10, minY: -8, maxY: 8 };

  it('no-clip: a fitting bbox sits below the search bar and above the pan hint', () => {
    const r = fitBboxIntoBand(small, BAND, OPTS);
    expect(r.clamped).toBe(false);
    const topF = screenFrac(small.maxY + OPTS.padTop, r.center[1], r.distance);
    const botF = screenFrac(small.minY - OPTS.padBottom, r.center[1], r.distance);
    expect(topF).toBeGreaterThanOrEqual(BAND.topFrac - 1e-3);
    expect(botF).toBeLessThanOrEqual(1 - BAND.bottomFrac + 1e-3);
  });

  it('centers in the band: equal margin to each overlay edge', () => {
    const r = fitBboxIntoBand(small, BAND, OPTS);
    const topF = screenFrac(small.maxY + OPTS.padTop, r.center[1], r.distance);
    const botF = screenFrac(small.minY - OPTS.padBottom, r.center[1], r.distance);
    const gapTop = topF - BAND.topFrac;
    const gapBot = 1 - BAND.bottomFrac - botF;
    expect(Math.abs(gapTop - gapBot)).toBeLessThan(0.01);
  });

  it('zoom/aspect invariant: scaling both viewport dims leaves distance unchanged', () => {
    const a = fitBboxIntoBand(small, BAND, OPTS);
    const zoomed: FrameBand = { ...BAND, viewportW: BAND.viewportW * 0.9, viewportH: BAND.viewportH * 0.9 };
    expect(fitBboxIntoBand(small, zoomed, OPTS).distance).toBeCloseTo(a.distance, 6);
  });

  it('monotonic: a taller bbox never yields a smaller distance', () => {
    const shortD = fitBboxIntoBand({ minX: -10, maxX: 10, minY: -4, maxY: 4 }, BAND, OPTS).distance;
    const tallD = fitBboxIntoBand({ minX: -10, maxX: 10, minY: -30, maxY: 4 }, BAND, OPTS).distance;
    expect(tallD).toBeGreaterThanOrEqual(shortD);
  });

  it('clamps a too-big tree and TOP-ANCHORS it (root pinned under the search bar)', () => {
    const huge: Bounds = { minX: -60, maxX: 60, minY: -400, maxY: 8 };
    const r = fitBboxIntoBand(huge, BAND, OPTS);
    expect(r.clamped).toBe(true);
    expect(r.distance).toBe(OPTS.maxDist);
    expect(screenFrac(huge.maxY + OPTS.padTop, r.center[1], r.distance)).toBeCloseTo(BAND.topFrac, 2);
  });

  it('distance never escapes [minDist, maxDist]', () => {
    const tiny = fitBboxIntoBand({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 }, BAND, OPTS);
    expect(tiny.distance).toBeGreaterThanOrEqual(OPTS.minDist);
    expect(tiny.distance).toBeLessThanOrEqual(OPTS.maxDist);
  });
});
