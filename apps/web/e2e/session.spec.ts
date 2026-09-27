import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Presentation mode, end to end: a presenter starts a session, a player joins
 * it from the link, plays to the whistle, and the run lands on the presenter's
 * board with the score the server got by replaying it.
 *
 * Runs against `wrangler dev` (playwright.config.ts), so the Durable Object and
 * the server-side replay are the real ones, on local storage.
 */

/** A tenth of a real session, so the test plays to the end in seconds. */
const SHORT_TICKS = 400

/** What `pnpm dev:server` sets. The deployed key is a Worker secret. */
const PRESENTER_KEY = 'dev'

const ENVIRONMENT_NOISE = [/^\[\.WebGL-/, /GL Driver Message/]

function watchForErrors(page: Page) {
  const problems: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    if (ENVIRONMENT_NOISE.some((p) => p.test(m.text()))) return
    problems.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  return problems
}

const dayStat = (page: Page) =>
  page.locator('.stat').filter({ has: page.locator('.stat__label', { hasText: /^Day$/ }) }).locator('.stat__value')

test('a player joins a session, finishes, and lands on the presenter board', async ({
  browser,
  request,
}) => {
  const created = await request.post('/api/sessions', {
    data: { ticks: SHORT_TICKS },
    headers: { authorization: `Bearer ${PRESENTER_KEY}` },
  })
  expect(created.status()).toBe(201)
  const { code, seed } = (await created.json()) as { code: string; seed: number }

  // The presenter's screen, as it would be on the projector.
  const presenterContext = await browser.newContext()
  const presenter = await presenterContext.newPage()
  const presenterProblems = watchForErrors(presenter)
  await presenter.goto(`/?present=${code}`)
  await expect(presenter.locator('.present__code')).toHaveText(code)
  await expect(presenter.locator('.present__seed')).toHaveText(`seed ${seed}`)

  // The QR code carries the join link, and clicking it makes it big enough for
  // the back of the room.
  const qr = presenter.getByRole('img', { name: /QR code for .*\?join=/ })
  await expect(qr).toHaveAccessibleName(new RegExp(`\\?join=${code}$`))
  await presenter.locator('.present__qr').click()
  const big = presenter.getByRole('dialog', { name: 'Join QR code' })
  await expect(big).toBeVisible()
  await big.click()
  await expect(big).toBeHidden()

  // A player on their own laptop: a separate context, so a separate player id.
  const playerContext = await browser.newContext()
  const player = await playerContext.newPage()
  const playerProblems = watchForErrors(player)
  await player.goto(`/?join=${code}`)
  await player.getByLabel(/your name/i).fill('Ada')
  await player.getByRole('button', { name: 'Play' }).click()
  await expect(player.locator('.board canvas')).toBeVisible()
  await expect(player.locator('.brand__tag')).toContainText(`${code} · Ada`)

  // One game for the whole room: nothing here offers a different one.
  await expect(player.getByRole('button', { name: 'New seed' })).toHaveCount(0)

  await expect(presenter.locator('.present__counts')).toContainText('1 playing')

  // Make a decision, so the board has a run to debrief, then run the clock out.
  await player.locator('.wip').filter({ hasText: 'Implement' }).locator('input').fill('3')
  await player.getByRole('button', { name: '4×', exact: true }).click()

  const end = player.getByRole('dialog', { name: 'Run finished' })
  await expect(end).toBeVisible({ timeout: 60_000 })
  const localScore = (await end.locator('.end__score').innerText()).trim()
  // The rank only appears once the server has replayed the run.
  await expect(end.locator('.end__rank')).toContainText('#1 of 1', { timeout: 15_000 })

  // The clock stopped where the session said it would.
  await expect(dayStat(player)).toHaveText('5.0 / 5')

  // The presenter's board shows the server's replayed score, which has to be
  // the one the player saw: that is the whole claim of verification.
  const row = presenter.locator('.board-table tbody tr').filter({ hasText: 'Ada' })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(row.locator('.board-table__score')).toHaveText(localScore)

  // And the debrief shows what they did.
  await row.click()
  await expect(presenter.locator('.present__debrief')).toContainText('Implement WIP limit → 3')

  // Playing again is the same game, and the board keeps one row per player.
  await end.getByRole('button', { name: /play again/i }).click()
  await expect(end).toBeHidden()
  await expect(dayStat(player)).toHaveText(/^[0-4]\.\d \/ 5$/)

  expect(playerProblems, playerProblems.join('\n')).toEqual([])
  expect(presenterProblems, presenterProblems.join('\n')).toEqual([])
  await presenterContext.close()
  await playerContext.close()
})

test('joining a session that does not exist says so', async ({ page }) => {
  await page.goto('/?join=ZZZZZ')
  await page.getByLabel(/your name/i).fill('Bob')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.locator('.error')).toContainText(/no such session/i)
})

test('only the presenter can start a session', async ({ request }) => {
  // Every run is replayed on the server, and CPU is billed without a cap. A
  // stranger who could create sessions could make the Worker replay anything.
  const anonymous = await request.post('/api/sessions', { data: {} })
  expect(anonymous.status()).toBe(401)
  const wrong = await request.post('/api/sessions', {
    data: {},
    headers: { authorization: 'Bearer not-the-key' },
  })
  expect(wrong.status()).toBe(401)
})

test('the presenter screen asks for the key and says when it is wrong', async ({ page }) => {
  await page.goto('/?present')
  await page.getByLabel('Presenter key').fill('not-the-key')
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.locator('.error')).toContainText(/wrong presenter key/i)

  await page.getByLabel('Presenter key').fill(PRESENTER_KEY)
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.locator('.present__code')).toHaveText(/^[A-Z2-9]{5}$/)
})
