# Forecasting an opponent's hand from behaviour

Plan written 2026-09-03, after the realism scorecard reached 39 green cells.
Owner asked for this next, plus "and other things" — a backlog is at the bottom.

## What exists today

`bots.mjs` reads opponents with three functions and one number:

| | what it does |
|---|---|
| `claimedStrength(view, i)` | raises × 0.13, calls × 0.02, checks × −0.045, plus bet-size and all-in bumps → 0.05-0.95 |
| `credibility(view, i, live, byWhom)` | how believable that claim is: this player's showdown history, opponent count, auto-c-bet discount, re-raise bonus, river bonus, over-bet discount, heads-up discount, think-time signal → 0.15-0.95 |
| `guessStrength(...)` | `NEUTRAL + (claimed − NEUTRAL) × credibility` |

The result is one scalar, exposed to the decision as `f.threat` (the maximum over live
opponents) and `f.threatCred`. Only the pro reads `threatCred`; the pro and gambler read
`threat`.

This is already better than most simple bots — it separates *what they are claiming* from
*whether to believe it*, and it is per-opponent rather than per-table. It has never been
measured for accuracy.

## The four gaps

1. **The board is not in the read.** A pot-sized turn bet on A-2-2 rainbow and the same bet
   on 9♥8♥7♣ mean completely different things; the same number comes out for both. Real hand
   reading is *"what hands would this player bet this way, on this board"*.
2. **No narrowing across streets.** Each decision recomputes from raw counters. A player who
   called preflop, checked the flop, then raised the turn has told a story that rules a lot
   out; nothing carries forward except the counters.
3. **Memory is one number per opponent.** `readOf` stores strong/weak showdown counts in
   total. It cannot express "he raises flops with draws" or "his river bets are always real",
   which is exactly the knowledge that makes a read worth having.
4. **No uncertainty.** A read of 0.6 might mean "solidly medium" or "either the nuts or
   nothing". Those demand opposite responses — call the polarised one wider with a
   bluff-catcher, fold to the linear one. One scalar cannot say which.

## Order of work

Each stage is measured before and after with the same tool. **Nothing ships without the
accuracy number moving in the right direction and the 51-cell scorecard staying green** — a
better read is worthless if it makes the bots stop looking like people.

### Stage 0 — measure what we have (no behaviour change)

Add a read-only accessor so a tool can ask "what does bot A currently think about seat B",
then compare against the truth, which the harness can see: the opponent's real made strength
on the same 0-1 scale the guess uses.

Metrics, per level and per street:
- **mean absolute error** — how far off, on average
- **correlation** — does the guess move with the truth at all
- **calibration** — when it says 0.7, is the truth around 0.7, or is the whole scale skewed
- **strong-hand recall** — of the times an opponent really was strong, how often did the
  guess exceed the fold threshold (this is the one that costs money)

Ground truth uses hole cards the bot cannot see. That is fine for scoring the read; it must
never feed the decision. The tool takes it from the harness, not from `decide`.

### RESULT, 2026-09-03 — stop after stage 0's fix; the information is not there

Stage 0 found a fixable bias and fixing it worked (see STATUS). Stages 1 and 2 were then
built, measured, and **removed again** — both gave nothing outside noise:

| tried | result | kept |
|---|---|---|
| board texture damping the claim | separation +0.066 → +0.055, direction 0.249 → 0.230 | no |
| judging reveals by the made hand instead of hole cards | error 0.146 → 0.149, separation flat | no |
| per-street memory of an opponent's aggression | separation +0.067 → +0.069 | no |

Then the obvious question, which should have been asked first: **how much is there to read?**
Correlating the raw visible signal — money an opponent has put in this street — against their
real hand gives **+0.197 to +0.228**. The read as it stands scores **0.243 to 0.293**.

**The read already extracts more than any single visible signal carries**, by combining
several plus credibility and memory. That is why two rounds of improvement produced nothing:
the ceiling was already behind us.

This is a good outcome for what the bots are for. A bot whose hand strength can be inferred
from its betting is a bot a person beats by pattern-matching after fifty hands; ours cannot
be. Bet size correlates with hand strength at 0.098 / -0.001 / 0.212 and think time at 0.045,
both effectively unreadable.

**Stages 1-4 below are superseded.** Re-open only with a specific reason to believe more
signal exists — for example after adding a behaviour that genuinely leaks, or if the bots are
ever given a wider range of bet sizes tied to hand strength. The effort belongs in the
backlog instead, where nothing has been measured at all.

---

### Stage 1 — put the board into the claim  *(superseded — see result above)*

Scale the claim by what the board allows. A big bet on a dry, uncoordinated board is a
narrower claim than the same bet on a board where half the deck makes something.
`boardWetness()` already exists and is already computed each decision.

### Stage 2 — per-street memory of each opponent

Extend the mind's `foes` records with what was shown down after each kind of action —
"raised the flop and had it", "bet the river and had nothing". The showdown data is already
being observed by `rememberFoes`; it is being thrown away except as one strong/weak tally.
`credibility` then uses the street-specific rate instead of the overall one.

Storage cost is small and the file already survives restarts.

### Stage 3 — represent uncertainty

Return `{ strength, spread }` rather than one number: `spread` high when the same line is
consistent with both very strong and very weak hands (big river bet from a player known to
bluff), low when the line is linear. Pros use it to bluff-catch; gamblers ignore it;
beginners never see it.

### Stage 4 — narrowing across streets

Carry a per-opponent, per-hand read forward instead of recomputing from counters, so that
"checked the flop" still constrains what the turn raise can be.

## What "done" looks like

- The accuracy tool exists and runs in `run-all.mjs`.
- Every stage improved a measured number, and the scorecard stayed green.
- A person cannot beat the pro table by bluffing in an obvious spot — measurable by seating
  a scripted over-bluffing human and checking that it loses.

## Backlog after this ("and other things")

Ordered by how much a person would notice, most first:

1. ~~**Blind defence and stealing.**~~ **Done** - four scorecard cells. The pro was already
   inside every range; the beginner never attacked the blinds (2.1%) and now does (8.6%).
2. ~~**Turn and river barrelling.**~~ **Done** - now a scorecard cell. Pro 51.3%, gambler
   68%, beginner 26%, against a real 40-60% for a solid player.
3. ~~**Short-stack play.**~~ **Measured 2026-09-03, no work needed.** Pros are under 25 big
   blinds for 0.9% of their actions and gamblers 3.5%, because both top up. Beginners are
   short for **21.4%** of theirs - they only top up 35% of the time - and when short they
   fold 56%, call 23% and shove 2%. Calling off a short stack instead of shoving is the
   classic weak-player mistake, so that is the right behaviour for level 1, and the levels
   that would need push-or-fold discipline are almost never in the situation.
4. **Multiway discipline.** Bet sizing and continuation with four players in are different
   from heads-up; the scorecard currently checks heads-up only.
5. **Table talk / show-off frequency.** `maybeShowOff` exists and has never been measured
   against how often people actually show.
