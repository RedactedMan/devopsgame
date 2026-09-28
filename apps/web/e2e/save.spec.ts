import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Save and load through the real page (M1 slice 4). The sim suite proves a
 * loaded game carries on exactly as an uninterrupted one would
 * (`save.test.ts`). What it cannot see is the bridge: that a load replaces the
 * state *and* the log, that the file really downloads, and that the player is
 * told what the load found.
 *
 * Screenshots go to the test's output folder, for the slice's look-at-it step
 * (plan §6).
 */

const PHONE = { width: 390, height: 844 }
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

const statValue = (page: Page, label: string) =>
  page
    .locator('.stat', { has: page.locator('.stat__label', { hasText: new RegExp(`^${label}$`, 'i') }) })
    .locator('.stat__value')

type Save = {
  game: string
  rules: number
  seed: number
  tick: number
  commands: unknown[]
  check: { fingerprint: string; shipped: number }
}

async function saveNow(page: Page, tap: boolean): Promise<{ save: Save; path: string; name: string }> {
  const download = page.waitForEvent('download')
  const button = page.getByRole('button', { name: 'Save', exact: true })
  await (tap ? button.tap() : button.click())
  const file = await download
  const path = test.info().outputPath(file.suggestedFilename())
  await file.saveAs(path)
  return { save: JSON.parse(await readFile(path, 'utf8')) as Save, path, name: file.suggestedFilename() }
}

async function play(page: Page, ms: number) {
  await page.getByRole('button', { name: '4×', exact: true }).click()
  await page.waitForTimeout(ms)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
}

const loadInput = (page: Page) => page.getByLabel('Load a saved game')

test('saves a run, carries on, and loads it back to where it was', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.board canvas')).toBeVisible()

  // A decision, so the log has something in it to restore.
  await page.locator('.wip').filter({ hasText: 'Implement' }).locator('input').fill('3')
  await play(page, 4000)
  const dayAtSave = await statValue(page, 'Day').innerText()

  const first = await saveNow(page, false)
  expect(first.save.game).toBe('flow-state')
  expect(first.save.commands.length).toBeGreaterThan(0)
  expect(first.name).toBe(`flow-state-${first.save.seed}-day${dayAtSave}.json`)
  await expect(page.locator('.toast')).toContainText(`Saved day ${dayAtSave}`)
  await page.screenshot({ path: test.info().outputPath('laptop-saved.png') })

  // Play on, somewhere else entirely, so the load has something to undo.
  await page.getByRole('button', { name: 'New seed', exact: true }).click()
  await play(page, 1500)
  expect(await statValue(page, 'Day').innerText()).not.toBe(dayAtSave)

  await loadInput(page).setInputFiles(first.path)
  const dialog = page.getByRole('dialog', { name: 'Loaded' })
  await expect(dialog).toContainText(`Loaded day ${dayAtSave}`)
  await expect(dialog).toContainText(`Seed ${first.save.seed}`)
  await expect(statValue(page, 'Day')).toHaveText(dayAtSave)
  await page.screenshot({ path: test.info().outputPath('laptop-loaded.png') })
  await dialog.getByRole('button', { name: 'Stay paused' }).click()

  // Saving straight after the load writes the same run: same state, and the
  // log was restored rather than started again.
  const again = await saveNow(page, false)
  expect(again.save.tick).toBe(first.save.tick)
  expect(again.save.seed).toBe(first.save.seed)
  expect(again.save.check.fingerprint).toBe(first.save.check.fingerprint)
  expect(again.save.commands).toEqual(first.save.commands)

  expect(problems).toEqual([])
})

test('says so when a save was made under other rules, and refuses what is not a save', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await play(page, 6000)
  const { save } = await saveNow(page, false)
  expect(save.check.shipped).toBeGreaterThan(0)

  // An older rules version whose run replays the same: loads, and says the
  // rules from here on are today's.
  const older = test.info().outputPath('older-rules.json')
  await writeFile(older, JSON.stringify({ ...save, rules: save.rules - 1 }))
  await loadInput(page).setInputFiles(older)
  const dialog = page.getByRole('dialog', { name: 'Loaded' })
  await expect(dialog).toContainText('under new rules')
  await expect(dialog).toContainText(`rules v${save.rules - 1}`)
  await page.screenshot({ path: test.info().outputPath('laptop-rules-changed.png') })
  await dialog.getByRole('button', { name: 'Stay paused' }).click()

  // A save whose recorded outcome today's rules do not reproduce: loads, and
  // shows then against now.
  const moved = test.info().outputPath('run-changed.json')
  await writeFile(
    moved,
    JSON.stringify({
      ...save,
      rules: save.rules - 1,
      check: { ...save.check, fingerprint: '00000000', shipped: save.check.shipped + 3 },
    }),
  )
  await loadInput(page).setInputFiles(moved)
  await expect(dialog).toContainText('not the game you saved')
  await expect(dialog).toContainText(`then ${save.check.shipped + 3} shipped`)
  await expect(dialog).toContainText(`now ${save.check.shipped} shipped`)
  await page.screenshot({ path: test.info().outputPath('laptop-run-changed.png') })
  await dialog.getByRole('button', { name: 'Stay paused' }).click()

  // Not a save: refused, and the game is left alone.
  const dayBefore = await statValue(page, 'Day').innerText()
  const junk = test.info().outputPath('junk.json')
  await writeFile(junk, '{"hello": "world"}')
  await loadInput(page).setInputFiles(junk)
  const refused = page.getByRole('dialog', { name: 'Could not load' })
  await expect(refused).toContainText('This is not a Flow State save')
  await page.screenshot({ path: test.info().outputPath('laptop-refused.png') })
  await refused.getByRole('button', { name: 'OK' }).click()
  expect(await statValue(page, 'Day').innerText()).toBe(dayBefore)

  expect(problems).toEqual([])
})

test('a session game has no save or load', async ({ page, request }) => {
  const created = await request.post('/api/sessions', {
    data: { ticks: 400 },
    headers: { authorization: 'Bearer dev' },
  })
  const { code } = (await created.json()) as { code: string }
  await page.goto(`/?join=${code}`)
  await page.getByLabel(/your name/i).fill('NoSaves')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.locator('.board canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Load', exact: true })).toHaveCount(0)
})

test.describe('on a phone held upright', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true })

  test('saves and loads with a thumb, and nothing runs off the screen', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await expect(page.locator('.board canvas')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(PHONE.width)

    for (const name of ['Save', 'Load']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox()
      expect(box, `${name} is on screen`).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width + 0.5)
      // A thumb needs something it can hit.
      expect(box!.height).toBeGreaterThanOrEqual(32)
    }

    await page.getByRole('button', { name: '4×', exact: true }).tap()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Pause', exact: true }).tap()
    const dayAtSave = await statValue(page, 'Day').innerText()
    const { path } = await saveNow(page, true)
    await expect(page.locator('.toast')).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('phone-saved.png') })

    await page.getByRole('button', { name: 'New seed', exact: true }).tap()
    await loadInput(page).setInputFiles(path)
    const dialog = page.getByRole('dialog', { name: 'Loaded' })
    await expect(dialog).toContainText(`Loaded day ${dayAtSave}`)
    const card = await dialog.locator('.card').boundingBox()
    expect(card!.x).toBeGreaterThanOrEqual(0)
    expect(card!.x + card!.width).toBeLessThanOrEqual(PHONE.width + 0.5)
    await page.screenshot({ path: test.info().outputPath('phone-loaded.png') })
    await dialog.getByRole('button', { name: 'Play on' }).tap()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(PHONE.width)

    expect(problems).toEqual([])
  })
})
