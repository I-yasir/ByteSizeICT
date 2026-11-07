import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 4 E2E suite (TRD §12, Plan P4.01). Runs against a production build (`next start`) on the
 * local Supabase stack, on its own port (default 3100) so a running `pnpm dev` is untouched. The
 * build and server get NEXT_PUBLIC_SITE_URL = that origin, because mutating routes check `Origin`.
 * Set E2E_RESET=1 to reset the database to the seed first (CI does).
 */
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
// Helpers (tests/helpers/e2e.ts) read this too.
process.env.E2E_BASE_URL = BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  // Specs share one database and one server; parallel workers would race on settings and the clock.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'bn-BD',
    timezoneId: 'Asia/Dhaka',
  },
  projects: [
    {
      name: 'mobile',
      // API-level specs (`@api`) and desktop-only admin workflows (`@desktop`) run once, in desktop.
      grepInvert: /@api|@desktop/,
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    env: { NEXT_PUBLIC_SITE_URL: BASE_URL },
    url: `${BASE_URL}/api/time`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
