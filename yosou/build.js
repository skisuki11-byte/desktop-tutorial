/* data.js から印刷用の予想問題（A4）を組み立てる。node build.js で yosou.html を書き出す。 */
const fs = require("fs");
const path = require("path");
const SETS = [
  { id: 1, file: "./data.js",  out: "yosou.html",   name: "第1回", sub: "直近の反動を重く見た配分",
    note: "令和7年度で手薄だった分野（明・清、古代オリエント、宗教改革）を厚くしてある。" },
  { id: 2, file: "./data2.js", out: "yosou-2.html", name: "第2回", sub: "傾向がそのまま続いた場合",
    note: "令和7年度の分野配分をそのままなぞり、令和7で問われた知識のうち第1回で扱わなかったものを置いた。" },
  { id: 3, file: "./data3.js", out: "yosou-3.html", name: "第3回", sub: "取りこぼしを潰す・範囲が広がった場合の保険",
    note: "第1回・第2回で扱わなかった知識を全部入れ、令和5年度のように必須の範囲が19世紀まで及ぶ場合に備えて大問6を19世紀にしてある。" }
];
const SET = SETS[(Number(process.argv[2]) || 1) - 1];
const { exam, fig } = require(SET.file);
const bunya = JSON.parse(fs.readFileSync(path.join(__dirname, "bunya.json"), "utf8"));

const { rotate, CIRCLE } = require("./rotate.js");
rotate(exam);

const esc = (s) => s;
const opts = (q) => q.c.map((t, i) =>
  `<li class="opt"><span class="opt__n">${CIRCLE[i]}</span><span class="opt__t">${esc(t)}</span></li>`).join("");

const question = (q) => `
<article class="q" id="q${q.n}">
  <div class="q__head"><span class="q__n">問${q.n}</span>${q.fmt ? `<span class="q__tag">${q.fmt}</span>` : ""}</div>
  <p class="q__body">${esc(q.q)}</p>
  ${q.figKey ? `<figure class="fig">${fig[q.figKey]}</figure>` : ""}
  <ol class="opts">${opts(q)}</ol>
</article>`;

const section = (d) => `
<section class="dai">
  <header class="dai__head">
    <span class="dai__badge">${d.kind}</span>
    <h2 class="dai__title"><span class="dai__no">第${d.no}問</span>${d.title}</h2>
    <span class="dai__score">配点 ${d.qs.length * 2}点</span>
  </header>
  <p class="dai__lead">${d.lead}</p>
  ${d.qs.map(question).join("")}
</section>`;

/* 解答用紙 */
const sheetRow = (n) => `<tr><th>${n}</th>${[0, 1, 2, 3].map((i) =>
  `<td><span class="bub">${CIRCLE[i]}</span></td>`).join("")}</tr>`;
const sheetTable = (from, to) => `<table class="sheet"><thead><tr><th>問</th><th>①</th><th>②</th><th>③</th><th>④</th></tr></thead><tbody>${
  Array.from({ length: to - from + 1 }, (_, i) => sheetRow(from + i)).join("")}</tbody></table>`;

/* 正解一覧 */
const all = exam.flatMap((d) => d.qs);
const keyTable = (from, to) => `<table class="key"><thead><tr><th>問</th><th>正解</th><th>問</th><th>正解</th></tr></thead><tbody>${
  Array.from({ length: Math.ceil((to - from + 1) / 2) }, (_, i) => {
    const a = all[from - 1 + i], b = all[from - 1 + i + Math.ceil((to - from + 1) / 2)];
    return `<tr><th>${a.n}</th><td>${CIRCLE[a.a - 1]}</td>${b ? `<th>${b.n}</th><td>${CIRCLE[b.a - 1]}</td>` : "<th></th><td></td>"}</tr>`;
  }).join("")}</tbody></table>`;

const answer = (q) => `
<div class="ans">
  <div class="ans__head"><span class="ans__n">問${q.n}</span><span class="ans__a">正解 ${CIRCLE[q.a - 1]}</span></div>
  <p class="ans__ex">${q.ex}</p>
  ${q.src ? `<p class="ans__src"><span>予想の根拠</span>${q.src}</p>` : ""}
</div>`;

/* 予想根拠の表は verify.js が数えた bunya.json から組み立てる。手で数えた値は使わない。 */
const YEARS = ["令和5", "令和6", "令和7"];
const JUDGE = {
  "古代ギリシア・ローマ": "3年連続の第1問。令和7で8問と突出し、今年も最大の山と見る。",
  "中世西欧・ゲルマン": "毎年3〜4問。第1問の末尾と第6問に分けて配置した。",
  "古代インド・東南アジア": "ヴァルナ制と王朝の都が軸。東南アジアは令和5以来なく、復活を見込む。",
  "古代〜隋唐の中国": "令和6で10問。秦漢・魏晋南北朝・隋唐の制度は毎年出る。",
  "古代オリエント・イラン": "<b>令和7で1問と激減</b>。令和6の水準に戻る反動を見込み厚く配置した。",
  "イスラーム世界": "3年とも5問以上で安定。成立期（ヒジュラ・ウマイヤ・アッバース）が核。",
  "宋・元・モンゴル": "令和6・7で各7〜8問。今年も必出。年代整序で問われやすい。",
  "明・清": "<b>令和6・7で計3問と極端に手薄</b>。最も反動が大きいと見て厚く配置した。",
  "大航海・植民地": "令和7で7問と突出。今年は縮小と見て第5問は1問にし、第6問に2問回した。",
  "宗教改革・主権国家": "<b>令和7は1問だけ</b>。ルター・カルヴァン・ウェストファリアで復活を見込む。",
  "絶対王政・市民革命": "毎年3〜7問。ナントの王令とイギリス革命の順序は繰り返し出る。",
  "近現代・テーマ史（選択）": "選択の第6問がこれにあたる。全時代を横断する形なので通史がそのまま効く。"
};
const bunyaTable = `<table class="basis__t">
    <caption>実物の設問を分野別に数え直したもの（令和5は印刷された57問すべて、令和6・7は50問）。
    集計は <code>verify.js</code> が過去問インデックスから機械的に行っている。<br>複数の分野にまたがる設問は、主題のほうに入れて数えた。</caption>
    <thead><tr><th>分野</th>${YEARS.map((y) => `<th>${y}</th>`).join("")}<th>${SET.name}</th><th>判断</th></tr></thead>
    <tbody>${bunya.cats.map((c) => `<tr><th>${c}</th>${
      YEARS.map((y) => `<td>${bunya.bunya[y][c]}</td>`).join("")
    }<td>${bunya.MINE[SET.id - 1][c]}</td><td>${JUDGE[c] || ""}</td></tr>`).join("")}
    <tr class="cover__plan-total"><th>計</th>${
      YEARS.map((y) => `<td>${bunya.bunya[y]["_計"]}</td>`).join("")
    }<td>50</td><td>令和5は選択問題を含めて57問が印刷されている（解答するのは50問）。</td></tr>
    </tbody>
  </table>`;

const FMT = ["年代整序", "略年表", "史料", "図表", "その他"];
const FMTLABEL = {
  "年代整序": "年代整序", "略年表": "略年表（どの時期か）", "史料": "史料",
  "図表": "地図・写真・系図・図表", "その他": "その他（語句・内容正誤・組合せ）"
};
const fmtTable = `<table class="basis__t">
    <caption>形式も過去問インデックスから機械的に数えた。
    年代整序だけは実物より多めにしてある——前後関係の穴が一度に見つかり、練習として効率がよいため。<br>資料つきの年代整序は「図表」に数えている。</caption>
    <thead><tr><th>形式</th>${YEARS.map((y) => `<th>${y}</th>`).join("")}<th>${SET.name}</th></tr></thead>
    <tbody>${FMT.map((k) => `<tr><th>${FMTLABEL[k]}</th>${
      YEARS.map((y) => `<td>${bunya.bunya[y]["_形式"][k]}</td>`).join("")
    }<td>${bunya.myFmtAll[SET.id - 1][k]}</td></tr>`).join("")}
    <tr class="cover__plan-total"><th>計</th>${
      YEARS.map((y) => `<td>${bunya.bunya[y]["_計"]}</td>`).join("")
    }<td>50</td></tr></tbody>
  </table>`;

const dist = [0, 0, 0, 0];
all.forEach((q) => dist[q.a - 1]++);

const body = `
<header class="cover">
  <p class="cover__eyebrow">令和8年度　高等学校 第3学年　9月</p>
  <h1 class="cover__title">基礎学力到達度テスト<br><span>世界史探究　予想問題　${SET.name}</span></h1>
  <p class="cover__meta">${SET.sub}　　試験時間 60分（想定）／100点満点（各問2点）　　作成日 2026年8月24日</p>

  <div class="cover__box">
    <h2>注意事項</h2>
    <ol>
      <li>問題は第1問から第6問まであり、<b>第1問〜第5問は必須問題</b>です。全員が解答してください。</li>
      <li><b>第6問（世界史探究）と第7問（歴史総合）のうち、いずれか1題を選択</b>して解答します。本予想問題には第6問のみを収録しています。</li>
      <li>解答は各問1つだけ選び、解答用紙の該当する番号を塗りつぶしてください。</li>
      <li>解答時間の目安は1問あたり約70秒です。時間を計って解いてください。</li>
    </ol>
  </div>

  <div class="cover__box cover__box--plain">
    <h2>この予想問題について</h2>
    <p>令和5・6・7年度の実物157問（歴史総合の10問を除く）を1問ずつ分析し、<b>大問構成・出題分野・設問形式・難易度の実測値</b>にそろえて作成しました。正解の分布（①${dist[0]}／②${dist[1]}／③${dist[2]}／④${dist[3]}）も実物に近づけてあります。</p>
      <p>各設問の解説には「なぜこの問題を予想したか」を明記しています。<b>的中を保証するものではありません</b>が、過去3年で1度でも出た分野・形式に絞ってあるため、当日の設問と重なる部分は大きいはずです。</p>
      <p><b>${SET.name}のねらい</b>——${SET.note}</p>
      <p>予想問題は第1回・第2回・第3回の3つで一組です。当日どの方向に振れても対応できるよう、
      <b>第1回＝直近の反動、第2回＝傾向の継続、第3回＝取りこぼしと範囲拡大の保険</b>という3つの筋書きに分けてあります。
      3回あわせると、過去3年の実物を解くのに必要な知識の<b>99%以上</b>に触れる計算です。</p>
  </div>

  <table class="cover__plan">
    <caption>大問構成（令和7年度の実物にそろえた）</caption>
    <thead><tr><th>大問</th><th>区分</th><th>分野</th><th>問数</th></tr></thead>
    <tbody>${exam.map((d) => `<tr><th>第${d.no}問</th><td>${d.kind}</td><td>${d.title}</td><td>${d.qs.length}</td></tr>`).join("")}
    <tr class="cover__plan-total"><th>計</th><td>—</td><td>—</td><td>${all.length}</td></tr></tbody>
  </table>
</header>

${exam.map(section).join("")}

<section class="sheetpage">
  <h2 class="pagetitle">解答用紙</h2>
  <p class="lead">正解と思う番号を塗りつぶす。答えを写して丸つけをするのではなく、<b>時間を計って通しで解く</b>ことに意味がある。</p>
  <div class="sheets">${sheetTable(1, 17)}${sheetTable(18, 34)}${sheetTable(35, 50)}</div>
  <p class="sheetpage__score">得点　<span class="blank"></span>　／ 100点　　　　目標 80点</p>
</section>

<section class="keypage">
  <h2 class="pagetitle">正解一覧</h2>
  <div class="keys">${keyTable(1, 26)}${keyTable(27, 50)}</div>
</section>

<section class="answers">
  <h2 class="pagetitle">解説と、予想の根拠</h2>
  ${exam.map((d) => `<h3 class="ansdai">第${d.no}問　${d.title}</h3>${d.qs.map(answer).join("")}`).join("")}
</section>

<section class="basis">
  <h2 class="pagetitle">なぜこの範囲を予想したのか</h2>
  <p class="lead">令和5・6・7年度の実物を分野ごとに数え直したもの。<b>3年連続で出ている分野は今年も出る</b>。そのうえで<b>直近の令和7年度で手薄だった分野</b>は、反動で厚くなりやすい。この2つを掛け合わせて配分を決めた。</p>
  ${bunyaTable}

  <h3 class="basis__h">設問形式の実測と、この予想問題での再現</h3>
  ${fmtTable}

  <h3 class="basis__h">今年ならではの材料</h3>
  <ul class="basis__l">
    <li><b>アメリカ独立宣言から250年（1776→2026）。</b>記念年は資料集や模試で扱われやすく、独立に至る流れを略年表で問う形は令和5でも出ている。問39に配置した。</li>
    <li><b>ムガル帝国の成立から500年（1526→2026）。</b>パーニーパットの戦いとアクバル／アウラングゼーブの対比は、令和6でアウラングゼーブが既出。問24に配置した。</li>
    <li><b>令和7年度から第7問に歴史総合が加わった。</b>世界史探究を選ぶ場合は第6問のテーマ史を解く。第6問は近現代に偏らず全時代を横断する形なので、通史の総復習がそのまま得点になる。</li>
    <li><b>難易度は教科書レベル〜共通テスト相当、奇問は出ない</b>というのが対策塾各社の一致した見方。したがって新奇な題材ではなく、<b>教科書の太字を別角度から問い直す</b>方向で作成した。用語集にしか出ない語が正解の決め手になっていないかは、問題バンクと過去問インデックスに照合して機械的に点検している。</li>
    <li><b>2026年の共通テスト（歴史総合・世界史探究）では、資料を用いた設問が前年の19から35へ大幅に増えた。</b>探究科目は資料読解を求める方向にある。基礎学の図表問題は令和5の9問から令和7の2問へ減っているが、新課程の流れをふまえて、各回とも実物の3年平均（50問あたり5.3問）以上になるよう資料つきの設問を置いた。</li>
  </ul>

  <h3 class="basis__h">直前1か月の使い方</h3>
  <ol class="basis__l basis__l--num">
    <li>まず時間を計って通しで解き、得点を出す。80点に届かなければ、落とした大問がそのまま弱点。</li>
    <li>解説の「予想の根拠」に挙がっている過去問の設問番号を、一問一答アプリの同じ分野でつぶす。</li>
    <li>年代整序で落とした場合は、年号ではなく<b>できごとの前後関係</b>を線で覚え直す。ここが最も配点効率がよい。</li>
    <li>地図・写真・系図は知識ではなく<b>資料集を開く習慣</b>で埋まる。1日5分でよいので図版を眺める。</li>
  </ol>
</section>

<footer class="foot">
  <p>令和5・6・7年度の実物157問の分析にもとづく予想問題。的中を保証するものではない。</p>
  <p class="foot__ver">作成 2026年8月24日／全${all.length}問</p>
</footer>

<button class="printbtn" type="button" onclick="window.print()">印刷する</button>
`;

const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
const out = `<title>基礎学 世界史 九月予想問題${SET.id > 1 ? " " + SET.name : ""}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;600;700&display=swap">
<style>
${css}
</style>
${body}
`;

fs.writeFileSync(path.join(__dirname, SET.out), out);
console.log(SET.name + " 問数:", all.length, "／正解分布 ①②③④ =", dist.join(" "));
console.log("  " + SET.out, Math.round(Buffer.byteLength(out) / 1024) + "KB");
