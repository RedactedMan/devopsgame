# The presentation

Companion to [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) §7, which is the
presentation mode this talk runs on.

**Deck:** <https://claude.ai/artifact/USk8xhe7uwjvDmVEsbfB2G> — *Code is cheap now.
Attention isn't.* 27 slides with speaker notes. Private until shared from the
deck's Share menu.

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

If these constants change, update this table and the `agenda` and `play` slides.

## Before the session

- Deploy (`pnpm deploy`) and set the presenter key. See the README.
- Attendees need **laptops**: phones get the small-screen notice until the phone
  layout exists.
- Start the session at `?present` no more than an hour or two ahead. It takes
  players for four hours.

## What the debrief cites from this repo

- WIP: 0.4× ships 43% more at 26% lower lead time (README, first sweep table).
- Agents: +8 with nobody moved to Review, −13%; one person moved to Review plus
  four agents, +35%; two implementers moved with no backfill, −27%
  ([HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §8).
- Agent review and the defect classes (GAME_DESIGN §4.6). This is **not built
  yet** (M5), and the deck says so.

## Still to fill in

The deck has bracketed placeholders: your name, event and date, the deployed URL,
and the `mine` slide, which is for your own team's experience this year.
