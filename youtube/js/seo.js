/* seo.js — 題名・説明文・タグの作りを機械的に点検する。
 *
 *  ここで出す点数は vidIQ の「SEOスコア」そのものではない。
 *  あちらの計算式は公開されていないので、真似ることはできないし、しない。
 *  代わりに、YouTube 自身が公開しているクリエイター向けの案内と、
 *  伸びている／伸びなかったチャンネルに共通して見られる作り方のうち、
 *  APIで取れる情報だけで白黒つけられるものを並べている。
 *
 *  各項目には「なぜそうなのか」を必ず添える。
 *  点数だけ見せても直しようがないため。
 *
 *  ▼ よくある失敗（減点の根拠）
 *   ・題名が長すぎて、検索結果や関連動画の一覧で後半が「…」に切られる
 *   ・説明文の冒頭が定型のあいさつで、肝心の内容が折りたたみの下に隠れる
 *   ・説明文を全動画で使い回し、どの動画も同じ内容として扱われる
 *   ・タグを何十個も詰め込む（効果がないうえ、関連性の薄い語はポリシー違反になりうる）
 *   ・ハッシュタグを15個より多く付ける（YouTube 側で全部無効になる）
 *   ・章（チャプター）がなく、長い動画で見たい場所に飛べない
 */
(function (global) {
  'use strict';

  /* 表示幅の目安。日本語は半角2つ分として数える。 */
  function width(s) {
    var w = 0;
    Array.from(String(s || '')).forEach(function (c) {
      w += /[\x00-\x7F｡-ﾟ]/.test(c) ? 1 : 2;
    });
    return w;
  }

  /* 章（チャプター）として成立しているか。
     YouTube 側の条件は「00:00 から始まること」「3つ以上あること」
     「各章が10秒以上あること」。ここは前の2つだけ見る。 */
  function chapters(desc) {
    var lines = String(desc || '').split('\n');
    var stamps = [];
    lines.forEach(function (l) {
      var m = l.match(/(?:^|\s)(\d{1,2}:)?(\d{1,2}):(\d{2})(?=\s|$)/);
      if (!m) return;
      var h = m[1] ? parseInt(m[1], 10) : 0;
      stamps.push(h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
    });
    return { ok: stamps.length >= 3 && stamps[0] === 0, count: stamps.length, zero: stamps[0] === 0 };
  }

  function hashtags(s) {
    var m = String(s || '').match(/#[^\s#　]+/g);
    return m || [];
  }

  /* ISO8601 の長さ（PT12M34S）を秒に直す */
  function durationSec(iso) {
    var m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }

  /* 1本ぶんの点検。
     v は Data API の videos の1件。 */
  function audit(v) {
    var sn = v.snippet || {}, cd = v.contentDetails || {};
    var title = sn.title || '', desc = sn.description || '', tags = sn.tags || [];
    var sec = durationSec(cd.duration);
    var checks = [];

    function add(id, level, label, detail, why) {
      checks.push({ id: id, level: level, label: label, detail: detail, why: why });
    }

    /* --- 題名 --- */
    var tw = width(title);
    if (tw === 0) {
      add('title', 'bad', '題名がありません', '', '');
    } else if (tw > 70) {
      add('title', 'bad', '題名が長すぎます',
        '表示幅' + tw + '（半角換算）。検索結果と関連動画では60前後で「…」に切られます。',
        'スマートフォンの一覧は2行までしか出ません。切られた先に入れた語は、読まれることも検索に効くこともありません。');
    } else if (tw > 60) {
      add('title', 'warn', '題名がやや長めです',
        '表示幅' + tw + '。端末によっては後半が切れます。',
        '大事な語ほど前に置くと、切られても意味が通ります。');
    } else if (tw < 16) {
      add('title', 'warn', '題名が短すぎます',
        '表示幅' + tw + '。検索される語が足りていない可能性があります。',
        '短い題名は目を引きますが、検索から見つけてもらう入口が狭くなります。');
    } else {
      add('title', 'good', '題名の長さは適正', '表示幅' + tw + '（60以内）', '');
    }

    var deco = (title.match(/[【】「」『』\[\]\|｜★☆※!！?？♪♬✨🔥]/g) || []).length;
    if (deco >= 8) {
      add('title-deco', 'warn', '題名の記号が多すぎます',
        '記号' + deco + '個。',
        '記号は目立ちますが、増やすほど1個あたりの効果は落ち、内容を書く余白が減ります。');
    }

    /* --- 説明文 --- */
    var dw = width(desc);
    var head = desc.split('\n').slice(0, 3).join(' ');
    if (dw === 0) {
      add('desc', 'bad', '説明文が空です', '',
        '説明文は検索対象であり、視聴者が内容を確かめる場所でもあります。空だと両方を捨てることになります。');
    } else if (dw < 200) {
      add('desc', 'warn', '説明文が短めです', '表示幅' + dw + '。',
        '目安は400前後。ただし語の羅列は逆効果で、文章として読めることが条件です。');
    } else {
      add('desc', 'good', '説明文の量は十分', '表示幅' + dw, '');
    }

    if (dw > 0 && width(head) < 40) {
      add('desc-head', 'warn', '説明文の冒頭が薄いです', '冒頭3行の幅' + width(head) + '。',
        '折りたたまれる前に出るのは最初の2〜3行だけです。ここに内容の要点を置きます。');
    }

    var ht = hashtags(desc);
    if (ht.length > 15) {
      add('hash', 'bad', 'ハッシュタグが多すぎます', ht.length + '個。',
        '15個を超えると YouTube 側ですべて無効になります（付けていないのと同じ扱い）。');
    } else if (ht.length > 3) {
      add('hash', 'warn', 'ハッシュタグが多めです', ht.length + '個。',
        '動画の上に表示されるのは先頭3個までです。それ以降は視聴者の目に触れません。');
    } else if (ht.length === 0) {
      add('hash', 'info', 'ハッシュタグがありません', '',
        '1〜3個なら、同じ話題の動画とまとまって表示される入口になります。');
    } else {
      add('hash', 'good', 'ハッシュタグは適量', ht.length + '個', '');
    }

    /* --- 章 --- */
    var ch = chapters(desc);
    if (sec >= 300) {
      if (ch.ok) add('chapter', 'good', '章（チャプター）あり', ch.count + '個', '');
      else if (ch.count >= 3 && !ch.zero) {
        add('chapter', 'warn', '章が有効になっていません', '時刻は' + ch.count + '個ありますが 00:00 から始まっていません。',
          '最初の章を 00:00 にしないと、章として認識されません。');
      } else {
        add('chapter', 'warn', '章（チャプター）がありません', '',
          '5分を超える動画では、見たい場所に飛べることが最後まで見てもらえるかを左右します。');
      }
    }

    /* --- タグ --- */
    var tagChars = tags.join('').length;
    if (tags.length === 0) {
      add('tags', 'info', 'タグがありません', '',
        'タグの効果は昔より小さくなりましたが、表記ゆれ・誤字・英語表記など「題名に書けない言い方」を拾う役には今も立ちます。');
    } else if (tags.length > 30 || tagChars > 480) {
      add('tags', 'bad', 'タグが多すぎます', tags.length + '個／' + tagChars + '文字。上限は合計500文字。',
        '内容と関係の薄い語を大量に入れるのは、YouTube のポリシー上「誤解を招くメタデータ」に当たります。');
    } else if (tags.length < 5) {
      add('tags', 'warn', 'タグが少なめです', tags.length + '個', '5〜15個が扱いやすい範囲です。');
    } else {
      add('tags', 'good', 'タグは適量', tags.length + '個／' + tagChars + '文字', '');
    }

    /* --- 題名の語が説明文・タグに出てくるか --- */
    var words = title.replace(/[【】「」『』\[\]\|｜★☆※!！?？、。,.]/g, ' ')
      .split(/\s+/).filter(function (w) { return width(w) >= 4; });
    if (words.length) {
      var body = (desc + ' ' + tags.join(' ')).toLowerCase();
      var hit = words.filter(function (w) { return body.indexOf(w.toLowerCase()) >= 0; });
      if (hit.length === 0) {
        add('match', 'warn', '題名の語が説明文にもタグにも出てきません', '',
          '同じ語が本文にもあることで、その動画が何についてかがはっきりします。詰め込む必要はなく、1〜2回で十分です。');
      } else {
        add('match', 'good', '題名の語が説明文・タグにもあります', hit.slice(0, 3).join('／'), '');
      }
    }

    /* --- サムネイル --- */
    var th = sn.thumbnails || {};
    if (!th.maxres && !th.standard) {
      add('thumb', 'warn', '高解像度のサムネイルがありません', '',
        '自分で設定したサムネイルなら通常は高解像度が用意されます。自動生成のままの可能性があります。');
    }

    /* --- 長さ --- */
    if (sec > 0 && sec < 60) {
      add('len', 'info', 'ショート動画の長さです', Math.round(sec) + '秒',
        'ショートは通常の動画と伸び方も指標の意味も違います。同じ物差しで比べないでください。');
    }

    var score = scoreOf(checks);
    return { checks: checks, score: score, seconds: sec };
  }

  /* 点数。重い問題ほど大きく引く。満点は100。 */
  function scoreOf(checks) {
    var s = 100;
    checks.forEach(function (c) {
      if (c.level === 'bad') s -= 18;
      else if (c.level === 'warn') s -= 8;
    });
    return Math.max(0, Math.min(100, s));
  }

  /* チャンネル全体の癖を見る。1本ずつ見ても分からないものだけを扱う。 */
  function channelAudit(videos) {
    var out = [];
    if (!videos || !videos.length) return out;

    /* 説明文の使い回し */
    var heads = {}, dup = 0;
    videos.forEach(function (v) {
      var d = ((v.snippet || {}).description || '').slice(0, 120).trim();
      if (!d) return;
      heads[d] = (heads[d] || 0) + 1;
    });
    Object.keys(heads).forEach(function (k) { if (heads[k] > 1) dup += heads[k]; });
    var dupRate = videos.length ? dup / videos.length : 0;
    if (dupRate >= 0.6) {
      out.push({ level: 'warn', label: '説明文がほぼ使い回しです',
        detail: Math.round(dupRate * 100) + '% の動画で冒頭120文字が他と同じ。',
        why: '共通の定型文（リンクや注意書き）は下に置き、冒頭にはその回だけの内容を書きます。冒頭が同じだと、動画ごとの違いが検索側にも視聴者にも伝わりません。' });
    }

    /* 投稿間隔のばらつき */
    var dates = videos.map(function (v) { return new Date((v.snippet || {}).publishedAt).getTime(); })
      .filter(function (t) { return t; }).sort(function (a, b) { return a - b; });
    if (dates.length >= 4) {
      var gaps = [];
      for (var i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / 86400000);
      var avg = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
      var sd = Math.sqrt(gaps.reduce(function (a, b) { return a + (b - avg) * (b - avg); }, 0) / gaps.length);
      var cv = avg ? sd / avg : 0;
      if (cv > 1.2) {
        out.push({ level: 'warn', label: '投稿の間隔がばらついています',
          detail: '平均' + avg.toFixed(1) + '日おき、ばらつき±' + sd.toFixed(1) + '日。',
          why: '本数より間隔の安定のほうが効きます。まとめて出して間が空くより、少なくても一定の間隔のほうが、次を待つ視聴者が残ります。' });
      } else {
        out.push({ level: 'good', label: '投稿の間隔は安定しています',
          detail: '平均' + avg.toFixed(1) + '日おき', why: '' });
      }
    }

    /* 章のある動画の割合（5分超のものだけ母数にする） */
    var longs = videos.filter(function (v) { return durationSec((v.contentDetails || {}).duration) >= 300; });
    if (longs.length >= 3) {
      var withCh = longs.filter(function (v) { return chapters((v.snippet || {}).description).ok; }).length;
      if (withCh / longs.length < 0.3) {
        out.push({ level: 'warn', label: '長い動画に章がほとんどありません',
          detail: longs.length + '本中' + withCh + '本のみ。',
          why: '章を付けると、途中で離脱しかけた人が別の場所に飛んで見続けることがあります。長尺ほど効きます。' });
      }
    }

    /* タグの付け方 */
    var noTag = videos.filter(function (v) { return !((v.snippet || {}).tags || []).length; }).length;
    if (noTag / videos.length > 0.7) {
      out.push({ level: 'info', label: 'タグをほとんど使っていません',
        detail: videos.length + '本中' + noTag + '本がタグなし。',
        why: 'タグ単体の効果は小さいので致命傷ではありません。ただし表記ゆれ（ひらがな／カタカナ／英語）を拾う手段が他にないので、5個ほどでも入れておく価値はあります。' });
    }

    return out;
  }

  global.Seo = { audit: audit, channelAudit: channelAudit, width: width, durationSec: durationSec, chapters: chapters };
})(window);
