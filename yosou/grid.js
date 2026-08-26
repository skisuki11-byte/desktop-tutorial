/* 空欄補充の選択肢を、実物と同じ「Ａの2値 × Ｂの2値」の規則的な並びに直す。
   どちらの値を先に置くかで正解の位置が①〜④に決まるので、それで散らす。 */
const fs = require("fs");
const TARGET = { "data.js": [1,4,2,3,1,4,3,2], "data2.js": [2,3,1,4,3,2,4,1], "data3.js": [4,1,3,2,1,4,2] };
for (const [file, targets] of Object.entries(TARGET)) {
  let s = fs.readFileSync(file, "utf8");
  const { exam } = require("./" + file);
  const qs = exam.flatMap((d) => d.qs).filter((q) => /空欄補充/.test(q.fmt || ""));
  let k = 0, done = 0;
  for (const q of qs) {
    const parts = q.c.map((c) => c.split("　").map((x) => x.trim()).filter(Boolean));
    if (!parts.every((p) => p.length === 2)) { console.log("  格子でない", file, "問" + q.n); k++; continue; }
    const A = [...new Set(parts.map((p) => p[0]))], B = [...new Set(parts.map((p) => p[1]))];
    if (A.length !== 2 || B.length !== 2) { console.log("  格子でない（値が2つでない）", file, "問" + q.n); k++; continue; }
    const Ac = parts[q.a - 1][0], Bc = parts[q.a - 1][1];
    const Aw = A.find((x) => x !== Ac), Bw = B.find((x) => x !== Bc);
    const t = targets[k++];
    const a1 = (t <= 2) ? Ac : Aw, a2 = (t <= 2) ? Aw : Ac;
    const b1 = (t === 1 || t === 3) ? Bc : Bw, b2 = (t === 1 || t === 3) ? Bw : Bc;
    const grid = [[a1,b1],[a1,b2],[a2,b1],[a2,b2]].map(([x,y]) => x + "　" + y);
    const pos = grid.findIndex((g) => g === Ac + "　" + Bc) + 1;
    if (pos !== t) { console.log("  ！位置がずれた", file, "問" + q.n, pos, t); continue; }
    const oldS = "c:[" + q.c.map((x) => JSON.stringify(x)).join(",") + "], a:" + q.a;
    const newS = "c:[" + grid.map((x) => JSON.stringify(x)).join(",") + "], a:" + t;
    if (s.indexOf(oldS) < 0) { console.log("  ！置換できない", file, "問" + q.n); continue; }
    s = s.replace(oldS, newS);
    done++;
  }
  fs.writeFileSync(file, s);
  console.log(file, done, "問を規則的な並びにした");
}
