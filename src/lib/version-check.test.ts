/**
 * Unit tests for the update-availability comparison. Pins the no-false-positive
 * guards: we only show the "update available" banner on a CONFIDENT mismatch,
 * never in dev/preview (no git → 'unknown') or on missing data.
 *
 * Run: npm test  (vitest `unit` project, node env)
 */
import { describe, expect, test } from 'vitest';
import { isUpdateAvailable } from './version-check';

describe('isUpdateAvailable', () => {
  const A = '1111111111111111111111111111111111111111';
  const B = '2222222222222222222222222222222222222222';

  test('different commits → update available', () => {
    expect(isUpdateAvailable(A, B)).toBe(true);
  });

  test('identical commits → no update', () => {
    expect(isUpdateAvailable(A, A)).toBe(false);
  });

  test("manifest 'unknown' → no update (dev/preview build, no git)", () => {
    expect(isUpdateAvailable(A, 'unknown')).toBe(false);
  });

  test("current 'unknown' → no update (no baked SHA → never nag)", () => {
    expect(isUpdateAvailable('unknown', B)).toBe(false);
  });

  test('manifest null/undefined/empty → no update', () => {
    expect(isUpdateAvailable(A, null)).toBe(false);
    expect(isUpdateAvailable(A, undefined)).toBe(false);
    expect(isUpdateAvailable(A, '')).toBe(false);
  });

  test('current empty → no update', () => {
    expect(isUpdateAvailable('', B)).toBe(false);
  });
});
