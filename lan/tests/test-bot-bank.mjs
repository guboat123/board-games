/* เงินติดตัวบอท: ต้องอยู่ข้ามการรีสตาร์ต และหนึ่งชื่อนั่งได้ทีละโต๊ะเดียว
   ⚠️ เทสต์นี้เขียนไฟล์จริง จึงต้องชี้ไปโฟลเดอร์ชั่วคราวก่อนเสมอ
   ไม่งั้นจะไปทับเงินบอทบนเครื่องที่เปิดโต๊ะจริง */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "botbank-"));
const bank = await import("../bot-bank.mjs");
bank._setDir(dir);

/* ---------- บอทใหม่เริ่มที่ยอดตั้งต้น ---------- */
assert.equal(bank.bankrollOf("Rex"), bank.START, "บอทที่ยังไม่เคยเล่น เริ่มที่ยอดตั้งต้น");

/* ---------- ซื้อเข้าโต๊ะ เล่นเสียไปครึ่งหนึ่ง ยอดต้องลดลงจริง ---------- */
const BUY = 2000;
let wallet = bank.startSession("Rex", bank.START, 1) - BUY;
let stack = BUY;
assert.equal(wallet + stack, bank.START, "เงินบนโต๊ะมาจากกระเป๋า ไม่ได้เสกใหม่");

stack = 500;                                     /* เสียไป 1500 */
bank.sync("Rex", wallet, stack, 2);
assert.equal(bank.bankrollOf("Rex"), bank.START - 1500, "เสียบนโต๊ะแล้วยอดรวมต้องลดตาม");

/* ---------- หมดตัวแล้วซื้อใหม่ ยอดต้องลดอีกก้อน ---------- */
stack = 0;
wallet -= BUY; stack = BUY;
bank.noteBust("Rex");
bank.sync("Rex", wallet, stack, 3);
assert.equal(bank.bankrollOf("Rex"), bank.START - 2000, "ซื้อชิปใหม่ = หยิบเงินออกจากกระเป๋าอีกก้อน");

/* ---------- ติดลบได้ = เป็นหนี้ ---------- */
bank.sync("Rex", -3000, 0, 4);
assert.equal(bank.bankrollOf("Rex"), -3000, "ยอดติดลบได้ นั่นคือเป็นหนี้");

/* ---------- อ่านใหม่จากไฟล์ ต้องได้ค่าเดิม (จำลองการรีสตาร์ตเซิร์ฟเวอร์) ---------- */
{
  const fresh = await import("../bot-bank.mjs?reload=1");
  fresh._setDir(dir);
  assert.equal(fresh.bankrollOf("Rex"), -3000, "รีสตาร์ตแล้วหนี้ต้องยังอยู่ ไม่ใช่เริ่มใหม่");
  assert.equal(fresh.bankrollOf("Milo"), fresh.START, "บอทที่ยังไม่เคยเล่นก็ยังเริ่มที่ยอดตั้งต้น");
}

/* ---------- ไฟล์ต้องอ่านได้จริง ไม่ใช่แค่ค่าที่ค้างในหน่วยความจำ ---------- */
{
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "bot-bank.json"), "utf8"));
  assert.equal(raw.bots.Rex.bankroll, -3000, "ต้องถูกเขียนลงไฟล์จริง");
  assert.ok(raw.bots.Rex.busts >= 1, "จำนวนครั้งที่ล้มต้องสะสมข้ามวง");
  assert.ok(raw.bots.Rex.sessions >= 1, "จำนวนครั้งที่ลงโต๊ะต้องถูกนับ");
}

/* ---------- หนึ่งชื่อ นั่งได้ทีละโต๊ะเดียว ---------- */
assert.equal(bank.claim("Duke"), true, "ชื่อว่าง ต้องจองได้");
assert.equal(bank.isBusy("Duke"), true);
assert.equal(bank.claim("Duke"), false,
  "โต๊ะที่สองต้องจองชื่อเดิมไม่ได้ ไม่งั้นสองโต๊ะจะหยิบจากกระเป๋าใบเดียวกันแล้วเขียนทับกัน");
bank.release("Duke");
assert.equal(bank.claim("Duke"), true, "ลุกจากโต๊ะแล้วชื่อต้องกลับมาว่าง");

/* ---------- ต้องมีไฟล์อ่านง่ายให้เจ้าของโต๊ะเปิดดู ---------- */
{
  bank.startSession("Milo", 5000, 9);
  bank.sync("Milo", 3000, 500, 9);
  const txt = fs.readFileSync(path.join(dir, "bot-money.txt"), "utf8");
  assert.ok(txt.indexOf("Milo") >= 0, "ต้องมีชื่อบอทในตาราง");
  assert.ok(txt.indexOf("3,500") >= 0, "ต้องโชว์เงินทั้งหมด (กระเป๋า + ชิปบนโต๊ะ)");
  assert.ok(txt.indexOf("5,000") >= 0, "ต้องโชว์เงินตั้งต้นด้วย จะได้รู้ว่าขึ้นหรือลง");
  assert.ok(txt.indexOf("-1,500") >= 0, "ต้องโชว์กำไร/ขาดทุนเทียบกับที่เริ่มมา");
  assert.ok(txt.indexOf("Rex") >= 0, "บอททุกตัวต้องอยู่ในตารางเดียวกัน");
}

/* ---------- บอทตัวใหม่แต่ละระดับเริ่มด้วยเงินไม่เท่ากัน ---------- */
{
  assert.equal(bank.startSession("Vega", 100000, 10), 100000, "มืออาชีพเริ่มด้วยเงินก้อนใหญ่");
  assert.equal(bank.startSession("Nico", 5000, 10), 5000, "มือใหม่เริ่มด้วยเงินก้อนเล็ก");
  /* ⚠️ ลงโต๊ะรอบสองต้องใช้ยอดที่มีอยู่ ไม่ใช่รีเซ็ตกลับไปที่เงินตั้งต้น */
  bank.sync("Nico", 800, 0, 11);
  assert.equal(bank.startSession("Nico", 5000, 12), 800,
    "บอทตัวเดิมลงโต๊ะใหม่ ต้องใช้เงินที่เหลืออยู่จริง ไม่ใช่เติมให้ใหม่");
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("test-bot-bank: ผ่านหมด");
