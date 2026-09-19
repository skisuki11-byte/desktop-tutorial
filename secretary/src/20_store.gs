/**
 * 記録の置き場所。1枚のスプレッドシートに4つのシートを作って使う。
 *
 *   tasks   … 依頼された用事。終わるまで消えない
 *   memos   … メモ・議事録
 *   memory  … 覚えたこと（好み・習慣・固有名詞）。ここが「育つ」ところ
 *   log     … 会話の記録。文脈と、夜のふりかえりに使う
 */

var SHEETS = {
  tasks: ['id', 'userId', 'title', 'detail', 'due', 'remindAt', 'status', 'nudges', 'lastNudgeAt', 'createdAt', 'updatedAt'],
  memos: ['id', 'userId', 'text', 'tags', 'createdAt'],
  memory: ['id', 'userId', 'category', 'fact', 'hits', 'createdAt', 'updatedAt'],
  log: ['ts', 'userId', 'role', 'text']
};

function book_() {
  var id = cfg_('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID がありません。先に setup() を実行してください。');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** シート全体を { 列名: 値 } の配列で読む。行番号は _row に入れておく */
function rows_(name) {
  var values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 };
    for (var c = 0; c < head.length; c++) o[head[c]] = values[i][c];
    out.push(o);
  }
  return out;
}

/** 1行足す。id と createdAt は無ければ入れる */
function insert_(name, obj) {
  var sh = sheet_(name);
  var head = SHEETS[name];
  if (head.indexOf('id') >= 0 && !obj.id) obj.id = uid_();
  if (head.indexOf('createdAt') >= 0 && !obj.createdAt) obj.createdAt = toLocalIso_(now_());
  if (head.indexOf('updatedAt') >= 0) obj.updatedAt = toLocalIso_(now_());
  sh.appendRow(head.map(function (k) { return obj[k] == null ? '' : obj[k]; }));
  return obj;
}

/** id で1行探す */
function find_(name, id) {
  if (!id) return null;
  var all = rows_(name);
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id) === String(id)) return all[i];
  }
  return null;
}

/** id の行を部分的に書き換える */
function update_(name, id, patch) {
  var rec = find_(name, id);
  if (!rec) return null;
  var head = SHEETS[name];
  if (head.indexOf('updatedAt') >= 0) patch.updatedAt = toLocalIso_(now_());
  var sh = sheet_(name);
  Object.keys(patch).forEach(function (k) {
    var c = head.indexOf(k);
    if (c >= 0) {
      sh.getRange(rec._row, c + 1).setValue(patch[k]);
      rec[k] = patch[k];
    }
  });
  return rec;
}

/** id の行を消す */
function remove_(name, id) {
  var rec = find_(name, id);
  if (!rec) return false;
  sheet_(name).deleteRow(rec._row);
  return true;
}

/* ---------- 会話ログ ---------- */

function logAppend_(userId, role, text) {
  insert_('log', { ts: toLocalIso_(now_()), userId: userId, role: role, text: truncate_(text, 4000) });
}

/** 直近の会話を Claude に渡せる形で返す */
function logRecent_(userId, limit) {
  var all = rows_('log').filter(function (r) { return String(r.userId) === String(userId); });
  var tail = all.slice(Math.max(0, all.length - limit));
  return tail.map(function (r) {
    return { role: r.role === 'assistant' ? 'assistant' : 'user', content: String(r.text || '') };
  }).filter(function (m) { return m.content; });
}

/** 指定した時刻より後のログ（夜のふりかえり用） */
function logSince_(userId, since) {
  return rows_('log').filter(function (r) {
    if (String(r.userId) !== String(userId)) return false;
    var t = parseLocal_(r.ts);
    return t && t >= since;
  });
}

/** ログが増えすぎたら古いものを捨てる */
function logTrim_(keep) {
  var sh = sheet_('log');
  var n = sh.getLastRow() - 1;
  if (n > keep) sh.deleteRows(2, n - keep);
}
