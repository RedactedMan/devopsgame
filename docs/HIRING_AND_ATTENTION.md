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
   +8 agents, nobody to review 17    4.09    145   0.4x         –         145
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

**Two coordination penalties the evidence does support** (§5, *Checked against
the literature*) are deferred with the shape change rather than bundled into
it, because each is a mechanic with its own measurement to do:

- **Ownership overlap.** Attention spent when work crosses an ownership
  boundary — a second human on one station's WIP, an agent's output reviewed by
  someone who did not spec it. For a five-station line this makes the cost a
  function of humans *per station*, not roster size. Best-evidenced of
  anything in this document; belongs with board building (slice 5), which is
  where stations get shape.
- **Onboarding transient.** A newly hired person draws on a veteran's
  attention for a few shifts and supplies less meanwhile. This is Brooks's
  actual claim — adding people to a late project makes it later — as a shock
  rather than a steady state, and the only place a rising marginal cost
  belongs. Cheap to build; needs the money loop (M2) before hiring timing is a
  real decision.
