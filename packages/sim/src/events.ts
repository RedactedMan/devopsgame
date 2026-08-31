import type { StationId } from '@flow/content'
import type { ItemId } from './state.js'
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
