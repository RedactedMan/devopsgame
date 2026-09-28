import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING, STATION_IDS, TuningSchema, type StationId } from '@flow/content'
import {
  initState,
  rebriefCost,
  run,
  step,
  type Command,
  type GameState,
  type WorkItem,
} from '@flow/sim'

/**
 * Context decay — an agent's finished output loses its context while it waits
 * for a reviewer, and the reviewer pays to rebuild it (design §4.2,
 * docs/HIRING_AND_ATTENTION.md §7).
 */

const SHIFT = DEFAULT_TUNING.ticksPerHour * 8
const { graceTicks, perShift, max } = DEFAULT_TUNING.contextDecay

const waiting = (state: GameState, since: number): WorkItem =>
  ({ ...state.items[0], agentOutputSince: since }) as WorkItem

describe('the re-brief', () => {
  const state = { ...initState({ seed: 1 }), tick: 1000 }

  it('costs nothing for a person’s work', () => {
    expect(rebriefCost(state, { ...waiting(state, 0), agentOutputSince: null })).toBe(0)
  })

  it('costs nothing inside the grace', () => {
    expect(rebriefCost(state, waiting(state, state.tick - graceTicks))).toBe(0)
  })

  it('grows with every shift waited past it, up to a cap', () => {
    const half = rebriefCost(state, waiting(state, state.tick - graceTicks - SHIFT / 2))
    expect(half).toBeCloseTo(perShift / 2)
    expect(rebriefCost(state, waiting(state, state.tick - graceTicks - 10 * SHIFT))).toBe(max)
  })
})

describe('in the sim', () => {
  /** Run until Review has started on something, and return that tick's events. */
  function firstReviews(agents: number, wip = 1) {
    const limits = Object.fromEntries(
      STATION_IDS.map((id) => [id, Math.round(DEFAULT_TUNING.stations[id].defaultWipLimit * wip)]),
    ) as Record<StationId, number>
    let state = initState({ seed: 4, wipLimits: limits, agents: { implement: agents } })
    const rebriefs: number[] = []
    for (let i = 0; i < 3000; i++) {
      const out = step(state)
      state = out.state
      for (const e of out.events) if (e.kind === 'rebriefed') rebriefs.push(e.cost)
    }
    return { state, rebriefs }
  }

  it('stamps an agent’s output and not a person’s', () => {
    // Nobody at Review, so finished work has to wait there rather than being
    // picked up the tick it arrives.
    let state = initState({ seed: 2, staffing: { implement: 0, review: 0 }, agents: { implement: 1 } })
    let stamped = false
    for (let i = 0; i < 400 && !stamped; i++) {
      state = step(state).state
      stamped = state.items.some((it) => it.agentOutputSince !== null)
    }
    expect(stamped).toBe(true)

    const people = run(initState({ seed: 2, staffing: { review: 0 } }), 1500)
    expect(people.stations.review.queue.length).toBeGreaterThan(0)
    expect(people.items.every((it) => it.agentOutputSince === null)).toBe(true)
  })

  it('drains context fidelity while the output waits, and restores it when Review picks it up', () => {
    const { state } = firstReviews(5)
    const reviewing = new Set(state.stations.review.inService.map((s) => s.itemId))
    for (const item of state.items) {
      if (reviewing.has(item.id)) expect(item.contextFidelity).toBe(1)
      if (item.agentOutputSince !== null) {
        expect(item.contextFidelity).toBeCloseTo(1 - rebriefCost(state, item) / max)
      }
    }
  })

  it('charges Review for the re-brief', () => {
    // Five agents and the sliders untouched: their output queues for the one
    // reviewer for well over a shift.
    expect(firstReviews(5).rebriefs.length).toBeGreaterThan(0)
  })

  it('never makes a review unaffordable, even at the attention floor', () => {
    // Eight agents put the pool at its floor, below what a fully decayed item
    // costs. Unclamped, the first such item would stall Review for good.
    const { state, rebriefs } = firstReviews(8)
    expect(rebriefs.length).toBeGreaterThan(0)
    for (const cost of rebriefs) expect(cost).toBeLessThanOrEqual(state.attention.perShift)
    const late = state.metrics.shipped.filter((s) => s.tickShipped > 2000)
    expect(late.length).toBeGreaterThan(0)
  })
})

/**
 * The swept shapes, 12 seeds × 4000 ticks, diligent rebaser. Measured
 * 2026-09-27: five agents with the sliders untouched ship 108 against the
 * starting team's 115 (116 with decay off), and move 1 + 4 agents at 0.75×
 * ships 223 with or without it.
 */
describe('the lesson', () => {
  const SEEDS = 12
  const TICKS = 4000
  const off = TuningSchema.parse({
    ...DEFAULT_TUNING,
    contextDecay: { ...DEFAULT_TUNING.contextDecay, perShift: 0 },
  })
  const limitsAt = (m: number) =>
    Object.fromEntries(
      STATION_IDS.map((id) => [id, Math.max(1, Math.round(DEFAULT_TUNING.stations[id].defaultWipLimit * m))]),
    ) as Record<StationId, number>
  const rebase = (s: GameState): Command[] =>
    s.items.filter((it) => it.stale).map((it) => ({ kind: 'resolveStale', itemId: it.id, choice: 'rebase' }))
  const shipped = (
    m: number,
    options: { staffing?: Partial<Record<StationId, number>>; agents?: Partial<Record<StationId, number>> },
    tuning = DEFAULT_TUNING,
  ) => {
    let total = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const init = initState({ seed, tuning, wipLimits: limitsAt(m), ...options })
      total += run(init, TICKS, rebase).metrics.shipped.length
    }
    return total / SEEDS
  }

  it('makes five agents and nothing else worse than doing nothing', () => {
    // Design rule 3, at the settings a new player starts on.
    expect(shipped(1, { agents: { implement: 5 } })).toBeLessThan(shipped(1, {}))
  })

  it('leaves move-and-backfill standing at its best setting', () => {
    const backfilled = { staffing: { implement: 3, review: 2 }, agents: { implement: 4 } }
    const withDecay = shipped(0.75, backfilled)
    const without = shipped(0.75, backfilled, off)
    expect(Math.abs(withDecay - without) / without).toBeLessThan(0.02)
  })
})
