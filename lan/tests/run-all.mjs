/* ===========================================================
   รันด่านทั้งหมดในคำสั่งเดียว

   ⚠️ ทำไมต้องมี: คืนวันที่ 2026-09-03 แก้สมองบอทไปสิบกว่ารอบ แล้วรันเทสต์ซ้ำ ๆ
   อยู่แค่ 8 ชุดที่จำได้ ทั้งที่ในโฟลเดอร์มี 12 ชุด — อีก 4 ชุดไม่ถูกแตะเลยทั้งคืน
   (test-audit-fixes · test-bot-bank · test-busts · test-hand-value · test-outs)
   ไฟล์นี้ไล่จากโฟลเดอร์จริง ไม่ใช่จากรายชื่อที่พิมพ์ไว้ เทสต์ใหม่จึงถูกรันเองอัตโนมัติ

   รัน:  node lan/tests/run-all.mjs [จำนวนมือของสกอร์การ์ด]
   ออก 0 = ผ่านหมด · 1 = มีอะไรพัง
   =========================================================== */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const HANDS = process.argv[2] || "12000";

function run(label, file, args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file].concat(args || []), {
    cwd: root, encoding: "utf8", timeout: 30 * 60 * 1000
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  console.log("  " + (ok ? "ผ่าน " : "ตก  ") + label.padEnd(34) + secs.padStart(6) + " วิ");
  if (!ok) {
    const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n");
    for (const line of out.slice(-8)) console.log("        " + line);
  }
  return ok;
}

let bad = 0;

console.log("");
console.log("เทสต์ (เงิน · กติกา · ความจำ · การเข้าออกโต๊ะ)");
console.log("-".repeat(56));
/* ⚠️ อ่านจากโฟลเดอร์ ไม่ใช่จากรายชื่อที่พิมพ์ไว้ เพิ่มเทสต์ใหม่แล้วถูกรันเองทันที */
const files = fs.readdirSync(path.join(root, "lan", "tests"))
  .filter(function (f) { return f.indexOf("test-") === 0 && f.slice(-4) === ".mjs"; })
  .sort();
for (const f of files) {
  if (!run(f, path.join("lan", "tests", f))) bad++;
}
if (fs.existsSync(path.join(root, "tests", "test-clue.mjs"))) {
  if (!run("test-clue.mjs (color-clues)", path.join("tests", "test-clue.mjs"))) bad++;
}

console.log("");
console.log("บอทเล่นเหมือนคนรึยัง · 39 ช่อง · " + Number(HANDS).toLocaleString("en-US") + " มือ");
console.log("-".repeat(56));
if (!run("realism-check.mjs", path.join("lan", "tools", "realism-check.mjs"), [HANDS])) bad++;

console.log("");
if (bad) {
  console.log("=== มี " + bad + " อย่างไม่ผ่าน — ห้าม commit ===");
  process.exit(1);
}
console.log("=== ผ่านหมด ===");
console.log("");
console.log("ที่ไฟล์นี้ไม่ได้รันให้ (ช้าเกินกว่าจะรันทุกครั้ง — รันมือเองหลังแตะ poke/decide):");
console.log("   node lan/tools/smoke-live.mjs 3        เดินเกมผ่านทางที่เซิร์ฟเวอร์จริงใช้");
console.log("   node lan/tools/watch-bots.mjs ...      กำไรขาดทุนระดับล้านมือ (ดู STATUS)");
console.log("   node lan/tools/play-as-human.mjs ...   คนเล่นเก่งเจอโต๊ะนี้แล้วได้เท่าไหร่");
