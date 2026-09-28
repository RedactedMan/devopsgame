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
 *
 * A person who arrives starts onboarding (docs/HIRING_AND_ATTENTION.md §8).
 * With the team fixed, a move is how capacity changes, and onboarding is what
 * a move costs. It is the only cost, so it has to be enough that moving people
 * back and forth to chase the constraint does not pay. Every move restarts it,
 * including a move back to a station the person has just left. Agents do not
 * onboard, and moving one is free. Their context decays while their output
 * waits for review, not when they move (systems/context.ts).
 */
export function applyPendingMoves(state: GameState, events: SimEvent[]): void {
  // Agents the player removed go first, and by the same rule: once free.
  state.workers = state.workers.filter((worker) => {
    if (!worker.leaving || workerIsBusy(state, worker.id)) return true
    events.push({ kind: 'workerRemoved', workerId: worker.id, from: worker.station })
    return false
  })

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
    if (worker.kind === 'human') worker.onboardingUntil = state.tick + state.tuning.onboarding.ticks
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
  // Assigning an agent to where it already stands keeps it, the same way it
  // calls off a move. One gesture undoes both.
  if (worker.station === to) worker.leaving = false
}

/**
 * Add an agent to the roster. Agents are the only thing that can be added.
 *
 * The human team is fixed (docs/HIRING_AND_ATTENTION.md §8). Hiring people
 * taught management rather than flow, and nothing in M1 could stop a player
 * hiring everywhere. With the team fixed, capacity at the constraint has to be
 * moved there, and the agents are the backfill. Measured: one person moved to
 * Review plus one agent at Implement ships exactly what the old human hire did.
 *
 * `nextWorkerSerial` has been on `GameState` since slice 1 for exactly this: a
 * replay that hires must produce the same worker ids on the way through, or a
 * later `assignWorker` in the same log addresses somebody else.
 *
 * Agents cost no money in M1. They pay for themselves in attention: someone
 * has to read what they wrote.
 */
export function hire(state: GameState, station: StationId, events: SimEvent[]): void {
  if (!mayStaff(state, 'agent', station)) {
    events.push({ kind: 'staffingRefused', station, workerKind: 'agent', why: 'agentsNotAllowed' })
    return
  }

  const worker = {
    id: `W${state.nextWorkerSerial}`,
    kind: 'agent' as const,
    station,
    pendingStation: null,
    leaving: false,
    onboardingUntil: 0,
  }
  state.workers.push(worker)
  state.nextWorkerSerial++
  events.push({ kind: 'workerHired', workerId: worker.id, at: station, workerKind: 'agent' })
}

/**
 * Take an agent off the roster: the undo for `hire`.
 *
 * Without it an agent was a one-way door: every one hired drew on attention
 * for the rest of the run. The lesson is that the fleet is sized by review
 * capacity, and a player who has learned it should be able to act on it.
 * Removing is not the strongest fix, though. On a line in the re-brief spiral
 * the sliders are worth more than the roster (docs/HIRING_AND_ATTENTION.md §9).
 *
 * People cannot be removed. The team is fixed (§8), and a person refused here
 * says so rather than doing nothing.
 *
 * An idle agent goes this tick. A busy one finishes its item first, as a move
 * does, and draws on the attention budget until it has gone, because its
 * output still has to be read. The worker serial is not reused, so a replay
 * that removes and hires gives the same ids on the way through.
 */
export function removeAgent(state: GameState, workerId: WorkerId, events: SimEvent[]): void {
  const worker = state.workers.find((w) => w.id === workerId)
  if (!worker) return
  if (worker.kind !== 'agent') {
    events.push({ kind: 'staffingRefused', station: worker.station, workerKind: worker.kind, why: 'teamIsFixed' })
    return
  }
  worker.pendingStation = null
  worker.leaving = true
  if (workerIsBusy(state, worker.id)) return

  state.workers = state.workers.filter((w) => w.id !== workerId)
  events.push({ kind: 'workerRemoved', workerId, from: worker.station })
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
