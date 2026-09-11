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
  function period() {
    var n = Store.days();
    var end = shift(new Date(), -LAG_DAYS);
    var start = shift(end, -(n - 1));
    return {
      days: n,
      start: ymd(start), end: ymd(end),
      prevStart: ymd(shift(start, -n)), prevEnd: ymd(shift(start, -1))
    };
  }

  /* ========== 見せ方の共通部品 ========== */
  function fmtWatch(min) {
    if (min >= 60000) return Math.round(min / 60).toLocaleString('ja-JP') + '時間';
    if (min >= 60) return (min / 60).toFixed(1) + '時間';
    return Math.round(min).toLocaleString('ja-JP') + '分';
  }
  function fmtDelta(now, before) {
    if (before == null || !isFinite(before)) return '';
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
  function busy(on, text) {
    $('loading').hidden = !on;
    if (text) $('loadingText').textContent = text;
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
    $('period').value = String(Store.days());
    $('clientId').value = Store.clientId();
    $('originHint').textContent =
      'Google Cloud の「承認済みの JavaScript 生成元」には ' + location.origin + ' を登録してください。';
    $('setupHint').hidden = !!Store.clientId();

    $('btnTheme').addEventListener('click', cycleTheme);
    $('btnConnect').addEventListener('click', connect);
    $('btnReload').addEventListener('click', function () {
      Store.cacheClear(); S.loaded = {}; loadDash(true);
    });
    $('period').addEventListener('change', function () {
      Store.setDays(this.value); S.loaded = {}; loadDash(true);
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
      Store.setClientId(v);
      $('setupHint').hidden = !!v;
      toast(v ? '保存しました。「概要」の上にある↻か、接続からお試しください。' : 'クライアントIDを消しました。');
    });
    $('btnClearCache').addEventListener('click', function () {
      Store.cacheClear(); S.loaded = {}; toast('貯めたデータを消しました。');
    });
    $('btnDisconnect').addEventListener('click', function () {
      Api.disconnect(); Store.cacheClear(); S = { channel: null, videos: {}, period: {}, loaded: {}, view: 'setup' };
      $('tabs').hidden = true; $('periodWrap').hidden = true; $('btnReload').hidden = true;
      $('brandSub').textContent = '未接続';
      show('setup');
      toast('接続を解除しました。');
    });
    $('btnResetAll').addEventListener('click', function () {
      if (!confirm('クライアントIDと貯めたデータをすべて消します。よろしいですか。')) return;
      Api.disconnect(); Store.reset(); location.reload();
    });
    $('videoSearch').addEventListener('input', renderVideoTable);
    $('videoSort').addEventListener('change', renderVideoTable);
    $('sheetBg').addEventListener('click', closeSheet);
    $('btnSheetClose').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
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
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === view);
    });
    window.scrollTo(0, 0);
    if (view === 'videos') loadVideos();
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
  function loadDash(refresh) {
    var p = period();
    busy(true, 'チャンネルの情報を読み込んでいます…');

    return Api.data('channels', {
      part: 'snippet,statistics,contentDetails', mine: 'true'
    }).then(function (res) {
      var ch = res.items && res.items[0];
      if (!ch) throw new Error('このアカウントに YouTube チャンネルが見つかりません。チャンネルを持つアカウントでログインしてください。');
      S.channel = ch;
      $('brandSub').textContent = ch.snippet.title;
      $('tabs').hidden = false; $('periodWrap').hidden = false; $('btnReload').hidden = false;
      show('dash');

      $('rangeNote').innerHTML =
        '<b>' + p.start + '</b> 〜 <b>' + p.end + '</b>（' + p.days + '日間）の成績です。' +
        '<span class="hint">YouTube の集計は確定までに数日かかるため、直近' + LAG_DAYS + '日は含めていません。</span>';

      return Promise.all([
        Api.report({
          startDate: p.start, endDate: p.end, dimensions: 'day',
          metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares'
        }),
        Api.report({
          startDate: p.prevStart, endDate: p.prevEnd, dimensions: 'day',
          metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost'
        }).catch(function () { return {}; })
      ]);
    }).then(function (r) {
      renderDash(Api.rows(r[0]), Api.rows(r[1]), p);
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
    var st = (S.channel && S.channel.statistics) || {};

    var tiles = [
      { label: '視聴回数', value: Chart.fmtInt(views), delta: fmtDelta(views, pViews), spark: rows.map(function (r) { return r.views; }) },
      { label: '総再生時間', value: fmtWatch(watch), delta: fmtDelta(watch, pWatch), spark: rows.map(function (r) { return r.estimatedMinutesWatched; }) },
      { label: '平均視聴時間', value: Chart.fmtDur(avg), delta: fmtDelta(avg, pAvg), note: '1回の再生で見られた長さ' },
      { label: '平均視聴率', value: Chart.fmtPct(pct), delta: fmtDelta(pct, pPct), note: '動画の長さに対する割合' },
      { label: '登録者の増減', value: (net >= 0 ? '＋' : '−') + Chart.fmtInt(Math.abs(net)), delta: fmtDelta(net, pNet), note: '合計 ' + Chart.fmtInt(st.subscriberCount || 0) + '人' },
      // 3つ並ぶので桁を詰める（42,463 ではなく 4.2万）。1行に収まらないと読みにくい。
      { label: '高評価 / コメント', value: Chart.fmtAxis(sum(rows, 'likes')) + ' / ' + Chart.fmtAxis(sum(rows, 'comments')), note: '共有 ' + Chart.fmtAxis(sum(rows, 'shares')) + '回' }
    ];

    $('kpis').innerHTML = tiles.map(function (t, i) {
      return '<div class="kpi">' +
        '<div class="kpi-label">' + esc(t.label) + '</div>' +
        '<div class="kpi-value">' + t.value + '</div>' +
        '<div class="kpi-foot">' + (t.delta || '') +
        (t.note ? '<span class="kpi-note">' + esc(t.note) + '</span>' : '') + '</div>' +
        (t.spark ? '<div class="kpi-spark" id="spark' + i + '"></div>' : '') +
        '</div>';
    }).join('');
    tiles.forEach(function (t, i) { if (t.spark && $('spark' + i)) Chart.spark($('spark' + i), t.spark); });

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

  /* ========== 動画 ========== */
  function loadVideos() {
    if (S.loaded.videos) { renderVideoTable(); renderTopVideos(); return Promise.resolve(); }
    var p = period();
    return Api.report({
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
    }).catch(function (e) {
      $('videoRows').innerHTML = '<tr><td colspan="7"><p class="error-box">' + esc(e.message) + '</p></td></tr>';
    });
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
      (s.subs ? ' ・ 登録＋' + Chart.fmtInt(s.subs) : '') +
      '</span></span>' +
      (s.seo != null ? '<span class="vscore ' + scoreClass(s.seo) + '">' + s.seo + '</span>' : '') +
      '</button>';
  }
  function scoreClass(n) { return n >= 85 ? 'ok' : n >= 65 ? 'mid' : 'ng'; }

  function bindVideoClicks(host) {
    host.querySelectorAll('[data-id]').forEach(function (b) {
      b.addEventListener('click', function () { openSheet(b.dataset.id); });
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
      new: function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); },
      vph: function (a, b) { return b.perDay - a.perDay; },
      seo: function (a, b) { return (a.seo == null ? 999 : a.seo) - (b.seo == null ? 999 : b.seo); }
    }[sortBy];
    rows.sort(cmp);

    $('videoRows').innerHTML = rows.length ? rows.map(function (s) {
      return '<tr data-id="' + esc(s.id) + '">' +
        '<td class="cell-title">' +
        (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" loading="lazy">' : '') +
        '<span><b>' + esc(s.title) + '</b><small>' + (s.publishedAt || '').slice(0, 10) +
        ' ・ 公開後1日あたり' + Chart.fmtInt(s.perDay) + '回</small></span></td>' +
        '<td class="num">' + Chart.fmtInt(s.views) + '</td>' +
        '<td class="num">' + fmtWatch(s.watch) + '</td>' +
        '<td class="num">' + Chart.fmtDur(s.avg) + '</td>' +
        '<td class="num">' + Chart.fmtPct(s.pct) + '</td>' +
        '<td class="num">' + (s.subs ? '＋' + Chart.fmtInt(s.subs) : '—') + '</td>' +
        '<td class="num">' + (s.seo != null ? '<span class="vscore ' + scoreClass(s.seo) + '">' + s.seo + '</span>' : '—') + '</td>' +
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
  function renderWeekday(vids) {
    var host = $('weekday');
    var by = {};
    vids.forEach(function (v) {
      var r = S.period[v.id];
      if (!r || !v.snippet || !v.snippet.publishedAt) return;
      var d = new Date(v.snippet.publishedAt).getDay();
      by[d] = by[d] || { n: 0, views: 0 };
      by[d].n++; by[d].views += Number(r.views) || 0;
    });
    var rows = Object.keys(by).map(function (d) {
      return { label: WD[d] + '曜', value: Math.round(by[d].views / by[d].n), sub: by[d].n + '本' };
    }).sort(function (a, b) { return b.value - a.value; });

    if (rows.length < 3) {
      host.innerHTML = '<p class="chart-empty">曜日を比べられるだけの本数がありません（3曜日以上に投稿があると出ます）</p>';
      return;
    }
    Chart.hbar(host, rows, { share: false });
    host.insertAdjacentHTML('beforeend',
      '<p class="note">1本あたりの期間内視聴回数です。本数の少ない曜日はたまたま伸びた1本に引きずられます。' +
      '最低でも各曜日3本くらい溜まってから判断してください。</p>');
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
      '<h3>視聴維持率</h3>' +
      '<p class="lead">動画のどこで離脱されたか。急に落ちる場所が、直すべき場所です。' +
      '冒頭30秒の落ち方がいちばん効きます。</p>' +
      '<div class="chart-box" id="sheetRetention"></div>' +
      '<h3>この期間の再生の推移</h3><div class="chart-box" id="sheetDays"></div>' +
      '<h3>この動画の流入経路</h3><div id="sheetTraffic"></div>' +
      '<h3>作りの点検</h3><div id="sheetChecks" class="checks"></div>';

    var checks = s.audit ? s.audit.checks : [];
    $('sheetChecks').innerHTML =
      (s.audit ? '<div class="score-head"><span class="vscore ' + scoreClass(s.audit.score) + '">' + s.audit.score + '</span>' +
        '<span class="hint">100点満点。vidIQ のスコアとは別物で、公開されている作り方の指針だけで判定しています。</span></div>' : '') +
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

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
