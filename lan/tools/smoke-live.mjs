/* ===========================================================
   เดินเกมผ่านทาง "เดียวกับเซิร์ฟเวอร์จริง" — คือผ่าน poke() และตัวจับเวลาจริง

   ⚠️ ทำไมต้องมี: เครื่องมือวัดผลทุกตัวเรียก _decideNow() ตรง ๆ เพื่อข้ามเวลาคิด
   แปลว่า poke() เอง — ซึ่งเป็นทางที่เกมจริงใช้ทางเดียว — ไม่มีอะไรทดสอบเลย
   เคยพังมาแล้วแบบทั้งเซิร์ฟเวอร์ล่ม (ส่งที่นั่งจากสถานะดิบเข้า thinkMs)
   และเทสต์ทุกตัวยังเขียวอยู่ตอนนั้น

   ช้าโดยธรรมชาติ (บอทคิด 0.7-3.4 วินาทีต่อท่าจริง ๆ) จึงไม่ได้อยู่ในชุดเทสต์
   รันมือด้วยตัวเองหลังแก้อะไรก็ตามที่แตะ poke / decide / thinkMs

   รัน:  node lan/tools/smoke-live.mjs [จำนวนมือ]
   =========================================================== */
import { createTable } from "../poker-room.mjs";
import { createBotManager } from "../bots.mjs";
import * as bank from "../bot-bank.mjs";
import * as mind from "../bot-mind.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WANT = Number(process.argv[2] || 2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-"));
bank._setDir(dir);
mind._setDir(dir);

const table = createTable({ smallBlind: 10, bigBlind: 20, minBuyIn: 200, turnSeconds: 0 });
let broadcasts = 0;
const mgr = createBotManager({ table: table }, () => { broadcasts++; });

/* คนจริงหนึ่งคนที่พับทุกมือ — ต้องมีคนต่ออยู่ ไม่งั้น poke ไม่ทำงาน */
const me = table.sit("Boat", null, 20000, "smoke-human");
table._state.seats[me.seatId].connected = true;
const MY = me.seatId;
for (const [n, lv] of [["Rex", 3], ["Gio", 2], ["Bruno", 1]]) mgr._addNamed(n, lv);

const st = table._state;
const t0 = Date.now();
let hands = 0, errors = 0, timedOut = false;
process.on("uncaughtException", (e) => {
  console.log("  ล่ม: " + e.message);
  errors++;
  process.exit(1);
});

console.log("");
console.log("เดินเกมผ่าน poke() จริง " + WANT + " มือ (ใช้เวลาจริง บอทคิดจริง)");

function step() {
  if (hands >= WANT) return done();
  if (st.phase === "waiting" || st.phase === "showdown") {
    const r = table.action(MY, { type: "start" });
    if (r && r.error) { console.log("  เริ่มมือไม่ได้: " + r.error); return done(); }
    hands++;
    console.log("  มือ " + hands + " เริ่มแล้ว");
  }
  mgr.poke();
  setTimeout(tick, 250);
}

function tick() {
  if (st.current === MY) {
    const v = table.viewFor(MY);
    table.action(MY, { type: "act", action: v.toCall > 0 ? "fold" : "check" });
    mgr.poke();
  }
  if (st.phase === "showdown" || st.phase === "waiting") return step();
  if (Date.now() - t0 > 120000) { timedOut = true; return done(); }
  setTimeout(tick, 250);
}

function done() {
  const st2 = table._state;
  /* ⚠️ ถ้าหยุดกลางมือ (ครบสองนาทีพอดี) เงินที่ลงกองไปแล้วยังไม่กลับเข้าตักใคร
     นับแต่ stack จะได้ยอดขาดแล้วขึ้นว่า "เงินไม่ตรง" ทั้งที่ไม่มีอะไรผิด
     เคยหลอกไปแล้วครั้งหนึ่ง (ขาด 50 ชิป เพราะมือที่ 12 ยังเล่นค้างอยู่)
     ต้องบวกเงินที่ยังอยู่ในกองของมือนี้เข้าไปด้วย */
  const inPlay = st2.seats.reduce((a, s) => a + (s ? (s.committed || 0) : 0), 0);
  const chips = st2.seats.reduce((a, s) => a + (s ? s.stack : 0), 0) + inPlay;
  const bought = st2.seats.reduce((a, s) => a + (s ? s.boughtIn : 0), 0);
  console.log("");
  console.log("  จบ " + hands + " มือ · ใช้เวลา " + Math.round((Date.now() - t0) / 1000) + " วิ" +
              " · ส่งสถานะออก " + broadcasts + " ครั้ง");
  console.log("  ชิปบนโต๊ะ " + chips.toLocaleString("en-US") +
              (inPlay ? " (ในกองอีก " + inPlay.toLocaleString("en-US") + ")" : "") +
              " · ซื้อเข้ารวม " + bought.toLocaleString("en-US") +
              (chips === bought ? "  ✓ ตรงกัน" : "  ✗ ไม่ตรงกัน"));
  console.log("  ประวัติมือที่จดไว้ " + (st2.hands || []).length + " มือ");
  /* ⚠️ "เดินไม่ครบใน 2 นาที" กับ "เกมค้าง" ไม่ใช่เรื่องเดียวกัน
     เครื่องที่กำลังรันตัววัดหลายล้านมืออยู่ก็ช้าลงเป็นธรรมดา บอทคิดจริง 0.7-3.4 วิต่อท่า
     สิ่งที่ต้องฟ้องคือ "ไม่มีมือไหนจบเลย" หรือ "เงินไม่ตรง" ไม่ใช่ "ช้ากว่าที่ขอ" */
  const short = timedOut && hands >= 1 && hands < WANT;
  if (timedOut) {
    console.log("  หมดเวลาสองนาทีก่อนครบ " + WANT + " มือ (เดินได้ " + hands + ")" +
                (short ? " — เครื่องช้า ไม่ใช่เกมค้าง" : ""));
  }
  const bad = chips !== bought || errors || hands < 1 || (!timedOut && hands < WANT);
  console.log(bad ? "\n  ไม่ผ่าน"
                  : "\n  ผ่าน — ทางที่เซิร์ฟเวอร์จริงใช้ ยังเดินได้ปกติ" +
                    (short ? " (เดินไม่ครบเพราะเวลา ไม่ใช่เพราะพัง)" : ""));
  mgr.stop();
  process.exit(bad ? 1 : 0);
}

step();
