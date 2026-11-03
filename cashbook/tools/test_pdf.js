/* 収支報告書のPDFが、行数が多くても1ページに収まることの確認。
 * 実行: node tools/test_pdf.js [出力先] [帳簿JSON]   （帳簿JSONは省略可。実データはリポジトリに置かない） */
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
  const out = process.argv[2] || '/tmp';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept());
  const checks = []; const expect = (l, c, d) => checks.push({ l, ok: !!c, d });
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.fill('#lockPw', '0402'); await p.click('#lockOk'); await p.waitForTimeout(400);

  async function makePdf(name) {
    await p.click('.tab[data-view="report"]'); await p.waitForTimeout(400);
    const dl = p.waitForEvent('download');
    await p.click('#btnPdfReport');
    const d = await dl; const f = path.join(out, name); await d.saveAs(f);
    const txt = fs.readFileSync(f, 'latin1');
    return { pages: +(txt.match(/\/Type \/Pages \/Count (\d+)/) || [])[1], bytes: fs.statSync(f).size };
  }

  // 1) 標準的な帳簿
  if (process.argv[3]) {
    const d = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    await p.evaluate((d) => Store.replaceAll(d), d);
  } else {
    await p.evaluate(() => {
      Store.setMeta('テスト帳', 100000, '2025-12-22');
      ['諸費', '交際費', '消耗品', '交通費', '大会補助', '事業費'].forEach((k) => ['A', 'B'].forEach((u) =>
        Store.add({ date: '2026-04-01', kamoku: k, uchiwake: u, tekiyo: 'x', expense: 100 })));
      Store.add({ date: '2026-04-02', kamoku: '収入', uchiwake: '保護者会費', tekiyo: 'x', income: 5000 });
    });
  }
  const a = await makePdf('report-normal.pdf');
  expect('標準の帳簿は1ページ', a.pages === 1, JSON.stringify(a));

  // 2) 内訳が極端に多い帳簿（行が増えても1ページに縮めて収める）
  await p.evaluate(() => {
    for (let i = 0; i < 14; i++) {   // 内訳が14個増えても、縮めれば1枚に入る
      Store.add({ date: '2026-04-01', kamoku: ['諸費', '交際費', '消耗品', '交通費', '大会補助', '事業費'][i % 6], uchiwake: '内訳' + i + '（長い名前の内訳を入れて折り返しも起こす）', tekiyo: 'y', expense: 10 + i });
    }
  });
  const c = await makePdf('report-many.pdf');
  expect('内訳が14個増えても、縮めて1ページ', c.pages === 1, JSON.stringify(c));
  // 縮めても入らないほど多いときは、行が欠けないよう複数ページに分ける
  await p.evaluate(() => {
    for (let i = 0; i < 150; i++) {
      Store.add({ date: '2026-04-01', kamoku: ['諸費', '交際費', '消耗品', '交通費', '大会補助', '事業費'][i % 6], uchiwake: '多数' + i, tekiyo: 'z', expense: 5 });
    }
  });
  const x = await makePdf('report-huge.pdf');
  expect('入り切らないほど多いときは複数ページ（行を欠かさない）', x.pages >= 2, JSON.stringify(x));
  // 少し多い程度（縮めれば入る）なら1ページのまま
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => {
    Store.replaceAll({ title: 'テスト帳', opening: { date: '2025-12-22', amount: 100000 }, entries: [] });
    ['諸費', '交際費', '消耗品', '交通費', '大会補助', '事業費'].forEach((k) => ['A', 'B', 'C', 'D'].forEach((u) =>
      Store.add({ date: '2026-04-01', kamoku: k, uchiwake: u, tekiyo: 'x', expense: 100 })));
  });
  const m = await makePdf('report-mid.pdf');
  expect('内訳が少し多い（縮めれば入る）なら1ページ', m.pages === 1, JSON.stringify(m));

  await b.close(); server.close();
  let bad = 0;
  checks.forEach((x) => { console.log((x.ok ? '  OK   ' : '  FAIL ') + x.l + (!x.ok && x.d ? '  → ' + x.d : '')); if (!x.ok) bad++; });
  if (errors.length) console.log('エラー:', errors);
  console.log(`\n${checks.length - bad}/${checks.length} 合格、JSエラー ${errors.length} 件`);
  process.exit(bad || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
