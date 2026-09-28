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
  | {
      kind: 'staffingRefused'
      station: StationId
      workerKind: WorkerKind
      why: 'agentsNotAllowed' | 'teamIsFixed'
    }
  | { kind: 'workerRemoved'; workerId: WorkerId; from: StationId }
  | { kind: 'attentionReplenished'; to: number }
  /**
   * Judgment the player could not pay for. The most important thing the pool
   * can say, because an empty budget looks exactly like an idle station.
   */
  | { kind: 'attentionExhausted'; wanted: 'review' | 'rebase'; cost: number; remaining: number }
  /**
   * Review paid to rebuild an agent's lost context before it could start
   * (systems/context.ts). `cost` is the extra over the review itself.
   */
  | { kind: 'rebriefed'; itemId: ItemId; cost: number }
  /** The answer the player found has expired. The most important event in M1. */
  | { kind: 'constraintMoved'; from: StationId | null; to: StationId }
