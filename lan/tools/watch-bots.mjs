/* ===========================================================
   ดูพฤติกรรมบอท — เปิดโต๊ะให้บอทเล่นกันเองแบบเร่งความเร็ว แล้วรายงานว่ามันทำอะไรบ้าง

   ใช้โค้ดบอทตัวเดียวกับที่เซิร์ฟเวอร์จริงใช้ ต่างแค่ข้ามเวลาคิด
   (ปกติคิด 0.7-3.4 วินาทีต่อท่า สามร้อยมือจะใช้เวลาเป็นชั่วโมง)

   รัน:  node lan/tools/watch-bots.mjs [จำนวนมือ]
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import { cardCode } from "../poker-engine.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* เงินบอทของจริงอยู่ใน lan/data ห้ามแตะ ใช้โฟลเดอร์ชั่วคราวแทน */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-"));
bank._setDir(tmpDir);
mind._setDir(tmpDir);   /* ความจำบอทของจริงก็ห้ามแตะเหมือนกัน */

const HANDS = Number(process.argv[2] || 300);
const LVNAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };

const table = createTable("WATCH");
const mgr = createBotManager({ table: table }, () => {});

/* คนดูหนึ่งคนที่พักมือตลอด — ห้องต้องมีคนต่ออยู่ ไม่งั้นถูกเก็บ */
table.sit("คนดู", null, 1000000, "watcher");
table._state.seats[0].connected = true;
table._state.seats[0].sitOut = true;

/* ⚠️ ล็อกตัวผู้เล่นไว้ตายตัว ห้ามสุ่ม
   นิสัยของแต่ละตัวต่างกันมากจนผลลัพธ์ต่างกันเป็นสิบล้านชิป
   ถ้าปล่อยให้สุ่ม ความต่างระหว่างรอบจะมาจาก "ใครมานั่ง" ไม่ใช่ "แก้อะไรไป"
   เลือกตัวแทนสองขั้วของแต่ละระดับ จะได้เห็นทั้งฝั่งตึงและฝั่งลุย
     มือใหม่   Wally (ขี้กลัวสุด 0.20) · Bruno (ใจถึงสุด 0.60)
     นักพนัน  Rico (พอประมาณ 0.55) · Sonny (บ้าบิ่นสุด 0.95) · Gio (หลอกเก่ง)
     มืออาชีพ Ash (ตึงสุด 0.35/0.4) · Vega (บลัฟเยอะ 0.60/1.4) · Cole (กลางๆ) */
const LINEUP = [
  ["Wally", 1], ["Bruno", 1],
  ["Rico", 2], ["Sonny", 2], ["Gio", 2],
  ["Ash", 3], ["Vega", 3], ["Cole", 3]
];
for (const [n, lv] of LINEUP) mgr._addNamed(n, lv);

const st = table._state;
const info = {};
for (const s of st.seats) {
  if (!s || !s.isBot) continue;
  info[s.name] = {
    lv: s.botLevel, seat: s.seatId,
    start: s.stack + (s.wallet || 0),
    hands: 0, vpip: 0, raises: 0, calls: 0, checks: 0, folds: 0,
    showdowns: 0, showdownWins: 0, allIn: 0, benched: 0, busts: 0,
    biggestWin: 0, biggestLoss: 0, bluffsShown: 0, slowPlays: 0
  };
}

const notable = [];
let stuckHands = 0;

for (let h = 0; h < HANDS; h++) {
  const before = {};
  for (const s of st.seats) if (s && s.isBot) before[s.name] = s.stack;

  const r = table.action(0, { type: "start" });
  if (r && r.error) break;

  const dealt = new Set();
  for (const s of st.seats) if (s && s.isBot && s.inHand) dealt.add(s.name);
  dealt.forEach(n => info[n].hands++);

  let guard = 0;
  const seenAct = {};
  for (const s2 of st.seats) if (s2 && s2.isBot) info[s2.name]._wasAllIn = false;
  while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 260) {
    const cur = st.current;
    if (cur < 0) break;
    const who = st.seats[cur];
    const wasPhase = st.phase;
    if (!mgr._decideNow(cur)) {
      const v = table.viewFor(cur);
      table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
    }
    if (who && who.isBot) {
      const k = who.lastKind;
      const rec = info[who.name];
      /* ลงหมดหน้าตักตอนไหน และเป็นการไล่หรือการตาม */
      if (who.allIn && !rec._wasAllIn) {
        rec._wasAllIn = true;
        rec.allInBy = rec.allInBy || {};
        const key = wasPhase + "|" + (k === "call" ? "ตาม" : (k === "raise" ? "ไล่" : k));
        rec.allInBy[key] = (rec.allInBy[key] || 0) + 1;
      }
      if (k === "raise" || k === "bet") rec.raises++;
      else if (k === "call") rec.calls++;
      else if (k === "check") rec.checks++;
      else if (k === "fold") rec.folds++;
      if (wasPhase === "preflop" && (k === "call" || k === "raise") && !seenAct[who.name]) {
        seenAct[who.name] = true;
        rec.vpip++;
      }
      /* แกล้งอ่อน: มือแรงมากแต่เคาะผ่านตอนไม่มีใครเดิมพัน */
      if (k === "check" && who.cards.length === 2 && st.board.length >= 3) {
        const codes = who.cards.map(cardCode);
        void codes;
      }
    }
  }
  if (guard >= 260) stuckHands++;

  const res = st.lastResult;
  if (res) {
    const won = {}; (res.payouts || []).forEach(x => { won[x.seatId] = x.amount; });
    const put = {}; (res.puts || []).forEach(x => { put[x.seatId] = x.amount; });
    const showed = new Set((res.reveal || []).map(x => x.name));

    for (const s of st.seats) {
      if (!s || !s.isBot) continue;
      const rec = info[s.name];
      const net = (won[s.seatId] || 0) - (put[s.seatId] || 0);
      if (net > rec.biggestWin) rec.biggestWin = net;
      if (net < rec.biggestLoss) rec.biggestLoss = net;
      if (s.allIn) rec.allIn++;
      if (showed.has(s.name)) {
        rec.showdowns++;
        if ((won[s.seatId] || 0) > 0) rec.showdownWins++;
        rec.sdNet = (rec.sdNet || 0) + net;
      } else {
        /* ไม่ได้เปิดไพ่ = หมอบไปเอง หรือชนะเพราะคนอื่นหมอบหมด */
        rec.noSdNet = (rec.noSdNet || 0) + net;
        if (net < 0) rec.foldedAway = (rec.foldedAway || 0) + (-net);
      }
    }

    /* มือที่น่าสนใจ: กองใหญ่ผิดปกติ หรือมีคนโดนจับได้ว่าบลัฟ */
    const pot = res.pot || 0;
    if (pot > 3000 && notable.length < 8) {
      notable.push({
        no: st.handNo, pot: pot, board: (res.board || []).join(" "),
        show: (res.reveal || []).map(x => x.name + " " + x.hand).join(" · "),
        win: (res.payouts || []).map(x => x.name + " +" + x.amount).join(", ")
      });
    }
  }

  /* หมดตัวก็เติมให้เหมือนของจริง */
  for (const s of st.seats) {
    if (s && s.isBot && s.stack <= 0) {
      info[s.name].busts++;
      s.stack = 2000; s.boughtIn += 2000;
      s.wallet = (typeof s.wallet === "number" ? s.wallet : 0) - 2000;
    }
    if (s && s.isBot && s.sitOut) info[s.name].benched++;
  }
}

const rows = Object.keys(info).map(n => {
  const s = st.seats.find(x => x && x.name === n);
  const now = s ? s.stack + (s.wallet || 0) : 0;
  const i = info[n];
  const acts = i.raises + i.calls + i.checks + i.folds || 1;
  return {
    name: n, lv: LVNAME[i.lv],
    net: now - i.start,
    hands: i.hands,
    vpip: i.hands ? Math.round(i.vpip / i.hands * 100) : 0,
    raise: Math.round(i.raises / acts * 100),
    fold: Math.round(i.folds / acts * 100),
    sd: i.showdowns, sdWin: i.showdowns ? Math.round(i.showdownWins / i.showdowns * 100) : 0,
    sdNet: i.sdNet || 0, noSdNet: i.noSdNet || 0, foldedAway: i.foldedAway || 0,
    allIn: i.allIn, busts: i.busts,
    big: i.biggestWin, worst: i.biggestLoss
  };
});
rows.sort((a, b) => b.net - a.net);

const pad = (v, w) => String(v).padEnd(w);
const num = (v, w) => String(v).padStart(w);

console.log("");
console.log("บอทเล่นกันเอง " + HANDS + " มือ" + (stuckHands ? "  (ค้าง " + stuckHands + " มือ)" : ""));
console.log("=".repeat(96));
console.log(pad("บอท", 10) + pad("ระดับ", 11) + num("ได้/เสีย", 11) + num("มือ", 6) +
            num("ลงเล่น", 8) + num("ไล่", 6) + num("ทิ้ง", 6) +
            num("เปิดไพ่", 9) + num("ชนะ%", 7) + num("หมดตัก", 8) + num("ล้ม", 5));
console.log("-".repeat(96));
for (const r of rows) {
  console.log(pad(r.name, 10) + pad(r.lv, 11) + num(r.net.toLocaleString("en-US"), 11) +
              num(r.hands, 6) + num(r.vpip + "%", 8) + num(r.raise + "%", 6) +
              num(r.fold + "%", 6) + num(r.sd, 9) + num(r.sdWin + "%", 7) +
              num(r.allIn, 8) + num(r.busts, 5));
}

console.log("");
console.log("รวมตามระดับ (ได้/เสีย เฉลี่ยต่อตัว ต่อ 100 มือ):");
for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
  const g = rows.filter(r => r.lv === lv);
  if (!g.length) continue;
  const avg = g.reduce((a, r) => a + r.net, 0) / g.length / HANDS * 100;
  console.log("   " + pad(lv, 11) + num(Math.round(avg).toLocaleString("en-US"), 10) + " ชิป");
}

console.log("");
console.log("เงินมาจากไหน / หายไปไหน (รวมตามระดับ ต่อ 100 มือ):");
console.log("   " + pad("ระดับ", 11) + num("จากเปิดไพ่", 13) + num("จากไม่เปิดไพ่", 15) + num("ทิ้งไปฟรีๆ", 13) + num("ล้ม/1000มือ", 13));
for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
  const g = rows.filter(r => r.lv === lv);
  if (!g.length) continue;
  const per = (f) => Math.round(g.reduce((a, r) => a + f(r), 0) / g.length / HANDS * 100);
  const busts = (g.reduce((a, r) => a + r.busts, 0) / g.length / HANDS * 1000).toFixed(1);
  console.log("   " + pad(lv, 11) + num(per(r => r.sdNet).toLocaleString("en-US"), 13) +
              num(per(r => r.noSdNet).toLocaleString("en-US"), 15) +
              num(per(r => r.foldedAway).toLocaleString("en-US"), 13) +
              num(busts, 13));
}

console.log("");
console.log("ลงหมดหน้าตักตอนไหน (รวมตามระดับ):");
{
  const agg = {};
  for (const n of Object.keys(info)) {
    const lv = LVNAME[info[n].lv];
    const by = info[n].allInBy || {};
    agg[lv] = agg[lv] || {};
    for (const k in by) agg[lv][k] = (agg[lv][k] || 0) + by[k];
  }
  for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
    const by = agg[lv] || {};
    const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    const top = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 5)
      .map(k => k + " " + Math.round(by[k] / tot * 100) + "%");
    console.log("   " + pad(lv, 11) + " รวม " + num(tot, 6) + "  " + top.join(" · "));
  }
}

console.log("");
console.log("มือที่กองใหญ่:");
for (const n of notable.slice(0, 5)) {
  console.log("   มือ " + n.no + " · กอง " + n.pot.toLocaleString("en-US") + " · บอร์ด " + n.board);
  console.log("      เปิดไพ่: " + (n.show || "(ไม่มีใครเปิด)"));
  console.log("      ได้เงิน: " + n.win);
}
