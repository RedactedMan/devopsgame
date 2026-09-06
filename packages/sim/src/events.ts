import type { StationId } from '@flow/content'
import type { ItemId, WorkerId, WorkerKind } from './state.js'
import type { StaleChoice } from './commands.js'

/** Emitted by `step`, consumed by the renderer for effects and by tests for assertions. */
export type SimEvent =
  | { kind: 'arrived'; itemId: ItemId }
  | { kind: 'pulled'; itemId: ItemId; into: StationId }
  | { kind: 'started'; itemId: ItemId; at: StationId; ticks: number }
  | { kind: 'completed'; itemId: ItemId; at: StationId }
  | { kind: 'rework'; itemId: ItemId; from: StationId }
  | { kind: 'wentStale'; itemId: ItemId }
  | { kind: 'staleResolved'; itemId: ItemId; choice: StaleChoice }
  | { kind: 'shipped'; itemId: ItemId; trunkVersion: number; leadTimeTicks: number }
  | { kind: 'wipLimitChanged'; station: StationId; limit: number }
  | { kind: 'workerMoved'; workerId: WorkerId; from: StationId; to: StationId }
  | { kind: 'workerHired'; workerId: WorkerId; at: StationId; workerKind: WorkerKind }
  /**
   * A staffing request the sim would not carry out, and why.
   *
   * Refusing in silence would be the worst version of this rule: the player
   * clicks, nothing happens, and the one constraint that separates the game's
   * two currencies reads as a broken button.
   */
  | { kind: 'staffingRefused'; station: StationId; workerKind: WorkerKind; why: 'agentsNotAllowed' }
  /** The answer the player found has expired. The most important event in M1. */
  | { kind: 'constraintMoved'; from: StationId | null; to: StationId }
