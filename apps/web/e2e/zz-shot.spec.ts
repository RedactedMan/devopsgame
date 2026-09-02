import { test } from '@playwright/test'
test('screenshot', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1600, height: 950 })
  await page.goto('/')
  await page.locator('.board canvas').waitFor()
  await page.getByRole('button', { name: '4×', exact: true }).click()
  await page.waitForTimeout(70_000)
  await page.screenshot({ path: process.env.SHOT!, fullPage: false })
})
