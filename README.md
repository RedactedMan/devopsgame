# Flow State *(working title)*

A web-based, real-time pipeline simulation game that teaches the practices of DevOps
and lean flow — built for the era of AI agents.

You lay out a software delivery pipeline, staff it with humans and AI agents, and
discover the hard way that throughput is not a capacity problem. Unfinished work
decays against a moving trunk: the more you start, the less you finish.

*Satisfactory, but the widgets rot on the conveyor belt.*

## Status

**M0 — playtest build.** A fixed five-station pipeline, rectangles and text, drift
implemented and visible. No building mode, no campaign, no art.

M0 is not finished until an unbriefed playtester over-fills WIP, gets measurably
worse results, and can explain *why* without being told. The mechanical half of
that is asserted in `packages/sim/test/flow.test.ts`; the human half is the gate.

- [Game Design Document](docs/GAME_DESIGN.md) — mechanics, campaign, pedagogy
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) — architecture, milestones, testing

## Running it

```sh
pnpm install
pnpm dev        # the playtest build
pnpm test       # unit, invariant, and golden-replay tests
pnpm typecheck
pnpm sweep      # headless balance sweep across WIP settings
```

`pnpm sweep` prints the lesson as a table — throughput and lead time against WIP,
averaged over a dozen seeds. Same capacity in every row; only the WIP limits move:

```
 wip×  shipped  lead(t)   rework   rebase      wip  backlog  quality
 0.75      165      707       54        1      7.8       81     0.94
    1      165      708       59        1      9.1       74     0.92
  1.5      132      932       65        7     13.0      113     0.89
    2      115      950       67       16     17.0      118     0.87
    3      102      942       68       45     24.9      128     0.87
    4      101      923       62       88     32.7      117     0.87
```

Tightening the line ships 60% more work at two-thirds the lead time. Loosening it
past a point stops helping at all — there is an optimum, not a monotone slope.

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
