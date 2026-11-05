/** @OnlyCurrentDoc */
// ↑ 権限を「このスプレッドシートだけ」に絞る印。消さないでください。

/**
 * 春高タオル 申し込みの集計先（Google Apps Script）
 *
 * このスクリプトを「申し込みを貯める Google スプレッドシート」に入れて、ウェブアプリとして公開する。
 *   - 各家庭の申し込みは、シート「申込」に1件1行で貯まる
 *   - 役員の集計画面は、合言葉（スクリプトのプロパティ ADMIN_PASS）を知っている人だけが読める
 *   - 家庭は、自分の申し込みだけを「受付番号＋合鍵（token）」で変更・取り消しできる
 *   - シートを役員が直接さわっても（チェックボックス・枚数の修正）、集計画面にそのまま反映される
 *
 * 設定は gas/README.md を参照。
 */

var SHEET_NAME = '申込';
var HEADERS = ['受付番号', '受付日時', '更新日時', 'お名前', 'コートネーム', '枚数', '状態',
  '集金', '集金の記録', '受け渡し', '受け渡しの記録', '役員メモ', '経路', 'requestId', 'token'];
var C = { id: 0, createdAt: 1, updatedAt: 2, name: 3, courtname: 4, count: 5, status: 6,
  paid: 7, paidBy: 8, handed: 9, handedBy: 10, memo: 11, source: 12, requestId: 13, token: 14 };
var STATUS_ACTIVE = '有効', STATUS_CANCELLED = '取り消し';
var MAX_COUNT = 50;          // 1件の上限（画面側の上限 maxPerOrder より大きめにしておく）
var MAX_SUBMIT_PER_HOUR = 300;
var MAX_FAIL = 20;           // 合言葉の失敗を10分あたり何回まで受け付けるか

function doGet() {
  return json_({ ok: true, app: 'towel' });   // 公開URLをブラウザで開いたときの動作確認用
}

function doPost(e) {
  var d;
  try {
    if (!e || !e.postData || e.postData.contents.length > 20000) return json_({ ok: false, error: 'bad_request' });
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!d || d.app !== 'towel') return json_({ ok: false, error: 'bad_request' });
  try {
    switch (d.action) {
      case 'ping': return json_({ ok: true });
      case 'submit': return json_(submit_(d));
      case 'mine': return json_(mine_(d));
      case 'update': return json_(updateOwn_(d));
      case 'cancel': return json_(cancelOwn_(d));
      case 'admin_login': return json_(admin_(d, function () { return { ok: true }; }));
      case 'admin_list': return json_(admin_(d, adminList_));
      case 'admin_save': return json_(admin_(d, adminSave_));
      case 'admin_add': return json_(admin_(d, adminAdd_));
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
  if (d.website) return { ok: true, item: { id: 0, name: '', courtname: '', count: 0, status: 'active' }, token: '' };  // ボット（見えない欄に入力）
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
    var now = new Date(), row = new Array(HEADERS.length);
    row[C.id] = nextId_(rows);
    row[C.createdAt] = now; row[C.updatedAt] = now;
    row[C.name] = v.name; row[C.courtname] = v.courtname; row[C.count] = v.count;
    row[C.status] = STATUS_ACTIVE;
    row[C.paid] = false; row[C.paidBy] = ''; row[C.handed] = false; row[C.handedBy] = '';
    row[C.memo] = ''; row[C.source] = 'フォーム';
    row[C.requestId] = requestId || Utilities.getUuid();
    row[C.token] = Utilities.getUuid();
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
  return { ok: true, items: out };
}

function updateOwn_(d) {
  var v = validate_(d);
  return withLock_(function () {
    var sh = sheet_(), r = own_(sh, d);
    r.row[C.name] = v.name; r.row[C.courtname] = v.courtname; r.row[C.count] = v.count;
    r.row[C.status] = STATUS_ACTIVE;
    r.row[C.updatedAt] = new Date();
    writeRow_(sh, r);
    return { ok: true, item: pub_(reread_(sh, r)) };
  });
}

function cancelOwn_(d) {
  return withLock_(function () {
    var sh = sheet_(), r = own_(sh, d);
    r.row[C.status] = STATUS_CANCELLED;
    r.row[C.updatedAt] = new Date();
    writeRow_(sh, r);
    return { ok: true, item: pub_(reread_(sh, r)) };
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
  return { ok: true, items: rows.map(adminView_), serverTime: new Date().toISOString() };
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
    if ('name' in p || 'courtname' in p || 'count' in p) {
      var v = validate_(p);
      r.row[C.name] = v.name; r.row[C.courtname] = v.courtname; r.row[C.count] = v.count;
      r.row[C.updatedAt] = new Date();
    }
    writeRow_(sh, r);
    return { ok: true, item: adminView_(reread_(sh, r)) };
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
    var now = new Date(), row = new Array(HEADERS.length);
    row[C.id] = nextId_(rows);
    row[C.createdAt] = now; row[C.updatedAt] = now;
    row[C.name] = v.name; row[C.courtname] = v.courtname; row[C.count] = v.count;
    row[C.status] = STATUS_ACTIVE;
    row[C.paid] = false; row[C.paidBy] = ''; row[C.handed] = false; row[C.handedBy] = '';
    row[C.memo] = str_(d.memo, 200);
    row[C.source] = '役員が追加（' + (str_(d.officer, 12) || '役員') + '）';
    row[C.requestId] = requestId || Utilities.getUuid();
    row[C.token] = Utilities.getUuid();
    appendRow_(sh, row);
    return { ok: true, item: adminView_(row) };
  });
}

/* ---------- シート ---------- */

/** 最初に1回だけ実行する：シート「申込」を作り、見出し・幅・チェックボックスを整える */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#12235a').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(C.id + 1, 80);
  sh.setColumnWidths(C.createdAt + 1, 2, 130);
  sh.setColumnWidth(C.name + 1, 160);
  sh.setColumnWidth(C.courtname + 1, 140);
  sh.setColumnWidth(C.count + 1, 60);
  sh.setColumnWidths(C.paid + 1, 4, 110);
  sh.setColumnWidth(C.memo + 1, 200);
  sh.getRange('B:C').setNumberFormat('yyyy/mm/dd hh:mm');
  sh.hideColumns(C.requestId + 1, 2);   // requestId と token は家庭の「合鍵」なので見えないようにしておく
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASS')) console.log('スクリプトのプロパティ ADMIN_PASS（役員の合言葉）を設定してください');
  console.log('準備ができました：シート「' + SHEET_NAME + '」');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { setup(); sh = ss.getSheetByName(SHEET_NAME); }
  return sh;
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

function writeRow_(sh, r) {
  var at = rowIndex_(sh, r.id);
  if (!at) throw { code: 'not_found' };
  sh.getRange(at, 1, 1, HEADERS.length).setValues([forSheet_(r.row)]);
}

/** シートに書く形：文字の欄は safe_ を通す（読み戻した値をそのまま書き戻しても数式にならない） */
var TEXT_COLS = [C.name, C.courtname, C.paidBy, C.handedBy, C.memo, C.source];
function forSheet_(row) {
  var out = row.slice();
  TEXT_COLS.forEach(function (c) { out[c] = safe_(out[c]); });
  return out;
}

function reread_(sh, r) {
  var at = rowIndex_(sh, r.id);
  return sh.getRange(at, 1, 1, HEADERS.length).getValues()[0];
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
  return {
    id: Number(r[C.id]),
    name: String(r[C.name] || ''),
    courtname: String(r[C.courtname] || ''),
    count: Number(r[C.count]) || 0,
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
  var name = squish_(d.name), courtname = squish_(d.courtname);
  var raw = String(d.count == null ? '' : d.count).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).trim();
  var count = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!name || name.length > 40) throw { code: 'invalid' };
  if (courtname.length > 30) throw { code: 'invalid' };
  if (isNaN(count) || count < 1 || count > MAX_COUNT) throw { code: 'invalid' };
  return { name: name, courtname: courtname, count: count };
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
  return s.replace(/\s+/g, '').replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }).toLowerCase();
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
  var res = submit_({ name: 'テスト 太郎', courtname: 'テスト', count: 1, requestId: Utilities.getUuid() });
  console.log(JSON.stringify(res));
  if (res.ok) console.log(JSON.stringify(cancelOwn_({ id: res.item.id, token: res.token })));
}
