import type { Tuning } from '@flow/content'
import type { Command, LoggedCommand, Replay } from './commands.js'
import { initState } from './init.js'
import { step } from './step.js'
import type { GameState } from './state.js'
import { summarize } from './systems/metrics.js'

/**
 * A save file is `{ seed, commands }` and so is a bug report. Replaying one is
 * just running the same steps again — which only works because `step` is pure
 * and commands are applied at tick boundaries.
 */
export function runReplay(replay: Replay, ticks: number, tuning?: Tuning): GameState {
  const byTick = new Map<number, Command[]>()
  for (const entry of replay.commands) {
    const list = byTick.get(entry.tick) ?? []
    list.push(entry.command)
    byTick.set(entry.tick, list)
  }

  let state = tuning ? initState({ seed: replay.seed, tuning }) : initState({ seed: replay.seed })
  for (let i = 0; i < ticks; i++) {
    state = step(state, byTick.get(state.tick) ?? []).state
  }
  return state
}

export function logCommands(tick: number, commands: readonly Command[]): LoggedCommand[] {
  return commands.map((command) => ({ tick, command }))
}

/**
 * FNV-1a over the run's outcome. Not cryptographic and not meant to be — it
 * exists so a golden-replay test can say "this seed and these commands used to
 * produce exactly this, and now they don't".
 */
export function fingerprint(state: GameState): string {
  const summary = summarize(state)
  const canonical = JSON.stringify([
    state.tick,
    state.trunkVersion,
    state.nextItemSerial,
    state.rng.s,
    summary.shipped,
    summary.abandoned,
    summary.reworks,
    summary.rebases,
    Math.round(summary.avgLeadTimeTicks * 1000),
    Math.round(summary.avgTrueQuality * 1000),
    summary.backlog,
    summary.wip,
    state.metrics.shipped.map((s) => [s.id, s.tickShipped, s.leadTimeTicks]),
  ])

  let hash = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Step once and record what was applied, in the form `runReplay` reads back.
 *
 * Commands are keyed by the tick the state was at *before* the step, because
 * that is the key `runReplay` looks them up by. Every shell that wants its run
 * to be replayable — the web bridge, a leaderboard submission — steps through
 * here, so the two can never disagree about which tick a command belongs to.
 */
export function stepLogged(
  state: GameState,
  commands: readonly Command[],
  log: LoggedCommand[],
): GameState {
  for (const command of commands) log.push({ tick: state.tick, command })
  return step(state, commands).state
}
