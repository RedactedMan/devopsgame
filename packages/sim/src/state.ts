import type { StationId, Tuning } from '@flow/content'
import type { RngState } from './rng.js'

export type ItemId = string
export type AreaId = number
export type WorkerId = string

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
  /**
   * How many other in-flight items are touching at least one of this item's
   * areas. It is the second of drift's two multiplying terms and, at the WIP
   * limits the game starts you on, nearly half of all drift — so the number is
   * cached rather than recomputed and discarded, because the renderer has to be
   * able to show it.
   */
  overlap: number
  stale: boolean
  /** Set by a "ship it anyway" decision: this item will never block again. */
  ignoreStale: boolean
  rebases: number
  reworks: number
}

/**
 * Humans and agents are the same shape and differ only in `kind`. M1 ships the
 * roster and the ability to move it; the two kinds do not yet behave
 * differently, which is why every worker starts human. Agents arrive with the
 * attention pool, because an agent that costs nothing to supervise would be a
 * strictly better human and the design's central trade would be gone.
 */
export type WorkerKind = 'human' | 'agent'

export type Worker = {
  id: WorkerId
  kind: WorkerKind
  station: StationId
  /**
   * Where the player has asked this worker to go. Applied by `systems/staffing`
   * once they are no longer mid-item — you cannot yank someone off work in
   * progress, and the wait is the honest cost of the decision.
   */
  pendingStation: StationId | null
}

export type ServiceSlot = {
  itemId: ItemId
  /** Who is doing it. A slot without a worker cannot exist. */
  workerId: WorkerId
  remainingTicks: number
  totalTicks: number
}

export type Station = {
  id: StationId
  /** Player-controlled. Caps queue + inService + outbound. */
  wipLimit: number
  queue: ItemId[]
  inService: ServiceSlot[]
  outbound: ItemId[]
  /**
   * Rolling share of this station's servers that were busy, as an exponential
   * moving average over roughly one sim-day (see `systems/staffing`).
   *
   * Occupancy is an instantaneous sample and says almost nothing; utilisation
   * averaged over a shift is the number that identifies a constraint. The
   * distinction is the whole diagnosis, so the sim computes it rather than
   * leaving the HUD to guess.
   */
  utilisation: number
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
  workers: Worker[]
  nextWorkerSerial: number
  /**
   * The station the sim currently believes is the bottleneck, or null before
   * the utilisation average has warmed up. Sticky: see `systems/staffing`.
   */
  constraint: StationId | null
  constraintSinceTick: number
  /**
   * How many times it has changed hands. Zero means the sim has named a
   * bottleneck but has never seen one relocate — which is a different thing to
   * tell the player, and the HUD is not able to work it out on its own.
   */
  constraintMoves: number
  /** The station currently making a sustained case for the title, and since when. */
  constraintChallenger: StationId | null
  constraintChallengeSince: number
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

export function workersAt(state: GameState, station: StationId): Worker[] {
  return state.workers.filter((w) => w.station === station)
}

/** A station's capacity is its roster. There is no separate server count to fall out of sync. */
export function serversAt(state: GameState, station: StationId): number {
  let n = 0
  for (const w of state.workers) if (w.station === station) n++
  return n
}

export function workerIsBusy(state: GameState, id: WorkerId): boolean {
  for (const stationId of Object.keys(state.stations) as StationId[]) {
    if (state.stations[stationId].inService.some((slot) => slot.workerId === id)) return true
  }
  return false
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
