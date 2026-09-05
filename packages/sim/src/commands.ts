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
   * Move a worker to another station. Free, unlimited, and reversible — the
   * scarce thing is knowing where to put them, not the ability to do it.
   * Hiring, which is not free, waits for the economy in M2.
   */
  | { kind: 'assignWorker'; workerId: WorkerId; to: StationId }

/** A save file, and a bug report, are this. */
export type LoggedCommand = { tick: number; command: Command }

export type Replay = { seed: number; commands: LoggedCommand[] }
