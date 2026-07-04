/**
 * Toggle-to-revert behavior (2026-07 UX request): clicking the ALREADY-ACTIVE
 * color theme or animated background swatch a second time reverts to
 * whatever was selected immediately before it, instead of being a no-op.
 * Runs in the `unit` (node) vitest project — no `document`/`localStorage`,
 * so `applyThemeToDOM`/`applyBackgroundToDOM` no-op via their own guards and
 * this file exercises pure state transitions.
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { usePreferencesStore, migratePreferences } from './preferences-store';

const reset = () =>
  usePreferencesStore.setState({
    colorTheme: 'basic',
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
    expect(s.previousColorTheme).toBe('basic');
  });

  test('clicking the active swatch again reverts to the previous theme', () => {
    usePreferencesStore.getState().setColorTheme('ocean');
    usePreferencesStore.getState().setColorTheme('ocean'); // second click, same swatch
    const s = usePreferencesStore.getState();
    expect(s.colorTheme).toBe('basic');
    expect(s.previousColorTheme).toBe('ocean');
  });

  test('repeated clicks on the same swatch alternate cleanly between two themes', () => {
    usePreferencesStore.getState().setColorTheme('ocean'); // default -> ocean
    usePreferencesStore.getState().setColorTheme('ocean'); // ocean -> default (revert)
    usePreferencesStore.getState().setColorTheme('ocean'); // default -> ocean again
    expect(usePreferencesStore.getState().colorTheme).toBe('ocean');
    usePreferencesStore.getState().setColorTheme('ocean'); // ocean -> default
    expect(usePreferencesStore.getState().colorTheme).toBe('basic');
  });

  test('switching to a THIRD theme mid-stream updates what a revert goes back to', () => {
    usePreferencesStore.getState().setColorTheme('ocean'); // default -> ocean
    usePreferencesStore.getState().setColorTheme('purple'); // ocean -> purple
    usePreferencesStore.getState().setColorTheme('purple'); // revert -> ocean (not default)
    expect(usePreferencesStore.getState().colorTheme).toBe('ocean');
  });

  test('with no history, clicking the already-active (initial) swatch is a no-op', () => {
    usePreferencesStore.getState().setColorTheme('basic'); // already active, previous is null
    const s = usePreferencesStore.getState();
    expect(s.colorTheme).toBe('basic');
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

/**
 * v4 persisted-blob migration (2026-07 overhaul Phase 7, Decision 8): Marble
 * becomes the app default. A single-shot prod-storage migration, so exercise
 * the v1/v2/v3 upgrade paths against hand-crafted blobs directly.
 */
describe('migratePreferences — v4 (Marble force + default→basic rename)', () => {
  test('v1 blob (no version, no background fields) → Marble + background defaults', () => {
    const r = migratePreferences({ colorTheme: 'ocean', language: 'es' }, 1);
    expect(r.colorTheme).toBe('marble'); // forced
    expect(r.backgroundStyle).toBe('none'); // v1→v2 default
    expect(r.backgroundConfig).toEqual({});
    expect(r.language).toBe('es'); // unrelated prefs preserved
  });

  test('v2 blob on a since-removed theme (voronoi) → Marble (not stranded)', () => {
    const r = migratePreferences({ colorTheme: 'voronoi', backgroundStyle: 'beams' }, 2);
    expect(r.colorTheme).toBe('marble'); // voronoi normalized then forced
    expect(r.backgroundStyle).toBe('beams'); // already had bg fields → kept
  });

  test('v3 blob on the old default palette → Marble', () => {
    const r = migratePreferences({ colorTheme: 'default', previousColorTheme: 'ocean' }, 3);
    expect(r.colorTheme).toBe('marble'); // forced
    expect(r.previousColorTheme).toBe('ocean'); // valid literal, untouched
  });

  test("v3 blob whose revert-history is the dead 'default' literal → renamed to 'basic'", () => {
    const r = migratePreferences({ colorTheme: 'sunset', previousColorTheme: 'default' }, 3);
    expect(r.colorTheme).toBe('marble'); // forced
    expect(r.previousColorTheme).toBe('basic'); // dead literal renamed, not stranded
  });

  test('v3 blob already on Marble stays Marble (idempotent force)', () => {
    const r = migratePreferences({ colorTheme: 'marble', previousColorTheme: 'rose' }, 3);
    expect(r.colorTheme).toBe('marble');
    expect(r.previousColorTheme).toBe('rose');
  });

  test('null / empty persisted blob does not throw and yields Marble', () => {
    expect(migratePreferences(null, 1).colorTheme).toBe('marble');
    expect(migratePreferences(undefined, 3).colorTheme).toBe('marble');
    expect(migratePreferences({}, 3).colorTheme).toBe('marble');
  });
});
