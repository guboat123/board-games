/* ===========================================================
   ความจำและอารมณ์ของบอท — ผูกกับ "ตัวบอท" ไม่ใช่ "โต๊ะ"

   ⚠️ ของเดิมเก็บไว้ในตัวจัดการบอทซึ่งสร้างใหม่ต่อหนึ่งห้อง
   ย้ายโต๊ะเมื่อไหร่ลืมหมด: เคยโดนใครกิน เคยจับได้ว่าใครบลัฟ อารมณ์ค้างจากมือก่อน
   ทั้งที่สิ่งเหล่านี้เป็นของ "คน" ไม่ใช่ของ "โต๊ะ"
   Rex ที่โดน Boat กินไปเมื่อวง 1 ต้องจำได้ตอนเจอกันอีกครั้งในวง 2

   เก็บลงไฟล์ด้วย เพื่อให้ข้ามการรีสตาร์ตได้เหมือนกระเป๋าเงิน (ดู bot-bank.mjs)
   ไฟล์อยู่ใน lan/data/ ซึ่ง gitignore ไว้แล้ว — เป็นข้อมูลของเครื่องที่เปิดโต๊ะ
   =========================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let DIR = path.join(here, "data");
let FILE = path.join(DIR, "bot-mind.json");

let db = { version: 1, minds: {} };
let loaded = false;
let dirty = false;

export function _setDir(dir) {
  DIR = dir;
  FILE = path.join(DIR, "bot-mind.json");
  db = { version: 1, minds: {} };
  loaded = false;
  dirty = false;
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (parsed && parsed.minds) db = parsed;
  } catch (e) { /* ยังไม่มีไฟล์ = บอททุกตัวยังไม่รู้จักใคร ไม่ใช่ข้อผิดพลาด */ }
}

/* เขียนแบบชั่วคราวแล้วเปลี่ยนชื่อทับ กันไฟล์พังตอนเครื่องดับกลางคัน */
export function save() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db), "utf8");
    fs.renameSync(tmp, FILE);
  } catch (e) { /* เขียนไม่ได้ก็ยังเล่นต่อได้ แค่จำข้ามรีสตาร์ตไม่ได้ */ }
}

function mind(name) {
  load();
  if (!db.minds[name]) {
    db.minds[name] = {
      mood: { tilt: 0, confidence: 0, boredom: 0 },
      reads: {},   /* ชื่อคนอื่น -> { n, strong, weak }  ไพ่ที่เคยเห็นเขาเปิด */
      foes: {}     /* ชื่อคนอื่น -> { hurt, caught, sticky, seen } */
    };
  }
  return db.minds[name];
}

/* ---------- อารมณ์ ---------- */
export function moodOf(name) { return mind(name).mood; }

/* ---------- ไพ่ที่เคยเห็นคนอื่นเปิด ---------- */
export function readOf(botName, otherName) {
  const r = mind(botName).reads;
  return r[otherName] || { n: 0, strong: 0, weak: 0 };
}

export function noteReveal(botName, otherName, strong, weak) {
  const r = mind(botName).reads;
  const rec = r[otherName] || (r[otherName] = { n: 0, strong: 0, weak: 0 });
  rec.n++;
  if (strong) rec.strong++;
  else if (weak) rec.weak++;
  /* จำแค่ช่วงหลัง คนเปลี่ยนสไตล์ได้ ความจำจาก 50 มือก่อนไม่ควรค้างตลอดไป */
  if (rec.n > 12) {
    rec.n = 8;
    rec.strong = Math.round(rec.strong * 8 / 12);
    rec.weak = Math.round(rec.weak * 8 / 12);
  }
  dirty = true;
}

/* ---------- ความจำต่อคู่แข่งรายคน ---------- */
export function foeOf(botName, otherName) {
  const f = mind(botName).foes;
  return f[otherName] || (f[otherName] = { hurt: 0, caught: 0, sticky: 0, seen: 0 });
}

export function markDirty() { dirty = true; }

/* รายชื่อที่บอทตัวนี้จำได้ ไว้ให้หน้าจอเอาไปโชว์ */
export function summaryOf(name) {
  const m = mind(name);
  const foes = Object.keys(m.foes).map(n => ({ name: n, ...m.foes[n] }))
    .filter(x => x.seen > 0 || x.caught > 0 || x.sticky > 4)
    .sort((a, b) => b.hurt - a.hurt);
  return { mood: m.mood, foes: foes.slice(0, 8) };
}
