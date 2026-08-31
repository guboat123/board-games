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
