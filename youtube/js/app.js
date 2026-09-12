/* app.js — 画面の組み立て。
 *
 *  方針:
 *   ・開いたタブの分だけ問い合わせる。1日に使える回数に上限があるため、
 *     見てもいない画面のために枠を使わない。
 *   ・1か所が取れなくても、その枠だけ理由を出して他は描く。
 *     どれか1つのエラーで画面全部が白くなるのがいちばん困るため。
 *   ・数字は必ず「いつからいつまで」と一緒に出す。期間の分からない数字は読めない。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var esc = Chart.esc;

  /* 分析値が確定するまで2〜3日かかる。
     昨日までを入れると、あとから増えて「減った」ように見えるので、
     3日前を終わりにする。 */
  var LAG_DAYS = 3;

  /* 日ごとの推移で取る指標。概要でも診断でも同じ並びを使う。
     文字列が同じなら問い合わせ先のURLも同じになるので、
     控えが共用でき、2か所で違う数字が出る事故も起きない。 */
  var DAILY = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,' +
    'subscribersGained,subscribersLost,likes,comments,shares';

  var S = {
    channel: null,
    videos: {},      // videoId -> Data API の1件
    period: {},      // 期間内の成績（動画ごと）
    loaded: {},      // 読み込み済みのタブ
    view: 'setup'
  };

  /* ========== 日付 ========== */
  function ymd(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function shift(base, days) { var d = new Date(base); d.setDate(d.getDate() + days); return d; }
  /* n日ぶんの窓と、その直前の同じ長さの窓。
     診断は画面の期間指定と関係なく 28日と90日で見るので、
     日数から窓を作れるようにしておく。 */
  function windowOf(n) {
    var end = shift(new Date(), -LAG_DAYS);
    var start = shift(end, -(n - 1));
    return {
      days: n,
      start: ymd(start), end: ymd(end),
      prevStart: ymd(shift(start, -n)), prevEnd: ymd(shift(start, -1))
    };
  }
  function period() { return windowOf(Store.days()); }

  /* 「確定した数字」の締めより後ろ、いままだ集計が動いている日。
     LAG_DAYS ぶん（既定3日）。いちばん最後（今日）はまだ1日が終わっていないので、
     他の2日と違う注意を添える。 */
  function provisionalWindow() {
    var end = new Date();
    var start = shift(end, -(LAG_DAYS - 1));
    return { start: ymd(start), end: ymd(end), today: ymd(end) };
  }

  /* ========== 見せ方の共通部品 ========== */
  function fmtWatch(min) {
    if (min >= 60000) return Math.round(min / 60).toLocaleString('ja-JP') + '時間';
    if (min >= 60) return (min / 60).toFixed(1) + '時間';
    return Math.round(min).toLocaleString('ja-JP') + '分';
  }
  function fmtDelta(now, before) {
    if (before == null || !isFinite(before)) return '';
    // 前が0以下だと「何％増えた」に意味がない（−10→＋10 を「200%増」とは言えない）
    if (before < 0) return '';
    if (!before) return now ? '<span class="delta up">新規</span>' : '';
    var r = (now - before) / before * 100;
    var cls = r > 0.5 ? 'up' : r < -0.5 ? 'down' : 'flat';
    var sign = r > 0.5 ? '＋' : r < -0.5 ? '−' : '±';
    return '<span class="delta ' + cls + '">' + sign + Math.abs(r).toFixed(1) + '%</span>';
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 3600);
  }
  /* ▼ 待たせるときは、必ず抜け道を用意する
     通信の相手はこちらの都合では動かない。返事が来ないことは必ず起きる。
     そのとき「接続中…」だけが出たまま何も押せないと、
     アプリを落として開き直すしか手がなくなる。
     しばらく返事が無ければ、理由と「やり直す」ボタンを出す。 */
  var STUCK_MS = 15000;

  function busy(on, text) {
    var host = $('loading');
    host.hidden = !on;
    if (text) $('loadingText').textContent = text;
    clearTimeout(host._stuck);
    $('loadingStuck').hidden = true;
    if (on) {
      host._stuck = setTimeout(function () { $('loadingStuck').hidden = false; }, STUCK_MS);
    }
  }
  function panelError(host, err) {
    host.innerHTML = '<p class="error-box">' + esc(err && err.message || String(err)) + '</p>';
  }
  /* 1枠ぶんの取得。失敗してもそこだけで止める。 */
  function fill(hostId, promise, render) {
    var host = $(hostId);
    if (!host) return Promise.resolve();
    host.innerHTML = '<p class="skeleton">読み込んでいます…</p>';
    return promise.then(function (res) { render(host, res); })
      .catch(function (e) { panelError(host, e); });
  }

  /* ========== コード → 日本語 ========== */
  var TRAFFIC = {
    YT_SEARCH: 'YouTube検索', RELATED_VIDEO: '関連動画からのおすすめ', SUBSCRIBER: '登録フィード・ホーム',
    EXT_URL: '外部サイト', PLAYLIST: '再生リスト再生中', YT_PLAYLIST_PAGE: '再生リストのページ',
    YT_CHANNEL: 'チャンネルページ', NOTIFICATION: '通知', NO_LINK_EMBEDDED: '埋め込み（リンクなし）',
    NO_LINK_OTHER: 'リンクなし（その他）', END_SCREEN: '終了画面', ANNOTATION: 'アノテーション',
    CAMPAIGN_CARD: 'カード', ADVERTISING: '広告', PROMOTED: '有料プロモーション',
    SHORTS: 'ショートフィード', SOUND_PAGE: 'サウンドのページ', HASHTAGS: 'ハッシュタグ',
    VIDEO_REMIXES: 'リミックス', PRODUCT_PAGE: '商品ページ', IMMERSIVE: '没入型フィード',
    LIVE_REDIRECT: 'ライブからの転送', YT_OTHER_PAGE: 'その他のYouTubeページ'
  };
  var PLAYBACK = {
    WATCH: '通常の再生ページ', EMBEDDED: '他サイトへの埋め込み', CHANNEL: 'チャンネルページ',
    MOBILE: 'モバイル（旧）', SEARCH: '検索結果の画面', BROWSE: 'ホーム・登録などの一覧',
    YOUTUBE_GAMING: 'YouTube Gaming', EXTERNAL_APP: '外部アプリ'
  };
  var DEVICE = {
    MOBILE: 'スマートフォン', TABLET: 'タブレット', DESKTOP: 'パソコン', TV: 'テレビ',
    GAME_CONSOLE: 'ゲーム機', UNKNOWN_PLATFORM: '不明'
  };
  var AGES = {
    'age13-17': '13〜17歳', 'age18-24': '18〜24歳', 'age25-34': '25〜34歳', 'age35-44': '35〜44歳',
    'age45-54': '45〜54歳', 'age55-64': '55〜64歳', 'age65-': '65歳以上'
  };
  var regionName = (function () {
    try {
      var dn = new Intl.DisplayNames(['ja'], { type: 'region' });
      return function (c) { try { return dn.of(c) || c; } catch (e) { return c; } };
    } catch (e) { return function (c) { return c; }; }
  })();

  /* ========== 起動 ========== */
  function boot() {
    applyTheme();
    syncPeriodButtons();
    $('clientId').value = (Store.clientIdSource() === 'device') ? Store.clientId() : '';
    $('originHint').textContent =
      'Google Cloud の「承認済みの JavaScript 生成元」には ' + location.origin + ' を登録してください。';
    $('setupHint').hidden = !!Store.clientId();
    renderIdStatus();

    $('btnTheme').addEventListener('click', cycleTheme);
    $('btnConnect').addEventListener('click', connect);
    /* 待たされたときの抜け道。端末に残った通行証を捨て、
       同意画面から作り直す。1回押せば必ず前に進む道にする。 */
    $('btnRetryConnect').addEventListener('click', function () {
      busy(false);
      Api.wake();
      Store.clearToken();
      connect();
    });
    $('btnReload').addEventListener('click', function () {
      Store.cacheClear(); S.loaded = {}; loadDash(true, S.view);
    });
    $('period').addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b || String(Store.days()) === b.dataset.days) return;
      Store.setDays(b.dataset.days);
      syncPeriodButtons();
      S.loaded = {}; S.unsubsState = null;
      // いま見ている画面のまま、その画面の数字だけ入れ替える。
      // 収益を見ているときに期間を押して概要へ飛ばされるのでは、
      // 「収益を1年で見たい」という当たり前のことができない。
      loadDash(true, S.view);
    });
    $('btnSettings').addEventListener('click', function () {
      show(S.view === 'settings' ? 'dash' : 'settings');
    });
    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (b) show(b.dataset.view);
    });
    $('btnSaveId').addEventListener('click', function () {
      var v = $('clientId').value.trim();
      if (v && !/\.apps\.googleusercontent\.com$/.test(v)) {
        return toast('クライアントIDは .apps.googleusercontent.com で終わります。取り違えていませんか。');
      }
      var ok = Store.setClientId(v);
      $('setupHint').hidden = !!Store.clientId();
      renderIdStatus();
      if (!ok) {
        // 黙って消えるのがいちばん困るので、はっきり言う
        toast('このブラウザには保存できませんでした。今回だけ有効です。config.js に書いておく方法をREADMEに記載しています。');
      } else {
        toast(v ? '保存しました。「概要」の上にある↻か、接続からお試しください。' : 'この端末の設定を消しました。');
      }
    });
    $('keepSignedIn').checked = Store.keepSignedIn();
    $('keepSignedIn').addEventListener('change', function () {
      Store.setKeepSignedIn(this.checked);
      toast(this.checked
        ? '次からは、期限内なら開くだけで読めます。'
        : '端末に置いた通行証を消しました。次からは開くたびに接続し直します。');
    });
    $('btnClearCache').addEventListener('click', function () {
      Store.cacheClear(); S.loaded = {}; toast('貯めたデータを消しました。');
    });
    $('btnDisconnect').addEventListener('click', function () {
      Api.disconnect(); Store.cacheClear(); Store.setEverConnected(false);
      S = { channel: null, videos: {}, period: {}, loaded: {}, view: 'setup' };
      $('tabs').hidden = true; $('filterbar').hidden = true;
      $('btnReload').hidden = true; $('btnSettings').hidden = true;
      document.querySelector('.brand-text').classList.remove('is-connected');
      $('brandTitle').textContent = 'チャンネル分析';
      $('brandSub').textContent = '未接続';
      show('setup');
      toast('接続を解除しました。');
    });
    $('btnResetAll').addEventListener('click', function () {
      if (!confirm('クライアントIDと貯めたデータをすべて消します。よろしいですか。')) return;
      Api.disconnect(); Store.reset(); location.reload();
    });
    $('btnEnableMoney').addEventListener('click', function () {
      $('revenueError').hidden = true;
      busy(true, 'Google の同意画面を開いています…');
      Api.enableMoney().then(function (ok) {
        busy(false);
        if (!ok) {
          $('revenueError').hidden = false;
          $('revenueError').textContent = '収益を見る権限が下りませんでした。同意画面で「YouTube の収益レポートの表示」にチェックが入っているかご確認ください。';
          return;
        }
        S.loaded.revenue = false;
        loadRevenue();
      }).catch(function (e) {
        busy(false);
        $('revenueError').hidden = false;
        $('revenueError').textContent = e.message;
      });
    });
    $('btnReport').addEventListener('click', makeReport);
    $('btnCopyForClaude').addEventListener('click', copyForClaude);
    $('videoSearch').addEventListener('input', renderVideoTable);
    $('videoSort').addEventListener('change', renderVideoTable);
    $('sheetBg').addEventListener('click', closeSheet);
    $('btnSheetClose').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  }

  /* いま選ばれている期間に印をつける。
     押せる場所と、いま選ばれているものが一目で分かる状態を保つ。 */
  function syncPeriodButtons() {
    var now = String(Store.days());
    document.querySelectorAll('#period .seg').forEach(function (b) {
      var on = b.dataset.days === now;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* 開いた直後に、黙ってつなぎ直す。
     前に許可してあれば、そのまま概要まで進む。
     だめだったときは何も言わずに「つなぐ」の画面を出す
     （失敗を知らせても、押す場所は同じなので邪魔になるだけ）。 */
  function autoConnect() {
    if (!Store.clientId() || !Store.everConnected()) return;
    busy(true, '前回の接続で読み込んでいます…');
    Api.resume().then(function () {
      return loadDash(false);
    }).catch(function (e) {
      busy(false);
      /* 黙ってのつなぎ直しは、時間が空くと通らないことがある。
         通らなかったことを隠して待たせ続けず、
         1回押せば済む形にして前に出す。 */
      if (!S.channel) {
        show('setup');
        $('setupError').hidden = false;
        $('setupError').textContent = (e && e.message === 'SILENT_TIMEOUT') || !e
          ? '前回の接続の期限が切れていました。下の「Google アカウントでつなぐ」を押してください。'
          : e.message;
      }
    });
  }

  /* 画面に戻ってきたとき。
     長く離れていると、端末に置いた通行証の期限（約1時間）が切れている。
     その状態で放っておくと、次に何か押したときに固まったように見えるので、
     戻ってきた時点で Google 側の発行係を作り直しておく。 */
  function watchWake() {
    var away = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { away = Date.now(); return; }
      if (!away || Date.now() - away < 60000) return;   // 少し離れただけなら何もしない
      away = 0;
      Api.wake();
      // 通行証が切れていて、まだ何も読めていなければ、つなぎ直しを試す
      if (!S.channel && Store.everConnected() && $('loading').hidden) autoConnect();
    });
  }

  /* 上部に、チャンネル名と登録者数を出す。
     つないだあとは、アプリ名より「いま何人か」のほうが知りたい情報なので、
     大きいほうの行をチャンネル名に譲る。

     ▼ 「リアルタイム」について正直に書いておくこと
     YouTube は2019年から、APIで返す登録者数を上位3桁に丸めている。
     12,437人なら 12,400 と返る。これは所有者が自分のチャンネルを見ても同じで、
     正確な数はYouTube Studio でしか見られない。
     Social Blade などの「リアルタイム登録者数」も、同じ丸めた値を
     何度も取り直しているだけで、1人単位では動かない。
     そのため、ここでは丸めた値に加えて、
     正確に取れる「直近28日の純増」を並べて出す。 */
  /* 上部の表示。つないだあとは、アプリ名より「いま何人か」のほうが
     知りたい情報なので、チャンネル名を小さい行に下げ、
     登録者数をいちばん大きい字にする。

     ▼ 取り直さない理由
     YouTube は2019年から、APIで返す登録者数を上位3桁に丸めている。
     12,437人なら 12,400 と返り、これは所有者が自分のチャンネルを見ても同じ。
     つまり何分おきに取り直しても数字は動かない。
     通信と1日の利用枠を使うだけなので、つないだ時点の値をそのまま出す。
     取り直したいときは上の「↻」を押せばよい。
     右に添える直近28日の純増のほうは、丸められていない正確な値。 */
  function renderBrand() {
    if (!S.channel) return;
    var st = S.channel.statistics || {};
    var box = document.querySelector('.brand-text');
    box.classList.add('is-connected');

    $('brandTitle').textContent = S.channel.snippet.title;
    var html = '<b>' + Chart.fmtInt(Number(st.subscriberCount || 0)) + '</b><span class="brand-unit">人</span>';
    if (S.subsDelta != null) {
      html += '<span class="brand-delta ' + (S.subsDelta >= 0 ? 'up' : 'down') + '">' +
        (S.subsDelta >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(S.subsDelta)) + '</span>';
    }
    var sub = $('brandSub');
    sub.innerHTML = html;
    sub.title = '登録者数。YouTube は上位3桁に丸めて返すため、正確な数は YouTube Studio でのみ確認できます。' +
      '右の数字は直近28日の純増で、こちらは正確な値です。';
  }

  function applyTheme() {
    var t = Store.theme();
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var next = order[(order.indexOf(Store.theme()) + 1) % 3];
    Store.setTheme(next); applyTheme();
    toast({ auto: '端末の設定に合わせます', light: '明るい配色', dark: '暗い配色' }[next]);
  }

  function show(view) {
    S.view = view;
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = $('view-' + view);
    if (target) target.classList.add('active');

    var active = null;
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.dataset.view === view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-current', on ? 'page' : 'false');
      if (on) active = t;
    });
    // 選んだタブが端に隠れたままにならないよう、見える位置へ寄せる
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    }
    $('btnSettings').classList.toggle('is-on', view === 'settings');
    // 期間は中身の画面にだけ効く。設定では出さない。
    $('filterbar').hidden = !(S.channel && view !== 'settings');

    window.scrollTo(0, 0);
    if (view === 'videos') loadVideos();
    if (view === 'revenue') loadRevenue();
    if (view === 'traffic') loadTraffic();
    if (view === 'audience') loadAudience();
    if (view === 'audit') loadAudit();
  }

  /* ========== 接続 ========== */
  function connect() {
    if (!Store.clientId()) {
      $('setupError').hidden = false;
      $('setupError').innerHTML = 'まず「設定」でクライアントIDを登録してください。作り方は <a href="README.md">README</a> にあります。';
      show('settings');
      return;
    }
    $('setupError').hidden = true;
    busy(true, 'Google に接続しています…');
    Api.connect().then(function () {
      return loadDash(false);
    }).catch(function (e) {
      $('setupError').hidden = false;
      $('setupError').textContent = e.message === 'NO_CLIENT_ID'
        ? 'クライアントIDが未登録です。' : e.message;
    }).then(function () { busy(false); });
  }

  /* ========== 概要 ========== */
  function loadDash(refresh, stayOn) {
    var p = period();
    busy(true, 'チャンネルの情報を読み込んでいます…');

    return Api.data('channels', {
      part: 'snippet,statistics,contentDetails', mine: 'true'
    }).then(function (res) {
      var ch = res.items && res.items[0];
      if (!ch) throw new Error('このアカウントに YouTube チャンネルが見つかりません。チャンネルを持つアカウントでログインしてください。');
      S.channel = ch;
      $('tabs').hidden = false; $('btnReload').hidden = false; $('btnSettings').hidden = false;
      renderBrand();
      show(stayOn && $('view-' + stayOn) ? stayOn : 'dash');

      $('rangeNote').innerHTML =
        '<b>' + p.start + '</b> 〜 <b>' + p.end + '</b>（' + p.days + '日間）の成績です。' +
        '<span class="hint">YouTube の集計は確定までに数日かかるため、直近' + LAG_DAYS + '日は含めていません。</span>';

      return Promise.all([
        Api.report({ startDate: p.start, endDate: p.end, dimensions: 'day', metrics: DAILY }),
        Api.report({ startDate: p.prevStart, endDate: p.prevEnd, dimensions: 'day', metrics: DAILY })
          .catch(function () { return {}; })
      ]);
    }).then(function (r) {
      var rows = Api.rows(r[0]);
      S.subsDelta = sum(rows, 'subscribersGained') - sum(rows, 'subscribersLost');
      renderBrand();
      renderDash(rows, Api.rows(r[1]), p);
      loadInsight();           // 上段の診断。失敗してもここで止めない
      loadProvisional();       // 直近の速報値。失敗してもここで止めない
      return loadVideos();     // 概要の下段でも動画を使う
    }).catch(function (e) {
      if (S.channel) { toast(e.message); }
      else {
        $('setupError').hidden = false;
        $('setupError').textContent = e.message;
        show('setup');
      }
    }).then(function () { busy(false); });
  }

  /* ========== 直近の速報値 ==========
     確定した数字（直近3日を除いたもの）だけを見せる設計は変えない。
     判定やグラフがこの3日でブレると、あとから数字が増えて
     「減った」ように誤読される事故が起きるため。

     ただし「いまの勢い」を知りたいことはある。そこで、確定値とは
     はっきり分けた別枠に、未確定のまま速報として出す。
     ・判定にも「次にやること」にも一切使わない
     ・畳んだ状態で始める（確定値ではないので、見るかどうかは人による）
     ・失敗してもここだけ黙って消える（他の枠を巻き込まない） */
  function loadProvisional() {
    var host = $('provisional');
    if (!host) return;
    var w = provisionalWindow();
    Api.report({ startDate: w.start, endDate: w.end, dimensions: 'day', metrics: DAILY })
      .then(function (res) { renderProvisional(host, Api.rows(res), w); })
      .catch(function () { host.innerHTML = ''; });   // 取れないときは何も出さない
  }

  function renderProvisional(host, rows, w) {
    if (!rows.length) { host.innerHTML = ''; return; }
    var byDay = {};
    rows.forEach(function (r) { byDay[r.day] = r; });

    var days = [];
    for (var d = new Date(w.start + 'T00:00:00'); ymd(d) <= w.end; d.setDate(d.getDate() + 1)) {
      days.push(ymd(d));
    }

    var list = days.map(function (day) {
      var r = byDay[day] || {};
      var isToday = day === w.today;
      return '<div class="prov-row">' +
        '<span class="prov-date">' + day.slice(5).replace('-', '/') +
        (isToday ? '<em>本日</em>' : '') + '</span>' +
        '<span class="prov-nums">' +
        '<b>' + Chart.fmtInt(Number(r.views) || 0) + '</b>回' +
        '<i>' + fmtWatch(Number(r.estimatedMinutesWatched) || 0) + '</i>' +
        '<i>' + ((Number(r.subscribersGained) || 0) - (Number(r.subscribersLost) || 0) >= 0 ? '＋' : '−') +
        Chart.fmtInt(Math.abs((Number(r.subscribersGained) || 0) - (Number(r.subscribersLost) || 0))) + '人</i>' +
        '</span></div>';
    }).join('');

    host.innerHTML =
      '<details class="prov" id="provBox"' + (Store.provisionalOpen() ? ' open' : '') + '>' +
      '<summary class="prov-summary">' +
      '<span class="prov-title">直近の速報値</span>' +
      '<span class="prov-badge">未確定</span>' +
      '<span class="prov-chev" aria-hidden="true"></span>' +
      '</summary>' +
      '<div class="prov-body">' +
      '<p class="prov-note">' + w.start.slice(5).replace('-', '/') + '〜' + w.today.slice(5).replace('-', '/') +
      'の値です。YouTube 側の集計がまだ確定していないため、あとから数字が動きます' +
      '（多くの場合は増える方向です）。' +
      '<b>判定にも「次にやること」にも使っていません。</b>' +
      '本日ぶんは1日が終わっていないため、とくに低く出ます。</p>' +
      '<div class="prov-list">' + list + '</div>' +
      '</div></details>';

    var box = $('provBox');
    if (box) box.addEventListener('toggle', function () { Store.setProvisionalOpen(box.open); });
  }

  function sum(rows, key) {
    return rows.reduce(function (a, r) { return a + (Number(r[key]) || 0); }, 0);
  }
  function weighted(rows, key, weightKey) {
    var w = sum(rows, weightKey);
    if (!w) return 0;
    return rows.reduce(function (a, r) { return a + (Number(r[key]) || 0) * (Number(r[weightKey]) || 0); }, 0) / w;
  }

  function renderDash(rows, prev, p) {
    var views = sum(rows, 'views'), pViews = sum(prev, 'views');
    var watch = sum(rows, 'estimatedMinutesWatched'), pWatch = sum(prev, 'estimatedMinutesWatched');
    var avg = weighted(rows, 'averageViewDuration', 'views'), pAvg = weighted(prev, 'averageViewDuration', 'views');
    var pct = weighted(rows, 'averageViewPercentage', 'views'), pPct = weighted(prev, 'averageViewPercentage', 'views');
    var net = sum(rows, 'subscribersGained') - sum(rows, 'subscribersLost');
    var pNet = sum(prev, 'subscribersGained') - sum(prev, 'subscribersLost');
    /* 1,000視聴あたり何人が登録したか。
       視聴回数と登録者数を別々に眺めているだけでは、
       「見られる数が増えただけで、残る人は増えていない」状態に気づけない。
       純増ではなく「増えた数」で割る。解除の動きが混ざると
       「見た人が登録したか」という問いの答えにならないため。 */
    var conv = views ? sum(rows, 'subscribersGained') / views * 1000 : 0;
    var pConv = pViews ? sum(prev, 'subscribersGained') / pViews * 1000 : 0;
    var st = (S.channel && S.channel.statistics) || {};

    // 押したときに中を見せるので、その場の数字は控えに持っておく
    S.dayRows = rows; S.prevRows = prev;

    var tiles = [
      /* 先頭に置く。ここが落ちていれば、下に並ぶ数字がどれだけ増えていても
         増え方は落ちている。いちばん最後に見る数字ではなく、最初に見る数字。 */
      { key: 'conv', wide: true, label: '登録への転換', value: conv.toFixed(2) + '人',
        delta: fmtDelta(conv, pConv), note: '1,000視聴あたりの登録者数' },
      { key: 'views', label: '視聴回数', value: Chart.fmtInt(views), delta: fmtDelta(views, pViews), spark: rows.map(function (r) { return r.views; }) },
      { key: 'watch', label: '総再生時間', value: fmtWatch(watch), delta: fmtDelta(watch, pWatch), spark: rows.map(function (r) { return r.estimatedMinutesWatched; }) },
      { key: 'avg', label: '平均視聴時間', value: Chart.fmtDur(avg), delta: fmtDelta(avg, pAvg), note: '1回の再生で見られた長さ' },
      { key: 'pct', label: '平均視聴率', value: Chart.fmtPct(pct), delta: fmtDelta(pct, pPct), note: '動画の長さに対する割合' },
      { key: 'subs', label: '登録者の増減', value: (net >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(net)), delta: fmtDelta(net, pNet), note: '合計 ' + Chart.fmtInt(st.subscriberCount || 0) + '人' },
      // 3つ並ぶので桁を詰める（42,463 ではなく 4.2万）。1行に収まらないと読みにくい。
      { key: 'engage', label: '高評価 / コメント', value: Chart.fmtAxis(sum(rows, 'likes')) + ' / ' + Chart.fmtAxis(sum(rows, 'comments')), note: '共有 ' + Chart.fmtAxis(sum(rows, 'shares')) + '回' }
    ];

    /* 数字だけ見せて終わりにせず、押せば中を開けるようにする。
       「なぜこの数字になったか」は、日ごとの動きと、
       どの動画が押し上げた（下げた）かを見ないと分からないため。
       押せることが分かるよう、右上に小さな印を出す。 */
    $('kpis').innerHTML = tiles.map(function (t, i) {
      return '<button type="button" class="kpi' + (t.wide ? ' kpi-wide' : '') + '" data-metric="' + t.key + '" aria-label="' + esc(t.label) + 'の内訳を見る">' +
        '<span class="kpi-more" aria-hidden="true"></span>' +
        '<span class="kpi-label">' + esc(t.label) + '</span>' +
        '<span class="kpi-value">' + t.value + '</span>' +
        '<span class="kpi-foot">' + (t.delta || '') +
        (t.note ? '<span class="kpi-note">' + esc(t.note) + '</span>' : '') + '</span>' +
        (t.spark ? '<span class="kpi-spark" id="spark' + i + '"></span>' : '') +
        '</button>';
    }).join('');
    tiles.forEach(function (t, i) { if (t.spark && $('spark' + i)) Chart.spark($('spark' + i), t.spark); });
    $('kpis').querySelectorAll('[data-metric]').forEach(function (b) {
      b.addEventListener('click', function () { openMetricSheet(b.dataset.metric); });
    });

    var series = rows.map(function (r) { return { date: r.day, value: Number(r.views) || 0 }; });
    var cmp = prev.map(function (r) { return { date: r.day, value: Number(r.views) || 0 }; });
    Chart.line($('chartViews'), { values: series, compare: cmp, label: '視聴回数', unit: '回' });
    Chart.line($('chartWatch'), {
      values: rows.map(function (r) { return { date: r.day, value: Number(r.estimatedMinutesWatched) || 0 }; }),
      label: '総再生時間', unit: '分', height: 180
    });
    Chart.delta($('chartSubs'), rows.map(function (r) {
      return { date: r.day, gained: Number(r.subscribersGained) || 0, lost: Number(r.subscribersLost) || 0 };
    }));
  }


  /* ========== 設定：IDの出どころ ========== */
  function renderIdStatus() {
    var host = $('idStatus');
    if (!host) return;
    var src = Store.clientIdSource();
    var msg = {
      device: ['good', 'この端末に保存したIDを使っています。'],
      file:   ['good', 'config.js に書いてあるIDを使っています。どの端末で開いても入力は要りません。'],
      none:   ['warn', 'まだ登録されていません。下の欄に貼って保存してください。']
    }[src];
    var extra = '';
    if (!Store.canStore()) {
      extra = '<span class="check-why">このブラウザは保存領域を使えません（アプリ内ブラウザやプライベートモードでよく起きます）。' +
        '入力しても次に開いたときには消えます。毎回入力したくない場合は、config.js にIDを書いておく方法をご検討ください。</span>';
    } else if (src === 'device' && Store.bakedClientId()) {
      extra = '<span class="check-why">config.js にもIDがありますが、この端末で入れたほうを優先しています。' +
        '欄を空にして保存すると config.js のほうに戻ります。</span>';
    }
    host.innerHTML = '<div class="check check-' + msg[0] + '">' +
      '<span class="check-mark" aria-hidden="true">' + (msg[0] === 'good' ? '✓' : '!') + '</span>' +
      '<div class="check-body"><b>' + esc(msg[1]) + '</b>' + extra + '</div></div>';
  }

  /* ========== 概要の上段：いまの状態と次の一手 ========== */
  function loadInsight() {
    var host = $('insight');
    if (!host) return;
    host.innerHTML = '<p class="skeleton">28日と90日を照らし合わせています…</p>';

    var w28 = windowOf(28), w90 = windowOf(90);
    var soft = function (p) { return p.catch(function () { return {}; }); };

    var uploads = ((S.channel || {}).contentDetails || {}).relatedPlaylists || {};
    var listPromise = uploads.uploads
      ? Api.data('playlistItems', { part: 'contentDetails', playlistId: uploads.uploads, maxResults: 50 })
        .then(function (res) {
          return fetchVideoDetails((res.items || []).map(function (i) { return i.contentDetails.videoId; }));
        }).catch(function () {})
      : Promise.resolve();

    Promise.all([
      Api.report({ startDate: w28.start, endDate: w28.end, dimensions: 'day', metrics: DAILY }),
      soft(Api.report({ startDate: w28.prevStart, endDate: w28.prevEnd, dimensions: 'day', metrics: DAILY })),
      soft(Api.report({ startDate: w90.start, endDate: w90.end, dimensions: 'day', metrics: DAILY })),
      soft(Api.report({ startDate: w90.prevStart, endDate: w90.prevEnd, dimensions: 'day', metrics: DAILY })),
      soft(Api.report({ startDate: w28.start, endDate: w28.end, dimensions: 'insightTrafficSourceType', metrics: 'views' })),
      soft(Api.report({ startDate: w28.start, endDate: w28.end, dimensions: 'subscribedStatus', metrics: 'views' })),
      /* 登録者数まで一緒に取る。1,000視聴あたり何人が登録したかを
         動画ごとに出せないと、「上位と長い尾の差」「条件の揃った2本の差」の
         2つの観点が成り立たない。この組み合わせは動画タブでも使っていて通る。
         本数は20本では尾が見えないので、60本まで広げる。 */
      soft(Api.report({
        startDate: w28.start, endDate: w28.end, dimensions: 'video',
        metrics: 'views,averageViewDuration,averageViewPercentage,subscribersGained',
        sort: '-views', maxResults: 60
      })),
      listPromise
    ]).then(function (r) {
      var videos28 = Api.rows(r[6]);
      return fetchVideoDetails(videos28.map(function (v) { return v.video; })).then(function () {
        var audits = Object.keys(S.videos).map(function (id) {
          var a = Seo.audit(S.videos[id]);
          var bad = a.checks.filter(function (c) { return c.level === 'bad' || c.level === 'warn'; });
          return {
            id: id, title: S.videos[id].snippet.title, score: a.score,
            top: bad.slice(0, 2).map(function (c) { return c.label; }).join('／') || '軽微'
          };
        });
        renderScale(Api.rows(r[0]), Api.rows(r[2]));
        renderInsight(host, Insight.build({
          now28: Api.rows(r[0]), prev28: Api.rows(r[1]),
          now90: Api.rows(r[2]), prev90: Api.rows(r[3]),
          traffic: Api.rows(r[4]), subs: Api.rows(r[5]),
          videos28: videos28, meta: S.videos,
          uploads: Object.keys(S.videos).map(function (k) { return S.videos[k]; }),
          audits: audits
        }), w28, w90);
      });
    }).catch(function (e) { panelError(host, e); });
  }

  function renderInsight(host, ins, w28, w90) {
    S.insight = ins; S.w28 = w28; S.w90 = w90;   // レポートで使う
    var badge = { good: '順調', ok: '前向き', warn: '注意', bad: '要対処', info: '変化なし' }[ins.level];

    var rows = ins.metrics.map(function (m) {
      return '<tr' + (m.kind === 'per1k' ? ' class="vrow-key"' : '') + '><th>' + esc(m.label) +
        (m.note ? '<small>' + esc(m.note) + '</small>' : '') + '</th>' +
        '<td>' + metricValue(m.a, m.kind) + deltaTag(m.ap) + '</td>' +
        '<td>' + metricValue(m.b, m.kind) + deltaTag(m.bp) + '</td></tr>';
    }).join('');

    /* 畳んだときに見えるのは「判定」と「一言」だけ。
       理由と数字の表は、押したときに出す。
       開くたびに毎回スクロールさせないための作り。 */
    host.innerHTML =
      '<div class="verdict verdict-' + ins.level + '">' +

      '<details class="vbox"' + (Store.verdictOpen() ? ' open' : '') + ' id="verdictBox">' +
      '<summary class="verdict-summary">' +
      '<span class="verdict-head">' +
      '<span class="verdict-badge">' + badge + '</span>' +
      '<span class="verdict-title">' + esc(ins.title) + '</span>' +
      '<span class="verdict-chev" aria-hidden="true"></span>' +
      '</span>' +
      '<span class="verdict-one">' + esc(ins.one) + '</span>' +
      '</summary>' +

      '<div class="verdict-body">' +
      '<p class="verdict-detail">' + esc(ins.detail) + '</p>' +
      '<div class="verdict-table-wrap"><table class="verdict-table">' +
      '<thead><tr><th></th><th>直近28日<small>' + w28.start.slice(5) + '〜' + w28.end.slice(5) + '</small></th>' +
      '<th>直近90日<small>' + w90.start.slice(5) + '〜' + w90.end.slice(5) + '</small></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="hint">％はそれぞれ「直前の同じ長さの期間」との比較です。</p></div>' +
      '</div></details>' +

      lensHtml(ins) +

      '<details class="next" id="nextBox"' + (Store.nextOpen() ? ' open' : '') + '>' +
      '<summary class="next-summary">' +
      '<span class="next-title">次にやること</span>' +
      '<span class="next-count">' + ins.actions.length + '件</span>' +
      '<span class="next-chev" aria-hidden="true"></span>' +
      '</summary>' +
      '<ol class="next-list">' + ins.actions.map(function (a, i) {
        return '<li class="next-item">' +
          '<span class="next-no">' + (i + 1) + '</span>' +
          '<div class="next-body">' +
          '<b>' + esc(a.title) + '</b>' +
          '<span class="next-why">' + esc(a.why) + '</span>' +
          '<span class="next-how">' + esc(a.how) + '</span>' +
          '</div></li>';
      }).join('') + '</ol></details>' +
      '</div>';

    // 開いたか閉じたかはこの端末に覚える。毎回開き直すのは手間になるため。
    var vb = $('verdictBox');
    if (vb) vb.addEventListener('toggle', function () { Store.setVerdictOpen(vb.open); });
    var nb = $('nextBox');
    if (nb) nb.addEventListener('toggle', function () { Store.setNextOpen(nb.open); });
    var lb = $('lensBox');
    if (lb) lb.addEventListener('toggle', function () { Store.setLensOpen(lb.open); });
  }

  /* ========== 分析の観点 ==========
     判定は結論の1行、「次にやること」は動きの指示。
     そのあいだに「なぜそう言えるのか」を置く場所が無いと、
     出された打ち手を信じるしかなくなり、自分で判断できなくなる。
     ここは根拠の置き場所。数字を並べたうえで、読み方まで書く。

     「問題ではないと確認できたこと」を最後に必ず出すのが要点。
     どこを触らなくていいかが決まらないと、目につく数字（解除率など）に
     時間を使ってしまい、効く場所に手が回らない。 */
  var LENS_WORD = { good: '良好', info: '参考', warn: '注意', bad: '要対処' };

  function lensHtml(ins) {
    var lenses = ins.lenses || [], clear = ins.clear || [];
    if (!lenses.length && !clear.length) return '';
    var n = lenses.length + (clear.length ? 1 : 0);

    return '<details class="lens" id="lensBox"' + (Store.lensOpen() ? ' open' : '') + '>' +
      '<summary class="lens-summary">' +
      '<span class="lens-title">分析の観点</span>' +
      '<span class="lens-count">' + n + '件</span>' +
      '<span class="lens-chev" aria-hidden="true"></span>' +
      '</summary>' +
      '<div class="lens-list">' +
      lenses.map(function (x) {
        return '<article class="lens-item lens-' + x.level + '">' +
          '<div class="lens-head">' +
          '<span class="lens-tag">' + (LENS_WORD[x.level] || '') + '</span>' +
          '<b class="lens-name">' + esc(x.title) + '</b>' +
          '</div>' +
          (x.nums && x.nums.length
            ? '<div class="lens-nums">' + x.nums.map(function (u) {
                return '<div class="lens-num">' +
                  '<span class="lens-num-label">' + esc(u.label) + '</span>' +
                  '<span class="lens-num-value">' + esc(u.value) +
                  (u.pct != null ? deltaTag(u.pct) : '') + '</span></div>';
              }).join('') + '</div>'
            : '') +
          '<p class="lens-body">' + esc(x.body) + '</p>' +
          '</article>';
      }).join('') +
      (clear.length
        ? '<article class="lens-item lens-clear">' +
          '<div class="lens-head">' +
          '<span class="lens-tag">除外</span>' +
          '<b class="lens-name">問題ではないと確認できたこと</b>' +
          '</div>' +
          '<p class="lens-body">ここに挙がったものは、いま直しても増え方は変わりません。' +
          '手を入れる先を決めるときは、この外側から選んでください。</p>' +
          '<ul class="lens-clear-list">' + clear.map(function (c) {
            return '<li><b>' + esc(c.title) + '</b><span>' + esc(c.why) + '</span></li>';
          }).join('') + '</ul>' +
          '</article>'
        : '') +
      '</div></details>';
  }

  function metricValue(v, kind) {
    if (kind === 'per1k') return v.toFixed(2) + '人';
    if (kind === 'watch') return fmtWatch(v);
    if (kind === 'dur') return Chart.fmtDur(v);
    if (kind === 'signed') return (v >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(v));
    return Chart.fmtInt(v);
  }
  function deltaTag(p) {
    if (p == null) return '<span class="delta flat">—</span>';
    var cls = p > 5 ? 'up' : p < -5 ? 'down' : 'flat';
    // 四捨五入して0になるものは「±0%」と書く。
    // −0.4% を「−0%」と出すと、減っているのか同じなのか読めない。
    var r = Math.round(Math.abs(p));
    if (r === 0) return '<span class="delta flat">±0%</span>';
    return '<span class="delta ' + cls + '">' + (p > 0 ? '＋' : '−') + r + '%</span>';
  }


  /* ========== 収益 ==========
     金額の指標は別の権限が要るので、押されたときだけ取りに行く。

     ▼ RPM と CPM を API の値の平均で出さない理由
     日ごとの cpm をそのまま平均すると「平均の平均」になり、
     広告が多く出た日と少ない日が同じ重みになってしまう。
     YouTube の定義どおり、合計どうしを割って出す。
       RPM         = 推定収益の合計 ÷ 視聴回数の合計 × 1000
       CPM         = 総収入の合計   ÷ 広告表示回数の合計 × 1000
       再生ベースCPM = 総収入の合計   ÷ 収益化された再生の合計 × 1000 */
  var MONEY_METRICS = 'views,estimatedRevenue,estimatedAdRevenue,estimatedRedPartnerRevenue,' +
    'grossRevenue,adImpressions,monetizedPlaybacks';

  function loadRevenue() {
    if (!S.channel) return;
    var gate = $('revenueGate'), body = $('revenueBody');
    if (!Api.hasMoney()) { gate.hidden = false; body.hidden = true; return; }
    gate.hidden = true; body.hidden = false;
    if (S.loaded.revenue) return;
    S.loaded.revenue = true;

    var p = period();
    $('revRangeNote').innerHTML =
      '<b>' + p.start + '</b> 〜 <b>' + p.end + '</b>（' + p.days + '日間）の推定収益です。' +
      '<span class="hint">YouTube の推定値で、確定額ではありません。月末の調整で増減します。</span>';

    /* 通貨は円で求める。指定できなかった場合はチャンネルの既定に任せ、
       画面には「チャンネルの通貨」と出して、円と決めつけないようにする。 */
    reportMoney(p, 'day').then(function (r) {
      renderRevenue(Api.rows(r.res), r.currency, p);
      return reportMoney(p, 'video').then(function (rv) {
        renderRevenueVideos(Api.rows(rv.res), rv.currency);
      }).catch(function (e) { panelError($('revVideos'), e); });
    }).catch(function (e) {
      $('revKpis').innerHTML = '';
      $('chartRevenue').innerHTML = '';
      $('revVideos').innerHTML = '';
      $('revNotes').innerHTML = '';
      $('revRangeNote').innerHTML = '';
      panelError(body, moneyMessage(e));
    });
  }

  function reportMoney(p, dim) {
    var base = {
      startDate: p.start, endDate: p.end, dimensions: dim, metrics: MONEY_METRICS
    };
    if (dim === 'video') { base.sort = '-estimatedRevenue'; base.maxResults = 25; }
    var withJpy = {}; for (var k in base) withJpy[k] = base[k];
    withJpy.currency = 'JPY';
    return Api.report(withJpy).then(function (res) { return { res: res, currency: 'JPY' }; })
      .catch(function (e) {
        if (e.status === 400) {   // 通貨の指定だけが通らなかった場合
          return Api.report(base).then(function (res) { return { res: res, currency: null }; });
        }
        throw e;
      });
  }

  function moneyMessage(e) {
    var m = e && e.message || '';
    if (e && (e.status === 403 || /forbidden|insufficient/i.test(m))) {
      return new Error('このチャンネルでは収益データを取得できませんでした。' +
        'YouTube パートナープログラムに参加していないチャンネルには収益の記録自体がありません。' +
        '参加済みの場合は、ログインしたアカウントがそのチャンネルの所有者かをご確認ください。');
    }
    return e;
  }

  function renderRevenue(rows, cur, p) {
    var money = function (v) { return Chart.fmtMoney(v, cur || 'JPY'); };
    var curNote = cur ? '' : '（チャンネルの通貨）';

    var rev = sum(rows, 'estimatedRevenue');
    var ad = sum(rows, 'estimatedAdRevenue');
    var red = sum(rows, 'estimatedRedPartnerRevenue');
    var gross = sum(rows, 'grossRevenue');
    var imps = sum(rows, 'adImpressions');
    var mplays = sum(rows, 'monetizedPlaybacks');
    var views = sum(rows, 'views');

    var rpm = views ? rev / views * 1000 : 0;
    S.chanRpm = rpm;          // 動画1本の RPM を比べる相手として使う
    var cpm = imps ? gross / imps * 1000 : 0;
    var pcpm = mplays ? gross / mplays * 1000 : 0;
    var mrate = views ? mplays / views * 100 : 0;

    if (!rev && !gross && !imps) {
      $('revKpis').innerHTML = '';
      $('chartRevenue').innerHTML =
        '<p class="chart-empty">この期間の収益データは0件です。<br>' +
        '収益化前の期間か、まだ広告が配信されていない可能性があります。</p>';
      $('revNotes').innerHTML = '';
      return;
    }

    var tiles = [
      { label: '推定収益' + curNote, value: money(rev), note: '税引前・YouTube の取り分を引いたあと' },
      { label: '広告収益', value: money(ad), note: '推定収益のうち広告ぶん' },
      { label: 'Premium からの収益', value: money(red), note: '推定収益のうち会員視聴ぶん' },
      { label: '推定RPM', value: money(rpm), note: '視聴1000回あたりの手取り' },
      { label: '再生ベースCPM', value: money(pcpm), note: '収益化された再生1000回あたりの総収入' },
      { label: '収益化された再生', value: Chart.fmtPct(mrate), note: Chart.fmtInt(mplays) + '回 / 視聴' + Chart.fmtInt(views) + '回' }
    ];
    $('revKpis').innerHTML = tiles.map(function (t) {
      return '<div class="kpi"><div class="kpi-label">' + esc(t.label) + '</div>' +
        '<div class="kpi-value kpi-money">' + t.value + '</div>' +
        '<div class="kpi-foot"><span class="kpi-note">' + esc(t.note) + '</span></div></div>';
    }).join('');

    Chart.line($('chartRevenue'), {
      values: rows.map(function (r) { return { date: r.day, value: Number(r.estimatedRevenue) || 0 }; }),
      label: '推定収益', unit: cur === 'JPY' ? '円' : '', height: 200
    });

    $('revNotes').innerHTML = [
      { level: 'info', label: 'RPM・CPM は合計から計算しています',
        detail: '推定RPM = 推定収益の合計 ÷ 視聴回数の合計 × 1000。CPM も同じく合計どうしで割っています。',
        why: '日ごとの数値をそのまま平均すると「平均の平均」になり、広告が多く出た日と少ない日が同じ重みになってしまいます。YouTube の定義どおり合計から出しています。' },
      { level: 'info', label: 'これは推定値です',
        detail: 'YouTube 側の月末調整（無効なトラフィックの除外など）で増減します。',
        why: '確定額は AdSense の支払いレポートで確認してください。ここの数字は日々の判断のためのものです。' },
      { level: 'info', label: '推定収益は「手取り」、CPM は「総収入」基準',
        detail: '推定収益 = YouTube の取り分を引いたあと。CPM の計算に使う総収入 = 引く前。',
        why: 'RPM と CPM を並べて比べると必ず CPM のほうが大きく見えますが、基準が違うためで、異常ではありません。' },
      { level: 'info', label: cur === 'JPY' ? '日本円で取得しています' : 'チャンネルの既定通貨で表示しています',
        detail: cur === 'JPY' ? 'Google のレートで換算された値です。' : '円での取得が通らなかったため、チャンネルの通貨のまま出しています。',
        why: '' }
    ].map(checkRow).join('');
  }

  function renderRevenueVideos(rows, cur) {
    var host = $('revVideos');
    if (!rows.length) { host.innerHTML = '<p class="chart-empty">この期間に収益のあった動画がありません</p>'; return; }

    /* 動画1本ぶんの収益を控えておく。押して詳細を開いたときに、
       そこでもう一度問い合わせずに済ませるため。
       収益は権限も1日の枠も別なので、同じ数字を2度取りに行かない。 */
    S.revByVideo = {};
    S.revCurrency = cur || 'JPY';
    rows.forEach(function (r) { S.revByVideo[r.video] = r; });

    var ids = rows.map(function (r) { return r.video; });
    fetchVideoDetails(ids).catch(function () {}).then(function () {
      Chart.hbar(host, rows.map(function (r) {
        var v = S.videos[r.video];
        var views = Number(r.views) || 0;
        var rev = Number(r.estimatedRevenue) || 0;
        return {
          id: r.video,            // 押せる行にする
          label: v ? v.snippet.title : r.video,
          value: rev,
          sub: '視聴' + Chart.fmtInt(views) + '回 ・ RPM ' +
            Chart.fmtMoney(views ? rev / views * 1000 : 0, cur || 'JPY')
        };
      }), { format: function (v) { return Chart.fmtMoney(v, cur || 'JPY'); } });
      bindVideoClicks(host);
    });
  }

  /* ========== チャンネルの規模 ========== */
  function renderScale(rows28, rows90) {
    var host = $('scale');
    if (!host || !S.channel) return;
    var st = S.channel.statistics || {};
    var id = S.channel.id;
    var g28 = sum(rows28, 'subscribersGained') - sum(rows28, 'subscribersLost');
    var g90 = sum(rows90, 'subscribersGained') - sum(rows90, 'subscribersLost');

    host.innerHTML =
      '<div class="scale-grid">' +
      scaleCell('登録者', Chart.fmtInt(st.subscriberCount || 0) + '人',
        (g28 >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(g28)) + '（直近28日）') +
      scaleCell('総再生回数', Chart.fmtInt(st.viewCount || 0) + '回', 'チャンネル開設からの累計') +
      scaleCell('公開中の動画', Chart.fmtInt(st.videoCount || 0) + '本', '') +
      scaleCell('登録者の伸び', (g90 >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(g90)) + '人',
        '直近90日') +
      '</div>' +
      '<div class="scale-ext">' +
      '<a class="btn btn-ghost" href="https://socialblade.com/youtube/channel/' + esc(id) +
      '" target="_blank" rel="noopener">Social Blade で順位を見る ↗</a>' +
      '</div>';
  }
  function scaleCell(label, value, note) {
    return '<div class="scale-cell"><span class="scale-label">' + esc(label) + '</span>' +
      '<b class="scale-value">' + value + '</b>' +
      (note ? '<span class="scale-note">' + esc(note) + '</span>' : '') + '</div>';
  }


  /* ========== 分析レポート ==========
     いま画面に出ている内容を1枚にまとめる。
     足りない材料（流入経路）は、押されたときだけ取りに行く。 */
  function reportContext() {
    var p = period();
    var all = S.loaded.videos ? allStats() : [];
    var total = (S.trafficRows || []).reduce(function (a, r) { return a + r.value; }, 0);
    return {
      channel: (S.channel && S.channel.snippet.title) || '',
      subsTotal: Number((S.channel && S.channel.statistics && S.channel.statistics.subscriberCount) || 0),
      period: p, w28: S.w28, w90: S.w90,
      insight: S.insight,
      videos: all.slice().sort(function (a, b) { return b.views - a.views; }),
      /* 転換の良い順・悪い順。再生の少ない動画は率が跳ねるので同じしきい値で外す。 */
      convBest: convRanked(all).slice(0, convTake(all)),
      convWorst: convRanked(all).reverse().slice(0, convTake(all)),
      lost: all.filter(function (v) { return v.unsubs > 0; })
        .sort(function (a, b) { return b.unsubs - a.unsubs; }),
      traffic: (S.trafficRows || []).map(function (r) {
        return { label: r.label, value: r.value, share: total ? r.value / total * 100 : 0 };
      })
    };
  }

  function convRanked(all) {
    return all.filter(function (v) { return v.views >= CONV_MIN_VIEWS; })
      .sort(function (a, b) { return b.subPer1k - a.subPer1k; });
  }
  /* 良い順と悪い順が同じ動画で埋まらない本数までにする。
     同じ1本が両方に出ていると、比較の材料として読めなくなる。 */
  function convTake(all) {
    return Math.min(3, Math.floor(convRanked(all).length / 2));
  }

  /* 流入経路はレポートに入れたいが、「流入」タブを開いていないと手元に無い。
     押されたときに1回だけ取りに行く（取れなくてもレポートは出す）。 */
  function ensureTraffic() {
    if (S.trafficRows) return Promise.resolve();
    var p = period();
    return Api.report({
      startDate: p.start, endDate: p.end,
      dimensions: 'insightTrafficSourceType', metrics: 'views', sort: '-views'
    }).then(function (res) {
      S.trafficRows = Api.rows(res).map(function (r) {
        return {
          label: TRAFFIC[r.insightTrafficSourceType] || r.insightTrafficSourceType,
          value: Number(r.views) || 0
        };
      });
    }).catch(function () { S.trafficRows = []; });
  }

  function makeReport() {
    if (!S.channel) return;
    busy(true, 'レポートを組み立てています…');
    ensureTraffic().then(function () {
      var d = Report.collect(reportContext());
      $('reportBody').innerHTML = Report.html(d);
      Report.fit($('report'));
      busy(false);
      /* 印刷画面は組み立て終わってから開く。
         中身が入る前に開くと、白紙のまま印刷されてしまう。 */
      setTimeout(function () { global_print(); }, 60);
    }).catch(function (e) { busy(false); toast(e.message); });
  }
  function global_print() { try { window.print(); } catch (e) {} }

  function copyForClaude() {
    if (!S.channel) return;
    busy(true, '文章を組み立てています…');
    ensureTraffic().then(function () {
      var text = Report.forClaude(Report.collect(reportContext()));
      busy(false);
      return writeClipboard(text).then(function () {
        toast('コピーしました。Claude に貼り付けてください。');
      }).catch(function () {
        // コピーが許されない場合は、選べる形で出す（黙って失敗させない）
        showCopyFallback(text);
      });
    }).catch(function (e) { busy(false); toast(e.message); });
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('no clipboard'));
  }

  /* 自動コピーが使えない環境（古いブラウザ、安全でない接続など）向け。
     手で選んでコピーできるように、文章そのものを出す。 */
  function showCopyFallback(text) {
    $('sheetTitle').textContent = 'Claude に貼る文章';
    $('sheet').hidden = false;
    document.body.classList.add('locked');
    $('sheetBodyInner').innerHTML =
      '<p class="lead">自動でコピーできませんでした。下の文章を選んでコピーし、Claude に貼り付けてください。</p>' +
      '<textarea class="copybox" readonly rows="18"></textarea>';
    var ta = $('sheetBodyInner').querySelector('.copybox');
    ta.value = text;
    ta.focus(); ta.select();
  }

  /* ========== 動画 ========== */
  function loadVideos() {
    if (S.loaded.videos) { renderVideoTable(); renderTopVideos(); return S.videosPromise || Promise.resolve(); }
    var p = period();
    S.videosPromise = Api.report({
      startDate: p.start, endDate: p.end, dimensions: 'video',
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,comments',
      sort: '-views', maxResults: 200
    }).then(function (res) {
      var rows = Api.rows(res);
      S.period = {};
      rows.forEach(function (r) { S.period[r.video] = r; });
      var ids = rows.map(function (r) { return r.video; });
      return fetchVideoDetails(ids);
    }).then(function () {
      S.loaded.videos = true;
      renderVideoTable(); renderTopVideos();
      loadUnsubsByVideo(p);   // 失敗してもいい追加分。動画一覧の本体とは切り離す
    }).catch(function (e) {
      $('videoRows').innerHTML = '<tr><td colspan="7"><p class="error-box">' + esc(e.message) + '</p></td></tr>';
    });
    return S.videosPromise;
  }

  /* 動画ごとの「解除された数」だけを、別枠で・失敗してもいいように取りに行く。
     dimensions=video に subscribersLost を組み合わせる問い合わせを
     受け付けないアカウント・期間があり得る。それを動画一覧の本体（views など）
     と同じ問い合わせに混ぜると、失敗したときに視聴回数まで巻き込んで
     表全体が壊れてしまう。切り離しておけば、これだけ失敗しても他は動く。

     解決したら、すでに描いてある動画一覧・トップ5・登録者の増減シートに
     数字を足して描き直す（進んだら黙って足す、というやり方）。 */
  function loadUnsubsByVideo(p) {
    S.unsubsState = 'loading';
    S.unsubsPromise = Api.report({
      startDate: p.start, endDate: p.end, dimensions: 'video',
      metrics: 'subscribersLost', sort: '-subscribersLost', maxResults: 200
    }).then(function (res) {
      Api.rows(res).forEach(function (r) {
        if (S.period[r.video]) S.period[r.video].subscribersLost = r.subscribersLost;
      });
      S.unsubsState = 'ok';
      if (S.loaded.videos) { renderVideoTable(); renderTopVideos(); }
      refreshSubsSheetIfOpen();
    }).catch(function () {
      S.unsubsState = 'unavailable';
      refreshSubsSheetIfOpen();
    });
    return S.unsubsPromise;
  }

  /* 「登録者の増減」のシートを開いたまま、あとから解除数が届く／諦めがつく
     ことがある。開いたままならそのぶん描き直す。他の指標を見ているときは触らない。 */
  function refreshSubsSheetIfOpen() {
    if (!$('sheet').hidden && $('sheetTitle').textContent === METRICS.subs.label) renderSubsVideos();
  }

  /* Data API は1回につき50件まで。まとめて取る。 */
  function fetchVideoDetails(ids) {
    var todo = ids.filter(function (id) { return id && !S.videos[id]; });
    var chunks = [];
    for (var i = 0; i < todo.length; i += 50) chunks.push(todo.slice(i, i + 50));
    return chunks.reduce(function (chain, c) {
      return chain.then(function () {
        return Api.data('videos', { part: 'snippet,contentDetails,statistics', id: c.join(',') })
          .then(function (res) {
            (res.items || []).forEach(function (v) { S.videos[v.id] = v; });
          });
      });
    }, Promise.resolve());
  }

  function videoStat(id) {
    var r = S.period[id] || {};
    var v = S.videos[id];
    var sn = (v && v.snippet) || {};
    var st = (v && v.statistics) || {};
    var pub = sn.publishedAt ? new Date(sn.publishedAt) : null;
    var days = pub ? Math.max(1, (Date.now() - pub.getTime()) / 86400000) : 0;
    var audit = v ? Seo.audit(v) : null;
    return {
      id: id, title: sn.title || '(取得できない動画)', publishedAt: sn.publishedAt,
      thumb: (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default) || {}).url,
      views: Number(r.views) || 0,
      watch: Number(r.estimatedMinutesWatched) || 0,
      avg: Number(r.averageViewDuration) || 0,
      pct: Number(r.averageViewPercentage) || 0,
      subs: Number(r.subscribersGained) || 0,
      unsubs: Number(r.subscribersLost) || 0,
      /* 視聴回数あたりの率。実数だけでは本数の違う動画を比べられない
         （10万回で185人解除と、1千回で185人解除では意味がまるで違う）。 */
      subRate: Number(r.views) ? (Number(r.subscribersGained) || 0) / Number(r.views) * 100 : 0,
      unsubRate: Number(r.views) ? (Number(r.subscribersLost) || 0) / Number(r.views) * 100 : 0,
      /* 1,000視聴あたりの登録者数。本数の違う動画を横に並べて比べるための共通のものさし。
         subRate（％）と同じ中身だが、桁を人数の実感に合わせている（0.156% より 1.56人）。 */
      subPer1k: Number(r.views) ? (Number(r.subscribersGained) || 0) / Number(r.views) * 1000 : 0,
      likes: Number(r.likes) || 0,
      comments: Number(r.comments) || 0,
      lifetime: Number(st.viewCount) || 0,
      perDay: days ? (Number(st.viewCount) || 0) / days : 0,
      ageDays: days,
      seo: audit ? audit.score : null,
      audit: audit
    };
  }

  function allStats() {
    return Object.keys(S.period).map(videoStat);
  }

  function renderTopVideos() {
    var rows = allStats().sort(function (a, b) { return b.views - a.views; }).slice(0, 5);
    $('topVideos').innerHTML = rows.length
      ? rows.map(vcard).join('')
      : '<p class="chart-empty">この期間に再生された動画がありません</p>';
    bindVideoClicks($('topVideos'));
  }

  function vcard(s) {
    return '<button class="vcard" data-id="' + esc(s.id) + '" type="button">' +
      (s.thumb ? '<img class="vthumb" src="' + esc(s.thumb) + '" alt="" loading="lazy">' : '<span class="vthumb"></span>') +
      '<span class="vbody">' +
      '<span class="vtitle">' + esc(s.title) + '</span>' +
      '<span class="vmeta">' +
      Chart.fmtInt(s.views) + '回 ・ ' + fmtWatch(s.watch) + ' ・ 平均' + Chart.fmtDur(s.avg) +
      (s.subs || s.unsubs ? ' ・ 登録＋' + Chart.fmtInt(s.subs) +
        (s.unsubs ? '（−' + Chart.fmtInt(s.unsubs) + '）' : '') : '') +
      '</span></span>' +
      (s.seo != null ? '<span class="vscore ' + scoreClass(s.seo) + '" title="作りの点数 ' + s.seo +
        '点（' + scoreWord(s.seo) + '）題名・説明文・タグの点検結果">' + s.seo + '</span>' : '') +
      '</button>';
  }
  function scoreClass(n) { return n >= 85 ? 'ok' : n >= 65 ? 'mid' : 'ng'; }
  function scoreWord(n) { return n >= 85 ? '良好' : n >= 65 ? '要改善' : '要修正'; }
  /* 点数だけ置かれても読めないので、どこにでも同じ説明を添える。 */
  var SCORE_LEGEND =
    '<b>「作りの点数」とは</b>　題名・説明文・タグの作りを100点満点で点検した結果です。' +
    '視聴回数や人気とは関係ありません。' +
    '<span class="legend-keys">' +
    '<i class="vscore ok">85+</i>良好' +
    '<i class="vscore mid">65-84</i>要改善' +
    '<i class="vscore ng">〜64</i>要修正</span>' +
    '動画を押すと、何が引っかかっているか（題名が長すぎる・章がない など）と、' +
    'その理由が出ます。';
  function paintLegend() {
    ['scoreLegend', 'scoreLegend2'].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = SCORE_LEGEND;
    });
  }

  /* 動画を押したら1本の詳細を開く。
     1つ1つの要素ではなく、入れ物に1回だけ付ける（イベント委譲）。
     理由は2つ。
      ・グラフは画面幅が変わると中身を描き直すので、要素に直接付けた印は消える。
        収益の横棒がそれで、押しても何も起きない状態になっていた。
      ・描き直すたびに呼ばれても、印が二重三重に積み重ならない。 */
  function bindVideoClicks(host) {
    if (!host || host._videoClicks) return;
    host._videoClicks = true;
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-id]');
      if (t && host.contains(t)) openSheet(t.dataset.id);
    });
  }

  function renderVideoTable() {
    if (!S.loaded.videos) return;
    var q = ($('videoSearch').value || '').trim().toLowerCase();
    var sortBy = $('videoSort').value;
    var rows = allStats().filter(function (s) {
      return !q || s.title.toLowerCase().indexOf(q) >= 0;
    });
    var cmp = {
      views: function (a, b) { return b.views - a.views; },
      watch: function (a, b) { return b.watch - a.watch; },
      avg: function (a, b) { return b.avg - a.avg; },
      pct: function (a, b) { return b.pct - a.pct; },
      subs: function (a, b) { return b.subs - a.subs; },
      unsubs: function (a, b) { return b.unsubs - a.unsubs; },
      new: function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); },
      vph: function (a, b) { return b.perDay - a.perDay; },
      seo: function (a, b) { return (a.seo == null ? 999 : a.seo) - (b.seo == null ? 999 : b.seo); }
    }[sortBy];
    rows.sort(cmp);

    paintLegend();
    $('videoRows').innerHTML = rows.length ? rows.map(function (s) {
      return '<tr data-id="' + esc(s.id) + '">' +
        '<td class="cell-title">' +
        (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" loading="lazy">' : '') +
        '<span><b>' + esc(s.title) + '</b><small>' + (s.publishedAt || '').slice(0, 10) +
        ' ・ 公開後1日あたり' + Chart.fmtInt(s.perDay) + '回</small></span></td>' +
        '<td class="num" data-label="視聴回数">' + Chart.fmtInt(s.views) + '</td>' +
        '<td class="num" data-label="総再生時間">' + fmtWatch(s.watch) + '</td>' +
        '<td class="num" data-label="平均視聴時間">' + Chart.fmtDur(s.avg) + '</td>' +
        '<td class="num" data-label="平均視聴率">' + Chart.fmtPct(s.pct) + '</td>' +
        '<td class="num" data-label="登録者">' +
        (s.subs || s.unsubs
          ? '<span class="subcell">' + (s.subs ? '＋' + Chart.fmtInt(s.subs) : '±0') +
            (s.unsubs ? '<em class="v-down">−' + Chart.fmtInt(s.unsubs) + '</em>' : '') +
            (s.unsubs ? '<i class="rate">解除率 ' + Chart.fmtRate(s.unsubRate) + '</i>' : '') + '</span>'
          : '—') + '</td>' +
        '<td class="num" data-label="作りの点数">' + (s.seo != null
          ? '<span class="vscore ' + scoreClass(s.seo) + '" title="題名・説明文・タグの点検結果">' +
            s.seo + '<em>' + scoreWord(s.seo) + '</em></span>'
          : '—') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7"><p class="chart-empty">該当する動画がありません</p></td></tr>';
    bindVideoClicks($('videoRows'));
  }

  /* ========== 流入 ========== */
  function loadTraffic() {
    if (S.loaded.traffic) return;
    S.loaded.traffic = true;
    var p = period();
    var base = { startDate: p.start, endDate: p.end };

    fill('trafficTypes', Api.report(Object.assign({}, base, {
      dimensions: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched', sort: '-views'
    })), function (host, res) {
      var rows = Api.rows(res).map(function (r) {
        return {
          label: TRAFFIC[r.insightTrafficSourceType] || r.insightTrafficSourceType,
          value: Number(r.views) || 0,
          sub: '総再生時間 ' + fmtWatch(Number(r.estimatedMinutesWatched) || 0)
        };
      });
      Chart.hbar(host, rows);
    });

    fill('searchTerms', Api.report(Object.assign({}, base, {
      dimensions: 'insightTrafficSourceDetail', filters: 'insightTrafficSourceType==YT_SEARCH',
      metrics: 'views', sort: '-views', maxResults: 25
    })), function (host, res) {
      var rows = Api.rows(res).map(function (r) {
        return { label: r.insightTrafficSourceDetail, value: Number(r.views) || 0 };
      });
      if (!rows.length) {
        host.innerHTML = '<p class="chart-empty">この期間、YouTube検索からの流入がありません。<br>' +
          '検索で見つかるには、まず題名と説明文に「探されている言葉」が入っている必要があります。</p>';
        return;
      }
      Chart.hbar(host, rows, { share: false });
    });

    fill('extSources', Api.report(Object.assign({}, base, {
      dimensions: 'insightTrafficSourceDetail', filters: 'insightTrafficSourceType==EXT_URL',
      metrics: 'views', sort: '-views', maxResults: 15
    })), function (host, res) {
      var rows = Api.rows(res).map(function (r) {
        return { label: r.insightTrafficSourceDetail, value: Number(r.views) || 0 };
      });
      if (!rows.length) { host.innerHTML = '<p class="chart-empty">外部サイトからの流入はありません</p>'; return; }
      Chart.hbar(host, rows, { share: false });
    });

    fill('playbackLoc', Api.report(Object.assign({}, base, {
      dimensions: 'insightPlaybackLocationType', metrics: 'views', sort: '-views'
    })), function (host, res) {
      Chart.hbar(host, Api.rows(res).map(function (r) {
        return { label: PLAYBACK[r.insightPlaybackLocationType] || r.insightPlaybackLocationType, value: Number(r.views) || 0 };
      }));
    });
  }

  /* ========== 視聴者 ========== */
  function loadAudience() {
    if (S.loaded.audience) return;
    S.loaded.audience = true;
    var p = period();
    var base = { startDate: p.start, endDate: p.end };

    fill('geo', Api.report(Object.assign({}, base, {
      dimensions: 'country', metrics: 'views,estimatedMinutesWatched,averageViewDuration',
      sort: '-views', maxResults: 20
    })), function (host, res) {
      Chart.hbar(host, Api.rows(res).map(function (r) {
        return {
          label: regionName(r.country), value: Number(r.views) || 0,
          sub: '平均視聴時間 ' + Chart.fmtDur(Number(r.averageViewDuration) || 0)
        };
      }));
    });

    fill('devices', Api.report(Object.assign({}, base, {
      dimensions: 'deviceType', metrics: 'views', sort: '-views'
    })), function (host, res) {
      Chart.hbar(host, Api.rows(res).map(function (r) {
        return { label: DEVICE[r.deviceType] || r.deviceType, value: Number(r.views) || 0 };
      }));
    });

    fill('subStatus', Api.report(Object.assign({}, base, {
      dimensions: 'subscribedStatus', metrics: 'views,estimatedMinutesWatched,averageViewDuration'
    })), function (host, res) {
      var rows = Api.rows(res).map(function (r) {
        return {
          label: r.subscribedStatus === 'SUBSCRIBED' ? '登録者' : '登録していない人',
          value: Number(r.views) || 0,
          sub: '平均視聴時間 ' + Chart.fmtDur(Number(r.averageViewDuration) || 0)
        };
      });
      Chart.hbar(host, rows);
      var un = rows.filter(function (r) { return r.label !== '登録者'; })[0];
      var total = rows.reduce(function (a, r) { return a + r.value; }, 0);
      if (un && total && un.value / total > 0.8) {
        host.insertAdjacentHTML('beforeend',
          '<p class="note">視聴の' + Math.round(un.value / total * 100) + '%が未登録者です。' +
          '新しい人には届いている状態なので、次の課題は「登録に進んでもらうこと」です。' +
          '終了画面と、説明文の最初の行での誘導が効きます。</p>');
      }
    });

    fill('demo', Api.report(Object.assign({}, base, {
      dimensions: 'ageGroup,gender', metrics: 'viewerPercentage', sort: '-viewerPercentage'
    })), function (host, res) {
      var rows = Api.rows(res);
      if (!rows.length) { host.innerHTML = '<p class="chart-empty">この期間は年齢・性別のデータがありません（人数が少ないと出ません）</p>'; return; }
      var by = {};
      rows.forEach(function (r) {
        by[r.ageGroup] = by[r.ageGroup] || { m: 0, f: 0, o: 0 };
        var k = r.gender === 'male' ? 'm' : r.gender === 'female' ? 'f' : 'o';
        by[r.ageGroup][k] += Number(r.viewerPercentage) || 0;
      });
      var keys = Object.keys(AGES).filter(function (k) { return by[k]; });
      host.innerHTML =
        '<div class="legend-inline legend-block"><i class="sw-1"></i>男性<i class="sw-2"></i>女性' +
        (keys.some(function (k) { return by[k].o > 0.05; }) ? '<i class="sw-3"></i>その他' : '') + '</div>' +
        '<div class="demo">' + keys.map(function (k) {
          var d = by[k], t = d.m + d.f + d.o;
          return '<div class="demo-row"><span class="demo-age">' + AGES[k] + '</span>' +
            '<span class="demo-bar">' +
            (d.m ? '<i class="s1" style="width:' + d.m + '%"></i>' : '') +
            (d.f ? '<i class="s2" style="width:' + d.f + '%"></i>' : '') +
            (d.o ? '<i class="s3" style="width:' + d.o + '%"></i>' : '') +
            '</span><span class="demo-val">' + Chart.fmtPct(t) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="note">この数字は「視聴時間に占める割合」です。YouTube にログインしている人の情報だけが元なので、全体の縮図ではありません。</p>';
    });
  }

  /* ========== 診断 ========== */
  function loadAudit() {
    if (S.loaded.audit) { return; }
    S.loaded.audit = true;
    var host = $('channelAudit');
    host.innerHTML = '<p class="skeleton">読み込んでいます…</p>';

    /* 最近の投稿50本を見る。期間内に再生がなかった動画も含めたいので、
       アップロード用の再生リストから取り直す。 */
    var uploads = ((S.channel || {}).contentDetails || {}).relatedPlaylists || {};
    var plist = uploads.uploads;
    var chain = plist
      ? Api.data('playlistItems', { part: 'contentDetails', playlistId: plist, maxResults: 50 })
        .then(function (res) {
          return fetchVideoDetails((res.items || []).map(function (i) { return i.contentDetails.videoId; }));
        })
      : Promise.resolve();

    chain.then(function () {
      var vids = Object.keys(S.videos).map(function (k) { return S.videos[k]; });
      var checks = Seo.channelAudit(vids);
      host.innerHTML = checks.length
        ? checks.map(checkRow).join('')
        : '<p class="chart-empty">目立つ問題は見つかりませんでした</p>';
      renderWeekday(vids);
      renderAuditList();
    }).catch(function (e) { panelError(host, e); });
  }

  function checkRow(c) {
    var mark = { good: '✓', warn: '!', bad: '✕', info: 'i' }[c.level] || 'i';
    return '<div class="check check-' + c.level + '">' +
      '<span class="check-mark" aria-hidden="true">' + mark + '</span>' +
      '<div class="check-body"><b>' + esc(c.label) + '</b>' +
      (c.detail ? '<span class="check-detail">' + esc(c.detail) + '</span>' : '') +
      (c.why ? '<span class="check-why">' + esc(c.why) + '</span>' : '') +
      '</div></div>';
  }

  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var WEEKDAY_WINDOW_DAYS = 180;
  function renderWeekday(vids) {
    var host = $('weekday');
    var by = {};
    /* 直近180日に公開したものだけを見る。
       何年も前の動画まで混ぜると、その動画が「いま」稼いでいる視聴回数が
       当時の公開曜日の手柄になってしまい、曜日の比較として意味をなさない。 */
    vids.forEach(function (v) {
      var r = S.period[v.id];
      if (!r || !v.snippet || !v.snippet.publishedAt) return;
      var pub = new Date(v.snippet.publishedAt);
      if ((Date.now() - pub.getTime()) / 86400000 > WEEKDAY_WINDOW_DAYS) return;
      var d = pub.getDay();
      by[d] = by[d] || { n: 0, views: 0 };
      by[d].n++; by[d].views += Number(r.views) || 0;
    });
    var rows = Object.keys(by).map(function (d) {
      return { label: WD[d] + '曜', value: Math.round(by[d].views / by[d].n), sub: by[d].n + '本' };
    }).sort(function (a, b) { return b.value - a.value; });

    if (rows.length < 3) {
      host.innerHTML = '<p class="chart-empty">曜日を比べられるだけの本数がありません' +
        '（直近' + WEEKDAY_WINDOW_DAYS + '日に3曜日以上へ投稿があると出ます）</p>';
      return;
    }
    Chart.hbar(host, rows, { share: false });
    host.insertAdjacentHTML('beforeend',
      '<p class="note">直近' + WEEKDAY_WINDOW_DAYS + '日に公開した動画だけを数えた、' +
      '1本あたりの期間内視聴回数です。何年も前の動画を混ぜると、いま稼いでいる分が' +
      '当時の曜日の手柄になってしまうため除いています。' +
      'それでも本数の少ない曜日はたまたま伸びた1本に引きずられるので、' +
      '各曜日3本くらい溜まってから判断してください。</p>');
  }

  function renderAuditList() {
    var rows = Object.keys(S.videos).map(function (id) {
      var v = S.videos[id];
      var a = Seo.audit(v);
      return {
        id: id, title: v.snippet.title, score: a.score, audit: a,
        thumb: (v.snippet.thumbnails && (v.snippet.thumbnails.medium || v.snippet.thumbnails.default) || {}).url
      };
    }).filter(function (r) { return r.score < 100; })
      .sort(function (a, b) { return a.score - b.score; }).slice(0, 15);

    $('auditList').innerHTML = rows.length ? rows.map(function (r) {
      var issues = r.audit.checks.filter(function (c) { return c.level === 'bad' || c.level === 'warn'; });
      return '<button class="vcard" data-id="' + esc(r.id) + '" type="button">' +
        (r.thumb ? '<img class="vthumb" src="' + esc(r.thumb) + '" alt="" loading="lazy">' : '<span class="vthumb"></span>') +
        '<span class="vbody"><span class="vtitle">' + esc(r.title) + '</span>' +
        '<span class="vmeta">' + issues.slice(0, 3).map(function (c) { return esc(c.label); }).join(' ／ ') + '</span></span>' +
        '<span class="vscore ' + scoreClass(r.score) + '">' + r.score + '</span></button>';
    }).join('') : '<p class="chart-empty">直すところは見つかりませんでした</p>';
    bindVideoClicks($('auditList'));
  }


  /* ========== 数字カードを押したときの中身 ==========
     出すのは3つ。数字そのものより、この3つが判断に要る。
       1. この指標が何を数えたものか（言葉の定義）
       2. 日ごとの動きと、前の同じ期間との比べ
       3. どの動画がこの数字を作っているか
     3つ目がいちばん効く。合計だけ見ても、直す先が分からないため。 */
  var METRICS = {
    views: {
      label: '視聴回数', dayKey: 'views', vidKey: 'views', unit: '回',
      total: function (r) { return sum(r, 'views'); },
      fmt: function (v) { return Chart.fmtInt(v) + '回'; },
      means: 'この期間に動画が再生された回数の合計です。同じ人が2回見れば2回と数えます。',
      tips: '跳ねた日があれば、その日に何を出したか、どこから来たかを「流入」タブで確かめてください。' +
        '本数を増やしても伸びないときは、視聴回数より先に平均視聴時間を見るほうが早く原因にたどり着きます。'
    },
    watch: {
      label: '総再生時間', dayKey: 'estimatedMinutesWatched', vidKey: 'estimatedMinutesWatched', unit: '分',
      total: function (r) { return sum(r, 'estimatedMinutesWatched'); },
      fmt: function (v) { return fmtWatch(v); },
      means: '視聴された時間の合計です。視聴回数 × 1回あたりの長さ、とほぼ同じ意味になります。',
      tips: 'YouTube が動画を広げるかどうかは、視聴回数よりこちらに近いところで決まります。' +
        '収益化の条件（公開動画の総再生時間4,000時間）もこの数字です。'
    },
    avg: {
      label: '平均視聴時間', dayKey: 'averageViewDuration', vidKey: 'averageViewDuration', unit: '秒',
      total: function (r) { return weighted(r, 'averageViewDuration', 'views'); },
      fmt: function (v) { return Chart.fmtDur(v); },
      means: '1回の再生で、どれだけの長さ見られたかです。視聴回数で重みをつけた平均で出しています（日ごとの値をただ足して割ると、視聴の少ない日が同じ重みになってしまうため）。',
      tips: '長さの違う動画を比べるときは、％ではなくこちらを見てください。' +
        '20分の動画の30%（6分）と、3分の動画の60%（1.8分）では、YouTube が評価するのは前者です。'
    },
    pct: {
      label: '平均視聴率', dayKey: 'averageViewPercentage', vidKey: 'averageViewPercentage', unit: '%',
      total: function (r) { return weighted(r, 'averageViewPercentage', 'views'); },
      fmt: function (v) { return Chart.fmtPct(v); },
      means: '動画の長さに対して、どれだけの割合が見られたかです。こちらも視聴回数で重みをつけた平均です。',
      tips: '長い動画ほど低く出ます。BGM や作業用のような長尺で数％〜十数％になるのは普通で、それ自体は問題ではありません。' +
        '同じ動画の過去と比べる、あるいは同じくらいの長さの動画どうしで比べるときにだけ意味を持ちます。'
    },
    subs: {
      label: '登録者の増減', dayKey: null, vidKey: 'subscribersGained', unit: '人',
      total: function (r) { return sum(r, 'subscribersGained') - sum(r, 'subscribersLost'); },
      fmt: function (v) { return (v >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(v)) + '人'; },
      means: '増えた人数から、減った人数を引いた純増です。丸められていない正確な値です。',
      tips: '登録者は結果であって原因ではありません。動くのは維持率と流入のほうなので、' +
        'この数字が伸び悩むときは、登録を促す前に「最後まで見られているか」を先に見てください。'
    },
    /* この1枚がいちばん効く。合計の登録者数は「どれだけ見られたか」に
       引きずられるので、見られ方が変わっただけで動く。
       1,000視聴で割ると、その影響が落ちて「作りが効いているか」だけが残る。 */
    conv: {
      label: '登録への転換', dayKey: null, vidKey: 'subscribersGained', unit: '人',
      total: function (r) { var v = sum(r, 'views'); return v ? sum(r, 'subscribersGained') / v * 1000 : 0; },
      fmt: function (v) { return v.toFixed(2) + '人／1,000視聴'; },
      means: '1,000回再生されるうち、何人が登録したかです。増えた人数を視聴回数で割って出しています（解除は引きません。「見た人が登録したか」を見る数字なので、解除を混ぜると別の問いの答えになってしまいます）。',
      tips: '登録者数そのものは、たまたま1本当たれば増えます。この数字は当たり外れの影響が落ちるので、' +
        '「作りが効いているか」を見るのに向きます。視聴回数が伸びているのにここが落ちているときは、' +
        '本数を増やしても同じ比率でしか積み上がりません。増やす前に、いちばん見られている1本の' +
        '終了画面・説明文の1行目・固定コメントを直すほうが先です。'
    },
    engage: {
      label: '高評価 / コメント', dayKey: 'likes', vidKey: 'likes', unit: '件',
      total: function (r) { return sum(r, 'likes'); },
      fmt: function (v) { return Chart.fmtInt(v) + '件'; },
      means: '高評価の数です（日ごとのグラフも高評価）。コメントと共有の数は下にまとめています。',
      tips: '高評価率（高評価 ÷ 視聴回数）は、内容が刺さったかの目安になります。' +
        '2〜4%あれば良いほうです。ただし BGM のような「流しておく」動画では元々低く出ます。'
    }
  };

  function openMetricSheet(key) {
    var m = METRICS[key];
    if (!m || !S.dayRows) return;
    var p = period();
    var now = m.total(S.dayRows), before = m.total(S.prevRows);

    $('sheetTitle').textContent = m.label;
    $('sheet').hidden = false;
    document.body.classList.add('locked');

    var extra = '';
    if (key === 'engage') {
      extra = '<div class="mstats">' +
        mstat('高評価', Chart.fmtInt(sum(S.dayRows, 'likes')) + '件') +
        mstat('コメント', Chart.fmtInt(sum(S.dayRows, 'comments')) + '件') +
        mstat('共有', Chart.fmtInt(sum(S.dayRows, 'shares')) + '件') +
        mstat('高評価率', Chart.fmtPct(sum(S.dayRows, 'views') ? sum(S.dayRows, 'likes') / sum(S.dayRows, 'views') * 100 : 0)) +
        '</div>';
    }
    if (key === 'conv') {
      var cg = sum(S.dayRows, 'subscribersGained');
      var cv = sum(S.dayRows, 'views');
      var cl = sum(S.dayRows, 'subscribersLost');
      extra = '<div class="mstats">' +
        mstat('視聴回数', Chart.fmtInt(cv) + '回') +
        mstat('増えた登録者', '＋' + Chart.fmtInt(cg) + '人') +
        mstat('1,000視聴あたり', (cv ? cg / cv * 1000 : 0).toFixed(2) + '人') +
        mstat('解除も引いた場合', (cv ? (cg - cl) / cv * 1000 : 0).toFixed(2) + '人') +
        '</div>' +
        '<p class="note">「解除も引いた場合」は純増で割ったものです。' +
        '実際に残る人数の目安になりますが、作りが効いているかを見るときは' +
        '解除を引かないほうの数字を使ってください。</p>';
    }
    if (key === 'subs') {
      var gained = sum(S.dayRows, 'subscribersGained');
      var lost = sum(S.dayRows, 'subscribersLost');
      var vws = sum(S.dayRows, 'views');
      extra = '<div class="mstats">' +
        mstat('増えた', '＋' + Chart.fmtInt(gained) + '人') +
        mstat('減った', '−' + Chart.fmtInt(lost) + '人') +
        mstat('登録率', Chart.fmtRate(vws ? gained / vws * 100 : 0)) +
        mstat('解除率', Chart.fmtRate(vws ? lost / vws * 100 : 0)) +
        '</div>' +
        '<p class="note">率はどちらも「視聴1回あたり何人か」です。実数だけでは' +
        '再生数の違う期間・動画を比べられないため、率も並べています。</p>';
    }

    $('sheetBodyInner').innerHTML =
      '<div class="mhead">' +
      '<div class="mbig">' + m.fmt(now) + '</div>' +
      '<div class="mcmp">' + deltaTag(Insight.pct(now, before)) +
      '<span class="hint">前の同じ期間（' + p.prevStart.slice(5) + '〜' + p.prevEnd.slice(5) + '）は ' +
      m.fmt(before) + '</span></div>' +
      '<p class="hint">' + p.start + ' 〜 ' + p.end + '（' + p.days + '日間）</p>' +
      '</div>' +
      extra +
      '<h3>何を数えた数字か</h3><p class="lead">' + esc(m.means) + '</p>' +
      '<h3>日ごとの動き</h3>' +
      '<div class="chart-box" id="mChart"></div>' +
      (key === 'conv'
        ? '<h3>登録に繋がっている動画</h3>' +
          '<p class="lead">1,000視聴あたりの登録者数が多い順です。' +
          '再生数の少ない動画は数字が大きく振れるので、この期間に' + CONV_MIN_VIEWS +
          '回以上再生されたものだけを並べています。</p>' +
          '<div id="mConvBest" class="vlist"></div>' +
          '<h3>登録に繋がっていない動画</h3>' +
          '<p class="lead">同じ条件で、少ない順です。ここに並ぶ動画は、見られてはいるのに' +
          '次に繋がっていません。上の一覧の1本と見比べて、説明文の1行目・終了画面・' +
          '固定コメントで何が違うかを探すのがいちばん早い直し方です。</p>' +
          '<div id="mConvWorst" class="vlist"></div>'
        : key === 'subs'
        ? '<h3>登録のきっかけになった動画</h3>' +
          '<p class="lead">この期間、登録者が増えたときに直前に見ていた動画の上位です。' +
          '動画を押すと、その1本の維持率と流入が見られます。</p>' +
          '<div id="mVideosGained" class="vlist"></div>' +
          '<h3>登録を解除された動画</h3>' +
          '<p class="lead">この期間、登録を解除される直前に見ていた動画の上位です。' +
          'YouTube が「その動画が原因」として記録しているわけではない点に注意してください。</p>' +
          '<div id="mVideosLost" class="vlist"></div>'
        : '<h3>この数字を作っている動画</h3>' +
          '<p class="lead">上位5本です。動画を押すと、その1本の維持率と流入が見られます。</p>' +
          '<div id="mVideos" class="vlist"></div>') +
      '<h3>読み方</h3><p class="lead">' + esc(m.tips) + '</p>';

    if (key === 'conv') {
      /* 日ごとの率。視聴の無い日は0ではなく「計算できない日」なので、
         0として描くと谷を作って誤読させる。その日は前後を繋がずに0扱いにせず、
         視聴のある日だけを並べる。 */
      var per1k = function (r) {
        var v = Number(r.views) || 0;
        return v ? (Number(r.subscribersGained) || 0) / v * 1000 : 0;
      };
      Chart.line($('mChart'), {
        values: S.dayRows.filter(function (r) { return Number(r.views) > 0; })
          .map(function (r) { return { date: r.day, value: per1k(r) }; }),
        compare: S.prevRows.filter(function (r) { return Number(r.views) > 0; })
          .map(function (r) { return { date: r.day, value: per1k(r) }; }),
        label: m.label, unit: '人／1,000視聴', height: 200
      });
    } else if (key === 'subs') {
      Chart.delta($('mChart'), S.dayRows.map(function (r) {
        return { date: r.day, gained: Number(r.subscribersGained) || 0, lost: Number(r.subscribersLost) || 0 };
      }));
    } else {
      Chart.line($('mChart'), {
        values: S.dayRows.map(function (r) { return { date: r.day, value: Number(r[m.dayKey]) || 0 }; }),
        compare: S.prevRows.map(function (r) { return { date: r.day, value: Number(r[m.dayKey]) || 0 }; }),
        label: m.label, unit: m.unit, height: 200
      });
    }

    if (key === 'conv') {
      renderConvVideos();
    } else if (key === 'subs') {
      renderSubsVideos();
    } else {
      var rows = allStats().filter(function (v) { return v[statKey(key)] > 0; })
        .sort(function (a, b) { return b[statKey(key)] - a[statKey(key)]; }).slice(0, 5);
      $('mVideos').innerHTML = rows.length
        ? rows.map(function (v) { return mvideo(v, key); }).join('')
        : '<p class="chart-empty">この期間に該当する動画がありません</p>';
      bindVideoClicks($('mVideos'));
    }
  }

  /* 率で並べるときの最低再生数。
     10回再生されて1人登録した動画は「100人／1,000視聴」になってしまい、
     率の一覧を意味のないもので埋めてしまう。しきい値を置いて外す。 */
  var CONV_MIN_VIEWS = 300;

  /* 「登録への転換」の一覧。多い順と少ない順を両方出す。
     多い順だけでは「何が効いているか」しか分からず、直す先が出てこない。
     少ない順に並ぶ動画こそが、見られているのに次に繋がっていない取りこぼしで、
     同じだけ見られている上の1本と見比べれば、差は作りの側に絞り込める。 */
  function renderConvVideos() {
    var best = $('mConvBest'), worst = $('mConvWorst');
    if (!S.loaded.videos) {
      best.innerHTML = worst.innerHTML = '<p class="skeleton">読み込んでいます…</p>';
      (S.videosPromise || Promise.resolve()).then(refreshConvSheetIfOpen);
      return;
    }
    var rows = allStats().filter(function (v) { return v.views >= CONV_MIN_VIEWS; });
    if (rows.length < 2) {
      best.innerHTML = worst.innerHTML =
        '<p class="chart-empty">この期間に' + CONV_MIN_VIEWS + '回以上再生された動画が足りません</p>';
      return;
    }
    var sorted = rows.slice().sort(function (a, b) { return b.subPer1k - a.subPer1k; });
    /* 本数が少ないと、上位5本と下位5本が同じ顔ぶれの裏返しになってしまう。
       それでは見比べる材料にならないので、重ならないところまで減らす。 */
    var k = Math.min(5, Math.floor(sorted.length / 2));
    var draw = function (host, list) {
      host.innerHTML = list.map(function (v) {
        return '<button class="vcard" data-id="' + esc(v.id) + '" type="button">' +
          (v.thumb ? '<img class="vthumb" src="' + esc(v.thumb) + '" alt="" loading="lazy">' : '<span class="vthumb"></span>') +
          '<span class="vbody"><span class="vtitle">' + esc(v.title) + '</span>' +
          '<span class="vmeta">' + Chart.fmtInt(v.views) + '回 ・ 登録＋' + Chart.fmtInt(v.subs) +
          '人 ・ 平均' + Chart.fmtDur(v.avg) + '</span></span>' +
          '<span class="subcell">' +
          '<b>' + v.subPer1k.toFixed(2) + '</b>' +
          '<i class="rate">人／1,000視聴</i>' +
          '</span></button>';
      }).join('');
      bindVideoClicks(host);
    };
    draw(best, sorted.slice(0, k));
    draw(worst, sorted.slice().reverse().slice(0, k));
  }
  function refreshConvSheetIfOpen() {
    if (!$('sheet').hidden && $('sheetTitle').textContent === METRICS.conv.label) renderConvVideos();
  }

  /* 登録者は「増えた」「減った」で意味が正反対なので、
     一つの一覧を数字の大小で並べるのではなく、2つに分けて出す。
     動画一覧（allStats）にはすでに解除数も含まれている
     （loadVideos の問い合わせに subscribersLost を足したため）ので、
     ここは並べ替えて上位5件を切り出すだけで済み、別の問い合わせは要らない。

     行ごとに、その動画で増えた数と減った数を両方見せる。
     「増えた動画ランキング」に減った数が見えないと、差し引きの実感が湧かない
     （＋200増えていても同時に−180減っていれば、実質は＋20でしかない）。

     ▼ この一覧の正しい読み方
     「登録を解除された動画」は、YouTube が「解除する直前に見ていた動画」として
     記録したものであり、「その動画が原因で解除された」という意味ではない。
     たまたま最後に見ていた動画が記録されるだけ。 */
  function renderSubsVideos() {
    var gHost = $('mVideosGained'), lHost = $('mVideosLost');

    /* 動画一覧そのものがまだ届いていない（開いてすぐ押した等）。
       届いたら、このシートがまだ「登録者の増減」を表示していれば描き直す。 */
    if (!S.loaded.videos) {
      gHost.innerHTML = lHost.innerHTML = '<p class="skeleton">読み込んでいます…</p>';
      (S.videosPromise || Promise.resolve()).then(refreshSubsSheetIfOpen);
      return;
    }

    var all = allStats();
    function build(host, primaryKey, emptyMsg) {
      var otherKey = primaryKey === 'subs' ? 'unsubs' : 'subs';
      var pCls = primaryKey === 'subs' ? 'v-up' : 'v-down';
      var pSign = primaryKey === 'subs' ? '＋' : '−';
      var oCls = otherKey === 'subs' ? 'v-up' : 'v-down';
      var oSign = otherKey === 'subs' ? '＋' : '−';
      var rows = all.filter(function (v) { return v[primaryKey] > 0; })
        .sort(function (a, b) { return b[primaryKey] - a[primaryKey]; }).slice(0, 5);
      host.innerHTML = rows.length ? rows.map(function (v) {
        return '<button class="vcard" data-id="' + esc(v.id) + '" type="button">' +
          (v.thumb ? '<img class="vthumb" src="' + esc(v.thumb) + '" alt="" loading="lazy">' : '<span class="vthumb"></span>') +
          '<span class="vbody"><span class="vtitle">' + esc(v.title) + '</span></span>' +
          '<span class="subcell">' +
          '<b class="' + pCls + '">' + pSign + Chart.fmtInt(v[primaryKey]) + '人</b>' +
          (v[otherKey] ? '<em class="' + oCls + '">' + oSign + Chart.fmtInt(v[otherKey]) + '人</em>' : '') +
          '<i class="rate">解除率 ' + Chart.fmtRate(v.unsubRate) + '</i>' +
          '</span></button>';
      }).join('') : '<p class="chart-empty">' + emptyMsg + '</p>';
      bindVideoClicks(host);
    }

    // 増えたほうは、動画一覧の本体（常に取れる）だけで組み立てられる
    build(gHost, 'subs', 'この期間、増えた登録者はいません');

    // 減ったほうは、別枠で取りに行っている解除数の状態しだい
    if (S.unsubsState === 'loading') {
      lHost.innerHTML = '<p class="skeleton">読み込んでいます…</p>';
      (S.unsubsPromise || Promise.resolve()).then(refreshSubsSheetIfOpen).catch(refreshSubsSheetIfOpen);
    } else if (S.unsubsState === 'unavailable') {
      lHost.innerHTML = '<p class="error-box">このチャンネルでは、動画ごとの解除数を取得できませんでした。</p>';
    } else {
      build(lHost, 'unsubs', 'この期間、登録の解除はありません');
    }
  }

  /* 指標の名前を、動画1本ぶんの持ち物の名前に置き換える */
  function statKey(key) {
    return { views: 'views', watch: 'watch', avg: 'avg', pct: 'pct', subs: 'subs',
      conv: 'subPer1k', engage: 'likes' }[key];
  }
  function mstat(label, value) {
    return '<div class="mstat"><span>' + esc(label) + '</span><b>' + value + '</b></div>';
  }
  function mvideo(v, key) {
    var val = {
      views: Chart.fmtInt(v.views) + '回',
      watch: fmtWatch(v.watch),
      avg: Chart.fmtDur(v.avg),
      pct: Chart.fmtPct(v.pct),
      subs: '＋' + Chart.fmtInt(v.subs) + '人',
      conv: v.subPer1k.toFixed(2) + '人',
      engage: Chart.fmtInt(v.likes) + '件'
    }[key];
    return '<button class="vcard" data-id="' + esc(v.id) + '" type="button">' +
      (v.thumb ? '<img class="vthumb" src="' + esc(v.thumb) + '" alt="" loading="lazy">' : '<span class="vthumb"></span>') +
      '<span class="vbody"><span class="vtitle">' + esc(v.title) + '</span>' +
      '<span class="vmeta">' + (v.publishedAt || '').slice(0, 10) + ' 公開</span></span>' +
      '<span class="mval">' + val + '</span></button>';
  }

  /* ========== 動画1本の詳細 ========== */
  function openSheet(id) {
    var v = S.videos[id];
    var s = videoStat(id);
    $('sheetTitle').textContent = s.title;
    $('sheet').hidden = false;
    document.body.classList.add('locked');

    var p = period();
    var body = $('sheetBodyInner');
    body.innerHTML =
      '<div class="sheet-top">' +
      (s.thumb ? '<img class="sheet-thumb" src="' + esc(s.thumb) + '" alt="">' : '') +
      '<div class="sheet-facts">' +
      '<div><span>公開</span><b>' + (s.publishedAt || '').slice(0, 10) + '</b></div>' +
      '<div><span>累計の再生</span><b>' + Chart.fmtInt(s.lifetime) + '回</b></div>' +
      '<div><span>期間内の再生</span><b>' + Chart.fmtInt(s.views) + '回</b></div>' +
      '<div><span>平均視聴時間</span><b>' + Chart.fmtDur(s.avg) + '</b></div>' +
      '<div><span>平均視聴率</span><b>' + Chart.fmtPct(s.pct) + '</b></div>' +
      '<div><span>公開後1日あたり</span><b>' + Chart.fmtInt(s.perDay) + '回</b></div>' +
      '</div></div>' +
      '<a class="ext" href="https://www.youtube.com/watch?v=' + esc(id) + '" target="_blank" rel="noopener">YouTube で開く ↗</a>' +
      moneyBlock(id) +
      '<h3>視聴維持率</h3>' +
      '<p class="lead">動画のどこで離脱されたか。急に落ちる場所が、直すべき場所です。' +
      '冒頭30秒の落ち方がいちばん効きます。</p>' +
      '<div class="chart-box" id="sheetRetention"></div>' +
      '<h3>この期間の再生の推移</h3><div class="chart-box" id="sheetDays"></div>' +
      '<h3>この動画の流入経路</h3><div id="sheetTraffic"></div>' +
      '<h3>作りの点検</h3><div id="sheetChecks" class="checks"></div>';

    var checks = s.audit ? s.audit.checks : [];
    $('sheetChecks').innerHTML =
      (s.audit ? '<div class="score-head"><span class="vscore ' + scoreClass(s.audit.score) + '">' +
        s.audit.score + '<em>' + scoreWord(s.audit.score) + '</em></span>' +
        '<span class="hint">題名・説明文・タグの作りを100点満点で点検した結果です。視聴回数や人気とは関係ありません。' +
        'vidIQ のスコアとも別物で、公開されている作り方の指針だけで判定しています。</span></div>' : '') +
      checks.map(checkRow).join('');

    fill('sheetRetention', Api.report({
      startDate: p.start, endDate: p.end, filters: 'video==' + id,
      dimensions: 'elapsedVideoTimeRatio', metrics: 'audienceWatchRatio,relativeRetentionPerformance'
    }), function (host, res) {
      var dur = v ? Seo.durationSec(v.contentDetails.duration) : 0;
      var pts = Api.rows(res).map(function (r) {
        var x = Number(r.elapsedVideoTimeRatio) || 0;
        return { x: x, y: (Number(r.audienceWatchRatio) || 0) * 100, at: dur ? Chart.fmtDur(dur * x) : '' };
      }).sort(function (a, b) { return a.x - b.x; });
      Chart.retention(host, pts);
      if (pts.length > 4) {
        var at30 = pts.filter(function (p2) { return dur && p2.x * dur <= 30; }).pop();
        if (at30) {
          host.insertAdjacentHTML('afterend',
            '<p class="note">冒頭30秒の時点で <b>' + Chart.fmtPct(at30.y) + '</b> が残っています。' +
            (at30.y < 60 ? '半分近くが最初の30秒で離れています。冒頭の作り（結論を先に出す・前置きを削る）が最優先の課題です。'
              : at30.y < 75 ? '平均的な水準です。前置きを1文削るだけでも変わります。'
                : 'よく持ちこたえています。この冒頭の作りは他の動画にも使えます。') + '</p>');
        }
      }
    });

    fill('sheetDays', Api.report({
      startDate: p.start, endDate: p.end, filters: 'video==' + id,
      dimensions: 'day', metrics: 'views,estimatedMinutesWatched'
    }), function (host, res) {
      Chart.line(host, {
        values: Api.rows(res).map(function (r) { return { date: r.day, value: Number(r.views) || 0 }; }),
        label: '視聴回数', unit: '回', height: 180
      });
    });

    fill('sheetTraffic', Api.report({
      startDate: p.start, endDate: p.end, filters: 'video==' + id,
      dimensions: 'insightTrafficSourceType', metrics: 'views', sort: '-views'
    }), function (host, res) {
      Chart.hbar(host, Api.rows(res).map(function (r) {
        return { label: TRAFFIC[r.insightTrafficSourceType] || r.insightTrafficSourceType, value: Number(r.views) || 0 };
      }));
    });
  }

  /* 収益タブから押して開いたときだけ出す、その1本ぶんの収益。
     「収益」タブで取った動画別の数字をそのまま使うので、追加の問い合わせはしない。
     収益は権限も1日の枠も別なので、同じ数字を2度取りに行かない。

     RPM を並べているのが要点。金額の大小は再生数の大小でほぼ決まるので、
     「どの動画が儲かる作りか」は金額ではなく RPM を見ないと分からない。 */
  function moneyBlock(id) {
    var r = (S.revByVideo || {})[id];
    if (!r) return '';
    var cur = S.revCurrency || 'JPY';
    var money = function (v) { return Chart.fmtMoney(v, cur); };
    var views = Number(r.views) || 0;
    var rev = Number(r.estimatedRevenue) || 0;
    var gross = Number(r.grossRevenue) || 0;
    var mplays = Number(r.monetizedPlaybacks) || 0;
    var chanRpm = S.chanRpm;
    var rpm = views ? rev / views * 1000 : 0;

    var note = '';
    if (chanRpm > 0 && rpm > 0) {
      var d = (rpm - chanRpm) / chanRpm * 100;
      note = Math.abs(d) < 10
        ? 'RPM はチャンネル全体（' + money(chanRpm) + '）とほぼ同じです。'
        : 'RPM はチャンネル全体（' + money(chanRpm) + '）より' +
          Math.abs(Math.round(d)) + '%' + (d > 0 ? '高い' : '低い') + '本です。' +
          (d > 0 ? 'この長さ・この題材は単価が取れています。同じ型で増やすのが効きます。'
                 : '再生数のわりに手取りが薄い本です。長さが短くて広告が入る場所が少ないか、' +
                   '広告主が付きにくい題材の可能性があります。');
    }

    return '<h3>この動画の収益</h3>' +
      '<div class="mstats">' +
      mstat('推定収益', money(rev)) +
      mstat('推定RPM', money(rpm)) +
      mstat('収益化された再生', mplays ? Chart.fmtInt(mplays) + '回' : '—') +
      mstat('総収入', gross ? money(gross) : '—') +
      '</div>' +
      '<p class="note">推定収益は YouTube の取り分を引いたあとの手取り、総収入は引く前です。' +
      '並べると必ず総収入のほうが大きく見えますが、基準が違うためで異常ではありません。' +
      (note ? ' ' + note : '') + '</p>';
  }

  function closeSheet() {
    $('sheet').hidden = true;
    document.body.classList.remove('locked');
  }

  /* Object.assign が無い環境向けの保険（古いSafari） */
  if (typeof Object.assign !== 'function') {
    Object.assign = function (t) {
      for (var i = 1; i < arguments.length; i++) {
        var s = arguments[i];
        for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
      }
      return t;
    };
  }

  boot();
  watchWake();
  autoConnect();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
