import type { StationId } from '@flow/content'
import type { ItemId, WorkerId } from './state.js'

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
   * Move a worker to another station. Unlimited and reversible, but not free
   * for a person: they onboard at the new station, slower for a while and
   * drawing on the attention budget. A player can guess, but every guess
   * costs something.
   */
  | { kind: 'assignWorker'; workerId: WorkerId; to: StationId }
  /**
   * Add an agent. The human team is fixed, so this is the only way capacity
   * grows, and it is what lets the WIP optimum move strongly
   * (docs/CONSTRAINT_AND_CAPACITY.md §8). A move alone is zero-sum. Moving
   * a person to the constraint and backfilling with agents is not.
   */
  | { kind: 'hire'; station: StationId }

/** A save file, and a bug report, are this. */
export type LoggedCommand = { tick: number; command: Command }

export type Replay = { seed: number; commands: LoggedCommand[] }
