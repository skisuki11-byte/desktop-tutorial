// 集計先（gas/Code.gs）のテスト。スプレッドシートの代わりに配列で動く模型を使う。
// 実行：node towel/tests/gas.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');

function env(pass) {
  const cells = [];        // cells[r][c]（0始まり）
  const formulas = [];     // 数式として入ってしまった値（入ってはいけない）
  const cache = {};
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
  const sheet = {
    getLastRow: () => cells.length,
    getRange: (a, b, c, d) => typeof a === 'string' ? range(1, 1) : range(a, b, c, d),
    setFrozenRows() {}, setColumnWidth() {}, setColumnWidths() {}, hideColumns() {}
  };
  let made = false;
  let uid = 0;
  const ctx = {
    console: { log() {}, error() {} }, JSON, Date, Number, String, Array, Math, Object, isNaN,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => (made ? sheet : null), insertSheet: () => { made = true; return sheet; } }),
      newDataValidation: () => ({ requireCheckbox() { return this; }, build: () => ({}) })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'ADMIN_PASS' ? pass : null) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    Utilities: { getUuid: () => 'uuid-' + (++uid), formatDate: () => '11/6 9:30' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType() { return { c: t }; } }) }
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, cells, formulas };
}
const call = (e, d) => JSON.parse(e.ctx.doPost({ postData: { contents: typeof d === 'string' ? d : JSON.stringify(Object.assign({ app: 'towel' }, d)) } }).c);

let e = env('hinata2027'), r, a, b;

r = call(e, { action: 'submit', name: '山田 花子', courtname: '7番', count: 3, requestId: 'q1' });
assert.ok(r.ok && r.item.id === 1 && r.item.count === 3 && r.token); a = r;
console.log('ok 申し込むと受付番号1と合鍵が返る');

r = call(e, { action: 'submit', name: '山田 花子', courtname: '7番', count: 3, requestId: 'q1' });
assert.strictEqual(r.item.id, 1); assert.strictEqual(e.cells.length - 1, 1);
console.log('ok 同じ requestId の再送は1件にまとまる（通信が切れて押し直しても二重にならない）');

r = call(e, { action: 'submit', name: '　佐藤\t太郎  ', courtname: '', count: '２', requestId: 'q2' });
assert.strictEqual(r.item.name, '佐藤 太郎'); assert.strictEqual(r.item.count, 2); b = r;
console.log('ok 前後の空白・タブを整え、全角数字も受け付ける');

['', 0, 51, 'abc', -1].forEach((c) => { r = call(e, { action: 'submit', name: 'x', count: c, requestId: 'bad' + c }); assert.strictEqual(r.error, 'invalid'); });
r = call(e, { action: 'submit', name: '', count: 1 }); assert.strictEqual(r.error, 'invalid');
r = call(e, { action: 'submit', name: 'x'.repeat(41), count: 1 }); assert.strictEqual(r.error, 'invalid');
console.log('ok 名前なし・長すぎる名前・0枚・上限超え・数字以外は拒否');

const before = e.cells.length;
r = call(e, { action: 'submit', name: 'bot', count: 1, website: 'http://spam' });
assert.ok(r.ok); assert.strictEqual(e.cells.length, before);
console.log('ok 見えない欄に入力（ボット）は貯めない');

r = call(e, { action: 'update', id: a.item.id, token: a.token, name: '山田 花子', courtname: '7番 はるき', count: 4 });
assert.ok(r.ok && r.item.count === 4 && r.item.courtname === '7番 はるき');
console.log('ok 合鍵があれば自分の申し込みを変更できる');

r = call(e, { action: 'update', id: a.item.id, token: b.token, name: '乗っ取り', count: 1 });
assert.strictEqual(r.error, 'not_found');
r = call(e, { action: 'cancel', id: a.item.id, token: 'wrong' });
assert.strictEqual(r.error, 'not_found');
console.log('ok ほかの家庭の合鍵・でたらめな合鍵では変更も取り消しもできない');

r = call(e, { action: 'mine', items: [{ id: a.item.id, token: a.token }, { id: b.item.id, token: 'wrong' }] });
assert.strictEqual(r.items.length, 1); assert.strictEqual(r.items[0].count, 4); assert.ok(!('paid' in r.items[0]) && !('token' in r.items[0]));
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

r = call(e, { action: 'admin_save', pass: 'hinata2027', id: 2, patch: { status: 'cancelled' } });
assert.strictEqual(r.item.status, 'cancelled');
r = call(e, { action: 'admin_save', pass: 'hinata2027', id: 2, patch: { status: 'active' } });
assert.strictEqual(r.item.status, 'active');
console.log('ok 役員の取り消しは「元に戻す」で取り返せる');

r = call(e, { action: 'admin_add', pass: 'hinata2027', officer: '佐藤', name: '高橋 由美', courtname: '', count: 2, memo: 'LINEで受付', requestId: 'a1' });
assert.ok(r.item.id === 3 && r.item.source === 'admin' && r.item.memo === 'LINEで受付');
console.log('ok 役員がご家庭の代わりに追加できる（経路が残る）');

r = call(e, { action: 'submit', name: '=HYPERLINK("http://evil","x")', courtname: '+1', count: 1, requestId: 'f1' });
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

let e3 = env(null);
r = call(e3, { action: 'admin_login', pass: 'any' }); assert.strictEqual(r.error, 'no_pass');
console.log('ok 合言葉が未設定なら誰も集計を読めない');

r = call(e, { app: 'other', action: 'admin_list', pass: 'hinata2027' }); assert.strictEqual(r.error, 'bad_request');
r = call(e, '{broken'); assert.strictEqual(r.error, 'bad_request');
r = call(e, JSON.stringify({ app: 'towel', action: 'submit', name: 'x'.repeat(30000), count: 1 })); assert.strictEqual(r.error, 'bad_request');
console.log('ok 別アプリ・壊れたJSON・大きすぎる送信は拒否');

const e4 = env('pw'); e4.ctx.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() { throw new Error('not held'); } }) };
r = call(e4, { action: 'submit', name: 'x', count: 1 }); assert.strictEqual(r.error, 'busy');
console.log('ok 混み合ってロックを取れないときは busy を返す（例外にしない）');

console.log('\nすべて成功');
