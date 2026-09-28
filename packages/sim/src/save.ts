import type { Tuning } from '@flow/content'
import type { LoggedCommand } from './commands.js'
import { fingerprint, runReplay } from './replay.js'
import { RULES_VERSION } from './rules.js'
import { parseCommandLog } from './session.js'
import type { GameState } from './state.js'
import { summarize } from './systems/metrics.js'

/**
 * A save file (M1 slice 4).
 *
 * The run itself is `seed`, `tick` and `commands`: replaying the commands from
 * the seed for `tick` steps rebuilds the whole state, not an approximation of
 * it. Everything else is there so loading can say whether that replay is still
 * the game the player saved. `rules` says which rules it was played under
 * (`rules.ts`), and `check` is the state it replayed to then, so a load can
 * tell whether today's rules still replay to the same place and, if not, show
 * the difference. `build` and `savedAt` are only for the message.
 *
 * A save is made from what `step` has applied. A decision still queued in the
 * shell is not in the log yet, and is not in the save.
 */
export type SaveFile = {
  game: 'flow-state'
  format: typeof SAVE_FORMAT
  rules: number
  build: string | null
  savedAt: string | null
  seed: number
  tick: number
  commands: LoggedCommand[]
  check: SaveCheck
}

export type SaveCheck = { fingerprint: string; shipped: number; avgQuality: number }

/** The shape of the file. Moves only when an old file could not be read by the new parser. */
export const SAVE_FORMAT = 1

/**
 * Free play never ends and a slider drag is dozens of commands, so a save
 * outgrows the session cap. This bounds how long a load can take to replay.
 */
export const MAX_SAVE_COMMANDS = 50_000

/**
 * 2500 sim days. A replay runs at about 22 µs a tick in Node (4000 ticks in
 * 89 ms, 2026-09-27), so the longest save this accepts takes a few seconds to
 * load, and nobody plays free play that long.
 */
export const MAX_SAVE_TICKS = 200_000

/** Supplied by the shell. The sim has no clock and does not know its build. */
export type SaveStamp = { build: string | null; savedAt: string | null }

/** The seed is passed in because the state does not keep it: the rng holds only where it has got to. */
export function makeSave(
  seed: number,
  state: GameState,
  commands: readonly LoggedCommand[],
  stamp: SaveStamp,
): SaveFile {
  return {
    game: 'flow-state',
    format: SAVE_FORMAT,
    rules: RULES_VERSION,
    build: stamp.build,
    savedAt: stamp.savedAt,
    seed,
    tick: state.tick,
    commands: [...commands],
    check: check(state),
  }
}

/**
 * What a load found.
 *
 * - `same`: saved under today's rules and replayed to the same place.
 * - `rulesChanged`: saved under older rules, but the run up to the save
 *   replays exactly. The rest of the game plays under today's rules.
 * - `runChanged`: today's rules replay the player's decisions to a different
 *   place. The game loads anyway, because deploys replace the old build and
 *   refusing would leave the player nothing to play, but it says so.
 */
export type LoadVerdict =
  | { kind: 'same' }
  | { kind: 'rulesChanged'; savedRules: number }
  | {
      kind: 'runChanged'
      savedRules: number
      then: Omit<SaveCheck, 'fingerprint'>
      now: Omit<SaveCheck, 'fingerprint'>
    }

export type Loaded = { state: GameState; commands: LoggedCommand[]; verdict: LoadVerdict }

export function loadSave(save: SaveFile, tuning?: Tuning): Loaded {
  const state = runReplay({ seed: save.seed, commands: save.commands }, save.tick, tuning)
  const now = check(state)
  let verdict: LoadVerdict
  if (now.fingerprint !== save.check.fingerprint) {
    verdict = {
      kind: 'runChanged',
      savedRules: save.rules,
      then: { shipped: save.check.shipped, avgQuality: save.check.avgQuality },
      now: { shipped: now.shipped, avgQuality: now.avgQuality },
    }
  } else if (save.rules !== RULES_VERSION) {
    verdict = { kind: 'rulesChanged', savedRules: save.rules }
  } else {
    verdict = { kind: 'same' }
  }
  return { state, commands: [...save.commands], verdict }
}

/**
 * Reads a file the player picked. Refuses anything that is not a save this
 * build can read. It does not refuse a save made under other rules: that is
 * `loadSave`'s verdict, not a parse error.
 */
export function parseSave(raw: unknown): { ok: true; save: SaveFile } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('this is not a Flow State save')
  }
  const r = raw as Record<string, unknown>
  if (r.game !== 'flow-state') return fail('this is not a Flow State save')
  if (r.format !== SAVE_FORMAT) {
    return fail(
      typeof r.format === 'number' && r.format > SAVE_FORMAT
        ? 'it was saved by a newer version of the game'
        : 'the file is damaged (unknown format)',
    )
  }
  const isWhole = (v: unknown, max: number): v is number =>
    Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max
  if (!isWhole(r.rules, Number.MAX_SAFE_INTEGER)) return fail('the file is damaged (rules)')
  if (!isWhole(r.seed, Number.MAX_SAFE_INTEGER)) return fail('the file is damaged (seed)')
  if (!isWhole(r.tick, MAX_SAVE_TICKS)) return fail('the file is damaged (tick)')
  const optionalText = (v: unknown) => v === null || v === undefined || typeof v === 'string'
  if (!optionalText(r.build) || !optionalText(r.savedAt)) return fail('the file is damaged (stamp)')

  const c = r.check as Record<string, unknown> | null | undefined
  if (
    typeof c !== 'object' ||
    c === null ||
    typeof c.fingerprint !== 'string' ||
    !isWhole(c.shipped, Number.MAX_SAFE_INTEGER) ||
    typeof c.avgQuality !== 'number' ||
    !Number.isFinite(c.avgQuality)
  ) {
    return fail('the file is damaged (check)')
  }

  // Every command must have been applied before the save tick, which is the
  // same bound a session puts on its length.
  const log = parseCommandLog(r.commands, r.tick, MAX_SAVE_COMMANDS)
  if (!log.ok) return fail(`the file is damaged (${log.error})`)

  return {
    ok: true,
    save: {
      game: 'flow-state',
      format: SAVE_FORMAT,
      rules: r.rules,
      build: (r.build as string | null | undefined) ?? null,
      savedAt: (r.savedAt as string | null | undefined) ?? null,
      seed: r.seed,
      tick: r.tick,
      commands: log.commands,
      check: { fingerprint: c.fingerprint, shipped: c.shipped, avgQuality: c.avgQuality },
    },
  }
}

function check(state: GameState): SaveCheck {
  const summary = summarize(state)
  return {
    fingerprint: fingerprint(state),
    shipped: summary.shipped,
    avgQuality: Math.round(summary.avgTrueQuality * 1000) / 1000,
  }
}
