import { SESSION_TUNING, SESSION_WIN_UNFINISHED, STATION_IDS, type StationId } from '@flow/content'
import type { Command, LoggedCommand, Replay } from './commands.js'
import { runReplay } from './replay.js'
import type { GameState } from './state.js'
import { summarize } from './systems/metrics.js'

/**
 * The presentation-mode game: one seed for the whole room, one fixed length,
 * and one number to rank by (docs/HIRING_AND_ATTENTION.md §8).
 *
 * 4000 ticks is the length every balance table in the docs was measured at —
 * about 13 minutes at 1×, 3½ at 4× — so what the talk says the sim does is
 * what the room plays.
 */
export const SESSION_TICKS = 4000

/**
 * The seed presentation mode offers by default. It is the one the free-play
 * build opens on, so it is the one that has actually been played.
 */
export const SESSION_DEFAULT_SEED = 20260830

/**
 * A human cannot produce anywhere near this in 4000 ticks — a slider drag is a
 * few dozen commands — but a hand-made log could, and the server replays
 * whatever it is sent.
 */
export const MAX_SESSION_COMMANDS = 3000

/**
 * The score: every shipped item, weighted by the quality it shipped at.
 *
 * Items shipped alone rewards shipping stale work, which is the exact move the
 * game exists to talk people out of. Drift takes quality off an item as it
 * deploys (`routing.ts`), so here a stale item shipped anyway counts for what
 * it is actually worth, and a rebased one counts for nearly one.
 */
export function sessionScore(state: GameState): number {
  const total = state.metrics.shipped.reduce((sum, s) => sum + s.trueQuality, 0)
  return Math.round(total * 10) / 10
}

export type SessionResult = {
  score: number
  shipped: number
  avgQuality: number
  avgLeadTimeTicks: number
  /** Items not shipped when the clock stopped: the backlog and everything in flight. */
  unfinished: number
  /** Whether `unfinished` is within `SESSION_WIN_UNFINISHED`. */
  won: boolean
}

/*
 * The leaderboard's wire format, shared by the Worker that serves it and the
 * pages that read it. Types only: the sim does no I/O.
 */
export type SessionInfo = {
  code: string
  seed: number
  ticks: number
  createdAt: number
  /** After this, the session takes no more players or runs. Its board stays readable. */
  closesAt: number
}
export type SessionStatus = SessionInfo & { joined: number; finished: number }

export type BoardEntry = Omit<SessionResult, 'unfinished' | 'won'> & {
  /**
   * Null for a run submitted before the win line existed (2026-09-28). A
   * session's board lives a week, so a deploy can meet rows without it.
   */
  unfinished: number | null
  won: boolean

  playerId: string
  name: string
  /** Finished runs, not just the best one. A restart mid-run submits nothing, so it is not counted. */
  runs: number
  submittedAt: number
}

export type SubmitOutcome = {
  result: SessionResult
  best: BoardEntry
  rank: number
  players: number
}

export type BoardRun = BoardEntry & { commands: LoggedCommand[] }

export function sessionResult(state: GameState): SessionResult {
  const summary = summarize(state)
  return {
    score: sessionScore(state),
    shipped: summary.shipped,
    avgQuality: Math.round(summary.avgTrueQuality * 1000) / 1000,
    avgLeadTimeTicks: Math.round(summary.avgLeadTimeTicks),
    unfinished: state.items.length,
    won: state.items.length <= SESSION_WIN_UNFINISHED,
  }
}

/**
 * A submitted score is never trusted: it is recomputed from `{ seed, commands }`.
 * Because `step` is pure, the replay is the run, so there is nothing to forge
 * except a better set of decisions — which is the game.
 */
export function verifyRun(replay: Replay, ticks: number = SESSION_TICKS): SessionResult {
  return sessionResult(runReplay(replay, ticks, SESSION_TUNING))
}

/**
 * Checks a command log that arrived over the network.
 *
 * Returns the log with anything unknown stripped out, or an error string. A
 * save file (`save.ts`) is read with the same checks and a higher cap. The
 * sim already ignores commands that name a worker or item that does not exist,
 * so this only has to guarantee the *shape* is one `step` understands.
 */
export function parseCommandLog(
  raw: unknown,
  ticks: number = SESSION_TICKS,
  maxCommands: number = MAX_SESSION_COMMANDS,
): { ok: true; commands: LoggedCommand[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'commands must be an array' }
  if (raw.length > maxCommands) {
    return { ok: false, error: `more than ${maxCommands} commands` }
  }

  const commands: LoggedCommand[] = []
  let lastTick = 0
  for (const [i, entry] of raw.entries()) {
    const fail = (why: string) => ({ ok: false as const, error: `command ${i}: ${why}` })
    if (typeof entry !== 'object' || entry === null) return fail('not an object')
    const { tick, command } = entry as { tick?: unknown; command?: unknown }
    if (!Number.isInteger(tick) || (tick as number) < 0 || (tick as number) >= ticks) {
      return fail('tick out of range')
    }
    // The bridge logs in the order it steps. A log that goes backwards was not
    // produced by playing.
    if ((tick as number) < lastTick) return fail('ticks out of order')
    lastTick = tick as number
    const parsed = parseCommand(command)
    if (parsed === null) return fail('unrecognised command')
    commands.push({ tick: tick as number, command: parsed })
  }
  return { ok: true, commands }
}

function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  const isStation = (v: unknown): v is StationId =>
    typeof v === 'string' && (STATION_IDS as readonly string[]).includes(v)
  const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 32

  switch (c.kind) {
    case 'setWipLimit':
      if (!isStation(c.station) || typeof c.limit !== 'number' || !Number.isFinite(c.limit)) {
        return null
      }
      return { kind: 'setWipLimit', station: c.station, limit: c.limit }
    case 'resolveStale':
      if (!isId(c.itemId)) return null
      if (c.choice !== 'rebase' && c.choice !== 'abandon' && c.choice !== 'shipAnyway') return null
      return { kind: 'resolveStale', itemId: c.itemId, choice: c.choice }
    case 'assignWorker':
      if (!isId(c.workerId) || !isStation(c.to)) return null
      return { kind: 'assignWorker', workerId: c.workerId, to: c.to }
    case 'hire':
      if (!isStation(c.station)) return null
      return { kind: 'hire', station: c.station }
    case 'removeAgent':
      if (!isId(c.workerId)) return null
      return { kind: 'removeAgent', workerId: c.workerId }
    default:
      return null
  }
}
