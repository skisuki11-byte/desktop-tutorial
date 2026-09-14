/* store.js — ともしび の保存層。
 *
 * 前の版は写真が入らなかった。原因は2つで、どちらもここで直している:
 *   1. IndexedDB が使えない環境（埋め込み表示、iOS Safari のサードパーティ制限）で
 *      保存が失敗していた → 使えるかを起動時に必ず確かめ、写真は localStorage に逃がす
 *   2. 失敗しても誰も受け取っていなかった → すべての保存は必ず解決し、
 *      失敗は {ok:false, reason} で返す。黙って止まる経路をなくす
 *
 * 通信は一切しない。すべて端末の中だけで完結する。
 */
(function (global) {
  'use strict';

  var KEY = 'tomoshibi.v2';

  function blank() {
    return {
      onboarded: false,
      pet: { name: '', kind: 'dog', deathISO: '', birthISO: '' },
      visits: [],          // お参りした日 "YYYY-MM-DD"。通算回数はこの長さ
      seasonal: {},        // { "2026-09": true } 季節のおそなえを置いた月
      videoTitles: {},     // { mediaId: "走ってるところ" }
      photoHidden: [],     // 出さない章のid
      chapterTitles: {},
      theme: 'light',
      dateOffset: 0        // 確認用。通常0
    };
  }

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var v = JSON.parse(raw), base = blank();
      Object.keys(base).forEach(function (k) { if (!(k in v)) v[k] = base[k]; });
      Object.keys(base.pet).forEach(function (k) { if (!(k in v.pet)) v.pet[k] = base.pet[k]; });
      return v;
    } catch (e) { return blank(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  /* ============ 日付 ============
     ローカル時刻の「日」として扱う。UTCに直すと日本時間の朝が前日になる。 */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function parseISO(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length < 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  }
  function addYears(d, n) { return addMonths(d, n * 12); }
  function diffDays(a, b) {
    var x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((y - x) / 86400000);
  }
  function today() {
    var d = new Date();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return state.dateOffset ? addDays(d, state.dateOffset) : d;
  }
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function formatJP(d, w) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' + (w ? '（' + WEEK[d.getDay()] + '）' : '');
  }
  function formatMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '曜日'; }
  function formatShort(d) { return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(); }

  /* ============ 節目 ============ */
  function nextAnniversary(base, from) {
    for (var i = 0; i < 3; i++) {
      var last = new Date(from.getFullYear() + i, base.getMonth() + 1, 0).getDate();
      var c = new Date(from.getFullYear() + i, base.getMonth(), Math.min(base.getDate(), last));
      if (diffDays(from, c) >= 0) return c;
    }
    return null;
  }
  function nextMonthly(death, from) {
    var c = new Date(from.getFullYear(), from.getMonth(), 1);
    for (var i = 0; i < 14; i++) {
      var last = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
      var cand = new Date(c.getFullYear(), c.getMonth(), Math.min(death.getDate(), last));
      if (diffDays(from, cand) >= 0 && diffDays(death, cand) > 0) return cand;
      c = addMonths(c, 1);
    }
    return null;
  }

  /* 四十九日＝命日の48日後、三回忌＝満2年。日本の数え方に合わせる。 */
  function milestones(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return [];
    var out = [];
    function push(key, label, date, note) {
      if (!date) return;
      var n = diffDays(from, date);
      if (n < 0) return;
      out.push({ key: key, label: label, date: date, days: n, note: note || '' });
    }
    push('d49', '四十九日', addDays(death, 48), formatJP(addDays(death, 48), true));
    push('d100', '百か日', addDays(death, 99), formatJP(addDays(death, 99), true));
    var mm = nextMonthly(death, from);
    push('monthly', '月命日', mm, mm ? '毎月' + death.getDate() + '日／次は' + (mm.getMonth() + 1) + '月' + mm.getDate() + '日' : '');
    push('y1', '一周忌', addYears(death, 1), formatJP(addYears(death, 1), true));
    push('y3', '三回忌', addYears(death, 2), formatJP(addYears(death, 2), true));
    var b = parseISO(state.pet.birthISO);
    if (b) {
      var nb = nextAnniversary(b, from);
      push('birthday', 'お誕生日', nb, nb ? formatJP(nb, true) + '・' + b.getFullYear() + '年うまれ' : '');
    }
    out.sort(function (a, c) { return a.days - c.days; });
    // 月命日が大きい節目と重なったら、大きいほうだけ残す
    var big = {};
    out.forEach(function (m) { if (m.key !== 'monthly') big[ymd(m.date)] = true; });
    out = out.filter(function (m) { return !(m.key === 'monthly' && big[ymd(m.date)]); });
    // 四十九日がまだ先なら先頭に。この時期に数えているのは四十九日なので
    var i49 = -1;
    out.forEach(function (m, i) { if (m.key === 'd49') i49 = i; });
    if (i49 > 0) out.unshift(out.splice(i49, 1)[0]);
    return out;
  }

  function daysTogether() {
    var b = parseISO(state.pet.birthISO), d = parseISO(state.pet.deathISO);
    if (!b || !d) return 0;
    return Math.max(0, diffDays(b, d));
  }

  /* ============ おまいり ============
     数えるのは通算。連続記録ではない。
     連続は1日休むと途切れて罪悪感になるが、通算は減らず、途切れない。 */
  function visitCount() { return state.visits.length; }
  function visitedOn(d) { return state.visits.indexOf(ymd(d)) >= 0; }
  function recordVisit(d) {
    var k = ymd(d);
    if (state.visits.indexOf(k) >= 0) return false;   // 1日1回。回数は稼げない
    state.visits.push(k); state.visits.sort(); save();
    return true;
  }

  /* 季節のおそなえ。月がわりで1つ。置いても置かなくてもいい。 */
  var SEASONAL = [
    { m: 1, name: 'おもち', c: '#F2E6D2' }, { m: 2, name: 'いちご', c: '#EFA5A5' },
    { m: 3, name: 'さくら', c: '#F3C2CE' }, { m: 4, name: 'つくし', c: '#CFE0A8' },
    { m: 5, name: 'かしわもち', c: '#CFE6BC' }, { m: 6, name: 'あじさい', c: '#C4C9E8' },
    { m: 7, name: 'すいか', c: '#EF9E9E' }, { m: 8, name: 'ひまわり', c: '#FFD98A' },
    { m: 9, name: 'おはぎ', c: '#D9BFA6' }, { m: 10, name: 'さつまいも', c: '#D7B0CE' },
    { m: 11, name: 'もみじ', c: '#EBA97E' }, { m: 12, name: 'みかん', c: '#FFC16B' }
  ];
  function seasonalFor(d) { return SEASONAL[d.getMonth()]; }
  function seasonalDone(d) { return !!state.seasonal[ym(d)]; }
  function putSeasonal(d) { state.seasonal[ym(d)] = true; save(); }

  /* ============ 写真と動画 ============
     IndexedDB を第一に、使えないときは写真だけ localStorage に逃がす。
     どちらも駄目なら理由を返す。呼ぶ側はそれを画面に出すこと。 */
  var DB = 'tomoshibi-media', STORE = 'media', dbp = null, idbState = 'unknown';

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var idb = null;
      try { idb = global.indexedDB; } catch (e) { idb = null; }
      if (!idb) { rej(new Error('no-indexeddb')); return; }
      var r;
      try { r = idb.open(DB, 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('idb-error')); };
      r.onblocked = function () { rej(new Error('idb-blocked')); };
      setTimeout(function () { rej(new Error('idb-timeout')); }, 6000);
    });
    return dbp;
  }

  /* 起動時に1度だけ、本当に読み書きできるか試す。
     open が通っても書き込みで落ちる環境があるため、書いて消すところまでやる。 */
  function probe() {
    return openDB().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
        var r = s.put({ id: '__probe__', blob: new Blob(['x']), at: Date.now() });
        r.onsuccess = function () { s.delete('__probe__'); res(true); };
        r.onerror = function () { rej(r.error || new Error('probe-failed')); };
      });
    }).then(function () { idbState = 'ok'; return true; })
      .catch(function () { idbState = 'unavailable'; return false; });
  }
  function idbAvailable() { return idbState === 'ok'; }

  function tx(mode) { return openDB().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); }); }
  function wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('req-error')); };
    });
  }

  var LS_PREFIX = 'tomoshibi.media.';
  var LS_LIMIT = 1400000;  // localStorage は数MBで頭打ち。遺影1枚ぶんに限る

  function blobToDataURL(b) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('read-failed')); };
      r.readAsDataURL(b);
    });
  }
  function dataURLToBlob(u) {
    try {
      var i = u.indexOf(','), head = u.slice(0, i), body = u.slice(i + 1);
      var mime = (head.match(/data:([^;]+)/) || [, 'image/jpeg'])[1];
      var bin = atob(body), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  /* 保存。必ず解決する。失敗は {ok:false, reason} で返す。 */
  function putMedia(rec) {
    if (idbAvailable()) {
      return tx('readwrite').then(function (s) { return wrap(s.put(rec)); })
        .then(function () { return { ok: true, where: 'idb' }; })
        .catch(function (e) {
          // 容量超過はここで出る。写真なら localStorage に逃がす
          if (rec.kind === 'photo') return putToLS(rec);
          return { ok: false, reason: reasonOf(e) };
        });
    }
    if (rec.kind === 'photo') return putToLS(rec);
    return Promise.resolve({ ok: false, reason: 'no-store-video' });
  }

  function putToLS(rec) {
    return blobToDataURL(rec.blob).then(function (u) {
      if (u.length > LS_LIMIT) return { ok: false, reason: 'too-large' };
      try {
        localStorage.setItem(LS_PREFIX + rec.id, JSON.stringify({ u: u, at: rec.at || Date.now(), kind: rec.kind }));
        return { ok: true, where: 'ls' };
      } catch (e) { return { ok: false, reason: 'quota' }; }
    }).catch(function (e) { return { ok: false, reason: reasonOf(e) }; });
  }

  function reasonOf(e) {
    var n = (e && (e.name || e.message)) || '';
    if (/Quota|quota/.test(n)) return 'quota';
    if (/no-indexeddb|idb-timeout|idb-blocked/.test(n)) return 'no-store';
    if (/read-failed/.test(n)) return 'unreadable';
    return 'unknown';
  }

  function getMedia(id) {
    var fromLS = function () {
      try {
        var raw = localStorage.getItem(LS_PREFIX + id);
        if (!raw) return null;
        var o = JSON.parse(raw), b = dataURLToBlob(o.u);
        return b ? { id: id, blob: b, at: o.at, kind: o.kind } : null;
      } catch (e) { return null; }
    };
    if (!idbAvailable()) return Promise.resolve(fromLS());
    return tx('readonly').then(function (s) { return wrap(s.get(id)); })
      .then(function (r) { return r || fromLS(); })
      .catch(function () { return fromLS(); });
  }

  function allMedia(kind) {
    var lsList = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) {
          var o = JSON.parse(localStorage.getItem(k));
          if (!kind || o.kind === kind) {
            var b = dataURLToBlob(o.u);
            if (b) lsList.push({ id: k.slice(LS_PREFIX.length), blob: b, at: o.at, kind: o.kind });
          }
        }
      }
    } catch (e) { /* 読めないものは飛ばす */ }
    if (!idbAvailable()) return Promise.resolve(sortMedia(lsList));
    return tx('readonly').then(function (s) { return wrap(s.getAll()); })
      .then(function (list) {
        var all = (list || []).filter(function (r) { return r.id !== '__probe__' && (!kind || r.kind === kind); });
        return sortMedia(all.concat(lsList));
      })
      .catch(function () { return sortMedia(lsList); });
  }
  function sortMedia(l) {
    var seen = {};
    return l.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; return true; })
            .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }

  function deleteMedia(id) {
    try { localStorage.removeItem(LS_PREFIX + id); } catch (e) {}
    if (!idbAvailable()) return Promise.resolve();
    return tx('readwrite').then(function (s) { return wrap(s.delete(id)); }).catch(function () {});
  }

  function newId(kind) {
    return kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ============ アルバムの章立て ============ */
  function chapters(photos) {
    var out = [], cur = null;
    photos.forEach(function (p) {
      if (!cur || (p.at - cur.to) > 90 * 86400000) { cur = { from: p.at, to: p.at, photos: [p] }; out.push(cur); }
      else { cur.to = p.at; cur.photos.push(p); }
    });
    return out.map(function (c) {
      c.id = c.from + '|' + c.to;
      c.title = state.chapterTitles[c.id] || '';
      c.hidden = state.photoHidden.indexOf(c.id) >= 0;
      return c;
    });
  }
  function toggleHidden(id) {
    var i = state.photoHidden.indexOf(id);
    if (i >= 0) state.photoHidden.splice(i, 1); else state.photoHidden.push(id);
    save();
  }

  global.Store = {
    state: state, save: save, probe: probe, idbAvailable: idbAvailable,
    reset: function () { state = blank(); save(); },
    ymd: ymd, parseISO: parseISO, addDays: addDays, addYears: addYears, diffDays: diffDays,
    today: today, formatJP: formatJP, formatMD: formatMD, formatShort: formatShort,
    milestones: milestones, daysTogether: daysTogether,
    visitCount: visitCount, visitedOn: visitedOn, recordVisit: recordVisit,
    seasonalFor: seasonalFor, seasonalDone: seasonalDone, putSeasonal: putSeasonal,
    putMedia: putMedia, getMedia: getMedia, allMedia: allMedia, deleteMedia: deleteMedia, newId: newId,
    chapters: chapters, toggleHidden: toggleHidden
  };
})(window);
