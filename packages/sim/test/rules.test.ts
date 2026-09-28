import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from '@flow/content'
import { RULES_PROBE, RULES_VERSION, fnv1a } from '@flow/sim'
import { GOLDEN, GOLDEN_IGNORED, GOLDEN_STAFFED } from './goldens.js'

/**
 * Keeps `RULES_VERSION` honest (src/rules.ts). The probe hashes the default
 * tuning and the golden fingerprints, which `replay.test.ts` asserts against
 * the live sim. If this goes red, the rules changed: a save made before the
 * change would replay into a different game. Bump `RULES_VERSION`, add a line
 * to its history saying what changed, and record the new probe.
 */
function rulesProbe(): string {
  return fnv1a(JSON.stringify([DEFAULT_TUNING, GOLDEN, GOLDEN_STAFFED, GOLDEN_IGNORED]))
}

describe('rules version', () => {
  it('moves whenever the tuning or a golden replay moves', () => {
    expect(
      rulesProbe(),
      `The rules changed. Bump RULES_VERSION (now ${RULES_VERSION}) in packages/sim/src/rules.ts, ` +
        `say why in its history, and set RULES_PROBE to the value received here.`,
    ).toBe(RULES_PROBE)
  })

  it('notices a tuning change', () => {
    const tweaked = { ...DEFAULT_TUNING, contextDecay: { ...DEFAULT_TUNING.contextDecay, max: 5 } }
    expect(fnv1a(JSON.stringify([tweaked, GOLDEN, GOLDEN_STAFFED, GOLDEN_IGNORED]))).not.toBe(
      rulesProbe(),
    )
  })
})
