import { test, expect } from '@playwright/test';
import path from 'node:path';

const SAMPLE_FILE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'files',
  'newegg_magecart_skimmer.js',
);

test.describe('smoke', () => {
  test('upload a sample file and see scan result', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE);
    await page.waitForURL(/\/scans\/.+/, { timeout: 180_000 });
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });
  });

  test('chat panel streams an explanation', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE);
    await page.waitForURL(/\/scans\/.+/, { timeout: 180_000 });
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole('textbox', { name: /message the assistant/i })).toBeVisible({
      timeout: 30_000,
    });
    const assistantProse = page.locator('.prose').first();
    await expect(assistantProse).toBeVisible({ timeout: 90_000 });
    await expect(assistantProse).not.toBeEmpty({ timeout: 90_000 });
  });

  test('reload preserves scan and chat within TTL', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE);
    await page.waitForURL(/\/scans\/.+/, { timeout: 180_000 });
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });

    const assistantProse = page.locator('.prose').first();
    await expect(assistantProse).toBeVisible({ timeout: 90_000 });
    await expect(assistantProse).not.toBeEmpty({ timeout: 90_000 });

    await page.reload();
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.prose').first()).toBeVisible({ timeout: 30_000 });
  });
});
