/* ===========================================================
   บอทฝึกซ้อมที่เซิร์ฟเวอร์คุมเอง
   ใช้ตอนอยากซ้อมเล่นแต่ยังไม่มีคนมาเล่นด้วย เพิ่มจากในเกมได้เลย

   สามระดับ ต่างกันที่ "ตัดสินใจดีแค่ไหน" ไม่ใช่ "โกงหรือเปล่า"
   ทุกระดับเห็นเฉพาะไพ่ตัวเอง + ไพ่กลาง เหมือนคน ไม่มีใครแอบดูสำรับ
     1 มือใหม่   เล่นแทบทุกมือ ตามเกือบตลอด แทบไม่พับ ไม่ค่อยบลัฟ
     2 ปานกลาง  เลือกมือพอประมาณ กล้าเดิมพันตอนมือดี บลัฟบ้าง
     3 เก่ง      เล่นตึง ไล่หนักตอนมือดี บลัฟมีจังหวะ ยอมทิ้งมือไม่ดีเร็ว
   =========================================================== */
import { evaluate7, cardCode, RANK_CHARS, SUIT_CHARS } from "./poker-engine.mjs";

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

  /* ⚠️ ต้องมีไพ่ในมือร่วมด้วย ไม่ใช่นับจากไพ่กลางล้วน
     ของเดิมรวมมือกับบอร์ดแล้วนับเฉยๆ บนบอร์ดที่มีดอกเดียวกันสี่ใบ
     บอทที่ถือไพ่ไม่เกี่ยวเลยก็คิดว่าตัวเองมีลุ้นฟลัช +0.24 แล้วตามหรือบลัฟต่อ
     ทั้งที่เป็นบอร์ดที่มันตายสนิท (คนอื่นถือดอกนั้นใบเดียวก็ชนะแล้ว) */
  const holeNums = hole.map(toNum).filter(x => x >= 0);
  const suits = [0, 0, 0, 0];
  cards.forEach(c => suits[c & 3]++);
  const flushDraw = suits.some((n, suit) =>
    n === 4 && holeNums.some(c => (c & 3) === suit));

  const has = new Array(13).fill(false);
  cards.forEach(c => { has[c >> 2] = true; });
  const holeRanks = holeNums.map(c => c >> 2);
  let openEnded = false;
  for (let i = 0; i <= 9; i++) {
    if (!(has[i] && has[i + 1] && has[i + 2] && has[i + 3])) continue;
    /* ต้องมีไพ่ในมืออย่างน้อยหนึ่งใบอยู่ในสี่ใบที่เรียงกันนั้น */
    if (holeRanks.some(r => r >= i && r <= i + 3)) openEnded = true;
  }

  if (flushDraw && openEnded) return 0.34;
  if (flushDraw) return 0.24;
  if (openEnded) return 0.19;
  return 0;
}

export function createBotManager(room, broadcast) {
  const pending = {};     /* seatId -> timer ที่ตั้งไว้ */
  let seq = 0;

  /* ---------- ความจำเรื่องคนอื่นที่โต๊ะ ----------
     ทุกครั้งที่มีใครเปิดไพ่ (เปิดตอน showdown หรือกดโชว์เอง) บอททุกตัวจำไว้
     ว่าคนนั้นสู้ด้วยไพ่แบบไหน แล้วเอามาใช้ตอนตัดสินใจครั้งต่อไป
     คนที่โชว์แต่ไพ่แข็ง = เวลาเขาดัน ควรเชื่อ (ต้องใช้ไพ่ดีกว่าปกติถึงสู้)
     คนที่โชว์ไพ่ขยะบ่อย = เขาบลัฟเป็นนิสัย ตามได้เบามือกว่าปกติ

     ⚠️ เก็บด้วย "ชื่อ" ไม่ใช่เลขที่นั่ง เพราะคนย้ายที่นั่งได้
     ถ้าอ้างเลขที่นั่ง พอมีคนย้าย ความจำจะไปติดตัวคนอื่นทันที
     (เหตุผลเดียวกับที่ประวัติมือในเซิร์ฟเวอร์เก็บชื่อ ไม่ใช่ที่นั่ง)

     นี่ไม่ใช่การโกง — เป็นข้อมูลที่คนนั่งอยู่โต๊ะเดียวกันก็เห็นเหมือนกันหมด */
  const reads = {};         /* ชื่อ -> { n, strong, weak } */
  let lastSeenHand = -1;
  let showOffHand = -1;     /* ตัดสินใจขิงไปแล้วในมือไหน (กันทอยลูกเต๋าซ้ำ) */
  let seenThisHand = {};    /* เก็บไพ่ของใครไปแล้วบ้างในมือนี้ (กันนับซ้ำ) */

  function readOf(name) {
    return reads[name] || { n: 0, strong: 0, weak: 0 };
  }

  function observe(st) {
    if (st.phase !== "showdown") return;
    /* ⚠️ ห้ามล็อกทิ้งหลังดูรอบเดียว
       คนกดโชว์ไพ่เองทีหลัง (และบอทก็ขิงทีหลัง) ถ้าล็อกตั้งแต่รอบแรกที่เห็น showdown
       ไพ่ที่ "ตั้งใจโชว์" ซึ่งเป็นข้อมูลที่มีค่าที่สุด จะไม่เคยถูกเก็บเลย
       ใช้กันซ้ำที่ระดับ "คนนี้ในมือนี้" แทน แล้วเก็บเพิ่มได้เรื่อยๆ ตลอดช่วง showdown */
    if (st.handNo !== lastSeenHand) { lastSeenHand = st.handNo; seenThisHand = {}; }

    const seen = [];
    const r = st.lastResult;
    if (r && r.reveal) {
      for (const x of r.reveal) {
        if (x.cards && x.cards.length === 2) seen.push({ name: x.name, cards: x.cards });
      }
    }
    /* คนที่กดโชว์เอง ไม่ได้อยู่ใน reveal ต้องเก็บด้วย เป็นข้อมูลที่มีค่าที่สุด
       (เขาเลือกโชว์เอง = ตั้งใจให้เห็น มักเป็นการขิงว่าบลัฟสำเร็จ) */
    for (let i = 0; i < st.seats.length; i++) {
      const sx = st.seats[i];
      if (!sx || !st.shown[i] || !sx.cards || sx.cards.length !== 2) continue;
      if (seen.some(y => y.name === sx.name)) continue;
      seen.push({ name: sx.name, cards: sx.cards.map(cardCode) });
    }

    for (const x of seen) {
      if (seenThisHand[x.name]) continue;
      seenThisHand[x.name] = true;
      const v = preflopStrength(x.cards);
      const rec = reads[x.name] || (reads[x.name] = { n: 0, strong: 0, weak: 0 });
      rec.n++;
      if (v >= 0.55) rec.strong++;
      else if (v < 0.35) rec.weak++;
      /* จำแค่ช่วงหลัง คนเปลี่ยนสไตล์ได้ ความจำจากเมื่อ 50 มือก่อนไม่ควรค้างตลอดไป */
      if (rec.n > 12) { rec.n = 8; rec.strong = Math.round(rec.strong * 8 / 12); rec.weak = Math.round(rec.weak * 8 / 12); }
    }
  }

  /* บอทขิง: ชนะโดยไม่มีใครตามถึงตอนเปิดไพ่ = ไม่มีใครเห็นว่าถืออะไร
     คนเล่นจริงชอบโชว์ตอนนั้น ทั้งตอนบลัฟสำเร็จ (กวนประสาท) และตอนไพ่ดีจริง (เสียดายไม่มีใครเห็น)
     ระดับสูงขิงบ่อยกว่า เพราะเขาเล่นกับภาพจำของคนอื่นเป็น */
  function maybeShowOff(st) {
    if (st.phase !== "showdown" || !st.lastResult || st.lastResult.showdown) return;
    /* ⚠️ ตัดสินใจครั้งเดียวต่อมือ ห้ามทอยใหม่ทุกครั้งที่มีการส่ง state
       poke() ถูกเรียกทุกครั้งที่ broadcast ซึ่งเกิดหลายรอบต่อหนึ่ง showdown
       (บอทลงมือ · ตัวจับเวลา · ทุกข้อความที่เครื่องไหนก็ตามส่งเข้ามาระหว่างดูผล)
       ทอยใหม่ทุกรอบทำให้โอกาส 0.25 กลายเป็น ~0.68 หลังสี่รอบ และเพิ่มขึ้นเรื่อยๆ
       ยิ่งคนนั่งดูผลนาน บอทยิ่งขิงทุกมือ ซึ่งทำให้ข้อมูลที่ observe() เก็บเพี้ยนตามไปด้วย */
    if (showOffHand === st.handNo) return;
    showOffHand = st.handNo;
    for (const b of botSeats()) {
      if (st.shown[b.seatId]) continue;
      if (!b.cards || b.cards.length !== 2) continue;
      const won = st.lastResult.payouts.some(p => p.seatId === b.seatId);
      if (!won) continue;
      const lv = LEVEL[b.botLevel] || LEVEL[2];
      const v = preflopStrength(b.cards.map(cardCode));
      /* ไพ่ขยะที่ชนะ = บลัฟสำเร็จ ขิงสนุกกว่า / ไพ่แข็ง = อวดของดี ขิงน้อยกว่า */
      const chance = (v < 0.35 ? 0.45 : 0.18) * (lv.bluff > 0.1 ? 1.4 : 0.7);
      if (Math.random() < chance) room.table.action(b.seatId, { type: "showcards" });
    }
  }

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

    /* จำไพ่ที่เพิ่งเห็น แล้วขิงถ้ามีจังหวะ ทำก่อนอย่างอื่นเสมอ
       เพราะเป็นข้อมูลของ "มือที่เพิ่งจบ" ซึ่งจะหายไปทันทีที่ขึ้นมือใหม่ */
    observe(st);
    maybeShowOff(st);

    /* บอทชิปหมดต้องซื้อกลับเข้ามาเอง ไม่งั้นโต๊ะค่อยๆ ว่างจนเหลือคนเดียว
       แล้วคนที่เหลือก็เริ่มมือไม่ได้เพราะ "ต้องมีอย่างน้อย 2 คน"
       เติมได้เฉพาะตอนไม่มีมือกำลังเล่น (เซิร์ฟเวอร์กันไว้อยู่แล้ว)
       จำนวนครั้งที่ล้มถูกนับใน s.busts แล้วส่งกลับเข้าไปในหัวบอท (ดู decide) */
    if (st.phase === "waiting" || st.phase === "showdown") {
      for (const b of botSeats()) {
        if (b.stack > 0) continue;
        room.table.action(b.seatId, { type: "rebuy", amount: 2000 });
      }
    }

    /* ⚠️ บอทไม่มีสิทธิ์กด "เริ่มเล่น" / "มือต่อไป" เลย (เจ้าของสั่ง 2026-08-31)
       จังหวะขึ้นมือใหม่เป็นของคนเล่นเท่านั้น เขาอาจกำลังไล่ดูว่าใครถือไพ่อะไร
       ใครได้ใครเสียเท่าไหร่ หรือกำลังจะกดโชว์ไพ่ บอทกดเริ่มตัดจังหวะนั้นทิ้งหมด
       เคยลองให้บอทเริ่มได้เฉพาะตอนไม่มีคนจริงพร้อมเล่น ก็ยังรีบเกินไปอยู่ดี
       อย่าใส่กลับมา ไม่ว่าจะหน่วงเวลานานแค่ไหนก็ตาม
       ผลข้างเคียงที่ยอมรับแล้ว: โต๊ะที่มีแต่บอทจะไม่เดินเอง ต้องมีคนกด */
    if (st.phase === "waiting" || st.phase === "showdown") return;

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

    /* ⚠️ ล้มโต๊ะมาแล้วกี่รอบ = บทเรียนที่บอทควรจำ ไม่ใช่เริ่มใหม่แบบไม่รู้อะไรเลย
       ยิ่งล้มบ่อยยิ่งเล่นระวังขึ้น (ต้องการไพ่ดีกว่าเดิมถึงจะสู้) และบลัฟน้อยลง
       จำกัดเพดานไว้ ไม่งั้นบอทที่ซวยติดกันจะกลายเป็นหมอบทุกมือจนไม่มีใครอยากเล่นด้วย */
    const busts = Math.min(me.busts || 0, 3);

    /* ---------- อ่านคนที่กำลังดันเราอยู่ ----------
       ต้องรู้ว่ากำลังสู้กับใคร ไม่ใช่สู้กับ "ราคา" เฉยๆ
       คนที่ดัน = คนที่วางเงินเท่ากับเงินสูงสุดบนโต๊ะตอนนี้ และท่าล่าสุดคือดัน */
    let pressureRead = null;
    if (view.toCall > 0) {
      view.seats.forEach(function (x, i) {
        if (!x || i === seatId || x.folded || !x.inHand) return;
        if (x.bet !== view.currentBet) return;
        if (x.lastKind !== "raise" && x.lastKind !== "bet") return;
        pressureRead = readOf(x.name);
      });
    }
    /* เห็นไพ่เขามาแล้วอย่างน้อย 3 ครั้งถึงจะเชื่อสถิติ น้อยกว่านั้นคือเดา
       โชว์แต่ไพ่แข็ง = ต้องใช้ไพ่ดีกว่าเดิมถึงจะสู้ / โชว์ไพ่ขยะบ่อย = ตามได้เบามือ */
    let respect = 0;
    if (pressureRead && pressureRead.n >= 3) {
      respect = (pressureRead.strong - pressureRead.weak) / pressureRead.n * 0.09;
    }

    const caution = busts * 0.03 + respect;

    const bluffing = Math.random() < lv.bluff * crowdFactor * (1 - busts * 0.2);
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
    const margin = (pre ? lv.preMargin : lv.margin) + caution;
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
