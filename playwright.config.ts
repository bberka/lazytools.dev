import { defineConfig, devices } from '@playwright/test';

// E2E_TARGET=export runs the suite against the static export in out/ (what
// actually ships) instead of the dev server. Build first: `npm run build`.
// E2E_PORT picks the port in export mode, for when 3000 is already taken.
const exportMode = process.env.E2E_TARGET === 'export';
const port = exportMode ? Number(process.env.E2E_PORT ?? 3000) : 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: exportMode ? `node scripts/serve-export.mjs ${port}` : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120000,
  },
});
