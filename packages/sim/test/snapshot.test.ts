import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING, STATION_IDS } from '@flow/content'
import { initState, run, snapshot } from '@flow/sim'

describe('snapshot', () => {
  it('never carries true quality to the renderer', () => {
    // The type system already forbids this (see snapshot.ts). This is the
    // runtime belt to that braces: if someone spreads a WorkItem into a
    // SnapshotItem, the field would ride along invisibly.
    const state = run(initState({ seed: 2 }), 800)
    const snap = snapshot(state)
    expect(snap.items.length).toBeGreaterThan(0)
    for (const item of snap.items) {
      expect(Object.keys(item)).not.toContain('trueQuality')
      expect(item.displayedQuality).toBeGreaterThanOrEqual(0)
    }
  })

  it('places every live item somewhere the renderer can draw it', () => {
    const state = run(initState({ seed: 8 }), 600)
    const snap = snapshot(state)
    expect(snap.items).toHaveLength(state.items.length)
    for (const item of snap.items) {
      if (item.location.where === 'station') {
        expect(STATION_IDS).toContain(item.location.station)
        if (item.location.phase === 'service') {
          expect(item.progress).not.toBeNull()
        }
      }
    }
  })

  it('reports station occupancy consistently with the sim', () => {
    const state = run(initState({ seed: 9 }), 500)
    const snap = snapshot(state)
    for (const s of snap.stations) {
      expect(s.occupancy).toBe(s.queue + s.inService + s.outbound)
      const live = state.stations[s.id]
      expect(s.occupancy).toBe(
        live.queue.length + live.inService.length + live.outbound.length,
      )
    }
  })

  it('distinguishes a blocked station from a busy one', () => {
    // Blocked means: finished work parked with nowhere to go, while a server
    // that could be working sits idle. Occupancy alone cannot tell the player
    // that, and it is the diagnosis the board exists to deliver.
    const state = run(initState({ seed: 11 }), 1200)
    const snap = snapshot(state)
    for (const s of snap.stations) {
      expect(s.blocked).toBe(s.outbound > 0 && s.inService < s.servers)
    }
    // Review is the constraint by construction, so upstream must jam eventually.
    expect(snap.stations.some((s) => s.blocked)).toBe(true)
  })

  it('reports a clock that keeps running when the line stops', () => {
    const fresh = snapshot(initState({ seed: 12 }))
    expect(fresh.lastShipTick).toBeNull()
    expect(fresh.oldestInFlightTicks).toBe(0)

    const state = run(initState({ seed: 12 }), 1500)
    const snap = snapshot(state)
    expect(snap.lastShipTick).toBe(state.metrics.shipped.at(-1)?.tickShipped)

    // The oldest open item is the number lead time cannot report: it counts
    // work that has not shipped, from arrival, on the same clock as lead time.
    const inFlight = state.items.filter((it) => it.startedTick !== null)
    expect(inFlight.length).toBeGreaterThan(0)
    expect(snap.oldestInFlightTicks).toBe(
      Math.max(...inFlight.map((it) => state.tick - it.createdTick)),
    )
  })

  it('reports contention the renderer can draw, and reconciles it with drift', () => {
    const state = run(initState({ seed: 6 }), 1200)
    const snap = snapshot(state)
    const { overlapWeight } = DEFAULT_TUNING.drift

    const contended = snap.items.filter((it) => it.overlap > 0)
    expect(contended.length, 'a loaded line has items sharing areas').toBeGreaterThan(0)

    for (const item of snap.items) {
      // The share attributable to contention is the item's drift minus what it
      // would have been alone. It cannot exceed the drift it is a part of.
      expect(item.driftFromOverlap).toBeCloseTo(
        item.drift - item.drift / (1 + overlapWeight * item.overlap),
        6,
      )
      expect(item.driftFromOverlap).toBeLessThanOrEqual(item.drift + 1e-9)
      // Backlog work has no branch, so it has nothing to contend over either.
      if (item.location.where === 'backlog') {
        expect(item.overlap).toBe(0)
        expect(item.driftFromOverlap).toBe(0)
      }
    }
  })

  it('counts every area of the codebase, cold ones included', () => {
    const state = run(initState({ seed: 6 }), 1200)
    const snap = snapshot(state)

    // Stable cells, varying weight: the strip is only glanceable if the cells
    // stay where they were the last time the player looked.
    expect(snap.hotAreas).toHaveLength(DEFAULT_TUNING.arrival.areaCount)
    expect(snap.hotAreas.map((a) => a.area)).toEqual(
      snap.hotAreas.map((_, i) => i),
    )

    const inFlight = state.items.filter((it) => it.startedTick !== null)
    expect(snap.hotAreas.reduce((a, h) => a + h.inFlight, 0)).toBe(
      inFlight.reduce((a, it) => a + it.areas.length, 0),
    )
  })

  it('accumulates a chart series the HUD can draw without touching sim state', () => {
    const state = run(initState({ seed: 3 }), 1000)
    const snap = snapshot(state)
    expect(snap.samples.length).toBeGreaterThan(50)
    expect(snap.samples.at(-1)?.tick).toBe(1000)
  })
})
