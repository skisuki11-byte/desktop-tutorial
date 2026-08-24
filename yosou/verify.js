/* 予想問題の自己点検。node verify.js
   1) 設問データの構造（問数・選択肢・正解番号・重複・図版の参照）
   2) 解説の丸数字が正解の番号を指していないか（回転処理のバグ検出）
   3) 過去問インデックスの分野別集計を計算し、bunya.json に書き出す
   異常があれば終了コード1。 */
const fs = require("fs");
const path = require("path");
const { exam, fig } = require("./data.js");
const { rotate, CIRCLE } = require("./rotate.js");

rotate(exam);
const all = exam.flatMap((d) => d.qs);
const bad = [];
const ng = (n, msg) => bad.push(`問${n}: ${msg}`);

/* ---- 1) 構造 ---- */
if (all.length !== 50) bad.push(`問数が ${all.length}（50でない）`);
all.forEach((q, i) => {
  if (q.n !== i + 1) ng(q.n, `番号が連番でない（${i + 1}番目）`);
  if (!Array.isArray(q.c) || q.c.length !== 4) ng(q.n, "選択肢が4つでない");
  if (!(q.a >= 1 && q.a <= 4)) ng(q.n, `正解番号が不正（${q.a}）`);
  if (new Set(q.c).size !== 4) ng(q.n, "選択肢に重複がある");
  if (q.c.some((c) => !c || !c.trim())) ng(q.n, "空の選択肢がある");
  if (!q.q || !q.q.trim()) ng(q.n, "問題文が空");
  if (!q.ex || !q.ex.trim()) ng(q.n, "解説が空");
  if (!q.src || !q.src.trim()) ng(q.n, "予想の根拠が空");
  if (q.figKey && !fig[q.figKey]) ng(q.n, `図版 ${q.figKey} が見つからない`);
  // 選択肢の「①〜④のうちから一つ選べ」は問題文にあるはず
  if (!/①〜④/.test(q.q)) ng(q.n, "問題文に「①〜④のうちから一つ選べ」がない");
});

/* ---- 2) 解説の丸数字が正解を指していないか ---- */
all.forEach((q) => {
  const refs = [...new Set((q.ex.match(/[①②③④]/g) || []))];
  refs.forEach((ch) => {
    if (CIRCLE.indexOf(ch) + 1 === q.a) ng(q.n, `解説が正解の ${ch} を誤りとして挙げている`);
  });
});

/* ---- 3) 過去問インデックスの集計 ---- */
const idx = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "sekaishi-app", "exam-index.json"), "utf8"));

// 実物の設問番号を分野に割り当てる。またぐ設問は主題のほうに入れている。
const ASSIGN = {
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

const years = ["令和5", "令和6", "令和7"];
const cats = Object.keys(ASSIGN["令和7"]);
const bunya = {};
years.forEach((y) => {
  const qs = idx.find((x) => x.year === y).questions
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
const mine = {};
cats.forEach((c) => { mine[c] = 0; });
const MINE_RANGE = {
  "古代ギリシア・ローマ": [1, 7], "中世西欧・ゲルマン": [8, 8],
  "古代インド・東南アジア": [9, 11], "古代〜隋唐の中国": [12, 16],
  "古代オリエント・イラン": [17, 20], "イスラーム世界": [21, 24],
  "宋・元・モンゴル": [25, 28], "明・清": [29, 32],
  "大航海・植民地": [33, 33], "宗教改革・主権国家": [34, 36],
  "絶対王政・市民革命": [37, 40], "近現代・テーマ史（選択）": [41, 50]
};
Object.entries(MINE_RANGE).forEach(([c, [a, b]]) => { mine[c] = b - a + 1; });
const mineSum = Object.values(mine).reduce((s, v) => s + v, 0);
if (mineSum !== 50) bad.push(`本問題の分野合計が ${mineSum}（50でない）`);

const myFmt = {};
all.forEach((q) => {
  const k = q.fmt === "地図" || q.fmt === "図表" || q.fmt === "系図" ? "図表"
    : (q.fmt === "年代整序" || q.fmt === "略年表" || q.fmt === "史料") ? q.fmt : "その他";
  myFmt[k] = (myFmt[k] || 0) + 1;
});
["年代整序", "略年表", "史料", "図表", "その他"].forEach((k) => { myFmt[k] = myFmt[k] || 0; });

const dist = [0, 0, 0, 0];
all.forEach((q) => dist[q.a - 1]++);

fs.writeFileSync(path.join(__dirname, "bunya.json"),
  JSON.stringify({ cats, bunya, mine, myFmt, dist }, null, 2));

/* ---- 報告 ---- */
console.log("■ 設問データ");
console.log(`  問数 ${all.length} ／ 正解分布 ①${dist[0]} ②${dist[1]} ③${dist[2]} ④${dist[3]}`);
const fmtCount = {};
all.forEach((q) => { const k = q.fmt || "語句・内容正誤"; fmtCount[k] = (fmtCount[k] || 0) + 1; });
console.log("  形式 " + Object.entries(fmtCount).map(([k, v]) => `${k}${v}`).join(" / "));
console.log("\n■ 過去問の分野別（実測）と本問題の配分");
console.log("  " + "分野".padEnd(24) + years.map((y) => y.padStart(6)).join("") + "  本問題");
cats.forEach((c) => {
  console.log("  " + c.padEnd(24) + years.map((y) => String(bunya[y][c]).padStart(6)).join("") + String(mine[c]).padStart(7));
});
console.log("  " + "計".padEnd(24) + years.map((y) => String(bunya[y]["_計"]).padStart(6)).join("") + String(mineSum).padStart(7));
console.log("\n■ 形式（実測）");
["年代整序", "略年表", "史料", "図表", "その他"].forEach((k) => {
  console.log("  " + k.padEnd(24) + years.map((y) => String(bunya[y]["_形式"][k]).padStart(6)).join("") + String(myFmt[k]).padStart(7));
});

console.log("\n■ 点検結果");
if (bad.length) { bad.forEach((b) => console.log("  NG  " + b)); }
else console.log("  すべて問題なし");
process.exit(bad.length ? 1 : 0);
