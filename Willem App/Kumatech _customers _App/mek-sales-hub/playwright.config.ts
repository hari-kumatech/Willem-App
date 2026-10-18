import { defineConfig, devices } from '@playwright/test';

// End-to-end test of the main flow (spec B.12): run → review → approve → lead → quote PDF.
// Needs the local stack: `npm run db:start`, the app on :3000, and either n8n (real or with
// `npm run mock:apify`) or `npm run mock:n8n`. Run with: npm run test:e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 8 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
