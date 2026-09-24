# Flow State *(working title)*

A web-based, real-time pipeline simulation game that teaches the practices of DevOps
and lean flow — built for the era of AI agents.

You lay out a software delivery pipeline, staff it with humans and AI agents, and
discover the hard way that throughput is not a capacity problem. Unfinished work
decays against a moving trunk: the more you start, the less you finish.

*Satisfactory, but the widgets rot on the conveyor belt.*

## Status

**M1 in progress — the constraint moves.** A fixed five-station pipeline,
rectangles and text, drift implemented and visible. On top of M0's WIP sliders,
the line now has a *roster*: workers stand at stations, the sim reports rolling
utilisation, it names the bottleneck out loud, and the player can move people to
it. Drift's other half is on the screen too — items show which areas of the
codebase they touch, and the board shows which of those areas are crowded. No
building mode, no campaign, no art.

M0's gate was that an unbriefed playtester over-fills WIP, gets measurably worse
results, and can explain *why* without being told. The mechanical half is
asserted in `packages/sim/test/flow.test.ts`; the human half was played on
2026-09-01 and passed. The design is sound enough to build on, which is the only
question M0 existed to answer.

M1's headline is the moving constraint: capacity and WIP policy are coupled
levers, and neither is solvable alone. It is being built in slices, each
playable on its own:

1. **The moving constraint** — built. The roster, `assignWorker`, rolling
   utilisation, and the bottleneck named on the board.
2. **Area-collision legibility** — built. The overlap term is 46% of drift at
   default WIP and had no representation on screen. Now every item carries a
   chip per area it touches, the board has a contention strip, hovering an item
   dims everything it is *not* fighting, and the stale list names the cause
   beside the fact.
3. **Hire and the attention pool** — built. Human vs. agent workers, and the
   scarcity that bounds them. Measured before building, and the measurement
   moved the plan for the fourth time on this project: the sim already bounds
   hiring on its own, so the pool is there to price the *human* hire, which is
   the only one that can touch the constraint. Eight agents nobody can review
   are worth **−12%**; the same eight after one human hire are worth **+25%**;
   the best board position is two humans and four agents. A ratio, not a
   maximum of either. Its playtest gate — *can someone told nothing about
   worker kinds work out why their agents are doing nothing?* — has not been
   run yet.

   **Since 2026-09-23 the team is fixed**: people are moved, not hired, and a
   moved person spends two shifts onboarding. Agents are the only addition.
   Moving one person to Review plus one agent ships exactly what the human hire
   did. See [HIRING_AND_ATTENTION.md](docs/HIRING_AND_ATTENTION.md) §8.
4. **Save / load** from the command log.
5. **Board building and placement.**

- [Game Design Document](docs/GAME_DESIGN.md) — mechanics, campaign, pedagogy
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) — architecture, milestones, testing
- [The Moving Constraint](docs/CONSTRAINT_AND_CAPACITY.md) — M1's headline mechanic, measured
- [Dispatch and Area Collisions](docs/DISPATCH_AND_COLLISIONS.md) — what M1 gets, and what waits for M2
- [Hiring and the Attention Pool](docs/HIRING_AND_ATTENTION.md) — why 64 extra workers are worth 2% and one is worth 27%

## Running it

```sh
pnpm install
pnpm dev        # the playtest build
pnpm test       # unit, invariant, and golden-replay tests (~2s)
pnpm test:e2e   # Playwright smoke test: load it, play it, fail on console noise
pnpm typecheck
pnpm sweep      # headless balance sweep: WIP settings, then staffing
```

`pnpm test:e2e` uses the Chrome already on your machine (`channel: 'chrome'`)
rather than downloading its own, and starts the dev server itself. It exists
because the unit suite structurally cannot see the renderer: the worst bug in M0
so far — StrictMode tearing down the Pixi application mid-`init()`, taking the
whole React tree with it — passed every unit test and was only ever caught by
driving a real browser.

`pnpm sweep` prints the lesson as a table — throughput and lead time against WIP,
averaged over a dozen seeds. Same capacity in every row; only the WIP limits move.
**`1` is the setting the game starts you on**, so every other row is a move a
player could make on the sliders:

```
 wip×  shipped  lead(t)   oldest   rework   rebase      wip  backlog  quality
  0.2      133      925     1844       31        0      4.8      111     0.97
  0.3      134      917     1878       31        0      4.6      104     0.97
  0.4      165      707     1454       54        1      7.8       81     0.94
  0.5      165      708     1533       59        1      9.1       74     0.92
 0.75      132      932     2204       65        7     13.0      113     0.89
    1      115      950     2464       67       16     17.0      118     0.87
  1.5      102      942     2889       68       45     24.9      128     0.87
    2      101      923     2976       62       88     32.7      117     0.87
    3      102      863     3311       59      176     48.5      100     0.88
```

Tightening the line to 0.4× ships **43% more work at 26% lower lead time**, with
nobody working faster and nobody added. Loosening it never helps. But there is a
floor as well as a ceiling: at 0.2–0.3× the line starves and gives most of it
back, so the lesson is *there is a right amount of WIP and it is lower than you
think*, not *lower is always better*.

`oldest` is the age of the oldest item still open, and it is in the table for the
same reason it is on the HUD. Lead time averages only what *shipped*, so a line
that has stopped shipping reports a flattering number and keeps reporting it —
read row 3 against row 9 and note that `lead(t)` barely moves while `oldest`
more than doubles. A metric that improves as the system dies is the game's thesis,
so it is not allowed to go unlabelled in the project's own README.

The second table is the other lever. Same nine people in every row — one of them
just stands somewhere else:

```
                  move  shipped       Δ%  lead(t)   oldest      wip
      implement → spec      163     -1.2      704     1560      7.5
    implement → review      179      8.9      585     1232      7.3
        implement → ci      163     -1.1      771     1503      7.6
    implement → deploy      163     -1.1      771     1503      7.6
             ci → spec      166      1.0      666     1455      7.5
        ci → implement      166      0.5      705     1455      7.9
           ci → review      184     11.7      508     1137      7.7
           ci → deploy      165      0.4      707     1488      7.6
```

Review is the constraint. Moving one person to it is worth **+11.7%**; moving
one anywhere else is worth between **−1.2% and +1.0%**. That ratio is the Theory
of Constraints, and it was measured rather than designed — the mechanic was
already in the sim and had no way of reaching the screen. Note also *where* the
worker comes from: CI has slack to donate and Implement does not, so the same
destination pays 11.7% or 8.9% depending on who you take.

What the table cannot show is the part that makes it a game rather than a lookup:
a second move to Review gives most of the gain back, and after the first move the
WIP sliders want retuning — which is worth more than moving anyone else at all.

Finding the constraint is the skill, so the game does not hand it over cheaply
and it does not lie about it. The panel says "Finding the constraint…" for the
first ten sim-days and names nothing until one station has held the lead for two
shifts. That is not caution for its own sake: built the obvious way, the board
announces the bottleneck *moving* three times in the first minute — a line that
is still filling has a bottleneck that walks downstream, and two saturated
stations trade places on noise. Measured over 122 runs, the current rule reports
the constraint correctly on every one and reports zero moves, which is the right
answer for a line nobody touched.

## How it is built

The simulation is a pure, deterministic, headless function; everything else is a
view of it. `packages/sim` touches no DOM, no timers, no `Math.random`, and no
`Date.now`. That buys invariant tests, balance sweeps, kilobyte save files, and
bug reports that reproduce exactly — see the [implementation plan](docs/IMPLEMENTATION_PLAN.md)
for why each of those is load-bearing.

| Package | What it is |
|---|---|
| `packages/sim` | The tick function, the systems, and the types. Pure. |
| `packages/content` | Stations and tuning, as zod-validated data |
| `packages/headless` | Balance sweeps with no browser involved |
| `apps/web` | PixiJS board, React HUD, and the bridge between them |

## License

MIT — see [LICENSE](LICENSE).
