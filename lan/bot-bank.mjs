/* ===========================================================
   เงินติดตัวบอท — ผูกกับ "ชื่อ" และอยู่ข้ามการรีสตาร์ต

   ทำไมต้องมี: ถ้าบอทซื้อชิปใหม่ได้ฟรีไม่จำกัด การหมดตัวก็ไม่มีความหมาย
   บอทจะไล่ all-in ทุกมือแล้วก็ยังอยู่ครบ ซึ่งไม่เหมือนคนเล่นจริงเลย
   พอเงินมีจำกัดและติดลบได้ (= เป็นหนี้) บอทถึงจะมีอะไรให้เสียจริง
   และ "Rex ที่เจอเมื่อวาน" กับ "Rex วันนี้" ก็เป็นตัวเดียวกัน มีประวัติของมันเอง

   ⚠️ ค่าที่เก็บคือ bankroll = เงินทั้งหมดที่บอทมี (ทั้งในกระเป๋าและที่วางอยู่บนโต๊ะ)
   ไม่ใช่เก็บแค่เงินในกระเป๋า เพราะถ้าเก็บแค่กระเป๋า พอเซิร์ฟเวอร์ดับกลางวง
   ชิปที่อยู่บนโต๊ะจะหายไปทั้งก้อน สมการที่ต้องเป็นจริงเสมอคือ
       bankroll = wallet (นอกโต๊ะ) + stack (บนโต๊ะ)
   บันทึกทุกครั้งที่จบมือ ของที่เสียได้มากที่สุดจึงเป็นแค่มือเดียวที่ยังเล่นค้างอยู่

   ไฟล์อยู่ใน lan/data/ ซึ่ง gitignore ไว้แล้ว — เป็นข้อมูลของเครื่องที่เปิดโต๊ะ
   ไม่ใช่ของโปรเจกต์ ห้าม commit
   =========================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let DIR = path.join(here, "data");
let FILE = path.join(DIR, "bot-bank.json");
/* ไฟล์อ่านง่ายสำหรับคน เปิดดูได้เลยว่าบอทตัวไหนมีเงินเท่าไหร่
   ตัว .json ข้างบนเป็นของโปรแกรม อ่านด้วยตาลำบาก */
let TXT = path.join(DIR, "bot-money.txt");

/* ค่าเริ่มต้นกลางๆ ใช้เมื่อไม่ได้ระบุมา ตัวเลขจริงต่อระดับอยู่ใน bots.mjs
   (มือใหม่ 5,000 · นักพนัน 20,000 · มืออาชีพ 100,000) */
export const START = 20000;

let db = { version: 1, bots: {} };
let loaded = false;

/* ให้เทสต์ชี้ไปโฟลเดอร์ชั่วคราวได้ จะได้ไม่ทับเงินจริงของบอทบนเครื่องเจ้าของโต๊ะ */
export function _setDir(dir) {
  DIR = dir;
  FILE = path.join(DIR, "bot-bank.json");
  TXT = path.join(DIR, "bot-money.txt");
  db = { version: 1, bots: {} };
  loaded = false;
  /* ⚠️ ต้องล้างรายชื่อที่ "กำลังนั่งอยู่" ด้วย ไม่ใช่แค่ยอดเงิน
     เปลี่ยนโฟลเดอร์ข้อมูล = คนละโลกกัน ของเดิมค้างไว้ไม่มีความหมายอีกแล้ว
     ของเดิมไม่ล้าง ทำให้เครื่องมือวัดผลที่เปิดโต๊ะใหม่ทุกรอบ เรียกชื่อเดิมกลับมาไม่ได้
     (claim คืน false) โต๊ะรอบหลัง ๆ จึงมีคนน้อยลงเรื่อย ๆ แบบเงียบ ๆ
     ตัวเลขที่วัดได้จากรอบท้าย ๆ จึงเป็นของโต๊ะ 5-6 คน ไม่ใช่ 8 คนอย่างที่ตั้งใจ */
  busy.clear();
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (parsed && parsed.bots) db = parsed;
  } catch (e) { /* ยังไม่มีไฟล์ = บอททุกตัวยังใหม่ ไม่ใช่ข้อผิดพลาด */ }
}

/* เขียนแบบเขียนไฟล์ชั่วคราวแล้วค่อยเปลี่ยนชื่อทับ
   ถ้าเขียนทับตรงๆ แล้วเครื่องดับกลางคัน ไฟล์จะพังทั้งไฟล์ = เงินบอททุกตัวหายพร้อมกัน */
function save() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db), "utf8");
    fs.renameSync(tmp, FILE);
    writeReadable();
  } catch (e) { /* เขียนไม่ได้ก็ยังเล่นต่อได้ แค่จำข้ามรีสตาร์ตไม่ได้ */ }
}

/* ตารางอ่านง่ายสำหรับเจ้าของโต๊ะ เปิดด้วยโปรแกรมอะไรก็ได้
   ⚠️ "กระเป๋าตัง" กับ "ชิปบนโต๊ะ" เป็นคนละก้อนกัน ต้องแยกให้ชัดในตาราง
   กระเป๋า = เงินที่ยังไม่ได้เอาลงโต๊ะ · ซื้อเข้า = เงินที่หยิบลงไปวางแล้ว
   รวมกันคือของทั้งหมดที่บอทตัวนั้นมี ซึ่งคือคอลัมน์ "เงินทั้งหมด" */
function writeReadable() {
  const rows = Object.keys(db.bots).map(n => {
    const r = db.bots[n];
    return { n: n, total: r.bankroll, start: r.start || START, s: r.sessions || 0, b: r.busts || 0 };
  }).sort((a, b) => b.total - a.total);

  const pad = (v, w) => String(v).padEnd(w);
  const num = (v, w) => String(v.toLocaleString("en-US")).padStart(w);
  const out = [];
  out.push("เงินติดตัวบอท  (อัปเดตทุกครั้งที่จบมือ)");
  out.push("ไฟล์นี้สร้างเอง ห้ามแก้ด้วยมือ — แก้แล้วจะถูกเขียนทับ");
  out.push("");
  out.push(pad("ชื่อ", 10) + num("เงินทั้งหมด", 12) + num("เริ่มด้วย", 11) + num("กำไร/ขาดทุน", 13) + num("ลงโต๊ะ", 8) + num("ล้ม", 6));
  out.push("-".repeat(60));
  for (const r of rows) {
    const pl = r.total - r.start;
    out.push(pad(r.n, 10) + num(r.total, 12) + num(r.start, 11) +
             String((pl >= 0 ? "+" : "-") + Math.abs(pl).toLocaleString("en-US")).padStart(13) +
             num(r.s, 8) + num(r.b, 6));
  }
  if (!rows.length) out.push("(ยังไม่มีบอทตัวไหนลงโต๊ะ)");
  const tmp = TXT + ".tmp";
  fs.writeFileSync(tmp, out.join("\r\n") + "\r\n", "utf8");
  fs.renameSync(tmp, TXT);
}

function rec(name, startAt) {
  load();
  if (!db.bots[name]) {
    const st = typeof startAt === "number" ? startAt : START;
    db.bots[name] = { bankroll: st, start: st, sessions: 0, busts: 0, firstSeen: 0, lastSeen: 0 };
  }
  return db.bots[name];
}

/* เงินทั้งหมดที่บอทชื่อนี้มีอยู่ตอนนี้ */
export function bankrollOf(name) {
  return rec(name).bankroll;
}

/* บอทลงนั่งโต๊ะอีกครั้ง
   startAt = เงินตั้งต้นถ้าเป็นบอทตัวใหม่ (ตัวเก่าใช้ยอดที่มีอยู่ ไม่รีเซ็ต) */
export function startSession(name, startAt, at) {
  const r = rec(name, startAt);
  r.sessions++;
  if (!r.firstSeen) r.firstSeen = at || 0;
  r.lastSeen = at || 0;
  save();
  return r.bankroll;
}

/* บันทึกยอดล่าสุด เรียกทุกครั้งที่จบมือและตอนบอทลุกจากโต๊ะ
   wallet = เงินนอกโต๊ะ · stack = ชิปที่วางอยู่บนโต๊ะ รวมกันคือของทั้งหมดที่มี */
export function sync(name, wallet, stack, at) {
  const r = rec(name);
  r.bankroll = Math.round(wallet + stack);
  r.lastSeen = at || r.lastSeen;
  save();
  return r.bankroll;
}

/* บอทหมดตัวอีกหนึ่งรอบ (นับสะสมข้ามวง ไม่ใช่แค่วงนี้) */
export function noteBust(name) {
  const r = rec(name);
  r.busts++;
  save();
  return r.busts;
}

/* ---------- พื้นของหนี้ ----------
   ⚠️ เจ้าของถามว่า "การที่บอทเป็นหนี้ ต้องมีบทลงโทษไหม" (2026-09-04)
   คำตอบคือบทลงโทษมีอยู่แล้วสี่ชั้น (กลัวขึ้น · ตามน้อยลง · เลิกบลัฟ · แทบไม่กลับมานั่ง)
   และวัดได้ว่าทำงานจริง: มืออาชีพ 0/10 ติดลบ · นักพนัน 4/10 · มือใหม่ 2/10
   สิ่งที่ขาดไม่ใช่บทลงโทษ แต่คือ "พื้น" — หนี้ไม่มีขีดจำกัด
   Rocco ล้ม 16 ครั้งใน 21 รอบ ติดลบ 5,496 แล้วก็ยังกู้มาเล่นได้ตลอดกาล
   เงินสดใหม่จึงไหลเข้าโต๊ะไม่จำกัด ซึ่งทำให้ "การหมดตัว" ไม่มีความหมายในระยะยาว

   ⚠️ และห้ามแก้ด้วยการ "ให้เป็นหนี้แล้วเล่นดีขึ้น" เด็ดขาด
   คนจริงเป็นหนี้แล้วเล่นแย่ลง (โค้ดจงใจทำแบบนั้นอยู่แล้ว ดูคอมเมนต์เรื่องบลัฟใน bots.mjs)
   และถ้านักพนันเสียหนักแล้วเล่นตึงขึ้น มันก็กลายเป็นมืออาชีพ = สามระดับยุบเหลือระดับเดียว
   สกอร์การ์ด 51 ช่องจะตกทันที เพราะนักพนันต้องลงเล่น 45-70% ของมือ

   เลิกเล่นถาวรเมื่อติดลบเกินสองเท่าของเงินตั้งต้น = "เจ๊งจนเลิก" ซึ่งเป็นสิ่งที่เกิดกับคนจริง
   ปลดได้ด้วยการล้างสถิติ (ปุ่มในเกม) หรือแก้ไฟล์เอง ไม่ได้ตายถาวรแบบกู้ไม่ได้ */
const DEBT_FLOOR = 2;   /* ติดลบเกิน 2 เท่าของเงินตั้งต้น = เลิก */

export function isRetired(name) {
  const r = rec(name);
  return r.bankroll <= -(r.start || START) * DEBT_FLOOR;
}

/* ---------- กลับมาใหม่ ----------
   ⚠️ พื้นหนี้อย่างเดียวไม่พอ วัดแล้วมันทำให้โต๊ะพัง
   สกอร์การ์ด 51 ช่องตกทันทีที่ใส่พื้นเข้าไป (มืออาชีพ ไล่:ตาม 4.41 ของคนจริงคือ 1.4-3.6)
   เหตุผลไม่ใช่ว่าพื้นผิด แต่เพราะระดับหนึ่งมีสิบชื่อ พอเจ๊งไปหลายตัวโต๊ะก็เหลือคนน้อย
   และ "เล่นสามคน" เป็นเกมคนละแบบกับ "เล่นหกคน" — ดุกว่าโดยธรรมชาติ ไม่ใช่บอทเพี้ยน

   ทางออกที่ตรงกับความจริงที่สุด: คนเจ๊งไม่ได้หายไปตลอดกาล เขาหายไปพักหนึ่งแล้วกลับมาใหม่
   ด้วยเงินก้อนใหม่ที่หามาได้ ส่วนประวัติที่เคยล้มยังติดตัวไปตลอด
   จึงคืนชีพตัวที่ "ติดลบน้อยที่สุด" เมื่อระดับนั้นเหลือคนไม่พอตั้งโต๊ะ
   หนี้ถูกล้าง แต่ busts กับ revivals ไม่เคยถูกล้าง = ยังอ่านออกว่าใครเจ๊งมากี่รอบ */
const MIN_ALIVE = 4;   /* ต่ำกว่านี้ในหนึ่งระดับ = ต้องมีคนกลับมา */

export function reviveIfShort(names) {
  load();
  const alive = names.filter(n => !isRetired(n));
  if (alive.length >= MIN_ALIVE) return "";
  /* เลือกตัวที่ติดลบน้อยที่สุด = คนที่ตั้งตัวได้ก่อนเพื่อน */
  let best = "", bestVal = -Infinity;
  names.forEach(function (n) {
    if (!isRetired(n)) return;
    const r = rec(n);
    if (r.bankroll > bestVal) { bestVal = r.bankroll; best = n; }
  });
  if (!best) return "";
  const r = rec(best);
  r.bankroll = r.start || START;      /* หาเงินก้อนใหม่มาได้ */
  r.revivals = (r.revivals || 0) + 1; /* แต่ประวัติไม่เคยหาย */
  save();
  return best;
}

/* เหลือทุนอีกกี่ % ก่อนถึงพื้น ใช้โชว์บนหน้าจอว่าใครใกล้เลิกแล้ว */
export function debtRoom(name) {
  const r = rec(name);
  const floor = -(r.start || START) * DEBT_FLOOR;
  if (r.bankroll >= 0) return 1;
  return Math.max(0, Math.min(1, r.bankroll / floor === 0 ? 1 : 1 - (r.bankroll / floor)));
}

/* รายชื่อทั้งหมดพร้อมยอด ไว้ให้หน้าจอเอาไปโชว์ */
export function all() {
  load();
  return Object.keys(db.bots).map(n => ({
    name: n,
    bankroll: db.bots[n].bankroll,
    start: db.bots[n].start || START,
    sessions: db.bots[n].sessions,
    busts: db.bots[n].busts,
    busy: busy.has(n),
    /* เจ๊งจนเลิกเล่นแล้ว — หน้าจอต้องบอกได้ว่าทำไมตัวนี้ไม่โผล่มาอีก */
    retired: db.bots[n].bankroll <= -(db.bots[n].start || START) * DEBT_FLOOR,
    revivals: db.bots[n].revivals || 0
  })).sort((a, b) => b.bankroll - a.bankroll);
}

/* ---------- ชื่อบอทหนึ่งชื่อ = นั่งได้ทีละโต๊ะเดียว ----------
   ⚠️ กระเป๋าเงินผูกกับ "ชื่อ" ถ้า Rex นั่งสองโต๊ะพร้อมกัน
   ทั้งสองโต๊ะจะหยิบเงินจากกระเป๋าใบเดียวกันโดยไม่รู้จักกัน แล้วเขียนทับกันไปมา
   ยอดสุดท้ายจะเป็นของโต๊ะที่บันทึกทีหลัง เงินอีกโต๊ะหายทั้งก้อน
   และมันก็ไม่สมเหตุสมผลด้วย — คนคนหนึ่งนั่งสองโต๊ะพร้อมกันไม่ได้

   ตัวจองนี้อยู่ในหน่วยความจำของโปรเซส ไม่ต้องเขียนไฟล์
   เพราะพอเซิร์ฟเวอร์รีสตาร์ต ทุกโต๊ะก็หายไปหมดอยู่แล้ว การจองค้างจึงไม่มีความหมาย */
const busy = new Set();

/* จองชื่อ คืน true ถ้าจองได้ */
/* force = ผู้เรียกเป็นเครื่องมือวัด ไม่ใช่เกมจริง
   ⚠️ เครื่องมือวัดต้องเลือกได้เองว่าใครนั่ง (ดู _addNamed ใน bots.mjs)
   ถ้าเศรษฐกิจแอบถอนคนออกจากการทดลอง ตัวอย่างจะเปลี่ยนไปโดยไม่มีใครรู้
   ซึ่งเกิดขึ้นจริงแล้ว: พอใส่พื้นหนี้ สกอร์การ์ดเหลือโต๊ะสามคนแล้วตกทันที
   วิธีเล่นของบอทไม่ได้ขึ้นกับหนี้อยู่แล้ว (มีเทสต์คุม) การวัดจึงยังใช้ได้เหมือนเดิม */
export function claim(name, force) {
  /* ⚠️ ตัวที่เจ๊งจนเลิกแล้ว ห้ามถูกเรียกมานั่งอีกในเกมจริง — นั่นคือความหมายของ "เลิก" */
  if (!force && isRetired(name)) return false;
  if (busy.has(name)) return false;
  busy.add(name);
  return true;
}

export function release(name) { busy.delete(name); }
export function isBusy(name) { return busy.has(name); }
