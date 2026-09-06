import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from '@flow/content'
import {
  attentionFloor,
  attentionSupply,
  initState,
  run,
  step,
  type Command,
  type GameState,
} from '@flow/sim'

/**
 * The judgment budget — docs/HIRING_AND_ATTENTION.md §4.
 *
 * The lessons it produces are asserted in `staffing.test.ts`, where the rest of
 * the balance targets live. This file is the mechanism underneath them: who
 * supplies it, who draws it, what happens when it runs out, and the one thing
 * that must never happen, which is the line stopping altogether.
 */

const SHIFT = DEFAULT_TUNING.ticksPerHour * 8

/** Enough agents to drown any roster. */
const drowned = () => initState({ seed: 1, agents: { implement: 30 } })

describe('the attention supply', () => {
  it('is what the humans on the roster bring', () => {
    const one = initState({ seed: 1, staffing: { spec: 1, implement: 0, review: 0, ci: 0, deploy: 0 } })
    const two = initState({ seed: 1, staffing: { spec: 2, implement: 0, review: 0, ci: 0, deploy: 0 } })
    expect(attentionSupply(two)).toBeGreaterThan(attentionSupply(one))
  })

  it('is drawn down by agents, because someone has to read what they wrote', () => {
    const bare = initState({ seed: 1 })
    const withAgents = initState({ seed: 1, agents: { implement: 4 } })
    expect(attentionSupply(withAgents)).toBeLessThan(attentionSupply(bare))
  })

  it('loses more to coordination on a big team than on a small one — Brooks, as a term', () => {
    // The cost is per communication channel, and a team of n has n(n-1)/2 of
    // them. So the second hire is nearly free and the twentieth is not: what
    // must hold is that the *marginal* human supplies less as the team grows.
    const supplyAt = (n: number) =>
      attentionSupply(initState({ seed: 1, staffing: { spec: n, implement: 0, review: 0, ci: 0, deploy: 0 } }))

    const earlyGain = supplyAt(4) - supplyAt(3)
    const lateGain = supplyAt(20) - supplyAt(19)
    expect(lateGain).toBeLessThan(earlyGain)
  })

  it('goes underwater on a fleet with nobody to supervise it', () => {
    // The raw number is allowed to be negative — that is the difference
    // between a small budget and a roster that produces more than it can read,
    // and the HUD needs to be able to say which.
    expect(attentionSupply(drowned())).toBeLessThan(0)
  })
})

describe('the budget', () => {
  it('starts the game full, so tick one is not a stall', () => {
    const state = initState({ seed: 1 })
    expect(state.attention.remaining).toBe(state.attention.perShift)
    expect(state.attention.remaining).toBeGreaterThan(0)
  })

  it('does not accumulate — an unspent shift is gone, not banked', () => {
    // A fixed rate that cannot be saved is what makes attention a wall inside a
    // shift rather than a slow squeeze across a level. Design §3.4 draws that
    // distinction between the two currencies and it is the whole reason this
    // resets rather than adding up.
    let state = initState({ seed: 1 })
    const perShift = state.attention.perShift

    // Idle it through a shift boundary with nothing to spend on.
    state = run({ ...state, backlog: [], items: [] }, SHIFT + 1)
    expect(state.attention.remaining).toBeLessThanOrEqual(perShift)
    expect(state.attention.perShift).toBe(perShift)
  })

  it('never falls below one review, however drowned the roster', () => {
    // Without this floor a large enough fleet ships literally nothing, and a
    // player cannot tell a mechanic they triggered from an app that has hung.
    let state = drowned()
    state = run(state, SHIFT * 3)
    expect(state.attention.perShift).toBe(attentionFloor(state))
    expect(state.attention.perShift).toBeGreaterThan(0)
  })

  it('leaves a drowned line crawling rather than stopped', () => {
    const state = run(drowned(), 4000, (s: GameState): Command[] =>
      s.items.filter((it) => it.stale).map((it) => ({ kind: 'resolveStale', itemId: it.id, choice: 'rebase' })),
    )
    expect(state.metrics.shipped.length).toBeGreaterThan(0)
  })
})

describe('running out', () => {
  /** Drain the shift's budget without touching anything else. */
  const emptied = (state: GameState): GameState => ({
    ...state,
    attention: { ...state.attention, remaining: 0 },
  })

  const jammed = () => {
    let state = initState({ seed: 5, wipLimits: { spec: 20, implement: 20, review: 20, ci: 20, deploy: 20 } })
    for (let i = 0; i < 2500 && !state.items.some((it) => it.stale); i++) state = step(state).state
    const stale = state.items.find((it) => it.stale)
    expect(stale, 'the run should produce a stale item').toBeDefined()
    return { state, staleId: (stale as { id: string }).id }
  }

  it('refuses a rebase nobody can pay for, and says so', () => {
    const { state, staleId } = jammed()
    const { state: after, events } = step(emptied(state), [
      { kind: 'resolveStale', itemId: staleId, choice: 'rebase' },
    ])

    expect(after.items.find((it) => it.id === staleId)?.stale).toBe(true)
    expect(after.metrics.rebaseCount).toBe(0)
    expect(events.some((e) => e.kind === 'attentionExhausted' && e.wanted === 'rebase')).toBe(true)
  })

  it('still allows the two bad options, so an empty pool can never deadlock the line', () => {
    // Rebase is the good answer to a stale item and it is the one attention
    // buys. Abandon and ship-anyway cost nothing and stay available — running
    // out of judgment costs you the good option and leaves you the bad ones,
    // which is a lesson. Taking all three would be a hang.
    const { state, staleId } = jammed()

    const abandoned = step(emptied(state), [
      { kind: 'resolveStale', itemId: staleId, choice: 'abandon' },
    ]).state
    expect(abandoned.metrics.abandoned).toBe(1)

    const shipped = step(emptied(state), [
      { kind: 'resolveStale', itemId: staleId, choice: 'shipAnyway' },
    ]).state
    expect(shipped.items.find((it) => it.id === staleId)?.ignoreStale).toBe(true)
  })

  it('stalls Review rather than any other station', () => {
    // Attention buys judgment, and Review is the judgment step. It is also the
    // one station agents may not stand at, and those being the same place is
    // the point rather than a coincidence.
    let state = run(initState({ seed: 3 }), 600)
    state = emptied(state)

    const { events } = step(state)
    const exhausted = events.filter((e) => e.kind === 'attentionExhausted')
    for (const e of exhausted) expect(e.wanted).toBe('review')

    // And the rest of the line is unaffected: something started somewhere else.
    const started = step(state).events.filter((e) => e.kind === 'started')
    for (const e of started) expect(e.at).not.toBe('review')
  })
})
