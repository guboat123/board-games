/* ===========================================================
   เงินของแต่ละระดับรั่วออกทางไหน — แยกตามสตรีทและตามท่าที่ลงเงิน

   watch-bots บอกได้ว่า "ใครเสีย" แต่ไม่ได้บอกว่า "เสียตอนไหน"
   ซึ่งเป็นคำถามที่ต้องตอบก่อนจะแก้ ไม่งั้นก็ได้แค่ขยับตัวเลขไปเรื่อย ๆ

   วิธีวัด: ดูเฉพาะ "มือที่เขาแพ้" แล้วแยกว่าเงินที่เสียไปถูกใส่ลงกองตอนสตรีทไหน
   เงินที่ใส่ในมือที่แพ้ = ขาดทุนล้วน ไม่ต้องเดาว่าจะปันส่วนเงินรางวัลยังไง
   และแยกด้วยว่าใส่ด้วยการ "ตาม" หรือ "ไล่" — สองอย่างนี้ต้องแก้คนละแบบ

   รัน:  node lan/tools/leak-scan.mjs [จำนวนมือ] [ระดับที่อยากดูละเอียด]
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HANDS = Number(process.argv[2] || 30000);
const PER_ROUND = 5000;
const LVNAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };
const ROSTER = {
  1: ["Milo", "Pip", "Toby", "Bruno", "Ozzy", "Rudy", "Gus", "Wally", "Bobby", "Sammy"],
  2: ["Vince", "Rocco", "Gio", "Marco", "Sonny", "Rico", "Tank", "Buddy", "Lenny", "Frankie"],
  3: ["Rex", "Duke", "Vega", "Otto", "Zed", "Kai", "Nico", "Sable", "Cole", "Ash"]
};
const PER_LEVEL = { 1: 3, 2: 3, 3: 2 };
const STREETS = ["preflop", "flop", "turn", "river"];

/* ระดับ -> สตรีท -> { call, raise, blind }  เฉพาะเงินที่ใส่ในมือที่แพ้ */
const lost = {};
/* ระดับ -> เงินที่ได้กลับมาทั้งหมด และจำนวนมือ */
const tot = {};
for (const lv of [1, 2, 3]) {
  lost[lv] = {};
  for (const s of STREETS) lost[lv][s] = { call: 0, raise: 0, blind: 0 };
  tot[lv] = { hands: 0, won: 0, put: 0, lostHands: 0, wonHands: 0 };
}

const offset = { 1: 0, 2: 0, 3: 0 };
let done = 0;

while (done < HANDS) {
  const hands = Math.min(PER_ROUND, HANDS - done);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leak-"));
  bank._setDir(dir); mind._setDir(dir); mind.setAutoSave(false);

  const table = createTable("LEAK");
  const mgr = createBotManager({ table: table }, () => {});
  table.sit("คนดู", null, 1000000, "watcher");
  table._state.seats[0].connected = true;
  table._state.seats[0].sitOut = true;
  for (const lv of [1, 2, 3]) {
    for (let k = 0; k < PER_LEVEL[lv]; k++) {
      mgr._addNamed(ROSTER[lv][(offset[lv] + k) % 10], lv);
    }
    offset[lv] = (offset[lv] + PER_LEVEL[lv]) % 10;
  }
  const st = table._state;

  for (let h = 0; h < hands; h++) {
    if (table.action(0, { type: "start" }).error) break;
    done++;
    let guard = 0;
    while (st.phase !== "showdown" && st.phase !== "waiting" && guard++ < 260) {
      const cur = st.current;
      if (cur < 0) break;
      if (!mgr._decideNow(cur)) {
        const v = table.viewFor(cur);
        table.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
      }
      mgr.senseTable();
    }
    mgr.senseTable();

    const res = st.lastResult;
    /* ⚠️ st.hand ถูกล้างทิ้งตอนจบมือ (บรรทัด st.hand = null) มือที่เพิ่งจบไปอยู่ท้าย st.hands
       ถ้าอ่านจาก st.hand ตรง ๆ จะได้ค่าว่างทุกมือ แล้วรายงานออกมาเป็นศูนย์หมดโดยไม่มีอะไรฟ้อง */
    const hist = st.hands || [];
    const hand = hist.length ? hist[hist.length - 1] : null;
    if (res && hand) {
      const won = {}; (res.payouts || []).forEach(x => { won[x.seatId] = x.amount; });
      const put = {}; (res.puts || []).forEach(x => { put[x.seatId] = x.amount; });
      for (const s of st.seats) {
        if (!s || !s.isBot) continue;
        const lv = s.botLevel;
        const t = tot[lv];
        t.hands++;
        t.won += won[s.seatId] || 0;
        t.put += put[s.seatId] || 0;
        const net = (won[s.seatId] || 0) - (put[s.seatId] || 0);
        if (net >= 0) { t.wonHands++; continue; }
        t.lostHands++;
        /* มือที่แพ้: เงินทุกบาทที่ใส่ลงไปคือขาดทุน แยกตามสตรีทและตามท่า */
        let counted = 0;
        for (const a of hand.acts || []) {
          if (a.seat !== s.seatId || !a.amount) continue;
          const bucket = lost[lv][a.phase] || lost[lv].preflop;
          if (a.act === "raise" || a.act === "bet") bucket.raise += a.amount;
          else bucket.call += a.amount;
          counted += a.amount;
        }
        /* ส่วนที่เหลือคือบอดที่ถูกบังคับ ไม่ได้เป็นการตัดสินใจ */
        const blind = (put[s.seatId] || 0) - counted;
        if (blind > 0) lost[lv].preflop.blind += blind;
      }
    }
    mgr.settleBusted();
    if (st.seats.filter(x => x && x.isBot).length < 4) break;
  }
  mgr.stop();
  for (const s of st.seats) if (s && s.isBot) bank.release(s.name);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ไม่เป็นไร */ }
}

const pad = (v, w) => String(v).padEnd(w);
const num = (v, w) => String(v).padStart(w);
const per100 = (v, h) => h ? Math.round(v / h * 100) : 0;

console.log("");
console.log("เงินรั่วออกทางไหน · " + done.toLocaleString("en-US") + " มือ");
console.log("=".repeat(92));
for (const lv of [1, 2, 3]) {
  const t = tot[lv];
  const H = t.hands;
  const lossTotal = STREETS.reduce((a, s) =>
    a + lost[lv][s].call + lost[lv][s].raise + lost[lv][s].blind, 0);
  console.log("");
  console.log(pad(LVNAME[lv], 10) + " ได้/เสียสุทธิ " +
              num(per100(t.won - t.put, H).toLocaleString("en-US"), 9) + " ต่อ 100 มือ" +
              "   แพ้ " + Math.round(t.lostHands / (H || 1) * 100) + "% ของมือที่เล่น");
  console.log("   " + pad("สตรีท", 10) + num("เสียเพราะตาม", 15) + num("เสียเพราะไล่", 15) +
              num("บอด", 9) + num("รวม", 11) + num("% ของที่เสีย", 15));
  for (const s of STREETS) {
    const b = lost[lv][s];
    const sum = b.call + b.raise + b.blind;
    console.log("   " + pad(s, 10) + num(per100(b.call, H).toLocaleString("en-US"), 15) +
                num(per100(b.raise, H).toLocaleString("en-US"), 15) +
                num(per100(b.blind, H).toLocaleString("en-US"), 9) +
                num(per100(sum, H).toLocaleString("en-US"), 11) +
                num(Math.round(sum / (lossTotal || 1) * 100) + "%", 15));
  }
  console.log("   " + pad("รวม", 10) + num("", 15) + num("", 15) + num("", 9) +
              num(per100(lossTotal, H).toLocaleString("en-US"), 11) +
              num("(ได้คืน " + per100(t.won, H).toLocaleString("en-US") + ")", 15));
}
