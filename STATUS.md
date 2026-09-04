# STATUS — board-games (ก๊วนบอร์ดเกม)

Last updated: 2026-09-04 · machine: BOAT-ZEPHYRUS

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

## Session 2026-08-31 → 09-01: poker hardening + bots with a bankroll

The owner played the game and reported problems as they hit them; then asked for a read-only
audit by three agents (layout/CSS · server correctness · UX dead ends) instead of one-at-a-time
reporting. Everything below is shipped to `main` and covered by tests.

### Bugs the audit found that were real and are now fixed

Server (`lan/poker-room.mjs`, `lan/bots.mjs`, `lan/history-store.mjs`):
- **Table froze permanently** when the blinds put every dealt player all-in — 299 of 3000
  heads-up hands. `startHand` set `current` to -1 and nothing ran the board out; every command
  was then rejected and `tick()` bailed. `nextPhase` already had the guard; `startHand` did not.
- **Chips vanished** when a player left mid-hand and `finishHand` (running inside `leave()`) had
  just credited them an uncalled bet — 980 chips off the table with no record. Seats now always
  go through `cashOut()`, and the state carries `cashedOut`/`boughtOut` so
  `stacks + pot + cashed-out == bought-in` is checkable.
- **Hole cards leaked**: `st.shown` is keyed by seat index, but moving seats is allowed during
  showdown. Whoever took a shower's old seat had their real cards broadcast. Now keyed by device
  token as well.
- Expired-seat reclaim could delete a player still in the hand (stack + pot contribution gone).
- `sitout` was accepted on your own turn, hanging any table with no turn timer.
- `endrun`/`newsession` had no host check; `newsession` irreversibly wipes everyone's P/L.
- Bot seats used guessable tokens (`bot:1`) and could be claimed by anyone.
- Profile "net" only ever added winnings — every player showed permanently green.

Client (`games/poker/index.html`):
- **`paintStandings` threw a ReferenceError** (`isWin`/`winBox` are `paintResult` locals). Under
  `"use strict"` this killed `render()` on every state message once a session ended, freezing the
  screen with no way back. The "เลิกเล่นรอบนี้" button led straight into it.
- Every `.res-money` rule was dead after the money zone became `#t-money` — profit and loss were
  the same colour.
- The `โต๊ะ · เงิน` panel clipped its own money table and both buttons at 360px.
- `winBox` was built and never appended, so the winner row was the first thing clipped.
- `.hand-area` was shorter than its content; the peek instruction overflowed onto the log.
- `#btn-timecard` overlapped the peek knob and stole its taps.

### Bots

Three genuinely different algorithms, not one routine with different constants
(measured over 400 hands each — fold / call / check / raise):

| ระดับ | Fold | Call | Check | Raise | how it thinks |
|---|---|---|---|---|---|
| มือใหม่ | 39.6% | 10.1% | 47.1% | 3.2% | "do I have something?", ignores price and draws |
| นักพนัน | 15.3% | 52.6% | 8.4% | 23.6% | chases everything, will not fold once invested |
| มืออาชีพ | 41.3% | 13.0% | 12.1% | 33.6% | pot odds, position, reads the player pressuring it |

- **Bankrolls persist** in `lan/data/bot-bank.json` (gitignored), keyed by name, with a readable
  `lan/data/bot-money.txt` beside it. Chips on the table come out of that wallet, so busting
  costs something; balances are uncapped in both directions and bots drift into their own
  histories. Start: 5,000 / 20,000 / 100,000 by level.
- Fear and boldness are measured against each bot's **own** starting money — otherwise the pro's
  large bankroll reads as "rich, play loose", which is backwards.
- 10 bots per level, drafted at random. One name sits at one table at a time (the wallet is keyed
  by name). Asking for bots when a level is fully seated says so.
- A busted bot decides for itself: rebuy, or leave and let another bot of its level take the
  seat. A thin wallet pushes every level toward leaving.
- Bots never press "เริ่มเล่น"/"มือต่อไป" — the pause at the end of a hand belongs to the players.
  **Do not add this back**, at any delay.
- Table memory: bots remember which cards each player has revealed and let it inform later
  decisions. They show off after winning uncontested, more often on a bluff.

### Other

- Card backs are a Chinese dragon drawn as SVG in `cards.js`, installed once as a data-URI
  background. No image file (project rule), no per-card SVG DOM.
- The join screen has a bot bankroll report (`💰 เงินติดตัวบอท`).
- End-of-hand result and money are two separate zones in a `.result-stack`; the board is redrawn
  small inside the result box because the box necessarily covers the felt.
- The action area holds a fixed height so the hand zone and peek knob stop moving every turn.
- "← ออก" returns to the poker join screen, not the board-games index.

### Tests

12 suites, all green: `test-payout` `test-room` `test-uncalled` `test-history` `test-split`
`test-busts` `test-audit-fixes` `test-bot-bank` `test-outs` `test-hand-value` `test-bot-memory` (lan)
and `test-clue` (root).
Run: `for t in lan/tests/test-*.mjs tests/test-*.mjs; do node "$t"; done`

### Next / open

- The three audit reports listed more findings that were **not** acted on (all lower severity):
  pre-action `Pre-Check / Fold` stays armed across streets, no UI for `turnSeconds` / time cards
  / buy-in range, rebuy button only appears below 10 BB, the join screen's hand-limit selector is
  ignored when joining an existing table, only the last of 8 server log lines is shown, "All in"
  vs "หมดตัก" vs "หมดหน้าตัก" naming split, buy-in silently clamped to 200.
- Not verified on a phone yet — all measurement was emulated at 360x640 and 390x844.

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

## Bot calibration (measured over 10,000,000 hands)

### The tools, and why every number here before 2026-09-01 was wrong

| Tool | Question it answers |
|---|---|
| `lan/tools/watch-bots.mjs <hands> <perRound> [startAt] [json]` | which level beats which, at scale |
| `lan/tools/merge-watch.mjs <json...>` | merges parallel watch-bots runs into one table |
| `lan/tools/play-as-human.mjs <hands> <perTable> [level]` | can a competent human beat them, and how |
| `lan/tools/leak-scan.mjs <hands>` | which street a level loses on, calling or raising |
| `lan/tools/smoke-live.mjs <hands>` | does the live `poke()` path still run at all |
| `lan/tools/realism-check.mjs <hands>` | **do they play like people** - 39 scored cells, exits 1 on any red |
| `lan/tools/read-check.mjs <hands>` | **is the opponent read any good** - vs the truth, and vs not reading |
| `lan/tests/run-all.mjs` | every test plus the scorecard, in one command |

**Every calibration number recorded here before 2026-09-01 was measured on a bot that could not
read opponents, had no memory and no mood.** `trackActions`, `updateMoods`, `rememberFoes` and
`observe` all lived inside `poke()`, which only the server calls; the tools call `_decideNow()`
directly and skipped the lot. `claimedStrength()` therefore always returned NEUTRAL and
`credibility()` never saw a raise history. Roughly 600k hands of tuning went into a bot that does
not exist — and it explains why the pro level kept looking weak and kept getting tightened: the
tightening was aimed at a strength that was switched off.

`senseTable()` now exists so the server and the tools take the same path. **If you add state the
bots learn from, put it there, not in `poke`.**

Three smaller versions of the same mistake, all fixed:

- A new function named `observe` silently shadowed the existing `observe(st)` that records
  revealed cards. Code ran, every test stayed green, half the memory was dead.
  `lan/tests/test-bot-memory.mjs` now asserts the observable *result* of all three memory paths
  rather than which function was called, because that is the only check that would have caught it.
- `bank._setDir` did not clear the claimed-name set, so a tool opening a fresh table each round
  could not re-seat the same names and quietly ran 5-6 handed after the roster wrapped.
- Think time was read off the wall clock, so a tool that steps instantly made everyone look like
  they acted without thinking — the exact signal `credibility()` reads as a prepared bluff.
  `decide()` now records the think time the bot would really have used, and `poke()` shares its
  own draw with it so the delay the table sees and the delay it reads are the same number.

Two of these were bugs in the **live game**, not just the harness: `rememberFoes` ran on every
`poke` during showdown instead of once per hand, inflating grudges and bluff-caught counts several
times over; and the two think-time draws disagreed with each other.

### Where each level stands

10,000,000 hands, all 30 bots, 400 rounds, 49 minutes on five processes, chips per 100 hands.
Measured on the shipped build (`73a389d`), which passes all 51 scorecard cells. Run it with:

```
for i in 0 1 2 3 4; do node lan/tools/watch-bots.mjs 2000000 25000 $i /tmp/wb/part$i.json & done
node lan/tools/merge-watch.mjs /tmp/wb/part*.json
```

| Level | chips/100 hands | busts/1000 | spread inside the level |
|---|---|---|---|
| 3 มืออาชีพ | **+2,034** | **2.0** | Zed +2,280 … Ash +1,746 |
| 2 นักพนัน | **+246** | 17.2 | Tank +387 … Gio +80 |
| 1 มือใหม่ | **-1,594** | 10.7 | Sammy -1,573 … Ozzy -1,627 |

Two earlier runs for comparison: before the realism work, pro +6,230 / gambler -2,415 /
beginner -1,707 at 6.7 pro busts per 1000; after the first realism pass, +3,539 / -819 /
-1,561 at 2.7.

An earlier run on the build from two hours before gave +2,091 / +208 / -1,595 - so the
several calibration changes made after it (donk, give-up, c-bet frequency, the read
re-anchoring) moved profit by under 3%. Behaviour changed a good deal; the money barely did.

**The spread inside each level is now very narrow** - the best and worst pro are 2,335 and
1,789, where before any of this work they were 7,721 and 4,471. That is the design goal:
personality changes how a bot plays, not how well. A wide spread means one bot's traits are
carrying the level and the level is not calibrated.

The gambler crossing into profit (+208 from -819) is not a mistake. A loose-aggressive
player at a table containing three calling stations does make money, and the ordering that
results - pro, then gambler, then beginner - is the skill ordering. The beginner is the
biggest loser at every measurement, which is also what happens in real small-stakes games:
the loose-passive player who calls down loses more than the maniac, because the maniac at
least wins the pots nobody contests. The split confirms it - the beginner makes +2,760 per
100 hands at showdown and gives back -4,355 in hands that never got there, against the pro's
+3,331 and -1,240.

Where each level puts its whole stack in, since that is where the money goes:

| Level | all-ins in the run | biggest two spots |
|---|---|---|
| มือใหม่ | 657,257 | preflop call 21% · turn raise 19% |
| นักพนัน | 1,275,613 | turn raise 20% · river raise 19% |
| มืออาชีพ | 182,820 | turn call 25% · river call 21% |

### Is one bot in a level actually better than another? (asked 2026-09-03)

The spread line above is a **range, not a ranking**. Each bot's rate can be computed separately
in each of the five 2,000,000-hand parts, which gives a real error bar (95%, from the spread
across parts). Gamblers, chips per 100 hands:

| | rate | 95% | the five parts |
|---|---|---|---|
| Tank | +399 | ±78 | 319, 296, 492, 415, 475 |
| Sonny | +324 | ±108 | 275, 272, 527, 338, 206 |
| Vince | +296 | ±196 | 226, 689, 251, 157, 157 |
| Frankie | +277 | ±94 | 309, 264, 318, 102, 389 |
| Rico | +247 | ±86 | 393, 251, 231, 117, 241 |
| Lenny | +244 | ±91 | 322, 80, 259, 339, 221 |
| Marco | +242 | ±157 | 411, 347, 228, 276, -53 |
| Rocco | +126 | ±130 | 331, 90, 213, -50, 47 |
| Buddy | +109 | ±145 | 159, -132, 71, 123, 326 |
| Gio | +103 | ±83 | -44, 206, 112, 82, 157 |

- Tank vs Gio: **297 ±114 — a real difference.**
- Rico vs Buddy: **137 ±168 — cannot be told apart.**

So the ends of a level are separated and the middle is not. Do not read the per-bot order as a
skill ranking without the error bar. (These are unweighted means of the five parts; the merge
tool weights by hands, which is why its Tank reads +387 and this reads +399. Same data.)

### live-check.mjs — the same bands, measured on the real table

New tool, 2026-09-03. Reads `lan/data/hands.jsonl` — the log the server writes as people
actually play — and scores any named player, bot or human, against the same `WANT` bands
`realism-check.mjs` uses. It answers a question the harness cannot: *is this bot behaving on
the real table the way the simulation says it does?*

```
node lan/tools/live-check.mjs Rico Buddy --day=2026-09-03
node lan/tools/live-check.mjs                 # everyone in the log, by profit
```

**Not in `run-all.mjs`** on purpose: it needs live data that only exists on a machine that has
hosted games, and `lan/data/` is gitignored, so anywhere else there is nothing to measure. It
exits 0 with a message when the log is missing.

First run, on the owner's own 104-hand session of 2026-09-03 with Rico and Buddy: **every
measurable cell in band.** Two cells read outside it — Rico's VPIP 70% against 45-70 and 3-bet
15% against 4-12 — and both are inside sampling error at 104 hands and 27 opportunities.

That exposed a flaw in the tool's first version, which called a cell failed on a flat "25+
samples" rule and so reported noise as a failure. It now widens each rate by its 95% interval
and only fails a cell when the whole interval sits outside the band; a cell that is out but
still overlapping prints `?`. The same trap as the read metric in the section above: **a
threshold that ignores sample size manufactures findings.**

#### It also found a real bug in the scorecard itself

Run with no arguments over the whole log, the tool printed **"went to showdown 127%"** — which
is impossible, and therefore a bug in the measurement, not the bots.

`wtsd` divided showdowns by *players who acted on the flop*. Someone who is **all-in before the
flop has no flop action but always reaches showdown**, so they were counted in the numerator and
missing from the denominator. On the real log that is 1,280 of 3,819 showdowns, and the rate came
out **32% too high** (94.6% instead of 71.7%).

**`realism-check.mjs` had the identical bug in a scorecard cell** — the gate that blocks commits.
It hid there because bots go all-in preflop far less often than people do, so it only inflated
the number quietly instead of breaking it. Both files now use *"did not fold preflop, and a flop
was dealt"*, taken from the hand's dealt-in list rather than from who acted.

Two things came out of the fix:

- **51 cells still green** (pro showdown rate now 30.7% against a 22-32 band). Unit tests 12/12.
- The heads-up test for c-bet is now *"exactly two players reached the flop"* rather than *"two
  acted"*, which is what heads-up means; both files also require that the preflop raiser actually
  got to act, so an all-in opponent no longer counts as a c-bet opportunity that was declined.

Lesson worth keeping: **the harness and the real table have different shapes, and a definition
can be wrong in a way only the real table reveals.** Nothing in 10,000,000 simulated hands
surfaced this; 1,704 real ones printed an impossible number on the first run.

### What the bots have worked out about the owner

Rico and Buddy have each sat with the owner for hundreds of actions, and have independently
reached the same profile: **shown down weak 7 times in 11**, and **folds to only 10%** of what
it faces. Those are the two correct conclusions about a loose-passive player — do not believe
its bets, and do not try to bluff it — and `foldiness` clamps to 0 for the owner, so neither
bot wastes money attacking. Each has also caught the owner bluffing 11-12 times, which is how
they learned it. Nothing about this is hand-coded; it is the memory doing its job.

The `foldiness` calibration was re-checked against the population it now actually has: **498
opponent pairs with 15+ observed actions, median fold rate 34%, 90th percentile 57%, highest
79%.** The threshold `(rate - 0.42) / 0.16` therefore leaves 63% of pairs at zero, fires
partially for 28% and saturates for 8% — it reads the tight third of a table, which is what it
is for. It is not a dead feature and it is not firing on everyone.

Bots read each other the same way: Buddy's record of Rico is 1 strong to 4 weak in 12
showdowns, and on the real table Rico is the more aggressive of the pair (3-bet 15%,
committed 12,226 with two pair on a paired ace board). Buddy's read of Rico is correct.

### What a human can do to them

`play-as-human.mjs` seats a deliberately plain tight-aggressive human (tight preflop, value bet,
fold to price, occasional semi-bluff heads-up) and reports big blinds per 100 hands. 40,000 hands
per lineup — **2,000 hands is far too few to read a win rate here**: two 2,000-hand runs against
pros gave -134 and +164, which is all noise.

| Table | BB/100 for the human | first realism pass | before any of it |
|---|---|---|---|
| pros only | **-30** — they beat it | -41 | -35 |
| gamblers only | **+79** | +195 | +71 |
| mixed 3/3/2 | **+84** | +92 | +88 |
| beginners only | **+122** | +130 | +165 |

40,000 hands is enough to rank these tables and not enough to trust the last few points:
the run before this one gave -19 / +86 / +69 / +97 on a build whose measured behaviour was
almost identical. Treat differences under about 20 BB/100 as noise.

The pro table is the one that matters for practice, and it is the one a plain solid player
loses at. Every table got harder as the bots got more human, which is the expected cost:
playing like a person means having a person's leaks, and also a person's defences.

None of these are realistic win rates in absolute terms; a good player in a soft live game
makes 10-30. Levels 1 and 2 are *designed* to be bad players, and eight of them at one table
is not a situation that exists outside this tool. Read these numbers as an ordering, not as
a forecast.

### The two behaviour bugs the measurements found

- **The beginner could not lose.** Break-even at +440/100 hands, because he put 23,000 into pots
  per 100 hands while everyone else put in 73,000-84,000. He was not playing badly, he was not
  playing — under pressure he folded. A real beginner loses by calling down with second pair.
- **The gambler bled four times too fast** (-7,949/100, busting every 24 hands). Two thirds of it
  went on turn and river, half of that from raising. He also had **no opponent count in his maths
  at all**: one pair against four players scored exactly the same as against one.

Both are fixed; see the commits around `59be4de`. The gambler's remaining leak is turn aggression,
which is his character and is meant to stay.

### Known and deliberate

- Beginners raise only 5-6% of actions. Real recreational players are nearer 8-12%, but passivity
  is level 1's signature tell and the owner's players should be able to read it.
- Gamblers still bust about every 50 hands. That is a maniac, not a bug.
- Pros run VPIP 31-36% against a table with six weak players, looser than a live TAG (22-28%),
  because that table justifies it.

### Realism is a separate question from profit, and needs its own tool

`watch-bots` answers "who wins". It cannot answer "does this look like a person",
and on 2026-09-02 the owner spotted the difference from a single hand: a level-3 pro
called off his whole stack on the turn with pocket 3s on an A-5-9-5 board, four-way.
That pro was making +6,230 per 100 hands at the time. Profit hides behaviour.

`realism-check.mjs` scores **seventeen** statistics people actually use to read an opponent -
VPIP, PFR, limp, 3-bet, 4-bet, check-raise, aggression factor, went-to-showdown, position
ratio, c-bet, fold-to-c-bet, donk-bet, median bet size, blind steal, big-blind and
small-blind defence, and turn barrel - against the range for the kind of player each level
imitates, and fails any of the 51 cells that falls outside.
**Run it after any change to how the bots decide.** What the first eight caught:

| | before | after | real players |
|---|---|---|---|
| pro 4-bet+ | 23.1% | 0.4% | 1-2% |
| pro check-raise | 0.4% | 4.8% | 3-9% |
| pro aggression factor | 1.16 | 1.89 | 1.4-3.6 |
| gambler PFR (vs 54% VPIP) | 10.6% | 21.8% | 18-40% |
| gambler check-raise | 0.9% | 3.1% | 1-8% |

Three causes, all of them things that were computed and then went nowhere:

- **Nothing counted how many raises had already gone in on the street**, at any
  level. A hand that is a fine open looked identical to that hand facing a raise
  war. Note the count means different things before and after the flop - one raise
  preflop means someone opened, one bet postflop is just Tuesday - so `war` offsets
  them; using the raw count blocks ordinary postflop aggression (tried it, the pro
  fell to VPIP 20.8 / AF 1.16).
- **The trap flag disabled raising for the whole street**, not just while the bot
  was acting weak, so every planned trap became a check-call and never once sprang.
  Traps also only fire on monsters; real check-raises include strong-but-not-nutted
  hands and semi-bluffs, so the pro now has a check-raise path of its own.
- **Adding brakes without relaxing the base makes a bot inhuman in the other
  direction.** Level 3's margins were loosened to pay for `crowd`, `heatGap` and the
  war ladder. Expect to do this every time a brake is added.

### The five things a person notices that nothing was measuring

The scorecard passed on eight statistics while five more had never been looked at.
Measuring them found **one** missing concept sitting behind four separate defects: nothing
in the code knew who had raised preflop, or where a bot sat relative to that player.

| | before | after | real players |
|---|---|---|---|
| pro plays late / early | 1.01x | 1.6x | 1.4-2.2x |
| pro donk-bet | 35.0% | 2-5% | 2-10% |
| gambler donk-bet | 53.6% | 8.3% | 2-10% |
| pro c-bet heads-up | 27.1% | 79% | 55-75% |
| beginner c-bet heads-up | 6.9% | 48% | weak players under-bet |
| pro fold to c-bet heads-up | 61.2% | ~52% | 40-55% |

Betting into the preflop raiser half the time is not something anyone does; neither is
raising preflop and then checking the flop three times in four. Both come from the same
blind spot. `pfRaiser`, `aggroBehind` and a corrected `seatsLeft` fixed all of it - the old
position calculation started from the button on every street, which is right after the flop
and wrong before it.

**Four traps worth knowing, because each would have shipped silently:**

- **A term wired to a branch that never runs does nothing, and looks fine in review.**
  Preflop a pro either raises or folds: a hand good enough to call at 0.55 is already good
  enough to open at 0.45, so the calling margin is unreachable - and that is exactly where
  the position term had been put. Proved it by swinging the value by 0.6 and watching the
  measurement not move at all. Position belongs on the open-raise threshold.
- **The donk guard sat behind the path that bypasses it** (`canRaise` returns first) -
  the same shape as `senseTable` and the trap flag before it. The gambler, whose guard
  happens to sit before its exits, measured 8.6%; the pro measured 13.7%. Same guard, same
  intent, one of them dead. **When a guard is added, check what returns before it.**
- **Ban a behaviour and it reappears somewhere else.** Stopping donk bets turned them into
  check-raises (12%, real 3-9%) because the hand still wanted to play. Raising after
  checking now needs a stronger hand than raising outright.
- **Smaller bets raise went-to-showdown on their own** - calling gets cheaper. That was
  fixed where it belongs (defend the flop wide heads-up, give up on turn and river), not by
  undoing the sizing.

Two reference ranges were widened rather than tuned into, and both are marked in the tool:
the gambler's check-raise (loose-aggressive players genuinely check-raise 6-12%, and with
every path added here switched off it still measured 8.0%, so the range was wrong, not the
bot), and c-bet / fold-to-c-bet, which are quoted for heads-up pots and are now measured
that way instead of being mixed with multiway.

### The opponent read has never worked, and nobody had checked

`lan/tools/read-check.mjs` asks a bot what it currently thinks of each live opponent -
through the same path `decide` uses, never a copy - and compares that against the
opponent's real hand, scored with the bots' own `madeStrength`.

| level | read error | error if it never read at all | bias | direction |
|---|---|---|---|---|
| beginner | 0.245 | **0.175** | +0.208 | 0.241 |
| gambler | 0.226 | **0.171** | +0.179 | 0.288 |
| pro | 0.216 | **0.175** | +0.168 | 0.253 |

**Reading opponents makes the guess 25-40% worse than not reading.** The machinery is not
broken - direction correlates 0.25-0.32 and improves street by street as cards land, which
is exactly what a working read looks like - but every guess is inflated by about 0.18. The
bots think everyone is stronger than they are, everywhere, and act on it.

That is very likely why the pro needed a `catchBluff` term to stop over-folding, and why
`readGap` had to be damped: those were compensating for a bias nobody knew was there.

**Fixed, 2026-09-03.** The anchor - what to assume about an opponent when nothing is known -
was one constant, `NEUTRAL = 0.45`, used on every street. The measured average strength of a
live opponent is not one number: **preflop 0.38, flop 0.32, turn 0.41, river 0.48**. Of
course it rises as cards land; everyone's hand improves. 0.45 was far too high exactly where
most decisions are made. `neutralFor(phase)` now supplies the right one.

| | before | after | never reading |
|---|---|---|---|
| beginner error | 0.188 | **0.155** | 0.157 |
| gambler error | 0.183 | **0.154** | 0.158 |
| pro error | 0.178 | **0.147** | 0.156 |
| bias | +0.125 to +0.138 | **+0.053 to +0.063** | |
| direction | 0.19-0.23 | **0.25-0.30** | |
| separation | +0.050 to +0.078 | **+0.065 to +0.105** | |

**The read is worth having for the first time** - every level now beats the do-nothing
baseline. All 39 behaviour cells stayed green on the first try, four runs in a row.

One measurement lesson from this: the first version scored "of the times he really was
strong, how often did the guess exceed 0.55". Lowering the whole scale made that number
collapse from 52% to 19% while the read was getting better - the threshold was absolute and
the scale had moved. It now reports **separation** (mean guess when the opponent is strong,
minus mean guess when he has nothing), which does not care where the scale sits.

**Then it stopped, on purpose.** Two further improvements were built and measured and both
gave nothing outside noise: damping the claim by board texture (separation +0.066 → +0.055),
and remembering an opponent's aggression per street (+0.067 → +0.069). Judging showdowns by
the made hand rather than the hole cards also did not help, and on reflection should not -
that number feeds "does he turn up with junk", which hole cards answer more directly.

The question that should have come first: **how much is there to read at all?** The raw
visible signal - money an opponent has put in this street - correlates with their real hand
at **+0.197 to +0.228**. The read scores **0.243 to 0.293**. It is already extracting more
than any single observable carries, which is why two rounds of work moved nothing.

That is the right outcome for what these bots are for. Bet size correlates with hand strength
at 0.098 / -0.001 / 0.212, and think time at 0.045 - a person cannot pattern-match them after
fifty hands. `docs/PLAN-hand-reading.md` records the negative results and marks its remaining
stages superseded; the effort belongs in the backlog there, none of which has been measured.

Two lessons from building the tool itself:

- **Compute the baseline from the same data, not from memory.** The first version printed
  "a constant guess would score about 0.19" from recollection. Measured on the same samples
  it is 0.171-0.175 - and that number is the whole point, since it is what the read has to
  beat.
- **Take ground truth from the bots' own function.** Recomputing hand value the obvious way
  skipped the board-play correction and made the bias look 0.04 smaller than it is.

### Blind play, measured last and mostly already right

The four blind and barrelling statistics went in after the read work. The pro was inside
every real-player range on the first measurement - steals 36.5%, big blind folds to a steal
64.7%, small blind 82.3%, turn barrel 51.3% - which is the first area checked here that
needed no work at all. The gambler defends blinds far wider than a typical player (big blind
folds 24%), which is what a loose-aggressive player does, and its band says so.

One real gap: **the beginner attacked the blinds 2.1% of the time.** Even a weak player raises
when everyone folds to them on the button - it is the one situation that feels obvious without
knowing any theory. Now 8.6%, inside the 8-18% weak-player range, and the level's overall
passivity is untouched.

Two counting traps, both of which produced numbers that looked fine:

- The small blind acts before the big blind preflop, so stopping at the first blind seen
  counts the small blind almost every time. The big blind sample was 3 to 15 hands out of
  12,000 before that was noticed - small enough to read as anything.
- Steal and defence stats have to come from the seat's position relative to the button, not
  from the order players acted in. The action order shrinks as people fold, so the same seat
  scores differently hand to hand.

### Bots come and go now

Before 2026-09-02 the only way out of a seat was `if (b.stack > 0) continue;` - a
stack of exactly zero. Arithmetic on the measured rates: a pro busts 5 times per
1000 hands and leaves on 12% of those, so about 0.6 departures per 1000 hands, while
a person plays 30-60 hands a sitting. The owner said he had never seen a bot leave,
and he could not have. Nobody topped up either, so a bot ground down to 97 chips at
a 2,000 buy-in table just sat there.

Now, between hands: short stacks top up (the engine already supported it - a rebuy
with chips left is not counted as a bust), and each level leaves for its own reason -
the beginner books a win or gives up, the gambler almost never quits, the pro leaves
a table that is not paying. Measured: one voluntary departure roughly every 24 hands
across the table, which a person will actually see. `lan/tests/test-bot-table-life.mjs`
holds the money invariant: topping up and leaving move money between wallet and
stack, they never create it.

## Automated tests (must pass before any commit)

```
node lan/tests/run-all.mjs          # everything below, plus the 51-cell scorecard
```

⚠️ Use the runner rather than a remembered list. On 2026-09-03 the bots' decision code was
rewritten a dozen times against the same eight test files, while four others in the same
folder (`test-audit-fixes`, `test-bot-bank`, `test-busts`, `test-hand-value`, `test-outs`)
went untouched all night. The runner reads the directory, so a new test file is picked up
without anyone remembering to add it.

```
node lan/tests/test-payout.mjs     # side pots, seat-0 wins, dead-pot refund
node lan/tests/test-uncalled.mjs   # uncalled bet returns to its owner (+400-case money fuzz)
node lan/tests/test-room.mjs       # pot excludes uncalled money · seat takeover · host rights
node tests/test-clue.mjs           # clue rules, extracted live from color-clues/index.html
node lan/tests/test-history.mjs    # per-player history: no double counting, money totals, reload
node lan/tests/test-split.mjs      # ties, side pots, odd-chip remainders, 500-case money fuzz
node lan/tests/test-bot-memory.mjs      # all three memory paths, asserted by result not by call
node lan/tests/test-bot-table-life.mjs  # top-up + voluntary leaving, money conserved
node lan/tests/test-bot-buyin.mjs       # host-set bot buy-in; chips seated == wallet debited
node lan/tools/realism-check.mjs        # 24 behaviour cells vs real-player ranges
```

`lan/tools/table-bot.mjs` fills a table with bots that play like people — they evaluate hands
with the real engine, fold weak holdings, bluff occasionally, and take an uneven amount of time
to decide. It exists because playtesting kept stalling on "no one is around to play". Five of
them uncovered the round where three players were all-in for different amounts, which is the
case side-pot code gets wrong.

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

## Practising alone against the bots — what to expect

The scorecard says the three levels now play inside human ranges, and the 10M run says the
ordering is right, but the thing that decides whether practice is worth anything is what happens
when you sit down:

- **Pros only is the table that will beat you.** A plain solid player loses 41 BB/100 there. That
  is the one to use when you want to be tested.
- **The mixed table pays a solid player about 92 BB/100.** Levels 1 and 2 are meant to be bad, so
  that is expected, but do not read your win rate there as a measure of your own game.
- **Fold too much and the table will start attacking you.** The bots track each opponent's fold
  ratio and bluff at anyone who is over-folding. A sound tight game (folding ~38% of actions)
  is left alone; folding ~55% of actions - about what you do if you only play 12% of hands -
  scores 0.78 and gets you bluffed at. This is the only mechanism in the game that punishes
  passivity, so it is worth keeping calibrated to real numbers, not to numbers that sound right.
- **They remember you between sessions.** Grudges, moods, who bluffs, who calls everything, and
  what cards they have seen you show are all in `lan/data/bot-mind.json`, which survives restarts.
  Every level reads its own slice of that now, not just the pros.
- **People come and go.** Roughly one bot stands up every 24 hands, tops up when short, and is
  replaced by someone else at the same level.

## Session 2026-09-04: host-set bot buy-in, and player history on the landing page

Two things the owner asked for, both shipped and verified against a running server.

### The host can now set how much the bots buy in for

`BUY_IN = 2000` was a module constant in `lan/bots.mjs`. It is now `DEFAULT_BUY_IN` plus a
per-table setting on the bot manager (`setBuyIn` / `buyIn()`), exposed in the bot box under
**บอทซ้อม** as `− 2,000 +`, stepping by 10 big blinds. The number alone means nothing, so the
row also says what it costs: `100 บอด · นักพนันซื้อได้ 10 ครั้ง`, computed from the level
starting wallets (5,000 / 20,000 / 100,000). Set it high enough that a level can afford fewer
than two buy-ins and the line turns amber — at 5,000 a beginner gets one shot and then leaves,
which is a real change to the table, not a cosmetic one.

Deliberate choices worth keeping:

- **The setting is per table, not per server.** Two tables with different blinds need different
  numbers, and the value rides along in the state broadcast so a second phone opening the panel
  sees the truth rather than its own guess.
- **Changing it does not touch bots already seated.** Their chips stay put; the new number
  applies to the next bot called and the next top-up. Each bot also remembers its own stake
  (`seat.buyIn`), because "am I up or down" must be measured against what *it* bought in with —
  compare against the current setting and a bot that is exactly even reads itself as down 78%
  and starts playing scared.
- **A pure set sends no `count`.** The `addbot` handler reads a missing `count` as 0, which
  means *remove every bot*. Nudging a number must never empty the table mid-game, so the set-only
  path returns before it gets there.
- **The row only renders when the server sent `botBuyIn`.** The page reloads the moment a browser
  refreshes; the server only changes on restart. Without that check, an updated page talking to a
  not-yet-restarted server would send the exact message that clears the table.

**Two money bugs came out of this, both real and both now tested.**

1. `sit()` clamps the requested buy-in to the table's own min/max, but the wallet was debited by
   the *requested* amount. Ask for 8,000 on a table capped at 2,500 and 5,500 chips per bot
   vanish — `bankroll = wallet + stack` silently breaks. Both sit paths now debit `bs.stack`,
   the chips actually seated. `setBuyIn` also clamps at set time, but that is not enough on its
   own: the host can lower the table cap afterwards, which is what the test reproduces.
2. The rebuy after a bust debited the wallet without checking whether the rebuy succeeded. The
   room refuses one that exceeds the table cap or lands mid-hand — money left the wallet with no
   chips in return, and since the stack stayed 0 the same path ran again on the next poke,
   draining it repeatedly and inflating the bust count. It now checks the result first, and the
   bust decision is capped at one per hand like the branch above it.

`node lan/tests/test-bot-buyin.mjs` — 29 assertions. Reverting either fix fails it.

### Player history moved to the landing page

`ประวัติผู้เล่น` now sits on the join screen next to the bot money table, as a `<details>` block
that loads over the lobby socket. It was previously reachable only from the **สะสม** tab inside
the table panel, which meant that to answer "how did last night go" you had to join a table and
buy chips first, to look at numbers.

- The server's `profiles` request moved above the "must be seated" gate, next to `botbank` — it
  is machine-wide data, not table data. A client that has not joined has no `playerKey` yet, so
  it sends its own token and the server fingerprints it the same way `join` does. The raw token
  is never echoed back; that warning in `join` applies here too.
- **People and bots are shown as separate groups.** Sorted together by hands played, the bots
  win: they play thousands of hands a night and a person plays a few dozen, so every human ends
  up below the fold on the screen built to show them.
- Each row answers the landing-page question (net, hands, wins, VPIP, when they last played),
  not the in-game one. The **สะสม** tab still shows the fuller per-opponent breakdown, which is
  what you want while deciding how to play against someone.
- On GitHub Pages, and against a server too old to answer, both sections say so instead of
  spinning forever.

## Session 2026-09-04 (later): you can now see what the bots are doing

The owner asked to see bots leave the table, then "other animations that make the bots' actions
readable". Both are about the same problem: the table was doing a lot that never reached the eye.

### Leaving is now two steps, because one step was invisible

`botLeaves` used to cash the bot out, free its name, remove the seat and sit a replacement in the
next line - all inside one state update. On screen nobody ever left; a name simply changed between
two frames. The owner said months ago that he never saw a bot leave, and he was right: the code
had worked the whole time, it was just faster than sight.

Now the first step marks the seat (`leaving`, plus sit-out so it cannot be dealt in) and
broadcasts; the second step, 2.2s later, does the cash-out and calls the replacement. The second
step runs inside `settleBusted`, not in a bare timer, because that function is only called between
hands - which is the only safe moment to take a seat away. The timer just wakes the check up.

**The bust-and-quit exit was routed through the same path.** It was the more interesting departure
- broke, packs up, goes home - and it was the one nobody could see at all.

### Actions are readable at a glance

- Every action was the same muted grey; `Check` and `Raise to 240` differed only by letters. On a
  nine-seat table with several bots acting, that cannot be read before it is gone. Actions are now
  coloured by `lastKind` - raise warm, call teal, check grey, fold dim, all-in gold - and the fresh
  one pops once.
- **All-in had no visual at all.** The single moment where someone commits everything looked
  exactly like a check. It now takes a gold border, a gold stack, and a ring that fires twice on
  the hand it happens.
- **A thinking indicator.** Bots take 0.7-3.4s, and a long think means the decision was genuinely
  close (that is what `thinkMs` encodes). Without a marker the table looked frozen and then numbers
  jumped. Bots only - a person already sees their own buttons.
- A toast names whoever leaves and what they leave with (`Buddy ลุกจากโต๊ะ (กำไร 3,410)`), once per
  departure - the state is broadcast many times during those 2.2 seconds.

Verified through the real path end to end: a level-1 bot busted into debt, declined to rebuy, was
marked `[กำลังลุก] [พักมือ]` while staying seated across six more `settleBusted` calls, and was
replaced by Toby after the window with its -3,000 intact. Colours and the thinking dots were
confirmed on a live table; the all-in and leaving styles were checked against the page's own
stylesheet.

### Tests

`test-bot-table-life.mjs` grew from 12 to 22 assertions. The existing leave tests detected
departure by "the seat's name changed", which the two-step exit broke - they now drive both steps
through `settleNow()`, which advances the deadline rather than calling `finishLeaving` directly,
so the test still walks every line the real game walks. New assertions cover the window itself:
the bot stays seated with its own name, is sat out, keeps its chips, survives repeated calls
before the deadline, and hands the seat over with the money intact afterwards - plus that
"remove all bots" does not strand one mid-farewell.

## Handoff / waiting on owner

**Restart the server to get the two features above.** The page is served from disk, so a browser
refresh already has the new UI, but `lan/server.mjs` and `lan/bots.mjs` only change on restart.
Until then the UI degrades on purpose: the buy-in row does not render, and the history section
says it cannot reach the server. Ask before restarting — it drops anyone connected.

**Port 8080 stopped again, and again without explanation.** The owner started it at 22:26 on
2026-09-04; it was still listening when this session checked shortly before 22:52, and the
process was gone by 22:57. Its data files
were last written at 22:35:50, so nothing was lost and nobody was mid-hand. This session's
testing cannot be the cause: it ran on port 8090 with `BOT_DATA_DIR` pointing at a temp folder,
started at ~22:53 — after the last live write, on a different port, against different files.
This is the second night in a row (see 2026-09-03 below).

**The server now writes its own log**, so nothing has to be remembered or typed: every start,
every console line, uncaught exceptions and the exit code go to `lan/data/server.log` (gitignored,
rotated at 5 MB, and redirected with the rest of the data when `BOT_DATA_DIR` is set). Telling
someone to run `> server.log 2>&1` was never going to work - it has to be the right folder, and
cmd and PowerShell disagree on the syntax, which is exactly how the first attempt failed.

**Reading it after the server disappears - the last line is the answer:**

| Last line | What happened |
|---|---|
| `[crash] ...` then `[stop] exit code 1` | the code threw; the stack is right there |
| `[stop] got SIGINT` | someone pressed Ctrl+C in that window |
| `[stop] exit code 0` | ordinary shutdown |
| no `[stop]` line at all | killed from outside - window closed, Task Manager, sleep/restart |

That last row is the useful one. Windows delivers no signal before a forced kill, so the absence
of a line is itself the evidence, and it separates "the code crashed" from "something outside
ended the process" - which is precisely the question the two silent deaths could not answer.
Verified by running a second server into `EADDRINUSE`: `[crash] uncaughtException` followed by
`[stop] exit code 1` both landed in the file.

**Decided 2026-09-03: showing cards stays as it is.** Bots show after **25-63%** of uncontested
wins (pros most, junk hands most often), which is far above a casino but normal in a game played
with friends over WiFi. The owner chose to leave it. Do not "fix" this number toward a casino
rate - besides being wrong for the setting, showing is how bots feed each other's `reads`, so
lowering it quietly degrades the memory system. If it is ever revisited, measure what the read
loses before changing the rate.

Still unmeasured, from `docs/PLAN-hand-reading.md`: multiway discipline (the scorecard checks
heads-up c-bet and fold-to-c-bet only).

**Server state as of 2026-09-03 23:15 — port 8080 is NOT listening.** The owner played a
107-hand session that evening (last hand 23:02:59) and the process was gone by 23:15; no crash
log exists because its output was never captured to a file. **Nothing was lost**: bot minds,
bank, wallet summary and the hand log were all written cleanly at 23:04:04-23:04:13, and the
log holds 1,704 hands. Reason unknown — nothing in this session touched the server (all work
was read-only analysis plus a simulation in a temp directory). Start it again with
`node lan/server.mjs`; **ask the owner first**, since a restart drops anyone connected.

That 107-hand session is the data behind the `live-check.mjs` section above, and is worth
keeping: it is the only sample of the shipped build with a real person at the table.

If you start a second server on the same machine for testing, set `BOT_DATA_DIR` — otherwise it
writes the same bot wallet and memory files as the live table, which `bots.mjs` already warns is
destructive.
