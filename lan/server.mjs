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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);

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
    try { if (room.table.tick()) broadcastState(room); }
    catch (e) { log("tick error", room.code, e && e.message); }
  }
}, 1000);

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

function pushLobby() {
  const list = roomList();
  for (const c of lobby) send(c, { type: "rooms", rooms: list });
}

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
function broadcastState(room) {
  for (const c of room.clients) {
    send(c, { type: "state", state: room.table.viewFor(c.seatId) });
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

  const client = { id: nextId++, socket, room: null, seatId: null, alive: true };
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
      send(client, { type: "rooms", rooms: roomList() });
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
      if (room.clients.size === 0) scheduleReap(room);
      else broadcastState(room);
      pushLobby();
      send(client, { type: "left" });
      return;
    }

    const out = client.room.table.action(client.seatId, msg);
    if (out && out.error) send(client, { type: "error", message: out.error });
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
