import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs script with no type declarations
import { buildDeck } from './build.mjs'

/**
 * The talk lives in this repo (docs/deck/README.md). These keep the three
 * copies of it honest: the slide files, the index that orders them, and the
 * built page someone opens on the day.
 */
const dir = new URL('.', import.meta.url).pathname
const deck = JSON.parse(readFileSync(join(dir, 'project/deck.json'), 'utf8')) as { order: string[] }

describe('the deck', () => {
  it('lists every slide file in its order, and every slide in the order has a file', () => {
    const files = readdirSync(join(dir, 'project/slides')).map((f) => f.replace(/\.html$/, ''))
    expect([...files].sort()).toEqual([...deck.order].sort())
  })

  it('has a drawing for every icon it uses', () => {
    expect(buildDeck().missingIcons).toEqual([])
  })

  it('is built: deck.html matches the slides. Run pnpm deck if not', () => {
    expect(readFileSync(join(dir, 'deck.html'), 'utf8')).toBe(buildDeck().page)
  })
})
