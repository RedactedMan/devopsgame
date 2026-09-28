import { STATION_IDS, type StationId } from '@flow/content'
import type { GameState, WorkItem, Worker } from '../state.js'
import { costsAttention } from './attention.js'

/**
 * Context decay (design §4.2) — what it costs to come back to an agent's work.
 *
 * An agent's working context does not survive it being put down. When an agent
 * finishes an item and the item then waits for a reviewer, whoever reviews it
 * has to rebuild what the agent knew: why it did what it did, what it tried
 * first. The longer the wait, the more there is to rebuild, and it is paid for
 * in attention, because that is what rebuilding context is.
 *
 * Where this departs from the design's wording, and why
 * (docs/HIRING_AND_ATTENTION.md §7):
 *
 *  - Workers have no queues. Nothing is ever parked *with* a worker: a move
 *    waits for the worker to finish, and a review nobody can pay for leaves the
 *    item unbound in Review's queue. What does sit and wait is finished agent
 *    output between Implement and Review, so that is what decays.
 *  - The person who re-briefs is the reviewer, not the agent reloading itself.
 *  - Only agent output decays. A person's context on a person's work being
 *    handed to another person is ownership overlap, a separate mechanic §7
 *    defers.
 *
 * Charged in attention, never quality: drift already takes quality for
 * waiting, and taxing one lesson twice is what design §9 rejects.
 */

/** Whether finished work at this station goes next to a station that charges attention. */
function feedsReview(state: GameState, station: StationId): boolean {
  const next = STATION_IDS[STATION_IDS.indexOf(station) + 1]
  return next !== undefined && costsAttention(state, next)
}

/**
 * Stamp an item as it finishes a station. Agent output bound for Review starts
 * its clock; a person's work, including a person reworking an agent's, clears
 * it.
 */
export function noteFinished(state: GameState, item: WorkItem, station: StationId, worker: Worker | undefined): void {
  if (!feedsReview(state, station)) return
  item.agentOutputSince = worker?.kind === 'agent' ? state.tick : null
  item.contextFidelity = 1
}

/**
 * The extra attention a reviewer would pay to pick this item up now.
 *
 * Free for a shift, then steep. The grace is what keeps this off a well-run
 * line, whose agent output is never kept waiting that long; the steepness is
 * what makes it bind on a line that has spare attention and no spare review
 * capacity, which is exactly the line that started agents and walked away.
 */
export function rebriefCost(state: GameState, item: WorkItem): number {
  if (item.agentOutputSince === null) return 0
  const { graceTicks, perShift, max } = state.tuning.contextDecay
  const shift = state.tuning.ticksPerHour * 8
  const late = Math.max(0, state.tick - item.agentOutputSince - graceTicks)
  return Math.min(max, (perShift * late) / shift)
}

/** Recompute `contextFidelity` on everything still waiting. The renderer draws it. */
export function updateContext(state: GameState): void {
  const { max } = state.tuning.contextDecay
  for (const item of state.items) {
    if (item.agentOutputSince === null) continue
    item.contextFidelity = max > 0 ? 1 - rebriefCost(state, item) / max : 1
  }
}

/** Review has picked it up and paid to rebuild whatever was lost. */
export function contextRestored(item: WorkItem): void {
  item.agentOutputSince = null
  item.contextFidelity = 1
}
