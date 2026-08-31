import type { StationId, Tuning } from '@flow/content'
import type { RngState } from './rng.js'

export type ItemId = string
export type AreaId = number

/** M0 only produces features. The other four types arrive with M2. */
export type ItemType = 'feature' | 'bug' | 'incident' | 'chore' | 'improvement'

export type StationVisit = {
  station: StationId
  enteredTick: number
  startedTick: number | null
  exitedTick: number | null
}

export type WorkItem = {
  id: ItemId
  type: ItemType
  /** Remaining work units. Rework and rebase add to this. */
  size: number
  /** Size at creation. Rework and rebase costs are expressed as fractions of it. */
  originalSize: number
  createdTick: number
  /** Tick this item entered the pipeline. Null while it is still in the backlog. */
  startedTick: number | null
  /** Trunk version this work branched from. Reset by a rebase. */
  basisVersion: number
  /** Tick the current basis was taken. Reset by a rebase. */
  basisTick: number

  /**
   * The design's one non-negotiable type rule (design §4.6, plan §3):
   * `trueQuality` is what the item actually is, `displayedQuality` is what the
   * dashboard claims. In M0 they are always equal — the divergence mechanic is
   * M5 — but both fields exist from the first commit so the snapshot type can
   * omit the true one and keep omitting it.
   */
  trueQuality: number
  displayedQuality: number

  contextFidelity: number
  areas: AreaId[]
  history: StationVisit[]

  /** Cached each tick by systems/drift.ts. Never assign these by hand. */
  drift: number
  driftScore: number
  stale: boolean
  /** Set by a "ship it anyway" decision: this item will never block again. */
  ignoreStale: boolean
  rebases: number
  reworks: number
}

export type ServiceSlot = {
  itemId: ItemId
  remainingTicks: number
  totalTicks: number
}

export type Station = {
  id: StationId
  /** Player-controlled. Caps queue + inService + outbound. */
  wipLimit: number
  servers: number
  queue: ItemId[]
  inService: ServiceSlot[]
  outbound: ItemId[]
}

export type ShippedRecord = {
  id: ItemId
  tickShipped: number
  /** Arrival to production — the honest, ungameable number. */
  leadTimeTicks: number
  /** Pipeline entry to production. Lead time minus backlog wait. */
  cycleTimeTicks: number
  trueQuality: number
  displayedQuality: number
  shippedStale: boolean
}

export type MetricSample = {
  tick: number
  wip: number
  backlog: number
  shippedTotal: number
  /** Mean arrival-to-production lead time, in ticks, over everything shipped so far. */
  avgLeadTimeTicks: number
  /**
   * The same thing over only the last handful of items. The lifetime average is
   * too sluggish to show the player that a change they just made worked, and
   * seeing cause and effect is the entire acceptance criterion for M0.
   */
  recentLeadTimeTicks: number
  /** Items shipped per sim-day, over the last day. */
  throughputPerDay: number
  avgDriftScore: number
  staleCount: number
}

export type Metrics = {
  created: number
  abandoned: number
  reworkCount: number
  rebaseCount: number
  shipped: ShippedRecord[]
  samples: MetricSample[]
}

export type GameState = {
  tick: number
  rng: RngState
  /** Loaded once at init. Systems read tuning from here, never by import. */
  tuning: Tuning
  trunkVersion: number
  nextItemSerial: number
  nextArrivalTick: number
  backlog: ItemId[]
  stations: Record<StationId, Station>
  /** Every live item: in the backlog or somewhere in a station. */
  items: WorkItem[]
  metrics: Metrics
}

export function findItem(state: GameState, id: ItemId): WorkItem | undefined {
  return state.items.find((it) => it.id === id)
}

export function stationOccupancy(station: Station): number {
  return station.queue.length + station.inService.length + station.outbound.length
}

/** Items that have entered the pipeline. Backlog items have no branch yet, so they cannot drift. */
export function inFlightItems(state: GameState): WorkItem[] {
  return state.items.filter((it) => it.startedTick !== null)
}

export type ItemLocation =
  | { where: 'backlog' }
  | { where: 'station'; station: StationId; phase: 'queue' | 'service' | 'outbound' }

export function locateItem(state: GameState, id: ItemId): ItemLocation | undefined {
  if (state.backlog.includes(id)) return { where: 'backlog' }
  for (const station of Object.values(state.stations)) {
    if (station.queue.includes(id)) return { where: 'station', station: station.id, phase: 'queue' }
    if (station.inService.some((s) => s.itemId === id))
      return { where: 'station', station: station.id, phase: 'service' }
    if (station.outbound.includes(id))
      return { where: 'station', station: station.id, phase: 'outbound' }
  }
  return undefined
}

/** Pulls an item out of wherever it is sitting, without touching `state.items`. */
export function detachItem(state: GameState, id: ItemId): void {
  const backlogAt = state.backlog.indexOf(id)
  if (backlogAt >= 0) state.backlog.splice(backlogAt, 1)
  for (const station of Object.values(state.stations)) {
    const q = station.queue.indexOf(id)
    if (q >= 0) station.queue.splice(q, 1)
    const o = station.outbound.indexOf(id)
    if (o >= 0) station.outbound.splice(o, 1)
    const s = station.inService.findIndex((slot) => slot.itemId === id)
    if (s >= 0) station.inService.splice(s, 1)
  }
}
