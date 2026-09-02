import { STATION_IDS, type StationId } from '@flow/content'
import type { GameState, WorkerId } from '../state.js'
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

/** Queue a move. It lands this tick if the worker is idle, and when they finish if not. */
export function requestMove(state: GameState, workerId: WorkerId, to: StationId): void {
  const worker = state.workers.find((w) => w.id === workerId)
  if (!worker) return
  worker.pendingStation = worker.station === to ? null : to
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
 * Name the constraint, stickily.
 *
 * A challenger has to beat the incumbent by a margin, so the marker does not
 * flicker between two stations a percentage point apart. When it does move, it
 * means something — and saying so is the highest-value feedback in this
 * milestone, because it is the moment the player learns the answer they just
 * found has expired.
 */
export function updateConstraint(state: GameState, events: SimEvent[]): void {
  if (state.tick < state.tuning.constraint.graceTicks) return

  let hottest: StationId = STATION_IDS[0]
  for (const id of STATION_IDS) {
    if (state.stations[id].utilisation > state.stations[hottest].utilisation) hottest = id
  }

  const current = state.constraint
  if (current === hottest) return

  const incumbent = current === null ? -1 : state.stations[current].utilisation
  if (state.stations[hottest].utilisation < incumbent + state.tuning.constraint.switchMargin) return

  if (current !== null) state.constraintMoves++
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
