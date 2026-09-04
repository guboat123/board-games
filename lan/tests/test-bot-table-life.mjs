/* ===========================================================
   บอทเข้า-ออกโต๊ะ: เติมชิปเสริม และลุกเองทั้งที่ยังมีชิป

   ⚠️ ทำไมต้องมี: ของเดิมทางออกจากโต๊ะมีทางเดียวคือ "ชิปเป็นศูนย์เป๊ะ"
   (บรรทัด if (b.stack > 0) continue;) บอทจึงไม่เคยเก็บกำไรแล้วเลิก
   ไม่เคยลุกเพราะโต๊ะไม่คุ้ม และไม่เคยเติมชิปเสริม
   บอทที่เหลือ 97 ชิปบนโต๊ะบายอิน 2,000 นั่งแช่ต่อไปเรื่อย ๆ
   เจ้าของทักเองว่า "เรื่องลุกจากโต๊ะ ก็ไม่เห็นมีเกิด" ซึ่งถูก

   และเพราะทั้งสองอย่างขยับเงินระหว่างกระเป๋ากับชิปบนโต๊ะ
   จึงต้องมีเทสต์ยืนยันว่า "เงินย้ายที่ ไม่ใช่เงินงอก" ตามกฎประจำ repo

   รัน:  node lan/tests/test-bot-table-life.mjs
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
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
function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "life-"));
  bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);
  const table = createTable("LIFE");
  const mgr = createBotManager({ table: table }, function () {});
  table.sit("คนดู", null, 1000000, "watcher");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;
  return { table: table, mgr: mgr, st: table._state, dir: dir };
}
const BUY_IN = 2000;

/* ---------- บอทลุกเป็นสองจังหวะ ----------
   จังหวะแรก settleBusted ติดป้ายว่าจะลุก (b.leaving = เวลาที่ครบกำหนด) แล้วยืนโบกมืออยู่ 2.2 วิ
   จังหวะสอง settleBusted รอบถัดไปที่เวลาครบ ค่อยเก็บเงินและเรียกตัวแทน (ดู botLeaves)
   เทสต์เดินเป็นแสนรอบในไม่กี่วินาที จะนั่งรอนาฬิกาจริงไม่ได้ จึงเร่งเข็มให้แล้วเรียกซ้ำ
   ⚠️ ห้ามลัดไปเรียก finishLeaving ตรง ๆ — ต้องเดินทางเดียวกับเกมจริงทุกบรรทัด
      ไม่งั้นเทสต์จะผ่านทั้งที่ทางที่คนเล่นเจอจริงพัง */
function settleNow(w) {
  w.mgr.settleBusted();
  const going = w.st.seats.filter(function (x) { return x && x.isBot && x.leaving; });
  if (!going.length) return;
  going.forEach(function (x) { x.leaving = 1; });   /* ครบกำหนดไปนานแล้ว */
  w.mgr.settleBusted();
}

/* ---------- 1. เติมชิปเสริมตอนสั้น ---------- */
console.log("");
console.log("--- เติมชิปเสริมเมื่อชิปสั้นเกินจะเล่น ---");
{
  const w = fresh();
  w.mgr._addNamed("Rex", 3);
  const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
  b.stack = 120;                 /* 6% ของบายอิน = สั้นมาก */
  b.wallet = 50000;
  const beforeTotal = b.stack + b.wallet;
  const beforeBusts = b.busts || 0;
  /* ⚠️ ต้องเดินเลขมือด้วย ไม่งั้นตัวกันไม่ให้ตัดสินใจซ้ำในมือเดียวจะบล็อกทุกรอบ
     (poke ในเกมจริงเรียก settleBusted หลายครั้งต่อมือ จึงต้องมีตัวกันตัวนี้) */
  let tries = 0;
  while (b.stack < BUY_IN && tries++ < 200) { w.st.handNo++; w.mgr.settleBusted(); }
  ok("บอทที่เหลือ 120 ชิป ต้องเติมกลับขึ้นมา", b.stack === BUY_IN, "ได้ " + b.stack);
  ok("เงินรวม (กระเป๋า+ชิป) ต้องไม่เปลี่ยน",
     b.stack + b.wallet === beforeTotal, b.stack + b.wallet + " vs " + beforeTotal);
  ok("เติมเสริมต้องไม่ถูกนับว่าล้มโต๊ะ", (b.busts || 0) === beforeBusts);
  ok("boughtIn ต้องเพิ่มตามชิปที่เติม (ไม่งั้นกำไรขาดทุนเพี้ยน)",
     b.boughtIn === BUY_IN + (BUY_IN - 120), "boughtIn=" + b.boughtIn);
  w.mgr.stop();
}

/* ---------- 2. ชิปเยอะแล้วไม่ต้องเติม ---------- */
console.log("");
console.log("--- ชิปยังพอเล่น ต้องไม่ไปยุ่งกับมัน ---");
{
  const w = fresh();
  w.mgr._addNamed("Duke", 3);
  const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
  b.stack = 1800; b.wallet = 50000;
  const bought = b.boughtIn;
  for (let i = 0; i < 50; i++) { w.st.handNo++; w.mgr.settleBusted(); }
  ok("ชิป 1,800 (90% ของบายอิน) ต้องไม่ถูกเติม", b.boughtIn === bought, "boughtIn=" + b.boughtIn);
  w.mgr.stop();
}

/* ---------- 3. ลุกเองทั้งที่ยังมีชิป ---------- */
console.log("");
console.log("--- ลุกเองทั้งที่ยังมีชิป (ของเดิมเป็นไปไม่ได้เลย) ---");
{
  const w = fresh();
  w.mgr._addNamed("Milo", 1);       /* มือใหม่ = เก็บกำไรแล้วหนีบ่อยที่สุด */
  const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
  const seatId = b.seatId;
  b.stack = BUY_IN * 2;             /* กำไรเท่าตัว = เข้าเงื่อนไข "ได้แล้วเลิก" */
  b.wallet = 4000;
  const nameGone = b.name;
  const moneyBefore = b.stack + b.wallet;
  let left = false;
  for (let i = 0; i < 400 && !left; i++) {
    w.st.handNo++;
    settleNow(w);
    const now = w.st.seats[seatId];
    if (!now || now.name !== nameGone) left = true;
  }
  ok("มือใหม่ที่กำไรเท่าตัว ต้องลุกเองได้ภายใน 400 มือ", left);
  ok("ชิปบนโต๊ะต้องกลับเข้ากระเป๋า ไม่หายไปเฉย ๆ",
     bank.bankrollOf(nameGone) === moneyBefore,
     bank.bankrollOf(nameGone) + " vs " + moneyBefore);
  ok("ต้องมีคนมานั่งแทน โต๊ะไม่ค่อย ๆ ว่างลง",
     w.st.seats.filter(function (s) { return s && s.isBot; }).length === 1);
  ok("ชื่อที่ลุกไปต้องถูกปล่อย ไปนั่งโต๊ะอื่นได้", !bank.isBusy(nameGone) || w.st.seats.some(function (s) { return s && s.name === nameGone; }));
  w.mgr.stop();
}

/* ---------- 4. นักพนันต้องดื้อกว่ามือใหม่ชัดเจน ---------- */
console.log("");
console.log("--- นิสัยประจำระดับต้องยังต่างกัน ---");
{
  function quitsIn(level, name, rounds) {
    const w = fresh();
    w.mgr._addNamed(name, level);
    const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
    const seatId = b.seatId, was = b.name;
    b.stack = BUY_IN * 2; b.wallet = 4000;
    let n = 0;
    for (let i = 0; i < rounds; i++) {
      w.st.handNo++;
      settleNow(w);
      const now = w.st.seats[seatId];
      if (!now || now.name !== was) { n++; break; }
    }
    w.mgr.stop();
    return n;
  }
  let beginnerQuit = 0, gamblerQuit = 0;
  for (let r = 0; r < 60; r++) {
    beginnerQuit += quitsIn(1, "Pip", 40);
    gamblerQuit  += quitsIn(2, "Vince", 40);
  }
  ok("มือใหม่ต้องเก็บกำไรแล้วเลิกบ่อยกว่านักพนัน",
     beginnerQuit > gamblerQuit, "มือใหม่ " + beginnerQuit + " · นักพนัน " + gamblerQuit + " จาก 60 รอบ");
}

/* ---------- 5. ตัดสินใจได้มือละครั้ง ไม่ใช่ทุกครั้งที่ถูกเรียก ---------- */
console.log("");
console.log("--- เรียกซ้ำในมือเดียว ต้องไม่ทำให้โอกาสลุกพองขึ้น ---");
{
  /* ⚠️ กับดักประจำโปรเจกต์นี้: poke() เรียก settleBusted() ทุกครั้งที่สถานะเป็น
     waiting/showdown ซึ่งเกิดสิบกว่าครั้งต่อหนึ่งมือ ส่วนเครื่องมือวัดเรียกมือละครั้ง
     อะไรก็ตามที่ "ทอยลูกเต๋า" ในนั้นจึงพองขึ้นเป็นสิบเท่าเฉพาะในเกมจริง โดยที่วัดไม่เห็น
     (เคยโดนมาแล้วกับ rememberFoes ที่ทำให้ความแค้นพองหลายเท่า) */
  function leftOnce(sameHand, calls) {
    const w = fresh();
    w.mgr._addNamed("Bobby", 1);
    const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
    const seatId = b.seatId, was = b.name;
    b.stack = BUY_IN * 2; b.wallet = 4000;     /* กำไรเท่าตัว = อยากเก็บแล้วเลิก */
    for (let i = 0; i < calls; i++) {
      if (!sameHand) w.st.handNo++;
      settleNow(w);
      const now = w.st.seats[seatId];
      if (!now || now.name !== was) { w.mgr.stop(); return 1; }
    }
    w.mgr.stop();
    return 0;
  }
  let same = 0, spread = 0;
  for (let t = 0; t < 200; t++) {
    same   += leftOnce(true, 20);
    spread += leftOnce(false, 20);
  }
  ok("เรียก 20 ครั้งในมือเดียว ต้องเท่ากับทอยครั้งเดียว",
     same * 3 < spread || same <= 12,
     "มือเดียว " + same + " · ยี่สิบมือ " + spread + " จาก 200 ครั้ง");
  ok("และต้องยังลุกได้จริงเมื่อมือเดินไปเรื่อย ๆ", spread > same);
}

/* ---------- 6. ช่วงโบกมือลา ต้องยืนอยู่ให้คนเห็นจริง ---------- */
console.log("");
console.log("--- ลุกจากโต๊ะต้องกินเวลา ไม่ใช่หายไประหว่างสองเฟรม ---");
{
  /* ⚠️ เหตุผลที่ต้องมีเทสต์นี้: ของเดิมลุกแล้วเรียกตัวใหม่มานั่งในบรรทัดถัดไป
     ภายในการอัปเดตสถานะครั้งเดียว บนจอจึงไม่มีใครเคยเห็นบอทลุกเลยสักครั้ง
     เจ้าของทักเองว่า "เรื่องลุกจากโต๊ะ ก็ไม่เห็นมีเกิด" ทั้งที่โค้ดทำงานถูกมาตลอด */
  const w = fresh();
  w.mgr._addNamed("Pip", 1);
  const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
  const seatId = b.seatId, was = b.name;
  b.stack = BUY_IN * 2; b.wallet = 4000;
  const moneyBefore = b.stack + b.wallet;

  /* เดินจนกว่าจะตัดสินใจลุก แต่ยังไม่เร่งนาฬิกา */
  let marked = false;
  for (let i = 0; i < 400 && !marked; i++) {
    w.st.handNo++;
    w.mgr.settleBusted();
    if (w.st.seats[seatId] && w.st.seats[seatId].leaving) marked = true;
  }
  ok("ตัดสินใจลุกแล้วต้องติดป้ายไว้ก่อน", marked);
  const mid = w.st.seats[seatId];
  ok("ระหว่างโบกมือ ต้องยังเป็นคนเดิมนั่งอยู่ที่เดิม", !!mid && mid.name === was,
     mid && mid.name);
  /* ถ้าไม่พักมือไว้ มือถัดไปจะแจกไพ่ให้คนที่กำลังจะเดินออกไปแล้ว */
  ok("ต้องถูกพักมือไว้ จะได้ไม่ถูกแจกไพ่ในมือถัดไป", !!mid && mid.sitOut === true);
  ok("ชิปยังอยู่บนโต๊ะ ยังไม่ถูกเก็บ", !!mid && mid.stack === BUY_IN * 2);

  /* เรียกซ้ำระหว่างที่ยังไม่ครบเวลา ต้องไม่มีอะไรขยับ (poke เรียกถี่มากในเกมจริง) */
  for (let i = 0; i < 10; i++) { w.st.handNo++; w.mgr.settleBusted(); }
  const still = w.st.seats[seatId];
  ok("เรียกซ้ำสิบรอบก่อนครบเวลา ต้องยังไม่เก็บ", !!still && still.name === was);

  /* ครบเวลาแล้วค่อยเก็บจริง */
  still.leaving = 1;
  w.mgr.settleBusted();
  const after = w.st.seats[seatId];
  ok("ครบเวลาแล้วต้องมีคนใหม่มานั่งแทน", !!after && after.name !== was, after && after.name);
  ok("เงินต้องกลับเข้ากระเป๋าครบ ไม่หายระหว่างสองจังหวะ",
     bank.bankrollOf(was) === moneyBefore,
     bank.bankrollOf(was) + " vs " + moneyBefore);
  ok("ชื่อเดิมถูกปล่อยแล้ว ไปนั่งโต๊ะอื่นได้", !bank.isBusy(was));
  w.mgr.stop();
}

/* ---------- 7. สั่งเอาบอทออก ต้องออกทันที ไม่ต้องรอโบกมือ ---------- */
console.log("");
console.log("--- กดเอาบอทออก ระหว่างที่มีตัวกำลังลุกอยู่ ---");
{
  const w = fresh();
  w.mgr._addNamed("Toby", 1);
  const b = w.st.seats.filter(function (s) { return s && s.isBot; })[0];
  b.stack = BUY_IN * 2; b.wallet = 4000;
  for (let i = 0; i < 400 && !b.leaving; i++) { w.st.handNo++; w.mgr.settleBusted(); }
  ok("ตั้งต้น: มีตัวที่กำลังลุกอยู่จริง", !!b.leaving);
  w.mgr.removeAll();
  ok("กดเอาออกแล้วต้องไม่เหลือบอทค้างอยู่เลย",
     w.st.seats.filter(function (s) { return s && s.isBot; }).length === 0);
  w.mgr.stop();
}

console.log("");
if (fail) { console.log("=== ไม่ผ่าน " + fail + " ข้อ (ผ่าน " + pass + ") ==="); process.exit(1); }
console.log("=== ผ่านทั้งหมด " + pass + " ข้อ ===");
