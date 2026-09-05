import { STATION_IDS, type StationId } from '@flow/content'
import type {
  AreaId,
  GameState,
  ItemId,
  ItemLocation,
  ItemType,
  MetricSample,
  WorkerId,
  WorkerKind,
} from './state.js'
import { inFlightItems, locateItem, serversAt, workerIsBusy } from './state.js'
import { recentLeadTime } from './systems/metrics.js'
import { constraintIsPolicy } from './systems/staffing.js'

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
  /** Other in-flight items touching at least one of this item's areas. */
  overlap: number
  /**
   * The share of this item's drift that contention accounts for, in the item's
   * own drift units: `drift − drift / (1 + overlapWeight × overlap)`.
   *
   * Drift's two terms multiply, so neither one has a share of the total until
   * you pick a counterfactual. The one chosen here is the honest one for the
   * question a player asks — *why is this drifting faster than the one beside
   * it?* — namely: what this item's drift would have been with the same trunk
   * movement and nothing else touching its areas.
   */
  driftFromOverlap: number
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
  /**
   * Finished work parked with nowhere to go while a server sits idle. This is
   * the difference between "busy" and "blocked", and on a pull system's board
   * it is the single most important thing to be able to read at a glance: a
   * blocked station is not the problem, it is the station *after* it reporting
   * one upstream.
   */
  blocked: boolean
  /**
   * Rolling share of servers busy, over roughly a sim-day. `occupancy` says
   * what is here right now; this says how hard the station has been worked,
   * and only the second one identifies a bottleneck.
   */
  utilisation: number
}

export type SnapshotWorker = {
  id: WorkerId
  kind: WorkerKind
  station: StationId
  busy: boolean
  /** Where they are headed, if the player has asked them to move and they are mid-item. */
  pendingStation: StationId | null
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
  /** Tick of the most recent ship, or null if nothing has shipped yet. */
  lastShipTick: number | null
  /**
   * Age of the oldest item that has entered the pipeline, measured from arrival
   * — the same clock `leadTimeTicks` uses.
   *
   * Lead time averages only what *shipped*, so a line that has stopped shipping
   * reports a flattering number forever and keeps reporting it. This one only
   * grows. Backlog items are excluded on purpose: arrivals are unbounded by
   * design, so the oldest item in the backlog rises in any loaded run and says
   * nothing the player can act on.
   */
  oldestInFlightTicks: number
  workers: SnapshotWorker[]
  /** The station the sim believes is the bottleneck. Null until the average warms up. */
  constraint: StationId | null
  constraintSinceTick: number
  /** Times the constraint has changed hands. Zero means it has never moved. */
  constraintMoves: number
  /** Every station has slack and work is still piling up: the WIP limits are the bottleneck. */
  constraintIsPolicy: boolean
  /**
   * Concurrent in-flight work per area of the codebase, every area in id order
   * including the cold ones.
   *
   * Emitting the zeros is deliberate. A strip whose cells appear and vanish as
   * heat comes and goes is a different picture every glance; cells that stay
   * put and change weight are something a player can learn to read at speed,
   * which is the entire job of this readout.
   */
  hotAreas: { area: AreaId; inFlight: number }[]
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
      overlap: item.overlap,
      driftFromOverlap:
        item.drift - item.drift / (1 + state.tuning.drift.overlapWeight * item.overlap),
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

  const inFlightPerArea = new Array<number>(state.tuning.arrival.areaCount).fill(0)
  for (const item of inFlightItems(state)) {
    for (const area of item.areas) {
      if (area >= 0 && area < inFlightPerArea.length) {
        inFlightPerArea[area] = (inFlightPerArea[area] as number) + 1
      }
    }
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
      const servers = serversAt(state, id)
      return {
        id,
        wipLimit: s.wipLimit,
        servers,
        occupancy: s.queue.length + s.inService.length + s.outbound.length,
        queue: s.queue.length,
        inService: s.inService.length,
        outbound: s.outbound.length,
        blocked: s.outbound.length > 0 && s.inService.length < servers,
        utilisation: s.utilisation,
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
    lastShipTick: shipped.at(-1)?.tickShipped ?? null,
    oldestInFlightTicks: inFlightItems(state).reduce(
      (oldest, it) => Math.max(oldest, state.tick - it.createdTick),
      0,
    ),
    workers: state.workers.map((w) => ({
      id: w.id,
      kind: w.kind,
      station: w.station,
      busy: workerIsBusy(state, w.id),
      pendingStation: w.pendingStation,
    })),
    constraint: state.constraint,
    constraintSinceTick: state.constraintSinceTick,
    constraintMoves: state.constraintMoves,
    constraintIsPolicy: constraintIsPolicy(state),
    hotAreas: inFlightPerArea.map((inFlight, area) => ({ area, inFlight })),
  }
}

/**
 * Compile-time guard for the rule above. If someone ever widens `SnapshotItem`
 * to carry the truth, this line stops compiling and the reason is right here.
 */
type NoTrueQuality = 'trueQuality' extends keyof SnapshotItem ? never : true
const _snapshotHidesTrueQuality: NoTrueQuality = true
void _snapshotHidesTrueQuality
