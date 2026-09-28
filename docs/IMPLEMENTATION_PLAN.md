# Flow State — Implementation Plan

Companion to [GAME_DESIGN.md](./GAME_DESIGN.md). Covers architecture, milestones, and working method.

---

## 1. Architectural principle

**The simulation is a pure, deterministic, headless function. Everything else is a view of it.**

```
step(state: GameState, commands: Command[], rng: Rng) → { state: GameState, events: Event[] }
```

No DOM, no timers, no `Math.random`, no `Date.now` inside `packages/sim`. Ever.

This single constraint buys four things that are otherwise very expensive to add later:

1. **Testability** — flow invariants become unit tests (work items are conserved; queues never go negative; Little's Law holds within tolerance).
2. **Balance sweeps** — run 10,000 seeded games headless in CI to tune parameters. For a simulation game this is not optional; hand-tuning a system with this many coupled feedback loops does not converge.
3. **Replay & tiny saves** — a save file is `{ seed, commandLog }`. Kilobytes. Also the bug-report format: a player sends a broken run and it reproduces exactly.
4. **Agent-friendly codebase** — pure functions with property tests are the shape AI agents work in most reliably. You will be building this partly with agents; build it in a shape they don't break.

---

## 2. Stack

Chosen: **TypeScript + Vite + PixiJS**.

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript, `strict` | Sim invariants live in the type system |
| Build | Vite | Fast HMR; static output deploys anywhere |
| Board rendering | **PixiJS v8** (WebGL/WebGPU) | Hundreds of animated items, conveyors, particles. Handles the "factory floor hums" feel that DOM cannot |
| HUD / panels / VSM | **React over DOM**, layered above the canvas | Menus, charts, and the value stream map are text-heavy and accessible. Building UI *inside* Pixi is a large, avoidable cost |
| Charts | Lightweight SVG, hand-rolled or `visx` | Only need line + stacked bar |
| State bridge | Sim owns truth; React subscribes to snapshots | See §3 |
| Data validation | `zod` on all content files | Levels and tuning are data; catch authoring errors at load |
| Tests | `vitest` | Unit, property, and golden-replay |
| Audio | `howler` | Deferred to M5 |

> **The Pixi/React split is the key call.** Pixi does the board — the part that must feel alive. React does everything with words in it. They communicate only through the sim's snapshot stream. Resist drawing UI in Pixi and resist animating items in DOM.

---

## 3. Package layout

```
flow-state/
├─ packages/
│  ├─ sim/                 # PURE. no browser APIs, no I/O
│  │  ├─ state.ts          # GameState, WorkItem, Station, Worker types
│  │  ├─ step.ts           # the tick function
│  │  ├─ systems/          # one file per rule cluster
│  │  │   ├─ routing.ts        # pull, WIP limits, queue admission
│  │  │   ├─ service.ts        # station work, service time distributions
│  │  │   ├─ drift.ts          # ★ WIP decay, staleness, rebase/restart
│  │  │   ├─ staffing.ts       # ★ the roster, utilisation, constraint detection
│  │  │   ├─ context.ts        # ★ agent context fidelity decay
│  │  │   ├─ quality.ts        # defect classes, injection, CI catch rates, escapes
│  │  │   ├─ review.ts         # ★ review provenance, true vs. displayed quality
│  │  │   ├─ economy.ts        # money, revenue settlement, purchasing
│  │  │   ├─ incidents.ts      # production failures, preemption, MTTR
│  │  │   ├─ attention.ts      # the per-shift judgment budget
│  │  │   ├─ failure.ts        # level fail conditions, danger states, fail-fast triggers
│  │  │   └─ metrics.ts        # DORA, flow efficiency, VSM aggregation
│  │  ├─ rng.ts            # seeded PRNG (mulberry32), serializable state
│  │  └─ commands.ts       # the player's entire action vocabulary
│  ├─ content/             # levels, stations, kaizen tree, tuning — data, zod-validated
│  └─ headless/            # CLI: batch sweeps, balance reports, CI regression
└─ apps/
   └─ web/
      ├─ render/           # PixiJS scene graph, sprite pools, interpolation
      ├─ ui/               # React HUD, VSM overlay, dashboards, codex
      └─ bridge/           # command dispatch + snapshot subscription
```

### The bridge contract

- The UI **never mutates sim state**. It dispatches `Command` objects into a queue.
- Commands are consumed **at tick boundaries only** — this is what keeps replays exact.
- The renderer reads immutable snapshots and **interpolates between ticks** for smooth motion. Sim runs at a fixed 10 ticks/sim-hour; rendering runs at 60fps. Decoupled.
- Every player action is a command. If it isn't a command, it isn't in the replay, and it isn't real.

### The one architectural rule the design imposes

`GameState` carries **two quality values per work item: `trueQuality` and `displayedQuality`** (design §4.6). The snapshot the UI subscribes to must expose *only* `displayedQuality`. `trueQuality` is readable by the sim and by the failure/postmortem screens, never by the live HUD.

Enforce it in the type system: the snapshot type omits the field, so a renderer that wants it cannot compile. This is the kind of invariant that erodes silently during a late-night feature push — and if it erodes, the game's central lesson about untrustworthy metrics quietly stops working while every test still passes.

---

## 4. Milestones

Each milestone ends in something playable. Small batches — the plan practices what the game teaches, and that is not a joke: a 4-month big-design-up-front build of a game about small batches would be the funniest possible failure.

### M0 — Prove the core loop *(the gate)* — **passed, 2026-09-01**

**No building mode. No campaign. No art.** A fixed five-station pipeline, rectangles and text.

- Tick loop, seeded RNG, items flowing
- Adjustable WIP limits
- **Drift implemented and visible** — items visibly age and redden; STALE forces rebase/restart/ship
- Lead time + throughput chart

**Acceptance criteria — the project's real go/no-go:**
> An unbriefed playtester over-fills WIP, gets measurably worse results, and can explain *why* without being told.

If that fails, the design is wrong and no amount of Pixi will save it. Fix the design before writing another line.

**Result: passed.** The design is sound enough to build on. Two things were fixed on the way to it, both found by playing rather than by testing, and both worth remembering as a pattern: the board could not distinguish a *blocked* station from a *busy* one, and the dashboard's lead time — averaging only what shipped — improved as the line died. Neither was a simulation bug. Both were the game failing to say what it already knew, which is the failure mode to watch for in every milestone after this one.

### M1 — Agency *(in progress)*

**The moving constraint is the milestone's headline** — see
[CONSTRAINT_AND_CAPACITY.md](./CONSTRAINT_AND_CAPACITY.md). Staffing relocates
the bottleneck, and capacity is coupled to WIP policy: one server at the
constraint is worth +15% while one anywhere else is worth ~0%, hiring alone
plateaus after a single hire, and a player who invests without re-tuning their
WIP limits gives back 24% of the gain. Two levers, neither solvable alone, and
the optimum moves because of what the player did rather than because of dice.

M1 is being built in slices rather than as one drop, because the milestone is
large enough that a single branch would be the thing this project keeps warning
about. Each slice is playable on its own.

| # | Slice | State |
|---|---|---|
| 1 | **The moving constraint** — the roster as first-class state, `assignWorker`, rolling utilisation, the constraint named on the board and in the panel, the policy-constraint case | **built**, merged to `main` |
| 2 | **Area-collision legibility** — see [DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md) §4. `overlap` cached on the item, area chips, the contention strip, hover-to-see-who-you-are-fighting, and the cause beside the fact in the stale list | **built and played**, 2026-09-05 |
| 3 | **Hire, and the attention pool** — see [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md). `hire`, agents barred from Review, and attention as a per-shift judgment budget. Measured first, and the measurement moved the plan again (§3) | **built**, merged and deployed — acceptance §6, not yet played |
| 3a | **Supply curve to a power law** — the quadratic coordination term did not survive a literature check; `perHuman · H^α − perAgent · A`, α = 0.7. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §5, *Checked against the literature*. The sweep moved the decision once more: anchored at nine people rather than thirteen, because the agent lessons live at nine and ten and the first anchor broke them. Golden hashes did not move, and the doc says why. Reopens the "hire people everywhere" hole knowingly, pending M2 | **built**, 2026-09-20 — slice 3's acceptance play is now unblocked |
| 3c | **A fixed team** — people are no longer hired; `hire` adds agents only, and a moved person onboards (slower, drawing attention) for two shifts. Moving one person to Review plus one agent reproduces the old human hire exactly, and target 3 still holds. Onboarding is kept deliberately mild (decided 2026-09-23): a small visible cost, not a deterrent to moving people back and forth, so it never competes with the move-and-backfill lesson. Driven by the game's target use, a 30–45 minute group session with a leaderboard. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §8 | **built**, merged and deployed — not yet played in a room |
| 3d | **Presentation mode** — one seed and one length (4000 ticks) for the whole room, a live leaderboard, and a debrief of any player's run. The presenter opens `?present`, players join at `?join=CODE`. Score is quality-weighted shipped: every shipped item counts for the `trueQuality` it shipped at, so shipping stale work pays less than rebasing it. The Worker verifies every score by replaying it. See §7 | **built**, deployed 2026-09-27 at <https://flow-state.mschrenk.workers.dev>, presenter key set — not yet played in a room |
| 3e | **Phone layout** — a room joins from the QR code on phones, and the game was laptop-only. Below 1000px the screen stacks: a two-row top bar (day, shipped, WIP, attention, and the controls), the board, a status line, and the panel as tabs (WIP, Team, Stale with a count badge, Flow). The status line carries the constraint headline and the stall alarm, so the news the panel leads with is never hidden behind the wrong tab. The board keeps its columns and picks a compact drawing when a column is narrower than 110px: short names, `occupancy/limit`, id-only tiles with two area chips, and the rows it has room for. A column still grows with its WIP limit, because that is the lesson. Considered and rejected: horizontal lanes, because they would turn that growth into length. Tapping an item shows what it is fighting. A phone held sideways is asked to turn upright rather than getting a third layout. Replaces the small-screen stopgap from PR #3, and fixes the phone laying the page out wider than the screen | **built**, deployed, and tried on a real phone 2026-09-27 |
| 3b | **Context decay** — split out of slice 3, which already had three mechanics and this one had no measurement behind it. Agent output waiting for Review loses context, and Review pays to rebuild it in attention: free for a shift, then 4 per shift, capped at 4. Measured first, and the measurement moved the mechanic: no charge without a grace could reach the player ignoring their agents without hitting the one who had backfilled properly. Five agents and nothing else go from +2.6% to −5% at the starting sliders; every cited number and both golden hashes hold, and a third golden pins it. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §7 | **built** 2026-09-27, in review on branch `m1/context-decay`, not merged — not yet played |
| 4 | **Save / load** from the command log — already a complete save file by construction; nothing but plumbing and a file picker | planned |
| 5 | **Board building and placement** — the last of M1's original scope, and the only part that changes the shape of the pipeline rather than what runs through it | planned |

Slice 1 notes, for whoever picks this up:

- A station no longer stores a `servers` count. Its capacity **is** the set of
  workers standing at it, and a `ServiceSlot` records which one is working. Two
  sources of truth for capacity would have diverged the first time a worker
  moved, and the slot binding is the hook that context decay (slice 3) and agent
  review (M5) both hang off. *(Slice 3b used it only to learn whose output a
  finished item is. Decay itself happens off the slot, while the output waits.)*
- **`hire` is deliberately not in slice 1.** A head-count currency invented
  before the economy exists is one that gets deleted when money lands in M2, and
  the spec's own argument is that reassignment is what makes diagnosis the
  valuable skill. The cost of deferring it is real and recorded: the zero-sum
  move reproduces three of the four balance targets with room to spare and the
  fourth — *the WIP optimum moves* — only weakly, because total capacity did not
  grow. That target is the reason slice 3 exists.
- Measured before built, per §6, and the measurement changed the plan for the
  third time on this project (see
  [CONSTRAINT_AND_CAPACITY.md](./CONSTRAINT_AND_CAPACITY.md) §8).

### M2 — Feedback
CI station with coverage/speed dials · **defect classes** · defect injection and escapes · production incidents and preemption · **DORA dashboard** (reading displayed quality only) · the money/revenue loop · **dispatch as a player decision** (see [DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md) §5 — gated on item value and deadlines, which is why it is here and not in M1).

### M3 — Diagnosis
**VSM overlay** (freeze-frame, touch vs. wait, %C/A, flow efficiency) · tutorial · Act I's five levels · objective and scoring framework · **hard-fail conditions, danger states, and the VSM-as-failure-screen** · instant same-seed restart.

Hard fail lands here rather than later because failure legibility is a *design* problem, not a polish problem. Build it while there is still time to discover that a fail condition is unteachable.

### M4 — Depth
Kaizen tree · Acts II and III · morale · codex with Handbook citations · headless balance sweeps wired into CI.

### M5 — The point
**Act IV: agents.** Fleet management, **agent review and the true/displayed quality divergence**, attention economics, context rot, the Trunk endgame. Then audio, art pass, onboarding polish, and public release.

Ship M0–M3 publicly and gather feedback before committing to M4–M5. The campaign is the expensive part; do not author it against an unvalidated sim.

---

## 5. Testing

Fitting for the subject, the test strategy is the same lesson: **fast feedback beats thorough feedback**.

| Layer | What it checks |
|---|---|
| **Unit** | Each system in isolation — drift math, attention accounting, defect probability |
| **Invariant / property** | Work items conserved (nothing vanishes or duplicates) · queues never negative · attention never below zero · Little's Law holds within tolerance across random runs |
| **Golden replay** | `{ seed, commandLog } → hash(final metrics)`. Catches unintended balance changes instantly. **The most valuable test type here** — it makes an entire simulation refactor safe |
| **Sweeps** | Headless runs; assert the *shape* of results, not point values. Four lessons are asserted as tests: **lower WIP beats higher WIP** at fixed capacity *(built, `flow.test.ts`)*; **a worker at the constraint is worth many anywhere else, a second one is worth nothing, and retuning beats both** *(built, `staffing.test.ts`)*; **a high agent-review share raises escaped defects while displayed quality stays flat** *(M5)*; and **money cannot substitute for attention** — a run with unlimited budget and fixed attention plateaus *(M1 slice 3 / M2)*. If the sim stops teaching a lesson, the build fails |
| **Smoke** | Playwright against a real browser: load, play, no console errors — plus one assertion per mechanic the unit suite structurally cannot see. Slower than everything else combined and worth it; it has caught three bugs that were green in every unit test |

Keep the full suite under 60 seconds. If it gets slow, that's an Act II lesson arriving in real life.

---

## 6. Working method

- **Trunk-based.** Short-lived branches. You are about to learn viscerally why.
- **Limit your own WIP.** One milestone at a time; one agent task in flight per area of the codebase. `packages/sim/systems/` is deliberately split so parallel agent work touches disjoint files — that is `touchedAreas` collision avoidance, applied to your own repo.
- **Sim before renderer, always.** A mechanic that isn't in the sim with a test isn't real.
- **Then look at it.** Three times now — twice in M0, once in M1 slice 1 — the
  defect that mattered was the game *saying* something it did not know, with a
  full green suite. Tests cannot see that. A screenshot can. Take one before
  calling a slice done.
- **Tuning lives in data, not code.** Every number in `content/tuning.ts`, so sweeps can vary it and you can rebalance without a rebuild.
- **Dogfood the metrics.** Track your own lead time from idea to deployed build. Put it in the README. It is the most credible marketing this project could have.

---

## 7. Deployment

One Cloudflare Worker (`apps/server`) serves both halves: the static build from `apps/web/dist` through the assets binding, and the presentation-mode leaderboard at `/api/*`. The game itself still needs no backend. Free play is fully static.

**Live at <https://flow-state.mschrenk.workers.dev> since 2026-09-27, and every push to `main` deploys.** Cloudflare Workers Builds is connected to the GitHub repository. It builds each commit on `main` and deploys it, and it reports as the *Workers Builds: flow-state* check on the commit. Merging is shipping. That is trunk-based delivery with continuous deployment, which is what the game teaches, and it means a PR is not done until it is fit to be in front of a room. `pnpm deploy` builds and runs `wrangler deploy` by hand. It is a fallback, not the path.

**Leaderboards: yes, for a session in a room. Still no global ladder.** *Changed 2026-09-23.* The game's target use became a 30–45 minute workshop that ends on a leaderboard (HIRING_AND_ATTENTION §8), so presentation mode has one: a Durable Object per session code, holding each player's best run. A submitted score is never trusted. The Worker re-plays `{ seed, commands }` with `@flow/sim` and ranks what the replay produces. That takes 40–70 ms of CPU for a real run and under a second for the worst log the parser accepts, which **needs the Workers paid plan**, because the free plan's 10 ms CPU limit cannot replay a game.

Paid-plan CPU is billed with no hard cap, so the replay is closed to strangers. *Added 2026-09-27.* Starting a session needs the presenter key, a Worker secret (`wrangler secret put PRESENTER_KEY`), and with none set nobody can start one. A session takes players and runs for four hours, then refuses both before any replay. Its board stays readable for a week, after which the session deletes itself. Before this, anyone could create a session and submit the most expensive command log the parser accepts (~0.65 s of CPU each), which at 100 requests a second is about $110 a day. Per-IP rate limiting and a smaller command cap were considered and left out. With the key and the window, what's left exposed is a code on a projector for a few hours.

---

## 8. First three tasks

1. Scaffold: pnpm workspace, Vite, TS strict, vitest, the package skeleton in §3.
2. `packages/sim`: `GameState`, `WorkItem`, seeded RNG, and a `step()` that moves items through a hardcoded five-station pipeline with WIP limits. Unit + invariant tests, no renderer.
3. Implement `systems/drift.ts` with tests, then the crudest possible renderer — rectangles that redden with drift. **That is M0's playtest build.**
