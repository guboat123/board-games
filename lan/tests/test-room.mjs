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
  const before = t._state.seats[turn];
  t.leave(turn);
  const after = t._state.seats[turn];
  /* ถ้าเขายังไม่ได้ลงเงิน ที่นั่งว่างทันที
     ถ้าลงกองไปแล้ว ต้องคาที่นั่งไว้จนจบมือ ไม่งั้นเงินในกองจะหาย */
  ok(before.committed > 0 ? (after && after.leaving === true) : after === null,
     "ที่นั่งคนที่ออกกลางมือ: ไม่มีเงินในกอง=ว่างทันที · มีเงิน=คาไว้จนจบมือ",
     { committed: before.committed, after: after ? "leaving" : null });
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

/* ---------------------------------------------------------------
   6) ลุกกลางมือ เงินที่ลงกองไปแล้วต้องอยู่ในกอง ห้ามหายไปกับตัว
   (เคยพังจริง: ชิปหายจากโต๊ะทุกครั้งที่มีคนกดออกกลางมือ)
   --------------------------------------------------------------- */
head("ลุกกลางมือ เงินในโต๊ะต้องไม่หาย");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  const a = t.sit("เอ", 0, 1000, "a");
  t.sit("บี", 1, 1000, "b");
  t.sit("ซี", 2, 1000, "c");
  const st = t._state;
  const boughtIn = 3000;

  t.action(a.seatId, { type: "start" });

  const onTable = () => st.seats.filter(Boolean).reduce((n, s) => n + s.stack, 0);
  const inPot = () => st.seats.filter(Boolean).reduce((n, s) => n + s.committed, 0);

  ok(onTable() + inPot() === boughtIn,
     "ก่อนใครออก ชิปครบ", onTable() + inPot());

  /* คนที่ลงกองไปแล้ว (บลายด์) ลุกกลางมือ */
  const leaver = st.seats.find(s => s && s.committed > 0);
  const cashedOut = leaver.stack;
  const putIn = leaver.committed;
  t.leave(leaver.seatId);

  /* ที่นั่งของคนที่ลุกยังคาไว้จนกว่ามือจะจบ ชิปกับเงินที่ลงกองจึงยังนับอยู่ในโต๊ะ */
  ok(onTable() + inPot() === boughtIn,
     "ออกกลางมือ เงินที่ลงกอง " + putIn + " ต้องยังอยู่ในโต๊ะ",
     { onTable: onTable(), inPot: inPot(), รวม: onTable() + inPot() });
  ok(inPot() >= putIn, "เงินของคนที่ลุกไป ยังอยู่ในกองครบ", { inPot: inPot(), putIn });

  /* เล่นมือนั้นจนจบ แล้วเช็คว่าเงินยังครบ และที่นั่งถูกเก็บกวาดแล้ว */
  let guard = 0;
  while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 60) {
    const cur = st.current;
    if (cur < 0 || !st.seats[cur]) break;
    const r = t.action(cur, { type: "act", action: "call" });
    if (r && r.error) { t.action(cur, { type: "act", action: "check" }); }
  }

  ok(st.seats[leaver.seatId] === null,
     "จบมือแล้ว ที่นั่งคนที่ลุกไปต้องว่าง", st.seats[leaver.seatId]);
  ok(onTable() + cashedOut === boughtIn,
     "จบมือแล้ว ชิบนโต๊ะ + ที่ถือออกไป = ที่ซื้อเข้ามาทั้งหมด",
     { onTable: onTable(), cashedOut, รวม: onTable() + cashedOut, ควรเป็น: boughtIn });
}

/* --------------------------------------------------------------- */
head("ย้ายที่นั่งบนโต๊ะเดิม");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  const a = t.sit("เอ", 0, 1000, "tokA");
  const b = t.sit("บี", 1, 500, "tokB");
  const st = t._state;

  /* ช่องที่มีคนอยู่ ห้ามย้ายไปทับ ไม่งั้นชิปของเจ้าของช่องหายทั้งก้อน */
  ok(!!t.moveSeat(a.seatId, b.seatId).error, "ย้ายไปทับช่องที่มีคนอยู่ไม่ได้");

  /* ย้ายไปช่องว่างได้ ชิปกับชื่อต้องติดตัวไปครบ */
  const before = st.seats[a.seatId].stack;
  const r = t.moveSeat(a.seatId, 5);
  ok(r.ok && r.seatId === 5, "ย้ายไปช่องว่างได้", r);
  ok(st.seats[0] === null, "ช่องเดิมต้องว่าง", st.seats[0]);
  ok(st.seats[5] && st.seats[5].name === "เอ" && st.seats[5].stack === before,
     "ชื่อกับชิปย้ายตามไปครบ", st.seats[5] && { name: st.seats[5].name, stack: st.seats[5].stack });

  /* สิทธิ์เจ้าภาพผูกกับคน ไม่ใช่ช่อง เอานั่งคนแรกจึงต้องยังเป็นเจ้าภาพหลังย้าย */
  ok(st.hostSeat === 5, "สิทธิ์เจ้าภาพย้ายตามคนไปด้วย", st.hostSeat);
  ok(!t.action(5, { type: "config", smallBlind: 25, bigBlind: 50 }).error &&
     t._cfg.smallBlind === 25, "ย้ายแล้วยังตั้งค่าโต๊ะได้", t._cfg.smallBlind);

  /* ระหว่างเล่นมือห้ามย้าย ลำดับการเดินตาผูกกับเลขช่อง */
  t.action(5, { type: "start" });
  ok(st.phase !== "waiting" && st.phase !== "showdown", "มือเริ่มแล้ว", st.phase);
  ok(!!t.moveSeat(5, 8).error, "ย้ายที่นั่งระหว่างเล่นมือไม่ได้");
  ok(st.seats[5] !== null && st.seats[8] === null, "ที่นั่งต้องไม่ขยับระหว่างมือ");

  /* เงินรวมบนโต๊ะต้องไม่เปลี่ยนเพราะการย้ายที่นั่ง */
  const total = st.seats.reduce((n, x) => n + (x ? x.stack + x.committed : 0), 0);
  ok(total === 1500, "ย้ายที่นั่งแล้วชิปรวมบนโต๊ะเท่าเดิม", total);
}

/* --------------------------------------------------------------- */
head("ประวัติมือ + เวลาที่ใช้ตัดสินใจ");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  const a = t.sit("เอ", 0, 1000, "tokA");
  const b = t.sit("บี", 1, 1000, "tokB");
  const st = t._state;

  ok(t.history().length === 0, "ยังไม่เล่น ประวัติต้องว่าง", t.history().length);

  t.action(a.seatId, { type: "start" });
  /* เล่นให้จบหนึ่งมือ ตามอย่างเดียวพอ */
  let guard = 0;
  while (st.phase !== "showdown" && guard++ < 40) {
    const cur = st.current;
    if (cur < 0) break;
    let r = t.action(cur, { type: "act", action: "call" });
    if (r.error) r = t.action(cur, { type: "act", action: "check" });
    if (r.error) break;
  }

  const hs = t.history();
  ok(hs.length === 1, "จบมือแล้วต้องมีประวัติ 1 มือ", hs.length);
  const h = hs[0];
  ok(h.no === 1 && h.sb === 10 && h.bb === 20, "หัวมือถูกต้อง", { no: h.no, sb: h.sb, bb: h.bb });
  ok(h.players.length === 2, "จดคนที่ร่วมมือครบ", h.players.map(x => x.name));
  ok(h.acts.length > 0, "ต้องมีรายการลงมือ", h.acts.length);
  ok(h.acts.every(x => typeof x.think === "number" && x.think >= 0),
     "ทุกรายการต้องมีเวลาที่ใช้คิด (วินาที)", h.acts.slice(0, 3));
  ok(h.acts.every(x => x.name && x.phase && x.act),
     "ทุกรายการต้องรู้ว่าใคร รอบไหน ทำอะไร", h.acts[0]);
  /* ต้องจดชื่อไว้ตรงๆ ไม่ใช่เลขที่นั่ง เพราะคนย้ายที่นั่งได้ */
  ok(h.acts.every(x => x.name === "เอ" || x.name === "บี"), "ชื่อในประวัติต้องเป็นชื่อจริง");
  ok(h.result && Array.isArray(h.result.payouts) && h.result.payouts.length > 0,
     "ต้องจดว่าใครได้เงินเท่าไหร่", h.result && h.result.payouts);
  ok(h.board.length === 5 || h.result.showdown === false,
     "ไพ่กลางถูกจดไว้", h.board.length);

  /* เล่นอีกมือ ประวัติต้องเพิ่มไม่ใช่ทับ */
  t.action(a.seatId, { type: "start" });
  ok(t.history().length === 1, "ระหว่างเล่น ยังไม่ปิดสมุดมือที่สอง", t.history().length);
}

/* --------------------------------------------------------------- */
head("หมดเวลาตัดสินใจ + การ์ดต่อเวลา");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000,
                          turnSeconds: 30, timeCards: 2, timeCardSeconds: 30 });
  const a = t.sit("เอ", 0, 1000, "tokA");
  const b = t.sit("บี", 1, 1000, "tokB");
  const st = t._state;
  t.action(a.seatId, { type: "start" });

  const cur = st.current;
  ok(st.seats[cur].timeCards === 2, "เริ่มมาได้การ์ดต่อเวลาคนละ 2 ใบ", st.seats[cur].timeCards);
  ok(t.tick() === false, "ยังไม่หมดเวลา ห้ามเดินแทน");

  /* ใช้การ์ด 1 ใบ ต้องได้เวลาเพิ่มจริง */
  ok(!t.action(cur, { type: "timecard" }).error, "ใช้การ์ดต่อเวลาได้");
  ok(st.seats[cur].timeCards === 1, "การ์ดลดลง 1 ใบ", st.seats[cur].timeCards);
  ok(t.viewFor(cur).turnBudgetMs === 60000, "เวลาในตานี้เป็น 60 วิ", t.viewFor(cur).turnBudgetMs);

  /* คนที่ไม่ถึงตา ใช้การ์ดไม่ได้ */
  const other = st.seats.findIndex((x, i) => x && i !== cur);
  ok(!!t.action(other, { type: "timecard" }).error, "ไม่ถึงตาตัวเอง ใช้การ์ดไม่ได้");

  /* ย้อนเวลาไป 61 วินาที นาฬิกาต้องเดินแทน */
  st.turnAt = Date.now() - 61000;
  const before = st.current;
  ok(t.tick() === true, "หมดเวลาแล้ว ระบบต้องเดินแทน");
  ok(st.current !== before || st.phase !== "preflop", "ตาต้องเดินต่อ ไม่ค้าง",
     { current: st.current, phase: st.phase });

  /* เงินต้องไม่หายจากการเดินแทน */
  const total = st.seats.reduce((n, x) => n + (x ? x.stack + x.committed : 0), 0);
  ok(total === 2000, "หมดเวลาแล้วชิปรวมเท่าเดิม", total);

  /* เวลาที่ซื้อไว้ใช้ได้เฉพาะตานั้น พอเปลี่ยนตาต้องกลับเป็น 30 วิ */
  if (st.current >= 0) {
    ok(t.viewFor(st.current).turnBudgetMs === 30000,
       "เปลี่ยนตาแล้ว เวลาที่ซื้อไว้ต้องหมดอายุ", t.viewFor(st.current).turnBudgetMs);
  }

  /* โต๊ะที่ไม่จำกัดเวลา ต้องไม่มีใครถูกเดินแทน */
  const t2 = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, turnSeconds: 0 });
  t2.sit("ซี", 0, 500, "tokC");
  t2.sit("ดี", 1, 500, "tokD");
  t2.action(0, { type: "start" });
  t2._state.turnAt = Date.now() - 600000;
  ok(t2.tick() === false, "โต๊ะไม่จำกัดเวลา ห้ามเดินแทนเด็ดขาด");
}

/* --------------------------------------------------------------- */
head("เปิดเกมซ้ำจากเครื่องเดิม ต้องได้ที่นั่งเดิม ไม่ใช่ที่นั่งใหม่");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000 });
  const a = t.sit("โบ๊ท", 0, 1000, "device-A");
  t.sit("เพื่อน", 1, 1000, "device-B");
  const st = t._state;
  st.seats[a.seatId].stack = 1853;   /* เล่นไปสักพักแล้ว */

  /* ที่นั่งยังขึ้นว่า "ต่ออยู่" เพราะโซเก็ตเก่ายังไม่ตาย แล้วเครื่องเดิมเปิดซ้ำ */
  ok(st.seats[a.seatId].connected === true, "ที่นั่งเดิมยังขึ้นว่าต่ออยู่");
  const again = t.sit("โบ๊ท", null, 1000, "device-A");
  ok(again.ok && again.seatId === a.seatId,
     "ต้องได้ที่นั่งเดิมคืน ไม่ใช่ช่องใหม่", { ได้ช่อง: again.seatId, ควรเป็น: a.seatId });
  ok(again.stack === 1853, "ชิปต้องเป็นก้อนเดิม ไม่ใช่ซื้อเข้าใหม่", again.stack);
  ok(t._state.seats.filter(x => x && x.token === "device-A").length === 1,
     "เครื่องเดียวต้องมีที่นั่งเดียว ไม่แตกเป็นสอง");
  ok(!t._state.seats.some(x => x && /โบ๊ท 2/.test(x.name)), "ต้องไม่มีชื่อต่อเลข");

  /* เปลี่ยนชื่อแล้วกลับมา ก็ยังต้องเป็นที่นั่งเดิม */
  const renamed = t.sit("Boat", null, 1000, "device-A");
  ok(renamed.ok && renamed.seatId === a.seatId, "เปลี่ยนชื่อแล้วยังได้ที่นั่งเดิม", renamed.seatId);
  ok(renamed.stack === 1853, "ชิปยังเป็นก้อนเดิมหลังเปลี่ยนชื่อ", renamed.stack);

  /* คนละเครื่อง ห้ามแย่งที่นั่งที่มีคนต่ออยู่ */
  const stranger = t.sit("โบ๊ท", null, 1000, "device-X");
  ok(stranger.seatId !== a.seatId, "เครื่องอื่นต้องไม่ได้ที่นั่งของเรา", stranger.seatId);
  ok(t._state.seats[a.seatId].stack === 1853, "ชิปของเราต้องไม่ถูกแตะ", t._state.seats[a.seatId].stack);
}

/* --------------------------------------------------------------- */
head("หายไปนานเกินกำหนด ระบบพักมือให้");
{
  const t = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, maxBuyIn: 100000,
                          turnSeconds: 30, idleSitOutSeconds: 200 });
  const a = t.sit("เอ", 0, 1000, "tokA");
  const b = t.sit("บี", 1, 1000, "tokB");
  const st = t._state;
  t.action(a.seatId, { type: "start" });

  const cur = st.current;
  /* คนที่ถึงตา หายไปนานกว่า 200 วิ แล้วปล่อยให้หมดเวลา */
  st.seats[cur].lastActAt = Date.now() - 250000;
  st.turnAt = Date.now() - 31000;
  ok(t.tick() === true, "หมดเวลาแล้วระบบเดินแทน");
  ok(st.seats[cur].sitOut === true, "หายนานเกิน 200 วิ ต้องถูกพักมือให้", st.seats[cur].sitOut);

  /* คนที่ยังลงมืออยู่เรื่อยๆ ห้ามโดนพักมือ แม้จะหมดเวลาสักครั้ง */
  const t2 = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, turnSeconds: 30, idleSitOutSeconds: 200 });
  t2.sit("ซี", 0, 1000, "tokC"); t2.sit("ดี", 1, 1000, "tokD");
  t2.action(0, { type: "start" });
  const st2 = t2._state;
  const cur2 = st2.current;
  st2.seats[cur2].lastActAt = Date.now() - 5000;   /* เพิ่งลงมือไปเมื่อ 5 วิที่แล้ว */
  st2.turnAt = Date.now() - 31000;
  t2.tick();
  ok(st2.seats[cur2].sitOut !== true, "เพิ่งลงมือไป ห้ามโดนพักมือแค่เพราะหมดเวลาครั้งเดียว");

  /* คนที่นั่งดูเฉยๆ ไม่เคยถึงตา ต้องไม่โดนพักมือ */
  const t3 = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, turnSeconds: 30, idleSitOutSeconds: 200 });
  const x = t3.sit("อี", 0, 1000, "tokE");
  t3.sit("เอฟ", 1, 1000, "tokF");
  t3._state.seats[x.seatId].lastActAt = Date.now() - 900000;   /* นั่งเงียบมา 15 นาที */
  t3.tick();
  ok(t3._state.seats[x.seatId].sitOut !== true,
     "นั่งดูเฉยๆ ยังไม่เคยถึงตา ต้องไม่ถูกพักมือ");

  /* ตั้งเป็น 0 = ปิดกติกานี้ */
  const t4 = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 1, turnSeconds: 30, idleSitOutSeconds: 0 });
  t4.sit("จี", 0, 1000, "tokG"); t4.sit("เฮช", 1, 1000, "tokH");
  t4.action(0, { type: "start" });
  const st4 = t4._state, c4 = st4.current;
  st4.seats[c4].lastActAt = Date.now() - 900000;
  st4.turnAt = Date.now() - 31000;
  t4.tick();
  ok(st4.seats[c4].sitOut !== true, "ตั้งเป็น 0 = ไม่บังคับพักมือเลย");
}

console.log(fail === 0 ? "\n=== ผ่านทั้งหมด ===" : "\n=== พัง " + fail + " ข้อ ===");
process.exit(fail ? 1 : 0);
