import { STATION_IDS, DEFAULT_TUNING, type StationId, type Tuning } from '@flow/content'
import { makeRng, nextExponential } from './rng.js'
import type { GameState, Station, Worker } from './state.js'

export type InitOptions = {
  seed: number
  tuning?: Tuning
  /** Overrides the tuning defaults, so a test or a sweep can set the lever directly. */
  wipLimits?: Partial<Record<StationId, number>>
  /**
   * Starting head count per station, overriding `tuning.stations[id].servers`.
   * The sweeps use it to measure a staffing decision without needing a player.
   */
  staffing?: Partial<Record<StationId, number>>
}

export function initState(options: InitOptions): GameState {
  const tuning = options.tuning ?? DEFAULT_TUNING
  const rng = makeRng(options.seed)

  const stations = Object.fromEntries(
    STATION_IDS.map((id): [StationId, Station] => [
      id,
      {
        id,
        wipLimit: options.wipLimits?.[id] ?? tuning.stations[id].defaultWipLimit,
        queue: [],
        inService: [],
        outbound: [],
        utilisation: 0,
      },
    ]),
  ) as Record<StationId, Station>

  // The roster is laid out station by station in pipeline order, so worker ids
  // are stable across seeds and a replay of someone else's run assigns the same
  // people to the same work.
  const workers: Worker[] = []
  for (const id of STATION_IDS) {
    const count = options.staffing?.[id] ?? tuning.stations[id].servers
    for (let i = 0; i < count; i++) {
      workers.push({
        id: `W${workers.length + 1}`,
        kind: 'human',
        station: id,
        pendingStation: null,
      })
    }
  }

  return {
    tick: 0,
    rng,
    tuning,
    trunkVersion: 0,
    nextItemSerial: 1,
    // Drawn from the same stream the sim will keep using, so the first arrival
    // is as seed-determined as every one after it.
    nextArrivalTick: nextExponential(rng, tuning.arrival.meanTicksBetween),
    backlog: [],
    stations,
    workers,
    nextWorkerSerial: workers.length + 1,
    constraint: null,
    constraintSinceTick: 0,
    constraintMoves: 0,
    items: [],
    metrics: {
      created: 0,
      abandoned: 0,
      reworkCount: 0,
      rebaseCount: 0,
      shipped: [],
      samples: [],
    },
  }
}

/**
 * Structural clone that shares the tuning reference. Tuning is immutable data
 * loaded once; copying it every tick would be the sim's largest cost by far.
 */
export function cloneState(state: GameState): GameState {
  return {
    tick: state.tick,
    rng: { s: state.rng.s },
    tuning: state.tuning,
    trunkVersion: state.trunkVersion,
    nextItemSerial: state.nextItemSerial,
    nextArrivalTick: state.nextArrivalTick,
    backlog: [...state.backlog],
    workers: state.workers.map((w) => ({ ...w })),
    nextWorkerSerial: state.nextWorkerSerial,
    constraint: state.constraint,
    constraintSinceTick: state.constraintSinceTick,
    constraintMoves: state.constraintMoves,
    stations: Object.fromEntries(
      STATION_IDS.map((id): [StationId, Station] => {
        const s = state.stations[id]
        return [
          id,
          {
            ...s,
            queue: [...s.queue],
            inService: s.inService.map((slot) => ({ ...slot })),
            outbound: [...s.outbound],
          },
        ]
      }),
    ) as Record<StationId, Station>,
    items: state.items.map((it) => ({
      ...it,
      areas: [...it.areas],
      history: it.history.map((v) => ({ ...v })),
    })),
    metrics: {
      ...state.metrics,
      shipped: [...state.metrics.shipped],
      samples: [...state.metrics.samples],
    },
  }
}
