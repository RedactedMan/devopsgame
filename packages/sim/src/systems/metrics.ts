import type { GameState, MetricSample } from '../state.js'
import { inFlightItems } from '../state.js'

/** How many recently shipped items the responsive lead-time readout averages over. */
export const LEAD_TIME_WINDOW = 8

export function recentLeadTime(state: GameState): number {
  const latest = state.metrics.shipped.slice(-LEAD_TIME_WINDOW)
  if (latest.length === 0) return 0
  return latest.reduce((a, s) => a + s.leadTimeTicks, 0) / latest.length
}

/** One sim-day of ticks, used as the window for the throughput readout. */
export function ticksPerDay(state: GameState): number {
  return state.tuning.ticksPerHour * 8
}

export function sampleMetrics(state: GameState): MetricSample {
  const live = inFlightItems(state)
  const shipped = state.metrics.shipped
  const day = ticksPerDay(state)
  const recent = shipped.filter((s) => s.tickShipped > state.tick - day)

  const avgLeadTimeTicks =
    shipped.length === 0 ? 0 : shipped.reduce((a, s) => a + s.leadTimeTicks, 0) / shipped.length
  const avgDriftScore =
    live.length === 0 ? 0 : live.reduce((a, it) => a + it.driftScore, 0) / live.length

  return {
    tick: state.tick,
    wip: live.length,
    backlog: state.backlog.length,
    shippedTotal: shipped.length,
    avgLeadTimeTicks,
    recentLeadTimeTicks: recentLeadTime(state),
    throughputPerDay: recent.length,
    avgDriftScore,
    staleCount: live.filter((it) => it.stale).length,
  }
}

/** Summary used by the HUD, the tests, and the headless sweeps. */
export type RunSummary = {
  ticks: number
  shipped: number
  abandoned: number
  reworks: number
  rebases: number
  avgLeadTimeTicks: number
  /**
   * Age of the oldest item still open, from arrival. Lead time averages only
   * what shipped, so a run that stalls reports a flattering number and keeps
   * reporting it; this one keeps climbing. A sweep row where lead time looks
   * good and this looks terrible is a stalled line, not a fast one.
   */
  oldestOpenTicks: number
  throughputPerDay: number
  avgTrueQuality: number
  backlog: number
  wip: number
}

export function summarize(state: GameState): RunSummary {
  const shipped = state.metrics.shipped
  const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
  return {
    ticks: state.tick,
    shipped: shipped.length,
    abandoned: state.metrics.abandoned,
    reworks: state.metrics.reworkCount,
    rebases: state.metrics.rebaseCount,
    avgLeadTimeTicks: mean(shipped.map((s) => s.leadTimeTicks)),
    oldestOpenTicks: inFlightItems(state).reduce(
      (oldest, it) => Math.max(oldest, state.tick - it.createdTick),
      0,
    ),
    throughputPerDay: state.tick === 0 ? 0 : (shipped.length * ticksPerDay(state)) / state.tick,
    avgTrueQuality: mean(shipped.map((s) => s.trueQuality)),
    backlog: state.backlog.length,
    wip: inFlightItems(state).length,
  }
}
