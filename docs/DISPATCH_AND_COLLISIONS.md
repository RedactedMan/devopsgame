# Dispatch and area collisions

Companion to [GAME_DESIGN.md](./GAME_DESIGN.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

Spec for making *what to admit next* a player decision, and for making area
collisions visible. Written after measuring the idea rather than before, which
changed the answer: **the visibility half belongs in M1, the decision half
cannot work until M2.** Section 3 is why.

---

## 1. The problem this is meant to solve

M0's optimal policy is two decisions: set the WIP sliders to ~0.4× at t=0, and
resolve stale items as they appear. A headless sweep finds the answer in
seconds, which means a player can memorise it. A static optimum is interesting
exactly once.

The fix is not more mechanics. It is to make the optimum **move**, and to make
it **unknowable in advance**. Every proposal below is judged against those two.

## 2. What already exists and is unused

`WorkItem.areas` carries 1–2 area ids out of 10. `systems/drift.ts` computes
`overlapCounts` — for each in-flight item, how many other in-flight items touch
at least one of its areas — and multiplies drift by `1 + overlapWeight ×
overlap`. Two items touching area 7 at the same time already punish each other.

The player cannot see any of this. There is no area indicator on an item, no
map of which areas are contended, and no way to act on it. **The collision
mechanic is built, load-bearing, and invisible.**

How load-bearing, measured over 12 seeds × 4000 ticks:

| WIP setting | mean overlap per item | share of drift from the overlap term |
|---|---|---|
| 0.4× (optimum) | 1.44 | **25%** |
| 1× (game default) | 3.59 | **46%** |
| 2× | 6.64 | **60%** |

At the settings a player starts on, nearly half of all drift comes from a
mechanic with no representation on screen. That alone justifies Phase 1.

## 3. The measurement that changed the plan

The proposal was: let the player choose admission order, and collision-aware
play becomes a recurring skill. Dispatch order is cheap to prototype, because
`routing.ts:pull` admits with `backlog.shift()` — so *backlog order is the
dispatch decision*. Reordering the backlog each tick simulates any policy.

Four policies, 12 seeds × 4000 ticks, attentive stale-resolver:

```
wip×  policy      shipped  lead(h)  oldest(h)  meanOverlap
 0.4  fifo            165       71        145         1.44
 0.4  smallest        185       30        130         1.54
 0.4  coldest         179       45        202         0.57
 0.4  coldest+aged    169       68        140         1.28

   1  fifo            115       95        246         3.59
   1  smallest        129       59        208         3.63
   1  coldest         128       65        227         1.69

   2  fifo            101       88        304         6.64
   2  smallest        104       75        261         6.92
   2  coldest         101       83        302         4.09
```

Three findings, in order of how much they matter:

**Collision-aware dispatch works mechanically and is worth little.** `coldest`
cuts mean overlap by 53% at 1× — the mechanic does exactly what it says — and
converts that into +11% shipped. Not nothing, not a game.

**`smallest` dominates it, and understands nothing.** Admitting the smallest
item beats or matches collision-aware play at every WIP setting, while ignoring
areas entirely. A heuristic that wins without engaging the mechanic is worse
than no mechanic: it teaches the player that the interesting system is safe to
ignore, and it is learned once.

**The advantage self-neutralises exactly where it should matter most.** At 2×
WIP the overlap term is 60% of drift and `coldest` gains nothing, because the
backlog is deep but every candidate collides — there is no cold item left to
pick. Sequencing is a *low-WIP* skill: it only has room to operate after the
player has already learned the first lesson. Pedagogically that ordering is
fine. It does mean sequencing cannot carry a milestone on its own.

### The counterfactual that failed

Obvious fix: make big work touch more of the codebase, so big items are
genuinely more dangerous and `smallest` stops being free. Areas scaled to
`round(size / 1.6)`, same runs:

```
wip×  policy      shipped  lead(h)  meanOverlap
 0.4  fifo            144       89         4.13
 0.4  smallest        162       36         3.51
 0.4  coldest         168       42         3.04
   1  smallest        121       60         6.27
   1  coldest         117       63         5.87
```

`coldest` now *loses* to `smallest` at 1× and 2×, and total throughput drops
everywhere. The reason generalises:

> **Scaling areas with size makes "small" and "cold" the same answer.** Two
> heuristics that correlate are an ordering, not a decision. A decision needs
> axes that trade off.

### What is actually missing

There is no reason to want the expensive item. While every axis points the same
way — small work is cheaper, faster, colder, and worth the same as big work —
"admit the smallest cold thing" is correct forever, and the player is right to
stop thinking.

The missing ingredient is **value that does not scale with convenience**:
deadlines, item value, stakeholder pressure. Those live in M2's economy. Until
they exist, dispatch is an ordering problem with a known answer.

---

## 4. Phase 1 — make collisions visible *(M1, slice 2 — built)*

Built on `m1/collision-legibility`, as specified below, with no mechanic and
no tuning added.
The golden replay's hash did not move, which is the proof that it is what the
next line claims.

Pure legibility. No behaviour change, no tuning change, no balance change; the
golden replay is unaffected because nothing in `fingerprint()` moves.

**Sim**

- Cache `overlap` on `WorkItem` next to `drift`/`driftScore`. `updateDrift`
  already computes it every tick and throws it away.
- `SnapshotItem.overlap: number` and `SnapshotItem.driftFromOverlap: number`,
  the latter being `drift − drift / (1 + overlapWeight × overlap)` — this item's
  drift attributable to contention, in the item's own units.
- `Snapshot.hotAreas: { area: AreaId; inFlight: number }[]`.

**View**

- Area chips on every item: one small square per area, colour keyed to area id.
  Two items with a shared chip colour are fighting, and that must be readable
  without clicking.
- A contention strip along the board: one cell per area, weight by concurrent
  in-flight count. This is the thing a player should learn to glance at.
- Hover or select an item → highlight every in-flight item sharing an area.
- Stale panel gains the cause, not just the fact: *"4 items are touching area 7"*
  beside the drift number.

**Tests**

- Property, currently absent: an item sharing an area with in-flight work has
  strictly higher drift next tick than an otherwise identical item that shares
  none. The coupling is the mechanic and it has no direct test.
- Snapshot: `driftFromOverlap` reconciles with `drift` and `overlap` for every
  in-flight item.

**Acceptance**: a playtester who has never been told about areas can say why one
item is drifting faster than another sitting beside it. **Not yet played.** The
build is up and looked at, and the mechanical half is under test, but the
sentence above is a claim about a person and only a person can settle it.

### As built

Two decisions worth recording, because both went against the obvious reading of
the spec above:

- **The strip emits every area, cold ones included.** Ranking the cells by heat
  is a different picture every glance, and the whole value of a strip is that it
  is glanceable. Cells hold their positions; only their weight moves.
- **Hover dims the innocent rather than outlining the guilty.** On a full column
  the outlines run together and stop separating anything. Negative space is what
  reads. Hovering a *backlog* item is allowed and answers a question the spec did
  not ask: what this work would collide with if it were admitted now.

The area palette sits a full lightness band above the drift ramp rather than
picking different hues from it. Chips are drawn on item bodies that are
themselves teal, amber, or rust, and a chip chosen to contrast with teal
disappears on rust; pale-on-saturated separates from all three at once.

## 5. Phase 2 — make dispatch a decision *(M2, after the economy)*

Do not build this before item value and deadlines exist. Section 3 is the
evidence; building it early produces a mechanic whose optimal play is
"smallest first" and whose lesson is "ignore the interesting system."

**Preconditions**

1. Item value, and at least some items carrying a deadline.
2. Value uncorrelated with size — or better, anti-correlated, so the valuable
   work is the dangerous work.
3. Splitting (design §Act I.3) available as the escape hatch.

**Commands**

```ts
| { kind: 'admit'; itemId: ItemId }                      // jump one item to the front
| { kind: 'setDispatchPolicy'; policy: DispatchPolicy }  // the standing rule
| { kind: 'split'; itemId: ItemId; parts: number }       // the escape hatch
```

`DispatchPolicy = 'fifo' | 'smallest' | 'coldest' | 'valuable' | 'deadline'`.

The standing policy keeps the line running unattended — this game is about
observation and decision, not clicking — and `admit` is the intervention. That
split matters: it makes the player's *attention* the scarce thing, which is the
design's other currency.

`pull` consults the policy at `i === 0` only. Downstream stations stay FIFO.
Admission is the decision that matters because it is where the branch is cut:
`routing.ts` sets `basisVersion`/`basisTick` at exactly that moment. The player
is choosing when to start the clock on a piece of work, which is the thesis of
the entire game expressed as one click.

`split` divides a backlog item into `parts` items of `size / parts`, each taking
a subset of the parent's areas, with a per-part overhead. This is where the
batch-size lesson stops being a level script and becomes a mechanic.

**The decision it creates**

A big, valuable item touches five areas. Admit it now and it contends with
everything in flight for a long time, dragging their drift up with it. Hold it
and you miss the deadline. Split it and you pay overhead but every part is small
and cold. Three options, no dominant answer, and the right one depends on what
is currently in flight — which is the definition of a decision that does not
compress to a rule.

**Balance targets, to assert as sweeps**

- No single dispatch policy wins across every WIP × demand-mix combination. If
  one does, the trade-off is not real yet and Phase 2 has failed its own test.
- The collision-aware policy's advantage must survive the introduction of value.
  Today `smallest` dominates; the fix is that smallest must forgo value.
- Splitting overhead tuned so splitting is right for big-and-hot and wrong for
  small-and-cold, with a genuinely ambiguous middle.

**Tests**

- Invariant: split parts conserve `originalSize` plus overhead; the union of the
  parts' areas covers the parent's.
- Lesson: at fixed capacity, a collision-aware policy beats FIFO, and the margin
  peaks at moderate WIP and collapses at high WIP. That shape is measured
  (§3) and should be locked in as a regression test, because it is the
  relationship between the two lessons.

---

## 6. Recorded negative result

For whoever proposes this again, including a future me:

> Collision-aware dispatch was measured before being built. At M0 tuning it is
> worth +11% throughput and is dominated at every WIP setting by "admit the
> smallest item", which ignores areas entirely. Scaling areas with item size
> makes it strictly worse by collapsing the two heuristics into one. The
> mechanic is not weak — the overlap term is 46% of all drift at default WIP —
> but it cannot generate a *decision* until something makes the player want the
> expensive item.
