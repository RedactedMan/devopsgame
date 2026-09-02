import { STATION_IDS, type StationId } from '@flow/content'
import type { GameState } from '../state.js'
import { detachItem, stationOccupancy } from '../state.js'
import type { SimEvent } from '../events.js'
import { createItem } from '../items.js'
import { nextExponential } from '../rng.js'

const FIRST_STATION = STATION_IDS[0]
const LAST_STATION = STATION_IDS[STATION_IDS.length - 1] as StationId

/** New demand lands in the backlog. The backlog is unbounded; your WIP limits are not. */
export function arrivals(state: GameState, events: SimEvent[]): void {
  while (state.tick >= state.nextArrivalTick) {
    const item = createItem(state)
    state.backlog.push(item.id)
    events.push({ kind: 'arrived', itemId: item.id })
    state.nextArrivalTick += nextExponential(state.rng, state.tuning.arrival.meanTicksBetween)
  }
}

/**
 * Deploy releases to production and advances the trunk — which is what makes
 * everyone else's unfinished work decay. One deploy, one version.
 */
function ship(state: GameState, events: SimEvent[]): void {
  const deploy = state.stations[LAST_STATION]
  const shipping = [...deploy.outbound]
  deploy.outbound = []

  for (const itemId of shipping) {
    const item = state.items.find((it) => it.id === itemId)
    if (!item) continue

    const penalty = state.tuning.drift.qualityPenaltyAtFullDrift * item.driftScore
    item.trueQuality = Math.max(0, item.trueQuality - penalty)
    // M0 has no unreliable reviewer yet, so the dashboard still tells the truth.
    // M5 is where these two stop agreeing.
    item.displayedQuality = item.trueQuality

    const leadTimeTicks = state.tick - item.createdTick
    state.metrics.shipped.push({
      id: item.id,
      tickShipped: state.tick,
      leadTimeTicks,
      cycleTimeTicks: state.tick - (item.startedTick ?? item.createdTick),
      trueQuality: item.trueQuality,
      displayedQuality: item.displayedQuality,
      shippedStale: item.ignoreStale,
    })

    detachItem(state, itemId)
    state.items = state.items.filter((it) => it.id !== itemId)
    state.trunkVersion++
    events.push({ kind: 'shipped', itemId, trunkVersion: state.trunkVersion, leadTimeTicks })
  }
}

/**
 * A pull system, walked downstream-first so a station that frees a slot this
 * tick can be filled by its upstream in the same tick, not the next one.
 * Nothing is ever pushed into a full station.
 */
export function pull(state: GameState, events: SimEvent[]): void {
  ship(state, events)

  for (let i = STATION_IDS.length - 1; i >= 0; i--) {
    const stationId = STATION_IDS[i] as StationId
    const station = state.stations[stationId]
    const source = i === 0 ? state.backlog : state.stations[STATION_IDS[i - 1] as StationId].outbound

    while (stationOccupancy(station) < station.wipLimit && source.length > 0) {
      const itemId = source.shift() as string
      const item = state.items.find((it) => it.id === itemId)
      if (!item) continue

      station.queue.push(itemId)
      item.history.push({
        station: stationId,
        enteredTick: state.tick,
        startedTick: null,
        exitedTick: null,
      })

      if (stationId === FIRST_STATION) {
        // The branch is cut here: this is the moment the item acquires a basis
        // to drift away from. Backlog items cannot go stale, because they have
        // not been started.
        item.startedTick = state.tick
        item.basisVersion = state.trunkVersion
        item.basisTick = state.tick
      }

      events.push({ kind: 'pulled', itemId, into: stationId })
    }
  }
}
