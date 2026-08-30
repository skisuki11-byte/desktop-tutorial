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
  t(await p.locator(".mode").count() === 2, "モードが2つ並ぶ");
  t((await p.locator(".mode.is-on").textContent()).includes("学習モード"), "最初は学習モードが選ばれている");
  t(await p.locator(".card__again").count() === 0, "未着手のうちは「はじめから」を出さない");
  t((await p.locator("#home-total").textContent()).includes("まずは第1回から"), "学習モードの案内が出る");

  console.log("\n■ 明るさ");
  const bgOf = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  t(await p.locator('html[data-theme="dark"]').count() === 1, "既定はダーク");
  t(await bgOf() === "rgb(16, 17, 25)", "地の色が暗い: " + (await bgOf()));
  t(await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content) === "#101119",
    "ブラウザの色も暗い");
  await p.locator("#theme-toggle").click(); await p.waitForTimeout(200);
  t(await p.locator('html[data-theme="light"]').count() === 1, "押すと明るくなる");
  t(await bgOf() === "rgb(241, 241, 244)", "地の色が明るい: " + (await bgOf()));
  await p.reload(); await p.waitForTimeout(400);
  t(await p.locator('html[data-theme="light"]').count() === 1, "選んだ明るさは開き直しても残る");
  await p.locator("#theme-toggle").click(); await p.waitForTimeout(200);
  t(await p.locator('html[data-theme="dark"]').count() === 1, "もう一度押すと暗く戻る");
  // 地の色に var(--ink) を使うボタンの文字が、暗いときに読めるか
  const btn = await p.evaluate(() => {
    const el = document.querySelector("#sheet-submit");
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color };
  });
  t(btn.bg !== btn.fg && btn.bg === "rgb(233, 233, 240)" && btn.fg === "rgb(16, 17, 25)",
    "採点ボタンの字が地に溶けない: 地" + btn.bg + " 字" + btn.fg);

  console.log("\n■ 学習モード：出だし");
  await p.locator(".card__main").first().click();
  await p.waitForTimeout(300);
  t(await p.locator("#view-learn.is-active").count() === 1, "学習画面に入る");
  t(await p.locator("#learn-lead[open]").count() === 1, "最初からリード文が開いている");
  t((await p.locator("#learn-qnum").textContent()) === "問1", "問1から始まる");
  t(await p.locator("#learn-opts .opt").count() === 6, "問1は6択（年代整序）");
  t(await p.locator("#learn-ex").isHidden(), "答える前は解説が出ない");
  t((await p.locator("#learn-count").textContent()).includes("正解 0"), "正解数が0で始まる");
  t((await p.locator("#learn-next").textContent()).includes("とばす"), "答える前は「とばす」");

  console.log("\n■ 学習モード：答えるとその場で答え合わせ");
  const wrong1 = await p.evaluate(() => {
    const q = SETS[0].dai[0].qs[0];
    return (q.a % q.nopt) + 1;              // わざと外す
  });
  await p.locator("#learn-opts .opt").nth(wrong1 - 1).click();
  await p.waitForTimeout(300);
  t(await p.locator("#learn-ex").isVisible(), "解説が出る");
  t((await p.locator("#learn-ex").textContent()).includes("不正解"), "不正解と出る");
  t((await p.locator("#learn-ex").textContent()).includes("予想の根拠"), "予想の根拠も出る");
  t(await p.locator("#learn-ex.is-ng").count() === 1, "解説の枠が赤になる");
  t(await p.locator("#learn-opts .opt.is-correct").count() === 1, "正解の選択肢が緑になる");
  t(await p.locator("#learn-opts .opt.is-yours").count() === 1, "自分の答えが赤になる");
  t(await p.locator("#learn-opts button").count() === 0, "答えたあとは選択肢を押せない");
  t((await p.locator("#learn-next").textContent()).includes("次の問題"), "「次の問題」に変わる");
  t(await p.locator("#learn-next.is-hot").count() === 1, "次へのボタンが目立つ");
  const fb = await p.locator("#learn-next").boundingBox();
  t(fb.height >= 70 && fb.width >= 220,
    "次へのボタンが押しやすい大きさ: " + Math.round(fb.width) + "×" + Math.round(fb.height) + "px");
  t((await p.locator("#learn-count").textContent()).includes("正解 0"), "外したので正解数は0のまま");
  await p.evaluate(() => { document.getElementById("learn-lead").open = false; });
  await p.locator("#learn-next").click(); await p.waitForTimeout(150);
  t(await p.locator("#learn-lead[open]").count() === 0, "同じ大問のあいだはリード文を勝手に開かない");
  await p.locator("#learn-prev").click(); await p.waitForTimeout(150);
  t(await p.locator("#learn-lead[open]").count() === 0, "戻ってもリード文はたたんだまま");

  console.log("\n■ 学習モード：行き来しても答えが残る");
  t((await p.locator("#learn-qnum").textContent()) === "問1", "前に戻れる");
  t(await p.locator("#learn-ex").isVisible(), "戻ると答え合わせが残っている");
  await p.locator("#learn-next").click(); await p.waitForTimeout(200);
  t((await p.locator("#learn-qnum").textContent()) === "問2", "次の問題へ進む");
  t(await p.locator("#learn-ex").isHidden(), "次の問題では解説が消えている");
  await p.locator("#learn-prev").click(); await p.waitForTimeout(200);
  await p.locator("#learn-next").click(); await p.waitForTimeout(200);

  console.log("\n■ 学習モード：正解したとき");   // ここでは問2にいる
  const right2 = await p.evaluate(() => SETS[0].dai[0].qs[1].a);
  await p.locator("#learn-opts .opt").nth(right2 - 1).click();
  await p.waitForTimeout(300);
  t(await p.locator("#learn-ex.is-ok").count() === 1, "解説の枠が緑になる");
  t(await p.locator("#learn-opts .opt.is-yours").count() === 0, "正解のときは赤の印が出ない");
  t((await p.locator("#learn-count").textContent()).includes("正解 1"), "正解数が1に増える");

  console.log("\n■ 学習モード：下線部と大問の切り替わり");
  const sub = await p.evaluate(() => {
    const s = getComputedStyle(document.querySelector("#learn-leadbody u sub"));
    return { size: parseFloat(s.fontSize), weight: s.fontWeight };
  });
  t(sub.size >= 12 && sub.weight === "700", "下線部の記号が太く十分な大きさ: " + sub.size + "px / " + sub.weight);
  await p.locator("#learn-qref").click(); await p.waitForTimeout(400);
  t(await p.locator("#learn-leadbody u.is-lit, #learn-leadbody .bk.is-lit").count() >= 1, "リード文の該当箇所が光る");
  await p.evaluate(() => { cur.idx = 8; renderLearn(false); });   // 第2問の1問目
  await p.waitForTimeout(200);
  t((await p.locator("#learn-dai").textContent()).includes("第2問"), "第2問に移った");
  t(await p.locator("#learn-lead[open]").count() === 1, "大問が変わるとリード文が開く");

  console.log("\n■ 学習モード：終わりと結果");
  await p.evaluate(() => {
    SETS[0].dai.forEach((d) => d.qs.forEach((q) => {
      store["L1"].answers[q.n] = (q.n % 3 === 0) ? q.a : (q.a % q.nopt) + 1;
    }));
    writeStore();
    cur.idx = cur.list.length - 1; renderLearn(false);
  });
  await p.waitForTimeout(200);
  t((await p.locator("#learn-next").textContent()).includes("結果を見る"), "最後の問題では「結果を見る」");
  await p.locator("#learn-next").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-lresult.is-active").count() === 1, "学習モードの結果が出る");
  const lpt = (await p.locator("#lresult-score .score__pt").textContent()).replace(/\s+/g, " ").trim();
  t(parseInt(lpt, 10) === 16, "正解数が正しい（50問中16問）: " + lpt);
  t((await p.locator(".score__judge").textContent()).includes("32％"), "正答率が出る");
  t((await p.locator("#lresult-score").textContent()).includes("間違い 34 問"), "間違いの数が出る");
  t(await p.locator("#lresult-dai .row").count() === 6, "大問ごとの内訳が6行");
  t(await p.locator("#lresult-fmt .row").count() >= 5, "形式ごとの内訳が出る");
  t((await p.locator("#lresult-again").textContent()).includes("34 問をやり直す"), "間違えた分をやり直すボタン");

  console.log("\n■ 学習モード：間違えた問題だけやり直す");
  await p.locator("#lresult-again").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-learn.is-active").count() === 1, "やり直しが始まる");
  t((await p.locator("#learn-count").textContent()).includes("／34"), "34問だけをまわす");
  t(await p.locator("#learn-ex").isHidden(), "やり直す問題は答えが消えている");
  const rightA = await p.evaluate(() => cur.list[0].q.a);
  await p.locator("#learn-opts .opt").nth(rightA - 1).click();
  await p.waitForTimeout(300);
  t(await p.locator("#learn-ex.is-ok").count() === 1, "やり直して正解できる");
  await p.evaluate(() => { renderLResult(1, flat(1), false); });
  await p.waitForTimeout(200);
  t((await p.locator("#lresult-again").textContent()).includes("33 問をやり直す"), "間違いが1問減っている");

  console.log("\n■ 全問答えたら結果へ行ける");
  await p.evaluate(() => { store["L2"].answers = {}; flat(2).forEach((x) => { store["L2"].answers[x.q.n] = x.q.a; }); store["L2"].done = false; writeStore(); goHome(); });
  await p.waitForTimeout(200);
  t((await p.locator(".card").nth(1).textContent()).includes("全問正解"), "結果を見ずに閉じても「途中」にならない");
  await p.locator(".card__main").nth(1).click(); await p.waitForTimeout(300);
  t(await p.locator("#view-lresult.is-active").count() === 1, "押すと結果が開く");
  await p.locator("#lresult-home").click(); await p.waitForTimeout(200);
  await p.evaluate(() => { store["L2"] = { answers: {}, pos: 0, elapsed: 0, done: false }; writeStore(); renderLResult(1, flat(1), false); });
  await p.waitForTimeout(200);

  console.log("\n■ 学習モード：つづきからと、はじめから");
  await p.evaluate(() => { goHome(); });
  await p.waitForTimeout(200);
  t(await p.locator(".card").first().locator(".card__again").count() === 1, "解きかけの回に「はじめから解き直す」が出る");
  t((await p.locator(".card").first().locator(".card__main").textContent()).includes("間違い"), "主なボタンは結果へ（解き終わり）");
  // 第2回を途中まで解いた状態にして、つづきからを見る
  await p.evaluate(() => {
    store["L2"] = { answers: {}, pos: 11, elapsed: 0, done: false };
    flat(2).slice(0, 12).forEach((x) => { store["L2"].answers[x.q.n] = x.q.a; });
    writeStore(); goHome();
  });
  await p.waitForTimeout(200);
  const c2 = p.locator(".card").nth(1);
  t((await c2.locator(".card__main").textContent()).includes("つづきから"), "途中の回は「つづきから」");
  t(await c2.locator(".card__again").count() === 1, "途中の回にも「はじめから解き直す」が出る");
  await c2.locator(".card__main").click(); await p.waitForTimeout(300);
  t((await p.locator("#learn-qnum").textContent()) === "問12", "つづきからは中断したところから（12問目）");
  await p.locator("#learn-quit").click(); await p.waitForTimeout(200);
  p.once("dialog", (d) => d.accept());
  await p.locator(".card").nth(1).locator(".card__again").click(); await p.waitForTimeout(300);
  t((await p.locator("#learn-qnum").textContent()) === "問1", "はじめからは問1に戻る");
  t(await p.locator("#learn-ex").isHidden(), "答えが消えて未解答に戻っている");
  t((await p.locator("#learn-count").textContent()).includes("1／50"), "1問目からになっている");
  await p.locator("#learn-quit").click(); await p.waitForTimeout(200);
  await p.evaluate(() => { store["L2"] = { answers: {}, pos: 0, elapsed: 0, done: false }; writeStore(); renderLResult(1, flat(1), false); });
  await p.waitForTimeout(200);

  console.log("\n■ 学習モード：全問の解説を読む");
  await p.locator("#lresult-all").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-review.is-active").count() === 1, "見直し画面に入る");
  t((await p.locator("#review-pos").textContent()).includes("／ 50 問目"), "50問すべてを読める");
  t(await p.locator("#review-opts .opt.is-correct").count() === 1, "正解が緑になる");
  await p.locator("#review-back").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-lresult.is-active").count() === 1, "学習モードの結果に戻る");

  console.log("\n■ 本番モードに切り替える");
  await p.locator("#lresult-home").click(); await p.waitForTimeout(200);
  await p.locator('.mode[data-mode="real"]').click(); await p.waitForTimeout(300);
  t((await p.locator(".mode.is-on").textContent()).includes("本番モード"), "本番モードに変わる");
  t((await p.locator(".card").first().textContent()).includes("未着手"), "本番モードの記録は別（未着手）");
  t((await p.locator("#home-total").textContent()).includes("まだ採点した回はありません"), "本番モードの案内に変わる");

  console.log("\n■ 本番モード：解答中");
  await p.locator(".card__main").first().click(); await p.waitForTimeout(300);
  t(await p.locator("#view-exam.is-active").count() === 1, "解答画面に入る");
  t((await p.locator("#exam-qnum").textContent()) === "問1", "問1から始まる");
  t(await p.locator("#exam-lead[open]").count() === 0, "本番ではリード文はたたまれている");
  t(await p.locator("#exam-opts .opt").count() === 6, "問1は6択");
  const time0 = await p.locator("#exam-time").textContent();
  t(/^\d\d:\d\d$/.test(time0), "残り時間が出る: " + time0);
  await p.locator("#exam-qref").click(); await p.waitForTimeout(400);
  t(await p.locator("#exam-leadbody u.is-lit").count() >= 1, "下線部を押すと光る");
  await p.locator("#exam-opts .opt").nth(2).click(); await p.waitForTimeout(400);
  t((await p.locator("#exam-qnum").textContent()) === "問2", "選ぶと次の問題へ進む");
  t(await p.locator("#exam-opts .opt.is-correct").count() === 0, "本番では正誤を見せない");
  await p.locator("#exam-prev").click(); await p.waitForTimeout(200);
  t(await p.locator("#exam-opts .opt.is-picked").count() === 1, "戻ると選んだ答えが残っている");

  console.log("\n■ 本番モード：空欄補充と図版");
  for (let i = 0; i < 4; i++) { await p.locator("#exam-next").click(); await p.waitForTimeout(120); }
  t((await p.locator("#exam-qnum").textContent()) === "問5", "問5に着いた");
  await p.locator("#exam-qref").click(); await p.waitForTimeout(400);
  t(await p.locator("#exam-leadbody .bk.is-lit").count() === 2, "空欄Ａ・Ｂの2か所が光る");
  await p.evaluate(() => { document.getElementById("exam-lead").open = false; });
  for (let i = 0; i < 2; i++) { await p.locator("#exam-next").click(); await p.waitForTimeout(120); }
  t((await p.locator("#exam-qnum").textContent()) === "問7", "問7（略年表）");
  t(await p.locator("#exam-fig svg").count() === 1, "図が表示される");

  console.log("\n■ 本番モード：解答一覧と採点");
  await p.locator("#exam-sheet").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-sheet.is-active").count() === 1, "解答一覧が開く");
  t(await p.locator(".cell").count() === 50, "50問ぶんのマスがある");
  t((await p.locator("#sheet-lead").textContent()).includes("未解答"), "未解答の数が出る");
  await p.locator(".cell").nth(9).click(); await p.waitForTimeout(200);
  t((await p.locator("#exam-qnum").textContent()) === "問10", "マスを押すとその問題へ飛ぶ");

  await p.evaluate(() => {
    SETS[0].dai.forEach((d) => d.qs.forEach((q) => { store["1"].answers[q.n] = (q.n % 3 === 0) ? q.a : (q.a % q.nopt) + 1; }));
    writeStore();
  });
  await p.locator("#exam-sheet").click(); await p.waitForTimeout(200);
  t((await p.locator("#sheet-lead").textContent()).includes("全問に解答"), "全問解答ずみと表示される");
  await p.locator("#sheet-submit").click(); await p.waitForTimeout(400);
  t(await p.locator("#view-result.is-active").count() === 1, "採点結果が出る");
  const pt = await p.locator("#result-score .score__pt").textContent();
  t(parseInt(pt, 10) === 32, "得点が正しい（50問中16問正解＝32点）: " + pt.replace(/\s+/g, " ").trim());
  t(await p.locator("#result-dai .row").count() === 6, "大問ごとの内訳が6行");

  console.log("\n■ 本番モード：見直し");
  await p.locator("#result-wrong").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-review.is-active").count() === 1, "見直し画面に入る");
  t(await p.locator("#review-opts .opt.is-correct").count() === 1, "正解の選択肢が緑になる");
  t(await p.locator("#review-opts .opt.is-yours").count() === 1, "自分の答えが赤になる");
  t((await p.locator("#review-ex").textContent()).includes("予想の根拠"), "解説と根拠が出る");
  await p.locator("#review-back").click(); await p.waitForTimeout(300);
  t(await p.locator("#view-result.is-active").count() === 1, "採点結果に戻る");

  console.log("\n■ 2つのモードが混ざらないか");
  await p.locator("#result-home").click(); await p.waitForTimeout(200);
  t((await p.locator(".card").first().textContent()).includes("採点ずみ"), "本番のカードが採点ずみになる");
  await p.locator('.mode[data-mode="learn"]').click(); await p.waitForTimeout(300);
  t((await p.locator(".card").first().textContent()).includes("間違い 33 問"), "学習モードの記録は別に残っている");

  console.log("\n■ 再読み込みしても残るか");
  await p.reload(); await p.waitForTimeout(400);
  t((await p.locator(".mode.is-on").textContent()).includes("学習モード"), "選んでいたモードが残る");
  t((await p.locator(".card").first().textContent()).includes("間違い 33 問"), "学習モードの記録が残っている");
  await p.locator('.mode[data-mode="real"]').click(); await p.waitForTimeout(200);
  t((await p.locator(".card").first().textContent()).includes("採点ずみ"), "本番モードの記録も残っている");

  console.log("\n■ 苦手分野（学習・本番の両方、3回ぶんをまとめて見る）");
  // ここから先は苦手分野だけを見る専用のシナリオ。過去の記録を全部消して作り直す。
  await p.evaluate(() => {
    store = {};
    const list1 = flat(1);
    store["L1"] = { answers: {}, pos: 0, elapsed: 0, done: true, hist: {} };
    list1.forEach((x) => {
      const a = (x.q.n % 3 === 0) ? x.q.a : (x.q.a % x.q.nopt) + 1; // 3の倍数だけ正解＝16問
      store["L1"].answers[x.q.n] = a; store["L1"].hist[x.q.n] = a;
    });
    store["1"] = { answers: {}, pos: 0, elapsed: 0, done: true, hist: {}, score: 0 };
    list1.forEach((x) => {
      const a = (x.q.n % 4 === 0) ? x.q.a : (x.q.a % x.q.nopt) + 1; // 4の倍数だけ正解＝12問
      store["1"].answers[x.q.n] = a; store["1"].hist[x.q.n] = a;
    });
    mode = "learn"; store.mode = "learn"; writeStore();
    goHome();
  });
  await p.waitForTimeout(200);
  // L1: 16正解／50、real1: 12正解／50 → 学習＋本番で延べ100問・28正解
  const wst = await p.evaluate(() => weakStats());
  t(wst.total === 100, "解答した延べ問数が2モード分を合わせている: " + wst.total);
  t(wst.ok === 28, "正解数が2モード分を合わせている: " + wst.ok);
  t((await p.locator("#weak-open-sub").textContent()).includes("延べ100問"), "ホームの案内に延べ数が出る");
  await p.locator("#weak-open").click(); await p.waitForTimeout(200);
  t(await p.locator("#view-weak.is-active").count() === 1, "苦手分野の画面が開く");
  t(await p.locator("#weak-dai .row").count() === 6, "大問ごとが6行（3回とも同じ番号でまとまる）");
  t(await p.locator("#weak-fmt .row").count() >= 5, "形式ごとの内訳が出る");
  const wlead = await p.locator("#weak-lead").textContent();
  t(wlead.includes("100問") && wlead.includes("28%"), "解答数と正答率が本文に出る: " + wlead);
  t(wlead.includes("いちばん弱いのは"), "いちばん弱い分野を名指しする");
  await p.locator("#weak-home").click(); await p.waitForTimeout(200);
  t(await p.locator("#view-home.is-active").count() === 1, "ホームに戻れる");

  console.log("\n■ 苦手分野：はじめから解き直しても消えない");
  p.once("dialog", (d) => d.accept());
  await p.locator(".card").first().locator(".card__again").click(); await p.waitForTimeout(300);
  t((await p.locator("#learn-count").textContent()).includes("1／50"), "見た目は問1からの解き直しになる");
  await p.locator("#learn-quit").click(); await p.waitForTimeout(200);
  t((await p.locator(".card").first().textContent()).includes("未着手"), "カードの表示は未着手に戻る");
  const wstAfterReset = await p.evaluate(() => weakStats());
  t(wstAfterReset.total === 100, "リセットしても延べ問数は消えない: " + wstAfterReset.total);
  t(wstAfterReset.ok === 28, "リセットしても正解数は消えない: " + wstAfterReset.ok);
  t(await p.locator("#weak-open").isVisible(), "リセットしても「苦手分野を見る」は出たまま");

  console.log("\n■ 苦手分野：解き直して正解すると数字が上向く");
  await p.evaluate(() => {
    // さっき間違えていた問1を、今度は正解にして答え直す
    const item = flat(1).find((x) => x.q.n === 1);
    answerLearn(1, item.q.a);
  });
  await p.waitForTimeout(200);
  const wstImproved = await p.evaluate(() => weakStats());
  t(wstImproved.total === 100, "延べ問数は変わらない: " + wstImproved.total);
  t(wstImproved.ok === 29, "間違えていた1問を正解し直すと、正解数が1増える: " + wstImproved.ok);

  console.log("\n■ 苦手分野：まだ何も解いていないとき");
  await p.evaluate(() => {
    store = {};
    writeStore(); goHome();
  });
  await p.waitForTimeout(200);
  t(await p.locator("#weak-open").isHidden(), "解答が1問もないときは「苦手分野を見る」を出さない");

  console.log("\n  実行時エラー: " + (errs.length ? errs.join(" | ") : "なし"));
  if (errs.length) bad++;
  await b.close(); server.close();
  console.log(bad ? "\n→ " + bad + " 件の失敗" : "\n→ すべて通過");
  process.exit(bad ? 1 : 0);
})();
