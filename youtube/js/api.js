/* api.js — Google の窓口。ログインと、2つのAPIへの問い合わせ。
 *
 *  使うAPIは2つ。役割がはっきり分かれている。
 *   ・YouTube Data API v3        … 動画そのもの（題名・説明・タグ・総再生回数）
 *   ・YouTube Analytics API v2   … 自分のチャンネルの成績（期間ごとの視聴・維持率・流入）
 *
 *  ログインは Google Identity Services の「トークンだけもらう」方式。
 *  自前のサーバーを持たずに済み、合言葉（クライアントシークレット）も要らない。
 *  もらったトークンはこの変数の中だけに置き、保存しない。
 *  閉じれば消える＝端末に鍵が残らない。約1時間で切れるので、
 *  切れたら黙って取り直す（画面は止めない）。
 */
(function (global) {
  'use strict';

  var GSI = 'https://accounts.google.com/gsi/client';
  var SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',          // 動画の一覧・題名・タグ
    'https://www.googleapis.com/auth/yt-analytics.readonly'      // 成績（読み取りのみ）
  ].join(' ');

  var token = null;         // メモリだけ
  var tokenAt = 0;
  var client = null;        // GIS のトークン発行係
  var loading = null;

  /* GIS の読み込み。1度だけ。 */
  function loadGsi() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      if (global.google && global.google.accounts) return resolve();
      var s = document.createElement('script');
      s.src = GSI; s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        reject(new Error('Google のログイン用スクリプトを読み込めませんでした。通信環境をご確認ください。'));
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* トークンをもらう。
     first=true のときだけ同意画面を出す。以降は黙って更新する。 */
  function requestToken(interactive) {
    return loadGsi().then(function () {
      var id = global.Store.clientId();
      if (!id) throw new Error('NO_CLIENT_ID');

      return new Promise(function (resolve, reject) {
        if (!client) {
          client = global.google.accounts.oauth2.initTokenClient({
            client_id: id,
            scope: SCOPES,
            callback: function (res) {
              if (res && res.access_token) {
                token = res.access_token;
                tokenAt = Date.now();
                resolve(token);
              } else {
                reject(new Error('ログインを完了できませんでした。'));
              }
            },
            error_callback: function (err) {
              var t = (err && err.type) || '';
              if (t === 'popup_closed' || t === 'popup_failed_to_open') {
                reject(new Error('ログイン画面が閉じられました。ポップアップの許可をご確認ください。'));
              } else {
                reject(new Error('ログインできませんでした（' + (err && err.message || t || '原因不明') + '）。'));
              }
            }
          });
        }
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      });
    });
  }

  /* APIの返事の中の、人に見せてよい説明文を取り出す。 */
  function describe(status, body) {
    var reason = '', msg = '';
    try {
      var e = body && body.error;
      msg = (e && e.message) || '';
      reason = (e && e.errors && e.errors[0] && e.errors[0].reason) || '';
    } catch (x) {}

    if (status === 401) return '認証の期限が切れました。もう一度つないでください。';
    if (status === 403 && /quota|rateLimit/i.test(reason + msg)) {
      return '1日の利用上限に達しました。日付が変わる（太平洋時間の0時）とまた使えます。';
    }
    if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(reason + msg)) {
      return 'Google Cloud 側でAPIが有効になっていません。README の手順2（YouTube Data API と YouTube Analytics API を有効化）をご確認ください。';
    }
    if (status === 403) return '権限がありません（' + (reason || status) + '）。' + msg;
    if (status === 400 && /Invalid|unknown|not supported/i.test(msg)) return 'BAD_REQUEST:' + msg;
    return 'APIエラー（' + status + '）' + (msg ? '：' + msg : '');
  }

  function call(url, retried) {
    return (token ? Promise.resolve(token) : requestToken(false)).then(function (t) {
      return fetch(url, { headers: { Authorization: 'Bearer ' + t } });
    }).then(function (res) {
      if (res.status === 401 && !retried) {   // 期限切れ。黙って取り直して1回だけやり直す
        token = null;
        return requestToken(false).then(function () { return call(url, true); });
      }
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(describe(res.status, body));
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  function qs(params) {
    return Object.keys(params)
      .filter(function (k) { return params[k] != null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  /* 同じ問い合わせは貯めた返事を使う。1日の利用上限を守るため。 */
  function cached(key, fn) {
    var hit = global.Store.cacheGet(key);
    if (hit) return Promise.resolve(hit);
    return fn().then(function (v) { global.Store.cacheSet(key, v); return v; });
  }

  global.Api = {
    scopes: SCOPES,

    connected: function () { return !!token; },
    /* 画面の「つなぐ」ボタンから。ここだけ同意画面を出す。 */
    connect: function () { return requestToken(true); },
    disconnect: function () {
      if (token && global.google && global.google.accounts) {
        try { global.google.accounts.oauth2.revoke(token); } catch (e) {}
      }
      token = null; client = null;
    },

    /* ---------- Data API（動画そのもの） ---------- */
    data: function (path, params) {
      var url = 'https://www.googleapis.com/youtube/v3/' + path + '?' + qs(params);
      return cached('d:' + url, function () { return call(url); });
    },

    /* ---------- Analytics API（成績） ----------
       ids は channel==MINE 固定。他人のチャンネルは誰も取得できない。 */
    report: function (params) {
      var p = {};
      for (var k in params) p[k] = params[k];
      p.ids = 'channel==MINE';
      var url = 'https://youtubeanalytics.googleapis.com/v2/reports?' + qs(p);
      return cached('a:' + url, function () { return call(url); });
    },

    /* 返事を {列名: 値} の配列に直す。
       生の返事は行が配列なので、列名で引けるようにしておく。 */
    rows: function (res) {
      if (!res || !res.rows || !res.columnHeaders) return [];
      var cols = res.columnHeaders.map(function (h) { return h.name; });
      return res.rows.map(function (r) {
        var o = {};
        cols.forEach(function (c, i) { o[c] = r[i]; });
        return o;
      });
    },

    /* 表示回数とクリック率が取れるチャンネルかを1度だけ試す。
       取れないチャンネル・状況があり、そのときは 400 が返る。
       画面を壊さずに「この項目は出せません」と出し分けるために先に確かめる。 */
    probeImpressions: function (startDate, endDate) {
      var known = global.Store.impressions();
      if (known != null) return Promise.resolve(known);
      return this.report({
        startDate: startDate, endDate: endDate,
        metrics: 'impressions,impressionsClickThroughRate'
      }).then(function () {
        global.Store.setImpressions(true); return true;
      }).catch(function () {
        global.Store.setImpressions(false); return false;
      });
    }
  };
})(window);
