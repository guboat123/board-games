/* ===========================================================
   ดูพฤติกรรมบอท — เปิดโต๊ะให้บอทเล่นกันเองแบบเร่งความเร็ว แล้วรายงานว่ามันทำอะไรบ้าง

   ใช้โค้ดบอทตัวเดียวกับที่เซิร์ฟเวอร์จริงใช้ ต่างแค่ข้ามเวลาคิด
   (ปกติคิด 0.7-3.4 วินาทีต่อท่า สิบล้านมือจะใช้เวลาเป็นปี)

   ⚠️ สองอย่างที่เคยทำให้ตัวเลขจากไฟล์นี้เชื่อไม่ได้ และแก้แล้ว:

   1) เดิมวัดแค่ 8 ตัวจาก 30 ตัวในบัญชีรายชื่อ อีก 22 ตัวไม่เคยถูกวัดเลย
      ตอนนี้หมุนตัวผู้เล่นทุกรอบ จนครบทุกตัวและได้เวลาเล่นเท่า ๆ กัน

   2) เดิมบอทหมดตัวแล้วไฟล์นี้ "เติมชิปให้เอง" แบบไม่มีเงื่อนไข
      ซึ่งเป็นคนละเกมกับที่คนเล่นจริงเจอ — ในเกมจริงบอทตัดสินใจเองว่าจะซื้อเข้าใหม่หรือลุก
      (ดู wantsRebuy) กระเป๋าติดลบมากก็ไม่ค่อยกลับมา แล้วมีตัวใหม่มานั่งแทน
      พอเติมให้ฟรีตลอด เงินสดใหม่จึงไหลเข้าโต๊ะไม่จำกัด และคนที่เล่นตึงที่สุดเก็บไปหมด
      ตอนนี้เรียก mgr.settleBusted() ซึ่งเป็นฟังก์ชันเดียวกับที่เซิร์ฟเวอร์จริงเรียก

   หนึ่ง "รอบ" = หนึ่งวงเล่น เปิดโต๊ะใหม่ กระเป๋าเงินกับความจำเริ่มใหม่
   (เหมือนคนละคืนกัน) ซึ่งตรงกับที่เจ้าของเล่นจริงมากกว่าการไล่ยาวรวดเดียว

   รัน:  node lan/tools/watch-bots.mjs [จำนวนมือรวม] [จำนวนมือต่อรอบ] [ตำแหน่งเริ่มหมุน] [ไฟล์ json]
   สิบล้านมือใช้เวลาราวสองชั่วโมงถ้ารันตัวเดียว จึงแบ่งรันหลายตัวพร้อมกันได้
   โดยให้แต่ละตัวเริ่มหมุนคนละตำแหน่ง แล้วเขียนผลดิบเป็น json ไปรวมกันทีหลัง
   (ดู merge-watch.mjs)
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOTAL = Number(process.argv[2] || 100000);
const PER_ROUND = Math.max(500, Number(process.argv[3] || 50000));
const START_AT = Number(process.argv[4] || 0);
const JSON_OUT = process.argv[5] || "";
const QUIET = !!JSON_OUT;
const LVNAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };

/* บัญชีรายชื่อเต็ม ต้องตรงกับ ROSTER ใน bots.mjs */
const ROSTER = {
  1: ["Milo", "Pip", "Toby", "Bruno", "Ozzy", "Rudy", "Gus", "Wally", "Bobby", "Sammy"],
  2: ["Vince", "Rocco", "Gio", "Marco", "Sonny", "Rico", "Tank", "Buddy", "Lenny", "Frankie"],
  3: ["Rex", "Duke", "Vega", "Otto", "Zed", "Kai", "Nico", "Sable", "Cole", "Ash"]
};
/* โต๊ะมี 9 ที่ หักที่คนดูไป 1 เหลือ 8 — แบ่ง 3/3/2 แล้วหมุนไปเรื่อย ๆ ทุกรอบ
   ระดับละ 10 ชื่อ หมุนทีละกลุ่มจึงวนครบและได้เวลาเล่นใกล้เคียงกันทุกตัว */
const PER_LEVEL = { 1: 3, 2: 3, 3: 2 };

const info = {};
function rec(name, lv) {
  return info[name] || (info[name] = {
    lv: lv, hands: 0, net: 0, vpip: 0, raises: 0, calls: 0, checks: 0, folds: 0,
    showdowns: 0, showdownWins: 0, allIn: 0, busts: 0, quits: 0, rounds: 0,
    sdNet: 0, noSdNet: 0, foldedAway: 0, biggestWin: 0, biggestLoss: 0, allInBy: {}
  });
}

const notable = [];
let stuckHands = 0, handsDone = 0, roundNo = 0;
const offset = { 1: START_AT % 10, 2: (START_AT * 3) % 10, 3: (START_AT * 7) % 10 };
const t0 = Date.now();

while (handsDone < TOTAL) {
  roundNo++;
  const hands = Math.min(PER_ROUND, TOTAL - handsDone);

  /* เงินบอทของจริงอยู่ใน lan/data ห้ามแตะ ความจำก็เหมือนกัน — ใช้โฟลเดอร์ชั่วคราวต่อรอบ */
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-"));
  bank._setDir(tmpDir);
  mind._setDir(tmpDir);
  /* ความจำยังทำงานเต็มที่ แค่ไม่ต้องเขียนไฟล์ทุกมือ (สิบล้านมือ = สิบล้านครั้ง) */
  mind.setAutoSave(false);

  const table = createTable("WATCH");
  const mgr = createBotManager({ table: table }, () => {});
  /* คนดูหนึ่งคนที่พักมือตลอด — ห้องต้องมีคนต่ออยู่ ไม่งั้นถูกเก็บ */
  table.sit("คนดู", null, 1000000, "watcher");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;

  for (const lv of [1, 2, 3]) {
    for (let k = 0; k < PER_LEVEL[lv]; k++) {
      const name = ROSTER[lv][(offset[lv] + k) % ROSTER[lv].length];
      mgr._addNamed(name, lv);
      rec(name, lv).rounds++;
    }
    offset[lv] = (offset[lv] + PER_LEVEL[lv]) % ROSTER[lv].length;
  }

  const st = table._state;

  for (let h = 0; h < hands; h++) {
    const r = table.action(0, { type: "start" });
    if (r && r.error) break;
    handsDone++;

    const dealt = new Set();
    for (const s of st.seats) if (s && s.isBot && s.inHand) dealt.add(s.name);
    dealt.forEach(n => { if (info[n]) info[n].hands++; });

    let guard = 0;
    const seenAct = {};
    for (const s2 of st.seats) if (s2 && s2.isBot && info[s2.name]) info[s2.name]._wasAllIn = false;

    while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 260) {
      const cur = st.current;
      if (cur < 0) break;
      const who = st.seats[cur];
      const wasPhase = st.phase;
      if (!mgr._decideNow(cur)) {
        const v = table.viewFor(cur);
        table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
      }
  /* ⚠️ ต้องเรียกทุกครั้งที่มีคนลงมือ ไม่ใช่แค่ตอนจบมือ
     นี่คือจุดที่บอทเห็นว่าใครทำอะไร แล้วเก็บเข้าความจำ (ตามคนบ่อยไหม · หมอบบ่อยไหม)
     เซิร์ฟเวอร์จริงเรียกผ่าน poke() ทุกครั้งที่สถานะโต๊ะเปลี่ยน */
      mgr.senseTable();
      if (who && who.isBot && info[who.name]) {
        const k = who.lastKind;
        const i = info[who.name];
        /* ลงหมดหน้าตักตอนไหน และเป็นการไล่หรือการตาม */
        if (who.allIn && !i._wasAllIn) {
          i._wasAllIn = true;
          const key = wasPhase + "|" + (k === "call" ? "ตาม" : (k === "raise" ? "ไล่" : k));
          i.allInBy[key] = (i.allInBy[key] || 0) + 1;
        }
        if (k === "raise" || k === "bet") i.raises++;
        else if (k === "call") i.calls++;
        else if (k === "check") i.checks++;
        else if (k === "fold") i.folds++;
        if (wasPhase === "preflop" && (k === "call" || k === "raise") && !seenAct[who.name]) {
          seenAct[who.name] = true;
          i.vpip++;
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
        if (!s || !s.isBot || !info[s.name]) continue;
        const i = info[s.name];
        const net = (won[s.seatId] || 0) - (put[s.seatId] || 0);
        /* ⚠️ บวกทีละมือ ไม่ใช่วัดจากยอดปลายทางลบยอดตั้งต้น
           เพราะบอทลุกกลางรอบแล้วมีตัวใหม่มานั่งแทนได้ ยอดปลายทางจึงเป็นของคนละตัว */
        i.net += net;
        if (net > i.biggestWin) i.biggestWin = net;
        if (net < i.biggestLoss) i.biggestLoss = net;
        if (s.allIn) i.allIn++;
        if (showed.has(s.name)) {
          i.showdowns++;
          if ((won[s.seatId] || 0) > 0) i.showdownWins++;
          i.sdNet += net;
        } else {
          /* ไม่ได้เปิดไพ่ = หมอบไปเอง หรือชนะเพราะคนอื่นหมอบหมด */
          i.noSdNet += net;
          if (net < 0) i.foldedAway += -net;
        }
      }

      const pot = res.pot || 0;
      if (pot > 3000 && notable.length < 6) {
        notable.push({
          no: st.handNo, pot: pot, board: (res.board || []).join(" "),
          show: (res.reveal || []).map(x => x.name + " " + x.hand).join(" · "),
          win: (res.payouts || []).map(x => x.name + " +" + x.amount).join(", ")
        });
      }
    }

    mgr.senseTable();   /* จบมือ = จดความจำต่อคู่แข่ง (ใครกินใคร ใครโดนจับได้ว่าบลัฟ) */

    /* ---------- หมดตัวแล้วยังไงต่อ: ใช้ทางเดียวกับเกมจริงเป๊ะ ---------- */
    const beforeNames = new Set();
    for (const s of st.seats) {
      if (!s || !s.isBot) continue;
      beforeNames.add(s.name);
      if (s.stack <= 0) rec(s.name, s.botLevel).busts++;
    }
    mgr.settleBusted();
    for (const n of beforeNames) {
      if (!st.seats.some(s => s && s.isBot && s.name === n)) info[n].quits++;
    }
    /* ตัวใหม่ที่เข้ามาแทน ต้องเริ่มนับด้วย */
    for (const s of st.seats) if (s && s.isBot && !info[s.name]) rec(s.name, s.botLevel).rounds++;

    /* โต๊ะบางลงมากจนวัดอะไรไม่ได้ = จบรอบนี้ */
    if (st.seats.filter(s => s && s.isBot).length < 4) break;
  }
  mgr.stop();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ลบไม่ได้ก็ไม่เป็นไร */ }
}

/* ---------- รายงาน ---------- */
const pad = (v, w) => String(v).padEnd(w);
const num = (v, w) => String(v).padStart(w);
const per100 = (v, h) => h ? Math.round(v / h * 100) : 0;

const rows = Object.keys(info).map(n => {
  const i = info[n];
  const acts = i.raises + i.calls + i.checks + i.folds || 1;
  return {
    name: n, lv: LVNAME[i.lv], hands: i.hands,
    net100: per100(i.net, i.hands), net: i.net,
    vpip: i.hands ? Math.round(i.vpip / i.hands * 100) : 0,
    raise: Math.round(i.raises / acts * 100),
    fold: Math.round(i.folds / acts * 100),
    sd: i.hands ? Math.round(i.showdowns / i.hands * 100) : 0,
    sdWin: i.showdowns ? Math.round(i.showdownWins / i.showdowns * 100) : 0,
    sdNet: i.sdNet, noSdNet: i.noSdNet, foldedAway: i.foldedAway,
    busts1k: i.hands ? +(i.busts / i.hands * 1000).toFixed(1) : 0,
    quits: i.quits
  };
}).sort((a, b) => b.net100 - a.net100);

if (JSON_OUT) {
  const dump = { handsDone, roundNo, stuckHands, seconds: Math.round((Date.now() - t0) / 1000), info };
  for (const n in dump.info) delete dump.info[n]._wasAllIn;
  fs.writeFileSync(JSON_OUT, JSON.stringify(dump), "utf8");
}
if (QUIET) process.exit(0);

console.log("");
console.log("บอทเล่นกันเอง " + handsDone.toLocaleString("en-US") + " มือ · " + roundNo + " รอบ · " +
            Object.keys(info).length + " ตัว · ใช้เวลา " + Math.round((Date.now() - t0) / 1000) + " วิ" +
            (stuckHands ? "  (ค้าง " + stuckHands + " มือ)" : ""));
console.log("=".repeat(104));
console.log(pad("บอท", 10) + pad("ระดับ", 11) + num("ได้/เสีย ต่อ100มือ", 19) + num("มือที่เล่น", 12) +
            num("ลงเล่น", 8) + num("ไล่", 6) + num("ทิ้ง", 6) + num("เปิดไพ่", 9) +
            num("ชนะ%", 7) + num("ล้ม/1000", 10) + num("ลุก", 6));
console.log("-".repeat(104));
for (const r of rows) {
  console.log(pad(r.name, 10) + pad(r.lv, 11) + num(r.net100.toLocaleString("en-US"), 19) +
              num(r.hands.toLocaleString("en-US"), 12) + num(r.vpip + "%", 8) + num(r.raise + "%", 6) +
              num(r.fold + "%", 6) + num(r.sd + "%", 9) + num(r.sdWin + "%", 7) +
              num(r.busts1k, 10) + num(r.quits, 6));
}

console.log("");
console.log("รวมตามระดับ (ถ่วงตามจำนวนมือที่เล่นจริง):");
console.log("   " + pad("ระดับ", 11) + num("ได้/เสีย ต่อ100มือ", 19) + num("จากเปิดไพ่", 13) +
            num("จากไม่เปิดไพ่", 15) + num("ทิ้งไปฟรีๆ", 13) + num("ล้ม/1000มือ", 13));
for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
  const g = rows.filter(r => r.lv === lv);
  if (!g.length) continue;
  const H = g.reduce((a, r) => a + r.hands, 0);
  const sum = (f) => g.reduce((a, r) => a + f(r), 0);
  const busts = (sum(r => r.busts1k * r.hands / 1000) / (H || 1) * 1000).toFixed(1);
  console.log("   " + pad(lv, 11) + num(per100(sum(r => r.net), H).toLocaleString("en-US"), 19) +
              num(per100(sum(r => r.sdNet), H).toLocaleString("en-US"), 13) +
              num(per100(sum(r => r.noSdNet), H).toLocaleString("en-US"), 15) +
              num(per100(sum(r => r.foldedAway), H).toLocaleString("en-US"), 13) +
              num(busts, 13));
}

console.log("");
console.log("ลงหมดหน้าตักตอนไหน (รวมตามระดับ):");
{
  const agg = {};
  for (const n of Object.keys(info)) {
    const lv = LVNAME[info[n].lv];
    agg[lv] = agg[lv] || {};
    for (const k in info[n].allInBy) agg[lv][k] = (agg[lv][k] || 0) + info[n].allInBy[k];
  }
  for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
    const by = agg[lv] || {};
    const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    const top = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 5)
      .map(k => k + " " + Math.round(by[k] / tot * 100) + "%");
    console.log("   " + pad(lv, 11) + " รวม " + num(tot.toLocaleString("en-US"), 9) + "  " + top.join(" · "));
  }
}

console.log("");
console.log("มือที่กองใหญ่ (ตัวอย่าง):");
for (const x of notable) {
  console.log("   มือ " + x.no + " · กอง " + x.pot.toLocaleString("en-US") + " · บอร์ด " + x.board);
  if (x.show) console.log("      เปิดไพ่: " + x.show);
  console.log("      ได้เงิน: " + x.win);
}
