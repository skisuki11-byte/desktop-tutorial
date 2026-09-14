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
     保存先は、この端末の中だけ。どこにも送らない。
     外に預けないので流出しようがなく、こちらの容量も気にしなくていい。
     そのかわり端末を変えるときは、バックアップを書き出して読み込ませる。

       IndexedDB   … 本命。写真も動画も、形式・大きさの制限なく入る
       localStorage … IndexedDB が使えないときの保険。写真1枚ぶん

     どこに何があるかは索引(index)に持つ。 */

  var DB = 'tomoshibi-media', STORE = 'media', dbp = null;
  var INDEX_KEY = 'tomoshibi.index.v1';
  var back = { idb: false };
  var dlNS = null;
  /* 埋め込み(iframe)で開かれているか。Safari はこの状態だと保存を
     一時的なものとして扱い、閉じたときに消すことがある。 */
  var embedded = (function () {
    try { return global.self !== global.top; } catch (e) { return true; }
  })();
  var durable = false;

  function getIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { return []; }
  }
  function setIndex(a) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function indexPut(entry) {
    var a = getIndex().filter(function (x) { return x.id !== entry.id; });
    a.push(entry); a.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
    setIndex(a);
  }
  function indexDel(id) { setIndex(getIndex().filter(function (x) { return x.id !== id; })); }
  function indexGet(id) {
    var a = getIndex();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  /* ---- IndexedDB ---- */
  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var idb = null;
      try { idb = global.indexedDB; } catch (e) { idb = null; }
      if (!idb) { rej(new Error('no-store')); return; }
      var r;
      try { r = idb.open(DB, 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('idb-error')); };
      r.onblocked = function () { rej(new Error('no-store')); };
      setTimeout(function () { rej(new Error('no-store')); }, 6000);
    });
    return dbp;
  }
  function tx(mode) { return openDB().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); }); }
  function wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('req-error')); };
    });
  }

  /* ---- localStorage ---- */
  var LS_PREFIX = 'tomoshibi.media.';
  var LS_LIMIT = 1400000;
  function blobToDataURL(b) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('unreadable')); };
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

  /* ---- 起動時のしらべ ----
     open が通っても書き込みで落ちる環境があるので、実際に書いて消すところまでやる。 */
  function probe() {
    var jobs = [];

    jobs.push(openDB().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
        var r = s.put({ id: '__probe__', blob: new Blob(['x']), at: Date.now() });
        r.onsuccess = function () { s.delete('__probe__'); res(); };
        r.onerror = function () { rej(r.error || new Error('probe')); };
      });
    }).then(function () { back.idb = true; }).catch(function () { back.idb = false; }));

    /* ブラウザに「この保存を勝手に消さないでほしい」と頼む。
       Chrome/Edge/Firefox はここで許可が下りる。Safari は
       ホーム画面に追加してあるかどうかなどで自分で判断する。 */
    jobs.push(new Promise(function (res) {
      try {
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(function (ok) { durable = !!ok; res(); }, function () { res(); });
          setTimeout(res, 3000);
          return;
        }
      } catch (e) {}
      res();
    }));

    // 書き出し口（claude.ai の画面で使う）。保存先ではなく、持ち出しにだけ使う。
    jobs.push(new Promise(function (res) {
      if (!(global.claude && typeof global.claude.use === 'function')) { res(); return; }
      var settled = false;
      var done = function () { if (!settled) { settled = true; res(); } };
      setTimeout(done, 4000);
      global.claude.use('downloads').then(function (d) { dlNS = d || null; done(); }, done);
    }));

    return Promise.all(jobs).then(migrate);
  }

  /* 索引を入れる前に保存したものを拾う。すでに入れた写真を見失わないため。 */
  function migrate() {
    if (getIndex().length) return;
    var found = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) {
          var o = JSON.parse(localStorage.getItem(k));
          found.push({ id: k.slice(LS_PREFIX.length), kind: o.kind || 'photo', at: o.at || 0, store: 'ls' });
        }
      }
    } catch (e) {}
    var p = back.idb
      ? tx('readonly').then(function (s) { return wrap(s.getAll()); }).catch(function () { return []; })
      : Promise.resolve([]);
    return p.then(function (list) {
      (list || []).forEach(function (r) {
        if (r.id === '__probe__') return;
        found.push({ id: r.id, kind: r.kind || 'photo', at: r.at || 0, store: 'idb' });
      });
      if (found.length) setIndex(found);
    });
  }

  function idbAvailable() { return back.idb; }
  function downloader() { return dlNS; }
  /* どこに保存できて、それが消されない保存かを、画面で説明するために返す。
     embedded（埋め込み表示）のときは、閉じると消えることがある。 */
  function storeInfo() {
    return { idb: back.idb, video: back.idb, photo: true,
             embedded: embedded, durable: durable && !embedded };
  }

  /* 保存。必ず解決する。失敗は {ok:false, reason} で返す。 */
  function putMedia(rec) {
    var order = rec.kind === 'video' ? ['idb'] : ['idb', 'ls'];
    return tryStores(rec, order, 0, null);
  }

  function tryStores(rec, order, i, lastReason) {
    if (i >= order.length) return Promise.resolve({ ok: false, reason: lastReason || 'no-store' });
    var next = function (reason) { return tryStores(rec, order, i + 1, reason || lastReason); };
    var w = order[i];

    if (w === 'idb') {
      if (!back.idb) return next(null);
      return tx('readwrite').then(function (s) {
        return wrap(s.put({ id: rec.id, blob: rec.blob, at: rec.at, kind: rec.kind }));
      }).then(function () {
        indexPut({ id: rec.id, kind: rec.kind, at: rec.at, store: 'idb' });
        return { ok: true, where: 'idb' };
      }).catch(function (e) { return next(reasonOf(e)); });
    }

    return blobToDataURL(rec.blob).then(function (u) {
      if (u.length > LS_LIMIT) return next('too-large');
      try {
        localStorage.setItem(LS_PREFIX + rec.id, JSON.stringify({ u: u, at: rec.at, kind: rec.kind }));
        indexPut({ id: rec.id, kind: rec.kind, at: rec.at, store: 'ls' });
        return { ok: true, where: 'ls' };
      } catch (e) { return next('quota'); }
    }).catch(function (e) { return next(reasonOf(e)); });
  }

  function reasonOf(e) {
    var n = (e && (e.name || e.message)) || '';
    if (/Quota|quota/.test(n)) return 'quota';
    if (/no-store/.test(n)) return 'no-store';
    if (/unreadable/.test(n)) return 'unreadable';
    return 'unknown';
  }

  /* 読み出し */
  function loadEntry(e) {
    if (!e) return Promise.resolve(null);
    if (e.store === 'ls') {
      try {
        var raw = localStorage.getItem(LS_PREFIX + e.id);
        if (!raw) return Promise.resolve(null);
        var o = JSON.parse(raw), b = dataURLToBlob(o.u);
        return Promise.resolve(b ? { id: e.id, kind: e.kind, at: e.at, blob: b } : null);
      } catch (x) { return Promise.resolve(null); }
    }
    if (!back.idb) return Promise.resolve(null);
    return tx('readonly').then(function (s) { return wrap(s.get(e.id)); })
      .then(function (r) { return r ? { id: e.id, kind: e.kind, at: e.at, blob: r.blob } : null; })
      .catch(function () { return null; });
  }

  function getMedia(id) { return loadEntry(indexGet(id)); }

  function allMedia(kind) {
    var entries = getIndex().filter(function (e) { return !kind || e.kind === kind; });
    return Promise.all(entries.map(loadEntry)).then(function (list) {
      return list.filter(Boolean).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    });
  }

  function deleteMedia(id) {
    var e = indexGet(id);
    indexDel(id);
    if (!e) return Promise.resolve();
    if (e.store === 'ls') { try { localStorage.removeItem(LS_PREFIX + id); } catch (x) {} return Promise.resolve(); }
    if (!back.idb) return Promise.resolve();
    return tx('readwrite').then(function (s) { return wrap(s.delete(id)); }).catch(function () {});
  }

  function newId(kind) {
    return kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* バックアップからの復元。機種を変えたときの受け口。
     いまの中身は全部消してから入れ直す。混ざるほうが分かりにくいため。 */
  function restoreAll(pack) {
    if (!pack || pack.app !== 'ともしび' || !pack.data) {
      return Promise.resolve({ ok: false, reason: 'not-tomoshibi' });
    }
    var media = pack.media || [];
    return allMedia().then(function (old) {
      return Promise.all(old.map(function (m) { return deleteMedia(m.id); }));
    }).catch(function () {}).then(function () {
      setIndex([]);
      var fails = 0;
      return media.reduce(function (p, m) {
        return p.then(function () {
          var blob = dataURLToBlob(m.dataURL);
          if (!blob) { fails++; return; }
          return putMedia({ id: m.id, blob: blob, at: m.at || Date.now(), kind: m.kind, playable: true })
            .then(function (r) { if (!r.ok) fails++; });
        });
      }, Promise.resolve()).then(function () {
        var base = blank();
        Object.keys(base).forEach(function (k) { if (k in pack.data) state[k] = pack.data[k]; });
        Object.keys(base.pet).forEach(function (k) {
          if (pack.data.pet && k in pack.data.pet) state.pet[k] = pack.data.pet[k];
        });
        save();
        return { ok: true, restored: media.length - fails, failed: fails };
      });
    });
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
    state: state, save: save, probe: probe,
    idbAvailable: idbAvailable, storeInfo: storeInfo, downloader: downloader, restoreAll: restoreAll,
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
