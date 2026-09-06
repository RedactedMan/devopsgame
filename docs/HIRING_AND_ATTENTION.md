# Hiring and the attention pool

Companion to [GAME_DESIGN.md](./GAME_DESIGN.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).
Sibling to [CONSTRAINT_AND_CAPACITY.md](./CONSTRAINT_AND_CAPACITY.md) and
[DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md).

Spec for M1 slice 3: `hire`, the human/agent split, and the scarcity that has to
bound them. Measured against the sim as it stands after slices 1 and 2, before
being specced — and as with the two slices before it, the measurement moved the
plan. Section 3 is the part that moved.

---

## 1. What this slice owes the milestone

[CONSTRAINT_AND_CAPACITY.md](./CONSTRAINT_AND_CAPACITY.md) §7 lists four balance
targets. Three are asserted and hold. The fourth — **the WIP optimum moves** —
is asserted weakly, because reallocation is zero-sum and a line whose total
capacity did not grow cannot absorb much more work in flight. §8 records the
consequence plainly:

> **Strengthening this assertion is the acceptance criterion for the slice that
> adds hiring.**

So that is this slice's job, and the first question is whether it is even
achievable. It is, decisively.

## 2. The optimum walks, and it walks a long way

12 seeds × 4000 ticks, attentive stale-resolver, `initState({ staffing })`.
Shipped at each WIP multiplier; `best` is the row's own optimum.

```
                staffing    0.4x    0.5x   0.75x      1x    1.5x    best     at
  baseline           (9)     165     165     132     115     102     165   0.5x
  +1 rev            (10)     187     209     188     161     142     209   0.5x
  +1 rev +1 impl    (11)     185     214     219     196     186     219  0.75x
  +2 rev +2 impl    (13)     183     212     237     224     211     237  0.75x
  +3 rev +3 impl    (15)     183     212     234     234     231     234  0.75x
  +4 rev +4 impl    (17)     183     212     237     238     239     239   1.5x
  +6 rev +6 impl    (21)     183     212     234     235     238     238   1.5x
  +10 all           (59)     190     217     236     240     242     242   1.5x
```

Read the first column downward. **0.4× is the best setting in the game at the
starting roster and the worst setting on the board once you have staffed up** —
183 against a reachable 239. The player's own investment invalidates the answer
they worked out in slice 1, which is precisely target 3's strong form, and it is
worth up to 31% of throughput.

This needs no new tuning. Hiring is enough.

## 3. The finding that moves the plan

The slice was going to be *"attention as the scarcity that bounds hiring"*. The
sim already bounds hiring, without help:

Read the `best` column downward instead. 165 → 209 → 219 → **237** → 234 → 239 →
238 → 242. Everything from `+2 rev +2 impl` on is the same number. **Thirteen
workers reach the ceiling; forty-six more buy 2%.** A pool that caps headcount
would be capping something the simulation already caps, and the player would
never see it bind.

So the interesting question is not *how many* but *which kind*, and there the
sim has a much sharper answer already in it.

### Money cannot substitute for attention — already true, at 14:1

Design §3.3 says Review is the station agents cannot honestly staff, and
`tuning.ts` has said so in a comment since M0. Take that comment literally and
the two currencies separate on their own:

```
                             added  heads    best  at wip  vs base
                           nothing      9     165    0.5x     0.0%
                      +1 implement     10     169    0.4x     2.2%
                      +4 implement     13     169    0.4x     2.2%
                     +16 implement     25     169    0.4x     2.2%
          +4 everywhere BUT review     25     168    0.5x     1.9%
         +16 everywhere BUT review     73     168    0.5x     1.9%
               +1 review (a human)     10     209    0.5x    26.6%
                    +2 review only     11     209    0.5x    26.6%
                    +4 review only     13     209    0.5x    26.6%
```

**Sixty-four extra workers, everywhere a machine is allowed to stand, are worth
+1.9%. One human at Review is worth +26.6%.** That is the design's central
claim — *money buys capacity, attention buys judgment, money cannot buy
attention* — arriving as a measured 14:1 ratio rather than as a slogan, and it
requires exactly one new rule: agents may not staff Review.

Note the third and fourth rows especially. Agent speed is irrelevant here.
`+16 implement` is four times the implement throughput and it buys the same
+2.2% that one extra body does, because the wall is not implement. **A player
who responds to a bottleneck by buying more doing gets nothing, however fast the
doing is.** That is Act IV's thesis, mechanically true in M1.

### And agents are worth six times more *after* the human

The converse is what stops this being a lecture about agents being useless:

```
                             added  heads    best  at wip  vs base
                           nothing      9     165    0.5x     0.0%
            +8 agents at implement     17     169    0.4x     2.2%
                +1 human at review     10     209    0.5x    26.6%
    +1 human review, +1 agent impl     11     219   0.75x    32.8%
    +1 human review, +2 agent impl     12     227   0.75x    37.4%
    +1 human review, +4 agent impl     14     231   0.75x    39.9%
    +1 human review, +8 agent impl     18     233      1x    41.1%
    +2 human review, +8 agent impl     19     241    1.5x    46.1%
        +2 human review, +8 spread     19     242      2x    46.7%
```

The same eight agents are worth **+2.2% before the human hire and +14.5%
after**. Ordering is the whole decision: agents are not weak, they are *blocked*,
and the thing blocking them is the one station they cannot be pointed at.

This is a better mechanic than the one the slice was going to build. It is also
already in the sim. What is missing is only the ability to reach it.

## 4. So what does attention actually do?

If §3 is the lesson and it needs no pool, the honest question is whether M1
needs an attention pool at all. It does, for a reason the measurement makes
plain rather than the one the slice title assumed.

**Free hiring solves the game in four moves.** Hire two humans at Review, eight
agents anywhere else, push the sliders to 1.5×, and the line is at 242 out of a
242 ceiling. That is DISPATCH_AND_COLLISIONS §1's failure condition word for
word: *a static optimum is interesting exactly once*. Slice 3 without a cost
would hand the player a four-rung ladder to the top of the game.

So attention exists to make the *human* hire expensive, because the human hire
is the one that matters. Design §3.4 is already explicit about what attention is
for, and it is not headcount:

> Money buys capacity. Attention buys judgment. Money cannot buy attention.

**The M1 reading**, recorded here because §5 of CONSTRAINT_AND_CAPACITY and §3.4
of the design doc do not currently agree and one of them has to give:

- There is **no money in M1**. Agent seats are free and effectively unlimited,
  exactly as the design says they are in the AI era. Agents are bounded by where
  they may stand, not by what they cost.
- **Attention is a per-shift budget that does not accumulate**, spent on
  judgment: reviewing, rebasing, and supervising agents.
- **Humans supply attention. Agents consume it.** Hiring a human raises the
  budget sub-linearly — Brooks's Law as a mechanic, per §3.4. Hiring an agent
  lowers what is left, because someone has to read what it produced.

That last line is what makes the trap close. A player who hires agents to get
past a review bottleneck spends the budget that the review bottleneck runs on,
and the meter says so while they do it.

**CONSTRAINT_AND_CAPACITY §5 is superseded on one point.** It says "humans
consume attention, agents consume money." Measured against the design's own
currency rules and a milestone with no economy, it is the other way around in
M1: humans *supply* attention and agents consume it. Money returns in M2 and can
re-price agents then.

## 5. What to build

Sim first, then tuning, then the screen — and gated so that each step can be
proved not to have moved the balance before the next one starts.

**Step 1 — kinds are real.**

- `hire` command: `{ kind: 'hire'; station: StationId; workerKind: WorkerKind }`,
  using the `nextWorkerSerial` that `GameState` has carried since slice 1 so
  replay ids do not diverge.
- **Agents may not staff Review.** Enforced in both `hire` and `requestMove`,
  not left as a comment in `tuning.ts` where it has sat unenforced since M0.
  This one rule is what §3 measures.
- Rejected commands are events, not silence — the player has to be told why the
  agent would not go.

**Step 2 — the pool, as a no-op.**

- `GameState.attention`, replenished per shift, spent by judgment actions.
- Shipped with a default budget the starting roster **cannot exhaust**. The
  golden replay hash must not move, and attention must bite only after the
  player has hired, so that the feedback is causal: *your hire did this*.

**Step 3 — sweep, then tune.** Finite budgets, headless, until the plateau in
§3 arrives for a legible reason instead of a mechanical one. Two shapes to
assert, per plan §5:

1. **Unlimited hiring plus a fixed attention budget plateaus** — plan §5 lists
   this as a lesson test and it currently has nowhere to live.
2. **The agent ordering survives the pool.** Agents must still be worth
   materially more after the constraint is unblocked than before it. If the
   pool flattens §3's 2.2% → 14.5%, the pool is wrong, not the finding.

### Swept, and it does better than plateau

`perHuman 1.6 · perAgent 0.85 · coordination 0.02 · reviewCost 1 · rebaseCost 2`,
8 seeds × 4000 ticks, each row at its own best WIP setting:

```
                    config   best    at  vs base
           starting roster    165  0.4x     0.0%
  +2 agents, no human hire    168  0.4x     1.7%
  +4 agents, no human hire    168  0.4x     1.7%
  +8 agents, no human hire    145  0.4x   -12.4%
           +1 human review    212  0.5x    28.3%
       +1 human, +2 agents    231 0.75x    39.5%
       +1 human, +4 agents    234    1x    41.4%
       +1 human, +6 agents    230 0.75x    39.2%
       +1 human, +8 agents    206  0.5x    24.6%
       +2 human, +4 agents    247    1x    49.4%
       +2 human, +8 agents    219  0.5x    32.4%
```

Both targets hold, and the first one holds harder than it was asked to.
**Eight agents with nobody to review them are worth −12.4%** — not a plateau, a
loss. Free capacity that draws on the budget Review runs on is worse than no
capacity at all, which is the sharpest form the design's currency rule could
take.

And it is a **hump rather than a ceiling**. The same fleet is worth +41.4% after
one human hire and +24.6% at twice the size, so the sixth agent pays and the
eighth costs. The best position on the board is `+2 human, +4 agents` at +49.4%
— **a ratio, not a maximum of either**, which is the decision the slice exists
to create. Nobody can read it off a single axis.

The first tuning attempt is worth recording because it failed in a way that
would have been expensive to find later. At `perHuman 4 · perAgent 3 ·
coordination 0.2` the pool did **nothing at all** across every realistic roster
— supply 8 to 52 against a demand of about 5 — and then fell off a cliff to
shipping *zero* on a large fleet, because the quadratic coordination term drove
supply negative. A mechanic that is invisible until it is fatal is not a
mechanic. Two fixes: put supply and demand on the same order so the meter moves
where the player can see it, and floor the pool at one review so a drowned line
crawls instead of stopping. A player cannot tell a mechanic they triggered from
an application that has hung, and there was no way back from it — rebasing costs
attention too.

**Step 4 — the screen.** *(next)* An attention meter that reads as a budget rather than a
score, the roster showing kind, and the refusal to staff Review with an agent
explained where the player tries it rather than in a codex.

## 6. Deferred, deliberately

**Context decay** (design §4.2) is specced as part of this slice in the
implementation plan and is not in the build above. It is a fourth mechanic in a
slice that already has three, and it is the only one of the four with no
measurement behind it yet. It gets its own slice — call it 3b — or it gets cut
into M2 with the rest of the agent economy.

The cost of deferring it is recorded so it is not lost: without decay, an agent
parked on work is free to leave and come back, so the design's sharpest
anti-pattern — *start five agents on five things and come back later* — is not
yet punished. Slice 3 makes agents reachable; it does not yet make them
mismanageable.
