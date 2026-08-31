import { STATION_IDS, type StationId } from '@flow/content'
import type { AreaId, GameState, ItemId, ItemLocation, ItemType, MetricSample } from './state.js'
import { locateItem } from './state.js'
import { recentLeadTime } from './systems/metrics.js'

/**
 * The view the renderer subscribes to.
 *
 * `trueQuality` is absent by construction. The design's central lesson is that
 * a dashboard can be confidently wrong, so the dashboard is not permitted to
 * read the truth — a renderer that reaches for it does not compile. In M0 the
 * two values are always equal and nothing is lost by this; the whole point is
 * that the rule is already in place when M5 makes them diverge.
 */
export type SnapshotItem = {
  id: ItemId
  type: ItemType
  size: number
  originalSize: number
  areas: AreaId[]
  drift: number
  /** 0..1. This is what the item's colour is driven by. */
  driftScore: number
  stale: boolean
  displayedQuality: number
  contextFidelity: number
  ageTicks: number
  /** 0..1 through the current service, for interpolated motion. Null when not being worked. */
  progress: number | null
  location: ItemLocation
  reworks: number
  rebases: number
}

export type SnapshotStation = {
  id: StationId
  wipLimit: number
  servers: number
  occupancy: number
  queue: number
  inService: number
  outbound: number
}

export type Snapshot = {
  tick: number
  trunkVersion: number
  backlog: number
  stations: SnapshotStation[]
  items: SnapshotItem[]
  samples: MetricSample[]
  shippedTotal: number
  avgLeadTimeTicks: number
  recentLeadTimeTicks: number
  throughputPerDay: number
  staleItems: ItemId[]
}

export function snapshot(state: GameState): Snapshot {
  const items: SnapshotItem[] = []

  for (const item of state.items) {
    const location = locateItem(state, item.id)
    if (!location) continue

    let progress: number | null = null
    if (location.where === 'station' && location.phase === 'service') {
      const slot = state.stations[location.station].inService.find((s) => s.itemId === item.id)
      if (slot && slot.totalTicks > 0) {
        progress = Math.min(1, Math.max(0, 1 - slot.remainingTicks / slot.totalTicks))
      }
    }

    items.push({
      id: item.id,
      type: item.type,
      size: item.size,
      originalSize: item.originalSize,
      areas: [...item.areas],
      drift: item.drift,
      driftScore: item.driftScore,
      stale: item.stale,
      displayedQuality: item.displayedQuality,
      contextFidelity: item.contextFidelity,
      ageTicks: state.tick - item.createdTick,
      progress,
      location,
      reworks: item.reworks,
      rebases: item.rebases,
    })
  }

  const shipped = state.metrics.shipped
  const day = state.tuning.ticksPerHour * 8
  const recent = shipped.filter((s) => s.tickShipped > state.tick - day)

  return {
    tick: state.tick,
    trunkVersion: state.trunkVersion,
    backlog: state.backlog.length,
    stations: STATION_IDS.map((id) => {
      const s = state.stations[id]
      return {
        id,
        wipLimit: s.wipLimit,
        servers: s.servers,
        occupancy: s.queue.length + s.inService.length + s.outbound.length,
        queue: s.queue.length,
        inService: s.inService.length,
        outbound: s.outbound.length,
      }
    }),
    items,
    samples: state.metrics.samples,
    shippedTotal: shipped.length,
    avgLeadTimeTicks:
      shipped.length === 0 ? 0 : shipped.reduce((a, s) => a + s.leadTimeTicks, 0) / shipped.length,
    recentLeadTimeTicks: recentLeadTime(state),
    throughputPerDay: recent.length,
    staleItems: items.filter((it) => it.stale).map((it) => it.id),
  }
}

/**
 * Compile-time guard for the rule above. If someone ever widens `SnapshotItem`
 * to carry the truth, this line stops compiling and the reason is right here.
 */
type NoTrueQuality = 'trueQuality' extends keyof SnapshotItem ? never : true
const _snapshotHidesTrueQuality: NoTrueQuality = true
void _snapshotHidesTrueQuality
