/* ค่ามือที่บอทใช้ตัดสินใจ — ผิดตรงนี้แล้วทุกอย่างที่ต่อจากนี้ผิดหมด
   สองเรื่องที่เคยผิดจริงและเจ้าของจับได้ ต้องมีเทสต์กันย้อนกลับ */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "bots.mjs"), "utf8");
const grab = (name) => {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("ไม่พบฟังก์ชัน " + name);
  let depth = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error("อ่านฟังก์ชัน " + name + " ไม่จบ");
};
const CAT = src.match(/const CAT_EQUITY = \[[^\]]*\];/)[0];
const mod = 'import { evaluate7, RANK_CHARS, SUIT_CHARS } from "../poker-engine.mjs";\n' +
  CAT + "\n" + grab("toNum") + "\n" + grab("preflopStrength") + "\n" + grab("madeStrength") + "\n" +
  "export { preflopStrength, madeStrength };";
const tmp = path.join(here, "_hv.tmp.mjs");
fs.writeFileSync(tmp, mod, "utf8");
const { preflopStrength, madeStrength } = await import("./_hv.tmp.mjs?" + Date.now());

/* ---------- 1. คู่สูงต้องไม่แตะเกณฑ์ "ลงได้ทั้งตัก" (0.90) ----------
   เคยเป็น AA 1.000 · KK 0.983 · QQ 0.945 · JJ 0.906 ซึ่งทะลุเกณฑ์หมด
   ผลคือได้คู่สูงเมื่อไหร่เป็นลุยหมดหน้าตักแทบทุกครั้ง อ่านออกตั้งแต่มือที่สาม */
{
  const aa = preflopStrength(["As", "Ah"]);
  const kk = preflopStrength(["Ks", "Kh"]);
  const tt = preflopStrength(["10s", "10h"]);
  const deuces = preflopStrength(["2s", "2h"]);
  assert.ok(aa < 0.90, "AA ต้องต่ำกว่า 0.90 ได้ " + aa.toFixed(3));
  assert.ok(aa > 0.80, "แต่ต้องยังแรงที่สุด ได้ " + aa.toFixed(3));
  assert.ok(aa > kk && kk > tt && tt > deuces, "คู่ใหญ่ต้องแรงกว่าคู่เล็กตามลำดับ");
  assert.ok(deuces >= 0.45 && deuces <= 0.58, "คู่เล็กสุดควรอยู่ราวกลางๆ ได้ " + deuces.toFixed(3));
}

/* ---------- 2. ชุดที่บอร์ดมีอยู่แล้ว ไม่ใช่ของเรา ----------
   เคสจริง: บอร์ด 4♥ Q♠ 10♣ J♣ 4♠ · ถือ K♥3♦ → เครื่องตอบ "One Pair 4s"
   ได้คะแนนเท่ากับตอนเข้าคู่ด้วยไพ่ตัวเอง บอทจึงตามไป 3,374 ในราคา 31% */
{
  const board = ["4h", "Qs", "10c", "Jc", "4s"];
  const playingBoard = madeStrength(["Kh", "3d"], board);   /* คู่สี่ของบอร์ด ไพ่ข้าง K */
  const realPair    = madeStrength(["Qd", "7h"], board);    /* เข้าคู่ควีนด้วยไพ่ตัวเอง */
  const worseKicker = madeStrength(["5h", "3d"], board);    /* คู่สี่ของบอร์ด ไพ่ข้างแย่กว่า */

  assert.ok(playingBoard < 0.30,
    "เล่นบอร์ดล้วน ต้องมีค่าน้อยมาก ได้ " + playingBoard.toFixed(3));
  assert.ok(realPair > playingBoard + 0.15,
    "เข้าคู่ด้วยไพ่ตัวเองต้องมีค่ามากกว่าเล่นบอร์ดล้วนชัดเจน (" +
    realPair.toFixed(3) + " vs " + playingBoard.toFixed(3) + ")");
  assert.ok(playingBoard > worseKicker,
    "ไพ่ข้างดีกว่าต้องมีค่ามากกว่านิดหน่อย");
}

/* ---------- 3. ชุดที่ใช้ไพ่ในมือจริง ต้องไม่โดนหักผิด ---------- */
{
  const trips = madeStrength(["4d", "4c"], ["4h", "Qs", "10c", "Jc", "2s"]);
  assert.ok(trips > 0.6, "ตองที่มาจากไพ่ในมือ ต้องแรงตามปกติ ได้ " + trips.toFixed(3));
  const flush = madeStrength(["2c", "5c"], ["4c", "Qc", "10c", "Jh", "9s"]);
  assert.ok(flush > 0.7, "ฟลัชที่ใช้ไพ่ในมือ ต้องแรงตามปกติ ได้ " + flush.toFixed(3));
}

fs.rmSync(tmp, { force: true });
console.log("test-hand-value: ผ่านหมด");
