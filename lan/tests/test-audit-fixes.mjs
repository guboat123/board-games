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

/* ---------- ย้ายที่นั่งแล้ว seatId ต้องตามไปด้วย ----------
   finishHand จ่ายเงินโดยอ้าง s.seatId ถ้าไม่ตรงกับตำแหน่งจริง
   เงินจะไปที่ช่องเดิม ซึ่งว่าง (เงินหาย) หรือเป็นของคนอื่น (จ่ายผิดคน) */
{
  const t = createTable("MOVE");
  t.sit("A", null, 1000, "ta");
  t.sit("B", null, 1000, "tb");
  assert.equal(seat(t, 0).seatId, 0);
  assert.ok(!t.moveSeat(0, 5).error, "ย้ายไปช่องว่างได้");
  assert.equal(t._state.seats[5].seatId, 5, "seatId ต้องเป็นเลขช่องใหม่ ไม่ใช่ช่องเดิม");
  assert.equal(t._state.seats[0], null);

  /* เล่นให้จบหนึ่งมือ แล้วยอดต้องยังตรง */
  const before = ledger(t);
  t.action(5, { type: "start" });
  let g = 0;
  while (t._state.phase !== "showdown" && t._state.current >= 0 && g++ < 30) {
    const cur = t._state.current;
    t.action(cur, { type: "act", action: t.viewFor(cur).toCall > 0 ? "call" : "check" });
  }
  balanced(t, "จบมือหลังย้ายที่นั่ง");
  assert.equal(ledger(t).bought, before.bought, "ยอดซื้อเข้าต้องไม่เปลี่ยน");
}

/* ---------- กลับเข้ามาด้วยเครื่องเดิมระหว่างรอเก็บที่นั่ง ต้องไม่โดนเก็บ ---------- */
{
  const t = createTable("REJOIN");
  t.sit("A", null, 1000, "ta");
  t.sit("B", null, 1000, "tb");
  t.sit("C", null, 1000, "tc");
  t.action(0, { type: "start" });
  const who = t._state.current;
  t.action(who, { type: "act", action: "raise", amount: 300 });
  const tok = seat(t, who).token;
  t.leave(who);
  assert.ok(t._state.seats[who], "ยังอยู่ในมือ ที่นั่งต้องถูกคาไว้");
  assert.equal(seat(t, who).leaving, true);

  const back = t.sit("A-again", null, 1000, tok);
  assert.equal(back.ok, true, "กลับเข้ามาด้วย token เดิมได้");
  assert.equal(seat(t, who).leaving, false, "ธงกำลังจะลุกต้องถูกยกเลิก");

  let g2 = 0;
  while (t._state.phase !== "showdown" && t._state.current >= 0 && g2++ < 30) {
    const cur = t._state.current;
    t.action(cur, { type: "act", action: t.viewFor(cur).toCall > 0 ? "call" : "check" });
  }
  assert.ok(t._state.seats[who], "จบมือแล้วต้องยังนั่งอยู่ ไม่ใช่ถูกเก็บที่นั่งไป");
  balanced(t, "กลับเข้ามาแล้วเล่นจบ");
}

/* ---------- โต๊ะไม่จำกัดเวลา: ค้างได้ แต่ต้องมีทางออก ("ขอนาฬิกา") ----------
   ใส่เพดานเวลาแข็งๆ จะผิดเจตนาของโหมดนี้ ซึ่งตั้งใจให้ไม่มีนาฬิกากดดัน
   ทางออกจึงเป็นแบบโต๊ะจริง: คนที่โต๊ะเป็นคนตัดสินว่าจะรอต่อหรือพอแล้ว */
{
  const t = createTable("NOCLOCK");
  t.sit("A", null, 1000, "ta");
  t.sit("B", null, 1000, "tb");
  t.action(0, { type: "config", turnSeconds: 0 });
  t.action(0, { type: "start" });
  const stuckAt = t._state.current;
  const other = stuckAt === 0 ? 1 : 0;
  assert.ok(stuckAt >= 0, "มีคนถึงตา");

  /* ไม่มีใครขอ = ไม่มีวันเดินแทน ต่อให้ผ่านไปสิบนาที (พฤติกรรมเดิมที่ตั้งใจไว้) */
  t._state.turnAt = Date.now() - 600000;
  assert.equal(t.tick(), false, "ไม่มีใครขอนาฬิกา ห้ามเดินแทนเด็ดขาด");

  /* ขอให้ตัวเองไม่ได้ และคนที่ถึงตาก็ขอไม่ได้ */
  assert.ok(t.action(stuckAt, { type: "clock" }).error, "คนที่ถึงตาขอนาฬิกาเองไม่ได้");

  /* รอไม่ถึงเกณฑ์ ยังขอไม่ได้ */
  t._state.turnAt = Date.now() - 5000;
  assert.ok(t.action(other, { type: "clock" }).error, "เพิ่งรอไม่กี่วินาที ยังขอไม่ได้");

  /* รอนานพอแล้ว ขอได้ */
  t._state.turnAt = Date.now() - 600000;
  assert.ok(!t.action(other, { type: "clock" }).error, "รอนานแล้วต้องขอนาฬิกาได้");
  assert.ok(t.action(other, { type: "clock" }).error, "ขอซ้ำไม่ได้");

  /* ขอแล้วยังมีเวลาให้อีก 30 วินาที */
  assert.equal(t.tick(Date.now() + 10000), false, "ขอแล้วยังเหลือเวลา ยังไม่เดินแทน");
  /* หมดเวลาที่ขอไว้ ต้องเดินแทน โต๊ะจะได้ไม่ค้างถาวร */
  assert.equal(t.tick(Date.now() + 40000), true, "หมดนาฬิกาที่ขอไว้ ต้องเดินแทน");
  assert.notEqual(t._state.current, stuckAt, "ต้องเดินตาต่อไปแล้ว");
  /* เปลี่ยนตาแล้วนาฬิกาต้องถูกล้าง คนถัดไปไม่ควรโดนเศษเวลาของคนก่อน */
  assert.equal(t._state.clockAt, 0, "เปลี่ยนตาแล้วนาฬิกาที่ขอไว้ต้องถูกล้าง");
}

console.log("test-audit-fixes (รอบสอง): ผ่านหมด");

/* ---------- สิทธิ์กด "มือต่อไป" ----------
   มีคนจริงพร้อมเล่น = สิทธิ์เป็นของคน บอทห้ามแตะ
   เหลือแต่บอท = บอทกดเองได้ ไม่งั้นโต๊ะค้างเปล่า */
{
  const { createBotManager } = await import("../bots.mjs");
  const bank2 = await import("../bot-bank.mjs");
  const fs2 = await import("node:fs");
  const os2 = await import("node:os");
  const path2 = await import("node:path");
  bank2._setDir(fs2.mkdtempSync(path2.join(os2.tmpdir(), "startright-")));

  const t = createTable("STARTRIGHT");
  const mgr = createBotManager({ table: t }, () => {});
  const human = t.sit("Human", null, 2000, "human");
  t._state.seats[human.seatId].connected = true;
  mgr.add(2, 2);

  /* มีคนจริงพร้อมเล่น → บอทต้องไม่ตั้งเวลาเริ่มมือ */
  mgr.poke();
  assert.equal(t._state.phase, "waiting", "ยังไม่เริ่ม");
  assert.equal(mgr._pendingStart(), false,
    "มีคนจริงพร้อมเล่นอยู่ บอทต้องไม่จองคิวกดเริ่มมือ");

  /* คนจริงพักมือ → ไม่มีใครกดได้แล้ว บอทกดเองได้ */
  t.action(human.seatId, { type: "sitout", value: true });
  mgr.poke();
  assert.equal(mgr._pendingStart(), true,
    "เหลือแต่บอท ต้องจองคิวกดเริ่มมือให้");

  /* คนจริงกลับมา → สิทธิ์ต้องกลับไปเป็นของคนทันที */
  t.action(human.seatId, { type: "sitout", value: false });
  mgr.poke();
  assert.equal(mgr._pendingStart(), false,
    "คนจริงกลับมาพร้อมเล่น สิทธิ์ต้องกลับไปเป็นของคน");

  mgr.removeAll();
  mgr.stop();
}

console.log("test-audit-fixes (สิทธิ์เริ่มมือ): ผ่านหมด");

/* ---------- หมดเวลาแล้ว แต่ยังไม่มีใครกดเริ่มมือใหม่ ----------
   เซิร์ฟเวอร์ปิดรอบตอน "พยายามเริ่มมือแล้วพบว่าหมดเวลา" เท่านั้น
   ถ้านาฬิกาหมดตอนที่ยังไม่มีใครกด จะมีช่วงที่ over ยังเป็นเท็จ แต่เวลาหมดแล้ว
   หน้าจอต้องรู้เรื่องนี้จาก msLeft ไม่ใช่รอ over อย่างเดียว
   ไม่งั้นปุ่ม "มือต่อไป" จะเป็นสีทองกดได้ แล้วกดปุ๊บได้ข้อความแดงวาบเดียวแล้วเด้งไปหน้าจบรอบ */
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1,
                          limitType: "minutes", limitValue: 1 });
  t.sit("A", 0, 1000, "ta");
  t.sit("B", 1, 1000, "tb");
  t.action(0, { type: "start" });
  let g = 0;
  while (t._state.phase !== "showdown" && t._state.current >= 0 && g++ < 30) {
    const c = t._state.current;
    t.action(c, { type: "act", action: t.viewFor(c).toCall > 0 ? "call" : "check" });
  }
  /* เวลาหมดระหว่างที่ยังไม่มีใครกดเริ่มมือใหม่ */
  t._state.startedAt = Date.now() - 90000;
  const v = t.viewFor(0);
  assert.equal(v.limit.over, false, "เซิร์ฟเวอร์ยังไม่ปิดรอบ เพราะยังไม่มีใครกดเริ่ม");
  assert.equal(v.limit.msLeft, 0, "แต่เวลาหมดแล้วจริง");
  assert.ok(v.canStart, "และเซิร์ฟเวอร์ยังบอกว่ากดเริ่มได้ — นี่คือกับดัก");

  /* กดจริงต้องถูกปฏิเสธ และรอบต้องถูกปิดให้ */
  const out = t.action(0, { type: "start" });
  assert.ok(out.error, "กดเริ่มตอนหมดเวลา ต้องถูกปฏิเสธ");
  assert.equal(t.viewFor(0).limit.over, true, "และรอบต้องถูกปิดพร้อมตารางสรุป");
  assert.ok(t.viewFor(0).standings, "ต้องมีตารางอันดับให้ดู");
}

console.log("test-audit-fixes (หมดเวลาก่อนกดเริ่ม): ผ่านหมด");
