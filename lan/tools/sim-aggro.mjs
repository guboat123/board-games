/* วัดว่าบอท "กล้าเกินไป" จริงไหม — ดูขนาดเดิมพันเทียบกอง เทียบตัก และความถี่ของการลงหมดหน้าตัก */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
bank._setDir(fs.mkdtempSync(path.join(os.tmpdir(), "aggro-")));

const out = {};
for (const lv of [1, 2, 3]) {
  const t = createTable("AG" + lv);
  const mgr = createBotManager({ table: t }, () => {});
  t.sit("Human", null, 500000, "human");
  t._state.seats[0].connected = true;
  t._state.seats[0].sitOut = true;
  mgr.add(4, lv);
  const s = { acts: 0, raises: 0, shoves: 0, potFrac: [], stackFrac: [], allInSeen: 0, hands: 0 };
  const orig = t.action;
  t.action = function (seat, msg) {
    const st = t._state.seats[seat];
    if (msg.type === "act" && st && st.isBot) {
      s.acts++;
      if (msg.action === "raise") {
        s.raises++;
        const pot = t._state.seats.reduce((a, x) => a + (x ? x.committed : 0), 0);
        const put = msg.amount - st.bet;
        if (pot > 0) s.potFrac.push(put / pot);
        s.stackFrac.push(put / Math.max(1, st.stack));
        if (msg.amount >= st.bet + st.stack) s.shoves++;
      }
    }
    return orig.call(t, seat, msg);
  };
  for (let h = 0; h < 300; h++) {
    const r = t.action(0, { type: "start" });
    if (r && r.error) break;
    let guard = 0;
    while (t._state.phase !== "showdown" && t._state.phase !== "waiting" && guard++ < 200) {
      const cur = t._state.current;
      if (cur < 0) break;
      if (!mgr._decideNow(cur)) t.action(cur, { type: "act", action: t.viewFor(cur).toCall > 0 ? "call" : "check" });
    }
    s.allInSeen += t._state.seats.filter(x => x && x.isBot && x.allIn).length;
    s.hands++;
    for (const b of t._state.seats) if (b && b.isBot && b.stack <= 0) { b.stack = 2000; b.boughtIn += 2000; }
  }
  mgr.removeAll();
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
  out[lv] = {
    hands: s.hands,
    raisePct: (s.raises / Math.max(1, s.acts) * 100).toFixed(1) + "%",
    avgBetVsPot: avg(s.potFrac).toFixed(2) + "x",
    avgBetVsStack: (avg(s.stackFrac) * 100).toFixed(1) + "%",
    shovePer100Acts: (s.shoves / Math.max(1, s.acts) * 100).toFixed(1),
    allInPerHand: (s.allInSeen / Math.max(1, s.hands)).toFixed(2)
  };
}
console.log(JSON.stringify(out, null, 2));
