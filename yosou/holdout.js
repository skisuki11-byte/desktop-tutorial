/* 本当の検証：令和3・4年度を一度も見ずに書いた版（commit ada3151）が、
   その令和3・4をどれだけ当てていたか。これは未知の2年に対する実測の的中率になる。 */
const fs = require("fs"), path = require("path");
const H = "/tmp/claude-0/-home-user-desktop-tutorial/a40c5c31-69bb-58e9-9093-e889fc874e99/scratchpad/holdout";
const { rotate } = require(H + "/rotate.js");
const r34 = JSON.parse(fs.readFileSync(path.join(__dirname, "kako", "r3r4.json"), "utf8"));
const norm = (s) => s.replace(/[=＝]/g, "=");

let text = "";
for (const f of ["data.js", "data2.js", "data3.js"]) {
  const m = require(H + "/" + f);
  rotate(m.exam);
  text += m.exam.map((d) => d.lead + " " + d.qs.map((q) =>
    q.q + " " + q.c.join(" ") + " " + q.ex + " " + (q.figKey ? m.fig[q.figKey] : "")).join(" ")).join(" ");
}
text = norm(text.replace(/<[^>]+>/g, ""));

console.log("■ 令和3・4を見ずに書いた版（150問）で、令和3・4の実物を解けるか");
console.log("  ※ 令和7型の出題範囲にそろえ、選択の大問Ⅶ・Ⅷ（問44以降）は除く\n");
console.log("  " + "年度".padEnd(6) + "設問  全部わかる  一部わかる  手がかりなし   語のカバー率");
let sumFull = 0, sumPart = 0, sumNone = 0, sumN = 0, cov = 0, tot = 0;
r34.forEach((y) => {
  const qs = y.questions.filter((q) => q.n <= 43);
  let full = 0, part = 0, none = 0;
  qs.forEach((q) => {
    const need = (q.need || []).map(norm);
    if (!need.length) { part++; return; }
    const hit = need.filter((t) => text.includes(t)).length;
    tot += need.length; cov += hit;
    if (hit === need.length) full++; else if (hit > 0) part++; else none++;
  });
  sumFull += full; sumPart += part; sumNone += none; sumN += qs.length;
  console.log(`  ${y.year.padEnd(6)}${String(qs.length).padStart(3)}問${String(full).padStart(8)}問${String(part).padStart(9)}問${String(none).padStart(10)}問`);
});
console.log(`  ${"合計".padEnd(6)}${String(sumN).padStart(3)}問${String(sumFull).padStart(8)}問${String(sumPart).padStart(9)}問${String(sumNone).padStart(10)}問${(cov / tot * 100).toFixed(0).padStart(12)}%`);
console.log(`\n  割合   全部わかる ${(sumFull / sumN * 100).toFixed(0)}%  ／  一部わかる ${(sumPart / sumN * 100).toFixed(0)}%  ／  手がかりなし ${(sumNone / sumN * 100).toFixed(0)}%`);
module.exports = { full: sumFull / sumN, part: sumPart / sumN, none: sumNone / sumN, n: sumN };
