import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests against the running app (pnpm dev) with the demo data, in the installed
 * Microsoft Edge (no browser download). Run with `pnpm test:e2e`.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The tests share one demo database; run them one after another.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  use: {
    ...devices['Desktop Edge'],
    channel: 'msedge',
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    cwd: '..',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
