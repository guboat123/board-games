/* ===========================================================
   บอทเดาไพ่คู่ต่อสู้แม่นแค่ไหน

   ⚠️ ระบบอ่านคน (claimedStrength → credibility → guessStrength) มีมาตั้งแต่ต้น
   แต่ไม่เคยมีใครวัดว่ามันเดาแม่นจริงไหม แม้แต่ครั้งเดียว
   เครื่องมือนี้ถามบอทว่า "ตอนนี้คิดว่าคนนั้นแรงแค่ไหน" ผ่านทางเดียวกับที่ decide ใช้
   แล้วเทียบกับไพ่จริงของคนนั้น ซึ่งเครื่องมือแอบดูได้ แต่บอทดูไม่ได้

   ⚠️ ห้ามคำนวณค่าเดาซ้ำเองในไฟล์นี้เด็ดขาด ต้องถามผ่าน mgr._readGuess เท่านั้น
   ไม่งั้นจะกลายเป็นวัดโค้ดที่ลอกมา ไม่ใช่โค้ดที่บอทใช้จริง — เคยพลาดแบบนั้นมาแล้ว
   ทั้งโปรเจกต์ (ดู senseTable ใน STATUS)

   วัดสี่อย่าง ต่อระดับ และต่อสตรีท:
     พลาดเฉลี่ย   เดาห่างจากความจริงเท่าไหร่ (ยิ่งน้อยยิ่งดี)
     ทิศทาง       เดาขึ้นลงตามความจริงไหม (0 = มั่ว · 1 = ตรงเป๊ะ)
     เอียง        เดาสูงหรือต่ำกว่าความจริงเป็นระบบ (+ = กลัวเกินจริง)
     จับคนแรงได้  ตอนคู่ต่อสู้แรงจริง บอทเดาว่าแรงกี่ % — อันนี้คืออันที่เสียเงิน

   รัน:  node lan/tools/read-check.mjs [จำนวนมือ]
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HANDS = Number(process.argv[2] || 8000);
const PER_ROUND = 2000;
const LN = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };
const STREETS = ["preflop", "flop", "turn", "river"];

/* ⚠️ "ความจริง" ต้องมาจาก mgr._handValue ซึ่งเรียก madeStrength ตัวเดียวกับที่บอทใช้
   คำนวณเองจะขาดตัวหักไพ่บนบอร์ดล้วน แล้วความจริงจะสูงเกินไป ความเอียงจะดูน้อยกว่าที่เป็น */

const ROSTER = {
  1: ["Milo", "Pip", "Toby", "Bruno", "Ozzy", "Rudy", "Gus", "Wally", "Bobby", "Sammy"],
  2: ["Vince", "Rocco", "Gio", "Marco", "Sonny", "Rico", "Tank", "Buddy", "Lenny", "Frankie"],
  3: ["Rex", "Duke", "Vega", "Otto", "Zed", "Kai", "Nico", "Sable", "Cole", "Ash"]
};
const PER_LEVEL = { 1: 3, 2: 3, 3: 2 };
const off = { 1: 0, 2: 0, 3: 0 };

const S = {};
for (const lv of [1, 2, 3]) {
  S[lv] = { all: mk() };
  for (const st of STREETS) S[lv][st] = mk();
}
function mk() { return { n: 0, absErr: 0, bias: 0, gs: [], ts: [], strongN: 0, strongHit: 0,
                         naiveErr: 0, truthSum: 0, guessSum: 0,
                         gStrong: 0, nStrong: 0, gWeak: 0, nWeak: 0 }; }
/* ค่ากลางที่ bots.mjs ใช้เป็นจุดตั้งต้นเวลา "ไม่รู้อะไรเลย" */
const NEUTRAL = 0.45;
function note(box, guess, truth) {
  box.n++;
  box.absErr += Math.abs(guess - truth);
  box.bias += guess - truth;
  box.gs.push(guess); box.ts.push(truth);
  /* ⚠️ เส้นเปรียบเทียบต้องคำนวณจากข้อมูลชุดเดียวกัน ไม่ใช่เขียนตัวเลขที่จำมา
     ถ้าอ่านคนแล้วยังพลาดมากกว่า "เดาค่ากลางทุกครั้ง" แปลว่าการอ่านทำให้แย่ลง */
  box.naiveErr += Math.abs(NEUTRAL - truth);
  box.truthSum += truth; box.guessSum += guess;
  /* ⚠️ "จับคนแรงได้" แบบใช้เกณฑ์ตายตัว (เดา >= 0.55) ใช้ไม่ได้เมื่อสเกลของค่าเดาขยับ
     ขยับค่ากลางลงทั้งสเกลแล้วตัวเลขนี้ร่วงทันทีทั้งที่การอ่านดีขึ้น = วัดผิด
     ใช้ "แยกแยะได้" แทน: ค่าเดาเฉลี่ยตอนเขาแรงจริง ลบ ค่าเดาเฉลี่ยตอนเขาไม่มีอะไร
     ไม่ขึ้นกับว่าสเกลอยู่ตรงไหน วัดสิ่งที่อยากรู้จริง ๆ คือ "แยกออกไหม" */
  if (truth >= 0.62) { box.strongN++; if (guess >= 0.55) box.strongHit++;
                       box.gStrong += guess; box.nStrong++; }
  else if (truth < 0.45) { box.gWeak += guess; box.nWeak++; }
}
function corr(x, y) {
  const n = x.length; if (n < 50) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : 0;
}

/* ⚠️ ความจำต้องสะสมข้ามรอบ ไม่งั้นฟีเจอร์ที่พึ่งความจำจะถูกวัดต่ำกว่าความจริง
   ของเดิมสร้างโฟลเดอร์สมองใหม่ทุก 2,000 มือ = บอทลืมทุกอย่างตลอดเวลา
   เซิร์ฟเวอร์จริงเก็บความจำข้ามมือ ข้ามวง และข้ามการรีสตาร์ต */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "read-"));
bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);

let done = 0;
let missing = false;
while (done < HANDS) {
  const n = Math.min(PER_ROUND, HANDS - done);
  const table = createTable("READ");
  const mgr = createBotManager({ table: table }, function () {});
  if (typeof mgr._readGuess !== "function" || typeof mgr._handValue !== "function") { missing = true; break; }
  table.sit("คนดู", null, 1000000, "watcher");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;
  for (const lv of [1, 2, 3]) {
    for (let k = 0; k < PER_LEVEL[lv]; k++) mgr._addNamed(ROSTER[lv][(off[lv] + k) % 10], lv);
    off[lv] = (off[lv] + PER_LEVEL[lv]) % 10;
  }
  const st = table._state;

  for (let h = 0; h < n; h++) {
    if (table.action(0, { type: "start" }).error) break;
    done++;
    let g = 0;
    while (st.phase !== "showdown" && st.phase !== "waiting" && g++ < 260) {
      const cur = st.current;
      if (cur < 0) break;
      const me = st.seats[cur];
      /* ถามความเห็นก่อนที่เขาจะลงมือ — เป็นจังหวะเดียวกับที่ decide ใช้ค่านี้จริง */
      if (me && me.isBot && STREETS.indexOf(st.phase) >= 0) {
        for (const x of st.seats) {
          if (!x || x.seatId === cur || !x.inHand || x.folded || !x.cards) continue;
          const guess = mgr._readGuess(cur, x.seatId);
          if (typeof guess !== "number" || guess <= 0) continue;
          const truth = mgr._handValue(x.seatId);
          if (truth === null) continue;
          note(S[me.botLevel].all, guess, truth);
          note(S[me.botLevel][st.phase], guess, truth);
        }
      }
      if (!mgr._decideNow(cur)) {
        const v = table.viewFor(cur);
        table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
      }
      mgr.senseTable();
    }
    mgr.senseTable();
    mgr.settleBusted();
    if (st.seats.filter(function (x) { return x && x.isBot; }).length < 4) break;
  }
  mgr.stop();
  for (const s of st.seats) if (s && s.isBot) bank.release(s.name);
}
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ไม่เป็นไร */ }

if (missing) {
  console.log("");
  console.log("ต้องมี mgr._readGuess(seatId, oppSeatId) และ mgr._handValue(seatId) ใน bots.mjs ก่อน");
  console.log("(ตัวอ่านอย่างเดียว ไม่เปลี่ยนพฤติกรรมอะไร — เอาไว้ถามค่าที่ decide ใช้จริง)");
  process.exit(2);
}

function show(label, box) {
  if (!box.n) { console.log("   " + label.padEnd(9) + " ไม่มีข้อมูล"); return; }
  const c = corr(box.gs, box.ts);
  console.log("   " + label.padEnd(9) +
    " พลาดเฉลี่ย " + (box.absErr / box.n).toFixed(3) +
    " · ทิศทาง " + (c === null ? " -   " : (c >= 0 ? " " : "") + c.toFixed(3)) +
    " · เอียง " + (box.bias / box.n >= 0 ? "+" : "") + (box.bias / box.n).toFixed(3) +
    " · แยกแยะได้ " + ((box.nStrong && box.nWeak)
        ? ((box.gStrong / box.nStrong - box.gWeak / box.nWeak) >= 0 ? "+" : "") +
          (box.gStrong / box.nStrong - box.gWeak / box.nWeak).toFixed(3)
        : "  -   ") +
    "   [ความจริงเฉลี่ย " + (box.truthSum / box.n).toFixed(3) +
    " · เดาเฉลี่ย " + (box.guessSum / box.n).toFixed(3) +
    " · ไม่อ่านเลยพลาด " + (box.naiveErr / box.n).toFixed(3) + "]" +
    "   (" + box.n.toLocaleString("en-US") + " ครั้ง)");
}

console.log("");
console.log("บอทเดาไพ่คู่ต่อสู้แม่นแค่ไหน · " + done.toLocaleString("en-US") + " มือ");
console.log("=".repeat(96));
console.log("พลาดเฉลี่ย ยิ่งน้อยยิ่งดี · ทิศทาง 0 = มั่ว · เอียง + = กลัวเกินจริง");
console.log("แยกแยะได้ = เดาเฉลี่ยตอนเขาแรงจริง ลบ เดาเฉลี่ยตอนเขาไม่มีอะไร (ยิ่งมากยิ่งดี · 0 = แยกไม่ออกเลย)");
for (const lv of [1, 2, 3]) {
  console.log("");
  console.log(LN[lv]);
  show("รวม", S[lv].all);
  for (const stt of STREETS) show(stt, S[lv][stt]);
}
console.log("");
console.log("[ไม่อ่านเลย] = เดาเป็นค่ากลาง " + NEUTRAL + " ทุกครั้ง คำนวณจากข้อมูลชุดเดียวกัน");
console.log("ถ้า 'พลาดเฉลี่ย' ไม่ต่ำกว่า 'ไม่อ่านเลย' ชัดเจน แปลว่าระบบอ่านคนยังไม่ได้ช่วยอะไร");
