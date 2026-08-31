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
import * as bank from "./bot-bank.mjs";

/* ---------- รายชื่อบอทประจำแต่ละระดับ ----------
   ⚠️ ระดับเป็น "ตัวตน" ของบอท ไม่ใช่ค่าที่เลือกตอนเรียกมาเล่น
   Rex เป็นมืออาชีพเสมอ ไม่ใช่บางวันเก่งบางวันมั่ว — เพราะเงินติดตัวผูกกับชื่อ
   ถ้าชื่อเดียวเปลี่ยนระดับไปมา ประวัติได้-เสียของมันก็อ่านไม่ได้ความ

   ⚠️ ชื่อต้องเป็นอังกฤษล้วน เพื่อให้แยกออกจากคนไทยที่นั่งอยู่ด้วยตาเปล่า
   และห้ามใช้คำที่เป็นศัพท์ไพ่ — เคยมีบอทชื่อ "Ace" แล้วอ่านผลมือแล้วงง
   ("Ace ชนะด้วย High Card A" — Ace ตัวไหนคือคน ตัวไหนคือไพ่)
   ห้ามใช้: Ace / King / Queen / Jack / Joker / Flush / Straight / Chip / Pot / Raise
   และห้ามซ้ำกันข้ามระดับ เพราะกระเป๋าเงินผูกกับชื่ออย่างเดียว */
const ROSTER = {
  1: ["Milo", "Pip", "Toby", "Bruno", "Ozzy", "Rudy", "Gus", "Wally", "Bobby", "Sammy"],
  2: ["Vince", "Rocco", "Gio", "Marco", "Sonny", "Rico", "Tank", "Buddy", "Lenny", "Frankie"],
  3: ["Rex", "Duke", "Vega", "Otto", "Zed", "Kai", "Nico", "Sable", "Cole", "Ash"]
};

/* ---------- กระเป๋าเงินของบอท ----------
   ชิปบนโต๊ะไม่ใช่เงินของบอท มันคือเงินที่ "หยิบมาเล่น" จากกระเป๋า
   ซื้อเข้าโต๊ะครั้งละ BUY_IN หักจากกระเป๋าจริง หมดตัวแล้วซื้อใหม่ก็หักอีก
   กระเป๋าติดลบได้ = เป็นหนี้ ซึ่งบอทรู้ตัวและเล่นระวังขึ้นจริง (ดู decide)
   ทำแบบนี้เพราะถ้าซื้อชิปใหม่ได้ฟรีไม่จำกัด การหมดตัวก็ไม่มีความหมายอะไรเลย
   บอทจะไล่ all-in ทุกมือแล้วก็ยังอยู่ครบ ซึ่งไม่เหมือนคนเล่นจริงสักนิด */
/* ⚠️ เงินไม่ได้เริ่มใหม่ทุกวง มันผูกกับ "ชื่อบอท" และอยู่ข้ามการรีสตาร์ต (ดู bot-bank.mjs)
   Rex ที่เจอเมื่อวานกับ Rex วันนี้คือตัวเดียวกัน ถ้าเมื่อวานมันเจ๊ง วันนี้มันก็ยังเป็นหนี้อยู่
   สมการที่ต้องเป็นจริงเสมอ: bankroll = wallet (นอกโต๊ะ) + stack (บนโต๊ะ) */
const BUY_IN = 2000;

/* ---------- เงินตั้งต้นของบอทแต่ละระดับ ----------
   ⚠️ ตัวเลขนี้ไม่ใช่แค่ "ให้เงินเยอะน้อย" มันคือ "มีอะไรให้กลัวแค่ไหน"
   เจ้าของโต๊ะเล่นกันจริงที่ซื้อเข้า 1,000-2,000 ต่อครั้ง คิดเป็นจำนวนครั้งที่ซื้อเข้าได้:
     มือใหม่   5,000   ≈ 2-3 ครั้ง  หมดเร็ว รู้สึกทุกครั้งที่เสีย เล่นกลัวเร็ว — ตรงกับคนเพิ่งหัด
     นักพนัน  20,000   ≈ 10 ครั้ง   รับความเหวี่ยงได้ จึงมั่วต่อได้เรื่อยๆ ซึ่งคือนิสัยของเขา
     มืออาชีพ 100,000  ≈ 50 ครั้ง   ไม่มีวันเล่นแบบกลัวเงินหมด นั่นแหละที่ทำให้เขาน่ากลัว
   ที่บอทชอบลุยหมดหน้าตักเพราะเมื่อก่อนเงินไม่มีวันหมดจริง ตอนนี้หมดได้แล้ว */
const WALLET_START = { 1: 5000, 2: 20000, 3: 100000 };

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
  2: { name: "นักพนัน", margin:  0.02, preMargin: -0.04, bet: 0.55, raise: 0.72, preRaise: 0.60, bluff: 0.08, think: [900, 2600],  sizing: 0.55 },
  3: { name: "มืออาชีพ",     margin:  0.08, preMargin:  0.02, bet: 0.48, raise: 0.64, preRaise: 0.50, bluff: 0.16, think: [1100, 3400], sizing: 0.75 }
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


/* ===========================================================
   สามระดับ = สามวิธีคิด ไม่ใช่ตัวเลขชุดเดียวกันปรับค่า

   ⚠️ ของเดิมทุกระดับใช้ตรรกะเดียวกันหมด ต่างแค่เกณฑ์
   ผลคือทุกตัวเล่นเหมือนกัน แค่ตัวหนึ่งใจกล้ากว่าอีกตัว ซึ่งอ่านออกได้ในสิบมือ
   คนเล่นสามแบบนี้ในชีวิตจริง "คิดคนละเรื่อง" กันเลย ไม่ใช่แค่กล้าไม่เท่ากัน

     1 มือใหม่   ถามตัวเองแค่ "มีอะไรในมือไหม" ไม่คิดเรื่องราคา
                 มีคู่ = ตาม · ไม่มีอะไร = พับ · เจอเดิมพันก้อนโตแล้วกลัว
                 ไม่ไล่ลุ้น (นับ out ไม่เป็น) ไม่บลัฟเลย
     2 นักพนัน   อยากอยู่ในมือ ไล่ลุ้นทุกทาง ไม่ค่อยยอมพับเมื่อลงเงินไปแล้ว
                 ตามกว้างเกินราคาที่ควร และบางทีก็ลุยหมดหน้าตักด้วยลางสังหรณ์
     3 มืออาชีพ  คิดจากราคาเทียบกอง (pot odds) + ตำแหน่ง + อ่านคนที่กำลังดัน
                 บลัฟมีจังหวะ ยิงต่อเนื่องเมื่อเป็นคนไล่ก่อนฟลอป ยอมทิ้งเร็วเมื่อราคาไม่คุ้ม
   =========================================================== */

/* ---------- 1 มือใหม่ ---------- */
function decideBeginner(f) {
  const bet = () => {
    /* ขนาดเดิมพันมั่วๆ ครึ่งกองบ้าง เท่ากองบ้าง ไม่มีเหตุผลรองรับ */
    const want = f.view.currentBet + f.view.minRaise + Math.round(f.potNow * (0.4 + Math.random() * 0.6));
    return { type: "act", action: "raise",
             amount: Math.max(f.view.currentBet + f.view.minRaise,
                              Math.min(f.me.bet + f.me.stack, want)) };
  };

  /* "มีอะไรไหม" = คู่ขึ้นไป (หลังฟลอป) หรือไพ่สูงสองใบ (ก่อนฟลอป)
     ไม่สนใจไพ่ลุ้น เพราะมือใหม่นับ out ไม่เป็น เห็นว่ายังไม่เข้าชุดก็คิดว่าไม่มีอะไร */
  const got = f.pre ? f.base >= 0.50 : f.base >= 0.45;
  const strong = f.base >= 0.78;

  if (f.toCall === 0) {
    if (strong) return bet();
    return { type: "act", action: "check" };
  }
  /* เดิมพันก้อนโตทำให้กลัว ต่อให้มือดี — ตัดสินจาก "ก้อนใหญ่แค่ไหนเทียบตักเรา"
     ไม่ใช่เทียบกอง ซึ่งเป็นวิธีที่ผิดและเป็นจุดที่ถูกไล่ออกจากมือได้ง่ายที่สุด */
  const scary = f.toCall > f.me.stack * 0.25;
  if (f.base >= 0.90) return bet();
  if (got && !scary) return { type: "act", action: "call" };
  if (got && scary && f.base >= 0.72) return { type: "act", action: "call" };
  return { type: "act", action: "fold" };
}

/* ---------- 2 นักพนัน ---------- */
function decideGambler(f) {
  const shove = () => ({ type: "act", action: "raise", amount: f.me.bet + f.me.stack });
  const bet = (mult) => {
    const want = f.view.currentBet + f.view.minRaise + Math.round(f.potNow * mult);
    return { type: "act", action: "raise",
             amount: Math.max(f.view.currentBet + f.view.minRaise,
                              Math.min(f.me.bet + f.me.stack, want)) };
  };

  /* ลงเงินไปแล้วยิ่งไม่อยากทิ้ง (sunk cost) ซึ่งเป็นนิสัยของนักพนันจริงๆ
     ไม่ใช่ข้อผิดพลาดในโค้ด — เป็นจุดอ่อนที่ตั้งใจให้มี คนเล่นจะได้จับทางได้ */
  const committed = f.me.bet > 0 ? 0.10 : 0;
  /* ไล่ลุ้นทุกทาง ให้น้ำหนักไพ่ลุ้นมากกว่าที่ควรเกือบเท่าตัว */
  const chase = f.draw * 1.8;
  const eq = Math.min(1, f.base + chase);

  /* ลางสังหรณ์: บางมือก็ลุยหมดหน้าตักไปเลย ไม่ต้องมีเหตุผล */
  if (Math.random() < 0.035 && f.me.stack > 0 && f.live <= 2) return shove();

  if (f.toCall === 0) {
    if (eq >= 0.42 || Math.random() < 0.28) return bet(0.5 + Math.random() * 0.8);
    return { type: "act", action: "check" };
  }
  if (eq >= 0.80) return bet(0.9 + Math.random());
  /* ตามกว้างกว่าราคาที่ควรมาก ยอมจ่ายแพงเพื่อจะได้อยู่ในมือต่อ */
  if (eq >= f.price - 0.18 - committed) return { type: "act", action: "call" };
  return { type: "act", action: "fold" };
}

/* ---------- 3 มืออาชีพ ---------- */
function decidePro(f) {
  const lv = f.lv;
  const eq = Math.max(0, Math.min(1, f.base + f.draw + (f.bluffing ? 0.26 : 0) +
                                     (Math.random() - 0.5) * 0.08));

  /* ตำแหน่งมีผลจริง: ได้เดินท้ายแปลว่าเห็นคนอื่นตัดสินใจก่อน เล่นกว้างขึ้นได้
     คนที่ต้องเดินก่อนเป็นฝ่ายเสียเปรียบ ต้องมือแน่นกว่า
     นี่คือสิ่งที่แยกคนเล่นเป็นออกจากคนเล่นตามความรู้สึกชัดที่สุด */
  const latePos = f.actsLast ? -0.03 : 0.02;

  const margin = (f.pre ? lv.preMargin : lv.margin) + f.caution + latePos;
  const raiseAt = f.pre ? lv.preRaise : lv.raise;
  const worthCalling = f.toCall === 0 || eq >= f.price + margin;

  /* ไม่เรซทับเดิมพันก้อนใหญ่ด้วยมือกลางๆ ไม่งั้นบอทจะสาดกันไปมาไม่จบ */
  const facingBig = f.toCall > f.me.stack * 0.3;
  const canRaise = f.me.stack > f.toCall && eq >= raiseAt && (!facingBig || eq >= 0.82);

  const sized = (mult) => {
    const want = f.view.currentBet + f.view.minRaise + Math.round(f.potNow * mult);
    return { type: "act", action: "raise",
             amount: Math.max(f.view.currentBet + f.view.minRaise,
                              Math.min(f.me.bet + f.me.stack, want)) };
  };

  if (canRaise) return sized(lv.sizing * (0.6 + Math.random() * 0.7));
  if (f.toCall === 0) {
    if ((eq >= lv.bet || f.cbet) && f.me.stack > f.view.blinds.bb) {
      return sized(lv.sizing * (0.5 + Math.random() * 0.6));
    }
    return { type: "act", action: "check" };
  }
  if (worthCalling) return { type: "act", action: "call" };
  return { type: "act", action: "fold" };
}

const STYLE = { 1: decideBeginner, 2: decideGambler, 3: decidePro };

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
  const bench = {};         /* seatId -> กลับมาเล่นได้ตอนจบมือที่เท่าไหร่ */
  let bankedHand = -1;      /* บันทึกเงินบอทของมือไหนไปแล้ว */

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
    let busyAll = false;
    for (let i = 0; i < count; i++) {
      /* ⚠️ ต้องว่างทั้งบนโต๊ะนี้ และว่างทั้งเซิร์ฟเวอร์
         กระเป๋าเงินผูกกับชื่อ ถ้าชื่อเดียวกันนั่งสองโต๊ะ ทั้งสองโต๊ะจะหยิบจากกระเป๋าใบเดียวกัน
         แล้วเขียนทับกันไปมา ยอดของโต๊ะที่บันทึกก่อนจะหายทั้งก้อน */
      const used = room.table._state.seats.filter(Boolean).map(s => s.name);
      const free = (ROSTER[lv] || []).filter(n => used.indexOf(n) === -1 && !bank.isBusy(n));
      if (!free.length) { busyAll = true; break; }
      /* สุ่มว่าใครในระดับนั้นจะได้มาเล่น ไม่ใช่เรียกตัวแรกในรายชื่อทุกครั้ง
         ไม่งั้นจะเจอ Rex ทุกวงจนบอทตัวอื่นไม่มีประวัติของตัวเองเลย */
      const name = free[Math.floor(Math.random() * free.length)];
      bank.claim(name);
      const r = room.table.sit(name, null, BUY_IN, "bot:" + (++seq), { bot: true, level: lv });
      if (!r.ok) { bank.release(name); break; }
      /* หยิบเงินเก่าของบอทชื่อนี้ขึ้นมา แล้วหักค่าซื้อเข้าโต๊ะครั้งแรก
         เงินบนโต๊ะมาจากกระเป๋าเสมอ ไม่ได้เสกขึ้นมาใหม่ */
      const bs = room.table._state.seats[r.seatId];
      if (bs) {
        bs.wallet = bank.startSession(r.name, WALLET_START[lv] || 20000, Date.now()) - BUY_IN;
        /* จำเงินตั้งต้นไว้ด้วย ใช้เทียบว่า "ตอนนี้ขึ้นหรือลงจากที่เริ่มมา" (ดู decide) */
        bs.walletStart = WALLET_START[lv] || 20000;
      }
      added.push(r.name);
    }
    /* บอกกลับไปด้วยว่าเรียกไม่ครบเพราะบอทระดับนี้ไม่ว่าง (ไปนั่งโต๊ะอื่นอยู่)
       ไม่งั้นคนกดจะเห็นแค่ "ไม่มีอะไรเกิดขึ้น" แล้วกดซ้ำไปเรื่อยๆ */
    return { added, level: lv, levelName: LEVEL[lv].name,
             busy: busyAll, roster: (ROSTER[lv] || []).length,
             inUse: (ROSTER[lv] || []).filter(n => bank.isBusy(n)).length };
  }

  function removeAll() {
    for (const s of botSeats()) {
      clearTimeout(pending[s.seatId]);
      delete pending[s.seatId];
      delete bench[s.seatId];
      /* เก็บเงินกลับกระเป๋าก่อนลุก ไม่งั้นชิปที่ชนะมาทั้งวงหายไปเฉยๆ
         แล้วปล่อยชื่อคืน ให้โต๊ะอื่นเรียกบอทตัวนี้ไปเล่นต่อได้ */
      if (typeof s.wallet === "number") bank.sync(s.name, s.wallet, s.stack, Date.now());
      bank.release(s.name);
      room.table.leave(s.seatId);
    }
  }

  /* หมดตัวแล้วจะเติมชิปเล่นต่อ หรือลุกจากโต๊ะ
     ตัดสินจากนิสัยประจำระดับ + เงินที่เหลือจริงในกระเป๋า */
  function wantsRebuy(b) {
    const purse = typeof b.wallet === "number" ? b.wallet : 0;
    const busts = b.busts || 1;

    /* นิสัยประจำระดับ: อยากเล่นต่อแค่ไหนถ้าเงินยังเหลือเยอะ */
    let want;
    if (b.botLevel === 2) want = 0.94;                       /* นักพนัน แทบไม่เลิก */
    else if (b.botLevel === 1) want = busts >= 2 ? 0.45 : 0.75;  /* มือใหม่ โดนซ้ำแล้วกลัว */
    else want = busts >= 2 ? 0.60 : 0.88;                    /* มืออาชีพ โต๊ะไม่คุ้มก็ลุก */

    /* ⚠️ เงินในกระเป๋าเหลือน้อย = อยากลุกมากกว่าอยากเล่นต่อ ทุกระดับ
       ตัววัดที่ตรงที่สุดคือ "ซื้อเข้าได้อีกกี่ครั้ง" ไม่ใช่ยอดดิบ
       เพราะมืออาชีพเหลือ 5,000 (2 ครั้ง) กับมือใหม่เหลือ 5,000 (2 ครั้ง)
       อยู่ในสถานการณ์เดียวกันเป๊ะ ต่างกันแค่เคยมีเท่าไหร่ ซึ่งไม่เกี่ยวตอนนี้แล้ว */
    const runway = purse / BUY_IN;
    let factor;
    if (runway < 0) factor = 0.15;        /* ต้องกู้มาเล่น มีบ้างแต่ไม่บ่อย */
    else if (runway < 1) factor = 0.25;   /* เหลือไม่พอซื้อเข้าอีกครั้งด้วยซ้ำ */
    else if (runway < 2) factor = 0.45;   /* เหลือครั้งเดียว ลุกดีกว่า */
    else if (runway < 5) factor = 0.75;   /* เริ่มบาง แต่ยังสู้ไหว */
    else factor = 1;                      /* เงินหนา ไม่มีอะไรต้องคิด */

    return Math.random() < want * factor;
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
    /* ⚠️ บันทึกเงินบอททุกครั้งที่จบมือ ไม่ใช่แค่ตอนลุกจากโต๊ะ
       ถ้าบันทึกแค่ตอนลุก พอเซิร์ฟเวอร์ถูกปิดกลางวง (ซึ่งเกิดบ่อยตอนแก้โค้ด)
       ชิปที่อยู่บนโต๊ะจะหายทั้งก้อน บันทึกทุกมือ ของที่เสียได้มากที่สุดคือมือเดียว */
    if (st.phase === "showdown" && st.handNo !== bankedHand) {
      bankedHand = st.handNo;
      for (const b of botSeats()) {
        if (typeof b.wallet === "number") bank.sync(b.name, b.wallet, b.stack, Date.now());
      }
    }

    /* ---------- บอทหมดตัว: ซื้อกลับเข้ามา แต่ต้องนั่งพักก่อน ----------
       ต้องซื้อกลับเอง ไม่งั้นโต๊ะค่อยๆ ว่างจนเหลือคนเดียว แล้วคนที่เหลือก็เริ่มมือไม่ได้
       เพราะกติกา "ต้องมีอย่างน้อย 2 คน"

       แต่ซื้อกลับแล้วเล่นต่อทันทีก็ไม่มีอะไรต้องเสีย หมดตัวก็แค่กดซื้อใหม่
       จึงต้องนั่งพักด้วย และพักนานขึ้นทุกครั้งที่ล้ม: ครั้งแรก 1 มือ ครั้งที่สอง 2 มือ ...
       (เพดาน 5 มือ ไม่งั้นบอทที่ซวยติดกันจะหายไปจากโต๊ะยาว จนไม่เหลือคนเล่นด้วย)

       ⚠️ นี่ไม่ใช่แค่บทลงโทษให้ดูสมจริง — บอท "ไม่ชอบโดนพัก" จริงๆ
       จำนวนครั้งที่ล้ม (s.busts) ถูกส่งเข้าไปในหัวบอทที่ decide แล้วกลายเป็น caution
       ยิ่งเคยโดนพักบ่อย ยิ่งต้องการไพ่ดีกว่าเดิมถึงจะสู้ และบลัฟน้อยลง */
    if (st.phase === "waiting" || st.phase === "showdown") {
      for (const b of botSeats()) {
        /* ครบกำหนดพักแล้ว กลับมาเล่นได้ */
        if (bench[b.seatId] !== undefined && st.handNo >= bench[b.seatId]) {
          delete bench[b.seatId];
          if (b.sitOut) room.table.action(b.seatId, { type: "sitout", value: false });
        }
        if (b.stack > 0) continue;

        /* ---------- หมดตัวแล้วจะเอายังไงต่อ: เติมชิป หรือ ลุกให้ตัวอื่นมาแทน ----------
           ⚠️ ต้องเป็นการตัดสินใจของบอทเอง ไม่ใช่เติมให้อัตโนมัติเสมอ
           คนจริงที่หมดตัวก็เลือกสองทางนี้ และเลือกไม่เหมือนกันตามนิสัยกับเงินที่เหลือ
           นักพนันแทบไม่เคยเลิก · มือใหม่โดนสองครั้งก็กลัวแล้วลุก
           มืออาชีพลุกเมื่อโต๊ะนี้ไม่คุ้ม ซึ่งเป็นการตัดสินใจที่ถูกต้อง ไม่ใช่ขี้ขลาด */
        bank.noteBust(b.name);
        if (!wantsRebuy(b)) {
          const gone = b.name, lv = b.botLevel;
          bank.sync(gone, b.wallet, 0, Date.now());
          bank.release(gone);
          delete bench[b.seatId];
          clearTimeout(pending[b.seatId]);
          delete pending[b.seatId];
          room.table.leave(b.seatId);
          /* เรียกตัวใหม่ระดับเดียวกันมานั่งแทน โต๊ะจะได้ไม่ค่อยๆ ว่างลง
             ถ้าระดับนั้นไม่ว่างเลย ก็ปล่อยที่นั่งว่างไว้ ดีกว่าลากตัวที่นั่งโต๊ะอื่นอยู่มา */
          add(1, lv);
          continue;
        }

        room.table.action(b.seatId, { type: "rebuy", amount: BUY_IN });
        /* ซื้อชิปใหม่ = หยิบเงินออกจากกระเป๋าอีกก้อน ติดลบได้ นั่นคือเป็นหนี้ */
        b.wallet = (typeof b.wallet === "number" ? b.wallet : bank.bankrollOf(b.name)) - BUY_IN;
        const penalty = Math.min(Math.max(b.busts || 1, 1), 5);
        room.table.action(b.seatId, { type: "sitout", value: true });
        bench[b.seatId] = st.handNo + penalty;
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

    /* ⚠️ หนี้กดดันการตัดสินใจจริง ไม่ใช่แค่ตัวเลขโชว์
       คนที่เล่นด้วยเงินที่ยืมมา จะไม่กล้าลุยแบบคนที่ยังมีเงินเหลือในกระเป๋า
       ยิ่งเป็นหนี้มาก ยิ่งต้องการไพ่ดีกว่าเดิมถึงจะสู้ และแทบไม่บลัฟ
       เพดานที่ 0.07 เพื่อไม่ให้บอทที่จนกลายเป็นหมอบทุกมือจนเล่นด้วยไม่สนุก */
    /* ⚠️ ต้องวัดจาก "ขึ้นหรือลงจากเงินที่ตัวเองเริ่มมา" ไม่ใช่จากตัวเลขดิบ
       ถ้าเทียบกับเลขคงที่ มืออาชีพที่เริ่มด้วยแสนหนึ่งจะถูกนับว่า "รวย" ตลอดกาล
       แล้วเล่นมั่วขึ้นเรื่อยๆ ซึ่งกลับหัวกลับหางกับความเป็นมืออาชีพ
       สิ่งที่กดดันคนเล่นจริงคือ "ตอนนี้ฉันขาดทุนอยู่หรือเปล่า" ไม่ใช่ยอดในบัญชี

       ผลที่ตามมาโดยธรรมชาติ: มือใหม่ที่มี 5,000 (ซื้อเข้าได้ 2-3 ครั้ง) เสียสองครั้งก็เริ่มกลัวแล้ว
       ส่วนมืออาชีพที่มีแสนหนึ่ง แทบไม่ขยับจากจุดเริ่ม จึงเล่นนิ่งเสมอ — ซึ่งถูกต้อง */
    const purse = (typeof me.wallet === "number" ? me.wallet : 0) + me.stack;
    const start = me.walletStart || 20000;
    const ratio = purse / start;
    const debt = Math.max(0, -(typeof me.wallet === "number" ? me.wallet : 0));
    /* ⚠️ ยอดเงินเองไม่มีเพดาน ติดหนี้เท่าไหร่ก็ได้ กำไรเท่าไหร่ก็ได้
       บอทแต่ละตัวจึงค่อยๆ มีนิสัยของตัวเองจากประวัติที่ต่างกัน
       ส่วน "ผลต่อการตัดสินใจ" ยังต้องมีเพดาน ไม่งั้นบอทที่เจ๊งหนักจะหมอบทุกมือ
       และบอทที่รวยมากจะลุยมั่วทุกมือ — ทั้งคู่เล่นด้วยไม่สนุกพอๆ กัน */
    const downFear = Math.min(Math.max(0, 1 - ratio / 0.5), 1) * 0.10;
    const debtFear = (debt > 0 ? 0.05 : 0) + downFear;
    const boldness = Math.min(Math.max(0, ratio - 1.5) / 2, 1) * 0.06;

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

    const caution = busts * 0.03 + respect + debtFear - boldness;

    const bluffing = Math.random() <
      lv.bluff * crowdFactor * (1 - busts * 0.2) * (debt > 0 ? 0.4 : 1);

    /* เดิมพันต่อเนื่อง: คนที่เป็นคนไล่ก่อนฟลอป มักยิงต่อในฟลอปไม่ว่าไพ่จะออกยังไง
       เพราะเขาแสดงความแข็งไปแล้ว คนอื่นที่ไม่ได้อะไรก็มักทิ้ง
       ใช้ได้เฉพาะตอนคนเหลือน้อย ยิงใส่สามคนคือเผาเงินเปล่า */
    const cbet = !pre && view.phase === "flop" && view.toCall === 0 &&
                 me.lastKind === "raise" && live <= 2 && Math.random() < 0.62;

    const potNow = typeof view.potForBet === "number" ? view.potForBet : view.pot;

    /* ราคาที่ต้องจ่ายเทียบกอง — ตาม 20 ในกอง 500 กับตาม 500 ในกอง 500
       คนละเรื่องกันคนละโลก ระดับที่คิดเรื่องนี้เป็นมีแค่มืออาชีพ */
    const toCall = view.toCall;
    const price = toCall > 0 ? toCall / (potNow + toCall) : 0;

    /* ได้เดินท้ายไหม — หลังฟลอปคนที่อยู่ใกล้ปุ่มดีลเลอร์ที่สุดเป็นคนเดินท้าย
       เรียงคนที่ยังสู้อยู่จากช่องถัดจากปุ่มไปเรื่อยๆ คนสุดท้ายในลิสต์คือคนเดินท้าย */
    let order = [];
    for (let k = 1; k <= view.seats.length; k++) {
      const idx = (view.button + k) % view.seats.length;
      const x = view.seats[idx];
      if (x && x.inHand && !x.folded) order.push(idx);
    }
    const actsLast = order.length > 0 && order[order.length - 1] === seatId;

    const facts = { pre, base, draw, live, me, view, seatId, lv,
                    potNow, toCall, price, caution, crowdFactor, bluffing, cbet, actsLast };

    /* ⚠️ แต่ละระดับใช้ "วิธีคิด" คนละแบบ ไม่ใช่เกณฑ์ชุดเดียวกันปรับตัวเลข
       (ดูคำอธิบายเหนือ decideBeginner / decideGambler / decidePro) */
    const style = STYLE[me.botLevel] || decidePro;
    const msg = style(facts);

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

  /* ให้เครื่องมือทดสอบสั่งบอทลงมือทันทีได้ ไม่ต้องรอเวลาคิดจริง
     (poke ตั้ง setTimeout 0.7-3.4 วิ ต่อหนึ่งท่า จำลองพันมือจะใช้เวลาเป็นชั่วโมง) */
  function _decideNow(seatId) {
    const b = room.table._state.seats[seatId];
    if (!b || !b.isBot) return false;
    decide(seatId, LEVEL[b.botLevel] || LEVEL[2]);
    return true;
  }

  return { add, removeAll, poke, stop, _decideNow, count: () => botSeats().length, LEVEL };
}
