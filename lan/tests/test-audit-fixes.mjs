/* บั๊กที่ตรวจเจอรอบ 2026-08-31 — ทุกข้อต้องมีเทสต์ ไม่งั้นมันจะกลับมา
   เน้นสามเรื่องที่เจ็บที่สุด: โต๊ะค้างถาวร · ชิปหายจากระบบ · ไพ่คนอื่นรั่ว */
import assert from "node:assert/strict";
import { createTable } from "../poker-room.mjs";

const seat = (t, i) => t._state.seats[i];
/* ชิปทั้งหมดที่ยังอยู่ในระบบ ต้องเท่ากับที่ซื้อเข้ามาเสมอ */
function ledger(t) {
  const st = t._state;
  let stacks = 0, committed = 0, bought = 0;
  for (const s of st.seats) {
    if (!s) continue;
    stacks += s.stack; committed += s.committed; bought += s.boughtIn;
  }
  return { onTable: stacks + committed + st.cashedOut, bought: bought + st.boughtOut };
}
const balanced = (t, where) => {
  const l = ledger(t);
  assert.equal(l.onTable, l.bought, where + ": ชิปในระบบ " + l.onTable + " ไม่ตรงกับที่ซื้อเข้า " + l.bought);
};

/* ---------- 1. ทุกคนหมดตักตั้งแต่บอด ต้องไม่ค้าง ---------- */
{
  const t = createTable("A");
  t.sit("A", null, 2000, "ta");
  t.sit("B", null, 2000, "tb");
  seat(t, 0).stack = 8;    /* น้อยกว่าบอดทั้งคู่ */
  seat(t, 1).stack = 15;
  seat(t, 0).boughtIn = 8;
  seat(t, 1).boughtIn = 15;
  const out = t.action(0, { type: "start" });
  assert.ok(!out.error, "เริ่มมือได้");
  assert.equal(t._state.phase, "showdown", "ทุกคนหมดตักตั้งแต่บอด ต้องเปิดไพ่จนจบ ไม่ใช่ค้างที่ preflop");
  assert.equal(t._state.board.length, 5, "ต้องแจกไพ่กลางครบ");
  balanced(t, "all-in จากบอด");
  /* และต้องเริ่มมือต่อไปได้จริง ไม่ใช่ติดที่ 'มือนี้ยังไม่จบ' */
  assert.ok(!t.action(0, { type: "rebuy", amount: 1000 }).error, "จบมือแล้วต้องเติมชิปได้");
}

/* ---------- 2. ลุกจากโต๊ะกลางมือ ชิปต้องไม่หายจากระบบ ---------- */
{
  const t = createTable("B");
  t.sit("A", null, 1000, "ta");
  t.sit("B", null, 1000, "tb");
  t.sit("C", null, 50, "tc");
  t.action(0, { type: "start" });
  balanced(t, "เริ่มมือ");
  /* คนแรกที่ถึงตาไล่หนัก แล้วลุกออกกลางมือ */
  const first = t._state.current;
  t.action(first, { type: "act", action: "raise", amount: 800 });
  const leaver = t._state.current;
  t.leave(leaver);
  balanced(t, "ลุกกลางมือ");
  /* ยังเล่นอยู่ ที่นั่งต้องถูกคาไว้ก่อน เงินที่ลงกองไปแล้วยังเป็นของกอง */
  assert.ok(t._state.seats[leaver], "ระหว่างมือยังไม่จบ ที่นั่งของคนที่ลุกต้องยังอยู่");

  /* เล่นให้จบมือ แล้วที่นั่งต้องถูกปล่อย พร้อมยอดที่ยังตรง */
  let g = 0;
  while (t._state.phase !== "showdown" && t._state.current >= 0 && g++ < 20) {
    t.action(t._state.current, { type: "act", action: "fold" });
  }
  balanced(t, "จบมือหลังมีคนลุกกลางทาง");
  assert.equal(t._state.seats[leaver], null, "จบมือแล้วที่นั่งของคนที่ลุกต้องถูกปล่อย");
  assert.ok(t._state.cashedOut > 0, "ชิปที่เขาถือกลับไปต้องถูกจดไว้ ไม่ใช่หายเงียบ");
}

/* ---------- 3. ไพ่ที่กดโชว์เอง ต้องไม่ตกไปอยู่กับคนที่ย้ายมานั่งแทน ---------- */
{
  const t = createTable("C");
  t.sit("A", null, 1000, "ta");
  t.sit("B", null, 1000, "tb");
  t.sit("C", null, 1000, "tc");
  t.action(0, { type: "start" });
  /* หมอบจนเหลือคนเดียว จะได้จบแบบไม่เปิดไพ่ */
  let guard = 0;
  while (t._state.phase !== "showdown" && guard++ < 20) {
    const cur = t._state.current;
    if (cur < 0) break;
    t.action(cur, { type: "act", action: "fold" });
  }
  assert.equal(t._state.phase, "showdown", "ต้องจบมือ");
  const winner = t._state.lastResult.payouts[0].seatId;
  t.action(winner, { type: "showcards" });
  assert.equal(t.viewFor(0).seats[winner].selfShown, true, "คนที่กดโชว์ ต้องขึ้นว่าโชว์");

  /* ผู้ชนะย้ายไปนั่งช่องว่าง แล้วคนอื่นย้ายมานั่งช่องเดิมของเขา
     นี่คือลำดับที่ทำให้ธง "โชว์ไพ่" หลุดไปติดคนผิด ถ้าธงผูกกับเลขที่นั่ง */
  const empty = 7;
  assert.equal(t._state.seats[empty], null, "ช่อง 8 ต้องว่าง");
  assert.ok(!t.moveSeat(winner, empty).error, "ผู้ชนะย้ายไปช่องว่างได้");
  const other = t._state.seats.findIndex((s, i) => s && i !== empty);
  assert.ok(!t.moveSeat(other, winner).error, "คนอื่นย้ายมานั่งช่องเดิมของผู้ชนะได้");
  assert.notEqual(t._state.seats[winner].token, "tc", "ช่องเดิมต้องเปลี่ยนเจ้าของแล้วจริงๆ");
  const v = t.viewFor(empty);
  assert.equal(v.seats[winner].selfShown, false,
    "คนที่ย้ายมานั่งแทน ต้องไม่ถูกนับว่าโชว์ไพ่ ไม่งั้นไพ่ในมือเขาถูกส่งให้ทุกเครื่อง");
  assert.deepEqual(v.seats[winner].cards, ["??", "??"], "ไพ่ของคนที่ย้ายมานั่งต้องยังปิดอยู่");
}

/* ---------- 4. พักมือตอนถึงตาตัวเอง ต้องถูกปฏิเสธ ---------- */
{
  const t = createTable("D");
  t.sit("A", null, 1000, "ta");
  t.sit("B", null, 1000, "tb");
  t.action(0, { type: "start" });
  const cur = t._state.current;
  const out = t.action(cur, { type: "sitout", value: true });
  assert.ok(out.error, "ถึงตาตัวเองต้องพักมือไม่ได้ ไม่งั้นโต๊ะที่ไม่จำกัดเวลาจะค้าง");
  assert.equal(seat(t, cur).sitOut, false, "และต้องไม่ถูกตั้งค่าไปแล้ว");
}

/* ---------- 5. เลิกรอบ / เริ่มรอบใหม่ ต้องเป็นสิทธิ์ของเจ้าภาพ ---------- */
{
  const t = createTable("E");
  t.sit("Host", null, 1000, "th");
  t.sit("Guest", null, 1000, "tg");
  assert.ok(t.action(1, { type: "endrun" }).error, "แขกต้องเลิกรอบให้ทั้งโต๊ะไม่ได้");
  assert.ok(t.action(1, { type: "newsession" }).error, "แขกต้องล้างกำไรขาดทุนของทุกคนไม่ได้");
  assert.ok(!t.action(0, { type: "endrun" }).error, "เจ้าภาพเลิกรอบได้");
}

/* ---------- 6. ที่นั่งบอทต้องยึดด้วย token ไม่ได้ ---------- */
{
  const t = createTable("F");
  t.sit("Bot", null, 2000, "bot:1", { bot: true, level: 2 });
  const r = t.sit("Attacker", null, 100, "bot:1");
  assert.ok(!r.tookOver, "ห้ามยึดที่นั่งบอทด้วย token ที่เดาได้");
  assert.equal(seat(t, 0).name, "Bot", "ที่นั่งบอทต้องยังเป็นของบอท");
}

/* ---------- 7. ที่นั่งร้างที่ยังอยู่ในมือ ต้องยึดไม่ได้ ---------- */
{
  const t = createTable("G");
  for (let i = 0; i < 9; i++) t.sit("P" + i, null, 1000, "t" + i);
  t.action(0, { type: "start" });
  const victim = t._state.seats.findIndex(s => s && s.inHand && s.committed > 0);
  t.disconnect(victim);
  seat(t, victim).awaySince = 1;   /* แกล้งให้ร้างมานานมาก */
  const before = ledger(t);
  const r = t.sit("Newcomer", null, 500, "tnew");
  assert.ok(!r.ok, "โต๊ะเต็มและทุกที่นั่งยังอยู่ในมือ ต้องนั่งไม่ได้");
  assert.equal(seat(t, victim) && seat(t, victim).name, "P" + victim, "ที่นั่งของคนที่ยังอยู่ในมือต้องไม่ถูกยึด");
  assert.equal(ledger(t).bought, before.bought, "และชิปต้องไม่หายไปจากระบบ");
}

console.log("test-audit-fixes: ผ่านหมด");
