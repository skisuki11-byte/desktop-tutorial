/* 解説に一文を足して、過去問の必要知識のカバーを上げる。
   使い方: node addex.js（下の ADD の表を書き換えて実行） */
const fs = require("fs");
const ADD = require("./addex-data.json");
for (const [file, m] of Object.entries(ADD)) {
  let s = fs.readFileSync(file, "utf8");
  const { exam } = require("./" + file);
  let n = 0;
  for (const [num, extra] of Object.entries(m)) {
    const q = exam.flatMap((d) => d.qs).find((x) => x.n === Number(num));
    if (!q) { console.log("  ！設問が無い", file, num); continue; }
    const old = JSON.stringify(q.ex).slice(1, -1);
    const neu = JSON.stringify(q.ex + extra).slice(1, -1);
    if (s.indexOf(old) < 0) { console.log("  ！置換できない", file, num); continue; }
    s = s.replace(old, neu);
    n++;
  }
  fs.writeFileSync(file, s);
  console.log(file, n, "問の解説に追記");
}
