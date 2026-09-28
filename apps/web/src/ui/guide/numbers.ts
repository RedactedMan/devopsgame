import { DEFAULT_TUNING, STATION_IDS } from '@flow/content'

/**
 * The figures the guide and the item card quote, read from the tuning rather
 * than typed into prose, so a retune cannot leave the guide saying something
 * the game no longer does.
 *
 * `DEFAULT_TUNING` serves both free play and a session: `SESSION_TUNING` only
 * changes how often work arrives, and nothing quoted here is about arrivals.
 */
const T = DEFAULT_TUNING
export const TICKS_PER_HOUR = T.ticksPerHour
export const SHIFT_HOURS = 8

/** Hands-on hours an item of this size takes through the whole line, before drift slows it. */
export function handsOnHours(size: number): number {
  let ticks = 0
  for (const id of STATION_IDS) {
    const s = T.stations[id]
    ticks += s.baseTicks + s.ticksPerUnit * size
  }
  return ticks / TICKS_PER_HOUR
}

/** Hours one unit of size adds at Implement, where size costs the most. */
export const IMPLEMENT_HOURS_PER_UNIT = T.stations.implement.ticksPerUnit / TICKS_PER_HOUR

export const SIZE_MIN = T.arrival.sizeMin
export const SIZE_MAX = T.arrival.sizeMax

/** How much slower an item works at full drift, as a percentage. */
export const SLOWER_AT_FULL_DRIFT = Math.round(T.drift.serviceMultAtFullDrift * 100)

/** Agent output keeps its context this long before it starts to drain. */
export const CONTEXT_GRACE_HOURS = T.contextDecay.graceTicks / TICKS_PER_HOUR
export const CONTEXT_MAX_REBRIEF = T.contextDecay.max

export const REVIEW_COST = T.attention.reviewCost
export const REBASE_COST = T.attention.rebaseCost
