import { describe, expect, it } from 'vitest'
import {
  MAX_SESSION_COMMANDS,
  SESSION_DEFAULT_SEED,
  fingerprint,
  initState,
  parseCommandLog,
  runReplay,
  sessionResult,
  sessionScore,
  stepLogged,
  summarize,
  verifyRun,
  type Command,
  type GameState,
  type LoggedCommand,
} from '@flow/sim'

/**
 * Presentation mode: one seed, one length, and a leaderboard that checks every
 * score by replaying it. All of that rests on one claim — that a run played
 * live and logged by the shell replays into exactly the same game — so that is
 * what most of this file tests.
 */

const TICKS = 1500

/**
 * Plays the way a person does: decisions land at odd ticks, several can land at
 * once, and stale items are resolved as they are noticed. Returns the live
 * state and the log the shell kept.
 */
function playLive(seed: number, ticks: number): { state: GameState; log: LoggedCommand[] } {
  let state = initState({ seed })
  const log: LoggedCommand[] = []
  for (let i = 0; i < ticks; i++) {
    const commands: Command[] = []
    if (state.tick === 37) {
      commands.push({ kind: 'setWipLimit', station: 'implement', limit: 3 })
      commands.push({ kind: 'setWipLimit', station: 'review', limit: 2 })
    }
    if (state.tick === 311) commands.push({ kind: 'assignWorker', workerId: 'W2', to: 'review' })
    if (state.tick === 333) commands.push({ kind: 'hire', station: 'implement' })
    if (state.tick % 50 === 0) {
      for (const item of state.items.filter((it) => it.stale)) {
        commands.push({ kind: 'resolveStale', itemId: item.id, choice: 'rebase' })
      }
    }
    state = stepLogged(state, commands, log)
  }
  return { state, log }
}

describe('presentation mode', () => {
  it('replays a logged live run into exactly the same game', () => {
    const { state, log } = playLive(SESSION_DEFAULT_SEED, TICKS)
    expect(log.length).toBeGreaterThan(4)
    const replayed = runReplay({ seed: SESSION_DEFAULT_SEED, commands: log }, TICKS)
    expect(fingerprint(replayed)).toBe(fingerprint(state))
    expect(sessionScore(replayed)).toBe(sessionScore(state))
  })

  it('survives the network: a log sent as JSON and parsed back verifies to the same score', () => {
    const { state, log } = playLive(SESSION_DEFAULT_SEED, TICKS)
    const parsed = parseCommandLog(JSON.parse(JSON.stringify(log)), TICKS)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(verifyRun({ seed: SESSION_DEFAULT_SEED, commands: parsed.commands }, TICKS)).toEqual(
      sessionResult(state),
    )
  })

  it('scores shipped work by the quality it shipped at', () => {
    const { state } = playLive(SESSION_DEFAULT_SEED, TICKS)
    const summary = summarize(state)
    expect(summary.shipped).toBeGreaterThan(0)
    const score = sessionScore(state)
    // Never more than a count of shipped items, and less whenever drift cost
    // anything — which is the point of not ranking by the count.
    expect(score).toBeLessThanOrEqual(summary.shipped)
    expect(score).toBeCloseTo(summary.shipped * summary.avgTrueQuality, 0)
  })

  it('ranks shipping stale work below rebasing it', () => {
    // The move the score exists to discourage. Same decisions otherwise.
    const play = (choice: 'rebase' | 'shipAnyway') => {
      let state = initState({ seed: SESSION_DEFAULT_SEED })
      for (let i = 0; i < 4000; i++) {
        const commands: Command[] =
          state.tick % 20 === 0
            ? state.items.filter((it) => it.stale).map((it) => ({ kind: 'resolveStale', itemId: it.id, choice }))
            : []
        state = stepLogged(state, commands, [])
      }
      return state
    }
    const shippedAnyway = play('shipAnyway')
    const rebased = play('rebase')
    expect(sessionResult(shippedAnyway).avgQuality).toBeLessThan(sessionResult(rebased).avgQuality)
  })
})

describe('parseCommandLog', () => {
  it('accepts every command a player can issue', () => {
    const log = [
      { tick: 0, command: { kind: 'setWipLimit', station: 'review', limit: 2 } },
      { tick: 1, command: { kind: 'resolveStale', itemId: 'I4', choice: 'abandon' } },
      { tick: 1, command: { kind: 'assignWorker', workerId: 'W2', to: 'review' } },
      { tick: 3998, command: { kind: 'hire', station: 'ci' } },
      { tick: 3999, command: { kind: 'removeAgent', workerId: 'W10' } },
    ]
    expect(parseCommandLog(log)).toEqual({ ok: true, commands: log })
  })

  it('strips fields step does not read', () => {
    const parsed = parseCommandLog([
      { tick: 5, command: { kind: 'hire', station: 'ci', score: 9999 }, extra: true },
    ])
    expect(parsed).toEqual({ ok: true, commands: [{ tick: 5, command: { kind: 'hire', station: 'ci' } }] })
  })

  it.each([
    ['not an array', { tick: 0 }],
    ['a tick past the end', [{ tick: 4000, command: { kind: 'hire', station: 'ci' } }]],
    ['a fractional tick', [{ tick: 1.5, command: { kind: 'hire', station: 'ci' } }]],
    ['an unknown station', [{ tick: 0, command: { kind: 'hire', station: 'qa' } }]],
    ['an unknown command', [{ tick: 0, command: { kind: 'setScore', score: 1 } }]],
    ['an unknown stale choice', [{ tick: 0, command: { kind: 'resolveStale', itemId: 'I1', choice: 'ignore' } }]],
    ['a non-finite limit', [{ tick: 0, command: { kind: 'setWipLimit', station: 'ci', limit: null } }]],
    [
      'ticks that go backwards',
      [
        { tick: 9, command: { kind: 'hire', station: 'ci' } },
        { tick: 8, command: { kind: 'hire', station: 'ci' } },
      ],
    ],
    ['too many commands', Array.from({ length: MAX_SESSION_COMMANDS + 1 }, () => ({ tick: 0, command: { kind: 'hire', station: 'ci' } }))],
  ])('rejects %s', (_why, raw) => {
    expect(parseCommandLog(raw).ok).toBe(false)
  })
})
