import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tier (Tier 2). Runs against an ephemeral `next dev` in MOCK mode with a
 * PINNED seed date so flows are deterministic. Determinism is enforced two ways:
 *  - the dev server gets NEXT_PUBLIC_MOCK_DATE (build-time inline), and
 *  - every page gets `window.__MOCK_DATE__` via an addInitScript (see e2e/fixtures.ts)
 *    which the mock-clock reads at module init — robust even against a reused server.
 * Visual-snapshot specs (Phase 4) are kept in *.visual.spec.ts and are not gating.
 */
const MOCK_DATE = '2026-06-22T12:00:00';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Generate /version.json (+ src/lib/version.ts) before dev starts so the
    // update-banner specs can hit a real manifest (dev doesn't run `prebuild`).
    command: 'node scripts/generate-version.mjs && npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_MOCK_API: 'true', NEXT_PUBLIC_MOCK_DATE: MOCK_DATE },
  },
  projects: [
    // Desktop: smoke + permission boundaries (chromium also owns the visual baselines).
    { name: 'chromium', testIgnore: /mobile\.spec/, use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testIgnore: /(mobile|visual)\.spec/, use: { ...devices['Desktop Safari'] } },
    // Mobile: fitment specs only. Galaxy S24 Ultra is the user's primary device.
    { name: 'mobile-pixel5', testMatch: /mobile\.spec/, use: { ...devices['Pixel 5'] } },
    {
      name: 'mobile-s24',
      testMatch: /mobile\.spec/,
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5 },
    },
  ],
});
