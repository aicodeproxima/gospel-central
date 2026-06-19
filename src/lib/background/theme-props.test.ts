import { describe, it, expect } from 'vitest';
import { hslToHex, themePropsFor, type ResolvedThemeColors } from './theme-props';
import { buildBackgroundProps, baselineProps } from './props';
import { defaultsFor, BACKGROUND_ORDER } from './schemas';

const COLORS: ResolvedThemeColors = {
  primaryHex: '#3366ff',
  primaryRgb: [0.2, 0.4, 1],
  primaryHue: 225,
  primarySat: 1,
};

describe('hslToHex', () => {
  it('converts primary hues', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000');
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00');
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff');
  });
  it('wraps/clamps out-of-range inputs', () => {
    expect(hslToHex(360, 1, 0.5)).toBe('#ff0000'); // wrap
    expect(hslToHex(-120, 1, 0.5)).toBe('#0000ff'); // negative wrap
    expect(hslToHex(0, 2, 1.5)).toBe('#ffffff'); // clamp s,l
    expect(hslToHex(0, 0, 0)).toBe('#000000');
  });
});

describe('themePropsFor', () => {
  const isHex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  it('beams: drives only a hex lightColor', () => {
    const p = themePropsFor('beams', COLORS);
    expect(isHex(p.lightColor)).toBe(true);
  });
  it('galaxy: drives hueShift + saturation (no hex)', () => {
    const p = themePropsFor('galaxy', COLORS);
    expect(typeof p.hueShift).toBe('number');
    expect(typeof p.saturation).toBe('number');
    expect(p.saturation as number).toBeGreaterThan(0); // theme must lift the 0 default so hue shows
  });
  it('liquid-chrome: dark rgb vec3 baseColor', () => {
    const p = themePropsFor('liquid-chrome', COLORS);
    const bc = p.baseColor as number[];
    expect(Array.isArray(bc)).toBe(true);
    expect(bc).toHaveLength(3);
    expect(Math.max(...bc)).toBeLessThan(0.5); // kept dark for the chrome look
  });
  it('light-pillar: two hex colors', () => {
    const p = themePropsFor('light-pillar', COLORS);
    expect(isHex(p.topColor)).toBe(true);
    expect(isHex(p.bottomColor)).toBe(true);
  });
  it('prismatic-burst + floating-lines: hex arrays', () => {
    expect((themePropsFor('prismatic-burst', COLORS).colors as string[]).every(isHex)).toBe(true);
    expect((themePropsFor('floating-lines', COLORS).linesGradient as string[]).every(isHex)).toBe(true);
  });
});

describe('buildBackgroundProps layering (defaults -> theme -> overrides -> interactivity)', () => {
  it('theme tint fills color props; numeric defaults survive', () => {
    const p = buildBackgroundProps('galaxy', COLORS, undefined);
    expect(p.density).toBe(defaultsFor('galaxy').density); // untouched default
    expect(p.hueShift).toBe(Math.round(COLORS.primaryHue)); // theme override of the schema default
  });
  it('user override beats theme + default', () => {
    const p = buildBackgroundProps('galaxy', COLORS, { density: 2.4 });
    expect(p.density).toBe(2.4);
    expect(p.hueShift).toBe(Math.round(COLORS.primaryHue)); // non-overridden key still follows theme
    const b = buildBackgroundProps('beams', COLORS, { lightColor: '#abcdef' });
    expect(b.lightColor).toBe('#abcdef');
  });
  it('interactivity is applied last and reflects the flag', () => {
    expect(buildBackgroundProps('liquid-chrome', COLORS, undefined, { interactive: true }).interactive).toBe(true);
    expect(buildBackgroundProps('liquid-chrome', COLORS, undefined, { interactive: false }).interactive).toBe(false);
    expect(buildBackgroundProps('galaxy', COLORS, undefined, { interactive: false }).mouseInteraction).toBe(false);
    expect(buildBackgroundProps('galaxy', COLORS, undefined).mouseInteraction).toBe(false); // default off
  });
  it('baselineProps = defaults + theme, ignores overrides', () => {
    const base = baselineProps('beams', COLORS);
    expect(base.beamWidth).toBe(defaultsFor('beams').beamWidth);
    expect(base.lightColor).toBe(themePropsFor('beams', COLORS).lightColor);
  });
});

describe('every background id resolves cleanly', () => {
  it('buildBackgroundProps works for all 6 styles', () => {
    for (const id of BACKGROUND_ORDER) {
      const p = buildBackgroundProps(id, COLORS, undefined, { interactive: false });
      expect(Object.keys(p).length).toBeGreaterThan(0);
    }
  });
});
