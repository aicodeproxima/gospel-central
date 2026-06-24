import { test, expect } from './fixtures';
import { loginAs } from './helpers/loginAs';

test.describe('smoke + permission boundaries', () => {
  test('a member can log in and reach the dashboard', async ({ page }) => {
    await loginAs(page, 'member3');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/upcoming/i).first()).toBeVisible();
  });

  test('a Member is redirected away from /admin and /reports', async ({ page }) => {
    await loginAs(page, 'member3');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('a Branch Leader CAN reach /admin and /reports', async ({ page }) => {
    await loginAs(page, 'branch1');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/reports/);
  });
});
