/** @OnlyCurrentDoc */
// ↑ 権限を「このスプレッドシートだけ」に絞る印。消さないでください。

/**
 * 春高バレー 応援チケット 申し込みの集計先（Google Apps Script）
 *
 * このスクリプトを「申し込みを貯める Google スプレッドシート」に入れて、ウェブアプリとして公開する。
 *   - 各家庭の申し込みは、シート「チケット申込」に1件1行で貯まる（なければ自動で作る）
 *     列は 日付 × 区分（1/4 大人・1/4 高校生以下 …）ごとの枚数と、枚数・金額の合計
 *   - 役員の集計画面は、合言葉（スクリプトのプロパティ ADMIN_PASS）を知っている人だけが読める
 *   - 家庭は、自分の申し込みだけを「受付番号＋合鍵（token）」で修正・取り消しできる
 *   - シートを役員が直接さわっても（チェックボックス・枚数の修正）、集計画面にそのまま反映される
 *
 * 日付・区分・値段を変えるときは、画面側の js/config.js（days / kinds）も同じにそろえる。
 * 設定は gas/README.md を参照。
 */

var SHEET_NAME = 'チケット申込';
var DAYS = [
  { id: '0104', label: '1/4' },
  { id: '0105', label: '1/5' },
  { id: '0106', label: '1/6' }
];
var KINDS = [
  { id: 'adult', label: '大人', price: 2000 },
  { id: 'student', label: '高校生以下', price: 1500 }
];
var ITEMS = [];   // 日付 × 区分（シートの列の順）
DAYS.forEach(function (d) { KINDS.forEach(function (k) { ITEMS.push({ key: d.id + '-' + k.id, header: d.label + ' ' + k.label, price: k.price }); }); });

var BASE_HEADERS = ['受付番号', '受付日時', '更新日時', 'お名前', 'コートネーム'];
var TAIL_HEADERS = ['枚数', '金額', '状態', '集金', '集金の記録', '受け渡し', '受け渡しの記録', '役員メモ', '経路', 'requestId', 'token'];
// あとから足した列は、すでに入っている申し込みの列がずれないよう、いちばん右に足していく
var EXTRA_HEADERS = ['学年'];
var HEADERS = BASE_HEADERS.concat(ITEMS.map(function (it) { return it.header; }), TAIL_HEADERS, EXTRA_HEADERS);
var GRADES = [1, 2, 3];   // 学年（画面側 config.js の grades とそろえる）
// このコードの版。画面側（admin.js の SERVER_VERSION）は、これより古い集計先につながっていると「更新してください」と出す
var VERSION = 3;          // 2：学年に対応 / 3：締め切り日を役員の画面で設定
var C = (function () {   // 列の位置（0始まり）
  var c = { id: 0, createdAt: 1, updatedAt: 2, name: 3, courtname: 4, item0: 5 };
  var t = c.item0 + ITEMS.length;
  ['total', 'amount', 'status', 'paid', 'paidBy', 'handed', 'handedBy', 'memo', 'source', 'requestId', 'token', 'grade'].forEach(function (k, i) { c[k] = t + i; });
  return c;
})();
var STATUS_ACTIVE = '有効', STATUS_CANCELLED = '取り消し';
var MAX_CELL = 50;           // 1か所（1日・1区分）の上限（画面側の maxPerCell より大きめにしておく）
var MAX_TOTAL = 200;         // 1件の合計の上限
var MAX_SUBMIT_PER_HOUR = 300;
var MAX_FAIL = 20;           // 合言葉の失敗を10分あたり何回まで受け付けるか

function doGet() {
  return json_({ ok: true, app: 'ticket', version: VERSION });   // 公開URLをブラウザで開いたときの動作確認用（version で新しいコードか分かる）
}

function doPost(e) {
  var d;
  try {
    if (!e || !e.postData || e.postData.contents.length > 20000) return json_({ ok: false, error: 'bad_request' });
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!d || d.app !== 'ticket') return json_({ ok: false, error: 'bad_request' });
  try {
    switch (d.action) {
      case 'ping': return json_({ ok: true, deadline: deadline_() });
      case 'submit': return json_(submit_(d));
      case 'mine': return json_(mine_(d));
      case 'update': return json_(updateOwn_(d));
      case 'cancel': return json_(cancelOwn_(d));
      case 'admin_login': return json_(admin_(d, function () { return { ok: true }; }));
      case 'admin_list': return json_(admin_(d, adminList_));
      case 'admin_save': return json_(admin_(d, adminSave_));
      case 'admin_add': return json_(admin_(d, adminAdd_));
      case 'admin_settings': return json_(admin_(d, adminSettings_));
    }
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    if (err && err.code) return json_({ ok: false, error: err.code });
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

/* ---------- 家庭の操作 ---------- */

function submit_(d) {
  if (d.website) return { ok: true, item: { id: 0, name: '', courtname: '', counts: {}, total: 0, amount: 0, status: 'active' }, token: '' };  // ボット（見えない欄に入力）
  if (isClosed_()) throw { code: 'closed' };
  if (!countUp_('submit', 3600, MAX_SUBMIT_PER_HOUR)) return { ok: false, error: 'rate' };
  var v = validate_(d);
  var requestId = str_(d.requestId, 64);
  return withLock_(function () {
    var sh = sheet_(), rows = rows_(sh);
    // 通信が切れて同じ申し込みが2回届いても、1件にまとめる
    if (requestId) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][C.requestId] === requestId) return { ok: true, item: pub_(rows[i]), token: rows[i][C.token] };
      }
    }
    var row = newRow_(rows, v, 'フォーム', requestId, '');
    appendRow_(sh, row);
    return { ok: true, item: pub_(row), token: row[C.token] };
  });
}

function mine_(d) {
  var list = Array.isArray(d.items) ? d.items.slice(0, 10) : [];
  var rows = rows_(sheet_()), out = [];
  list.forEach(function (x) {
    var r = findRow_(rows, x && x.id);
    if (r && x.token && r.row[C.token] === String(x.token)) out.push(pub_(r.row));
  });
  return { ok: true, items: out, deadline: deadline_() };
}

function updateOwn_(d) {
  if (isClosed_()) throw { code: 'closed' };
  var v = validate_(d);
  return withLock_(function () {
    var sh = sheet_(), r = own_(sh, d);
    setValues_(r.row, v);
    r.row[C.status] = STATUS_ACTIVE;
    r.row[C.updatedAt] = new Date();
    writeRow_(sh, r);
    return { ok: true, item: pub_(r.row) };
  });
}

function cancelOwn_(d) {
  if (isClosed_()) throw { code: 'closed' };
  return withLock_(function () {
    var sh = sheet_(), r = own_(sh, d);
    r.row[C.status] = STATUS_CANCELLED;
    r.row[C.updatedAt] = new Date();
    writeRow_(sh, r);
    return { ok: true, item: pub_(r.row) };
  });
}

function own_(sh, d) {
  var r = findRow_(rows_(sh), d.id);
  if (!r || !d.token || r.row[C.token] !== String(d.token)) throw { code: 'not_found' };
  return r;
}

/* ---------- 役員の操作 ---------- */

function admin_(d, fn) {
  var pass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASS');
  if (!pass) return { ok: false, error: 'no_pass' };
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fail') || 0);
  if (fails >= MAX_FAIL) return { ok: false, error: 'locked' };
  if (typeof d.pass !== 'string' || !safeEqual_(normPass_(d.pass), normPass_(pass))) {
    cache.put('fail', String(fails + 1), 600);
    return { ok: false, error: 'wrong_pass' };
  }
  return fn(d);
}

function adminList_() {
  var rows = rows_(sheet_());
  return { ok: true, items: rows.map(adminView_), serverTime: new Date().toISOString(), version: VERSION, deadline: deadline_() };
}

/* ---------- 申し込みの締め切り（役員の画面で設定・スクリプトのプロパティ DEADLINE に 'YYYY-MM-DD' で保存） ---------- */

/** 締め切り日（'YYYY-MM-DD'、なければ ''）。その日の 23:59（日本時間）まで受け付ける */
function deadline_() {
  var v = PropertiesService.getScriptProperties().getProperty('DEADLINE') || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}
function isClosed_() {
  var d = deadline_();
  return !!d && Date.now() > new Date(d + 'T23:59:59+09:00').getTime();
}
/** 役員：締め切り日を決める・なくす（{ deadline: 'YYYY-MM-DD' | '' }）。役員の修正・追加は締め切り後もできる */
function adminSettings_(d) {
  var v = String(d.deadline == null ? '' : d.deadline).trim();
  var props = PropertiesService.getScriptProperties();
  if (v === '') { props.deleteProperty('DEADLINE'); return { ok: true, deadline: '' }; }
  var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw { code: 'invalid' };
  var y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]), t = new Date(y, mo - 1, da);
  if (y < 2020 || y > 2100 || t.getMonth() !== mo - 1 || t.getDate() !== da) throw { code: 'invalid' };
  props.setProperty('DEADLINE', v);
  return { ok: true, deadline: v };
}

function adminSave_(d) {
  var p = d.patch || {};
  var who = str_(d.officer, 12) || '役員';
  return withLock_(function () {
    var sh = sheet_(), r = findRow_(rows_(sh), d.id);
    if (!r) throw { code: 'not_found' };
    var stamp = who + ' ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d H:mm');
    if ('paid' in p) { r.row[C.paid] = !!p.paid; r.row[C.paidBy] = p.paid ? stamp : ''; }
    if ('handed' in p) { r.row[C.handed] = !!p.handed; r.row[C.handedBy] = p.handed ? stamp : ''; }
    if ('status' in p) r.row[C.status] = p.status === 'cancelled' ? STATUS_CANCELLED : STATUS_ACTIVE;
    if ('memo' in p) r.row[C.memo] = str_(p.memo, 200);
    if ('name' in p || 'courtname' in p || 'counts' in p || 'grade' in p) {
      setValues_(r.row, validate_(p));
      r.row[C.updatedAt] = new Date();
    }
    writeRow_(sh, r);
    return { ok: true, item: adminView_(r.row) };
  });
}

function adminAdd_(d) {
  var v = validate_(d);
  var requestId = str_(d.requestId, 64);
  return withLock_(function () {
    var sh = sheet_(), rows = rows_(sh);
    if (requestId) {
      for (var i = 0; i < rows.length; i++) if (rows[i][C.requestId] === requestId) return { ok: true, item: adminView_(rows[i]) };
    }
    var row = newRow_(rows, v, '役員が追加（' + (str_(d.officer, 12) || '役員') + '）', requestId, str_(d.memo, 200));
    appendRow_(sh, row);
    return { ok: true, item: adminView_(row) };
  });
}

/* ---------- 行 ---------- */

function newRow_(rows, v, source, requestId, memo) {
  var now = new Date(), row = new Array(HEADERS.length);
  row[C.id] = nextId_(rows);
  row[C.createdAt] = now; row[C.updatedAt] = now;
  setValues_(row, v);
  row[C.status] = STATUS_ACTIVE;
  row[C.paid] = false; row[C.paidBy] = ''; row[C.handed] = false; row[C.handedBy] = '';
  row[C.memo] = memo || '';
  row[C.source] = source;
  row[C.requestId] = requestId || Utilities.getUuid();
  row[C.token] = Utilities.getUuid();
  return row;
}

/** お名前・コートネーム・枚数を行に入れ、枚数と金額の合計も入れ直す */
function setValues_(row, v) {
  row[C.name] = v.name;
  row[C.courtname] = v.courtname;
  if (v.grade !== undefined) row[C.grade] = v.grade || '';   // 学年を送ってこない古い画面からの修正では、入っている学年を消さない
  ITEMS.forEach(function (it, i) { row[C.item0 + i] = v.counts[it.key]; });
  row[C.total] = totalOf_(v.counts);
  row[C.amount] = amountOf_(v.counts);
}

function countsOf_(row) {
  var c = {};
  ITEMS.forEach(function (it, i) { var n = Number(row[C.item0 + i]); c[it.key] = isFinite(n) && n > 0 ? Math.floor(n) : 0; });
  return c;
}
function totalOf_(c) { return ITEMS.reduce(function (a, it) { return a + (c[it.key] || 0); }, 0); }
function amountOf_(c) { return ITEMS.reduce(function (a, it) { return a + (c[it.key] || 0) * it.price; }, 0); }

/* ---------- シート ---------- */

/** 最初に1回だけ実行する：シート「チケット申込」を作り、見出し・幅を整える（なければ自動でも作る） */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#fff3c9').setFontColor('#0d1937');
  sh.setFrozenRows(1);
  sh.setColumnWidth(C.id + 1, 80);
  sh.setColumnWidths(C.createdAt + 1, 2, 130);
  sh.setColumnWidth(C.name + 1, 150);
  sh.setColumnWidth(C.courtname + 1, 110);
  sh.setColumnWidths(C.item0 + 1, ITEMS.length, 92);
  sh.setColumnWidths(C.total + 1, 2, 80);
  sh.setColumnWidths(C.paid + 1, 4, 110);
  sh.setColumnWidth(C.memo + 1, 200);
  sh.getRange('B:C').setNumberFormat('yyyy/mm/dd hh:mm');
  sh.getRange(1, C.amount + 1, sh.getMaxRows(), 1).setNumberFormat('¥#,##0');
  sh.getRange(1, C.amount + 1).setNumberFormat('@');
  sh.setColumnWidth(C.grade + 1, 70);
  sh.hideColumns(C.requestId + 1, 2);   // requestId と token は家庭の「合鍵」なので見えないようにしておく
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASS')) console.log('スクリプトのプロパティ ADMIN_PASS（役員の合言葉）を設定してください');
  console.log('準備ができました：シート「' + SHEET_NAME + '」');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { setup(); sh = ss.getSheetByName(SHEET_NAME); }
  ensureColumns_(sh);
  return sh;
}

/** 以前の形のシート（学年の列がない）なら、いちばん右に列と見出しを足す（1回だけ動く） */
function ensureColumns_(sh) {
  if (sh.getLastColumn() >= HEADERS.length) return;
  if (sh.getMaxColumns() < HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), HEADERS.length - sh.getMaxColumns());
  var from = Math.max(sh.getLastColumn(), C.token + 1);
  sh.getRange(1, from + 1, 1, HEADERS.length - from).setValues([HEADERS.slice(from)])
    .setFontWeight('bold').setBackground('#fff3c9').setFontColor('#0d1937');
  sh.setColumnWidth(C.grade + 1, 70);
}

function rows_(sh) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, HEADERS.length).getValues().filter(function (r) { return r[C.id] !== '' && r[C.id] !== null; });
}

function findRow_(rows, id) {
  id = Number(id);
  if (!id) return null;
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i][C.id]) === id) return { row: rows[i], id: id };
  }
  return null;
}

/** 行番号はシートを並べ替えられても大丈夫なように、書く直前に受付番号で探し直す */
function rowIndex_(sh, id) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var ids = sh.getRange(2, C.id + 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (Number(ids[i][0]) === Number(id)) return i + 2;
  return 0;
}

/** シートに書く形：文字の欄は safe_ を通す（読み戻した値をそのまま書き戻しても数式にならない） */
var TEXT_COLS = [C.name, C.courtname, C.paidBy, C.handedBy, C.memo, C.source];
function forSheet_(row) {
  var out = row.slice();
  TEXT_COLS.forEach(function (c) { out[c] = safe_(out[c]); });
  return out;
}

function writeRow_(sh, r) {
  var at = rowIndex_(sh, r.id);
  if (!at) throw { code: 'not_found' };
  sh.getRange(at, 1, 1, HEADERS.length).setValues([forSheet_(r.row)]);
}

function appendRow_(sh, row) {
  var at = sh.getLastRow() + 1;
  sh.getRange(at, 1, 1, HEADERS.length).setValues([forSheet_(row)]);
  var box = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sh.getRange(at, C.paid + 1).setDataValidation(box);
  sh.getRange(at, C.handed + 1).setDataValidation(box);
}

function nextId_(rows) {
  var max = 0;
  rows.forEach(function (r) { var n = Number(r[C.id]); if (n > max) max = n; });
  return max + 1;
}

/* ---------- 返す形 ---------- */

function pub_(r) {
  var c = countsOf_(r);   // 役員がシートで枚数を直しても、合計と金額はここで数え直す
  return {
    id: Number(r[C.id]),
    name: String(r[C.name] || ''),
    courtname: String(r[C.courtname] || ''),
    grade: gradeOf_(r[C.grade]),
    counts: c,
    total: totalOf_(c),
    amount: amountOf_(c),
    status: String(r[C.status]) === STATUS_CANCELLED ? 'cancelled' : 'active',
    createdAt: iso_(r[C.createdAt]),
    updatedAt: iso_(r[C.updatedAt])
  };
}

function adminView_(r) {
  var o = pub_(r);
  o.paid = r[C.paid] === true || String(r[C.paid]).toUpperCase() === 'TRUE';
  o.paidBy = String(r[C.paidBy] || '');
  o.handed = r[C.handed] === true || String(r[C.handed]).toUpperCase() === 'TRUE';
  o.handedBy = String(r[C.handedBy] || '');
  o.memo = String(r[C.memo] || '');
  o.source = /^役員/.test(String(r[C.source])) ? 'admin' : 'form';
  return o;
}

/* ---------- 入力のチェック（画面側 api.js の validate とそろえる） ---------- */

function validate_(d) {
  var name = squish_(d.name), courtname = squish_(d.courtname), counts = {};
  if (!name || name.length > 40) throw { code: 'invalid' };
  if (courtname.length > 30) throw { code: 'invalid' };
  var src = d.counts && typeof d.counts === 'object' ? d.counts : {};
  ITEMS.forEach(function (it) {
    var raw = String(src[it.key] == null ? '' : src[it.key]).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).trim();
    if (raw === '') raw = '0';
    if (!/^\d{1,3}$/.test(raw)) throw { code: 'invalid' };
    var n = Number(raw);
    if (n > MAX_CELL) throw { code: 'invalid' };
    counts[it.key] = n;
  });
  var total = totalOf_(counts);
  if (total < 1 || total > MAX_TOTAL) throw { code: 'invalid' };
  var grade;                                  // 送ってこなければ undefined（今の学年をそのままにする）
  if ('grade' in d && d.grade !== null && String(d.grade) !== '') {
    grade = gradeOf_(d.grade);
    if (!grade) throw { code: 'invalid' };
  } else if ('grade' in d) grade = 0;          // 役員の画面で「未入力」に戻したとき
  return { name: name, courtname: courtname, counts: counts, grade: grade };
}

/** 1 / '1' / '1年' / '１年' → 1。学年でなければ 0 */
function gradeOf_(v) {
  var m = String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).match(/^\s*(\d)\s*(年|年生)?\s*$/);
  var n = m ? Number(m[1]) : 0;
  return GRADES.indexOf(n) >= 0 ? n : 0;
}

function squish_(v) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function str_(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';
}

/** = + - @ で始まる文字はシートで数式として動いてしまうので、先頭に ' をつけて文字のまま入れる */
function safe_(s) {
  s = String(s == null ? '' : s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function iso_(v) {
  return v instanceof Date ? v.toISOString() : (v ? String(v) : '');
}

/* ---------- 道具 ---------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };   // 待ちきれないときは「混み合っています」を返す
  try { return fn(); } finally { lock.releaseLock(); }
}

function countUp_(key, ttl, max) {
  var cache = CacheService.getScriptCache();
  var k = key + ':' + Math.floor(Date.now() / (ttl * 1000));
  var n = Number(cache.get(k) || 0);
  if (n >= max) return false;
  cache.put(k, String(n + 1), ttl);
  return true;
}

/** 合言葉の表記ゆれをそろえる：全角・半角、ひらがな・カタカナ、大文字・小文字、空白、濁点の付け方 */
function normPass_(s) {
  s = String(s == null ? '' : s);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  return s.replace(/\s+/g, '').replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }).toLowerCase();
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var x = 0;
  for (var i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 動作確認：エディタで実行すると、テスト用の申し込みを1件入れて、すぐ取り消す */
function testSubmit() {
  var counts = {};
  ITEMS.forEach(function (it, i) { counts[it.key] = i === 0 ? 1 : 0; });
  var res = submit_({ name: 'テスト 太郎', courtname: 'テスト', counts: counts, requestId: Utilities.getUuid() });
  console.log(JSON.stringify(res));
  if (res.ok) console.log(JSON.stringify(cancelOwn_({ id: res.item.id, token: res.token })));
}
