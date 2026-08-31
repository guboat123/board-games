/* วัดว่าสามระดับเล่นต่างกันจริงไหม ไม่ใช่แค่ตัวเลขคนละชุด */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
bank._setDir(fs.mkdtempSync(path.join(os.tmpdir(), "sim-")));

const stats = {};
for (const lv of [1, 2, 3]) {
  const t = createTable("SIM" + lv);
  const mgr = createBotManager({ table: t }, () => {});
  // เอาคนจริงมาถ่วงหนึ่งคน (ไม่งั้นห้องถูกเก็บ)
  t.sit("Human", null, 200000, "human");
  t._state.seats[0].connected = true;
  mgr.add(4, lv);
  const s = { fold: 0, call: 0, check: 0, raise: 0, hands: 0 };
  const orig = t.action;
  t.action = function (seat, msg) {
    const st = t._state.seats[seat];
    if (msg.type === "act" && st && st.isBot) s[msg.action] = (s[msg.action] || 0) + 1;
    return orig.call(t, seat, msg);
  };
  for (let h = 0; h < 400; h++) {
    // คนจริงพักมือ ให้บอทเล่นกันเอง
    t._state.seats[0].sitOut = true;
    const r = t.action(0, { type: "start" });
    if (r && r.error) break;
    let guard = 0;
    while (t._state.phase !== "showdown" && t._state.phase !== "waiting" && guard++ < 300) {
      const cur = t._state.current;
      if (cur < 0) break;
      if (!mgr._decideNow(cur)) {
        const view = t.viewFor(cur);
        t.action(cur, { type: "act", action: view.toCall > 0 ? "call" : "check" });
      }
    }
    s.hands++;
    for (const b of t._state.seats) if (b && b.isBot && b.stack <= 0) { b.stack = 2000; b.boughtIn += 2000; }
  }
  mgr.removeAll();   // คืนชื่อบอทให้โต๊ะถัดไปใช้ได้ (หนึ่งชื่อนั่งได้ทีละโต๊ะ)
  const tot = s.fold + s.call + s.check + s.raise || 1;
  stats[lv] = { hands: s.hands,
    fold: (s.fold / tot * 100).toFixed(1) + "%", call: (s.call / tot * 100).toFixed(1) + "%",
    check: (s.check / tot * 100).toFixed(1) + "%", raise: (s.raise / tot * 100).toFixed(1) + "%" };
}
console.log(JSON.stringify(stats, null, 2));
