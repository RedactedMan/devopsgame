import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING } from '@flow/content'
import {
  createItem,
  driftOf,
  driftScoreOf,
  initState,
  overlapCounts,
  reworkProbability,
  serviceMultiplier,
  step,
  type WorkItem,
} from '@flow/sim'

const item = (over: Partial<WorkItem> = {}): WorkItem => {
  const state = initState({ seed: 1 })
  return { ...createItem(state), startedTick: 0, ...over }
}

describe('drift', () => {
  it('counts an overlap when two items touch the same area', () => {
    const a = item({ id: 'a', areas: [1, 2] })
    const b = item({ id: 'b', areas: [2, 5] })
    const c = item({ id: 'c', areas: [7] })
    const counts = overlapCounts([a, b, c])
    expect(counts.get('a')).toBe(1)
    expect(counts.get('b')).toBe(1)
    expect(counts.get('c')).toBe(0)
  })

  it('grows with trunk movement', () => {
    const it0 = item({ basisVersion: 0, basisTick: 0 })
    const near = driftOf(it0, 2, 0, 0, DEFAULT_TUNING)
    const far = driftOf(it0, 9, 0, 0, DEFAULT_TUNING)
    expect(far).toBeGreaterThan(near)
  })

  it('grows while work is merely held, even with a frozen trunk', () => {
    const it0 = item({ basisVersion: 0, basisTick: 0 })
    expect(driftOf(it0, 0, 500, 0, DEFAULT_TUNING)).toBeGreaterThan(
      driftOf(it0, 0, 50, 0, DEFAULT_TUNING),
    )
  })

  it('is super-linear in concurrent WIP — the whole point of the mechanic', () => {
    const it0 = item({ basisVersion: 0, basisTick: 0 })
    // Twice the trunk movement and twice the overlapping neighbours is more
    // than twice the drift. Doubling WIP more than doubles the rework it causes.
    const single = driftOf(it0, 4, 100, 3, DEFAULT_TUNING)
    const doubled = driftOf(it0, 8, 200, 6, DEFAULT_TUNING)
    expect(doubled).toBeGreaterThan(2 * single)
  })

  it('clamps the 0..1 score used for colour and penalties', () => {
    expect(driftScoreOf(0, DEFAULT_TUNING)).toBe(0)
    expect(driftScoreOf(1e6, DEFAULT_TUNING)).toBe(1)
    expect(driftScoreOf(DEFAULT_TUNING.drift.staleThreshold / 2, DEFAULT_TUNING)).toBeCloseTo(0.5)
  })

  it('slows work down and raises rework as it climbs', () => {
    expect(serviceMultiplier(0, DEFAULT_TUNING)).toBe(1)
    expect(serviceMultiplier(1, DEFAULT_TUNING)).toBeGreaterThan(1)
    expect(reworkProbability(0.05, 1, DEFAULT_TUNING)).toBeGreaterThan(
      reworkProbability(0.05, 0, DEFAULT_TUNING),
    )
    expect(reworkProbability(0.9, 1, DEFAULT_TUNING)).toBeLessThanOrEqual(1)
  })

  it('makes an item drift faster for sharing an area with work in flight', () => {
    // The coupling *is* the mechanic — at the WIP limits the game starts you
    // on, contention is nearly half of all drift — and until now only the pure
    // `driftOf` arithmetic was tested. This drives it through a real tick, on a
    // real line, which is where it is actually load-bearing.
    let state = initState({ seed: 7 })
    for (let i = 0; i < 400 && !state.items.some((it) => it.startedTick !== null && it.overlap > 0); i++) {
      state = step(state).state
    }
    const contended = state.items.find((it) => it.startedTick !== null && it.overlap > 0)
    expect(contended, 'the run should produce an item sharing an area').toBeDefined()

    // The counterfactual: the same item, at the same tick, on the same trunk,
    // touching an area nobody else does. Nothing validates area ids, and drift
    // is recomputed before anything consumes the RNG, so the two ticks differ
    // by exactly one thing.
    const alone = step({
      ...state,
      items: state.items.map((it) => (it.id === contended?.id ? { ...it, areas: [999] } : it)),
    }).state

    const shared = step(state).state.items.find((it) => it.id === contended?.id)
    const isolated = alone.items.find((it) => it.id === contended?.id)
    expect(isolated?.overlap).toBe(0)
    expect(shared?.drift).toBeGreaterThan(isolated?.drift as number)
  })

  it('leaves backlog items alone — unstarted work has no branch to rot', () => {
    let state = initState({ seed: 4, wipLimits: { spec: 1, implement: 1, review: 1, ci: 1, deploy: 1 } })
    for (let i = 0; i < 600; i++) state = step(state).state
    const waiting = state.items.filter((it) => it.startedTick === null)
    expect(waiting.length).toBeGreaterThan(0)
    for (const it of waiting) expect(it.drift).toBe(0)
  })
})

describe('resolving a stale item', () => {
  const jam = () => {
    let state = initState({
      seed: 5,
      wipLimits: { spec: 20, implement: 20, review: 20, ci: 20, deploy: 20 },
    })
    for (let i = 0; i < 2500 && !state.items.some((it) => it.stale); i++) {
      state = step(state).state
    }
    const stale = state.items.find((it) => it.stale)
    expect(stale, 'the run should produce a stale item').toBeDefined()
    return { state, stale: stale as WorkItem }
  }

  it('rebase catches up to trunk and charges for the re-spend', () => {
    const { state, stale } = jam()
    const sizeBefore = stale.size
    const after = step(state, [
      { kind: 'resolveStale', itemId: stale.id, choice: 'rebase' },
    ]).state
    const item = after.items.find((it) => it.id === stale.id)
    expect(item).toBeDefined()
    expect(item?.basisVersion).toBe(state.trunkVersion)
    expect(item?.size).toBeGreaterThan(sizeBefore)
    expect(after.metrics.rebaseCount).toBe(1)
  })

  it('abandon throws the work away and puts the demand back at the front of the backlog', () => {
    const { state, stale } = jam()
    const before = new Set(state.items.map((it) => it.id))
    const after = step(state, [
      { kind: 'resolveStale', itemId: stale.id, choice: 'abandon' },
    ]).state
    expect(after.items.some((it) => it.id === stale.id)).toBe(false)
    expect(after.metrics.abandoned).toBe(1)

    const replacement = after.items.find((it) => !before.has(it.id) && it.createdTick === state.tick)
    expect(replacement, 'the demand comes back as fresh work').toBeDefined()
    expect(replacement?.originalSize).toBe(stale.originalSize)
    expect(replacement?.areas).toEqual(stale.areas)
    expect(replacement?.drift).toBe(0)
  })

  it('ship-anyway un-blocks the item permanently and costs quality at deploy', () => {
    const { state, stale } = jam()
    let after = step(state, [
      { kind: 'resolveStale', itemId: stale.id, choice: 'shipAnyway' },
    ]).state
    const item = after.items.find((it) => it.id === stale.id)
    expect(item?.ignoreStale).toBe(true)
    expect(item?.stale).toBe(false)

    for (let i = 0; i < 3000 && after.items.some((it) => it.id === stale.id); i++) {
      after = step(after).state
    }
    const record = after.metrics.shipped.find((s) => s.id === stale.id)
    if (record) {
      expect(record.shippedStale).toBe(true)
      expect(record.trueQuality).toBeLessThan(1)
    }
  })
})
