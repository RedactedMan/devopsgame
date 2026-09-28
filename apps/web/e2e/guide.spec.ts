import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * The optional guide (added 2026-09-28): the first-visit offer, the tour, the
 * key, and the card for the item under the pointer. A new player could not
 * tell what a tile's colour, its "5u" or the blue bar on agent work meant, and
 * none of that is visible to the unit suite.
 */

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

test('a first visit is offered the tour, which pauses the clock and gives it back', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()
  await page.getByRole('button', { name: '1×', exact: true }).click()

  const offer = page.getByRole('region', { name: 'New here?' })
  await expect(offer).toBeVisible()
  // An offer, not a gate: nothing is in the way of playing.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await offer.getByRole('button', { name: 'Take the tour' }).click()
  const tour = page.getByRole('dialog', { name: 'Tour' })
  await expect(tour).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()

  const steps = Number((await tour.locator('.tour__step').innerText()).split('/')[1])
  expect(steps).toBeGreaterThan(5)
  const seen: string[] = []
  for (let i = 0; i < steps; i++) {
    seen.push(await tour.locator('h2').innerText())
    await tour.getByRole('button', { name: i === steps - 1 ? 'Done' : 'Next' }).click()
  }
  await expect(tour).toBeHidden()
  expect(seen).toEqual(expect.arrayContaining(['Colour is age', 'Size: how much work it is']))
  expect(seen.some((t) => /context decay/i.test(t))).toBe(true)

  // It was running before the tour, so it is running after.
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  // Taken once, the offer does not come back.
  await expect(offer).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.board canvas')).toBeVisible()
  await expect(page.getByRole('region', { name: 'New here?' })).toHaveCount(0)

  expect(problems, problems.join('\n')).toEqual([])
})

test('the ? opens the key, and leaves a paused game paused', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()
  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByRole('region', { name: 'New here?' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Guide' }).click()
  const key = page.getByRole('dialog', { name: 'Guide' })
  await expect(key).toBeVisible()
  await expect(key).toContainText(/Teal/)
  await expect(key).toContainText(/blue bar/)
  await page.keyboard.press('Escape')
  await expect(key).toBeHidden()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()

  // The key can hand over to the tour.
  await page.getByRole('button', { name: 'Guide' }).click()
  await key.getByRole('button', { name: 'Take the tour' }).click()
  await expect(page.getByRole('dialog', { name: 'Tour' })).toBeVisible()
})

test('hovering an item says what it is', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()
  await page.getByRole('button', { name: '4×', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()

  // The canvas is opaque to Playwright, so sweep Implement's column, which
  // is never empty a few days in, until a tile answers.
  const box = (await page.locator('.board').boundingBox())!
  const card = page.getByRole('tooltip')
  const x = box.x + (box.width / 6) * 2.5
  for (let y = 90; y < 300 && (await card.count()) === 0; y += 5) {
    await page.mouse.move(x, box.y + y)
    await page.waitForTimeout(40)
  }
  await expect(card).toBeVisible()
  await expect(card).toContainText(/Size\s*\d+u/)
  await expect(card).toContainText(/hands-on work/)

  await page.mouse.move(box.x + 5, box.y + box.height - 5)
  await expect(card).toBeHidden()
  expect(problems, problems.join('\n')).toEqual([])
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the tour opens the tab each step is about, and stays on screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.board canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Take the tour' }).tap()
    const tour = page.getByRole('dialog', { name: 'Tour' })
    const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`, 'i') })

    while (!/Team and attention/.test(await tour.locator('h2').innerText())) {
      const box = (await tour.locator('.tour__card').boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390.5)
      expect(box.y + box.height).toBeLessThanOrEqual(844.5)
      await tour.getByRole('button', { name: 'Next' }).tap()
    }
    await expect(tab('Team')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.staff').first()).toBeVisible()
    await tour.getByRole('button', { name: 'Skip' }).tap()
    await expect(tour).toBeHidden()
  })
})
