import { test, expect } from '@playwright/test';
import path from 'node:path';

const uniqueEmail = () =>
  `e2e${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;

// Playwright transpiles specs to CommonJS, so __dirname is available.
// Spec lives at web/tests/e2e/smoke.spec.ts → up three levels is the repo root.
const SAMPLE_FILE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'files',
  'newegg_magecart_skimmer.js',
);

test.describe('smoke', () => {
  test('register, upload a sample file, see scan result', async ({ page }) => {
    await page.goto('/register');
    const email = uniqueEmail();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('hunter22!');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL('/');

    // Upload via the hidden file input next to the dropzone
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE);
    await page.waitForURL(/\/scans\/\d+/, { timeout: 30_000 });

    // Wait for scan result card — up to 180s (VT can be slow on first-time hashes)
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });
  });

  test('chat panel streams an explanation on scan detail', async ({ page }) => {
    await page.goto('/register');
    const email = uniqueEmail();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('hunter22!');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL('/');

    await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE);
    await page.waitForURL(/\/scans\/\d+/, { timeout: 30_000 });

    // Wait for result
    await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });

    // Chat panel should appear once scan is completed; seeded message auto-sends
    await expect(page.getByRole('heading', { name: /ask about this scan/i })).toBeVisible({
      timeout: 30_000,
    });

    // Wait for at least some streamed assistant text in the prose block
    const assistantProse = page.locator('.prose').first();
    await expect(assistantProse).toBeVisible({ timeout: 90_000 });
    // Text accumulates; wait for non-empty content
    await expect(assistantProse).not.toBeEmpty({ timeout: 90_000 });
  });

  test('logout clears session and redirects to /login', async ({ page }) => {
    await page.goto('/register');
    const email = uniqueEmail();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('hunter22!');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: /log out/i }).click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });
});
