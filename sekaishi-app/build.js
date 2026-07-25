/* CSS・JS・問題データを1ファイルに束ねる。node build.js で実行。
   dist/index.html … そのまま開ける単体ファイル（スマホに保存すればオフラインでも動く）
   dist/artifact.html … Artifact 公開用のフラグメント（doctype/head/body は公開時に付く） */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const css = read("app.css");
const js = read("app.js");
const dataFiles = fs.readdirSync(path.join(root, "data")).filter((f) => f.endsWith(".js")).sort();
const data = dataFiles.map((f) => read(path.join("data", f))).join("\n");

// index.html から <body> 内のマークアップだけ取り出す
const html = read("index.html");
const body = html.split("<body>")[1].split("</body>")[0]
  .replace(/<script src="[^"]*"><\/script>\s*/g, "")
  .trim();

const title = "世界史 一問一答 ｜ 基礎学 対策";
const parts = [
  `<title>${title}</title>`,
  `<style>\n${css}\n</style>`,
  body,
  `<script>\n${data}\n</script>`,
  `<script>\n${js}\n</script>`
];

const fragment = parts.join("\n\n");

const standalone = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="土浦日大 基礎学力到達度テスト（世界史探究）の過去問3年分の分析にもとづく一問一答アプリ。">
<meta name="theme-color" content="#f1f1f4">
${fragment.split("\n\n")[0]}
${parts[1]}
</head>
<body>
${body}

${parts[3]}

${parts[4]}
</body>
</html>
`;

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/artifact.html"), fragment + "\n");
fs.writeFileSync(path.join(root, "dist/index.html"), standalone);

const kb = (s) => Math.round(Buffer.byteLength(s) / 1024) + "KB";
console.log("dist/artifact.html", kb(fragment));
console.log("dist/index.html   ", kb(standalone));
