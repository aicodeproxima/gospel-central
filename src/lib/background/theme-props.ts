/**
 * Theme → background color adapter.
 *
 * Given the colors resolved from the ACTIVE Diamond palette (see
 * `useThemeColors`), produce the color-prop overrides for a given background
 * so the animation is tinted to the current theme. These are DEFAULTS only —
 * a user override saved in the customizer takes precedence (merged on top in
 * BackgroundRenderer). This is how "designed visually according to the theme"
 * is honored: switch palette → the background re-tints automatically.
 */
import type { BackgroundId } from './schemas';

export interface ResolvedThemeColors {
  /** `--primary` as #rrggbb */
  primaryHex: string;
  /** `--primary` as [r,g,b] in 0..1 */
  primaryRgb: [number, number, number];
  /** hue of `--primary` in degrees 0..360 */
  primaryHue: number;
  /** saturation of `--primary` in 0..1 (HSL) */
  primarySat: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** HSL (h 0..360, s/l 0..1) → #rrggbb. */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to2 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Returns ONLY the color-related props for `style`, tinted from `c`. Numeric /
 * structural props keep their schema defaults (set in BackgroundRenderer).
 */
export function themePropsFor(
  style: BackgroundId,
  c: ResolvedThemeColors,
): Record<string, unknown> {
  const h = c.primaryHue;
  const s = clamp(c.primarySat, 0.35, 0.95);
  switch (style) {
    case 'liquid-chrome':
      // Dark metallic tint of the theme color (the shader divides by sin, so a
      // low base keeps the chrome look while carrying the hue).
      return { baseColor: [c.primaryRgb[0] * 0.16, c.primaryRgb[1] * 0.16, c.primaryRgb[2] * 0.16] };
    case 'beams':
      // Beams are near-black surfaces edge-lit by lightColor; the raw theme
      // primary is often too dark to read, so drive a HIGH-lightness version of
      // the theme hue (near-white for the neutral default palette) so the beams
      // glow brightly.
      return { lightColor: hslToHex(h, clamp(c.primarySat, 0, 0.8), 0.82) };
    case 'galaxy':
      // Rotate star hues to the theme hue + give them enough saturation to read
      // as the theme color (default saturation 0 = white stars).
      return { hueShift: Math.round(h), saturation: clamp(c.primarySat, 0.45, 0.9) };
    case 'floating-lines':
      return {
        linesGradient: [
          hslToHex(h - 16, s, 0.74),
          hslToHex(h, s, 0.66),
          hslToHex(h + 16, s, 0.7),
          hslToHex(h + 4, s * 0.85, 0.8),
        ],
      };
    case 'light-pillar':
      return {
        topColor: c.primaryHex,
        bottomColor: hslToHex(h + 40, s, 0.74),
      };
    case 'prismatic-burst':
      return {
        colors: [c.primaryHex, hslToHex(h + 34, s, 0.6), hslToHex(h - 34, s, 0.78)],
      };
    default:
      return {};
  }
}
