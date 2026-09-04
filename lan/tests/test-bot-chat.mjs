/* ===========================================================
   ปากของบอทต้องไม่ทำให้รู้ไพ่

   ⚠️ เจ้าของสั่งไว้ตรง ๆ ตอนขอฟีเจอร์นี้ (2026-09-04):
   "พูดต้องไม่ทำให้รู้ไพ่นะ แบบ จะขิง จะกวนอะไรก็ได้"
   ข้อห้ามที่เขียนไว้ในคอมเมนต์อย่างเดียวไม่พอ วันหลังมีคนเติมประโยคใหม่
   แล้วเผลอเขียนว่า "ทิ้งคู่เอซเลยนะเนี่ย" ก็จบ — ต้องมีอะไรร้องขึ้นมา

   ไฟล์นี้ตรวจสามชั้น:
     1. ซอร์สของ bot-chat.mjs ต้องไม่มีคำที่แปลว่าไพ่เลย (รับไพ่ไม่ได้ตั้งแต่แรก)
     2. ทุกประโยคที่เป็นไปได้ ต้องไม่มีชื่อไพ่ ดอก หรือชื่อชุดไพ่
     3. bots.mjs ต้องไม่ส่งไพ่เข้า lineFor

   รัน:  node lan/tests/test-bot-chat.mjs
   =========================================================== */
import { lineFor, _allLines, _poolSizes } from "../bot-chat.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAN = path.resolve(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  : " + name + (extra ? "  (" + extra + ")" : "")); }
  else { fail++; console.log("  FAIL: " + name + (extra ? "  (" + extra + ")" : "")); }
}

/* ---------- 1. ซอร์สต้องไม่รู้จักไพ่เลย ---------- */
console.log("");
console.log("--- ไฟล์คำพูดต้องไม่มีทางแตะไพ่ได้ ---");
{
  const src = fs.readFileSync(path.join(LAN, "bot-chat.mjs"), "utf8");
  /* เอาคอมเมนต์ออกก่อน คอมเมนต์พูดถึงไพ่ได้ (มันอธิบายว่าทำไมห้าม) */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const banned = ["cards", "hole", "board", "rank", "suit", "hand.", "equity"];
  banned.forEach(function (w) {
    ok("โค้ดต้องไม่มีคำว่า \"" + w + "\"", code.indexOf(w) === -1);
  });
}

/* ---------- 2. ทุกประโยคต้องไม่บอกไพ่ ---------- */
console.log("");
console.log("--- ไล่ทุกประโยคที่พูดได้ ---");
{
  const lines = _allLines();
  ok("มีประโยคให้ตรวจจริง", lines.length > 150, lines.length + " ประโยค");

  /* ชื่อไพ่แบบอังกฤษและไทย · ดอก · ชื่อชุดไพ่ที่ใช้ในเกม
     ⚠️ ต้องดัก "เอซ/คู่/สเตรท/ฟลัช" ด้วย ไม่ใช่แค่ A♠ เพราะคนไทยพูดเป็นคำ */
  const cardWords = [
    "เอซ", "คิง", "ควีน", "แจ็ค", "โพดำ", "โพแดง", "ดอกจิก", "ข้าวหลามตัด",
    "สเตรท", "ฟลัช", "ฟูลเฮ้าส์", "ตอง", "ทูแพร์", "วันแพร์", "ไฮการ์ด",
    "Straight", "Flush", "Full House", "Two Pair", "Trips", "Quads",
    "♠", "♥", "♦", "♣"
  ];
  let bad = [];
  lines.forEach(function (l) {
    cardWords.forEach(function (w) {
      if (l.indexOf(w) >= 0) bad.push(l + "  <- " + w);
    });
    /* ไพ่แบบรหัส เช่น As Kh 7c — ตัวอักษร/เลข ตามด้วยดอกตัวเดียว */
    if (/\b([2-9TJQKA]|10)[shdc]\b/.test(l)) bad.push(l + "  <- รหัสไพ่");
  });
  ok("ไม่มีประโยคไหนเอ่ยถึงไพ่", bad.length === 0, bad.slice(0, 3).join(" | "));

  /* ⚠️ "คู่" เดี่ยว ๆ อันตราย: "ทิ้งคู่เลยเหรอ" = บอกไพ่
     แต่ "คู่แข่ง" ไม่ใช่ จึงต้องดูบริบท ไม่ใช่ห้ามคำ */
  const pairish = lines.filter(function (l) {
    return /คู่(?!แข่ง|ต่อสู้|กัน)/.test(l);
  });
  ok("ไม่มีประโยคที่พูดถึง \"คู่\" แบบหมายถึงไพ่", pairish.length === 0,
     pairish.slice(0, 2).join(" | "));
}

/* ---------- 3. bots.mjs ต้องไม่ส่งไพ่เข้าไป ---------- */
console.log("");
console.log("--- จุดที่เรียกใช้ ต้องไม่ยัดไพ่เข้าไป ---");
{
  const src = fs.readFileSync(path.join(LAN, "bots.mjs"), "utf8");
  const call = src.match(/const line = lineFor\(\{[\s\S]*?\n    \}\);/);
  ok("หาจุดเรียก lineFor เจอ", !!call);
  if (call) {
    const body = call[0];
    ["cards", "hole", "board", "equity", "base", "strength"].forEach(function (w) {
      ok("ไม่ได้ส่ง \"" + w + "\" เข้าไป", body.indexOf(w) === -1);
    });
  }
}

/* ---------- 4. คำพูดต้องเป็นทางเดียว ห้ามย้อนกลับเข้าหัวบอท ---------- */
console.log("");
console.log("--- คำพูดต้องไม่กลายเป็นข้อมูลของบอทตัวอื่น ---");
{
  const src = fs.readFileSync(path.join(LAN, "bots.mjs"), "utf8");
  /* ถ้ามีใครอ่าน .say ของที่นั่งอื่นเมื่อไหร่ = เริ่มฟังกันแล้ว = โกง
     (ที่ยอมให้มีได้คือการ "เขียน" ของตัวเองใน say() เท่านั้น) */
  const reads = src.match(/\.say\b(?!\s*=)/g) || [];
  ok("ไม่มีใครอ่าน .say ของใครเลย", reads.length === 0,
     reads.length ? "เจอ " + reads.length + " จุด" : "");
}

/* ---------- 5. เยอะพอที่จะไม่ซ้ำในวงเดียว ---------- */
console.log("");
console.log("--- ต้องมีคำเยอะพอ (เจ้าของขอ \"คำเยอะ ๆ แบบไม่ซ้ำ\") ---");
{
  const sizes = _poolSizes();
  const thin = Object.keys(sizes).filter(function (k) { return sizes[k] < 4; });
  ok("ทุกช่องมีอย่างน้อย 4 ประโยค", thin.length === 0, thin.join(", "));

  /* พูดรัว ๆ 30 ครั้งแบบตัวเดียว ต้องไม่ซ้ำติดกันถี่ ๆ */
  const trait = { nerve: .6, bluffy: 1.5, tilt: .8, patience: .2 };
  const got = [];
  for (let i = 0; i < 30; i++) {
    got.push(lineFor({ name: "Rocco", level: 2, trait: trait, mood: { tilt: .9, boredom: 0 },
                       event: "lost", potShare: 1 }));
  }
  const said = got.filter(Boolean);
  const uniq = new Set(said);
  ok("พูด 30 ครั้ง ต้องได้ประโยคหลากหลาย", uniq.size >= Math.min(8, said.length),
     said.length + " ครั้ง · ไม่ซ้ำ " + uniq.size + " แบบ");
  /* ติดกันสองครั้งเป็นประโยคเดิม = ตัวกันซ้ำไม่ทำงาน */
  let backToBack = 0;
  for (let i = 1; i < said.length; i++) if (said[i] === said[i - 1]) backToBack++;
  ok("ต้องไม่พูดประโยคเดิมติดกัน", backToBack === 0, "ซ้ำติดกัน " + backToBack + " ครั้ง");
}

/* ---------- 6. ความถี่ต้องไม่ท่วม ---------- */
console.log("");
console.log("--- พูดบ่อยเกินไปกลายเป็นเสียงรบกวน ---");
{
  const trait = { nerve: .5, bluffy: 1, tilt: .5, patience: .5 };
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    if (lineFor({ name: "Vince", level: 2, trait: trait, mood: { tilt: 0, boredom: 0 },
                  event: "folded", potShare: 0 })) n++;
  }
  const rate = n / 4000;
  /* หมอบทิ้งเฉย ๆ คือจังหวะที่คนจริงเงียบที่สุด ต้องต่ำมาก */
  ok("หมอบแล้วแทบไม่พูด (ต่ำกว่า 6%)", rate < 0.06, Math.round(rate * 1000) / 10 + "%");

  /* ชนะตอนเปิดไพ่คือจังหวะที่คนพูดกันจริง ต้องสูงกว่าหมอบชัดเจน */
  let m = 0;
  for (let i = 0; i < 4000; i++) {
    if (lineFor({ name: "Vince", level: 2, trait: trait, mood: { tilt: 0, boredom: 0 },
                  event: "won", potShare: 0 })) m++;
  }
  const wonRate = m / 4000;
  ok("ชนะตอนเปิดไพ่พูดบ่อยกว่าหมอบชัดเจน", wonRate > rate * 3,
     "หมอบ " + Math.round(rate * 1000) / 10 + "% · ชนะ " + Math.round(wonRate * 1000) / 10 + "%");
  ok("แต่ก็ยังไม่ใช่ทุกครั้ง (ต่ำกว่า 40%)", wonRate < 0.40,
     Math.round(wonRate * 1000) / 10 + "%");
  /* ตอนลุกจากโต๊ะต้องพูดเสมอ เป็นจังหวะที่ควรมีคำลาทุกครั้ง */
  let bye = 0;
  for (let i = 0; i < 50; i++) {
    if (lineFor({ name: "Vince", level: 2, trait: trait, mood: {}, event: "leaving" })) bye++;
  }
  ok("ตอนลุกจากโต๊ะต้องพูดทุกครั้ง", bye === 50, bye + "/50");
}

/* ---------- 7. ระดับต้องพูดคนละแบบ ---------- */
console.log("");
console.log("--- สามระดับต้องไม่พูดเหมือนกัน ---");
{
  function poolOf(level) {
    const out = new Set();
    for (let i = 0; i < 400; i++) {
      const l = lineFor({ name: "X" + level, level: level,
                          trait: { nerve: .5, bluffy: 2, tilt: .5, patience: 0 },
                          mood: { tilt: .9 }, event: "won", potShare: 1 });
      if (l) out.add(l);
    }
    return out;
  }
  const a = poolOf(1), b = poolOf(2), c = poolOf(3);
  const shared = [...a].filter(function (x) { return b.has(x) || c.has(x); });
  ok("มือใหม่กับระดับอื่นต้องไม่ใช้ประโยคเดียวกัน", shared.length === 0,
     shared.slice(0, 2).join(" | "));
  ok("ทุกระดับพูดได้จริง", a.size > 3 && b.size > 3 && c.size > 3,
     a.size + " / " + b.size + " / " + c.size);
}

/* ---------- 8. อารมณ์ต้องเปลี่ยนทั้งความถี่และเนื้อคำ ---------- */
console.log("");
console.log("--- พูดตอนอารมณ์ถึง ไม่ใช่ทอยลูกเต๋าเฉย ๆ ---");
{
  const trait = { nerve: .5, bluffy: 1, tilt: .5, patience: .5 };
  function rateWith(mood, scare) {
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      if (lineFor({ name: "M" + Math.random(), level: 2, trait: trait,
                    mood: mood, scare: scare, event: "won", potShare: 0 })) n++;
    }
    return n / 4000;
  }
  const flat  = rateWith({ tilt: 0, confidence: 0, boredom: 0 }, 0);
  const hot   = rateWith({ tilt: 0, confidence: 0.9, boredom: 0 }, 0);
  const upset = rateWith({ tilt: 0.9, confidence: 0, boredom: 0 }, 0);
  const afraid = rateWith({ tilt: 0, confidence: 0, boredom: 0 }, 0.9);

  /* ⚠️ นี่คือข้อที่ตอบคำถามเจ้าของโดยตรง ("ถ้ากำหนดแบบนั้น มันจะ fix ไปไหม")
     ถ้าสี่ค่านี้เท่ากันเมื่อไหร่ = กลับไปเป็นลูกเต๋าคงที่แล้ว */
  ok("อารมณ์เรียบ ๆ ต้องพูดน้อยกว่าตอนคึกชัดเจน", hot > flat * 1.6,
     "เรียบ " + Math.round(flat * 100) + "% · คึก " + Math.round(hot * 100) + "%");
  /* ⚠️ "เงียบก็คืออารมณ์" (เจ้าของทัก 2026-09-04)
     เสียหนักเหมือนกัน แต่คนละนิสัยต้องออกคนละทาง ไม่ใช่ดังขึ้นเหมือนกันหมด
     ถ้าสองค่านี้ไปทางเดียวกันเมื่อไหร่ = ความเงียบกลับไปเป็นแค่ "ไม่ได้พูด" อีกแล้ว */
  function tiltRate(bluffy) {
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      if (lineFor({ name: "T" + Math.random(), level: 2,
                    trait: { nerve: .5, bluffy: bluffy, tilt: .5, patience: .5 },
                    mood: { tilt: 0.9, confidence: 0, boredom: 0 }, scare: 0,
                    event: "lost", potShare: 0 })) n++;
    }
    return n / 4000;
  }
  const loudHurt = tiltRate(1.6), quietHurt = tiltRate(0.5);
  ok("คนปากไว เสียหนักแล้วเสียงดังขึ้น", loudHurt > flat * 1.6,
     "ปากไว " + Math.round(loudHurt * 100) + "% · เรียบ " + Math.round(flat * 100) + "%");
  ok("คนเก็บอาการ เสียหนักแล้วเงียบลง", quietHurt < flat,
     "เก็บอาการ " + Math.round(quietHurt * 100) + "%");
  ok("สองนิสัยนี้ต้องต่างกันชัดเจน", loudHurt > quietHurt * 3,
     Math.round(loudHurt * 100) + "% vs " + Math.round(quietHurt * 100) + "%");

  /* และตอนที่คนเก็บอาการยอมพูด มันต้องสั้นห้วน ไม่ใช่ประโยคโวยวาย */
  const sulkLines = new Set();
  for (let i = 0; i < 900; i++) {
    const l = lineFor({ name: "S" + Math.random(), level: 2,
                        trait: { nerve: .5, bluffy: 0.5, tilt: .5, patience: .5 },
                        mood: { tilt: 0.9 }, scare: 0, event: "lost", potShare: 0 });
    if (l) sulkLines.add(l);
  }
  ok("คนเก็บอาการมีคำห้วน ๆ ของตัวเอง", sulkLines.has("...") || sulkLines.has("อือ"),
     [...sulkLines].slice(0, 4).join(" | "));
  ok("กลัวแล้วต้องพูดน้อยลง ไม่ใช่มากขึ้น", afraid < hot,
     "กลัว " + Math.round(afraid * 100) + "% · คึก " + Math.round(hot * 100) + "%");

  /* เนื้อคำต้องเปลี่ยนด้วย ไม่ใช่แค่ความถี่ */
  function poolWith(mood, scare) {
    const out = new Set();
    for (let i = 0; i < 600; i++) {
      const l = lineFor({ name: "T" + Math.random(), level: 2, trait: trait,
                          mood: mood, scare: scare, event: "won", potShare: 0 });
      if (l) out.add(l);
    }
    return out;
  }
  const cocky = poolWith({ confidence: 0.9, tilt: 0 }, 0);
  const meek  = poolWith({ confidence: 0, tilt: 0 }, 0.9);
  const onlyCocky = [...cocky].filter(function (x) { return !meek.has(x); });
  const onlyMeek  = [...meek].filter(function (x) { return !cocky.has(x); });
  ok("ตอนคึกมีคำที่ตอนกลัวไม่พูด", onlyCocky.length > 3, onlyCocky.slice(0, 2).join(" | "));
  ok("ตอนกลัวมีคำที่ตอนคึกไม่พูด", onlyMeek.length > 2, onlyMeek.slice(0, 2).join(" | "));
}

console.log("");
console.log(fail === 0 ? "=== ผ่านหมด " + pass + " ข้อ ===" : "=== ตก " + fail + " จาก " + (pass + fail) + " ===");
process.exit(fail === 0 ? 0 : 1);
