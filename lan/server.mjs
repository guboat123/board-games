/* ===========================================================
   ก๊วนบอร์ดเกม — ตัวกลางสำหรับเล่นหลายเครื่องในวง WiFi เดียวกัน

   รันบนเครื่องที่เป็นเจ้าภาพเครื่องเดียว:  node lan/server.mjs
   เครื่องอื่นในวงเดียวกันเปิด http://<ไอพีที่ขึ้นบนจอ>:8080

   - ไม่ต้องลง dependency อะไรเลย ใช้ของที่มากับ Node
   - ไม่ออกอินเทอร์เน็ต ไม่มีบัญชี ไม่มีค่าใช้จ่าย
   - เว็บบน GitHub Pages ยังเล่นเครื่องเดียวได้เหมือนเดิม ไฟล์นี้เป็นของเสริม

   หมายเหตุ: ตัวกลางนี้ถือไพ่และแจกไพ่เอง (authoritative)
   เพราะโป๊กเกอร์ต้องกันไม่ให้ผู้เล่นเห็นไพ่ในมือคนอื่น
   =========================================================== */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { createTable } from "./poker-room.mjs";
import * as store from "./history-store.mjs";
import { createBotManager, DEFAULT_BUY_IN } from "./bots.mjs";
import * as botBank from "./bot-bank.mjs";
import * as botMind from "./bot-mind.mjs";
import { createHash } from "node:crypto";

/* รอยนิ้วมือของเครื่อง: แปลง token ทางเดียว ใช้แยกคนได้ แต่เอาไปยึดที่นั่งไม่ได้ */
function fingerprint(tok) {
  return createHash("sha256").update(String(tok)).digest("hex").slice(0, 16);
}
/* ⚠️ เปิดเซิร์ฟเวอร์ตัวที่สองบนเครื่องเดียวกันเพื่อทดสอบ จะเขียนทับกระเป๋าเงินบอท
   กับความจำของโต๊ะจริงทันที (ไฟล์เดียวกัน สองคนเขียน — ดูคำเตือนใน bots.mjs add())
   ตั้ง BOT_DATA_DIR ให้ตัวทดสอบ แล้วมันจะไม่แตะข้อมูลของโต๊ะจริงเลย
   ต้องตั้งก่อน store.load() ไม่งั้นมันอ่านของเดิมไปแล้ว */
if (process.env.BOT_DATA_DIR) {
  const d = process.env.BOT_DATA_DIR;
  store._setDir(d); botBank._setDir(d); botMind._setDir(d);
  console.log("  ใช้โฟลเดอร์ข้อมูลแยก: " + d);
}
store.load();
/* เขียนลงดิสก์เป็นช่วงๆ ไม่ใช่ทุกมือ ดิสก์จะได้ไม่ถูกกวนตลอดเวลา
   ตัว save เองข้ามเองถ้าไม่มีอะไรเปลี่ยน */
setInterval(() => store.save(), 20000);
process.on("SIGINT", () => { logLine("stop", "got SIGINT (Ctrl+C)"); store.save(); process.exit(0); });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);

/* ---------- เขียน log ของตัวเองลงไฟล์ ----------
   ⚠️ เซิร์ฟเวอร์หายไปเฉย ๆ สองคืนติด (2026-09-03 ~23:03 · 2026-09-04 ~22:5x)
   ทั้งสองครั้งอธิบายไม่ได้เลย เพราะไม่มีอะไรถูกเก็บไว้ — output ออกหน้าจอแล้วหายไปกับหน้าต่าง
   บอกให้คนพิมพ์ "> server.log 2>&1" ทุกครั้งใช้ไม่ได้จริง (ต้องจำ ต้องอยู่โฟลเดอร์ถูก
   และไวยากรณ์ cmd กับ PowerShell ก็ไม่เหมือนกัน) มันจึงต้องเป็นหน้าที่ของตัวเซิร์ฟเวอร์เอง

   สิ่งที่ต้องได้คำตอบคือ "ตายยังไง" ไม่ใช่แค่ "ตายตอนไหน" จึงจดสามอย่าง:
   ข้อความปกติ · ข้อผิดพลาดที่ไม่มีใครรับ · และบรรทัดสุดท้ายตอนออกพร้อมรหัสออก

   ⚠️ วิธีอ่าน log ตอนเซิร์ฟเวอร์หายไป — บรรทัดสุดท้ายคือคำตอบ:
     [crash] ... แล้ว [stop] exit code 1  = โค้ดพังเอง มี stack ให้ตามต่อ
     [stop] got SIGINT                     = มีคนกด Ctrl+C ในหน้าต่างนั้น
     [stop] exit code 0 เฉย ๆ              = ออกตามปกติ
     ไม่มีบรรทัด [stop] เลย                = ถูกฆ่าจากข้างนอก (ปิดหน้าต่าง · Task Manager ·
                                             เครื่องหลับ/รีสตาร์ต) — บน Windows ไม่มีสัญญาณ
                                             ส่งมาถึงโปรเซสก่อนตาย จึงจดอะไรไม่ได้เลย
                                             และ "จดไม่ได้" นี่แหละคือข้อมูลที่แยกสองกรณีออกจากกัน */
const LOG_FILE = path.join(process.env.BOT_DATA_DIR || path.join(__dirname, "data"),
                           "server.log");
let logCount = 0, logDirReady = false;
function logLine(tag, text) {
  try {
    /* เขียนแบบ sync เพราะบรรทัดสำคัญที่สุดคือบรรทัดตอนกำลังจะตาย
       ถ้าเขียนแบบ async มันจะไม่ทันได้ลงดิสก์ ซึ่งคือบรรทัดเดียวที่เราต้องการจริง ๆ
       จึงต้องไม่ทำงานหนักต่อบรรทัด: สร้างโฟลเดอร์ครั้งเดียว เช็คขนาดทุก 500 บรรทัด */
    if (!logDirReady) { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); logDirReady = true; }
    if (++logCount % 500 === 0) {
      /* กันไฟล์โตไม่มีที่สิ้นสุด เก็บรอบก่อนหน้าไว้หนึ่งไฟล์ก็พอสำหรับงานนี้ */
      try {
        if (fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) {
          fs.renameSync(LOG_FILE, LOG_FILE + ".1");
        }
      } catch (e) {}
    }
    fs.appendFileSync(LOG_FILE,
      new Date().toISOString() + " [" + tag + "] " + text + "\n");
  } catch (e) {}   /* จดไม่ได้ก็ต้องไม่ล้มเซิร์ฟเวอร์ */
}
/* ⚠️ ต้องยังพิมพ์ออกหน้าจอเหมือนเดิม — หน้าต่างเซิร์ฟเวอร์คือที่ที่คนอ่านที่อยู่ WiFi
   สีของ console (รหัส ANSI) ถอดออกก่อนเขียนไฟล์ ไม่งั้น log เต็มไปด้วยขยะ */
["log", "error", "warn"].forEach(function (kind) {
  const original = console[kind].bind(console);
  console[kind] = function (...args) {
    original(...args);
    logLine(kind, args.map(a => typeof a === "string" ? a : String(a)).join(" ")
                      .replace(/\u001b\[[0-9;]*m/g, ""));
  };
});
logLine("start", "server starting · pid " + process.pid + " · port " + PORT +
                 " · node " + process.version);
process.on("uncaughtException", (e) => {
  logLine("crash", "uncaughtException: " + (e && e.stack || e));
  /* จดก่อนแล้วค่อยตายตามเดิม ไม่ฝืนเล่นต่อทั้งที่สถานะอาจพังไปแล้ว */
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  logLine("crash", "unhandledRejection: " + (e && e.stack || e));
});
for (const sig of ["SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try { process.on(sig, () => { logLine("stop", "got " + sig); store.save(); process.exit(0); }); }
  catch (e) {}   /* บางสัญญาณไม่มีบน Windows */
}
process.on("exit", (code) => logLine("stop", "exit code " + code));

/* ---------- เสิร์ฟไฟล์นิ่ง ---------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".md":   "text/markdown; charset=utf-8"
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  if (rel.endsWith("/")) rel += "index.html";

  /* กันไม่ให้ไต่ออกนอกโฟลเดอร์โปรเจกต์ */
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("ไม่พบไฟล์ " + rel);
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(buf);
  });
});

/* ===========================================================
   WebSocket แบบเขียนเอง (RFC 6455 เฉพาะส่วนที่ใช้จริง)
   =========================================================== */

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptKey(key) {
  return crypto.createHash("sha1").update(key + GUID).digest("base64");
}

/* ประกอบเฟรมข้อความจากฝั่งเซิร์ฟเวอร์ (ไม่ต้อง mask) */
function encodeFrame(str) {
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let head;

  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x81; /* FIN + opcode text */
  return Buffer.concat([head, payload]);
}

/* แกะเฟรมที่ client ส่งมา (client ต้อง mask เสมอ) */
function decodeFrames(buf, onMessage, onClose, onPong) {
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;

    if (len === 126) {
      if (p + 2 > buf.length) break;
      len = buf.readUInt16BE(p); p += 2;
    } else if (len === 127) {
      if (p + 8 > buf.length) break;
      len = Number(buf.readBigUInt64BE(p)); p += 8;
    }

    let mask = null;
    if (masked) {
      if (p + 4 > buf.length) break;
      mask = buf.subarray(p, p + 4); p += 4;
    }
    if (p + len > buf.length) break; /* ยังมาไม่ครบ รอรอบหน้า */

    const data = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    p += len;

    if (opcode === 0x8) { onClose(); return buf.length; }
    if (opcode === 0x1) onMessage(data.toString("utf8"));
    if (opcode === 0xA && onPong) onPong();   /* ตอบ ping แล้ว = ยังมีชีวิตอยู่ */

    off = p;
  }
  return off;
}

/* ---------- ห้องเล่น ---------- */

let nextId = 1;
const rooms = new Map();   /* code -> { code, table, clients:Set, reaper } */

/* ตั้งคิวปิดห้องที่ไม่มีใครต่ออยู่ ต้องเรียกจากทุกทางที่ทำให้ห้องว่าง
   (โซเก็ตหลุด และกดปุ่มออกจากโต๊ะ) ไม่งั้นทางใดทางหนึ่งจะทิ้งห้องร้างไว้ตลอดกาล */
function scheduleReap(room) {
  log("ห้อง", room.code, "ไม่มีใครต่ออยู่ รอ", ROOM_GRACE_MIN, "นาทีก่อนปิด");
  clearTimeout(room.reaper);
  room.reaper = setTimeout(() => {
    if (room.clients.size === 0) {
      rooms.delete(room.code);
      log("ห้อง", room.code, "ไม่มีใครกลับมา ปิดห้องแล้ว");
      /* ต้องบอกหน้ารวมโต๊ะด้วย ไม่งั้นคนจะเห็นห้องที่ไม่มีอยู่แล้ว
         กดเข้าไปได้ห้องใหม่เอี่ยม พร้อมคำสัญญาเรื่องชิปเดิมที่ไม่มีจริง */
      pushLobby();
    }
  }, ROOM_GRACE_MIN * 60000);
}
const ROOM_GRACE_MIN = 10; /* ไม่มีใครต่ออยู่กี่นาทีถึงจะปิดห้อง */
const PING_MS = 15000;     /* เคาะถามทุกกี่มิลลิวินาที ว่าอีกฝั่งยังอยู่ไหม */
const lobby = new Set();   /* เครื่องที่ยังไม่ได้นั่งโต๊ะ รอดูรายการโต๊ะ */

/* รายการโต๊ะที่เปิดอยู่ ส่งให้หน้าเลือกโต๊ะ */
/* นาฬิกาของทุกโต๊ะเดินที่นี่ที่เดียว โมดูลโต๊ะเป็นตรรกะล้วน ไม่มีตัวจับเวลาของตัวเอง
   จะได้เทสต์ได้โดยไม่ต้องรอเวลาจริง */
setInterval(() => {
  for (const room of rooms.values()) {
    try { if (room.table.tick()) { persistNewHands(room); broadcastState(room); } }
    catch (e) { log("tick error", room.code, e && e.message); }
  }
}, 1000);

/* เก็บมือที่เพิ่งจบลงประวัติรายคน
   ต้องทำที่ชั้นนี้เพราะโมดูลโต๊ะไม่รู้จัก IP (มันเป็นตรรกะล้วน ไม่ยุ่งกับเน็ตเวิร์ก) */
function persistNewHands(room) {
  const all = room.table.history();
  if (all.length <= (room.savedHands || 0)) {
    /* ประวัติมีเพดาน 200 มือ ถ้าโดนตัดหัวทิ้ง ตัวนับต้องหดตาม ไม่งั้นจะเก็บซ้ำ */
    room.savedHands = Math.min(room.savedHands || 0, all.length);
    return;
  }
  /* แผนที่ ที่นั่ง -> IP จากคนที่ยังต่ออยู่ตอนนี้ · ชื่อ -> IP ไว้ใช้ตอนหาผู้ชนะ */
  const bySeat = {}, byName = {};
  for (const c of room.clients) {
    if (c.seatId == null || !c.playerKey) continue;
    bySeat[c.seatId] = c.playerKey;
    const seat = room.table._state.seats[c.seatId];
    if (seat) byName[seat.name] = c.playerKey;
  }
  const keyOf = (seatIdx, name) => {
    if (seatIdx >= 0 && bySeat[seatIdx]) return bySeat[seatIdx];
    if (name && byName[name]) return byName[name];
    /* คนที่หลุดไปแล้วไม่รู้ token จึงยึดชื่อไว้ก่อน ดีกว่าทิ้งข้อมูลไปเฉยๆ */
    return name ? "ชื่อ:" + name : "";
  };
  for (let i = room.savedHands || 0; i < all.length; i++) {
    try { store.recordHand(all[i], keyOf, all[i].at || Date.now()); }
    catch (e) { log("บันทึกประวัติไม่สำเร็จ", e && e.message); }
  }
  room.savedHands = all.length;
}

function roomList() {
  const out = [];
  for (const [code, room] of rooms) {
    const sum = room.table.summary();
    if (sum.players > 0) out.push({ code, ...sum });
  }
  return out.sort((a, b) => b.online - a.online);
}

/* รวบการอัปเดตล็อบบี้ ไม่ยิงทุกครั้งที่มีคนกดปุ่ม */
let lobbyTimer = null;
function schedulePushLobby() {
  if (lobbyTimer) return;
  lobbyTimer = setTimeout(function () { lobbyTimer = null; pushLobby(); }, 800);
}

/* ---------- ที่อยู่สำหรับส่งให้เพื่อน ----------
   ⚠️ หน้าจอเดาเองไม่ได้ เครื่องเจ้าภาพเปิดที่ localhost ซึ่งส่งให้ใครก็เข้าไม่ได้
   (บนเครื่องเพื่อน "localhost" หมายถึงเครื่องของเพื่อนเอง)
   ที่อยู่จริงในวง WiFi รู้ได้เฉพาะฝั่งเซิร์ฟเวอร์ จึงต้องส่งลงไปให้

   ⚠️ และต้องคิดใหม่ทุกครั้ง ห้ามจำไว้ตั้งแต่ตอนเปิดเซิร์ฟเวอร์
   ย้าย WiFi · ต่อสายแลน · เราเตอร์แจก IP ใหม่ — ที่อยู่เปลี่ยนได้ตลอดโดยไม่ต้องรีสตาร์ต
   ถ้าจำค่าเก่าไว้ ลิงก์ที่ส่งให้เพื่อนจะพาไปที่ที่ไม่มีอะไรอยู่แล้ว

   ตัดที่อยู่ของ WSL / Docker / VirtualBox ออก เพราะเครื่องอื่นในบ้านเข้าไม่ถึง */
function lanUrls() {
  const skip = /(wsl|docker|virtual|vmware|hyper-v|loopback|bluetooth)/i;
  return lanAddresses()
    .filter(a => !skip.test(a.name))
    /* ⚠️ ชี้ไปหน้ารวมเกม ไม่ใช่ตรงเข้าโต๊ะโป๊กเกอร์ (เจ้าของสั่ง)
       เพื่อนที่เปิดลิงก์มาจะได้เลือกเกมเองว่าจะเล่นอะไร ไม่ใช่ถูกลากเข้าโต๊ะทันที
       และลิงก์สั้นกว่า พิมพ์ตามเองได้ถ้าคัดลอกไม่ติด */
    .map(a => ({ name: a.name, url: "http://" + a.address + ":" + PORT + "/" }));
}

function pushLobby() {
  const list = roomList();
  const lan = lanUrls();
  for (const c of lobby) send(c, { type: "rooms", rooms: list, lan });
}

/* คอยดูว่าที่อยู่ในวงเปลี่ยนไหม เปลี่ยนเมื่อไหร่ก็ส่งลิงก์ใหม่ให้ทุกคนที่ยังไม่ได้นั่งโต๊ะ
   เช็คทุก 5 วินาที ราคาถูกมาก (อ่านจากระบบปฏิบัติการตรงๆ ไม่ได้ยิงเน็ต) */
let lastLanKey = "";
setInterval(() => {
  const key = lanUrls().map(a => a.url).join("|");
  if (key === lastLanKey) return;
  lastLanKey = key;
  log("ที่อยู่ในวงเปลี่ยน:", key || "(ไม่พบ)");
  pushLobby();
}, 5000);

function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    r = { code, table: createTable(), clients: new Set() };
    rooms.set(code, r);
  }
  return r;
}

function send(client, obj) {
  if (client.socket.destroyed) return;
  try { client.socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) { /* ตัดไปแล้ว */ }
}

/* ส่งสถานะให้ทุกคนในห้อง โดยแต่ละคนเห็นไพ่ของตัวเองเท่านั้น */
/* บอทของห้องนั้น สร้างครั้งเดียวตอนใช้ครั้งแรก */
function botsOf(room) {
  if (!room.bots) room.bots = createBotManager(room, () => broadcastState(room));
  return room.bots;
}

function broadcastState(room) {
  /* ทุกครั้งที่สถานะเปลี่ยน ให้บอทได้ดูว่าถึงตาตัวเองหรือยัง
     ต้องเรียกก่อนส่งออก ไม่งั้นบอทจะช้าไปหนึ่งจังหวะเสมอ */
  /* ⚠️ บั๊กในตัวบอทต้องไม่ล้มเซิร์ฟเวอร์ทั้งเครื่อง
     เกิดขึ้นจริงมาแล้ว: บอทเรียกฟังก์ชันด้วยไพ่ผิดชนิด (ตัวเลขแทนข้อความ)
     ข้อผิดพลาดโยนออกมานอก poke() แล้วโปรเซสตาย ทุกโต๊ะดับพร้อมกัน
     คนที่กำลังเล่นอยู่เจอ "เชื่อมต่อไม่ได้" ทันทีโดยไม่รู้ว่าเกิดอะไรขึ้น
     ดักไว้ตรงนี้: บอทพังก็แค่บอทตัวนั้นไม่เดิน คนยังเล่นกันต่อได้ */
  if (room.bots) {
    try { room.bots.poke(); }
    catch (e) { log("bot error", room.code, e && e.message); }
  }
  for (const c of room.clients) {
    const state = room.table.viewFor(c.seatId);
    /* บอทซื้อเข้าครั้งละเท่าไหร่ เป็นค่าของโต๊ะ ไม่ใช่ของคนกด
       ต้องส่งไปกับสถานะ ไม่งั้นเปิดหน้าใหม่หรือคนที่สองเข้ามา จะเห็นค่าที่ไม่ตรงกับของจริง */
    state.botBuyIn = room.bots ? room.bots.buyIn() : DEFAULT_BUY_IN;
    send(c, { type: "state", state: state });
  }
}

function log(...a) { console.log("  ", ...a); }

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n"
  );
  socket.setNoDelay(true);

  /* IP ใช้เป็นทางสำรองอย่างเดียว ตัวจริงคือ token ประจำเครื่อง (ดู playerKey ตอน join)
     ตัด ::ffff: ที่ Node เติมหน้า IPv4 ออก ไม่งั้นเครื่องเดียวจะกลายเป็นสองคน */
  let ip = "";
  try { ip = String(socket.remoteAddress || "").replace(/^::ffff:/, ""); } catch (e) {}
  const client = { id: nextId++, socket, room: null, seatId: null, alive: true,
                   ip: ip, playerKey: "" };
  lobby.add(client);

  /* โซเก็ตที่ตายแบบไม่ส่ง FIN (ปิด WiFi / แท็บถูกพักใน bfcache) จะค้างอยู่ตลอดกาล
     ทำให้โต๊ะรอคนที่ไม่มีวันกลับมา และห้องไม่มีวันถูกเก็บกวาด
     จึงต้องเคาะถามเป็นระยะ ไม่ตอบสองรอบติดถือว่าตายแล้ว */
  const ping = setInterval(() => {
    if (!client.alive) { log("ไม่ตอบ ping ตัดการเชื่อมต่อ #" + client.id); cleanup(); return; }
    client.alive = false;
    try { socket.write(Buffer.from([0x89, 0x00])); } catch (e) { cleanup(); }
  }, PING_MS);
  let buf = Buffer.alloc(0);

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;   /* error + close ยิงซ้อนกันได้ */
    cleaned = true;
    clearInterval(ping);
    lobby.delete(client);
    if (client.room) {
      client.room.clients.delete(client);
      client.room.table.disconnect(client.seatId);
      if (client.room.clients.size === 0 && client.room.bots) {
        client.room.bots.stop(); client.room.bots.removeAll();
      }
      if (client.room.clients.size === 0) scheduleReap(client.room);
      else broadcastState(client.room);
      client.room = null;
    }
    pushLobby();
    socket.destroy();
  }

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const used = decodeFrames(buf, handle, cleanup, function () { client.alive = true; });
    buf = buf.subarray(used);
  });
  socket.on("error", cleanup);
  socket.on("close", cleanup);

  function handle(text) {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }

    /* หน้าเลือกโต๊ะขอรายการโต๊ะที่เปิดอยู่ */
    if (msg.type === "lobby") {
      send(client, { type: "rooms", rooms: roomList(), lan: lanUrls() });
      return;
    }

    /* เงินติดตัวบอททุกตัว ขอได้จากหน้าก่อนเข้าเกม ไม่ต้องนั่งโต๊ะก่อน
       ⚠️ ตอบได้โดยไม่ต้องมีที่นั่ง เพราะเป็นข้อมูลของทั้งเซิร์ฟเวอร์ ไม่ใช่ของโต๊ะไหน */
    if (msg.type === "botbank") {
      send(client, { type: "botbank", bots: botBank.all() });
      return;
    }

    /* ประวัติสะสมรายคน ขอได้ตั้งแต่หน้าก่อนเข้าเกม เหมือนตารางเงินบอท
       ⚠️ อยู่เหนือ "ต้องนั่งโต๊ะก่อน" ตั้งใจ — มันเป็นข้อมูลของทั้งเครื่อง ไม่ใช่ของโต๊ะไหน
       และคำถามที่คนถามบ่อยที่สุด ("คืนนี้ใครนำ / เมื่อวานใครเก็บไปเท่าไหร่")
       เป็นคำถามที่เกิดตอนยังไม่ได้นั่ง ไม่ใช่ตอนกำลังถือไพ่อยู่ */
    if (msg.type === "profiles") {
      /* นั่งอยู่แล้ว = เขียนมือที่เพิ่งเล่นลงไฟล์ก่อน ตัวเลขจะได้เป็นของล่าสุดจริง */
      if (client.room) persistNewHands(client.room);
      /* ยังไม่ได้นั่ง จึงยังไม่มี playerKey — คิดจาก token ด้วยวิธีเดียวกับตอน join
         (ทำไมต้องแปลงก่อน ไม่ส่ง token ดิบไปไหน: ดูเหตุผลยาว ๆ ที่ join) */
      let me = client.playerKey;
      if (!me) {
        const tok = String(msg.token || "").slice(0, 64);
        me = tok ? ("tok:" + fingerprint(tok)) : (client.ip ? "ip:" + client.ip : "");
      }
      send(client, { type: "profiles", players: store.profiles(), me: me });
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.room || "").toUpperCase().slice(0, 8) || "HOME";
      const room = getRoom(code);
      clearTimeout(room.reaper);   /* มีคนกลับมาแล้ว ยกเลิกคิวปิดห้อง */

      /* ต้องนั่งให้สำเร็จก่อน ค่อยตัดจากโต๊ะเดิม
         ไม่งั้นขอที่นั่งที่มีคนอยู่แล้วพลาด จะหลุดจากโต๊ะที่นั่งอยู่ดีๆ ไปเลย */
      const r = room.table.sit(String(msg.name || "").slice(0, 16), msg.seatId, msg.buyIn, msg.token);
      if (!r.ok) { send(client, { type: "error", message: r.error }); return; }

      /* ออกจากห้องเดิมให้ขาด ไม่งั้นห้องเดิมยังยิง state มาให้
         โดยใช้เลขที่นั่งของห้องใหม่ = เห็นไพ่ในมือคนอื่น */
      if (client.room && client.room !== room) {
        const old = client.room;
        old.clients.delete(client);
        old.table.disconnect(client.seatId);
        broadcastState(old);
      }

      /* คีย์ประวัติรายคน = token ที่เครื่องนั้นเก็บไว้เอง
         ดีกว่า IP เพราะย้าย WiFi หรือเราเตอร์แจก IP ใหม่แล้วยังเป็นคนเดิม
         ถ้าเบราว์เซอร์เก็บ localStorage ไม่ได้ (โหมดส่วนตัว) จะไม่มี token ส่งมา
         จึงถอยไปใช้ IP ไว้ก่อน ดีกว่าไม่เก็บอะไรเลย
         ตัดความยาวกันไว้ ไม่ควรเชื่อความยาวของอะไรที่ส่งมาจากเครื่องอื่น */
      const tok = String(msg.token || "").slice(0, 64);
      /* ⚠️ ห้ามใช้ token ดิบเป็นรหัสประจำตัวที่ส่งออกไป
         รหัสนี้ไปโผล่ใน profiles ซึ่งใครที่นั่งอยู่ก็ขอดูได้ทั้งตาราง
         แล้ว token คือกุญแจของที่นั่ง — ใครเอาไปใส่ตอน join ก็ยึดที่นั่งคนนั้นได้ทันที
         พร้อมเห็นไพ่ในมือเขา (ทดสอบแล้วยึดได้จริงและได้ไพ่จริง)
         แปลงเป็นรอยนิ้วมือทางเดียวก่อน ใช้แยกคนได้เหมือนเดิม แต่ย้อนกลับไม่ได้ */
      client.playerKey = tok ? ("tok:" + fingerprint(tok))
                             : (client.ip ? "ip:" + client.ip : "");

      /* ⚠️ เครื่องเดิมกลับมาทับที่นั่งเดิม ต้องตัดโซเก็ตเก่าออกจากที่นั่งนั้นด้วย
         ไม่งั้นสองหน้าต่างจากเครื่องเดียวกันจะสั่งการที่นั่งเดียวกันพร้อมกัน
         และหน้าเก่าจะยังเห็นไพ่ในมือของที่นั่งนั้นอยู่ */
      for (const other of room.clients) {
        if (other === client || other.seatId !== r.seatId) continue;
        other.seatId = null;
        room.clients.delete(other);
        lobby.add(other);
        send(other, { type: "replaced",
                      message: "เปิดเกมนี้จากเครื่องเดิมที่หน้าอื่นแล้ว หน้านี้จึงออกจากโต๊ะ" });
      }

      client.room = room;
      room.clients.add(client);
      client.seatId = r.seatId;
      send(client, { type: "joined", seatId: r.seatId, room: code, stack: r.stack });
      log("เข้าห้อง", code, "->", r.name, "(ที่นั่ง " + r.seatId + ")");
      lobby.delete(client);
      broadcastState(room);
      pushLobby();
      return;
    }

    if (!client.room) return;

    /* เพิ่ม/เอาบอทออก ใช้ซ้อมตอนยังไม่มีคนมาเล่นด้วย */
    if (msg.type === "addbot") {
      const n = Math.max(0, Math.min(8, Math.floor(Number(msg.count)) || 0));
      const lv = Math.max(1, Math.min(3, Math.floor(Number(msg.level)) || 2));
      const bots = botsOf(client.room);
      /* ตั้งว่าบอทจะซื้อเข้าครั้งละเท่าไหร่ ส่งมาพร้อมปุ่มเรียกบอท
         มีผลกับตัวที่เรียกตอนนี้และการเติมชิปครั้งต่อไป ไม่ไปแก้ชิปของตัวที่นั่งอยู่แล้ว
         (เสกชิปเข้ากองของคนที่กำลังเล่นอยู่ = เปลี่ยนผลของมือที่ค้างอยู่) */
      if (msg.buyIn !== undefined) {
        const eff = bots.setBuyIn(msg.buyIn);
        log("ห้อง", client.room.code, "ตั้งบายอินบอทเป็น", eff);
        /* ⚠️ ตั้งค่าอย่างเดียวต้องจบตรงนี้ ห้ามตกไปข้างล่าง
           ข้างล่างอ่าน count ที่ไม่ได้ส่งมาเป็น 0 ซึ่งแปลว่า "เอาบอทออกให้หมด"
           = เลื่อนตัวเลขเล่น ๆ แล้วบอททั้งโต๊ะหายไปกลางวง */
        if (msg.count === undefined) { broadcastState(client.room); return; }
      }
      if (n === 0) {
        bots.removeAll();
        log("ห้อง", client.room.code, "เอาบอทออกหมด");
      } else {
        const r = bots.add(n, lv);
        log("ห้อง", client.room.code, "เพิ่มบอท", r.added.length, "ตัว ระดับ", r.levelName);
        /* ⚠️ ต้องบอกด้วยเมื่อเรียกไม่ครบ ไม่งั้นคนกดเห็นแค่ "ไม่มีอะไรเกิดขึ้น" แล้วกดซ้ำ
           บอทหนึ่งตัวนั่งได้ทีละโต๊ะเดียว (กระเป๋าเงินผูกกับชื่อ) ระดับหนึ่งมี 10 ตัว
           ถ้าไปนั่งโต๊ะอื่นกันหมด ก็ต้องรอ ไม่ใช่เสกตัวใหม่ขึ้นมา */
        if (!r.added.length && !r.busy) {
          /* เต็มโต๊ะ (หรือไม่มีช่องว่างเหลือ) ก็ต้องบอก ไม่ใช่เงียบแล้วให้กดซ้ำ */
          send(client, { type: "error", message: "โต๊ะเต็มแล้ว ไม่มีช่องให้บอทนั่ง" });
        }
        if (r.busy) {
          /* ⚠️ "เจ๊งจนเลิกเล่นแล้ว" ต้องบอกแยกจาก "ไปนั่งโต๊ะอื่น"
             อันแรกรอไปก็ไม่กลับมา อันหลังเดี๋ยวก็ว่าง — คนกดต้องรู้ว่าควรรอหรือไม่ควรรอ */
          send(client, { type: "error", message:
            "บอทระดับ" + r.levelName + "ไม่ว่างแล้ว (" + r.inUse + "/" + r.roster +
            " ตัวกำลังนั่งโต๊ะอื่นอยู่" +
            (r.retired ? " · เจ๊งเลิกเล่นถาวรไปแล้ว " + r.retired + " ตัว" : "") + ")" +
            (r.added.length ? " เพิ่มให้ได้ " + r.added.length + " ตัว" : "") });
        }
      }
      broadcastState(client.room);
      pushLobby();
      return;
    }

    /* ล้างสถิติสะสม — เฉพาะคนที่เปิดโต๊ะ เพราะมันกระทบข้อมูลของทุกคนบนเครื่องนี้
       ไฟล์เดิมถูกเก็บไว้ ไม่ได้ลบทิ้ง (ดู clearProfiles) */
    if (msg.type === "clearstats") {
      const st = client.room && client.room.table._state;
      if (st && st.hostSeat !== null && st.hostSeat !== client.seatId) {
        send(client, { type: "error", message: "เฉพาะคนที่เปิดโต๊ะเท่านั้นที่ล้างสถิติได้" });
        return;
      }
      store.clearProfiles(Date.now());
      log("ล้างสถิติสะสมแล้ว (ไฟล์เดิมเก็บไว้)");
      send(client, { type: "profiles", players: store.profiles(), me: client.playerKey });
      send(client, { type: "error", message: "ล้างสถิติสะสมแล้ว (ไฟล์เดิมเก็บไว้ในเครื่อง)" });
      return;
    }

    /* ประวัติมือ ส่งเฉพาะตอนมีคนขอ ไม่แนบไปกับ state ทุกครั้ง */
    if (msg.type === "history") {
      send(client, { type: "history", hands: client.room.table.history() });
      return;
    }

    /* ย้ายที่นั่งบนโต๊ะเดิม ต้องทำที่ชั้นนี้ ไม่ใช่ใน table.action
       เพราะเลขที่นั่งของ client เก็บอยู่ตรงนี้ ถ้าโต๊ะย้ายแต่ client ยังถือเลขเดิม
       คนคนนั้นจะสั่งการแทนช่องเก่า และเห็นไพ่ในมือของคนที่มานั่งช่องนั้นทีหลัง */
    if (msg.type === "moveseat") {
      const room = client.room;
      const r = room.table.moveSeat(client.seatId, msg.seatId);
      if (r.error) { send(client, { type: "error", message: r.error }); return; }
      client.seatId = r.seatId;
      send(client, { type: "joined", seatId: r.seatId, room: room.code });
      broadcastState(room);
      pushLobby();
      return;
    }

    /* ลุกจากโต๊ะเอง ต้องปล่อยที่นั่งจริง ไม่ใช่ทิ้งให้ค้างเหมือนเน็ตหลุด
       ไม่งั้นคนที่เหลือจะรอตาของคนที่เดินออกไปแล้วตลอดกาล */
    if (msg.type === "leave") {
      const room = client.room;
      room.clients.delete(client);
      room.table.leave(client.seatId);
      client.room = null;
      client.seatId = null;
      lobby.add(client);
      /* คนสุดท้ายลุกออกไปแล้ว ต้องตั้งคิวปิดห้องด้วย
         ไม่งั้นห้องร้างจะค้างในรายการตลอดกาล (เดิมตั้งคิวไว้เฉพาะตอนโซเก็ตหลุด) */
      /* คนจริงออกหมดแล้ว บอทต้องหยุดด้วย ไม่งั้นมันเล่นกันเองในห้องร้างไปเรื่อยๆ */
    if (room.clients.size === 0 && room.bots) { room.bots.stop(); room.bots.removeAll(); }
    if (room.clients.size === 0) scheduleReap(room);
      else broadcastState(room);
      pushLobby();
      send(client, { type: "left" });
      return;
    }

    const out = client.room.table.action(client.seatId, msg);
    if (out && out.error) send(client, { type: "error", message: out.error });
    persistNewHands(client.room);
    broadcastState(client.room);
    schedulePushLobby();
  }
});

/* ---------- เริ่มทำงาน ---------- */

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name in nets) {
    for (const a of nets[name]) {
      if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

server.listen(PORT, () => {
  const addrs = lanAddresses();
  console.log("");
  console.log("  ก๊วนบอร์ดเกม — เปิดให้เล่นหลายเครื่องแล้ว");
  console.log("  ------------------------------------------------");
  console.log("  เครื่องนี้เปิดที่   http://localhost:" + PORT);
  if (addrs.length) {
    console.log("");
    console.log("  เครื่องอื่นในวง WiFi เดียวกัน เปิดที่นี่:");
    for (const a of addrs) console.log("     http://" + a.address + ":" + PORT + "   (" + a.name + ")");
  } else {
    console.log("  ** ไม่พบเน็ตเวิร์ก LAN ต่อ WiFi ก่อนแล้วรันใหม่ **");
  }
  console.log("");
  console.log("  โป๊กเกอร์อยู่ที่ /games/poker/");
  console.log("  กด Ctrl+C เพื่อปิด");
  console.log("");
});
