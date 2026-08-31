/* นับไพ่ที่ยังลุ้นอยู่ (outs) — เป็นตัวเลขที่บอทใช้ตัดสินว่าจะไล่ลุ้นต่อไหม
   ถ้านับผิด บอทจะไล่ลุ้นในจังหวะที่ไม่ควรไล่ หรือทิ้งมือที่ควรสู้
   ⚠️ countOuts ไม่ได้ export จึงทดสอบผ่าน drawStrength ซึ่งเป็นค่าที่ใช้จริง
   กฎ 4 กับ 2: เหลือเปิดสองใบ ≈ out × 4% · เหลือเปิดใบเดียว ≈ out × 2% */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "bots.mjs"), "utf8");

/* ดึงเฉพาะสามฟังก์ชันที่ต้องใช้ออกมาเป็นโมดูลชั่วคราว จะได้ทดสอบตรงๆ ได้ */
const grab = (name) => {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("ไม่พบฟังก์ชัน " + name);
  let depth = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error("อ่านฟังก์ชัน " + name + " ไม่จบ");
};

const mod = 'import { RANK_CHARS, SUIT_CHARS } from "../poker-engine.mjs";\n' +
  grab("toNum") + "\n" + grab("countOuts") + "\n" + grab("drawStrength") + "\n" +
  "export { countOuts, drawStrength };";
const tmp = path.join(here, "_outs.tmp.mjs");
fs.writeFileSync(tmp, mod, "utf8");
const { countOuts, drawStrength } = await import("./_outs.tmp.mjs?" + Date.now());

const outs = (hole, board) => countOuts(hole.split(" "), board.split(" "));

/* ---------- ลุ้นฟลัช = 9 ใบ ---------- */
assert.equal(outs("Ah 3h", "Kh 7h 2s"), 9, "ลุ้นฟลัช (ถือสองใบดอกเดียวกัน) = 9 out");

/* ---------- ฟลัชของบอร์ดล้วน ไม่นับ ---------- */
assert.equal(outs("As Kc", "2h 7h 9h"), 0,
  "สามดอกเดียวกันบนบอร์ด แต่เราไม่มีดอกนั้นเลย ต้องไม่นับว่าเรามีลุ้น");

/* ---------- สเตรทเปิดสองหัว = 8 ใบ ---------- */
assert.equal(outs("9c 8d", "7s 6h 2c"), 8, "9-8-7-6 รอ 10 หรือ 5 = 8 out");

/* ---------- ลุ้นใบเดียวตรงกลาง (gutshot) = 4 ใบ ---------- */
assert.equal(outs("9c 8d", "7s 5h 2c"), 4, "9-8-7-5 รอ 6 อย่างเดียว = 4 out");

/* ---------- สเตรทของบอร์ดล้วน ไม่นับ ---------- */
assert.equal(outs("As Kd", "7s 8h 9c"), 0,
  "บอร์ดเรียงเอง แต่ไพ่ในมือไม่เกี่ยว ต้องไม่นับ");

/* ---------- ลุ้นทั้งฟลัชและสเตรท ต้องหักส่วนที่ซ้ำ ---------- */
{
  /* 9h 8h 7h 6h = โพแดงสี่ใบ (ลุ้นฟลัช) และ 9-8-7-6 เรียง (ลุ้นสเตรทสองหัว)
     9 + 8 = 17 แต่ไพ่ที่ช่วยสเตรทบางใบเป็นโพแดงซึ่งนับไปแล้ว ต้องหักออก */
  const both = outs("9h 8h", "7h 6h 2s");
  assert.ok(both >= 13 && both <= 15,
    "ลุ้นฟลัช+สเตรทพร้อมกัน ควรได้ 13-15 out (หักที่นับซ้ำแล้ว) ได้ " + both);
  const onlyStraight = outs("9c 8d", "7s 6h 2c");
  assert.ok(both > onlyStraight, "ลุ้นสองทางต้องมากกว่าลุ้นทางเดียว");
}

/* ---------- สามดอกเดียวกันยังไม่ใช่ลุ้นฟลัช ---------- */
assert.equal(outs("9h 8h", "7h 5c 2s"), 4,
  "โพแดงแค่สามใบ ยังไม่ใช่ลุ้นฟลัช เหลือแค่ลุ้นสเตรทใบเดียวตรงกลาง");

/* ---------- ริเวอร์แล้วไม่มีอะไรให้ลุ้น ---------- */
assert.equal(countOuts(["Ah", "3h"], ["Kh", "7h", "2s", "9d", "Jc"]), 0,
  "เปิดครบห้าใบแล้ว ไม่มีไพ่ให้ลุ้นอีก");

/* ---------- แปลงเป็นโอกาสด้วยกฎ 4 กับ 2 ---------- */
{
  const atFlop = drawStrength(["Ah", "3h"], ["Kh", "7h", "2s"]);
  const atTurn = drawStrength(["Ah", "3h"], ["Kh", "7h", "2s", "9d"]);
  assert.ok(Math.abs(atFlop - 0.36) < 0.001, "9 out ที่ฟลอป = 36% ได้ " + atFlop);
  assert.ok(Math.abs(atTurn - 0.18) < 0.001, "9 out ที่เทิร์น = 18% ได้ " + atTurn);
  assert.ok(atFlop > atTurn, "เหลือเปิดสองใบต้องมีโอกาสมากกว่าเหลือใบเดียว");
}

fs.rmSync(tmp, { force: true });
console.log("test-outs: ผ่านหมด");
