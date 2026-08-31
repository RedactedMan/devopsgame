import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * "No DOM, no timers, no `Math.random`, no `Date.now` inside `packages/sim`.
 * Ever." — the implementation plan's first rule.
 *
 * It is the kind of rule that erodes silently during a late-night push, and the
 * damage (replays that no longer reproduce, sweeps that no longer mean
 * anything) shows up long after the commit that caused it. So it is a test.
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url))

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'Math.random — use the seeded RNG in rng.ts'],
  [/\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/, 'wall-clock time — the sim only knows ticks'],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, 'timers — the sim does not own a clock'],
  [/\bdocument\.|\bwindow\.|\blocalStorage\b|\bfetch\(/, 'browser APIs — the sim is headless'],
]

/** Comments talk *about* these APIs on purpose, so they are not part of the scan. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('the sim stays pure', () => {
  const files = sources(SRC)

  it('finds the sources it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it.each(files)('%s reaches for nothing ambient', (file) => {
    const code = stripComments(readFileSync(file, 'utf8'))
    for (const [pattern, why] of FORBIDDEN) {
      expect(pattern.test(code), `${file} uses ${why}`).toBe(false)
    }
  })
})
