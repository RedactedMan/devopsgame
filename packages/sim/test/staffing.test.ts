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

/** Capacity added from outside, rather than moved. Head count grows. */
const hired = (adds: Partial<Record<StationId, number>>): Record<StationId, number> => {
  const staffing = { ...BASELINE }
  for (const [id, n] of Object.entries(adds)) staffing[id as StationId] += n as number
  return staffing
}

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

function shipped(
  staffing: Record<StationId, number>,
  wipMultiplier = 0.4,
  agents: Partial<Record<StationId, number>> = {},
): number {
  const key = JSON.stringify([staffing, wipMultiplier, agents])
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let total = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const state = initState({ seed, staffing, agents, wipLimits: limitsAt(wipMultiplier) })
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
    const state = run(initState({ seed: 3, wipLimits: limitsAt(0.4) }), 2000, rebaseEverything)
    expect(state.constraint).toBe('review')
    expect(snapshot(state).constraint).toBe('review')
    // Left alone, it was named once and never moved.
    expect(state.constraintMoves).toBe(0)
  })

  it('moves when the player relieves it, and says so', () => {
    // Two reviewers instead of one, paid for out of CI's slack.
    let state = initState({ seed: 3, staffing: move(['ci', 'review']), wipLimits: limitsAt(0.4) })
    const moved: Array<string | null> = []
    for (let i = 0; i < 2500; i++) {
      const result = step(state, rebaseEverything(state))
      state = result.state
      for (const event of result.events) {
        if (event.kind === 'constraintMoved') moved.push(event.to)
      }
    }
    expect(state.constraint).not.toBe('review')
    expect(moved.at(-1)).toBe(state.constraint)
    // Naming a bottleneck for the first time is not the same event as watching
    // it relocate. Only the second one means the player's answer expired.
    expect(state.constraintMoves).toBeGreaterThan(0)
  })

  it('never reports a move on a line nobody touched', () => {
    // The regression that made this a test: at a 240-tick grace the board
    // announced "the constraint moved to Review" on day 8.6 of a run where the
    // player had done nothing — it was the pipeline filling, and then two tied
    // stations trading places on noise. A false report of the single most
    // important event in the milestone is worse than no report at all.
    // 20260830 is the seed the app boots on, and it is in this list because it
    // is the one that broke: at the end of the grace period Implement and
    // Review are both pinned near 100% and have not separated yet. A run every
    // player sees on first load is not a seed to leave to a sample.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 20260830]) {
      for (const wip of [0.4, 1]) {
        const state = run(initState({ seed, wipLimits: limitsAt(wip) }), 4000, rebaseEverything)
        expect(state.constraint, `seed ${seed} at wip x${wip}`).toBe('review')
        expect(state.constraintMoves, `seed ${seed} at wip x${wip}`).toBe(0)
      }
    }
  })

  it('reports a policy constraint when every station has slack and work still piles up', () => {
    // Strangle the limits: nobody is busy, and the backlog grows anyway.
    const starved = run(
      initState({ seed: 3, wipLimits: { spec: 1, implement: 1, review: 1, ci: 1, deploy: 1 } }),
      2000,
      rebaseEverything,
    )
    expect(snapshot(starved).constraintIsPolicy).toBe(true)

    const healthy = run(initState({ seed: 3, wipLimits: limitsAt(0.4) }), 2000, rebaseEverything)
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
    // baseline is flat and the relieved line prefers the looser setting.
    // The strong version is the test below, and it needed `hire`.
    const relievedTight = shipped(move(['ci', 'review']), 0.4)
    const relievedLoose = shipped(move(['ci', 'review']), 0.5)
    const baseLoose = shipped(BASELINE, 0.5)

    expect(relievedLoose).toBeGreaterThan(relievedTight)
    expect(relievedLoose - relievedTight).toBeGreaterThan(baseLoose - base)
  })

  it('§3, strong — the setting that was best becomes the worst on the board', () => {
    // This assertion is the acceptance criterion for `hire`
    // (docs/CONSTRAINT_AND_CAPACITY.md §8), and it is the reason the command
    // exists. A reallocation cannot do it: the line can only absorb more work
    // in flight if there is more capacity to work it.
    //
    // The player's own success invalidates their own settings, which is the
    // whole two-lever interaction. Nothing here is random — the optimum moved
    // because of what the player did.
    const tightAtBaseline = shipped(BASELINE, 0.4)
    const looseAtBaseline = shipped(BASELINE, 0.75)
    expect(tightAtBaseline).toBeGreaterThan(looseAtBaseline)

    const staffed = hired({ review: 2, implement: 2 })
    const tightAfter = shipped(staffed, 0.4)
    const looseAfter = shipped(staffed, 0.75)
    expect(looseAfter).toBeGreaterThan(tightAfter)

    // And the reversal is worth caring about, not a rounding error: the
    // slider the player worked out in slice 1 now costs them a fifth of the
    // line. Measured at 183 against 237.
    expect((looseAfter - tightAfter) / tightAfter).toBeGreaterThan(0.15)
  })

  it('§3, strong — a fleet of agents cannot substitute for one human at the constraint', () => {
    // The design's two currencies, as one number. Agents are cheap, parallel,
    // and barred from Review; humans are none of those and Review is the
    // constraint. Measured at ~17:1 — docs/HIRING_AND_ATTENTION.md §3.
    //
    // Deliberately four against one. At equal head count this would be a
    // statement about the constraint; at four to one it is a statement about
    // what money can and cannot buy.
    const fourAgents = shipped(BASELINE, 0.4, { implement: 4 })
    const oneHuman = shipped(hired({ review: 1 }), 0.5)

    expect(oneHuman - base).toBeGreaterThan(5 * (fourAgents - base))
  })

  it('§3, strong — and the same agents are worth far more once a human has unblocked them', () => {
    // The converse, without which the above is only a claim that agents are
    // useless. They are not weak, they are blocked, and ordering is the whole
    // decision: the same four are worth ~3 items before the human hire and
    // ~22 after it.
    const agentsAlone = shipped(BASELINE, 0.4, { implement: 4 }) - base

    const humanOnly = shipped(hired({ review: 1 }), 0.5)
    const humanThenAgents = shipped(hired({ review: 1 }), 1, { implement: 4 })

    expect(humanThenAgents - humanOnly).toBeGreaterThan(3 * agentsAlone)
  })
})

describe('attention — the wall money cannot buy past', () => {
  const base = shipped(BASELINE)

  it('a fleet nobody can review is worse than not hiring it', () => {
    // Plan §5 lists this as a lesson test with nowhere to live: a run with an
    // unlimited budget and a fixed attention supply plateaus. It does better
    // than plateau — eight agents with no reviewer to read them cost 12% of
    // the line, because agents draw the budget that Review runs on.
    //
    // This is the whole reason the pool exists. Without it, free capacity is
    // free, and the correct play is to take all of it.
    const eightAgents = shipped(BASELINE, 0.4, { implement: 8 })
    expect(eightAgents).toBeLessThan(base)
  })

  it('the fleet has a right size, and it is not the largest one', () => {
    // A hump rather than a plateau. Doubling a fleet that was paying costs
    // throughput, so "buy more doing" is punished rather than merely wasted —
    // and the player has to find a ratio instead of a maximum.
    const four = shipped(hired({ review: 1 }), 1, { implement: 4 })
    const eight = shipped(hired({ review: 1 }), 0.5, { implement: 8 })
    expect(four).toBeGreaterThan(eight)
  })

  it('hiring humans never starves the line, however many', () => {
    // Humans supply attention; agents draw it. If hiring a human could starve
    // Review, the pool would be punishing the one move the milestone spent two
    // slices teaching the player to make.
    const staffed = hired({ review: 2, implement: 2 })
    expect(shipped(staffed, 0.75)).toBeGreaterThan(shipped(hired({ review: 1 }), 0.5))
  })
})

describe('hiring', () => {
  const hireCmd = (station: StationId, workerKind: 'human' | 'agent'): Command => ({
    kind: 'hire',
    station,
    workerKind,
  })

  it('adds capacity, and the new worker is capacity immediately', () => {
    const before = initState({ seed: 1 })
    const after = step(before, [hireCmd('review', 'human')]).state
    expect(serversAt(after, 'review')).toBe(serversAt(before, 'review') + 1)
    expect(after.workers.at(-1)?.kind).toBe('human')
    expect(after.workers.at(-1)?.station).toBe('review')
  })

  it('gives the hire an id no one already on the roster is using', () => {
    // `nextWorkerSerial` exists for this. A replay that hires and then moves
    // "W10" has to mean the same person on the way through, or the second
    // command addresses a stranger.
    let state = initState({ seed: 1 })
    const startingIds = new Set(state.workers.map((w) => w.id))
    for (let i = 0; i < 5; i++) state = step(state, [hireCmd('ci', 'agent')]).state

    const ids = state.workers.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => !startingIds.has(id))).toHaveLength(5)
  })

  it('refuses to put an agent at Review, and says so', () => {
    // The one rule that separates the game's two currencies. Refusing in
    // silence would read as a broken button.
    const before = initState({ seed: 1 })
    const { state, events } = step(before, [hireCmd('review', 'agent')])

    expect(state.workers).toHaveLength(before.workers.length)
    expect(events).toContainEqual({
      kind: 'staffingRefused',
      station: 'review',
      workerKind: 'agent',
      why: 'agentsNotAllowed',
    })
  })

  it('lets an agent stand anywhere else', () => {
    for (const id of STATION_IDS.filter((s) => s !== 'review')) {
      const after = step(initState({ seed: 1 }), [hireCmd(id, 'agent')]).state
      expect(serversAt(after, id), id).toBe(DEFAULT_TUNING.stations[id].servers + 1)
    }
  })

  it('will not let an agent be moved to Review either', () => {
    // The gap the enforcement would have had if `hire` were the only place it
    // was checked: hire the agent at CI, then walk it over.
    let state = initState({ seed: 1 })
    state = step(state, [hireCmd('ci', 'agent')]).state
    const agent = state.workers.at(-1) as { id: string }

    const { state: after, events } = step(state, [
      { kind: 'assignWorker', workerId: agent.id, to: 'review' },
    ])
    const moved = after.workers.find((w) => w.id === agent.id)
    expect(moved?.station).toBe('ci')
    expect(moved?.pendingStation).toBeNull()
    expect(events.some((e) => e.kind === 'staffingRefused')).toBe(true)
  })

  it('still lets a human be moved to Review', () => {
    const state = initState({ seed: 1 })
    const human = state.workers.find((w) => w.station === 'ci') as { id: string }
    const after = step(state, [{ kind: 'assignWorker', workerId: human.id, to: 'review' }]).state
    const moved = after.workers.find((w) => w.id === human.id)
    expect(moved?.station === 'review' || moved?.pendingStation === 'review').toBe(true)
  })
})
