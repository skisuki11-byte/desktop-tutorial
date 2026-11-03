/* バックアップ（JSON/CSV）の書き出しと読み込みの確認。
 *  ・書き出すファイルに、拡張子に合った種類（JSON は application/json）が付く
 *  ・読み込みの選択欄が .txt も受け付ける
 *  ・拡張子が .txt になったバックアップでも、同じ帳簿を戻せる
 *  ・同じバックアップを2回入れても、行が増えない */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  const errors = []; let lastDialog = '';
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => { lastDialog = d.message(); d.accept(); });
  const checks = []; const expect = (l, c, d) => checks.push({ l, ok: !!c, d });

  await p.addInitScript(() => {
    window.__blobs = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { window.__blobs.push({ type: b.type, size: b.size }); return orig.call(URL, b); };
  });
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.fill('#lockPw', '0402'); await p.click('#lockOk'); await p.waitForTimeout(400);
  await p.click('#btnAdmin'); await p.fill('#lockPw', '0727'); await p.click('#lockOk'); await p.waitForTimeout(400);
  await p.evaluate(() => {
    Store.setMeta('テスト帳', 100000, '2025-12-22');
    Store.add({ date: '2026-04-12', kamoku: '交際費', uchiwake: '手土産', tekiyo: '菓子折り', expense: 3000 });
    Store.add({ date: '2026-04-20', kamoku: '収入', uchiwake: '保護者会費', tekiyo: '会費', income: 5000 });
  });
  await p.click('.tab[data-view="settings"]'); await p.waitForTimeout(300);

  expect('JSON選択欄が .txt も受け付ける', (await p.getAttribute('#impJson', 'accept')).includes('.txt'));
  expect('CSV選択欄が .txt も受け付ける', (await p.getAttribute('#impCsv', 'accept')).includes('.txt'));

  const dl = p.waitForEvent('download');
  await p.click('#btnExportJson');
  const d = await dl;
  const blobs = await p.evaluate(() => window.__blobs);
  expect('書き出し名は .json', /\.json$/.test(d.suggestedFilename()), d.suggestedFilename());
  expect('JSONの種類は application/json（text/plain ではない）', blobs.some((x) => x.type === 'application/json'), JSON.stringify(blobs));
  const saved = path.join(process.argv[2] || '/tmp', 'backup.json');
  await d.saveAs(saved);

  const dl2 = p.waitForEvent('download');
  await p.click('#btnExportCsv');
  await dl2;
  expect('CSVの種類は text/csv', (await p.evaluate(() => window.__blobs)).some((x) => /^text\/csv/.test(x.type)));

  // .txt になってしまったバックアップを、空の帳簿に戻す
  const txtPath = path.join(process.argv[2] || '/tmp', 'backup.txt');
  fs.copyFileSync(saved, txtPath);
  await p.evaluate(() => { Store.replaceAll({ title: '空', opening: { date: '2025-12-22', amount: 100000 }, entries: [] }); });
  await p.setInputFiles('#impJson', txtPath);
  await p.waitForTimeout(600);
  const r1 = await p.evaluate(() => ({ n: Store.data().entries.length, bal: Store.currentBalance(), title: Store.data().title }));
  expect('.txt のバックアップを読み込める', r1.n === 2 && r1.bal === 102000, JSON.stringify(r1));
  expect('帳簿名も戻る', r1.title === 'テスト帳', r1.title);

  // 同じバックアップをもう一度入れても増えない
  await p.setInputFiles('#impJson', saved);
  await p.waitForTimeout(600);
  const r2 = await p.evaluate(() => Store.data().entries.length);
  expect('同じバックアップは2回入れても増えない', r2 === 2, String(r2));

  await b.close(); server.close();
  let bad = 0;
  checks.forEach((c) => { console.log((c.ok ? '  OK   ' : '  FAIL ') + c.l + (!c.ok && c.d ? '  → ' + c.d : '')); if (!c.ok) bad++; });
  if (errors.length) console.log('エラー:', errors);
  console.log(`\n${checks.length - bad}/${checks.length} 合格、JSエラー ${errors.length} 件`);
  process.exit(bad || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
