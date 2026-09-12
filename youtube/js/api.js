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
  var BASE = [
    'https://www.googleapis.com/auth/youtube.readonly',          // 動画の一覧・題名・タグ
    'https://www.googleapis.com/auth/yt-analytics.readonly'      // 成績（読み取りのみ）
  ];
  // 収益はここだけ別枠にする。お金の情報は、見たいと言われてから取りに行く。
  // 最初から求めると、収益化していないチャンネルにも不要な同意を強いることになる。
  var MONEY = 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly';

  var token = null;         // メモリだけ
  var tokenAt = 0;
  var money = false;        // いま持っているトークンに収益の権限が入っているか
  var client = null;        // GIS のトークン発行係
  var clientScope = '';     // その発行係に渡した権限の並び
  var loading = null;
  var gsiTries = 0;         // ログイン用スクリプトを取りに行った回数
  var refreshing = null;    // 進行中の「黙っての取り直し」（同時に何本頼んでも1本に相乗りする）
  var pendingOk = null, pendingNg = null;  // 発行係のcallbackは使い回されるので、
                                            // 「いま待っている約束」への配線は毎回ここで最新化する

  /* ▼ 待ち時間の上限
     Google 側の仕組みは「うまくいかなかった」を必ず知らせてくれるとは限らない。
     知らせが来ないまま黙り込むと、こちらは待ち続けるしかなくなり、
     画面は「接続中…」のまま二度と進まない。
     そうさせないため、どの待ちにも必ず上限を置く。 */
  var T_SCRIPT = 12000;     // ログイン用スクリプトの読み込み
  var T_SILENT = 10000;     // 黙っての取り直し（うまくいくときは1〜2秒で返る）
  var T_PROMPT = 180000;    // 同意画面。人が操作する時間なので長めに取る

  /* 約束が時間内に片付かなければ、こちらから打ち切る。
     onTimeout で、次にやり直せるよう後始末をする。 */
  function withTimeout(promise, ms, message, onTimeout) {
    var timer = null;
    return Promise.race([
      promise.then(function (v) { clearTimeout(timer); return v; },
                   function (e) { clearTimeout(timer); throw e; }),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          if (onTimeout) { try { onTimeout(); } catch (e) {} }
          reject(new Error(message));
        }, ms);
      })
    ]);
  }

  /* GIS の読み込み。読み込めたら使い回す。

     ▼ 失敗した約束を持ち続けないこと
     以前はここで作った約束を、成否にかかわらずそのまま覚えていた。
     一度でも読み込みに失敗すると、その「失敗した約束」が残り続け、
     あとから何度つなごうとしても即座に同じ失敗を返す——つまり、
     アプリを立ち上げ直して変数が消えるまで、二度とログインできなくなる。
     （時間を空けて開くと接続中のまま進まず、落として開き直すと直る、
       という症状はこれが原因だった。）
     失敗したら覚えたものを捨て、次はまっさらからやり直す。 */
  function loadGsi() {
    if (loading) return loading;
    if (global.google && global.google.accounts) {
      loading = Promise.resolve();
      return loading;
    }
    var el = null;
    loading = withTimeout(new Promise(function (resolve, reject) {
      el = document.createElement('script');
      /* やり直しのときはURLの末尾を変える。
         ブラウザは同じURLの「まだ返事の無い取り寄せ」を1本にまとめるので、
         同じURLのまま貼り直すと、止まったままの取り寄せに相乗りしてしまい、
         やはり返事が来ない。末尾を変えると別の取り寄せとして出し直せる。 */
      el.src = GSI + (gsiTries ? '?retry=' + Date.now() : '');
      gsiTries++;
      el.async = true; el.defer = true;
      el.onload = function () { resolve(); };
      el.onerror = function () {
        reject(new Error('Google のログイン用スクリプトを読み込めませんでした。通信環境をご確認ください。'));
      };
      document.head.appendChild(el);
    }), T_SCRIPT, 'Google への接続に時間がかかっています。通信環境をご確認のうえ、もう一度お試しください。')
      .catch(function (e) {
        loading = null;                                  // 次はまっさらからやり直す
        if (el && el.parentNode) el.parentNode.removeChild(el);
        throw e;
      });
    return loading;
  }

  /* 発行係を捨てる。
     画面を長く離れたあとの発行係は、内側の仕組みが止まっていて
     いくら頼んでも返事をしないことがある。作り直せば直る。 */
  function resetClient() { client = null; clientScope = ''; }

  /* トークンをもらう。
     first=true のときだけ同意画面を出す。以降は黙って更新する。 */
  function scopes(withMoney) {
    return BASE.concat(withMoney ? [MONEY] : []).join(' ');
  }

  function requestToken(interactive, withMoney) {
    if (withMoney == null) withMoney = money;

    /* まだ期限内の通行証が端末にあれば、それを使う。
       Google に一度も問い合わせないので、いちばん速く、いちばん確実。
       黙っての取り直しは、スマホのブラウザではしばしば拒まれるため、
       そこに頼りきらない。 */
    if (!interactive) {
      var saved = global.Store.loadToken();
      if (saved && (!withMoney || saved.m)) {
        token = saved.t; money = saved.m; tokenAt = Date.now();
        return Promise.resolve(token);
      }
      /* 同時に複数のパネルが期限切れを検知しても、黙っての取り直しは1本にまとめる。
         別々に requestAccessToken() を呼ぶと、発行係のcallbackは1つしか無いため
         後から来た返事しか届かず、残りは待ち時間いっぱい待って失敗する。 */
      if (refreshing) return refreshing;
    }

    var task = loadGsi().then(function () {
      var id = global.Store.clientId();
      if (!id) throw new Error('NO_CLIENT_ID');

      var want = scopes(withMoney);
      // 権限の並びが変わったら発行係を作り直す。
      // 同じ発行係を使い回すと、前の権限のままのトークンが返ってしまう。
      if (client && clientScope !== want) { client = null; }

      var settled = false;     // 打ち切ったあとに返事が来ることがあるので、二重に扱わない
      var ask = new Promise(function (resolve, reject) {
        var ok = function (v) { if (!settled) { settled = true; resolve(v); } };
        var ng = function (e) { if (!settled) { settled = true; reject(e); } };
        /* 発行係(client)のcallbackはinitTokenClientの時点で固定され、以降使い回される。
           ここで毎回「いま待っている約束」に配線し直しておかないと、2回目以降の呼び出しは
           1回目のクロージャ（すでにsettled済み）に返事が届くだけで、二度と解決しなくなる。 */
        pendingOk = ok; pendingNg = ng;
        if (!client) {
          clientScope = want;
          client = global.google.accounts.oauth2.initTokenClient({
            client_id: id,
            scope: want,
            callback: function (res) {
              if (res && res.access_token) {
                token = res.access_token;
                tokenAt = Date.now();
                // 実際に下りた権限を見る。求めても断られることがあるため、
                // 「求めた」ではなく「下りた」で判断する。
                money = String(res.scope || '').indexOf(MONEY) >= 0;
                global.Store.setEverConnected(true);
                global.Store.saveToken(token, res.expires_in, money);
                if (pendingOk) pendingOk(token);
              } else {
                if (pendingNg) pendingNg(new Error('ログインを完了できませんでした。'));
              }
            },
            error_callback: function (err) {
              var t = (err && err.type) || '';
              var e = (t === 'popup_closed' || t === 'popup_failed_to_open')
                ? new Error('ログイン画面が閉じられました。ポップアップの許可をご確認ください。')
                : new Error('ログインできませんでした（' + (err && err.message || t || '原因不明') + '）。');
              if (pendingNg) pendingNg(e);
            }
          });
        }
        // 頼む段階で投げることがある（発行係が壊れている等）
        try { client.requestAccessToken({ prompt: interactive ? 'consent' : '' }); }
        catch (e) { ng(e); }
      });

      return withTimeout(
        ask,
        interactive ? T_PROMPT : T_SILENT,
        interactive
          ? 'ログイン画面からの返事がありませんでした。もう一度お試しください。'
          : 'SILENT_TIMEOUT',
        resetClient     // 返事が来ないときは発行係を作り直す
      ).catch(function (e) {
        // うまくいかなかった発行係は残さない。次は作り直しから始める。
        resetClient();
        throw e;
      });
    });

    if (!interactive) {
      refreshing = task.then(
        function (t) { refreshing = null; return t; },
        function (e) { refreshing = null; throw e; }
      );
      return refreshing;
    }
    return task;
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
      if (res.status === 401 && !retried) {   // 期限切れ。捨てて取り直し、1回だけやり直す
        token = null;
        global.Store.clearToken();
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
    scopes: function () { return scopes(money); },

    connected: function () { return !!token; },

    /* 画面の「つなぐ」ボタンから。
       一度許してもらったあとは、同意画面を出さずに取り直せる。
       毎回わざわざ押させ直す理由がないので、まず黙って試し、
       だめだったときだけ同意画面を出す。 */
    connect: function () {
      if (!global.Store.everConnected()) return requestToken(true);
      /* まず黙って試す。返事が来なければ10秒で打ち切り、同意画面に乗り換える。
         打ち切らずに待つと「接続中…」のまま進まなくなる。 */
      return requestToken(false).catch(function () { return requestToken(true); });
    },

    /* 画面を開いた直後に、黙ってつなぎ直す。
       Google 側に「この人はもう許可済み」と分かる状態が残っていれば、
       何も出さずにトークンが下りる。残っていなければ失敗するので、
       そのときだけ「つなぐ」ボタンを見せる。 */
    resume: function () {
      if (!global.Store.clientId() || !global.Store.everConnected()) {
        return Promise.reject(new Error('NOT_YET'));
      }
      return requestToken(false);
    },

    /* 端末に期限内の通行証があるか。画面を出す前の判断に使う
       （あるなら「つなぐ」を一瞬も見せずに済む）。 */
    hasSavedToken: function () { return !!global.Store.loadToken(); },

    /* 収益を見る権限を持っているか */
    hasMoney: function () { return money; },
    /* 収益の権限を足す。もう一度だけ同意画面が出る。
       断られた場合は money が false のままなので、呼んだ側で分かる。 */
    enableMoney: function () {
      if (money) return Promise.resolve(true);
      return requestToken(true, true).then(function () { return money; });
    },

    disconnect: function () {
      if (token && global.google && global.google.accounts) {
        try { global.google.accounts.oauth2.revoke(token); } catch (e) {}
      }
      global.Store.clearToken();
      token = null; money = false;
      resetClient();
    },

    /* 画面に戻ってきたときに呼ぶ。
       長く離れているあいだに、Google 側の仕組みが止まっていることがある。
       止まった発行係に頼むと返事が来ないので、先に捨てておく。
       端末に残した通行証はそのまま使えるので、触らない。 */
    wake: function () { resetClient(); },

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
