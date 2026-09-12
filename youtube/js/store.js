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
  var K_TOKEN = 'ytlab.token.v1';
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

    /* 一度でもつなげたか。 */
    everConnected: function () { return cfg.everConnected === true; },
    setEverConnected: function (v) { cfg.everConnected = !!v; write(K_CFG, cfg); },

    /* ---------- ログイン状態を保つ ----------
       以前は「前に通った」という事実だけを覚え、開くたびに Google へ
       黙って取り直しに行っていた。ところがこの取り直しは、
       スマホのブラウザ（とくにアプリ内ブラウザや、追跡防止が強い設定）では
       しばしば拒まれる。結果として毎回ログインになっていた。

       そこで、下りた通行証そのものを期限つきで端末に置く。
       期限内に開き直したときは、Google に一度も問い合わせずそのまま読める。

       ▼ 承知しておくこと
       ・置き場所はこの端末のこのサイト専用の領域で、他のサイトからは読めない
       ・権限は読み取り専用の2つ（＋収益を見たなら3つ）だけ。
         これを持っていても、動画の投稿・変更・削除はできない
       ・約1時間で自動的に切れる。切れたら捨てて取り直す
       ・気になる場合は設定で止められる。止めると以前と同じ動きに戻る */
    keepSignedIn: function () { return cfg.keepSignedIn !== false; },
    setKeepSignedIn: function (v) {
      cfg.keepSignedIn = !!v;
      write(K_CFG, cfg);
      if (!v) this.clearToken();
    },
    saveToken: function (token, expiresInSec, money) {
      if (!this.keepSignedIn()) return;
      // 期限ぎりぎりで使うと通信の途中で切れるので、1分手前で切れた扱いにする
      var exp = Date.now() + (Number(expiresInSec) || 3600) * 1000 - 60000;
      write(K_TOKEN, { t: token, exp: exp, m: !!money });
    },
    loadToken: function () {
      if (!this.keepSignedIn()) return null;
      var v = read(K_TOKEN, null);
      if (!v || !v.t || !(v.exp > Date.now())) { this.clearToken(); return null; }
      return v;
    },
    clearToken: function () {
      try { localStorage.removeItem(K_TOKEN); } catch (e) {}
    },

    /* 判定の詳しい説明と28日／90日の表を開いた状態で終えたか。既定は閉じた状態。 */
    verdictOpen: function () { return cfg.verdictOpen === true; },
    setVerdictOpen: function (v) { cfg.verdictOpen = !!v; write(K_CFG, cfg); },

    /* 「分析の観点」の開閉。判定より下にあり、読むかどうかは人によるので、
       畳んだ・開いたをそのまま覚える（既定は畳んだまま）。 */
    lensOpen: function () { return cfg.lensOpen === true; },
    setLensOpen: function (v) { cfg.lensOpen = !!v; write(K_CFG, cfg); },

    /* 「直近の速報値」の開閉。既定は畳んだまま
       （確定した数字ではないので、見るかどうかは人による）。 */
    provisionalOpen: function () { return cfg.provisionalOpen === true; },
    setProvisionalOpen: function (v) { cfg.provisionalOpen = !!v; write(K_CFG, cfg); },

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
      try {
        localStorage.removeItem(K_CFG);
        localStorage.removeItem(K_CACHE);
        localStorage.removeItem(K_TOKEN);
      } catch (e) {}
    }
  };
})(window);
