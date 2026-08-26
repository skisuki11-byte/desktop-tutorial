const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const server = http.createServer((q, r) => {
  fs.readFile(path.join(__dirname, "dist", "index.html"), (e, b) => {
    r.writeHead(e ? 404 : 200, { "Content-Type": "text/html; charset=utf-8" }); r.end(e ? "nf" : b); });
});
(async () => {
  await new Promise((r) => server.listen(8813, r));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await p.goto("http://127.0.0.1:8813/"); await p.waitForTimeout(400);
  await p.screenshot({ path: "s1-home.png" });

  // 学習モード：問題 → 答え合わせ
  await p.locator(".card").first().click(); await p.waitForTimeout(300);
  await p.evaluate(() => { document.getElementById("learn-lead").open = false; });
  await p.screenshot({ path: "s2-learn-q.png" });
  const w = await p.evaluate(() => { const q = SETS[0].dai[0].qs[0]; return (q.a % q.nopt) + 1; });
  await p.locator("#learn-opts .opt").nth(w - 1).click(); await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 260));
  await p.screenshot({ path: "s3-learn-ex.png" });

  // 学習モードの結果
  await p.evaluate(() => {
    SETS[0].dai.forEach((d) => d.qs.forEach((q) => {
      store["L1"].answers[q.n] = (q.n % 4 === 0) ? (q.a % q.nopt) + 1 : q.a; }));
    writeStore(); cur.idx = cur.list.length - 1; finishLearn();
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: "s4-learn-result.png" });

  // ホーム（学習モードの記録つき）
  await p.locator("#lresult-home").click(); await p.waitForTimeout(300);
  await p.screenshot({ path: "s5-home-learn.png" });

  // 本番モード
  await p.locator('.mode[data-mode="real"]').click(); await p.waitForTimeout(300);
  await p.screenshot({ path: "s6-home-real.png" });
  await p.locator(".card").first().click(); await p.waitForTimeout(300);
  await p.screenshot({ path: "s7-exam.png" });
  await b.close(); server.close();
})();
