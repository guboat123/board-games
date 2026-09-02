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
/* ⚠️ เครื่องมือวัดผลเล่นเป็นล้านมือ ถ้าเขียนไฟล์ทุกมือจะช้าจนวัดไม่ไหว
   ปิดการเขียนได้ ความจำยังทำงานเต็มที่ในหน่วยความจำเหมือนเดิม แค่ไม่ข้ามการรีสตาร์ต */
let autoSave = true;
export function setAutoSave(v) { autoSave = !!v; }

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
  if (!autoSave || !dirty) return;
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
  const rec = f[otherName] ||
    (f[otherName] = { hurt: 0, caught: 0, sticky: 0, seen: 0, acts: 0, folds: 0 });
  /* ไฟล์เก่าไม่มีสองช่องนี้ เติมให้ตอนอ่าน จะได้ไม่ต้องล้างความจำเดิมทิ้ง */
  if (rec.acts === undefined) { rec.acts = 0; rec.folds = 0; }
  return rec;
}

/* ---------- "คนนี้หมอบบ่อยแค่ไหน" ----------
   ⚠️ ของเดิมมีแต่ sticky ซึ่งพื้นเป็น 0 แปลว่า "ตามบ่อย" ได้อย่างเดียว
   คนที่หมอบตลอด กับคนที่ยังไม่เคยเห็นเล่น จึงหน้าตาเหมือนกันหมด
   ทั้งที่คนหมอบตลอดคือเป้าที่ควรโดนไล่มากที่สุดบนโต๊ะ
   (พิสูจน์แล้วตอนผมลงไปนั่งเล่นเอง: ลงเล่น 20% ของมือ ไม่มีบอทตัวไหนไล่ผมสักครั้ง
    เดิมพันของผมจึงได้เงินเต็มทุกครั้งที่มีของ — นั่นคือช่องที่ทำให้ผมได้ +336,390)
   0.62 คือสัดส่วนการหมอบของคนเล่นปกติ เกิน 0.87 ถือว่าเป็นเป้าเต็มตัว */
export function foldiness(botName, otherName) {
  const f = foeOf(botName, otherName);
  if (f.acts < 15) return 0;
  /* ⚠️ เกณฑ์เดิม 0.62 สูงจนฟีเจอร์นี้ไม่เคยทำงานเลยแม้แต่ครั้งเดียว
     acts นับ "ทุกท่า" (หมอบ/ตาม/เคาะ/ไล่) ไม่ใช่นับเป็นมือ สัดส่วนจึงต่ำกว่าที่คิดไว้มาก
     วัดจริง 2026-09-02: คนเล่นที่นิ่งสุด ๆ (ลงเล่น 12% ของมือ) หมอบ 54.5% ของท่า
     คนเล่นแน่นปกติ (24%) หมอบ 38% ส่วนบอทกันเองอยู่ที่ 20-54%
     เกณฑ์ 62% จึงอยู่เหนือทุกคนที่มีอยู่จริง = โค้ดตายสนิท
     ปรับเป็น 0.42 -> 0.58 ให้ตรงกับช่วงที่วัดได้จริง:
     คนเล่นแน่นปกติยังไม่โดนไล่ (38% = 0) · คนที่นิ่งเกินไปโดนเต็ม ๆ (54.5% = 0.78)
     ซึ่งเป็นสิ่งที่ต้องเกิด ไม่งั้นนั่งซ้อมแบบหมอบทิ้งอย่างเดียวก็ไม่มีใครลงโทษ */
  return Math.max(0, Math.min(1, (f.folds / f.acts - 0.42) / 0.16));
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
