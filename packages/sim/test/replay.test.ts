import { describe, expect, it } from 'vitest'
import { fingerprint, initState, runReplay, step, type Replay } from '@flow/sim'
import {
  GOLDEN,
  GOLDEN_IGNORED,
  GOLDEN_STAFFED,
  IGNORED,
  REPLAY,
  STAFFED,
  TICKS,
} from './goldens.js'

/*
 * The three scripts and their hashes live in `goldens.ts`, with the reasons
 * each one exists. The hashes are not magic numbers to update when they go red:
 * they are the assertion.
 */

describe('replay', () => {
  it('reproduces a run exactly from seed and command log', () => {
    expect(fingerprint(runReplay(REPLAY, TICKS))).toBe(fingerprint(runReplay(REPLAY, TICKS)))
  })

  it('matches the golden fingerprint', () => {
    expect(fingerprint(runReplay(REPLAY, TICKS))).toBe(GOLDEN)
  })

  it('matches the golden fingerprint for a run that restaffs', () => {
    expect(fingerprint(runReplay(STAFFED, TICKS))).toBe(GOLDEN_STAFFED)
  })

  it('matches the golden fingerprint for a run that starts agents and walks away', () => {
    expect(fingerprint(runReplay(IGNORED, TICKS))).toBe(GOLDEN_IGNORED)
  })

  it('is actually a different run to the one that never staffs up', () => {
    // Guard against the second golden quietly becoming a copy of the first if
    // someone edits the command log down to nothing.
    expect(fingerprint(runReplay(STAFFED, TICKS))).not.toBe(GOLDEN)
  })

  it('notices when the command log changes', () => {
    const tampered: Replay = {
      seed: REPLAY.seed,
      commands: REPLAY.commands.slice(0, 2),
    }
    expect(fingerprint(runReplay(tampered, TICKS))).not.toBe(GOLDEN)
  })

  it('is unaffected by how the ticks are batched', () => {
    // Ten calls of one tick and one loop of ten must land in the same place,
    // or the renderer's frame pacing could change the outcome of the game.
    let a = initState({ seed: 7 })
    for (let i = 0; i < 300; i++) a = step(a).state
    let b = initState({ seed: 7 })
    for (let i = 0; i < 3; i++) for (let j = 0; j < 100; j++) b = step(b).state
    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  it('does not mutate the state it is given', () => {
    const before = initState({ seed: 12 })
    const snapshotOfInput = JSON.stringify(before)
    // Every command shape, because the failure this guards against is a shallow
    // copy in `cloneState`: a shared array would let one step's mutation leak
    // backwards, and nothing would go red until a replay quietly diverged.
    step(before, [
      { kind: 'setWipLimit', station: 'ci', limit: 99 },
      { kind: 'assignWorker', workerId: 'W1', to: 'review' },
    ])
    expect(JSON.stringify(before)).toBe(snapshotOfInput)
  })
})
