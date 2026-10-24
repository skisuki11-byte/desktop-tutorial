/** 小さな道具箱。日付・ID・文字列まわり。 */

/** 先頭を英字にしておく。数字だけのIDはスプレッドシートに数値として入り、照合が狂うため */
function uid_() {
  return 'x' + Utilities.getUuid().replace(/-/g, '').slice(0, 11);
}

function now_() {
  return new Date();
}

/** 表示用の日時（例: 8/8(金) 15:00） */
function fmtDateTime_(d) {
  if (!d) return '';
  return Utilities.formatDate(d, TZ, 'M/d') + '(' + youbi_(d) + ') ' + Utilities.formatDate(d, TZ, 'HH:mm');
}

/** 表示用の日付（例: 8/8(金)） */
function fmtDate_(d) {
  if (!d) return '';
  return Utilities.formatDate(d, TZ, 'M/d') + '(' + youbi_(d) + ')';
}

function youbi_(d) {
  // スクリプトのタイムゾーンが Asia/Tokyo なので getDay() はそのまま日本時間の曜日
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
}

/** 保存用の文字列（例: 2026-08-08T15:00:00） */
function toLocalIso_(d) {
  if (!d) return '';
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Claude が返してくる日時文字列を Date に変える。
 * "2026-08-08" / "2026-08-08T15:00" / "2026-08-08T15:00:00" を受ける。
 * タイムゾーン付き（末尾Zや+09:00）ならそのまま解釈する。
 */
function parseLocal_(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    var d0 = new Date(s);
    return isNaN(d0.getTime()) ? null : d0;
  }
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) {
    var d1 = new Date(s);
    return isNaN(d1.getTime()) ? null : d1;
  }
  // スクリプトのタイムゾーン（Asia/Tokyo）で組み立てる
  var d = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
  );
  return isNaN(d.getTime()) ? null : d;
}

/** 日付だけ指定（時刻なし）かどうか */
function isDateOnly_(s) {
  return !!(s && /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()));
}

function addMinutes_(d, min) {
  return new Date(d.getTime() + min * 60000);
}

function addDays_(d, days) {
  return new Date(d.getTime() + days * 86400000);
}

/** その日の 00:00 */
function startOfDay_(d) {
  return parseLocal_(Utilities.formatDate(d, TZ, 'yyyy-MM-dd'));
}

function truncate_(s, n) {
  s = String(s == null ? '' : s);
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/** 落ちないJSON.parse */
function tryParse_(s, fallback) {
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

/** 文章の中から最初のJSONオブジェクト／配列を取り出す */
function extractJson_(text) {
  if (!text) return null;
  var fence = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    var inner = tryParse_(fence[1].trim(), null);
    if (inner) return inner;
  }
  var start = String(text).search(/[{[]/);
  if (start < 0) return null;
  for (var end = text.length; end > start; end--) {
    var cand = tryParse_(text.slice(start, end), null);
    if (cand) return cand;
  }
  return null;
}

/** Stackdriver に残す（実行数 → ログ で見られる） */
function log_(tag, obj) {
  try {
    console.log(tag + ' ' + (typeof obj === 'string' ? obj : JSON.stringify(obj)));
  } catch (e) {
    console.log(tag);
  }
}
