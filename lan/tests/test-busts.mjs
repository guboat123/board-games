/* เติมชิปตอนหมดเกลี้ยง = ล้มโต๊ะไปหนึ่งรอบ ต้องนับไว้
   ไม่งั้นบอท (และคน) ที่ล้มซ้ำๆ ดูเหมือนเพิ่งมาถึงโต๊ะครั้งแรกทุกครั้ง
   ทั้งที่ตัวเลขได้-เสียบอกอีกอย่าง */
import assert from "node:assert/strict";
import { createTable } from "../poker-room.mjs";

const t = createTable("BUSTS");
const a = t.sit("A", null, 2000, "tok-a");
const b = t.sit("B", null, 2000, "tok-b");
assert.equal(a.ok && b.ok, true, "นั่งได้ทั้งสองคน");

const seatOf = (i) => t._state.seats[i];

/* ยังไม่เคยล้ม */
assert.equal(seatOf(0).busts, 0);

/* เติมทั้งที่ยังมีชิปเหลือ = เติมเสริม ไม่ใช่ล้ม ห้ามนับ */
t.action(0, { type: "rebuy", amount: 500 });
assert.equal(seatOf(0).busts, 0, "เติมตอนยังมีชิป ไม่นับว่าล้ม");
assert.equal(seatOf(0).stack, 2500);
assert.equal(seatOf(0).boughtIn, 2500);

/* ชิปหมดเกลี้ยงแล้วเติม = ล้มหนึ่งรอบ */
seatOf(0).stack = 0;
t.action(0, { type: "rebuy", amount: 2000 });
assert.equal(seatOf(0).busts, 1, "หมดแล้วเติม นับเป็นล้ม 1 รอบ");
assert.equal(seatOf(0).stack, 2000);
assert.equal(seatOf(0).boughtIn, 4500, "ซื้อเข้าสะสมต้องรวมทุกครั้ง");

/* ล้มซ้ำ นับสะสมต่อ ไม่ใช่รีเซ็ต */
seatOf(0).stack = 0;
t.action(0, { type: "rebuy", amount: 2000 });
assert.equal(seatOf(0).busts, 2, "ล้มซ้ำต้องนับสะสม");

/* คนอื่นไม่โดนนับตาม */
assert.equal(seatOf(1).busts, 0, "การล้มของคนหนึ่ง ต้องไม่ไปโผล่ที่คนอื่น");

/* ตัวเลขต้องส่งออกไปถึงหน้าจอ ไม่ใช่ค้างอยู่ในเซิร์ฟเวอร์ */
const view = t.viewFor(0);
assert.equal(view.seats[0].busts, 2, "busts ต้องอยู่ใน view ที่ส่งให้หน้าจอ");
assert.equal(view.seats[1].busts, 0);

console.log("test-busts: ผ่านหมด");

/* ---------- บอทที่หมดตัวต้องนั่งพัก และพักนานขึ้นทุกครั้งที่ล้ม ----------
   ซื้อกลับเข้ามาแล้วเล่นต่อทันที = หมดตัวไม่มีอะไรต้องเสีย
   บทลงโทษต้องเพิ่มขึ้นจริง ไม่ใช่คงที่ */
{
  const t2 = createTable("BENCH");
  const bot = t2.sit("Bot", null, 2000, "bot:x", { bot: true, level: 2 });
  t2.sit("Human", null, 2000, "th");
  const b = t2._state.seats[bot.seatId];

  /* ล้มครั้งแรก → busts = 1 → พัก 1 มือ */
  b.stack = 0;
  t2.action(bot.seatId, { type: "rebuy", amount: 2000 });
  assert.equal(b.busts, 1);
  const first = Math.min(Math.max(b.busts, 1), 5);
  assert.equal(first, 1, "ล้มครั้งแรกพัก 1 มือ");

  /* ล้มครั้งที่สอง → busts = 2 → พัก 2 มือ */
  b.stack = 0;
  t2.action(bot.seatId, { type: "rebuy", amount: 2000 });
  assert.equal(b.busts, 2);
  assert.equal(Math.min(Math.max(b.busts, 1), 5), 2, "ล้มครั้งที่สองพัก 2 มือ");

  /* ล้มซ้ำเยอะๆ ต้องมีเพดาน ไม่งั้นบอทหายจากโต๊ะยาวจนไม่เหลือคนเล่นด้วย */
  for (let i = 0; i < 8; i++) { b.stack = 0; t2.action(bot.seatId, { type: "rebuy", amount: 2000 }); }
  assert.equal(Math.min(Math.max(b.busts, 1), 5), 5, "พักได้สูงสุด 5 มือ");

  /* และบอทต้องพักได้จริงตอนไม่มีมือกำลังเล่น */
  assert.ok(!t2.action(bot.seatId, { type: "sitout", value: true }).error, "นอกมือ ต้องสั่งพักได้");
  assert.equal(b.sitOut, true);
  assert.ok(!t2.action(bot.seatId, { type: "sitout", value: false }).error, "และปลดพักได้");
  assert.equal(b.sitOut, false);
}

console.log("test-busts (พักโทษ): ผ่านหมด");
