/* 予想問題アプリを1ファイルにまとめる。node build.js で実行。
   問題データは ../yosou/data*.js をそのまま使う（紙の予想問題と同じ中身）。 */
const fs = require("fs");
const path = require("path");
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const Y = path.join(root, "..", "yosou");
const { rotate } = require(path.join(Y, "rotate.js"));

const META = [
  { id: 1, file: "data.js",  name: "第1回", sub: "直近の反動を重く見た配分",
    note: "令和7年度で手薄だった明・清、古代オリエント、宗教改革を厚くしてある。" },
  { id: 2, file: "data2.js", name: "第2回", sub: "傾向がそのまま続いた場合",
    note: "令和7年度の分野配分をそのままなぞり、第1回で扱わなかった知識を置いた。" },
  { id: 3, file: "data3.js", name: "第3回", sub: "取りこぼしと範囲拡大の保険",
    note: "第1回・第2回で扱わなかった知識を全部入れ、範囲が19世紀まで及ぶ場合にも備えている。" }
];

const sets = META.map((m) => {
  const mod = require(path.join(Y, m.file));
  rotate(mod.exam);
  return {
    id: m.id, name: m.name, sub: m.sub, note: m.note,
    fig: mod.fig,
    dai: mod.exam.map((d) => ({
      no: d.no, kind: d.kind, title: d.title, lead: d.lead,
      qs: d.qs.map((q) => ({
        n: q.n, ref: q.ref || "", fmt: q.fmt || "語句", q: q.q,
        c: q.c, a: q.a, nopt: q.nopt || 4, ex: q.ex, src: q.src,
        figKey: q.figKey || ""
      }))
    }))
  };
});

const total = sets.reduce((s, x) => s + x.dai.reduce((t, d) => t + d.qs.length, 0), 0);
if (total !== 150) throw new Error("問数が150でない: " + total);

const stamp = new Date(Date.now() + 9 * 3600 * 1000)
  .toISOString().slice(0, 16).replace("T", " ").replace(/-/g, ".");

const css = read("app.css");
const js = read("app.js").replace('"__BUILD__"', JSON.stringify(stamp));
const html = read("index.html");
const body = html.split("<body>")[1].split("</body>")[0]
  .replace(/<script src="[^"]*"><\/script>\s*/g, "").trim();

const title = "基礎学 世界史 予想問題";
const fragment = [
  `<title>${title}</title>`,
  `<style>\n${css}\n</style>`,
  body,
  `<script>\nconst SETS = ${JSON.stringify(sets)};\n</script>`,
  `<script>\n${js}\n</script>`
].join("\n\n");

const standalone = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="令和3〜7年度の実物271問の分析にもとづく、基礎学力到達度テスト（世界史探究）の予想問題3回分。">
<meta name="theme-color" content="#f1f1f4">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${body}

<script>
const SETS = ${JSON.stringify(sets)};
</script>

<script>
${js}
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/index.html"), standalone);
fs.writeFileSync(path.join(root, "dist/artifact.html"), fragment + "\n");
const docs = path.join(root, "..", "docs", "yosou");
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, "index.html"), standalone);

const kb = (s) => Math.round(Buffer.byteLength(s) / 1024) + "KB";
console.log("版:", stamp, "／", total, "問");
console.log("docs/yosou/index.html", kb(standalone));
