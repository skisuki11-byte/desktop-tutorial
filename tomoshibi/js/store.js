/* store.js — ともしび の保存層と、日付まわりの計算。
 *
 * 保存先を2つに分けている:
 *   localStorage … なまえ・命日・お参りの記録など、小さくて壊れると困るもの
 *   IndexedDB    … 写真の実体。localStorage は数MBで頭打ちになるため
 *
 * どちらも端末の中だけで完結する。通信は一切しない。
 */
(function (global) {
  'use strict';

  var KEY = 'tomoshibi.v1';

  /* ============ 既定値 ============ */
  function blank() {
    return {
      onboarded: false,
      pet: { name: '', deathISO: '', birthISO: '', calendar: 'buddhist' },
      visits: [],        // お参りした日 "YYYY-MM-DD" の配列
      freqNudge: 0,      // +1=もう少し会いたい / -1=もう少し間をあける
      hiddenChapters: [],// 出さない期間 [{from,to}]
      chapterTitles: {}, // { "from|to": "つけた名前" }
      reunionSeen: [],   // 再会を見た年 [2027, ...]
      theme: 'dark',
      dateOffset: 0      // 確認用に今日を進める日数。通常は0
    };
  }

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var v = JSON.parse(raw);
      var base = blank();
      // 保存済みの版に無いキーが増えても壊れないよう、既定値に上書きする
      Object.keys(base).forEach(function (k) { if (!(k in v)) v[k] = base[k]; });
      Object.keys(base.pet).forEach(function (k) { if (!(k in v.pet)) v.pet[k] = base.pet[k]; });
      return v;
    } catch (e) {
      return blank();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* 保存できなくても画面は動かす */ }
  }

  /* ============ 日付 ============
     すべてローカル時刻の「日」として扱う。UTCに変換すると
     日本時間の朝が前日になり、命日が1日ずれるため。 */

  function ymd(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseISO(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length < 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  /* 月や年を足すとき、2月29日や31日は月末に丸める。
     丸めないと 1/31 + 1ヶ月 が 3/2 になり、月命日がずれる。 */
  function addMonths(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  }
  function addYears(d, n) { return addMonths(d, n * 12); }

  function diffDays(from, to) {
    var a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
  }

  function today() {
    var d = new Date();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return state.dateOffset ? addDays(d, state.dateOffset) : d;
  }

  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function formatJP(d, withWeek) {
    var s = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return withWeek ? s + '（' + WEEK[d.getDay()] + '）' : s;
  }
  function formatShort(d) {
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
  }

  /* ============ 節目 ============ */

  /* 次に来る月命日。命日と同じ日にちで、今日以降のいちばん近いもの。 */
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

  /* 次に来る「毎年の同じ日」。誕生日と、仏式でないときの命日に使う。 */
  function nextAnniversary(base, from) {
    for (var i = 0; i < 3; i++) {
      var last = new Date(from.getFullYear() + i, base.getMonth() + 1, 0).getDate();
      var cand = new Date(from.getFullYear() + i, base.getMonth(), Math.min(base.getDate(), last));
      if (diffDays(from, cand) >= 0) return cand;
    }
    return null;
  }

  /* これから来る節目を、近い順に返す。
     四十九日・一周忌・三回忌は命日を1日目・1年目として数える日本の数え方に合わせる
     （四十九日＝命日の48日後、三回忌＝満2年）。 */
  function milestones(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return [];
    var cal = state.pet.calendar;
    var out = [];

    function push(key, label, date, note) {
      if (!date) return;
      var n = diffDays(from, date);
      if (n < 0) return;
      out.push({ key: key, label: label, date: date, days: n, note: note || '' });
    }

    if (cal === 'buddhist') {
      push('d49', '四十九日', addDays(death, 48), formatJP(addDays(death, 48), true));
      push('d100', '百か日', addDays(death, 99), formatJP(addDays(death, 99), true));
      var mm = nextMonthly(death, from);
      push('monthly', '月命日', mm, '毎月' + death.getDate() + '日' + (mm ? '／次は' + (mm.getMonth() + 1) + '月' + mm.getDate() + '日' : ''));
      push('y1', '一周忌', addYears(death, 1), formatJP(addYears(death, 1), true));
      push('y3', '三回忌', addYears(death, 2), formatJP(addYears(death, 2), true));
      push('y7', '七回忌', addYears(death, 6), formatJP(addYears(death, 6), true));
    } else {
      var an = nextAnniversary(death, from);
      push('anniv', '命日', an, an ? formatJP(an, true) : '');
    }

    var b = parseISO(state.pet.birthISO);
    if (b) {
      var nb = nextAnniversary(b, from);
      // 亡くなったあとの年齢は書かない。生まれ年だけを添える。
      push('birthday', 'お誕生日', nb, nb ? formatJP(nb, true) + '・' + b.getFullYear() + '年うまれ' : '');
    }

    out.sort(function (a, c) { return a.days - c.days; });

    // 月命日が一周忌などと同じ日に重なったら、大きいほうだけ残す
    var big = {};
    out.forEach(function (m) { if (m.key !== 'monthly') big[ymd(m.date)] = true; });
    out = out.filter(function (m) { return !(m.key === 'monthly' && big[ymd(m.date)]); });

    // 四十九日がまだ先のあいだは、日付順で先に来る月命日よりそちらを先頭に置く。
    // この時期に人が数えているのは四十九日で、ホームの1行とも先頭を揃える。
    var i49 = -1;
    out.forEach(function (m, i) { if (m.key === 'd49') i49 = i; });
    if (i49 > 0) out.unshift(out.splice(i49, 1)[0]);

    return out;
  }

  /* ============ 会う回数の逓減 ============
     0=毎日 / 1=月命日 / 2=季節ごと / 3=命日。
     設定させず日数で自動的に進み、「もう少し」で1段だけ動かせる。 */
  var PHASE_LABEL = ['毎日', '月命日', '季節ごと', '命日'];

  function basePhase(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return 0;
    var d = diffDays(death, from);
    if (d <= 49) return 0;
    if (d <= 180) return 1;
    if (d <= 364) return 2;
    return 3;
  }

  function phase(from) {
    var p = basePhase(from) - state.freqNudge;
    return Math.max(0, Math.min(3, p));
  }

  /* 今日が「お参りの日」か。押せるかどうかではなく、
     主ボタンとして前に出すかどうかの判断に使う。 */
  function isVisitDay(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return true;
    var p = phase(from);
    if (p === 0) return true;

    var sameDay = from.getDate() === death.getDate() ||
      from.getDate() === new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate() &&
      death.getDate() > from.getDate();
    var monthsApart = (from.getFullYear() - death.getFullYear()) * 12 + (from.getMonth() - death.getMonth());

    if (p === 1) return sameDay;
    if (p === 2) return sameDay && monthsApart % 3 === 0;
    return isAnniversary(from);
  }

  /* 命日（年がまたがっているもの）かどうか。 */
  function isAnniversary(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return false;
    return from.getFullYear() > death.getFullYear() &&
      from.getMonth() === death.getMonth() && from.getDate() === death.getDate();
  }

  /* 再会を渡してよい日か。
     企画どおり、四十九日より前には出さない。一周忌以降の命日だけ。 */
  function isReunionDay(from) {
    return isAnniversary(from);
  }

  /* ============ お参りの記録 ============ */
  function visitedOn(d) { return state.visits.indexOf(ymd(d)) >= 0; }
  function recordVisit(d) {
    var k = ymd(d);
    if (state.visits.indexOf(k) < 0) { state.visits.push(k); state.visits.sort(); save(); }
  }

  /* ============ 写真（IndexedDB） ============ */
  var DB = 'tomoshibi-photos', STORE = 'photos', dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!global.indexedDB) { rej(new Error('indexedDB なし')); return; }
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var os = d.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('takenAt', 'takenAt');
        }
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }

  function tx(mode) {
    return db().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
  }
  function wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function putPhoto(rec) { return tx('readwrite').then(function (s) { return wrap(s.put(rec)); }); }
  function getPhoto(id) { return tx('readonly').then(function (s) { return wrap(s.get(id)); }); }
  function allPhotos() {
    return tx('readonly').then(function (s) { return wrap(s.getAll()); })
      .then(function (list) {
        return (list || []).filter(function (p) { return p.id !== 'portrait'; })
          .sort(function (a, b) { return a.takenAt - b.takenAt; });
      });
  }
  function deletePhoto(id) { return tx('readwrite').then(function (s) { return wrap(s.delete(id)); }); }

  /* ============ アルバムの章立て ============
     撮影日が90日以上空いたところで章を切る。
     AIに書かせる章題はこの端末では作れないので、既定は期間表示にして、
     題は本人がつけられるようにしている。 */
  function chapters(photos) {
    var out = [], cur = null;
    photos.forEach(function (p) {
      if (!cur || (p.takenAt - cur.to) > 90 * 86400000) {
        cur = { from: p.takenAt, to: p.takenAt, photos: [p] };
        out.push(cur);
      } else {
        cur.to = p.takenAt;
        cur.photos.push(p);
      }
    });
    return out.map(function (c) {
      c.id = c.from + '|' + c.to;
      c.title = state.chapterTitles[c.id] || '';
      c.hidden = state.hiddenChapters.indexOf(c.id) >= 0;
      return c;
    });
  }

  function toggleHidden(id) {
    var i = state.hiddenChapters.indexOf(id);
    if (i >= 0) state.hiddenChapters.splice(i, 1); else state.hiddenChapters.push(id);
    save();
  }

  global.Store = {
    state: state, save: save,
    reset: function () { state = blank(); save(); },
    ymd: ymd, parseISO: parseISO, addDays: addDays, addMonths: addMonths, addYears: addYears,
    diffDays: diffDays, today: today, formatJP: formatJP, formatShort: formatShort,
    milestones: milestones, phase: phase, basePhase: basePhase, PHASE_LABEL: PHASE_LABEL,
    isVisitDay: isVisitDay, isAnniversary: isAnniversary, isReunionDay: isReunionDay,
    visitedOn: visitedOn, recordVisit: recordVisit,
    putPhoto: putPhoto, getPhoto: getPhoto, allPhotos: allPhotos, deletePhoto: deletePhoto,
    chapters: chapters, toggleHidden: toggleHidden
  };
})(window);
