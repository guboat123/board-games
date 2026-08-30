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
| 5 | running | running | running | first agent check of the 9 poker fixes from round 3 |

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
