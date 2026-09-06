import { type StationId } from '@flow/content'
import type { GameState } from '../state.js'
import type { SimEvent } from '../events.js'

/**
 * Attention — the budget that judgment is paid out of.
 *
 * The design's rule (§3.4) is that money buys capacity, attention buys
 * judgment, and money cannot buy attention. In M1 there is no money at all,
 * which makes the rule sharper rather than weaker: agent seats are free and
 * effectively unlimited, exactly as the design says they are in the AI era, and
 * attention is the only scarcity in the game.
 *
 * Three things follow, and they are the whole mechanic:
 *
 *  1. **Humans supply it.** They are the ones with judgment to spend.
 *  2. **Agents consume it.** Someone has to read what they produced. An agent
 *     is throughput you have to supervise, not throughput you get for nothing.
 *  3. **Coordination eats it, quadratically.** Not a fudge factor: the term is
 *     the number of communication channels on a team of n, which is Brooks's
 *     Law written down. Doubling the team roughly quadruples what coordination
 *     costs, so the tenth hire supplies far less than the second did.
 *
 * It does not accumulate. The budget is restored every shift and whatever was
 * not spent is gone, because a fixed rate that cannot be banked is what makes
 * it a wall inside a shift rather than a slow squeeze across a level — the
 * distinction design §3.4 draws between the two currencies.
 *
 * See docs/HIRING_AND_ATTENTION.md §4 for why this exists at all: the sim
 * already plateaus hiring on its own, so the pool is not here to cap head
 * count. It is here to price the *human* hire, which is the only one that can
 * reach the constraint.
 */

/** Ticks in a shift. The budget resets on this boundary and does not carry over. */
export function shiftTicks(state: GameState): number {
  return state.tuning.ticksPerHour * 8
}

/**
 * What the roster is worth per shift.
 *
 * Can go negative — a line of agents with nobody to supervise them is not a
 * line with a small budget, it is a line that has more output than it can
 * possibly read. Floored on the way into the pool rather than here, so the raw
 * number stays readable and the HUD can say *how far* underwater the roster is
 * rather than just "empty".
 */
export function attentionSupply(state: GameState): number {
  const { perHuman, perAgent, coordination } = state.tuning.attention

  let humans = 0
  let agents = 0
  for (const worker of state.workers) {
    if (worker.kind === 'human') humans++
    else agents++
  }

  // Channels are counted between *people*, not between everybody. Brooks's
  // argument is about human communication — an agent does not attend the
  // standup or need to be kept in the loop on what four other agents are
  // doing. What it costs is one person's attention to read its output, and
  // that is `perAgent`, charged linearly above.
  //
  // Counting agents as channels was the first version and it was wrong in a
  // way that only showed up when the two terms were tuned together: raising
  // coordination enough to punish a sprawling org also made four agents
  // unaffordable, because the quadratic was counting them twice.
  const channels = (humans * (humans - 1)) / 2
  return perHuman * humans - perAgent * agents - coordination * channels
}

/**
 * The budget a shift is never allowed to fall below: one review.
 *
 * Measured, not chosen. Without a floor the supply term goes negative on a
 * large enough fleet and the line ships *nothing at all* — sixteen agents
 * against nine humans took a 165-item run to zero. That is not the lesson
 * landing hard, it is the game hanging: a player cannot tell a mechanic they
 * have triggered from an application that has stopped, and there is no way back
 * from it because rebasing costs attention too.
 *
 * A floor turns the cliff into an asymptote. Drown the team in agents and the
 * line crawls, the meter reads empty every shift, and the throughput chart says
 * plainly what happened. Failing a level for it is M3's job (plan §4), and M3
 * can only build a fail condition on top of a state the player can still be in.
 */
export function attentionFloor(state: GameState): number {
  return state.tuning.attention.reviewCost
}

/** Restore the budget at each shift boundary. Unspent attention is not banked. */
export function replenishAttention(state: GameState, events: SimEvent[]): void {
  if (state.tick % shiftTicks(state) !== 0) return

  const supply = Math.max(attentionFloor(state), attentionSupply(state))
  state.attention.perShift = supply
  state.attention.remaining = supply
  events.push({ kind: 'attentionReplenished', to: supply })
}

/**
 * Try to spend. Returns false and spends nothing if the budget will not cover
 * it — an all-or-nothing charge, because half a review is not a thing.
 */
export function spendAttention(state: GameState, cost: number): boolean {
  if (cost <= 0) return true
  if (state.attention.remaining < cost) return false
  state.attention.remaining -= cost
  return true
}

/**
 * Whether a station's work is paid for out of the attention budget.
 *
 * Only Review, and that is the point. Attention buys judgment; Review *is* the
 * judgment step, and it is also the one station agents may not stand at. The
 * scarce currency and the station money cannot fix are deliberately the same
 * place — that intersection is the game.
 */
export function costsAttention(state: GameState, station: StationId): boolean {
  return !state.tuning.stations[station].agentsAllowed
}

export function reviewCostOf(state: GameState): number {
  return state.tuning.attention.reviewCost
}
