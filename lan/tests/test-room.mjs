/* เทสต์กติกาโต๊ะที่เคยเป็นบั๊กจริง
     1) กองที่โชว์ vs กองที่ใช้คิดขนาดเดิมพัน
     2) ที่นั่ง+ชิปของคนที่หลุด ต้องเอาไปด้วยชื่ออย่างเดียวไม่ได้
     3) เจ้าภาพ = คนที่นั่งลงคนแรก ไม่ใช่คนที่ได้ช่องเลขน้อยสุด
     4) ลุกจากโต๊ะเอง ต้องปล่อยที่นั่งจริง
     5) ที่นั่งร้างนานเกินกำหนด ต้องคืนให้คนใหม่
   รัน: node lan/tests/test-room.mjs */
import { createTable } from "../poker-room.mjs";

let fail = 0;
function ok(cond, label, got) {
  if (cond) console.log("  ok  : " + label + (got !== undefined ? " (ได้ " + JSON.stringify(got) + ")" : ""));
  else { fail++; console.log("  FAIL: " + label + " -> " + JSON.stringify(got)); }
}
function head(t) { console.log("\n--- " + t + " ---"); }

/* --------------------------------------------------------------- */
head("กองที่โชว์ vs กองที่ใช้คิดขนาดเดิมพัน");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  t.sit("เอ", 0, 20000, "tokA");
  t.sit("บี", 1, 8000, "tokB");
  const st = t._state;

  /* จำลองสถานะกลางมือ: เอาขึ้นไป 3000 บีลงแค่บลายด์ 20 */
  st.seats[0].committed = 3000;
  st.seats[1].committed = 20;
  /* ที่โชว์บนจอ = ชิปทั้งหมดที่อยู่บนโต๊ะจริง ตรงกับที่ตาเห็น
     ที่ใช้คิดขนาดเดิมพัน = เฉพาะส่วนที่มีคนตามแล้ว เพราะส่วนที่เกินเดี๋ยวก็คืนเจ้าของ */
  ok(t.viewFor(0).pot === 3020, "กองที่โชว์ = ชิปบนโต๊ะจริง 3020", t.viewFor(0).pot);
  ok(t.viewFor(0).potForBet === 40, "กองที่ใช้คิดเดิมพัน = 40 (เฉพาะที่มีคนตาม)", t.viewFor(0).potForBet);

  st.seats[1].committed = 3000;
  ok(t.viewFor(0).pot === 6000 && t.viewFor(0).potForBet === 6000,
     "ตามครบแล้ว สองค่าตรงกันที่ 6000", [t.viewFor(0).pot, t.viewFor(0).potForBet]);

  /* คนหมอบทิ้งเงินไว้ เงินนั้นยังอยู่ในกอง */
  st.seats[0].committed = 200;
  st.seats[1].committed = 20;
  st.seats[1].folded = true;
  ok(t.viewFor(0).potForBet === 40, "คนหมอบทิ้งไว้ 20 นับเป็นกอง แต่ส่วนเกิน 180 ไม่นับ", t.viewFor(0).potForBet);
}

/* --------------------------------------------------------------- */
head("ชื่ออย่างเดียวต้องเอาชิปคนอื่นไปไม่ได้");
{
  const t = createTable({ minBuyIn: 1, maxBuyIn: 100000 });
  const owner = t.sit("เหยื่อ", 0, 9000, "tokOwner");
  ok(owner.ok && owner.seatId === 0, "เจ้าของนั่งช่อง 1 ด้วยชิป 9000", owner.stack);
  t.disconnect(0);

  const thief = t.sit("เหยื่อ", undefined, 200, "tokThief");
  ok(thief.ok && thief.seatId !== 0, "คนแปลกหน้าที่รู้แค่ชื่อ ต้องไม่ได้ช่อง 1", thief.seatId);
  ok(thief.stack === 200, "และต้องได้แค่ชิปที่ตัวเองซื้อ ไม่ใช่ 9000", thief.stack);
  ok(t._state.seats[0].stack === 9000, "ชิปเจ้าของยังอยู่ครบ", t._state.seats[0].stack);

  const back = t.sit("เหยื่อ", undefined, 50, "tokOwner");
  ok(back.ok && back.seatId === 0 && back.stack === 9000, "เจ้าของ (token ตรง) กลับเข้าที่เดิมพร้อมชิปเดิม", back);
}

head("เจาะจงกดที่นั่งนั้นเอง (หน้าเว็บถามยืนยันแล้ว) ยังกลับเข้าได้");
{
  const t = createTable({ minBuyIn: 1, maxBuyIn: 100000 });
  t.sit("ปอ", 3, 5000, "tokPo");
  t.disconnect(3);
  /* เครื่องใหม่ ล้าง localStorage ไปแล้ว แต่กดเลือกช่อง 4 เอง */
  const r = t.sit("ปอ", 3, 100, "");
  ok(r.ok && r.seatId === 3 && r.stack === 5000, "เจาะจงช่องเดิม ต้องได้ชิปเดิมคืน", r);
}

/* --------------------------------------------------------------- */
head("เจ้าภาพต้องเป็นคนที่เปิดโต๊ะ ไม่ใช่คนที่ได้ช่องเลขน้อยสุด");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20 });
  const host = t.sit("เจ้าภาพ", 4, 1000, "tokHost");
  const later = t.sit("มาทีหลัง", 1, 1000, "tokLater");

  const bad = t.action(later.seatId, { type: "config", smallBlind: 7, bigBlind: 14 });
  ok(bad && bad.error, "คนที่มาทีหลังตั้งบอดไม่ได้ แม้ช่องเลขน้อยกว่า", bad);
  ok(t._cfg.smallBlind === 10 && t._cfg.bigBlind === 20, "บอดต้องไม่ถูกแก้", [t._cfg.smallBlind, t._cfg.bigBlind]);

  const good = t.action(host.seatId, { type: "config", smallBlind: 25, bigBlind: 50 });
  ok(!(good && good.error), "เจ้าภาพตั้งบอดได้", good);
  ok(t._cfg.smallBlind === 25 && t._cfg.bigBlind === 50, "บอดเปลี่ยนตามที่เจ้าภาพตั้ง", [t._cfg.smallBlind, t._cfg.bigBlind]);
}

/* --------------------------------------------------------------- */
head("กดออกจากโต๊ะ ต้องปล่อยที่นั่งทันที");
{
  const t = createTable({ minBuyIn: 1, maxBuyIn: 100000 });
  t.sit("อยู่ต่อ", 0, 1000, "tk1");
  const go = t.sit("จะออก", 1, 1000, "tk2");
  ok(t._state.seats[1] !== null, "ก่อนออก ที่นั่ง 2 มีคนอยู่");

  t.leave(go.seatId);
  ok(t._state.seats[1] === null, "ออกแล้ว ที่นั่ง 2 ต้องว่างทันที", t._state.seats[1]);
  ok(t.summary().players === 1, "จำนวนคนบนโต๊ะต้องลดลงจริง", t.summary().players);

  /* คนใหม่ต้องนั่งช่องนั้นได้เลย ไม่ต้องรอหมดเวลา */
  const nw = t.sit("คนใหม่", undefined, 500, "tk3");
  ok(nw.ok && nw.seatId === 1 && nw.stack === 500, "คนใหม่นั่งช่องที่ว่างได้ทันที", nw);
}

head("ออกกลางมือ ต้องถือว่าหมอบ ไม่ใช่ค้างให้คนอื่นรอ");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  const a = t.sit("เอ", 0, 1000, "a");
  t.sit("บี", 1, 1000, "b");
  t.sit("ซี", 2, 1000, "c");
  t.action(a.seatId, { type: "start" });
  const turn = t._state.current;
  const other = [0, 1, 2].filter(x => x !== turn);
  t.leave(turn);
  ok(t._state.seats[turn] === null, "ที่นั่งของคนที่ออกกลางมือต้องว่าง", t._state.seats[turn]);
  ok(t._state.current !== turn, "ตาต้องไม่ค้างอยู่ที่คนที่ออกไปแล้ว", t._state.current);
  const chips = other.reduce((n, i) => n + (t._state.seats[i] ? t._state.seats[i].stack : 0), 0);
  ok(chips > 0, "คนที่เหลือยังมีชิปอยู่ เกมเดินต่อได้", chips);
}

/* --------------------------------------------------------------- */
head("ที่นั่งร้างนานเกินไป ต้องคืนให้คนใหม่");
{
  const t = createTable({ minBuyIn: 1, maxBuyIn: 100000 });
  for (let i = 0; i < 9; i++) t.sit("คน" + i, i, 1000, "tok" + i);
  ok(t.summary().full === true, "9 คนต่ออยู่ = เต็มจริง", t.summary().full);

  t.disconnect(3);
  ok(t.summary().full === true, "เพิ่งหลุด ยังถือว่าเต็ม (เผื่อกลับมา)", t.summary().full);
  const tooSoon = t.sit("คนใหม่", undefined, 500, "new1");
  ok(!tooSoon.ok, "คนใหม่ยังแย่งที่นั่งที่เพิ่งหลุดไม่ได้", tooSoon);

  /* ย้อนเวลาให้ที่นั่งร้างนานเกินกำหนด */
  t._state.seats[3].awaySince = Date.now() - 6 * 60000;
  ok(t.summary().full === false, "ร้างนานแล้ว ต้องไม่ขึ้นว่าเต็ม", t.summary().full);
  const nw = t.sit("คนใหม่", undefined, 500, "new1");
  ok(nw.ok && nw.seatId === 3 && nw.stack === 500, "คนใหม่ได้ที่นั่งที่ร้างนานแล้ว", nw);
}

console.log(fail === 0 ? "\n=== ผ่านทั้งหมด ===" : "\n=== พัง " + fail + " ข้อ ===");
process.exit(fail ? 1 : 0);
