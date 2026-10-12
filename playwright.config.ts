import { defineConfig, devices } from "@playwright/test";

export const MOCK_PORT = 4011;
const APP_PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
    launchOptions: {
      // Optional: use a preinstalled Chromium instead of `npx playwright install chromium`.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Local mock provider; tests never contact a real model API.
      command: `node tests/mock/provider.ts ${MOCK_PORT}`,
      // Answers 401 without a key, which Playwright treats as "ready".
      url: `http://127.0.0.1:${MOCK_PORT}/v1/models`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { ALLOWED_API_HOSTS: "" },
    },
  ],
});
