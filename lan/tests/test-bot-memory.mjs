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

  /* ⚠️ เกณฑ์ต้องผูกกับตัวเลขที่วัดได้จากคนเล่นจริง ไม่ใช่ตัวเลขที่ฟังดูเข้าท่า
     acts นับ "ทุกท่า" ไม่ใช่นับเป็นมือ วัดจริง 2026-09-02 บนโต๊ะ 8 คน:
       คนเล่นแน่นปกติ (ลงเล่น 24% ของมือ)  หมอบ 38% ของท่า  -> ต้องไม่โดนไล่
       คนเล่นนิ่งมาก   (ลงเล่น 12% ของมือ)  หมอบ 55% ของท่า  -> ต้องโดนไล่
     เกณฑ์เดิม 62% อยู่เหนือทั้งสองแบบ ฟีเจอร์นี้จึงตายสนิทอยู่หลายเดือนโดยไม่มีอะไรฟ้อง
     สามข้อล่างล็อกช่วงนั้นไว้ ถ้าใครขยับเกณฑ์จนคนเล่นจริงหลุดกรอบอีก เทสต์จะแดงทันที */
  f.acts = 100; f.folds = 38;
  ok("คนเล่นแน่นปกติ (หมอบ 38% ของท่า) ต้องไม่โดนไล่",
     mind.foldiness("Ash", "Nit") === 0, mind.foldiness("Ash", "Nit"));

  f.acts = 100; f.folds = 55;
  ok("คนเล่นนิ่งมาก (หมอบ 55% ของท่า) ต้องโดนไล่จริง ไม่ใช่แค่จดไว้",
     mind.foldiness("Ash", "Nit") >= 0.6, mind.foldiness("Ash", "Nit"));

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

/* ---------- 4 senseTable ต้องทำครบทั้งสามอย่าง ไม่ใช่แค่บางอย่าง ----------
   ⚠️ เคยพลาดมาแล้ว: ฟังก์ชันใหม่ตั้งชื่อชนกับ observe(st) ที่มีอยู่เดิม
   ตัวหลังถูกทับเงียบ ๆ (ประกาศทีหลังชนะ) ไพ่ที่เห็นคนอื่นเปิดจึงไม่ถูกจดเลย
   โค้ดยังรันผ่าน เทสต์เดิมยังเขียว แต่ความจำครึ่งหนึ่งตายไปโดยไม่มีใครรู้
   เทสต์นี้จึงเช็ค "ผลลัพธ์" ของทั้งสามอย่างพร้อมกัน ไม่ใช่เช็คว่าเรียกฟังก์ชันไหน */
console.log("\n--- senseTable ต้องจดครบ: ท่าที่เห็น · ไพ่ที่เปิด · อารมณ์ ---");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memfull-"));
  bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);
  const table = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 200, turnSeconds: 0 });
  const mgr = createBotManager({ table: table }, () => {});
  const watcher = table.sit("คนดู", null, 100000, "watcher-mem");
  table._state.seats[watcher.seatId].connected = true;
  table._state.seats[watcher.seatId].sitOut = true;
  const NAMES = [["Otto", 3], ["Zed", 3], ["Marco", 2], ["Tank", 2], ["Toby", 1], ["Gus", 1]];
  for (const [n, lv] of NAMES) mgr._addNamed(n, lv);
  const st = table._state;

  for (let h = 0; h < 200; h++) {
    if (table.action(watcher.seatId, { type: "start" }).error) break;
    let guard = 0;
    while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 200) {
      const cur = st.current;
      if (cur < 0) break;
      if (!mgr._decideNow(cur)) {
        const v = table.viewFor(cur);
        table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
      }
      mgr.senseTable();
    }
    mgr.senseTable();
    mgr.settleBusted();
    if (st.seats.filter(x => x && x.isBot).length < 3) break;
  }

  let sawActs = 0, sawReads = 0, sawMood = 0;
  for (const [n] of NAMES) {
    const sum = mind.summaryOf(n);
    if (sum.mood.tilt > 0 || sum.mood.confidence > 0 || sum.mood.boredom > 0) sawMood++;
    for (const [m] of NAMES) {
      if (m === n) continue;
      if (mind.foeOf(n, m).acts > 0) sawActs++;
      if (mind.readOf(n, m).n > 0) sawReads++;
    }
  }
  ok("จดท่าที่เห็นคนอื่นทำ (trackActions)", sawActs > 0, sawActs);
  ok("จดไพ่ที่เห็นคนอื่นเปิด (observe)", sawReads > 0, sawReads);
  ok("อารมณ์ขยับตามผลที่เจอ (updateMoods)", sawMood > 0, sawMood);
  mgr.stop();
  bank._setDir(tmp); mind._setDir(tmp); mind.setAutoSave(false);
}

/* ---------- 5 เปิดโต๊ะรอบใหม่ ต้องเรียกชื่อเดิมกลับมาได้ ----------
   ⚠️ bank.claim กันไม่ให้บอทตัวเดียวนั่งสองโต๊ะพร้อมกัน ซึ่งถูกแล้ว
   แต่ _setDir (เปลี่ยนโฟลเดอร์ข้อมูล = คนละโลก) ไม่เคยล้างรายชื่อที่จองไว้
   เครื่องมือวัดผลที่เปิดโต๊ะใหม่ทุกรอบจึงเรียกชื่อเดิมกลับมาไม่ได้
   โต๊ะรอบหลัง ๆ มีคนน้อยลงเรื่อย ๆ แบบเงียบ ๆ และไม่มีอะไรฟ้องเลย */
console.log("\n--- เปิดโต๊ะรอบใหม่ ต้องเรียกชื่อเดิมกลับมาได้ ---");
{
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "busy1-"));
  bank._setDir(d1);
  ok("จองชื่อครั้งแรกได้", bank.claim("Sable") === true);
  ok("จองชื่อเดิมซ้ำในโลกเดียวกันไม่ได้", bank.claim("Sable") === false);
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "busy2-"));
  bank._setDir(d2);
  ok("เปลี่ยนโฟลเดอร์ข้อมูลแล้ว ต้องจองชื่อเดิมได้อีก", bank.claim("Sable") === true);
  bank._setDir(tmp);
}

/* ---------- 6 หมดตัวแล้วต้องเดินตามทางเดียวกับเกมจริง ---------- */
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
