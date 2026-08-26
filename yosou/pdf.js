const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  for (const [src, out] of [["yosou.html", "yosou-1.pdf"], ["yosou-2.html", "yosou-2.pdf"], ["yosou-3.html", "yosou-3.pdf"]]) {
    const p = await b.newPage({ viewport: { width: 900, height: 1273 } });
    await p.goto("file:///home/user/desktop-tutorial/yosou/" + src);
    await p.waitForTimeout(2200);
    await p.pdf({ path: out, format: "A4", printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" } });
    await p.close();
    console.log(out, Math.round(require("fs").statSync(out).size / 1024) + "KB");
  }
  await b.close();
})();
