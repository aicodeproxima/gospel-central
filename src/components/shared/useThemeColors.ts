'use client';

import { useEffect, useState } from 'react';
import type { ResolvedThemeColors } from '@/lib/background/theme-props';

/** Parse any CSS color string the browser produced ("rgb(r, g, b)",
 *  "rgb(r g b / a)", "rgba(...)") into [r,g,b] 0..255. */
function parseRgb(str: string): [number, number, number] {
  const nums = str.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return [128, 128, 128];
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl([r, g, b]: [number, number, number]): { hue: number; sat: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, sat: Math.min(1, sat) };
}

/** Resolve a CSS custom property (which may be an oklch() value) to a real
 *  rgb triple by letting the browser compute it on a throwaway element. */
function resolveVar(varName: string): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = `var(${varName})`;
  probe.style.position = 'fixed';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return parseRgb(rgb);
}

function read(): ResolvedThemeColors {
  const rgb255 = resolveVar('--primary');
  const { hue, sat } = rgbToHsl(rgb255);
  return {
    primaryHex: toHex(rgb255),
    primaryRgb: [rgb255[0] / 255, rgb255[1] / 255, rgb255[2] / 255],
    primaryHue: hue,
    primarySat: sat,
  };
}

const FALLBACK: ResolvedThemeColors = {
  primaryHex: '#8b5cf6',
  primaryRgb: [0.545, 0.361, 0.965],
  primaryHue: 258,
  primarySat: 0.9,
};

/**
 * Live theme colors, re-resolved whenever the palette (`data-theme`) or mode
 * (`.dark` class) on <html> changes. Used to tint the animated background.
 */
export function useThemeColors(): ResolvedThemeColors {
  const [colors, setColors] = useState<ResolvedThemeColors>(FALLBACK);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setColors(read()));
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, []);

  return colors;
}
