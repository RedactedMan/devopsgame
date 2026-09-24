import { REWORK_STATION, STATION_IDS, type StationId, type Tuning } from '@flow/content'
import { isOnboarding, type GameState, type WorkItem } from '../state.js'
import type { SimEvent } from '../events.js'
import { reworkProbability, serviceMultiplier } from './drift.js'
import { costsAttention, reviewCostOf, spendAttention } from './attention.js'
import { nextFloat } from '../rng.js'

/**
 * Service time is size-driven and then stretched by drift. The stretch is the
 * quiet half of the drift penalty: stale work isn't just risky, it is slower,
 * which keeps it in the system longer, which makes it staler.
 */
export function serviceTicksFor(item: WorkItem, station: StationId, tuning: Tuning): number {
  const t = tuning.stations[station]
  const base = t.baseTicks + t.ticksPerUnit * item.size
  return Math.max(1, Math.ceil(base * serviceMultiplier(item.driftScore, tuning)))
}

/**
 * Advance every in-service slot by one tick and resolve completions.
 *
 * A STALE item holds its slot and makes no progress. That is deliberate: the
 * server stays occupied until the player decides what to do, so ignoring a red
 * item costs capacity, not just quality.
 */
export function advanceService(state: GameState, events: SimEvent[]): void {
  for (const stationId of STATION_IDS) {
    const station = state.stations[stationId]
    const completed: string[] = []

    for (const slot of station.inService) {
      const item = state.items.find((it) => it.id === slot.itemId)
      if (!item || item.stale) continue
      slot.remainingTicks -= 1
      if (slot.remainingTicks <= 0) completed.push(slot.itemId)
    }

    for (const itemId of completed) {
      const item = state.items.find((it) => it.id === itemId)
      if (!item) continue
      station.inService = station.inService.filter((s) => s.itemId !== itemId)

      const visit = [...item.history].reverse().find((v) => v.station === stationId && v.exitedTick === null)
      if (visit) visit.exitedTick = state.tick
      events.push({ kind: 'completed', itemId, at: stationId })

      const base = state.tuning.stations[stationId].reworkBase
      const p = reworkProbability(base, item.driftScore, state.tuning)
      const canRework = stationId !== REWORK_STATION && base > 0

      if (canRework && nextFloat(state.rng) < p) {
        // Merge conflicts, newly-failing tests, a reviewer noticing the world
        // moved. Rework re-enters Implement and bypasses its WIP limit — the
        // work is already in the system, so pretending otherwise would hide
        // exactly the cost this is meant to expose.
        item.size += state.tuning.drift.reworkSizeFraction * item.originalSize
        item.reworks++
        state.metrics.reworkCount++
        const implement = state.stations[REWORK_STATION]
        implement.queue.push(itemId)
        item.history.push({
          station: REWORK_STATION,
          enteredTick: state.tick,
          startedTick: null,
          exitedTick: null,
        })
        events.push({ kind: 'rework', itemId, from: stationId })
      } else {
        station.outbound.push(itemId)
      }
    }
  }
}

/**
 * Fill idle workers from the queue, skipping STALE items rather than
 * head-blocking on them.
 *
 * Workers are taken in roster order, which is arbitrary but fixed — the binding
 * has to be deterministic or two replays of the same command log could staff
 * the same work differently and diverge.
 *
 * A worker with a move pending does not pick anything new up. Otherwise a busy
 * station could keep handing them work and the move would never land.
 */
export function startService(state: GameState, events: SimEvent[]): void {
  for (const stationId of STATION_IDS) {
    const station = state.stations[stationId]
    const free = state.workers.filter(
      (w) =>
        w.station === stationId &&
        w.pendingStation === null &&
        !station.inService.some((slot) => slot.workerId === w.id),
    )

    // Judgment is paid for out of the shift's budget, and Review is where
    // judgment happens. A station that cannot afford to start is not idle for
    // want of people — it is idle for want of attention, and the two look
    // identical on a board that only counts heads.
    const charged = costsAttention(state, stationId)
    const cost = charged ? reviewCostOf(state) : 0

    while (free.length > 0) {
      const at = station.queue.findIndex((id) => {
        const item = state.items.find((it) => it.id === id)
        return item !== undefined && !item.stale
      })
      if (at < 0) break

      if (charged && !spendAttention(state, cost)) {
        events.push({
          kind: 'attentionExhausted',
          wanted: 'review',
          cost,
          remaining: state.attention.remaining,
        })
        break
      }

      const itemId = station.queue[at] as string
      station.queue.splice(at, 1)
      const item = state.items.find((it) => it.id === itemId)
      if (!item) continue

      const worker = free.shift() as (typeof free)[number]
      // Set once, when the item is picked up. Someone who starts an item while
      // learning finishes it at the learner's pace, even if they finish
      // learning partway through. Simpler, and it rounds toward the cost.
      const learning = isOnboarding(state, worker) ? state.tuning.onboarding.serviceMult : 1
      const ticks = Math.ceil(serviceTicksFor(item, stationId, state.tuning) * learning)
      station.inService.push({ itemId, workerId: worker.id, remainingTicks: ticks, totalTicks: ticks })

      const visit = [...item.history].reverse().find((v) => v.station === stationId && v.exitedTick === null)
      if (visit) visit.startedTick = state.tick

      events.push({ kind: 'started', itemId, at: stationId, ticks })
    }
  }
}
