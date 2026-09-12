/* insight.js — 数字を見て「いまどういう状態か」「次に何をするか」を出す。
 *
 *  ▼ 何を見ているか（分析の観点）
 *  視聴回数だけを見ていると判断を誤る。実際に起きた見落としが土台にある。
 *  「28日も90日も視聴回数は増えている」＝順調、と出しておきながら、
 *  同じ期間に 1,000回見られるうち何人が登録するかは半分に落ちていた。
 *  数字は増えているのに、チャンネルとしては痩せていた。
 *  そこで、判定は次の観点を並べて見るようにしている。
 *
 *   1. 転換   1,000視聴あたり何人が登録したか。
 *             視聴回数が伸びても、ここが落ちていれば「順調」とは言えない。
 *             判定そのものを書き換える力を持たせている。
 *   2. 整合   平均視聴時間を2通りの測り方で出し、食い違いを見る。
 *             API の平均視聴時間 と 総再生時間÷視聴回数。
 *             大きくずれる／逆方向に動くときは、ショートやライブが
 *             混ざって、全体の平均が別のものを測っている合図になる。
 *             「向きが逆かどうか」は、画面に表示する丸めた数字の符号で
 *             判定する。丸める前の生の値で判定すると、表示上は
 *             +5%／−24%のように逆に見えるのに「向きは揃っている」と
 *             書いてしまう食い違いが起きるため。
 *   3. 偏り   上位数本と、それ以外（長い尾）で登録の効率を比べる。
 *             視聴の大半が尾にあるのに登録は上位が作っている、という形は多い。
 *             このとき打つ手は「もっと伸ばす」ではなく「尾を直す」になる。
 *   4. 対     視聴回数も見られ方もほぼ同じなのに、登録数だけ大きく違う
 *             2本を探す。中身の差ではなく導線や約束（題名・サムネ）の差に
 *             絞り込めるので、いちばん動きやすい材料になる。
 *   5. 除外   問題ではないと確認できたことを、はっきり書いて返す。
 *             これが無いと、解除率のような「目立つが効かない」数字に
 *             手をかけて時間を使ってしまう。
 *   6. 視聴の中身   転換率の低下が、届き方（既存↔新規の構成変化）による
 *             ものか、届いたあとの伝え方によるものかを切り分ける。
 *             登録フィード・ホームの割合が増えているだけなら、
 *             転換率が下がるのは自然な結果で、作りの問題ではない。
 *   7. 相場   同じくらいの規模のチャンネルと比べて、登録者の増え方が
 *             速いか遅いか。転換率という「率」だけを見ていると、
 *             視聴回数が伸びている局面で、実際には人並み外れて
 *             速く伸びていることを見落としやすい。外部の調査（vidIQ）を
 *             引用した目安であり、断定の材料にはしない。
 *
 *  ▼ 打ち手の優先順（上から見て、当てはまった順に3つ）
 *   1. 投稿が止まっている   … 何を直しても出さなければ始まらない
 *   2. 平均視聴時間の低下   … 維持率は推薦の土台。ここが崩れると他が効かない
 *   3. 登録への転換の低下   … 見られ方は保てていても、増えなくなる
 *   4. 同条件の2本の差      … 原因を1か所に絞り込めている、いちばん動ける手
 *   5. 新規に届いていない   … 登録者だけが見ている状態は、伸びが頭打ちになる
 *   6. 検索から入られていない
 *   7. 登録に進まれていない
 *   8. 長い尾が登録に繋がっていない
 *   9. 当たった型をなぞる
 *  10. 作りの点検
 */
(function (global) {
  'use strict';

  var FLAT = 5;          // ±5%以内は「横ばい」とみなす。日々の揺れの範囲
  var CONV_WARN = 12;    // 転換率がこれ以上落ちていたら、観点として注意を出す
  var CONV_BAD = 25;     // これ以上なら、視聴が伸びていても判定を「注意」に落とす
  var TOP_N = 5;         // 「上位」として見る本数

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
  /* 1,000視聴あたりの人数。本数も期間も違うものを並べるための共通のものさし。
     実数のままでは「登録が増えた」のか「ただ再生が増えただけ」なのか分からない。 */
  function per1k(n, views) { return views ? n / views * 1000 : 0; }

  function num(v) { return Number(v) || 0; }
  function fixed(v, n) { return (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toFixed(n); }

  /* ========== 判定 ========== */

  /* 視聴回数の向きだけで決めた、土台の判定。 */
  function viewVerdict(s, l) {
    var up = function (v) { return v != null && v >= FLAT; };
    var down = function (v) { return v != null && v <= -FLAT; };

    if (up(s) && up(l)) return { level: 'good', title: '伸びている',
      one: '直近28日も、90日で見ても視聴回数は増えています。',
      detail: 'いま出しているものが当たっている状態です。作り方を変えるより、同じ型で本数を増やすのがいちばん効きます。当たっている間に数を出しておくと、伸びが止まったときの土台になります。' };
    if (up(s) && down(l)) return { level: 'ok', title: '持ち直している',
      one: '90日では落ちていますが、直近28日は増えています。',
      detail: '何かが効き始めています。まだ偶然の可能性もあるので、直近で伸びた動画の作り（題名の付け方・長さ・サムネの見え方）を次に繰り返して、再現するかどうかを確かめてください。' };
    if (down(s) && up(l)) return { level: 'warn', title: '勢いが落ちている',
      one: '90日で見れば増えていますが、直近28日は減っています。',
      detail: 'いちばん気をつけるべき局面です。全体ではまだ増えているので見落としやすいのですが、ここで手を打たないとそのまま下降に入ります。直近の数本が以前と何を変えたかを確かめてください。' };
    if (down(s) && down(l)) return { level: 'bad', title: '下降が続いている',
      one: '28日も90日も視聴回数が減っています。',
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

  /* 視聴回数の判定に、登録への転換を重ねて最終判定にする。
     視聴が伸びていても転換が大きく落ちていれば「順調」と書いてはいけない。
     見ている人は増えたが、チャンネルとして残るものは減っている状態だから。 */
  function verdict(s, l, cv) {
    var base = viewVerdict(s, l);
    var out = {
      level: base.level, title: base.title, one: base.one, detail: base.detail,
      base: base.title, convNote: null
    };
    if (!cv || cv.drop == null) return out;

    var rising = base.level === 'good' || base.level === 'ok';
    var d = Math.round(cv.drop);

    if (cv.drop >= CONV_BAD && rising) {
      out.level = 'warn';
      out.title = '見られているが、登録に繋がっていない';
      out.one = base.one + 'ただし1,000回見られるうちの登録者数は' + d + '%落ちています。';
      out.detail = '視聴回数だけを見ると順調ですが、それは「' + base.title + '」という半分の話です。' +
        '同じ1,000回の再生から登録される人数が ' + fixed(cv.now, 2) + '人（前は ' + fixed(cv.before, 2) + '人）まで落ちています。' +
        'この形は、届く数が増えたぶん再生は伸びるものの、チャンネルとして残るものが増えていない状態です。' +
        '本数を増やしても同じ比率でしか積み上がらないので、増やす前に「見た人が登録に進む理由」を作り直すほうが先です。' +
        '下の「分析の観点」で、どの動画が転換できていてどの動画ができていないかまで出しています。';
      out.convNote = 'bad';
      return out;
    }
    if (cv.drop >= CONV_WARN && rising) {
      out.one = base.one + '一方で1,000回あたりの登録者数は' + d + '%落ちています。';
      out.detail = base.detail + ' ただし、1,000回見られるうちの登録者数は ' +
        fixed(cv.before, 2) + '人 → ' + fixed(cv.now, 2) + '人 に落ちています。' +
        'いまは視聴回数の伸びで隠れていますが、伸びが止まるとそのまま数字に出ます。';
      out.convNote = 'warn';
      return out;
    }
    if (cv.drop <= -CONV_WARN && (base.level === 'bad' || base.level === 'warn')) {
      out.one = base.one + 'ただし1,000回あたりの登録者数は' + Math.abs(d) + '%伸びています。';
      out.detail = base.detail + ' 救いは、見に来た人が登録する割合が上がっていることです（' +
        fixed(cv.before, 2) + '人 → ' + fixed(cv.now, 2) + '人／1,000視聴）。' +
        '中身は効いているので、直すべきは中身ではなく「届く数」のほうです。';
      out.convNote = 'good';
      return out;
    }
    return out;
  }

  /* ========== 観点 ========== */

  /* 1. 転換 — 1,000視聴あたり何人が登録したか */
  function lensConversion(c) {
    var lvl = 'info';
    if (c.drop != null) {
      if (c.drop >= CONV_BAD) lvl = 'bad';
      else if (c.drop >= CONV_WARN) lvl = 'warn';
      else if (c.drop <= -CONV_WARN) lvl = 'good';
    }
    var body;
    if (lvl === 'bad' || lvl === 'warn') {
      body = '同じ1,000回の再生から登録される人数が減っています。視聴回数が伸びていても、' +
        'ここが落ちていれば増える速さは落ちます。落ちる原因はだいたい3つのどれかです。' +
        '（1）新しく届いた層がもともと登録しにくい層だった、' +
        '（2）1本当たった動画の視聴だけが増えて、他が薄まった、' +
        '（3）最後まで見てもらえず、登録の案内まで届いていない。' +
        '下の「偏り」と「対」を見ると、どれなのかが絞り込めます。';
    } else if (lvl === 'good') {
      body = '見に来た人が登録する割合は上がっています。中身は効いているので、' +
        '次にやることは「同じものを、もっと多くの人に届ける」側になります。';
    } else {
      body = '登録への転換はほぼ変わっていません。視聴回数が増えれば、そのぶん登録も同じ比率で増える形です。';
    }
    return {
      key: 'conv', level: lvl, title: '登録への転換',
      body: body,
      nums: [
        { label: '直近28日', value: fixed(c.now, 2) + '人／1,000視聴', pct: c.pct28 },
        { label: '直近90日', value: fixed(c.now90, 2) + '人／1,000視聴', pct: c.pct90 }
      ]
    };
  }

  /* 2. 整合 — 平均視聴時間を2通りで出して突き合わせる */
  function lensReconcile(d) {
    var api = weighted(d.now28, 'averageViewDuration', 'views');
    var apiP = weighted(d.prev28, 'averageViewDuration', 'views');
    var v = sum(d.now28, 'views'), vP = sum(d.prev28, 'views');
    var der = v ? sum(d.now28, 'estimatedMinutesWatched') * 60 / v : 0;
    var derP = vP ? sum(d.prev28, 'estimatedMinutesWatched') * 60 / vP : 0;
    if (!api || !der) return null;

    var gap = Math.abs(api - der) / der * 100;
    var dApi = pct(api, apiP), dDer = pct(der, derP);
    /* 「向きが逆かどうか」は、四捨五入して画面に出す数字（±5%・±24%…）の
       符号で決める。以前は丸める前の生の値に±5%以上の変化があるかで
       判定していたため、生の値が+4.6%（表示は「+5%」）のようなときに
       「向きは揃っている」という文章と、目の前の「+5%」「−24%」という
       表示が食い違って見える事故が起きていた。
       読む人が実際に見る数字と、判定の根拠を必ず一致させる。 */
    var sign = function (p) {
      if (p == null) return 0;
      var r = Math.round(p);
      return r > 0 ? 1 : r < 0 ? -1 : 0;
    };
    var sApi = sign(dApi), sDer = sign(dDer);
    var opposite = sApi !== 0 && sDer !== 0 && sApi !== sDer;

    var lvl = opposite ? 'warn' : (gap >= 20 ? 'info' : 'good');
    var body;
    if (opposite) {
      body = '2つの測り方が逆を向いています。API の平均視聴時間は' + (dApi > 0 ? '伸びて' : '縮んで') +
        'いるのに、総再生時間 ÷ 視聴回数で出すと' + (dDer > 0 ? '伸びて' : '縮んで') + 'います。' +
        'これは、長さの違うものが混ざったときに出る形です。ショート動画や長時間のライブが期間の途中から入ると、' +
        '片方は本数の重み、もう片方は時間の重みで平均を取るため、向きが割れます。' +
        'YouTube Studio の「コンテンツ」で、この期間にショートやライブを出していないかを確かめてください。' +
        '混ざっている場合、チャンネル全体の平均視聴時間は伸び縮みの判断には使えません。' +
        '通常の動画だけを「動画」タブで並べて見るほうが正確です。';
    } else if (gap >= 20) {
      body = '2つの測り方に' + Math.round(gap) + '%の開きがあります。少数の長時間視聴や、' +
        '長さの大きく違う動画が混ざっていると出る差です。いまのところ向きは揃っているので、' +
        '判断を誤るほどではありませんが、平均視聴時間を単独で根拠にするのは避けてください。';
    } else {
      body = '2通りの測り方がほぼ一致しています（開き' + Math.round(gap) + '%）。' +
        'チャンネル全体の平均視聴時間を、そのまま判断の根拠にして構いません。';
    }
    return {
      key: 'reconcile', level: lvl, title: '平均視聴時間の裏取り',
      body: body,
      nums: [
        { label: 'APIの平均視聴時間', value: fmtDur(api), pct: dApi },
        { label: '総再生時間÷視聴回数', value: fmtDur(der), pct: dDer }
      ]
    };
  }

  /* 3. 偏り — 上位数本と、それ以外（長い尾）で登録の効率を比べる */
  function lensConcentration(d) {
    var vids = (d.videos28 || []).filter(function (r) { return num(r.views) > 0; })
      .slice().sort(function (a, b) { return num(b.views) - num(a.views); });
    if (vids.length < 6) return null;

    var allV = vids.reduce(function (a, r) { return a + num(r.views); }, 0);
    var allG = vids.reduce(function (a, r) { return a + num(r.subscribersGained); }, 0);
    if (!allV || !allG) return null;

    var top = vids.slice(0, TOP_N), tail = vids.slice(TOP_N);
    var topV = top.reduce(function (a, r) { return a + num(r.views); }, 0);
    var topG = top.reduce(function (a, r) { return a + num(r.subscribersGained); }, 0);
    var tailV = allV - topV, tailG = allG - topG;
    if (!tailV) return null;

    var topC = per1k(topG, topV), tailC = per1k(tailG, tailV);
    var ratio = tailC ? topC / tailC : (topC ? Infinity : 1);
    var lvl = ratio >= 2.5 ? 'warn' : ratio >= 1.6 ? 'info' : 'good';

    var body;
    if (lvl === 'good') {
      body = '上位' + TOP_N + '本と、それ以外の動画で、登録される効率はほぼ同じです。' +
        'どの動画を見ても同じように登録に進んでいるので、いまは本数を増やすことがそのまま登録の増加になります。';
    } else {
      body = '視聴回数の' + Math.round(topV / allV * 100) + '%が上位' + TOP_N + '本ですが、' +
        '登録者は' + Math.round(topG / allG * 100) + '%がその' + TOP_N + '本から出ています。' +
        'それ以外の動画は' + (isFinite(ratio)
          ? '、上位の' + fixed(ratio, 1) + '分の1しか登録に繋がっていません'
          : 'からは、ほとんど登録されていません') + '。ここが直せる部分です。' +
        '長い尾は本数が多いぶん、1本あたりの伸びしろは小さくても、合計では上位を超えることがあります。' +
        '上位' + TOP_N + '本の説明文・終了画面・固定コメントを、それ以外の動画にも同じように入れるところから始めてください。' +
        '作り直しではなく、当たっている1本と同じ形に揃えるだけの作業です。';
    }
    return {
      key: 'concentration', level: lvl, title: '上位と長い尾の差',
      body: body,
      nums: [
        { label: '上位' + TOP_N + '本', value: fixed(topC, 2) + '人／1,000視聴' },
        { label: 'それ以外' + tail.length + '本', value: fixed(tailC, 2) + '人／1,000視聴' }
      ],
      ratio: ratio, topShare: topV / allV * 100, topSubShare: topG / allG * 100
    };
  }

  /* 4. 対 — 見られ方がほぼ同じなのに、登録数だけ違う2本を探す。
     条件を揃えた比較になるので「中身が悪いのでは」という曖昧な話を外せる。
     視聴回数も維持率も同じなら、差は導線か、題名・サムネが約束したものの側にある。 */
  function lensPair(d) {
    var vids = (d.videos28 || []).filter(function (r) {
      return num(r.views) >= 300 && num(r.averageViewDuration) > 0;
    });
    if (vids.length < 2) return null;

    var best = null;
    for (var i = 0; i < vids.length; i++) {
      for (var j = i + 1; j < vids.length; j++) {
        var a = vids[i], b = vids[j];
        var av = num(a.views), bv = num(b.views);
        var ad = num(a.averageViewDuration), bd = num(b.averageViewDuration);
        if (Math.max(av, bv) / Math.min(av, bv) > 1.4) continue;   // 視聴回数がほぼ同じ
        if (Math.max(ad, bd) / Math.min(ad, bd) > 1.25) continue;  // 見られ方もほぼ同じ
        var ac = per1k(num(a.subscribersGained), av);
        var bc = per1k(num(b.subscribersGained), bv);
        var hi = ac >= bc ? a : b, lo = ac >= bc ? b : a;
        var hiC = Math.max(ac, bc), loC = Math.min(ac, bc);
        if (!loC || hiC / loC < 2) continue;                        // 登録だけ2倍以上違う
        var weight = (av + bv) * (hiC / loC);
        if (!best || weight > best.weight) {
          best = {
            weight: weight, hi: hi, lo: lo, hiC: hiC, loC: loC, ratio: hiC / loC
          };
        }
      }
    }
    if (!best) return null;

    var t = function (r) { return ((d.meta || {})[r.video] || { snippet: {} }).snippet.title || r.video; };
    return {
      key: 'pair', level: 'warn', title: '条件の揃った2本の差',
      body: '「' + t(best.hi) + '」と「' + t(best.lo) + '」は、視聴回数も1回あたりの見られ方もほぼ同じです。' +
        'それなのに登録される人数は' + fixed(best.ratio, 1) + '倍違います。' +
        '同じだけ見られ、同じだけの長さ見られているのですから、差は中身の良し悪しではありません。' +
        '残るのは「登録する理由が伝わったかどうか」です。' +
        '2本の題名・サムネ・説明文の1行目・終了画面を並べて見比べて、' +
        '前者にあって後者に無いものを後者に足してください。1つだけ足して、次の28日で動くかを見るのが確実です。',
      nums: [
        { label: t(best.hi), value: fixed(best.hiC, 2) + '人／1,000視聴' },
        { label: t(best.lo), value: fixed(best.loC, 2) + '人／1,000視聴' }
      ],
      ratio: best.ratio, pair: best
    };
  }

  /* 6. 視聴の中身 — 増えた視聴は「新規」か「既存」か。
     転換率（1,000視聴あたりの登録）が落ちていても、原因が作りの側にあるとは
     限らない。すでに登録している人がこれまでより多く見るようになっただけなら、
     その人たちはもう登録しようがないので、転換率は指標としてただ下がる。
     これは「登録フィード・ホーム」からの流入が占める割合が、
     前の期間と比べて増えているかどうかで見分けられる。 */
  var AUDIENCE_SHIFT = 6;   // 登録フィードの割合がこれ以上ポイント動いたら取り上げる
  function lensAudienceMix(d) {
    var now = share(d.traffic, 'insightTrafficSourceType', 'SUBSCRIBER');
    var before = share(d.prevTraffic, 'insightTrafficSourceType', 'SUBSCRIBER');
    if (!sum(d.traffic, 'views') || !sum(d.prevTraffic, 'views')) return null;   // 前期の内訳が無ければ何も言えない

    var diff = now - before;   // ポイント差（％の差ではなくポイントの差）
    var lvl = Math.abs(diff) >= AUDIENCE_SHIFT ? (diff > 0 ? 'warn' : 'good') : 'info';
    var body;
    if (diff >= AUDIENCE_SHIFT) {
      body = '「登録フィード・ホーム」からの視聴が、視聴全体に占める割合を' + Math.round(diff) +
        'ポイント増やしています（' + Math.round(before) + '% → ' + Math.round(now) + '%）。' +
        'ここはすでに登録している人がほとんどの入口です。視聴回数の伸びのうち、' +
        'この分は「新しく届いた」わけではないので、転換率が落ちて見えるのは自然な結果でもあります。' +
        'ただし、そのぶん新規発見の入口（関連動画・検索）の取り分は相対的に細っています。' +
        '転換率を戻すより先に、「流入」タブで関連動画・検索の割合が同時に落ちていないかを確かめてください。';
    } else if (diff <= -AUDIENCE_SHIFT) {
      body = '「登録フィード・ホーム」からの視聴が、視聴全体に占める割合を' + Math.round(Math.abs(diff)) +
        'ポイント減らしています（' + Math.round(before) + '% → ' + Math.round(now) + '%）。' +
        '視聴の伸びは、既存の登録者が見る量が増えたからではなく、新しい人に届いた分だと言えます。' +
        'それでも転換率が落ちているなら、原因は届き方ではなく「登録する理由が伝わっているか」の側にあります。';
    } else {
      body = '「登録フィード・ホーム」の割合はほぼ変わっていません（' + Math.round(before) + '% → ' +
        Math.round(now) + '%）。視聴の伸びが既存の登録者に偏ったせいで転換率が落ちたわけではなさそうです。' +
        '原因は届き方より、届いたあとの「登録する理由の伝え方」の側にある可能性が高くなります。';
    }
    return {
      key: 'audience', level: lvl, title: '視聴の増え方（新規か、既存か）',
      body: body,
      nums: [
        { label: '登録フィード・ホームの割合（今回）', value: fixed(now, 0) + '%' },
        { label: '登録フィード・ホームの割合（前回）', value: fixed(before, 0) + '%' }
      ]
    };
  }

  /* 7. 相場 — 同じくらいの規模のチャンネルと比べて、登録者は速く増えているか。
     1,000視聴あたりの転換率は「率」なので分かりやすいが、そもそも今の
     純増そのものが世間と比べて速いのか遅いのかは、これが無いと分からない。
     視聴回数が伸びている局面では特に、「転換率が落ちている」という悪い面だけを
     見て、実際には人並み外れて速く伸びていることを見落としやすい。

     ▼ 数字の出どころ
     vidIQ が2026年に61,000,000チャンネル（うち有効サンプル1,175万）を
     分析した調査から、登録者の規模帯ごとの「月間登録者増加率の中央値」を
     引用している。外部の調査であり、時間が経てば古くなる。
     あくまで「だいたいの相場感」として使うためのもので、
     このチャンネルの伸びが良いか悪いかを断定する材料ではない。 */
  var GROWTH_BENCHMARK = [
    { max: 1000, monthly: 1.26 },      // 1〜999人
    { max: 10000, monthly: 0.51 },     // 1,000〜9,999人
    { max: 100000, monthly: 0.48 }     // 1万〜99,999人
  ];
  function benchmarkFor(subs) {
    for (var i = 0; i < GROWTH_BENCHMARK.length; i++) {
      if (subs < GROWTH_BENCHMARK[i].max) return GROWTH_BENCHMARK[i];
    }
    return null;   // 10万人以上は、参照した調査の対象外
  }
  function lensBenchmark(d, subsTotal) {
    if (!subsTotal) return null;
    var bm = benchmarkFor(subsTotal);
    if (!bm) return null;

    var n28 = sum(d.now28, 'subscribersGained') - sum(d.now28, 'subscribersLost');
    var n90 = sum(d.now90, 'subscribersGained') - sum(d.now90, 'subscribersLost');
    var rate28 = subsTotal ? n28 / subsTotal * 100 : 0;
    var rate90 = subsTotal ? n90 / subsTotal * 100 : 0;
    // 月次の中央値を28日・90日に引き直す。90日は複利（月次を3回重ねる）で出す。
    var bm28 = bm.monthly * 28 / 30;
    var bm90 = (Math.pow(1 + bm.monthly / 100, 3) - 1) * 100;
    var mult28 = bm28 > 0 ? rate28 / bm28 : null;
    var mult90 = bm90 > 0 ? rate90 / bm90 : null;

    var slow = (mult28 != null && mult28 < 0.5) || (mult90 != null && mult90 < 0.5);
    var lvl = slow ? 'warn' : 'info';
    var body;
    if (slow) {
      body = '同規模（登録者' + scaleWord(subsTotal) + '前後）のチャンネルの相場は月' + fixed(bm.monthly, 2) +
        '%ほどです（vidIQ、2026年の調査）。このチャンネルの伸び方は相場よりゆっくりで、' +
        '転換率の低下がそのまま純増の鈍さに出ています。①②の打ち手を優先してください。';
    } else {
      body = '同規模（登録者' + scaleWord(subsTotal) + '前後）のチャンネルの相場は月' + fixed(bm.monthly, 2) +
        '%ほどです（vidIQ、2026年の調査）。' +
        (mult28 != null && mult28 >= 1
          ? 'このチャンネルは相場の約' + fixed(Math.max(mult28 || 0, mult90 || 0), 1) + '倍のペースで伸びています。' +
            '転換率（1,000視聴あたりの登録）は落ちていても、純増そのものは崩れていません。'
          : '純増そのものは大きく崩れてはいません。') +
        '転換率の低下は「いま伸びている勢い」を将来も保てるかの先行指標として見てください。' +
        '外部の調査に基づく目安であり、断定の材料ではありません。';
    }
    return {
      key: 'benchmark', level: lvl, title: '登録者の伸び方（同規模との比較）',
      body: body,
      nums: [
        { label: '直近28日の純増率', value: fixed(rate28, 1) + '%' + (bm28 ? '（相場 ' + fixed(bm28, 2) + '%）' : '') },
        { label: '直近90日の純増率', value: fixed(rate90, 1) + '%' + (bm90 ? '（相場 ' + fixed(bm90, 2) + '%）' : '') }
      ]
    };
  }
  function scaleWord(n) {
    if (n < 1000) return Math.round(n / 100) * 100 + '人';
    if (n < 10000) return Math.round(n / 1000) + '千人';
    return Math.round(n / 10000) + '万人';
  }

  /* 5. 除外 — 問題ではないと確認できたこと。
     どこを触らなくていいかが分かると、限られた時間を使う先が決まる。 */
  function ruledOut(d, m) {
    var out = [];
    var v28 = m.v28;
    var lost = sum(d.now28, 'subscribersLost');
    var lostRate = per1k(lost, v28);
    if (v28 > 0 && lostRate < 1) {
      out.push({
        title: '登録解除は問題ではない',
        why: '直近28日の解除は' + Math.round(lost) + '人、1,000視聴あたり' + fixed(lostRate, 2) + '人です。' +
          'この水準はほぼ誤差で、ここを減らしても増え方は変わりません。解除された動画を探す作業に時間を使う必要はありません。'
      });
    }
    if (m.s != null && m.s >= -FLAT) {
      out.push({
        title: '見られる数そのものは落ちていない',
        why: '直近28日の視聴回数は前の28日から' + (m.s >= 0 ? '＋' : '−') + Math.abs(Math.round(m.s)) +
          '%です。届いていないことが原因ではないので、サムネや題名で「クリックされるか」を直す優先度は低いままで構いません。'
      });
    }
    if (m.recent28 > 0) {
      out.push({
        title: '投稿は止まっていない',
        why: '直近28日に' + m.recent28 + '本出ています。頻度が原因で落ちている形ではありません。'
      });
    }
    if (m.longForm && m.avgPct > 0 && m.avgPct < 25) {
      out.push({
        title: '平均視聴率の低さは異常ではない',
        why: '平均視聴率は' + fixed(m.avgPct, 1) + '%ですが、この チャンネルの動画は長尺です（中央値 ' +
          fmtDur(m.medianSec) + '）。長い動画ほど割合は下がるのが普通で、作業用・BGM のように流して聴く動画では数%〜十数%が当たり前です。' +
          '比べるなら、同じくらいの長さの動画どうしか、同じ動画の過去と比べてください。'
      });
    }
    if (m.aDrop != null && m.aDrop > -8) {
      out.push({
        title: '1回あたりの見られ方は崩れていない',
        why: '平均視聴時間は前の28日から' + (m.aDrop >= 0 ? '＋' : '−') + Math.abs(Math.round(m.aDrop)) +
          '%です。冒頭を作り直すような大きな手を入れる段階ではありません。'
      });
    }
    return out;
  }

  /* d の中身:
     now28/prev28/now90/prev90 … day 次元の行
     traffic  … insightTrafficSourceType の行（28日）
     subs     … subscribedStatus の行（28日）
     videos28 … video 次元の行（28日／views, averageViewDuration, subscribersGained）
     meta     … videoId -> Data API の動画（題名・公開日・長さ）
     uploads  … Data API の動画の配列
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

    /* 転換率。純増ではなく「増えた数」で出す。
       純増だと解除の動きが混ざり、「見た人が登録したか」という問いの答えにならない。 */
    var c28 = per1k(sum(d.now28, 'subscribersGained'), v28);
    var c28p = per1k(sum(d.prev28, 'subscribersGained'), v28p);
    var c90 = per1k(sum(d.now90, 'subscribersGained'), v90);
    var c90p = per1k(sum(d.prev90, 'subscribersGained'), v90p);
    var cp28 = pct(c28, c28p), cp90 = pct(c90, c90p);

    /* 28日と90日のうち、落ち方の大きいほうを判定に使う。
       28日だけだと1本の当たりで隠れ、90日だけだと気づくのが遅れる。 */
    var drops = [cp28, cp90].filter(function (x) { return x != null; }).map(function (x) { return -x; });
    var conv = {
      now: c28, before: c28p, now90: c90, before90: c90p,
      pct28: cp28, pct90: cp90,
      drop: drops.length ? Math.max.apply(null, drops) : null
    };

    var out = verdict(s, l, conv);
    out.metrics = [
      /* 先頭に置く。判定を書き換えるのはこの行なので、
         「視聴回数は増えている」を読んだあとに出てきたのでは遅い。
         概要の数字カードとも並びを揃えている。 */
      { label: '登録への転換', a: c28, ap: cp28, b: c90, bp: cp90, kind: 'per1k',
        note: '1,000視聴あたりの登録者数' },
      { label: '視聴回数', a: v28, ap: pct(v28, v28p), b: v90, bp: pct(v90, v90p), kind: 'int' },
      { label: '総再生時間', a: w28, ap: pct(w28, w28p), b: w90, bp: pct(w90, w90p), kind: 'watch' },
      { label: '平均視聴時間', a: a28, ap: pct(a28, a28p), b: a90, bp: pct(a90, a90p), kind: 'dur' },
      { label: '登録者の純増', a: n28, ap: pct(n28, n28p), b: n90, bp: pct(n90, n90p), kind: 'signed' }
    ];

    var recent28 = (d.uploads || []).filter(function (v) {
      return (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000 <= 28;
    }).length;
    var durs = (d.uploads || []).map(function (v) {
      return global.Seo ? global.Seo.durationSec((v.contentDetails || {}).duration) : 0;
    }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    var medianSec = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
    var aDrop = a28p ? (a28 - a28p) / a28p * 100 : null;

    var m = {
      s: s, l: l, a28: a28, a28p: a28p, aDrop: aDrop, v28: v28,
      conv: conv, recent28: recent28,
      medianSec: medianSec, longForm: medianSec >= 900,
      avgPct: weighted(d.now28, 'averageViewPercentage', 'views')
    };

    /* 観点。出せないものは黙って落とす（材料が無いのに枠だけ残すと読めなくなる）。 */
    out.lenses = [
      lensConversion(conv),
      lensReconcile(d),
      lensConcentration(d),
      lensPair(d),
      lensAudienceMix(d),
      lensBenchmark(d, d.subsTotal)
    ].filter(Boolean);
    out.clear = ruledOut(d, m);

    m.lenses = {};
    out.lenses.forEach(function (x) { m.lenses[x.key] = x; });

    out.conv = conv;
    out.actions = actions(d, m);
    return out;
  }

  function actions(d, m) {
    var list = [];
    var push = function (o) { if (list.length < 3) list.push(o); };
    var L = m.lenses || {};

    /* 1. 投稿が止まっていないか */
    var recent90 = (d.uploads || []).filter(function (v) {
      return (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000 <= 90;
    }).length;
    if ((d.uploads || []).length && m.recent28 === 0 && recent90 > 0) {
      push({
        title: 'まず1本出す',
        why: '直近28日の投稿が0本です（90日では' + recent90 + '本）。',
        how: '止まっている間は、過去の動画が拾われるぶんだけ数字が落ち続けます。完璧なものを待つより、いちばん反応の良かった動画と同じ型で1本出すのが最短です。'
      });
    }

    /* 2. 平均視聴時間が落ちていないか（維持率は他の全部の土台） */
    if (m.aDrop != null && m.aDrop <= -8) {
      push({
        title: '冒頭の作りを見直す',
        why: '平均視聴時間が前の28日より' + Math.abs(m.aDrop).toFixed(0) + '%短くなっています（' +
          fmtDur(m.a28p) + ' → ' + fmtDur(m.a28) + '）。' +
          (L.reconcile && L.reconcile.level === 'warn'
            ? 'ただし測り方によって向きが割れているので、先に「分析の観点」の裏取りを確認してください。' : ''),
        how: '「動画」タブで平均視聴時間の短い順に並べ、下位の1本を開いて維持率グラフの最初の30秒を見てください。そこで大きく落ちていれば、前置き・あいさつ・自己紹介を削り、1文目で結論か一番いい部分を出します。'
      });
    }

    /* 3. 登録への転換が落ちていないか。
       ここは視聴回数より遅れて効いてくるので、伸びている最中ほど見落とされる。 */
    if (m.conv && m.conv.drop != null && m.conv.drop >= CONV_WARN) {
      push({
        title: '登録される理由を作り直す',
        why: '1,000回見られるうちの登録者数が ' + fixed(m.conv.before, 2) + '人 → ' +
          fixed(m.conv.now, 2) + '人（' + Math.round(m.conv.drop) + '%減）になっています。' +
          '視聴回数が伸びていても、この比率のままでは登録は増えません。',
        how: '直す順は、いちばん見られている1本から。終了画面に登録と次の動画を置き、説明文の1行目を「このチャンネルは何を出しているか」の1文にし、固定コメントで次に見るものを示します。' +
          '3つ一度に変えず、まず終了画面だけ入れて次の28日で比べてください。変える数を1つにしないと、効いたものが分かりません。'
      });
    }

    /* 4. 条件の揃った2本の差。原因が1か所に絞れているので、いちばん動ける。 */
    if (L.pair) {
      push({
        title: '同じ条件の2本の差を埋める',
        why: L.pair.nums[0].label + '（' + L.pair.nums[0].value + '）と ' +
          L.pair.nums[1].label + '（' + L.pair.nums[1].value + '）は、視聴回数も見られ方もほぼ同じなのに登録だけ' +
          fixed(L.pair.ratio, 1) + '倍違います。',
        how: '条件が揃っているので、差は中身ではなく伝わり方にあります。2本の題名・サムネ・説明文の1行目・終了画面を並べ、前者にあって後者に無いものを1つだけ後者に足してください。'
      });
    }

    /* 5. 新規に届いているか（登録者ばかりだと頭打ちになる） */
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

    /* 6. 検索から拾えているか */
    if (searchShare < 8 && m.v28 > 0) {
      push({
        title: '検索で拾われる語を題名に入れる',
        why: 'YouTube検索からの流入が' + (searchShare < 0.5 ? 'ほぼ0' : Math.round(searchShare) + '%') + 'です。',
        how: '「流入」タブの「YouTube検索で使われた語」を見てください。そこに出ている語が、実際に人が打ち込んでいる言い方です。推測ではないので、次の動画の題名にはその言い方をそのまま使います。1語も出ていない場合は、まだ検索の入口が無い状態なので、探されている具体名（曲調・用途・時間）を題名に入れるところからです。'
      });
    }

    /* 7. 登録に進まれているか */
    var unsub = share(d.subs, 'subscribedStatus', 'UNSUBSCRIBED');
    if (unsub >= 80 && searchShare + relShare >= 25) {
      push({
        title: '登録への導線を足す',
        why: '視聴の' + Math.round(unsub) + '%が未登録の人です。新規には届いています。',
        how: '届いているのに次に繋がっていない状態です。終了画面に「次の動画」と「登録」を置き、説明文の1行目を定型のあいさつではなく「このチャンネルは何を出しているか」の1文にしてください。'
      });
    }

    /* 8. 長い尾が登録に繋がっていないか。
       上位を伸ばすより、本数の多い尾を揃えるほうが合計では効くことがある。 */
    if (L.concentration && L.concentration.level === 'warn') {
      push({
        title: '上位以外の動画を上位と同じ形に揃える',
        why: '視聴回数の' + Math.round(L.concentration.topShare) + '%が上位' + TOP_N + '本ですが、登録者は' +
          Math.round(L.concentration.topSubShare) + '%がその' + TOP_N + '本からです。それ以外は登録に繋がる効率が' +
          (isFinite(L.concentration.ratio) ? fixed(L.concentration.ratio, 1) + '分の1しかありません' : 'ほぼ0です') + '。',
        how: '新しく作る必要はありません。上位' + TOP_N + '本の説明文・終了画面・固定コメント・再生リストへの入れ方を、それ以外の動画にそのまま複製してください。公開済みの動画でも後から直せます。再生数の多い順に10本やるだけで効果が出ます。'
      });
    }

    /* 9. 当たった型をなぞる */
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

    /* 10. 作りの取りこぼし */
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

  global.Insight = { build: build, pct: pct, per1k: per1k, TOP_N: TOP_N };
})(window);
