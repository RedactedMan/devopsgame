import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Which browser to drive. Two machines run this suite, and they have different
 * browsers on them (added 2026-09-28):
 *
 *  - **A laptop with Google Chrome installed.** Uses it through
 *    `channel: 'chrome'`, as the suite always has.
 *  - **The Claude Code cloud environment**, which has no Chrome and a Chromium
 *    at `$PLAYWRIGHT_BROWSERS_PATH/chromium`. That Chromium is not the revision
 *    this Playwright pins, so it is launched by path; Playwright would
 *    otherwise look for its own revision and fail.
 *
 * `PLAYWRIGHT_CHROMIUM=/path/to/chrome` overrides both.
 */
function browser() {
  const override = process.env.PLAYWRIGHT_CHROMIUM
  if (override) return { launchOptions: { executablePath: override } }

  const chrome = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/opt/google/chrome/chrome'],
    win32: [
      join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    ],
  }[process.platform as 'darwin' | 'linux' | 'win32']
  if (chrome?.some((path) => existsSync(path))) return { channel: 'chrome' }

  const bundled = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
    : null
  if (bundled && existsSync(bundled)) return { launchOptions: { executablePath: bundled } }

  // Neither: ask for Chrome, so the error names the browser to install.
  return { channel: 'chrome' }
}

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
 * It uses the browser already on the machine rather than Playwright's own
 * download, which keeps this runnable where fetching a 150MB browser is not an
 * option. The trade is that it tests the browser you have rather than a pinned
 * one; for a smoke test that is the right side of the trade. See `browser()`.
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
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], ...browser() } }],
  // Free play needs no API. Until 2026-10-06 a second server ran the
  // presentation-mode leaderboard on :8787; see apps/server/src/index.ts.
  webServer: {
    command: 'pnpm --filter @flow/web dev --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
