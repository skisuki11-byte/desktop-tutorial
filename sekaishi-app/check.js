/* 問題データの検算。node check.js で実行する。
   選択肢の数・正解インデックス・「こたえ」と正解選択肢の一致・id の重複を見る。 */
const fs = require("fs");
const path = require("path");

global.window = {};
const dir = path.join(__dirname, "data");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
files.forEach((f) => eval(fs.readFileSync(path.join(dir, f), "utf8")));

const data = global.window.SEKAISHI;
const errors = [];
const ids = new Set();
let total = 0;
const byChapter = {};
const byType = { qa: 0, mc: 0 };
const byLevel = { 1: 0, 2: 0, 3: 0 };

Object.keys(data).forEach((key) => {
  byChapter[key] = data[key].length;
  data[key].forEach((it) => {
    total++;
    const at = `${key}/${it.id}`;
    if (ids.has(it.id)) errors.push(`${at}: id が重複`);
    ids.add(it.id);
    ["id", "q", "a", "e"].forEach((f) => {
      if (!it[f] || typeof it[f] !== "string") errors.push(`${at}: ${f} が空`);
    });
    if (!Array.isArray(it.c) || it.c.length !== 4) errors.push(`${at}: 選択肢が4つでない`);
    if (typeof it.ans !== "number" || it.ans < 0 || it.ans > 3) errors.push(`${at}: ans が範囲外`);
    if (Array.isArray(it.c)) {
      if (new Set(it.c).size !== it.c.length) errors.push(`${at}: 選択肢が重複`);
      if (it.c[it.ans] !== it.a) errors.push(`${at}: こたえ「${it.a}」が正解選択肢「${it.c[it.ans]}」と一致しない`);
    }
    if (it.t !== "qa" && it.t !== "mc") errors.push(`${at}: t が qa/mc でない`);
    else byType[it.t]++;
    if (![1, 2, 3].includes(it.lv)) errors.push(`${at}: lv が 1-3 でない`);
    else byLevel[it.lv]++;
    if (it.e && it.e.length < 30) errors.push(`${at}: 解説が短すぎる（${it.e.length}字）`);
  });
});

console.log("章ごとの問題数:", byChapter);
console.log("合計:", total, "問　形式:", byType, "　難易度:", byLevel);
if (errors.length) {
  console.log("\n" + errors.length + " 件の問題:");
  errors.forEach((e) => console.log("  - " + e));
  process.exit(1);
}
console.log("\n検算OK");
