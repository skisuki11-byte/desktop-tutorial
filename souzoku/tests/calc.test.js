/* node souzoku/tests/calc.test.js で実行する。依存なし。 */
'use strict';
var assert = require('assert');
var C = require('../js/calc.js');
var D = require('../js/deadlines.js');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

t('仲介手数料：2,000万円は72.6万円', function () { assert.strictEqual(C.brokerFee(20000000, false), 726000); });
t('仲介手数料：300万円は（4%+2万）×1.1', function () { assert.strictEqual(C.brokerFee(3000000, false), 154000); });
t('仲介手数料：800万円以下の空き家は上限33万円', function () { assert.strictEqual(C.brokerFee(8000000, true), 330000); });
t('仲介手数料：800万円超の空き家は通常計算', function () { assert.strictEqual(C.brokerFee(8000001, true), Math.floor((8000001 * 0.03 + 60000) * 1.1)); });
t('印紙税：2,000万円は1万円', function () { assert.strictEqual(C.stampTax(20000000), 10000); });
t('長期・短期：売却年−取得年が6以上で長期', function () {
  assert.strictEqual(C.isLongTerm(2020, 2026), true);
  assert.strictEqual(C.isLongTerm(2021, 2026), false);
  assert.strictEqual(C.isLongTerm(0, 2026), true);
});
t('空き家特例の期限：制度期限が先に来る', function () {
  assert.strictEqual(C.akiyaDeadline('2025-06-12'), '2027-12-31');
  assert.strictEqual(C.akiyaDeadline('2023-03-01'), '2026-12-31');
});

var base = { price: 20000000, acqKnown: true, acqPrice: 1000000, acqYear: 1980, heirs: 2, kind: 'house', vacant: true,
  otherCost: 290000, builtBefore1981: true, livedAlone: true, unusedAfter: true, renovateOrDemolish: true,
  deathISO: '2025-06-12', saleISO: '2026-09-26', holdTaxYear: 120000, holdOtherYear: 180000 };

t('企画書の例：特例ありの手取り 約1,897万円、特例なし 約1,532万円', function () {
  var r = C.estimate(base);
  assert.strictEqual(r.exemptionApplied, true);
  // 2,000万 − 72.6万 − 印紙1万 − その他29万 = 1,897.4万
  assert.strictEqual(r.main.net, 18974000);
  assert.strictEqual(r.main.tax, 0);
  var gain = 20000000 - 1000000 - 726000 - 10000 - 290000;  // 17,974,000
  var each = Math.floor(gain / 2 / 1000) * 1000;
  var tax = Math.floor(each * C.RATE_LONG / 100) * 100 * 2;
  assert.strictEqual(r.without.tax, tax);
  assert.ok(Math.abs(r.without.net - 15320000) < 10000, r.without.net);
  assert.strictEqual(r.hold10, 3000000);
});
t('相続人3人以上は控除が1人2,000万円', function () {
  var r = C.capitalGainsTax(90000000, 3, true, true);
  assert.strictEqual(r.exemptionEach, 20000000);
  assert.strictEqual(r.taxable, 30000000);
});
t('取得費が5%未満なら概算取得費（5%）を使う', function () {
  var r = C.takeHome(Object.assign({}, base, { acqPrice: 100000 }), false);
  assert.strictEqual(r.acqUsed, 1000000);
  assert.strictEqual(r.acqRough, true);
});
t('要件を満たさなければ特例なしで計算し、理由を返す', function () {
  var r = C.estimate(Object.assign({}, base, { builtBefore1981: false }));
  assert.strictEqual(r.exemptionApplied, false);
  assert.strictEqual(r.akiya.reasons.length, 1);
  assert.strictEqual(r.main, r.without);
});
t('期限を過ぎた売却は特例の対象外', function () {
  var r = C.estimate(Object.assign({}, base, { saleISO: '2028-01-10' }));
  assert.strictEqual(r.exemptionApplied, false);
});
t('損が出るときは税金0円', function () {
  var r = C.takeHome(Object.assign({}, base, { acqPrice: 30000000 }), false);
  assert.strictEqual(r.tax, 0);
});

t('期限：月末の繰り上げ', function () { assert.strictEqual(D.addMonths('2025-01-31', 1), '2025-02-28'); });
t('期限：2025-06-12 開始の一覧', function () {
  var s = D.status('2025-06-12', { houki: true, souzokuzei: true }, '2026-09-26');
  var byId = {}; s.items.forEach(function (i) { byId[i.id] = i; });
  assert.strictEqual(byId.houki.date, '2025-09-12');
  assert.strictEqual(byId.souzokuzei.date, '2026-04-12');
  assert.strictEqual(byId.akiya.date, '2027-12-31');
  assert.strictEqual(byId.akiya.left, 461);
  assert.strictEqual(byId.touki.left, 625);
  assert.strictEqual(byId.shutoku.left, 929);
  assert.strictEqual(s.next.id, 'akiya');
  assert.strictEqual(byId.junkaku.passed, true);
});
t('時期の判定', function () {
  assert.strictEqual(D.stage('2026-08-01', '2026-09-26'), 'early');
  assert.strictEqual(D.stage('2026-03-01', '2026-09-26'), 'mid');
  assert.strictEqual(D.stage('2025-06-12', '2026-09-26'), 'later');
});
t('やることの詳細：期限の全項目に中身がある', function () {
  global.window = {};
  require('../js/tasks.js');
  var T = global.window.TG_TASKS;
  D.list('2025-06-12').forEach(function (it) {
    var x = T[it.id];
    assert.ok(x, it.id + ' の中身がない');
    assert.ok(x.summary && x.steps.length >= 3 && x.bring.length && x.tip && x.facts.length, it.id + ' の中身が足りない');
  });
});
console.log('\n' + n + ' tests passed');
