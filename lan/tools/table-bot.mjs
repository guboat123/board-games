/* ===========================================================
   บอทซ้อมโต๊ะ — เล่นเหมือนคนจริง ใช้ทดสอบตอนไม่มีคนมาเล่นด้วย

   ประเมินไพ่ด้วย evaluate7 ตัวจริงของเกม เล่นตึงตอนมือไม่ดี
   ไล่ตอนมือดี บลัฟเป็นบางครั้ง และคิดนานสั้นไม่เท่ากันเหมือนคน
   แต่ละตัวมีนิสัยต่างกันตามเลขที่ส่งเข้ามา (tight / loose / aggro / calling / normal)

   วิธีใช้ — เปิดเซิร์ฟเวอร์ก่อน แล้วสั่งทีละตัว:
     node lan/tools/table-bot.mjs <ห้อง> <ชื่อ> <เลข 0-4>
   ตัวอย่างเปิดโต๊ะ 5 คน:
     for i in 0 1 2 3 4; do node lan/tools/table-bot.mjs TABLE5 "Bot$i" $i & done
   ประวัติการเล่นดูได้จากแท็บ "รอบนี้" ในเกม หรือ lan/data/hands.jsonl
   =========================================================== */
import { evaluate7, RANK_CHARS, SUIT_CHARS } from "../poker-engine.mjs";

const ROOM = process.argv[2] || "HUMAN";
const NAME = process.argv[3] || "บอท";
const SEED = Number(process.argv[4] || 1);
const STYLE = ["tight", "loose", "aggro", "calling", "normal"][SEED % 5];

function toNum(code) {
  const r = RANK_CHARS.indexOf(code.slice(0, -1));
  const s = SUIT_CHARS.indexOf(code.slice(-1));
  return r < 0 || s < 0 ? -1 : r * 4 + s;
}

/* ความแข็งของไพ่สองใบก่อนเปิดไพ่กลาง 0..1 คร่าวๆ ตามหลักที่คนเล่นใช้กัน */
function preflopStrength(cards) {
  const a = RANK_CHARS.indexOf(cards[0].slice(0, -1));
  const b = RANK_CHARS.indexOf(cards[1].slice(0, -1));
  const suited = cards[0].slice(-1) === cards[1].slice(-1);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (a === b) return 0.55 + hi / 24;                 /* คู่ */
  let v = (hi * 0.6 + lo * 0.4) / 12 * 0.62;
  if (suited) v += 0.08;
  if (hi - lo === 1) v += 0.05;                        /* ต่อกัน */
  if (hi - lo > 5) v -= 0.08;
  return Math.max(0, Math.min(1, v));
}

function postflopStrength(hole, board) {
  const cs = hole.concat(board).map(toNum).filter(x => x >= 0);
  if (cs.length < 5) return 0.4;
  const cat = evaluate7(cs)[0];          /* 0 ไฮการ์ด .. 8 สเตรทฟลัช */
  return Math.min(1, 0.22 + cat * 0.11);
}

const TASTE = {
  tight:   { call: 0.52, raise: 0.72, bluff: 0.03 },
  loose:   { call: 0.30, raise: 0.66, bluff: 0.12 },
  aggro:   { call: 0.38, raise: 0.55, bluff: 0.20 },
  calling: { call: 0.28, raise: 0.85, bluff: 0.02 },
  normal:  { call: 0.42, raise: 0.66, bluff: 0.07 }
}[STYLE];

const ws = new WebSocket("ws://localhost:8080");
let seat = -1;

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "join", room: ROOM, name: NAME, buyIn: 2000, token: "human-" + SEED }));
});

ws.addEventListener("message", ev => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.type === "joined") { seat = m.seatId; return; }
  if (m.type !== "state") return;
  const v = m.state;

  if ((v.phase === "waiting" || v.phase === "showdown") && seat === 0) {
    setTimeout(() => ws.send(JSON.stringify({ type: "start" })), 1200);
    return;
  }
  if (v.current !== seat) return;

  const me = v.seats[seat];
  if (!me || !me.cards.length || me.cards[0] === "??") return;

  const pre = v.phase === "preflop";
  const strength = pre ? preflopStrength(me.cards) : postflopStrength(me.cards, v.board);
  const bluff = Math.random() < TASTE.bluff;
  const score = strength + (bluff ? 0.3 : 0) + (Math.random() - 0.5) * 0.12;

  /* คิดนานตามความยากของการตัดสินใจ เหมือนคนจริง */
  const close = Math.abs(score - TASTE.call) < 0.12;
  const delay = 900 + Math.random() * 1600 + (close ? 1800 : 0);

  setTimeout(() => {
    let msg;
    if (score >= TASTE.raise && me.stack > v.currentBet * 2) {
      const target = Math.min(me.bet + me.stack,
        v.currentBet + v.minRaise + Math.round(v.potForBet * (0.3 + Math.random() * 0.5)));
      msg = { type: "act", action: "raise", amount: target };
    } else if (v.toCall === 0) {
      msg = { type: "act", action: "check" };
    } else if (score >= TASTE.call) {
      msg = { type: "act", action: "call" };
    } else {
      msg = { type: "act", action: "fold" };
    }
    try { ws.send(JSON.stringify(msg)); } catch (e) {}
  }, delay);
});
