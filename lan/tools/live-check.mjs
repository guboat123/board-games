/* ===========================================================
   ผู้เล่นคนนี้เล่นยังไง — วัดจาก "มือจริงบนโต๊ะ" ไม่ใช่จากการจำลอง

   ต่างจาก realism-check.mjs ตรงที่:
     realism-check = จำลองบอทเล่นกันเองเป็นหมื่นมือ ตัวเลขนิ่ง เอาไว้เป็นด่านห้าม commit
     live-check    = อ่าน lan/data/hands.jsonl ที่เซิร์ฟเวอร์จริงจดไว้
                     ตัวอย่างน้อยกว่ามาก แต่เป็นโต๊ะที่มีคนจริงนั่งด้วย
   ใช้ตอบคำถาม "บอทตัวนี้บนโต๊ะจริง เล่นเหมือนที่ตั้งใจไว้มั้ย"
   และใช้ยืนยันว่าตัวเลขจากการจำลองไม่ได้หลอกเรา

   ⚠️ นิยามทุกช่องลอกจาก realism-check.mjs เป๊ะ ๆ (af = ไล่/ตาม หลังฟลอป,
      wtsd = เปิดไพ่/เห็นฟลอป, size = เดิมพัน/กองก่อนเดิมพัน, c-bet+fcb นับตัวต่อตัว)
      แก้ที่นั่นแล้วต้องแก้ที่นี่ด้วย ไม่งั้นเทียบกันไม่ได้
   ⚠️ ตัวอย่างจากโต๊ะจริงมักน้อย (หลักสิบ) เครื่องมือจึงเผื่อความคลาดเคลื่อนให้ก่อน
      แล้วค่อยตัดสิน — ดูที่ฟังก์ชัน verdict() ข้างล่าง

   ⚠️ ไม่ได้อยู่ใน run-all.mjs โดยเจตนา: มันต้องมีข้อมูลมือจริงซึ่งมีแค่บนเครื่องที่เคย
      เปิดโต๊ะให้คนเล่น และ lan/data/ ถูก gitignore ไว้ เครื่องอื่นจึงไม่มีอะไรให้วัด
      (ถ้าไม่มีไฟล์ มันจะบอกแล้วออกด้วยรหัส 0 ไม่ทำให้ด่านพัง)

   รัน:  node lan/tools/live-check.mjs [ชื่อ...] [--day=2026-09-03]
         ไม่ใส่ชื่อ = ไล่ทุกคนที่เจอในบันทึก เรียงตามกำไร
   =========================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const argOf = function (k) {
  const a = process.argv.find(function (x) { return x.indexOf("--" + k + "=") === 0; });
  return a ? a.slice(k.length + 3) : "";
};
const WHO = process.argv.slice(2).filter(function (a) { return a.indexOf("--") !== 0; });
const DAY = argOf("day");

/* ระดับของบอทแต่ละตัว — อ่านจาก ROSTER ใน bots.mjs ไม่พิมพ์ซ้ำ */
const LEVEL_OF = {};
{
  const src = fs.readFileSync(path.join(root, "lan", "bots.mjs"), "utf8");
  const m = src.match(/const ROSTER[\s\S]*?\n\};/);
  if (m) {
    for (const line of m[0].split("\n")) {
      const g = line.match(/^\s*([123]):\s*\[(.*)\]/);
      if (!g) continue;
      for (const raw of g[2].split(",")) {
        const name = raw.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
        if (name) LEVEL_OF[name] = Number(g[1]);
      }
    }
  }
}

/* กรอบคนจริง — ลอกจาก WANT ใน realism-check.mjs (เฉพาะช่องที่วัดได้จากบันทึกมือ) */
const WANT = {
  1: { vpip: [35, 60], pfr: [2, 10],  limp: [18, 45], b3: [0.5, 5], af: [0.3, 1.1],
       wtsd: [24, 42], cbet: [25, 62], fcb: [40, 63], size: [30, 72], barrel: [15, 55] },
  2: { vpip: [45, 70], pfr: [18, 40], limp: [8, 35],  b3: [4, 12],   af: [1.4, 4.0],
       wtsd: [28, 46], cbet: [55, 92], fcb: [35, 58], size: [45, 95], barrel: [40, 78] },
  3: { vpip: [20, 35], pfr: [14, 26], limp: [0, 12],  b3: [4, 11],   af: [1.4, 3.6],
       wtsd: [22, 32], cbet: [55, 82], fcb: [40, 58], size: [45, 80], barrel: [40, 62] }
};
const LABEL = {
  vpip: "ลงเล่นกี่ % ของมือ", pfr: "ไล่ก่อนฟลอป", limp: "ตามบอดเฉย ๆ",
  b3: "ไล่ทับรอบสอง", af: "ไล่:ตาม หลังฟลอป", wtsd: "ไปถึงเปิดไพ่",
  cbet: "ยิงต่อฟลอป ตัวต่อตัว", fcb: "หมอบใส่คนยิงต่อ", size: "ขนาดเดิมพันกลาง ๆ",
  barrel: "ยิงต่อที่เทิร์น"
};
const ORDER = ["vpip", "pfr", "limp", "b3", "af", "wtsd", "cbet", "fcb", "size", "barrel"];
const LVNAME = { 1: "มือใหม่", 2: "นักพนัน", 3: "มืออาชีพ" };

const file = path.join(root, "lan", "data", "hands.jsonl");
if (!fs.existsSync(file)) {
  console.log("ไม่มี " + file + " — ยังไม่มีมือจริงให้ดู");
  process.exit(0);
}
const L = fs.readFileSync(file, "utf8").trim().split("\n")
  .map(function (x) { try { return JSON.parse(x); } catch (e) { return null; } })
  .filter(Boolean)
  .filter(function (e) { return !DAY || new Date(e.at).toISOString().slice(0, 10) === DAY; });

const S = {};
function rec(n) {
  if (!S[n]) S[n] = { hands: 0, vpip: 0, pfr: 0, limp: 0, b3: 0, b3N: 0,
    post: 0, call: 0, flop: 0, sd: 0, sdWin: 0, cbet: 0, cbetN: 0, fcb: 0, fcbN: 0,
    barrel: 0, barrelN: 0, sizes: [], won: 0, put: 0, pots: 0, big: [] };
  return S[n];
}

for (const e of L) {
  const h = e.hand, acts = h.acts || [], res = h.result || {};
  for (const p of (h.players || [])) rec(p.name).hands++;
  const pre = acts.filter(function (a) { return a.phase === "preflop"; });
  const flop = acts.filter(function (a) { return a.phase === "flop"; });
  const turn = acts.filter(function (a) { return a.phase === "turn"; });

  /* ก่อนฟลอป: นับท่าแรกของแต่ละคนเท่านั้น */
  let nRaise = 0;
  const first = {};
  for (const a of pre) {
    if (!first[a.name]) {
      first[a.name] = 1;
      const s = rec(a.name);
      if (a.act === "call") { s.vpip++; if (nRaise === 0) s.limp++; }
      if (a.act === "raise" || a.act === "bet") { s.vpip++; s.pfr++; }
      if (nRaise === 1) { s.b3N++; if (a.act === "raise") s.b3++; }
    }
    if (a.act === "raise" || a.act === "bet") nRaise++;
  }

  /* หลังฟลอป: ไล่เทียบตาม */
  for (const a of acts) {
    if (a.phase === "preflop") continue;
    const s = rec(a.name);
    if (a.act === "bet" || a.act === "raise") s.post++;
    else if (a.act === "call") s.call++;
  }

  /* เห็นฟลอปกี่มือ — คือ "ไม่ได้หมอบก่อนฟลอป" ไม่ใช่ "มีท่าในฟลอป"
     ⚠️ คนที่ลงหมดตัวก่อนฟลอปไม่มีท่าให้เดินอีก แต่ไปถึงเปิดไพ่เสมอ
        ถ้านับตัวหารจากคนที่เดินในฟลอป ตัวหารจะเล็กกว่าตัวตั้งแล้วได้ 127%
        (เจอจริงตอนรันครั้งแรก — คนจริงลงหมดตัวก่อนฟลอปบ่อย) */
  const foldedPre = {};
  for (const a of pre) if (a.act === "fold") foldedPre[a.name] = 1;
  const saw = [];
  if ((h.board || []).length >= 3) {
    for (const p of (h.players || [])) if (!foldedPre[p.name]) saw.push(p.name);
  }
  for (const n of saw) rec(n).flop++;

  /* c-bet และหมอบใส่ c-bet — นับตัวต่อตัวเท่านั้น เหมือนสกอร์การ์ด */
  let pfR = null;
  for (const a of pre) if (a.act === "raise" || a.act === "bet") pfR = a.name;
  /* ⚠️ ต้องเช็กว่าคนที่ไล่มาก่อนฟลอป "ได้เดินในฟลอปจริง" ด้วย
     ตอนนี้ saw = คนที่ไม่หมอบก่อนฟลอป ซึ่งรวมคนลงหมดตัวไปแล้วที่เดินอีกไม่ได้
     ถ้าไม่เช็ก จะนับว่าเป็นโอกาสยิงต่อทั้งที่ยิงไม่ได้ แล้วอัตรายิงต่อต่ำเกินจริง */
  if (pfR && saw.length === 2 && saw.indexOf(pfR) >= 0 &&
      flop.some(function (a) { return a.name === pfR; })) {
    const s = rec(pfR);
    s.cbetN++;
    const iFirst = flop.findIndex(function (a) { return a.act === "bet" || a.act === "raise"; });
    if (iFirst >= 0 && flop[iFirst].name === pfR) {
      s.cbet++;
      const other = saw.find(function (n) { return n !== pfR; });
      if (other) {
        const o = rec(other);
        o.fcbN++;
        const reply = flop.find(function (a, i) { return i > iFirst && a.name === other; });
        if (reply && reply.act === "fold") o.fcb++;
      }
    }
  }

  /* ยิงต่อที่เทิร์น */
  if (pfR && flop.length && turn.length) {
    const fb = flop.find(function (a) { return a.act === "bet" || a.act === "raise"; });
    if (fb && fb.name === pfR) {
      const mine = turn.find(function (a) { return a.name === pfR; });
      if (mine) {
        const s = rec(pfR);
        s.barrelN++;
        if (mine.act === "bet" || mine.act === "raise") s.barrel++;
      }
    }
  }

  /* ขนาดเดิมพันเทียบกองก่อนเดิมพัน (หลังฟลอปเท่านั้น) */
  let running = (h.sb || 0) + (h.bb || 0);
  for (const a of acts) {
    if (a.phase !== "preflop" && (a.act === "bet" || a.act === "raise") &&
        a.amount > 0 && running > 0) rec(a.name).sizes.push(a.amount / running);
    running += (a.amount || 0);
  }

  /* เงิน */
  const put = {}, pay = {};
  for (const x of (res.puts || [])) put[x.name] = x.amount;
  for (const x of (res.payouts || [])) pay[x.name] = (pay[x.name] || 0) + x.amount;
  for (const p of (h.players || [])) {
    const s = rec(p.name);
    s.put += put[p.name] || 0;
    s.won += pay[p.name] || 0;
    if (pay[p.name]) s.pots++;
    const net = (pay[p.name] || 0) - (put[p.name] || 0);
    if (Math.abs(net) >= 500) s.big.push({ no: h.no, net, sd: !!res.showdown,
      board: (h.board || []).join(" "),
      rev: (res.reveal || []).find(function (r) { return r.name === p.name; }) });
  }
  if (res.showdown) {
    for (const r of (res.reveal || [])) {
      const s = rec(r.name);
      s.sd++;
      if (pay[r.name]) s.sdWin++;
    }
  }
}

function stats(s) {
  const sz = s.sizes.slice().sort(function (a, b) { return a - b; });
  return {
    vpip: s.hands ? s.vpip / s.hands * 100 : 0,
    pfr:  s.hands ? s.pfr  / s.hands * 100 : 0,
    limp: s.hands ? s.limp / s.hands * 100 : 0,
    b3:   s.b3N   ? s.b3   / s.b3N   * 100 : 0,
    af:   s.call  ? s.post / s.call        : 0,
    wtsd: s.flop  ? s.sd   / s.flop  * 100 : 0,
    cbet: s.cbetN ? s.cbet / s.cbetN * 100 : 0,
    fcb:  s.fcbN  ? s.fcb  / s.fcbN  * 100 : 0,
    size: sz.length ? sz[Math.floor(sz.length / 2)] * 100 : 0,
    barrel: s.barrelN ? s.barrel / s.barrelN * 100 : 0
  };
}
/* ช่องไหนนับจากอะไร — ใช้บอกจำนวนตัวอย่าง */
const DENOM = { vpip: "hands", pfr: "hands", limp: "hands", b3: "b3N", af: "call",
                wtsd: "flop", cbet: "cbetN", fcb: "fcbN", size: "sizes", barrel: "barrelN" };
/* ช่องที่เป็นสัดส่วน (0-100%) คิดช่วงความคลาดเคลื่อนได้ — af กับ size คิดไม่ได้ */
const IS_RATE = { vpip: 1, pfr: 1, limp: 1, b3: 1, wtsd: 1, cbet: 1, fcb: 1, barrel: 1 };

/* ⚠️ ห้ามตัดสินว่า "ตก" แค่เพราะเลขหลุดกรอบ — โต๊ะจริงมีมือน้อย
   3-bet 15% จาก 27 ครั้ง คลาดเคลื่อนได้ ±13% ซึ่งคาบกรอบ 4-12 อยู่แล้ว
   ฉะนั้นเทียบด้วยช่วง 95% (±1.96 เท่าของค่าคลาดเคลื่อนมาตรฐาน) ทั้งช่วง
   ต้องอยู่นอกกรอบจริง ๆ ถึงจะเรียกว่าตก ไม่งั้นบอกว่า "ยังบอกไม่ได้" */
function verdict(k, val, cnt, band) {
  if (!band || cnt < 8) return { mark: "   ", err: 0 };
  if (!IS_RATE[k]) {
    if (cnt < 25) return { mark: " ? ", err: 0 };
    return { mark: (val >= band[0] && val <= band[1]) ? "ตรง" : "ตก ", err: 0 };
  }
  const p = Math.min(Math.max(val / 100, 0.005), 0.995);
  const err = 1.96 * Math.sqrt(p * (1 - p) / cnt) * 100;
  if (val >= band[0] && val <= band[1]) return { mark: "ตรง", err };
  const lo = val - err, hi = val + err;
  if (hi < band[0] || lo > band[1]) return { mark: "ตก ", err };
  return { mark: " ? ", err };
}

const names = WHO.length ? WHO : Object.keys(S).sort(function (a, b) {
  return (S[b].won - S[b].put) - (S[a].won - S[a].put);
});
console.log("");
console.log("จากมือจริง " + L.length + " มือ" + (DAY ? "  วันที่ " + DAY : "") +
            "   (" + path.relative(root, file).replace(/\\/g, "/") + ")");
console.log("=".repeat(76));
for (const n of names) {
  const s = S[n];
  if (!s) { console.log("");
            console.log("  " + n + " — ไม่อยู่ในบันทึกช่วงนี้"); continue; }
  const lv = LEVEL_OF[n];
  const g = stats(s);
  const net = s.won - s.put;
  console.log("");
  console.log("  " + n + (lv ? "  (" + LVNAME[lv] + " ระดับ " + lv + ")" : "  (คนจริง)") +
              "   นั่ง " + s.hands + " มือ   ได้/เสีย " +
              (net >= 0 ? "+" : "") + net.toLocaleString("en-US") +
              "   ชนะกอง " + s.pots + " ครั้ง" +
              (s.sd ? "   เปิดไพ่ชนะ " + (s.sdWin / s.sd * 100).toFixed(0) + "% จาก " + s.sd + " ครั้ง" : ""));
  for (const k of ORDER) {
    const d = s[DENOM[k]];
    const cnt = typeof d === "object" ? d.length : d;
    const band = lv ? WANT[lv][k] : null;
    const val = k === "af" ? g[k].toFixed(2) : g[k].toFixed(0) + "%";
    const v = verdict(k, g[k], cnt, band);
    console.log("     " + v.mark + " " + LABEL[k].padEnd(22) + val.padStart(7) +
                (v.err ? ("±" + v.err.toFixed(0)).padStart(5) : "     ") +
                (band ? "   กรอบ " + band[0] + "-" + band[1] : "") +
                "   [" + cnt + "]");
  }
  const big = s.big.sort(function (a, b) { return Math.abs(b.net) - Math.abs(a.net); }).slice(0, 4);
  if (big.length) {
    console.log("     กองใหญ่สุด:");
    for (const b of big) {
      console.log("        มือ " + String(b.no).padStart(3) + "  " +
        ((b.net >= 0 ? "+" : "") + b.net).padStart(7) + "  " +
        (b.sd ? "เปิดไพ่" : "ไม่มีใครตาม") + "  " + (b.board || "-") +
        (b.rev ? "   [" + b.rev.hand + "]" : ""));
    }
  }
}
console.log("");
console.log("ตรง = อยู่ในกรอบคนจริง · ตก = หลุดกรอบเกินความคลาดเคลื่อน · ? = หลุดแต่ยังอยู่ในช่วงคลาดเคลื่อน (สรุปไม่ได้)");
console.log("");
