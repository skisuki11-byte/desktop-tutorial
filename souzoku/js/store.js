/* store.js — 端末の中だけに保存する。通信は一切しない。
 *
 * 保存するのは「相続開始日」「手続きの済」「試算結果」だけ。
 * 相談フォームの入力は保存しない（送ったら消える。app.js がメモリに持つだけ）。
 * localStorage が使えない環境（プライベートブラウズ等）でも落ちないよう、
 * 読み書きはすべて try で包み、失敗したらメモリだけで動かす。
 */
(function (global) {
  'use strict';

  var KEY = 'tsuguie.v1';

  function blank() {
    return { deathISO: '', done: {}, estimates: [] };
  }

  function coerce(v) {
    var b = blank();
    if (!v || typeof v !== 'object') return b;
    if (typeof v.deathISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.deathISO)) b.deathISO = v.deathISO;
    if (v.done && typeof v.done === 'object' && !Array.isArray(v.done)) {
      Object.keys(v.done).forEach(function (k) { if (v.done[k] === true) b.done[k] = true; });
    }
    if (Array.isArray(v.estimates)) {
      b.estimates = v.estimates.filter(function (e) {
        return e && typeof e === 'object' && typeof e.id === 'string' && /^[a-z0-9]{1,40}$/.test(e.id) &&
          typeof e.name === 'string' && e.input && typeof e.input === 'object' &&
          typeof e.input.price === 'number' && isFinite(e.input.price) && e.input.price > 0 &&
          ['house', 'land', 'condo'].indexOf(e.input.kind) >= 0 && (e.input.heirs | 0) >= 1;
      });
    }
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
    toggleDone: function (id) {
      if (state.done[id]) delete state.done[id]; else state.done[id] = true;
      save();
    },
    addEstimate: function (e) { state.estimates.unshift(e); save(); },
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
      try { global.localStorage.removeItem(KEY); } catch (e) { /* 使えない環境 */ }
    }
  };
})(window);
