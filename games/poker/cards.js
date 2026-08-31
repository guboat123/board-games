/* ===========================================================
   วาดไพ่ให้เหมือนไพ่จริง
   ไม่ใช้รูปภาพ วาดด้วย DOM + CSS ล้วน จะได้คมทุกขนาดจอ

   รหัสไพ่เป็นข้อความ เช่น "As" "10h" "Qc" "2d"  และ "??" คือไพ่คว่ำ
     s = โพดำ   h = โพแดง   c = ดอกจิก   d = ข้าวหลามตัด
   =========================================================== */

window.Cards = (function () {
  "use strict";

  var SUIT = {
    s: { glyph: "♠", red: false },
    h: { glyph: "♥", red: true  },
    c: { glyph: "♣", red: false },
    d: { glyph: "♦", red: true  }
  };

  /* ตำแหน่งไพ่แต้ม วางเป็น [คอลัมน์, แถว] ในกริด 0..1
     อิงตามหน้าไพ่จริง คอลัมน์ซ้าย/กลาง/ขวา แถวบนลงล่าง
     ค่า flip = true คือไพ่ที่ต้องกลับหัว (ครึ่งล่างของไพ่จริง) */
  /* ตำแหน่งดอก เป็นสัดส่วนของทั้งใบ [x, y, กลับหัว?]
     คอลัมน์ 0.28 / 0.72 · แถวห่างกันพอให้ดอกไม่ทับกัน
     ครึ่งล่างกลับหัวเหมือนไพ่จริง */
  var PIPS = {
    "A":  [[0.5, 0.50]],
    "2":  [[0.5, 0.17], [0.5, 0.83, 1]],
    "3":  [[0.5, 0.17], [0.5, 0.50], [0.5, 0.83, 1]],
    "4":  [[0.28, 0.17], [0.72, 0.17], [0.28, 0.83, 1], [0.72, 0.83, 1]],
    "5":  [[0.28, 0.17], [0.72, 0.17], [0.5, 0.50], [0.28, 0.83, 1], [0.72, 0.83, 1]],
    "6":  [[0.28, 0.17], [0.72, 0.17], [0.28, 0.50], [0.72, 0.50],
           [0.28, 0.83, 1], [0.72, 0.83, 1]],
    "7":  [[0.28, 0.17], [0.72, 0.17], [0.5, 0.335], [0.28, 0.50], [0.72, 0.50],
           [0.28, 0.83, 1], [0.72, 0.83, 1]],
    "8":  [[0.28, 0.17], [0.72, 0.17], [0.5, 0.335], [0.28, 0.50], [0.72, 0.50],
           [0.5, 0.665, 1], [0.28, 0.83, 1], [0.72, 0.83, 1]],
    "9":  [[0.28, 0.16], [0.72, 0.16], [0.28, 0.38], [0.72, 0.38], [0.5, 0.50],
           [0.28, 0.62, 1], [0.72, 0.62, 1], [0.28, 0.84, 1], [0.72, 0.84, 1]],
    "10": [[0.33, 0.16], [0.67, 0.16], [0.5, 0.27], [0.33, 0.38], [0.67, 0.38],
           [0.33, 0.62, 1], [0.67, 0.62, 1], [0.5, 0.73, 1],
           [0.33, 0.84, 1], [0.67, 0.84, 1]]
  };

  var FACE = { J: "J", Q: "Q", K: "K" };

  function parse(code) {
    if (!code || code === "??") return null;
    var suit = code.slice(-1);
    var rank = code.slice(0, -1);
    if (!SUIT[suit]) return null;
    return { rank: rank, suit: suit };
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }


  /* ---------- หลังไพ่ลายมังกร (ธีมจีน) ----------
     วาดเป็น SVG ในโค้ด ไม่มีไฟล์รูป ตามข้อจำกัดของโปรเจกต์ (เปิดด้วย file:// ต้องได้)
     ใช้เป็น background-image ผ่าน data URI ใบเดียว เบราว์เซอร์ถอดรหัสครั้งเดียวแล้วใช้ซ้ำทุกใบ
     ถ้าฝังเป็น <svg> ในทุกใบ ไพ่คว่ำ 18 ใบบนโต๊ะ = โหนดเพิ่มหลายร้อยโดยไม่จำเป็น

     ⚠️ อย่าใส่ตัวอักษร # ดิบใน SVG (เช่น fill="#c8a"): data URI จะตัดที่ # เป็น fragment
     สีต้องเขียนเป็น rgb() ไม่ใช่ #rrggbb
     ส่วน url(#id) ที่อ้าง gradient/pattern เขียน # ตรงๆ ได้ encodeURIComponent จะแปลงเป็น %23 ให้เอง
     (ถ้าเขียน %23 ไว้เองจะโดนเข้ารหัสซ้ำเป็น %2523 แล้วลายหายทั้งใบ) */
  /* ลายกรอบ+เมฆ วาดเป็น SVG ตัวมังกรใช้รูปจริง (ดู .pc--back ใน cards.css)
     ⚠️ สีต้องเขียนเป็น rgb() ไม่ใช่ #rrggbb — # ในสีจะถูกอ่านเป็น fragment ของ URL
     ส่วน url(#id) ที่อ้าง gradient/pattern เขียน # ตรงๆ ได้ encodeURIComponent แปลงเป็น %23 ให้เอง
     (ถ้าเขียน %23 ไว้เองจะโดนเข้ารหัสซ้ำเป็น %2523 แล้วลายหายทั้งใบ) */
  var FRAME_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">',
    '<defs>',
      /* ทองไล่เฉด เอียงทแยงให้ดูเหมือนแสงตกกระทบ ไม่ใช่ทองแบนๆ */
      '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
        '<stop offset="0" stop-color="rgb(163,116,48)"/>',
        '<stop offset="0.3" stop-color="rgb(232,198,124)"/>',
        '<stop offset="0.52" stop-color="rgb(255,240,196)"/>',
        '<stop offset="0.74" stop-color="rgb(214,168,86)"/>',
        '<stop offset="1" stop-color="rgb(150,102,42)"/>',
      '</linearGradient>',
      /* พื้นแดงชาด สว่างตรงกลางมืดที่ขอบ เหมือนกล่องไม้ลงรักปิดทอง */
      '<radialGradient id="bg" cx="50%" cy="42%" r="76%">',
        '<stop offset="0" stop-color="rgb(74,19,19)"/>',
        '<stop offset="0.52" stop-color="rgb(43,11,13)"/>',
        '<stop offset="1" stop-color="rgb(17,6,7)"/>',
      '</radialGradient>',
      /* ตารางขนมเปียกปูนจางๆ ให้พื้นมีเนื้อ ไม่ใช่สีเรียบ */
      '<pattern id="lat" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">',
        '<path d="M0 0H9M0 0V9" fill="none" stroke="rgb(150,66,52)" stroke-width="0.5" opacity="0.3"/>',
      '</pattern>',
      /* ลายประแจจีน (回紋) เดินรอบขอบทั้งสี่ด้าน */
      '<pattern id="key" width="9" height="9" patternUnits="userSpaceOnUse">',
        '<path d="M1.4 7.6V2.2h5.4v3.2H4.2" fill="none" stroke="url(#g)" stroke-width="0.85" opacity="0.95"/>',
      '</pattern>',

      /* แสงทองนวลหลังตัวมังกร ให้ตัวมังกรลอยขึ้นจากพื้น */
      '<radialGradient id="halo" cx="50%" cy="50%" r="50%">',
        '<stop offset="0" stop-color="rgb(255,214,138)" stop-opacity="0.20"/>',
        '<stop offset="0.65" stop-color="rgb(255,196,110)" stop-opacity="0.07"/>',
        '<stop offset="1" stop-color="rgb(255,196,110)" stop-opacity="0"/>',
      '</radialGradient>',
    '</defs>',

    '<rect width="100" height="140" fill="url(#bg)"/>',
    '<rect width="100" height="140" fill="url(#lat)"/>',
    '<ellipse cx="50" cy="70" rx="36" ry="42" fill="url(#halo)"/>',

    /* ⚠️ แถบลายประแจจีนวาดด้วย "เส้นขอบที่ระบายด้วยลาย" ไม่ใช่สี่เหลี่ยมทึบแล้วเจาะรูด้วยหน้ากาก
       วิธีหน้ากากให้ผลไม่แน่นอนเวลาย่อลงเหลือ 12px (ลายหายเป็นหย่อมๆ)
       ระบายลายลงบนเส้นขอบหนา 7 หน่วยตรงๆ ลายจึงอยู่ในแถบพอดีทุกขนาด */
    '<rect x="9.5" y="9.5" width="81" height="121" rx="3" fill="none" stroke="url(#key)" stroke-width="7"/>',

    /* เส้นทองคู่ นอกและใน */
    '<rect x="3.2" y="3.2" width="93.6" height="133.6" rx="5" fill="none" stroke="url(#g)" stroke-width="1.5"/>',
    '<rect x="6.2" y="6.2" width="87.6" height="127.6" rx="3.6" fill="none" stroke="url(#g)" stroke-width="0.5" opacity="0.75"/>',
    '<rect x="12.2" y="12.2" width="75.6" height="115.6" rx="2.4" fill="none" stroke="url(#g)" stroke-width="0.5" opacity="0.75"/>',
    '<rect x="14.6" y="14.6" width="70.8" height="110.8" rx="1.8" fill="none" stroke="url(#g)" stroke-width="1" opacity="0.9"/>',

    /* เมฆมงคลสี่มุม */
    '<g fill="none" stroke="url(#g)" stroke-width="0.8" opacity="0.8" stroke-linecap="round">',
      '<path d="M18 21c0-2.2 3-2.6 3.4-0.6 1.6-1.2 3.4 0.2 3 1.9"/>',
      '<path d="M82 21c0-2.2-3-2.6-3.4-0.6-1.6-1.2-3.4 0.2-3 1.9"/>',
      '<path d="M18 119c0 2.2 3 2.6 3.4 0.6 1.6 1.2 3.4-0.2 3-1.9"/>',
      '<path d="M82 119c0 2.2-3 2.6-3.4 0.6-1.6 1.2-3.4-0.2-3-1.9"/>',
    '</g>',
    '</svg>'
  ].join("");

  /* ใส่กฎ background เข้าไปครั้งเดียวตอนโหลด
     ⚠️ สองชั้น: รูปมังกรอยู่บน กรอบ+พื้นอยู่ล่าง เรียงตามลำดับใน background-image
     ต้องทำใน JS เพราะ data URI ของกรอบยาวมาก เขียนใน .css แล้วอ่าน/แก้ไม่ไหว
     ส่วนตัวมังกรเป็นไฟล์รูปจริง จึงอ้างด้วย path สัมพัทธ์ ใช้ได้ทั้ง http และ file:// */
  function installBack() {
    if (document.getElementById("pc-back-style")) return;
    var st = document.createElement("style");
    st.id = "pc-back-style";
    st.textContent = ".pc--back{background-image:url(\"img/dragon.png\"),url(\"data:image/svg+xml," +
      encodeURIComponent(FRAME_SVG).replace(/'/g, "%27") +
      "\");background-size:84% auto,100% 100%;" +
      "background-position:center center,center center;background-repeat:no-repeat,no-repeat;}";
    document.head.appendChild(st);
  }
  installBack();

  /* มุมไพ่: แต้มอยู่บน ดอกอยู่ล่าง */
  function corner(rank, glyph, cls) {
    var c = el("span", "pc__corner " + cls);
    c.appendChild(el("span", "pc__cr", rank));
    c.appendChild(el("span", "pc__cs", glyph));
    return c;
  }

  /* สร้างไพ่หนึ่งใบ  size: "sm" | "md" | "lg" */
  function make(code, size) {
    var card = el("div", "pc pc--" + (size || "md"));
    var info = parse(code);

    if (!info) {
      card.className += " pc--back";
      card.appendChild(el("div", "pc__pattern"));
      return card;
    }

    var s = SUIT[info.suit];
    if (s.red) card.className += " pc--red";
    /* ติดคลาสตามดอก เพื่อให้ CSS แยกสีได้ทีละดอก (แบบสำรับ 4 สี)
       ดอกดำสองดอกแยกกันยากมากตอนไพ่เล็ก โดยเฉพาะคนสายตาไม่ดี */
    card.className += " pc--" + info.suit;
    /* "10" กว้างสองตัวอักษร ต้องย่อเลขมุมไม่ให้ไปชนดอก */
    if (info.rank.length > 1) card.className += " pc--wide";
    card.setAttribute("aria-label", info.rank + " " + s.glyph);

    card.appendChild(corner(info.rank, s.glyph, "pc__corner--tl"));
    card.appendChild(corner(info.rank, s.glyph, "pc__corner--br"));

    var face = el("div", "pc__face");

    if (FACE[info.rank]) {
      /* ไพ่คน: ใช้ตัวอักษรใหญ่กับดอกเล็กมุม แทนรูปคน จะได้ไม่ต้องใช้ภาพ */
      var big = el("div", "pc__letter", info.rank);
      face.appendChild(big);
      var sub = el("div", "pc__letter-suit", s.glyph);
      face.appendChild(sub);
    } else {
      var list = PIPS[info.rank] || [];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var pip = el("span", "pc__pip" + (p[2] ? " is-flip" : ""), s.glyph);
        pip.style.left = (p[0] * 100) + "%";
        pip.style.top = (p[1] * 100) + "%";
        face.appendChild(pip);
      }
    }

    card.appendChild(face);
    return card;
  }

  /* ช่องไพ่ว่าง ใช้เป็นที่วางไพ่กลางที่ยังไม่เปิด */
  function slot(size) {
    return el("div", "pc pc--" + (size || "md") + " pc--slot");
  }

  return { make: make, slot: slot, parse: parse };
})();
