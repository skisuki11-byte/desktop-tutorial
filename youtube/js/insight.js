/* insight.js — 数字を見て「いまどういう状態か」「次に何をするか」を出す。
 *
 *  考え方:
 *   ・28日と90日の両方を見る。片方だけでは判断を誤るため。
 *     28日だけ … 1本当たった／外れただけで景色が変わる
 *     90日だけ … 先月から起きている変化に気づけない
 *     2つを組み合わせると「いま向かっている方向」が出る。
 *   ・打ち手は必ず数字を根拠にする。一般論は書かない。
 *     「サムネを改善しましょう」は、どの動画のどの数字を見て言っているのか
 *     分からないので動けない。
 *   ・出す打ち手は最大3つ。多いと結局どれもやらない。
 *     順番は「土台から」。投稿が止まっていれば題名の話は後回しになる。
 *
 *  ▼ 打ち手の優先順（上から見て、当てはまった順に3つ）
 *   1. 投稿が止まっている  … 何を直しても出さなければ始まらない
 *   2. 平均視聴時間の低下  … 維持率は推薦の土台。ここが崩れると他が効かない
 *   3. 新規に届いていない  … 登録者だけが見ている状態は、伸びが頭打ちになる
 *   4. 検索から入られていない … 題名・説明文で拾える入口を作れていない
 *   5. 登録に進まれていない … 新規には届いているが、次に繋がっていない
 *   6. 当たった型をなぞる   … いちばん伸びた動画の作りを次に使う
 *   7. 作りの点検          … 直せば効くと分かっている取りこぼし
 */
(function (global) {
  'use strict';

  var FLAT = 5;   // ±5%以内は「横ばい」とみなす。日々の揺れの範囲

  function sum(rows, key) {
    return (rows || []).reduce(function (a, r) { return a + (Number(r[key]) || 0); }, 0);
  }
  function weighted(rows, key, wKey) {
    var w = sum(rows, wKey);
    if (!w) return 0;
    return (rows || []).reduce(function (a, r) {
      return a + (Number(r[key]) || 0) * (Number(r[wKey]) || 0);
    }, 0) / w;
  }
  function pct(now, before) {
    if (!before) return now ? null : 0;      // 比べる相手がいない
    // 前が負の数（登録者が純減していた等）だと割合に意味がないので出さない。
    // −10人 から ＋10人 を「200%増」と書くのは嘘になる。
    if (before < 0) return null;
    return (now - before) / before * 100;
  }
  function share(rows, key, value, metric) {
    var total = sum(rows, metric || 'views');
    if (!total) return 0;
    var hit = (rows || []).filter(function (r) { return r[key] === value; });
    return sum(hit, metric || 'views') / total * 100;
  }

  /* 28日と90日の向きから、いまの状態を1つに決める。 */
  /* 畳んでいても見える一言（one）と、開いたときに出す説明（detail）に分ける。
     一言は「何が起きているか」だけ。判断の理由と次の構えは開いた先に置く。 */
  function verdict(s, l) {
    var up = function (v) { return v != null && v >= FLAT; };
    var down = function (v) { return v != null && v <= -FLAT; };

    if (up(s) && up(l)) return { level: 'good', title: '伸びている',
      one: '直近28日も、90日で見ても増えています。',
      detail: 'いま出しているものが当たっている状態です。作り方を変えるより、同じ型で本数を増やすのがいちばん効きます。当たっている間に数を出しておくと、伸びが止まったときの土台になります。' };
    if (up(s) && down(l)) return { level: 'ok', title: '持ち直している',
      one: '90日では落ちていますが、直近28日は増えています。',
      detail: '何かが効き始めています。まだ偶然の可能性もあるので、直近で伸びた動画の作り（題名の付け方・長さ・サムネの見え方）を次に繰り返して、再現するかどうかを確かめてください。' };
    if (down(s) && up(l)) return { level: 'warn', title: '勢いが落ちている',
      one: '90日で見れば増えていますが、直近28日は減っています。',
      detail: 'いちばん気をつけるべき局面です。全体ではまだ増えているので見落としやすいのですが、ここで手を打たないとそのまま下降に入ります。直近の数本が以前と何を変えたかを確かめてください。' };
    if (down(s) && down(l)) return { level: 'bad', title: '下降が続いている',
      one: '28日も90日も減っています。',
      detail: '本数を増やすより先に、なぜ見られなくなったかを1本ずつ確かめる段階です。伸びない作りのまま量産しても、伸びない理由がそのままコピーされるだけになります。' };
    if (up(s) || up(l)) return { level: 'ok', title: 'ゆるやかに増えている',
      one: '大きな動きはありませんが、下がってはいません。',
      detail: '次の一手で方向が決まります。変えるのは1回に1つだけにしてください。同時に2つ変えると、どちらが効いたのか分からなくなります。' };
    if (down(s) || down(l)) return { level: 'warn', title: 'ゆるやかに落ちている',
      one: '急な落ち込みではありませんが、じわじわ減っています。',
      detail: '原因が1本ではなく作り方の癖にあることが多い局面です。個別の動画を探すより、最近の数本に共通して変わったことを探してください。' };
    return { level: 'info', title: '横ばい',
      one: '28日も90日もほぼ変わっていません。',
      detail: 'いまのやり方を続けても景色は変わらないので、何か1つ変えて反応を見る段階です。題名の付け方でも、長さでも、出す時間でも構いません。' };
  }

  /* d の中身:
     now28/prev28/now90/prev90 … day 次元の行
     traffic  … insightTrafficSourceType の行（28日）
     subs     … subscribedStatus の行（28日）
     videos28 … video 次元の行（28日）
     meta     … videoId -> Data API の動画（題名・公開日・長さ）
     audits   … [{id, title, score, top}] 点検の結果 */
  function build(d) {
    var v28 = sum(d.now28, 'views'), v28p = sum(d.prev28, 'views');
    var v90 = sum(d.now90, 'views'), v90p = sum(d.prev90, 'views');
    var s = pct(v28, v28p), l = pct(v90, v90p);

    var a28 = weighted(d.now28, 'averageViewDuration', 'views');
    var a28p = weighted(d.prev28, 'averageViewDuration', 'views');
    var a90 = weighted(d.now90, 'averageViewDuration', 'views');
    var a90p = weighted(d.prev90, 'averageViewDuration', 'views');

    var w28 = sum(d.now28, 'estimatedMinutesWatched'), w28p = sum(d.prev28, 'estimatedMinutesWatched');
    var w90 = sum(d.now90, 'estimatedMinutesWatched'), w90p = sum(d.prev90, 'estimatedMinutesWatched');

    var n28 = sum(d.now28, 'subscribersGained') - sum(d.now28, 'subscribersLost');
    var n28p = sum(d.prev28, 'subscribersGained') - sum(d.prev28, 'subscribersLost');
    var n90 = sum(d.now90, 'subscribersGained') - sum(d.now90, 'subscribersLost');
    var n90p = sum(d.prev90, 'subscribersGained') - sum(d.prev90, 'subscribersLost');

    var out = verdict(s, l);
    out.metrics = [
      { label: '視聴回数', a: v28, ap: pct(v28, v28p), b: v90, bp: pct(v90, v90p), kind: 'int' },
      { label: '総再生時間', a: w28, ap: pct(w28, w28p), b: w90, bp: pct(w90, w90p), kind: 'watch' },
      { label: '平均視聴時間', a: a28, ap: pct(a28, a28p), b: a90, bp: pct(a90, a90p), kind: 'dur' },
      { label: '登録者の純増', a: n28, ap: pct(n28, n28p), b: n90, bp: pct(n90, n90p), kind: 'signed' }
    ];
    out.actions = actions(d, { s: s, l: l, a28: a28, a28p: a28p, v28: v28 });
    return out;
  }

  function actions(d, m) {
    var list = [];
    var push = function (o) { if (list.length < 3) list.push(o); };

    /* 1. 投稿が止まっていないか */
    var recent = (d.uploads || []).filter(function (v) {
      return (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000 <= 28;
    }).length;
    var recent90 = (d.uploads || []).filter(function (v) {
      return (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000 <= 90;
    }).length;
    if ((d.uploads || []).length && recent === 0 && recent90 > 0) {
      push({
        title: 'まず1本出す',
        why: '直近28日の投稿が0本です（90日では' + recent90 + '本）。',
        how: '止まっている間は、過去の動画が拾われるぶんだけ数字が落ち続けます。完璧なものを待つより、いちばん反応の良かった動画と同じ型で1本出すのが最短です。'
      });
    }

    /* 2. 平均視聴時間が落ちていないか（維持率は他の全部の土台） */
    var ap = m.a28p ? (m.a28 - m.a28p) / m.a28p * 100 : null;
    if (ap != null && ap <= -8) {
      push({
        title: '冒頭の作りを見直す',
        why: '平均視聴時間が前の28日より' + Math.abs(ap).toFixed(0) + '%短くなっています（' +
          fmtDur(m.a28p) + ' → ' + fmtDur(m.a28) + '）。',
        how: '「動画」タブで平均視聴時間の短い順に並べ、下位の1本を開いて維持率グラフの最初の30秒を見てください。そこで大きく落ちていれば、前置き・あいさつ・自己紹介を削り、1文目で結論か一番いい部分を出します。'
      });
    }

    /* 3. 新規に届いているか（登録者ばかりだと頭打ちになる） */
    var subShare = share(d.traffic, 'insightTrafficSourceType', 'SUBSCRIBER');
    var relShare = share(d.traffic, 'insightTrafficSourceType', 'RELATED_VIDEO');
    var searchShare = share(d.traffic, 'insightTrafficSourceType', 'YT_SEARCH');
    if (subShare >= 45 && relShare < 25) {
      push({
        title: '新しい人に届く入口を作る',
        why: '視聴の' + Math.round(subShare) + '%が登録フィード・ホームからで、関連動画からの流入は' +
          Math.round(relShare) + '%しかありません。',
        how: 'いまは既存の視聴者だけで回っている状態です。関連動画に出るには、他の動画の視聴者が続けて見たくなる必要があります。同じテーマで連番にする、再生リストにまとめる、題名の型を揃える——このどれかで「次もこれ」と分かるようにしてください。'
      });
    }

    /* 4. 検索から拾えているか */
    if (searchShare < 8 && m.v28 > 0) {
      push({
        title: '検索で拾われる語を題名に入れる',
        why: 'YouTube検索からの流入が' + (searchShare < 0.5 ? 'ほぼ0' : Math.round(searchShare) + '%') + 'です。',
        how: '「流入」タブの「YouTube検索で使われた語」を見てください。そこに出ている語が、実際に人が打ち込んでいる言い方です。推測ではないので、次の動画の題名にはその言い方をそのまま使います。1語も出ていない場合は、まだ検索の入口が無い状態なので、探されている具体名（曲調・用途・時間）を題名に入れるところからです。'
      });
    }

    /* 5. 登録に進まれているか */
    var unsub = share(d.subs, 'subscribedStatus', 'UNSUBSCRIBED');
    if (unsub >= 80 && searchShare + relShare >= 25) {
      push({
        title: '登録への導線を足す',
        why: '視聴の' + Math.round(unsub) + '%が未登録の人です。新規には届いています。',
        how: '届いているのに次に繋がっていない状態です。終了画面に「次の動画」と「登録」を置き、説明文の1行目を定型のあいさつではなく「このチャンネルは何を出しているか」の1文にしてください。'
      });
    }

    /* 6. 当たった型をなぞる */
    var top = (d.videos28 || []).slice().sort(function (a, b) {
      return (Number(b.views) || 0) - (Number(a.views) || 0);
    })[0];
    if (top && d.meta[top.video]) {
      var tv = d.meta[top.video];
      var tAvg = Number(top.averageViewDuration) || 0;
      push({
        title: '伸びた1本の型を次に使う',
        why: '直近28日で最も伸びたのは「' + tv.snippet.title + '」（' +
          Math.round(Number(top.views) || 0).toLocaleString('ja-JP') + '回、平均' + fmtDur(tAvg) + '）。',
        how: 'この1本の題名の付け方・長さ・サムネの見え方を、次の動画でそのまま真似てください。当たった要因は自分では分からないことが多いので、変えるのは中身だけにして、型は固定したまま2〜3本試すのが確実です。'
      });
    }

    /* 7. 作りの取りこぼし */
    var worst = (d.audits || []).filter(function (a) { return a.score < 70; })
      .sort(function (a, b) { return a.score - b.score; })[0];
    if (worst) {
      push({
        title: '点数の低い動画を直す',
        why: '「' + worst.title + '」の点検が' + worst.score + '点です（' + worst.top + '）。',
        how: '公開済みの動画でも、題名と説明文は後から直せます。直せば検索の拾われ方が変わるので、いちばん再生数のある動画から順に直すのが効きます。'
      });
    }

    if (!list.length) {
      list.push({
        title: 'いまのやり方を続ける',
        why: '目立った問題は見つかりませんでした。',
        how: '数字が動いていない時期は、変えるのは1回に1つだけにしてください。同時に2つ変えると、どちらが効いたのか分からなくなります。'
      });
    }
    return list;
  }

  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m >= 60) return Math.floor(m / 60) + '時間' + (m % 60) + '分';
    return m + '分' + ('0' + s).slice(-2) + '秒';
  }

  global.Insight = { build: build, pct: pct };
})(window);
