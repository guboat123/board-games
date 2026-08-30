/* ===========================================================
   ก๊วนบอร์ดเกม — ทะเบียนผู้เล่น + ประวัติการเล่น
   ใช้ร่วมกันทุกเกม เรียกผ่าน window.Players

   เก็บใน localStorage 2 คีย์
     bg.players.v1   ทะเบียนชื่อ
     bg.history.v1   ประวัติการเล่น (เก็บล่าสุดไม่เกิน 200 รายการ)

   localStorage ทุกจุดห่อ try/catch ถ้าเขียนไม่ได้ (โหมดส่วนตัว)
   จะใช้ตัวแปรในหน่วยความจำแทน เล่นต่อได้ปกติ แค่ไม่จำข้ามครั้ง
   =========================================================== */

window.Players = (function () {
  "use strict";

  var KEY_PLAYERS = "bg.players.v1";
  var KEY_HISTORY = "bg.history.v1";
  var HISTORY_MAX = 200;

  /* แคชในหน่วยความจำ เป็นตัวจริงที่ใช้อ่านหลังโหลดครั้งแรก
     ถ้า localStorage พัง ตัวนี้ยังทำงานได้ตลอดทั้งครั้งที่เล่น */
  var cache = { players: null, history: null };

  var idCounter = 0;

  /* ---------- ตัวช่วยเรื่องที่เก็บ ---------- */

  /* บางเบราว์เซอร์แค่แตะ window.localStorage ก็ throw แล้ว */
  function storage() {
    try {
      var s = window.localStorage;
      if (!s) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }

  function load(key) {
    var s = storage();
    if (!s) return [];
    try {
      var raw = s.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /* คืน true ถ้าเขียนลงเครื่องได้ คืน false ก็ไม่เป็นไร แคชยังถูกต้องอยู่ */
  function save(key, list) {
    var s = storage();
    if (!s) return false;
    try {
      s.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- ตัวช่วยทั่วไป ---------- */

  function makeId() {
    idCounter = (idCounter + 1) % 100000;
    return Date.now().toString(36) + "-" +
           idCounter.toString(36) + "-" +
           Math.floor(Math.random() * 1679616).toString(36);
  }

  /* ตัดช่องว่างหัวท้าย และยุบช่องว่างซ้อนให้เหลือเคาะเดียว */
  function clean(name) {
    if (typeof name !== "string") return "";
    return name.replace(/\s+/g, " ").replace(/^ | $/g, "");
  }

  /* ใช้เทียบชื่อซ้ำแบบไม่สนตัวพิมพ์ */
  function norm(name) {
    return clean(name).toLowerCase();
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function byName(a, b) {
    try {
      return String(a.name).localeCompare(String(b.name), "th");
    } catch (e) {
      return String(a.name) < String(b.name) ? -1 : (String(a.name) > String(b.name) ? 1 : 0);
    }
  }

  function copyPlayer(p) {
    return { id: p.id, name: p.name, createdAt: p.createdAt };
  }

  /* ---------- ทะเบียนผู้เล่น ---------- */

  function players() {
    if (cache.players === null) {
      var raw = load(KEY_PLAYERS);
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var p = raw[i];
        /* ทิ้งรายการที่ข้อมูลไม่ครบ กันไฟล์ที่เพี้ยนมาทำเกมพัง */
        if (!p || typeof p !== "object") continue;
        var name = clean(p.name);
        if (!p.id || !name) continue;
        out.push({ id: String(p.id), name: name, createdAt: num(p.createdAt) });
      }
      cache.players = out;
    }
    return cache.players;
  }

  function findIndex(id) {
    var list = players();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === String(id)) return i;
    }
    return -1;
  }

  /* หาชื่อซ้ำ ข้าม id ที่ระบุ (ใช้ตอนเปลี่ยนชื่อตัวเอง) */
  function nameTaken(name, exceptId) {
    var key = norm(name);
    var list = players();
    for (var i = 0; i < list.length; i++) {
      if (exceptId != null && list[i].id === String(exceptId)) continue;
      if (norm(list[i].name) === key) return true;
    }
    return false;
  }

  function savePlayers() {
    save(KEY_PLAYERS, players());
  }

  function all() {
    return players().slice().sort(byName).map(copyPlayer);
  }

  function get(id) {
    var at = findIndex(id);
    return at === -1 ? null : copyPlayer(players()[at]);
  }

  function add(name) {
    var clean_ = clean(name);
    if (!clean_) return null;            /* ชื่อว่าง */
    if (nameTaken(clean_, null)) return null;  /* ชื่อซ้ำ */

    var p = { id: makeId(), name: clean_, createdAt: Date.now() };
    players().push(p);
    savePlayers();
    return copyPlayer(p);
  }

  function rename(id, name) {
    var at = findIndex(id);
    if (at === -1) return null;

    var clean_ = clean(name);
    if (!clean_) return null;
    if (nameTaken(clean_, id)) return null;

    players()[at].name = clean_;
    savePlayers();
    return copyPlayer(players()[at]);
  }

  /* ลบออกจากทะเบียนเท่านั้น ประวัติเก่ายังเก็บชื่อ ณ ตอนที่บันทึกไว้ */
  function remove(id) {
    var at = findIndex(id);
    if (at === -1) return false;
    players().splice(at, 1);
    savePlayers();
    return true;
  }

  /* ---------- ประวัติการเล่น ---------- */

  /* เก็บเรียงเก่าไปใหม่ ตอนคืนค่าค่อยกลับด้าน */
  function historyList() {
    if (cache.history === null) {
      var raw = load(KEY_HISTORY);
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var r = raw[i];
        if (!r || typeof r !== "object" || !isArray(r.results)) continue;
        out.push(normalizeRecord(r));
      }
      cache.history = trim(out);
    }
    return cache.history;
  }

  function trim(list) {
    /* เกิน 200 ตัดอันเก่าสุดทิ้ง */
    if (list.length > HISTORY_MAX) list.splice(0, list.length - HISTORY_MAX);
    return list;
  }

  function normalizeRecord(rec) {
    var results = [];
    var src = isArray(rec.results) ? rec.results : [];
    for (var i = 0; i < src.length; i++) {
      var r = src[i];
      if (!r || typeof r !== "object") continue;
      results.push({
        playerId: r.playerId == null ? null : String(r.playerId),
        name: clean(r.name),
        score: num(r.score),
        won: r.won === true
      });
    }
    return {
      id: rec.id ? String(rec.id) : makeId(),
      game: rec.game ? String(rec.game) : "",
      gameLabel: rec.gameLabel ? String(rec.gameLabel) : "",
      playedAt: num(rec.playedAt) || Date.now(),
      results: results
    };
  }

  function copyRecord(rec) {
    var results = [];
    for (var i = 0; i < rec.results.length; i++) {
      var r = rec.results[i];
      results.push({ playerId: r.playerId, name: r.name, score: r.score, won: r.won });
    }
    return {
      id: rec.id,
      game: rec.game,
      gameLabel: rec.gameLabel,
      playedAt: rec.playedAt,
      results: results
    };
  }

  function recordGame(record) {
    if (!record || typeof record !== "object") return null;
    var rec = normalizeRecord(record);
    if (!rec.results.length) return null;   /* ไม่มีผู้เล่น ไม่ต้องบันทึก */

    var list = historyList();
    list.push(rec);
    trim(list);
    save(KEY_HISTORY, list);
    return copyRecord(rec);
  }

  /* คืนประวัติล่าสุด เรียงใหม่ไปเก่า */
  function history(limit) {
    var out = historyList().slice().reverse();
    var n = Number(limit);
    if (isFinite(n) && n > 0) out = out.slice(0, Math.floor(n));
    return out.map(copyRecord);
  }

  function clearHistory() {
    cache.history = [];
    save(KEY_HISTORY, cache.history);
  }

  /* ---------- สถิติ ---------- */

  /* รวมทั้งคนที่ยังอยู่ในทะเบียน (แม้ยังไม่เคยเล่น)
     และคนที่ถูกลบไปแล้วแต่ยังมีชื่ออยู่ในประวัติ */
  function stats() {
    var index = {};   /* คีย์ -> แถวสถิติ */
    var order = [];

    function row(key, name) {
      if (!index[key]) {
        index[key] = { id: key.indexOf("name:") === 0 ? null : key,
                       name: name, games: 0, wins: 0, points: 0 };
        order.push(index[key]);
      }
      return index[key];
    }

    var reg = players();
    var i, j;
    for (i = 0; i < reg.length; i++) {
      row(reg[i].id, reg[i].name);
    }

    var hist = historyList();
    for (i = 0; i < hist.length; i++) {
      var results = hist[i].results;
      for (j = 0; j < results.length; j++) {
        var r = results[j];
        /* คนที่ถูกลบออกจากทะเบียนแล้ว จับกลุ่มด้วยชื่อที่บันทึกไว้ */
        var key = r.playerId && findIndex(r.playerId) !== -1
                    ? r.playerId
                    : (r.playerId || "name:" + norm(r.name));
        var known = r.playerId ? get(r.playerId) : null;
        var it = row(key, known ? known.name : r.name);
        if (known) it.name = known.name;   /* เปลี่ยนชื่อแล้วให้ตารางอันดับใช้ชื่อใหม่ */
        it.games += 1;
        if (r.won) it.wins += 1;
        it.points += r.score;
      }
    }

    return order.sort(function (a, b) {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.points !== a.points) return b.points - a.points;
      return byName(a, b);
    });
  }

  /* ---------- หน้าตาของโมดูล ---------- */

  return {
    all: all,
    add: add,
    rename: rename,
    remove: remove,
    get: get,
    recordGame: recordGame,
    history: history,
    stats: stats,
    clearHistory: clearHistory
  };
})();
