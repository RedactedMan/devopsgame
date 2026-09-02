import { describe, expect, it } from 'vitest'
import { STATION_IDS, type StationId } from '@flow/content'
import { initState, run, summarize, type Command, type GameState } from '@flow/sim'

/**
 * The mechanical half of M0's acceptance criterion.
 *
 * The gate itself is a human one — an unbriefed playtester must over-fill WIP,
 * get worse results, and be able to say why. This test checks the half a
 * machine can check: that the results really are worse. If it fails, the design
 * is wrong and no amount of renderer will save it.
 */

/** A diligent player: rebase everything the moment it goes stale. The generous case for high WIP. */
const rebaseEverything = (state: GameState): Command[] =>
  state.items
    .filter((it) => it.stale)
    .map((it) => ({ kind: 'resolveStale', itemId: it.id, choice: 'rebase' }))

/** Scale every WIP limit by the same factor, keeping the shape of the line intact. */
function limits(multiplier: number): Partial<Record<StationId, number>> {
  const base: Record<StationId, number> = { spec: 2, implement: 4, review: 2, ci: 3, deploy: 2 }
  return Object.fromEntries(
    STATION_IDS.map((id) => [id, Math.round(base[id] * multiplier)]),
  ) as Record<StationId, number>
}

const TICKS = 4000

function runAt(multiplier: number, seed: number) {
  return summarize(run(initState({ seed, wipLimits: limits(multiplier) }), TICKS, rebaseEverything))
}

describe('the WIP lesson', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const low = seeds.map((s) => runAt(1, s))
  const high = seeds.map((s) => runAt(3, s))
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  it('ships more at low WIP than at high WIP, with the same capacity', () => {
    expect(mean(low.map((r) => r.shipped))).toBeGreaterThan(mean(high.map((r) => r.shipped)))
  })

  it('delivers faster at low WIP, measured from arrival, not from pipeline entry', () => {
    // Measuring from pipeline entry would make this trivially true by
    // definition. Arrival-to-production is the number a stakeholder feels, and
    // low WIP only wins it by actually raising throughput.
    expect(mean(low.map((r) => r.avgLeadTimeTicks))).toBeLessThan(
      mean(high.map((r) => r.avgLeadTimeTicks)),
    )
  })

  it('wastes far more work on rework and rebases at high WIP', () => {
    const waste = (r: { reworks: number; rebases: number }) => r.reworks + r.rebases
    expect(mean(high.map(waste))).toBeGreaterThan(1.5 * mean(low.map(waste)))
  })

  it('holds on every individual seed, not just on average', () => {
    for (let i = 0; i < seeds.length; i++) {
      expect((low[i] as { shipped: number }).shipped, `seed ${seeds[i]}`).toBeGreaterThan(
        (high[i] as { shipped: number }).shipped,
      )
    }
  })

  it('is driven by drift, not by capacity: turn drift off and the advantage collapses', () => {
    // The control. Same two configurations, same seeds, drift disabled. If low
    // WIP still won by a mile here, the lesson would be an artefact of the
    // queueing model rather than of the mechanic the game is about.
    const noDrift = (multiplier: number, seed: number) => {
      const base = initState({ seed })
      const tuning = {
        ...base.tuning,
        drift: {
          ...base.tuning.drift,
          perHourInSystem: 0,
          overlapWeight: 0,
          serviceMultAtFullDrift: 0,
          reworkAtFullDrift: 0,
          staleThreshold: 1e9,
        },
      }
      return summarize(
        run(initState({ seed, tuning, wipLimits: limits(multiplier) }), TICKS, rebaseEverything),
      )
    }
    const flatLow = mean(seeds.map((s) => noDrift(1, s).shipped))
    const flatHigh = mean(seeds.map((s) => noDrift(3, s).shipped))
    const driftedLow = mean(low.map((r) => r.shipped))
    const driftedHigh = mean(high.map((r) => r.shipped))

    expect(driftedLow - driftedHigh).toBeGreaterThan(flatLow - flatHigh)
  })
})
