/* 1) 固有名詞にしぼったレベル感の点検
   2) 「明らかに捨てられる誤答」の検出。実物の誤答は、正しい記述の一部を
      すり替えたものが中心で、全否定・全称の断定は多くない。そういう選択肢が
      1問に2つ以上あると実質2択になり、練習にならない。 */
const fs = require("fs"), path = require("path");
const { rotate } = require("./rotate.js");
const idx = fs.readFileSync(path.join(__dirname, "..", "sekaishi-app", "exam-index.json"), "utf8");
const dataDir = path.join(__dirname, "..", "sekaishi-app", "data");
const bank = fs.readdirSync(dataDir).filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(path.join(dataDir, f), "utf8")).join("\n");
const known = (bank + idx).replace(/[=＝]/g, "=");
const strip = (s) => s.replace(/<[^>]+>/g, "");
const norm = (s) => s.replace(/[=＝]/g, "=");

function proper(text) {
  const out = new Set();
  (text.match(/[『「][^』」]{2,20}[』」]/g) || []).forEach((t) => out.add(t.slice(1, -1)));
  (text.match(/[ァ-ヶー＝=・]{4,}/g) || []).forEach((t) => {
    const c = t.replace(/^[・＝=ー]+|[・＝=ー]+$/g, "");
    if (c.length >= 4) out.add(c);
  });
  return out;
}

// 全否定・全称の言い回し。知識がなくても「言い過ぎ」と分かって捨てられる
const WEAK = /(まったく|一切|一度も|すべて|全面的に|最後まで|決して|存在しなかった|行わなかった|なかった。|禁じられた。|限られ)/;

const SETS = [["第1回", "./data.js"], ["第2回", "./data2.js"], ["第3回", "./data3.js"]];
const unknown = new Map(), weakRows = [];

SETS.forEach(([name, file]) => {
  const { exam } = require(file);
  rotate(exam);
  exam.flatMap((d) => d.qs).forEach((q) => {
    [["問題文", q.q], ["正解", q.c[q.a - 1]]].forEach(([where, txt]) => {
      [...proper(strip(txt))].filter((t) => !known.includes(norm(t))).forEach((t) => {
        if (!unknown.has(t)) unknown.set(t, []);
        unknown.get(t).push(`${name}問${q.n}(${where})`);
      });
    });
    const weak = q.c.map((c, i) => [i, strip(c)]).filter(([i, c]) => i !== q.a - 1 && WEAK.test(c));
    if (weak.length >= 2) weakRows.push({ name, n: q.n, weak: weak.map(([, c]) => c) });
  });
});

console.log("■ 過去問にも問題バンクにも無い固有名詞（問題文・正解の選択肢にあるもの）");
console.log(`  ${unknown.size}語\n`);
[...unknown.entries()].sort().forEach(([t, w]) => console.log(`  ${t.padEnd(22)} ${w.join(" ")}`));

console.log(`\n■ 全否定・全称の誤答が2つ以上ある設問（実質2択になりやすい）: ${weakRows.length}問\n`);
weakRows.forEach((r) => {
  console.log(`  ${r.name} 問${r.n}`);
  r.weak.forEach((c) => console.log(`      × ${c}`));
});
