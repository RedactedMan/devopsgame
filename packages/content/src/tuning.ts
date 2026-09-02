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
    /** No constraint is named before this tick: the rolling average has to warm up first. */
    graceTicks: z.number().int().nonnegative(),
    /**
     * If no station is busier than this while work is piling up, the bottleneck
     * is not a station at all — it is the WIP limits. See
     * docs/CONSTRAINT_AND_CAPACITY.md §3.
     */
    policySlackBelow: z.number().min(0).max(1),
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
    spec: { servers: 1, defaultWipLimit: 4, baseTicks: 4, ticksPerUnit: 1, reworkBase: 0 },
    implement: { servers: 4, defaultWipLimit: 8, baseTicks: 8, ticksPerUnit: 6, reworkBase: 0 },
    review: { servers: 1, defaultWipLimit: 4, baseTicks: 4, ticksPerUnit: 1.5, reworkBase: 0.05 },
    ci: { servers: 2, defaultWipLimit: 6, baseTicks: 12, ticksPerUnit: 0, reworkBase: 0.08 },
    deploy: { servers: 1, defaultWipLimit: 4, baseTicks: 5, ticksPerUnit: 0, reworkBase: 0 },
  },

  constraint: {
    windowTicks: 80,
    switchMargin: 0.05,
    graceTicks: 240,
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

  sampleEveryTicks: 10,
})
