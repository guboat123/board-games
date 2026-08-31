/* ⚠️ เลิกใช้แล้ว — เก็บไว้อ่านประกอบเท่านั้น ห้ามเอาตัวเลขจากไฟล์นี้ไปตัดสินใจแก้บอท
   สองอย่างที่ทำให้มันโกหก และแก้ไปแล้วใน watch-bots.mjs แต่ไม่ได้แก้ที่นี่:
     · ตัวผู้เล่นล็อกไว้ไม่กี่ตัวจาก 30 ตัว และมือน้อยมาก (หลักร้อย) — ความต่างระหว่าง
       "ตัวไหนมานั่ง" ใหญ่กว่าความต่างระหว่าง "ระดับ" หลายเท่า อ่านได้แต่ noise
     · หมดตัวแล้วเติมชิปให้ฟรีทุกครั้ง ซึ่งเป็นคนละเกมกับของจริง (ดู settleBusted)
   ใช้ตัวนี้แทน:
     ระดับไหนเก่งกว่า      -> node lan/tools/watch-bots.mjs 1000000 25000
     เงินรั่วตอนไหน        -> node lan/tools/leak-scan.mjs 60000
     คนเล่นเอาชนะได้ไหม    -> node lan/tools/play-as-human.mjs 40000 250 [ระดับ]
*/
/* วัดว่าบอท "กล้าเกินไป" จริงไหม — ดูขนาดเดิมพันเทียบกอง เทียบตัก และความถี่ของการลงหมดหน้าตัก */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const _d = fs.mkdtempSync(path.join(os.tmpdir(), "aggro-"));
bank._setDir(_d);
mind._setDir(_d);

const out = {};
for (const lv of [1, 2, 3]) {
  const t = createTable("AG" + lv);
  const mgr = createBotManager({ table: t }, () => {});
  t.sit("Human", null, 500000, "human");
  t._state.seats[0].connected = true;
  t._state.seats[0].sitOut = true;
  mgr.add(4, lv);
  const s = { acts: 0, raises: 0, shoves: 0, potFrac: [], stackFrac: [], allInSeen: 0, hands: 0 };
  const orig = t.action;
  t.action = function (seat, msg) {
    const st = t._state.seats[seat];
    if (msg.type === "act" && st && st.isBot) {
      s.acts++;
      if (msg.action === "call" && msg.amount === undefined) {
        // ตามหมดตัก = ตามด้วยเงินที่เหลือทั้งหมด
        const need = t._state.currentBet - st.bet;
        if (need >= st.stack) s.allInCalls = (s.allInCalls || 0) + 1;
      }
      if (msg.action === "raise") {
        s.raises++;
        const pot = t._state.seats.reduce((a, x) => a + (x ? x.committed : 0), 0);
        const put = msg.amount - st.bet;
        if (pot > 0) s.potFrac.push(put / pot);
        s.stackFrac.push(put / Math.max(1, st.stack));
        if (msg.amount >= st.bet + st.stack) s.shoves++;
      }
    }
    return orig.call(t, seat, msg);
  };
  const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const bigPair = (cards) => {
    if (!cards || cards.length !== 2) return false;
    const r = cards.map(c => RANKS.indexOf(String(c).slice(0, -1)));
    return r[0] === r[1] && r[0] >= 8;   // TT ขึ้นไป
  };
  s.bigPairHands = 0; s.bigPairAllIn = 0;

  for (let h = 0; h < 300; h++) {
    const r = t.action(0, { type: "start" });
    if (r && r.error) break;
    let guard = 0;
    while (t._state.phase !== "showdown" && t._state.phase !== "waiting" && guard++ < 200) {
      const cur = t._state.current;
      if (cur < 0) break;
      if (!mgr._decideNow(cur)) t.action(cur, { type: "act", action: t.viewFor(cur).toCall > 0 ? "call" : "check" });
      /* ⚠️ ต้องเรียกทุกครั้งที่มีคนลงมือ ไม่งั้นบอทที่วัดจะอ่านคนไม่เป็นและไม่มีความจำ
         ซึ่งเป็นคนละตัวกับบอทที่คนเล่นเจอจริง (ดู senseTable ใน bots.mjs) */
      mgr.senseTable();
    }
    /* บอทที่ถือคู่สูง จบมือแล้วลงหมดตักไปกี่ตัว */
    for (const b of t._state.seats) {
      if (!b || !b.isBot || !b.cards || b.cards.length !== 2) continue;
      const codes = b.cards.map(c => RANKS[c >> 2] + "shcd"[c & 3]);
      if (!bigPair(codes)) continue;
      s.bigPairHands++;
      if (b.allIn) s.bigPairAllIn++;
    }
    s.allInSeen += t._state.seats.filter(x => x && x.isBot && x.allIn).length;
    s.hands++;
    for (const b of t._state.seats) if (b && b.isBot && b.stack <= 0) { b.stack = 2000; b.boughtIn += 2000; }
  }
  mgr.removeAll();
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
  out[lv] = {
    hands: s.hands,
    raisePct: (s.raises / Math.max(1, s.acts) * 100).toFixed(1) + "%",
    avgBetVsPot: avg(s.potFrac).toFixed(2) + "x",
    avgBetVsStack: (avg(s.stackFrac) * 100).toFixed(1) + "%",
    shovePer100Acts: (s.shoves / Math.max(1, s.acts) * 100).toFixed(1),
    allInCallsPer100: ((s.allInCalls || 0) / Math.max(1, s.acts) * 100).toFixed(1),
    allInPerHand: (s.allInSeen / Math.max(1, s.hands)).toFixed(2),
    bigPairAllInPct: s.bigPairHands
      ? (s.bigPairAllIn / s.bigPairHands * 100).toFixed(0) + "% (จาก " + s.bigPairHands + " มือที่ถือคู่ TT+)"
      : "ไม่มีข้อมูล"
  };
}
console.log(JSON.stringify(out, null, 2));
