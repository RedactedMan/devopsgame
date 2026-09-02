import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING, STATION_IDS, type StationId, type Tuning } from '@flow/content'
import { initState, step, type GameState } from '@flow/sim'

/**
 * Little's Law as an invariant: L = λW.
 *
 * The queueing model underneath this game is not exotic, and that is exactly
 * why it is worth pinning. A routing bug that leaks items, double-counts a
 * slot, or lets work skip a station will usually still produce plausible
 * numbers — throughput goes up, lead time goes down, nothing throws. It will
 * not keep satisfying Little's Law. This is the cheapest test in the suite that
 * can catch that whole class of defect.
 *
 * Two choices in here are load-bearing:
 *
 * 1. **Drift is disabled.** The law describes a system in steady state whose
 *    departures are all accounted for. With drift on, items leave via abandon
 *    as well as via ship, and — at the default WIP limits, with a player who
 *    never resolves anything — the line deadlocks and stops departing at all.
 *    That is a real property of the game (and has its own coverage), not a
 *    defect in the model. Turning drift on here would not make this test
 *    stricter, it would make it meaningless.
 *
 * 2. **W is cycle time, not lead time.** L counts items that have entered the
 *    pipeline, so the matching W must run from pipeline entry to production.
 *    Lead time also includes the backlog wait, and the backlog is not work in
 *    process — it is demand nobody has committed to yet. Pairing L with lead
 *    time is the classic way to get a true-looking result out of this law; the
 *    third test below fails deliberately if someone makes that swap.
 */

const NO_DRIFT: Tuning = {
  ...DEFAULT_TUNING,
  drift: {
    ...DEFAULT_TUNING.drift,
    perHourInSystem: 0,
    overlapWeight: 0,
    serviceMultAtFullDrift: 0,
    reworkAtFullDrift: 0,
    staleThreshold: 1e9,
  },
}

const limitsAt = (multiplier: number): Record<StationId, number> =>
  Object.fromEntries(
    STATION_IDS.map((id) => [
      id,
      Math.max(1, Math.round(DEFAULT_TUNING.stations[id].defaultWipLimit * multiplier)),
    ]),
  ) as Record<StationId, number>

/** Long enough for the queues to fill and forget their empty start. */
const WARMUP = 1500
const END = 9500
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

type Observation = { L: number; lambda: number; cycleW: number; leadW: number }

function observe(seed: number, multiplier: number): Observation {
  let state: GameState = initState({ seed, tuning: NO_DRIFT, wipLimits: limitsAt(multiplier) })
  let wipSum = 0
  let samples = 0

  for (let i = 0; i < END; i++) {
    state = step(state, []).state
    if (state.tick > WARMUP) {
      // L is time-averaged, so it is sampled every tick rather than read at the
      // end — an end-of-run reading is one draw from a distribution, not a mean.
      wipSum += state.items.filter((it) => it.startedTick !== null).length
      samples++
    }
  }

  const departures = state.metrics.shipped.filter((r) => r.tickShipped > WARMUP)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  return {
    L: wipSum / samples,
    lambda: departures.length / (END - WARMUP),
    cycleW: mean(departures.map((r) => r.cycleTimeTicks)),
    leadW: mean(departures.map((r) => r.leadTimeTicks)),
  }
}

const relativeError = (o: Observation) => (o.lambda * o.cycleW - o.L) / o.L

describe("Little's Law", () => {
  // Three settings: the one the game is balanced around, the one it starts you
  // on, and a deliberately loose one. Measured worst case across all 24 runs is
  // 6.3%, at the loose setting where the queues are least settled.
  const multipliers = [0.4, 1, 2]
  const observations = new Map(
    multipliers.map((m) => [m, SEEDS.map((seed) => observe(seed, m))] as const),
  )

  it('holds across WIP settings with drift disabled', () => {
    for (const m of multipliers) {
      for (const [i, o] of (observations.get(m) ?? []).entries()) {
        expect(o.lambda, `wip×${m} seed ${SEEDS[i]} departed nothing`).toBeGreaterThan(0)
        expect(
          Math.abs(relativeError(o)),
          `wip×${m} seed ${SEEDS[i]}: L=${o.L.toFixed(2)} λW=${(o.lambda * o.cycleW).toFixed(2)}`,
        ).toBeLessThan(0.1)
      }
    }
  })

  it('holds tightly where the line is genuinely in steady state', () => {
    // At the balanced setting the queues settle and the fit is near exact.
    // Measured worst across 8 seeds is 0.95%, so 3% is a real bound, not a
    // rubber stamp — if this loosens, the routing changed.
    for (const [i, o] of (observations.get(0.4) ?? []).entries()) {
      expect(Math.abs(relativeError(o)), `seed ${SEEDS[i]}`).toBeLessThan(0.03)
    }
  })

  it('is measured against cycle time, because the backlog is not work in process', () => {
    // Guards the pairing itself: substituting lead time for cycle time must
    // visibly break the fit. Measured at wip×0.4, λ·leadW overshoots L by
    // between 43% and 400% depending on seed, against a 3% fit for cycle time —
    // so 25% cleanly separates the right pairing from the wrong one.
    //
    // This check is deliberately run only at the tight setting, and the reason
    // is worth knowing: at wip×1 and above the ratio collapses to ~1.0, because
    // loose limits pull everything straight into the pipeline and there is no
    // backlog left to distinguish the two measures. Lead time and cycle time
    // agree precisely when the line is at its worst — which is the same
    // "a metric stops disagreeing right when it matters" failure the HUD's
    // Oldest stat exists to counter.
    for (const [i, o] of (observations.get(0.4) ?? []).entries()) {
      expect(o.leadW, `seed ${SEEDS[i]}`).toBeGreaterThan(o.cycleW)
      expect(o.lambda * o.leadW, `seed ${SEEDS[i]}`).toBeGreaterThan(1.25 * o.L)
    }
  })
})
