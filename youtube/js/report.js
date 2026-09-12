/* report.js — いま画面に出ている内容を、A4・1枚のレポートにまとめる。
 *
 *  ▼ なぜ「印刷」なのか
 *  PDFを作る道は3つある。
 *    1. 外部のPDFライブラリを読み込む … 日本語フォントを丸ごと抱える必要があり、
 *       ファイルが数MBになる。このアプリは「置くだけで動く」作りを崩したくない。
 *    2. サーバーで作る … サーバーが要る。同上。
 *    3. ブラウザの印刷機能で「PDFに保存」… 追加のファイルも通信もゼロ。
 *       日本語も端末のフォントでそのまま出る。
 *  3を選んだ。ボタンを押すと印刷用の1枚を組み立てて印刷画面を開くだけ。
 *
 *  ▼ 1枚に収めるために切ったもの
 *  グラフは入れない。画面のグラフは触って読むためのもので、
 *  紙に落とすと軸の数字が小さくなり、かえって読めない。
 *  そのぶん「判定」「次にやること」「どの動画が効いたか」を文字で入れる。
 */
(function (global) {
  'use strict';

  function esc(s) { return global.Chart.esc(s); }

  /* 率で並べるときの最低再生数（app.js と同じ考え方）。
     少ない再生数で率を出すと、10回再生で1人登録が「100人／1,000視聴」になる。 */
  var CONV_MIN = 300;

  /* レポートに要る材料をまとめる。画面が持っているものをそのまま使う。 */
  function collect(ctx) {
    var C = global.Chart;
    var ins = ctx.insight;
    var rows = [];
    if (ins) {
      rows = ins.metrics.map(function (m) {
        return {
          label: m.label,
          a: fmtMetric(m.a, m.kind), ap: m.ap,
          b: fmtMetric(m.b, m.kind), bp: m.bp
        };
      });
    }
    return {
      channel: ctx.channel,
      subs: ctx.subsTotal,
      period: ctx.period,
      w28: ctx.w28, w90: ctx.w90,
      verdict: ins,
      metrics: rows,
      lenses: (ins && ins.lenses) || [],
      clear: (ins && ins.clear) || [],
      conv: (ins && ins.conv) || null,
      videos: ctx.videos.slice(0, 5),
      /* 転換の良し悪しは、紙でもClaude向けでも一緒に渡す。
         視聴回数の上位だけ見ても「どれが登録に効いたか」は出てこない。 */
      convBest: ctx.convBest || [],
      convWorst: ctx.convWorst || [],
      lost: ctx.lost.slice(0, 3),
      traffic: ctx.traffic.slice(0, 5),
      made: new Date()
    };
  }

  function fmtMetric(v, kind) {
    var C = global.Chart;
    if (kind === 'per1k') return v.toFixed(2) + '人';
    if (kind === 'watch') return fmtWatchLocal(v);
    if (kind === 'dur') return C.fmtDur(v);
    if (kind === 'signed') return (v >= 0 ? '＋' : '−') + C.fmtInt(Math.abs(v));
    return C.fmtInt(v);
  }
  function fmtWatchLocal(min) {
    if (min >= 60000) return Math.round(min / 60).toLocaleString('ja-JP') + '時間';
    if (min >= 60) return (min / 60).toFixed(1) + '時間';
    return Math.round(min).toLocaleString('ja-JP') + '分';
  }
  function pctTag(p) {
    if (p == null) return '<span class="r-flat">—</span>';
    var r = Math.round(Math.abs(p));
    if (r === 0) return '<span class="r-flat">±0%</span>';
    return '<span class="' + (p > 0 ? 'r-up' : 'r-down') + '">' +
      (p > 0 ? '＋' : '−') + r + '%</span>';
  }
  function ymd(d) {
    return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2);
  }

  /* 紙に出す1枚を組み立てる。 */
  function html(d) {
    var C = global.Chart;
    var v = d.verdict;
    var badge = v ? ({ good: '順調', ok: '前向き', warn: '注意', bad: '要対処', info: '変化なし' }[v.level]) : '';

    return '' +
      '<div class="r-head">' +
      '<div><div class="r-title">' + esc(d.channel) + '</div>' +
      '<div class="r-sub">チャンネル分析レポート　' + d.period.start + ' 〜 ' + d.period.end +
      '（' + d.period.days + '日間）</div></div>' +
      '<div class="r-meta">登録者 <b>' + C.fmtInt(d.subs) + '</b>人<br>' + ymd(d.made) + ' 作成</div>' +
      '</div>' +

      (v ? '<div class="r-verdict r-' + v.level + '">' +
        '<span class="r-badge">' + badge + '</span>' +
        '<b>' + esc(v.title) + '</b>　' + esc(v.one) +
        '<div class="r-detail">' + esc(v.detail) + '</div>' +
        '</div>' : '') +

      '<div class="r-cols">' +

      '<div class="r-col">' +
      '<div class="r-h">主な数字</div>' +
      '<table class="r-table"><thead><tr><th></th><th>直近28日</th><th>直近90日</th></tr></thead><tbody>' +
      d.metrics.map(function (m) {
        return '<tr><th>' + esc(m.label) + '</th>' +
          '<td>' + m.a + ' ' + pctTag(m.ap) + '</td>' +
          '<td>' + m.b + ' ' + pctTag(m.bp) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="r-note">％は直前の同じ長さの期間との比較。</div>' +

      (d.traffic.length ? '<div class="r-h">流入経路</div>' +
        '<table class="r-table r-simple"><tbody>' +
        d.traffic.map(function (t) {
          return '<tr><th>' + esc(t.label) + '</th><td>' + C.fmtInt(t.value) + '回</td>' +
            '<td>' + C.fmtPct(t.share) + '</td></tr>';
        }).join('') + '</tbody></table>' : '') +
      '</div>' +

      '<div class="r-col">' +
      '<div class="r-h">次にやること</div>' +
      '<ol class="r-next">' +
      (v ? v.actions.map(function (a) {
        return '<li><b>' + esc(a.title) + '</b><span>' + esc(a.why) + '</span></li>';
      }).join('') : '') +
      '</ol>' +

      /* 観点は紙では見出しと数字だけにする。説明の文章まで載せると
         1枚に収まらない。「どこを見て言っているか」が分かれば、
         詳しい理由は画面で開ける。 */
      (d.lenses.length ? '<div class="r-h">分析の観点</div>' +
        '<table class="r-table r-simple r-lens"><tbody>' +
        d.lenses.map(function (x) {
          return '<tr class="r-l-' + x.level + '"><th>' + esc(x.title) + '</th>' +
            '<td>' + (x.nums || []).map(function (u) {
              return esc(u.label) + ' ' + esc(u.value);
            }).join('<br>') + '</td></tr>';
        }).join('') + '</tbody></table>' : '') +

      (d.clear.length ? '<div class="r-h">問題ではないと確認できたこと</div>' +
        '<ul class="r-clear">' + d.clear.map(function (c) {
          return '<li>' + esc(c.title) + '</li>';
        }).join('') + '</ul>' : '') +
      '</div>' +

      '</div>' +

      '<div class="r-h">この期間に伸びた動画</div>' +
      '<table class="r-table r-videos"><thead><tr>' +
      '<th>動画</th><th>視聴</th><th>平均視聴</th><th>登録</th><th>／1,000視聴</th>' +
      '</tr></thead><tbody>' +
      d.videos.map(function (s) {
        return '<tr><th>' + esc(s.title) + '</th>' +
          '<td>' + C.fmtInt(s.views) + '</td>' +
          '<td>' + C.fmtDur(s.avg) + '</td>' +
          '<td>＋' + C.fmtInt(s.subs) + (s.unsubs ? ' / −' + C.fmtInt(s.unsubs) : '') + '</td>' +
          '<td>' + s.subPer1k.toFixed(2) + '人</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="r-note">「／1,000視聴」は1,000回再生されるうち何人が登録したか。' +
      '本数の違う動画を比べられるのはこちら。</div>' +

      (d.lost.length ? '<div class="r-h">登録を解除された動画</div>' +
        '<table class="r-table r-videos"><tbody>' +
        d.lost.map(function (s) {
          return '<tr><th>' + esc(s.title) + '</th>' +
            '<td>−' + C.fmtInt(s.unsubs) + '人</td>' +
            '<td>解除率 ' + C.fmtRate(s.unsubRate) + '</td>' +
            '<td>視聴 ' + C.fmtInt(s.views) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="r-note">YouTube が「解除する直前に見ていた動画」として記録したもの。' +
        'その動画が原因とは限らない。</div>' : '') +

      '<div class="r-foot">' +
      'YouTube Data API v3 ／ YouTube Analytics API v2 から取得。' +
      '集計が確定するまで数日かかるため、直近3日は含まない。' +
      '登録者の合計は YouTube が上位3桁に丸めた値、増減は丸めのない正確な値。' +
      '</div>';
  }

  /* Claude に貼るための文章。数字だけでなく、何を答えてほしいかまで書く。
     「これを分析して」と数字だけ渡されても、読む側は何を判断すればいいか分からない。

     ▼ アプリ側の観点も一緒に渡す理由
     アプリは5つの観点（転換・整合・偏り・対・除外）で先に当たりを付けている。
     それを伏せて数字だけ渡すと、読む側は同じ道をもう一度たどることになり、
     そのぶん深いところまで進めない。当たりを渡したうえで
     「合っているか、他に何が読めるか」を聞くほうが、返ってくるものが厚くなる。 */
  function forClaude(d) {
    var C = global.Chart;
    var L = [];
    L.push('# YouTubeチャンネル分析の相談');
    L.push('');
    L.push('チャンネル「' + d.channel + '」の数字です。伸ばすために次に何をすべきか、');
    L.push('優先順位をつけて教えてください。数字の根拠も示してください。');
    L.push('');
    L.push('とくに次の点をお願いします。');
    L.push('');
    L.push('1. 視聴回数だけでなく「1,000視聴あたりの登録者数」で判断してください。');
    L.push('   視聴回数が伸びていても、この比率が落ちていれば伸びているとは言えません。');
    L.push('2. 下の「アプリ側の観点」が合っているかを確かめ、違うなら指摘してください。');
    L.push('3. 打ち手は3つまで。それぞれ、どの数字を見てそう言うのかを添えてください。');
    L.push('4. 「これは問題ではない」と言えるものも挙げてください。');
    L.push('   直さなくていいところが決まらないと、時間の使い先が決まりません。');
    L.push('');
    L.push('- 期間: ' + d.period.start + ' 〜 ' + d.period.end + '（' + d.period.days + '日間）');
    L.push('- 登録者: ' + C.fmtInt(d.subs) + '人（YouTubeが上位3桁に丸めた値）');
    if (d.verdict) {
      L.push('- アプリ側の自動判定: ' + d.verdict.title + '（' + d.verdict.one + '）');
    }
    L.push('');
    L.push('## 主な数字');
    L.push('');
    L.push('| 指標 | 直近28日 | 前期比 | 直近90日 | 前期比 |');
    L.push('|---|---|---|---|---|');
    d.metrics.forEach(function (m) {
      var f = function (p) { return p == null ? '—' : (p > 0 ? '+' : '') + Math.round(p) + '%'; };
      L.push('| ' + m.label + ' | ' + m.a + ' | ' + f(m.ap) + ' | ' + m.b + ' | ' + f(m.bp) + ' |');
    });
    if (d.lenses.length) {
      L.push('');
      L.push('## アプリ側の観点（合っているかを確かめてください）');
      var word = { good: '良好', info: '参考', warn: '注意', bad: '要対処' };
      d.lenses.forEach(function (x) {
        L.push('');
        L.push('### ' + x.title + '（' + (word[x.level] || '') + '）');
        L.push('');
        (x.nums || []).forEach(function (u) {
          L.push('- ' + u.label + ': ' + u.value +
            (u.pct != null ? '（前期比 ' + (u.pct > 0 ? '+' : '') + Math.round(u.pct) + '%）' : ''));
        });
        L.push('');
        L.push(x.body);
      });
    }
    if (d.clear.length) {
      L.push('');
      L.push('## アプリ側が「問題ではない」と判断したもの');
      L.push('');
      d.clear.forEach(function (c) { L.push('- **' + c.title + '** — ' + c.why); });
    }
    if (d.traffic.length) {
      L.push('');
      L.push('## 流入経路');
      L.push('');
      d.traffic.forEach(function (t) {
        L.push('- ' + t.label + ': ' + C.fmtInt(t.value) + '回（' + C.fmtPct(t.share) + '）');
      });
    }
    L.push('');
    L.push('## この期間に伸びた動画');
    L.push('');
    L.push('| 題名 | 視聴回数 | 平均視聴時間 | 平均視聴率 | 登録 | 1,000視聴あたり | 解除 | 解除率 |');
    L.push('|---|---|---|---|---|---|---|---|');
    d.videos.forEach(function (s) {
      L.push('| ' + s.title.replace(/\|/g, '｜') + ' | ' + C.fmtInt(s.views) + ' | ' +
        C.fmtDur(s.avg) + ' | ' + C.fmtPct(s.pct) + ' | +' + C.fmtInt(s.subs) + ' | ' +
        s.subPer1k.toFixed(2) + '人 | −' + C.fmtInt(s.unsubs) + ' | ' + C.fmtRate(s.unsubRate) + ' |');
    });

    /* 転換の良い順・悪い順。視聴回数の上位だけでは
       「同じくらい見られているのに登録だけ違う2本」が見えない。
       条件の揃った比較ができる材料を、そのまま渡す。 */
    if (d.convWorst.length) {
      L.push('');
      L.push('## 登録への転換が低い動画（' + CONV_MIN + '回以上再生されたもの）');
      L.push('');
      L.push('| 題名 | 視聴回数 | 平均視聴時間 | 1,000視聴あたりの登録 |');
      L.push('|---|---|---|---|');
      d.convWorst.forEach(function (s) {
        L.push('| ' + s.title.replace(/\|/g, '｜') + ' | ' + C.fmtInt(s.views) + ' | ' +
          C.fmtDur(s.avg) + ' | ' + s.subPer1k.toFixed(2) + '人 |');
      });
    }
    if (d.convBest.length) {
      L.push('');
      L.push('## 登録への転換が高い動画（同条件）');
      L.push('');
      L.push('| 題名 | 視聴回数 | 平均視聴時間 | 1,000視聴あたりの登録 |');
      L.push('|---|---|---|---|');
      d.convBest.forEach(function (s) {
        L.push('| ' + s.title.replace(/\|/g, '｜') + ' | ' + C.fmtInt(s.views) + ' | ' +
          C.fmtDur(s.avg) + ' | ' + s.subPer1k.toFixed(2) + '人 |');
      });
    }
    if (d.lost.length) {
      L.push('');
      L.push('## 登録を解除された動画（解除の直前に見られていた動画）');
      L.push('');
      d.lost.forEach(function (s) {
        L.push('- ' + s.title + ': −' + C.fmtInt(s.unsubs) + '人、解除率 ' +
          C.fmtRate(s.unsubRate) + '、視聴 ' + C.fmtInt(s.views) + '回');
      });
    }
    L.push('');
    L.push('## 前提');
    L.push('');
    L.push('- 数字は YouTube 公式API（Data API v3 / Analytics API v2）から取得したもの');
    L.push('- 集計確定まで数日かかるため、直近3日は含まない');
    L.push('- 「解除された動画」は、その動画が原因という意味ではなく、');
    L.push('  YouTubeが「解除の直前に見ていた動画」として記録したもの');
    L.push('- 「1,000視聴あたりの登録」は、増えた人数 ÷ 視聴回数 × 1000。');
    L.push('  解除は引いていない（見た人が登録したかを見る数字のため）');
    L.push('- 登録者の合計は YouTube が上位3桁に丸めた値。増減は丸めのない正確な値');
    L.push('- 平均視聴時間には、ショート動画やライブの視聴も混ざっている可能性がある');
    return L.join('\n');
  }

  global.Report = { collect: collect, html: html, forClaude: forClaude };
})(window);
