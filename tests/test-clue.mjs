/* เทสต์กติกาคำใบ้ของเกม "เดาสีจากคำใบ้"
   ดึงโค้ดจริงออกมาจาก index.html แล้วรันตรงๆ จะได้ไม่ต้องก็อปกติกามาไว้สองที่
   รัน: node tests/test-clue.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "games", "color-clues", "index.html"), "utf8");

/* ตัดเอาเฉพาะส่วนที่ต้องใช้ อ้างด้วยข้อความ ไม่ใช่เลขบรรทัด จะได้ไม่พังตอนแก้ไฟล์ */
function slice(from, to) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error("หาไม่เจอ: " + from);
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error("หาไม่เจอ: " + to);
  return src.slice(a, b);
}

const code =
  slice("var BANNED_COLOR", "/* ======") +
  slice("function tidy(s)", 'return { ok: true, msg: "ใช้ได้" };') +
  '\n  return { ok: true, msg: "ใช้ได้" };\n  }\n';

const checkClue = new Function(code + "\nreturn checkClue;")();

let fail = 0;
function t(clue, maxWords, wantOk, label) {
  const r = checkClue(clue, maxWords, []);
  if (r.ok !== wantOk) {
    fail++;
    console.log("FAIL  " + label + '  "' + clue + '" -> ok=' + r.ok + " (" + r.msg + ")");
  }
}

/* ต้องบล็อก: ชื่อสีที่เขียนแยกช่องว่างเพื่อเลี่ยงกติกา */
["น้ำ เงิน", "น้ำ ตาล", "ชม พู", "สี น้ำเงิน", "เขียว อ่อน", "bl ue", "na vy"]
  .forEach(c => t(c, 2, false, "ชื่อสีแยกช่องว่าง"));

/* ต้องบล็อก: ของเดิมที่เคยบล็อกอยู่แล้ว ห้ามหลุด */
["แดง", "สีแดง", "ม่วง", "blue", "อ่อน", "ท้อง ฟ้า", "เอ 1", "A 1", "พี 12", "a1", "เอ็ม 5"]
  .forEach(c => t(c, 2, false, "บล็อกเดิม"));

/* ต้องผ่าน: คำปกติ ห้ามโดนหางเลข */
["มะม่วง", "ส้มตำ", "ฟ้าทะลายโจร", "covid19", "iphone12", "formula1",
 "ทะเล ลึก", "ใบไม้ ร่วง", "ดอก กุหลาบ", "ก้อน เมฆ", "ต้น ไม้", "ขน มปัง"]
  .forEach(c => t(c, 2, true, "คำปกติ"));

/* จำนวนคำ และคำซ้ำ */
if (checkClue("ทะเล ลึก มาก", 2, []).ok) { fail++; console.log("FAIL  เกินจำนวนคำ"); }
if (checkClue("ทะเล ลึก", 1, []).ok)      { fail++; console.log("FAIL  คำใบ้ที่ 1 ต้องคำเดียว"); }
if (checkClue("ทะเล", 1, ["ทะเล"]).ok)    { fail++; console.log("FAIL  คำซ้ำต้องใช้ไม่ได้"); }

console.log(fail === 0 ? "PASS กติกาคำใบ้ ผ่านทุกเคส" : fail + " เคสพัง");
process.exit(fail ? 1 : 0);
