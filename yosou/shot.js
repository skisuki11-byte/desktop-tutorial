const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await b.newPage({ viewport: { width: 900, height: 1273 } });
  await p.goto("file:///home/user/desktop-tutorial/yosou/yosou.html");
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "s-cover.png" });
  for (const [name, sel] of [["dai1", ".dai"], ["fig", "#q7"], ["map", "#q23"], ["tri", "#q43"], ["silver", "#q49"], ["tree", "#q50"], ["sheet", ".sheetpage"], ["ans", ".answers"], ["basis", ".basis"]]) {
    const el = await p.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(150);
    await el.screenshot({ path: "s-" + name + ".png" }).catch((e) => console.log(name, e.message));
  }
  await p.pdf({ path: "yosou.pdf", format: "A4", printBackground: true, margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" } });
  await b.close();
})();
