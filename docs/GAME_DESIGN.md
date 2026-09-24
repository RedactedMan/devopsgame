# Flow State — Game Design Document

*Working title. A real-time pipeline simulation game about lean flow in software delivery, built for the era of AI agents.*

Status: **draft v0.1** — design not yet validated by playtest. Nothing here is load-bearing until M0 proves the core loop is fun.

---

## 1. Premise

You run a software delivery organization. You lay out a delivery pipeline on a board, staff it, and watch work flow through it. Work arrives faster than you can finish it. You have cheap, fast AI agents that can multiply your *doing* capacity — and one scarce resource that they cannot multiply: **human attention**.

The game is won by learning that **throughput is not a capacity problem**. It is a flow problem.

### The one-sentence hook

*Satisfactory, but the widgets rot on the conveyor belt.*

### Design thesis

Lean manufacturing translates to software delivery, but with one crucial substitution. In a factory, work-in-process (WIP) costs you **capital** — inventory sitting on the floor is money you spent that hasn't earned. In software, WIP costs you **relevance** — a half-finished branch decays against a moving trunk. Every deploy someone else makes devalues your unfinished work.

That decay is invisible in real life. It is the thing this game makes visible.

---

## 2. The core loop

```
       ┌──────────────────────────────────────────────┐
       │                                              │
       ▼                                              │
  Work arrives ──▶ You route & staff it ──▶ It flows  │
  (features,       (humans, agents,          or jams   │
   bugs, asks)      WIP limits, batching)      │       │
                                               ▼       │
                                        Deploy → trunk advances
                                               │       │
                                               ▼       │
                             Everything unfinished decays ──┘
                             (drift, staleness, lost context)
                                               │
                                               ▼
                            Defects escape → Incidents → unplanned work
                                               │
                                               ▼
                     End of shift: DORA scorecard, kaizen budget, upgrades
```

Real time, pausable, with speed controls (1x/2x/4x). Pausing is free and encouraged — the game is about observation and decision, not reflexes. The clock exists so queues *build visibly* and pressure *feels* real, not to test dexterity.

---

## 3. Entities

### 3.1 Work items

Every item is a card that physically moves through the board.

| Type | Source | Notes |
|---|---|---|
| **Feature** | Backlog / stakeholder push | The scoring currency. Large ones can be **split** — the batch-size lever. |
| **Bug** | Escaped defect from a prior deploy | Cheap if caught early, expensive if it reaches production |
| **Incident** | Production failure | Preemptive. Consumes attention immediately. The unplanned-work tax. |
| **Chore / Debt** | Accumulates automatically | Ignoring it raises service times across all stations |
| **Improvement** | Player-created | Costs capacity now, permanently reduces cost later |

Item state:

```ts
type WorkItem = {
  id: ItemId
  type: ItemType
  size: number            // remaining work units
  basisVersion: number    // trunk version this work branched from
  quality: number         // 0..1 — drives escaped-defect probability
  contextFidelity: number // 0..1 — how well the worker still "understands" it
  touchedAreas: AreaId[]  // for collision detection with other in-flight WIP
  history: StationVisit[] // for the value stream map
}
```

### 3.2 Stations

Placed on a grid, connected by queues. Each has WIP slots, a service-time distribution, and a staffing model.

- **Groom / Spec** — converts vague asks into sized items. Under-investing here inflates rework downstream.
- **Implement** — where humans or agents do the work.
- **Review** — the attention bottleneck. Only humans can staff it.
- **CI** — runs the test suite. Suite duration is a player-controlled investment. Catches defects proportional to coverage.
- **Staging / Integration** — where drift becomes merge conflicts.
- **Deploy** — releases to production; **advances the trunk version**, which is what makes everyone else's WIP decay.
- **Operate / Monitor** — telemetry quality determines how fast escaped defects are *detected* (MTTR's first half).

### 3.3 Workers

| | Human Dev | AI Agent |
|---|---|---|
| Cost | High, fixed headcount | Cheap, near-unlimited |
| Speed | Baseline | 3–6× on well-specified work |
| Quality | High first-pass | Lower first-pass; degrades sharply on vague specs |
| Context | Retains it | **Decays while parked** — see §4.2 |
| Can staff Review? | Yes — accurate signal | Yes — **but the signal it produces is unreliable** (§4.6) |
| Consumes attention? | Small | **Large, at review and integration** |

### 3.4 Two currencies: money and attention

Both are real resources, and the design lives or dies on keeping them genuinely distinct. The rule that keeps them from collapsing into one another:

> **Money buys capacity. Attention buys judgment. Money cannot buy attention.**

| | **Money** | **Attention** |
|---|---|---|
| Buys | Headcount, agent seats, CI machines, telemetry, tooling, test infrastructure | Review, briefing agents, re-briefing stale agents, incident triage, rebase decisions, postmortems |
| Replenished by | Shipping value — delivered features generate revenue, which becomes next quarter's budget | Per shift, at a fixed rate. It does not accumulate |
| Scales with spending? | Linearly. More money, more machines | **Sub-linearly.** Hiring adds attention, but each person adds less than the last — a power law, `H^0.7`, which is the shape the team-size data support; a Brooks's-Law channel count was tried and did not survive the literature (see [HIRING_AND_ATTENTION.md](./HIRING_AND_ATTENTION.md) §5). Ramp time for a new hire — Brooks's actual claim — is deferred until money makes hiring timing a decision |
| Runs out as | A slow squeeze across a level | A hard wall within a single shift |

This structure produces the tension the game is about. Money is abundant in the AI era — agent seats are cheap, and the player can always buy more *doing*. Attention is fixed. A player flush with cash and out of attention has exactly the problem the game exists to teach, and they can *see* both meters at once.

It also gives the kaizen slider real teeth in Act III: improvement work doesn't ship features, features generate revenue, and revenue is what buys the improvement. Under-investing is survivable for a while and then suddenly isn't.

## 4. The signature mechanics

### 4.1 Drift (WIP decay) — the differentiator

The trunk has a version number. It increments on every deploy. Every in-flight item remembers the version it branched from.

```
drift = trunkVersion − item.basisVersion
```

Drift, scaled by how many other in-flight items touch overlapping `touchedAreas`, drives:

- **rework probability** at Review and CI (merge conflicts, newly-failing tests)
- a **service time multiplier** at every remaining station
- a **quality penalty** carried into production

Past a threshold the item is flagged **STALE** and the player must choose:

| Choice | Cost | When it's right |
|---|---|---|
| **Rebase** | Attention + partial time re-spend; drift resets to near-zero | Item is large and mostly done |
| **Abandon & restart** | Lose all invested work; new item starts at current trunk | Item is small, or drift is extreme |
| **Ship it anyway** | No cost now; sharply elevated change-failure risk | You're desperate, and it will hurt |

> **The emergent lesson.** Because drift scales with *both* time-in-system and *concurrent overlapping WIP*, doubling your WIP more than doubles your rework. Little's Law (`lead time = WIP ÷ throughput`) becomes something you *feel* as items go red, not a formula you're shown. Players discover that halving WIP raises throughput — the single most counterintuitive result in lean, delivered as a game outcome rather than a lecture.

### 4.2 Context decay

Distinct from drift, and specific to the AI-native premise. An item parked in a worker's queue loses `contextFidelity` over time. Picking it back up costs a **re-briefing** attention charge proportional to how much was lost. Agents decay much faster than humans — their working context is genuinely gone.

This punishes exactly the real-world behavior the player will bring to the game: starting five agents on five things and coming back later.

### 4.3 Feedback speed (the Second Way)

The CI station has two dials the player controls, and they trade off:

- **Coverage** ↑ → fewer escaped defects, but longer suite duration
- **Parallelization / suite speed** ↑ → costs money and improvement capacity, adds no features

Slow CI doesn't just delay — it delays *while drift accumulates*, so a slow suite makes every failure more expensive to fix than a fast one. That compounding is the point. A level should exist where the correct move is to spend an entire shift making the tests faster and ship nothing.

**Escaped defects** become production incidents on a delay. They preempt feature work, consume attention, and tank MTTR. This is the Phoenix Project's unplanned-work death spiral, mechanized.

### 4.4 Value Stream Mapping — as a tool, not a menu

Unlockable in Act I. Press `V`: time freezes and the board re-renders as a value stream map.

```
 Spec ──▶ Impl ──▶ Review ──▶  CI  ──▶ Stage ──▶ Deploy
 ░0.5d    ░1.2d     ░0.3d     ░0.2d    ░0.4d     ░0.1d   ← touch time
 ▓1.1d    ▓4.8d     ▓9.2d     ▓0.6d    ▓3.0d     ▓0.4d   ← WAIT time
 %C/A 82%  94%       71%       —        88%       —

 Lead time 21.8d · Touch 2.7d · FLOW EFFICIENCY 12%
```

Players will not believe the flow-efficiency number the first time they see it. That reaction — *"almost all of my lead time is items sitting in queues"* — is the highest-value teaching moment the game has. Everything in Act I should build toward earning this tool.

### 4.5 Scoring: DORA, not widgets

Level objectives are stated in DORA metrics, never in raw output:

- **Lead time for changes** (commit → production)
- **Deployment frequency**
- **Change failure rate**
- **Mean time to restore**

Plus two supporting meters: **flow efficiency** and **team morale/trust** (drops with sustained overtime, incident load, and blame; feeds service times).

Scoring in DORA terms teaches the central empirical finding of the field — speed and stability are *correlated*, not traded off. A player who games the score by shipping recklessly will watch change-failure rate and MTTR destroy their throughput two shifts later.

---

### 4.6 Agent review and the lying dashboard

Agents *can* staff Review. They are fast, cheap, and cost almost no attention. They are also the most dangerous thing in the game, and the danger is not that they are bad at reviewing — it's that they are *convincingly* bad.

**Defect classes.** Every defect an item carries belongs to a class:

| Class | Caught by human review | Caught by agent review | Caught by CI |
|---|---|---|---|
| Mechanical (obvious bugs, style, missed cases) | Yes | **Yes** | Yes, if covered |
| Design (wrong abstraction, misread requirement) | Yes | **No** | No |
| Integration (interacts badly with concurrent WIP) | Often | **No** | Only with good coverage |

Agent review genuinely removes the mechanical class, which is most of the volume. That's why it's attractive, and why it should stay attractive — the correct play is to use agents for review, not to avoid them.

**The rubber-stamp mechanic.** Here is where it turns:

- Every item carries **review provenance** — who signed off.
- The sim tracks **true quality** and **displayed quality** separately. Human review updates both. Agent review updates *displayed* quality fully, and true quality only for what it can actually see.
- An agent-approved item is marked verified, so it **skips the human review queue entirely.** This is the sting: the review didn't just fail to help, it removed the item from the path where it would have been caught.
- The gap grows non-linearly in the **agent review share**. Below roughly half, the divergence is negligible. Past that, it accelerates — and agent-reviewing-agent-written work carries an additional penalty, because nothing in the loop has ever held the whole design in a human head.

**What the player experiences.** The dashboard looks great. Lead time drops, deployment frequency climbs, quality reads high. Three shifts later, change failure rate detonates from defect classes nobody was ever looking for, and the postmortem shows a chain of clean approvals.

> The lesson is not "don't let agents review." It is **your quality metric is only as trustworthy as the thing that produced it** — and a metric that can be satisfied cheaply will be. Goodhart's Law, as a level.

This preserves the attention constraint without banning the obvious move. Agents can absorb the easy majority of review; the last portion is irreducibly human, and finding where that line sits is the Act IV skill.

---

## 5. Campaign arc

Structured on the DevOps Handbook's Three Ways, with a fourth act that is this game's original contribution.

### Act I — Flow
*The First Way. Left to right, fast.*

1. **First Deploy** — tutorial. One item, one path. Ship it.
2. **The Pile-Up** — demand exceeds capacity. Introduces queues and lead time. Players naturally start everything; drift punishes them. Introduces WIP limits.
3. **Batch Size** — one 20-point epic vs. five 4-point stories. Same total work, dramatically different lead time. Unlocks item splitting.
4. **Find the Constraint** — Theory of Constraints. Adding staff anywhere but the bottleneck does nothing measurable. Unlocks the **VSM overlay** as the diagnostic tool.
5. **Stop Pushing** — stakeholders shove work in. Build a pull system; the queue in front of the constraint sets the pace.

### Act II — Feedback
*The Second Way. Fast, constant feedback right to left.*

6. **Escape Velocity** — defects reach production. Build a test suite.
7. **The Slow Suite** — a 40-minute CI run. Ship nothing this shift; make the tests fast. Watch next shift's throughput jump.
8. **Andon Cord** — the line is producing defects. Correct play is to *stop the line* and fix the source. Continuing to ship loses the level.
9. **Unplanned Work** — an incident wave. Learn that MTTR is mostly *detection* time; invest in telemetry.

### Act III — Continual Learning
*The Third Way.*

10. **Kaizen Budget** — an explicit slider between feature work and improvement work. Levels are long enough that under-investing visibly compounds.
11. **Blameless Postmortem** — convert incidents into permanent defect-rate reductions. Blaming is available, is faster short-term, and tanks morale.
12. **Decouple** — split the monolith station into services so pipelines run independently. Unlocks feature flags: deploy ≠ release.
13. **Chaos Day** — deliberately break production while you're watching, rather than at 3am.

### Act IV — The Agent Fleet
*New. The reason this game exists now.*

14. **Ten Hands** — agents unlocked. Cheap, fast, parallel. Throughput soars, then collapses under drift and review backlog.
15. **Rubber Stamp** — agent review unlocked. Every metric improves. The level fails three shifts later from defects nobody was watching for. Teaches §4.6 the only way it can be taught: by being fooled once.
16. **Attention Economy** — money is abundant, attention is not. Agent count must be limited by review capacity, not by budget.
17. **Context Rot** — long-running agent work goes stale. Restart-vs-rescue becomes a routine judgment call.
18. **Trunk** — the endgame. Ruthless small batches, trunk-based flow, heavy test investment, agents held to a WIP limit far below what you can afford. The player arrives, on their own, at the conclusion the Handbook states in its first chapter.

### Shifts, levels, and failure

A **shift** runs 5–10 minutes at 1× and is the unit of scoring: it ends with a DORA scorecard, revenue settlement, and the kaizen spend. A **level** is one to three shifts.

Levels **hard fail**. There is no consolation grade. Each level states its fail conditions up front, in the game's own terms:

- change failure rate above threshold at shift end
- any item's lead time exceeding a cap
- incident backlog exceeding a count
- morale reaching zero
- (Act II, andon cord) shipping while the line is producing defects

Three rules make hard failure teach rather than punish:

1. **Fail fast.** Conditions trip the moment they're violated, not at shift end. A ten-minute shift that fails at minute nine for something that went wrong at minute two is a design bug. The game shows a *danger* state before the trip — which is itself the Act II lesson, arriving as UX.
2. **The failure screen is the teaching screen.** On fail, time stops and the **VSM opens automatically** at the moment of failure with the causal chain highlighted. You do not get a "you lose" card; you get a diagnosis.
3. **Restart is instant and free.** Default is the same seed — learn the system, not the dice. A "new seed" option is one click away for players who want to prove it wasn't luck.

---

## 6. Pedagogy rules

Non-negotiable constraints on the design. These are what separate a game from a slideshow.

1. **Teach by consequence, never by tooltip.** If a player needs to read text to learn a lesson, the mechanic has failed. Rewrite the mechanic.
2. **Every mechanic maps to exactly one named concept**, and that name appears in an optional codex — never in a modal that blocks play.
3. **The intuitive move must be the wrong move.** Start more work. Hire more agents. Ship the stale branch. Blame someone. Each should feel right and cost you.
4. **Failure is legible.** When a run goes bad, the VSM must show *why* in under ten seconds.
5. **No lecture, no moralizing.** The Handbook citations live in a codex the curious player opens. The game itself never explains itself.
6. **Optional codex entries** link each mechanic to its source (Little's Law, Theory of Constraints, the Three Ways, DORA/*Accelerate*, *The Phoenix Project*). Earned, not pushed.

---

## 7. Prior art and the gap

| | Format | Real-time | Models AI agents | Models WIP decay |
|---|---|---|---|---|
| [getKanban](https://kirillklimov.com/kanban-games/) (Russell Healy) | Facilitated board game | No | No | No |
| Featureban / Flowlab | Facilitated workshop | No | No | No |
| [The Phoenix Project simulation](https://en.itpedia.nl/2017/08/09/devops-the-phoenix-project-simulation/) (GamingWorks) | Facilitated business sim | No | No | No |
| Satisfactory / Factorio | Real-time factory sim | Yes | n/a | **No — inventory is free to hold** |
| **Flow State** | Solo digital sim | **Yes** | **Yes** | **Yes** |

Every serious existing tool for teaching flow is *facilitated* — it needs a trained instructor, a room, and half a day. None are playable alone at 11pm by an engineer who just wondered why their five parallel agent branches all conflicted. And none model the thing that makes software WIP different from factory WIP: it rots.

The gap is real. It is also, right now, urgent — the number of people managing parallel agent work vastly exceeds the number who've been through a flow workshop.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **It's educational, not fun** | Fatal | M0 gate: an unbriefed playtester must over-fill WIP, do worse, and explain why — *without being told*. If that fails, redesign before building anything else |
| **Simulation balance** | High | Headless sweeps (10k seeded runs) over the parameter space. Never hand-tune |
| **Real-time scope creep** | High | M0 has no building mode. Fixed pipeline, five stations. Prove the loop first |
| **Board becomes unreadable** | Medium | Hard cap board size. Legibility beats scale — this is a sim you *read*, not one you optimize forever |
| **Preachiness** | Medium | §6 rules. A reviewer should be able to reject any line of copy that lectures |
| **Fidelity vs. fun** | Medium | It's a caricature and should own that. Precision lives in the codex |
| **Hard fail frustrates** | Medium | Fail-fast conditions, a visible danger state before the trip, instant same-seed restart, and a failure screen that diagnoses rather than scolds. If a playtester ever says *"I don't know why I lost,"* that's a bug, not difficulty |
| **Two currencies feel redundant** | Medium | Enforce the rule in §3.4 — money buys capacity, attention buys judgment, and money can never buy attention. If a player ever solves an attention shortage by spending money, the economy is broken |

---

## 9. Decisions

Resolved. These are settled and the design above reflects them.

| Question | Decision | Consequence |
|---|---|---|
| Can agents staff Review? | **Yes — with an unreliability curve.** Agent review is real and useful, but produces a displayed-quality signal that diverges from true quality, non-linearly in the agent-review share | Became a signature mechanic (§4.6) and its own Act IV level. The sim must track true and displayed quality separately |
| Money, attention, or both? | **Both.** Money buys capacity; attention buys judgment; money cannot buy attention | §3.4. Adds a revenue loop that gives the Act III kaizen slider real stakes |
| Shift length | **5–10 minutes at 1×**, one to three shifts per level | Long enough for drift and the review-divergence lag to compound; short enough to retry |
| Failure model | **Hard fail.** No consolation grades | Fail conditions stated up front; fail-fast triggers; the VSM opens automatically as the failure screen; instant same-seed restart |
| Async competition | **Not now.** No leaderboards, no shared-seed ladder | Determinism stays, but justified by testing, balance sweeps, replay, and bug reports rather than anti-cheat |
| Revenue curve | **Linear.** Delivered value pays out at face value; it does *not* decay with lead time | Keeps the economy to two interacting loops instead of three. Lead time is already punished through drift, rework, and the DORA objectives — taxing it again in revenue would double-count the same lesson and make the money loop hard to reason about |

## 10. Deferred

Deliberately not decided yet. Both are tuning-and-feel questions that a playable build answers better than a document, and neither blocks any milestone before M4.

1. **Is the agent review share an explicit dial, or emergent** from how the player staffs the Review station? Emergent is more honest; a dial is more legible. Current lean is emergent, with the VSM reporting the share as a diagnostic. **Decide during M5**, when the mechanic is actually playable.
2. **Morale's exact role.** It currently feeds service times — possibly too little to justify a meter, possibly too much to stay predictable. **Decide during M4**, when there is a kaizen tree and an incident load to feel it against.

Until each is decided, build the sim so both remain cheap to change: keep the review share a derived quantity (so adding a dial later is additive), and keep morale's effects behind a single coefficient in `tuning`.
