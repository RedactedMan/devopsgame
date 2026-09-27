import { defineConfig, devices } from '@playwright/test'

/**
 * The smoke test from the implementation plan §5: load it, play it, and fail on
 * anything the console complains about.
 *
 * It exists because the unit suite structurally cannot see the renderer. The
 * worst bug in M0 so far — React 18 StrictMode tearing down the Pixi
 * Application mid-`init()`, which took the entire React tree with it — passed
 * 49 green tests and was only found by driving a real browser. This is that,
 * automated.
 *
 * `channel: 'chrome'` uses the browser already on the machine rather than
 * Playwright's own download, which keeps this runnable in environments where
 * fetching a 150MB browser is not an option. The trade is that it tests the
 * Chrome you have rather than a pinned one; for a smoke test that is the right
 * side of the trade.
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      command: 'pnpm --filter @flow/web dev --port 5180 --strictPort',
      url: 'http://localhost:5180',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The leaderboard API, which Vite proxies `/api` to. Local Durable
      // Objects, so nothing leaves the machine.
      command: 'pnpm --filter @flow/server dev',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
