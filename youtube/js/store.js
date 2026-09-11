/* store.js — 設定と取得済みデータの置き場所。
 *
 *  ・アクセストークンはここに入れない（メモリだけに持つ）。
 *    localStorage に置くと、他のスクリプトや端末を触れる人に読まれるため。
 *  ・クライアントIDは端末ごとに持つ。秘密ではないが、
 *    リポジトリに書くと分岐先の全員が同じ枠（1日の利用上限）を食い合うため。
 *  ・APIの返事は期限つきで貯める。同じ画面を開き直すたびに
 *    取りに行くと、1日の利用上限をすぐ使い切ってしまう。
 */
(function (global) {
  'use strict';

  var K_CFG = 'ytlab.config.v1';
  var K_CACHE = 'ytlab.cache.v1';
  var CACHE_TTL = 30 * 60 * 1000;   // 30分。分析値は1日1回しか更新されないので十分
  var CACHE_MAX = 120;              // 貯めすぎると localStorage の上限に当たる

  function read(key, fallback) {
    try {
      var s = localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var cfg = read(K_CFG, {});
  var cache = read(K_CACHE, {});

  /* 端末に保存できたかどうか。
     アプリ内ブラウザやプライベートモードは書き込みを拒むことがあり、
     黙って失敗すると「保存したのに毎回消える」ように見えるため、
     結果を持っておいて画面で知らせる。 */
  var storable = (function () {
    try {
      localStorage.setItem('ytlab.probe', '1');
      localStorage.removeItem('ytlab.probe');
      return true;
    } catch (e) { return false; }
  })();

  /* config.js に置いた値。端末の保存が使えなくてもここから読める。 */
  function baked() {
    var c = global.YTLAB_CONFIG || {};
    return (c.clientId || '').trim();
  }

  function prune() {
    var keys = Object.keys(cache);
    var now = Date.now();
    keys.forEach(function (k) {
      if (!cache[k] || now - cache[k].t > CACHE_TTL) delete cache[k];
    });
    keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.sort(function (a, b) { return cache[a].t - cache[b].t; })
        .slice(0, keys.length - CACHE_MAX)
        .forEach(function (k) { delete cache[k]; });
    }
  }

  global.Store = {
    /* ---------- 設定 ---------- */
    /* この端末で入れた値を優先し、無ければ config.js の値を使う。
       どちらも空のときだけ「未登録」になる。 */
    clientId: function () { return (cfg.clientId || '').trim() || baked(); },
    setClientId: function (v) {
      cfg.clientId = String(v || '').trim();
      return write(K_CFG, cfg);      // 保存できたかを呼び出し側に返す
    },
    /* いま使っているIDがどこから来たか。設定画面の説明に使う。 */
    clientIdSource: function () {
      if ((cfg.clientId || '').trim()) return 'device';
      if (baked()) return 'file';
      return 'none';
    },
    bakedClientId: baked,
    canStore: function () { return storable; },

    /* 期間（日数）。既定は28日＝YouTube Studio と同じ既定値 */
    days: function () { return cfg.days || 28; },
    setDays: function (n) { cfg.days = Number(n) || 28; write(K_CFG, cfg); },

    /* 「次にやること」を開いた状態で終えたか。次に開いたときも同じ状態にする。 */
    // 既定は閉じた状態。まず「いまどうなっているか」を読んでから開く順番にする。
    nextOpen: function () { return cfg.nextOpen === true; },
    setNextOpen: function (v) { cfg.nextOpen = !!v; write(K_CFG, cfg); },

    theme: function () { return cfg.theme || 'auto'; },
    setTheme: function (v) { cfg.theme = v; write(K_CFG, cfg); },

    /* 表示回数とクリック率がこのチャンネルで取れるか。
       取れるかどうかはAPI側の都合で決まるので、一度試した結果を覚えておく。 */
    impressions: function () { return cfg.impressions; },
    setImpressions: function (v) { cfg.impressions = !!v; write(K_CFG, cfg); },

    /* ---------- 取得済みデータ ---------- */
    cacheGet: function (key) {
      var e = cache[key];
      if (!e) return null;
      if (Date.now() - e.t > CACHE_TTL) { delete cache[key]; return null; }
      return e.v;
    },
    cacheSet: function (key, value) {
      cache[key] = { t: Date.now(), v: value };
      prune();
      if (!write(K_CACHE, cache)) {   // 入りきらないときは捨てて入れ直す
        cache = {}; cache[key] = { t: Date.now(), v: value };
        write(K_CACHE, cache);
      }
    },
    cacheClear: function () { cache = {}; write(K_CACHE, cache); },

    reset: function () {
      cfg = {}; cache = {};
      try { localStorage.removeItem(K_CFG); localStorage.removeItem(K_CACHE); } catch (e) {}
    }
  };
})(window);
