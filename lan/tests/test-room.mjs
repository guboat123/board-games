/* เทสต์กติกาโต๊ะ 3 ข้อที่เคยเป็นบั๊กจริง
     1) กองกลางต้องไม่รวมเงินที่ยังไม่มีใครตาม
     2) ที่นั่ง+ชิปของคนที่หลุด ต้องเอาไปด้วยชื่ออย่างเดียวไม่ได้
     3) เจ้าภาพ = คนที่นั่งลงคนแรก ไม่ใช่คนที่ได้ช่องเลขน้อยสุด
   รัน: node lan/tests/test-room.mjs */
import { createTable } from "../poker-room.mjs";

let fail = 0;
function ok(cond, label, got) {
  if (cond) console.log("  ok  : " + label + (got !== undefined ? " (ได้ " + JSON.stringify(got) + ")" : ""));
  else { fail++; console.log("  FAIL: " + label + " -> " + JSON.stringify(got)); }
}

/* ---------------------------------------------------------------
   1) กองกลาง ต้องนับเฉพาะเงินที่มีคนตามแล้ว
   --------------------------------------------------------------- */
console.log("--- กองกลางต้องไม่รวมเงินที่ยังไม่มีใครตาม ---");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  t.sit("เอ", 0, 20000, "tokA");
  t.sit("บี", 1, 8000, "tokB");
  const st = t._state;

  /* จำลองสถานะกลางมือ: เอาขึ้นไป 3000 บีลงแค่บลายด์ 20 */
  st.seats[0].committed = 3000;
  st.seats[1].committed = 20;
  ok(t.viewFor(0).pot === 40, "ขึ้น 3000 แต่ตามแค่ 20 กองต้องเป็น 40 ไม่ใช่ 3020", t.viewFor(0).pot);

  /* ตามเท่ากันเมื่อไหร่ ก็นับเต็มเมื่อนั้น */
  st.seats[1].committed = 3000;
  ok(t.viewFor(0).pot === 6000, "ตามครบแล้ว กองต้องเป็น 6000", t.viewFor(0).pot);

  /* คนหมอบทิ้งเงินไว้ เงินนั้นยังอยู่ในกอง */
  st.seats[0].committed = 200;
  st.seats[1].committed = 20;
  st.seats[1].folded = true;
  ok(t.viewFor(0).pot === 40, "คนหมอบทิ้งไว้ 20 นับเป็นกอง แต่ส่วนเกิน 180 ไม่นับ", t.viewFor(0).pot);
}

/* ---------------------------------------------------------------
   2) สวมสิทธิ์ที่นั่งคนที่หลุด
   --------------------------------------------------------------- */
console.log("\n--- ชื่ออย่างเดียวต้องเอาชิปคนอื่นไปไม่ได้ ---");
{
  const t = createTable({ minBuyIn: 1, maxBuyIn: 100000 });
  const owner = t.sit("เหยื่อ", 0, 9000, "tokOwner");
  ok(owner.ok && owner.seatId === 0, "เจ้าของนั่งช่อง 1 ด้วยชิป 9000", owner.stack);
  t.disconnect(0);

  /* คนแปลกหน้า รู้แค่ชื่อ ไม่ระบุที่นั่ง = ห้ามได้ที่เดิม */
  const thief = t.sit("เหยื่อ", undefined, 200, "tokThief");
  ok(thief.ok && thief.seatId !== 0, "คนแปลกหน้าที่รู้แค่ชื่อ ต้องไม่ได้ช่อง 1", thief.seatId);
  ok(thief.stack === 200, "และต้องได้แค่ชิปที่ตัวเองซื้อ ไม่ใช่ 9000", thief.stack);
  ok(t._state.seats[0].stack === 9000, "ชิปเจ้าของยังอยู่ครบ", t._state.seats[0].stack);

  /* เจ้าของกลับมาจากเครื่องเดิม = token ตรง ต้องได้ที่เดิมพร้อมชิปเดิม */
  const back = t.sit("เหยื่อ", undefined, 50, "tokOwner");
  ok(back.ok && back.seatId === 0 && back.stack === 9000, "เจ้าของ (token ตรง) กลับเข้าที่เดิมพร้อมชิปเดิม", back);
}

console.log("\n--- เจาะจงกดที่นั่งนั้นเอง (หน้าเว็บถามยืนยันแล้ว) ยังกลับเข้าได้ ---");
{
  const t = createTable({ minBuyIn: 1, maxBuyIn: 100000 });
  t.sit("ปอ", 3, 5000, "tokPo");
  t.disconnect(3);
  /* เครื่องใหม่ ล้าง localStorage ไปแล้ว แต่กดเลือกช่อง 4 เอง */
  const r = t.sit("ปอ", 3, 100, "");
  ok(r.ok && r.seatId === 3 && r.stack === 5000, "เจาะจงช่องเดิม ต้องได้ชิปเดิมคืน", r);
}

/* ---------------------------------------------------------------
   3) เจ้าภาพ = คนที่นั่งลงคนแรก
   --------------------------------------------------------------- */
console.log("\n--- เจ้าภาพต้องเป็นคนที่เปิดโต๊ะ ไม่ใช่คนที่ได้ช่องเลขน้อยสุด ---");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20 });
  const host = t.sit("เจ้าภาพ", 4, 1000, "tokHost");   /* เปิดโต๊ะ แต่เลือกนั่งช่อง 5 */
  const later = t.sit("มาทีหลัง", 1, 1000, "tokLater"); /* เข้าทีหลัง แต่ได้ช่องเลขน้อยกว่า */

  const bad = t.action(later.seatId, { type: "config", smallBlind: 7, bigBlind: 14 });
  ok(bad && bad.error, "คนที่มาทีหลังตั้งบอดไม่ได้ แม้ช่องเลขน้อยกว่า", bad);
  ok(t._cfg.smallBlind === 10 && t._cfg.bigBlind === 20, "บอดต้องไม่ถูกแก้", [t._cfg.smallBlind, t._cfg.bigBlind]);

  const good = t.action(host.seatId, { type: "config", smallBlind: 25, bigBlind: 50 });
  ok(!(good && good.error), "เจ้าภาพตั้งบอดได้", good);
  ok(t._cfg.smallBlind === 25 && t._cfg.bigBlind === 50, "บอดเปลี่ยนตามที่เจ้าภาพตั้ง", [t._cfg.smallBlind, t._cfg.bigBlind]);
}

console.log(fail === 0 ? "\n=== ผ่านทั้งหมด ===" : "\n=== พัง " + fail + " ข้อ ===");
process.exit(fail ? 1 : 0);
