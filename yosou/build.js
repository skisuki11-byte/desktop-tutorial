/* data.js から印刷用の予想問題（A4）を組み立てる。node build.js で yosou.html を書き出す。 */
const fs = require("fs");
const path = require("path");
const { exam, fig } = require("./data.js");

/* --- 正解の偏りをならす -------------------------------------------------
   手で作ると正解が①に寄る。選択肢を回転させて①〜④に均等に散らす。
   解説の中の丸数字も同じだけずらす。ア〜エを選ぶ略年表の問題は並びに
   意味があるので回転させない。 */
const CIRCLE = "①②③④";
const pattern = [1, 3, 2, 4, 2, 1, 4, 3];
let pi = 0;
for (const dai of exam) {
  for (const q of dai.qs) {
    if (q.fmt === "略年表") continue;
    const target = pattern[pi++ % pattern.length];
    const k = (target - q.a + 4) % 4;
    if (k) {
      const rotated = new Array(4);
      q.c.forEach((v, i) => { rotated[(i + k) % 4] = v; });
      q.c = rotated;
      q.a = target;
      q.ex = q.ex.replace(/[①②③④]/g, (ch) => CIRCLE[(CIRCLE.indexOf(ch) + k) % 4]);
    }
  }
}

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

const dist = [0, 0, 0, 0];
all.forEach((q) => dist[q.a - 1]++);

const body = `
<header class="cover">
  <p class="cover__eyebrow">令和8年度　高等学校 第3学年　9月</p>
  <h1 class="cover__title">基礎学力到達度テスト<br><span>世界史探究　予想問題</span></h1>
  <p class="cover__meta">試験時間 60分（想定）／100点満点（各問2点）　　作成日 2026年8月24日</p>

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
      <p>各設問の解説には「なぜこの問題を予想したか」を明記しています。<b>的中を保証するものではありません</b>が、過去3年で1度でも出た分野・形式に絞り、直近年度で手薄だったところを厚くしてあるため、当日の設問と重なる部分は大きいはずです。</p>
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
  <table class="basis__t">
    <caption>実物の設問を分野別に数え直したもの（令和5は印刷された57問すべて、令和6・7は50問）</caption>
    <thead><tr><th>分野</th><th>令和5</th><th>令和6</th><th>令和7</th><th>本問題<br>第1〜5問</th><th>判断</th></tr></thead>
    <tbody>
      <tr><th>古代ギリシア・ローマ</th><td>4</td><td>4</td><td>8</td><td>7</td><td>令和7で8問と突出し、第1問の中心。今年も最大の山と見る。</td></tr>
      <tr><th>中世西欧・ゲルマン</th><td>4</td><td>4</td><td>3</td><td>1</td><td>毎年3〜4問。第1問の末尾と第6問に分けて配置した。</td></tr>
      <tr><th>古代インド・東南アジア</th><td>3</td><td>1</td><td>4</td><td>3</td><td>ヴァルナ制と王朝の都が軸。東南アジアは令和5以来なく、復活を見込む。</td></tr>
      <tr><th>古代〜隋唐の中国</th><td>4</td><td>9</td><td>4</td><td>5</td><td>秦漢・魏晋南北朝・隋唐は毎年。土地制度と官吏登用が繰り返し出る。</td></tr>
      <tr><th>古代オリエント・イラン</th><td>2</td><td>6</td><td>1</td><td>4</td><td><b>令和7で1問と激減</b>。令和6の水準に戻る反動を見込み厚く配置した。</td></tr>
      <tr><th>イスラーム世界</th><td>5</td><td>8</td><td>7</td><td>4</td><td>3年とも5問以上で安定。成立期（ヒジュラ・ウマイヤ・アッバース）が核。</td></tr>
      <tr><th>宋・元・モンゴル</th><td>3</td><td>8</td><td>7</td><td>4</td><td>令和6・7で各7〜8問。今年も必出。年代整序で問われやすい。</td></tr>
      <tr><th>明・清</th><td>4</td><td>1</td><td>2</td><td>4</td><td><b>令和6・7で計3問と極端に手薄</b>。最も反動が大きいと見て厚く配置した。</td></tr>
      <tr><th>大航海・ラテンアメリカ</th><td>1</td><td>1</td><td>7</td><td>1</td><td>令和7で7問と突出。今年は縮小と見て、第5問は1問、第6問に2問回した。</td></tr>
      <tr><th>宗教改革・主権国家</th><td>1</td><td>4</td><td>2</td><td>3</td><td>令和7でほぼ空白。ルター・カルヴァン・ウェストファリアで復活を見込む。</td></tr>
      <tr><th>絶対王政・市民革命</th><td>8</td><td>3</td><td>2</td><td>4</td><td>2年続けて縮小。ナントの王令とイギリス革命の順序は繰り返し出る。</td></tr>
      <tr class="cover__plan-total"><th>近現代・テーマ史（選択）</th><td>18</td><td>1</td><td>3</td><td>10</td><td>選択の第6問がこれにあたる。全時代を横断する形なので通史がそのまま効く。</td></tr>
    </tbody>
  </table>

  <h3 class="basis__h">設問形式の実測と、この予想問題での再現</h3>
  <table class="basis__t">
    <caption>形式は過去問インデックスから機械的に数えた。「その他」は語句・内容正誤・組合せの4択。<br>年代整序だけは実物より多めにしてある——前後関係の穴が一度に見つかり、練習として効率がよいため。</caption>
    <thead><tr><th>形式</th><th>令和5</th><th>令和6</th><th>令和7</th><th>本問題</th></tr></thead>
    <tbody>
      <tr><th>年代整序</th><td>5</td><td>1</td><td>0</td><td>7</td></tr>
      <tr><th>略年表（どの時期か）</th><td>1</td><td>0</td><td>2</td><td>2</td></tr>
      <tr><th>史料</th><td>2</td><td>1</td><td>1</td><td>1</td></tr>
      <tr><th>地図・写真・系図・図表</th><td>9</td><td>5</td><td>2</td><td>4</td></tr>
      <tr><th>その他（語句・内容正誤・組合せ）</th><td>40</td><td>43</td><td>45</td><td>36</td></tr>
      <tr class="cover__plan-total"><th>計</th><td>57</td><td>50</td><td>50</td><td>50</td></tr>
    </tbody>
  </table>

  <h3 class="basis__h">今年ならではの材料</h3>
  <ul class="basis__l">
    <li><b>アメリカ独立宣言から250年（1776→2026）。</b>記念年は資料集や模試で扱われやすく、独立に至る流れを略年表で問う形は令和5でも出ている。問39に配置した。</li>
    <li><b>ムガル帝国の成立から500年（1526→2026）。</b>パーニーパットの戦いとアクバル／アウラングゼーブの対比は、令和6でアウラングゼーブが既出。問24に配置した。</li>
    <li><b>令和7年度から第7問に歴史総合が加わった。</b>世界史探究を選ぶ場合は第6問のテーマ史を解く。第6問は近現代に偏らず全時代を横断する形なので、通史の総復習がそのまま得点になる。</li>
    <li><b>難易度は教科書レベル〜共通テスト相当、奇問は出ない</b>というのが対策塾各社の一致した見方。したがって新奇な題材ではなく、<b>教科書の太字を別角度から問い直す</b>方向で作成した。</li>
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
const out = `<title>基礎学 世界史 九月予想問題</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;600;700&display=swap">
<style>
${css}
</style>
${body}
`;

fs.writeFileSync(path.join(__dirname, "yosou.html"), out);
console.log("問数:", all.length, "／正解分布 ①②③④ =", dist.join(" "));
console.log("yosou.html", Math.round(Buffer.byteLength(out) / 1024) + "KB");
