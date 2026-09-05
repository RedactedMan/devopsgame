import type { Tuning } from '@flow/content'
import type { GameState, ItemId, WorkItem } from '../state.js'
import { detachItem, inFlightItems, locateItem } from '../state.js'
import { createItem } from '../items.js'
import type { StaleChoice } from '../commands.js'
import type { SimEvent } from '../events.js'

/**
 * Drift — the mechanic the whole game exists to make visible.
 *
 * In a factory, work-in-process costs capital. In software it costs relevance:
 * a half-finished branch decays against a moving trunk. Two forces drive it and
 * they multiply rather than add, which is the entire point:
 *
 *   1. how far the trunk has moved since you branched (plus a slow bleed for
 *      time held, so work still rots when nothing is shipping), and
 *   2. how many *other* in-flight items are touching the same areas you are.
 *
 * Because the second term scales with concurrent WIP, doubling WIP more than
 * doubles the rework it causes. That super-linearity is what turns Little's Law
 * from a formula into something the player feels.
 */

/**
 * For each in-flight item, how many other in-flight items touch at least one
 * area it touches. O(n²) over a few dozen items, which is nothing, and far
 * clearer than an index.
 */
export function overlapCounts(items: WorkItem[]): Map<ItemId, number> {
  const counts = new Map<ItemId, number>()
  for (const item of items) {
    let n = 0
    for (const other of items) {
      if (other.id === item.id) continue
      if (other.areas.some((a) => item.areas.includes(a))) n++
    }
    counts.set(item.id, n)
  }
  return counts
}

export function driftOf(
  item: WorkItem,
  trunkVersion: number,
  tick: number,
  overlap: number,
  tuning: Tuning,
): number {
  const hoursInSystem = (tick - item.basisTick) / tuning.ticksPerHour
  const raw = trunkVersion - item.basisVersion + tuning.drift.perHourInSystem * hoursInSystem
  return Math.max(0, raw) * (1 + tuning.drift.overlapWeight * overlap)
}

/** Drift normalised to 0..1 against the stale threshold. Drives colour and every penalty. */
export function driftScoreOf(drift: number, tuning: Tuning): number {
  return Math.min(1, drift / tuning.drift.staleThreshold)
}

export function serviceMultiplier(driftScore: number, tuning: Tuning): number {
  return 1 + tuning.drift.serviceMultAtFullDrift * driftScore
}

export function reworkProbability(base: number, driftScore: number, tuning: Tuning): number {
  return Math.min(1, base + tuning.drift.reworkAtFullDrift * driftScore)
}

/** Recomputes cached drift on every in-flight item and raises the STALE flag. */
export function updateDrift(state: GameState, events: SimEvent[]): void {
  const live = inFlightItems(state)
  const overlaps = overlapCounts(live)

  for (const item of live) {
    const overlap = overlaps.get(item.id) ?? 0
    item.overlap = overlap
    item.drift = driftOf(item, state.trunkVersion, state.tick, overlap, state.tuning)
    item.driftScore = driftScoreOf(item.drift, state.tuning)

    const shouldBeStale = !item.ignoreStale && item.drift >= state.tuning.drift.staleThreshold
    if (shouldBeStale && !item.stale) events.push({ kind: 'wentStale', itemId: item.id })
    item.stale = shouldBeStale
  }
}

/**
 * The player's answer to a STALE item. There is no good option, which is the
 * lesson: the cost was incurred when the work was started, not when it was
 * noticed.
 */
export function resolveStale(
  state: GameState,
  itemId: ItemId,
  choice: StaleChoice,
  events: SimEvent[],
): void {
  const item = state.items.find((it) => it.id === itemId)
  if (!item || !item.stale) return

  if (choice === 'rebase') {
    // Catch the branch up to trunk. Cheaper than starting over, but the
    // re-spend is real and it lands on top of whatever is left.
    const respend = state.tuning.drift.rebaseWorkFraction * item.originalSize
    item.size += respend
    item.basisVersion = state.trunkVersion
    item.basisTick = state.tick
    item.stale = false
    item.drift = 0
    item.driftScore = 0
    item.rebases++
    state.metrics.rebaseCount++

    const location = locateItem(state, itemId)
    if (location?.where === 'station' && location.phase === 'service') {
      const station = state.stations[location.station]
      const slot = station.inService.find((s) => s.itemId === itemId)
      const extra = Math.ceil(respend * state.tuning.stations[location.station].ticksPerUnit)
      if (slot) {
        slot.remainingTicks += extra
        slot.totalTicks += extra
      }
    }
  } else if (choice === 'abandon') {
    // Everything invested is gone. The demand isn't, so it re-enters the
    // backlog as fresh work branched from today's trunk.
    detachItem(state, itemId)
    state.items = state.items.filter((it) => it.id !== itemId)
    state.metrics.abandoned++
    const replacement = createItem(state, item.type)
    replacement.size = item.originalSize
    replacement.originalSize = item.originalSize
    replacement.areas = [...item.areas]
    state.backlog.unshift(replacement.id)
  } else {
    // Ship it anyway. Costs nothing now; the drift penalty lands at deploy.
    item.ignoreStale = true
    item.stale = false
  }

  events.push({ kind: 'staleResolved', itemId, choice })
}
