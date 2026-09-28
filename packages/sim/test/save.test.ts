import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from '@flow/content'
import {
  RULES_VERSION,
  SAVE_FORMAT,
  fingerprint,
  initState,
  loadSave,
  makeSave,
  parseSave,
  runReplay,
  stepLogged,
  type Command,
  type GameState,
  type LoggedCommand,
  type SaveFile,
} from '@flow/sim'

/**
 * Save and load (M1 slice 4). A save is the seed, the command log, and the tick
 * it was made at, and loading one is a replay. The claim everything rests on is
 * that a game saved, written to a file, read back and carried on is the same
 * game as one that was never interrupted, so that is the first test.
 */

const SEED = 20260830
const SAVE_AT = 1200
const PLAY_TO = 3000
const STAMP = { build: 'test', savedAt: '2026-09-27T12:00:00.000Z' }

/**
 * Decides like a person: WIP changes, a move, agents, and stale items rebased
 * as they are noticed. A function of the state alone, so a loaded game and an
 * uninterrupted one are offered exactly the same choices.
 */
function decide(state: GameState): Command[] {
  const commands: Command[] = []
  if (state.tick === 37) {
    commands.push({ kind: 'setWipLimit', station: 'implement', limit: 3 })
    commands.push({ kind: 'setWipLimit', station: 'review', limit: 2 })
  }
  if (state.tick === 311) commands.push({ kind: 'assignWorker', workerId: 'W2', to: 'review' })
  if (state.tick === 333 || state.tick === 1500) commands.push({ kind: 'hire', station: 'implement' })
  if (state.tick === 1800) commands.push({ kind: 'setWipLimit', station: 'implement', limit: 6 })
  if (state.tick % 50 === 0) {
    for (const item of state.items.filter((it) => it.stale)) {
      commands.push({ kind: 'resolveStale', itemId: item.id, choice: 'rebase' })
    }
  }
  return commands
}

function play(state: GameState, log: LoggedCommand[], until: number): GameState {
  while (state.tick < until) state = stepLogged(state, decide(state), log)
  return state
}

/** Through JSON and back, which is what a file on disk is. */
function throughFile(save: SaveFile): unknown {
  return JSON.parse(JSON.stringify(save))
}

function saved(until: number, seed = SEED): SaveFile {
  const log: LoggedCommand[] = []
  const state = play(initState({ seed }), log, until)
  return makeSave(seed, state, log, STAMP)
}

describe('save and load', () => {
  it('carries on from a save exactly as if the game had never stopped', () => {
    const straightLog: LoggedCommand[] = []
    const straight = play(initState({ seed: SEED }), straightLog, PLAY_TO)

    const parsed = parseSave(throughFile(saved(SAVE_AT)))
    if (!parsed.ok) throw new Error(parsed.error)
    const loaded = loadSave(parsed.save)
    expect(loaded.state.tick).toBe(SAVE_AT)
    expect(loaded.verdict.kind).toBe('same')

    // The loaded log is the one play continues onto, not a fresh one.
    const resumed = play(loaded.state, loaded.commands, PLAY_TO)
    expect(fingerprint(resumed)).toBe(fingerprint(straight))
    expect(loaded.commands).toEqual(straightLog)
    // And a save made after the load replays the whole run, both halves.
    expect(fingerprint(runReplay({ seed: SEED, commands: loaded.commands }, PLAY_TO))).toBe(
      fingerprint(straight),
    )
  })

  it('restores the whole state, not just what the fingerprint hashes', () => {
    const log: LoggedCommand[] = []
    const state = play(initState({ seed: SEED }), log, SAVE_AT)
    const parsed = parseSave(throughFile(makeSave(SEED, state, log, STAMP)))
    if (!parsed.ok) throw new Error(parsed.error)
    expect(JSON.stringify(loadSave(parsed.save).state)).toBe(JSON.stringify(state))
  })

  it('records what it was saved under', () => {
    const save = saved(SAVE_AT)
    expect(save.game).toBe('flow-state')
    expect(save.format).toBe(SAVE_FORMAT)
    expect(save.rules).toBe(RULES_VERSION)
    expect(save.tick).toBe(SAVE_AT)
    expect(save.build).toBe('test')
    expect(save.check.shipped).toBeGreaterThan(0)
  })

  it('says so when the rules changed but the run to the save did not', () => {
    const save = { ...saved(SAVE_AT), rules: RULES_VERSION - 1 }
    const loaded = loadSave(save)
    expect(loaded.verdict).toMatchObject({ kind: 'rulesChanged', savedRules: RULES_VERSION - 1 })
  })

  it('says what changed when today’s rules replay the decisions somewhere else', () => {
    // The case that made versioning the real question: slice 3b's context
    // decay. Five agents and nothing else, saved at 1500 under decay, loaded
    // into rules without it, replays to a different game (golden e97ce11e vs
    // 87dcabe9 in replay.test.ts).
    const log: LoggedCommand[] = [30, 31, 32, 33, 34].map((tick) => ({
      tick,
      command: { kind: 'hire', station: 'implement' },
    }))
    const state = runReplay({ seed: SEED, commands: log }, 1500)
    const save = makeSave(SEED, state, log, STAMP)
    const noDecay = { ...DEFAULT_TUNING, contextDecay: { graceTicks: 80, perShift: 0, max: 0 } }

    const loaded = loadSave(save, noDecay)
    expect(loaded.verdict.kind).toBe('runChanged')
    if (loaded.verdict.kind !== 'runChanged') return
    expect(loaded.verdict.then).toEqual({
      shipped: save.check.shipped,
      avgQuality: save.check.avgQuality,
    })
    expect(loaded.verdict.now).not.toEqual(loaded.verdict.then)
  })

  it('treats a save from the first tick as a game with nothing done yet', () => {
    const parsed = parseSave(throughFile(saved(0)))
    if (!parsed.ok) throw new Error(parsed.error)
    const loaded = loadSave(parsed.save)
    expect(loaded.state.tick).toBe(0)
    expect(loaded.commands).toEqual([])
    expect(loaded.verdict.kind).toBe('same')
  })

  it('keeps a long free-play log that a session would refuse', () => {
    // Free play never ends, and a slider drag is dozens of commands, so a save
    // outgrows the 3000 a session run is capped at.
    const log: LoggedCommand[] = Array.from({ length: 4000 }, (_, i) => ({
      tick: i,
      command: { kind: 'setWipLimit', station: 'implement', limit: 3 + (i % 5) },
    }))
    const state = runReplay({ seed: SEED, commands: log }, 4001)
    expect(parseSave(throughFile(makeSave(SEED, state, log, STAMP))).ok).toBe(true)
  })

  describe('refuses a file it cannot trust', () => {
    const good = throughFile(saved(SAVE_AT)) as Record<string, unknown>
    const cases: [string, unknown][] = [
      ['not an object', 'hello'],
      ['another game’s file', { ...good, game: 'factorio' }],
      ['a newer format', { ...good, format: SAVE_FORMAT + 1 }],
      ['a seed that is not a number', { ...good, seed: 'x' }],
      ['a negative tick', { ...good, tick: -1 }],
      ['a command at or after the save tick', { ...good, tick: 30 }],
      ['an unknown command', { ...good, commands: [{ tick: 1, command: { kind: 'win' } }] }],
      ['a missing check', { ...good, check: undefined }],
    ]
    for (const [name, raw] of cases) {
      it(name, () => {
        const parsed = parseSave(raw)
        expect(parsed.ok).toBe(false)
        if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0)
      })
    }
  })
})
