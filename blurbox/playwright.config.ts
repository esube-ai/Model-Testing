import { defineConfig } from '@playwright/test';

// E2E runs against the production build (vite preview) so the CSP and bundled worker are real.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone-400', use: { browserName: 'chromium', viewport: { width: 400, height: 800 }, hasTouch: true } },
    { name: 'desktop-1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
