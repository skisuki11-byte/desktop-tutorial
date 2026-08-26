/* 年代整序を実物どおり6択にする。ア〜ウの並べ方6通りを決まった順に並べ、
   いまの正解の並びがどこに来るかを求めて a を付け替える。 */
const fs = require("fs");
const PERMS = ["ア→イ→ウ", "ア→ウ→イ", "イ→ア→ウ", "イ→ウ→ア", "ウ→ア→イ", "ウ→イ→ア"];

for (const file of ["data.js", "data2.js", "data3.js"]) {
  let src = fs.readFileSync(file, "utf8");
  const { exam } = require("./" + file);
  let n = 0;
  exam.flatMap((d) => d.qs).forEach((q) => {
    if (!/年代整序/.test(q.fmt || "")) return;
    const correct = q.c[q.a - 1].replace(/<[^>]+>/g, "").trim();
    const idx = PERMS.indexOf(correct);
    if (idx < 0) { console.log("  ！並びを読めない", file, "問" + q.n, correct); return; }
    // ソース中の該当する c:[...] を6択に差し替える
    const oldArr = "c:[" + q.c.map((x) => JSON.stringify(x)).join(",") + "], a:" + q.a;
    const newArr = "c:[" + PERMS.map((x) => JSON.stringify(x)).join(",") + "], a:" + (idx + 1) + ", nopt:6";
    if (src.indexOf(oldArr) < 0) { console.log("  ！置換できない", file, "問" + q.n); return; }
    src = src.replace(oldArr, newArr);
    n++;
  });
  fs.writeFileSync(file, src);
  console.log(file, "年代整序", n, "問を6択にした");
}
