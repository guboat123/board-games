/* ===========================================================
   ความจำของบอท — ต้องนับครั้งเดียวต่อมือ และต้องแยก "คนขี้หมอบ" ออกจาก "ยังไม่รู้จัก"

   ทำไมต้องมีเทสต์นี้: ทั้งสองอย่างเคยพังแบบเงียบ ๆ และมองไม่เห็นจากหน้าจอเลย
     · rememberFoes ถูกเรียกซ้ำทุกครั้งที่สถานะโต๊ะเปลี่ยนระหว่างโชว์ดาวน์
       ความแค้น (hurt) กับจำนวนครั้งที่จับบลัฟได้ (caught) จึงถูกนับเกินจริงหลายเท่า
       บอทเลยระวังคนที่ไม่ได้น่ากลัวขนาดนั้น และเชื่อท่าดันของคนอื่นน้อยเกินไป
     · sticky มีพื้นเป็น 0 ทำให้ "คนหมอบตลอด" กับ "ยังไม่เคยเห็นเล่น" หน้าตาเหมือนกัน
       ทั้งที่คนแรกคือเป้าที่ควรโดนไล่มากที่สุดบนโต๊ะ
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memtest-"));
bank._setDir(tmp);
mind._setDir(tmp);
mind.setAutoSave(false);

let fails = 0;
function ok(label, cond, got) {
  console.log((cond ? "  ok  : " : "  FAIL: ") + label + (got === undefined ? "" : "  (ได้ " + JSON.stringify(got) + ")"));
  if (!cond) fails++;
}

/* ---------- 1 foldiness ต้องเงียบไว้ก่อนจนกว่าจะเห็นพอ ---------- */
console.log("\n--- คนขี้หมอบ vs ยังไม่รู้จัก ---");
{
  const f = mind.foeOf("Ash", "Nit");
  ok("ยังไม่เคยเห็นเขาเล่นเลย ต้องไม่ตัดสินว่าขี้หมอบ", mind.foldiness("Ash", "Nit") === 0);

  /* เห็นเขาหมอบ 10 ครั้งจาก 10 — ยังน้อยเกินกว่าจะสรุป */
  f.acts = 10; f.folds = 10;
  ok("เห็นแค่ 10 ครั้ง ยังไม่พอสรุป", mind.foldiness("Ash", "Nit") === 0, mind.foldiness("Ash", "Nit"));

  /* หมอบ 62% = คนเล่นปกติ ไม่ใช่เป้า */
  f.acts = 100; f.folds = 62;
  ok("หมอบ 62% = ปกติ ไม่ใช่เป้า", mind.foldiness("Ash", "Nit") === 0, mind.foldiness("Ash", "Nit"));

  /* หมอบ 90% = ขี้หมอบเต็มตัว */
  f.acts = 100; f.folds = 90;
  ok("หมอบ 90% = เป็นเป้าเต็มตัว", mind.foldiness("Ash", "Nit") === 1, mind.foldiness("Ash", "Nit"));

  /* คนที่ตามทุกอย่าง ต้องไม่ถูกมองว่าขี้หมอบ */
  const g = mind.foeOf("Ash", "Station");
  g.acts = 100; g.folds = 12;
  ok("คนตามทุกอย่าง ต้องไม่ถูกมองว่าขี้หมอบ", mind.foldiness("Ash", "Station") === 0);

  /* ความจำเป็นของแต่ละตัว ไม่ใช่ของทั้งโต๊ะ */
  ok("บอทอีกตัวที่ไม่ได้นั่งดูอยู่ ต้องไม่รู้เรื่องด้วย", mind.foldiness("Cole", "Nit") === 0);
}

/* ---------- 2 ไฟล์ความจำเก่าที่ไม่มีช่องใหม่ ต้องอ่านได้ ไม่พัง ---------- */
console.log("\n--- ไฟล์ความจำรุ่นเก่า ---");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memold-"));
  fs.writeFileSync(path.join(dir, "bot-mind.json"), JSON.stringify({
    version: 1,
    minds: { Rex: { mood: { tilt: 0, confidence: 0, boredom: 0 }, reads: {},
                    foes: { Boat: { hurt: 500, caught: 1, sticky: 3, seen: 2 } } } }
  }), "utf8");
  mind._setDir(dir);
  mind.setAutoSave(false);
  const f = mind.foeOf("Rex", "Boat");
  ok("ของเดิมที่จำไว้ต้องไม่หาย", f.hurt === 500 && f.caught === 1, { hurt: f.hurt, caught: f.caught });
  ok("ช่องใหม่ถูกเติมให้เอง ไม่ใช่ undefined", f.acts === 0 && f.folds === 0);
  ok("อ่านค่าแล้วต้องไม่พัง", mind.foldiness("Rex", "Boat") === 0);
  mind._setDir(tmp);
  mind.setAutoSave(false);
}

/* ---------- 3 จบมือหนึ่งครั้ง ต้องจดความจำครั้งเดียว ---------- */
console.log("\n--- จดความจำได้มือละครั้งเดียว ---");
{
  const table = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 200, turnSeconds: 0 });
  const mgr = createBotManager({ table: table }, () => {});
  const me = table.sit("Boat", null, 2000, "human-test");
  table._state.seats[me.seatId].connected = true;
  const MY = me.seatId;
  mgr._addNamed("Rex", 3);
  mgr._addNamed("Duke", 3);
  const st = table._state;

  /* เล่นไปจนจบมือหนึ่ง โดยผมหมอบทันทีที่ถึงตา */
  table.action(MY, { type: "start" });
  let guard = 0;
  while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 200) {
    const cur = st.current;
    if (cur < 0) break;
    if (cur === MY) {
      const v = table.viewFor(MY);
      table.action(MY, { type: "act", action: v.toCall > 0 ? "fold" : "check" });
    } else if (!mgr._decideNow(cur)) {
      const v = table.viewFor(cur);
      table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
    }
    mgr.senseTable();
  }

  /* เรียก observe ซ้ำ ๆ ตอนโชว์ดาวน์ เหมือนที่เซิร์ฟเวอร์จริงทำทุกครั้งที่สถานะเปลี่ยน */
  mgr.senseTable();
  const snap = JSON.stringify([mind.foeOf("Rex", "Duke"), mind.foeOf("Duke", "Rex")]);
  for (let i = 0; i < 6; i++) mgr.senseTable();
  const after = JSON.stringify([mind.foeOf("Rex", "Duke"), mind.foeOf("Duke", "Rex")]);
  ok("เรียกซ้ำอีก 6 ครั้ง ความจำต้องไม่ขยับ", snap === after);

  /* และต้องมีการจดจริง ไม่ใช่ไม่ทำงานเลย */
  const f1 = mind.foeOf("Rex", "Duke"), f2 = mind.foeOf("Duke", "Rex");
  ok("ต้องมีการนับท่าที่เห็นจริง ไม่ใช่ศูนย์ทั้งหมด", (f1.acts + f2.acts) > 0, { rex: f1.acts, duke: f2.acts });
  mgr.stop();
}

/* ---------- 4 หมดตัวแล้วต้องเดินตามทางเดียวกับเกมจริง ---------- */
console.log("\n--- settleBusted เปิดให้เครื่องมือวัดเรียกได้ ---");
{
  const table = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 200, turnSeconds: 0 });
  const mgr = createBotManager({ table: table }, () => {});
  const me = table.sit("Boat", null, 2000, "human-test2");
  table._state.seats[me.seatId].connected = true;
  mgr._addNamed("Kai", 3);
  const st = table._state;
  const bot = st.seats.find(s => s && s.isBot);
  ok("มีบอทนั่งอยู่", !!bot);
  ok("เรียก settleBusted ตอนยังมีชิป ต้องไม่ทำอะไร", (() => {
    const before = bot.stack;
    mgr.settleBusted();
    return st.seats.find(s => s && s.name === "Kai") && bot.stack === before;
  })());
  mgr.stop();
}

console.log(fails ? "\n=== มี " + fails + " ข้อไม่ผ่าน ===" : "\n=== ผ่านทั้งหมด ===");
process.exit(fails ? 1 : 0);
