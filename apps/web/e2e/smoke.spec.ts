import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Load, play, and assert the thing still works.
 *
 * Deliberately more than "no console errors": a page that has crashed its sim
 * loop but left the DOM standing produces a clean console forever. Every
 * assertion below is something that was, at some point this milestone, actually
 * broken in a way the unit suite could not see.
 */

const TICKS_PER_DAY = 80

/** Playing at 4× compresses a minute of play into fifteen seconds of test. */
const PLAY_MS = 15_000

/**
 * Messages the machine emits rather than the app. Kept as a short, explicit
 * allowlist: the value of this test is that it fails on anything unexpected, so
 * every entry here has to earn its place by being provably not ours.
 */
const ENVIRONMENT_NOISE = [
  /^\[\.WebGL-/, // GPU driver performance chatter from the headless GL stack
  /GL Driver Message/,
]

function watchForErrors(page: Page) {
  const problems: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const text = m.text()
    if (ENVIRONMENT_NOISE.some((p) => p.test(text))) return
    problems.push(`${m.type()}: ${text}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`))
  return problems
}

const statValue = (page: Page, label: string) =>
  page.locator('.stat', { has: page.locator('.stat__label', { hasText: new RegExp(`^${label}$`, 'i') }) })
    .locator('.stat__value')

const readDay = async (page: Page) => Number(await statValue(page, 'Day').innerText())

test('loads, plays, and keeps its console clean', async ({ page }) => {
  const problems = watchForErrors(page)

  await page.goto('/')

  // The canvas mounting at all is the StrictMode regression check.
  await expect(page.locator('.board canvas')).toBeVisible()
  await expect(page.locator('.topbar')).toBeVisible()

  await page.getByRole('button', { name: '4×', exact: true }).click()

  const startDay = await readDay(page)
  await page.waitForTimeout(PLAY_MS)
  const endDay = await readDay(page)

  // A frozen sim leaves a spotless console, so liveness is asserted directly.
  expect(endDay, 'the clock advanced').toBeGreaterThan(startDay)

  // Work actually moved through the line, not just the clock.
  const shipped = Number(await statValue(page, 'Shipped').innerText())
  expect(shipped, 'items reached production').toBeGreaterThan(0)

  const wip = Number(await statValue(page, 'WIP').innerText())
  expect(wip, 'the pipeline is holding work').toBeGreaterThan(0)

  expect(problems, problems.join('\n')).toEqual([])
})

test('the WIP slider moves and the sim accepts it', async ({ page }) => {
  // Regression: the slider used to be a controlled input fighting the tick
  // boundary, so the thumb snapped back mid-drag. It is the primary lever of
  // the entire game; if it does not track the mouse, nothing else matters.
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()

  const spec = page.locator('.wip').filter({ hasText: 'Spec' })
  const slider = spec.locator('input[type="range"]')

  await slider.fill('12')
  await expect(spec.locator('.wip__count')).toContainText('/12')

  await slider.fill('3')
  await expect(spec.locator('.wip__count')).toContainText('/3')

  expect(problems, problems.join('\n')).toEqual([])
})

test('names the constraint and lets a worker be moved to it', async ({ page }) => {
  // M1's whole loop in one pass: the sim finds the bottleneck, the panel says
  // which station it is, and the player can put someone else on it.
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()
  await page.getByRole('button', { name: '4×', exact: true }).click()

  // Nothing is named until utilisation has averaged over a shift — a busy
  // moment is not a constraint, and the HUD says so while it waits.
  await expect(page.locator('.constraint')).toContainText(/Measuring/i)
  await expect(page.locator('.constraint')).toContainText(/constraint (is|moved to) Review/i, {
    timeout: 60_000,
  })

  const row = (name: string) => page.locator('.staff').filter({ hasText: name })
  const review = row('Review')
  await expect(review.locator('.chip')).toHaveCount(1)

  await row('CI').locator('.chip').first().click()
  await review.locator('.chip--drop').click()

  // A worker mid-item finishes it first, so the move lands within a few ticks
  // rather than instantly. Either way it lands.
  await expect(review.locator('.chip')).toHaveCount(2, { timeout: 30_000 })

  expect(problems, problems.join('\n')).toEqual([])
})

test('a stalled line says so instead of reporting a good lead time', async ({ page }) => {
  // The alarm is the answer to a real playtest failure: the dashboard reported
  // 39.2h lead time while nothing had shipped for nine days. Drive the line
  // into that state and assert the HUD admits it.
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()

  await page.getByRole('button', { name: '4×', exact: true }).click()
  // Every limit wide open, and never resolve a stale item: the neglect case.
  for (const slider of await page.locator('.wip input[type="range"]').all()) {
    await slider.fill('20')
  }

  const alarm = page.locator('.alarm')
  await expect(alarm).toBeVisible({ timeout: 150_000 })
  await expect(alarm).toContainText(/Nothing shipped in/i)

  // The honest metric must have kept climbing while the flattering one froze.
  const oldest = Number((await statValue(page, 'Oldest').innerText()).replace(/[^\d.]/g, ''))
  const lead = Number((await statValue(page, 'Lead time').innerText()).replace(/[^\d.]/g, ''))
  expect(oldest, `oldest ${oldest}h should exceed reported lead time ${lead}h`).toBeGreaterThan(lead)

  const day = await readDay(page)
  expect(day).toBeGreaterThan(TICKS_PER_DAY / TICKS_PER_DAY)
})
