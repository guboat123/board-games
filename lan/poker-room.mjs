/* ===========================================================
   โต๊ะโป๊กเกอร์ Texas Hold'em — ตรรกะฝั่งตัวกลาง
   ตัวกลางถือไพ่เองทั้งหมด ผู้เล่นเห็นเฉพาะไพ่ในมือตัวเอง
   =========================================================== */

import {
  freshDeck, shuffle, evaluate7, compareScore, describeScore,
  buildPots, settlePots, cardCode
} from "./poker-engine.mjs";

const MAX_SEATS = 9;

export const DEFAULTS = {
  smallBlind: 10,
  bigBlind: 20,
  /* จบรอบเล่นเมื่อไหร่: none = เล่นไปเรื่อยๆ · hands = ครบกี่ตา · minutes = ครบกี่นาที
     ถ้าหมดเวลาระหว่างเล่นอยู่ ให้เล่นตานั้นจนจบก่อน แล้วค่อยนับคะแนน */
  limitType: "none",
  limitValue: 0,
  minBuyIn: 200,     /* ขอบเขตเท่านั้น แต่ละคนเลือกเองว่าจะเอาเท่าไหร่ */
  maxBuyIn: 100000,
  defaultBuyIn: 1000 /* ค่าที่เติมให้ในช่องกรอก เปลี่ยนได้ */
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
    startedAt: 0,        /* เวลาที่กดเริ่มตาแรก ใช้นับถอยหลัง */
    sessionOver: false,  /* ครบตามที่ตั้งไว้แล้ว */
    standings: null,     /* ผลรวมตอนจบรอบเล่น */
    lastResult: null,        /* สรุปมือที่เพิ่งจบ */
    log: []                  /* ข้อความสั้นๆ ให้โชว์ข้างโต๊ะ */
  };

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

  function sit(name, preferred, buyIn) {
    name = String(name || "").trim() || "ผู้เล่น";

    /* กลับเข้ามาใหม่ด้วยชื่อเดิม ให้นั่งที่เดิมพร้อมชิปเดิม */
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = st.seats[i];
      if (s && s.name === name && !s.connected) {
        s.connected = true;
        note(name + " กลับเข้าโต๊ะ");
        return { ok: true, seatId: i, name, stack: s.stack };
      }
    }

    let idx = -1;
    if (Number.isInteger(preferred) && preferred >= 0 && preferred < MAX_SEATS && !st.seats[preferred]) {
      idx = preferred;
    } else {
      for (let i = 0; i < MAX_SEATS; i++) if (!st.seats[i]) { idx = i; break; }
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
      bet: 0,            /* ลงไปแล้วเท่าไหร่ในรอบเดิมพันนี้ */
      committed: 0,      /* ลงไปแล้วเท่าไหร่ในมือนี้ทั้งหมด */
      cards: [],
      folded: false,
      allIn: false,
      inHand: false,
      acted: false,
      connected: true,
      sitOut: false,
      lastAction: ""
    };
    note(finalName + " เข้าโต๊ะด้วย " + chips + " ชิป");
    return { ok: true, seatId: idx, name: finalName, stack: chips };
  }

  function disconnect(seatId) {
    const s = st.seats[seatId];
    if (!s) return;
    s.connected = false;
    note(s.name + " หลุดออกจากโต๊ะ");

    if (s.inHand && !s.folded) {
      s.folded = true;
      s.lastAction = "หมอบ (หลุด)";
      if (st.current === seatId) advance();
      else checkRoundEnd();
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
    const ready = readyPlayers();
    if (ready.length < 2) return { error: "ต้องมีอย่างน้อย 2 คนที่มีชิป" };
    if (!st.startedAt) st.startedAt = Date.now();

    st.handNo++;
    st.board = [];
    st.deck = shuffle(freshDeck());
    st.currentBet = 0;
    st.minRaise = cfg.bigBlind;
    st.lastResult = null;
    st.phase = "preflop";

    for (const s of seated()) {
      s.bet = 0; s.committed = 0; s.cards = []; s.folded = false;
      s.allIn = false; s.acted = false; s.lastAction = "";
      s.inHand = ready.includes(s);
    }

    /* ปุ่มดีลเลอร์ขยับไปคนถัดไปที่ร่วมมือนี้ */
    st.button = nextOccupied(st.button, s => s.inHand);

    const heads = ready.length === 2;
    /* สองคน: ปุ่มเป็นบอดเล็กและพูดก่อนในพรีฟลอป */
    const sbSeat = heads ? st.button : nextOccupied(st.button, s => s.inHand);
    const bbSeat = nextOccupied(sbSeat, s => s.inHand);

    postBlind(sbSeat, cfg.smallBlind, "บอดเล็ก");
    postBlind(bbSeat, cfg.bigBlind, "บอดใหญ่");
    st.currentBet = cfg.bigBlind;

    /* แจกคนละ 2 ใบ */
    for (const s of st.seats) {
      if (s && s.inHand) s.cards = [st.deck.pop(), st.deck.pop()];
    }

    /* บอดใหญ่ยังมีสิทธิ์เคาะหรือเรซตอนจบรอบ จึงยังไม่ถือว่าพูดแล้ว */
    for (const s of canAct()) s.acted = false;

    st.current = nextOccupied(bbSeat, s => s.inHand && !s.folded && !s.allIn);
    note("— มือที่ " + st.handNo + " เริ่มแล้ว —");
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

    const toCall = st.currentBet - s.bet;

    if (msg.action === "fold") {
      s.folded = true;
      s.acted = true;
      s.lastAction = "หมอบ";
      note(s.name + " หมอบ");
    }

    else if (msg.action === "check") {
      if (toCall > 0) return { error: "มีเงินต้องตามอยู่ เคาะไม่ได้" };
      s.acted = true;
      s.lastAction = "เคาะ";
      note(s.name + " เคาะ");
    }

    else if (msg.action === "call") {
      if (toCall <= 0) return { error: "ไม่มีเงินต้องตาม ใช้เคาะแทน" };
      const pay = Math.min(toCall, s.stack);
      s.stack -= pay; s.bet += pay; s.committed += pay;
      if (s.stack === 0) { s.allIn = true; s.lastAction = "หมดหน้าตัก"; }
      else s.lastAction = "ตาม " + pay;
      s.acted = true;
      note(s.name + (s.allIn ? " หมดหน้าตัก " : " ตาม ") + pay);
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

      s.lastAction = (s.allIn ? "หมดหน้าตัก " : "เพิ่มเป็น ") + target;
      note(s.name + " " + s.lastAction);
    }

    else {
      return { error: "คำสั่งไม่รู้จัก" };
    }

    checkRoundEnd();
    return {};
  }

  /* ทุกคนที่ยังเล่นได้ พูดครบและเงินเท่ากันแล้วหรือยัง */
  function roundDone() {
    const live = canAct();
    if (!live.length) return true;
    return live.every(s => s.acted && s.bet === st.currentBet);
  }

  function checkRoundEnd() {
    /* เหลือคนเดียว จบมือทันที ไม่ต้องเปิดไพ่ */
    if (inHand().length <= 1) return finishHand(false);
    if (roundDone()) return nextPhase();
    advance();
  }

  function advance() {
    const nxt = nextOccupied(st.current, s => s.inHand && !s.folded && !s.allIn);
    st.current = nxt;
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

    st.current = nextOccupied(st.button, s => s.inHand && !s.folded && !s.allIn);
    if (st.current === -1) return nextPhase();
  }

  /* ---------- จบมือ ---------- */

  function finishHand(showdown) {
    const players = seated()
      .filter(s => s.committed > 0 || s.inHand)
      .map(s => ({ id: s.seatId, contributed: s.committed, folded: s.folded || !s.inHand }));

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
          hand: describeScore(sc)
        });
      }
    } else if (live.length === 1) {
      /* ชนะเพราะคนอื่นหมอบหมด ไม่ต้องเปิดไพ่ */
      scoreById[live[0].seatId] = [99];
    }

    const won = settlePots(pots, scoreById);
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
      pot: pots.reduce((a, p) => a + p.amount, 0)
    };

    st.phase = "showdown";
    st.current = -1;
    for (const s of seated()) { s.inHand = false; s.bet = 0; }

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
        stack: s.stack, boughtIn: s.boughtIn,
        net: s.stack - s.boughtIn
      }))
      .sort((a, b) => b.net - a.net);
    note("— จบรอบเล่น —");
  }

  /* ---------- มุมมองที่ส่งให้แต่ละเครื่อง ---------- */

  function potTotal() {
    return seated().reduce((a, s) => a + s.committed, 0);
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
      pot: potTotal(),
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
        handsLeft: cfg.limitType === "hands" ? Math.max(0, cfg.limitValue - st.handNo) : null,
        msLeft: msLeft(),
        over: st.sessionOver
      },
      standings: st.standings,
      readyCount: readyPlayers().length,
      log: st.log.slice(-8),
      openSeats: openSeats(),
      lastResult: st.lastResult,
      seats: st.seats.map((s, i) => s ? {
        seatId: i,
        name: s.name,
        stack: s.stack,
        boughtIn: s.boughtIn,
        net: s.stack - s.boughtIn,   /* บวก/ลบเทียบกับที่ซื้อเข้ามา */
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        inHand: s.inHand,
        connected: s.connected,
        sitOut: s.sitOut,
        lastAction: s.lastAction,
        /* ไพ่ในมือ: เห็นแค่ของตัวเอง หรือของทุกคนตอนเปิดไพ่ */
        cards: (i === mySeat || (st.lastResult && st.lastResult.showdown && !s.folded && s.cards.length))
                 ? s.cards.map(cardCode) : (s.cards.length ? ["??", "??"] : [])
      } : null)
    };
  }

  /* ---------- รับคำสั่ง ---------- */

  function action(seatId, msg) {
    if (!msg || typeof msg !== "object") return { error: "คำสั่งว่าง" };

    if (msg.type === "start") {
      if (st.phase !== "waiting" && st.phase !== "showdown") return { error: "มือนี้ยังไม่จบ" };
      return startHand();
    }
    if (msg.type === "sitout") {
      const s = st.seats[seatId];
      if (s) { s.sitOut = !!msg.value; note(s.name + (s.sitOut ? " ขอพักมือ" : " กลับมาเล่นต่อ")); }
      return {};
    }
    if (msg.type === "rebuy") {
      const s = st.seats[seatId];
      if (!s) return { error: "ไม่ได้นั่งอยู่" };
      if (s.inHand) return { error: "เติมชิประหว่างเล่นมือไม่ได้" };
      const add = clampBuyIn(msg.amount);
      s.stack += add;
      s.boughtIn += add;
      note(s.name + " เติมชิป " + add);
      return {};
    }

    /* ตั้งค่าโต๊ะ (บอด/ขอบเขตชิป) ทำได้เฉพาะตอนไม่มีมือกำลังเล่น */
    if (msg.type === "config") {
      if (st.phase !== "waiting" && st.phase !== "showdown") {
        return { error: "แก้ค่าโต๊ะระหว่างเล่นมือไม่ได้" };
      }
      const sb = Math.floor(Number(msg.smallBlind));
      const bb = Math.floor(Number(msg.bigBlind));
      if (isFinite(sb) && sb > 0) cfg.smallBlind = sb;
      if (isFinite(bb) && bb > 0) cfg.bigBlind = bb;
      if (cfg.bigBlind < cfg.smallBlind) cfg.bigBlind = cfg.smallBlind * 2;
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
    /* เริ่มรอบเล่นใหม่: ล้างเวลาและจำนวนตา แต่ชิปคงไว้ */
    if (msg.type === "newsession") {
      st.sessionOver = false;
      st.standings = null;
      st.startedAt = 0;
      st.handNo = 0;
      st.phase = "waiting";
      note("เริ่มรอบเล่นใหม่");
      return {};
    }

    if (msg.type === "act") return playerAction(seatId, msg);
    return { error: "คำสั่งไม่รู้จัก" };
  }

  /* มีใครยังต่ออยู่ไหม ใช้ตัดสินว่าจะเก็บห้องทิ้งได้หรือยัง */
  function anyConnected() { return seated().some(s => s.connected); }

  return { sit, disconnect, action, viewFor, openSeats, anyConnected, _state: st, _cfg: cfg };
}
