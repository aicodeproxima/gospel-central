/**
 * Control schemas for the in-app Background customizer.
 *
 * Each background maps to an array of control descriptors. The customizer
 * renders the right input per `type` and feeds the resulting values into the
 * background component as props. Color-typed controls (`color`/`colorArray`/
 * `vec3color`) are TINTED FROM THE ACTIVE THEME by default (see
 * `theme-props.ts`); a value here is only applied when the user explicitly
 * overrides it in the customizer.
 *
 * Ported from `Background Ideas/_customizer/schemas.js` (the 6 self-contained
 * React-Bits backgrounds; Vanta Clouds is intentionally deferred — it needs a
 * CDN + CSP allowance + a conflicting three@0.134).
 */
import type { BackgroundStyle } from '@/lib/stores/preferences-store';

export type BackgroundId = Exclude<BackgroundStyle, 'none'>;

export type Control =
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: 'color'; default: string; themed?: boolean }
  | { key: string; label: string; type: 'colorArray'; max: number; default: string[]; themed?: boolean }
  | { key: string; label: string; type: 'vec3color'; default: [number, number, number]; themed?: boolean }
  | { key: string; label: string; type: 'toggle'; default: boolean }
  | { key: string; label: string; type: 'select'; options: string[]; default: string }
  | { key: string; label: string; type: 'multiSelect'; options: string[]; default: string[] };

export interface BackgroundDef {
  id: BackgroundId;
  title: string;
  /** short palette description for the picker swatch */
  swatch: string;
  controls: Control[];
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  'liquid-chrome': {
    id: 'liquid-chrome',
    title: 'Liquid Chrome',
    swatch: 'linear-gradient(135deg,#1a1a1a,#6b7280,#e5e7eb)',
    controls: [
      { key: 'baseColor', label: 'Base Color', type: 'vec3color', default: [0.1, 0.1, 0.1], themed: true },
      { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 3, step: 0.05, default: 0.3 },
      { key: 'amplitude', label: 'Amplitude', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
  },

  beams: {
    id: 'beams',
    title: 'Beams',
    swatch: 'linear-gradient(135deg,#0b0b14,#3b3b6d,#e9e9ff)',
    controls: [
      { key: 'beamWidth', label: 'Beam Width', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.5 },
      { key: 'beamHeight', label: 'Beam Height', type: 'range', min: 5, max: 30, step: 1, default: 18 },
      { key: 'beamNumber', label: 'Beam Count', type: 'range', min: 4, max: 40, step: 1, default: 21 },
      { key: 'lightColor', label: 'Light Color', type: 'color', default: '#ffffff', themed: true },
      { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 12, step: 0.1, default: 6.1 },
      { key: 'noiseIntensity', label: 'Noise', type: 'range', min: 0, max: 3, step: 0.05, default: 0 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 1.5, step: 0.01, default: 0.35 },
      { key: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 360, step: 1, default: 0 },
    ],
  },

  galaxy: {
    id: 'galaxy',
    title: 'Galaxy',
    swatch: 'linear-gradient(135deg,#04021a,#a855f7,#fce7f3)',
    controls: [
      { key: 'density', label: 'Density', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'twinkleIntensity', label: 'Twinkle', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'glowIntensity', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'hueShift', label: 'Hue Shift', type: 'range', min: 0, max: 360, step: 1, default: 140 },
      { key: 'starSpeed', label: 'Star Speed', type: 'range', min: 0, max: 2, step: 0.05, default: 0.5 },
      { key: 'rotationSpeed', label: 'Rotation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
    ],
  },

  'floating-lines': {
    id: 'floating-lines',
    title: 'Floating Lines',
    swatch: 'linear-gradient(135deg,#1a0b2e,#c084fc,#f9a8d4)',
    controls: [
      { key: 'enabledWaves', label: 'Waves', type: 'multiSelect', options: ['top', 'middle', 'bottom'], default: ['top', 'middle', 'bottom'] },
      { key: 'linesGradient', label: 'Line Gradient', type: 'colorArray', max: 8, default: ['#FF9FFC', '#E879F9', '#C084FC', '#F9A8D4'], themed: true },
      { key: 'animationSpeed', label: 'Speed', type: 'range', min: 0, max: 4, step: 0.05, default: 1 },
      { key: 'bendRadius', label: 'Bend Radius', type: 'range', min: 0, max: 20, step: 0.5, default: 5 },
      { key: 'bendStrength', label: 'Bend Strength', type: 'range', min: -10, max: 10, step: 0.1, default: -0.5 },
      { key: 'parallaxStrength', label: 'Parallax', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
    ],
  },

  'light-pillar': {
    id: 'light-pillar',
    title: 'Light Pillar',
    swatch: 'linear-gradient(135deg,#05030f,#5227ff,#ff9ffc)',
    controls: [
      { key: 'topColor', label: 'Top Color', type: 'color', default: '#5227FF', themed: true },
      { key: 'bottomColor', label: 'Bottom Color', type: 'color', default: '#FF9FFC', themed: true },
      { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
      { key: 'rotationSpeed', label: 'Rotation Speed', type: 'range', min: 0, max: 2, step: 0.05, default: 0.3 },
      { key: 'glowAmount', label: 'Glow', type: 'range', min: 0.001, max: 0.05, step: 0.001, default: 0.005 },
      { key: 'pillarWidth', label: 'Pillar Width', type: 'range', min: 0.5, max: 8, step: 0.1, default: 3 },
      { key: 'pillarHeight', label: 'Pillar Height', type: 'range', min: 0.1, max: 1.5, step: 0.05, default: 0.4 },
      { key: 'noiseIntensity', label: 'Noise', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.5 },
      { key: 'pillarRotation', label: 'Pillar Rotation', type: 'range', min: 0, max: 360, step: 1, default: 0 },
      { key: 'quality', label: 'Quality', type: 'select', options: ['low', 'medium', 'high'], default: 'high' },
    ],
  },

  'prismatic-burst': {
    id: 'prismatic-burst',
    title: 'Prismatic Burst',
    swatch: 'linear-gradient(135deg,#0a0118,#ff007a,#4d3dff)',
    controls: [
      { key: 'animationType', label: 'Animation', type: 'select', options: ['rotate', 'rotate3d', 'hover'], default: 'rotate3d' },
      { key: 'colors', label: 'Colors', type: 'colorArray', max: 8, default: ['#ff007a', '#4d3dff', '#ffffff'], themed: true },
      { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 6, step: 0.1, default: 2 },
      { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 3, step: 0.05, default: 0.5 },
      { key: 'distort', label: 'Distort', type: 'range', min: 0, max: 10, step: 0.1, default: 1 },
      { key: 'rayCount', label: 'Ray Count', type: 'range', min: 0, max: 64, step: 1, default: 24 },
    ],
  },
};

/** Display order of the style picker (after the "None" option). */
export const BACKGROUND_ORDER: BackgroundId[] = [
  'galaxy',
  'prismatic-burst',
  'light-pillar',
  'floating-lines',
  'liquid-chrome',
  'beams',
];

/** Build a `{ key: default }` map from a background's controls. */
export function defaultsFor(id: BackgroundId): Record<string, unknown> {
  const bg = BACKGROUNDS[id];
  if (!bg) return {};
  return Object.fromEntries(bg.controls.map((c) => [c.key, c.default]));
}
