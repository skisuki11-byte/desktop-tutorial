/* 何点取れそうかの見積もり。node 点数の見積もり.js
   考え方は「予想が当たったつもりで数える」のではなく、実際に外れた年で測る：
   令和3・4年度を一度も見ずに書いた版（commit ada3151）を取り出し、
   その版が令和3・4の実物86問をどれだけ解けたかを数える。
   これは未知の年に対する実測なので、令和8年度の見積もりの土台にできる。 */

const fs = require("fs"), path = require("path");
const H = "/tmp/claude-0/-home-user-desktop-tutorial/a40c5c31-69bb-58e9-9093-e889fc874e99/scratchpad/holdout";
const { rotate } = require(H + "/rotate.js");
const r34 = JSON.parse(fs.readFileSync(path.join(__dirname, "kako", "r3r4.json"), "utf8"));
const norm = (s) => s.replace(/[=＝]/g, "=");
let text = "";
for (const f of ["data.js", "data2.js", "data3.js"]) {
  const m = require(H + "/" + f); rotate(m.exam);
  text += m.exam.map((d) => d.lead + " " + d.qs.map((q) =>
    q.q + " " + q.c.join(" ") + " " + q.ex + " " + (q.figKey ? m.fig[q.figKey] : "")).join(" ")).join(" ");
}
const dataDir = path.join(__dirname, "..", "sekaishi-app", "data");
text = norm((text + fs.readdirSync(dataDir).filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(path.join(dataDir, f), "utf8")).join(" ")).replace(/<[^>]+>/g, ""));

/* 形式ごとの係数
   boost … 必要知識のうち、実際に正解にたどりつくのに要る割合の逆数
   （正しいものを選ぶ設問は正解の選択肢さえ分かればよいので大きい）*/
const K = {
  "語句":           { boost: 1.5, exp: 0.8 },
  "空欄補充":       { boost: 1.1, exp: 0.9 },
  "正誤の組合せ":   { boost: 1.0, exp: 1.0 },
  "年代整序":       { boost: 1.0, exp: 1.1 },
  "組合せ":         { boost: 1.0, exp: 0.9 },
  "適切でないもの": { boost: 0.9, exp: 1.0 },
  "史料":           { boost: 1.2, exp: 0.9 },
  "略年表":         { boost: 1.2, exp: 0.9 },
  "図版・略地図":   { boost: 1.2, exp: 0.9 }
};
function cls(f) {
  f = f || "";
  if (/史料/.test(f)) return "史料";
  if (/略年表/.test(f)) return "略年表";
  if (/年代整序/.test(f)) return "年代整序";
  if (/空欄補充/.test(f)) return "空欄補充";
  if (/正誤の組合せ/.test(f)) return "正誤の組合せ";
  if (/略地図|図版|図表/.test(f)) return "図版・略地図";
  if (/組合せ/.test(f)) return "組合せ";
  if (/適切でない/.test(f)) return "適切でないもの";
  return "語句";
}
const rows = [];
r34.forEach((y) => y.questions.filter((q) => q.n <= 43).forEach((q) => {
  const need = (q.need || []).map(norm);
  rows.push({ y: y.year, r: need.length ? need.filter((t) => text.includes(t)).length / need.length : 0.5,
              c: cls(q.fmt), nopt: q.nopt || 4 });
}));

function score(ret, shikaku, only) {
  let s = 0, det = {}, cnt = 0;
  (only ? rows.filter((x) => x.y === only) : rows).forEach((x) => {
    cnt++;
    const k = K[x.c], base = x.nopt === 6 ? 1 / 6 : 1 / 4;
    let q = base + (1 - base) * Math.pow(Math.min(1, x.r * ret * k.boost), k.exp);
    if (x.c === "図版・略地図") q = shikaku ? Math.max(q, 0.5 + 0.4 * ret) : Math.min(q, 0.45);
    s += q;
    (det[x.c] = det[x.c] || []).push(q);
  });
  return { pt: s / cnt * 100, det };
}
console.log("■ 予想点（予想問題150問＋一問一答アプリ434問。1問2点／100点満点）");
console.log("  " + "定着率".padEnd(12) + "資料集もやる    資料集をやらない");
[[1.0, "100%（完璧）"], [0.9, "90%"], [0.85, "85%"], [0.8, "80%"], [0.7, "70%"], [0.6, "60%"]].forEach(([r, l]) => {
  console.log("  " + l.padEnd(14) + (score(r, true).pt.toFixed(0) + "点").padStart(6) + (score(r, false).pt.toFixed(0) + "点").padStart(16));
});
const d = score(0.9, true).det;
console.log("\n■ 定着率90%・資料集ありのとき、形式ごとの取れ方");
Object.entries(d).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) =>
  console.log("  " + k.padEnd(14) + String(v.length).padStart(2) + "問中の正答率 " + (v.reduce((a, b) => a + b, 0) / v.length * 100).toFixed(0) + "%"));

console.log("\n■ 年度ごとのばらつき（定着率90%・資料集あり）");
["令和3","令和4"].forEach((y)=>console.log("  "+y+"を解いたら  "+score(0.9,true,y).pt.toFixed(0)+"点"));
