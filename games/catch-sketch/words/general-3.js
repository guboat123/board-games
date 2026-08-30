/* คลังคำชุดที่ 3 — หมวดใหม่ของหมวดทั่วไป
   ไฟล์นี้ต่อท้าย general.js และ general-2.js ไม่ทับของเดิม
   ต้องโหลดหลังสองไฟล์นั้นเสมอ

   หมวดใหม่ในไฟล์นี้: music tool clothes weather space fantasy tech school holiday
   ถ้าเพิ่มหมวดใหม่ อย่าลืมใส่ชื่อไทยใน CAT_LABEL ที่ index.html ของเกม */

window.WORDS_GENERAL = (window.WORDS_GENERAL || []).concat([

  /* ---------- ดนตรี ---------- */
  { w: "กลองชุด", en: "drum kit", cat: "music", lv: 1 },
  { w: "ลำโพง", en: "speaker", cat: "music", lv: 1 },
  { w: "โน้ตดนตรี", en: "music note", cat: "music", lv: 1 },
  { w: "กีตาร์ไฟฟ้า", en: "electric guitar", cat: "music", lv: 2 },
  { w: "ฉาบ", en: "cymbal", cat: "music", lv: 2 },
  { w: "แทมบูรีน", en: "tambourine", cat: "music", lv: 3 },
  { w: "เครื่องเล่นแผ่นเสียง", en: "turntable", cat: "music", lv: 3 },

  /* ---------- เครื่องมือช่าง ---------- */
  { w: "คีม", en: "pliers", cat: "tool", lv: 2 },
  { w: "สว่าน", en: "drill", cat: "tool", lv: 2 },
  { w: "น็อต", en: "bolt", cat: "tool", lv: 2 },
  { w: "ตลับเมตร", en: "measuring tape", cat: "tool", lv: 2 },
  { w: "ไม้ระดับ", en: "spirit level", cat: "tool", lv: 3 },
  { w: "พลั่ว", en: "shovel", cat: "tool", lv: 1 },
  { w: "จอบ", en: "hoe", cat: "tool", lv: 2 },
  { w: "มีดพับ", en: "pocket knife", cat: "tool", lv: 2 },
  { w: "แปรงทาสี", en: "paint brush", cat: "tool", lv: 1 },
  { w: "ถังสี", en: "paint bucket", cat: "tool", lv: 1 },
  { w: "เครื่องเชื่อม", en: "welding machine", cat: "tool", lv: 3 },
  { w: "รถเข็นปูน", en: "wheelbarrow", cat: "tool", lv: 2 },
  { w: "กาวแท่ง", en: "glue stick", cat: "tool", lv: 2 },
  { w: "แม่แรง", en: "car jack", cat: "tool", lv: 3 },

  /* ---------- เสื้อผ้า ---------- */
  { w: "เสื้อยืด", en: "t-shirt", cat: "clothes", lv: 1 },
  { w: "กางเกงยีนส์", en: "jeans", cat: "clothes", lv: 1 },
  { w: "กระโปรง", en: "skirt", cat: "clothes", lv: 1 },
  { w: "ชุดว่ายน้ำ", en: "swimsuit", cat: "clothes", lv: 2 },
  { w: "เสื้อกันฝน", en: "raincoat", cat: "clothes", lv: 2 },
  { w: "หมวกกันน็อก", en: "helmet", cat: "clothes", lv: 1 },
  { w: "ต่างหู", en: "earring", cat: "clothes", lv: 2 },
  { w: "ชุดสูท", en: "suit", cat: "clothes", lv: 2 },
  { w: "ชุดกิโมโน", en: "kimono", cat: "clothes", lv: 2 },

  /* ---------- อวกาศ ---------- */
  { w: "ดาวเทียม", en: "satellite", cat: "space", lv: 2 },
  { w: "มนุษย์ต่างดาว", en: "alien", cat: "space", lv: 1 },
  { w: "ชุดอวกาศ", en: "spacesuit", cat: "space", lv: 2 },
  { w: "ยานสำรวจดาว", en: "rover", cat: "space", lv: 3 },
  { w: "ดาวพฤหัส", en: "Jupiter", cat: "space", lv: 2 },
  { w: "หลุมอุกกาบาต", en: "crater", cat: "space", lv: 3 },

  /* ---------- แฟนตาซี ---------- */
  { w: "แวมไพร์", en: "vampire", cat: "fantasy", lv: 1 },
  { w: "ไม้กายสิทธิ์", en: "magic wand", cat: "fantasy", lv: 1 },
  { w: "ลูกแก้ววิเศษ", en: "crystal ball", cat: "fantasy", lv: 2 },
  { w: "ตะเกียงวิเศษ", en: "magic lamp", cat: "fantasy", lv: 1 },
  { w: "กริฟฟิน", en: "griffin", cat: "fantasy", lv: 3 },

  /* ---------- เทคโนโลยี ---------- */
  { w: "โน้ตบุ๊ก", en: "laptop", cat: "tech", lv: 1 },
  { w: "แท็บเล็ต", en: "tablet", cat: "tech", lv: 1 },
  { w: "เครื่องพิมพ์", en: "printer", cat: "tech", lv: 2 },
  { w: "กล้องวงจรปิด", en: "CCTV camera", cat: "tech", lv: 2 },
  { w: "เสาสัญญาณ", en: "signal tower", cat: "tech", lv: 2 },
  { w: "คิวอาร์โค้ด", en: "QR code", cat: "tech", lv: 2 },
  { w: "ไมโครเวฟ", en: "microwave", cat: "tech", lv: 1 },
  { w: "เครื่องดูดฝุ่น", en: "vacuum cleaner", cat: "tech", lv: 1 },
  { w: "แว่นวีอาร์", en: "VR headset", cat: "tech", lv: 2 },
  { w: "หุ่นยนต์ดูดฝุ่น", en: "robot vacuum", cat: "tech", lv: 2 },

  /* ---------- โรงเรียน ---------- */
  { w: "กระดานดำ", en: "blackboard", cat: "school", lv: 1 },
  { w: "ชอล์ก", en: "chalk", cat: "school", lv: 1 },
  { w: "สมุด", en: "notebook", cat: "school", lv: 1 },
  { w: "ยางลบ", en: "eraser", cat: "school", lv: 1 },
  { w: "ไม้บรรทัด", en: "ruler", cat: "school", lv: 1 },
  { w: "กบเหลาดินสอ", en: "pencil sharpener", cat: "school", lv: 2 },
  { w: "กระเป๋านักเรียน", en: "school bag", cat: "school", lv: 1 },
  { w: "โต๊ะเรียน", en: "school desk", cat: "school", lv: 1 },
  { w: "หลอดทดลอง", en: "test tube", cat: "school", lv: 2 },
  { w: "เครื่องคิดเลข", en: "calculator", cat: "school", lv: 1 },
  { w: "ประกาศนียบัตร", en: "certificate", cat: "school", lv: 2 },
  { w: "หมวกรับปริญญา", en: "graduation cap", cat: "school", lv: 2 },
  { w: "กล่องดินสอ", en: "pencil case", cat: "school", lv: 1 },

  /* ---------- เทศกาล ---------- */
  { w: "ต้นคริสต์มาส", en: "Christmas tree", cat: "holiday", lv: 1 },
  { w: "ซานตาคลอส", en: "Santa Claus", cat: "holiday", lv: 1 },
  { w: "กล่องของขวัญ", en: "gift box", cat: "holiday", lv: 1 },
  { w: "เค้กวันเกิด", en: "birthday cake", cat: "holiday", lv: 1 },
  { w: "พลุ", en: "firework", cat: "holiday", lv: 1 },
  { w: "ฟักทองฮาโลวีน", en: "jack-o-lantern", cat: "holiday", lv: 1 },
  { w: "หน้ากากฮาโลวีน", en: "Halloween mask", cat: "holiday", lv: 2 },
  { w: "ไข่อีสเตอร์", en: "Easter egg", cat: "holiday", lv: 3 },
  { w: "ริบบิ้น", en: "ribbon", cat: "holiday", lv: 1 },
  { w: "การ์ดอวยพร", en: "greeting card", cat: "holiday", lv: 2 },
  { w: "ถุงเท้าคริสต์มาส", en: "Christmas stocking", cat: "holiday", lv: 2 },
  { w: "กระดิ่ง", en: "jingle bell", cat: "holiday", lv: 1 },
  { w: "พวงมาลัยคริสต์มาส", en: "wreath", cat: "holiday", lv: 2 },
  { w: "ตุ๊กตาหิมะ", en: "snowman", cat: "holiday", lv: 1 },

  /* ---------- ดนตรี (เติม) ---------- */
  { w: "ฮาร์ป", en: "harp", cat: "music", lv: 2 },
  { w: "แบนโจ", en: "banjo", cat: "music", lv: 3 },
  { w: "ทูบา", en: "tuba", cat: "music", lv: 2 },
  { w: "เมโทรนอม", en: "metronome", cat: "music", lv: 3 },
  { w: "กลองบองโก", en: "bongo drums", cat: "music", lv: 2 },
  { w: "ขาตั้งโน้ตเพลง", en: "music stand", cat: "music", lv: 3 },

  /* ---------- อวกาศ (เติม) ---------- */
  { w: "กระสวยอวกาศ", en: "space shuttle", cat: "space", lv: 2 },
  { w: "จานรับสัญญาณ", en: "satellite dish", cat: "space", lv: 2 },
  { w: "แผงโซลาร์เซลล์", en: "solar panel", cat: "space", lv: 3 },
  { w: "ดาวเคราะห์น้อย", en: "asteroid", cat: "space", lv: 3 },
  { w: "หมวกนักบินอวกาศ", en: "space helmet", cat: "space", lv: 2 },

  /* ---------- แฟนตาซี (เติม) ---------- */
  { w: "หมวกแหลมแม่มด", en: "witch hat", cat: "fantasy", lv: 1 },
  { w: "หนังสือคาถา", en: "spell book", cat: "fantasy", lv: 2 },
  { w: "ปีกนางฟ้า", en: "fairy wings", cat: "fantasy", lv: 1 },
  { w: "โลงศพ", en: "coffin", cat: "fantasy", lv: 1 },
  { w: "ป้ายหลุมศพ", en: "tombstone", cat: "fantasy", lv: 1 },
  { w: "ขวดยาวิเศษ", en: "potion bottle", cat: "fantasy", lv: 2 },
  { w: "เขี้ยวแวมไพร์", en: "vampire fangs", cat: "fantasy", lv: 2 },

  /* ---------- เสื้อผ้า (เติม) ---------- */
  { w: "ผ้ากันเปื้อน", en: "apron", cat: "clothes", lv: 1 },
  { w: "รองเท้าส้นสูง", en: "high heels", cat: "clothes", lv: 1 },
  { w: "กระเป๋าสตางค์", en: "wallet", cat: "clothes", lv: 1 },
  { w: "เข็มกลัด", en: "brooch pin", cat: "clothes", lv: 3 },
  { w: "ถุงน่อง", en: "stockings", cat: "clothes", lv: 2 },

  /* ---------- เครื่องมือช่าง (เติม) ---------- */
  { w: "ตะไบ", en: "file rasp", cat: "tool", lv: 3 },
  { w: "กรรไกรตัดกิ่ง", en: "pruning shears", cat: "tool", lv: 2 },
  { w: "หมวกนิรภัย", en: "hard hat", cat: "tool", lv: 1 }

]);
