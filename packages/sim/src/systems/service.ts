import { REWORK_STATION, STATION_IDS, type StationId, type Tuning } from '@flow/content'
import type { GameState, WorkItem } from '../state.js'
import type { SimEvent } from '../events.js'
import { reworkProbability, serviceMultiplier } from './drift.js'
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

/** Fill idle servers from the queue, skipping STALE items rather than head-blocking on them. */
export function startService(state: GameState, events: SimEvent[]): void {
  for (const stationId of STATION_IDS) {
    const station = state.stations[stationId]
    while (station.inService.length < station.servers) {
      const at = station.queue.findIndex((id) => {
        const item = state.items.find((it) => it.id === id)
        return item !== undefined && !item.stale
      })
      if (at < 0) break

      const itemId = station.queue[at] as string
      station.queue.splice(at, 1)
      const item = state.items.find((it) => it.id === itemId)
      if (!item) continue

      const ticks = serviceTicksFor(item, stationId, state.tuning)
      station.inService.push({ itemId, remainingTicks: ticks, totalTicks: ticks })

      const visit = [...item.history].reverse().find((v) => v.station === stationId && v.exitedTick === null)
      if (visit) visit.startedTick = state.tick

      events.push({ kind: 'started', itemId, at: stationId, ticks })
    }
  }
}
