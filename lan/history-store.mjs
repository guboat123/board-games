/* ===========================================================
   ที่เก็บประวัติการเล่นรายคน (อยู่บนเครื่องที่รันเซิร์ฟเวอร์เท่านั้น)
   ยึด "IP เดิม = คนเดิม" ตามที่เจ้าของสั่ง เพราะในวง WiFi เดียวกัน
   แต่ละเครื่องได้ IP ประจำของมัน
   ⚠️ ข้อจำกัดที่ต้องรู้: เราเตอร์แจก IP ใหม่ได้ (DHCP หมดอายุ / ย้าย WiFi)
      และถ้าสองคนสลับกันใช้เครื่องเดียว จะถูกนับเป็นคนเดียวกัน
      จึงเก็บรายชื่อที่เคยใช้จาก IP นั้นไว้ด้วย จะได้ตรวจสอบย้อนได้
   =========================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let DIR = path.join(here, "data");
let FILE = path.join(DIR, "players.json");
let HANDS = path.join(DIR, "hands.jsonl");

let db = { version: 1, players: {} };
let dirty = false;

/* ให้เทสต์ชี้ไปโฟลเดอร์ชั่วคราวได้ จะได้ไม่ไปทับข้อมูลจริงของเจ้าของโต๊ะ */
export function _setDir(dir) {
  DIR = dir;
  FILE = path.join(DIR, "players.json");
  HANDS = path.join(DIR, "hands.jsonl");
  db = { version: 1, players: {} };
  dirty = false;
}

function ensureDir() {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}
}

export function load() {
  ensureDir();
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.players) db = parsed;
  } catch (e) { /* ยังไม่มีไฟล์ = เริ่มใหม่ ไม่ใช่ข้อผิดพลาด */ }
  return db;
}

/* เขียนลงไฟล์ชั่วคราวก่อนแล้วค่อยเปลี่ยนชื่อทับ
   ถ้าไฟฟ้าดับกลางคัน ไฟล์เดิมจะยังอยู่ครบ ไม่กลายเป็นไฟล์ครึ่งๆ ที่อ่านไม่ออก */
export function save() {
  if (!dirty) return;
  ensureDir();
  const tmp = FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
    fs.renameSync(tmp, FILE);
    dirty = false;
  } catch (e) { /* เขียนไม่ได้ก็ไม่ควรทำให้เกมล่ม */ }
}

function blank(key) {
  return {
    key: key,
    names: [],
    hands: 0,
    won: 0,
    net: 0,
    acts: { fold: 0, check: 0, call: 0, raise: 0 },
    street: { preflop: 0, flop: 0, turn: 0, river: 0 },
    /* เข้าเล่นเองในพรีฟลอป (ไม่นับบอด) = VPIP แบบง่ายๆ ใช้ดูว่าเล่นกว้างแค่ไหน */
    vpip: 0,
    thinkMs: 0,
    thinkN: 0,
    firstSeen: 0,
    lastSeen: 0
  };
}

/* บันทึกหนึ่งมือ · seatKey = ฟังก์ชัน (seatIndex, name) -> คีย์ประจำคน (IP ถ้ามี) */
export function recordHand(hand, seatKey, at) {
  if (!hand || !hand.acts) return;
  at = at || 0;
  const touched = {};

  hand.acts.forEach(a => {
    const key = seatKey(a.seat, a.name);
    if (!key) return;
    const p = db.players[key] || (db.players[key] = blank(key));
    if (a.name && p.names.indexOf(a.name) === -1) p.names.push(a.name);
    if (p.acts[a.act] !== undefined) p.acts[a.act]++;
    if (p.street[a.phase] !== undefined) p.street[a.phase]++;
    if (a.phase === "preflop" && (a.act === "call" || a.act === "raise") && !touched[key + "|vpip"]) {
      p.vpip++;
      touched[key + "|vpip"] = true;
    }
    p.thinkMs += (a.think || 0) * 1000;
    p.thinkN++;
    if (!p.firstSeen) p.firstSeen = at;
    p.lastSeen = at;
    touched[key] = true;
  });

  (hand.players || []).forEach((pl, i) => {
    const key = seatKey(-1, pl.name);
    if (key && db.players[key]) touched[key] = true;
  });

  Object.keys(touched).filter(k => k.indexOf("|") === -1).forEach(k => { db.players[k].hands++; });

  ((hand.result && hand.result.payouts) || []).forEach(w => {
    const key = seatKey(-1, w.name);
    if (!key) return;
    const p = db.players[key] || (db.players[key] = blank(key));
    p.won++;
    p.net += w.amount;
    p.lastSeen = at;
  });

  /* ⚠️ ต้องหักเงินที่ลงไปด้วย ไม่ใช่บวกแต่ที่ได้
     เดิมบวกอย่างเดียว ทุกคนจึงเป็นบวกตลอดกาล ต่อให้เสียจริงทุกมือ
     และหน้าจอก็แสดงค่านั้นพร้อมเครื่องหมาย + กับสีเขียว = ตัวเลขโกหกคนอ่าน
     puts ถูกบันทึกไว้ตอนจบมือ ครบทุกคนที่ลงเงิน ไม่ใช่เฉพาะคนที่เปิดไพ่ */
  ((hand.result && hand.result.puts) || []).forEach(x => {
    const key = seatKey(-1, x.name);
    if (!key) return;
    const p = db.players[key] || (db.players[key] = blank(key));
    p.net -= x.amount;
    p.lastSeen = at;
  });

  dirty = true;
  try { fs.appendFileSync(HANDS, JSON.stringify({ at: at, hand: hand }) + "\n", "utf8"); } catch (e) {}
}

export function profiles() {
  return Object.keys(db.players).map(k => {
    const p = db.players[k];
    return {
      key: p.key,
      names: p.names,
      hands: p.hands,
      won: p.won,
      net: p.net,
      acts: p.acts,
      street: p.street,
      vpip: p.hands ? Math.round(p.vpip / p.hands * 100) : 0,
      avgThink: p.thinkN ? Math.round(p.thinkMs / p.thinkN / 100) / 10 : 0,
      firstSeen: p.firstSeen,
      lastSeen: p.lastSeen
    };
  }).sort((a, b) => b.hands - a.hands);
}
