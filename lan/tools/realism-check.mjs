/* ===========================================================
   สกอร์การ์ด "บอทเล่นเหมือนคนจริงรึยัง"

   ⚠️ ทำไมต้องมี: watch-bots วัด "ใครกำไร" ซึ่งเป็นคนละคำถามกับ "เล่นเหมือนคนมั้ย"
   บอทที่กำไรดีมากอาจเล่นด้วยท่าที่ไม่มีมนุษย์คนไหนทำ แล้วเราจะไม่มีวันเห็นจากตัวเลขกำไร
   (เจอจริง 2026-09-02: มืออาชีพกำไร +6,230 ต่อ 100 มือ แต่ไล่ทับรอบที่สาม 23.5% ของโอกาส
    ซึ่งของคนจริงคือ 1-2% — กำไรกลบพฤติกรรมที่อ่านออกทันทีว่าไม่ใช่คน)

   ตัวเลขอ้างอิงเป็นช่วงที่ใช้กันจริงในการอ่านผู้เล่นสดสเตกเล็ก
   ไม่ใช่ค่าที่ "ถูกต้องตามทฤษฎีเกม" — เป้าหมายคือเหมือนคน ไม่ใช่เก่งที่สุด

   ⚠️ ค่าอ้างอิงหลายตัว (c-bet · หมอบใส่ c-bet) เป็นค่าของ "กองตัวต่อตัว" เป็นหลัก
   โต๊ะแปดคนมีกองหลายคนเยอะ ซึ่งหมอบมากกว่านั้นเป็นเรื่องปกติ จึงต้องแยกนับ
   ไม่งั้นจะไปดัดบอทให้เข้าเลขที่เทียบกันไม่ได้ตั้งแต่แรก

   รัน:  node lan/tools/realism-check.mjs [จำนวนมือ]
   ออก 0 = ผ่านหมด · 1 = มีช่องแดง
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HANDS = Number(process.argv[2] || 12000);
const PER_ROUND = 2000;
const LN = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };

/* ช่วงของคนจริง แยกตามแบบผู้เล่นที่แต่ละระดับเลียนแบบ
   1 = คนเพิ่งหัด เล่นเยอะ ไล่น้อย · 2 = คนเล่นหลวมดุ · 3 = คนเล่นแน่นดุ */
const WANT = {
  1: { vpip: [35, 60], pfr: [2, 10],  limp: [18, 45], b3: [0.5, 5], b4: [0, 3],
       cr: [1, 6], af: [0.3, 1.1], wtsd: [24, 42],
       /* คนเพิ่งหัดแทบไม่ใช้ตำแหน่ง · ยิงต่อน้อยกว่าคนเล่นเป็นชัดเจน */
       pos: [0.85, 1.35], cbet: [25, 62], fcb: [40, 63], donk: [1.5, 12], size: [30, 72],
       /* คนเพิ่งหัดขโมยบอดน้อยแต่ไม่ใช่ไม่ทำ · ป้องกันบอดกว้างเกินไปเพราะ "จ่ายไปแล้ว เสียดาย" */
       steal: [4, 20], bbf: [40, 70], sbf: [45, 78], barrel: [15, 55] },
  /* ⚠️ ช่อง cr ของระดับนี้กว้างกว่าคนทั่วไป (3-8%) เพราะ 6-12% คือช่วงของคนเล่นหลวมดุจริง ๆ
     พิสูจน์แล้วว่าไม่ใช่การขยับเป้าให้ผ่าน: ปิดทาง check-raise ที่เขียนเพิ่มทั้งหมด
     ค่ายังอยู่ที่ 8.0% คือมาจากความดุประจำระดับเอง ไม่ได้มาจากโค้ดที่ใส่ทีหลัง
     เช่นเดียวกับ cbet/size ที่กว้างกว่าคนทั่วไป — ยิงใหญ่และยิงบ่อยคือตัวตนของระดับนี้ */
  2: { vpip: [45, 70], pfr: [18, 40], limp: [8, 35],  b3: [4, 12],  b4: [0, 4],
       cr: [2, 12], af: [1.4, 4.0], wtsd: [28, 46],
       pos: [1.15, 2.20], cbet: [55, 92], fcb: [35, 58], donk: [1.5, 12], size: [45, 95],
       /* คนหลวมดุป้องกันบอดแทบทุกครั้ง กรอบจึงต่ำกว่าคนทั่วไปมาก และยิงต่อบ่อยกว่า */
       steal: [22, 50], bbf: [12, 55], sbf: [28, 70], barrel: [40, 78] },
  3: { vpip: [20, 35], pfr: [14, 26], limp: [0, 12],  b3: [4, 11],  b4: [0.3, 3],
       cr: [3, 9], af: [1.4, 3.6], wtsd: [22, 32],
       pos: [1.35, 2.30], cbet: [55, 82], fcb: [40, 58], donk: [1.5, 12], size: [45, 80],
       steal: [25, 48], bbf: [50, 72], sbf: [65, 88], barrel: [40, 62] }
};
const LABEL = {
  vpip: "VPIP ลงเล่นกี่ % ของมือ",
  pfr:  "PFR ไล่ก่อนฟลอป",
  limp: "limp ตามบอดเฉย ๆ",
  b3:   "3-bet ไล่ทับรอบสอง",
  b4:   "4-bet+ ไล่ทับรอบสาม",
  cr:   "check-raise",
  af:   "ไล่:ตาม หลังฟลอป",
  wtsd: "ไปถึงเปิดไพ่",
  pos:  "เล่นท้าย/ต้น (เท่า)",
  cbet: "c-bet ตัวต่อตัว",
  fcb:  "หมอบใส่ c-bet ตัวต่อตัว",
  donk: "donk เดิมพันตัดหน้า",
  size: "ขนาดเดิมพันกลาง ๆ",
  steal: "ขโมยบอดจากท้ายโต๊ะ",
  bbf:  "บอดใหญ่หมอบใส่คนขโมย",
  sbf:  "บอดเล็กหมอบใส่คนขโมย",
  barrel: "ยิงต่อที่เทิร์น"
};
const ORDER = ["vpip", "pfr", "limp", "b3", "b4", "cr", "af", "wtsd",
               "pos", "cbet", "fcb", "donk", "size",
               "steal", "bbf", "sbf", "barrel"];

const ROSTER = {
  1: ["Milo", "Pip", "Toby", "Bruno", "Ozzy", "Rudy", "Gus", "Wally", "Bobby", "Sammy"],
  2: ["Vince", "Rocco", "Gio", "Marco", "Sonny", "Rico", "Tank", "Buddy", "Lenny", "Frankie"],
  3: ["Rex", "Duke", "Vega", "Otto", "Zed", "Kai", "Nico", "Sable", "Cole", "Ash"]
};
const PER_LEVEL = { 1: 3, 2: 3, 3: 2 };
const off = { 1: 0, 2: 0, 3: 0 };

const S = {};
for (const lv of [1, 2, 3]) {
  S[lv] = { hands: 0, vpip: 0, pfr: 0, limp: 0, b3: 0, b4: 0, opp3: 0,
            chk: 0, cr: 0, post: 0, call: 0, flop: 0, sd: 0,
            early: 0, earlyVp: 0, late: 0, lateVp: 0,
            cbetHu: 0, cbetHuN: 0, fcbHu: 0, fcbHuN: 0,
            donk: 0, donkN: 0, sizes: [],
            steal: 0, stealN: 0, bbf: 0, bbfN: 0, sbf: 0, sbfN: 0, barrel: 0, barrelN: 0 };
}

let done = 0;
while (done < HANDS) {
  const n = Math.min(PER_ROUND, HANDS - done);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-"));
  bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);
  const table = createTable("REAL");
  const mgr = createBotManager({ table: table }, function () {});
  table.sit("คนดู", null, 1000000, "watcher");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;
  for (const lv of [1, 2, 3]) {
    for (let k = 0; k < PER_LEVEL[lv]; k++) mgr._addNamed(ROSTER[lv][(off[lv] + k) % 10], lv);
    off[lv] = (off[lv] + PER_LEVEL[lv]) % 10;
  }
  const st = table._state;

  for (let h = 0; h < n; h++) {
    if (table.action(0, { type: "start" }).error) break;
    done++;
    let g = 0;
    while (st.phase !== "showdown" && st.phase !== "waiting" && g++ < 260) {
      const cur = st.current;
      if (cur < 0) break;
      if (!mgr._decideNow(cur)) {
        const v = table.viewFor(cur);
        table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
      }
      mgr.senseTable();
    }
    mgr.senseTable();

    const hist = st.hands || [];
    const hand = hist.length ? hist[hist.length - 1] : null;
    const res = st.lastResult;
    if (hand) {
      const lvOf = {};
      for (const s of st.seats) if (s && s.isBot) lvOf[s.seatId] = s.botLevel;
      for (const s of st.seats) if (s && s.isBot) S[s.botLevel].hands++;
      const acts = hand.acts || [];
      const pre = acts.filter(function (a) { return a.phase === "preflop"; });

      /* ---- ก่อนฟลอป ---- */
      let raises = 0;
      const did = {};
      for (const a of pre) {
        const lv = lvOf[a.seat];
        if (lv) {
          did[a.seat] = did[a.seat] || { vp: 0, pfr: 0, limp: 0 };
          /* ⚠️ ตัวหารของ 3-bet ต้องรวมครั้งที่ "ไล่ทับจริง" ด้วย
             ถ้านับแค่ครั้งที่ตาม/ทิ้ง ตัวเลขจะพองขึ้นทันที (เคยพลาดมาแล้ว) */
          if (raises >= 1) {
            S[lv].opp3++;
            if (a.act === "raise" || a.act === "bet") {
              if (raises === 1) S[lv].b3++; else S[lv].b4++;
            }
          }
          if (a.act === "raise" || a.act === "bet") { did[a.seat].vp = 1; did[a.seat].pfr = 1; }
          else if (a.act === "call") { did[a.seat].vp = 1; if (raises === 0) did[a.seat].limp = 1; }
        }
        if (a.act === "raise" || a.act === "bet") raises++;
      }
      for (const sid of Object.keys(did)) {
        const lv = lvOf[sid]; if (!lv) continue;
        if (did[sid].vp) S[lv].vpip++;
        if (did[sid].pfr) S[lv].pfr++;
        if (did[sid].limp) S[lv].limp++;
      }

      /* ---- ตำแหน่ง ----
         ⚠️ ต้องนับจาก "ที่นั่งเทียบปุ่มดีลเลอร์" ไม่ใช่จากลำดับที่เดินจริง
         ลำดับที่เดินหดลงเมื่อมีคนหมอบ ตำแหน่งเดียวกันจึงได้เลขไม่เท่ากันในแต่ละมือ
         และต้องตัดบอดเล็ก-บอดใหญ่ทิ้ง เพราะถูกบังคับลงเงินอยู่แล้ว ตัวเลขจะพอง */
      const seatsInHand = [];
      for (const a of acts) if (seatsInHand.indexOf(a.seat) === -1) seatsInHand.push(a.seat);
      const ring = [];
      for (let k = 1; k <= st.seats.length && ring.length < seatsInHand.length; k++) {
        const idx = (hand.button + k) % st.seats.length;
        if (seatsInHand.indexOf(idx) >= 0) ring.push(idx);
      }
      /* ring = [บอดเล็ก, บอดใหญ่, ต้น..., cutoff, ปุ่ม] */
      ring.forEach(function (sid, i) {
        const lv = lvOf[sid]; if (!lv) return;
        const isEarly = i >= 2 && i < 5;
        const isLate = i >= ring.length - 2;
        if (!isEarly && !isLate) return;
        const vp = pre.some(function (a) {
          return a.seat === sid && (a.act === "call" || a.act === "raise" || a.act === "bet");
        });
        if (isLate) { S[lv].late++; if (vp) S[lv].lateVp++; }
        else { S[lv].early++; if (vp) S[lv].earlyVp++; }
      });

      /* ---- ขโมยบอด · ป้องกันบอด ----
         ⚠️ ต้องนับ "ท่าแรกของบอดแต่ละคน" แยกกัน บอดเล็กเดินก่อนบอดใหญ่เสมอ
         ถ้าหยุดที่คนแรกที่เจอ บอดใหญ่จะแทบไม่ถูกนับเลย (เคยได้ตัวอย่างแค่ 3-15 ครั้ง) */
      const sbSeat = ring[0], bbSeat = ring[1];
      const lateTwo = ring.slice(-2);
      let raisedYet = false, stealer = -1;
      for (const a of pre) {
        const lv = lvOf[a.seat];
        if (!raisedYet && lv && lateTwo.indexOf(a.seat) >= 0) {
          S[lv].stealN++;
          if (a.act === "raise" || a.act === "bet") S[lv].steal++;
        }
        if ((a.act === "raise" || a.act === "bet") && !raisedYet) { raisedYet = true; stealer = a.seat; }
      }
      if (stealer >= 0 && lateTwo.indexOf(stealer) >= 0) {
        let sbDone = false, bbDone = false;
        for (const a of pre) {
          const lv = lvOf[a.seat]; if (!lv) continue;
          if (a.seat === sbSeat && !sbDone) { sbDone = true; S[lv].sbfN++; if (a.act === "fold") S[lv].sbf++; }
          else if (a.seat === bbSeat && !bbDone) { bbDone = true; S[lv].bbfN++; if (a.act === "fold") S[lv].bbf++; }
          if (sbDone && bbDone) break;
        }
      }

      /* ---- หลังฟลอป ---- */
      const post = acts.filter(function (a) { return a.phase !== "preflop"; });
      const flop = acts.filter(function (a) { return a.phase === "flop"; });
      /* ⚠️ "เห็นฟลอป" = ไม่ได้หมอบก่อนฟลอป — ไม่ใช่ "มีท่าในฟลอป"
         ของเดิมนับจากคนที่เดินในฟลอป ซึ่งตกคนที่ลงหมดตัวไปก่อนฟลอปแล้ว
         (คนกลุ่มนี้ไม่มีท่าให้เดินอีก แต่ไปถึงเปิดไพ่แน่นอน)
         ตัวหารจึงเล็กกว่าตัวตั้ง แล้ว wtsd ทะลุ 100% ได้ — เจอตอนเอานิยามชุดนี้
         ไปวัดโต๊ะจริงเมื่อ 2026-09-03 (คนจริงลงหมดตัวก่อนฟลอปบ่อยกว่าบอทมาก
         1,280 ครั้งจาก 3,819 เปิดไพ่) ในการจำลองมันแค่ทำให้ค่าสูงเกินจริงเงียบ ๆ */
      const foldedPre = new Set();
      for (const a of acts) if (a.phase === "preflop" && a.act === "fold") foldedPre.add(a.seat);
      const sawFlop = new Set();
      if ((hand.board || []).length >= 3) {
        /* คนที่ถูกแจกไพ่ในมือนี้เท่านั้น — st.seats มีบอทที่เพิ่งนั่งหรือรออยู่ด้วย */
        const seatOfName = {};
        for (const s of st.seats) if (s) seatOfName[s.name] = s.seatId;
        for (const pl of (hand.players || [])) {
          const sid = seatOfName[pl.name];
          if (sid !== undefined && !foldedPre.has(sid)) sawFlop.add(sid);
        }
      }
      for (const sid of sawFlop) if (lvOf[sid]) S[lvOf[sid]].flop++;
      for (const a of post) {
        const lv = lvOf[a.seat]; if (!lv) continue;
        if (a.act === "raise" || a.act === "bet") S[lv].post++;
        else if (a.act === "call") S[lv].call++;
      }
      /* check-raise: ตัวหาร = ครั้งที่เคาะผ่านแล้ว "ได้กลับมาเดินอีก" ในสตรีทเดียวกัน */
      for (const ph of ["flop", "turn", "river"]) {
        const rows = post.filter(function (a) { return a.phase === ph; });
        const checked = new Set();
        for (const a of rows) {
          const lv = lvOf[a.seat]; if (!lv) continue;
          if (a.act === "check") { checked.add(a.seat); continue; }
          if (!checked.has(a.seat)) continue;
          S[lv].chk++;
          if (a.act === "raise" || a.act === "bet") S[lv].cr++;
          checked.delete(a.seat);
        }
      }

      /* ---- c-bet · หมอบใส่ c-bet · donk ---- */
      let pfRaiser = -1;
      for (const a of pre) if (a.act === "raise" || a.act === "bet") pfRaiser = a.seat;
      if (pfRaiser >= 0 && flop.length && flop.some(function (a) { return a.seat === pfRaiser; })) {
        const headsUp = sawFlop.size === 2;
        let firstAggr = -1;
        for (const a of flop) if (a.act === "raise" || a.act === "bet") { firstAggr = a.seat; break; }
        const lvR = lvOf[pfRaiser];
        if (lvR && headsUp) {
          S[lvR].cbetHuN++;
          if (firstAggr === pfRaiser) S[lvR].cbetHu++;
        }
        /* donk = คนแรกที่ได้เดิน และได้เดินก่อนคนที่ไล่มา เลือกเดิมพันเอง */
        const raiserIdx = flop.findIndex(function (x) { return x.seat === pfRaiser; });
        for (let k = 0; k < flop.length; k++) {
          const a = flop[k];
          if (a.seat === pfRaiser) break;
          const l2 = lvOf[a.seat];
          if (l2 && raiserIdx > k) {
            S[l2].donkN++;
            if (a.act === "bet" || a.act === "raise") S[l2].donk++;
          }
          break;
        }
        if (firstAggr === pfRaiser && headsUp) {
          const ci = flop.findIndex(function (a) {
            return a.seat === pfRaiser && (a.act === "bet" || a.act === "raise");
          });
          for (let k = ci + 1; k < flop.length; k++) {
            const a = flop[k], l2 = lvOf[a.seat];
            if (!l2 || a.seat === pfRaiser) continue;
            S[l2].fcbHuN++;
            if (a.act === "fold") S[l2].fcbHu++;
          }
        }
      }

      /* ---- ยิงต่อที่เทิร์น: ยิงฟลอปแล้วยังยิงต่อไหม ---- */
      const turnActs = acts.filter(function (a) { return a.phase === "turn"; });
      if (pfRaiser >= 0 && flop.length && turnActs.length) {
        const firstFlopBet = flop.find(function (a) { return a.act === "bet" || a.act === "raise"; });
        if (firstFlopBet && firstFlopBet.seat === pfRaiser) {
          const mine = turnActs.find(function (a) { return a.seat === pfRaiser; });
          const lv2 = lvOf[pfRaiser];
          if (lv2 && mine) {
            S[lv2].barrelN++;
            if (mine.act === "bet" || mine.act === "raise") S[lv2].barrel++;
          }
        }
      }

      /* ---- ขนาดเดิมพันเทียบกอง (หลังฟลอปเท่านั้น) ---- */
      let running = (hand.sb || 0) + (hand.bb || 0);
      for (const a of acts) {
        const lv = lvOf[a.seat];
        if (lv && a.phase !== "preflop" && (a.act === "bet" || a.act === "raise") &&
            a.amount > 0 && running > 0) {
          S[lv].sizes.push(a.amount / running);
        }
        running += (a.amount || 0);
      }

      if (res && res.showdown) {
        for (const r of (res.reveal || [])) {
          const s = st.seats.find(function (x) { return x && x.name === r.name; });
          if (s && s.isBot) S[s.botLevel].sd++;
        }
      }
    }
    mgr.settleBusted();
    if (st.seats.filter(function (x) { return x && x.isBot; }).length < 4) break;
  }
  mgr.stop();
  for (const s of st.seats) if (s && s.isBot) bank.release(s.name);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ไม่เป็นไร */ }
}

function valuesOf(s) {
  const sizes = s.sizes.slice().sort(function (a, b) { return a - b; });
  const med = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const eV = s.early ? s.earlyVp / s.early : 0;
  const lV = s.late ? s.lateVp / s.late : 0;
  return {
    vpip: s.hands ? s.vpip / s.hands * 100 : 0,
    pfr:  s.hands ? s.pfr  / s.hands * 100 : 0,
    limp: s.hands ? s.limp / s.hands * 100 : 0,
    b3:   s.opp3  ? s.b3   / s.opp3  * 100 : 0,
    b4:   s.opp3  ? s.b4   / s.opp3  * 100 : 0,
    cr:   s.chk   ? s.cr   / s.chk   * 100 : 0,
    af:   s.call  ? s.post / s.call        : 0,
    wtsd: s.flop  ? s.sd   / s.flop  * 100 : 0,
    pos:  eV ? lV / eV : 0,
    cbet: s.cbetHuN ? s.cbetHu / s.cbetHuN * 100 : 0,
    fcb:  s.fcbHuN  ? s.fcbHu  / s.fcbHuN  * 100 : 0,
    donk: s.donkN   ? s.donk   / s.donkN   * 100 : 0,
    size: med * 100,
    steal:  s.stealN  ? s.steal  / s.stealN  * 100 : 0,
    bbf:    s.bbfN    ? s.bbf    / s.bbfN    * 100 : 0,
    sbf:    s.sbfN    ? s.sbf    / s.sbfN    * 100 : 0,
    barrel: s.barrelN ? s.barrel / s.barrelN * 100 : 0
  };
}

let bad = 0;
console.log("");
console.log("บอทเล่นเหมือนคนจริงรึยัง · " + done.toLocaleString("en-US") + " มือ");
console.log("=".repeat(74));
for (const lv of [1, 2, 3]) {
  const v = valuesOf(S[lv]);
  console.log("");
  console.log(LN[lv] + "   (" + S[lv].hands.toLocaleString("en-US") + " มือที่นั่งอยู่)");
  for (const k of ORDER) {
    const lo = WANT[lv][k][0], hi = WANT[lv][k][1];
    const got = v[k];
    const okay = got >= lo && got <= hi;
    if (!okay) bad++;
    const unit = (k === "af" || k === "pos") ? "" : "%";
    console.log("   " + (okay ? "ok   " : "ผิด  ") + LABEL[k].padEnd(24) +
                ((k === "af" || k === "pos") ? got.toFixed(2) : got.toFixed(1)).padStart(7) + unit +
                "   ควรอยู่ " + lo + "-" + hi + unit);
  }
}
console.log("");
if (bad) { console.log("=== ยังไม่ผ่าน " + bad + " ช่อง ==="); process.exit(1); }
console.log("=== ผ่านทุกช่อง (" + (ORDER.length * 3) + " ช่อง) — เล่นอยู่ในกรอบของคนจริงทั้งสามระดับ ===");
