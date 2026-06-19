/**
 * Resolves the final prop object passed to a background component:
 *   schema defaults  →  theme-derived colors  →  user overrides  →  interactivity
 * (later layers win). Used by both the global BackgroundRenderer (interactive
 * off — the UI sits on top) and the customizer preview (interactive on).
 */
import { defaultsFor, type BackgroundId } from './schemas';
import { themePropsFor, type ResolvedThemeColors } from './theme-props';

/** Force each background's interaction flags on/off. The global background is
 *  non-interactive (pointer-events:none, content overlaid); the customizer
 *  preview turns it on so the user sees it react. */
function interactivityProps(style: BackgroundId, on: boolean): Record<string, unknown> {
  switch (style) {
    case 'liquid-chrome':
      return { interactive: on };
    case 'galaxy':
      return { mouseInteraction: on };
    case 'floating-lines':
      return { interactive: on, parallax: on };
    case 'light-pillar':
      return { interactive: on };
    default:
      return {};
  }
}

/** Defaults + theme tint, without user overrides — the customizer's baseline
 *  (what the controls show before the user changes anything). */
export function baselineProps(
  style: BackgroundId,
  colors: ResolvedThemeColors,
): Record<string, unknown> {
  return { ...defaultsFor(style), ...themePropsFor(style, colors) };
}

export function buildBackgroundProps(
  style: BackgroundId,
  colors: ResolvedThemeColors,
  overrides: Record<string, unknown> | undefined,
  opts?: { interactive?: boolean },
): Record<string, unknown> {
  return {
    ...baselineProps(style, colors),
    ...(overrides ?? {}),
    ...interactivityProps(style, opts?.interactive ?? false),
  };
}
