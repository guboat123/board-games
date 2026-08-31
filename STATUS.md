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
games only.

**To play locally, double-click `Board games.bat` in the desktop launcher hub**
(`<OneDrive>\Desktop\ClaudeCode Systems\`) — it starts the server and opens the browser, the same
shape as the PFM and 4PET launchers. The master copy lives in the repo at `lan/start.bat`; re-copy
it to the hub on a new machine. It is safe to double-click twice: if port 8080 is already listening
it just opens the browser instead of starting a second server. The server window prints the WiFi
address other devices need for poker.

Other ways in: the `board-games-lan` entry in `C:\ClaudeCode\.claude\launch.json`, or
`node lan/server.mjs`.

## Current work: agent playtest loop

The owner asked for: send agents to actually play → fix what they find → send agents again → repeat.

**Completion criterion (agreed with owner 2026-08-31, then superseded — see "How this ended"):**
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
| 8 | 7 (A2) | 5 (A1) | 3 (**A0**) | final round — every category A fixed and verified; B/C left open on purpose |

### Round 8 — the closing round

All three category-A defects are fixed and verified in the browser.

**วาดให้ทาย — A2.** The sticky button bar I added in round 7 turned out to be an opaque sheet
floating over the form, and it swallowed taps meant for the controls underneath. Tapping "1 รอบ"
**started the game** with the old value; tapping a leader chip jumped to the setup screen; the name
field would not take focus. Fixed by removing `position: sticky` from the players and setup screens
— both are scrollable forms, so the button belongs at the end of the form. (The button that must
stay in view *during play* is on a different screen and was not touched.) Re-measured every tap
point at both reported sizes: 375×667 → 182 points, 360×640 → 190 points, **0 hijacked**.

**เดาสี — A1.** The round-7 rule "`กระดาน` at the tail of a word = positional" was too broad.
`ไม้กระดาน` `แผ่นกระดาน` `พื้นกระดาน` `หมากกระดาน` — and worst, `เกมกระดาน` — were all rejected as
"telling the position on the board", on a site called ก๊วนบอร์ดเกม. The decider is now the word
immediately *before* `กระดาน`, not its index: a positional connector (`บน` `มุม` `ของ` `ริม` `ขอบ`
`กลาง` …) blocks, anything else passes. Swept all 76 words the agent had verified — correct on every
one — added cases to `tests/test-clue.mjs`, and confirmed by typing into the real clue field.

**โป๊กเกอร์ — A0.** 45+ hands across 9-player, 3-player and heads-up tables, with a bot auditing
every state frame. `Σstack + pot = Σbuy-ins` was never wrong, including all-in-then-leave, leaving
while on turn, socket death mid-flop, and reload mid-hand. Hole cards stayed `??` on every frame
until showdown — 0 leaks. 0 console errors.

### Known remaining (deliberately not fixed)

Left open by the owner's decision to close after round 8. None of these break a game.

**วาดให้ทาย**
- B1 · the disabled all-done button reads "ต้องมีคนคว้าคิวหรือยอมแพ้ก่อน", but a single give-up does
  not actually unlock it — the text wants "หรือทุกคนยอมแพ้ก่อน".
- C1 · the "ต้องเหลือชุดคำอย่างน้อย 1 ชุด" warning never clears once shown.
- C2 · `#s-word .word` wins on ID specificity, so both short-screen media blocks are dead.
- C3 · 360×500 (split screen): the button lands ~37px below the fold.

**เดาสี**
- B1 · positional words with a prefix slip through: `ด้านซ้าย` `ข้างบน` `แถวบน` are accepted while
  `ซ้ายบน` is blocked. Fix is additive — extend `BANNED_POS_IN` with the `ด้าน/ข้าง/ฝั่ง/แถว/ขอบ`
  + direction pairs.
- B2 · colour names in tail position slip through: `ชาเขียว` `มะเขือม่วง`. Needs care — `มะม่วง`
  must keep passing, which is why the rule compares whole tokens today.
- C1 · in clue field 1 a spaced positional phrase reports the word-count error instead of the
  positional one (field 2 gets it right). Still blocked, just with the less useful reason.
- C2 · resuming mid-round re-rolls the card but does not release the clue that round already
  consumed, so the clue-giver is told "คำใบ้นี้ใช้ไปแล้วในเกมนี้" for a round nobody ever answered.

**โป๊กเกอร์**
- B1 · a timed table shows "หมดเวลา · เล่นตานี้ให้จบ" before the first hand is dealt — `msLeft()`
  returns `null` until `startedAt` is set, and the page does `null || 0`.
- C1 · **regression of mine.** `@media (max-height: 700px)` caps `.hand-area` at 108px while the
  content is ~129px, and the box is `justify-content: flex-end`, so the overflow rides *upward* out
  of the box and onto the log — 1,747 px² of text over text at 360×640. One-line fix: raise or drop
  that cap.
- C2 · a third payout row is clipped with nothing to signal that it scrolls.

## How this ended

**Closed 2026-08-31 after round 8. Category A is 0 across all three games.**

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

## Poker: what the owner asked for after playing (2026-08-31)

Playing a real game surfaced one hard stop and a list of wants. All done:

- **Could not keep playing after a hand.** Two causes. `render()` closed the amount
  panel whenever it was not your turn — at showdown it never is, so every incoming
  state slammed the rebuy panel shut before the busted player could confirm, and the
  table could never get back to two players with chips. And the disabled "next hand"
  button was invisible: `.act[disabled]` dimmed the whole button to 32% opacity, and
  the gold variant uses near-black text, so the label and its reason both fell to
  1.9:1 contrast. Fixed both — only the bet panel auto-closes now, and disabled
  buttons have their own colours (7.87:1 label, 6.23:1 reason). The reason text was
  also wrong: it always claimed "need at least 2 people" even when two were seated
  and one was simply out of chips.
- **Animation.** Cards deal in, flip at showdown, the pot bumps when it grows, and the
  result panel pops. Only genuinely new cards animate, once per hand — the server
  broadcasts state several times per action, so a naive implementation restarts the
  animation on every broadcast and you see nothing.
- **Buy-in and P/L table.** The "โต๊ะ · เงิน" panel, opened from the top bar.
- **Change seats at the table.** The empty rows of that same table are the move
  buttons. Server-side `moveSeat` refuses mid-hand (turn order is keyed to seat
  number) and refuses seats held by a disconnected player (their chips are still
  there). Host rights follow the person, not the seat.
- **Action log with decision times**, for studying play patterns. Per-player summary
  plus a hand-by-hand log, copyable as text. Sent only on request.
- **Drag-to-size betting**, like Pokerrrr 2. The number pad still works.
- **Turn clock** (30s default) with tournament **time-bank cards** (3 per player, +30s).
  The room stays pure logic — `server.mjs` calls `table.tick()` once a second and the room
  auto-checks, or folds when there is money to call, so a table never stalls on someone who
  walked away. It refuses to fold the last player standing.
- **Pre-actions** (fold / check-fold / call-any) while waiting. Fold and check-fold last the
  whole hand; call-any expires each street so a later raise cannot be called by a stale
  instruction.
- **Sound**, synthesised live with Web Audio — no audio files, so the no-assets constraint
  holds. Knock, chips, deal, muck, turn alert, hurry-up, win. Mute button in the top bar,
  remembered in localStorage.
- **Per-player history that survives restarts**, in `lan/data/` (gitignored — it is data, not
  code). Keyed by the **device token** the client already keeps in localStorage for seat
  reclaim (`bg.poker.token.v1`), falling back to IP only when the browser cannot store it.
  It was IP-keyed first; the token is better because moving between WiFi networks, or a
  router handing out a new lease, no longer creates a second person. The names a device has
  used are stored alongside, so a rename does not split the record. Written temp-then-rename
  so a crash cannot leave a half-written file. Remaining caveats, stated in the UI rather
  than hidden: clearing browser data, a private window, or a different device all read as a
  new person, and two people sharing one device still count as one.
  The earlier IP-keyed file is kept beside it as `players.ip-legacy.json`.
- **A diagnostics screen**, so a problem in a real game can be screenshotted instead of
  described. Open it with `?debug=1` or by tapping the blinds five times (phones cannot
  easily edit a URL). It shows socket state and drop count, how long the longest gap between
  server updates was, the current hand, every seat, the last ten commands sent, non-state
  server messages, and any JavaScript errors — captured from the first line of the script,
  including unhandled promise rejections.

### Verified with a bot swarm, since no players were available

`swarm.mjs` (in the session scratchpad, not the repo) opens N real WebSocket connections and
audits **every** state frame. Full table, 9 players, 40 hands, 29,827 frames:
chip conservation never violated, no hole card ever visible to another seat, and 2,804
out-of-turn or invalid commands correctly rejected by the server.

Note for whoever repeats this: the first version of that auditor reported 164 false money
errors because it compared against a buy-in total that was still being filled in while bots
were joining. Gate the audit on all seats being occupied before believing it.

## Automated tests (must pass before any commit)

```
node lan/tests/test-payout.mjs     # side pots, seat-0 wins, dead-pot refund
node lan/tests/test-uncalled.mjs   # uncalled bet returns to its owner (+400-case money fuzz)
node lan/tests/test-room.mjs       # pot excludes uncalled money · seat takeover · host rights
node tests/test-clue.mjs           # clue rules, extracted live from color-clues/index.html
node lan/tests/test-history.mjs    # per-player history: no double counting, money totals, reload
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

Nothing blocking. The playtest loop is closed. If it is ever restarted, start from the
"Known remaining" list above rather than sending a fresh agent — those items are already
reproduced, located in the source, and none of them needs another round to find.
