/* เทสต์ดักบั๊ก: เงินที่ยังไม่มีใครตาม ถูกเอาไปหารแบ่งแทนที่จะคืนเจ้าของ
   รันด้วย: node lan/tests/test-uncalled.mjs */
import { returnUncalled, buildPots, settlePots, evaluate7 } from '../poker-engine.mjs';
let fail=0;
const ok=(c,m)=>{ if(!c){fail++;console.log('  FAIL: '+m);} else console.log('  ok  : '+m); };

console.log('--- เงินที่ไม่มีใครตาม ต้องคืนเจ้าของเต็มจำนวน ---');
// เคสจริงที่ agent เจอ: เดิมพัน 2000 คู่แข่งลงแค่ 20 แล้วหลุด
let players=[{id:0,contributed:2000,folded:false},{id:1,contributed:20,folded:true}];
let back=returnUncalled(players);
ok(back && back.id===0 && back.amount===1980, 'คืน 1980 ให้คนที่เดิมพัน (ได้ '+JSON.stringify(back)+')');
ok(players[0].contributed===20, 'เหลือลงกองแค่ 20 เท่าที่มีคนตาม');

let pots=buildPots(players);
let scores={};                       // ไม่มีใครเหลือ (คนเดียวที่ไม่หมอบคือ id 0)
scores[0]=evaluate7([0,4,8,12,16,20,24]);
let won=settlePots(pots,scores,{0:20,1:20});
const gain0 = (back.amount) + (won[0]||0);
ok(gain0===1980+40, 'คนที่เดิมพันได้คืน 1980 + กอง 40 = '+gain0);
ok(!won[1], 'คนที่หมอบไม่ได้อะไร');

console.log('\n--- เคสบอด 10/1000 ที่ agent เจอ ---');
players=[{id:0,contributed:1000,folded:false},{id:1,contributed:10,folded:true}];
back=returnUncalled(players);
ok(back.amount===990 && back.id===0, 'คืน 990 ให้บิ๊กบลายด์ (ได้ '+back.amount+')');

console.log('\n--- ตามเท่ากัน ต้องไม่คืนอะไร ---');
players=[{id:0,contributed:500,folded:false},{id:1,contributed:500,folded:false}];
ok(returnUncalled(players)===null, 'ลงเท่ากัน ไม่มีเงินเหลือคืน');

console.log('\n--- all-in หลายชั้น ต้องคืนเฉพาะส่วนที่เกินคนที่สอง ---');
players=[{id:0,contributed:5000,folded:false},{id:1,contributed:1000,folded:false},{id:2,contributed:300,folded:false}];
back=returnUncalled(players);
ok(back.amount===4000 && back.id===0, 'คืน 4000 (5000-1000) ให้คนกองใหญ่สุด (ได้ '+back.amount+')');
pots=buildPots(players);
const total=pots.reduce((a,p)=>a+p.amount,0);
ok(total===300*3+700*2, 'กองที่เหลือ = 900 + 1400 = '+total);

console.log('\n--- ชิปต้องไม่งอกไม่หายในทุกกรณี ---');
let allOk=true;
for(let t=0;t<400;t++){
  const n=2+Math.floor(Math.random()*4);
  const ps=[]; let paid=0;
  for(let i=0;i<n;i++){ const c=Math.floor(Math.random()*1000); paid+=c;
    ps.push({id:i,contributed:c,folded:Math.random()<0.4}); }
  const before=paid;
  const b=returnUncalled(ps);
  const po=buildPots(ps);
  const sc={}; ps.forEach(p=>{ if(!p.folded) sc[p.id]=[Math.floor(Math.random()*9)]; });
  const w=settlePots(po,sc,{});
  const out=(b?b.amount:0)+Object.values(w).reduce((a,x)=>a+x,0);
  if(out!==before){ allOk=false; console.log('    เพี้ยน: ลง '+before+' จ่ายออก '+out); break; }
}
ok(allOk,'สุ่ม 400 เคส เงินเข้า = เงินออก เสมอ');

console.log(fail===0?'\n=== ผ่านทั้งหมด ===':'\n=== ตก '+fail+' ข้อ ===');
process.exit(fail?1:0);
