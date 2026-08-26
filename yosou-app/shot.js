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
  await p.locator(".card").first().click(); await p.waitForTimeout(300);
  await p.screenshot({ path: "s2-exam.png" });
  await p.locator("#exam-qref").click(); await p.waitForTimeout(500);
  await p.screenshot({ path: "s3-lead.png" });
  await p.evaluate(() => { document.getElementById("exam-lead").open = false; });
  for (let i = 0; i < 6; i++) { await p.locator("#exam-next").click(); await p.waitForTimeout(80); }
  await p.waitForTimeout(300);
  await p.screenshot({ path: "s4-fig.png" });
  await p.evaluate(() => {
    SETS[0].dai.forEach((d) => d.qs.forEach((q) => { store["1"].answers[q.n] = (q.n % 3 === 0) ? q.a : (q.a % q.nopt) + 1; }));
    writeStore();
  });
  await p.locator("#exam-sheet").click(); await p.waitForTimeout(300);
  await p.screenshot({ path: "s5-sheet.png" });
  await p.locator("#sheet-submit").click(); await p.waitForTimeout(400);
  await p.screenshot({ path: "s6-result.png", fullPage: true });
  await p.locator("#result-wrong").click(); await p.waitForTimeout(300);
  await p.screenshot({ path: "s7-review.png", fullPage: true });
  await b.close(); server.close(); console.log("撮影ok");
})();
