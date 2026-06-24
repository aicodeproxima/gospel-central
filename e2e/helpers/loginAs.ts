import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Physical login: signs out if already authed (logout resets the mock to seed),
 * then types the username + the mock password into the real /login form. Mirrors
 * the manual QA flow. Seeded accounts (all password `admin`): admin (Dev),
 * overseer1, branch1, group1, team1, member3 (Member + teacher tag).
 */
export async function loginAs(page: Page, username: string, password = 'admin') {
  await page.goto('/login');
  if (page.url().includes('/dashboard')) {
    // already signed in as someone — sign out via the Settings danger zone
    await page.goto('/settings');
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await page.waitForURL('**/login');
  }
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard');
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}').username))
    .toBe(username);
}
