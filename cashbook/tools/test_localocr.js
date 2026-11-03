/* 「無料の読み取り」と「文字で取り込む」の動作確認。
 *  ・文字 → 行の解析（残高でのつながり／科目／1文字ずつ離れた文字／3列／丸数字）
 *  ・貼り付け → 確認用の表 → 追記
 *  ・閲覧モードでは貼り付け欄が出ない
 *  ・写真 → 同梱の文字認識エンジンで実際に読み取る（外部へは通信しない）
 * 実行: node tools/test_localocr.js   （playwright が必要）
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.gz': 'application/gzip',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const external = [];
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const exe = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  let lastDialog = '';
  page.on('dialog', (d) => { lastDialog = d.message(); d.accept(); });

  const checks = [];
  const expect = (label, cond, detail) => checks.push({ label, ok: !!cond, detail });

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.fill('#lockPw', '0402');
  await page.click('#lockOk');
  await page.waitForTimeout(500);

  // ---------- 閲覧モードでは出ない ----------
  await page.click('.tab[data-view="camera"]');
  await page.waitForTimeout(250);
  expect('閲覧モードでは貼り付け欄が出ない', await page.locator('#camPasteBox').isHidden());

  // ---------- 解析 ----------
  const P = (txt, start) => page.evaluate(([t, s]) => OCR.parseText(t, s), [txt, start]);

  let r = await P('4/12 交際費(手土産) 菓子折り 3,000 997,000\n4/20 収入 保護者会費 5000 1002000', 1000000);
  expect('2行読める', r.length === 2, JSON.stringify(r));
  expect('残高でつながれば支出と判断', r[0] && r[0].expense === 3000 && r[0].income === 0 && r[0].balance === 997000, JSON.stringify(r[0]));
  expect('括弧の中が内訳になる', r[0] && r[0].kamoku === '交際費' && r[0].uchiwake === '手土産' && r[0].tekiyo === '菓子折り', JSON.stringify(r[0]));
  expect('収入の行は収入になる', r[1] && r[1].income === 5000 && r[1].kamoku === '収入' && !r[1].uncertain, JSON.stringify(r[1]));

  r = await P('③ 4月12日 交 際 費 ( 手 土 産 ) 菓子 3000 997000', 1000000);
  expect('丸数字・月日表記・1文字ずつ離れた文字を読める',
    r.length === 1 && r[0].month === 4 && r[0].day === 12 && r[0].kamoku === '交際費' && r[0].uchiwake === '手土産' && r[0].expense === 3000,
    JSON.stringify(r));

  r = await P('5/1 収入 会費 5000 0 1005000\n5/2 消耗品費 ノート 0 800 1004200', 1000000);
  expect('収入・支払・残高の3列でも読める',
    r.length === 2 && r[0].income === 5000 && r[1].expense === 800 && r[1].kamoku === '消耗品', JSON.stringify(r));

  r = await P('5/3\n事業費\n大会参加費\n12000\n988000', 1000000);
  expect('1項目ずつ改行されていても1行にまとまる',
    r.length === 1 && r[0].expense === 12000 && r[0].kamoku === '事業費' && r[0].tekiyo === '大会参加費', JSON.stringify(r));

  r = await P('6/1 謎の科目 コピー代 500', 1000000);
  expect('科目が読めない行は「要確認」', r.length === 1 && r[0].uncertain && r[0].kamoku === 'その他' && r[0].expense === 500, JSON.stringify(r));

  r = await P('年月日 科目 摘要 収入金額 支払金額 差引残高\n前年度繰越金 1000000', 1000000);
  expect('見出しや日付の無い行は拾わない', r.length === 0, JSON.stringify(r));

  r = await P('13/45 交際費 100', 0);
  expect('日付として成り立たない行は拾わない', r.length === 0, JSON.stringify(r));

  r = await P('4/12 交際費 3000 999999', 1000000);
  expect('残高が合わない行は「要確認」', r.length === 1 && r[0].uncertain, JSON.stringify(r));

  // ---------- 日付が読めない／崩れている行 ----------
  r = await P('17] カステラ代 2133 997867', 1000000);
  expect('「17]」のように日だけ読めた行は、月を引き継いで要確認で残す',
    r.length === 1 && r[0].day === 17 && r[0].expense === 2133 && r[0].uncertain, JSON.stringify(r));
  r = await page.evaluate(() => OCR.parseText('17] カステラ代 2133 997867', 1000000, { month: 4 }));
  expect('最初の行の月は、いまの帳簿の最終月を使う', r.length === 1 && r[0].month === 4, JSON.stringify(r));

  r = await P('4/12 交際費 カステラ 3000 997000\n(08) バナナ代 386 996614', 1000000);
  expect('日付が読めない行も、前の行の日付を引き継いで残す',
    r.length === 2 && r[1].month === 4 && r[1].day === 12 && r[1].expense === 386 && r[1].uncertain && r[1].tekiyo === 'バナナ代',
    JSON.stringify(r));

  r = await P('|7 大会 バナナイや 38 ルル隔\n|8 カステラ 771 5000', 1000000);
  expect('先頭の「|」などの記号は無視して日付を読む', r.length === 2 && r[0].day === 7 && r[1].day === 8, JSON.stringify(r));

  // ---------- 管理者になって貼り付け ----------
  await page.click('#btnAdmin');
  await page.waitForTimeout(250);
  await page.fill('#lockPw', '0727');
  await page.click('#lockOk');
  await page.waitForTimeout(500);
  await page.click('.tab[data-view="camera"]');
  await page.waitForTimeout(250);
  expect('管理者なら貼り付け欄が出る', await page.locator('#camPasteBox').isVisible());

  const startBal = await page.evaluate(() => Store.currentBalance());
  const n0 = await page.evaluate(() => Store.data().entries.length);
  await page.click('#camPasteBox > summary');
  await page.fill('#camPaste', '');
  await page.click('#btnPasteRead');
  await page.waitForTimeout(200);
  expect('空のまま押しても何も起きない', (await page.locator('#camResult table').count()) === 0);

  const b1 = startBal - 3000, b2 = b1 + 5000;
  await page.fill('#camPaste', `4/12 交際費(手土産) 菓子折り 3000 ${b1}\n4/20 収入 保護者会費 5000 ${b2}\nゴミ行 ほげ`);
  await page.click('#btnPasteRead');
  await page.waitForTimeout(300);
  expect('確認用の表に2行出る', (await page.locator('#camResult tbody tr').count()) === 2);
  expect('残高が合えば「OK」', (await page.locator('#camResult tbody tr .tag', { hasText: 'OK' }).count()) === 2);
  expect('状態表示が出る', (await page.textContent('#camStatus')).includes('2 行を読み取りました'), await page.textContent('#camStatus'));

  await page.click('#ocrCommit');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ n: Store.data().entries.length, bal: Store.currentBalance(), last: Store.data().entries.slice(-2) }));
  expect('追記される', after.n === n0 + 2, JSON.stringify(after));
  expect('残高が合う', after.bal === b2, `${after.bal} vs ${b2}`);
  expect('出典が「文字の取り込み」になる', after.last.every((e) => e.src === '文字の取り込み'), JSON.stringify(after.last.map((e) => e.src)));

  // ---------- すでにある行との重複 ----------
  const nA = await page.evaluate(() => Store.data().entries.length);
  await page.fill('#camPaste', '4/12 交際費 菓子折り 3000\n4/25 収入 会費 7000');
  await page.click('#btnPasteRead');
  await page.waitForTimeout(300);
  expect('すでにある行は「重複」と出る', (await page.locator('#camResult .tag', { hasText: '重複' }).count()) === 1);
  expect('重複の行は初期状態でチェックが外れる',
    (await page.locator('#camResult tbody tr').first().locator('input[data-k="include"]').isChecked()) === false);
  expect('追記ボタンは重複を除いた行数', (await page.textContent('#ocrCommit')).includes('1 行を追記'), await page.textContent('#ocrCommit'));
  await page.click('#ocrCommit');
  await page.waitForTimeout(300);
  expect('重複を除いて追記される', (await page.evaluate(() => Store.data().entries.length)) === nA + 1);

  // 別の取引だとわかっていれば、チェックを入れ直して追記できる
  await page.fill('#camPaste', '4/12 交際費 菓子折り 3000');
  await page.click('#btnPasteRead');
  await page.waitForTimeout(300);
  await page.locator('#camResult tbody tr').first().locator('input[data-k="include"]').check();
  await page.waitForTimeout(200);
  await page.click('#ocrCommit');
  await page.waitForTimeout(300);
  expect('チェックを入れ直せば追記できる', (await page.evaluate(() => Store.data().entries.length)) === nA + 2);

  // CSV の取り込みでも、同じ行は入れない
  const csvPath = path.join(process.argv[2] || '/tmp', 'dup.csv');
  fs.writeFileSync(csvPath, '日付,科目,内訳,摘要,収入金額,支払金額\n2026-04-12,交際費,手土産,菓子折り,,3000\n2026-05-09,消耗品,その他,テープ,,400\n');
  const nB = await page.evaluate(() => Store.data().entries.length);
  await page.click('.tab[data-view="settings"]');
  await page.waitForTimeout(250);
  await page.setInputFiles('#impCsv', csvPath);
  await page.waitForTimeout(500);
  expect('CSVの確認に重複の件数が出る', lastDialog.includes('1 行を追記') && lastDialog.includes('重複'), lastDialog);
  expect('CSVは重複を除いて入る', (await page.evaluate(() => Store.data().entries.length)) === nB + 1);
  await page.setInputFiles('#impCsv', csvPath);
  await page.waitForTimeout(500);
  expect('もう一度入れても増えない', (await page.evaluate(() => Store.data().entries.length)) === nB + 1);
  await page.click('.tab[data-view="camera"]');
  await page.waitForTimeout(250);

  // ---------- 写真 → 同梱の文字認識 ----------
  // 画像を用意する（表のような行を3つ描く）
  const png = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 1400; cv.height = 360;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#000'; c.font = '56px "WenQuanYi Zen Hei", sans-serif';
    c.fillText('4/12   交際費   菓子折り   3000   997000', 30, 90);
    c.fillText('4/20   収入   保護者会費   5000   1002000', 30, 190);
    c.fillText('5/2   消耗品   ノート   800   1001200', 30, 290);
    return cv.toDataURL('image/png').split(',')[1];
  });
  const imgPath = path.join(process.argv[2] || '/tmp', 'ocr-sample.png');
  fs.writeFileSync(imgPath, Buffer.from(png, 'base64'));
  await page.setInputFiles('#camPick', imgPath);
  await page.waitForTimeout(500);
  expect('撮影後に「無料で読み取る」ボタンが出る', await page.locator('#btnRunLocal').isVisible());
  await page.click('#camShots .shot img');
  expect('写真をタップすると拡大して見られる', await page.locator('.zoom img').isVisible());
  await page.click('.zoom');
  expect('拡大は閉じられる', (await page.locator('.zoom').count()) === 0);
  await page.click('#btnRunLocal');
  await page.waitForFunction(() => /行を読み取りました|失敗/.test(document.getElementById('camStatus').textContent), null, { timeout: 150000 });
  const stat = await page.textContent('#camStatus');
  const raw = await page.inputValue('#camPaste');
  console.log('--- 認識した文字 ---\n' + raw + '\n--- 状態 ---\n' + stat);
  expect('実際に文字認識が動いて行が出る', /行を読み取りました/.test(stat), stat);
  expect('認識した文字が貼り付け欄に入る（直せる）', raw.length > 10);
  expect('数字を読めている（3000 と 5000）', /3000/.test(raw) && /5000/.test(raw), raw);
  expect('外部サイトへ通信していない', external.length === 0, external.join(', '));

  await page.screenshot({ path: path.join(process.argv[2] || '/tmp', 'localocr.png'), fullPage: true });
  await browser.close();
  server.close();

  let bad = 0;
  checks.forEach((c) => {
    console.log((c.ok ? '  OK   ' : '  FAIL ') + c.label + (!c.ok && c.detail ? '  → ' + c.detail : ''));
    if (!c.ok) bad++;
  });
  if (errors.length) { console.log('\nエラー:'); errors.forEach((e) => console.log('  - ' + e)); }
  console.log(`\n${checks.length - bad}/${checks.length} 合格、JSエラー ${errors.length} 件`);
  process.exit(bad || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
