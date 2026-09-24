import { describe, expect, it } from 'vitest'
import { fingerprint, initState, runReplay, step, type Replay } from '@flow/sim'

/**
 * A fixed script against a fixed seed. The hash below is not a magic number to
 * be updated when it goes red — it is the assertion. If it changes, the balance
 * of the game changed, and either that was intended or it was a bug.
 */
const REPLAY: Replay = {
  seed: 20260830,
  commands: [
    { tick: 30, command: { kind: 'setWipLimit', station: 'implement', limit: 12 } },
    { tick: 30, command: { kind: 'setWipLimit', station: 'review', limit: 8 } },
    { tick: 400, command: { kind: 'setWipLimit', station: 'implement', limit: 3 } },
    { tick: 400, command: { kind: 'setWipLimit', station: 'review', limit: 2 } },
    { tick: 900, command: { kind: 'setWipLimit', station: 'ci', limit: 3 } },
  ],
}

const GOLDEN = 'bbf2d633'
const TICKS = 1500

/**
 * A second script, for the half of the game the first one cannot see.
 *
 * `REPLAY` above predates `hire` and never leaves the starting roster, which is
 * exactly why it proved the attention pool was a no-op — and exactly why it
 * pins nothing about what happens after the player spends. Every balance
 * number in docs/HIRING_AND_ATTENTION.md lives past the point this run stops
 * looking, and the tests that assert them are sweeps over a dozen seeds: they
 * catch a lesson being lost and would not notice a 25% number becoming a 20%
 * one.
 *
 * So: move a person to the constraint, add agents where the gap is, and
 * retune afterwards, which is the whole of the slice in five commands. It used
 * to hire the person. The team is fixed now (docs/HIRING_AND_ATTENTION.md §8)
 * and the move pays onboarding, so the hash below was re-recorded then.
 */
const STAFFED: Replay = {
  seed: 20260830,
  commands: [
    { tick: 30, command: { kind: 'setWipLimit', station: 'implement', limit: 3 } },
    { tick: 30, command: { kind: 'setWipLimit', station: 'review', limit: 2 } },
    // W2 is an implementer: the roster is laid out in pipeline order.
    { tick: 300, command: { kind: 'assignWorker', workerId: 'W2', to: 'review' } },
    { tick: 320, command: { kind: 'hire', station: 'implement' } },
    { tick: 340, command: { kind: 'hire', station: 'implement' } },
    // The retune, which is worth more than a second move would be.
    { tick: 700, command: { kind: 'setWipLimit', station: 'implement', limit: 6 } },
    { tick: 700, command: { kind: 'setWipLimit', station: 'review', limit: 4 } },
  ],
}

const GOLDEN_STAFFED = '7ce23854'

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
