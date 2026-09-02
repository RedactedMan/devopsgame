import { describe, expect, it } from 'vitest'
import { DEFAULT_TUNING, STATION_IDS, type StationId } from '@flow/content'
import {
  initState,
  run,
  serversAt,
  snapshot,
  step,
  summarize,
  type Command,
  type GameState,
} from '@flow/sim'

/**
 * The moving constraint — M1's headline mechanic.
 *
 * docs/CONSTRAINT_AND_CAPACITY.md §7 turns the measured behaviour into four
 * targets. They assert *shapes*, not point values, because the point values
 * will move every time anything is tuned and the relationships are what the
 * game is teaching.
 */

const BASELINE: Record<StationId, number> = { spec: 1, implement: 4, review: 1, ci: 2, deploy: 1 }
/**
 * Enough seeds and enough ticks to resolve an 11% effect from a 1% one. At half
 * this budget every move out of CI looks worth 5%, which is seed noise wearing
 * the lesson's clothes — the numbers below were checked against a 24-seed run
 * before being written down.
 */
const SEEDS = 12
const TICKS = 4000

const limitsAt = (m: number) =>
  Object.fromEntries(
    STATION_IDS.map((id) => [
      id,
      Math.max(1, Math.round(DEFAULT_TUNING.stations[id].defaultWipLimit * m)),
    ]),
  ) as Record<StationId, number>

/** One worker leaves `from` and arrives at `to`. Head count does not change. */
const move = (...moves: Array<[StationId, StationId]>): Record<StationId, number> => {
  const staffing = { ...BASELINE }
  for (const [from, to] of moves) {
    staffing[from] -= 1
    staffing[to] += 1
  }
  return staffing
}

/** A diligent player, so the runs measure staffing rather than neglect. */
const rebaseEverything = (state: GameState): Command[] =>
  state.items
    .filter((it) => it.stale)
    .map((it) => ({ kind: 'resolveStale', itemId: it.id, choice: 'rebase' }))

/** Several of the targets below share configurations; each one is only run once. */
const cache = new Map<string, number>()

function shipped(staffing: Record<StationId, number>, wipMultiplier = 0.4): number {
  const key = JSON.stringify([staffing, wipMultiplier])
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let total = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const state = initState({ seed, staffing, wipLimits: limitsAt(wipMultiplier) })
    total += summarize(run(state, TICKS, rebaseEverything)).shipped
  }
  const mean = total / SEEDS
  cache.set(key, mean)
  return mean
}

describe('the roster', () => {
  it('is the station capacity — there is no second source of truth', () => {
    const state = initState({ seed: 1 })
    for (const id of STATION_IDS) {
      expect(serversAt(state, id)).toBe(DEFAULT_TUNING.stations[id].servers)
    }
    expect(state.workers).toHaveLength(9)
  })

  it('moves an idle worker on the tick the player asks', () => {
    const state = initState({ seed: 1 })
    const worker = state.workers.find((w) => w.station === 'deploy')!
    const after = step(state, [{ kind: 'assignWorker', workerId: worker.id, to: 'review' }]).state

    expect(after.workers.find((w) => w.id === worker.id)?.station).toBe('review')
    expect(serversAt(after, 'review')).toBe(2)
    expect(serversAt(after, 'deploy')).toBe(0)
  })

  it('makes a busy worker finish first, then moves them', () => {
    let state = run(initState({ seed: 4 }), 200)
    const busy = state.workers.find(
      (w) => w.station === 'implement' && state.stations.implement.inService.some((s) => s.workerId === w.id),
    )!

    const events = step(state, [{ kind: 'assignWorker', workerId: busy.id, to: 'review' }])
    state = events.state
    expect(state.workers.find((w) => w.id === busy.id)?.station).toBe('implement')
    expect(state.workers.find((w) => w.id === busy.id)?.pendingStation).toBe('review')

    // They pick up nothing new, so the move lands as soon as the item in hand is done.
    let landed = false
    for (let i = 0; i < 400 && !landed; i++) {
      state = step(state).state
      landed = state.workers.find((w) => w.id === busy.id)?.station === 'review'
    }
    expect(landed).toBe(true)
    expect(state.stations.implement.inService.every((s) => s.workerId !== busy.id)).toBe(true)
  })

  it('lets the player call a pending move off', () => {
    let state = run(initState({ seed: 4 }), 200)
    const busy = state.workers.find(
      (w) => w.station === 'implement' && state.stations.implement.inService.some((s) => s.workerId === w.id),
    )!
    state = step(state, [{ kind: 'assignWorker', workerId: busy.id, to: 'review' }]).state
    state = step(state, [{ kind: 'assignWorker', workerId: busy.id, to: 'implement' }]).state
    expect(state.workers.find((w) => w.id === busy.id)?.pendingStation).toBeNull()
    expect(state.workers.find((w) => w.id === busy.id)?.station).toBe('implement')
  })
})

describe('the constraint', () => {
  it('names the station the design built as the bottleneck', () => {
    const state = run(initState({ seed: 3, wipLimits: limitsAt(0.4) }), 1500, rebaseEverything)
    expect(state.constraint).toBe('review')
    expect(snapshot(state).constraint).toBe('review')
  })

  it('moves when the player relieves it, and says so', () => {
    // Two reviewers instead of one, paid for out of CI's slack.
    let state = initState({ seed: 3, staffing: move(['ci', 'review']), wipLimits: limitsAt(0.4) })
    const moved: Array<string | null> = []
    for (let i = 0; i < 1500; i++) {
      const result = step(state, rebaseEverything(state))
      state = result.state
      for (const event of result.events) {
        if (event.kind === 'constraintMoved') moved.push(event.to)
      }
    }
    expect(state.constraint).not.toBe('review')
    expect(moved.at(-1)).toBe(state.constraint)
  })

  it('reports a policy constraint when every station has slack and work still piles up', () => {
    // Strangle the limits: nobody is busy, and the backlog grows anyway.
    const starved = run(
      initState({ seed: 3, wipLimits: { spec: 1, implement: 1, review: 1, ci: 1, deploy: 1 } }),
      1500,
      rebaseEverything,
    )
    expect(snapshot(starved).constraintIsPolicy).toBe(true)

    const healthy = run(initState({ seed: 3, wipLimits: limitsAt(0.4) }), 1500, rebaseEverything)
    expect(snapshot(healthy).constraintIsPolicy).toBe(false)
  })
})

/**
 * docs/CONSTRAINT_AND_CAPACITY.md §7. If one of these breaks, the milestone's
 * lesson broke with it — that is the point of writing them down.
 */
describe('the lessons', () => {
  const base = shipped(BASELINE)
  const gain = (staffing: Record<StationId, number>, m?: number) =>
    (shipped(staffing, m) - base) / base

  it('§1 — a worker moved to the constraint is worth far more than one moved anywhere else', () => {
    const toConstraint = gain(move(['ci', 'review']))
    // Every other single move that a station with slack can afford to make.
    // `implement → review` is excluded because it is also a move *to* the
    // constraint — it gains 9%, and it should.
    const elsewhere = [
      gain(move(['ci', 'spec'])),
      gain(move(['ci', 'implement'])),
      gain(move(['ci', 'deploy'])),
      gain(move(['implement', 'spec'])),
      gain(move(['implement', 'ci'])),
      gain(move(['implement', 'deploy'])),
    ]
    expect(toConstraint).toBeGreaterThan(0.05)
    expect(toConstraint).toBeGreaterThan(5 * Math.max(...elsewhere))
  })

  it('§2 — a second move does not pay: hiring is not a ladder', () => {
    const one = shipped(move(['ci', 'review']))
    const two = shipped(move(['ci', 'review'], ['implement', 'review']))
    expect(one).toBeGreaterThan(base)
    // Not "less than" — flat would be the lesson too. What must not happen is
    // the second move paying like the first.
    expect(two - one).toBeLessThan(0.5 * (one - base))
  })

  it('§4 — retuning the WIP limits beats making a second move', () => {
    const retuned = shipped(move(['ci', 'review']), 0.5)
    const secondMove = shipped(move(['ci', 'review'], ['implement', 'review']))
    expect(retuned).toBeGreaterThan(secondMove)
  })

  it('§3 — the WIP optimum moves once the constraint has been relieved', () => {
    // Weakly, for a zero-sum move: total capacity did not grow, so the line
    // cannot absorb much more work in flight. Measured at 0.4 vs 0.5, the
    // baseline is flat and the relieved line prefers the looser setting. The
    // strong version of this — the optimum walking to 0.75 — needs `hire`, and
    // arrives with the economy in M2.
    const relievedTight = shipped(move(['ci', 'review']), 0.4)
    const relievedLoose = shipped(move(['ci', 'review']), 0.5)
    const baseLoose = shipped(BASELINE, 0.5)

    expect(relievedLoose).toBeGreaterThan(relievedTight)
    expect(relievedLoose - relievedTight).toBeGreaterThan(baseLoose - base)
  })
})
