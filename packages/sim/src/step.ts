import { STATION_IDS } from '@flow/content'
import type { Command } from './commands.js'
import type { SimEvent } from './events.js'
import { cloneState } from './init.js'
import type { GameState } from './state.js'
import { replenishAttention } from './systems/attention.js'
import { resolveStale, updateDrift } from './systems/drift.js'
import { sampleMetrics } from './systems/metrics.js'
import { arrivals, pull } from './systems/routing.js'
import { advanceService, startService } from './systems/service.js'
import { updateContext } from './systems/context.js'
import {
  applyPendingMoves,
  hire,
  removeAgent,
  requestMove,
  updateConstraint,
  updateUtilisation,
} from './systems/staffing.js'

export type StepResult = { state: GameState; events: SimEvent[] }

/**
 * The tick function. Pure: same state, same commands, same result, forever.
 *
 * Commands are applied at the tick boundary and nowhere else. That single rule
 * is what makes `{ seed, commandLog }` a complete save file and a complete bug
 * report.
 */
export function step(state: GameState, commands: readonly Command[] = []): StepResult {
  const s = cloneState(state)
  const events: SimEvent[] = []

  applyCommands(s, commands, events)

  s.tick += 1
  // Before anything can spend it. The budget does not accumulate, so whatever
  // last shift did not use is gone at this line.
  replenishAttention(s, events)
  arrivals(s, events)
  updateDrift(s, events)
  advanceService(s, events)
  updateContext(s)
  // Between finishing and starting: a worker who just came free can move before
  // the station hands them the next thing.
  applyPendingMoves(s, events)
  pull(s, events)
  startService(s, events)
  updateUtilisation(s)
  updateConstraint(s, events)

  if (s.tick % s.tuning.sampleEveryTicks === 0) s.metrics.samples.push(sampleMetrics(s))

  return { state: s, events }
}

function applyCommands(state: GameState, commands: readonly Command[], events: SimEvent[]): void {
  for (const command of commands) {
    switch (command.kind) {
      case 'setWipLimit': {
        const station = state.stations[command.station]
        const limit = Math.max(1, Math.floor(command.limit))
        // Lowering a limit never evicts work already in the station; it just
        // stops more being pulled. Draining is the player's problem, which is
        // the honest version of this lever.
        station.wipLimit = limit
        events.push({ kind: 'wipLimitChanged', station: command.station, limit })
        break
      }
      case 'resolveStale':
        resolveStale(state, command.itemId, command.choice, events)
        break
      case 'assignWorker':
        // Only ever a request. `applyPendingMoves` decides when it lands, so
        // there is one code path whether the worker is idle or mid-item.
        requestMove(state, command.workerId, command.to, events)
        break
      case 'hire':
        hire(state, command.station, events)
        break
      case 'removeAgent':
        removeAgent(state, command.workerId, events)
        break
    }
  }
}

/** Convenience for tests and sweeps: run `ticks` steps, optionally driving commands each tick. */
export function run(
  state: GameState,
  ticks: number,
  policy?: (state: GameState) => Command[],
): GameState {
  let s = state
  for (let i = 0; i < ticks; i++) {
    s = step(s, policy ? policy(s) : []).state
  }
  return s
}

export const PIPELINE = STATION_IDS
