/* เทสต์ที่เก็บประวัติรายคน — เน้นเรื่องที่พังแล้วเจ็บ: นับซ้ำ นับข้ามคน และเงินเพี้ยน
   รัน: node lan/tests/test-history.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as store from "../history-store.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bg-hist-"));
store._setDir(tmp);

let fail = 0;
function ok(cond, label, got) {
  if (cond) console.log("  ok  : " + label + (got !== undefined ? " (ได้ " + JSON.stringify(got) + ")" : ""));
  else { fail++; console.log("  FAIL: " + label + " -> " + JSON.stringify(got)); }
}
function head(t) { console.log("\n--- " + t + " ---"); }

const hand = {
  no: 1, sb: 10, bb: 20,
  players: [{ name: "เอ", stack: 1000 }, { name: "บี", stack: 1000 }],
  acts: [
    { phase: "preflop", seat: 0, name: "เอ", act: "call",  amount: 10, think: 1.2 },
    { phase: "preflop", seat: 1, name: "บี", act: "check", amount: 0,  think: 0.4 },
    { phase: "flop",    seat: 1, name: "บี", act: "raise", amount: 60, think: 3.0 },
    { phase: "flop",    seat: 0, name: "เอ", act: "fold",  amount: 0,  think: 2.0 }
  ],
  board: ["Ah", "Kd", "7c"],
  result: { showdown: false, payouts: [{ name: "บี", amount: 90 }], reveal: [] }
};

/* IP ต่างกัน = คนละคน */
const keyOf = (seat, name) => (seat === 0 || name === "เอ") ? "10.0.0.1" : "10.0.0.2";

head("บันทึกมือแรก");
store.recordHand(hand, keyOf, 1000);
let ps = store.profiles();
ok(ps.length === 2, "แยกเป็นสองคนตาม IP", ps.length);
const a = ps.filter(p => p.key === "10.0.0.1")[0];
const b = ps.filter(p => p.key === "10.0.0.2")[0];
ok(a.hands === 1 && b.hands === 1, "นับคนละหนึ่งมือ ไม่ใช่หนึ่งครั้งต่อการลงมือ",
   { a: a.hands, b: b.hands });
ok(a.acts.call === 1 && a.acts.fold === 1, "นับท่าของ เอ ถูก", a.acts);
ok(b.acts.check === 1 && b.acts.raise === 1, "นับท่าของ บี ถูก", b.acts);
ok(b.net === 90 && a.net === 0, "เงินเข้าเฉพาะคนที่ชนะ", { a: a.net, b: b.net });
ok(b.won === 1 && a.won === 0, "นับจำนวนครั้งที่ชนะถูก", { a: a.won, b: b.won });
ok(a.vpip === 100 && b.vpip === 0, "เอ ลงเงินเองในพรีฟลอป · บี แค่เคาะ", { a: a.vpip, b: b.vpip });
ok(Math.abs(a.avgThink - 1.6) < 0.05, "เวลาคิดเฉลี่ยของ เอ = (1.2+2.0)/2", a.avgThink);
ok(a.names.indexOf("เอ") >= 0 && b.names.indexOf("บี") >= 0, "จำชื่อที่เคยใช้จากเครื่องนั้น",
   { a: a.names, b: b.names });

head("บันทึกมือที่สอง ต้องสะสม ไม่ใช่ทับ");
store.recordHand(hand, keyOf, 2000);
ps = store.profiles();
const a2 = ps.filter(p => p.key === "10.0.0.1")[0];
ok(a2.hands === 2, "สองมือแล้ว", a2.hands);
ok(a2.acts.call === 2, "ท่าสะสมต่อเนื่อง", a2.acts.call);

head("คนเดิมเปลี่ยนชื่อ ต้องยังเป็นคนเดียวกัน (IP เดิม = คนเดิม)");
const hand2 = JSON.parse(JSON.stringify(hand));
hand2.acts.forEach(x => { if (x.name === "เอ") x.name = "โบ๊ท"; });
hand2.result.payouts = [{ name: "บี", amount: 50 }];
store.recordHand(hand2, (seat, name) => (seat === 0 || name === "เอ" || name === "โบ๊ท") ? "10.0.0.1" : "10.0.0.2", 3000);
ps = store.profiles();
ok(ps.length === 2, "ยังเป็นสองคนเท่าเดิม ไม่แตกเป็นสาม", ps.length);
const a3 = ps.filter(p => p.key === "10.0.0.1")[0];
ok(a3.names.length === 2, "เก็บทั้งสองชื่อไว้ที่คนเดียวกัน", a3.names);

head("เขียนลงดิสก์แล้วอ่านกลับได้");
store.save();
ok(fs.existsSync(path.join(tmp, "players.json")), "ไฟล์ถูกสร้าง");
store._setDir(tmp);
store.load();
const back = store.profiles();
ok(back.length === 2, "โหลดกลับมาได้ครบ", back.length);
ok(back.filter(p => p.key === "10.0.0.2")[0].net === 230, "ยอดเงินสะสมตรง",
   back.filter(p => p.key === "10.0.0.2")[0].net);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
console.log(fail === 0 ? "\n=== ผ่านทั้งหมด ===" : "\n=== พัง " + fail + " ข้อ ===");
process.exit(fail ? 1 : 0);
