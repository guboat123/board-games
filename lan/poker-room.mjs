/* ===========================================================
   โต๊ะโป๊กเกอร์ Texas Hold'em — ตรรกะฝั่งตัวกลาง
   ตัวกลางถือไพ่เองทั้งหมด ผู้เล่นเห็นเฉพาะไพ่ในมือตัวเอง
   =========================================================== */

import {
  freshDeck, shuffle, evaluate7, compareScore, describeScore,
  buildPots, settlePots, returnUncalled, cardCode
} from "./poker-engine.mjs";

const MAX_SEATS = 9;
const SEAT_GRACE_MIN = 5;   /* ที่นั่งของคนที่หลุด ถือครองไว้กี่นาทีก่อนคืนให้คนใหม่ */

export const DEFAULTS = {
  smallBlind: 10,
  bigBlind: 20,
  /* จบรอบเล่นเมื่อไหร่: none = เล่นไปเรื่อยๆ · hands = ครบกี่ตา · minutes = ครบกี่นาที
     ถ้าหมดเวลาระหว่างเล่นอยู่ ให้เล่นตานั้นจนจบก่อน แล้วค่อยนับคะแนน */
  limitType: "none",
  limitValue: 0,
  minBuyIn: 200,     /* ขอบเขตเท่านั้น แต่ละคนเลือกเองว่าจะเอาเท่าไหร่ */
  maxBuyIn: 100000,
  defaultBuyIn: 1000, /* ค่าที่เติมให้ในช่องกรอก เปลี่ยนได้ */
  /* เวลาตัดสินใจต่อตา · 0 = ไม่จำกัด (โต๊ะบ้านๆ ที่ไม่อยากให้ใครโดนบังคับพับ) */
  turnSeconds: 30,
  /* การ์ดต่อเวลาแบบทัวร์นาเมนต์: คนละกี่ใบต่อรอบเล่น และใบละกี่วินาที */
  timeCards: 3,
  timeCardSeconds: 30,
  /* ไม่ตอบสนองนานเกินกี่วินาที ให้พักมือให้อัตโนมัติ (0 = ไม่บังคับ)
     นับจาก "ครั้งสุดท้ายที่ลงมือเอง" ไม่ใช่เวลาที่นั่งอยู่เฉยๆ
     คนที่นั่งดูคนอื่นเล่นอยู่ดีๆ จึงไม่โดนพักมือ */
  idleSitOutSeconds: 200,
  /* หมดเวลาติดกันกี่ครั้งถึงพักมือให้ (0 = ไม่ใช้กติกานี้)
     เร็วกว่าการนับวินาทีมาก และเป็นหลักฐานที่หนักแน่นกว่า:
     คนที่ปล่อยหมดเวลาสามตาติดคือคนที่ไม่อยู่แล้วจริงๆ ไม่ใช่แค่คิดนาน */
  idleSitOutTimeouts: 3
};

export function createTable(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  const st = {
    seats: new Array(MAX_SEATS).fill(null),
    button: -1,
    phase: "waiting",        /* waiting · preflop · flop · turn · river · showdown */
    board: [],
    deck: [],
    current: -1,
    currentBet: 0,
    minRaise: cfg.bigBlind,
    handNo: 0,
    hostSeat: null,      /* ช่องของคนที่เปิดโต๊ะ ใช้ตัดสินว่าใครตั้งค่าโต๊ะได้ */
    startedAt: 0,        /* เวลาที่กดเริ่มตาแรก ใช้นับถอยหลัง */
    sessionOver: false,  /* ครบตามที่ตั้งไว้แล้ว */
    clockAt: 0,          /* มีคนขอนาฬิกาเมื่อไหร่ (0 = ไม่มีใครขอ) */
    cashedOut: 0,        /* ชิปที่คนลุกจากโต๊ะถือกลับไป ใช้ตรวจว่ายอดรวมยังตรง */
    boughtOut: 0,        /* ยอดซื้อเข้าของคนที่ลุกไปแล้ว คู่กับ cashedOut */
    shownBy: {},         /* รหัสคนที่กดโชว์ไพ่เอง (ไม่ใช่เลขที่นั่ง ที่นั่งเปลี่ยนมือได้) */
    standings: null,     /* ผลรวมตอนจบรอบเล่น */
    lastResult: null,        /* สรุปมือที่เพิ่งจบ */
    log: [],                 /* ข้อความสั้นๆ ให้โชว์ข้างโต๊ะ */
    turnAt: 0,               /* เวลาที่ตาเพิ่งเปลี่ยนมาถึงคนปัจจุบัน ใช้วัดว่าคิดนานแค่ไหน */
    turnExtra: 0,            /* เวลาที่ซื้อเพิ่มด้วยการ์ดในตานี้ (มิลลิวินาที) */
    hand: null,              /* สมุดบันทึกของมือที่กำลังเล่น */
    shown: {},               /* ที่นั่งที่ "เลือกโชว์ไพ่เอง" หลังจบมือ */
    hands: []                /* ประวัติมือที่จบแล้ว ใช้ย้อนดูรูปแบบการเล่น */
  };
  const MAX_HISTORY = 200;   /* เก็บในหน่วยความจำ ไม่มีฐานข้อมูล จึงต้องมีเพดาน */

  /* ---------- ตัวช่วย ---------- */

  const seated = () => st.seats.filter(Boolean);
  const inHand = () => st.seats.filter(s => s && s.inHand && !s.folded);
  /* คนที่ยังต้องตัดสินใจได้ (ไม่หมอบ ไม่ all-in) */
  const canAct = () => st.seats.filter(s => s && s.inHand && !s.folded && !s.allIn);

  function nextOccupied(from, test) {
    for (let i = 1; i <= MAX_SEATS; i++) {
      const idx = (from + i) % MAX_SEATS;
      const s = st.seats[idx];
      if (s && test(s)) return idx;
    }
    return -1;
  }

  /* ทุกที่ที่เปลี่ยน "ตาใคร" ต้องผ่านตรงนี้ จะได้จับเวลาคิดได้ครบทุกครั้ง
     ถ้าใครไปแก้ st.current ตรงๆ เวลาที่บันทึกจะเพี้ยนเงียบๆ */
  function setCurrent(n) {
    st.current = n;
    st.turnAt = n >= 0 ? Date.now() : 0;
    /* เวลาที่ซื้อเพิ่มใช้ได้เฉพาะตานั้น ต้องล้างทุกครั้งที่เปลี่ยนตา */
    st.turnExtra = 0;
    /* ⚠️ นาฬิกาที่มีคนขอไว้ก็ผูกกับ "ตานี้" เท่านั้น เปลี่ยนตาแล้วต้องล้างด้วย
       ไม่งั้นคนถัดไปจะเหลือเวลาแค่เศษของคนก่อนหน้า ทั้งที่เขาเพิ่งถึงตา */
    st.clockAt = 0;
  }

  /* เวลาทั้งหมดที่คนปัจจุบันมีในตานี้ · 0 = ไม่จำกัด */
  function turnBudget() {
    if (!cfg.turnSeconds) return 0;
    return cfg.turnSeconds * 1000 + st.turnExtra;
  }

  /* บันทึกลงประวัติมือปัจจุบัน ใช้ย้อนดูรูปแบบการเล่นทีหลัง */
  function record(seat, act, amount, thinkMs) {
    if (!st.hand) return;
    st.hand.acts.push({
      phase: st.phase,
      seat: seat,
      name: st.seats[seat] ? st.seats[seat].name : "—",
      act: act,
      amount: amount || 0,
      /* วินาทีที่ใช้ตัดสินใจ ทศนิยม 1 ตำแหน่งพอ */
      think: Math.round((thinkMs || 0) / 100) / 10
    });
  }

  function note(msg) {
    st.log.push(msg);
    if (st.log.length > 40) st.log.shift();
  }

  /* ---------- เข้า/ออกโต๊ะ ---------- */

  /* clamp ให้อยู่ในขอบเขตของโต๊ะ และปัดเป็นจำนวนเต็ม */
  function clampBuyIn(v) {
    let n = Math.floor(Number(v));
    if (!isFinite(n) || n <= 0) n = cfg.defaultBuyIn;
    return Math.max(cfg.minBuyIn, Math.min(cfg.maxBuyIn, n));
  }

  /* opts.bot = true คือบอทฝึกซ้อมที่เซิร์ฟเวอร์คุมเอง ไม่ใช่คนจริงที่ต่อเข้ามา */
  function sit(name, preferred, buyIn, token, opts) {
    name = String(name || "").trim() || "ผู้เล่น";
    token = String(token || "").slice(0, 64);

    /* กลับเข้ามาใหม่ด้วยชื่อเดิม ให้นั่งที่เดิมพร้อมชิปเดิม
       แต่ "ชื่อ" อย่างเดียวใช้เป็นหลักฐานไม่ได้ เพราะรายชื่อคนที่หลุด
       ถูกประกาศให้ทุกคนที่เปิดหน้ารวมโต๊ะเห็น ใครพิมพ์ชื่อนั้นก็เอาชิปไปได้
       จึงต้องเข้าเงื่อนไขอย่างใดอย่างหนึ่ง
         1) token ตรงกัน = เครื่องเดิมกลับมาเอง ผ่านได้เงียบๆ
         2) เจาะจงกดที่นั่งนั้นเอง = หน้าเว็บถามยืนยันตัวตนไปแล้ว
       ถ้าไม่เข้าทั้งสองข้อ ให้ถือเป็นคนใหม่ (ได้ช่องว่างกับชื่อต่อเลข) ซึ่งไม่กระทบชิปใคร */
    /* ⚠️ token ตรงกัน = เครื่องเดิม ต้องได้ที่นั่งเดิมคืนเสมอ
       ไม่ว่าที่นั่งนั้นจะยังขึ้นว่า "ต่ออยู่" หรือเปลี่ยนชื่อมาก็ตาม
       ของเดิมข้ามที่นั่งที่ connected อยู่ พอเปิดเกมซ้ำจากเครื่องเดิม
       (โซเก็ตเก่ายังไม่ทันตาย) จึงได้ที่นั่งใหม่ชื่อ "ชื่อเดิม 2"
       กลายเป็นคนคนเดียวนั่งสองที่ ชิปแยกกันอยู่คนละกอง */
    if (token) {
      for (let i = 0; i < MAX_SEATS; i++) {
        const s = st.seats[i];
        if (!s || s.token !== token) continue;
        /* ⚠️ ที่นั่งบอทห้ามให้ใครยึดด้วย token
           บอทนั่งด้วย token "bot:1" "bot:2" ... ซึ่งเดาได้ทันที
           ถ้าปล่อยผ่าน คนนอกจะได้ชิป 2,000 ที่ไม่ได้ซื้อ เห็นไพ่ในมือของที่นั่งนั้น
           และตัวจัดการบอทก็ยังสั่งที่นั่งเดิมอยู่ = มีสองคนเดินที่นั่งเดียวกัน */
        if (s.isBot && !(opts && opts.bot)) continue;
        s.connected = true;
        s.awaySince = 0;
        s.lastActAt = Date.now();   /* เพิ่งกลับเข้ามา = ยังอยู่ */
        /* ⚠️ ต้องยกเลิกธง "กำลังจะลุก" ด้วย
           คนที่กดออกกลางมือทั้งที่มีเงินในกอง จะถูกคาที่นั่งไว้จนจบมือ (s.leaving)
           ถ้าเขากลับเข้ามาด้วยเครื่องเดิมก่อนมือจบ เซิร์ฟเวอร์ตอบว่านั่งแล้ว
           แต่พอจบมือ sweepLeavers ยังเก็บที่นั่งไปอยู่ดี พร้อมชิปทั้งตัก
           แล้วเครื่องเขาซึ่งคิดว่านั่งอยู่ จะเจอ "ไม่ได้นั่งอยู่ที่โต๊ะนี้" ในคำสั่งถัดไป */
        s.leaving = false;
        /* เปลี่ยนชื่อมาก็ให้ใช้ชื่อใหม่ แต่ต้องไม่ชนกับคนอื่นที่นั่งอยู่ */
        if (name && name !== s.name) {
          let want = name, n2 = 2;
          while (seated().some(x => x !== s && x.name === want)) want = name + " " + n2++;
          s.name = want;
        }
        note(s.name + " กลับเข้าโต๊ะ");
        return { ok: true, seatId: i, name: s.name, stack: s.stack, tookOver: true };
      }
    }

    /* ไม่มี token (เบราว์เซอร์เก็บไม่ได้) ยังกลับเข้าที่เดิมได้ถ้าเจาะจงกดที่นั่งนั้นเอง
       ซึ่งหน้าเว็บถามยืนยันตัวตนไปแล้ว และต้องเป็นที่นั่งที่หลุดอยู่เท่านั้น */
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = st.seats[i];
      if (!s || s.name !== name || s.connected) continue;
      const askedForIt = Number.isInteger(preferred) && preferred === i;
      if (!askedForIt) continue;
      s.connected = true;
      s.awaySince = 0;
      note(name + " กลับเข้าโต๊ะ");
      return { ok: true, seatId: i, name, stack: s.stack };
    }

    /* ที่นั่งที่ร้างนานเกิน SEAT_GRACE_MIN ถือว่าเจ้าของไม่กลับแล้ว คืนให้คนใหม่ได้
       ไม่งั้นโต๊ะจะขึ้นว่า "เต็ม" ทั้งที่มีคนต่ออยู่แค่ 8 แล้วไม่มีใครเข้าได้อีกเลย */
    /* ⚠️ ต้องไม่อยู่ในมือที่กำลังเล่น และต้องไม่มีเงินค้างในกอง
       ไม่งั้นคนที่หลุดกลางมือ (บนโต๊ะที่ไม่จำกัดเวลา มือหนึ่งกินเวลาเกิน 5 นาทีได้ง่ายๆ)
       จะถูกลบที่นั่งทิ้งทั้งตัก พร้อมเงินที่ลงกองไปแล้ว
       ผลคือ finishHand จ่ายออกน้อยกว่าที่เก็บเข้ามา และคนใหม่ยังรับช่วง st.current ต่อ
       ทั้งที่ตัวเองไม่ได้อยู่ในมือ (วัดได้ ชิปหายไป 1,000 จากโต๊ะในครั้งเดียว) */
    function expired(x) {
      if (!x || x.connected || !x.awaySince) return false;
      if (x.inHand || x.committed > 0) return false;
      return Date.now() - x.awaySince > SEAT_GRACE_MIN * 60000;
    }

    let idx = -1;
    if (Number.isInteger(preferred) && preferred >= 0 && preferred < MAX_SEATS) {
      /* ขอเจาะจงที่นั่ง ถ้าไม่ว่างต้องบอกตรงๆ ไม่ใช่ย้ายไปช่องอื่นเงียบๆ
         เพราะคนกดตั้งใจจะกลับไปนั่งที่เดิมของตัวเอง */
      if (st.seats[preferred]) {
        return { ok: false, error: "ที่นั่งที่ " + (preferred + 1) + " มีคนแล้ว เลือกช่องอื่น" };
      }
      idx = preferred;
    } else {
      for (let i = 0; i < MAX_SEATS; i++) if (!st.seats[i]) { idx = i; break; }
      /* ไม่มีช่องว่างจริงๆ ค่อยไปเอาช่องที่ร้างนานแล้ว */
      if (idx === -1) {
        for (let i = 0; i < MAX_SEATS; i++) {
          if (expired(st.seats[i])) {
            note(st.seats[i].name + " ไม่ได้กลับมานาน คืนที่นั่งให้คนใหม่");
            cashOut(i);
            idx = i;
            break;
          }
        }
      }
    }
    if (idx === -1) return { ok: false, error: "โต๊ะเต็มแล้ว (9 ที่นั่ง)" };

    /* ชื่อซ้ำกับคนที่ยังต่ออยู่ ให้เติมเลขต่อท้าย */
    let finalName = name, n = 2;
    while (seated().some(s => s.name === finalName)) finalName = name + " " + n++;

    const chips = clampBuyIn(buyIn);

    st.seats[idx] = {
      seatId: idx,
      name: finalName,
      stack: chips,
      boughtIn: chips,   /* รวมชิปที่ซื้อเข้ามาทั้งหมด ใช้คิดกำไรขาดทุน */
      busts: 0,          /* ชิปหมดแล้วเติมใหม่กี่ครั้ง (0 = ยังไม่เคยหมด) */
      /* กระเป๋าเงินนอกโต๊ะ (ตอนนี้ใช้กับบอทเท่านั้น คนจริงเป็น null)
         ชิปบนโต๊ะคือเงินที่ "เอามาเล่น" ส่วนนี่คือเงินที่ "มีอยู่จริง"
         ห้องนี้แค่เก็บกับส่งต่อ ใครจะใช้ยังไงเป็นเรื่องของคนตั้งค่า (ดู bots.mjs) */
      wallet: null,
      bet: 0,            /* ลงไปแล้วเท่าไหร่ในรอบเดิมพันนี้ */
      committed: 0,      /* ลงไปแล้วเท่าไหร่ในมือนี้ทั้งหมด */
      cards: [],
      folded: false,
      allIn: false,
      inHand: false,
      acted: false,
      connected: true,
      sitOut: false,
      lastAction: "",
      lastKind: "",
      lastActAt: Date.now(),   /* ครั้งสุดท้ายที่ "ลงมือเอง" ใช้จับคนหายไปเฉยๆ */
      timeouts: 0,             /* หมดเวลาติดกันกี่ครั้งแล้ว ล้างเมื่อลงมือเอง */
      isBot: !!(opts && opts.bot),
      botLevel: (opts && opts.level) || 0,
      timeCards: cfg.timeCards,   /* การ์ดต่อเวลาที่เหลือของคนนี้ */
      token: token      /* รหัสประจำเครื่อง ใช้พิสูจน์ตัวตนตอนกลับเข้ามา */
    };
    /* คนแรกที่นั่งลง = เจ้าภาพ จำไว้เลย ที่นั่งจะเปลี่ยนทีหลังไม่ได้ */
    if (st.hostSeat === null) st.hostSeat = idx;
    note(finalName + " เข้าโต๊ะด้วย " + chips + " ชิป");
    return { ok: true, seatId: idx, name: finalName, stack: chips };
  }

  /* ย้ายไปนั่งช่องว่างอื่นบนโต๊ะเดิม ชิปและตัวตนติดตัวไปด้วย
     ห้ามย้ายระหว่างเล่นมือ เพราะลำดับการเดินตาผูกกับเลขช่อง ย้ายกลางมือแล้วตาจะข้ามหรือวน
     และห้ามย้ายไปทับช่องที่มีคนจองอยู่ แม้เจ้าของช่องจะหลุดไปแล้ว
     ที่นั่งของคนที่หลุดยังถือชิปเขาอยู่ ใครย้ายไปทับได้ = ชิปเพื่อนหาย */
  function moveSeat(seatId, target) {
    const s = st.seats[seatId];
    if (!s) return { error: "ไม่ได้นั่งอยู่ที่โต๊ะนี้" };
    if (st.phase !== "waiting" && st.phase !== "showdown") {
      return { error: "ย้ายที่นั่งระหว่างเล่นมือไม่ได้ รอมือนี้จบก่อน" };
    }
    const t = Math.floor(Number(target));
    if (!(t >= 0 && t < MAX_SEATS)) return { error: "ไม่มีช่องนั้น" };
    if (t === seatId) return { error: "นั่งช่องนี้อยู่แล้ว" };
    if (st.seats[t]) return { error: "ช่องนั้นมีคนอยู่แล้ว" };

    st.seats[t] = s;
    /* ⚠️ ต้องอัปเดต seatId ตามไปด้วย ห้ามลืมเด็ดขาด
       finishHand สร้างกองและจ่ายเงินโดยอ้าง s.seatId ไม่ใช่ตำแหน่งใน array
       ถ้าไม่อัปเดต เงินจะถูกจ่ายไปที่ "ช่องเดิม" ซึ่งตอนนี้ว่างหรือเป็นของคนอื่น
       · ช่องเดิมว่าง  → เงินหายจากระบบ (วัดได้ 65,444 ชิปหายในมือเดียว)
       · ช่องเดิมมีคน → คนที่หมอบไปแล้วได้กองไป ส่วนคนที่ชนะจริงไม่ได้อะไร
       และรายชื่อตอนเปิดไพ่ก็ติดเลขที่นั่งผิดตามไปด้วย */
    s.seatId = t;
    st.seats[seatId] = null;
    /* สิทธิ์เจ้าภาพผูกกับคน ไม่ใช่ช่อง ต้องย้ายตามไปด้วย ไม่งั้นเจ้าภาพเสียสิทธิ์ตั้งค่าโต๊ะ */
    if (st.hostSeat === seatId) st.hostSeat = t;
    /* ปุ่มดีลเลอร์เป็น "ตำแหน่งบนโต๊ะ" ไม่ใช่ของใครคนหนึ่ง จึงไม่ย้ายตาม
       startHand เดินปุ่มไปช่องที่มีคนเล่นอยู่แล้ว ช่องว่างถูกข้ามเอง */
    note(s.name + " ย้ายไปนั่งช่อง " + (t + 1));
    return { ok: true, seatId: t };
  }

  /* ลุกจากโต๊ะเอง ต่างจากหลุด: ปล่อยที่นั่งทันที ไม่ต้องรอหมดเวลา
     ถ้ายังอยู่ในมือ ให้ถือว่าหมอบก่อน เงินที่ลงไปแล้วอยู่ในกองตามกติกา */
  function leave(seatId) {
    const s = st.seats[seatId];
    if (!s) return;

    const wasInHand = s.inHand && !s.folded;
    if (wasInHand) {
      s.folded = true;
      s.lastAction = "Fold (ออกจากโต๊ะ)";
      s.lastKind = "fold";
    }
    note(s.name + " ออกจากโต๊ะ");
    s.connected = false;
    s.sitOut = true;

    /* ต้องเดินตาต่อก่อนเสมอ ไม่งั้นถ้าคนที่ลุกคือคนที่ถึงตาพอดี
       โต๊ะจะค้างรอคนที่เดินออกไปแล้ว
       ⚠️ บรรทัดนี้อาจจบมือให้เลย (ถ้าเหลือคนเดียว) แล้ว finishHand จะคืนเงิน
       ส่วนที่ไม่มีใครตามเข้าที่นั่งนี้ด้วย ที่นั่งจึงอาจ "รวยขึ้น" ระหว่างบรรทัดนี้ */
    if (wasInHand || st.current === seatId) checkRoundEnd(seatId);

    /* เงินที่ลงกองไปแล้วเป็นของกอง ไม่ใช่ของเขาอีกต่อไป
       ถ้าลบที่นั่งทิ้งทันที เงินก้อนนั้นจะหายไปจากโต๊ะ (ยอดรวมไม่ตรงกับที่ซื้อเข้ามา)
       จึงต้องคาที่นั่งไว้จนจบมือก่อน แล้วค่อยเก็บกวาดใน finishHand */
    if (st.seats[seatId] && s.committed > 0) {
      s.leaving = true;
      if (!seated().some(x => x.connected)) st.phase = "waiting";
      return;
    }

    /* ⚠️ ต้องปล่อยที่นั่งผ่าน cashOut เสมอ ห้าม st.seats[i] = null ตรงๆ
       ชิปที่ติดตัวออกไปต้องถูกจดไว้ ไม่งั้นยอดรวมบนโต๊ะจะไม่ตรงกับที่ซื้อเข้ามา
       แล้วไล่หาไม่เจอว่าหายไปตอนไหน — เคสจริงคือ ไล่ 800 คนอื่นหมอบหมด
       มือจบในบรรทัดข้างบน ได้คืน 780 แล้วที่นั่งถูกลบพร้อมชิป 980 แบบไม่มีร่องรอย */
    cashOut(seatId);
    if (!seated().some(x => x.connected)) st.phase = "waiting";
  }

  /* ปล่อยที่นั่งแล้วบันทึกชิปที่ติดตัวออกไปด้วย
     ⚠️ ต้องจดไว้เสมอ ไม่งั้นยอดรวมบนโต๊ะจะไม่ตรงกับที่ซื้อเข้ามา แล้วหาไม่เจอว่าหายไปไหน
     สมการที่ต้องเป็นจริงตลอด: ผลรวมชิปบนโต๊ะ + กองกลาง + ชิปที่ถือกลับบ้าน = ผลรวมที่ซื้อเข้า */
  function cashOut(seatId) {
    const s = st.seats[seatId];
    if (!s) return;
    st.cashedOut += s.stack + s.committed;
    st.boughtOut += s.boughtIn;
    st.seats[seatId] = null;
    if (st.hostSeat === seatId) st.hostSeat = null;
  }

  /* เก็บที่นั่งของคนที่ลุกไประหว่างมือ หลังจ่ายเงินเรียบร้อยแล้ว */
  function sweepLeavers() {
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = st.seats[i];
      if (s && s.leaving) cashOut(i);
    }
  }

  function disconnect(seatId) {
    const s = st.seats[seatId];
    if (!s) return;
    s.connected = false;
    s.awaySince = Date.now();   /* ใช้ตัดสินว่าที่นั่งนี้ร้างนานพอจะคืนให้คนใหม่หรือยัง */
    note(s.name + " หลุดออกจากโต๊ะ");

    if (s.inHand && !s.folded) {
      s.folded = true;
      s.lastAction = "Fold (หลุด)";
      s.lastKind = "fold";
      /* เช็คจบมือเสมอ แต่บอกไปด้วยว่าคนที่หลุดคือใคร
         จะได้ไม่ไปเลื่อนตาของคนอื่นที่ยังไม่ได้พูด */
      checkRoundEnd(seatId);
    }
    /* ไม่ล้างที่นั่งทิ้ง เผื่อเน็ตหลุดแล้วกลับเข้ามาใหม่
       ชิปกับที่นั่งเดิมต้องยังอยู่ ห้องจะถูกเก็บกวาดโดยตัวกลางเองถ้าไม่มีใครกลับมานาน */
    if (!seated().some(x => x.connected)) st.phase = "waiting";
  }

  /* ชื่อที่ว่างอยู่ตอนนี้ (คนหลุด) ให้หน้าจอเอาไปโชว์ว่ากลับเข้ามาได้ */
  function openSeats() {
    return seated().filter(s => !s.connected).map(s => ({ name: s.name, stack: s.stack }));
  }

  /* ---------- เริ่มมือใหม่ ---------- */

  function readyPlayers() {
    return seated().filter(s => s.connected && !s.sitOut && s.stack > 0);
  }

  function startHand() {
    if (st.sessionOver) return { error: "รอบเล่นนี้จบแล้ว กดเริ่มรอบใหม่ถ้าจะเล่นต่อ" };
    /* หมดเวลาไปแล้วตั้งแต่ก่อนกด ต้องปิดรอบเล่นเลย ไม่ใช่แถมให้อีกมือ */
    if (limitReached()) { closeSession(); return { error: "หมดเวลาแล้ว" }; }
    const ready = readyPlayers();
    if (ready.length < 2) return { error: "ต้องมีอย่างน้อย 2 คนที่มีชิป" };
    if (!st.startedAt) st.startedAt = Date.now();

    st.handNo++;
    st.board = [];
    st.deck = shuffle(freshDeck());
    st.currentBet = 0;
    st.minRaise = cfg.bigBlind;
    st.lastResult = null;
    st.shown = {};           /* เริ่มมือใหม่ ล้างของเก่าทิ้ง ไม่งั้นไพ่มือก่อนจะค้างโชว์ */
    st.shownBy = {};
    st.phase = "preflop";

    for (const s of seated()) {
      s.bet = 0; s.committed = 0; s.cards = []; s.folded = false;
      s.allIn = false; s.acted = false; s.lastAction = ""; s.lastKind = "";
      s.inHand = ready.includes(s);
    }

    /* ปุ่มดีลเลอร์ขยับไปคนถัดไปที่ร่วมมือนี้ */
    st.button = nextOccupied(st.button, s => s.inHand);

    const heads = ready.length === 2;
    /* สองคน: ปุ่มเป็นบอดเล็กและพูดก่อนในพรีฟลอป */
    const sbSeat = heads ? st.button : nextOccupied(st.button, s => s.inHand);
    const bbSeat = nextOccupied(sbSeat, s => s.inHand);

    postBlind(sbSeat, cfg.smallBlind, "SB");
    postBlind(bbSeat, cfg.bigBlind, "BB");
    st.currentBet = cfg.bigBlind;

    /* แจกคนละ 2 ใบ */
    for (const s of st.seats) {
      if (s && s.inHand) s.cards = [st.deck.pop(), st.deck.pop()];
    }

    /* บอดใหญ่ยังมีสิทธิ์เคาะหรือเรซตอนจบรอบ จึงยังไม่ถือว่าพูดแล้ว */
    for (const s of canAct()) s.acted = false;

    /* เปิดสมุดบันทึกของมือนี้ ก่อนใครลงมือ */
    st.hand = {
      no: st.handNo,
      at: Date.now(),
      sb: cfg.smallBlind, bb: cfg.bigBlind,
      button: st.button,
      players: seated().filter(x => x.inHand)
        .map(x => ({ name: x.name, stack: x.stack + x.committed })),
      acts: [],
      board: [],
      result: null
    };
    setCurrent(nextOccupied(bbSeat, s => s.inHand && !s.folded && !s.allIn));
    note("— มือที่ " + st.handNo + " เริ่มแล้ว —");
    /* ⚠️ บอดอาจทำให้ทุกคนหมดตักตั้งแต่ยังไม่ได้เดิน (เช่นตัวต่อตัว บอด 10/20 คนหนึ่งเหลือ 8)
       ตอนนั้น canAct() ว่าง setCurrent จึงได้ -1 แล้วไม่มีใครกดอะไรได้เลย
       ไม่มีใครเรียก checkRoundEnd/nextPhase ต่อ ไพ่กลางไม่ถูกแจก กองไม่ถูกจ่าย
       ทุกคำสั่งถูกปฏิเสธ ("ยังไม่ถึงตาคุณ" / "มือนี้ยังไม่จบ") และ tick() ก็ออกที่ current < 0
       = โต๊ะค้างถาวร ต้องลุกออกอย่างเดียว วัดได้ 299 ใน 3,000 มือตัวต่อตัว
       nextPhase มีการ์ดตัวนี้อยู่แล้ว (บรรทัด "if (st.current === -1) return nextPhase()")
       ตรงนี้แค่ขาดไป — เปิดไพ่รวดเดียวจนจบเหมือนกรณี all-in ปกติ */
    if (st.current === -1 && inHand().length > 1) return nextPhase();
    return {};
  }

  function postBlind(seatId, amount, label) {
    const s = st.seats[seatId];
    if (!s) return;
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.bet += pay;
    s.committed += pay;
    if (s.stack === 0) s.allIn = true;
    s.lastAction = label;
  }

  /* ---------- การเดิมพัน ---------- */

  function playerAction(seatId, msg) {
    const s = st.seats[seatId];
    if (!s) return { error: "ไม่ได้นั่งอยู่ที่โต๊ะ" };
    if (st.phase === "waiting" || st.phase === "showdown") return { error: "ยังไม่ถึงรอบเดิมพัน" };
    if (st.current !== seatId) return { error: "ยังไม่ถึงตาคุณ" };
    if (s.folded || s.allIn) return { error: "รอบนี้คุณลงมือไม่ได้แล้ว" };

    /* ต้องจับเวลาก่อนทำอะไร ไม่งั้น setCurrent ข้างล่างจะรีเซ็ตไปแล้ว */
    const thinkMs = st.turnAt ? Date.now() - st.turnAt : 0;
    const stackBefore = s.stack;
    const toCall = st.currentBet - s.bet;

    if (msg.action === "fold") {
      /* เหลือคนเดียวก็ชนะไปแล้ว ไม่ต้องหมอบ กันเงินหาย */
      if (inHand().length <= 1) return { error: "เหลือคุณคนเดียว ชนะไปแล้ว" };
      s.folded = true;
      s.acted = true;
      s.lastAction = "Fold";
      s.lastKind = "fold";
      note(s.name + " fold");
    }

    else if (msg.action === "check") {
      if (toCall > 0) return { error: "มีเงินต้องตามอยู่ เคาะไม่ได้" };
      s.acted = true;
      s.lastAction = "Check";
      s.lastKind = "check";
      note(s.name + " check");
    }

    else if (msg.action === "call") {
      if (toCall <= 0) return { error: "ไม่มีเงินต้องตาม ใช้เคาะแทน" };
      const pay = Math.min(toCall, s.stack);
      s.stack -= pay; s.bet += pay; s.committed += pay;
      if (s.stack === 0) { s.allIn = true; s.lastAction = "All in"; }
      else s.lastAction = "Call " + pay;
      s.lastKind = "call";
      s.acted = true;
      note(s.name + (s.allIn ? " all in " : " call ") + pay);
    }

    else if (msg.action === "raise") {
      /* amount = ยอดเดิมพันรวมของรอบนี้ที่ต้องการให้เป็น */
      let target = Math.floor(Number(msg.amount));
      if (!isFinite(target)) return { error: "จำนวนไม่ถูกต้อง" };

      const maxTarget = s.bet + s.stack;
      if (target > maxTarget) target = maxTarget;

      const isAllIn = target === maxTarget;
      const minTarget = st.currentBet + st.minRaise;

      if (!isAllIn && target < minTarget) {
        return { error: "ต้องเพิ่มอย่างน้อยเป็น " + minTarget };
      }
      if (target <= st.currentBet && !isAllIn) {
        return { error: "ต้องมากกว่าเดิมพันปัจจุบัน" };
      }

      const pay = target - s.bet;
      s.stack -= pay; s.bet = target; s.committed += pay;
      if (s.stack === 0) s.allIn = true;

      /* all-in ที่น้อยกว่าขั้นต่ำ ไม่ถือว่าเปิดรอบใหม่ */
      const isFullRaise = target >= minTarget;
      if (isFullRaise) st.minRaise = target - st.currentBet;
      if (target > st.currentBet) st.currentBet = target;

      s.acted = true;
      if (isFullRaise) for (const o of canAct()) if (o !== s) o.acted = false;

      s.lastAction = (s.allIn ? "All in " : "Raise to ") + target;
      s.lastKind = "raise";
      note(s.name + " " + s.lastAction);
    }

    else {
      return { error: "คำสั่งไม่รู้จัก" };
    }

    /* จดไว้หลังจากรู้ผลแล้ว จะได้รู้ว่าจ่ายไปเท่าไหร่จริง */
    record(seatId, msg.action, stackBefore - s.stack, thinkMs);
    /* ลงมือเองแล้ว = ยังอยู่ ไม่ต้องโดนบังคับพักมือ */
    s.lastActAt = Date.now();
    s.timeouts = 0;

    checkRoundEnd(seatId);
    return {};
  }

  /* ทุกคนที่ยังเล่นได้ พูดครบและเงินเท่ากันแล้วหรือยัง */
  function roundDone() {
    const live = canAct();
    if (!live.length) return true;
    return live.every(s => s.acted && s.bet === st.currentBet);
  }

  /* fromSeat = ที่นั่งที่เพิ่งลงมือ ถ้าไม่ใช่คนที่ถึงตา ห้ามเลื่อนตาไปคนอื่น
     ไม่งั้นแค่มีคนเน็ตหลุด คนที่กำลังจะพูดจะถูกข้ามไปเฉยๆ */
  function checkRoundEnd(fromSeat) {
    if (inHand().length <= 1) return finishHand(false);
    if (roundDone()) return nextPhase();
    if (fromSeat === undefined || fromSeat === st.current) advance();
    else if (st.current === -1 || !st.seats[st.current] ||
             st.seats[st.current].folded || st.seats[st.current].allIn) advance();
  }

  function advance() {
    const nxt = nextOccupied(st.current, s => s.inHand && !s.folded && !s.allIn);
    setCurrent(nxt);
    if (nxt === -1) nextPhase();
  }

  function nextPhase() {
    /* เก็บเงินรอบนี้เข้ากอง */
    for (const s of seated()) s.bet = 0;
    st.currentBet = 0;
    st.minRaise = cfg.bigBlind;
    for (const s of seated()) s.acted = false;

    if (st.phase === "preflop") {
      st.deck.pop();                                   /* เผาหนึ่งใบ */
      st.board.push(st.deck.pop(), st.deck.pop(), st.deck.pop());
      st.phase = "flop";
    } else if (st.phase === "flop") {
      st.deck.pop(); st.board.push(st.deck.pop());
      st.phase = "turn";
    } else if (st.phase === "turn") {
      st.deck.pop(); st.board.push(st.deck.pop());
      st.phase = "river";
    } else {
      return finishHand(true);
    }

    /* ถ้าทุกคนหมดหน้าตักแล้ว เปิดไพ่รวดเดียวจนจบ */
    if (canAct().length <= 1 && inHand().length > 1) {
      const stillNeeded = canAct().filter(s => s.bet < st.currentBet).length;
      if (stillNeeded === 0) return nextPhase();
    }

    setCurrent(nextOccupied(st.button, s => s.inHand && !s.folded && !s.allIn));
    if (st.current === -1) return nextPhase();
  }

  /* ---------- จบมือ ---------- */

  function finishHand(showdown) {
    const players = seated()
      .filter(s => s.committed > 0 || s.inHand)
      .map(s => ({ id: s.seatId, contributed: s.committed, folded: s.folded || !s.inHand }));

    /* คืนเงินส่วนที่ไม่มีใครตามให้เจ้าของก่อน แล้วค่อยแบ่งกองที่เหลือ */
    const uncalled = returnUncalled(players);
    if (uncalled && uncalled.amount > 0) {
      const owner = st.seats[uncalled.id];
      if (owner) {
        owner.stack += uncalled.amount;
        owner.committed -= uncalled.amount;
        note(owner.name + " ได้เงินที่ไม่มีใครตามคืน " + uncalled.amount);
      }
    }

    const pots = buildPots(players);
    const live = inHand();

    const scoreById = {};
    const reveal = [];

    if (showdown && live.length > 1) {
      for (const s of live) {
        const sc = evaluate7(s.cards.concat(st.board));
        scoreById[s.seatId] = sc;
        reveal.push({
          seatId: s.seatId, name: s.name,
          cards: s.cards.map(cardCode),
          hand: describeScore(sc),
          /* เงินที่คนนี้ลงไปในมือนี้ (หลังคืนส่วนที่ไม่มีใครตามแล้ว)
             ต้องอ่านตรงนี้ เพราะ committed จะถูกล้างเป็น 0 ตอนจบ finishHand
             ใช้บอกคนที่แพ้ว่ามือนี้เสียไปเท่าไหร่ */
          put: s.committed
        });
      }
    } else if (live.length === 1) {
      /* ชนะเพราะคนอื่นหมอบหมด ไม่ต้องเปิดไพ่ */
      scoreById[live[0].seatId] = [99];
    }

    const contributedById = {};
    for (const pl of players) contributedById[pl.id] = pl.contributed;
    const won = settlePots(pots, scoreById, contributedById);
    const payouts = [];
    for (const idStr in won) {
      const id = Number(idStr);
      const s = st.seats[id];
      if (!s) continue;
      s.stack += won[id];
      payouts.push({ seatId: id, name: s.name, amount: won[id] });
    }

    if (payouts.length === 1) {
      note(payouts[0].name + " ชนะ " + payouts[0].amount);
    } else if (payouts.length > 1) {
      note("แบ่งกอง: " + payouts.map(p => p.name + " " + p.amount).join(", "));
    }

    st.lastResult = {
      showdown: showdown && live.length > 1,
      board: st.board.map(cardCode),
      reveal, payouts,
      /* ⚠️ ต้องส่ง "ใครลงไปเท่าไหร่" ของทุกคนไปด้วย ไม่ใช่เฉพาะคนที่เปิดไพ่
         ไม่งั้นหน้าจอคิดยอดสุทธิของมือนี้ไม่ได้ แล้วจะขึ้นแค่ "ได้กองเท่าไหร่"
         ซึ่งอ่านผิดได้ทันทีเวลามีกองรอง: คนที่ชนะกองบนสุดอาจสุทธิติดลบ
         (เคสจริง: ลงไป 3,963 ด้วยตอง K ได้กองบน 3,926 แต่กองใหญ่ตกเป็นของสเตรท = สุทธิ −37) */
      puts: players.map(pl => {
        const sx = st.seats[pl.id];
        return { seatId: pl.id, name: sx ? sx.name : "", amount: pl.contributed };
      }),
      pot: pots.reduce((a, p) => a + p.amount, 0)
    };

    st.phase = "showdown";
    setCurrent(-1);

    /* ปิดสมุดบันทึกของมือนี้ แล้วเก็บเข้าประวัติ
       เก็บชื่อไว้ตรงๆ ไม่อ้างเลขที่นั่ง เพราะคนย้ายที่นั่งได้ ประวัติเก่าจะอ่านผิด */
    if (st.hand) {
      st.hand.board = st.board.map(cardCode);
      st.hand.pot = st.lastResult ? st.lastResult.pot : 0;
      st.hand.result = {
        showdown: !!(st.lastResult && st.lastResult.showdown),
        payouts: (st.lastResult && st.lastResult.payouts || [])
          .map(x => ({ name: x.name, amount: x.amount })),
        /* ⚠️ ต้องเก็บ "ใครลงไปเท่าไหร่" ของทุกคนในมือ ไม่ใช่เฉพาะคนที่เปิดไพ่
           สถิติสะสมเคยบวกแต่ยอดที่ชนะ ไม่เคยหักที่ลงไป
           ทุกคนจึงขึ้นเป็นบวกตลอดกาล ต่อให้เสียจริง (วัดได้ ผลรวมทั้งโต๊ะ +240 ทั้งที่ต้องเป็น 0)
           เก็บตรงนี้เพราะเป็นจุดสุดท้ายที่ committed ยังไม่ถูกล้าง */
        puts: players.map(pl => {
          const sx = st.seats[pl.id];
          return { name: sx ? sx.name : "", amount: pl.contributed };
        }).filter(x => x.name),
        /* ต้องเก็บ put ด้วย ไม่งั้นย้อนดูประวัติแล้วไม่รู้ว่าใครเสียไปเท่าไหร่
           (หน้าจอมีให้ดูตอนจบมือ แต่ไฟล์ประวัติหายไป ซึ่งเป็นที่ที่ใช้ศึกษาจริง) */
        reveal: (st.lastResult && st.lastResult.reveal || [])
          .map(x => ({ name: x.name, hand: x.hand, cards: x.cards, put: x.put }))
      };
      st.hands.push(st.hand);
      if (st.hands.length > MAX_HISTORY) st.hands.shift();
      st.hand = null;
    }
    /* ล้าง committed ด้วย ไม่งั้นหน้าจอยังโชว์กองกลางทั้งที่จ่ายไปแล้ว
       (ชิปจะดูเหมือนมีสองเท่า) */
    for (const s of seated()) { s.inHand = false; s.bet = 0; s.committed = 0; }

    /* จ่ายเงินเสร็จแล้ว ค่อยปล่อยที่นั่งของคนที่ลุกไประหว่างมือ */
    sweepLeavers();

    /* เช็คหลังจบตาเสมอ ไม่ตัดกลางตา */
    if (limitReached()) closeSession();
    return {};
  }

  /* ---------- จบรอบเล่น ---------- */

  function limitReached() {
    if (cfg.limitType === "hands") return st.handNo >= cfg.limitValue;
    if (cfg.limitType === "minutes") {
      if (!st.startedAt) return false;
      return Date.now() - st.startedAt >= cfg.limitValue * 60000;
    }
    return false;
  }

  /* เวลาที่เหลือเป็นมิลลิวินาที (null = ไม่ได้จำกัดเวลา) */
  function msLeft() {
    if (cfg.limitType !== "minutes" || !st.startedAt) return null;
    return Math.max(0, cfg.limitValue * 60000 - (Date.now() - st.startedAt));
  }

  function closeSession() {
    st.sessionOver = true;
    st.standings = seated()
      .map(s => ({
        seatId: s.seatId, name: s.name,
        stack: s.stack, boughtIn: s.boughtIn, busts: s.busts || 0,
        wallet: (typeof s.wallet === "number") ? s.wallet : null,
        net: s.stack - s.boughtIn
      }))
      .sort((a, b) => b.net - a.net);
    note("— จบรอบเล่น —");
  }

  /* ---------- มุมมองที่ส่งให้แต่ละเครื่อง ---------- */

  /* กองที่โชว์บนจอ = ชิปทั้งหมดที่อยู่บนโต๊ะจริง ตรงกับที่ตาเห็น
     (บอด 10/20 ตอนเปิดมือ = 30 ไม่ใช่ 20) */
  /* กองหลัก/กองรอง ระหว่างที่ยังเล่นอยู่
     คนที่หมดตักด้วยเงินน้อยกว่าคนอื่น มีสิทธิ์ชนะได้แค่กองที่ตัวเองลงถึง
     เดิมคำนวณตอนจบมือเท่านั้น คนเล่นจึงไม่เห็นว่ากองแยกเป็นชั้นแล้ว
     buildPots อ่านอย่างเดียวไม่แก้ข้อมูล จึงเรียกสดได้ปลอดภัย */
  function livePots() {
    /* ⚠️ แสดงเฉพาะตอนมีคนหมดตักจริงเท่านั้น
       ระหว่างพรีฟลอปปกติ บอดเล็กยังลงไม่เท่าบอดใหญ่ buildPots ก็แตกกองให้แล้ว
       ซึ่งถูกทางเทคนิคแต่ไม่ใช่กองรองจริง แสดงไปก็มีแต่ทำให้สับสน */
    if (!seated().some(s => s.inHand && !s.folded && s.allIn)) return [];
    const players = seated()
      .filter(s => s.committed > 0)
      .map(s => ({ id: s.seatId, contributed: s.committed, folded: s.folded || !s.inHand }));
    if (players.length < 2) return [];
    /* กองที่มีคนมีสิทธิ์คนเดียว = เงินที่ยังไม่มีใครตาม เดี๋ยวก็คืนเจ้าของ
       ไม่ใช่กองที่แข่งกัน ถ้าโชว์จะทำให้เข้าใจผิดว่ามีกองให้ชิงเพิ่ม */
    const pots = buildPots(players).filter(p => p.eligible.length >= 2);
    if (pots.length < 2) return [];   /* กองเดียว ไม่ต้องแยกให้รก */
    return pots.map(p => ({ amount: p.amount, eligible: p.eligible }));
  }

  function potOnTable() {
    return seated().reduce((a, s) => a + s.committed, 0);
  }

  /* กองที่ใช้คิดขนาดเดิมพัน = เฉพาะส่วนที่มีคนตามแล้ว
     เงินที่ยังไม่มีใครตามเดี๋ยวก็คืนเจ้าของ ถ้าเอามาคิดด้วย ปุ่มครึ่งกอง/เต็มกองจะเพี้ยน */
  function potTotal() {
    /* เงินส่วนที่ยังไม่มีใครตาม ไม่นับเป็นกองกลาง เพราะเดี๋ยวก็คืนเจ้าของ
       (กติกาเดียวกับ returnUncalled ตอนจบมือ)
       ถ้านับรวม ตัวเลขกองจะพองเกินจริง และปุ่มเดิมพัน "ครึ่งกอง/เต็มกอง"
       ที่คิดจากตัวเลขนี้ก็จะผิดตามไปทั้งหมด */
    const all = seated().map(s => s.committed).sort((a, b) => b - a);
    if (all.length < 2) return 0;
    const cap = all[1];
    return seated().reduce((a, s) => a + Math.min(s.committed, cap), 0);
  }

  function viewFor(mySeat) {
    const me = st.seats[mySeat];
    const toCall = me && st.phase !== "waiting" && st.phase !== "showdown"
      ? Math.max(0, st.currentBet - me.bet) : 0;

    return {
      phase: st.phase,
      handNo: st.handNo,
      button: st.button,
      current: st.current,
      board: st.board.map(cardCode),
      pot: potOnTable(),
      /* ว่างเปล่า = มีกองเดียว · มีสมาชิก = กองหลัก + กองรอง เรียงจากกองหลัก */
      pots: livePots(),
      potForBet: potTotal(),
      currentBet: st.currentBet,
      minRaise: st.minRaise,
      blinds: { sb: cfg.smallBlind, bb: cfg.bigBlind },
      buyInRange: { min: cfg.minBuyIn, max: cfg.maxBuyIn, suggested: cfg.defaultBuyIn },
      mySeat,
      toCall,
      canStart: (st.phase === "waiting" || st.phase === "showdown") && !st.sessionOver,
      limit: {
        type: cfg.limitType,
        value: cfg.limitValue,
        /* ระหว่างเล่นมืออยู่ ตานี้ยังไม่จบ ต้องนับรวมด้วย */
        handsLeft: cfg.limitType === "hands"
          ? Math.max(0, cfg.limitValue - st.handNo +
              ((st.phase === "waiting" || st.phase === "showdown") ? 0 : 1))
          : null,
        msLeft: msLeft(),
        over: st.sessionOver
      },
      standings: st.standings,
      readyCount: readyPlayers().length,
      /* คนที่ถึงตาคิดมานานแค่ไหนแล้ว (มิลลิวินาที) ใช้วาดนาฬิกาข้างชื่อ
         ส่งค่าที่ผ่านไปแล้ว ไม่ใช่เวลาเริ่ม เพราะนาฬิกาของแต่ละเครื่องไม่ตรงกัน */
      turnMs: st.turnAt ? Date.now() - st.turnAt : 0,
      /* นาฬิกาที่มีคนขอไว้: เหลือกี่มิลลิวินาที (0 = ไม่มีใครขอ)
         และตอนนี้ขอได้หรือยัง — หน้าจอใช้ตัดสินว่าจะโชว์ปุ่มไหม */
      clockLeftMs: st.clockAt ? Math.max(0, CLOCK_GRACE_MS - (Date.now() - st.clockAt)) : 0,
      canCallClock: !turnBudget() && st.current >= 0 && st.current !== mySeat &&
                    !st.clockAt && st.turnAt > 0 &&
                    (Date.now() - st.turnAt) >= CLOCK_MIN_WAIT_MS,
      /* เวลาทั้งหมดที่คนปัจจุบันมีในตานี้ (รวมที่ซื้อด้วยการ์ดแล้ว) · 0 = ไม่จำกัด */
      turnBudgetMs: turnBudget(),
      timeCardSeconds: cfg.timeCardSeconds,
      log: st.log.slice(-8),
      openSeats: openSeats(),
      lastResult: st.lastResult,
      seats: st.seats.map((s, i) => s ? {
        seatId: i,
        name: s.name,
        stack: s.stack,
        boughtIn: s.boughtIn,
        busts: s.busts || 0,
        wallet: (typeof s.wallet === "number") ? s.wallet : null,
        net: s.stack - s.boughtIn,   /* บวก/ลบเทียบกับที่ซื้อเข้ามา */
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        inHand: s.inHand,
        connected: s.connected,
        sitOut: s.sitOut,
        isBot: s.isBot,
        botLevel: s.botLevel,
        /* กำลังเก็บของลุกจากโต๊ะ — หน้าจอใช้เล่นภาพลา (ดู botLeaves ใน bots.mjs)
           ห้องแค่ส่งต่อ ไม่ได้ตัดสินใจอะไรเอง */
        /* ⚠️ สองความหมายรวมกันโดยตั้งใจ: s.leaving = คนกดออกกลางมือ (ของห้องเอง)
           · s.botBye = บอทกำลังโบกมือลา (ของ bots.mjs) หน้าจอเล่นภาพลาเหมือนกันทั้งคู่
           ชื่อในห้องกับชื่อในบอทต้องแยกกัน ไม่งั้นห้องจะ cashOut บอททิ้งกลางทาง */
        leaving: !!(s.leaving || s.botBye),
        /* คำพูดของบอท หมดอายุเองตามเวลา ห้องจึงไม่ต้องมีใครมาคอยล้างให้
           ⚠️ ถ้าไม่หมดอายุ ประโยคเดิมจะค้างอยู่บนหัวทั้งวง เพราะสถานะถูกส่งซ้ำตลอด */
        say: (s.sayUntil && s.sayUntil > Date.now()) ? (s.say || "") : "",
        /* อารมณ์ตอนนี้ ("cocky" / "tilted" / "sulk" / "meek" / "")
           ⚠️ ต้องส่งแยกจากคำพูด เพราะตัวที่เงียบก็มีอารมณ์ — ดู toneFor ใน bot-chat.mjs */
        mood: s.mood || "",
        timeCards: s.timeCards,
        lastAction: s.lastAction,
        /* รหัสท่าแบบเครื่องอ่าน แยกจากข้อความที่คนอ่าน
           เดิมหน้าจอเดาท่าจากการอ่านคำแรกของ lastAction ซึ่งพังทันทีที่เปลี่ยนภาษา */
        lastKind: s.lastKind || "",
        /* ไพ่ในมือ: เห็นแค่ของตัวเอง หรือของทุกคนตอนเปิดไพ่ */
        /* เห็นไพ่คนอื่นได้สามทางเท่านั้น: ไพ่ตัวเอง · เปิดไพ่ตามกติกา · เจ้าตัวเลือกโชว์เอง */
        /* ⚠️ st.shown ผูกกับเลขที่นั่ง แต่ย้ายที่นั่งทำได้ตอน showdown พอดี (ตั้งใจให้ทำตอนนั้น)
           ถ้าเช็คแค่ st.shown[i] พอคนที่โชว์ย้ายออก แล้วมีคนย้ายมานั่งช่องเดิม
           ไพ่จริงของคนใหม่ (ยังไม่ถูกล้างจนกว่าจะขึ้นมือใหม่) จะถูกส่งให้ทุกเครื่องทันที
           จึงต้องตรงทั้งเลขที่นั่งและรหัสคน */
        cards: (i === mySeat ||
                (st.lastResult && st.lastResult.showdown && !s.folded && s.cards.length) ||
                (st.shown[i] && st.shownBy[s.token || ("seat:" + i)]))
                 ? s.cards.map(cardCode) : (s.cards.length ? ["??", "??"] : []),
        /* บอกหน้าจอว่าใบนี้มาจากการโชว์เอง จะได้ติดป้ายให้ต่างจากการเปิดไพ่ปกติ */
        /* ต้องตรงกันทั้งเลขที่นั่งและรหัสคน กันไพ่รั่วตอนมีคนย้ายที่นั่งตอน showdown */
        selfShown: !!(st.shown[i] && st.shownBy[s.token || ("seat:" + i)])
      } : null)
    };
  }

  /* ---------- รับคำสั่ง ---------- */

  function action(seatId, msg) {
    if (!msg || typeof msg !== "object") return { error: "คำสั่งว่าง" };
    /* คนที่นั่งไม่สำเร็จ (โต๊ะเต็ม) ต้องสั่งอะไรไม่ได้เลย */
    if (seatId == null || !st.seats[seatId]) return { error: "ไม่ได้นั่งอยู่ที่โต๊ะนี้" };

    if (msg.type === "start") {
      if (st.phase !== "waiting" && st.phase !== "showdown") return { error: "มือนี้ยังไม่จบ" };
      return startHand();
    }
    if (msg.type === "sitout") {
      const s = st.seats[seatId];
      /* ⚠️ ห้ามพักมือตอนถึงตาตัวเอง
         พักมือแล้ว st.current ยังชี้มาที่เขาและยังนับว่าอยู่ในมือ คนอื่นจึงเดินต่อไม่ได้
         บนโต๊ะที่ตั้ง "ไม่จำกัดเวลา" ไม่มี tick() มาช่วยพับให้ = โต๊ะค้างจนกว่าเขาจะกดกลับมาเล่น
         อยากออกจากมือนี้จริงๆ ให้กด Fold ซึ่งเป็นคำสั่งที่ตรงกับความตั้งใจอยู่แล้ว */
      if (s && msg.value && st.current === seatId && s.inHand && !s.folded) {
        return { error: "ถึงตาคุณอยู่ กด Fold ก่อนถ้าจะออกจากมือนี้" };
      }
      if (s) {
        s.sitOut = !!msg.value;
        s.lastActAt = Date.now();   /* กดปุ่มเอง = ยังอยู่ นับเวลาใหม่ */
        s.timeouts = 0;
        note(s.name + (s.sitOut ? " ขอพักมือ" : " กลับมาเล่นต่อ"));
      }
      return {};
    }
    if (msg.type === "rebuy") {
      const s = st.seats[seatId];
      if (!s) return { error: "ไม่ได้นั่งอยู่" };
      if (s.inHand) return { error: "เติมชิประหว่างเล่นมือไม่ได้" };
      const raw = Math.floor(Number(msg.amount));
      if (!isFinite(raw) || raw <= 0) return { error: "ใส่จำนวนชิปที่จะเติม" };
      if (raw > cfg.maxBuyIn) return { error: "เติมได้ครั้งละไม่เกิน " + cfg.maxBuyIn };
      const add = raw;   /* เติมเท่าไหร่ก็ได้ ขั้นต่ำมีไว้สำหรับซื้อครั้งแรกเท่านั้น */
      /* เติมตอนชิปหมดเกลี้ยง = ล้มโต๊ะไปหนึ่งรอบ ต้องนับไว้
         เติมทั้งที่ยังมีชิปเหลือ (เติมเสริม) ไม่นับ เพราะไม่ได้ล้ม */
      if (s.stack === 0) s.busts = (s.busts || 0) + 1;
      s.stack += add;
      s.boughtIn += add;
      note(s.name + " เติมชิป " + add +
           (s.busts ? " (ล้มมาแล้ว " + s.busts + " รอบ)" : ""));
      return {};
    }

    /* ตั้งค่าโต๊ะ (บอด/ขอบเขตชิป) ทำได้เฉพาะตอนไม่มีมือกำลังเล่น */
    if (msg.type === "config") {
      if (st.phase !== "waiting" && st.phase !== "showdown") {
        return { error: "แก้ค่าโต๊ะระหว่างเล่นมือไม่ได้" };
      }
      /* ตั้งค่าโต๊ะได้เฉพาะก่อนเริ่มมือแรก และเฉพาะเจ้าภาพ
         เจ้าภาพ = คนที่นั่งลงคนแรก ไม่ใช่ "คนที่ได้ช่องเลขน้อยสุด"
         เพราะเจ้าภาพเลือกนั่งช่องไหนก็ได้ ถ้าเทียบด้วยเลขช่อง
         คนที่เข้ามาทีหลังแต่ได้ช่องเลขน้อยกว่าจะแย่งสิทธิ์ตั้งบอดไปเฉยๆ
         ถ้าเจ้าภาพลุกไปแล้ว ให้คนที่ยังอยู่ตั้งได้ ไม่งั้นโต๊ะจะตั้งค่าไม่ได้เลย */
      if (st.handNo > 0) return { error: "โต๊ะเริ่มเล่นไปแล้ว แก้ค่าไม่ได้" };
      let host = st.hostSeat;
      if (host === null || !st.seats[host]) host = st.seats.findIndex(x => !!x);
      if (host !== -1 && seatId !== host) {
        return { error: "เฉพาะคนที่เปิดโต๊ะเท่านั้นที่ตั้งค่าได้" };
      }
      const sb = Math.floor(Number(msg.smallBlind));
      const bb = Math.floor(Number(msg.bigBlind));
      if (isFinite(sb) && sb > 0) cfg.smallBlind = sb;
      if (isFinite(bb) && bb > 0) cfg.bigBlind = bb;
      if (cfg.bigBlind < cfg.smallBlind) cfg.bigBlind = cfg.smallBlind * 2;
      /* เวลาต่อตา 0 = ไม่จำกัด ตั้งได้เฉพาะก่อนเริ่มมือแรก เหมือนค่าอื่นของโต๊ะ */
      if (msg.turnSeconds !== undefined) {
        const ts = Math.floor(Number(msg.turnSeconds));
        if (isFinite(ts) && ts >= 0) cfg.turnSeconds = ts;
      }
      if (msg.timeCards !== undefined) {
        const tc = Math.floor(Number(msg.timeCards));
        if (isFinite(tc) && tc >= 0) {
          cfg.timeCards = tc;
          for (const p3 of seated()) p3.timeCards = tc;
        }
      }
      if (msg.limitType === "none" || msg.limitType === "hands" || msg.limitType === "minutes") {
        cfg.limitType = msg.limitType;
        cfg.limitValue = Math.max(1, Math.floor(Number(msg.limitValue)) || 1);
      }
      const mn = Math.floor(Number(msg.minBuyIn));
      const mx = Math.floor(Number(msg.maxBuyIn));
      if (isFinite(mn) && mn > 0) cfg.minBuyIn = mn;
      if (isFinite(mx) && mx >= cfg.minBuyIn) cfg.maxBuyIn = mx;
      st.minRaise = cfg.bigBlind;
      note("ตั้งค่าโต๊ะใหม่: บอด " + cfg.smallBlind + "/" + cfg.bigBlind);
      return {};
    }
    /* เลิกเล่นเอง = ปิดรอบแล้วขึ้นตารางสรุปทันที
       ⚠️ ตัวเลือก "ไม่จำกัด" เขียนไว้ว่า "เล่นไปเรื่อยๆ จนกดเลิกเอง"
       แต่เดิมไม่มีคำสั่งให้กดเลิกจริง ปิดรอบได้ทางเดียวคือเล่นให้ครบตาที่ตั้งไว้
       คนที่เลือกไม่จำกัดจึงไม่มีทางได้เห็นตารางสรุปเลย */
    if (msg.type === "endrun") {
      /* ⚠️ ต้องเช็คเจ้าภาพเหมือนคำสั่งตั้งค่าโต๊ะ
         คำสั่งนี้ปิดรอบให้ "ทั้งโต๊ะ" ไม่ใช่แค่ตัวเอง ปล่อยให้ใครก็กดได้
         = คนเดียวกดพลาด แล้วสถิติได้-เสียของทุกคนถูกแช่แข็งทันที */
      if (st.hostSeat !== null && st.hostSeat !== seatId) {
        return { error: "เฉพาะคนที่เปิดโต๊ะเท่านั้นที่เลิกรอบได้" };
      }
      if (st.phase !== "waiting" && st.phase !== "showdown") {
        return { error: "มือนี้ยังไม่จบ เลิกตอนนี้ไม่ได้" };
      }
      if (st.sessionOver) return { error: "รอบเล่นนี้จบไปแล้ว" };
      closeSession();
      return {};
    }

    /* เริ่มรอบเล่นใหม่: ล้างเวลาและจำนวนตา แต่ชิปคงไว้ */
    if (msg.type === "newsession") {
      /* ⚠️ เจ้าภาพเท่านั้น คำสั่งนี้ล้างกำไรขาดทุนของทุกคนทิ้ง (boughtIn ถูกตั้งใหม่เท่าชิปที่มี)
         กดพลาดครั้งเดียว = สถิติทั้งรอบของทุกคนหายถาวร เอากลับไม่ได้ */
      if (st.hostSeat !== null && st.hostSeat !== seatId) {
        return { error: "เฉพาะคนที่เปิดโต๊ะเท่านั้นที่เริ่มรอบใหม่ได้" };
      }
      if (st.phase !== "waiting" && st.phase !== "showdown") {
        return { error: "มือนี้ยังไม่จบ เริ่มรอบใหม่ตอนนี้ไม่ได้" };
      }
      st.sessionOver = false;
      st.standings = null;
      st.startedAt = 0;
      st.handNo = 0;
      st.phase = "waiting";
      /* กำไรขาดทุนต้องเริ่มนับใหม่ ไม่งั้นรอบใหม่ขึ้นบวกตั้งแต่ยังไม่แจกไพ่
         การ์ดต่อเวลาก็แจกใหม่ เพราะมันเป็นโควตาต่อ "รอบเล่น" ไม่ใช่ตลอดชีวิต */
      for (const p2 of seated()) {
        p2.boughtIn = p2.stack; p2.committed = 0;
        p2.timeCards = cfg.timeCards;
      }
      note("เริ่มรอบเล่นใหม่");
      return {};
    }

    /* ---------- ขอนาฬิกา (call the clock) ----------
       ⚠️ โต๊ะที่ตั้ง "ไม่จำกัดเวลา" แล้วคนที่ถึงตาเงียบไปเฉยๆ (ยังต่อเน็ต แค่ไม่กด) จะค้างถาวร
       ไม่มีทางออกเลย: endrun ก็ไม่ได้ ("มือนี้ยังไม่จบ") คนอื่นก็หมอบแทนไม่ได้
       ต้องลุกออกกันทั้งโต๊ะ (ทดสอบด้วยการเล่นจริงแล้วค้างเกิน 47 วินาทีโดยไม่มีที่สิ้นสุด)

       แต่จะใส่เพดานเวลาแข็งๆ ก็ผิดเจตนาของโหมดนี้ ซึ่งตั้งใจให้ไม่มีนาฬิกากดดัน
       จึงใช้วิธีเดียวกับโต๊ะจริง: ใครที่นั่งอยู่ก็ "ขอนาฬิกา" ได้เมื่อรอนานเกินควร
       แล้วคนที่ถึงตาจะมีเวลาอีก 30 วินาที ก่อนระบบเดินแทนให้
       คนตัดสินว่าจะรอต่อไหม คือคนที่โต๊ะ ไม่ใช่ตัวเลขที่ฝังไว้ในโค้ด */
    if (msg.type === "clock") {
      if (turnBudget()) return { error: "โต๊ะนี้มีเวลาต่อตาอยู่แล้ว ไม่ต้องขอนาฬิกา" };
      if (st.current < 0) return { error: "ตอนนี้ไม่มีใครถึงตา" };
      if (st.current === seatId) return { error: "ขอนาฬิกาให้ตัวเองไม่ได้" };
      if (st.clockAt) return { error: "มีคนขอนาฬิกาไปแล้ว" };
      const waited = Date.now() - (st.turnAt || Date.now());
      if (waited < CLOCK_MIN_WAIT_MS) {
        return { error: "ขอได้เมื่อรอเกิน " + Math.round(CLOCK_MIN_WAIT_MS / 60000) + " นาที" };
      }
      st.clockAt = Date.now();
      const whoNow = st.seats[st.current];
      note((st.seats[seatId] ? st.seats[seatId].name : "มีคน") + " ขอนาฬิกา · " +
           (whoNow ? whoNow.name : "คนที่ถึงตา") + " เหลือ " + (CLOCK_GRACE_MS / 1000) + " วินาที");
      return {};
    }

    /* โชว์ไพ่เองหลังจบมือ — ของสนุกที่โต๊ะจริงมี เช่นโชว์ว่าเมื่อกี้บลัฟ
       ทำได้เฉพาะช่วงจบมือของมือนั้น และเฉพาะไพ่ของตัวเอง
       คนที่หมอบไปแล้วก็โชว์ได้ นั่นแหละคือจังหวะที่สนุกที่สุด */
    if (msg.type === "showcards") {
      const s2 = st.seats[seatId];
      if (st.phase !== "showdown") return { error: "โชว์ได้ตอนจบมือเท่านั้น" };
      if (!s2 || !s2.cards.length) return { error: "รอบนี้คุณไม่ได้ร่วมมือ" };
      if (st.shown[seatId]) return {};
      st.shown[seatId] = true;
      /* ⚠️ จำ "ใครโชว์" ด้วยรหัสคน ไม่ใช่แค่เลขที่นั่ง
         เลขที่นั่งเปลี่ยนมือได้ และย้ายที่นั่งทำได้ตอน showdown พอดี (ตั้งใจให้ทำตอนนั้น)
         ถ้าอ้างแต่เลขที่นั่ง พอคนโชว์ย้ายออกแล้วมีคนอื่นย้ายมานั่งแทน
         ธงจะไปติดคนใหม่ แล้วไพ่จริงของเขา (ยังไม่ถูกล้างจนกว่าจะขึ้นมือใหม่) จะถูกส่งให้ทุกเครื่อง */
      st.shownBy[s2.token || ("seat:" + seatId)] = true;
      note(s2.name + " โชว์ไพ่");
      return {};
    }

    /* ใช้การ์ดต่อเวลา ได้เฉพาะตอนถึงตาตัวเองและยังมีการ์ดเหลือ
       ต่อเวลาให้ "ตานี้" เท่านั้น พอเปลี่ยนตาเวลาที่ซื้อไว้จะถูกล้างใน setCurrent */
    if (msg.type === "timecard") {
      const s2 = st.seats[seatId];
      if (!cfg.turnSeconds) return { error: "โต๊ะนี้ไม่จำกัดเวลาอยู่แล้ว" };
      if (st.current !== seatId) return { error: "ใช้ได้ตอนถึงตาคุณเท่านั้น" };
      if (!s2 || s2.timeCards <= 0) return { error: "การ์ดต่อเวลาหมดแล้ว" };
      s2.timeCards--;
      st.turnExtra += cfg.timeCardSeconds * 1000;
      note(s2.name + " ใช้การ์ดต่อเวลา +" + cfg.timeCardSeconds + " วิ (เหลือ " + s2.timeCards + " ใบ)");
      return {};
    }

    if (msg.type === "act") return playerAction(seatId, msg);
    return { error: "คำสั่งไม่รู้จัก" };
  }

  /* ---------- นาฬิกาเดินเอง ----------
     ตัวจับเวลาไม่ได้อยู่ในโมดูลนี้ ฝั่งเซิร์ฟเวอร์เรียก tick() ทุกวินาที
     ทำแบบนี้เพราะโมดูลนี้ต้องเป็นตรรกะล้วน เทสต์ได้โดยไม่ต้องรอเวลาจริง
     คืนค่า true เมื่อมีอะไรเปลี่ยน เซิร์ฟเวอร์จะได้รู้ว่าต้องส่ง state ใหม่ */
  /* ---------- ขอนาฬิกา (call the clock) ----------
     ⚠️ โต๊ะที่ตั้ง "ไม่จำกัดเวลา" แล้วคนที่ถึงตาเงียบไปเฉยๆ (ยังต่อเน็ต แค่ไม่กด) จะค้างถาวร
     ไม่มีทางออกเลย: endrun ก็ไม่ได้ ("มือนี้ยังไม่จบ") คนอื่นก็หมอบแทนไม่ได้
     ต้องลุกออกกันทั้งโต๊ะ (ทดสอบแล้วค้างเกิน 47 วินาทีโดยไม่มีที่สิ้นสุด)

     แต่จะใส่เพดานเวลาแข็งๆ ก็ผิดเจตนาของโหมดนี้ ซึ่งตั้งใจให้ไม่มีนาฬิกากดดัน
     จึงใช้วิธีเดียวกับโต๊ะจริง: ใครก็ได้ที่นั่งอยู่ "ขอนาฬิกา" ได้เมื่อรอนานเกินควร
     แล้วคนที่ถึงตาจะมีเวลาอีก 30 วินาที ก่อนระบบเดินแทนให้
     คนตัดสินใจว่าจะรอต่อหรือไม่ คือคนที่โต๊ะ ไม่ใช่ตัวเลขที่ฝังไว้ในโค้ด */
  const CLOCK_GRACE_MS = 30000;    /* ขอแล้วให้เวลาอีกเท่านี้ */
  const CLOCK_MIN_WAIT_MS = 120000; /* รอนานเท่านี้ก่อนถึงจะขอได้ */

  function tick(now) {
    now = now || Date.now();
    /* มีคนขอนาฬิกาไว้ ให้ใช้เวลาที่เหลือของนาฬิกานั้นแทนงบปกติ */
    if (st.clockAt && st.current >= 0) {
      if (now - st.clockAt < CLOCK_GRACE_MS) return false;
      return forceTurn(now);
    }
    const budget = turnBudget();
    if (!budget || st.current < 0 || !st.turnAt) return false;
    if (st.phase === "waiting" || st.phase === "showdown") return false;
    if (now - st.turnAt < budget) return false;

    return forceTurn(now);
  }

  /* เดินแทนคนที่ถึงตา ใช้ทั้งตอนหมดเวลาปกติ และตอนนาฬิกาที่มีคนขอไว้หมด */
  function forceTurn(now) {
    const s2 = st.seats[st.current];
    if (!s2) return false;
    /* หมดเวลาแล้วเดินแทนให้ตามมารยาทโต๊ะ: ไม่มีเงินต้องตามก็เคาะ มีก็พับ
       ห้ามพับให้ถ้าเหลือคนเดียว เพราะเขาชนะไปแล้ว เงินจะหาย */
    const toCall = st.currentBet - s2.bet;
    const auto = (toCall <= 0 || inHand().length <= 1) ? "check" : "fold";
    note(s2.name + " หมดเวลา ระบบ" + (auto === "check" ? "เคาะ" : "พับ") + "ให้");
    const who = st.current;
    /* ⚠️ ต้องอ่านเวลาก่อนเดินแทน เพราะ playerAction มาร์คว่า "ลงมือแล้ว" เสมอ
       ถ้าอ่านทีหลัง ตัวจับเวลาจะถูกรีเซ็ตด้วยการเดินแทนของระบบเอง
       แล้วจะไม่มีวันถึง 200 วินาที ต่อให้คนนั้นหายไปทั้งคืน */
    const idleSince = s2.lastActAt;
    /* ⚠️ ต้องนับไว้ก่อนเดินแทน แล้วเขียนทับหลังจากนั้น
       เพราะ playerAction ล้างตัวนับเสมอ (มันไม่รู้ว่าใครเป็นคนสั่ง)
       ถ้าไปนับทีหลัง ค่าจะเป็น 1 ตลอดกาล ไม่มีวันครบ 3 ตาติด
       — กับดักเดียวกับที่ทำให้ตัวจับเวลา 200 วิ ไม่เคยทำงาน */
    const nextTimeouts = (s2.timeouts || 0) + 1;
    playerAction(who, { action: auto });
    s2.timeouts = nextTimeouts;

    /* หายไปนานจริงๆ ให้พักมือให้ ไม่งั้นทั้งโต๊ะต้องรอครบเวลาทุกมือ
       ⚠️ ต้องเช็คหลังลงมือแทนแล้ว และเฉพาะคนที่ "หมดเวลา" เท่านั้น
       คนที่นั่งดูอยู่เฉยๆ ไม่เคยถึงตา ต้องไม่โดนพักมือ */
    const idleMs = cfg.idleSitOutSeconds * 1000;
    const byTime = idleMs && now - idleSince > idleMs;
    const byCount = cfg.idleSitOutTimeouts && s2.timeouts >= cfg.idleSitOutTimeouts;
    if (!s2.isBot && !s2.sitOut && (byTime || byCount)) {
      s2.sitOut = true;
      s2.timeouts = 0;
      note(s2.name + (byCount && !byTime
        ? " ปล่อยหมดเวลา " + cfg.idleSitOutTimeouts + " ตาติด ระบบให้พักมือไว้ก่อน"
        : " ไม่ตอบสนองเกิน " + cfg.idleSitOutSeconds + " วิ ระบบให้พักมือไว้ก่อน"));
    }
    return true;
  }

  /* มีใครยังต่ออยู่ไหม ใช้ตัดสินว่าจะเก็บห้องทิ้งได้หรือยัง
     ⚠️ ห้ามนับบอท ไม่งั้นห้องที่เหลือแต่บอทจะไม่มีวันถูกเก็บ และเล่นกันเองไปตลอดกาล */
  function anyConnected() { return seated().some(s => s.connected && !s.isBot); }

  /* ข้อมูลย่อสำหรับหน้าเลือกโต๊ะ */
  function summary() {
    const all = seated();
    return {
      players: all.length,
      online: all.filter(s => s.connected).length,
      away: all.filter(s => !s.connected).map(s => s.name),
      names: all.filter(s => s.connected).map(s => s.name),
      /* ที่นั่งทั้ง 9 ช่อง: null = ว่าง · มีชื่อ = มีคนจองอยู่ */
      /* ไม่ส่งชิปของแต่ละคนออกไปนอกโต๊ะ คนที่ยังไม่ได้นั่งไม่ควรเห็น */
      seats: st.seats.map(s => s ? { name: s.name, connected: s.connected, isBot: s.isBot } : null),
      blinds: cfg.smallBlind + "/" + cfg.bigBlind,
      /* ⚠️ ต้องบอกช่วงซื้อเข้าออกไปด้วย ตั้งแต่ตอนยังไม่ได้นั่ง
         ไม่งั้นคนพิมพ์ 50 แล้วเซิร์ฟเวอร์ปรับเป็น 200 เงียบๆ
         แล้วยอดได้-เสียของเขาก็คิดจากเลขที่เขาไม่ได้เลือก */
      minBuyIn: cfg.minBuyIn,
      maxBuyIn: cfg.maxBuyIn,
      turnSeconds: cfg.turnSeconds,
      phase: st.phase,
      handNo: st.handNo,
      /* ที่นั่งร้างที่คืนได้แล้ว ไม่นับว่าเต็ม ไม่งั้นคนใหม่จะเห็นป้าย "เต็ม" ทั้งที่เข้าได้ */
      full: all.filter(x => x.connected || !x.awaySince ||
                            (Date.now() - x.awaySince <= SEAT_GRACE_MIN * 60000)).length >= MAX_SEATS,
      limit: cfg.limitType === "none" ? null
             : (cfg.limitType === "hands" ? cfg.limitValue + " ตา" : cfg.limitValue + " นาที")
    };
  }

  /* ประวัติมือทั้งหมดที่จบแล้ว ส่งเฉพาะตอนมีคนขอ ไม่ยัดไปกับ state ทุกครั้ง
     ไม่งั้นทุกการกดของทุกคนจะลากประวัติทั้งกองวิ่งข้ามเน็ตไปด้วย */
  function history() { return st.hands; }

  return { sit, moveSeat, leave, disconnect, action, tick, viewFor, openSeats, anyConnected, summary, history, _state: st, _cfg: cfg };
}
