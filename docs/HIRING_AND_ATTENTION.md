# Hiring and the attention pool

Companion to [GAME_DESIGN.md](./GAME_DESIGN.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).
Sibling to [CONSTRAINT_AND_CAPACITY.md](./CONSTRAINT_AND_CAPACITY.md) and
[DISPATCH_AND_COLLISIONS.md](./DISPATCH_AND_COLLISIONS.md).

Spec for M1 slice 3: `hire`, the human/agent split, and the scarcity that has to
bound them. Measured against the sim as it stands after slices 1 and 2, before
being specced — and as with the two slices before it, the measurement moved the
plan. Section 3 is the part that moved.

> **Superseded in part, 2026-09-23 — see §8.** People can no longer be hired.
> The team is fixed at nine, a person who is moved spends a while onboarding,
> and agents are the only thing a player can add. §2–§7 are kept as the record
> of how the game got here. Where they talk about hiring a human, read "moving
> one, and backfilling with an agent".

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

So attention exists to make hiring cost something. Design §3.4 is already
explicit about what attention is for, and it is not headcount:

> Money buys capacity. Attention buys judgment. Money cannot buy attention.

**The M1 reading**, recorded here because §5 of CONSTRAINT_AND_CAPACITY and §3.4
of the design doc do not currently agree and one of them has to give:

- There is **no money in M1**. Agent seats are free and effectively unlimited,
  exactly as the design says they are in the AI era. Agents are bounded by where
  they may stand, not by what they cost.
- **Attention is a per-shift budget that does not accumulate**, spent on
  judgment: reviewing, rebasing, and supervising agents.
- **Humans supply attention. Agents consume it.** Hiring a human raises the
  budget sub-linearly — a power law, per §5, after a Brooks's-Law quadratic
  was tried and did not survive the literature. Hiring an agent lowers what is
  left, because someone has to read what it produced.

That last line is what makes the trap close. A player who hires agents to get
past a review bottleneck spends the budget that the review bottleneck runs on,
and the meter says so while they do it.

### Corrected after the first playtest

This section originally claimed the pool was there "to price the *human* hire,
which is the only one that can reach the constraint." **That was false as
built**, and a playtester found it by asking the obvious question: *what stops
me just hiring more people?*

Nothing did. Humans *supply* attention, so the budget rose as the roster grew,
and `coordination` was set at 0.02 — inert until a team of roughly two hundred.
Measured: 13 people ship 242 and 109 people ship 242, with the attention supply
climbing from 13.7 to 60.2 along the way. Over-hiring was pointless and never
costly.

Worse than untidy, that was a hole in the milestone. **`+5 everywhere` reached
the same 242 ceiling as the careful 13-person roster without ever finding the
constraint.** Slices 1 through 3 exist to make *where* you add capacity the
skill; if capacity can be added everywhere, the question stops being asked. The
sweeps missed it because they only ever varied agents.

The fix was already in the model and mis-tuned, plus one modelling error
underneath it — see the retune in §5.

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

*(First tuning. Superseded by the retune below, which does not change the shape
of this table — the agent numbers survive it deliberately.)*

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

### Retuned for a team that can fit round a table

Prompted by the playtest question in §4. Two changes.

**A modelling error first.** Coordination counted communication channels
between *everybody*, agents included. Brooks's argument is about human
communication — an agent does not attend the standup or need keeping in the
loop on what four other agents are doing. What it costs is one person's
attention to read its output, which `perAgent` already charges linearly.
Counting agents in the quadratic charged them twice, and it only became visible
when the two terms were tuned together: every coordination value large enough to
punish a sprawling org also made four agents unaffordable. Channels are now
counted between people.

**Then the coefficient**, from 0.02 to 0.22, with `perHuman` raised to 2.4 to
keep the starting roster clear of the wall and `perAgent` to 1.2 to keep the
agent trap exactly where it was. 6 seeds × 4000 ticks, evenly grown rosters:

```
        9p    10p+1rev   13p+2r2i        14p        19p        24p    10p+4ag
       163         191        242        224        226         35        238
```

The peak is **thirteen people** — a two-pizza team, and it lands there because
of where they stand rather than how many there are. Nineteen ships *less* than
thirteen, so sprawl now costs rather than merely wasting; twenty-four cannot
review its own output and tips over. The agent numbers are unmoved: four agents
after a human hire still pay, eight still do not.

Both golden replay hashes survived the retune, which is the check that it
changed what happens when you sprawl and not the base game.

Two tests added for the lesson, because the milestone did not have one: a small
team in the right places beats a big one everywhere, and a big enough team
cannot review its own output at all.

**On the name.** "Two-pizza team" is Amazon's, and it is a management heuristic
rather than a research finding — nothing establishes six-to-ten as an optimum.
What is evidenced is the shape, not the number: per-person output falling as
groups grow is one of the oldest results in social psychology, and software
project data has repeatedly found small teams delivering comparable scope for
less total effort. The quadratic term here is Brooks's, which was itself an
argument from experience. So the sim is tuned to a defensible *curve* with a
memorable *label*, and the label is doing rhetorical work the evidence does not.

### Checked against the literature, and the shape does not survive

The paragraph above was written before the six claims behind the formula had
been checked. They were checked on 2026-09-20 — the full appraisal, claim by
claim with verdicts and sources, is at
<https://claude.ai/code/artifact/ce0492b6-ca71-4e42-add4-0f9553e2f959> — and
the hedge turned out to be aimed at the wrong thing. The label is fine. It is
the **shape** that is not supported.

**What holds.** That per-person output falls as a team grows is one of the
better-replicated results there is: Scholtes et al. 2016 and Gote et al. 2022
on GitHub, Putnam's QSM database, a randomised Lego experiment (Staats, Milkman
& Fox 2012: four people needed 54% more person-minutes than two for the same
build). Concavity is safe.

**What does not.** No observational dataset shows *total* output falling with
headcount. The repository studies find output ∝ H^0.66–0.80 — sublinear, and
still rising. QSM's 1,060-project comparison finds large teams *faster*, at
three to four times the cost and two to three times the defect density.
Gote et al. fitted the quadratic explicitly to test for an optimum: the H²
term is significant on its own, and **loses significance in seven of eight
productivity measures** once you control for the coordination structure it was
standing in for. What survives is a constant elasticity — doubling the team
costs each member 22–30% — and the measured coordination degree *saturates*
above about fifty developers rather than growing like n−1 per person. Brooks's
channel count is a model from experience; nobody has measured it and the one
group that looked found it does not hold. The peak-then-collapse in the table
above is Brooks's *transient* claim — adding people to a late project — written
in as a steady state, and the transient itself has never been measured either.

**The decision: adopt the power law.** The supply term becomes

```
supply_per_shift = perHuman · H^α − perAgent · A        α ≈ 0.7
```

with `perHuman` retuned so that the roster the lessons are measured on
supplies what it does today. Per-person supply then falls as `perHuman ·
H^−0.3` and never crosses zero. The band for α across the studies is 0.6–0.8;
0.7 is a reasonable bet, not a settled value, and one credible group finds the
exponent above one, so it is tunable and recorded as contested.

*Where to anchor it was got wrong the first time, and the sweep caught it.*
The decision as written anchored at thirteen people — `perHuman 2.33`, so
that 13 supplied 14.03 against the quadratic's 14.04 — on the reasoning that
the curves should agree up to where the evidence stops. But the agent lessons
are not measured at thirteen. They are measured at nine and ten, and there
the anchor at thirteen took a fifth of the budget away: the starting roster
fell from 13.68 to 10.85 against a measured peak demand of 10 per shift, and
`+1 human, +4 agents` went from +41% to **−3%**, shipping less than the human
alone. "The agent findings are untouched" was an assumption, and it was false.
Anchoring at nine instead — `perHuman 2.94`, 13.69 against 13.68 — reproduces
the agent table to within seed noise and leaves the starting roster's margin
exactly where it was. The cost is that thirteen people now supply 17.7 rather
than 14.0, which nothing measured depends on: a thirteen-person roster's
demand is about ten.

**Measured, built.** `perHuman 2.94 · α 0.7 · perAgent 1.2`, 8 seeds × 4000
ticks, each row at its own best WIP setting. The quadratic's numbers are
alongside for the rows it had — the human rows from the retune table, the
agent rows from the first tuning's, which the retune preserved.

```
                    config  heads  supply   best     at  ppl/ship   quadratic
           starting roster      9   13.69    165   0.4x     0.054         163
           +1 human review     10   14.73    212   0.5x     0.047         191
   +2 rev +2 impl (placed)     13   17.71    242  0.75x     0.054         242
    +2 everywhere (sprawl)     19   23.09    240  0.75x     0.079         226
             +3 everywhere     24   27.20    243     1x     0.099          35
             +5 everywhere     34   34.70    242     1x     0.141           –
       +8 agents, no reviewer     17    4.09    145   0.4x         –         145
       +1 human, +4 agents     14    9.93    232  0.75x         –         234
       +1 human, +8 agents     18    5.13    183   0.5x         –         206
       +2 human, +4 agents     15   10.95    245     1x         –         247
       +2 human, +8 agents     19    6.15    206   0.5x         –         219
```

Read the human rows downward: 242, 240, 243, 242. **Sprawl is flat, not
fatal.** Thirteen placed and thirty-four everywhere reach the same ceiling, and
the bill for it is in the `ppl/ship` column, which climbs monotonically the
whole way — 0.054 → 0.079 → 0.099 → 0.141 — which is what QSM actually
measured: the big team is not slower, it is three times as expensive. The
"too big" lesson moves from *supply goes negative* to *cost per unit climbs*.
The assertion that *a big enough team cannot review its own output at all* is
dropped and replaced by its inverse — twenty-four ships more than the starting
nine — so that a headcount cliff cannot creep back in unnoticed.

The agent rows are the first table's numbers to within noise. `perAgent` stays
a linear drain (DORA 2025 supports the direction, review being the bottleneck
AI exposes, and gives no magnitude), so *a fleet nobody can review is worth
less than no fleet* (145 against 165) and *four agents pay, eight do not* (232
against 183) both hold and stay asserted.

**What moved.** `coordination` left `tuning.attention` and `alpha` arrived;
`attentionSupply` and the header comment in `systems/attention.ts`; the
"Brooks, as a term" case in `attention.test.ts` now also asserts the marginal
person never goes negative, and the underwater case asserts only agents can
take the raw supply below zero; the two sprawl cases in `staffing.test.ts` are
rewritten as above. **Neither golden replay hash moved** — the decision
predicted they would, but `fingerprint` does not hash the pool, so a hash only
moves if the pool *binds*, and at `perHuman 2.94` neither script's does (the
staffed run has 2.3 to spare at its tightest shift end). At the abandoned
`2.33` anchor the staffed run would have bound once and the hash would have
moved, so the prediction was a symptom of the wrong anchor rather than a fact
about the curve. The floor of one review stays — it is now a guard against a
*large enough fleet* rather than a large enough roster, and the underwater
panel still needs it.

**What this reopens, on purpose.** §4's playtest question — *what stops me
just hiring more people?* — has its old answer back: in M1, nothing. A person
supplies less attention than the last and never costs any, so hiring humans
everywhere reaches the ceiling without the player ever finding the constraint,
which is the hole `be23cc4` closed with the quadratic. It is reopened
knowingly: closing it with a curve the evidence contradicts was teaching a
false lesson to protect a true one. The true one — the big team pays three
times as much per item — is in the sim's numbers and not yet on its screen,
because there is nothing to pay *with*. It waits for money in M2, and the
onboarding transient in §7, which is the part of Brooks that is actually his.

**What the evidence supports instead, deferred.** Two penalties are better
grounded than any headcount term and are recorded in §7 rather than built
here: a cost on *ownership overlap* — humans per station, work crossing an
ownership boundary — which is the largest coefficient in Gote et al. and the
strongest of Nagappan's Windows Vista predictors; and a *transient* onboarding
cost on a newly added person, which is the part of Brooks that is actually his
claim. If a channel term is ever wanted again it should saturate,
`k(1 − e^(−H/H₀))`, which is linear in H and is what the network data look
like.

**Step 4 — the screen.** *(built)* An attention meter that reads as a budget
rather than a score, the roster showing kind, and the refusal to staff Review
with an agent explained where the player tries it rather than in a codex.

The one thing the build added to this: **empty and underwater are different
panels.** A pool at zero because the shift has been spent is fixed by tomorrow;
a pool floored because the roster produces more than it can read is only fixed
by changing who is on the line. Printing the remainder alone cannot tell them
apart, and a player who read the second as the first would wait for a morning
that never comes.

## 6. Acceptance

Two halves, as with the slices before it.

**Mechanical, and settled.** [CONSTRAINT_AND_CAPACITY.md](./CONSTRAINT_AND_CAPACITY.md)
§7 target 3 — *the WIP optimum moves* — asserted in its strong form rather than
the weak one reallocation could support. Plus the two the measurement turned up:
a fleet nobody can review is worth less than no fleet at all, and the same fleet
is worth three times more once a human has unblocked it. All in
`staffing.test.ts`; the mechanism underneath them is in `attention.test.ts`.

**Played, and not yet run.** *A playtester who is told nothing about worker
kinds hires agents first, watches them do nothing, and can say why.*

That is deliberately the hardest of the three gates so far, because it is the
one this slice is most likely to fail. The failure mode is legible in the
numbers: two agents with no human hire are worth +1.7%, which is inside seed
noise, so a player who tries the cheap move first sees nothing happen and has
every reason to conclude that agents are useless. They are not — they are
queued behind a station they cannot staff, and are worth +41% the moment that
station is relieved.

The constraint panel says so when both conditions are true, which is the
mitigation as built. Whether that is enough is exactly what the play is for.

## 7. Deferred, deliberately

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

*Superseded 2026-09-27: built as slice 3b. The measurement, and how it moved
the mechanic away from the design's wording, follow.*

### Context decay, built 2026-09-27 (slice 3b)

**Where work can be parked.** Design §4.2 says "an item parked in a worker's
queue". Workers have no queues, and nothing is ever parked *with* a worker. A
move waits for the worker to finish what they hold (`applyPendingMoves` checks
`workerIsBusy`), so a slot is never orphaned. A review nobody can pay for
leaves the item unbound in Review's queue (`startService` breaks before it
binds). The only work bound to a worker and not progressing is a STALE item
holding its slot, and that is drift's. What does sit and wait is finished
agent output between Implement and Review: in Implement's outbound, then
Review's queue. So that is what decays.

Three departures from §4.2 follow from that:

- **A station queue, not a worker's.**
- **The reviewer re-briefs, not the agent.** The cost is a person working out
  what the agent did and why, not the agent reloading its own context.
- **Only agent output decays.** A person's work reviewed by another person is
  §7's ownership overlap, still deferred. Swept at a quarter of the agent rate,
  it took +8 agents at 0.5× from 139 to 81, which is a different mechanic's
  worth of effect.

**Charged in attention, never quality.** Drift already takes quality for
waiting, and design §9 rejects taxing one lesson twice.

**Measured first.** Scratchpad harness, 12 seeds × 4000 ticks, diligent
rebaser, agents at Implement from t=0. With decay off it reproduces the §8
table to the item.

The finding that shaped the rule: **a wait-keyed attention charge cannot
reach the ignore pattern at its best WIP setting**, for two reasons.

- At tight WIP the agents barely work. Workers pick up items in roster order,
  people first, and Implement's limit (3 at 0.4×) leaves the agents little.
  Across 12 seeds, five agents at 0.4× produced 35 reviews' worth of output.
  "Start five agents on five things" is only reachable with the sliders
  loose.
- The ignore player is bound by Review's *capacity* (one person, 96%
  utilised, spending 3.7 attention a shift out of 7.7). The player who moved
  a person to Review and backfilled with agents is the one running near the
  attention wall. A gentle charge lands on them.

So every rule without a grace period backfired:

```
                                   best WIP (vs 165)            1× (untouched sliders)
rule                         +5 ignore  move1+4  move2+4      +5 ignore  move1+4
off                            169      223      230            116      210
linear 1/shift, cap 2          169      221      211            113      185
saturating max 2, τ 1 shift    169      210      209            114      181
step: grace 1 shift, +4        169      223      230            107      180
ramp: grace 1 shift, 4/shift   169      223      230            108      192   ← built
```

Agent output on a well-tuned line never waits a shift: move 1 + 4 agents at
0.75× has a 99th-percentile wait of 48 ticks. Five agents with the sliders
untouched have a median wait of 169. A one-shift grace sits between the two.

At 24 seeds on the deciding rows the ramp leaves every cited number where it
was (164, 166, 143, 222, 230 at best WIP), and five agents at 1× go from 117
to 108 against the starting team's 114. **Five agents and nothing else were
worth +2.6% at the settings a new player starts on, and are now worth −5%.**
That is design rule 3 holding there for the first time.

What it also does, stated plainly: the bite tracks WIP, whoever you are,
because a wait is WIP over throughput. Move 1 + 4 agents left at 1× goes from
211 to 193. That is read here as agents amplifying what loose WIP costs, in a
different currency and on agent output only, rather than as drift's lesson
charged twice. A playtest could say otherwise.

Also swept and not built: charging the re-brief as Review *time* instead of
attention. It separates about as well, but it is not attention, and it moved
the staffed golden replay to `3cee5d35`.

**As built.** `contextDecay` in `content/tuning.ts`: `graceTicks` 80,
`perShift` 4, `max` 4. An agent finishing an item at the station before
Review stamps `agentOutputSince`. A person finishing it, including reworking
it, clears the stamp. Review picks items first-in-first-out and pays
`reviewCost + min(max, perShift × shifts late)`, and `contextFidelity` drains
to match so the board can draw it (`systems/context.ts`).

**The charge is clamped to one shift's budget.** The budget is floored at a
single review, and +8 agents put it at 4.09 while a fully decayed item costs
5. Unclamped, Review would never start again, the hang `attention.ts`
documents. In the sweep the clamp fired on every Review pickup at +8 agents,
0.75× and looser.

**On the board**, agent output waiting for Review carries a bar in agent blue
along its top, draining once the grace is up, and on a laptop the label reads
`agent +1.4`, what picking it up now would cost. The attention panel says how
many have waited over a shift and what they will cost between them.

**Golden replays.** Both existing hashes held, `bbf2d633` and `7ce23854`,
because neither run keeps agent output waiting a shift, which also means
neither pins the mechanic. A third was added: five agents hired at tick 30 on
seed 20260830 and nothing else touched, 1500 ticks, `e97ce11e` (`87dcabe9`
with decay off). `pnpm sweep` is unchanged, because it runs no agents.

**Two coordination penalties the evidence does support** (§5, *Checked against
the literature*) are deferred with the shape change rather than bundled into
it, because each is a mechanic with its own measurement to do:

- **Ownership overlap.** Attention spent when work crosses an ownership
  boundary — a second human on one station's WIP, an agent's output reviewed by
  someone who did not spec it. For a five-station line this makes the cost a
  function of humans *per station*, not roster size. Best-evidenced of
  anything in this document; belonged with board building (slice 5), which is
  where stations get shape. Slice 5 was removed from the plan on 2026-09-28
  (IMPLEMENTATION_PLAN §4), so this is unbuilt and has no slice.
- **Onboarding transient.** *(Built in §8, for moves rather than hires.)* A
  newly hired person draws on a veteran's attention for a few shifts and
  supplies less meanwhile. This is Brooks's
  actual claim — adding people to a late project makes it later — as a shock
  rather than a steady state, and the only place a rising marginal cost
  belongs. Cheap to build; needs the money loop (M2) before hiring timing is a
  real decision.

## 8. The team is fixed

Decided 2026-09-23. **People are no longer hired.** The nine the game starts
with are the team. Moving one to another station costs an onboarding period.
Agents are the only thing a player can add.

### Why

Two reasons, one about the game and one about the room it will be played in.

- **Hiring taught the wrong lessons.** Deciding how many people to hire, and
  when, is a management lesson. The game is about WIP and flow. And in M1
  nothing stopped a player hiring people everywhere: §5 reopened that hole on
  purpose, waiting for money in M2 to close it. A fixed team closes it by
  construction, and needs no penalty invented to do it.
- **The game will be played in a 30–45 minute session.** A short talk on
  DevOps, then everyone in the room plays, then a leaderboard. That needs one
  short game, the same for everyone, with the decisions a player has to find
  kept to the ones the talk just introduced. An economy of hires is not one of
  them.

Removing staffing changes entirely was considered and rejected. Two of the
milestone's measured lessons need capacity to change somewhere: the WIP
optimum moving (§2, CONSTRAINT_AND_CAPACITY §8), and money not being able to
buy attention (§3). Agents are where the capacity comes from now.

### Measured: nothing important is lost

12 seeds × 4000 ticks, diligent rebaser, always nine people. Moves and agents
are set at t=0, so these are steady-state numbers with no onboarding in them.

```
                      config    0.4x   0.5x  0.75x    1x   1.5x   best     at   vs base
             starting team       165    165    132   115    103    165   0.5x     0.0%
    [old] hire 1 for review      187    209    188   161    142    209   0.5x    26.6%
          move impl→review       179    165    138   119    103    179   0.4x     8.6%
            move ci→review       184    188    162   150    136    188   0.5x    13.8%
        move 2 impl→review       121    110     91    74     63    121   0.4x   -26.6%
        +4 agents, no move       169    161    125   116    103    169   0.4x     2.2%
        +8 agents, no move       143    140    118    98     78    143   0.4x   -13.2%
     move 1, +1 agent impl       187    209    188   161    143    209   0.5x    26.6%
    move 1, +4 agents impl       183    209    223   210    202    223  0.75x    34.8%
    move 2, +4 agents impl       183    209    230   216    202    230  0.75x    39.3%
    move 2, +6 agents impl       187    207    187   169    142    207   0.5x    25.1%
```

- **One person moved to Review and one agent to fill their place ships
  exactly what the old human hire did.** 209 against 209. Every station has
  the same number of workers in both.
- **The WIP optimum still moves**, from 0.4–0.5× on the starting team to 0.75×
  once the constraint is relieved and backfilled. 0.4× is the best setting at
  the start and costs a fifth of the line after (183 against 230). Target 3's
  strong form holds.
- **The agent trap holds.** Four agents with nobody moved to Review are worth
  +2.2%. The same four after the move are worth +34.8%. Past four it turns
  down again, so the player is still looking for a ratio.
- **The ceiling drops about 5%**, from 242 with thirteen people to 230 with
  nine. There is still a best configuration to find, and it is still not a
  maximum of anything.

### Two lessons hiring could not teach

- **You can over-correct.** Two implementers moved to Review with nothing to
  fill the gap ship *less* than the untouched line, 121 against 165. Implement
  becomes the constraint. With hiring there was always another body to add;
  now the constraint moving is something the player can do to themselves.
- **Where the person comes from matters.** From CI, which has slack, the move
  is worth +13.8%. From Implement, which is nearly as busy as Review, +8.6%.

Both are asserted in `staffing.test.ts`, under *a fixed team*.

### Onboarding

A person who is moved spends `onboarding.ticks` learning the new station.
While they do, anything they start takes `serviceMult` times as long, and each
shift's attention budget is `attentionPerShift` lower, because someone who
knows the station is answering their questions. Every move restarts it,
including a move straight back. Agents do not onboard, and moving one costs
nothing. (This used to say what an agent loses by moving is context, slice
3b's mechanic. Slice 3b turned out to be about output waiting for review, not
about moving; see §7.)

Values: **two shifts (160 ticks), half speed, 1.2 attention per
shift** — the same draw as an agent. Measured with each move made at t=1200,
after the constraint has been named, which is when a player would first act.
Whole-run shipped, 12 seeds:

```
                        script     none   1sh    2sh    3sh  2sh×3,a2   4sh
                     stay 0.5x    165.1  165.1  165.1  165.1    165.1  165.1
                ci→review 0.5x    186.9  182.9  180.3  183.5    182.7  181.8
     impl→review +1 agent 0.5x    202.2  202.2  195.9  195.5    198.8  198.2
             full play → 0.75x    200.0  209.2  202.4  198.0    204.5  201.5
        ci⇄review every 2 shifts  183.3  182.3  179.8  179.8    173.6  179.8
        ci⇄review every 4 shifts  176.9  175.7  176.8  174.8    173.9  176.8
        ci⇄review every 8 shifts  175.8  172.3  175.3  176.6    178.0  176.5
```

(Columns are ×2 speed and 1.2 attention unless labelled. The *full play* row
moves an implementer, adds two agents, and retunes to 0.75× 400 ticks later.)

What this does and does not show:

- **A good move still pays, comfortably.** Onboarding costs a good move 3–7
  items. The same moves are worth 15–37 over staying put. Asserted: moving a CI
  person to Review at t=1200 must beat staying by 5%.
- **The noise is about as big as the effect.** The *full play* row is not
  monotonic: 200 with no onboarding, 209 with one shift. At twelve seeds,
  differences under about ten items in one cell are not a finding.
- **Onboarding does not, at these values, punish moving people back and
  forth.** Swapping a CI person between CI and Review is already a little
  worse than one committed move with no onboarding at all (183, 177, 176
  against 187). Onboarding does not widen that gap by anything the noise
  can resolve. Only the harshest variant tried (two shifts, a third of normal
  speed, 2 attention) moves it, and that costs good moves too.

So as tuned, onboarding is **a small, visible cost, not a deterrent.** The
chip shows who is still learning, and the attention panel says someone is
answering their questions. Whether that is enough for players to hesitate
before a move, which is the lesson Brooks's Law is actually about, is a
playtest question. The sim cannot answer it at a size the noise would allow.

**Decided 2026-09-23: keep it mild.** The alternative was to push
`serviceMult` or `attentionPerShift` up until moving people back and forth
visibly cost something. That also narrows what a good move is worth, and a
good move — relieve the constraint, backfill with agents — is the lesson the
session is built to teach. Brooks's Law is not. So the values above stand.
Onboarding is there to make a move feel like it cost something, not to make
the player afraid of moving. Revisit only if playtesting shows players
reshuffling people every shift and doing well out of it.

### What this retires

- **The power-law supply curve is inert in play.** With the team fixed at
  nine, `perHuman · H^α` is a constant 13.69. §5's curve, and `alpha`,
  still decide what that constant is, and still apply to sweeps that set
  `staffing`. No player moves along the curve any more. The tests that
  asserted sprawl reaches the same ceiling at higher cost are removed, because
  sprawl can no longer be reached. The mechanism test in `attention.test.ts`
  stays.
- **`hire` adds agents only.** `{ kind: 'hire'; station }`. The `workerKind`
  field is gone, and so is the HUD's *+ person* button.
- **The second golden replay was re-recorded**, `3a359b81` → `7ce23854`. It
  used to hire a person at Review; now it moves W2 there. The new hash depends
  on onboarding (`4695148a` without it), so it pins the mechanic. The first
  golden replay never moves anyone and did not change.

### The session (built 2026-09-23, slice 3d)

- **Everyone plays the same game.** The presenter opens `?present` and starts
  a session. It gets a five-letter code and a seed, 20260830 unless the
  presenter picks another. Players join at `?join=CODE` and play that seed
  for 4000 ticks, the length every table in this document was measured at:
  about 13 minutes at 1×, 3½ at 4×. The clock stops there, and a restart
  replays the same seed.
- **The score is quality-weighted shipped**: the sum of `trueQuality` over
  every shipped item (`sessionScore`, `packages/sim/src/session.ts`). Drift
  takes quality off an item as it deploys, so a stale item shipped anyway
  counts for less than one that was rebased. Items shipped alone would have
  rewarded exactly that move. Shown at the end of the run only, because the
  snapshot hides true quality while the game runs.
- **Scores are replayed, not trusted.** The bridge logs every command against
  the tick it was applied at (`stepLogged`). The Worker parses the log,
  replays it against the session's seed, and ranks what the replay produced.
  `session.test.ts` asserts that a logged live run replays to the same
  fingerprint.
- **The debrief is the board.** Clicking a row on the presenter's screen lists
  that player's best run as a timeline: moves, agents, WIP changes (a slider
  drag collapsed to where it was let go), and every stale call.


## 9. Agents can be removed

Decided 2026-09-28, after a play of the deployed game. **An agent can be taken
off the roster.** `{ kind: 'removeAgent'; workerId }`. People still cannot:
the team is fixed (§8), and a person refused is told so
(`staffingRefused`, `why: 'teamIsFixed'`).

### Why

Until now an agent was a one-way door. Each one draws `perAgent` for the rest
of the run, and nothing in the game said that before the player clicked
*+ agent*. The lesson is that the fleet is sized by review capacity. A player
who has learned that should be able to act on it, not only on the next run.

### The run that found it

A playtest moved three implementers to Review and added five agents to
Implement at about day 15, with Implement's WIP limit at 7 and Review's at 5.
Throughput fell to 0–2 a day and stayed there. Reproduced headless, 8 seeds,
the same moves at t=1200:

```
day after the move:  1    2    3    4    5    6    7    8   ... 35
shipped per day:    2.1  5.9  3.0  2.8  2.4  1.5  1.8  1.3 ... ~1.0
attention budget:   4.2  4.1  7.5  7.7  7.7  7.7 ...
```

The mechanism is context decay (§7) with no way back. Five agents leave 7.7
of 13.7 attention. Three people onboarding take another 3.6 for two shifts.
Agent output queues for Review while the budget is at 4, waits past the
grace, and then costs 5 to review rather than 1. At 7.7 a shift that is about
1.5 reviews, so the next batch waits too. The same roster and sliders set
from t=0 ship 3.5 a day, because there is no queue of stale agent output to
start the spiral. **The re-brief spiral is a place a line can fall into, not
a property of the roster.**

### Measured: removing helps, the sliders help more

From inside that spiral at t=2000, shipped per day over the last ten days of
a 4000-tick run, 12 seeds:

```
do nothing                   1.0
remove 2 agents              1.2
remove 3 agents              1.8
remove all 5                 0.5     one implementer is left
all sliders to ~0.5×         4.2
remove 3 + sliders ~0.5×     3.2
```

Removing agents is worth something and is not the fix. Tightening every WIP
limit stops agent output queueing for Review, which is what keeps the spiral
going. That is the game's first lesson again, and it is kept that way on
purpose: removal is an undo for a hire, not a second answer to the WIP
question.

### Rules

- An idle agent leaves the tick it is removed. A busy one finishes its item
  first, the same rule a move follows (`leaving` on the worker, applied in
  `applyPendingMoves`), and draws attention until it has gone.
- Assigning a leaving agent to the station it stands at keeps it, the way the
  same gesture calls off a move.
- Worker ids are never reused, so a replay that removes and then hires
  addresses the same agents.
- No golden replay and no rules probe moved: no existing run can contain the
  command, so `RULES_VERSION` stays 1. A save that uses it will not load in a
  build from before this change.

### The Rebase button that did nothing

The same playtest reported that Rebase did nothing when clicked. It was
working as designed, and failing to say so. A rebase costs `rebaseCost` (2)
attention and the sim refuses it when the shift cannot pay, while abandon and
ship-anyway stay open (§4). In the run above the refusal fired 1,458 times:
Review spends the budget as soon as it refills, so a rebase never got a turn.
The HUD showed the button live the whole time. Now the button carries its
cost (*Rebase · 2*), goes dead when the budget is short, and the stale list
says why and what is still open. The sim is unchanged.

## 10. The session can be won

Decided 2026-09-28. **Free play stays unwinnable, and the session gets a win
line.** Free play keeps its arrival rate of one item every 16 ticks, five a
day, which no line in any sweep can finish. The session (`SESSION_TUNING`)
arrives every 20 ticks, four a day. A session run is **won if 10 or fewer
items are unfinished when the clock stops** (`SESSION_WIN_UNFINISHED`). The
leaderboard still ranks by score, which is shipped work weighted by the
quality it shipped at. Among players who kept up, that ranks on quality.

### Why

A game about flow where the backlog always wins is honest, and free play
should stay that way. A room of first-time players, though, needs a result
they can reach in one run and recognise when they get it. "You kept up" is
that result, and it has to be reachable only by the moves the talk teaches.

### Where the line sits

Decisions made at day 10 (t=800), when the board names the constraint.
Stale work rebased as it appears. 12 seeds, 4000 ticks. *Unfinished* is the
backlog plus everything in flight. The first column is the session seed,
20260830.

```
arrival every 20 ticks (4/day)        session   min  med  max   score  shipped
untouched                                 58     58   78  116    108      122
sliders 0.5×                              47     20   44   65    148      160
+5 agents only                           114     43   89  121    102      115
sliders wide open (3×)                    49     49   99  117    100      112
ci→review, 0.5×                            6      4   21   54    170      184
ci→review +1 agent at CI, 0.5×            15      5   15   48    177      189
impl→review +4 agents, 0.75×               4      3    4    8    182      195
2 impl→review +4 agents, 0.75×             4      3    5    9    182      194
ci+impl→review +4 agents, 0.75×           44      9   39   70    156      172
the §9 playtest (3 moved, +5, 7/5)         4      2    8  145    145      156
```

At 10, every seed of the two good plays wins, with a worst case of 9. Every
play that leaves Review alone loses on every seed. Moving one person without
backfilling wins on some seeds and not others, which is where the line
should leave it. At five a day nobody keeps up. At three a day (every 24
ticks) the untouched line finishes with a median of 21 unfinished and the
sliders alone reach 6, so nearly anyone wins and the line means nothing.

The §9 playtest play wins on the session seed and on most others. At four a
day its spiral usually does not start. Its score (145) is well below the good
plays (182), so the leaderboard still ranks it where it belongs.

### Unfinished, not backlog

The line was first proposed as backlog alone. It cannot be. A loose WIP limit
pulls the backlog onto the board, and *sliders wide open* above ends with a
backlog of 0 on the session seed while 49 items sit unfinished in the line.
A backlog target is one the sliders can hit without shipping anything, which
is the opposite of the lesson. So the line counts work in flight as well.
`session.test.ts` asserts that the wide-open play empties the backlog and
still loses.

### What it does to the numbers the debrief cites

The talk's numbers were measured at five a day. At four the ceiling is the
arrival rate, so good play shows up in lead time and in keeping up, not in
the count shipped. 12 seeds, 4000 ticks, decisions from t=0, as in §8.
Shipped / mean lead time:

```
session (4/day)              0.4×      0.5×     0.75×       1×     1.5×    best   vs base
starting team             168/38h   167/39h   135/65h   121/62h  111/71h    168     0.0%
+4 agents, no move        165/40h   159/42h   137/58h   124/62h  112/65h    165    -2.2%
+8 agents, no move        145/65h   136/67h   100/88h    86/90h   76/91h    145   -14.0%
move ci→review            174/35h   182/21h   170/27h   166/27h  160/28h    182     8.5%
move 2 impl→review        122/79h   108/88h    96/93h    79/99h   71/92h    122   -27.5%
move 1, +4 agents impl    176/33h   190/15h   190/13h   190/13h  189/12h    190    13.2%
move 2, +4 agents impl    176/33h   190/15h   191/12h   190/13h  190/12h    191    13.3%
```

The same harness at five a day reproduces the §8 table to the item, so the
two are comparable. What moves:

- **WIP.** 0.4× against 1× on the starting team: 39% more shipped at 39%
  lower lead time (168/38h against 121/62h). Free play, as the README's
  sweep table has it: 43% more at 26% lower.
- **Agents with nobody moved.** Four are worth −2%, eight −14%. Free play:
  +2% and −13%.
- **Move and backfill.** +13% shipped rather than +35%, because there is
  only so much work to ship. The difference is lead time: 38h down to 13h,
  about a third. That is the number to cite in the room.
- **Two implementers moved with no backfill:** −28%, where free play has
  −27%.

### Rules

- `SESSION_TUNING` and `SESSION_WIN_UNFINISHED` live in `content/tuning.ts`.
  `verifyRun` replays under the session tuning, and a player's tab plays
  under it (`useSim`'s `tuning` option). Free play and saves are untouched,
  and the free-play `RULES_PROBE` did not move.
- The session has its own `SESSION_RULES_VERSION` (1) and probe, which
  hashes the session tuning, the win line, and a fourth golden,
  `GOLDEN_SESSION` = `bc06fb23`. That golden is the first to play a whole
  session: the good play at day 10, rebasing every 20 ticks, and it wins.
  A session page sends it with its join and its run, and the Worker refuses
  a mismatch with 409 (2026-09-28, IMPLEMENTATION_PLAN §3).
- The line is set for a full 4000-tick session. The API still accepts a
  shorter one (400 ticks and up) for the end-to-end test, and a run that
  short can keep up by accident, because only about 20 items have arrived.
  The presenter screen always starts a full session.
- A board row stores `unfinished` (a new nullable column, added to an
  existing session's table on first touch). A row from before 2026-09-28
  shows "–".
- The HUD in a session shows *Unfinished* against the line (`5 / ≤10`) in
  the top bar, in place of WIP on a phone. The end screen leads with *You kept
  up* or *The work got ahead of you*, and the presenter's board has a
  *Kept up* column.
