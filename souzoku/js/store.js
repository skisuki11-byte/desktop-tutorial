/* store.js — 端末の中だけに保存する。通信は一切しない。
 *
 * 保存するのは「相続開始日」「手続きの済」「試算結果」と、オープニング・画面の色・文字の大きさの設定だけ。
 * 相談フォームの入力は保存しない（送ったら消える。app.js がメモリに持つだけ）。
 * localStorage が使えない環境（プライベートブラウズ等）でも落ちないよう、
 * 読み書きはすべて try で包み、失敗したらメモリだけで動かす。
 */
(function (global) {
  'use strict';

  var KEY = 'tsuguie.v1';
  var MAX_EST = 2;   // 試算の保存は2件まで（比較用）

  function blank() {
    return { deathISO: '', done: {}, estimates: [], skipIntro: false, theme: 'auto', textSize: 'normal' };
  }

  /* 読み込んだ試算を、決まった形・型・範囲に作り直す（改ざんされたファイルでも画面や計算が壊れないように）。
     知らない項目は捨て、数字は有限の範囲に収め、文字は長さを切る。形が合わなければ null。 */
  var YEN_MAX = 1e11;   // 1,000億円。これより大きい金額は入力ミスか改ざん
  function yenOf(n) { return typeof n === 'number' && isFinite(n) && n > 0 ? Math.min(Math.round(n), YEN_MAX) : 0; }
  function txt(s, max) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : ''; }
  function iso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
  function cleanEstimate(e) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !/^[a-z0-9]{1,40}$/.test(e.id)) return null;
    var i = e.input;
    if (!i || typeof i !== 'object' || ['house', 'land', 'condo'].indexOf(i.kind) < 0) return null;
    var price = yenOf(i.price), heirs = typeof i.heirs === 'number' ? Math.floor(i.heirs) : NaN;
    if (!price || !(heirs >= 1)) return null;
    var house = i.kind === 'house', y = typeof i.acqYear === 'number' ? Math.floor(i.acqYear) : 0;
    var input = {
      kind: i.kind, price: price, acqKnown: i.acqKnown === true, acqPrice: yenOf(i.acqPrice),
      acqYear: y >= 1900 && y <= 2100 ? y : 0, heirs: Math.min(heirs, 50),
      vacant: i.vacant === true, unusedAfter: i.unusedAfter === true,
      builtBefore1981: house && i.builtBefore1981 === true, livedAlone: house && i.livedAlone === true,
      renovateOrDemolish: house && i.renovateOrDemolish === true,
      otherCost: yenOf(i.otherCost), holdTaxYear: yenOf(i.holdTaxYear), holdOtherYear: yenOf(i.holdOtherYear),
      deathISO: iso(i.deathISO), saleISO: iso(i.saleISO), want: yenOf(i.want),
      basis: ['market', 'want', 'own'].indexOf(i.basis) >= 0 ? i.basis : '',
      pref: typeof i.pref === 'string' && /^\d{2}$/.test(i.pref) ? i.pref : '', prefName: txt(i.prefName, 10),
      city: typeof i.city === 'string' && /^\d{5}$/.test(i.city) ? i.city : '', cityName: txt(i.cityName, 30),
      builtYear: typeof i.builtYear === 'number' && i.builtYear >= 1900 && i.builtYear <= 2100 ? Math.floor(i.builtYear) : 0,
      district: txt(i.district, 30), size: typeof i.size === 'number' && isFinite(i.size) && i.size > 0 ? Math.min(i.size, 1e7) : 0,
      market: null
    };
    var m = i.market;
    if (m && typeof m === 'object' && yenOf(m.mid)) {
      input.market = { mid: yenOf(m.mid), low: yenOf(m.low), high: yenOf(m.high), how: txt(m.how, 60),
        count: typeof m.count === 'number' && isFinite(m.count) ? Math.max(0, Math.min(Math.floor(m.count), 1e6)) : 0,
        years: txt(m.years, 20), scope: m.scope === 'district' ? 'district' : 'city', place: txt(m.place, 60) };
    }
    return { id: e.id, name: txt(e.name, 60) || '試算', createdISO: iso(e.createdISO), input: input };
  }

  function coerce(v) {
    var b = blank();
    if (!v || typeof v !== 'object') return b;
    if (typeof v.deathISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.deathISO)) b.deathISO = v.deathISO;
    if (v.done && typeof v.done === 'object' && !Array.isArray(v.done)) {
      Object.keys(v.done).forEach(function (k) { if (v.done[k] === true && /^[a-z0-9_-]{1,40}$/.test(k)) b.done[k] = true; });
    }
    if (v.skipIntro === true) b.skipIntro = true;
    if (v.theme === 'light' || v.theme === 'dark') b.theme = v.theme;
    if (v.textSize === 'large') b.textSize = 'large';
    if (Array.isArray(v.estimates)) {
      b.estimates = v.estimates.map(cleanEstimate).filter(Boolean);
    }
    b.estimates = b.estimates.slice(0, MAX_EST);
    return b;
  }

  var persistent = true;
  var state = (function () {
    try {
      var raw = global.localStorage.getItem(KEY);
      return coerce(raw ? JSON.parse(raw) : null);
    } catch (e) {
      persistent = false;
      return blank();
    }
  })();

  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { persistent = false; return false; }
  }

  global.TGStore = {
    get: function () { return state; },
    isPersistent: function () { return persistent; },
    setDeath: function (iso) { state.deathISO = iso; save(); },
    setSkipIntro: function (on) { state.skipIntro = !!on; save(); },
    setTextSize: function (t) { state.textSize = t === 'large' ? 'large' : 'normal'; save(); },
    setTheme: function (t) { state.theme = (t === 'light' || t === 'dark') ? t : 'auto'; save(); },
    toggleDone: function (id) {
      if (state.done[id]) delete state.done[id]; else state.done[id] = true;
      save();
    },
    MAX_ESTIMATES: MAX_EST,
    /* 比較用に2件まで。超えたら、古いもの（末尾）を消して入れる。消したものを返す */
    addEstimate: function (e) {
      state.estimates.unshift(e);
      var dropped = state.estimates.length > MAX_EST ? state.estimates.splice(MAX_EST) : [];
      save();
      return dropped;
    },
    getEstimate: function (id) {
      for (var i = 0; i < state.estimates.length; i++) if (state.estimates[i].id === id) return state.estimates[i];
      return null;
    },
    removeEstimate: function (id) {
      state.estimates = state.estimates.filter(function (e) { return e.id !== id; });
      save();
    },
    exportJSON: function () {
      return JSON.stringify({ app: 'tsuguie', v: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
    },
    importJSON: function (text) {
      var obj = JSON.parse(text);
      if (!obj || obj.app !== 'tsuguie') throw new Error('つぐいえの書き出しファイルではありません');
      state = coerce(obj.data);
      save();
    },
    clearAll: function () {
      state = blank();
      try { global.localStorage.removeItem(KEY); global.localStorage.removeItem('tsuguie.memo.v1'); } catch (e) { /* 使えない環境 */ }
    }
  };
})(window);
