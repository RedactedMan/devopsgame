# The presentation

Companion to [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) §7, which is the
presentation mode this talk runs on.

**Deck:** [`docs/deck/`](./deck/README.md) — *Code is cheap now. Attention
isn't.* 27 slides with speaker notes. Open `docs/deck/deck.html` to present it.
In the repo since 2026-09-28, which is the copy of record. It was written as a
claude.ai Slides artifact, <https://claude.ai/artifact/USk8xhe7uwjvDmVEsbfB2G>,
private until shared from its Share menu, and the two hold the same files.

The talk teaches the core principles of DevOps, then has the room play one run of
Flow State, then uses the room's own results to make the argument that human
attention is now the constraint on software delivery, and that planning and review
are where it has to be spent.

## Timing

A 45-minute slot. Play, then reveal: the debrief is built on what players just
did, per GAME_DESIGN §6 rule 1.

| Clock | Segment | Length |
|---|---|---|
| 0:00 | Welcome and join the game | 3 min |
| 0:03 | Core principles: the Three Ways, the DORA keys | 10 min |
| 0:13 | How to play | 2 min |
| 0:15 | **Play: one full run** | **15 min** |
| 0:30 | Leaderboard | 3 min |
| 0:33 | Debrief: what the sim measured, then the last year of agents | 9 min |
| 0:42 | Monday checklist and questions | 3 min |

## How long one run takes

A presentation-mode run is `SESSION_TICKS` = 4000 ticks, which is 50 sim-days at
80 ticks a day. The web build advances 5 ticks a second at 1×
(`apps/web/src/bridge/useSim.ts`).

| Speed | Wall clock for one run |
|---|---|
| 1× | 13:20 |
| 2× | 6:40 |
| 4× | 3:20 |

Pausing stops the sim clock and costs nothing. The deck suggests 1× until day 10,
when the board names the bottleneck (2:40), then 2× for the rest (5:20): about
eight minutes of game time. First-time players who pause to think land at 10–13
minutes, so the 15-minute block fits one careful run, or a second quick one for
fast players. The leaderboard keeps each player's best.

If these constants change, update this table and the `agenda` and `play` slides
in `docs/deck/project/slides/`, then run `pnpm deck`.

## Before the session

- The game is live at <https://flow-state.mschrenk.workers.dev>. Every push to
  `main` deploys, so don't merge anything on the day of the talk that you haven't
  played. Don't deploy during a session either. A tab opened before the deploy
  keeps playing the old rules. Since 2026-09-28 the server refuses that run
  rather than scoring it under the new ones and tells the player to reload,
  but the player still loses the run (IMPLEMENTATION_PLAN §3).
  The change that made the session winnable (2026-09-28) is exactly that kind of
  change: deploy it well before the talk, and have the room load the page fresh.
  The presenter key is set. Rotate it with `wrangler secret put
  PRESENTER_KEY` (see the README).
- The deck is at <https://flow-state.mschrenk.workers.dev/deck/> (since
  2026-09-29), so any machine with a browser can present it. Keep a local
  `docs/deck/deck.html` as the fallback if the venue's network is poor. It
  falls back to system fonts offline. A change that only touches the deck
  deploys the Worker too, but it does not change the session rules version,
  so players mid-session are not refused.
- Attendees can play on **laptops or phones**, held upright. The phone layout was
  tried on a real phone on 2026-09-27. A laptop still shows the whole board at
  once, which makes the debrief easier to follow.
- Start the session at `?present` no more than an hour or two ahead. It takes
  players for four hours.

## Winning

*Added 2026-09-28.* The session is winnable and free play is not. In a session,
work arrives four items a day rather than five, and a player **keeps up** if 10
or fewer items are unfinished (waiting or in flight) when the clock stops. The
HUD shows *Unfinished* against that line the whole game, and the end screen says
which side of it the player landed. The leaderboard still ranks by score, so
among the players who kept up it ranks on quality. Keeping up takes relieving
Review: moving a person there, backfilling with agents and retuning wins on
every seed measured, and leaving Review alone loses on every one
([HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §10).

## What the debrief cites from this repo

The room plays the session, so these are the session's numbers (four items a
day, 12 seeds × 4000 ticks, HIRING_AND_ATTENTION §10). The free-play figures
the deck used before 2026-09-28 are in brackets. The `wip` and `agents` slides
carry these, with the free-play figures in their speaker notes. With less work arriving, the
best line ships only so much more, and its gain shows up as lead time.

- WIP: 0.4× ships 39% more at 39% lower lead time than 1× (was 43% and 26%).
- Agents: +8 with nobody moved to Review, −14% (−13%); one person moved to
  Review plus four agents, +13% shipped (+35%) and lead time from 38h to 13h;
  two implementers moved with no backfill, −28% (−27%).
- Measured 2026-09-28 for the deck review, same harness and seeds (the
  starting-team rows reproduce §10 exactly). They back three lines on the `wip`
  and `agents` slides that §10's table does not carry:
  - WIP at 0.2× and 0.3× ships 134 and 135, against 168 at 0.4× and 121
    untouched, so it gives back about 70% of the gain.
  - Doubling WIP from the starting limits takes rebases from 14 a run to 71
    while rework stays flat (63, 62). What grows is stale work, not rework.
    The notes said "more than doubles rework" until this check.
  - One person moved to Review, then agents at Implement, at 0.75×: 193, 197,
    193, 193 shipped at 2 to 5 agents, 172 at 6, 79 at 8. So "past about four
    agents it turns down again" holds.
- Agent review and the defect classes (GAME_DESIGN §4.6). This is **not built
  yet** (M5), and the deck says so.

## Still to fill in

The deck has bracketed placeholders: your name, event and date on `cover`, your
name and contact on `close`, the session code on `join` (the presenter tab
shows it), and the `mine` slide, which is for your own team's experience this
year. The notes on `changed` and `amazon` each have one bracketed note to act
on. The deployed URL is already in (checked 2026-09-28).
