/* เทสต์ดักบั๊กที่เคยเจอจริง รันด้วย: node lan/tests/test-payout.mjs
   1) best เป็น falsy ทำให้ที่นั่ง 0 ไม่เคยชนะกอง
   2) กองที่ไม่มีใครเหลือ เงินหายทั้งกอง */
import { evaluate7, settlePots, buildPots } from '../poker-engine.mjs';
let fail=0;
const ok=(c,m)=>{ if(!c){fail++;console.log('  FAIL: '+m);} else console.log('  ok  : '+m); };
const R={'2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12};
const S={s:0,h:1,c:2,d:3};
const C=str=>str.split(' ').map(t=>R[t[0]]*4+S[t[1]]);

console.log('--- บั๊ก: ที่นั่ง 0 ไม่เคยชนะ (best เป็น falsy) ---');
const strong = evaluate7(C('As Ks Qs Js Ts 2c 3d'));  // สเตรทฟลัช
const weak   = evaluate7(C('9s 7h 5c 2d 3s Jh 4c'));  // ไฮการ์ด

let won = settlePots([{amount:1000, eligible:[0,1]}], {0:strong, 1:weak});
ok(won[0]===1000 && !won[1], 'ที่นั่ง 0 ไพ่ดีสุด ต้องได้ทั้งกอง (ได้ '+JSON.stringify(won)+')');

won = settlePots([{amount:1000, eligible:[0,1,2]}], {0:strong, 1:weak, 2:evaluate7(C('9s 9h 5c 2d 3s 7h 4c'))});
ok(won[0]===1000, 'ที่นั่ง 0 ชนะได้แม้มี 3 คน (ได้ '+JSON.stringify(won)+')');

won = settlePots([{amount:1000, eligible:[1,2]}], {1:strong, 2:weak});
ok(won[1]===1000, 'ที่นั่งอื่นยังทำงานเหมือนเดิม');

// เทียบทุกที่นั่ง 0-8 ว่าคนไพ่ดีสุดชนะเสมอ
let allOk=true;
for(let seat=0; seat<9; seat++){
  const sc={}; const elig=[];
  for(let i=0;i<9;i++){ elig.push(i); sc[i] = (i===seat) ? strong : weak; }
  const w = settlePots([{amount:900, eligible:elig}], sc);
  if(w[seat]!==900){ allOk=false; console.log('    ที่นั่ง '+seat+' ไพ่ดีสุดแต่ไม่ได้เงิน: '+JSON.stringify(w)); }
}
ok(allOk, 'ไล่ทุกที่นั่ง 0-8 คนไพ่ดีสุดได้เงินเสมอ');

console.log('\n--- บั๊ก: กองที่ไม่มีใครเหลือ ต้องคืนเงิน ไม่ใช่ทำหาย ---');
const pots = buildPots([
  {id:0, contributed:400, folded:true},
  {id:1, contributed:400, folded:true},
]);
const total = pots.reduce((a,p)=>a+p.amount,0);
won = settlePots(pots, {}, {0:400, 1:400});
const paid = Object.values(won).reduce((a,b)=>a+b,0);
ok(paid===total, 'ทุกคนหมอบหมด เงินคืนครบ ไม่หาย ('+paid+'/'+total+')');

console.log(fail===0 ? '\n=== ผ่านทั้งหมด ===' : '\n=== ตก '+fail+' ข้อ ===');
process.exit(fail?1:0);
