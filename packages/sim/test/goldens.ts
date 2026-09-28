import type { Replay } from '@flow/sim'

/*
 * The golden replays, shared by `replay.test.ts`, which asserts them, and
 * `rules.test.ts`, which hashes them into the rules probe. A golden that moves
 * is a change to the rules, so it has to move `RULES_VERSION` too.
 */

/**
 * A fixed script against a fixed seed. The hash below is not a magic number to
 * be updated when it goes red — it is the assertion. If it changes, the balance
 * of the game changed, and either that was intended or it was a bug.
 */
export const REPLAY: Replay = {
  seed: 20260830,
  commands: [
    { tick: 30, command: { kind: 'setWipLimit', station: 'implement', limit: 12 } },
    { tick: 30, command: { kind: 'setWipLimit', station: 'review', limit: 8 } },
    { tick: 400, command: { kind: 'setWipLimit', station: 'implement', limit: 3 } },
    { tick: 400, command: { kind: 'setWipLimit', station: 'review', limit: 2 } },
    { tick: 900, command: { kind: 'setWipLimit', station: 'ci', limit: 3 } },
  ],
}

export const GOLDEN = 'bbf2d633'
export const TICKS = 1500

/**
 * A second script, for the half of the game the first one cannot see.
 *
 * `REPLAY` above predates `hire` and never leaves the starting roster, which is
 * exactly why it proved the attention pool was a no-op — and exactly why it
 * pins nothing about what happens after the player spends. Every balance
 * number in docs/HIRING_AND_ATTENTION.md lives past the point this run stops
 * looking, and the tests that assert them are sweeps over a dozen seeds: they
 * catch a lesson being lost and would not notice a 25% number becoming a 20%
 * one.
 *
 * So: move a person to the constraint, add agents where the gap is, and
 * retune afterwards, which is the whole of the slice in five commands. It used
 * to hire the person. The team is fixed now (docs/HIRING_AND_ATTENTION.md §8)
 * and the move pays onboarding, so the hash below was re-recorded then.
 */
export const STAFFED: Replay = {
  seed: 20260830,
  commands: [
    { tick: 30, command: { kind: 'setWipLimit', station: 'implement', limit: 3 } },
    { tick: 30, command: { kind: 'setWipLimit', station: 'review', limit: 2 } },
    // W2 is an implementer: the roster is laid out in pipeline order.
    { tick: 300, command: { kind: 'assignWorker', workerId: 'W2', to: 'review' } },
    { tick: 320, command: { kind: 'hire', station: 'implement' } },
    { tick: 340, command: { kind: 'hire', station: 'implement' } },
    // The retune, which is worth more than a second move would be.
    { tick: 700, command: { kind: 'setWipLimit', station: 'implement', limit: 6 } },
    { tick: 700, command: { kind: 'setWipLimit', station: 'review', limit: 4 } },
  ],
}

export const GOLDEN_STAFFED = '7ce23854'

/**
 * A third script, because neither of the first two can see context decay.
 * Nothing in them keeps an agent's output waiting a full shift for review, so
 * both hashes held when decay was built, which also means neither pins it.
 *
 * This is the pattern decay exists to punish: start five agents and leave
 * everything else as it was. Built 2026-09-27 (docs/HIRING_AND_ATTENTION.md
 * §7). With decay switched off it fingerprints as `87dcabe9`, so the hash
 * below depends on the mechanic.
 */
export const IGNORED: Replay = {
  seed: 20260830,
  commands: [30, 31, 32, 33, 34].map((tick) => ({
    tick,
    command: { kind: 'hire', station: 'implement' },
  })),
}

export const GOLDEN_IGNORED = 'e97ce11e'

/**
 * The session's game (packages/sim/test/session.test.ts, *the session can be
 * won*): `SESSION_TUNING`, the full `SESSION_TICKS`, the good play at day 10
 * and stale work rebased every 20 ticks. The first golden to finish a whole
 * session, and the only one to run under the session's tuning. Recorded
 * 2026-09-28 when the session got its win line (docs/HIRING_AND_ATTENTION.md
 * §10). Part of the session rules probe, not the free-play one.
 */
export const GOLDEN_SESSION = 'bc06fb23'
