/* 予想問題の自己点検。node verify.js
   1) 設問データの構造（問数・選択肢・正解番号・重複・図版の参照）
   2) 解説の丸数字が正解の番号を指していないか（回転処理のバグ検出）
   3) 過去問インデックスの分野別集計を計算し、bunya.json に書き出す
   異常があれば終了コード1。 */
const fs = require("fs");
const path = require("path");
const { rotate, CIRCLE } = require("./rotate.js");

const SETS = [
  { id: 1, file: "./data.js",  name: "第1回" },
  { id: 2, file: "./data2.js", name: "第2回" },
  { id: 3, file: "./data3.js", name: "第3回" }
];
SETS.forEach((s) => {
  const m = require(s.file);
  rotate(m.exam);
  s.exam = m.exam; s.fig = m.fig; s.all = m.exam.flatMap((d) => d.qs);
});
const { exam, fig, all } = SETS[0];
const bad = [];
const ng = (n, msg) => bad.push(`問${n}: ${msg}`);

/* ---- 1) 構造 ---- */
SETS.forEach((S) => {
const all = S.all, fig = S.fig;
const ng = (n, msg) => bad.push(`${S.name} 問${n}: ${msg}`);
if (all.length !== 50) bad.push(`${S.name} 問数が ${all.length}（50でない）`);
// 大問の構成が崩れていないか（設問の差し替えで見出しごと消える事故を捕まえる）
const WANT = [8, 8, 8, 8, 8, 10];
if (S.exam.length !== 6) bad.push(`${S.name} 大問が ${S.exam.length}個（6でない）`);
S.exam.forEach((d, k) => {
  if (d.no !== k + 1) bad.push(`${S.name} 大問の番号が飛んでいる（${k + 1}番目が大問${d.no}）`);
  if (WANT[k] !== undefined && d.qs.length !== WANT[k])
    bad.push(`${S.name} 大問${d.no} が ${d.qs.length}問（${WANT[k]}問のはず）`);
  if (!d.lead || !d.title || !d.kind) bad.push(`${S.name} 大問${d.no} の見出しかリード文が欠けている`);
});
all.forEach((q, i) => {
  if (q.n !== i + 1) ng(q.n, `番号が連番でない（${i + 1}番目）`);
  const K = q.nopt || 4;
  if (!Array.isArray(q.c) || q.c.length !== K) ng(q.n, `選択肢が${K}つでない`);
  if (!(q.a >= 1 && q.a <= K)) ng(q.n, `正解番号が不正（${q.a}）`);
  if (new Set(q.c).size !== K) ng(q.n, "選択肢に重複がある");
  if (q.c.some((c) => !c || !c.trim())) ng(q.n, "空の選択肢がある");
  if (!q.q || !q.q.trim()) ng(q.n, "問題文が空");
  if (!q.ex || !q.ex.trim()) ng(q.n, "解説が空");
  if (!q.src || !q.src.trim()) ng(q.n, "予想の根拠が空");
  if (q.ref && /下線部/.test(q.ref)) {
    const L = q.ref.replace(/[^a-h]/g, "");
    if (L && !new RegExp("<sub>" + L + "</sub>").test(S.exam.find((d) => d.qs.includes(q)).lead))
      ng(q.n, `リード文に下線部${L}がない`);
  }
  if (q.ref && /空欄/.test(q.ref)) {
    const dai = S.exam.find((d) => d.qs.includes(q));
    [...q.ref.matchAll(/[Ａ-Ｇ]/g)].forEach((m) => {
      if (!dai.lead.includes(`class="bk">${m[0]}<`)) ng(q.n, `リード文に空欄${m[0]}がない`);
    });
  }
  if (q.figKey && !fig[q.figKey]) ng(q.n, `図版 ${q.figKey} が見つからない`);
  // 選択肢の「①〜④のうちから一つ選べ」は問題文にあるはず
  const tail = K === 6 ? /①〜⑥/ : /①〜④/;
  if (!tail.test(q.q)) ng(q.n, `問題文に「①〜${CIRCLE[K - 1]}のうちから一つ選べ」がない`);
  // 解説の丸数字が正解の番号を指していないか（回転処理のバグ検出）
  [...new Set((q.ex.match(/[①②③④]/g) || []))].forEach((ch) => {
    if (CIRCLE.indexOf(ch) + 1 === q.a) ng(q.n, `解説が正解の ${ch} を誤りとして挙げている`);
  });
});
});

/* ---- 3) 過去問インデックスの集計 ---- */
const r34 = JSON.parse(fs.readFileSync(path.join(__dirname, "kako", "r3r4.json"), "utf8"));
const idx = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "sekaishi-app", "exam-index.json"), "utf8"));

// 実物の設問番号を分野に割り当てる。またぐ設問は主題のほうに入れている。
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ASSIGN = {
  "令和3": {
    "古代ギリシア・ローマ": R(1, 4), "中世西欧・ゲルマン": R(5, 8),
    "古代インド・東南アジア": R(9, 11), "古代〜隋唐の中国": R(12, 15),
    "古代オリエント・イラン": R(16, 19), "イスラーム世界": R(20, 22),
    "宋・元・モンゴル": R(23, 25), "明・清": R(26, 29),
    "大航海・植民地": [30], "宗教改革・主権国家": [31, 32],
    "絶対王政・市民革命": R(33, 36), "近現代・テーマ史（選択）": R(37, 57)
  },
  "令和4": {
    "古代ギリシア・ローマ": R(1, 3), "中世西欧・ゲルマン": R(4, 8),
    "古代インド・東南アジア": R(9, 11), "古代〜隋唐の中国": R(12, 15),
    "古代オリエント・イラン": R(16, 19), "イスラーム世界": R(20, 22),
    "宋・元・モンゴル": R(23, 25), "明・清": R(26, 29),
    "大航海・植民地": [30, 31], "宗教改革・主権国家": [32, 33],
    "絶対王政・市民革命": R(34, 36), "近現代・テーマ史（選択）": R(37, 57)
  },
  "令和5": {
    "古代ギリシア・ローマ": [1, 2, 3, 4],
    "中世西欧・ゲルマン": [5, 6, 7, 8],
    "古代インド・東南アジア": [9, 10, 11],
    "古代〜隋唐の中国": [12, 13, 14, 15],
    "古代オリエント・イラン": [16, 17],
    "イスラーム世界": [18, 19, 20, 21, 22],
    "宋・元・モンゴル": [23, 24, 25],
    "明・清": [26, 27, 28, 29],
    "大航海・植民地": [30, 36],
    "宗教改革・主権国家": [31],
    "絶対王政・市民革命": [32, 33, 34, 35, 37, 38, 39],
    "近現代・テーマ史（選択）": [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57]
  },
  "令和6": {
    "古代ギリシア・ローマ": [4, 45, 46, 47],
    "中世西欧・ゲルマン": [7, 9, 48, 49],
    "古代インド・東南アジア": [13],
    "古代〜隋唐の中国": [10, 11, 12, 14, 15, 16, 17, 42, 43, 44],
    "古代オリエント・イラン": [1, 2, 3, 5, 6, 8],
    "イスラーム世界": [18, 19, 20, 21, 22, 23, 24, 25],
    "宋・元・モンゴル": [26, 27, 28, 29, 30, 31, 32, 33],
    "明・清": [50],
    "大航海・植民地": [],
    "宗教改革・主権国家": [34, 35, 37],
    "絶対王政・市民革命": [38, 39, 40, 41],
    "近現代・テーマ史（選択）": [36]
  },
  "令和7": {
    "古代ギリシア・ローマ": [1, 2, 3, 4, 5, 6, 7, 8],
    "中世西欧・ゲルマン": [41, 44, 45],
    "古代インド・東南アジア": [9, 10, 11, 12],
    "古代〜隋唐の中国": [13, 14, 15, 16],
    "古代オリエント・イラン": [17],
    "イスラーム世界": [18, 19, 20, 21, 22, 23, 24],
    "宋・元・モンゴル": [25, 26, 27, 28, 29, 30, 31],
    "明・清": [32, 50],
    "大航海・植民地": [33, 34, 35, 36, 37, 47, 49],
    "宗教改革・主権国家": [46],
    "絶対王政・市民革命": [38, 39, 40],
    "近現代・テーマ史（選択）": [42, 43, 48]
  }
};

const years = ["令和3", "令和4", "令和5", "令和6", "令和7"];
const idxAll = idx.concat(r34.map((y) => ({ year: y.year, questions: y.questions })));
const cats = Object.keys(ASSIGN["令和7"]);
const bunya = {};
years.forEach((y) => {
  const qs = idxAll.find((x) => x.year === y).questions
    .filter((q) => !/歴史総合/.test(q.topic || ""));
  const nums = qs.map((q) => q.n);
  const assigned = [].concat(...cats.map((c) => ASSIGN[y][c] || []));
  const dup = assigned.filter((n, i) => assigned.indexOf(n) !== i);
  if (dup.length) bad.push(`${y}: 分野の割り当てが重複（設問 ${dup.join(",")}）`);
  const missing = nums.filter((n) => !assigned.includes(n));
  const extra = assigned.filter((n) => !nums.includes(n));
  if (missing.length) bad.push(`${y}: 分野に割り当てられていない設問 ${missing.join(",")}`);
  if (extra.length) bad.push(`${y}: 実在しない設問を割り当てている ${extra.join(",")}`);
  bunya[y] = {};
  cats.forEach((c) => { bunya[y][c] = (ASSIGN[y][c] || []).length; });
  bunya[y]["_計"] = qs.length;

  // 形式の集計（インデックスの topic / type から機械的に）
  const f = (k) => qs.filter((q) => (q.topic || "").includes(k)).length;
  bunya[y]["_形式"] = {
    "年代整序": f("年代整序"),
    "略年表": f("略年表"),
    "史料": f("史料"),
    "図表": qs.filter((q) => q.type === "fig").length
  };
  const fm = bunya[y]["_形式"];
  fm["その他"] = qs.length - fm["年代整序"] - fm["略年表"] - fm["史料"] - fm["図表"];
});

/* 本予想問題の側の集計 */
const MINE = [
  { "古代ギリシア・ローマ":7, "中世西欧・ゲルマン":1, "古代インド・東南アジア":3, "古代〜隋唐の中国":5,
    "古代オリエント・イラン":4, "イスラーム世界":4, "宋・元・モンゴル":4, "明・清":4,
    "大航海・植民地":1, "宗教改革・主権国家":3, "絶対王政・市民革命":4, "近現代・テーマ史（選択）":10 },
  { "古代ギリシア・ローマ":8, "中世西欧・ゲルマン":0, "古代インド・東南アジア":3, "古代〜隋唐の中国":5,
    "古代オリエント・イラン":4, "イスラーム世界":4, "宋・元・モンゴル":5, "明・清":3,
    "大航海・植民地":4, "宗教改革・主権国家":2, "絶対王政・市民革命":2, "近現代・テーマ史（選択）":10 },
  { "古代ギリシア・ローマ":3, "中世西欧・ゲルマン":5, "古代インド・東南アジア":0, "古代〜隋唐の中国":4,
    "古代オリエント・イラン":2, "イスラーム世界":6, "宋・元・モンゴル":4, "明・清":8,
    "大航海・植民地":0, "宗教改革・主権国家":1, "絶対王政・市民革命":7, "近現代・テーマ史（選択）":10 }
];
MINE.forEach((m, i) => {
  const sum = Object.values(m).reduce((s, v) => s + v, 0);
  if (sum !== 50) bad.push(`${SETS[i].name} の分野合計が ${sum}（50でない）`);
  cats.forEach((c) => { if (m[c] === undefined) bad.push(`${SETS[i].name} に分野 ${c} がない`); });
});
const mine = MINE[0];
const mineSum = 50;

/* 設問形式は令和3・4年度の実測（r3r4.json）と同じ物差しで数える。
   ひとつの設問が複数にまたがるときは、上から順に先に当たったものに数える。 */
const FMTS = ["史料", "略年表", "年代整序", "空欄補充", "正誤の組合せ", "メモ・会話", "図版・略地図", "組合せ", "適切でないもの", "語句"];
function classify(f, hasFig) {
  f = f || "";
  if (/史料/.test(f)) return "史料";
  if (/略年表/.test(f)) return "略年表";
  if (/年代整序/.test(f)) return "年代整序";
  if (/空欄補充/.test(f)) return "空欄補充";
  if (/正誤の組合せ/.test(f)) return "正誤の組合せ";
  if (/メモ|会話/.test(f)) return "メモ・会話";
  if (/略地図|図版|図表|地図|系図|資料/.test(f) || hasFig) return "図版・略地図";
  if (/組合せ/.test(f)) return "組合せ";
  if (/適切でない/.test(f)) return "適切でないもの";
  return "語句";
}
const pastFmt = r34.map((y) => {
  const c = {}; FMTS.forEach((k) => { c[k] = 0; });
  y.questions.forEach((q) => { c[classify(q.fmt, false)]++; });
  c._計 = y.questions.length;
  c._6択 = y.questions.filter((q) => q.nopt === 6).length;
  return { year: y.year, c };
});
const myFmtAll = SETS.map((S) => {
  const c = {}; FMTS.forEach((k) => { c[k] = 0; });
  S.all.forEach((q) => { c[classify(q.fmt, !!q.figKey)]++; });
  c._計 = S.all.length;
  c._6択 = S.all.filter((q) => q.nopt === 6).length;
  return c;
});
const myFmt = myFmtAll[0];

const distAll = SETS.map((S) => { const d = [0, 0, 0, 0, 0, 0]; S.all.forEach((q) => d[q.a - 1]++); return d; });
const dist = distAll[0];

/* 正解の選択肢だけが長いと「長いものを選べば当たる」ようになる。
   見分けがつくのは字数差なので、順位ではなく差で見る。 */
const lenGap = SETS.map((S) => S.all.map((q) => {
  const len = q.c.map((c) => c.replace(/<[^>]+>/g, "").length);
  return len[q.a - 1] - Math.max(...len.filter((_, j) => j !== q.a - 1));
}));
const lenStat = lenGap.map((g) => ({
  longest: g.filter((m) => m > 0).length,
  big: g.filter((m) => m >= 5).length,
  avg: g.reduce((a, b) => a + b, 0) / g.length
}));
lenStat.forEach((st, i) => {
  if (st.avg > 2.5) bad.push(`${SETS[i].name} は正解が平均 ${st.avg.toFixed(1)} 字長い（長さで当てられる）`);
  if (st.big > 3) bad.push(`${SETS[i].name} は正解が5字以上長い設問が ${st.big}問`);
});
const longest = lenStat.map((s) => s.longest);

/* 過去問の必要知識をどれだけ覆えているか */
const norm = (s) => s.replace(/[=＝]/g, "=");
const setText = SETS.map((S) => norm(S.exam.flatMap((d) => d.qs)
  .map((q) => q.q + " " + q.c.join(" ") + " " + q.ex + " " + (q.figKey ? S.fig[q.figKey] : ""))
  .join(" ").replace(/<[^>]+>/g, "")));
const allText = setText.join(" ");
const need = new Map();
years.forEach((y) => {
  idxAll.find((x) => x.year === y).questions.forEach((q) => {
    if (/歴史総合/.test(q.topic || "")) return;
    // 令和3〜5は大問Ⅶ・Ⅷが選択の近現代・テーマ史。令和7型では必須の範囲外なので除く
    if (["令和3", "令和4", "令和5"].includes(y) && q.n > 43) return;
    (q.need || []).forEach((t) => {
      if (!need.has(t)) need.set(t, []);
      need.get(t).push(y.slice(2) + "-" + q.n);
    });
  });
});
const missTerms = [...need.keys()].filter((t) => !allText.includes(norm(t)));
const perSet = setText.map((t) => [...need.keys()].filter((k) => t.includes(norm(k))).length);
const coverage = { total: need.size, covered: need.size - missTerms.length, perSet, miss: missTerms };

fs.writeFileSync(path.join(__dirname, "bunya.json"),
  JSON.stringify({ cats, bunya, mine: MINE[0], MINE, myFmt, myFmtAll, pastFmt, FMTS, dist, distAll, coverage, lenStat }, null, 2));

/* ---- 報告 ---- */
console.log("■ 設問データ");
SETS.forEach((S, i) => {
  console.log(`  ${S.name}  ${S.all.length}問 ／ 正解分布 ①${distAll[i][0]} ②${distAll[i][1]} ③${distAll[i][2]} ④${distAll[i][3]}`
    + ` ／ 正解が最長 ${longest[i]}問・5字以上長い ${lenStat[i].big}問・平均差 ${lenStat[i].avg.toFixed(1)}字`);
});
console.log("\n■ 過去問の必要知識のカバー（令和7型の出題範囲、" + coverage.total + "語）");
SETS.forEach((S, i) => console.log(`  ${S.name}のみ  ${coverage.perSet[i]}語（${Math.round(coverage.perSet[i] / coverage.total * 100)}%）`));
console.log(`  3回あわせて  ${coverage.covered}語（${Math.round(coverage.covered / coverage.total * 100)}%）`);
if (coverage.miss.length) console.log("  未カバー: " + coverage.miss.join(" / "));
console.log("\n■ 過去問の分野別（実測）と本問題の配分");
console.log("  " + "分野".padEnd(24) + years.map((y) => y.padStart(6)).join("") + "  本問題");
cats.forEach((c) => {
  console.log("  " + c.padEnd(22) + years.map((y) => String(bunya[y][c]).padStart(4)).join("") + " ｜"
    + MINE.map((m) => String(m[c]).padStart(4)).join(""));
});
console.log("  " + "計".padEnd(22) + years.map((y) => String(bunya[y]["_計"]).padStart(4)).join("") + " ｜  50  50  50");
console.log("\n■ 設問形式（令和3・4は実測。令和5〜7は形式の記録がないため掲載しない）");
console.log("  " + "形式".padEnd(16) + "令和3 令和4  ｜  1回  2回  3回");
FMTS.forEach((k) => {
  console.log("  " + k.padEnd(16)
    + pastFmt.map((p) => String(p.c[k]).padStart(5)).join("") + "  ｜"
    + myFmtAll.map((m) => String(m[k]).padStart(4)).join(""));
});
console.log("  " + "うち6択".padEnd(16)
  + pastFmt.map((p) => String(p.c._6択).padStart(5)).join("") + "  ｜"
  + myFmtAll.map((m) => String(m._6択).padStart(4)).join(""));
console.log("  " + "計".padEnd(16)
  + pastFmt.map((p) => String(p.c._計).padStart(5)).join("") + "  ｜"
  + myFmtAll.map((m) => String(m._計).padStart(4)).join(""));

console.log("\n■ 点検結果");
if (bad.length) { bad.forEach((b) => console.log("  NG  " + b)); }
else console.log("  すべて問題なし");
process.exit(bad.length ? 1 : 0);
