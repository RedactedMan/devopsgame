# Flow State — Implementation Plan

Companion to [GAME_DESIGN.md](./GAME_DESIGN.md). Covers architecture, milestones, and working method.

**Complete, 2026-10-06.** The name is final: *Flow State*. The project is finished for now, and no further work is planned. The live site stays up as free play, on the Workers free plan. M1 is the last milestone. The slice table in §4 records where each slice was left.

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
3. **Replay & tiny saves** — a save file is `{ seed, commandLog }`. Kilobytes. Also the bug-report format: a player sends a broken run and it reproduces exactly. *(2026-09-27: true of the run, not of the file. A save also has to say which rules it was played under, because a replay runs against whatever rules are live. See §3, *Saves and the rules they were played under*.)*
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

### Saves and the rules they were played under

*Decided 2026-09-27, with save and load (M1 slice 4).*

A save is `{ seed, tick, commands }`, and replaying the commands from the seed
for `tick` steps rebuilds the whole state, not just what the fingerprint hashes
(`save.test.ts` compares the JSON of both). That half of the slice was as small
as the plan said.

The other half was not. A replay runs against whatever tuning and sim code are
live, so a save made before a change loads into a different game and nothing
in the log says so. Neither a tuning hash nor a version number is enough by
itself, and a measurement showed why. Five agents and nothing else (the
`IGNORED` golden), replayed with and without slice 3b's context decay:

| Replayed to tick | With decay | Without | Whole state equal? |
|---|---|---|---|
| 100, 300, 800 | same fingerprint | same fingerprint | yes |
| 1500 | `e97ce11e` | `87dcabe9` | no |

A save made at tick 800 before 3b would have replayed to exactly where it was,
and then played on under different rules. So checking the position cannot tell
the rules changed, and checking a rules stamp cannot tell whether the player's
own run changed. A save carries both:

- **`rules`**, `RULES_VERSION` from `packages/sim/src/rules.ts`. A test hashes
  the default tuning and the three golden fingerprints and compares the result
  to a recorded `RULES_PROBE`, so a change that moves either fails the build
  until the version is bumped. A version bumped from memory gets forgotten, and
  a build id would change on every docs-only deploy. The blind spot is the
  goldens' blind spot: a code change no golden run exercises.
- **`check`**: the fingerprint, shipped count and average quality at the save
  tick. A load replays and compares, which catches that blind spot whenever the
  change reaches the saved part of the run, and gives the player then-and-now
  numbers instead of "something changed".

A mismatched save **loads anyway and says so**: under new rules with the run
intact, or under rules that replay the decisions somewhere else, with the
numbers. Refusing would leave the player nothing, because a deploy replaces the
old build and there is nowhere left to play the old rules. A load is refused
only when the file is not a save this build can read. The build commit and the
date are in the file too, but only for the message.

Save and load were **free play only** while presentation mode existed. A
session is one game played once by the whole room, the server already kept its
runs, and a save would have let a player try a branch from mid-run and go back.
Since presentation mode was retired (2026-10-06, §7), free play is all there is.

**Session scores had the same problem** *(retired with presentation mode on
2026-10-06, §7: the Worker, the 409, and the e2e test that pinned it are gone.
Kept as the record.)* (found 2026-09-27, fixed
2026-09-28). A tab opened before a deploy keeps playing the old rules for the
whole session window (24 hours since 2026-09-29), while the Worker replays the run under the new ones.
The end screen showed the local score and then the server's rank without
comparing the two, so the player saw one number and the board ranked another.

The fix: a session page sends `SESSION_RULES_VERSION` (not `RULES_VERSION`,
because the session plays its own tuning and win line, see `rules.ts`) with
its join and with its run. The Worker refuses a mismatch with 409 before it
replays anything, and the page says the game was updated and offers a reload.
A page that sends no version predates the check, so it is stale by definition.
Refusing is the only honest answer, because the deploy removed the old rules
and nothing is left that could replay them. The e2e suite pins it (*a page
playing other rules is told to reload, not scored*).

It turns a wrong score into a lost run, and nothing more. A player
mid-game when the deploy lands still loses that run, so the advice not to
deploy during a session stands (PRESENTATION.md *Before the session*). Runs
already on a board are not replayed again, and the debrief's timeline only
lists commands, so neither is affected.

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

### M1 — Agency *(built 2026-09-28, board building removed from scope)*

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

Board building and placement, the first item on M1's original list, was taken
out on 2026-09-28 (slice 5 below). The pipeline stays the fixed five stations.

| # | Slice | State |
|---|---|---|
| 1 | **The moving constraint** — the roster as first-class state, `assignWorker`, rolling utilisation, the constraint named on the board and in the panel, the policy-constraint case | **built**, merged to `main` |
| 2 | **Area-collision legibility** — see [DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md) §4. `overlap` cached on the item, area chips, the contention strip, hover-to-see-who-you-are-fighting, and the cause beside the fact in the stale list | **built and played**, 2026-09-05 |
| 3 | **Hire, and the attention pool** — see [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md). `hire`, agents barred from Review, and attention as a per-shift judgment budget. Measured first, and the measurement moved the plan again (§3) | **built**, merged and deployed — acceptance §6, not yet played |
| 3a | **Supply curve to a power law** — the quadratic coordination term did not survive a literature check; `perHuman · H^α − perAgent · A`, α = 0.7. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §5, *Checked against the literature*. The sweep moved the decision once more: anchored at nine people rather than thirteen, because the agent lessons live at nine and ten and the first anchor broke them. Golden hashes did not move, and the doc says why. Reopens the "hire people everywhere" hole knowingly, pending M2 | **built**, 2026-09-20 — slice 3's acceptance play is now unblocked |
| 3c | **A fixed team** — people are no longer hired; `hire` adds agents only, and a moved person onboards (slower, drawing attention) for two shifts. Moving one person to Review plus one agent reproduces the old human hire exactly, and target 3 still holds. Onboarding is kept deliberately mild (decided 2026-09-23): a small visible cost, not a deterrent to moving people back and forth, so it never competes with the move-and-backfill lesson. Driven by the game's target use, a 30–45 minute group session with a leaderboard. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §8 | **built**, merged and deployed. Played in a room 2026-10-02, in session `GH59S` (see 3d) |
| 3d | **Presentation mode** — one seed and one length (4000 ticks) for the whole room, a live leaderboard, and a debrief of any player's run. The presenter opens `?present`, players join at `?join=CODE`. Score is quality-weighted shipped: every shipped item counts for the `trueQuality` it shipped at, so shipping stale work pays less than rebasing it. The Worker verifies every score by replaying it. See §7 | **built**, deployed 2026-09-27 at <https://flow-state.mschrenk.workers.dev>, presenter key set. **Played end to end 2026-09-30** on the live site: the presenter screen on a laptop, two players joined from a phone and a laptop, and both runs reached the leaderboard with their verified scores (session `DJZDY`, seed 20260830). Since 2026-10-01 a player's game opens paused behind a *Start* card, so the room can join during the talk and start together. **Played in a room 2026-10-02**, at the talk: session `GH59S`, 16 joined, 12 runs on the board, submitted 16:51–18:00 UTC. **Retired 2026-10-06** (§7): the code is removed, the board was exported first, and PR #31 merged and deployed at 2026-10-07 02:25 UTC, which ran the `v2` migration that deletes the Durable Object. Not on the live site: `/api/*` answers 410 (checked with `curl` the same night) |
| 3e | **Phone layout** — a room joins from the QR code on phones, and the game was laptop-only. Below 1000px the screen stacks: a two-row top bar (day, shipped, WIP, attention, and the controls), the board, a status line, and the panel as tabs (WIP, Team, Stale with a count badge, Flow). The status line carries the constraint headline and the stall alarm, so the news the panel leads with is never hidden behind the wrong tab. The board keeps its columns and picks a compact drawing when a column is narrower than 110px: short names, `occupancy/limit`, id-only tiles with two area chips, and the rows it has room for. A column still grows with its WIP limit, because that is the lesson. Considered and rejected: horizontal lanes, because they would turn that growth into length. Tapping an item shows what it is fighting. A phone held sideways is asked to turn upright rather than getting a third layout. Replaces the small-screen stopgap from PR #3, and fixes the phone laying the page out wider than the screen | **built**, deployed, and tried on a real phone 2026-09-27. Played a whole session run on a phone 2026-09-30 (slice 3d) |
| 3b | **Context decay** — split out of slice 3, which already had three mechanics and this one had no measurement behind it. Agent output waiting for Review loses context, and Review pays to rebuild it in attention: free for a shift, then 4 per shift, capped at 4. Measured first, and the measurement moved the mechanic: no charge without a grace could reach the player ignoring their agents without hitting the one who had backfilled properly. Five agents and nothing else go from +2.6% to −5% at the starting sliders; every cited number and both golden hashes hold, and a third golden pins it. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §7 | **built**, merged and deployed 2026-09-27 — not yet played |
| 4 | **Save / load** from the command log. The plan called it nothing but plumbing and a file picker, and for the run itself it was. It was not for versioning: a save replays under whatever rules are live, so it records `RULES_VERSION` and the fingerprint it was saved at, and a load says when either has changed. See §3, *Saves and the rules they were played under*. Free play only. The same versioning gap in session scores was found here and split into its own fix, built 2026-09-28: a session page sends its rules and the Worker refuses a mismatch with "reload" (§3) | **built** 2026-09-27, merged to `main` 2026-09-28 (PR #9), deployed 2026-09-28: the *Workers Builds* check is green on `87ccd24`, the PR #10 merge, which carries it. Checked in Playwright's phone emulation, not yet on a real phone |
| 3f | **Removing an agent, and a Rebase button that says why it will not** — found playing the deployed game on 2026-09-28. `removeAgent` takes an agent off the roster (a busy one finishes its item first); people still cannot be removed. The line that found it had fallen into the re-brief spiral, and measured from inside it the sliders are still the stronger fix (1.0 → 4.2 a day) than removing agents (→ 1.8). Rebase was being refused for want of attention 1,458 times in that run with the button still live; it now shows its cost and goes dead when the shift cannot pay. No golden moved. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §9 | **built**, merged to `main` 2026-09-28 (PR #10) and deployed 2026-09-28: the *Workers Builds* check is green on `87ccd24`, the PR #10 merge — not yet played in a room |
| 3g | **A session that can be won** — free play keeps five arrivals a day and stays unwinnable; the session plays `SESSION_TUNING` at four, and a run is won with 10 or fewer items unfinished (backlog *and* in flight, because the backlog alone can be emptied by opening the sliders). Measured at day-10 decisions over 12 seeds: every good play wins on every seed, every play that leaves Review alone loses. Its own rules version and probe, and a fourth golden that plays a whole session. The debrief's numbers were re-measured at the session's rate. See [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §10 | **built**, merged to `main` 2026-09-28 (PR #10) and deployed 2026-09-28: the *Workers Builds* check is green on `87ccd24`, the PR #10 merge. Both outcomes seen in the 2026-09-30 two-player run (slice 3d): one run kept up with 9 unfinished (171.1), one did not with 34 (161.7), and the board showed each against the line. Not yet played in a room |
| 3h | **A walkthrough** — seven steps, each pointing at what it describes: the line and drift, the win line (in a session) or what free play is, WIP limits, people and agents, attention, stale work, and the clock. It says what each lever *is* and never what to set it to, the same line the deck's `howto` slide holds. It opens by itself when a player joins a session, while the clock is still waiting for Start, and the `?` button in the top bar reopens it anywhere, free play included. It stops the clock while it talks and gives it back as it was. On a phone it opens the panel tab each step needs. Asked for 2026-10-01 after the paused session start shipped: a player joining alone had nothing in the game telling them what the screen was. Not tutorial levels; see the note below the table | **built** 2026-10-01 — not yet played |
| 5 | ~~**Board building and placement**~~ — the last of M1's original scope, and the only part that changes the shape of the pipeline rather than what runs through it | **removed** from the plan 2026-09-28. Its whole design was one line (GAME_DESIGN §3.2, "placed on a grid, connected by queues"), with nothing measured. The workshop teaches WIP, drift, the moving constraint and attention on the fixed five-station line, and playtesting the game with the talk showed those lessons land without it. Building it would have re-opened the session tuning, the win line, the goldens and every number the debrief cites. Not planned for a later milestone either |

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

> **No more levels (decided 2026-09-30).** The campaign will not be built:
> no tutorial levels, no Acts I–IV, no level-based objectives. The game is
> what is built now, free play and the workshop session, and M1 is its last
> milestone. The workshop is its use, and playtesting it with the talk showed
> the fixed line teaches WIP, drift, the moving constraint and attention
> without levels. M3, M4 and M5 are organised around authoring the campaign,
> so none of them is planned. M2's mechanics (CI, defects, DORA, money) were
> not decided separately; nothing is scheduled for them either. The
> milestones below are kept as the design record of what the full game would
> have been, not as a plan. GAME_DESIGN §5 carries the same note.
>
> *2026-10-01:* an in-game walkthrough was added (slice 3h). It is not the
> tutorial this note dropped: it explains the screen and the four levers once,
> pointing at each, and sets no objective. The workshop still teaches through
> the run and the debrief.

### M2 — Feedback
CI station with coverage/speed dials · **defect classes** · defect injection and escapes · production incidents and preemption · **DORA dashboard** (reading displayed quality only) · the money/revenue loop · **dispatch as a player decision** (see [DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md) §5 — gated on item value and deadlines, which is why it is here and not in M1).

### M3 — Diagnosis
**VSM overlay** (freeze-frame, touch vs. wait, %C/A, flow efficiency) · tutorial · Act I's five levels · objective and scoring framework · **hard-fail conditions, danger states, and the VSM-as-failure-screen** · instant same-seed restart.

Hard fail lands here rather than later because failure legibility is a *design* problem, not a polish problem. Build it while there is still time to discover that a fail condition is unteachable.

### M4 — Depth
Kaizen tree · Acts II and III · morale · codex with Handbook citations · headless balance sweeps wired into CI.

### M5 — The point
**Act IV: agents.** Fleet management, **agent review and the true/displayed quality divergence**, attention economics, context rot, the Trunk endgame. Then audio, art pass, onboarding polish, and public release.

Ship M0–M3 publicly and gather feedback before committing to M4–M5. The campaign is the expensive part; do not author it against an unvalidated sim. *(Superseded 2026-09-30: no campaign is planned; see the note above M2.)*

---

## 5. Testing

Fitting for the subject, the test strategy is the same lesson: **fast feedback beats thorough feedback**.

| Layer | What it checks |
|---|---|
| **Unit** | Each system in isolation — drift math, attention accounting, defect probability |
| **Invariant / property** | Work items conserved (nothing vanishes or duplicates) · queues never negative · attention never below zero · Little's Law holds within tolerance across random runs |
| **Golden replay** | `{ seed, commandLog } → hash(final metrics)`. Catches unintended balance changes instantly. **The most valuable test type here** — it makes an entire simulation refactor safe. A golden that moves also moves the rules probe (`rules.test.ts`), which fails until `RULES_VERSION` is bumped, because old saves now replay differently (§3) |
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

One Cloudflare Worker (`apps/server`) serves the static build from `apps/web/dist` through the assets binding. The game needs no backend. Free play is fully static. *Since 2026-10-06* the Worker's own code is a stub that answers `/api/*` with 410 Gone, because presentation mode was retired (below). Until then it served the presentation-mode leaderboard at `/api/*`. The talk's deck is served at `/deck/`: a Vite plugin copies `docs/deck/deck.html` into the build (added 2026-09-29), so the deck is presentable from any browser and is whatever `main` holds.

**Live at <https://flow-state.mschrenk.workers.dev> since 2026-09-27, and every push to `main` deploys.** Cloudflare Workers Builds is connected to the GitHub repository. It builds each commit on `main` and deploys it, and it reports as the *Workers Builds: flow-state* check on the commit. Merging is shipping. That is trunk-based delivery with continuous deployment, which is what the game teaches, and it means a PR is not done until it is fit to be in front of a room. `pnpm deploy` builds and runs `wrangler deploy` by hand. It is a fallback, not the path.

**Presentation mode retired, 2026-10-06. The site is on the Workers free plan.** The talk it was built for ran on 2026-10-02 (§4, 3d). After that, the paid plan was paying for a leaderboard with no session coming. Free play never used the Worker, so it needs only the free plan. The `v2` migration in `apps/server/wrangler.jsonc` deletes the `Session` Durable Object, and every board with it. `GH59S` was exported first, to a file kept outside this public repository because it has players' names. `limits.cpu_ms` went too. PR #31 deployed it at 2026-10-07 02:25 UTC (*Workers Builds* check green, live `/api/*` answering 410). After that the `PRESENTER_KEY` secret was deleted and the account moved to the Workers free plan, both done in Cloudflare by the owner the same evening. Neither can be checked from the repo, so that is their report, not a measurement. The session rules (`SESSION_TUNING`, `SESSION_TICKS`, `verifyRun`) stay in `packages/sim`, because the golden replays and the sweep use them, and because they are what bringing it back would need. The reasoning below is kept as the record of why it was built the way it was. To bring it back, restore `apps/server/src` and `apps/web/src/session` from before this date, add a migration that creates the class again under a new tag, and go back to the paid plan.

**Leaderboards: yes, for a session in a room. Still no global ladder.** *Changed 2026-09-23. Retired 2026-10-06, above.* The game's target use became a 30–45 minute workshop that ends on a leaderboard (HIRING_AND_ATTENTION §8), so presentation mode has one: a Durable Object per session code, holding each player's best run. A submitted score is never trusted. The Worker re-plays `{ seed, commands }` with `@flow/sim` and ranks what the replay produces. *Since 2026-09-28* it replays under `SESSION_TUNING`, the session's own tuning, which arrives four items a day rather than free play's five so that a run can be won (HIRING_AND_ATTENTION §10). That takes 40–70 ms of CPU for a real run and under a second for the worst log the parser accepts, which **needs the Workers paid plan**, because the free plan's 10 ms CPU limit cannot replay a game.

Paid-plan CPU is billed with no hard cap, so the replay is closed to strangers. *Added 2026-09-27.* Starting a session needs the presenter key, a Worker secret (`wrangler secret put PRESENTER_KEY`), and with none set nobody can start one. A session takes players and runs for 24 hours, then refuses both before any replay. *Changed 2026-09-29 from four hours*, so the presenter can start the session the night before the talk. The cost of that is a longer exposure: a code that leaks from the projector can be replayed against for a day rather than an afternoon, so the worst case above is about $110 per leaked code rather than about $18. Accepted, because it needs someone to find the code and target it, and the key still controls who can make one. Its board stays readable for a week, after which the session deletes itself. Before this, anyone could create a session and submit the most expensive command log the parser accepts (~0.65 s of CPU each), which at 100 requests a second is about $110 a day. Per-IP rate limiting and a smaller command cap were considered and left out. With the key and the window, what's left exposed is a code on a projector for a day.

---

## 8. First three tasks

1. Scaffold: pnpm workspace, Vite, TS strict, vitest, the package skeleton in §3.
2. `packages/sim`: `GameState`, `WorkItem`, seeded RNG, and a `step()` that moves items through a hardcoded five-station pipeline with WIP limits. Unit + invariant tests, no renderer.
3. Implement `systems/drift.ts` with tests, then the crudest possible renderer — rectangles that redden with drift. **That is M0's playtest build.**
