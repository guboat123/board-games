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

/* รายชื่อทั้งหมดพร้อมยอด ไว้ให้หน้าจอเอาไปโชว์ */
export function all() {
  load();
  return Object.keys(db.bots).map(n => ({
    name: n,
    bankroll: db.bots[n].bankroll,
    sessions: db.bots[n].sessions,
    busts: db.bots[n].busts
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
export function claim(name) {
  if (busy.has(name)) return false;
  busy.add(name);
  return true;
}

export function release(name) { busy.delete(name); }
export function isBusy(name) { return busy.has(name); }
