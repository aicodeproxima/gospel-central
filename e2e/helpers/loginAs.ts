import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Physical login: signs out if already authed, then types the username + the
 * mock password into the real /login form and submits via Enter. Enter (form
 * submit) is used instead of clicking the Sign In button because the login
 * page's entry animation re-mounts the button mid-click (the same flake the
 * manual QA run hit).
 * NOTE (2026-07-18): logout no longer reseeds the mock — per-device
 * persistence keeps mutations across a re-login, matching the real backend.
 * Each test() still starts from the seed because a fresh context has an empty
 * localStorage (no gc-mock-v1 snapshot).
 * Seeded accounts (all password `admin`): admin (Dev), overseer1, branch1,
 * group1, team1, member3 (Member + teacher tag).
 */
export async function loginAs(page: Page, username: string, password = 'admin') {
  await page.goto('/login');
  if (page.url().includes('/dashboard')) {
    // already signed in as someone — sign out via the Settings danger zone
    await page.goto('/settings');
    await page.getByRole('button', { name: /sign out/i }).first().click({ force: true });
    await page.waitForURL('**/login');
  }
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#password').press('Enter');
  await page.waitForURL('**/dashboard');
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}').username))
    .toBe(username);
}
