const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const DIST = path.join(__dirname, "dist");
const PORT = 8811;
const server = http.createServer((req, res) => {
  fs.readFile(path.join(DIST, "index.html"), (e, b) => {
    res.writeHead(e ? 404 : 200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(e ? "nf" : b);
  });
});
const ok = (c, m) => console.log((c ? "  PASS  " : "  FAIL  ") + m);
let bad = 0;
const t = (c, m) => { if (!c) bad++; ok(c, m); };

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e.message)));
  await p.goto(`http://127.0.0.1:${PORT}/`);
  await p.waitForTimeout(400);

  console.log("■ ホーム");
  t(await p.locator(".card").count() === 3, "3回分のカードが出る");
  t((await p.locator(".card").first().textContent()).includes("第1回"), "第1回のカードがある");
  t((await p.locator("#home-total").textContent()).includes("まだ採点した回はありません"), "未着手の案内が出る");

  console.log("\n■ 解答中");
  await p.locator(".card").first().click();
  await p.waitForTimeout(300);
  t(await p.locator("#view-exam.is-active").count() === 1, "解答画面に入る");
  t((await p.locator("#exam-qnum").textContent()) === "問1", "問1から始まる");
  t((await p.locator("#exam-dai").textContent()).includes("第1問"), "大問名が出る");
  t(await p.locator("#exam-opts .opt").count() === 6, "問1は6択（年代整序）");
  const time0 = await p.locator("#exam-time").textContent();
  t(/^\d\d:\d\d$/.test(time0), "残り時間が出る: " + time0);

  console.log("\n■ 下線部を押すとリード文が光る");
  t(await p.locator("#exam-qref").isVisible(), "下線部のボタンがある: " + (await p.locator("#exam-qref").textContent()));
  await p.locator("#exam-qref").click();
  await p.waitForTimeout(400);
  t(await p.locator("#exam-lead[open]").count() === 1, "リード文が開く");
  t(await p.locator("#exam-leadbody u.is-lit").count() >= 1, "該当の下線部が光る");
  const lit = await p.locator("#exam-leadbody u.is-lit").first().textContent();
  t(lit.includes("民主政"), "光ったのは下線部a（民主政）: " + lit);

  console.log("\n■ 解答と自動送り");
  await p.locator("#exam-opts .opt").nth(2).click();
  await p.waitForTimeout(400);
  t((await p.locator("#exam-qnum").textContent()) === "問2", "選ぶと次の問題へ進む");
  await p.locator("#exam-prev").click(); await p.waitForTimeout(200);
  t(await p.locator("#exam-opts .opt.is-picked").count() === 1, "戻ると選んだ答えが残っている");

  console.log("\n■ 空欄補充の設問");
  for (let i = 0; i < 4; i++) { await p.locator("#exam-next").click(); await p.waitForTimeout(120); }
  t((await p.locator("#exam-qnum").textContent()) === "問5", "問5に着いた");
  t((await p.locator("#exam-qref").textContent()).includes("空欄"), "空欄の参照ボタン: " + (await p.locator("#exam-qref").textContent()));
  await p.locator("#exam-qref").click(); await p.waitForTimeout(400);
  t(await p.locator("#exam-leadbody .bk.is-lit").count() === 2, "空欄Ａ・Ｂの2か所が光る");

  console.log("\n■ 図版");
  await p.evaluate(() => { document.getElementById("exam-lead").open = false; });
  for (let i = 0; i < 2; i++) { await p.locator("#exam-next").click(); await p.waitForTimeout(120); }
  t((await p.locator("#exam-qnum").textContent()) === "問7", "問7（略年表）");
  t(await p.locator("#exam-fig svg").count() === 1, "図が表示される");

  console.log("\n■ 解答一覧と採点");
  await p.locator("#exam-sheet").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-sheet.is-active").count() === 1, "解答一覧が開く");
  t(await p.locator(".cell").count() === 50, "50問ぶんのマスがある");
  t((await p.locator("#sheet-lead").textContent()).includes("未解答"), "未解答の数が出る");
  await p.locator(".cell").nth(9).click(); await p.waitForTimeout(200);
  t((await p.locator("#exam-qnum").textContent()) === "問10", "マスを押すとその問題へ飛ぶ");

  // 3問に1問だけ正解する状態にして採点（アプリが持っている記録に直接入れる）
  await p.evaluate(() => {
    SETS[0].dai.forEach((d) => d.qs.forEach((q) => { store["1"].answers[q.n] = (q.n % 3 === 0) ? q.a : (q.a % q.nopt) + 1; }));
    writeStore();
  });
  await p.locator("#exam-sheet").click(); await p.waitForTimeout(200);
  t((await p.locator("#sheet-lead").textContent()).includes("全問に解答"), "全問解答ずみと表示される");
  await p.locator("#sheet-submit").click(); await p.waitForTimeout(400);
  t(await p.locator("#view-result.is-active").count() === 1, "採点結果が出る");
  const pt = await p.locator(".score__pt").textContent();
  t(parseInt(pt, 10) === 32, "得点が正しい（50問中16問正解＝32点）: " + pt.replace(/\s+/g, " ").trim());
  t(await p.locator("#result-dai .row").count() === 6, "大問ごとの内訳が6行");
  t(await p.locator("#result-fmt .row").count() >= 5, "形式ごとの内訳が出る");

  console.log("\n■ 復習");
  await p.locator("#result-wrong").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-review.is-active").count() === 1, "復習画面に入る");
  t(await p.locator(".opt.is-correct").count() === 1, "正解の選択肢が緑になる");
  t(await p.locator(".opt.is-yours").count() === 1, "自分の答えが赤になる");
  t((await p.locator("#review-ex").textContent()).includes("予想の根拠"), "解説と根拠が出る");

  console.log("\n■ ホームに戻ったとき");
  await p.locator("#review-back").click(); await p.waitForTimeout(200);
  await p.locator("#result-home").click(); await p.waitForTimeout(200);
  t((await p.locator(".card").first().textContent()).includes("採点ずみ"), "カードが採点ずみになる");
  t((await p.locator("#home-total").textContent()).includes("採点ずみ"), "全体の状況が出る");

  console.log("\n■ 再読み込みしても残るか");
  await p.reload(); await p.waitForTimeout(400);
  t((await p.locator(".card").first().textContent()).includes("採点ずみ"), "記録が残っている");

  console.log("\n  実行時エラー: " + (errs.length ? errs.join(" | ") : "なし"));
  if (errs.length) bad++;
  await b.close(); server.close();
  console.log(bad ? "\n→ " + bad + " 件の失敗" : "\n→ すべて通過");
  process.exit(bad ? 1 : 0);
})();
