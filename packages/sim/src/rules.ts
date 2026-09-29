/**
 * Which rules a run was played under.
 *
 * A save, and a leaderboard run, is a seed and a list of decisions. Replaying
 * it against different tuning or different sim code gives a different game,
 * and nothing in the log would say so. Slice 3b showed how quietly that
 * happens: five agents and nothing else replay identically with and without
 * context decay up to tick 800, and to a different game by 1500.
 *
 * So the version is a number, and a test keeps it honest. `RULES_PROBE` is a
 * hash of the default tuning and the three golden replay fingerprints
 * (`test/rules.test.ts`). Anything that moves either moves the probe, the test
 * fails, and the fix is to bump the version and re-record the probe. A number
 * bumped from memory is one that gets forgotten, and a build id would change on
 * every docs-only deploy.
 *
 * The blind spot is the goldens' blind spot: a code change no golden run
 * exercises. A save also carries a fingerprint of the state it was saved at,
 * which catches that when it changes the saved part of the run (`save.ts`).
 *
 * History, newest first. Say what changed and why the version moved.
 *
 *   1  2026-09-27  First version, recorded with save and load (M1 slice 4).
 *                  The rules as of slice 3b, context decay.
 */
export const RULES_VERSION = 1

export const RULES_PROBE = '58f16988'

/**
 * Which rules a *session* run was scored under.
 *
 * Presentation mode plays `SESSION_TUNING` and is won on
 * `SESSION_WIN_UNFINISHED` (2026-09-28), so a change to either moves the
 * room's game without moving free play, and the free-play version above would
 * not notice. Kept separate so a session change does not tell every save it
 * was made under other rules when it was not. `SESSION_RULES_PROBE` hashes the
 * session tuning, the win line, the free-play goldens and the session golden
 * (`test/rules.test.ts`); the same rule applies, bump and re-record.
 *
 * A session page sends it with its join and with its run, and the Worker
 * refuses a mismatch with 409 and "reload" (2026-09-28), because a tab opened
 * before a deploy plays the old game while the Worker replays under the new
 * one. IMPLEMENTATION_PLAN §3.
 *
 * History, newest first.
 *
 *   1  2026-09-28  First version, with the session's win line. Work arrives
 *                  every 20 ticks rather than 16; won at 10 or fewer
 *                  unfinished.
 */
export const SESSION_RULES_VERSION = 1

export const SESSION_RULES_PROBE = '849a70de'
