/* ===========================================================
   ท่าที่เขียนไว้ ต้องเกิดขึ้นจริง

   ⚠️ กับดักประจำโปรเจกต์นี้ เจอมาแล้วสี่ครั้ง:
   เขียนท่าใหม่ลงไป · สกอร์การ์ดผ่าน · แล้วท่านั้นไม่เคยทำงานเลยสักครั้ง
     - trap เคยปิดการไล่ทับทั้งสตรีท กับดักจึงไม่เคยสปริง (วัดได้ check-raise 0.4%)
     - ตัวกัน donk อยู่หลังบรรทัดที่คืนค่าไปก่อน จึงไม่เคยได้ทำงาน
     - senseTable ถูกเรียกเฉพาะในเซิร์ฟเวอร์จริง เครื่องมือวัดข้ามทั้งก้อน
     - "ตามเพื่อล่อ" รอบแรกเกิด 0 ครั้งใน 900 มือ · "เคาะดูอาการ" เกิด 0.16%
   ทุกครั้งสกอร์การ์ดเขียวหมด เพราะ "ไม่ทำอะไรเลย" ก็อยู่ในกรอบเหมือนกัน

   ไฟล์นี้จึงไม่ได้ถามว่า "เล่นเหมือนคนไหม" แต่ถามว่า "ท่านี้ยังมีชีวิตอยู่ไหม"
   ถ้าวันหลังมีคนแก้เงื่อนไขจนท่าตาย ตรงนี้จะร้องก่อนที่จะไม่มีใครสังเกตเห็น

   รัน:  node lan/tests/test-bot-moves.mjs
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager, TRACE, _resetTrace } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  : " + name + (extra ? "  (" + extra + ")" : "")); }
  else { fail++; console.log("  FAIL: " + name + (extra ? "  (" + extra + ")" : "")); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moves-"));
bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);

const table = createTable("MOVES");
const mgr = createBotManager({ table: table }, function () {});
/* คละสามระดับ — "จ่ายเพื่อดูไพ่" มีทั้งของนักพนันและของมืออาชีพ คนละเกณฑ์กัน */
[["Rex", 3], ["Duke", 3], ["Vega", 3], ["Vince", 2], ["Rocco", 2], ["Gio", 2],
 ["Milo", 1], ["Pip", 1]].forEach(function (o) { mgr._addNamed(o[0], o[1]); });
_resetTrace();

const st = table._state;
const HANDS = 1200;
let played = 0;
for (let h = 0; h < HANDS; h++) {
  /* ⚠️ เติมชิปให้อยู่เสมอ — ไฟล์นี้วัด "ท่า" ไม่ได้วัดเศรษฐกิจ
     ปล่อยให้เจ๊งจริงแล้วโต๊ะจะเหลือคนน้อยภายในไม่กี่ร้อยมือ แล้ววัดอะไรไม่ได้เลย
     (เศรษฐกิจมีเทสต์ของตัวเองอยู่แล้วที่ test-debt-floor และ test-bot-table-life) */
  for (const s of st.seats) {
    if (s && s.isBot) {
      s.wallet = 1e9;
      if (s.stack < 800) { s.stack = 6000; s.boughtIn += 6000; }
      /* ⚠️ และต้องปลุกคนที่พักมืออยู่ด้วย
         ตอนนี้บอทพักมือเองได้เมื่ออารมณ์เสีย และลุกจากโต๊ะเป็นสองจังหวะ
         ปล่อยไว้แล้วโต๊ะจะเหลือคนไม่พอเริ่มมือภายในสองร้อยมือ แล้ววัดท่าไม่ได้
         (พฤติกรรมพวกนั้นมีเทสต์ของตัวเองที่ test-bot-table-life) */
      s.sitOut = false;
      delete s.leaving;
    }
  }
  const first = st.seats.findIndex(function (x) { return x && x.isBot; });
  if (first < 0) break;
  if ((table.action(first, { type: "start" }) || {}).error) break;
  played++;
  let guard = 0;
  while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 260) {
    const cur = st.current;
    if (cur < 0) break;
    if (!mgr._decideNow(cur)) break;
    mgr.senseTable();
  }
  /* senseTable ให้ความจำเดิน (ท่า "จ่ายเพื่อดูไพ่" ขึ้นกับว่าเคยเห็นเขาเปิดกี่ครั้ง)
     แต่ไม่เรียก settleBusted — ไฟล์นี้วัดท่า ไม่ได้วัดการเข้าออกโต๊ะ */
  mgr.senseTable();
}

console.log("");
console.log("--- เดินไป " + played + " มือ · มืออาชีพตัดสินใจ " + TRACE.acts + " ครั้ง ---");
ok("เดินได้ครบพอที่จะวัด", played > 600 && TRACE.acts > 1500,
   played + " มือ · " + TRACE.acts + " ท่า");

const rate = function (n) { return n / Math.max(1, TRACE.acts); };

/* ---------- ท่าต้องยังมีชีวิต ---------- */
console.log("");
console.log("--- ท่าใหม่ต้องเกิดขึ้นจริง ไม่ใช่โค้ดตาย ---");
ok("เคาะเพื่อดูอาการ ยังเกิดอยู่", TRACE.probe > 0,
   TRACE.probe + " ครั้ง (" + (rate(TRACE.probe) * 100).toFixed(2) + "% ของท่า)");
ok("ตามเพื่อล่อ ยังเกิดอยู่", TRACE.milk > 0,
   TRACE.milk + " ครั้ง (" + (rate(TRACE.milk) * 100).toFixed(2) + "%)");
ok("จ่ายเพื่อดูไพ่ ยังเกิดอยู่", TRACE.nosyPay > 0, TRACE.nosyPay + " ครั้ง");

/* ---------- แต่ต้องไม่บ่อยจนกลายเป็นนิสัยประจำ ---------- */
console.log("");
console.log("--- และต้องไม่บ่อยจนอ่านออกว่าเป็นเครื่อง ---");
/* ⚠️ เพดานสำคัญพอ ๆ กับพื้น
   เคาะดูอาการบ่อยเกินไป = มืออาชีพไม่กล้าเดิมพันมือกลางเลย ซึ่งอ่านออกทันที
   และ c-bet จะหลุดกรอบล่าง (55%) ตามไปด้วย */
ok("เคาะดูอาการไม่เกิน 6% ของท่า", rate(TRACE.probe) < 0.06,
   (rate(TRACE.probe) * 100).toFixed(2) + "%");
/* ล่อบ่อยเกิน = ไล่:ตาม จะตกต่ำกว่ากรอบ (1.4) เพราะไล่ทับกลายเป็นตามหมด */
ok("ตามเพื่อล่อไม่เกิน 2% ของท่า", rate(TRACE.milk) < 0.02,
   (rate(TRACE.milk) * 100).toFixed(2) + "%");
/* จ่ายเพื่อดูบ่อยเกิน = "ไปถึงเปิดไพ่" หลุดกรอบ 22-32% ของมืออาชีพ */
ok("จ่ายเพื่อดูไพ่ไม่เกิน 3% ของท่า", rate(TRACE.nosyPay) < 0.03,
   (rate(TRACE.nosyPay) * 100).toFixed(2) + "%");

mgr.stop();
fs.rmSync(dir, { recursive: true, force: true });
console.log("");
console.log(fail === 0 ? "=== ผ่านหมด " + pass + " ข้อ ===" : "=== ตก " + fail + " จาก " + (pass + fail) + " ===");
process.exit(fail === 0 ? 0 : 1);
