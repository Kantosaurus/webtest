import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['line']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
