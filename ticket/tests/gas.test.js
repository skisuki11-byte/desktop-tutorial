// 集計先（gas/Code.gs）のテスト。スプレッドシートの代わりに配列で動く模型を使う。
// 実行：node ticket/tests/gas.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');

function env(pass) {
  const cells = [];        // cells[r][c]（0始まり）
  const formulas = [];     // 数式として入ってしまった値（入ってはいけない）
  const cache = {}, props = {};
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
      const v = (cells[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v;
    })),
    setValues: (vals) => {
      vals.forEach((row, i) => row.forEach((v, j) => {
        cells[r - 1 + i] = cells[r - 1 + i] || [];
        // シートと同じく：' で始まる文字は「文字のまま」（' は値に残らない）、= で始まる文字は数式になる
        if (typeof v === 'string' && v[0] === "'") v = v.slice(1);
        else if (typeof v === 'string' && /^[=+\-@]/.test(v)) formulas.push(v);
        cells[r - 1 + i][c - 1 + j] = v === undefined ? '' : v;
      }));
      return range(r, c, nr, nc);
    },
    setDataValidation() { return this; }, setFontWeight() { return this; }, setBackground() { return this; },
    setFontColor() { return this; }, setNumberFormat() { return this; }
  });
  let maxCols = 26;
  const sheet = {
    getLastRow: () => cells.length,
    getLastColumn: () => cells.reduce((m, row) => Math.max(m, (row || []).reduce((k, v, j) => (v !== '' && v !== undefined ? j + 1 : k), 0)), 0),
    getMaxColumns: () => maxCols,
    insertColumnsAfter: (after, n) => { maxCols += n; },
    getMaxRows: () => 1000,
    getRange: (a, b, c, d) => typeof a === 'string' ? range(1, 1) : range(a, b, c, d),
    setFrozenRows() {}, setColumnWidth() {}, setColumnWidths() {}, hideColumns() {}
  };
  let made = false, uid = 0;
  const ctx = {
    console: { log() {}, error() {} }, JSON, Date, Number, String, Array, Math, Object, isNaN, isFinite,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => (made ? sheet : null), insertSheet: () => { made = true; return sheet; } }),
      newDataValidation: () => ({ requireCheckbox() { return this; }, build: () => ({}) })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'ADMIN_PASS' ? pass : (k in props ? props[k] : null)), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    Utilities: { getUuid: () => 'uuid-' + (++uid), formatDate: () => '11/6 9:30' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType() { return { c: t }; } }) }
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, cells, formulas, props };
}
const call = (e, d) => JSON.parse(e.ctx.doPost({ postData: { contents: typeof d === 'string' ? d : JSON.stringify(Object.assign({ app: 'ticket' }, d)) } }).c);
const C = (o) => Object.assign({ '0104-adult': 0, '0104-student': 0, '0105-adult': 0, '0105-student': 0, '0106-adult': 0, '0106-student': 0 }, o);

// 画面側の設定（config.js）と、集計先の日付・区分・値段が食い違っていないか
{
  const win = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8'), { window: win });
  const cfg = win.TICKET_CONFIG, g = env('x').ctx;
  const same = (x, y) => assert.strictEqual(JSON.stringify(x), JSON.stringify(y));   // 別の実行環境の配列どうしなので JSON で比べる
  same(cfg.days.map((d) => d.id), g.DAYS.map((d) => d.id));
  same(cfg.days.map((d) => d.label), g.DAYS.map((d) => d.label));
  same(cfg.kinds.map((k) => [k.id, k.price]), g.KINDS.map((k) => [k.id, k.price]));
  same(cfg.grades, g.GRADES);
  assert.ok(cfg.maxPerCell <= g.MAX_CELL);
  console.log('ok 画面（config.js）と集計先（Code.gs）の 日付・区分・値段・学年 がそろっている');
}

let e = env('hinata2027'), r, a, b;

r = call(e, { action: 'submit', name: '山田 花子', courtname: 'ニコ', counts: C({ '0104-adult': 2, '0104-student': 1, '0106-adult': 2 }), requestId: 'q1' });
assert.ok(r.ok && r.item.id === 1 && r.token);
assert.strictEqual(r.item.total, 5); assert.strictEqual(r.item.amount, 2000 * 4 + 1500);
a = r;
console.log('ok 申し込むと受付番号1と合鍵が返り、枚数5・金額 ¥9,500 になる');

{
  const H = e.cells[0], row = e.cells[1];
  assert.strictEqual(H[5], '1/4 大人'); assert.strictEqual(H[6], '1/4 高校生以下'); assert.strictEqual(H[9], '1/6 大人'); assert.strictEqual(H[10], '1/6 高校生以下');
  assert.strictEqual(row[5], 2); assert.strictEqual(row[6], 1); assert.strictEqual(row[9], 2); assert.strictEqual(row[10], 0);
  assert.strictEqual(row[H.indexOf('枚数')], 5); assert.strictEqual(row[H.indexOf('金額')], 9500);
  console.log('ok シートには 日付×区分 の列ごとに枚数、枚数と金額の合計も入る');
}

r = call(e, { action: 'submit', name: '山田 花子', courtname: 'ニコ', counts: C({ '0104-adult': 2 }), requestId: 'q1' });
assert.strictEqual(r.item.id, 1); assert.strictEqual(e.cells.length - 1, 1);
console.log('ok 同じ requestId の再送は1件にまとまる（通信が切れて押し直しても二重にならない）');

r = call(e, { action: 'submit', name: '　佐藤\t太郎  ', courtname: '', counts: { '0105-adult': '２', '0105-student': '' }, requestId: 'q2' });
assert.strictEqual(r.item.name, '佐藤 太郎'); assert.strictEqual(r.item.total, 2); assert.strictEqual(r.item.counts['0104-adult'], 0); b = r;
console.log('ok 空白を整え、全角数字も受け付け、入れていない欄は0枚');

[C(), C({ '0104-adult': 51 }), C({ '0104-adult': 'abc' }), C({ '0104-adult': -1 }), { '0104-adult': 1.5 }].forEach((c, i) => {
  r = call(e, { action: 'submit', name: 'x', counts: c, requestId: 'bad' + i }); assert.strictEqual(r.error, 'invalid', JSON.stringify(c));
});
r = call(e, { action: 'submit', name: '', counts: C({ '0104-adult': 1 }) }); assert.strictEqual(r.error, 'invalid');
r = call(e, { action: 'submit', name: 'x'.repeat(41), counts: C({ '0104-adult': 1 }) }); assert.strictEqual(r.error, 'invalid');
r = call(e, { action: 'submit', name: 'x', count: 3 }); assert.strictEqual(r.error, 'invalid');
console.log('ok 0枚・1か所の上限超え・数字以外・小数・名前なしは拒否（タオルの形式 count も拒否）');

const before = e.cells.length;
r = call(e, { action: 'submit', name: 'bot', counts: C({ '0104-adult': 1 }), website: 'http://spam' });
assert.ok(r.ok); assert.strictEqual(e.cells.length, before);
console.log('ok 見えない欄に入力（ボット）は貯めない');

r = call(e, { action: 'update', id: a.item.id, token: a.token, name: '山田 花子', courtname: 'ニコ', counts: C({ '0105-student': 3 }) });
assert.ok(r.ok && r.item.total === 3 && r.item.amount === 4500 && r.item.counts['0104-adult'] === 0);
console.log('ok 合鍵があれば自分の申し込みを修正でき、枚数と金額も数え直す');

r = call(e, { action: 'update', id: a.item.id, token: b.token, name: '乗っ取り', counts: C({ '0104-adult': 1 }) });
assert.strictEqual(r.error, 'not_found');
r = call(e, { action: 'cancel', id: a.item.id, token: 'wrong' });
assert.strictEqual(r.error, 'not_found');
console.log('ok ほかの家庭の合鍵・でたらめな合鍵では修正も取り消しもできない');

r = call(e, { action: 'mine', items: [{ id: a.item.id, token: a.token }, { id: b.item.id, token: 'wrong' }] });
assert.strictEqual(r.items.length, 1); assert.strictEqual(r.items[0].total, 3); assert.ok(!('paid' in r.items[0]) && !('token' in r.items[0]));
console.log('ok 自分の申し込みだけ読める（集金の記録や合鍵は返さない）');

r = call(e, { action: 'admin_list', pass: 'x' }); assert.strictEqual(r.error, 'wrong_pass');
r = call(e, { action: 'admin_list' }); assert.strictEqual(r.error, 'wrong_pass');
r = call(e, { action: 'admin_list', pass: 'hinata2027' });
assert.ok(r.ok && r.items.length === 2); assert.ok(!('token' in r.items[0]));
console.log('ok 集計は合言葉が合うときだけ読める（合鍵は役員にも返さない）');

r = call(e, { action: 'admin_save', pass: 'hinata2027', officer: '鈴木', id: 1, patch: { paid: true } });
assert.ok(r.item.paid && r.item.paidBy === '鈴木 11/6 9:30');
r = call(e, { action: 'admin_save', pass: 'hinata2027', officer: '鈴木', id: 1, patch: { paid: false } });
assert.ok(!r.item.paid && r.item.paidBy === '');
console.log('ok 集金チェックに「つけた役員と時刻」が残り、外すと消える');

r = call(e, { action: 'admin_save', pass: 'hinata2027', id: 2, patch: { counts: C({ '0106-student': 4 }), name: '佐藤 太郎', courtname: 'タロ' } });
assert.ok(r.item.total === 4 && r.item.amount === 6000 && r.item.courtname === 'タロ');
console.log('ok 役員が枚数を修正できる（合計と金額も数え直す）');

// 役員がシートで直接枚数を直した場合も、集計は数え直した値を返す
{
  const H = e.cells[0], row2 = e.cells[2];
  row2[H.indexOf('1/4 大人')] = 2;   // シートで直接 1/4 大人 を 2 に
  r = call(e, { action: 'admin_list', pass: 'hinata2027' });
  const it = r.items.find((x) => x.id === 2);
  assert.strictEqual(it.total, 6); assert.strictEqual(it.amount, 6000 + 4000);
  console.log('ok シートで直接枚数を直しても、集計画面の枚数・金額は数え直される');
}

r = call(e, { action: 'admin_save', pass: 'hinata2027', id: 2, patch: { status: 'cancelled' } });
assert.strictEqual(r.item.status, 'cancelled');
r = call(e, { action: 'admin_save', pass: 'hinata2027', id: 2, patch: { status: 'active' } });
assert.strictEqual(r.item.status, 'active');
console.log('ok 役員の取り消しは「元に戻す」で取り返せる');

r = call(e, { action: 'admin_add', pass: 'hinata2027', officer: '佐藤', name: '高橋 由美', courtname: '', counts: C({ '0105-adult': 2 }), memo: 'LINEで受付', requestId: 'a1' });
assert.ok(r.item.id === 3 && r.item.source === 'admin' && r.item.memo === 'LINEで受付' && r.item.amount === 4000);
console.log('ok 役員がご家庭の代わりに追加できる（経路が残る）');

r = call(e, { action: 'submit', name: '=HYPERLINK("http://evil","x")', courtname: '+1', counts: C({ '0104-adult': 1 }), requestId: 'f1' });
call(e, { action: 'admin_save', pass: 'hinata2027', id: r.item.id, patch: { handed: true } });
call(e, { action: 'admin_save', pass: 'hinata2027', id: r.item.id, patch: { memo: '@memo' } });
assert.deepStrictEqual(e.formulas, []);
r = call(e, { action: 'admin_list', pass: 'hinata2027' });
assert.strictEqual(r.items.find((x) => x.id === 4).name, '=HYPERLINK("http://evil","x")');
console.log('ok = + - @ で始まる入力は、何度書き戻してもシートで数式にならない（文字のまま表示）');

let e2 = env('pw');
for (let i = 0; i < 20; i++) call(e2, { action: 'admin_login', pass: 'nope' + i });
r = call(e2, { action: 'admin_login', pass: 'pw' }); assert.strictEqual(r.error, 'locked');
console.log('ok 合言葉を20回間違えると10分止まる（総当たり対策）');

let e5 = env('bibi-TEST');
['bibi-TEST', 'BIBI-test', 'ｂｉｂｉ－ｔｅｓｔ', ' bibi-test '].forEach((p) => {
  r = call(e5, { action: 'admin_login', pass: p }); assert.ok(r.ok, p);
});
let e6 = env('ポポポ');
['ポポポ', 'ぽぽぽ', 'ﾎﾟﾎﾟﾎﾟ', 'ポポポ'].forEach((p) => {
  r = call(e6, { action: 'admin_login', pass: p }); assert.ok(r.ok, p);
});
['ポポ', 'ボボボ', ''].forEach((p) => {
  r = call(e6, { action: 'admin_login', pass: p }); assert.strictEqual(r.error, 'wrong_pass', p);
});
console.log('ok 合言葉は 大文字／小文字・全角／半角・ひらがな／カタカナ・濁点の付け方・前後の空白 の違いを同じとみなす');

let e3 = env(null);
r = call(e3, { action: 'admin_login', pass: 'any' }); assert.strictEqual(r.error, 'no_pass');
console.log('ok 合言葉が未設定なら誰も集計を読めない');

r = call(e, { app: 'towel', action: 'admin_list', pass: 'hinata2027' }); assert.strictEqual(r.error, 'bad_request');
r = call(e, '{broken'); assert.strictEqual(r.error, 'bad_request');
r = call(e, JSON.stringify({ app: 'ticket', action: 'submit', name: 'x'.repeat(30000), counts: C({ '0104-adult': 1 }) })); assert.strictEqual(r.error, 'bad_request');
console.log('ok 別アプリ（タオルの画面）・壊れたJSON・大きすぎる送信は拒否');

// 学年
{
  const g = env('pw'), G = g.ctx.C.grade;
  let x = call(g, { action: 'submit', name: '学年 太郎', grade: 2, counts: C({ '0104-adult': 1 }), requestId: 'g1' });
  assert.ok(x.ok); assert.strictEqual(x.item.grade, 2);
  assert.strictEqual(g.cells[0][G], '学年'); assert.strictEqual(g.cells[1][G], 2);
  assert.strictEqual(g.cells[0].length, g.ctx.HEADERS.length);
  // 学年を送ってこない（古い画面からの）修正では、学年を消さない
  let y = call(g, { action: 'update', id: x.item.id, token: x.token, name: '学年 太郎', counts: C({ '0104-adult': 2 }) });
  assert.ok(y.ok); assert.strictEqual(y.item.grade, 2); assert.strictEqual(g.cells[1][G], 2);
  // 「１年」「3年生」も読める・学年でない値は受け付けない
  assert.strictEqual(call(g, { action: 'update', id: x.item.id, token: x.token, name: '学年 太郎', grade: '１年', counts: C({ '0104-adult': 1 }) }).item.grade, 1);
  assert.strictEqual(call(g, { action: 'update', id: x.item.id, token: x.token, name: '学年 太郎', grade: '3年生', counts: C({ '0104-adult': 1 }) }).item.grade, 3);
  assert.strictEqual(call(g, { action: 'submit', name: 'x', grade: 4, counts: C({ '0104-adult': 1 }) }).error, 'invalid');
  assert.strictEqual(call(g, { action: 'submit', name: 'x', grade: '=1+1', counts: C({ '0104-adult': 1 }) }).error, 'invalid');
  // 学年なしの申し込みもできる（入れ替え前の画面から送られても失敗させない）
  let z = call(g, { action: 'submit', name: '旧画面', counts: C({ '0104-adult': 1 }), requestId: 'g2' });
  assert.ok(z.ok); assert.strictEqual(z.item.grade, 0);
  // 役員は「未入力」に戻せる
  assert.strictEqual(call(g, { action: 'admin_save', pass: 'pw', id: x.item.id, patch: { name: '学年 太郎', grade: '', counts: C({ '0104-adult': 1 }) } }).item.grade, 0);
  assert.strictEqual(call(g, { action: 'admin_list', pass: 'pw' }).items.find((i) => i.name === '旧画面').grade, 0);
  console.log('ok 学年：いちばん右の列に入る・古い画面からの修正では消えない・1〜3年以外は受け付けない・役員は未入力に戻せる');

  // 学年の列がない以前のシートでも、最初の通信で右端に「学年」の見出しが足され、既存の行はずれない
  const old = env('pw'), H = old.ctx.HEADERS, OG = old.ctx.C.grade;
  call(old, { action: 'submit', name: '前からの人', counts: C({ '0105-adult': 3 }), requestId: 'o1' });
  old.cells[0] = H.slice(0, OG); old.cells[1].length = OG;    // 以前の形（学年の列なし）に戻す
  const before = old.cells[1].slice();
  const lst = call(old, { action: 'admin_list', pass: 'pw' });
  assert.ok(lst.ok); assert.strictEqual(old.cells[0][OG], '学年');
  assert.strictEqual(JSON.stringify(old.cells[1].slice(0, OG)), JSON.stringify(before));
  assert.strictEqual(lst.items[0].name, '前からの人'); assert.strictEqual(lst.items[0].total, 3); assert.strictEqual(lst.items[0].grade, 0);
  console.log('ok 以前のシートには右端に「学年」の列を足すだけで、入っている申し込みはずれない');
}

// 版：新しいコードかどうかを画面側が見分けられる
{
  const v = env('pw');
  assert.strictEqual(JSON.parse(v.ctx.doGet().c).version, 3);
  assert.strictEqual(call(v, { action: 'admin_list', pass: 'pw' }).version, 3);
  console.log('ok 動作確認URLと集計の読み込みで、コードの版（締め切り設定対応＝3）が分かる');
}

// 締め切り
{
  const g = env('pw'), ymd = (dt) => new Date(dt.getTime() + 9 * 3600e3).toISOString().slice(0, 10);   // 日本時間の日付
  const today = ymd(new Date()), yesterday = ymd(new Date(Date.now() - 86400e3));
  let x = call(g, { action: 'submit', name: '締切前', counts: C({ '0104-adult': 1 }), requestId: 'd1' });
  assert.ok(x.ok);
  assert.strictEqual(call(g, { action: 'ping' }).deadline, '');
  // 役員以外は設定できない・おかしな日付は受け付けない
  assert.strictEqual(call(g, { action: 'admin_settings', pass: 'wrong', deadline: today }).error, 'wrong_pass');
  assert.strictEqual(call(g, { action: 'admin_settings', pass: 'pw', deadline: '2026-02-30' }).error, 'invalid');
  assert.strictEqual(call(g, { action: 'admin_settings', pass: 'pw', deadline: '12/10' }).error, 'invalid');
  // 今日を締め切りにする：今日の 23:59 までは申し込める。申し込み画面にも日付が届く
  assert.strictEqual(call(g, { action: 'admin_settings', pass: 'pw', deadline: today }).deadline, today);
  assert.strictEqual(call(g, { action: 'ping' }).deadline, today);
  assert.strictEqual(call(g, { action: 'mine', items: [{ id: x.item.id, token: x.token }] }).deadline, today);
  assert.strictEqual(call(g, { action: 'admin_list', pass: 'pw' }).deadline, today);
  assert.ok(call(g, { action: 'submit', name: '当日', counts: C({ '0104-adult': 1 }), requestId: 'd2' }).ok);
  // 昨日を締め切りにする：申し込み・修正・取り消しは closed。役員の修正・追加はできる
  call(g, { action: 'admin_settings', pass: 'pw', deadline: yesterday });
  assert.strictEqual(call(g, { action: 'submit', name: '締切後', counts: C({ '0104-adult': 1 }), requestId: 'd3' }).error, 'closed');
  assert.strictEqual(call(g, { action: 'update', id: x.item.id, token: x.token, name: '締切前', counts: C({ '0104-adult': 2 }) }).error, 'closed');
  assert.strictEqual(call(g, { action: 'cancel', id: x.item.id, token: x.token }).error, 'closed');
  assert.ok(call(g, { action: 'admin_save', pass: 'pw', id: x.item.id, patch: { paid: true } }).ok);
  assert.ok(call(g, { action: 'admin_add', pass: 'pw', name: '役員が追加', counts: C({ '0105-adult': 1 }), requestId: 'd4' }).ok);
  // 締め切りをなくすと、また申し込める
  assert.strictEqual(call(g, { action: 'admin_settings', pass: 'pw', deadline: '' }).deadline, '');
  assert.ok(call(g, { action: 'submit', name: '再開後', counts: C({ '0104-adult': 1 }), requestId: 'd5' }).ok);
  console.log('ok 締め切り：役員だけが設定でき、当日23:59までは受付・過ぎたら家庭の申し込み/修正/取り消しは止まる（役員の操作はできる）');
}

const e4 = env('pw'); e4.ctx.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() { throw new Error('not held'); } }) };
r = call(e4, { action: 'submit', name: 'x', counts: C({ '0104-adult': 1 }) }); assert.strictEqual(r.error, 'busy');
console.log('ok 混み合ってロックを取れないときは busy を返す（例外にしない）');

console.log('\nすべて成功');
