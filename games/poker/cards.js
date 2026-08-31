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
