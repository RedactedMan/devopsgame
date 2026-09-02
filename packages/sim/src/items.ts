import type { GameState, ItemType, WorkItem } from './state.js'
import { nextInt, sampleDistinct } from './rng.js'

/** The only place a `WorkItem` is born. Arrivals and abandon-and-restart both come through here. */
export function createItem(state: GameState, type: ItemType = 'feature'): WorkItem {
  const { arrival } = state.tuning
  const size = nextInt(state.rng, arrival.sizeMin, arrival.sizeMax)
  const areaCount = nextInt(state.rng, arrival.areasMin, arrival.areasMax)
  const areas = sampleDistinct(state.rng, arrival.areaCount, areaCount)

  const item: WorkItem = {
    id: `I${state.nextItemSerial}`,
    type,
    size,
    originalSize: size,
    createdTick: state.tick,
    startedTick: null,
    basisVersion: state.trunkVersion,
    basisTick: state.tick,
    trueQuality: 1,
    displayedQuality: 1,
    contextFidelity: 1,
    areas,
    history: [],
    drift: 0,
    driftScore: 0,
    stale: false,
    ignoreStale: false,
    rebases: 0,
    reworks: 0,
  }

  state.nextItemSerial++
  state.items.push(item)
  state.metrics.created++
  return item
}
