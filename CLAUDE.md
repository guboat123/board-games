# CLAUDE.md

<!-- FLEET-RULES:BEGIN -->
<!-- auto-stamped from _tools/FLEET-RULES.md — DO NOT edit this block by hand; edit the source + run stamp-fleet-rules.ps1 -->
> ✅ Fleet migration `agents/team` → `_tools/fleet` COMPLETED; the agent-system repo was retired and deleted on the owner's order (2026-08-29). Sync logs are local-only (`%LOCALAPPDATA%\claude-sync`), KB summary sidecars live in `_tools/fleet/kb-summaries/`.

## 🛰️ Fleet Iron Rules — READ ALL of these before working (rationale: C:/ClaudeCode/_tools/FLEET-RULES.md)

**A. Sync & branches**
1. `git pull` before you touch anything.
2. Every machine stays on `main` — never leave a stranded feature branch.
3. About to stop / shut down → commit + `git push` the touched repo NOW (don't wait for the 30-min sync).
4. Never force-push or rewrite history without coordinating every machine first.

**B. Handoff & language**
5. Update the touched repo's `STATUS.md` before you stop (Next / handoff / waiting-on-owner / constraints).
6. Write all machine-read content in English — STATUS.md, CLAUDE.md, commits, comments; romanize names (MeowJot / Olong / Lulu / staff).
7. Talk to the owner (Boat) in **Thai** — translate before you reply.
8. `STATUS.auto.md` is machine-generated — never hand-edit it.
9. "Done" = pushed to remote AND STATUS.md updated — never report done otherwise.

**C. Visibility (so every machine sees it)**
10. Anything another machine must see goes in a git-synced repo file — NOT root CLAUDE.md, `~/.claude`, or local hooks (those are per-machine and do not propagate).
11. Fleet rules live in `_tools/FLEET-RULES.md` and are stamped into this block — edit the source, never this block.

**D. Right folder (never edit the wrong copy)**
12. Dev only inside a real git repo under `C:/ClaudeCode` — confirm `.git` exists before editing.
13. Never read / edit / run in copies, backups, or archives (`_ARCHIVE_DO_NOT_EDIT\`, `*_old_copy`, `*-backup`, ...).
14. Don't trust a path in CLAUDE.md blindly — verify it is live (service AppDirectory via `sc qc`, or `.git`).

**E. Data, secrets & backup**
15. Data and secrets stay out of git (`data/`, `*.db`, `.env`) — never `git add` them.
16. Pulling `main` may delete `data/` in the working tree — that is intentional (TD-002); restore from the machine's backup zip.
17. Bank statement passwords are bank-issued and non-sensitive — never re-raise them or block on them.
18. Back up anything not in git — on a schedule AND before any migrate / wipe / destructive op; record the location in STATUS.md.
19. Back up the production DB before every deploy.

**F. Production & testing**
20. Production repos (4pet, pfm) → always a separate branch; merge to main the same day.
21. The prod machine (Alienware) is pull-only (ff-only) — no dev on prod.
22. Never push broken code to main — other machines auto-pull it to run live.
23. Tests green before merge to main / before "done"; if you cannot verify on this machine, say so in STATUS.md.
24. Verify the real path (rendered route / behavior), not just the unit.

**G. Commit hygiene**
25. Commit messages: clear English `type: summary` (feat / fix / chore / docs / test) stating what + why — don't let a bare "auto-sync" be the only record of real work.

**H. Knowledge Base (Obsidian)**
26. Before non-trivial work, `git pull` the KB and consult it — was this already decided / done? Search narrow → summary (Memory / MOC / Digests) → open full Transcripts only when needed; never pull a whole vault into context.
27. Never hand-edit inside a vault (`obsidian-kb/`, generated parts of `obsidian-mind/`) — `build-kb` rebuilds it and your edit is lost. Add knowledge at the SOURCE (memory files, `obsidian-mind/lulu/` for Lulu); it flows into the vault on the next build.
28. Keep the KB fed: every dev machine runs the KB task (`ClaudeKB` → `build-kb`) so its `Memory/<machine>` + `Transcripts/<machine>` reach the fleet; only the builder (Zenbook) regenerates the Home / MOC indexes.

**I. Machine roles & onboarding**
29. Know your machine's role (Zenbook = PFM/others + KB builder; Alienware = 4PET prod, GitHub-only; Razer / Desktop = dev); only the designated machine runs KB/routine tasks.
30. Onboarding a new machine = `git clone` + one idempotent setup script — no manual file copying.

**J. External sharing (Google Drive)**
31. 🚫 Google Drive use is limited to ONE folder — the team-share **"Claude Code"** (id `11oQ1VLeXMugALCR2g-q6y2IOwcGyU4wS`, subfolders `/code` + `/data`). NEVER list / read / write / move / delete anything in any OTHER Drive folder or the root; scope every Drive call to that id; never use `list_recent_files` (it scans the whole drive). If a task seems to need another folder → stop and ask the owner. Details: `devhub/DRIVE-UPLOAD-HANDOFF.md`.
### K. Routines ที่เจ้าของตั้งไว้ (ห้ามพังเงียบ)
**32. "ตั้ง routine ให้แล้ว" = ต้องมีผลงานออกมาตอนแอปปิด — ไม่ใช่แค่ task ยิงตรงเวลา.** *Why:* 2026-08-22→26 เจ้าของเดินทาง 3 วันแล้วกลับมาเจอ progress = 0 ทั้งที่ scheduler ยังเขียว: รอบแรก ๆ ยิงตรงเวลาแต่ 401 ทุกนัดเพราะ **CLI OAuth token หมดอายุเงียบ ๆ**, แล้วตัว headless ถูกถอดทิ้งไปใช้ in-app routine ซึ่ง **วิ่งได้เฉพาะตอนแอปเปิด** (เต็มไทม์ไลน์: `_tools/fleet/CASE-ROUTINE-SILENT-DEATH.md`). *How:* (1) ตัวหลักต้องเป็น **OS-level task/cron ที่วิ่งตอนแอปปิดได้** — in-app routine เป็นตัวเสริมเท่านั้น ห้ามลบตัว headless ทิ้ง; (2) เปิด **StartWhenAvailable** ให้ตามเก็บรอบที่พลาดหลังเครื่องหลับ/ปิด; (3) **เช็ค `expiresAt` ใน `~/.claude/.credentials.json` ตอนตั้ง** และจดวันหมดอายุไว้ — auth หมด = 401 เงียบทุกนัด; (4) พิสูจน์ด้วย **ผลงาน 1 รอบจริงที่ผลิตตอนแอปปิด** ก่อนรายงานว่าเสร็จ; (5) มี **dead-man switch** — เงียบติดกัน ≥2 รอบต้องมีอะไรดังขึ้น ห้ามให้ความเงียบแปลว่าปกติ; (6) `STOP` guard ต้องแยก "พังจริง" ออกจาก "auth หมดอายุ" ไม่งั้นพอ login ใหม่มันไม่กลับมาเอง.

<!-- FLEET-RULES:END -->


บริบทโปรเจกต์สำหรับ Claude Code อ่านไฟล์นี้ก่อนแก้อะไรก็ตาม

## โปรเจกต์นี้คืออะไร

เว็บ static รวมบอร์ดเกมเล่นกับเพื่อน โฮสต์บน GitHub Pages

## ข้อจำกัดที่ห้ามฝ่าฝืน

1. **ไม่มี build step** ห้ามเพิ่ม npm, bundler, framework, TypeScript, Tailwind CLI ทุกไฟล์ต้องเปิดด้วยเบราว์เซอร์ตรงๆ แล้วทำงานได้
2. **ไม่มีเซิร์ฟเวอร์** GitHub Pages เสิร์ฟไฟล์อย่างเดียว ห้ามเขียนโค้ดที่ต้องมี backend
3. **ไม่ใช้ `fetch()` โหลดไฟล์ในโปรเจกต์** เพราะเปิดแบบ `file://` แล้ว CORS จะบล็อก ข้อมูลทุกอย่างโหลดผ่าน `<script src>` แล้วแปะไว้บน `window`
4. **localStorage ต้องห่อ try/catch เสมอ** และมี fallback เป็นตัวแปรในหน่วยความจำ บางเบราว์เซอร์ในโหมดส่วนตัวจะ throw
5. **ห้ามใส่รูปตัวละครมีลิขสิทธิ์** ชื่อเป็นข้อความเท่านั้น
6. **ภาษาในหน้าจอเป็นภาษาไทย** คอมเมนต์ในโค้ดก็ภาษาไทย ชื่อตัวแปร/ฟังก์ชันเป็นอังกฤษ
   - **ข้อยกเว้น (เจ้าของสั่ง 2026-08-31): ศัพท์โป๊กเกอร์ใช้อังกฤษ** — Fold / Check / Call / Raise /
     All in / Preflop / Flop / Turn / River / Showdown / Pot และชื่อชุดไพ่ (`HAND_NAMES` ใน
     `lan/poker-engine.mjs`) เพราะคำแปลไทยที่คิดขึ้นเองอ่านแล้วงงกว่าของเดิม
     คำอธิบาย คำแนะนำ และข้อความเตือน ยังเป็นไทยเหมือนเดิม **อย่าแปลกลับ**

## สไตล์โค้ด

- Vanilla JS แบบ ES5-ish ห่อด้วย IIFE `(function () { "use strict"; ... })()`
- HTML + JS อยู่ในไฟล์เดียวกันต่อหนึ่งเกม ยกเว้นข้อมูลที่แยกออกไป
- CSS ที่ใช้ร่วมกันอยู่ที่ `assets/style.css` เท่านั้น CSS เฉพาะเกมใส่ `<style>` ในหน้านั้น
- ใช้ CSS variable จาก `:root` เสมอ ห้าม hardcode สี

## ดีไซน์

คอนเซปต์คือ **ไวท์บอร์ดกับปากกาเมจิก** — พื้นขาวอมเทามีตารางจางๆ เส้นขอบหนา 3px สีดำหมึก เงาแข็งแบบออฟเซ็ต ไม่มี gradient ไม่มีเงาฟุ้ง

- ฟอนต์หัวเรื่อง `Mali` (ลายมือไทย)
- ฟอนต์เนื้อหา `IBM Plex Sans Thai`
- ตัวเลข/เวลา `IBM Plex Mono`
- สีเน้นคือสีปากกาเมจิก: `--ink-blue` `--ink-red` `--ink-green` `--ink-orange`

## คุณภาพขั้นต่ำ

- ใช้งานได้บนจอมือถือกว้าง 360px
- ปุ่มทุกอันมี `:focus-visible` ที่มองเห็นได้
- เคารพ `prefers-reduced-motion`
- ปุ่มเขียนว่าจะเกิดอะไรขึ้น ไม่ใช่ "ตกลง" ลอยๆ
