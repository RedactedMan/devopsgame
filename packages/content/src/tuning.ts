import { z } from 'zod'
import { STATION_IDS } from './stations.js'

/**
 * Every tunable number in the game lives here. Systems never import this file
 * directly — tuning is loaded into `GameState` at init and read from there, so
 * headless sweeps can vary it without touching sim code.
 */

const StationTuning = z.object({
  /** Starting head count. Capacity after that is whatever the player's roster says. */
  servers: z.number().int().positive(),
  /** Starting WIP limit: queue + in-service + outbound, capped. */
  defaultWipLimit: z.number().int().positive(),
  /** Fixed setup cost, in ticks. */
  baseTicks: z.number().nonnegative(),
  /** Additional ticks per unit of item size. */
  ticksPerUnit: z.number().nonnegative(),
  /** Baseline chance a completed item is sent back for rework, before drift. */
  reworkBase: z.number().min(0).max(1),
  /**
   * Whether an agent may stand here.
   *
   * Review is false, and the design doc (§3.3) does *not* say agents cannot
   * review — it says they can, and that the signal they produce is unreliable.
   * That is M5's mechanic. Until it exists, an agent reviewer would be a
   * strictly better human: same output, no attention cost. Every lesson in the
   * game inverts. So M1 bars them outright and M5 lets them in along with the
   * reason they should not be trusted.
   *
   * This one flag is what separates the design's two currencies. Measured:
   * sixty-four workers everywhere agents may stand are worth +1.9%, and one
   * human at Review is worth +26.6% — see docs/HIRING_AND_ATTENTION.md §3.
   */
  agentsAllowed: z.boolean(),
})

export const TuningSchema = z.object({
  /** Sim resolution. The renderer interpolates between ticks; the sim never subdivides one. */
  ticksPerHour: z.number().int().positive(),

  arrival: z.object({
    /** Mean ticks between new work items arriving in the backlog. */
    meanTicksBetween: z.number().positive(),
    sizeMin: z.number().int().positive(),
    sizeMax: z.number().int().positive(),
    /** Size of the codebase, in areas an item can touch. Smaller = more collisions. */
    areaCount: z.number().int().positive(),
    areasMin: z.number().int().positive(),
    areasMax: z.number().int().positive(),
  }),

  stations: z.object(
    Object.fromEntries(STATION_IDS.map((id) => [id, StationTuning])) as {
      [K in (typeof STATION_IDS)[number]]: typeof StationTuning
    },
  ),

  drift: z.object({
    /**
     * Time-in-system term. Drift is mostly driven by trunk movement, but an
     * item held while nothing ships still goes stale — attention leaks too.
     */
    perHourInSystem: z.number().nonnegative(),
    /** Each other in-flight item sharing an area amplifies drift by this much. */
    overlapWeight: z.number().nonnegative(),
    /** Drift at or above this is STALE: the item stops until the player decides. */
    staleThreshold: z.number().positive(),
    /** Service time multiplier at full drift. */
    serviceMultAtFullDrift: z.number().nonnegative(),
    /** Added rework probability at full drift. */
    reworkAtFullDrift: z.number().min(0).max(1),
    /** True quality lost at deploy, at full drift. */
    qualityPenaltyAtFullDrift: z.number().min(0).max(1),
    /** Rebase re-spends this fraction of the item's original size. */
    rebaseWorkFraction: z.number().min(0).max(1),
    /** Rework adds this fraction of the item's original size back onto it. */
    reworkSizeFraction: z.number().min(0).max(1),
  }),

  constraint: z.object({
    /** Smoothing window for station utilisation, in ticks. Roughly one sim-day. */
    windowTicks: z.number().int().positive(),
    /** A challenger must beat the incumbent by this much to be named the constraint. */
    switchMargin: z.number().min(0).max(1),
    /**
     * And must hold that lead for this long. Two stations running neck and neck
     * trade places all day on a noisy line; a margin alone only asks for a
     * bigger swing, not a sustained one, and the difference is a HUD that cries
     * wolf about the most important event in the game.
     */
    switchDwellTicks: z.number().int().nonnegative(),
    /**
     * No constraint is named before this tick. Long enough for the pipeline to
     * fill, not just for the average to converge — a line that is still filling
     * has a bottleneck that walks downstream as the work reaches each station,
     * and reporting that as news is reporting the startup transient.
     */
    graceTicks: z.number().int().nonnegative(),
    /**
     * If no station is busier than this while work is piling up, the bottleneck
     * is not a station at all — it is the WIP limits. See
     * docs/CONSTRAINT_AND_CAPACITY.md §3.
     */
    policySlackBelow: z.number().min(0).max(1),
  }),

  /**
   * The judgment budget. See `systems/attention.ts` and
   * docs/HIRING_AND_ATTENTION.md §4.
   */
  attention: z.object({
    /** Supplied per shift by each human on the roster. */
    perHuman: z.number().nonnegative(),
    /** Drawn per shift by each agent, because someone has to read its output. */
    perAgent: z.number().nonnegative(),
    /**
     * Exponent on the human head count: supply is `perHuman · H^alpha`. Below
     * one, each person added supplies less than the last — the well-replicated
     * finding — but the total never falls. Not capped at one, because the sign
     * of the exponent is contested in the literature and a sweep should be
     * able to try the other side. See docs/HIRING_AND_ATTENTION.md §5.
     */
    alpha: z.number().positive(),
    /** Charged when Review picks up an item. Unaffordable means Review stalls. */
    reviewCost: z.number().nonnegative(),
    /**
     * Charged for a rebase. When it cannot be paid the rebase is refused and
     * abandon and ship-anyway are not — running out of judgment costs you the
     * good option and leaves you the bad ones, which is the lesson rather than
     * a deadlock.
     */
    rebaseCost: z.number().nonnegative(),
  }),

  /** How often the metrics sampler appends a point to the chart series. */
  sampleEveryTicks: z.number().int().positive(),
})

export type Tuning = z.infer<typeof TuningSchema>

export const DEFAULT_TUNING: Tuning = TuningSchema.parse({
  ticksPerHour: 10,

  arrival: {
    meanTicksBetween: 16,
    sizeMin: 3,
    sizeMax: 8,
    areaCount: 10,
    areasMin: 1,
    areasMax: 2,
  },

  // The starting WIP limits are deliberately too loose — the sweep in the README
  // puts 1× among the worst rows on the board. Design rule 3: the intuitive move
  // must be the wrong move, and a player who never touches the sliders must be
  // able to feel that. Do not "fix" these to the sweep optimum.
  stations: {
    // Review is the bottleneck by construction: one server, and only humans
    // can staff it. That is the constraint the whole campaign is built around.
    spec: { servers: 1, defaultWipLimit: 4, baseTicks: 4, ticksPerUnit: 1, reworkBase: 0, agentsAllowed: true },
    implement: { servers: 4, defaultWipLimit: 8, baseTicks: 8, ticksPerUnit: 6, reworkBase: 0, agentsAllowed: true },
    review: { servers: 1, defaultWipLimit: 4, baseTicks: 4, ticksPerUnit: 1.5, reworkBase: 0.05, agentsAllowed: false },
    ci: { servers: 2, defaultWipLimit: 6, baseTicks: 12, ticksPerUnit: 0, reworkBase: 0.08, agentsAllowed: true },
    deploy: { servers: 1, defaultWipLimit: 4, baseTicks: 5, ticksPerUnit: 0, reworkBase: 0, agentsAllowed: true },
  },

  constraint: {
    windowTicks: 80,
    switchMargin: 0.05,
    switchDwellTicks: 160,
    // Ten sim-days. Measured, not guessed: over 61 seeds × two WIP settings, a
    // 480- or 560-tick grace still misnames the constraint on three runs, while
    // 800 names Review on all 122 and reports zero moves — which is the right
    // answer, because nobody touched those lines.
    graceTicks: 800,
    policySlackBelow: 0.7,
  },

  drift: {
    perHourInSystem: 0.05,
    overlapWeight: 0.25,
    staleThreshold: 60,
    serviceMultAtFullDrift: 1.2,
    reworkAtFullDrift: 0.35,
    qualityPenaltyAtFullDrift: 0.35,
    rebaseWorkFraction: 0.3,
    reworkSizeFraction: 0.35,
  },

  // Shipped deliberately slack: at the starting roster this budget cannot be
  // exhausted, so the golden replay does not move and the pool binds only after
  // the player has hired. The feedback has to be causal — *your hire did this* —
  // and a meter that was already tight on turn one teaches the opposite.
  // Swept to these values; see docs/HIRING_AND_ATTENTION.md §5 step 3.
  attention: {
    // A power law, not a quadratic. The first two tunings used Brooks's
    // channel count, `coordination · H(H−1)/2`, and it put a peak at thirteen
    // people with a cliff past it. Checked against the literature, the cliff
    // is not there: per-person output falls as a team grows, total output
    // does not, and the one study that fitted the quadratic explicitly found
    // it standing in for coordination structure rather than head count.
    //
    // perHuman is anchored so that the starting roster of nine supplies what
    // it did under the quadratic (13.69 against 13.68). The decision first
    // anchored at thirteen, and that cost a fifth of the budget at ten, which
    // is where every agent lesson lives: four agents after a human hire went
    // from paying 41% to costing 3%. Anchored at nine, the agent table
    // reproduces to within seed noise. Alpha is a reasonable bet inside a
    // 0.6–0.8 band, not a settled value. See docs/HIRING_AND_ATTENTION.md §5,
    // "Checked against the literature".
    perHuman: 2.94,
    alpha: 0.7,
    perAgent: 1.2,
    reviewCost: 1,
    rebaseCost: 2,
  },

  sampleEveryTicks: 10,
})
