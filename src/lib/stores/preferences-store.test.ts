/**
 * Toggle-to-revert behavior (2026-07 UX request): clicking the ALREADY-ACTIVE
 * color theme or animated background swatch a second time reverts to
 * whatever was selected immediately before it, instead of being a no-op.
 * Runs in the `unit` (node) vitest project — no `document`/`localStorage`,
 * so `applyThemeToDOM`/`applyBackgroundToDOM` no-op via their own guards and
 * this file exercises pure state transitions.
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { usePreferencesStore } from './preferences-store';

const reset = () =>
  usePreferencesStore.setState({
    colorTheme: 'default',
    previousColorTheme: null,
    backgroundStyle: 'none',
    previousBackgroundStyle: null,
  });

beforeEach(reset);

describe('setColorTheme — toggle-to-revert', () => {
  test('picking a new theme records the old one as previous', () => {
    usePreferencesStore.getState().setColorTheme('ocean');
    const s = usePreferencesStore.getState();
    expect(s.colorTheme).toBe('ocean');
    expect(s.previousColorTheme).toBe('default');
  });

  test('clicking the active swatch again reverts to the previous theme', () => {
    usePreferencesStore.getState().setColorTheme('ocean');
    usePreferencesStore.getState().setColorTheme('ocean'); // second click, same swatch
    const s = usePreferencesStore.getState();
    expect(s.colorTheme).toBe('default');
    expect(s.previousColorTheme).toBe('ocean');
  });

  test('repeated clicks on the same swatch alternate cleanly between two themes', () => {
    usePreferencesStore.getState().setColorTheme('ocean'); // default -> ocean
    usePreferencesStore.getState().setColorTheme('ocean'); // ocean -> default (revert)
    usePreferencesStore.getState().setColorTheme('ocean'); // default -> ocean again
    expect(usePreferencesStore.getState().colorTheme).toBe('ocean');
    usePreferencesStore.getState().setColorTheme('ocean'); // ocean -> default
    expect(usePreferencesStore.getState().colorTheme).toBe('default');
  });

  test('switching to a THIRD theme mid-stream updates what a revert goes back to', () => {
    usePreferencesStore.getState().setColorTheme('ocean'); // default -> ocean
    usePreferencesStore.getState().setColorTheme('purple'); // ocean -> purple
    usePreferencesStore.getState().setColorTheme('purple'); // revert -> ocean (not default)
    expect(usePreferencesStore.getState().colorTheme).toBe('ocean');
  });

  test('with no history, clicking the already-active (initial) swatch is a no-op', () => {
    usePreferencesStore.getState().setColorTheme('default'); // already active, previous is null
    const s = usePreferencesStore.getState();
    expect(s.colorTheme).toBe('default');
    expect(s.previousColorTheme).toBeNull();
  });
});

describe('setBackgroundStyle — toggle-to-revert (incl. the explicit "None" swatch)', () => {
  test('picking a new background records the old one as previous', () => {
    usePreferencesStore.getState().setBackgroundStyle('beams');
    const s = usePreferencesStore.getState();
    expect(s.backgroundStyle).toBe('beams');
    expect(s.previousBackgroundStyle).toBe('none');
  });

  test('clicking the active background swatch again reverts to the previous one', () => {
    usePreferencesStore.getState().setBackgroundStyle('beams');
    usePreferencesStore.getState().setBackgroundStyle('beams');
    expect(usePreferencesStore.getState().backgroundStyle).toBe('none');
  });

  test('clicking "None" a second time restores the prior animated background', () => {
    usePreferencesStore.getState().setBackgroundStyle('beams'); // none -> beams
    usePreferencesStore.getState().setBackgroundStyle('none'); // beams -> none
    usePreferencesStore.getState().setBackgroundStyle('none'); // none -> beams (revert)
    expect(usePreferencesStore.getState().backgroundStyle).toBe('beams');
  });
});
