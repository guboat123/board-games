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
/* ---------- นิสัยประจำตัวของบอทแต่ละตัว ----------
   ⚠️ ระดับบอกว่า "คิดยังไง" (มือใหม่ดูว่ามีอะไรไหม · นักพนันไล่ลุ้น · มืออาชีพคิดจากราคา)
   ส่วนตารางนี้บอกว่า "เป็นคนแบบไหน" ซึ่งทำให้สองตัวในระดับเดียวกันไม่เหมือนกัน
   ถ้าไม่มีตารางนี้ Rex กับ Duke จะเล่นเหมือนกันเป๊ะ แล้วการจำว่าใครเป็นใครก็ไม่มีความหมาย

   nerve    ใจถึงแค่ไหน 0=ระวังตัวมาก 1=บ้าบิ่น — คุมทั้งเพดานการลงเงินและเกณฑ์ที่จะไล่
   bluffy   บลัฟบ่อยแค่ไหน (คูณกับค่าประจำระดับ)
   tilt     เสียแล้วเสียศูนย์แค่ไหน 0=นิ่งสนิท 1=เสียแล้วรวน — คูณกับความกลัวจากหนี้/การล้ม
   patience อดทนรอไพ่ดีแค่ไหน 0=เล่นแทบทุกมือ 1=รอเฉพาะมือที่ดีจริง (มีผลก่อนฟลอป)
   label    คำที่คนอ่านเข้าใจ ใช้โชว์ในตารางเงินบอท

   ค่าตั้งใจให้กระจาย ไม่ใช่สุ่ม — จะได้มีทั้งตัวที่น่ากลัว ตัวที่ไล่ออกง่าย และตัวที่จับทางยาก */
const TRAITS = {
  /* --- มือใหม่ --- */
  Milo:    { nerve: 0.30, bluffy: 0.4, tilt: 0.9, patience: 0.7, label: "ขี้กลัว" },
  Pip:     { nerve: 0.45, bluffy: 0.8, tilt: 0.8, patience: 0.4, label: "อยากลอง" },
  Toby:    { nerve: 0.25, bluffy: 0.2, tilt: 1.0, patience: 0.8, label: "ระวังตัวมาก" },
  Bruno:   { nerve: 0.60, bluffy: 0.6, tilt: 0.7, patience: 0.3, label: "ใจถึง" },
  Ozzy:    { nerve: 0.40, bluffy: 1.2, tilt: 0.9, patience: 0.5, label: "ชอบหลอก" },
  Rudy:    { nerve: 0.35, bluffy: 0.3, tilt: 1.1, patience: 0.6, label: "เสียแล้วรวน" },
  Gus:     { nerve: 0.55, bluffy: 0.5, tilt: 0.6, patience: 0.5, label: "เรื่อยๆ" },
  Wally:   { nerve: 0.20, bluffy: 0.1, tilt: 0.8, patience: 0.9, label: "รอไพ่ดีอย่างเดียว" },
  Bobby:   { nerve: 0.50, bluffy: 0.7, tilt: 0.9, patience: 0.4, label: "ใจร้อน" },
  Sammy:   { nerve: 0.38, bluffy: 0.4, tilt: 0.7, patience: 0.6, label: "ธรรมดา" },

  /* --- นักพนัน --- */
  Vince:   { nerve: 0.85, bluffy: 1.3, tilt: 0.9, patience: 0.2, label: "ลุยไม่คิด" },
  Rocco:   { nerve: 0.75, bluffy: 0.9, tilt: 0.7, patience: 0.3, label: "ใจถึง" },
  Gio:     { nerve: 0.60, bluffy: 1.5, tilt: 0.8, patience: 0.4, label: "หลอกเก่ง" },
  Marco:   { nerve: 0.70, bluffy: 0.6, tilt: 1.0, patience: 0.3, label: "เสียแล้วไล่คืน" },
  Sonny:   { nerve: 0.95, bluffy: 1.1, tilt: 0.6, patience: 0.1, label: "บ้าบิ่น" },
  Rico:    { nerve: 0.55, bluffy: 0.8, tilt: 0.9, patience: 0.5, label: "พอประมาณ" },
  Tank:    { nerve: 0.90, bluffy: 0.4, tilt: 0.5, patience: 0.2, label: "ดันอย่างเดียว" },
  Buddy:   { nerve: 0.50, bluffy: 1.0, tilt: 1.1, patience: 0.4, label: "อารมณ์แปรปรวน" },
  Lenny:   { nerve: 0.65, bluffy: 0.7, tilt: 0.8, patience: 0.35, label: "ชอบตาม" },
  Frankie: { nerve: 0.80, bluffy: 1.2, tilt: 0.7, patience: 0.25, label: "กล้าได้กล้าเสีย" },

  /* --- มืออาชีพ --- */
  Rex:     { nerve: 0.70, bluffy: 1.2, tilt: 0.3, patience: 0.7, label: "ดุแต่คุมได้" },
  Duke:    { nerve: 0.40, bluffy: 0.5, tilt: 0.2, patience: 0.9, label: "ตึงมาก" },
  Vega:    { nerve: 0.60, bluffy: 1.4, tilt: 0.4, patience: 0.6, label: "บลัฟเป็นจังหวะ" },
  Otto:    { nerve: 0.50, bluffy: 0.7, tilt: 0.2, patience: 0.8, label: "นิ่ง" },
  Zed:     { nerve: 0.80, bluffy: 1.1, tilt: 0.4, patience: 0.5, label: "กดดันตลอด" },
  Kai:     { nerve: 0.45, bluffy: 0.6, tilt: 0.3, patience: 0.85, label: "อดทน" },
  Nico:    { nerve: 0.65, bluffy: 0.9, tilt: 0.35, patience: 0.65, label: "สมดุล" },
  Sable:   { nerve: 0.55, bluffy: 1.5, tilt: 0.3, patience: 0.7, label: "จับทางยาก" },
  Cole:    { nerve: 0.75, bluffy: 0.8, tilt: 0.25, patience: 0.6, label: "กล้าเมื่อคุ้ม" },
  Ash:     { nerve: 0.35, bluffy: 0.4, tilt: 0.2, patience: 0.95, label: "รอจังหวะเดียว" }
};

const DEFAULT_TRAIT = { nerve: 0.5, bluffy: 1, tilt: 0.7, patience: 0.5, label: "ธรรมดา" };
export function traitOf(name) { return TRAITS[name] || DEFAULT_TRAIT; }

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

/* ---------- นับ "ไพ่ที่ยังลุ้นอยู่" (outs) ----------
   ⚠️ ของเดิมให้คะแนนลุ้นเป็นตัวเลขตายตัว (ฟลัช +0.24 · สเตรทเปิดสองหัว +0.19)
   ซึ่งไม่ตรงกับความจริง เพราะโอกาสจริงขึ้นกับสองอย่างที่ตัวเลขตายตัวมองไม่เห็น:
     · เหลือไพ่จะเปิดอีกกี่ใบ — ที่ฟลอปเหลือสองใบ ที่เทิร์นเหลือใบเดียว โอกาสต่างกันเท่าตัว
     · ลุ้นกี่ทาง — รอไพ่ 4 ใบ กับรอ 9 ใบ คนละเรื่องกัน
   และมันไม่นับ "ลุ้นใบเดียวตรงกลาง" (gutshot) เลย ทั้งที่คนเล่นจริงนับ

   นับ out จริงแล้วแปลงเป็นโอกาสด้วยกฎ 4 กับ 2 ที่คนเล่นใช้กันทั้งโลก:
     เหลือเปิดสองใบ ≈ out × 4%   ·   เหลือเปิดใบเดียว ≈ out × 2%
   ค่าที่ได้เทียบกับ "ราคาที่ต้องจ่าย" ได้ตรงๆ ซึ่งเป็นวิธีที่คนเล่นเป็นใช้ตัดสินว่าจะไล่ต่อไหม

   ⚠️ ทุกอย่างต้องมีไพ่ในมือร่วมด้วย ฟลัชหรือสเตรทที่เกิดจากบอร์ดล้วน เราไม่ได้อะไร
   (คนอื่นก็มีเหมือนกันหมด) นับรวมเข้ามาคือหลอกตัวเองว่ามีลุ้นทั้งที่ตายสนิท */
function countOuts(hole, board) {
  if (!board || board.length < 3 || board.length > 4) return 0;
  const hs = hole.map(toNum).filter(x => x >= 0);
  const bs = board.map(toNum).filter(x => x >= 0);
  if (hs.length < 2 || bs.length < 3) return 0;
  const all = hs.concat(bs);

  let outs = 0;

  /* ---- ลุ้นฟลัช: ดอกหนึ่งมี 13 ใบ เห็นไปแล้ว 4 เหลือลุ้น 9 ---- */
  const suitCount = [0, 0, 0, 0];
  all.forEach(c => suitCount[c & 3]++);
  let flushDraw = false;
  for (let su = 0; su < 4; su++) {
    if (suitCount[su] === 4 && hs.some(c => (c & 3) === su)) { outs += 9; flushDraw = true; }
  }

  /* ---- ลุ้นสเตรท: ไล่ทีละแต้มว่า ถ้าใบนี้ออก จะเรียงห้าใบติดกันได้ไหม ---- */
  const have = new Array(13).fill(false);
  all.forEach(c => { have[c >> 2] = true; });
  const holeRanks = hs.map(c => c >> 2);

  let straightOuts = 0;
  for (let r = 0; r < 13; r++) {
    if (have[r]) continue;
    const withIt = have.slice();
    withIt[r] = true;
    let made = false, usesHole = false;
    for (let start = 0; start <= 8; start++) {
      let run = true;
      for (let k = 0; k < 5; k++) if (!withIt[start + k]) { run = false; break; }
      if (!run) continue;
      made = true;
      if (holeRanks.some(x => x >= start && x <= start + 4)) usesHole = true;
    }
    /* A ใช้เป็นใบต่ำใน A-2-3-4-5 ได้ด้วย */
    if (!made && withIt[12] && withIt[0] && withIt[1] && withIt[2] && withIt[3]) {
      made = true;
      if (holeRanks.some(x => x === 12 || x <= 3)) usesHole = true;
    }
    if (made && usesHole) straightOuts += 4;   /* แต้มนั้นเหลืออยู่ 4 ดอก */
  }

  /* ไพ่ที่นับซ้ำระหว่างลุ้นฟลัชกับลุ้นสเตรท ต้องหักออก ไม่งั้นโอกาสเกินจริง
     โดยประมาณ ไพ่ที่ช่วยสเตรทหนึ่งในสี่ดอก จะเป็นดอกที่เราลุ้นฟลัชอยู่พอดี */
  if (flushDraw && straightOuts > 0) straightOuts -= Math.round(straightOuts / 4);
  outs += straightOuts;

  return Math.min(outs, 15);   /* เกิน 15 out แทบไม่มีจริง */
}

/* โอกาสที่ไพ่ลุ้นจะเข้า แปลงจากจำนวน out ด้วยกฎ 4 กับ 2
   ใช้เป็น "ส่วนเพิ่มของค่ามือ" — บลัฟด้วยมือที่มีลุ้น (semi-bluff) คือบลัฟที่ถูกวิธี
   เพราะถ้าโดนตามก็ยังมีทางชนะ ต่างจากบลัฟด้วยไพ่ที่ไม่มีอะไรเลย */
function drawStrength(hole, board) {
  const outs = countOuts(hole, board);
  if (!outs) return 0;
  const toCome = board.length === 3 ? 2 : 1;
  return Math.min(outs * (toCome === 2 ? 0.04 : 0.02), 0.55);
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

/* ---------- หน้าไพ่กลาง เปียกหรือแห้ง ----------
   ⚠️ ต้องประเมินใหม่ทุกครั้งที่เปิดไพ่กลางเพิ่ม ไม่ใช่คิดครั้งเดียวตอนต้นมือ
   บอร์ดที่มีดอกเดียวกันสามใบ หรือเรียงติดกัน = "เปียก" มีมือแรงๆ เป็นไปได้เยอะ
   หนึ่งคู่บนบอร์ดแบบนั้นแทบไม่มีค่า และเดิมพันของคนอื่นก็น่าเชื่อน้อยลง (บลัฟง่าย)
   บอร์ด "แห้ง" (ไพ่กระจาย ดอกต่างกัน) หนึ่งคู่ยังใช้ได้ และคนที่ดันมักมีของจริง
   คืน 0 = แห้งสนิท · 1 = เปียกมาก */
function boardWetness(board) {
  if (!board || board.length < 3) return 0;
  const cs = board.map(toNum).filter(x => x >= 0);
  if (cs.length < 3) return 0;

  let w = 0;
  const suits = [0, 0, 0, 0];
  cs.forEach(c => suits[c & 3]++);
  const maxSuit = Math.max.apply(null, suits);
  if (maxSuit >= 4) w += 0.55;
  else if (maxSuit === 3) w += 0.35;

  const ranks = cs.map(c => c >> 2).sort((a, b) => a - b);
  let connect = 0;
  for (let i = 1; i < ranks.length; i++) {
    const gap = ranks[i] - ranks[i - 1];
    if (gap === 0) continue;
    if (gap <= 2) connect++;
  }
  w += Math.min(connect, 3) * 0.13;

  /* บอร์ดมีคู่ = มีโอกาสเป็นตอง/ฟูลเฮาส์ ทำให้มือกลางๆ อันตรายขึ้น */
  const counts = {};
  ranks.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  if (Object.keys(counts).some(k => counts[k] >= 2)) w += 0.12;

  return Math.max(0, Math.min(1, w));
}

/* ---------- เพดานการลงเงินต่อหนึ่งท่า ----------
   ⚠️ นี่คือสิ่งที่ทำให้ "เงินรู้สึกเป็นเงินจริง" มากกว่าเกณฑ์ตัดสินใจทั้งหมดรวมกัน
   ของเดิมไม่มีเพดานเลย ขนาดเดิมพัน = เงินสูงสุดบนโต๊ะ + ขั้นต่ำ + สัดส่วนของกอง
   พอไล่ทับกันไปมา ยอดจะพุ่งเกินตักแล้วถูกตัดเป็นลงหมดหน้าตักโดยอัตโนมัติ
   วัดจริงได้: นักพนันเดิมพันเฉลี่ย 19.5 เท่าของกอง และมีคนหมดตัก ~1 คนต่อมือ
   ซึ่งไม่เหมือนคนเล่นด้วยเงินตัวเองเลย

   หลักคือ "ยิ่งมั่นใจยิ่งกล้าลงเยอะ" ไม่ใช่ลงเยอะตลอดเวลา
   และคนที่กระเป๋าบางต้องลงน้อยลงอีก เพราะเขามีน้อยจะเสีย */
function commitCap(eq, walletPressure, nerve) {
  var base;
  if (eq >= 0.90) base = 1.00;       /* มือแทบชนะแน่ ลงได้หมด */
  else if (eq >= 0.80) base = 0.55;
  else if (eq >= 0.68) base = 0.32;
  else if (eq >= 0.52) base = 0.18;
  else base = 0.10;                  /* มือกลางๆ ห้ามเสี่ยงเกินหนึ่งในสิบของตัก */
  /* ใจถึงหรือระวังตัว มีผลตรงนี้มากที่สุด — คนใจถึงกล้าใส่เงินมากกว่าด้วยไพ่เท่ากัน
     ช่วง 0.65 ถึง 1.35 เท่า พอให้รู้สึกต่าง แต่ไม่ถึงกับคนละเกม */
  var byNerve = 0.65 + (nerve === undefined ? 0.5 : nerve) * 0.7;
  return base * byNerve * (1 - walletPressure * 0.45);
}

/* คิดยอดเรซจริง โดยไม่ให้เกินทั้งเพดานเทียบกอง และเพดานเทียบตัก */
function raiseTo(f, eq, potMult) {
  var minTarget = f.view.currentBet + f.view.minRaise;
  var want = minTarget + Math.round(f.potNow * potMult);

  /* เพดานเทียบกอง: เดิมพันเกินกองมากๆ ไม่มีเหตุผลรองรับ นอกจากมือแทบชนะแน่ */
  var potCeil = f.view.currentBet + Math.round(f.potNow * (eq >= 0.9 ? 2.5 : 1.3));
  /* เพดานเทียบตัก: ห้ามใส่เงินเข้าไปในมือนี้เกินสัดส่วนที่มั่นใจ */
  var stackCeil = f.me.bet + Math.round(f.me.stack * commitCap(eq, f.walletPressure || 0, f.trait.nerve));

  var target = Math.min(want, Math.max(potCeil, minTarget), Math.max(stackCeil, minTarget));
  /* ต่ำกว่าขั้นต่ำไม่ได้ และเกินที่มีก็ไม่ได้ */
  target = Math.max(minTarget, Math.min(f.me.bet + f.me.stack, target));
  /* เหลือน้อยกว่าขั้นต่ำอีกนิดเดียว ลงหมดไปเลยดีกว่าค้างเศษไว้ */
  if (f.me.bet + f.me.stack - target < f.view.blinds.bb) target = f.me.bet + f.me.stack;
  return { type: "act", action: "raise", amount: target };
}

/* ---------- 1 มือใหม่ ---------- */
function decideBeginner(f) {
  /* ขนาดเดิมพันมั่วๆ ครึ่งกองบ้าง เท่ากองบ้าง ไม่มีเหตุผลรองรับ
     แต่ยังต้องอยู่ในเพดานเทียบตัก มือใหม่ก็ไม่ได้อยากหมดตัวทุกมือ */
  const bet = () => raiseTo(f, f.base, 0.4 + Math.random() * 0.6);

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
  /* ลงเงินไปแล้วยิ่งไม่อยากทิ้ง (sunk cost) ซึ่งเป็นนิสัยของนักพนันจริงๆ
     ไม่ใช่ข้อผิดพลาดในโค้ด — เป็นจุดอ่อนที่ตั้งใจให้มี คนเล่นจะได้จับทางได้ */
  const committed = f.me.bet > 0 ? 0.10 : 0;
  /* ไล่ลุ้นทุกทาง ให้น้ำหนักไพ่ลุ้นมากกว่าที่ควรเกือบเท่าตัว */
  const chase = f.draw * 1.8;
  const eq = Math.min(1, f.base + chase);

  const shove = () => ({ type: "act", action: "raise", amount: f.me.bet + f.me.stack });
  const bet = (mult) => raiseTo(f, eq, mult);

  /* ⚠️ ลางสังหรณ์ยังมีได้ แต่ต้องหายากกว่านี้มาก และต้องมีอะไรในมือบ้าง
     ของเดิม 3.5% ต่อ "หนึ่งการตัดสินใจ" ซึ่งมือหนึ่งตัดสินใจ 3-4 ครั้ง คูณบอท 4 ตัว
     = มีคนลงหมดหน้าตักเกือบทุกมือ (วัดได้ 0.93 คนต่อมือ) ซึ่งไม่ใช่นักพนัน แต่เป็นคนบ้า
     ลุยหมดตักตอนไพ่ไม่มีอะไรเลย ยังไงก็แพ้ ไม่ใช่การพนัน เป็นการทิ้งเงิน */
  if (Math.random() < 0.006 && f.me.stack > 0 && f.live <= 2 && eq >= 0.45) return shove();

  if (f.toCall === 0) {
    if (eq >= 0.42 || Math.random() < 0.28) return bet(0.5 + Math.random() * 0.8);
    return { type: "act", action: "check" };
  }
  if (eq >= 0.80) return bet(0.9 + Math.random());
  /* นักพนันก็พอเดาออกเหมือนกัน แต่ให้น้ำหนักน้อยมาก เพราะความอยากอยู่ในมือชนะเหตุผลเสมอ
     (ตั้งใจให้เป็นแบบนี้ ไม่ใช่ลืมใส่) */
  const wary = Math.min(Math.max(0, f.threat - eq), 0.4) * 0.08;
  /* ตามกว้างกว่าราคาที่ควรมาก ยอมจ่ายแพงเพื่อจะได้อยู่ในมือต่อ */
  if (eq >= f.price - 0.18 - committed + wary) return { type: "act", action: "call" };
  return { type: "act", action: "fold" };
}

/* ---------- 3 มืออาชีพ ---------- */
function decidePro(f) {
  const lv = f.lv;
  /* ⚠️ มือเดียวกันบนบอร์ดต่างกัน มีค่าไม่เท่ากัน
     หนึ่งคู่บนบอร์ดสามดอกเดียวกัน แทบไม่มีค่า แต่บนบอร์ดแห้งยังใช้สู้ได้
     ยิ่งมือกลางๆ ยิ่งโดนหักเยอะ ส่วนมือแรงจริง (ตองขึ้นไป) แทบไม่กระทบ */
  const fragile = Math.max(0, 0.72 - f.base) * f.wet * 0.5;
  const eq = Math.max(0, Math.min(1, f.base + f.draw - fragile + (f.bluffing ? 0.26 : 0) +
                                     (Math.random() - 0.5) * 0.08));

  /* ตำแหน่งมีผลจริง: ได้เดินท้ายแปลว่าเห็นคนอื่นตัดสินใจก่อน เล่นกว้างขึ้นได้
     คนที่ต้องเดินก่อนเป็นฝ่ายเสียเปรียบ ต้องมือแน่นกว่า
     นี่คือสิ่งที่แยกคนเล่นเป็นออกจากคนเล่นตามความรู้สึกชัดที่สุด */
  const latePos = f.actsLast ? -0.03 : 0.02;

  /* ⚠️ อ่านคนเป็นคือสิ่งที่แยกมืออาชีพออกจากคนอื่นจริงๆ
     ถ้าเดาว่าคู่แข่งแรงกว่ามือเรา ต้องใช้ไพ่ดีกว่าเดิมถึงจะสู้ — ไม่ใช่ดูแค่ราคาคุ้มไหม */
  const readGap = Math.min(Math.max(0, f.threat - eq), 0.4) * 0.30;

  /* ⚠️ และต้องกล้าจับบลัฟด้วย ไม่ใช่กลัวทุกคนที่ดัน
     ถ้าท่าที่เขาแสดงเชื่อถือได้ต่ำ (บลัฟเป็นนิสัย · ยิงต่ออัตโนมัติ · เดิมพันขั้วสุด · ตัวต่อตัว)
     ให้ตามเบามือลง คนที่ไม่เคยจับบลัฟเลยจะถูกไล่ออกจากมือทุกครั้งที่ไม่ได้ไพ่ดี
     ซึ่งแพ้ทางคนที่บลัฟเป็นแบบไม่มีทางสู้ */
  const catchBluff = Math.max(0, 0.6 - f.threatCred) * 0.22;

  const margin = (f.pre ? lv.preMargin : lv.margin) + f.caution + latePos + readGap - catchBluff;
  const raiseAt = f.pre ? lv.preRaise : lv.raise;
  const worthCalling = f.toCall === 0 || eq >= f.price + margin;

  /* ไม่เรซทับเดิมพันก้อนใหญ่ด้วยมือกลางๆ ไม่งั้นบอทจะสาดกันไปมาไม่จบ */
  const facingBig = f.toCall > f.me.stack * 0.3;
  const canRaise = f.me.stack > f.toCall && eq >= raiseAt && (!facingBig || eq >= 0.82);

  const sized = (mult) => raiseTo(f, eq, mult);

  /* ---------- สร้างกองเมื่อคิดว่าจะชนะ ----------
     ⚠️ เดิมพันใหญ่ที่สุดเท่าที่ทำได้ ไม่ใช่การเล่นที่ดี มันไล่คนออกจากมือ
     มือแรงต้องการ "คนตาม" ไม่ใช่ "คนหมอบ" — ได้กองเล็กที่มีคนตามสามสตรีท
     ยังมากกว่าได้กองใหญ่ที่ไม่มีใครสู้
     ขนาดจึงอิงว่า "เขาน่าจะตามแค่ไหน" ซึ่งก็คือค่าที่เราเดามือเขาไว้
     เขาดูมีของ = เดิมพันใหญ่ได้ เขาดูไม่มีอะไร = ต้องเล็กลงไม่งั้นเขาทิ้ง
     ยกเว้นริเวอร์ที่มือแทบชนะแน่ ตอนนั้นเขาลงมาเยอะแล้ว เดิมพันใหญ่ได้เต็มที่ */
  const river = f.view.phase === "river";
  function valueMult() {
    if (eq >= 0.9 && river) return 0.9 + Math.random() * 0.5;
    return 0.4 + f.threat * 0.65 + Math.random() * 0.15;
  }

  /* ⚠️ ลงเงินไปแล้วเกินครึ่งของที่มี แล้วยังได้ราคาดี = ทิ้งไม่ได้
     คนจริงไม่หมอบทิ้งเงินครึ่งตักที่ลงไปแล้วเพราะไพ่ขาดไปนิดเดียว
     ของเดิมคิดจาก "คุ้มไหมถ้าเริ่มนับใหม่ตอนนี้" ซึ่งถูกในทางทฤษฎี
     แต่ทำให้บอทหมอบในจังหวะที่ไม่มีคนไหนหมอบ = ดูไม่เหมือนคน */
  const potCommitted = f.me.bet + (f.me.stack > 0 ? 0 : 0) >= 0 &&
                       f.toCall > 0 && f.toCall <= f.me.stack &&
                       f.me.bet >= f.me.stack * 0.9 && f.price < 0.45;

  if (canRaise && !f.plan.trap) {
    return sized(eq >= 0.72 ? valueMult() : lv.sizing * (0.6 + Math.random() * 0.7));
  }
  if (f.toCall === 0) {
    /* แกล้งอ่อนด้วยมือแรงมาก: เคาะผ่านเพื่อให้คนอื่นกล้าเดิมพัน แล้วค่อยเก็บทีหลัง */
    if (f.plan.trap) return { type: "act", action: "check" };
    if ((eq >= lv.bet || f.cbet) && f.me.stack > f.view.blinds.bb) {
      return sized(eq >= 0.72 ? valueMult() : lv.sizing * (0.5 + Math.random() * 0.6));
    }
    return { type: "act", action: "check" };
  }
  if (worthCalling || potCommitted) return { type: "act", action: "call" };
  /* บลัฟแล้วโดนสู้กลับ ต้องรู้จักเลิก ไม่ใช่ยิงต่อจนหมดตัว */
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

  /* ---------- แผนประจำสตรีทของบอทแต่ละตัว ----------
     ⚠️ นี่คือสิ่งที่ทำให้บอท "ดูเหมือนคน" มากที่สุดในบรรดาทั้งหมด
     ของเดิมทอยลูกเต๋าใหม่ทุกครั้งที่ถูกถามว่าจะทำอะไร บอทตัวเดียวกันในรอบเดิมพันเดียวกัน
     จึงบลัฟบ้าง ไม่บลัฟบ้าง สลับไปมา — คนดูอยู่เห็นแล้วอ่านไม่ออกว่ามันคิดอะไร
     ซึ่งตรงกับที่เจ้าของบอกว่า "action งงๆ ไม่ makesense"

     คนจริงตัดสินใจ "แนวทางของรอบนี้" ครั้งเดียวตอนเห็นไพ่ใหม่ แล้วเดินตามนั้น
     จะบลัฟ ก็บลัฟทั้งรอบ · จะแกล้งอ่อน ก็แกล้งทั้งรอบ · เปลี่ยนใจเมื่อมีข้อมูลใหม่จริงๆ เท่านั้น */
  const plans = {};   /* seatId -> { key, bluff, trap, giveUp } */

  function planFor(seatId, view, base, trait, lv, wet) {
    const key = view.handNo + "|" + view.phase;
    const p = plans[seatId];
    if (p && p.key === key) return p;

    /* บลัฟเป็น "แผนของรอบนี้" ไม่ใช่การทอยใหม่ทุกท่า
       ยิ่งคนเหลือน้อยยิ่งคุ้ม ยิ่งบอร์ดเปียกยิ่งเชื่อได้ (อ้างว่าติดชุดง่าย) */
    const crowd = view.seats.filter(function (x, i) {
      return x && x.inHand && !x.folded && i !== seatId;
    }).length;
    const crowdOk = crowd <= 1 ? 1.6 : (crowd === 2 ? 0.9 : 0.25);
    const bluff = base < 0.5 &&
                  Math.random() < lv.bluff * trait.bluffy * crowdOk * (0.7 + wet * 0.6);

    /* แกล้งอ่อนด้วยมือแรงมาก (slow play) — คนจริงทำเพื่อให้คนอื่นกล้าลงเงิน
       เดิมพันทันทีทุกครั้งที่ได้มือแรง = อ่านง่ายเกินไป และได้กองเล็กกว่าที่ควร
       ทำเฉพาะตอนคนเหลือน้อยและบอร์ดไม่เปียก ไม่งั้นแกล้งอ่อนแล้วโดนแซงฟรีๆ */
    const trap = base >= 0.86 && crowd <= 2 && wet < 0.4 &&
                 Math.random() < (0.34 * (1.2 - trait.nerve));

    /* ยิงบลัฟแล้วต้องรู้ด้วยว่าจะเลิกเมื่อไหร่
       คนที่ยิงต่อไปเรื่อยๆ ทุกสตรีทจนหมดตัวไม่ใช่คนบลัฟเป็น เป็นคนไม่ยอมแพ้
       ใจถึงมาก = ยิงได้หลายกระบอกกว่า */
    const giveUp = Math.random() < (0.55 - trait.nerve * 0.3);

    plans[seatId] = { key: key, bluff: bluff, trap: trap, giveUp: giveUp };
    return plans[seatId];
  }
  let seenThisHand = {};    /* เก็บไพ่ของใครไปแล้วบ้างในมือนี้ (กันนับซ้ำ) */

  /* ---------- เดาว่าคนอื่นถืออะไร ----------
     ⚠️ ห้ามแอบดูไพ่ใคร บอทเห็นเท่าที่คนนั่งข้างๆ เห็น: ท่าที่เขาเดิน กับจำนวนเงินที่เขาลง
     เก็บ "ประวัติท่าในมือนี้" ไว้ต่อที่นั่ง แล้วแปลงเป็นค่าประมาณความแรงของมือเขา
     คนดันสองครั้งในมือเดียว มักไม่ได้ถือไพ่ขยะ — นั่นคือข้อมูล ไม่ใช่การโกง
     ต่างจาก reads (ความจำข้ามมือจากไพ่ที่เคยเปิด) ตัวนี้เป็นของ "มือนี้เท่านั้น" */
  let actHand = -1;
  const acts = {};          /* seatId -> { raises, calls, checks, preRaise, streetRaise, sig } */

  function trackActions(st) {
    if (st.handNo !== actHand) {
      actHand = st.handNo;
      for (const k in acts) delete acts[k];
    }
    for (let i = 0; i < st.seats.length; i++) {
      const x = st.seats[i];
      if (!x) { delete acts[i]; continue; }
      const rec = acts[i] ||
        (acts[i] = { raises: 0, calls: 0, checks: 0, preRaise: 0, streetRaise: 0,
                     phase: "", sig: "", turnAt: 0, lastMs: 0 });
      /* ⚠️ จับเวลาที่เขาใช้คิด — เป็นข้อมูลที่คนนั่งโต๊ะเดียวกันเห็นเหมือนกันหมด ไม่ใช่การโกง
         เริ่มจับตอนถึงตาเขา หยุดตอนท่าเขาเปลี่ยน */
      if (st.current === i && !rec.turnAt) rec.turnAt = Date.now();
      if (st.current !== i && rec.turnAt) {
        rec.lastMs = Date.now() - rec.turnAt;
        rec.turnAt = 0;
      }
      /* ขึ้นสตรีทใหม่ ให้เริ่มนับการดันของสตรีทนั้นใหม่
         "ดันหนึ่งครั้งในฟลอป" กับ "ดันครั้งที่สามในริเวอร์" คนละความหมายกันคนละโลก */
      if (rec.phase !== st.phase) { rec.phase = st.phase; rec.streetRaise = 0; }
      const sig = (x.lastKind || "") + "|" + (x.lastAction || "") + "|" + x.bet;
      if (!x.lastKind || sig === rec.sig) continue;
      rec.sig = sig;
      if (x.lastKind === "raise" || x.lastKind === "bet") {
        rec.raises++;
        rec.streetRaise++;
        if (st.phase === "preflop") rec.preRaise++;
      } else if (x.lastKind === "call") rec.calls++;
      else if (x.lastKind === "check") rec.checks++;
    }
  }

  const NEUTRAL = 0.45;   /* ค่ากลางของมือที่ "ยอมลงเงินเล่นต่อ" ไม่ใช่ของไพ่สุ่มทั้งสำรับ */

  /* ---------- (ก) เขากำลังอ้างว่ามือแรงแค่ไหน ---------- */
  function claimedStrength(view, i) {
    const x = view.seats[i];
    if (!x || !x.inHand || x.folded) return 0;
    const a = acts[i] || { raises: 0, calls: 0, checks: 0 };

    let g = NEUTRAL;
    g += Math.min(a.raises, 3) * 0.13;   /* ดันหนึ่งครั้ง = อ้างว่าแรงขึ้นชัดเจน */
    g += Math.min(a.calls, 3) * 0.02;    /* ตามเฉยๆ บอกอะไรน้อยมาก */
    g -= Math.min(a.checks, 3) * 0.045;  /* เคาะผ่านบ่อย มักไม่มีอะไร */

    const potNow = typeof view.potForBet === "number" ? view.potForBet : view.pot;
    if (potNow > 0 && x.bet > 0) g += Math.min(x.bet / potNow, 1.5) * 0.06;
    if (x.allIn) g += 0.05;

    return Math.max(0.05, Math.min(0.95, g));
  }

  /* ---------- (ข) ที่เขาอ้าง เชื่อได้แค่ไหน ----------
     ⚠️ ส่วนนี้คือหัวใจ ถ้าเชื่อทุกท่าที่เห็นตรงๆ บอทจะโดนบลัฟไล่ออกจากมือทุกครั้ง
     คนเล่นเป็นไม่ได้ถามว่า "เขาดันไหม" แต่ถามว่า "ในสถานการณ์นี้ เขาดันด้วยของจริงบ่อยแค่ไหน"

     สิ่งที่ทำให้ท่าดัน "เชื่อได้น้อยลง":
       · คนนั้นเคยเปิดไพ่ขยะให้เห็นบ่อย = บลัฟเป็นนิสัย
       · ยิงต่อในฟลอปหลังเป็นคนไล่ก่อนฟลอป = ท่าอัตโนมัติ แทบไม่ได้บอกอะไร
       · เดิมพันใหญ่เกินกอง = ขั้วสุด ไม่ของจริงก็ลมเปล่า จึงเชื่อได้แค่ครึ่งเดียว
       · ตัวต่อตัว = ขโมยกองง่าย บลัฟคุ้ม
     สิ่งที่ทำให้ "เชื่อได้มากขึ้น":
       · มีคนอยู่ในมือหลายคน = บลัฟผ่านยาก แทบไม่มีใครกล้า
       · ดันซ้ำในสตรีทเดียวกัน (เรซทับ) = คนบลัฟส่วนใหญ่ไม่ยิงซ้ำ
       · ยังดันอยู่ถึงริเวอร์ = ผ่านด่านมาหมดแล้ว */
  function credibility(view, i, live) {
    const x = view.seats[i];
    const a = acts[i] || { raises: 0, streetRaise: 0, preRaise: 0 };
    let c = 0.72;

    const rd = readOf(x.name);
    if (rd.n >= 3) c -= (rd.weak - rd.strong) / rd.n * 0.35;

    c += Math.min(Math.max(live - 1, 0), 3) * 0.06;
    if (view.phase === "flop" && a.preRaise > 0 && a.streetRaise === 1) c -= 0.18;
    if (a.streetRaise >= 2) c += 0.14;
    if (view.phase === "river" && a.streetRaise >= 1) c += 0.08;

    const potNow = typeof view.potForBet === "number" ? view.potForBet : view.pot;
    if (potNow > 0 && x.bet > potNow * 1.2) c -= 0.12;
    if (live <= 1) c -= 0.10;

    /* ⚠️ เวลาที่เขาใช้ตัดสินใจก็เป็นข้อมูล
       ลงเงินทันทีแทบไม่คิด = ท่าที่เตรียมไว้อยู่แล้ว (ยิงต่ออัตโนมัติ หรือบลัฟที่วางแผนไว้)
         คนที่ถือของจริงมักหยุดคิดว่า "จะเอาเท่าไหร่ถึงจะมีคนตาม" อย่างน้อยแวบหนึ่ง
       นั่งคิดนานแล้วค่อยลง = ชั่งน้ำหนักจริง มักมีของ หรืออย่างน้อยก็ตั้งใจ
       ผลไม่แรง (±0.1) เพราะเป็นสัญญาณอ่อน ใช้ประกอบ ไม่ใช่ใช้ตัดสิน */
    if (a.lastMs > 0 && (a.streetRaise > 0 || x.bet > 0)) {
      if (a.lastMs < 900) c -= 0.10;
      else if (a.lastMs > 3200) c += 0.08;
    }

    return Math.max(0.15, Math.min(0.95, c));
  }

  /* ---------- (ค) รวมสองอย่าง = สิ่งที่ควรกลัวจริง ----------
     ไม่ใช่ "เขาอ้างว่าแรงเท่าไหร่" และไม่ใช่ "ไม่เชื่อเลย" แต่คือค่าเฉลี่ยถ่วงน้ำหนัก
     เชื่อ 100% → กลัวเท่าที่เขาอ้าง · เชื่อ 0% → กลับไปที่ค่ากลาง เหมือนไม่มีข้อมูล */
  function guessStrength(view, i, live) {
    const claimed = claimedStrength(view, i);
    if (claimed === 0) return 0;
    const cred = credibility(view, i, live);
    return NEUTRAL + (claimed - NEUTRAL) * cred;
  }
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

  /* ---------- เวลาคิด ----------
     ⚠️ ของเดิมสุ่มในช่วงเดียวตลอด ทุกการตัดสินใจใช้เวลาเท่ากันหมด
     คนจริงไม่เป็นแบบนั้น: ไพ่ขยะเจอเดิมพันใหญ่ = ทิ้งแทบทันที
     ส่วนจังหวะที่ก้ำกึ่งจริงๆ (ราคาพอดีกับมือ) จะนั่งคิดนาน
     เวลาคิดคือสิ่งที่คนอีกฝั่งโต๊ะอ่านได้ ถ้ามันคงที่ ทุกคนรู้ทันทีว่าเป็นเครื่อง */
  function thinkMs(lv, view, me) {
    const lo = lv.think[0], hi = lv.think[1];
    if (!me || !me.cards || !me.cards.length) return lo;
    const potNow = typeof view.potForBet === "number" ? view.potForBet : view.pot;
    const price = view.toCall > 0 ? view.toCall / (potNow + view.toCall) : 0;
    const eq = view.phase === "preflop" ? preflopStrength(me.cards)
                                        : madeStrength(me.cards, view.board);
    /* ยิ่งใกล้เส้นตัดสินใจ ยิ่งคิดนาน · ห่างจากเส้นมาก = ตอบได้เลย */
    const close = 1 - Math.min(Math.abs(eq - price - 0.05) / 0.35, 1);
    let ms = lo + (hi - lo) * (0.25 + close * 0.75);
    /* กองใหญ่ก็คิดนานขึ้นอีกหน่อย เงินเยอะขึ้นคนก็ลังเลขึ้น */
    if (potNow > 0 && view.toCall > potNow * 0.6) ms *= 1.25;
    /* ไม่มีอะไรต้องคิด (เคาะผ่านฟรี) ตอบเร็ว */
    if (view.toCall === 0 && eq < 0.4) ms *= 0.45;
    return Math.round(ms * (0.85 + Math.random() * 0.3));
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
    trackActions(st);
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
    const wait = thinkMs(lv, view, me);

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
    /* นิสัยประจำตัว — ผูกกับ "ชื่อ" ไม่ใช่ระดับ สองตัวในระดับเดียวกันจึงไม่เหมือนกัน */
    const trait = traitOf(me.name);

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
    /* ⚠️ ความกลัวต้องคูณด้วยนิสัย "เสียแล้วรวนแค่ไหน" (tilt)
       Otto ที่นิ่ง (0.2) เสียไปครึ่งตักก็ยังเล่นเหมือนเดิม
       Rudy ที่รวนง่าย (1.1) เสียเท่ากันแล้วเล่นคนละคน — นั่นคือสิ่งที่ทำให้จำแต่ละตัวได้ */
    const downFear = Math.min(Math.max(0, 1 - ratio / 0.5), 1) * 0.10 * trait.tilt;
    const debtFear = (debt > 0 ? 0.05 * trait.tilt : 0) + downFear;
    /* คนใจถึงได้กำไรแล้วยิ่งกล้า คนระวังตัวได้กำไรก็ยังระวังเหมือนเดิม */
    const boldness = Math.min(Math.max(0, ratio - 1.5) / 2, 1) * 0.06 * (0.4 + trait.nerve);

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

    /* ความอดทนมีผลก่อนฟลอปเป็นหลัก — คนอดทนรอมือดี คนใจร้อนเล่นแทบทุกมือ
       ช่วง ±0.05 พอให้ความถี่การเล่นต่างกันเห็นได้ใน 20-30 มือ */
    const patienceGap = pre ? (trait.patience - 0.5) * 0.10 : 0;
    const caution = busts * 0.03 + respect + debtFear - boldness + patienceGap;

    /* ⚠️ ต้องประเมินหน้าไพ่กลางก่อน "แผนประจำสตรีท" เพราะแผนใช้ค่านี้
       เคยประกาศไว้ทีหลังแล้วชนกฎ temporal dead zone ของ const — บอทพังทั้งตัว
       จับได้ตอนรันจำลอง ไม่ใช่ตอน node --check ซึ่งมองไม่เห็นลำดับการทำงาน
       และต้องประเมินใหม่ทุกครั้งที่ตัดสินใจ ค่ามือขึ้นกับบอร์ดที่เปิดมา ไม่คงที่ทั้งมือ */
    const wet = pre ? 0 : boardWetness(view.board);

    /* แผนของรอบเดิมพันนี้ ตัดสินครั้งเดียวแล้วเดินตาม (ดู planFor)
       ยังคูณด้วยสภาพจิตใจตอนนี้: ล้มมาเยอะหรือเป็นหนี้ ก็ไม่ค่อยกล้าบลัฟ */
    const plan = planFor(seatId, view, base, trait, lv, wet);
    const bluffing = plan.bluff && !(busts >= 2 && Math.random() < 0.5) &&
                     !(debt > 0 && Math.random() < 0.6);

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

    /* ⚠️ แรงกดดันจากกระเป๋าต้องส่งเข้าไปถึงตัวคิด "ขนาดเดิมพัน" ด้วย ไม่ใช่แค่เกณฑ์ตาม
       คนที่เหลือเงินน้อยไม่ได้แค่ตามน้อยลง เขาลงเงินต่อครั้งน้อยลงด้วย
       0 = สบายมาก · 1 = จนถึงขั้นต้องระวังทุกบาท */
    const walletPressure = Math.min(1, Math.max(0, 1 - ratio) + (debt > 0 ? 0.4 : 0));

    /* ⚠️ เดาว่าคู่แข่งที่ยังสู้อยู่ "น่าจะถืออะไร" แล้วเอาตัวที่แรงที่สุดมาเป็นตัววัด
       ของเดิมบอทสู้กับ "ราคา" อย่างเดียว โดยไม่สนว่าคนที่ดันมาน่าจะมีอะไร
       ซึ่งเป็นเหตุผลที่มันดูกล้าแบบไม่มีเหตุผล — มันไม่ได้กำลังไม่กลัว มันแค่ไม่รู้ */
    let threat = 0, threatName = "", threatCred = 1;
    view.seats.forEach(function (x, i) {
      if (i === seatId || !x || !x.inHand || x.folded) return;
      const g = guessStrength(view, i, live);
      if (g > threat) {
        threat = g;
        threatName = x.name;
        threatCred = credibility(view, i, live);
      }
    });

    const facts = { pre, base, draw, live, me, view, seatId, lv, walletPressure, trait, wet, plan,
                    potNow, toCall, price, caution, crowdFactor, bluffing, cbet, actsLast,
                    threat, threatName, threatCred };

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
