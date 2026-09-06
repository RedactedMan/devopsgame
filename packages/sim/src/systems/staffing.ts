import { STATION_IDS, type StationId } from '@flow/content'
import type { GameState, WorkerId, WorkerKind } from '../state.js'
import { serversAt, stationOccupancy, workerIsBusy } from '../state.js'
import type { SimEvent } from '../events.js'

/**
 * Staffing — who is where, how hard they are working, and which station is
 * therefore the constraint.
 *
 * The Theory of Constraints lesson is already mechanically true in this sim: a
 * server added at the bottleneck is worth roughly ten of one added anywhere
 * else (docs/CONSTRAINT_AND_CAPACITY.md §2). What was missing is any way for
 * the player to *find* the bottleneck, and any way to act on having found it.
 * This file is both.
 */

/**
 * Apply moves the player asked for once the worker is free to make them.
 *
 * A worker mid-item finishes it first. That is not a courtesy — a reassignment
 * that discarded work in progress would make the lever punishing enough that
 * nobody would use it, and a reassignment that teleported a half-finished item
 * to another station would be a lie. The delay is the cost, and it is legible.
 *
 * One deliberate consequence: a worker holding a STALE item never becomes free,
 * so the move waits on the player's stale decision. That is the same rule as
 * everywhere else — stale work holds its server — arriving somewhere new.
 */
export function applyPendingMoves(state: GameState, events: SimEvent[]): void {
  for (const worker of state.workers) {
    const to = worker.pendingStation
    if (to === null) continue
    if (to === worker.station) {
      worker.pendingStation = null
      continue
    }
    if (workerIsBusy(state, worker.id)) continue

    const from = worker.station
    worker.station = to
    worker.pendingStation = null
    events.push({ kind: 'workerMoved', workerId: worker.id, from, to })
  }
}

/**
 * Whether this kind of worker may stand at this station.
 *
 * One flag, read from tuning, and it is the whole of the design's currency
 * split in M1: agents are cheap, parallel, and barred from the one station that
 * is the constraint. Measured at 14:1 — docs/HIRING_AND_ATTENTION.md §3.
 */
export function mayStaff(state: GameState, workerKind: WorkerKind, station: StationId): boolean {
  return workerKind === 'human' || state.tuning.stations[station].agentsAllowed
}

/** Queue a move. It lands this tick if the worker is idle, and when they finish if not. */
export function requestMove(
  state: GameState,
  workerId: WorkerId,
  to: StationId,
  events: SimEvent[],
): void {
  const worker = state.workers.find((w) => w.id === workerId)
  if (!worker) return
  if (!mayStaff(state, worker.kind, to)) {
    events.push({ kind: 'staffingRefused', station: to, workerKind: worker.kind, why: 'agentsNotAllowed' })
    return
  }
  worker.pendingStation = worker.station === to ? null : to
}

/**
 * Add a worker to the roster.
 *
 * `nextWorkerSerial` has been on `GameState` since slice 1 for exactly this: a
 * replay that hires must produce the same worker ids on the way through, or a
 * later `assignWorker` in the same log addresses somebody else.
 *
 * There is no cost here yet. That is deliberate and temporary — free hiring
 * solves this game in about four moves (docs/HIRING_AND_ATTENTION.md §4), which
 * is what the attention pool is for. This step is the mechanic; the price is
 * the next one.
 */
export function hire(
  state: GameState,
  station: StationId,
  workerKind: WorkerKind,
  events: SimEvent[],
): void {
  if (!mayStaff(state, workerKind, station)) {
    events.push({ kind: 'staffingRefused', station, workerKind, why: 'agentsNotAllowed' })
    return
  }

  const worker = {
    id: `W${state.nextWorkerSerial}`,
    kind: workerKind,
    station,
    pendingStation: null,
  }
  state.workers.push(worker)
  state.nextWorkerSerial++
  events.push({ kind: 'workerHired', workerId: worker.id, at: station, workerKind })
}

/**
 * Roll each station's utilisation forward one tick.
 *
 * An exponential moving average rather than a ring buffer: one number per
 * station, it survives `cloneState` for free, and nothing here needs the
 * precision a window would buy.
 *
 * A station with no workers and work waiting reads as fully utilised. It is not
 * busy — it is worse than busy, and reporting 0% would point the player at the
 * one station that cannot possibly be the answer.
 */
export function updateUtilisation(state: GameState): void {
  const alpha = 1 / state.tuning.constraint.windowTicks

  for (const id of STATION_IDS) {
    const station = state.stations[id]
    const servers = serversAt(state, id)
    const instant =
      servers === 0
        ? stationOccupancy(station) > 0
          ? 1
          : 0
        : station.inService.length / servers
    station.utilisation += (instant - station.utilisation) * alpha
  }
}

/**
 * Name the constraint, and be slow about changing your mind.
 *
 * The constraint moving is the most valuable thing this milestone can tell the
 * player, which makes a false one the most expensive. Both ways it can be false
 * were seen on a real run before this guard existed:
 *
 *  - **The startup transient.** A line that is still filling has a bottleneck
 *    that walks downstream as work reaches each station in turn. Naming it at
 *    240 ticks meant announcing spec → implement → review as though something
 *    had happened. Nothing had; the pipeline was filling.
 *  - **A tie.** Two stations running neck and neck swap places on noise — one
 *    seed traded them ten times in a run. A margin alone does not fix this: it
 *    asks for a bigger swing, not a sustained one.
 *
 * So a challenger must beat the incumbent by a margin *and hold that lead* for
 * a couple of shifts. What survives that is a constraint that actually moved.
 */
export function updateConstraint(state: GameState, events: SimEvent[]): void {
  const { graceTicks, switchMargin, switchDwellTicks } = state.tuning.constraint
  if (state.tick < graceTicks) return

  let hottest: StationId = STATION_IDS[0]
  for (const id of STATION_IDS) {
    if (state.stations[id].utilisation > state.stations[hottest].utilisation) hottest = id
  }

  const clear = () => {
    state.constraintChallenger = null
    state.constraintChallengeSince = 0
  }

  const current = state.constraint
  if (current === null) {
    // The first naming is not a move — nobody's answer expired — but it earns
    // the same dwell, and for a sharper reason. On the seed the game boots
    // with, Implement and Review are both pinned near 100% at the end of the
    // grace period and have not separated yet; whichever is a point ahead gets
    // named, and then "moves" a few days later when they do separate. Waiting
    // for one station to *stay* hottest is the difference between reporting a
    // constraint and reporting a coin toss.
    if (state.constraintChallenger !== hottest) {
      state.constraintChallenger = hottest
      state.constraintChallengeSince = state.tick
      return
    }
    if (state.tick - state.constraintChallengeSince < switchDwellTicks) return

    clear()
    state.constraint = hottest
    state.constraintSinceTick = state.tick
    events.push({ kind: 'constraintMoved', from: null, to: hottest })
    return
  }

  if (hottest === current) return clear()
  if (state.stations[hottest].utilisation < state.stations[current].utilisation + switchMargin) {
    return clear()
  }

  if (state.constraintChallenger !== hottest) {
    state.constraintChallenger = hottest
    state.constraintChallengeSince = state.tick
    return
  }
  if (state.tick - state.constraintChallengeSince < switchDwellTicks) return

  clear()
  state.constraintMoves++
  state.constraint = hottest
  state.constraintSinceTick = state.tick
  events.push({ kind: 'constraintMoved', from: current, to: hottest })
}

/**
 * True when every station has slack and work is still piling up.
 *
 * This is the plateau from docs/CONSTRAINT_AND_CAPACITY.md §3: past a certain
 * point the binding constraint stops being a station and becomes a policy, and
 * the board goes on cheerfully pointing at whichever station happens to be
 * warmest. Staffing that station does nothing. The WIP limits are the answer.
 */
export function constraintIsPolicy(state: GameState): boolean {
  if (state.tick < state.tuning.constraint.graceTicks) return false
  if (state.backlog.length === 0) return false
  return STATION_IDS.every(
    (id) => state.stations[id].utilisation < state.tuning.constraint.policySlackBelow,
  )
}
