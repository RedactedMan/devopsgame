# The moving constraint

Companion to [GAME_DESIGN.md](./GAME_DESIGN.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).
Sibling to [DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md).

Spec for M1's headline mechanic: staffing decisions that relocate the
bottleneck, so *find the constraint* becomes a loop instead of a one-time
answer. Measured against the M0 sim before being specced — and unlike dispatch,
it survives the measurement with room to spare.

---

## 1. The claim

M0 is solvable in two decisions because it has one lever. Add a second lever
that **changes what the first lever's right answer is**, and neither is solvable
alone. Capacity and WIP policy are that pair.

Everything below is measured over 8 seeds × 4000 ticks with an attentive
stale-resolver, using the M0 sim as it stands. No new mechanics were needed to
produce these numbers, which is the point: the interactions are already in there
and the player simply has no way to reach them.

## 2. Theory of Constraints already works

Add one server, at 0.4× WIP, and measure against a 165-item baseline whose
utilisation profile is `spec 42% · implement 72% · review 91% · ci 36% · deploy 27%`:

| hire | shipped | lead | Δ | constraint after |
|---|---|---|---|---|
| baseline | 165 | 68h | — | review |
| +1 spec | 166 | 67h | +0.5% | review |
| +1 implement | 168 | 71h | +1.7% | review |
| **+1 review** | **190** | **55h** | **+14.6%** | **implement** |
| +1 ci | 165 | 68h | +0.0% | review |
| +1 deploy | 167 | 67h | +0.8% | review |

The lesson from design §Act I.4 — *adding staff anywhere but the bottleneck does
nothing measurable* — is already mechanically true, at roughly a 10:1 ratio, and
the constraint genuinely relocates to Implement afterwards. Nothing needs to be
built to make this real. It needs to be made **reachable** (§5) and **visible**
(§6).

## 3. Hiring alone stops working, fast

Greedy play: repeatedly add one server to whichever station is hottest, WIP
fixed at 0.4×.

| hires | staffing | shipped | constraint |
|---|---|---|---|
| 0 | `spec 1 · impl 4 · rev 1 · ci 2 · dep 1` | 165 | review |
| 1 | `rev 2` | **190** | implement |
| 2 | `rev 2 · impl 5` | 188 | implement |
| 3 | `rev 2 · impl 6` | 184 | implement |
| 4 | `rev 2 · impl 7` | 184 | review |
| 5 | `rev 2 · impl 7 · rev 3` | 184 | spec |

One hire is worth +15%. Every hire after it is worth **nothing, then slightly
negative**, and utilisation falls everywhere (Implement 76% → 44%) while
throughput does not move. The payroll grows, the line does not.

The reason is the whole design: once enough servers exist to keep the
WIP-limited work moving, **the binding constraint stops being a station and
becomes a policy.** You cannot hire your way past your own WIP limits, and the
board goes on cheerfully reporting a station as "the constraint" while the real
one is a number in the side panel.

## 4. The coupling — this is the game

Best WIP multiplier at each staffing level:

| staffing | best WIP | shipped at best | 0.3 | 0.4 | 0.5 | 0.75 | 1 | 1.5 |
|---|---|---|---|---|---|---|---|---|
| baseline | 0.5× | 165 | 137 | 165 | **165** | 134 | 116 | 102 |
| +1 review | 0.5× | 212 | 137 | 190 | **212** | 188 | 162 | 140 |
| +1 rev +1 impl | 0.75× | 219 | 137 | 188 | 217 | **219** | 195 | 184 |
| +2 rev +2 impl | 0.75× | 242 | 137 | 184 | 216 | **242** | 227 | 207 |

Read the bottom row against the top. **After investing in capacity, the WIP
setting that used to be optimal costs you 24% of your throughput** (184 at 0.4×
versus 242 at 0.75×). The player's own success invalidates their own settings.

And the two levers rank differently depending on where you are:

- Hire, never retune: 165 → 190 → 188 → 184. Plateaus after one hire.
- Hire *and* retune: 165 → 212 → 219 → 242. Keeps paying.
- At `+1 review`, retuning 0.4× → 0.5× is worth **+11.6%**. The second hire is
  worth **+3%**. *The sliders beat the payroll*, and no amount of staring at
  utilisation will tell you that.

This satisfies both criteria from
[DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md) §1 that dispatch
failed:

- **The optimum moves** — and it moves because of what the player did, not
  because of dice. No randomness is required to keep the game unsolved.
- **It is unknowable in advance** — the new optimum depends on the interaction
  of the current staffing, the current WIP settings, and the drift feedback
  loop. There is no table to memorise, because the table has two axes and the
  player is standing on one of them.

## 5. What to build — mechanics

**Commands**

```ts
| { kind: 'hire'; station: StationId; kind: WorkerKind }   // WorkerKind = 'human' | 'agent'
| { kind: 'reassign'; workerId: WorkerId; to: StationId }
```

Reassignment matters more than hiring. Moving a worker is free capacity
relocation and is the move a player should reach for *before* spending — which
makes the constraint diagnosis the valuable skill rather than the budget.

**Scarcity.** Hires must be limited or the ladder is trivial. M1 already
specifies the attention pool; humans consume attention, agents consume money.
The two-currency split from design §3.4 does real work here: agents are cheap
and parallel, but **Review cannot be staffed by agents** (already noted in
`tuning.ts`), so the constraint that matters most is the one money cannot fix.
That is the Act IV thesis arriving three acts early, as a staffing constraint.

**Do not add**: per-station efficiency upgrades, or anything else that raises
throughput without moving the constraint. They flatten the loop this exists to
create.

## 6. What to build — legibility

The mechanic is real (§2) and the player cannot currently see any of it. The
HUD reports `0/1 busy` — an instantaneous sample of a quantity that only means
something averaged.

- **Rolling utilisation per station**, windowed over ~1 sim-day, in the sim and
  on the snapshot. Utilisation is the diagnosis; occupancy is not.
- **The constraint named on the board.** The hottest station gets a persistent
  marker. Not a tooltip — a permanent piece of the station's identity that
  visibly moves to another column when it moves.
- **A "the constraint moved" moment.** When the hottest station changes, say so.
  This is the single highest-value feedback event in M1: it is the instant the
  player learns that the answer they just found has expired.

  > **Which makes a false one the most expensive thing on the screen.** Built
  > naively — name the argmax after the average converges, switch on a margin —
  > it fires twice for reasons that are not the mechanic. A line that is still
  > *filling* has a bottleneck that walks downstream as work reaches each
  > station, so the first minute announces spec → implement → review as though
  > something had happened. And two stations running neck and neck trade places
  > on noise: one seed did it ten times in a run. A margin does not fix the
  > second, because it asks for a bigger swing rather than a sustained one.
  >
  > What works: name nothing for ten sim-days, and require a challenger to hold
  > its lead for two shifts before the title changes hands. Measured across 48
  > unattended runs, that reports the constraint correctly every time and
  > reports zero moves — which is right, because nobody did anything. Locked in
  > as a test, because the failure mode is a game that cries wolf about its own
  > headline.
- **Flag when the constraint is a policy, not a station** — every station below
  some utilisation while throughput is flat is §3's plateau, and it should read
  as "your WIP limits are the bottleneck now", not as a station's fault.

The full diagnosis is the VSM overlay in M3. M1 needs enough for the player to
find the constraint without it; if the VSM turns out to be *required* to play
M1, it has been scheduled too late.

## 7. Balance targets, as tests

Assert shapes, not point values, per plan §5.

1. **ToC holds.** One server at the constraint is worth at least 5× one server
   anywhere else. Currently 14.6% vs 0.0–1.7%, so there is wide margin.
2. **The greedy ladder plateaus.** Hiring at fixed WIP stops paying by the
   second or third hire. This is the lesson, so it is a test, not a bug.
3. **The optimum moves.** The argmax WIP multiplier at `+2 rev +2 impl` is
   strictly greater than at baseline. If a single WIP setting is optimal at
   every staffing level, the coupling has been tuned away and M1's core loop is
   dead — this is the regression that would matter most.
4. **Retuning beats the second hire** at `+1 review`. The relationship, not the
   number.

## 8. Built: the zero-sum version *(M1)*

Everything in §2–§4 measures a **hire** — capacity added from outside. What
shipped first is **reallocation**, which is zero-sum: a worker moved to Review
leaves a hole where they were standing. That is a weaker move by construction,
so it was measured before being built rather than assumed to inherit the numbers
above. Same method, 12 seeds × 4000 ticks, wip 0.4×:

| move | shipped | Δ | lead |
|---|---|---|---|
| baseline | 165 | — | 707t |
| implement → spec | 163 | −1.2% | 704t |
| implement → ci | 163 | −1.1% | 771t |
| implement → deploy | 163 | −1.1% | 771t |
| ci → spec | 166 | +1.0% | 666t |
| ci → implement | 166 | +0.5% | 705t |
| ci → deploy | 165 | +0.4% | 707t |
| implement → review | 179 | +8.9% | 585t |
| **ci → review** | **184** | **+11.7%** | **508t** |

The lesson survives the weaker move, at an 11:1 ratio against §7's 5:1 target.
It also gains an axis the hiring version does not have: **where the worker comes
from matters as much as where they go.** CI has slack to donate and Implement
does not, so the same destination pays 11.7% or 8.9% depending on the donor.
That is Theory of Constraints and its converse in one decision, and it is free.

Of §7's four targets, reallocation delivers 1, 2 and 4 with room to spare. It
delivers **3 only weakly**: after `ci → review` the WIP optimum shifts from
0.4× to 0.5× (+2.3%, against the baseline's +0.2% for the same change), where the
`+1 review` hire shifts it by +11.6% and two hires walk it to 0.75×. The reason
is mechanical — total capacity did not grow, so the line cannot absorb much more
work in flight.

**So target 3 is the argument for `hire`,** and it is the reason the milestone is
not finished without one. It is deliberately not in the first slice: a head-count
currency invented before the economy exists is one that gets deleted when money
arrives in M2, and §5's own point is that reassignment is the move that makes
diagnosis the valuable skill. The assertion in `staffing.test.ts` is written at
the strength reallocation actually supports, with a comment saying why, so that
strengthening it is a deliberate act rather than an accident.

## 9. Why this and not dispatch

Both were measured against the same sim with the same method. Dispatch produced
+11% and was dominated by a heuristic that ignores the mechanic entirely
(DISPATCH_AND_COLLISIONS §3). Capacity produced +15% for the first correct move,
a plateau that teaches a second lesson, and a 24% penalty for failing to
re-tune — a genuine two-lever interaction with no dominant strategy.

The difference is not effect size. It is that dispatch had one axis and capacity
has two.
