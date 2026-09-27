import { expect, test } from '@playwright/test'

/**
 * The stopgap until the phone layout: a phone is told, at the door and in the
 * game, that the screen is too small. It can still play. A laptop sees none of
 * it.
 */

test.describe('on a phone', () => {
  // `isMobile` matters: a real phone lays the page out as wide as its widest
  // content, which a narrow desktop window does not. That is how this notice
  // once rendered off the side of the screen while every test passed.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the join page says so before anyone plays', async ({ page }) => {
    await page.goto('/?join=ABCDE')
    await expect(page.getByRole('note')).toContainText(/too small/i)
  })

  test('the game says so, and lets them play anyway', async ({ page }) => {
    await page.goto('/')
    const gate = page.getByRole('dialog', { name: 'Screen too small' })
    await expect(gate).toBeVisible()
    const card = await gate.locator('.card').boundingBox()
    expect(card, 'the notice is on the screen, not beside it').not.toBeNull()
    expect(card!.x).toBeGreaterThanOrEqual(0)
    expect(card!.x + card!.width).toBeLessThanOrEqual(390)
    expect(card!.y + card!.height).toBeLessThanOrEqual(844)
    await gate.getByRole('button', { name: 'Play anyway' }).click()
    await expect(gate).toBeHidden()
    await expect(page.locator('.board canvas')).toBeVisible()
  })
})

test('a phone held sideways is still a phone', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Screen too small' })).toBeVisible()
})

test('a laptop sees none of it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?join=ABCDE')
  await expect(page.getByRole('note')).toHaveCount(0)
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Screen too small' })).toHaveCount(0)
})
