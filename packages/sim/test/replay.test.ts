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

describe('replay', () => {
  it('reproduces a run exactly from seed and command log', () => {
    expect(fingerprint(runReplay(REPLAY, TICKS))).toBe(fingerprint(runReplay(REPLAY, TICKS)))
  })

  it('matches the golden fingerprint', () => {
    expect(fingerprint(runReplay(REPLAY, TICKS))).toBe(GOLDEN)
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
    step(before, [{ kind: 'setWipLimit', station: 'ci', limit: 99 }])
    expect(JSON.stringify(before)).toBe(snapshotOfInput)
  })
})
