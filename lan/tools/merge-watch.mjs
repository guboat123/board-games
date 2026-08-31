/* ===========================================================
   รวมผลดิบจาก watch-bots.mjs หลายตัวที่รันพร้อมกัน แล้วรายงานเป็นตารางเดียว

   สิบล้านมือถ้ารันตัวเดียวใช้เวลาเกือบสองชั่วโมง แบ่งรันพร้อมกันแล้วรวมทีหลังเร็วกว่ามาก
   แต่ละตัวเริ่มหมุนรายชื่อคนละตำแหน่ง จึงได้ส่วนผสมของโต๊ะที่ต่างกันไปด้วย

   รัน:  node lan/tools/merge-watch.mjs <ไฟล์ json...>
   =========================================================== */
import fs from "node:fs";

const LVNAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };
const files = process.argv.slice(2);
if (!files.length) { console.log("ต้องบอกไฟล์ json ที่จะรวม"); process.exit(1); }

const info = {};
let handsDone = 0, roundNo = 0, stuckHands = 0, seconds = 0;

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  handsDone += d.handsDone;
  roundNo += d.roundNo;
  stuckHands += d.stuckHands || 0;
  seconds = Math.max(seconds, d.seconds || 0);
  for (const n in d.info) {
    const src = d.info[n];
    const dst = info[n] || (info[n] = JSON.parse(JSON.stringify(src)));
    if (dst === src) continue;
    for (const k of ["hands", "net", "vpip", "raises", "calls", "checks", "folds",
                     "showdowns", "showdownWins", "allIn", "busts", "quits", "rounds",
                     "sdNet", "noSdNet", "foldedAway"]) {
      dst[k] += src[k] || 0;
    }
    if (src.biggestWin > dst.biggestWin) dst.biggestWin = src.biggestWin;
    if (src.biggestLoss < dst.biggestLoss) dst.biggestLoss = src.biggestLoss;
    for (const k in src.allInBy || {}) dst.allInBy[k] = (dst.allInBy[k] || 0) + src.allInBy[k];
  }
}

const pad = (v, w) => String(v).padEnd(w);
const num = (v, w) => String(v).padStart(w);
const per100 = (v, h) => h ? Math.round(v / h * 100) : 0;

const rows = Object.keys(info).map(n => {
  const i = info[n];
  const acts = i.raises + i.calls + i.checks + i.folds || 1;
  return {
    name: n, lv: LVNAME[i.lv], hands: i.hands,
    net100: per100(i.net, i.hands), net: i.net,
    vpip: i.hands ? Math.round(i.vpip / i.hands * 100) : 0,
    raise: Math.round(i.raises / acts * 100),
    fold: Math.round(i.folds / acts * 100),
    sd: i.hands ? Math.round(i.showdowns / i.hands * 100) : 0,
    sdWin: i.showdowns ? Math.round(i.showdownWins / i.showdowns * 100) : 0,
    sdNet: i.sdNet, noSdNet: i.noSdNet, foldedAway: i.foldedAway,
    busts1k: i.hands ? +(i.busts / i.hands * 1000).toFixed(1) : 0,
    quits: i.quits
  };
}).sort((a, b) => b.net100 - a.net100);

console.log("");
console.log("บอทเล่นกันเอง " + handsDone.toLocaleString("en-US") + " มือ · " + roundNo + " รอบ · " +
            Object.keys(info).length + " ตัว · " + files.length + " เครื่องรันพร้อมกัน · " +
            "นานสุด " + Math.round(seconds / 60) + " นาที" +
            (stuckHands ? "  (ค้าง " + stuckHands + " มือ)" : ""));
console.log("=".repeat(104));
console.log(pad("บอท", 10) + pad("ระดับ", 11) + num("ได้/เสีย ต่อ100มือ", 19) + num("มือที่เล่น", 12) +
            num("ลงเล่น", 8) + num("ไล่", 6) + num("ทิ้ง", 6) + num("เปิดไพ่", 9) +
            num("ชนะ%", 7) + num("ล้ม/1000", 10) + num("ลุก", 6));
console.log("-".repeat(104));
for (const r of rows) {
  console.log(pad(r.name, 10) + pad(r.lv, 11) + num(r.net100.toLocaleString("en-US"), 19) +
              num(r.hands.toLocaleString("en-US"), 12) + num(r.vpip + "%", 8) + num(r.raise + "%", 6) +
              num(r.fold + "%", 6) + num(r.sd + "%", 9) + num(r.sdWin + "%", 7) +
              num(r.busts1k, 10) + num(r.quits.toLocaleString("en-US"), 6));
}

console.log("");
console.log("รวมตามระดับ (ถ่วงตามจำนวนมือที่เล่นจริง):");
console.log("   " + pad("ระดับ", 11) + num("ได้/เสีย ต่อ100มือ", 19) + num("จากเปิดไพ่", 13) +
            num("จากไม่เปิดไพ่", 15) + num("ทิ้งไปฟรีๆ", 13) + num("ล้ม/1000มือ", 13));
for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
  const g = rows.filter(r => r.lv === lv);
  if (!g.length) continue;
  const H = g.reduce((a, r) => a + r.hands, 0);
  const sum = (f) => g.reduce((a, r) => a + f(r), 0);
  const busts = (sum(r => r.busts1k * r.hands / 1000) / (H || 1) * 1000).toFixed(1);
  console.log("   " + pad(lv, 11) + num(per100(sum(r => r.net), H).toLocaleString("en-US"), 19) +
              num(per100(sum(r => r.sdNet), H).toLocaleString("en-US"), 13) +
              num(per100(sum(r => r.noSdNet), H).toLocaleString("en-US"), 15) +
              num(per100(sum(r => r.foldedAway), H).toLocaleString("en-US"), 13) +
              num(busts, 13));
}

console.log("");
console.log("ช่วงระหว่างตัวที่ดีสุด-แย่สุดในระดับเดียวกัน (ต้องไม่กว้างจนกลายเป็นคนละระดับ):");
for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
  const g = rows.filter(r => r.lv === lv);
  if (!g.length) continue;
  const best = g[0], worst = g[g.length - 1];
  console.log("   " + pad(lv, 11) + pad(best.name + " " + best.net100.toLocaleString("en-US"), 22) +
              " ถึง " + worst.name + " " + worst.net100.toLocaleString("en-US"));
}

console.log("");
console.log("ลงหมดหน้าตักตอนไหน (รวมตามระดับ):");
{
  const agg = {};
  for (const n of Object.keys(info)) {
    const lv = LVNAME[info[n].lv];
    agg[lv] = agg[lv] || {};
    for (const k in info[n].allInBy) agg[lv][k] = (agg[lv][k] || 0) + info[n].allInBy[k];
  }
  for (const lv of ["มือใหม่", "นักพนัน", "มืออาชีพ"]) {
    const by = agg[lv] || {};
    const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1;
    const top = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 5)
      .map(k => k + " " + Math.round(by[k] / tot * 100) + "%");
    console.log("   " + pad(lv, 11) + " รวม " + num(tot.toLocaleString("en-US"), 9) + "  " + top.join(" · "));
  }
}
