/* ===========================================================
   เจ้าของโต๊ะตั้งได้ว่าบอทซื้อเข้าครั้งละเท่าไหร่

   ⚠️ ทำไมต้องมีเทสต์: ตัวเลขนี้ไปโผล่สองที่ที่ต้องตรงกันเสมอ
   "ชิปที่วางบนโต๊ะ" กับ "เงินที่หักออกจากกระเป๋าบอท"
   ถ้าสองอย่างไม่เท่ากันเมื่อไหร่ เงินก็หายหรืองอกขึ้นมาจริง ๆ
   และมันไม่เท่ากันง่ายมาก เพราะโต๊ะมีเพดานของมันเอง (clampBuyIn)
   ขอ 50,000 บนโต๊ะที่เพดาน 3,000 = ได้ชิป 3,000 แต่โค้ดเดิมหักกระเป๋า 50,000

   สมการที่ต้องเป็นจริงเสมอ: bankroll = wallet (นอกโต๊ะ) + stack (บนโต๊ะ)

   รัน:  node lan/tests/test-bot-buyin.mjs
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager, DEFAULT_BUY_IN } from "../bots.mjs";
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "buyin-"));
  bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);
  const table = createTable("BUYIN");
  const mgr = createBotManager({ table: table }, function () {});
  /* คนดูนั่งไว้หนึ่งที่ โต๊ะจะได้ไม่ว่างเปล่า (เหมือน test-bot-table-life) */
  table.sit("คนดู", null, 1000000, "watcher");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;
  return { table: table, mgr: mgr, st: table._state, cfg: table._cfg };
}
function botOf(w) {
  return w.st.seats.filter(function (s) { return s && s.isBot; })[0];
}
/* เงินที่ธนาคารจดไว้ ต้องเท่ากับ ชิปบนโต๊ะ + เงินในกระเป๋า เสมอ */
function balanced(b) {
  return bank.bankrollOf(b.name) === b.stack + b.wallet;
}

/* ---------- 1. ค่าเริ่มต้นต้องไม่เปลี่ยน ---------- */
console.log("");
console.log("--- ไม่ได้ตั้งอะไร ต้องเหมือนเดิมทุกอย่าง ---");
{
  const w = fresh();
  ok("ค่าเริ่มต้นคือ 2,000 เท่าเดิม", w.mgr.buyIn() === DEFAULT_BUY_IN && DEFAULT_BUY_IN === 2000,
     "ได้ " + w.mgr.buyIn());
  w.mgr._addNamed("Vince", 2);
  const b = botOf(w);
  ok("บอทนั่งลงด้วยชิป 2,000", b.stack === 2000, "ได้ " + b.stack);
  ok("กระเป๋าถูกหักไป 2,000 พอดี", b.wallet === 20000 - 2000, "ได้ " + b.wallet);
  ok("เงินรวมตรงกับที่ธนาคารจดไว้", balanced(b));
  w.mgr.stop();
}

/* ---------- 2. ตั้งค่าใหม่แล้วเรียกบอท ---------- */
console.log("");
console.log("--- ตั้งเป็น 6,000 แล้วเรียกบอทมานั่ง ---");
{
  const w = fresh();
  const eff = w.mgr.setBuyIn(6000);
  ok("setBuyIn คืนค่าที่ใช้จริง", eff === 6000, "ได้ " + eff);
  w.mgr._addNamed("Vince", 2);
  const b = botOf(w);
  ok("บอทนั่งลงด้วยชิป 6,000", b.stack === 6000, "ได้ " + b.stack);
  ok("กระเป๋าถูกหักไป 6,000 พอดี", b.wallet === 20000 - 6000, "ได้ " + b.wallet);
  ok("เงินรวมตรงกับที่ธนาคารจดไว้", balanced(b));
  w.mgr.stop();
}

/* ---------- 3. ขอเกินเพดานโต๊ะ (บั๊กเงินหาย) ---------- */
console.log("");
console.log("--- ขอมากกว่าที่โต๊ะยอมให้ ต้องไม่ทำให้เงินหาย ---");
{
  const w = fresh();
  w.cfg.maxBuyIn = 3000;
  const eff = w.mgr.setBuyIn(50000);
  ok("ต้องถูกบีบลงมาที่เพดานโต๊ะ", eff === 3000, "ได้ " + eff);
  w.mgr._addNamed("Rocco", 2);
  const b = botOf(w);
  ok("ได้ชิปเท่าเพดานโต๊ะ", b.stack === 3000, "ได้ " + b.stack);
  /* ⚠️ นี่คือช่องที่เงินเคยหาย: ชิป 3,000 แต่หักกระเป๋า 50,000 */
  ok("หักกระเป๋าเท่าชิปที่ได้จริง ไม่ใช่เท่าที่ขอ", b.wallet === 20000 - 3000, "ได้ " + b.wallet);
  ok("เงินรวมตรงกับที่ธนาคารจดไว้", balanced(b));
  w.mgr.stop();
}
{
  /* ⚠️ ทางที่หลุดการบีบตอนตั้งค่า: เจ้าภาพลดเพดานโต๊ะ "หลังจาก" ตั้งบายอินบอทไปแล้ว
     ค่าที่ตั้งไว้ยังเป็น 8,000 แต่โต๊ะยอมแค่ 2,500 — sit() จะบีบให้เงียบ ๆ
     ถ้าโค้ดหักกระเป๋าตามค่าที่ตั้งไว้ เงินจะหายไป 5,500 ต่อบอทหนึ่งตัว */
  const w = fresh();
  w.mgr.setBuyIn(8000);
  w.cfg.maxBuyIn = 2500;
  w.mgr._addNamed("Sonny", 2);
  const b = botOf(w);
  ok("โต๊ะบีบชิปลงมาให้เอง", b.stack === 2500, "ได้ " + b.stack);
  ok("กระเป๋าหักตามชิปที่วางจริง แม้ค่าที่ตั้งไว้จะสูงกว่า",
     b.wallet === 20000 - 2500, "ได้ " + b.wallet + " ควรเป็น " + (20000 - 2500));
  ok("เงินรวมตรงกับที่ธนาคารจดไว้", balanced(b));
  w.mgr.stop();
}

/* ---------- 4. ขอน้อยกว่าขั้นต่ำโต๊ะ ---------- */
console.log("");
console.log("--- ขอน้อยกว่าขั้นต่ำโต๊ะ ต้องถูกดันขึ้นมา ---");
{
  const w = fresh();
  w.cfg.minBuyIn = 500;
  const eff = w.mgr.setBuyIn(50);
  ok("ต้องถูกดันขึ้นมาที่ขั้นต่ำโต๊ะ", eff === 500, "ได้ " + eff);
  w.mgr._addNamed("Gio", 2);
  const b = botOf(w);
  ok("ได้ชิปเท่าขั้นต่ำโต๊ะ", b.stack === 500, "ได้ " + b.stack);
  ok("เงินรวมตรงกับที่ธนาคารจดไว้", balanced(b));
  w.mgr.stop();
}
{
  const w = fresh();
  const before = w.mgr.buyIn();
  ok("ค่าที่ใช้ไม่ได้ (ศูนย์/ตัวหนังสือ) ต้องไม่เปลี่ยนของเดิม",
     w.mgr.setBuyIn(0) === before && w.mgr.setBuyIn("ห้าพัน") === before &&
     w.mgr.setBuyIn(-3000) === before, "ได้ " + w.mgr.buyIn());
  w.mgr.stop();
}

/* ---------- 5. ตัวที่นั่งอยู่แล้วต้องไม่ถูกแตะ ---------- */
console.log("");
console.log("--- เปลี่ยนค่าแล้ว ชิปของตัวที่นั่งอยู่ต้องไม่ขยับ ---");
{
  const w = fresh();
  w.mgr._addNamed("Marco", 2);
  const b = botOf(w);
  const stackWas = b.stack, walletWas = b.wallet;
  w.mgr.setBuyIn(9000);
  ok("ชิปบนโต๊ะเท่าเดิม", b.stack === stackWas, "ได้ " + b.stack);
  ok("เงินในกระเป๋าเท่าเดิม", b.wallet === walletWas, "ได้ " + b.wallet);
  /* ⚠️ และมันต้องยังอ่านตัวเองว่า "เท่าทุน" ไม่ใช่ "ติดลบ 78%"
     ซึ่งเป็นเหตุผลที่ต้องจำตักของตัวเองไว้ ไม่ใช่เทียบกับค่าที่ตั้งไว้ตอนนี้ */
  ok("ยังจำได้ว่าตัวเองซื้อเข้ามาเท่าไหร่", b.buyIn === stackWas, "ได้ " + b.buyIn);
  w.mgr.stop();
}

/* ---------- 6. เติมชิปเสริมต้องใช้ค่าใหม่ ---------- */
console.log("");
console.log("--- ตั้ง 6,000 แล้วบอทชิปสั้น ต้องเติมกลับขึ้นไปที่ 6,000 ---");
{
  const w = fresh();
  w.mgr.setBuyIn(6000);
  w.mgr._addNamed("Rex", 3);
  const b = botOf(w);
  b.stack = 300;                      /* 5% ของตัก = สั้นมาก */
  b.wallet = 80000;
  bank.sync(b.name, b.wallet, b.stack, Date.now());
  const totalBefore = b.stack + b.wallet;
  /* 0.5 ผ่านเกณฑ์ "ยอมเติม" (0.90) แต่ไม่ผ่านเกณฑ์ "ลุกจากโต๊ะ" (≤ 0.03)
     สุ่มจริงจะได้ทั้งสองทาง เทสต์นี้สนใจแค่ทางเติม */
  const realRandom = Math.random;
  Math.random = function () { return 0.5; };
  let tries = 0;
  while (b.stack < 6000 && tries++ < 50) { w.st.handNo++; w.mgr.settleBusted(); }
  Math.random = realRandom;
  ok("เติมกลับขึ้นไปที่ค่าใหม่ ไม่ใช่ 2,000", b.stack === 6000, "ได้ " + b.stack);
  ok("เงินรวมไม่เปลี่ยน (ย้ายที่ ไม่ใช่งอก)",
     b.stack + b.wallet === totalBefore, b.stack + b.wallet + " vs " + totalBefore);
  ok("ตักใหม่ถูกจำไว้แล้ว", b.buyIn === 6000, "ได้ " + b.buyIn);
  w.mgr.stop();
}

/* ---------- 7. เติมไม่สำเร็จ ต้องไม่หักเงิน ---------- */
console.log("");
console.log("--- ห้องปฏิเสธการเติมชิป กระเป๋าต้องไม่ถูกหัก ---");
{
  const w = fresh();
  w.mgr.setBuyIn(4000);
  w.mgr._addNamed("Tank", 2);
  const b = botOf(w);
  b.stack = 0;                        /* หมดตัว */
  b.wallet = 60000;
  bank.sync(b.name, b.wallet, b.stack, Date.now());
  /* เพดานโต๊ะถูกลดลงทีหลัง = ห้องจะปฏิเสธคำสั่งเติม 4,000
     (เจ้าภาพลดเพดานโต๊ะได้จริง ระหว่างที่บอทยังนั่งอยู่) */
  w.cfg.maxBuyIn = 1000;
  const walletBefore = b.wallet;
  const realRandom = Math.random;
  Math.random = function () { return 0.5; };   /* 0.5 < 0.94 = นักพนันยอมเติม */
  w.st.handNo++;
  w.mgr.settleBusted();
  Math.random = realRandom;
  const after = w.st.seats[b.seatId];
  /* ⚠️ โค้ดเดิมหักกระเป๋าโดยไม่ดูผลของคำสั่งเลย = เสียเงินโดยไม่ได้ชิปมาแลก */
  ok("ยังนั่งอยู่ที่เดิม", !!after && after.name === "Tank");
  ok("ชิปยังเป็นศูนย์ (เติมไม่ผ่านจริง)", after && after.stack === 0, after && "ได้ " + after.stack);
  ok("กระเป๋าต้องไม่ถูกหัก", after && after.wallet === walletBefore,
     after && "ได้ " + after.wallet + " ควรเป็น " + walletBefore);
  w.mgr.stop();
}

/* ---------- 8. นับครั้งที่ล้ม ต้องไม่พองเมื่อเติมไม่ผ่าน ---------- */
console.log("");
console.log("--- เรียกซ้ำในมือเดียวตอนเติมไม่ผ่าน ต้องนับล้มครั้งเดียว ---");
{
  const w = fresh();
  w.mgr.setBuyIn(4000);
  w.mgr._addNamed("Lenny", 2);
  const b = botOf(w);
  b.stack = 0;
  b.wallet = 60000;
  bank.sync(b.name, b.wallet, b.stack, Date.now());
  w.cfg.maxBuyIn = 1000;              /* เติมไม่ผ่านแน่นอน */
  const realRandom = Math.random;
  Math.random = function () { return 0.5; };
  w.st.handNo++;
  /* poke() ในเกมจริงเรียกฟังก์ชันนี้สิบกว่าครั้งต่อมือ */
  for (let i = 0; i < 12; i++) w.mgr.settleBusted();
  Math.random = realRandom;
  const rec = bank.all().filter(function (x) { return x.name === "Lenny"; })[0];
  ok("ล้มหนเดียว ไม่ใช่สิบสองหน", rec && rec.busts === 1, rec && "นับได้ " + rec.busts);
  w.mgr.stop();
}

console.log("");
console.log(fail === 0 ? "=== ผ่านหมด " + pass + " ข้อ ===" : "=== ตก " + fail + " จาก " + (pass + fail) + " ===");
process.exit(fail === 0 ? 0 : 1);
