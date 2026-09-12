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
          label: m.label, note: m.note,
          /* 判定を書き換える数字（登録への転換）だけ、帯の中で1つ持ち上げる。 */
          key: m.kind === 'per1k',
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

  /* 紙に出す1枚を組み立てる。

     ▼ 何を載せ、何を落としたか
     載せるのは「いまどうなっていて、なぜそう言えて、次に何をするか」。
     紙は触れないので、開いて確かめる先が無い。だから根拠は
     「どこを見て言っているか」だけを短く置き、理由の文章は画面に残す。

     落としたのは「登録を解除された動画」の表。
     この一覧は、YouTube が「解除する直前に見ていた動画」を記録したもので、
     その動画が原因という意味ではない。紙の上では注意書きごと読み飛ばされて
     「この動画が悪い」と誤読されやすく、しかも打ち手に繋がらない。
     Claude に渡す文章のほうには入れてある（読む側が前提を汲めるため）。

     グラフも入れない。画面のグラフは触って値を読むためのもので、
     紙に落とすと軸の数字が小さくなり、かえって読めない。 */
  var LEVEL_WORD = { good: '順調', ok: '前向き', warn: '注意', bad: '要対処', info: '変化なし' };
  var LENS_MARK = { good: '✓', info: '・', warn: '▲', bad: '●' };

  function html(d) {
    var C = global.Chart;
    var v = d.verdict;

    return '' +
      /* 題字帯 */
      '<div class="r-head">' +
      '<div><div class="r-title">' + esc(d.channel) + '</div>' +
      '<div class="r-sub">チャンネル分析レポート　' + d.period.start + ' 〜 ' + d.period.end +
      '（' + d.period.days + '日間）</div></div>' +
      '<div class="r-meta">登録者<br><b>' + C.fmtInt(d.subs) + '</b>人<br>' + ymd(d.made) + ' 作成</div>' +
      '</div>' +

      /* 判定帯 */
      (v ? '<div class="r-verdict r-' + v.level + '">' +
        '<span class="r-badge">' + (LEVEL_WORD[v.level] || '') + '</span>' +
        '<div class="r-vtitle">' + esc(v.title) + '</div>' +
        '<div class="r-one">' + esc(v.one) + '</div>' +
        '<div class="r-detail">' + esc(v.detail) + '</div>' +
        '</div>' : '') +

      /* 数字の帯 */
      (d.metrics.length ? '<div class="r-figs">' + d.metrics.map(function (m) {
        return '<div class="r-fig' + (m.key ? ' is-key' : '') + '">' +
          '<span class="r-fig-label">' + esc(m.label) + '</span>' +
          '<span class="r-fig-now"><span class="r-fig-v">' + m.a + '</span>' + pctTag(m.ap) + '</span>' +
          '<span class="r-fig-prev">90日 ' + m.b + ' ' + pctTag(m.bp) + '</span>' +
          (m.note ? '<span class="r-fig-note">' + esc(m.note) + '</span>' : '') +
          '</div>';
      }).join('') + '</div>' +
        '<p class="r-note">大きい数字は直近28日。％はそれぞれ「直前の同じ長さの期間」との比較。</p>' : '') +

      /* 2段組 */
      '<div class="r-cols">' +

      '<div class="r-main">' +
      '<div class="r-h">次にやること</div>' +
      '<ol class="r-next">' +
      (v ? v.actions.map(function (a, i) {
        return '<li><span class="r-next-no">' + (i + 1) + '</span>' +
          '<span class="r-next-b"><b>' + esc(a.title) + '</b>' +
          '<span>' + esc(a.why) + '</span></span></li>';
      }).join('') : '') +
      '</ol>' +
      '</div>' +

      '<div class="r-side">' +
      (d.lenses.length ? '<div class="r-h">分析の観点</div>' +
        '<div class="r-lens">' + d.lenses.map(function (x) {
          return '<div class="r-lens-item r-l-' + x.level + '">' +
            '<span class="r-lens-mark">' + (LENS_MARK[x.level] || '・') + '</span>' +
            '<span class="r-lens-b"><b>' + esc(x.title) + '</b>' +
            (x.nums || []).map(function (u) {
              return '<span class="r-lens-n"><i>' + esc(clip(u.label, 22)) + '</i> ' + esc(u.value) + '</span>';
            }).join('') + '</span></div>';
        }).join('') + '</div>' : '') +

      (d.clear.length ? '<div class="r-h">問題ではないと確認できたこと</div>' +
        '<ul class="r-clear">' + d.clear.map(function (c) {
          return '<li>' + esc(c.title) + '</li>';
        }).join('') + '</ul>' : '') +
      '</div>' +

      '</div>' +

      /* 動画表 */
      '<div class="r-h">この期間に見られた動画</div>' +
      '<table class="r-table"><thead><tr>' +
      '<th>動画</th><th>視聴</th><th>平均視聴</th><th>登録</th><th>／1,000視聴</th>' +
      '</tr></thead><tbody>' +
      d.videos.map(function (s) {
        return '<tr><th>' + esc(s.title) + '</th>' +
          '<td>' + C.fmtInt(s.views) + '</td>' +
          '<td>' + C.fmtDur(s.avg) + '</td>' +
          '<td>＋' + C.fmtInt(s.subs) + '</td>' +
          '<td class="r-key-col">' + s.subPer1k.toFixed(2) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="r-note">「／1,000視聴」は1,000回再生されるうち何人が登録したか。' +
      '本数の違う動画を比べられるのはこちら。登録者数そのものは再生数の大小でほぼ決まる。</p>' +

      /* 流入 */
      (d.traffic.length ? '<div class="r-h">どこから来ているか</div>' +
        '<div class="r-flow">' + d.traffic.map(function (t) {
          return '<span>' + esc(t.label) + ' <b>' + C.fmtPct(t.share) + '</b></span>';
        }).join('') + '</div>' : '') +

      '<div class="r-foot">' +
      'YouTube Data API v3 ／ YouTube Analytics API v2 から取得。' +
      '集計が確定するまで数日かかるため、直近3日は含まない。' +
      '登録者の合計は YouTube が上位3桁に丸めた値、増減は丸めのない正確な値。' +
      '「登録への転換」は増えた登録者 ÷ 視聴回数 × 1000（解除は引いていない）。' +
      '</div>';
  }

  /* 長い題名を紙幅に収める。途中で切って「…」を付ける。 */
  function clip(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

  /* ========== 1枚に収める ==========
     版面は1枚に収まる作りにしてあるが、中身の量は月によって変わる。
     観点が4つ出る月、題名の長い動画が並ぶ月、打ち手の説明が長い月——
     どこかで必ず溢れる。決め打ちの級数で組むかぎり、これは直せない。

     そこで、印刷の直前に「紙と同じ幅で一度並べて、高さを測る」。
     溢れていたら根の級数だけを縮める。他の寸法は全部その相対（em）なので、
     字も余白も一緒に縮み、組みは崩れない。

     縮める下限は0.78。これ以上小さくすると紙の上で読めなくなるので、
     そこまで縮めても収まらない場合は、2枚目に送るほうを選ぶ。
     読めない1枚より、読める2枚のほうがましなので。 */
  var FIT_FLOOR = 0.78;

  function fit(el) {
    if (!el || !el.getBoundingClientRect) return 1;
    el.style.setProperty('--r-fit', '1');
    el.classList.add('is-measuring');

    /* A4縦(297mm) − 上下の余白(11mm×2) = 275mm。
       印刷画面の設定でこれより余白が広くなることがあるので、
       270mm を目標にして少しだけ余裕を持たせる。 */
    var limit = mmToPx(270);
    var h = el.scrollHeight;
    var f = 1;
    if (limit > 0 && h > limit) {
      /* 面積はおおよそ級数の2乗で効くので、平方根から当てる。
         そのあと1回だけ測り直して、行の折り返しのずれを詰める。 */
      f = Math.max(FIT_FLOOR, Math.sqrt(limit / h));
      el.style.setProperty('--r-fit', String(f));
      var h2 = el.scrollHeight;
      if (h2 > limit) {
        f = Math.max(FIT_FLOOR, f * Math.sqrt(limit / h2));
        el.style.setProperty('--r-fit', String(f));
      }
    }
    el.classList.remove('is-measuring');
    return f;
  }

  /* mm を画面の px に直す。端末ごとに違うので、実物を置いて測る。 */
  function mmToPx(mm) {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;height:' + mm + 'mm';
    document.body.appendChild(probe);
    var px = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    return px;
  }

  global.Report = { collect: collect, html: html, forClaude: forClaude, fit: fit };
})(window);
