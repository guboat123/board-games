/* เทสต์การแบ่งกองตอนเสมอกัน และกองรอง (side pot)
   เกิดยากมากตอนเล่นจริง จึงต้องบังคับให้เกิดในเทสต์ ไม่ใช่รอโชค
   สิ่งที่ต้องจริงเสมอ: เงินที่จ่ายออก = เงินในกองเป๊ะ ไม่ขาดไม่เกินแม้แต่ชิปเดียว
   รัน: node lan/tests/test-split.mjs */
import { buildPots, settlePots, compareScore } from "../poker-engine.mjs";

let fail = 0;
function ok(cond, label, got) {
  if (cond) console.log("  ok  : " + label + (got !== undefined ? " (ได้ " + JSON.stringify(got) + ")" : ""));
  else { fail++; console.log("  FAIL: " + label + " -> " + JSON.stringify(got)); }
}
function head(t) { console.log("\n--- " + t + " ---"); }

const sum = o => Object.keys(o).reduce((a, k) => a + o[k], 0);
const potTotal = ps => ps.reduce((a, p) => a + p.amount, 0);

/* --------------------------------------------------------------- */
head("เสมอกันสองคน หารครึ่ง");
{
  const players = [
    { id: 0, contributed: 100, folded: false },
    { id: 1, contributed: 100, folded: false }
  ];
  const pots = buildPots(players);
  /* คะแนนเท่ากันเป๊ะ = เสมอ */
  const won = settlePots(pots, { 0: [4, 8], 1: [4, 8] });
  ok(won[0] === 100 && won[1] === 100, "แบ่งคนละครึ่ง", won);
  ok(sum(won) === potTotal(pots), "จ่ายออกเท่ากับกองพอดี", { จ่าย: sum(won), กอง: potTotal(pots) });
}

/* --------------------------------------------------------------- */
head("เสมอกันสามคน กองหารไม่ลงตัว");
{
  const players = [
    { id: 0, contributed: 34, folded: false },
    { id: 1, contributed: 34, folded: false },
    { id: 2, contributed: 34, folded: false }
  ];
  const pots = buildPots(players);
  const won = settlePots(pots, { 0: [2, 9, 5, 3], 1: [2, 9, 5, 3], 2: [2, 9, 5, 3] });
  ok(sum(won) === 102, "เงินรวมที่จ่ายออกต้องเท่ากอง 102 เป๊ะ ไม่หายไปกับการปัดเศษ", sum(won));
  const vals = [won[0], won[1], won[2]].sort((a, b) => b - a);
  ok(vals[0] - vals[2] <= 1, "ต่างกันได้ไม่เกิน 1 ชิป", vals);
}

/* --------------------------------------------------------------- */
head("กองรอง: คนหมดตัวก่อน ชนะได้แค่กองที่ตัวเองมีสิทธิ์");
{
  /* คนที่ 2 ลงได้แค่ 50 แล้วหมดตัก อีกสองคนสู้กันต่อถึง 300
     กองหลัก 150 (50 x 3) ทุกคนมีสิทธิ์ · กองรอง 500 เฉพาะสองคนที่เหลือ */
  const players = [
    { id: 0, contributed: 300, folded: false },
    { id: 1, contributed: 300, folded: false },
    { id: 2, contributed: 50,  folded: false }
  ];
  const pots = buildPots(players);
  ok(pots.length === 2, "ต้องแตกเป็นสองกอง", pots.map(p => p.amount));
  ok(pots[0].amount === 150 && pots[0].eligible.length === 3, "กองหลัก 150 ทุกคนมีสิทธิ์", pots[0]);
  ok(pots[1].amount === 500 && pots[1].eligible.length === 2, "กองรอง 500 เฉพาะสองคนที่ยังสู้ต่อ", pots[1]);

  /* คนหมดตัวไพ่ดีที่สุด: ได้กองหลักอย่างเดียว กองรองต้องไปหาคนที่ไพ่ดีสุดในสองคนที่เหลือ */
  const won = settlePots(pots, { 0: [3, 5], 1: [1, 9], 2: [8, 6] });
  ok(won[2] === 150, "คนหมดตัวไพ่ดีสุด ได้เฉพาะกองหลัก 150", won[2]);
  ok(won[0] === 500, "กองรองไปหาคนไพ่ดีสุดในสองคนที่เหลือ", won[0]);
  ok(won[1] === undefined || won[1] === 0, "คนไพ่แย่สุดไม่ได้อะไร", won[1]);
  ok(sum(won) === potTotal(pots), "จ่ายออก = กองรวม", { จ่าย: sum(won), กอง: potTotal(pots) });
}

/* --------------------------------------------------------------- */
head("กองรอง + เสมอกันในกองรอง");
{
  const players = [
    { id: 0, contributed: 200, folded: false },
    { id: 1, contributed: 200, folded: false },
    { id: 2, contributed: 60,  folded: false }
  ];
  const pots = buildPots(players);
  /* สองคนใหญ่เสมอกัน คนเล็กไพ่แย่สุด */
  const won = settlePots(pots, { 0: [5, 12], 1: [5, 12], 2: [0, 7] });
  ok(sum(won) === potTotal(pots), "จ่ายออก = กองรวม", { จ่าย: sum(won), กอง: potTotal(pots) });
  ok(won[0] === won[1], "สองคนที่เสมอกันได้เท่ากัน", { a: won[0], b: won[1] });
  ok(!won[2], "คนหมดตัวไพ่แย่สุด ไม่ได้อะไรเลย", won[2]);
}

/* --------------------------------------------------------------- */
head("สามชั้น: หมดตัวคนละจำนวนสามคน (แบบมือที่ 8 ที่บอทเล่นจริง)");
{
  const players = [
    { id: 0, contributed: 2524, folded: false },
    { id: 1, contributed: 1889, folded: false },
    { id: 2, contributed: 2000, folded: false },
    { id: 3, contributed: 2524, folded: false }
  ];
  const pots = buildPots(players);
  ok(pots.length >= 3, "ต้องแตกเป็นอย่างน้อยสามชั้น", pots.map(p => p.amount));
  const scores = { 0: [2, 12, 9], 1: [3, 9], 2: [2, 9, 1], 3: [6, 9, 10] };
  const won = settlePots(pots, scores);
  ok(sum(won) === potTotal(pots), "จ่ายออก = กองรวมเป๊ะ", { จ่าย: sum(won), กอง: potTotal(pots) });
  ok(won[3] === potTotal(pots), "คนไพ่ดีสุดและลงเยอะสุด ได้ทั้งหมด", won[3]);
}

/* --------------------------------------------------------------- */
head("สุ่ม 500 เคส เงินต้องไม่งอกไม่หาย");
{
  let bad = 0, splits = 0, sides = 0;
  for (let t = 0; t < 500; t++) {
    const n = 2 + Math.floor(Math.random() * 4);
    const players = [];
    for (let i = 0; i < n; i++) {
      players.push({ id: i, contributed: 10 + Math.floor(Math.random() * 900), folded: Math.random() < 0.2 });
    }
    if (players.every(p => p.folded)) players[0].folded = false;
    const pots = buildPots(players);
    if (pots.length > 1) sides++;
    /* บังคับให้เสมอบ่อยๆ โดยใช้คะแนนจากชุดแคบ */
    const scores = {};
    players.filter(p => !p.folded).forEach(p => { scores[p.id] = [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)]; });
    const won = settlePots(pots, scores);
    const paid = sum(won), inPot = potTotal(pots);
    if (paid !== inPot) { bad++; if (bad < 3) console.log("    เพี้ยน:", { paid, inPot, players, pots }); }
    const winnersPerPot = pots.map(p => p.eligible.filter(id => scores[id]).length);
    if (winnersPerPot.some(x => x > 1)) splits++;
  }
  ok(bad === 0, "สุ่ม 500 เคส จ่ายออก = กองรวมทุกครั้ง (มีกองรอง " + sides + " เคส)", bad);
}

console.log(fail === 0 ? "\n=== ผ่านทั้งหมด ===" : "\n=== พัง " + fail + " ข้อ ===");
process.exit(fail ? 1 : 0);
