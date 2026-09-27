import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * A room joins on phones, from the QR code. This plays a whole session on one:
 * join, switch tabs, set a limit, move a person, finish, and see the score.
 *
 * `isMobile` is not optional here. A real phone lays the page out at the width
 * of its widest content, which a narrow desktop window does not — that is how
 * a centred card once rendered off the side of the screen while a test at the
 * same size passed.
 */

const PHONE = { width: 390, height: 844 }
const PRESENTER_KEY = 'dev'
const ENVIRONMENT_NOISE = [/^\[\.WebGL-/, /GL Driver Message/]

function watchForErrors(page: Page) {
  const problems: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    if (ENVIRONMENT_NOISE.some((p) => p.test(m.text()))) return
    problems.push(`${m.type()}: ${m.text()}`)
  })
  // With the stack: the bare message could not say that Pixi threw it.
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}\n${e.stack}`))
  return problems
}

async function expectOnScreen(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  expect(box, `${selector} is rendered`).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${selector} fits the width`).toBeLessThanOrEqual(PHONE.width + 0.5)
  expect(box!.y + box!.height, `${selector} fits the height`).toBeLessThanOrEqual(PHONE.height + 0.5)
}

test.describe('on a phone held upright', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true })

  test('a player joins, plays with their thumbs, and sees their score', async ({ page, request }) => {
    const created = await request.post('/api/sessions', {
      data: { ticks: 400 },
      headers: { authorization: `Bearer ${PRESENTER_KEY}` },
    })
    const { code } = (await created.json()) as { code: string }
    const problems = watchForErrors(page)

    await page.goto(`/?join=${code}`)
    await page.getByLabel(/your name/i).fill('Thumbs')
    await page.getByRole('button', { name: 'Play' }).tap()
    await expect(page.locator('.board canvas')).toBeVisible()

    // Nothing overflows sideways, and the parts a phone relies on are on screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(PHONE.width)
    await expectOnScreen(page, '.board')
    await expectOnScreen(page, '.statusline')
    await expectOnScreen(page, '.tabs')
    await expectOnScreen(page, '.controls')

    // One tab of the panel at a time, starting on WIP.
    const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`, 'i') })
    await expect(tab('WIP')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.wip').first()).toBeVisible()
    await expect(page.locator('.staff').first()).toBeHidden()

    await page.locator('.wip').filter({ hasText: 'Implement' }).locator('input').fill('3')

    // Move an implementer to Review, tap, tap.
    await tab('Team').tap()
    await expect(page.locator('.wip').first()).toBeHidden()
    const row = (name: string) => page.locator('.staff').filter({ hasText: name })
    await row('Implement').getByRole('button', { name: 'W2' }).tap()
    await row('Review').getByRole('button', { name: /move W2 here/ }).tap()
    await expect(row('Review').getByRole('button', { name: /^W2/ })).toBeVisible({ timeout: 10_000 })

    // The status line opens the tab that explains it.
    await page.locator('.statusline').tap()
    await expect(tab('Flow')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.constraint')).toBeVisible()

    await page.getByRole('button', { name: '4×', exact: true }).tap()
    const end = page.getByRole('dialog', { name: 'Run finished' })
    await expect(end).toBeVisible({ timeout: 60_000 })
    await expectOnScreen(page, '.overlay .card')
    await expect(end.locator('.end__rank')).toContainText('#1 of 1', { timeout: 15_000 })

    expect(problems, problems.join('\n')).toEqual([])
  })
})

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

  test('it asks to be turned upright, and can be told no', async ({ page }) => {
    await page.goto('/')
    const note = page.getByRole('dialog', { name: 'Turn your phone upright' })
    await expect(note).toBeVisible()
    await note.getByRole('button', { name: 'Stay sideways' }).tap()
    await expect(note).toBeHidden()
  })
})

test('a laptop gets the laptop layout, and no notices', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.tabs')).toBeHidden()
  await expect(page.locator('.statusline')).toBeHidden()
  // Every section of the panel at once, as before.
  await expect(page.locator('.wip').first()).toBeVisible()
  await expect(page.locator('.staff').first()).toBeVisible()
})
