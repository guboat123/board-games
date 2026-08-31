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
  var DRAGON_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">',
    '<defs>',
      '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
        '<stop offset="0" stop-color="rgb(212,166,86)"/>',
        '<stop offset="0.5" stop-color="rgb(240,214,150)"/>',
        '<stop offset="1" stop-color="rgb(186,138,64)"/>',
      '</linearGradient>',
      /* ลายเมฆจีนซ้ำเป็นพื้นหลังจางๆ ให้ไม่โล่งเกินไป */
      '<pattern id="cl" width="20" height="20" patternUnits="userSpaceOnUse">',
        '<path d="M3 14a3 3 0 016 0 3 3 0 016 0" fill="none" stroke="rgb(150,60,50)" stroke-width="1" opacity="0.5"/>',
      '</pattern>',
    '</defs>',
    /* พื้นแดงเข้มเกือบดำ แบบไพ่สำรับจีน */
    '<rect width="100" height="140" fill="rgb(24,10,12)"/>',
    '<rect width="100" height="140" fill="url(#cl)"/>',
    /* กรอบทองสองชั้น + ลายประแจจีนที่มุม */
    '<rect x="5" y="5" width="90" height="130" rx="5" fill="none" stroke="url(#g)" stroke-width="1.6"/>',
    '<rect x="9" y="9" width="82" height="122" rx="3" fill="none" stroke="url(#g)" stroke-width="0.5" opacity="0.75"/>',
    '<path d="M13 13h8v3h-5v5h-3zM87 13h-8v3h5v5h3zM13 127h8v-3h-5v-5h-3zM87 127h-8v-3h5v-5h3z" fill="url(#g)" opacity="0.9"/>',
    /* วงกลมกลางใบ */
    '<circle cx="50" cy="70" r="31" fill="none" stroke="url(#g)" stroke-width="1.1" opacity="0.85"/>',
    '<circle cx="50" cy="70" r="34" fill="none" stroke="url(#g)" stroke-width="0.5" opacity="0.5"/>',
    /* ตัวมังกรขดเป็นวง หัวอยู่บน หางม้วนอยู่ล่าง */
    '<g fill="none" stroke="url(#g)" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M50 47c-13 0-21 10-21 21 0 13 10 22 21 22 10 0 18-7 18-16 0-8-6-14-14-14-7 0-12 5-12 11 0 5 4 9 9 9" stroke-width="3.4"/>',
      /* เกล็ดบนหลัง */
      '<path d="M50 47c-13 0-21 10-21 21 0 13 10 22 21 22" stroke-width="1" opacity="0.55" stroke-dasharray="1 3"/>',
      /* หัว: ปาก เขา หนวด */
      '<path d="M50 47l-9-6" stroke-width="3"/>',
      '<path d="M41 41l-7-1 5 4z" stroke-width="1.2" fill="url(#g)"/>',
      '<path d="M44 40c-2-4-6-6-10-5" stroke-width="1.4"/>',
      '<path d="M47 43c-3-5-9-7-15-5" stroke-width="1.1" opacity="0.8"/>',
      /* ขาและเล็บ */
      '<path d="M32 62l-8-3m8 3l-7 3m7-3l-6-7" stroke-width="1.4"/>',
      '<path d="M63 84l8 3m-8-3l6 6m-6-6l8-2" stroke-width="1.4"/>',
      /* ลูกแก้วในกรงเล็บ */
      '<circle cx="50" cy="70" r="4" stroke-width="1.2"/>',
    '</g>',
    '<circle cx="50" cy="70" r="1.8" fill="url(#g)"/>',
    /* ตา */
    '<circle cx="45.5" cy="44" r="1.1" fill="rgb(200,60,50)"/>',
    '</svg>'
  ].join("");

  /* ใส่กฎ background-image เข้าไปครั้งเดียวตอนโหลด
     ต้องทำใน JS เพราะ data URI ยาวมาก เขียนใน .css แล้วอ่าน/แก้ไม่ไหว */
  function installBack() {
    if (document.getElementById("pc-back-style")) return;
    var st = document.createElement("style");
    st.id = "pc-back-style";
    st.textContent = ".pc--back{background-image:url(\"data:image/svg+xml," +
      encodeURIComponent(DRAGON_SVG).replace(/'/g, "%27") +
      "\");background-size:100% 100%;background-repeat:no-repeat;}";
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
