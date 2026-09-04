/* ===========================================================
   หนี้ต้องมีพื้น — เจ๊งเกินขีดแล้วเลิกเล่นถาวร

   ⚠️ เจ้าของถามว่า "การที่บอทเป็นหนี้ ต้องมีบทลงโทษไหม แล้วมันจะได้เล่นแบบดีๆ"
   บทลงโทษมีอยู่แล้วสี่ชั้น และวัดได้ว่าทำงาน (มืออาชีพ 0/10 ติดลบ · นักพนัน 4/10)
   สิ่งที่ขาดคือพื้น: หนี้ไม่มีขีดจำกัด บอทกู้มาเล่นได้ตลอดกาล
   = เงินสดใหม่ไหลเข้าโต๊ะไม่จำกัด แล้ว "การหมดตัว" ก็ไม่มีความหมายในระยะยาว

   ⚠️ และสิ่งที่ห้ามทำคือ "เป็นหนี้แล้วเล่นดีขึ้น" — นั่นจะยุบสามระดับเหลือระดับเดียว
   เทสต์นี้จึงยืนยันด้วยว่าพื้นหนี้ไม่ได้ไปแตะวิธีเล่นของใคร

   รัน:  node lan/tests/test-debt-floor.mjs
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "floor-"));
  bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);
  const table = createTable("FLOOR");
  const mgr = createBotManager({ table: table }, function () {});
  table.sit("คนดู", null, 1000000, "w");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;
  return { table: table, mgr: mgr, st: table._state };
}

/* ---------- 1. ยังไม่ถึงพื้น ต้องยังเล่นได้ ---------- */
console.log("");
console.log("--- เป็นหนี้แต่ยังไม่ถึงขีด ต้องยังกลับมานั่งได้ ---");
{
  const w = fresh();
  /* นักพนันเริ่มด้วย 20,000 · ขีดคือติดลบ 40,000 */
  bank.startSession("Vince", 20000, Date.now());
  bank.sync("Vince", -15000, 0, Date.now());
  ok("ติดลบ 15,000 ยังไม่เลิก", !bank.isRetired("Vince"), bank.bankrollOf("Vince"));
  ok("ยังถูกเรียกมานั่งได้", bank.claim("Vince") === true);
  bank.release("Vince");
  w.mgr.stop();
}

/* ---------- 2. ถึงพื้นแล้วต้องเลิก ---------- */
console.log("");
console.log("--- ติดลบเกินสองเท่าของเงินตั้งต้น = เลิกเล่นถาวร ---");
{
  const w = fresh();
  bank.startSession("Rocco", 20000, Date.now());
  bank.sync("Rocco", -40001, 0, Date.now());
  ok("ติดลบ 40,001 ถือว่าเลิกแล้ว", bank.isRetired("Rocco"));
  ok("เรียกมานั่งไม่ได้อีก", bank.claim("Rocco") === false);
  /* ⚠️ แต่เครื่องมือวัดต้องยังเลือกเองได้ (_addNamed ส่ง force)
     ถ้าเศรษฐกิจแอบถอนคนออกจากการทดลอง ตัวอย่างจะเปลี่ยนโดยไม่มีใครรู้
     เกิดขึ้นจริงแล้วตอนใส่พื้นหนี้รอบแรก: สกอร์การ์ดเหลือโต๊ะสามคนแล้วตก 3 ช่อง */
  ok("แต่เครื่องมือวัดยังเรียกได้ (ไม่งั้นการวัดจะเพี้ยนเงียบ ๆ)",
     w.mgr._addNamed("Rocco", 2) !== null);
  ok("ขึ้นในตารางเงินว่าเลิกแล้ว",
     (bank.all().find(function (x) { return x.name === "Rocco"; }) || {}).retired === true);
  w.mgr.stop();
}

/* ---------- 3. ขีดคิดจากเงินตั้งต้นของระดับตัวเอง ---------- */
console.log("");
console.log("--- คนละระดับ ขีดคนละที่ (เงินตั้งต้นไม่เท่ากัน) ---");
{
  const w = fresh();
  /* มือใหม่เริ่ม 5,000 -> ขีด -10,000 · มืออาชีพเริ่ม 100,000 -> ขีด -200,000 */
  bank.startSession("Pip", 5000, Date.now());
  bank.sync("Pip", -12000, 0, Date.now());
  bank.startSession("Rex", 100000, Date.now());
  bank.sync("Rex", -12000, 0, Date.now());
  ok("มือใหม่ติดลบ 12,000 = เลิกแล้ว", bank.isRetired("Pip"));
  ok("มืออาชีพติดลบเท่ากัน ยังไม่เลิก", !bank.isRetired("Rex"));
  w.mgr.stop();
}

/* ---------- 4. เรียกบอททั้งระดับ ต้องข้ามตัวที่เลิกแล้ว ---------- */
console.log("");
console.log("--- เรียกบอทมานั่ง ต้องไม่พยายามเรียกตัวที่เลิกไปแล้ว ---");
{
  const w = fresh();
  const gamblers = ["Vince", "Rocco", "Gio", "Marco", "Sonny",
                    "Rico", "Tank", "Buddy", "Lenny", "Frankie"];
  /* ให้เจ๊งไปแปดตัว เหลือว่างสองตัว */
  gamblers.slice(0, 8).forEach(function (n) {
    bank.startSession(n, 20000, Date.now());
    bank.sync(n, -50000, 0, Date.now());
  });
  const r = w.mgr.add(5, 2);
  ok("ตัวที่ได้ต้องไม่ติดลบเกินขีดแล้ว",
     r.added.every(function (n) { return !bank.isRetired(n); }), r.added.join(", "));
  /* ⚠️ ต้องบอกว่า "ไม่ว่าง" ด้วย ไม่งั้นคนกดเห็นแค่ได้ไม่ครบแล้วกดซ้ำไปเรื่อย */
  ok("บอกด้วยว่าเรียกไม่ครบ", r.busy === true);
  ok("บอกจำนวนที่ยังเลิกอยู่กลับมาด้วย", r.retired > 0, "นับได้ " + r.retired);
  w.mgr.stop();
}

/* ---------- 5. โต๊ะต้องไม่ล่มเพราะคนเจ๊งหมด ---------- */
console.log("");
console.log("--- เจ๊งกันหมดระดับ ต้องมีคนกลับมา ไม่ใช่โต๊ะร้าง ---");
{
  /* ⚠️ เหตุผลที่ต้องมีข้อนี้: พื้นหนี้รอบแรกทำสกอร์การ์ด 51 ช่องตกทันที
     ไม่ใช่เพราะบอทเล่นเพี้ยน แต่เพราะระดับหนึ่งมีสิบชื่อ พอเจ๊งไปเยอะโต๊ะก็เหลือสามคน
     และ "เล่นสามคน" ดุกว่า "เล่นหกคน" โดยธรรมชาติ (ไล่:ตาม 4.41 ของคนจริงคือ 1.4-3.6)
     คนเจ๊งจริง ๆ ก็ไม่ได้หายไปตลอดกาล เขาหายไปพักแล้วกลับมาด้วยเงินก้อนใหม่ */
  const w = fresh();
  const gamblers = ["Vince", "Rocco", "Gio", "Marco", "Sonny",
                    "Rico", "Tank", "Buddy", "Lenny", "Frankie"];
  gamblers.forEach(function (n) {
    bank.startSession(n, 20000, Date.now());
    bank.sync(n, -50000, 0, Date.now());
  });
  ok("ตั้งต้น: เจ๊งครบทั้งสิบตัว",
     gamblers.every(function (n) { return bank.isRetired(n); }));
  const r = w.mgr.add(3, 2);
  ok("ยังเรียกบอทมานั่งได้", r.added.length > 0, "ได้ " + r.added.length + " ตัว");
  const alive = gamblers.filter(function (n) { return !bank.isRetired(n); });
  ok("มีคนกลับมาพอตั้งโต๊ะ", alive.length >= 3, "เหลือเล่นได้ " + alive.length + " ตัว");
  /* ⚠️ กลับมาแล้วหนี้หาย แต่ประวัติต้องไม่หาย ไม่งั้นก็ไม่มีอะไรเหลือจากการเจ๊งเลย */
  const back = bank.all().filter(function (x) { return x.revivals > 0; });
  ok("คนที่กลับมาต้องมีประวัติติดตัว", back.length > 0 && back[0].busts >= 0,
     back.map(function (x) { return x.name + " (กลับมา " + x.revivals + " รอบ)"; }).join(", "));
  w.mgr.stop();
}

/* ---------- 6. พื้นหนี้ต้องไม่ไปแตะวิธีเล่น ---------- */
console.log("");
console.log("--- ห้ามเผลอทำให้ 'เป็นหนี้แล้วเล่นดีขึ้น' ---");
{
  /* ⚠️ ข้อนี้คือเหตุผลที่เลือกทำ "พื้น" แทน "บทลงโทษการเล่น"
     ถ้าหนี้ไปเปลี่ยนเกณฑ์การตัดสินใจ นักพนันที่เสียหนักจะเล่นตึงขึ้นจนกลายเป็นมืออาชีพ
     สามระดับจะยุบเหลือระดับเดียว และสกอร์การ์ด 51 ช่องจะตกทันที
     (นักพนันต้องลงเล่น 45-70% ของมือ ถ้าตึงขึ้นก็หลุดกรอบ)
     ตรวจแบบตรงไปตรงมา: ซอร์สของ bot-bank.mjs ต้องไม่รู้จักอะไรที่เกี่ยวกับการตัดสินใจเลย */
  const src = fs.readFileSync(new URL("../bot-bank.mjs", import.meta.url), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "");
  ["margin", "preMargin", "raise", "bluff", "equity", "decide", "LEVEL"].forEach(function (wd) {
    ok("ธนาคารไม่ยุ่งกับ \"" + wd + "\"", src.indexOf(wd) === -1);
  });
}

console.log("");
console.log(fail === 0 ? "=== ผ่านหมด " + pass + " ข้อ ===" : "=== ตก " + fail + " จาก " + (pass + fail) + " ===");
process.exit(fail === 0 ? 0 : 1);
