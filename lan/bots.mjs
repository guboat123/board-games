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

/* ⚠️ ชื่อบอทต้องเป็นอังกฤษล้วน เพื่อให้แยกออกจากคนไทยที่นั่งอยู่ด้วยตาเปล่า
   เดิมใช้ชื่อเล่นไทย (โบ๊ท แมท น้ำ ...) แล้วชนกับชื่อคนจริงบนโต๊ะ
   มองปราดเดียวไม่รู้ว่ากำลังสู้กับคนหรือกับบอท */
const NAMES = ["Ace", "Duke", "Rex", "Milo", "Vega", "Nico", "Kai", "Otto", "Zed"];

/* margin = ต้องได้เปรียบกว่าราคาที่จ่ายเท่าไหร่ถึงจะตาม (ติดลบ = ตามแม้ราคาไม่คุ้ม)
   bet    = มือแข็งแค่ไหนถึงจะเปิดเดิมพันเองตอนไม่มีใครเดิมพัน
   raise  = มือแข็งแค่ไหนถึงจะเรซทับคนอื่น
   bluff  = โอกาสที่จะดันทั้งที่มือไม่ดี */
/* ⚠️ ก่อนฟลอปกับหลังฟลอปต้องใช้คนละเกณฑ์
   มือที่ได้ค่า 0.64 ก่อนฟลอปคือมือหายาก แต่หลังฟลอปคือของธรรมดา
   ใช้เกณฑ์เดียวกันแล้วบอทเรซก่อนฟลอปแค่ 5% ทั้งที่คนเล่นตึงจริงเรซ 18-22%
   (คนตึงจะ "เรซหรือพับ" ไม่ใช่ตามเฉยๆ) — ค่าข้างล่างวัดจากการสุ่ม 30,000 มือ
   ให้ความถี่ออกมาใกล้คนเล่นจริง:
     lv1 เล่น 77% เรซ 3%  · lv2 เล่น 40% เรซ 8%  · lv3 เล่น 28% เรซ 18% */
const LEVEL = {
  1: { name: "มือใหม่",  margin: -0.16, preMargin: -0.18, bet: 0.70, raise: 0.86, preRaise: 0.78, bluff: 0.02, think: [700, 1800],  sizing: 0.35 },
  2: { name: "ปานกลาง", margin:  0.02, preMargin: -0.04, bet: 0.55, raise: 0.72, preRaise: 0.60, bluff: 0.08, think: [900, 2600],  sizing: 0.55 },
  3: { name: "เก่ง",     margin:  0.08, preMargin:  0.02, bet: 0.48, raise: 0.64, preRaise: 0.50, bluff: 0.16, think: [1100, 3400], sizing: 0.75 }
};

/* ความแข็งของชุดไพ่ที่ทำได้แล้ว แปลงเป็น "โอกาสชนะคร่าวๆ"
   ⚠️ ค่าชุดล่างสำคัญกว่าที่คิด ของเดิมให้ One Pair แค่ 0.315 ซึ่งต่ำกว่าเกณฑ์ตามของทุกระดับ
   ผลคือบอทพับวันแพร์ทิ้งทุกครั้งที่มีคนเดิมพัน แม้เดิมพัน 20 ในกอง 500
   ซึ่งไม่มีคนเล่นจริงคนไหนทำ = ที่เจ้าของบอกว่า "action งงๆ ไม่ makesense" */
const CAT_EQUITY = [0.16, 0.45, 0.62, 0.75, 0.84, 0.90, 0.95, 0.99, 1.0];

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
  return CAT_EQUITY[evaluate7(cs)[0]] || 0.5;
}

/* ---------- ไพ่ที่ "ยังไม่เข้าชุด แต่มีลุ้น" ----------
   ขาดอีกใบเดียวจะเป็นฟลัชหรือสเตรท = มีสิทธิ์ชนะจริงถ้าไพ่ใบต่อไปเข้า
   บลัฟด้วยมือแบบนี้ (semi-bluff) คือการบลัฟที่ถูกวิธี เพราะถ้าโดนตามก็ยังมีทาง
   ต่างจากบลัฟด้วยไพ่ที่ไม่มีอะไรเลย ซึ่งได้ทางเดียวคือให้เขาหมอบ */
function drawStrength(hole, board) {
  /* ลุ้นได้เฉพาะตอนยังมีไพ่จะเปิดอีก ริเวอร์แล้วไม่มีอะไรให้ลุ้น */
  if (!board || board.length < 3 || board.length > 4) return 0;
  const cards = hole.concat(board).map(toNum).filter(x => x >= 0);
  if (cards.length < 5) return 0;

  const suits = [0, 0, 0, 0];
  cards.forEach(c => suits[c & 3]++);
  const flushDraw = suits.some(n => n === 4);

  const has = new Array(13).fill(false);
  cards.forEach(c => { has[c >> 2] = true; });
  let openEnded = false;
  for (let i = 0; i <= 9; i++) {
    if (has[i] && has[i + 1] && has[i + 2] && has[i + 3]) openEnded = true;
  }

  if (flushDraw && openEnded) return 0.34;
  if (flushDraw) return 0.24;
  if (openEnded) return 0.19;
  return 0;
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
      const name = NAMES.filter(n => used.indexOf(n) === -1)[0] || ("Bot" + (++seq));
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

    /* ⚠️ ถ้ามีคนจริงที่พร้อมเล่นอยู่ ห้ามบอทกดเริ่มมือให้
       จังหวะจบมือเป็นของคนเล่น เขาอาจกำลังดูไพ่ที่เปิด ดูว่าใครได้เท่าไหร่ หรือกดโชว์ไพ่
       บอทกดเริ่มตัดจังหวะนั้นทิ้งหมด — บอทเริ่มให้เฉพาะตอนไม่มีคนจริงที่กดได้ */
    const humanReady = st.seats.some(x => x && !x.isBot && x.connected && !x.sitOut && x.stack > 0);
    if ((st.phase === "waiting" || st.phase === "showdown") && botSeats().length && !humanReady) {
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

  /* ต้องอ่าน toCall ก่อนประกาศตัวแปรจริง จึงแยกเป็นฟังก์ชันเล็กๆ ไว้ */
  function toCallNow(v) { return v.toCall; }

  function decide(seatId, lv) {
    const view = room.table.viewFor(seatId);
    const me = view.seats[seatId];
    if (!me || !me.cards.length || me.cards[0] === "??") {
      room.table.action(seatId, { type: "act", action: view.toCall > 0 ? "fold" : "check" });
      return;
    }

    const pre = view.phase === "preflop";
    const base = pre ? preflopStrength(me.cards) : madeStrength(me.cards, view.board);

    /* คนที่ยังสู้อยู่กี่คน — บลัฟได้ผลกับคนน้อย ยิ่งหลายคนยิ่งมีคนตามแน่ */
    let live = 0;
    view.seats.forEach(function (x, i) { if (x && x.inHand && !x.folded && i !== seatId) live++; });
    const crowdFactor = live <= 1 ? 1.7 : (live === 2 ? 1 : 0.3);

    /* ไพ่ที่มีลุ้น = บลัฟแล้วยังมีทางชนะจริง ไม่ใช่ได้ทางเดียวคือให้เขาหมอบ */
    const draw = pre ? 0 : drawStrength(me.cards, view.board);

    const bluffing = Math.random() < lv.bluff * crowdFactor;
    let eq = base + draw + (bluffing ? 0.26 : 0) + (Math.random() - 0.5) * 0.08;
    eq = Math.max(0, Math.min(1, eq));

    /* เดิมพันต่อเนื่อง: คนที่เป็นคนไล่ก่อนฟลอป มักยิงต่อในฟลอปไม่ว่าไพ่จะออกยังไง
       เพราะเขาแสดงความแข็งไปแล้ว คนอื่นที่ไม่ได้อะไรก็มักทิ้ง
       ใช้ได้เฉพาะตอนคนเหลือน้อย ยิงใส่สามคนคือเผาเงินเปล่า
       รู้ว่าเราเป็นคนไล่จาก lastKind ซึ่งยังค้างจากรอบก่อนจนกว่าจะลงมือใหม่ */
    const cbet = !pre && view.phase === "flop" && toCallNow(view) === 0 &&
                 me.lastKind === "raise" && live <= 2 && Math.random() < 0.62;

    const potNow = typeof view.potForBet === "number" ? view.potForBet : view.pot;

    /* ราคาที่ต้องจ่ายเทียบกับกอง — นี่คือสิ่งที่คนเล่นจริงคิด และของเดิมไม่มีเลย
       ตาม 20 ในกอง 500 กับตาม 500 ในกอง 500 คนละเรื่องกันคนละโลก
       ของเดิมดูแค่ "มือแข็งพอไหม" โดยไม่สนราคา จึงพับมือดีทิ้งเพราะเดิมพัน 20 */
    const toCall = view.toCall;
    const price = toCall > 0 ? toCall / (potNow + toCall) : 0;
    const margin = pre ? lv.preMargin : lv.margin;
    const raiseAt = pre ? lv.preRaise : lv.raise;
    const worthCalling = toCall === 0 || eq >= price + margin;

    /* ไม่เรซทับเดิมพันก้อนใหญ่ด้วยมือกลางๆ ไม่งั้นบอทจะสาดกันไปมาไม่จบ */
    const facingBig = toCall > me.stack * 0.3;
    const canRaise = me.stack > toCall &&
                     eq >= raiseAt &&
                     (!facingBig || eq >= 0.82);

    let msg;
    if (canRaise) {
      /* ขนาดเดิมพัน: อิงกองจริง ไม่ต่ำกว่าขั้นต่ำ และไม่เกินที่มี */
      const want = view.currentBet + view.minRaise +
                   Math.round(potNow * lv.sizing * (0.6 + Math.random() * 0.7));
      const target = Math.max(view.currentBet + view.minRaise,
                              Math.min(me.bet + me.stack, want));
      msg = { type: "act", action: "raise", amount: target };
    } else if (toCall === 0) {
      /* ไม่มีใครเดิมพัน: มือดีพอก็เปิดเดิมพันเอง ไม่ใช่เคาะผ่านตลอด */
      if ((eq >= lv.bet || cbet) && me.stack > view.blinds.bb) {
        const want = view.currentBet + view.minRaise +
                     Math.round(potNow * lv.sizing * (0.5 + Math.random() * 0.6));
        msg = { type: "act", action: "raise",
                amount: Math.max(view.currentBet + view.minRaise,
                                 Math.min(me.bet + me.stack, want)) };
      } else {
        msg = { type: "act", action: "check" };
      }
    } else if (worthCalling) {
      msg = { type: "act", action: "call" };
    } else {
      msg = { type: "act", action: "fold" };
    }

    const out = room.table.action(seatId, msg);
    /* กันเหนียว: ถ้าคำสั่งไม่ผ่านด้วยเหตุใดก็ตาม อย่าปล่อยให้โต๊ะค้างรอบอท */
    if (out && out.error) {
      const fb = room.table.action(seatId, { type: "act", action: toCall > 0 ? "call" : "check" });
      if (fb && fb.error) room.table.action(seatId, { type: "act", action: "fold" });
    }
  }

  function stop() {
    for (const k in pending) clearTimeout(pending[k]);
  }

  return { add, removeAll, poke, stop, count: () => botSeats().length, LEVEL };
}
