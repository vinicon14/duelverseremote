import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('http://127.0.0.1:8081/');
  await expect(page).toHaveTitle(/Duelverse/);
  await page.screenshot({ path: 'jules-scratch/verification/homepage.png' });
});
