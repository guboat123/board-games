# STATUS — board-games (ก๊วนบอร์ดเกม)

Last updated: 2026-08-31 · machine: BOAT-ZEPHYRUS

Public site: https://guboat123.github.io/board-games/ (GitHub Pages, branch `main`, root)

## What this is

Static Thai party-game site, 3 games:

| Folder | Game | Play mode |
|---|---|---|
| `games/catch-sketch` | วาดให้ทาย | one device, passed around |
| `games/color-clues` | เดาสีจากคำใบ้ | one device, passed around |
| `games/poker` | โป๊กเกอร์ (Texas Hold'em) | multi-device over LAN |

Poker needs `lan/server.mjs` — a dependency-free WebSocket relay + static server, run on one
machine on the WiFi. It is NOT part of the Pages deployment; Pages serves the two solo-device
games only. Start it with the `board-games-lan` entry in `C:\ClaudeCode\.claude\launch.json`
(port 8080), or `node lan/server.mjs`.

## Current work: agent playtest loop

The owner asked for: send agents to actually play → fix what they find → send agents again → repeat.

**Completion criterion (agreed with owner 2026-08-31):**
> **Category A (bugs that actually break something) = 0 for two consecutive rounds.**
> Categories B (confusion) and C (friction) are still collected and reported, but do NOT block.

The original criterion was "0 defects of any kind, two rounds running". It was changed because
three rounds of data showed the raw count measures *how hard the agent looked that round*, not how
many defects remain — each round invents new measurement lenses (colour ΔE, font ink metrics,
dead-code grep), so B/C findings never run out. Severity, by contrast, did converge.

### Round history

| Round | วาดให้ทาย | เดาสี | โป๊กเกอร์ | Note |
|---|---|---|---|---|
| 2 | 8 | 7 | 9 | game-breaking bugs present (freeze, chips to wrong player, poker page dead) |
| 3 | 5 | 4 | 8 | all fixed + verified |
| 4 | 6 | 7 | — | every round-3 fix held (100%); poker agent was stopped mid-run, no result |
| 5 | 5 (A2) | 5 (A3) | 13 (A6) | first agent check of the poker fixes: 6 of 8 held, 2 failed |
| 6 | 5 (A1) | 5 (**A0**) | 10 (A5) | first round judged by the new criterion; เดาสี is the first game to reach A=0 |
| 7 | 2 (**A0 B0**) | 3 (A1) | 4 (A1) | วาดให้ทาย reached A=0 *and* B=0 |
| 8 | running | running | running | final round — see "How this ended" |

## How this ended

The owner called it after round 8: **fix whatever round 8 reports as category A, then stop** — do
not keep going for the "A=0 twice running" condition.

That was the right call, and the reason is visible in the data above. From round 6 onward, a large
share of each round's findings were regressions introduced by the *previous* round's fixes — 5 of
poker's 10 in round 6, all 3 of เดาสี's in round 7, poker's A1 in round 7. The games stopped being
the bottleneck several rounds earlier; the loop was mostly chasing churn I was creating myself.
Insisting on two consecutive clean rounds across three games would have required six consecutive
flawless fix passes, which the history says was not a good bet.

State at close: the site has been playable since round 3. Every defect that made a game unplayable
(a round that froze dead, chips paid to the wrong player, a poker page that failed to boot, scores
counted twice, a table stuck waiting for someone who had left) is fixed and, where it involved money
or ownership, locked behind a test in `lan/tests/`.

Round 6 is where the cost of my own fixes showed clearly: 5 of poker's 10 findings were regressions
from the round-5 fixes, including a real money bug (chips vanished from the table whenever someone
pressed "← ออก" mid-hand, because the seat was deleted while its committed chips were still owed to
the pot). The test added for it then caught a *second* bug in the same fix — if the leaver was the
player on turn, the table stalled waiting for someone who had already walked away.

Two recurring self-inflicted patterns worth naming:
- **Declaring a property twice in one CSS rule.** `display: none` followed later by `display: flex`
  in the same block meant the result panel could never hide.
- **Putting a media query *before* the base rule it overrides.** Media queries add no specificity,
  so the later rule wins and the whole responsive block silently does nothing. This happened once in
  วาดให้ทาย and again in โป๊กเกอร์.

Round 7 (เดาสี) showed the same shape one level up: the positional-word rule added in round 6 was
itself over-broad (`กระดานโต้คลื่น` blocked) and bypassable with a space (`ตรง กลาง`). Fixed by
matching on *where* the word sits — at the start of a token it is a noun, at the tail it is a
location — and by re-checking the whitespace-stripped string the way the colour and coordinate
rules already did.

Round 5 is where the poker relay was finally stress-tested end to end, and it surfaced the worst
defect of the whole project: pressing "← ออก" never released the seat or closed the socket, so the
table waited forever for a player who had already walked away, and the room could never be reaped.
Fixed with a real `leave` message plus server-side ping/pong for sockets that die without a FIN.
Seat lifecycle (leave / away-expiry / full accounting) is now covered by `lan/tests/test-room.mjs`.

The pot display was also split in two: what the table shows is the chips physically on the felt,
while bet-size shortcuts compute from the contested portion only. That resolves the round-3
complaint (shortcuts computed from an inflated pot) and the round-5 one (pot read 20 when 30 was
on the table) at the same time, instead of trading one for the other.

Round 4 raised the count on both solo games while every earlier fix still passed — that is the
evidence behind the criterion change. It also showed ~2 of 13 findings were regressions introduced
by the previous round's own fixes, so each extra fix carries its own risk.

## Automated tests (must pass before any commit)

```
node lan/tests/test-payout.mjs     # side pots, seat-0 wins, dead-pot refund
node lan/tests/test-uncalled.mjs   # uncalled bet returns to its owner (+400-case money fuzz)
node lan/tests/test-room.mjs       # pot excludes uncalled money · seat takeover · host rights
node tests/test-clue.mjs           # clue rules, extracted live from color-clues/index.html
```

`test-clue.mjs` pulls the real code out of the HTML rather than copying the rules, so it fails if a
constant is moved out of the rule block — that has already caught one mistake.

## Hard constraints (from the owner — do not violate)

See `CLAUDE.md` in this folder. Summary: no build step, no npm, no backend, no `fetch()`/`import`
for project files (load via `<script src>` onto `window`), vanilla ES5-ish in IIFEs, relative paths
only, Thai on screen and in comments with English identifiers, localStorage always wrapped in
try/catch. Never touch `games/catch-sketch/words/` except the `-3` files (owner's data).

## Working notes for whoever picks this up

- **Never edit a game file while an agent is testing it.** Rounds 1 and 2 were both invalidated this
  way. Editing a game whose own agent has already finished is fine. `assets/style.css` is shared by
  both solo games (poker has its own theme and does not use it).
- **Verify your own fix in the browser before sending the next round.** Two rounds in a row, a fix
  of mine introduced a new defect that the next agent then reported.
- **Money and ownership bugs get a test**, always — that is why `lan/tests/` exists.
- Before launching a round: clear `localStorage` on localhost:8080, restart the dev server, close
  spare browser tabs (agents hit "tab cap reached" every round when tabs pile up).

## Handoff / waiting on owner

Nothing blocking. Round 5 results pending.
