/* ===========================================================
   เครื่องยนต์โป๊กเกอร์ — Texas Hold'em
   ไฟล์นี้เป็นตรรกะล้วน ไม่ยุ่งกับเน็ตเวิร์กหรือหน้าจอ
   ทดสอบแยกได้ด้วย node

   ไพ่แทนด้วยเลข 0-51
     rank = card >> 2   ->  0=สอง 1=สาม ... 8=สิบ 9=J 10=Q 11=K 12=A
     suit = card & 3    ->  0=โพดำ 1=โพแดง 2=ดอกจิก 3=ข้าวหลามตัด
   =========================================================== */

export const RANK_CHARS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
export const SUIT_CHARS = ["s","h","c","d"];

export function cardCode(c) {
  return RANK_CHARS[c >> 2] + SUIT_CHARS[c & 3];
}

/* ---------- สำรับ ---------- */

export function freshDeck() {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

/* สับไพ่แบบ Fisher-Yates ใช้ตัวสุ่มที่ส่งเข้ามา จะได้ทดสอบซ้ำได้ */
export function shuffle(deck, rnd = Math.random) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}

/* ===========================================================
   ประเมินไพ่ 7 ใบ หาชุดที่ดีที่สุด 5 ใบ
   คืน array เทียบกันได้ทีละช่อง ค่ามากกว่าคือดีกว่า
     [หมวด, ตัวตัดสิน1, ตัวตัดสิน2, ...]
   หมวด: 8 สเตรทฟลัช · 7 โฟร์ · 6 ฟูลเฮาส์ · 5 ฟลัช
         4 สเตรท · 3 ตอง · 2 ทูแพร์ · 1 วันแพร์ · 0 ไฮการ์ด
   =========================================================== */

/* ศัพท์โป๊กเกอร์ใช้อังกฤษตามที่เจ้าของสั่ง (คำทับศัพท์ไทยอ่านแล้วงงกว่า)
   หน้าอธิบายชุดไพ่ในเกมใช้ชื่อชุดเดียวกันนี้ ต้องแก้ให้ตรงกันเสมอ */
export const HAND_NAMES = [
  "High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight",
  "Flush", "Full House", "Four of a Kind", "Straight Flush"
];

/* หาไพ่เรียงสูงสุดจากตารางว่ามีแต้มไหนบ้าง คืน rank ของใบสูงสุด หรือ -1 */
function topStraight(has) {
  for (let hi = 12; hi >= 4; hi--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!has[hi - k]) { ok = false; break; }
    if (ok) return hi;
  }
  /* A-2-3-4-5 ใบสูงสุดคือ 5 */
  if (has[12] && has[0] && has[1] && has[2] && has[3]) return 3;
  return -1;
}

export function evaluate7(cards) {
  const count = new Array(13).fill(0);
  const bySuit = [[], [], [], []];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    count[c >> 2]++;
    bySuit[c & 3].push(c >> 2);
  }

  /* ฟลัช / สเตรทฟลัช */
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (bySuit[s].length >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const has = new Array(13).fill(false);
    for (const r of bySuit[flushSuit]) has[r] = true;
    const sf = topStraight(has);
    if (sf >= 0) return [8, sf];
  }

  /* จัดกลุ่มตามจำนวนใบซ้ำ เรียงจากซ้ำมาก แต้มสูง */
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) {
    if (count[r] === 4) quads.push(r);
    else if (count[r] === 3) trips.push(r);
    else if (count[r] === 2) pairs.push(r);
    else if (count[r] === 1) singles.push(r);
  }

  if (quads.length) {
    /* ใบเสริมคือใบสูงสุดที่เหลือ */
    let kick = -1;
    for (let r = 12; r >= 0; r--) if (r !== quads[0] && count[r] > 0) { kick = r; break; }
    return [7, quads[0], kick];
  }

  if (trips.length >= 2) return [6, trips[0], trips[1]];
  if (trips.length === 1 && pairs.length) return [6, trips[0], pairs[0]];

  if (flushSuit >= 0) {
    const rs = bySuit[flushSuit].slice().sort((a, b) => b - a).slice(0, 5);
    return [5, rs[0], rs[1], rs[2], rs[3], rs[4]];
  }

  const has = new Array(13).fill(false);
  for (let r = 0; r < 13; r++) if (count[r] > 0) has[r] = true;
  const st = topStraight(has);
  if (st >= 0) return [4, st];

  if (trips.length === 1) {
    const k = singles.slice(0, 2);
    return [3, trips[0], k[0], k[1]];
  }

  if (pairs.length >= 2) {
    let kick = -1;
    for (let r = 12; r >= 0; r--) {
      if (r !== pairs[0] && r !== pairs[1] && count[r] > 0) { kick = r; break; }
    }
    return [2, pairs[0], pairs[1], kick];
  }

  if (pairs.length === 1) {
    const k = singles.slice(0, 3);
    return [1, pairs[0], k[0], k[1], k[2]];
  }

  const k = singles.slice(0, 5);
  return [0, k[0], k[1], k[2], k[3], k[4]];
}

/* คืนค่า >0 ถ้า a ดีกว่า, <0 ถ้า b ดีกว่า, 0 ถ้าเท่ากัน */
export function compareScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] === undefined ? -1 : a[i];
    const y = b[i] === undefined ? -1 : b[i];
    if (x !== y) return x - y;
  }
  return 0;
}

export function describeScore(score) {
  return HAND_NAMES[score[0]] || "";
}

/* ===========================================================
   แบ่งกองเดิมพัน รองรับ all-in หลายชั้น (side pot)

   players: [{ id, contributed, folded, score }]
   คืน [{ amount, eligible:[id,...] }] เรียงจากกองหลักไปกองย่อย
   =========================================================== */

/* หาเงินส่วนที่ไม่มีใครตาม แล้วคืนเจ้าของก่อนแบ่งกอง
   เช่นเดิมพัน 2000 แต่คู่แข่งหมอบตั้งแต่ลงไป 20
   1980 นั้นไม่เคยเป็นของกอง ต้องคืนคนเดิมเต็มจำนวน ไม่ใช่เอาไปหาร

   คืน { id, amount } หรือ null ถ้าไม่มีส่วนเกิน
   หมายเหตุ: แก้ค่า contributed ใน players ให้ด้วย */
export function returnUncalled(players) {
  const live = players.filter(p => p.contributed > 0);
  if (live.length < 2) {
    /* เหลือคนเดียวที่ลงเงิน คืนทั้งหมด */
    if (live.length === 1 && live[0].contributed > 0) {
      const back = { id: live[0].id, amount: live[0].contributed };
      live[0].contributed = 0;
      return back;
    }
    return null;
  }

  const sorted = live.slice().sort((a, b) => b.contributed - a.contributed);
  const top = sorted[0], second = sorted[1];
  if (top.contributed <= second.contributed) return null;

  const excess = top.contributed - second.contributed;
  top.contributed -= excess;
  return { id: top.id, amount: excess };
}

export function buildPots(players) {
  const pots = [];
  /* ระดับเงินที่แต่ละคนลงไป เอาเฉพาะที่มากกว่า 0 ไม่ซ้ำ เรียงจากน้อยไปมาก */
  const levels = [...new Set(players.filter(p => p.contributed > 0).map(p => p.contributed))]
    .sort((a, b) => a - b);

  let prev = 0;
  for (const lv of levels) {
    const step = lv - prev;
    let amount = 0;
    const eligible = [];
    /* จำไว้ว่าใครลงเท่าไหร่ในกองนี้ เผื่อต้องคืนเงินเพราะไม่มีใครเหลือชนะ */
    const contributors = {};
    for (const p of players) {
      if (p.contributed >= lv) {
        amount += step;
        contributors[p.id] = (contributors[p.id] || 0) + step;
        /* คนที่หมอบแล้วยังต้องจ่ายเงินเข้ากอง แต่ไม่มีสิทธิ์ชนะ */
        if (!p.folded) eligible.push(p.id);
      } else if (p.contributed > prev) {
        const part = p.contributed - prev;
        amount += part;
        contributors[p.id] = (contributors[p.id] || 0) + part;
      }
    }
    if (amount > 0) pots.push({ amount, eligible, contributors });
    prev = lv;
  }

  /* รวมกองที่มีผู้มีสิทธิ์ชุดเดียวกันติดกัน ให้แสดงผลอ่านง่าย */
  const merged = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.length === pot.eligible.length &&
        last.eligible.every(id => pot.eligible.includes(id))) {
      last.amount += pot.amount;
      for (const id in pot.contributors) {
        last.contributors[id] = (last.contributors[id] || 0) + pot.contributors[id];
      }
    } else {
      merged.push({
        amount: pot.amount,
        eligible: pot.eligible.slice(),
        contributors: Object.assign({}, pot.contributors)
      });
    }
  }
  return merged;
}

/* แจกเงินแต่ละกองให้ผู้ชนะ คืน { [id]: จำนวนที่ได้ } */
export function settlePots(pots, scoreById, contributedById) {
  const won = {};
  for (const pot of pots) {
    const live = pot.eligible.filter(id => scoreById[id]);

    /* ไม่มีใครเหลือให้ชนะกองนี้ ต้องคืนให้ตรงคนตามที่แต่ละคนลงไปจริง
       ห้ามเอามาหารเฉลี่ย ไม่งั้นเงินจะย้ายไปอยู่ผิดคน */
    if (!live.length) {
      const src = pot.contributors || contributedById || {};
      let given = 0;
      for (const id in src) {
        if (!Object.prototype.hasOwnProperty.call(src, id)) continue;
        won[id] = (won[id] || 0) + src[id];
        given += src[id];
      }
      /* เผื่อข้อมูลไม่ครบ ที่เหลือคืนคนแรกไว้ก่อน ดีกว่าทำหาย */
      if (given < pot.amount) {
        const first = Object.keys(src)[0];
        if (first !== undefined) won[first] = (won[first] || 0) + (pot.amount - given);
      }
      continue;
    }

    /* ห้ามเช็คด้วย !best เพราะที่นั่ง 0 เป็น falsy
       คนที่นั่งช่องแรกจะถูกแทนที่ทันทีโดยไม่เทียบไพ่ = ไม่มีวันชนะกองเลย */
    let best = null;
    for (const id of live) {
      if (best === null || compareScore(scoreById[id], scoreById[best]) > 0) best = id;
    }
    const winners = live.filter(id => compareScore(scoreById[id], scoreById[best]) === 0);

    /* หารเท่ากัน เศษที่หารไม่ลงตัวให้คนแรกตามลำดับที่นั่ง */
    const share = Math.floor(pot.amount / winners.length);
    let rest = pot.amount - share * winners.length;
    for (const id of winners) {
      won[id] = (won[id] || 0) + share + (rest-- > 0 ? 1 : 0);
    }
  }
  return won;
}
