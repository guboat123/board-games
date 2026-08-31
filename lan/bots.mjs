/* ===========================================================
   บอทฝึกซ้อมที่เซิร์ฟเวอร์คุมเอง
   ใช้ตอนอยากซ้อมเล่นแต่ยังไม่มีคนมาเล่นด้วย เพิ่มจากในเกมได้เลย

   สามระดับ ต่างกันที่ "ตัดสินใจดีแค่ไหน" ไม่ใช่ "โกงหรือเปล่า"
   ทุกระดับเห็นเฉพาะไพ่ตัวเอง + ไพ่กลาง เหมือนคน ไม่มีใครแอบดูสำรับ
     1 มือใหม่   เล่นแทบทุกมือ ตามเกือบตลอด แทบไม่พับ ไม่ค่อยบลัฟ
     2 ปานกลาง  เลือกมือพอประมาณ กล้าเดิมพันตอนมือดี บลัฟบ้าง
     3 เก่ง      เล่นตึง ไล่หนักตอนมือดี บลัฟมีจังหวะ ยอมทิ้งมือไม่ดีเร็ว
   =========================================================== */
import { evaluate7, RANK_CHARS, SUIT_CHARS } from "./poker-engine.mjs";

const NAMES = ["โบ๊ท", "แมท", "น้ำ", "ปุ๊ก", "ต้น", "แนน", "เจ", "มิ้น", "ก้อง"];

const LEVEL = {
  1: { name: "มือใหม่",  call: 0.16, raise: 0.86, bluff: 0.02, think: [700, 1800],  sizing: 0.35 },
  2: { name: "ปานกลาง", call: 0.36, raise: 0.68, bluff: 0.08, think: [900, 2600],  sizing: 0.55 },
  3: { name: "เก่ง",     call: 0.47, raise: 0.60, bluff: 0.16, think: [1100, 3400], sizing: 0.75 }
};

function toNum(code) {
  const r = RANK_CHARS.indexOf(code.slice(0, -1));
  const s = SUIT_CHARS.indexOf(code.slice(-1));
  return r < 0 || s < 0 ? -1 : r * 4 + s;
}

/* ความแข็งของสองใบแรก 0..1 ตามหลักที่คนเล่นใช้กันจริง
   คู่ > ใบสูงสองใบ > ดอกเดียวกัน > เรียงติดกัน */
function preflopStrength(cards) {
  const a = RANK_CHARS.indexOf(cards[0].slice(0, -1));
  const b = RANK_CHARS.indexOf(cards[1].slice(0, -1));
  if (a < 0 || b < 0) return 0.4;
  const suited = cards[0].slice(-1) === cards[1].slice(-1);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (a === b) return Math.min(1, 0.56 + hi / 26);
  let v = (hi * 0.62 + lo * 0.38) / 12 * 0.6;
  if (suited) v += 0.08;
  if (hi - lo === 1) v += 0.05;
  if (hi - lo > 5) v -= 0.09;
  return Math.max(0, Math.min(1, v));
}

/* หลังเปิดไพ่กลาง ใช้เครื่องประเมินตัวจริงของเกม แล้วแปลงหมวดเป็นความมั่นใจ */
function madeStrength(hole, board) {
  const cs = hole.concat(board).map(toNum).filter(x => x >= 0);
  if (cs.length < 5) return 0.4;
  const cat = evaluate7(cs)[0];
  return Math.min(1, 0.2 + cat * 0.115);
}

export function createBotManager(room, broadcast) {
  const pending = {};     /* seatId -> timer ที่ตั้งไว้ */
  let seq = 0;

  function botSeats() {
    return room.table._state.seats.filter(s => s && s.isBot);
  }

  function add(count, level) {
    const lv = LEVEL[level] ? level : 2;
    const added = [];
    for (let i = 0; i < count; i++) {
      const used = room.table._state.seats.filter(Boolean).map(s => s.name);
      const name = NAMES.filter(n => used.indexOf(n) === -1)[0] || ("บอท" + (++seq));
      const r = room.table.sit(name, null, 2000, "bot:" + (++seq), { bot: true, level: lv });
      if (!r.ok) break;
      added.push(r.name);
    }
    return { added, level: lv, levelName: LEVEL[lv].name };
  }

  function removeAll() {
    for (const s of botSeats()) {
      clearTimeout(pending[s.seatId]);
      delete pending[s.seatId];
      room.table.leave(s.seatId);
    }
  }

  /* เรียกทุกครั้งที่สถานะโต๊ะเปลี่ยน ถ้าถึงตาบอทให้ตั้งเวลาคิดแล้วค่อยลงมือ
     ตั้งเวลาแทนที่จะลงมือทันที เพื่อให้คนอ่านทันว่าเกิดอะไรขึ้น และดูเหมือนคนคิดจริง */
  function poke() {
    const st = room.table._state;

    /* ไม่มีคนจริงอยู่แล้ว บอทไม่ต้องเล่นต่อ ปล่อยให้ห้องถูกเก็บไป */
    if (!room.table.anyConnected()) return;

    /* ยังไม่เริ่มมือ และมีบอทอยู่ ให้บอทกดเริ่มให้ จะได้ไม่ต้องรอคนกด */
    if ((st.phase === "waiting" || st.phase === "showdown") && botSeats().length) {
      const starter = botSeats()[0];
      if (!pending["start"]) {
        pending["start"] = setTimeout(() => {
          delete pending["start"];
          const out = room.table.action(starter.seatId, { type: "start" });
          if (!out || !out.error) { broadcast(); poke(); }
        }, 2000);
      }
      return;
    }

    const cur = st.current;
    if (cur < 0) return;
    const me = st.seats[cur];
    if (!me || !me.isBot || pending[cur]) return;

    const lv = LEVEL[me.botLevel] || LEVEL[2];
    const view = room.table.viewFor(cur);
    const wait = lv.think[0] + Math.random() * (lv.think[1] - lv.think[0]);

    pending[cur] = setTimeout(() => {
      delete pending[cur];
      /* สถานะอาจเปลี่ยนไปแล้วระหว่างที่ "คิด" ต้องเช็คซ้ำก่อนลงมือเสมอ */
      if (room.table._state.current !== cur) { poke(); return; }
      decide(cur, lv);
      broadcast();
      poke();
    }, wait);
  }

  function decide(seatId, lv) {
    const view = room.table.viewFor(seatId);
    const me = view.seats[seatId];
    if (!me || !me.cards.length || me.cards[0] === "??") {
      room.table.action(seatId, { type: "act", action: view.toCall > 0 ? "fold" : "check" });
      return;
    }

    const pre = view.phase === "preflop";
    const base = pre ? preflopStrength(me.cards) : madeStrength(me.cards, view.board);
    const bluff = Math.random() < lv.bluff;
    const score = base + (bluff ? 0.28 : 0) + (Math.random() - 0.5) * 0.1;

    let msg;
    if (score >= lv.raise && me.stack > view.currentBet) {
      const potBase = typeof view.potForBet === "number" ? view.potForBet : view.pot;
      const target = Math.min(me.bet + me.stack,
        view.currentBet + view.minRaise + Math.round(potBase * lv.sizing * (0.6 + Math.random() * 0.8)));
      msg = { type: "act", action: "raise", amount: target };
    } else if (view.toCall === 0) {
      msg = { type: "act", action: "check" };
    } else if (score >= lv.call) {
      msg = { type: "act", action: "call" };
    } else {
      msg = { type: "act", action: "fold" };
    }

    const out = room.table.action(seatId, msg);
    /* กันเหนียว: ถ้าคำสั่งไม่ผ่านด้วยเหตุใดก็ตาม อย่าปล่อยให้โต๊ะค้างรอบอท */
    if (out && out.error) {
      const fb = room.table.action(seatId, { type: "act", action: view.toCall > 0 ? "call" : "check" });
      if (fb && fb.error) room.table.action(seatId, { type: "act", action: "fold" });
    }
  }

  function stop() {
    for (const k in pending) clearTimeout(pending[k]);
  }

  return { add, removeAll, poke, stop, count: () => botSeats().length, LEVEL };
}
