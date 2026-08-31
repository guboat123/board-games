/* ===========================================================
   นั่งเล่นเองกับบอท — ไม่ใช่บอทเล่นกันเอง

   ทำไมต้องมีตัวนี้ทั้งที่มี watch-bots แล้ว: บอทเล่นกันเองบอกได้แค่ว่า
   "ระดับไหนเก่งกว่าระดับไหน" แต่ตอบไม่ได้เลยว่า "เล่นด้วยแล้วรู้สึกยังไง"
   ซึ่งเป็นคำถามจริงของเจ้าของ — และเป็นสิ่งเดียวที่จับได้จากการนั่งลงเล่นเอง:
     · อ่านทางมันออกไหม ถ้าออก ออกจากอะไร
     · เอาเปรียบมันได้ไหม ด้วยวิธีไหน
     · มันปรับตัวตามเราหรือเปล่า (ความจำที่ใส่ไว้ ใช้งานได้จริงไหม)

   นโยบายการเล่นของ "คน" ในไฟล์นี้เขียนแบบคนเล่นเป็นเล่นจริง:
   ตึงก่อนฟลอป · ไล่เมื่อมีของ · ทิ้งเมื่อราคาไม่คุ้ม · บลัฟบ้างเมื่อคนน้อย
   ไม่ได้แอบดูไพ่ใคร ใช้ข้อมูลเท่าที่ผู้เล่นคนหนึ่งเห็นบนจอ

   ⚠️ แก้สองอย่างที่ทำให้ผลรอบก่อนเชื่อไม่ได้:
   1) เดิมเจอบอทแค่ 8 ตัวจาก 30 ตัว — ตอนนี้หมุนตัวผู้เล่นทุก ๆ วง จนเจอครบทุกตัว
   2) เดิมบอทหมดตัวแล้วไฟล์นี้เติมชิปให้เองแบบไม่มีเงื่อนไข ทำให้เงินสดใหม่ไหลเข้าไม่จำกัด
      ตอนนี้เรียก mgr.settleBusted() ซึ่งเป็นทางเดียวกับเซิร์ฟเวอร์จริง
      (บอทตัดสินใจเองว่าจะซื้อเข้าใหม่หรือลุกให้ตัวอื่นมาแทน)
   และแบ่งเป็น "วง" ละไม่กี่ร้อยมือ ทุกคนเริ่มใหม่หมดรวมทั้งผม
   ซึ่งตรงกับที่เจ้าของเล่นจริงมากกว่าการนั่งยาวจนตักโตเป็นล้าน

   รัน:  node lan/tools/play-as-human.mjs [จำนวนมือรวม] [มือต่อวง]
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import { evaluate7, RANK_CHARS, SUIT_CHARS } from "../poker-engine.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HANDS = Number(process.argv[2] || 2000);
const PER_TABLE = Math.max(50, Number(process.argv[3] || 250));
const ME = "Boat";
const BUY_IN = 2000;
const LVNAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };

const ROSTER = {
  1: ["Milo", "Pip", "Toby", "Bruno", "Ozzy", "Rudy", "Gus", "Wally", "Bobby", "Sammy"],
  2: ["Vince", "Rocco", "Gio", "Marco", "Sonny", "Rico", "Tank", "Buddy", "Lenny", "Frankie"],
  3: ["Rex", "Duke", "Vega", "Otto", "Zed", "Kai", "Nico", "Sable", "Cole", "Ash"]
};
/* โต๊ะ 9 ที่ หักที่ผมไป 1 เหลือ 8 ตัว แบ่ง 3/3/2 แล้วหมุนทุกวง */
const PER_LEVEL = { 1: 3, 2: 3, 3: 2 };

/* ---------- เครื่องมือประเมินไพ่ของ "คน" (เท่าที่คนเห็นได้) ---------- */
const toNum = (c) => RANK_CHARS.indexOf(c.slice(0, -1)) * 4 + SUIT_CHARS.indexOf(c.slice(-1));
const CAT = [0.16, 0.45, 0.62, 0.75, 0.84, 0.90, 0.95, 0.99, 1.0];

function preStrength(cards) {
  const a = RANK_CHARS.indexOf(cards[0].slice(0, -1));
  const b = RANK_CHARS.indexOf(cards[1].slice(0, -1));
  const suited = cards[0].slice(-1) === cards[1].slice(-1);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (a === b) return 0.50 + (hi / 12) * 0.36;
  let v = (hi * 0.62 + lo * 0.38) / 12 * 0.6;
  if (suited) v += 0.08;
  if (hi - lo === 1) v += 0.05;
  if (hi - lo > 5) v -= 0.09;
  return Math.max(0, Math.min(1, v));
}

function madeStrength(hole, board) {
  const bs = board.map(toNum);
  const cs = hole.map(toNum).concat(bs);
  if (cs.length < 5) return 0.4;
  const mineS = evaluate7(cs);
  let v = CAT[mineS[0]] || 0.5;
  if (bs.length >= 5) {
    const ob = evaluate7(bs);
    if (ob[0] === mineS[0] && ob[1] === mineS[1]) v = 0.20;   /* เล่นบอร์ดล้วน */
  }
  return v;
}

function outs(hole, board) {
  if (board.length < 3 || board.length > 4) return 0;
  const hs = hole.map(toNum), bsx = board.map(toNum), all = hs.concat(bsx);
  let o = 0;
  const suit = [0, 0, 0, 0];
  all.forEach(c => suit[c & 3]++);
  for (let s2 = 0; s2 < 4; s2++) if (suit[s2] === 4 && hs.some(c => (c & 3) === s2)) o += 9;
  const have = new Array(13).fill(false);
  all.forEach(c => { have[c >> 2] = true; });
  const hr = hs.map(c => c >> 2);
  let so = 0;
  for (let r = 0; r < 13; r++) {
    if (have[r]) continue;
    const w = have.slice(); w[r] = true;
    for (let s3 = 0; s3 <= 8; s3++) {
      let run = true;
      for (let k = 0; k < 5; k++) if (!w[s3 + k]) { run = false; break; }
      if (run && hr.some(x => x >= s3 && x <= s3 + 4)) { so += 4; break; }
    }
  }
  return Math.min(15, o + so);
}

/* ---------- สิ่งที่ "คน" จำได้เกี่ยวกับบอทแต่ละตัว ----------
   ⚠️ ความจำนี้ข้ามวง เหมือนคนที่เคยเล่นกับคนกลุ่มเดิมมาหลายคืน */
const notes = {};
function noteOf(n, lv) {
  const r = notes[n] || (notes[n] = {
    lv: lv || 0, vpip: 0, hands: 0, raises: 0, acts: 0, showed: 0, showedWeak: 0,
    tookFromMe: 0, gaveToMe: 0, overMe: 0, myBets: 0
  });
  if (lv) r.lv = lv;
  return r;
}

/* ---------- ผลรวมทั้งเซสชัน ---------- */
let handsPlayed = 0, myVpip = 0, myShowdowns = 0, myShowdownWins = 0;
let myNetTotal = 0, myBoughtTotal = 0;
let biggestWin = 0, biggestLoss = 0;
const bigHands = [];
const tableResults = [];
const offset = { 1: 0, 2: 0, 3: 0 };
const t0 = Date.now();

/* ตัวแปรที่ myMove ต้องใช้ ถูกตั้งใหม่ทุกวง */
let table, st, MY;

/* ---------- นโยบายการเล่นของผม ---------- */
function myMove() {
  const v = table.viewFor(MY);
  const s = v.seats[MY];
  const pot = typeof v.potForBet === "number" ? v.potForBet : v.pot;
  const toCall = v.toCall;
  const price = toCall > 0 ? toCall / (pot + toCall) : 0;
  const pre = v.phase === "preflop";

  let live = 0;
  v.seats.forEach((x, i) => { if (x && x.inHand && !x.folded && i !== MY) live++; });

  const base = pre ? preStrength(s.cards) : madeStrength(s.cards, v.board);
  const drawEq = pre ? 0 : Math.min(0.5, outs(s.cards, v.board) * (v.board.length === 3 ? 0.04 : 0.02));
  const eq = Math.min(1, base + drawEq);

  /* ใครกำลังดันอยู่ และเรารู้อะไรเกี่ยวกับเขา */
  let pusher = null;
  v.seats.forEach((x, i) => {
    if (!x || i === MY || x.folded || !x.inHand) return;
    if (x.bet === v.currentBet && (x.lastKind === "raise" || x.lastKind === "bet")) pusher = x.name;
  });
  const n = pusher ? noteOf(pusher) : null;
  /* คนที่ลงเล่นแทบทุกมือ = ท่าดันของเขาเชื่อได้น้อยลง */
  const loose = n && n.hands >= 20 ? Math.max(0, n.vpip / n.hands - 0.45) : 0;
  const believe = Math.max(0, 0.28 - loose * 0.5);

  /* ---- ก่อนฟลอป: เล่นตึง เล่นเฉพาะมือที่คุ้ม ---- */
  if (pre) {
    const need = 0.44 + Math.max(0, live - 3) * 0.012;
    if (base >= 0.72 && toCall <= s.stack * 0.25) {
      const want = v.currentBet + v.minRaise + Math.round(pot * 0.8);
      return { type: "act", action: "raise",
               amount: Math.max(v.currentBet + v.minRaise, Math.min(s.bet + s.stack, want)) };
    }
    if (base >= need) return { type: "act", action: toCall > 0 ? "call" : "check" };
    return { type: "act", action: toCall > 0 ? "fold" : "check" };
  }

  /* ---- หลังฟลอป ---- */
  /* เอาทั้งตักลงต้องมั่นใจจริง */
  if (toCall >= s.stack * 0.7 && eq < 0.62 && price > 0.25) return { type: "act", action: "fold" };

  if (toCall === 0) {
    /* มือดี = เก็บเงิน · มือลุ้นกับคนน้อย = ยิงบ้าง · ที่เหลือเคาะผ่าน */
    if (eq >= 0.62) {
      const want = v.currentBet + v.minRaise + Math.round(pot * (0.55 + Math.random() * 0.25));
      return { type: "act", action: "raise",
               amount: Math.max(v.currentBet + v.minRaise, Math.min(s.bet + s.stack, want)) };
    }
    if (live <= 2 && drawEq >= 0.25 && Math.random() < 0.4) {
      const want = v.currentBet + v.minRaise + Math.round(pot * 0.55);
      return { type: "act", action: "raise",
               amount: Math.max(v.currentBet + v.minRaise, Math.min(s.bet + s.stack, want)) };
    }
    return { type: "act", action: "check" };
  }

  /* เจอเดิมพัน: เทียบราคากับมือ แล้วเผื่อว่าคนดันคนนี้เชื่อได้แค่ไหน */
  if (eq >= 0.80 && s.stack > toCall) {
    const want = v.currentBet + v.minRaise + Math.round(pot * 0.7);
    return { type: "act", action: "raise",
             amount: Math.max(v.currentBet + v.minRaise, Math.min(s.bet + s.stack, want)) };
  }
  if (eq >= price + believe) return { type: "act", action: "call" };
  return { type: "act", action: "fold" };
}

/* ---------- เล่นทีละวง ---------- */
while (handsPlayed < HANDS) {
  const hands = Math.min(PER_TABLE, HANDS - handsPlayed);

  /* เงินบอทของจริงอยู่ใน lan/data ห้ามแตะ ความจำก็เหมือนกัน */
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "play-"));
  bank._setDir(tmpDir);
  mind._setDir(tmpDir);
  mind.setAutoSave(false);   /* ความจำทำงานเต็มที่ แค่ไม่ต้องเขียนไฟล์ทุกมือ */

  table = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 200, turnSeconds: 0 });
  const mgr = createBotManager({ table: table }, () => {});
  const me = table.sit(ME, null, BUY_IN, "human-boat");
  table._state.seats[me.seatId].connected = true;
  MY = me.seatId;
  st = table._state;

  let myBought = BUY_IN;
  const seatedNow = [];
  for (const lv of [1, 2, 3]) {
    for (let k = 0; k < PER_LEVEL[lv]; k++) {
      const name = ROSTER[lv][(offset[lv] + k) % ROSTER[lv].length];
      mgr._addNamed(name, lv);
      noteOf(name, lv);
      seatedNow.push(name);
    }
    offset[lv] = (offset[lv] + PER_LEVEL[lv]) % ROSTER[lv].length;
  }

  for (let h = 0; h < hands; h++) {
    if (st.seats[MY].stack <= 0) {
      table.action(MY, { type: "rebuy", amount: BUY_IN });
      myBought += BUY_IN;
    }
    const r = table.action(MY, { type: "start" });
    if (r && r.error) break;
    handsPlayed++;

    let vpipCounted = false;
    let guard = 0;
    /* ⚠️ จดว่าใครได้รับไพ่บ้าง "ตอนนี้" ไม่ใช่ตอนจบมือ
       พอจบมือแล้ว inHand เป็น false และ committed ถูกล้าง ค่าที่อ่านได้จึงเป็น 0 เสมอ */
    const dealtNow = new Set();
    for (const b of st.seats) if (b && b.isBot && b.inHand) dealtNow.add(b.name);
    const putIn = new Set();
    let iBetThisRound = false;
    let lastPhase = st.phase;

    while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 300) {
      /* เปิดไพ่ใบใหม่ = เริ่มรอบเดิมพันใหม่ ล้างสถานะ "ผมเป็นคนดัน" */
      if (st.phase !== lastPhase) { lastPhase = st.phase; iBetThisRound = false; }
      const cur = st.current;
      if (cur < 0) break;
      if (cur === MY) {
        const mv = myMove();
        if (st.phase === "preflop" && !vpipCounted &&
            (mv.action === "call" || mv.action === "raise")) { myVpip++; vpipCounted = true; }
        if (mv.action === "raise") {
          iBetThisRound = true;
          st.seats.forEach(x => { if (x && x.isBot && x.inHand) noteOf(x.name).myBets++; });
        }
        table.action(MY, mv);
      } else {
        const b = st.seats[cur];
        if (!mgr._decideNow(cur)) {
          const v2 = table.viewFor(cur);
          table.action(cur, { type: "act", action: v2.toCall > 0 ? "call" : "check" });
        }
  /* ⚠️ ต้องเรียกทุกครั้งที่มีคนลงมือ ไม่ใช่แค่ตอนจบมือ
     นี่คือจุดที่บอทเห็นว่าใครทำอะไร แล้วเก็บเข้าความจำ (ตามคนบ่อยไหม · หมอบบ่อยไหม)
     เซิร์ฟเวอร์จริงเรียกผ่าน poke() ทุกครั้งที่สถานะโต๊ะเปลี่ยน */
        mgr.senseTable();
        if (b && b.isBot) {
          const nn = noteOf(b.name, b.botLevel);
          nn.acts++;
          if (b.lastKind === "raise" || b.lastKind === "bet") nn.raises++;
          /* ⚠️ คำถามที่สำคัญที่สุดจากที่นั่งของคนเล่น: เขากล้าไล่ทับเราไหม
             ถ้าไม่มีใครไล่ทับเราเลย เดิมพันของเราได้เงินเต็มทุกครั้งที่มีของ
             และไม่เคยถูกไล่ออกจากมือตอนไม่มี = เอาเปรียบได้ไม่มีที่สิ้นสุด */
          if (iBetThisRound && b.lastKind === "raise") nn.overMe++;
          /* ลงเงินก่อนฟลอป = ยอมเล่นมือนี้ (ไม่นับบอดที่ถูกบังคับ) */
          if (st.phase === "preflop" && (b.lastKind === "call" || b.lastKind === "raise")) {
            putIn.add(b.name);
          }
        }
      }
    }

    /* จดสิ่งที่ผมสังเกตเห็นจากมือนี้ */
    dealtNow.forEach(n => { noteOf(n).hands++; });
    putIn.forEach(n => { noteOf(n).vpip++; });
    const res = st.lastResult;
    if (res) {
      const won = {}; (res.payouts || []).forEach(x => { won[x.seatId] = x.amount; });
      const put = {}; (res.puts || []).forEach(x => { put[x.seatId] = x.amount; });
      (res.reveal || []).forEach(x => {
        if (x.name === ME) return;
        const nn = noteOf(x.name);
        nn.showed++;
        if (x.cards && x.cards.length === 2 && preStrength(x.cards) < 0.35) nn.showedWeak++;
      });
      if ((res.reveal || []).some(x => x.name === ME)) {
        myShowdowns++;
        if ((won[MY] || 0) > 0) myShowdownWins++;
      }
      const myNet = (won[MY] || 0) - (put[MY] || 0);
      if (myNet > biggestWin) biggestWin = myNet;
      if (myNet < biggestLoss) biggestLoss = myNet;
      /* ใครกินเงินผม / ผมกินเงินใคร — คิดจากยอดที่เขาลงกับที่เขาได้คืนจริง */
      if (myNet !== 0) {
        for (const s2 of st.seats) {
          if (!s2 || !s2.isBot) continue;
          const bn = (won[s2.seatId] || 0) - (put[s2.seatId] || 0);
          if (myNet < 0 && bn > 0) noteOf(s2.name).tookFromMe += Math.min(-myNet, bn);
          if (myNet > 0 && bn < 0) noteOf(s2.name).gaveToMe += Math.min(myNet, -bn);
        }
      }
      if ((res.pot || 0) > 4000 && bigHands.length < 6) {
        bigHands.push({
          no: st.handNo, pot: res.pot, board: (res.board || []).join(" "),
          show: (res.reveal || []).map(x => x.name + " " + x.hand).join(" · "),
          me: myNet
        });
      }
    }

    mgr.senseTable();   /* จบมือ = จดความจำต่อคู่แข่ง */

    /* หมดตัวแล้วยังไงต่อ: ใช้ทางเดียวกับเกมจริง */
    mgr.settleBusted();
    if (st.seats.filter(s2 => s2 && s2.isBot).length < 3) break;
  }

  const net = st.seats[MY].stack - myBought;
  myNetTotal += net;
  myBoughtTotal += myBought;
  tableResults.push({ net, bought: myBought, who: seatedNow });
  mgr.stop();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ลบไม่ได้ก็ไม่เป็นไร */ }
}

/* ---------- รายงาน ---------- */
const pad = (v, w) => String(v).padEnd(w);
const num = (v, w) => String(v).padStart(w);
const BB = 20;

console.log("");
console.log("ผมนั่งเล่นเอง " + handsPlayed.toLocaleString("en-US") + " มือ · " +
            tableResults.length + " วง · เจอบอท " + Object.keys(notes).length + " ตัว · " +
            "ใช้เวลา " + Math.round((Date.now() - t0) / 1000) + " วิ");
console.log("=".repeat(99));
console.log("ผลของผม: " + (myNetTotal >= 0 ? "+" : "") + myNetTotal.toLocaleString("en-US") +
            " ชิป  (ซื้อเข้ารวม " + myBoughtTotal.toLocaleString("en-US") + ")");
console.log("   = " + (myNetTotal / handsPlayed / BB * 100).toFixed(0) +
            " บิ๊กบลายด์ต่อ 100 มือ  (คนเล่นเก่งจริงในวงอ่อน ๆ อยู่ราว 10-30)");
console.log("   ลงเล่น " + Math.round(myVpip / handsPlayed * 100) + "%" +
            " · เปิดไพ่ " + myShowdowns + " ครั้ง ชนะ " +
            (myShowdowns ? Math.round(myShowdownWins / myShowdowns * 100) : 0) + "%" +
            " · ได้มากสุด +" + biggestWin.toLocaleString("en-US") +
            " · เสียมากสุด " + biggestLoss.toLocaleString("en-US"));
{
  const wins = tableResults.filter(x => x.net > 0).length;
  console.log("   วงที่ได้ " + wins + " / " + tableResults.length +
              " · ดีสุด +" + Math.max(...tableResults.map(x => x.net)).toLocaleString("en-US") +
              " · แย่สุด " + Math.min(...tableResults.map(x => x.net)).toLocaleString("en-US"));
}

console.log("");
console.log("สิ่งที่ผมสังเกตเห็นจากการนั่งเล่นด้วย:");
console.log(pad("บอท", 10) + pad("ระดับ", 11) + num("ลงเล่น", 8) + num("ไล่", 6) +
            num("ไล่ทับผม", 11) + num("มือที่เจอ", 11) + num("ไพ่ขยะตอนเปิด", 15) +
            num("กินผมไป", 11) + num("ผมกินไป", 11));
console.log("-".repeat(99));
const list = Object.keys(notes).map(n => {
  const nn = notes[n];
  return {
    n, lv: LVNAME[nn.lv] || "?",
    vpip: nn.hands ? Math.round(nn.vpip / nn.hands * 100) : 0,
    raise: nn.acts ? Math.round(nn.raises / nn.acts * 100) : 0,
    over: nn.myBets ? Math.round(nn.overMe / nn.myBets * 100) : 0,
    hands: nn.hands,
    weak: nn.showed ? Math.round(nn.showedWeak / nn.showed * 100) : 0,
    took: nn.tookFromMe, gave: nn.gaveToMe
  };
}).sort((a, b) => (b.took - b.gave) - (a.took - a.gave));
for (const x of list) {
  console.log(pad(x.n, 10) + pad(x.lv, 11) + num(x.vpip + "%", 8) + num(x.raise + "%", 6) +
              num(x.over + "%", 11) + num(x.hands.toLocaleString("en-US"), 11) +
              num(x.weak + "%", 15) + num(x.took.toLocaleString("en-US"), 11) +
              num(x.gave.toLocaleString("en-US"), 11));
}

console.log("");
console.log("มือที่กองใหญ่ที่ผมอยู่ด้วย:");
for (const b of bigHands) {
  console.log("   มือ " + b.no + " · กอง " + b.pot.toLocaleString("en-US") + " · บอร์ด " + b.board);
  console.log("      " + (b.show || "(ไม่มีใครเปิด)") + "   ผม " + (b.me >= 0 ? "+" : "") + b.me.toLocaleString("en-US"));
}
