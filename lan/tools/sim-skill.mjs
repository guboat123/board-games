/* วัดว่า "เก่งกว่าจริงไหม" — เอาสามระดับมานั่งโต๊ะเดียวกันแล้วดูว่าใครได้เงิน
   นี่คือตัวชี้วัดเดียวที่ตอบคำถาม "บอทกากลงไหม" ได้ตรงๆ
   ถ้ามืออาชีพไม่ชนะมือใหม่ แปลว่าเกณฑ์ที่ตั้งไว้พังโดยไม่ต้องดูอย่างอื่นเลย */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
bank._setDir(fs.mkdtempSync(path.join(os.tmpdir(), "skill-")));

const HANDS = Number(process.argv[2] || 600);
const t = createTable("SKILL");
const mgr = createBotManager({ table: t }, () => {});
t.sit("Rail", null, 500000, "rail");
t._state.seats[0].connected = true;
t._state.seats[0].sitOut = true;

mgr.add(3, 1); mgr.add(3, 2); mgr.add(2, 3);

const LV = {};
for (const s of t._state.seats) if (s && s.isBot) LV[s.name] = s.botLevel;
const start = {};
for (const s of t._state.seats) if (s && s.isBot) start[s.name] = s.stack + (s.wallet || 0);

let played = 0, stuck = 0;
for (let h = 0; h < HANDS; h++) {
  const r = t.action(0, { type: "start" });
  if (r && r.error) break;
  let guard = 0;
  while (t._state.phase !== "showdown" && t._state.phase !== "waiting" && guard++ < 250) {
    const cur = t._state.current;
    if (cur < 0) break;
    if (!mgr._decideNow(cur)) {
      const v = t.viewFor(cur);
      t.action(cur, { type: "act", action: v.toCall > 0 ? "call" : "check" });
    }
  }
  if (guard >= 250) stuck++;
  played++;
  /* หมดตัวก็เติมให้ เหมือนที่ตัวจัดการบอททำจริง จะได้วัดยาวๆ ได้ */
  for (const b of t._state.seats) {
    if (b && b.isBot && b.stack <= 0) {
      b.stack = 2000; b.boughtIn += 2000;
      b.wallet = (typeof b.wallet === "number" ? b.wallet : 0) - 2000;
    }
  }
}

const byLevel = { 1: { n: 0, net: 0 }, 2: { n: 0, net: 0 }, 3: { n: 0, net: 0 } };
const rows = [];
for (const s of t._state.seats) {
  if (!s || !s.isBot) continue;
  const now = s.stack + (s.wallet || 0);
  const net = now - start[s.name];
  byLevel[LV[s.name]].n++;
  byLevel[LV[s.name]].net += net;
  rows.push({ name: s.name, lv: LV[s.name], net });
}
const NAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };
console.log("เล่นไป", played, "มือ", stuck ? "(ค้าง " + stuck + " มือ)" : "");
console.log("");
console.log("ได้-เสียเฉลี่ยต่อตัว ต่อ 100 มือ:");
for (const lv of [1, 2, 3]) {
  const b = byLevel[lv];
  if (!b.n) continue;
  console.log("   %s  %s ชิป  (%d ตัว)".replace("%s", NAME[lv].padEnd(10))
    .replace("%s", String(Math.round(b.net / b.n / played * 100)).padStart(7))
    .replace("%d", b.n));
}
console.log("");
console.log("รายตัว:");
rows.sort((a, b) => b.net - a.net);
for (const r of rows) console.log("   " + r.name.padEnd(9) + NAME[r.lv].padEnd(10) + String(r.net).padStart(9));
