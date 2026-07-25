/* 過去問カバレッジ監査。node coverage.js で実行。
   令和5・6・7の実物（全28ページ）を1問ずつ読み、各設問を解くのに必要な知識を key に書き出した。
   その知識が問題バンク（q + a + e の本文）に含まれているかを機械的に照合し、
   「このアプリを仕上げたら本番で何点取れるか」を見積もる。

   type: "text"=文章題（アプリで完全に対応できる）
         "fig" =地図・写真・系図（アプリでは知識までしか対応できない）
   need: すべて含まれていれば「対応」。1つでも欠ければ「穴」。 */
const fs = require("fs");
const path = require("path");

global.window = {};
const dir = path.join(__dirname, "data");
fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()
  .forEach((f) => eval(fs.readFileSync(path.join(dir, f), "utf8")));
const DATA = global.window.SEKAISHI;

const HAY = [];
Object.keys(DATA).forEach((k) => DATA[k].forEach((it) => {
  HAY.push({ ch: k, id: it.id, text: it.q + " " + it.a + " " + it.c.join(" ") + " " + it.e });
}));
const has = (term) => HAY.some((h) => h.text.includes(term));

const EXAM = require("./exam-index.json");

let total = 0, ok = 0, figTotal = 0, figOk = 0;
const holes = [];
const perYear = {};

EXAM.forEach((y) => {
  perYear[y.year] = { total: 0, ok: 0 };
  y.questions.forEach((q) => {
    if (q.skip) return; // 歴史総合（履修が世界史探究のため解かない）
    total++;
    perYear[y.year].total++;
    if (q.type === "fig") figTotal++;
    const missing = q.need.filter((t) => !has(t));
    if (!missing.length) {
      ok++;
      perYear[y.year].ok++;
      if (q.type === "fig") figOk++;
    } else {
      holes.push(`${y.year} 問${q.n} [${q.type}] ${q.topic} — 未収録: ${missing.join(" / ")}`);
    }
  });
});

const pct = (a, b) => Math.round((a / b) * 1000) / 10;
console.log("=== 過去問カバレッジ監査 ===");
console.log(`問題バンク: ${HAY.length} 問`);
Object.keys(perYear).forEach((y) => {
  const p = perYear[y];
  console.log(`  ${y}: ${p.ok}/${p.total} 問に対応  (${pct(p.ok, p.total)}%)`);
});
console.log(`合計: ${ok}/${total} 問に対応  (${pct(ok, total)}%)`);
console.log(`うち図表問題（地図・写真・系図）: ${figOk}/${figTotal} 問は知識面では対応`);
console.log(`※図表問題は資料集での確認が別途必要。図表を全部落とすと ${pct(ok - figTotal, total)}% まで下がる`);

if (holes.length) {
  console.log(`\n=== 穴 (${holes.length}件) ===`);
  holes.forEach((h) => console.log("  - " + h));
} else {
  console.log("\n穴なし");
}
