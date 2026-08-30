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

### M0 — Prove the core loop *(the gate)*

**No building mode. No campaign. No art.** A fixed five-station pipeline, rectangles and text.

- Tick loop, seeded RNG, items flowing
- Adjustable WIP limits
- **Drift implemented and visible** — items visibly age and redden; STALE forces rebase/restart/ship
- Lead time + throughput chart

**Acceptance criteria — the project's real go/no-go:**
> An unbriefed playtester over-fills WIP, gets measurably worse results, and can explain *why* without being told.

If that fails, the design is wrong and no amount of Pixi will save it. Fix the design before writing another line.

### M1 — Agency
Board building and placement · worker assignment (human vs. agent) · the attention pool · context decay · save/load via command log.

### M2 — Feedback
CI station with coverage/speed dials · **defect classes** · defect injection and escapes · production incidents and preemption · **DORA dashboard** (reading displayed quality only) · the money/revenue loop.

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
| **Sweeps** | 10k headless runs; assert the *shape* of results, not point values. Three lessons are asserted as tests: **lower WIP beats higher WIP** at fixed capacity; **a high agent-review share raises escaped defects while displayed quality stays flat**; and **money cannot substitute for attention** — a run with unlimited budget and fixed attention plateaus. If the sim stops teaching a lesson, the build fails |
| **Smoke** | One Playwright run: load, play 60 seconds, no console errors |

Keep the full suite under 60 seconds. If it gets slow, that's an Act II lesson arriving in real life.

---

## 6. Working method

- **Trunk-based.** Short-lived branches. You are about to learn viscerally why.
- **Limit your own WIP.** One milestone at a time; one agent task in flight per area of the codebase. `packages/sim/systems/` is deliberately split so parallel agent work touches disjoint files — that is `touchedAreas` collision avoidance, applied to your own repo.
- **Sim before renderer, always.** A mechanic that isn't in the sim with a test isn't real.
- **Tuning lives in data, not code.** Every number in `content/tuning.ts`, so sweeps can vary it and you can rebalance without a rebuild.
- **Dogfood the metrics.** Track your own lead time from idea to deployed build. Put it in the README. It is the most credible marketing this project could have.

---

## 7. Deployment

Static build → Cloudflare Pages or GitHub Pages. No backend through 1.0.

**No leaderboards or async competition** — decided against for now. Determinism still earns its keep four times over without it: invariant tests, balance sweeps, kilobyte save files, and exactly-reproducing bug reports. Nothing here forecloses adding verified scores later if it ever becomes wanted.

---

## 8. First three tasks

1. Scaffold: pnpm workspace, Vite, TS strict, vitest, the package skeleton in §3.
2. `packages/sim`: `GameState`, `WorkItem`, seeded RNG, and a `step()` that moves items through a hardcoded five-station pipeline with WIP limits. Unit + invariant tests, no renderer.
3. Implement `systems/drift.ts` with tests, then the crudest possible renderer — rectangles that redden with drift. **That is M0's playtest build.**
