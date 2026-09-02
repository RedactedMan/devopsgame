import { describe, expect, it } from 'vitest'
import { STATION_IDS } from '@flow/content'
import { initState, locateItem, run, step, type GameState } from '@flow/sim'

/**
 * Properties that must hold for every seed and every tick. These are the tests
 * that make a later refactor of the simulation survivable.
 */
function checkInvariants(state: GameState): void {
  // Nothing vanishes and nothing duplicates.
  expect(state.metrics.created).toBe(
    state.items.length + state.metrics.shipped.length + state.metrics.abandoned,
  )

  const ids = state.items.map((it) => it.id)
  expect(new Set(ids).size).toBe(ids.length)

  // Every live item is in exactly one place.
  const placements = new Map<string, number>()
  for (const id of state.backlog) placements.set(id, (placements.get(id) ?? 0) + 1)
  for (const stationId of STATION_IDS) {
    const s = state.stations[stationId]
    expect(s.queue.length).toBeGreaterThanOrEqual(0)
    expect(s.outbound.length).toBeGreaterThanOrEqual(0)
    expect(s.inService.length).toBeLessThanOrEqual(s.servers)
    for (const id of [...s.queue, ...s.outbound, ...s.inService.map((x) => x.itemId)]) {
      placements.set(id, (placements.get(id) ?? 0) + 1)
    }
  }
  for (const id of ids) {
    expect(placements.get(id), `item ${id} placement count`).toBe(1)
    expect(locateItem(state, id)).toBeDefined()
  }
  // No orphans holding a slot after being shipped or abandoned.
  for (const id of placements.keys()) expect(ids).toContain(id)

  for (const item of state.items) {
    expect(item.size).toBeGreaterThan(0)
    expect(item.driftScore).toBeGreaterThanOrEqual(0)
    expect(item.driftScore).toBeLessThanOrEqual(1)
    expect(item.trueQuality).toBeGreaterThanOrEqual(0)
    if (item.startedTick === null) {
      expect(item.stale).toBe(false)
      expect(item.drift).toBe(0)
    }
  }
}

describe('invariants', () => {
  it('hold across many seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let state = initState({ seed })
      for (let i = 0; i < 400; i++) {
        state = step(state).state
        if (i % 40 === 0) checkInvariants(state)
      }
      checkInvariants(state)
    }
  })

  it('holds while the player is actively resolving stale items', () => {
    let state = initState({
      seed: 5,
      wipLimits: { spec: 20, implement: 20, review: 20, ci: 20, deploy: 20 },
    })
    const choices = ['rebase', 'abandon', 'shipAnyway'] as const
    let n = 0
    for (let i = 0; i < 2500; i++) {
      const stale = state.items.filter((it) => it.stale)
      const commands = stale.map((it) => ({
        kind: 'resolveStale' as const,
        itemId: it.id,
        choice: choices[n++ % choices.length] as (typeof choices)[number],
      }))
      state = step(state, commands).state
      if (i % 100 === 0) checkInvariants(state)
    }
    checkInvariants(state)
    // The high-WIP run must actually exercise the mechanic, or this proves nothing.
    expect(state.metrics.rebaseCount + state.metrics.abandoned).toBeGreaterThan(0)
  })

  it('advances the trunk, which is what makes drift possible at all', () => {
    const state = run(initState({ seed: 3 }), 600)
    expect(state.trunkVersion).toBeGreaterThan(5)
    expect(state.metrics.shipped.length).toBe(state.trunkVersion)
  })

  it('never exceeds a WIP limit by pulling', () => {
    let state = initState({ seed: 11 })
    for (let i = 0; i < 500; i++) {
      state = step(state).state
      for (const id of STATION_IDS) {
        const s = state.stations[id]
        // Implement can be over its limit only because rework re-entered it.
        if (id === 'implement') continue
        expect(s.queue.length + s.inService.length + s.outbound.length).toBeLessThanOrEqual(
          s.wipLimit,
        )
      }
    }
  })
})
