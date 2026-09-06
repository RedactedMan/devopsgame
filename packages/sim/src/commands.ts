import type { StationId } from '@flow/content'
import type { ItemId, WorkerId, WorkerKind } from './state.js'

/**
 * The player's entire action vocabulary for M0.
 *
 * If it isn't a command, it isn't in the replay, and it isn't real. Note what
 * is *not* here: pause and speed controls. They change how fast the shell calls
 * `step`, not what `step` does, so they stay out of the log.
 */
export type StaleChoice = 'rebase' | 'abandon' | 'shipAnyway'

export type Command =
  | { kind: 'setWipLimit'; station: StationId; limit: number }
  | { kind: 'resolveStale'; itemId: ItemId; choice: StaleChoice }
  /**
   * Move a worker to another station. Free, unlimited, and reversible — the
   * scarce thing is knowing where to put them, not the ability to do it.
   */
  | { kind: 'assignWorker'; workerId: WorkerId; to: StationId }
  /**
   * Add capacity from outside. Unlike a move, this is not zero-sum, and that
   * difference is the entire reason it exists: a reallocation cannot grow the
   * capacity that lets the line hold more work in flight, so it can only move
   * the WIP optimum weakly (docs/CONSTRAINT_AND_CAPACITY.md §8). Hiring moves
   * it from 0.5× to 2×.
   *
   * `workerKind` rather than `kind`, which is already the command discriminant.
   */
  | { kind: 'hire'; station: StationId; workerKind: WorkerKind }

/** A save file, and a bug report, are this. */
export type LoggedCommand = { tick: number; command: Command }

export type Replay = { seed: number; commands: LoggedCommand[] }
