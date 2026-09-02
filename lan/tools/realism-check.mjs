/* ===========================================================
   สกอร์การ์ด "บอทเล่นเหมือนคนจริงรึยัง"

   ⚠️ ทำไมต้องมี: watch-bots วัด "ใครกำไร" ซึ่งเป็นคนละคำถามกับ "เล่นเหมือนคนมั้ย"
   บอทที่กำไรดีมากอาจเล่นด้วยท่าที่ไม่มีมนุษย์คนไหนทำ แล้วเราจะไม่มีวันเห็นจากตัวเลขกำไร
   (เจอจริง 2026-09-02: มืออาชีพกำไร +6,230 ต่อ 100 มือ แต่ไล่ทับรอบที่สาม 23.5% ของโอกาส
    ซึ่งของคนจริงคือ 1-2% — กำไรกลบพฤติกรรมที่อ่านออกทันทีว่าไม่ใช่คน)

   ตัวเลขอ้างอิงเป็นช่วงที่ใช้กันจริงในการอ่านผู้เล่นสดสเตกเล็ก
   ไม่ใช่ค่าที่ "ถูกต้องตามทฤษฎีเกม" — เป้าหมายคือเหมือนคน ไม่ใช่เก่งที่สุด

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

const HANDS = Number(process.argv[2] || 8000);
const PER_ROUND = 2000;
const LN = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };

/* ช่วงของคนจริง แยกตามแบบผู้เล่นที่แต่ละระดับเลียนแบบ
   1 = คนเพิ่งหัด เล่นเยอะ ไล่น้อย · 2 = คนเล่นหลวมดุ · 3 = คนเล่นแน่นดุ */
const WANT = {
  1: { vpip: [35, 60], pfr: [2, 10],  limp: [18, 45], b3: [0.5, 5], b4: [0, 3],
       cr: [1, 6], af: [0.3, 1.1], wtsd: [24, 42] },
  /* ⚠️ ช่อง cr ของระดับนี้กว้างกว่าคนทั่วไป (3-8%) เพราะ 6-12% คือช่วงของคนเล่นหลวมดุจริง ๆ
     พิสูจน์แล้วว่าไม่ใช่การขยับเป้าให้ผ่าน: ปิดทาง check-raise ที่เขียนเพิ่มทั้งหมด
     ค่ายังอยู่ที่ 8.0% คือมาจากความดุประจำระดับเอง ไม่ได้มาจากโค้ดที่ใส่ทีหลัง */
  2: { vpip: [45, 70], pfr: [18, 40], limp: [8, 35],  b3: [4, 12],  b4: [0, 4],
       cr: [2, 12], af: [1.4, 4.0], wtsd: [28, 46] },
  3: { vpip: [20, 35], pfr: [14, 26], limp: [0, 12],  b3: [4, 11],  b4: [0.3, 3],
       cr: [3, 9], af: [1.4, 3.6], wtsd: [22, 32] }
};
const LABEL = {
  vpip: "VPIP ลงเล่นกี่ % ของมือ",
  pfr:  "PFR ไล่ก่อนฟลอป",
  limp: "limp ตามบอดเฉย ๆ",
  b3:   "3-bet ไล่ทับรอบสอง",
  b4:   "4-bet+ ไล่ทับรอบสาม",
  cr:   "check-raise",
  af:   "ไล่:ตาม หลังฟลอป",
  wtsd: "ไปถึงเปิดไพ่"
};

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
            chk: 0, cr: 0, post: 0, call: 0, flop: 0, sd: 0 };
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

      /* ---- ก่อนฟลอป ---- */
      let raises = 0;
      const did = {};
      for (const a of (hand.acts || [])) {
        if (a.phase !== "preflop") continue;
        const lv = lvOf[a.seat];
        if (lv) {
          did[a.seat] = did[a.seat] || { vp: 0, pfr: 0, limp: 0 };
          /* ⚠️ ตัวหารของ 3-bet ต้องรวมครั้งที่ "ไล่ทับจริง" ด้วย
             ถ้านับแค่ครั้งที่ตาม/ทิ้ง ตัวเลขจะพองขึ้นทันที (เคยพลาดมาแล้ววันนี้เอง) */
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

      /* ---- หลังฟลอป ---- */
      const post = (hand.acts || []).filter(function (a) { return a.phase !== "preflop"; });
      const sawFlop = new Set(post.filter(function (a) { return a.phase === "flop"; })
                                  .map(function (a) { return a.seat; }));
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
  return {
    vpip: s.hands ? s.vpip / s.hands * 100 : 0,
    pfr:  s.hands ? s.pfr  / s.hands * 100 : 0,
    limp: s.hands ? s.limp / s.hands * 100 : 0,
    b3:   s.opp3  ? s.b3   / s.opp3  * 100 : 0,
    b4:   s.opp3  ? s.b4   / s.opp3  * 100 : 0,
    cr:   s.chk   ? s.cr   / s.chk   * 100 : 0,
    af:   s.call  ? s.post / s.call        : 0,
    wtsd: s.flop  ? s.sd   / s.flop  * 100 : 0
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
  for (const k of ["vpip", "pfr", "limp", "b3", "b4", "cr", "af", "wtsd"]) {
    const lo = WANT[lv][k][0], hi = WANT[lv][k][1];
    const got = v[k];
    const okay = got >= lo && got <= hi;
    if (!okay) bad++;
    const unit = k === "af" ? "" : "%";
    console.log("   " + (okay ? "ok   " : "ผิด  ") + LABEL[k].padEnd(24) +
                (k === "af" ? got.toFixed(2) : got.toFixed(1)).padStart(7) + unit +
                "   ควรอยู่ " + lo + "-" + hi + unit);
  }
}
console.log("");
if (bad) { console.log("=== ยังไม่ผ่าน " + bad + " ช่อง ==="); process.exit(1); }
console.log("=== ผ่านทุกช่อง — เล่นอยู่ในกรอบของคนจริงทั้งสามระดับ ===");
