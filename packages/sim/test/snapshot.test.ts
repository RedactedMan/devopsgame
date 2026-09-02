import { describe, expect, it } from 'vitest'
import { STATION_IDS } from '@flow/content'
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

  it('accumulates a chart series the HUD can draw without touching sim state', () => {
    const state = run(initState({ seed: 3 }), 1000)
    const snap = snapshot(state)
    expect(snap.samples.length).toBeGreaterThan(50)
    expect(snap.samples.at(-1)?.tick).toBe(1000)
  })
})
