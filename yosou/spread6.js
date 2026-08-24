/* 6択（年代整序）の正解が①〜④に偏らないよう、ア・イ・ウの割りふりを変える。
   出来事そのものは変えない。ラベルの付け替えだけなので内容は不変。 */
const fs = require("fs");
const PERMS = ["ア→イ→ウ", "ア→ウ→イ", "イ→ア→ウ", "イ→ウ→ア", "ウ→ア→イ", "ウ→イ→ア"];
const LBL = ["ア", "イ", "ウ"];
const TARGET = [5, 2, 6, 1, 4, 3, 6, 2, 5, 1, 3, 4, 2, 6, 1, 5, 3];
let t = 0;

for (const file of ["data.js", "data2.js", "data3.js"]) {
  let src = fs.readFileSync(file, "utf8");
  const { exam } = require("./" + file);
  let n = 0;
  exam.flatMap((d) => d.qs).forEach((q) => {
    if (q.nopt !== 6 || !/年代整序/.test(q.fmt || "")) return;
    const oldOrder = PERMS[q.a - 1].split("→");           // 年代の古い順のラベル
    const target = TARGET[t++ % TARGET.length];
    const newOrder = PERMS[target - 1].split("→");
    if (target === q.a) return;                            // すでにその位置なら触らない
    const map = {};                                        // 旧ラベル → 新ラベル
    oldOrder.forEach((L, i) => { map[L] = newOrder[i]; });

    // 問題文から「ア　…」「イ　…」「ウ　…」の3項目を取り出す
    const parts = {};
    LBL.forEach((L) => {
      const re = new RegExp(L + "　([^<]*?)(?=(<br>[アイウ]　)|(　　[アイウ]　)|$)");
      const m = q.q.match(re);
      if (m) parts[L] = m[1].replace(/\s+$/, "");
    });
    if (Object.keys(parts).length !== 3) { console.log("  ！3項目を取り出せない", file, "問" + q.n); return; }

    let newQ = q.q;
    LBL.forEach((L) => { newQ = newQ.replace(L + "　" + parts[L], "\u0000" + map[L] + "\u0000" + parts[L]); });
    // ラベル順に並べ替える
    const seg = {};
    LBL.forEach((L) => { seg[map[L]] = parts[L]; });
    LBL.forEach((L) => { newQ = newQ.replace("\u0000" + L + "\u0000" + Object.keys(seg).find((k) => seg[k] === parts[Object.keys(map).find((o) => map[o] === L)]) , ""); });
    // 上の置換は複雑になるので、素直に組み立て直す
    newQ = q.q;
    const head = newQ.split(/[アイウ]　/)[0];
    const sepBr = /<br>[アイウ]　/.test(q.q);
    const body = LBL.map((L) => L + "　" + seg[L]).join(sepBr ? "<br>" : "　　");
    newQ = head + body;

    let newEx = q.ex;
    const tmp = { "ア": "\u0001", "イ": "\u0002", "ウ": "\u0003" };
    Object.keys(map).forEach((o) => { newEx = newEx.split(o).join(tmp[map[o]]); });
    Object.entries(tmp).forEach(([L, mark]) => { newEx = newEx.split(mark).join(L); });

    const oldQ = JSON.stringify(q.q).slice(1, -1);
    const oldE = JSON.stringify(q.ex).slice(1, -1);
    if (src.indexOf(oldQ) < 0 || src.indexOf(oldE) < 0) { console.log("  ！置換できない", file, "問" + q.n); return; }
    src = src.split(oldQ).join(JSON.stringify(newQ).slice(1, -1));
    src = src.split(oldE).join(JSON.stringify(newEx).slice(1, -1));
    src = src.replace(new RegExp('(c:\\[[^\\]]*\\], a:)' + q.a + '(, nopt:6)'), "$1" + target + "$2");
    n++;
  });
  fs.writeFileSync(file, src);
  console.log(file, n, "問の割りふりを変えた");
}
