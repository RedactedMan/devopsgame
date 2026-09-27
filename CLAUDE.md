# Flow State

A game about DevOps flow: WIP, drift, the moving constraint, and attention as
the scarce currency once agents are cheap. Its target use is a 30–45 minute
workshop that ends on a leaderboard. The docs in `docs/` are the design record,
and the README is the front door.

## Every merge to `main` is a production deploy

Cloudflare Workers Builds deploys each push to `main` to
<https://flow-state.mschrenk.workers.dev>. It reports as the *Workers Builds:
flow-state* check on the commit. `pnpm deploy` is a manual fallback, not the
path. Work on a branch and open a PR. Don't push to `main` directly, and don't
merge on the user's behalf unless asked.

## Keep the docs true in the same change

The docs have drifted before. They said nothing was deployed while it had been
live all day, a merged branch was still listed as unmerged, and the talk's
checklist said phones weren't supported after the phone layout shipped. A stale
doc is the game saying something it doesn't know (plan §6), so treat it as a
bug.

Before calling any change done, check these and update what it made false, in
the same branch:

| When you change… | Update |
|---|---|
| A slice's state: built, merged, deployed, played, tried on a phone | `docs/IMPLEMENTATION_PLAN.md` §4 slice table, the *State* column. Say where it lives (merged / deployed), not the branch name, once it's merged. |
| How or where it deploys, the URL, secrets, the plan tier | `README.md` *Running it*, `docs/IMPLEMENTATION_PLAN.md` §7, `docs/PRESENTATION.md` *Before the session* |
| Tuning, sim mechanics, or anything that moves a swept number | The doc that records that number (`HIRING_AND_ATTENTION.md`, `CONSTRAINT_AND_CAPACITY.md`, `DISPATCH_AND_COLLISIONS.md`), the README sweep tables, and `PRESENTATION.md` *What the debrief cites*. Re-run `pnpm sweep` rather than editing numbers by hand. |
| `SESSION_TICKS`, sim speed, or ticks per day | The run-length table in `docs/PRESENTATION.md`, and tell the user the deck's `agenda` and `play` slides need the same change (the deck is an artifact, not in this repo) |
| Golden replay hashes | Record the before and after hashes and the reason, in the style of `HIRING_AND_ATTENTION.md` §8 |
| A design decision, or a reversal of one | The design doc that owns it, with the date and why. Don't silently delete the old reasoning. |
| Device support, or what a player needs to bring | `docs/PRESENTATION.md` *Before the session* |

Rules:

- **Verify before you write it down.** Check the facts at their source: the
  *Workers Builds* check run, `curl` against the live URL, `gh pr list`, the
  test output. Docs record what is true, not what was intended.
- **Date state changes** (`2026-09-27`), not "recently" or "now".
- **If a doc and the code disagree, say so** and fix the doc in the PR. Don't
  pick one quietly.
- **Match the docs' voice:** plain, specific, the reason next to the fact, and
  measured numbers with where they came from.

## Working method

The project's own rules are in `docs/IMPLEMENTATION_PLAN.md` §6: trunk-based,
sim before renderer, tuning in `content/tuning.ts`, measure before building, and
take a screenshot before calling a slice done.

```sh
pnpm test        # unit, invariant, golden replay
pnpm typecheck
pnpm test:e2e    # Playwright; starts the dev servers itself
pnpm sweep       # headless balance sweep
```
