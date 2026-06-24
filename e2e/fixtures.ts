import { test as base } from '@playwright/test';

/**
 * Base test that pins the mock seed clock on every page via an init script
 * (runs before page scripts → the mock-clock reads `window.__MOCK_DATE__` at
 * module init → the date-relative seed is deterministic across runs/days).
 */
const MOCK_DATE = '2026-06-22T12:00:00';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((d) => {
      (window as unknown as { __MOCK_DATE__?: string }).__MOCK_DATE__ = d;
    }, MOCK_DATE);
    await use(page);
  },
});

export { expect } from '@playwright/test';
