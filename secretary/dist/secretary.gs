/* =====================================================================
 * AI秘書 — これ1つで動きます
 *
 * src/ の中身をつないだものです。中身を直すときは src/ のほうを直して
 * tools/build.py を動かし直してください。
 *
 * 【使いかた】
 *  1. script.google.com で「新しいプロジェクト」
 *  2. 最初からある「コード.gs」の中身を消して、このファイルをぜんぶ貼る
 *  3. ⚙プロジェクトの設定 →「appsscript.json をエディタで表示する」にチェック
 *     → appsscript.json を src/appsscript.json の中身に差し替える
 *  4. 同じ画面の「スクリプト プロパティ」に鍵を3つ入れる
 *       GEMINI_API_KEY             … aistudio.google.com/apikey で発行（無料）
 *       LINE_CHANNEL_ACCESS_TOKEN  … LINE Developers の長期アクセストークン
 *       WEBHOOK_TOKEN              … 自分で決めた合言葉
 *  5. 関数リストから setup を選んで実行（初回は承認を求められます）
 *  6. デプロイ → ウェブアプリ → 出たURLの末尾に ?token=合言葉 を付けて
 *     LINE Developers の Webhook URL に貼る
 *
 * くわしくは README.md を見てください。
 * ===================================================================== */



/* ===== 00_config.gs ===== */

/**
 * 設定のまとめ。
 *
 * 鍵やIDはコードに書かず、すべて「スクリプト プロパティ」に入れます。
 * （エディタ左の ⚙ プロジェクトの設定 → スクリプト プロパティ）
 *
 * 入れるもの：
 *   GEMINI_API_KEY             … Google AI Studio のAPIキー（無料。既定はこちら）
 *   LINE_CHANNEL_ACCESS_TOKEN  … LINE Developers の「長期のアクセストークン」
 *   WEBHOOK_TOKEN              … 自分で決めた合言葉（Webhook URLの ?token= に付ける）
 *   SPREADSHEET_ID             … 記録用スプレッドシートのID（setup() が自動で入れます）
 *   OWNER_USER_ID              … 持ち主のLINE userId（初回メッセージで自動で入ります）
 *
 * 任意：
 *   PROVIDER      … 頭脳をどれにするか。gemini（既定・無料）または claude（有料）
 *   GEMINI_MODEL  … 既定 gemini-3-flash。違うと言われたら listGeminiModels で確かめる
 *   CALENDAR_ID   … 使うカレンダー。既定は自分のメインカレンダー
 *   OWNER_NAME    … 呼びかたに使う名前。既定「あなた」
 *   MORNING_HOUR  … 朝のお知らせの時刻（0-23）。既定 7
 *   PUSH_LIMIT    … こちらから送る通数の月あたり上限。既定 190（LINE無料枠は200）
 *
 * PROVIDER = claude にするときだけ：
 *   ANTHROPIC_API_KEY … Claude のAPIキー（sk-ant-... ）
 *   MODEL             … 既定 claude-opus-5。速さと安さなら claude-sonnet-5
 *   EFFORT            … どこまで考えさせるか low/medium/high/xhigh/max。既定 medium
 */

var CFG_DEFAULTS = {
  PROVIDER: 'gemini',
  GEMINI_MODEL: 'gemini-3-flash',
  CALENDAR_ID: 'primary',
  MODEL: 'claude-opus-5',
  EFFORT: 'medium',
  OWNER_NAME: 'あなた',
  MORNING_HOUR: '7',
  PUSH_LIMIT: '190'
};

/* Claude API */
var ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2023-06-01';

/* 考えた分もここに含まれる。予定の登録程度なら十分だが、絞りすぎると途中で切れる */
var MAX_TOKENS = 8000;

/* 断られたときに別のモデルで引き受け直させる（安全側の判定に触れたとき用） */
var FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/* 道具を使わせる往復の上限。増やすほど賢いが、LINEの返信が遅くなる */
var MAX_TOOL_TURNS = 6;

/* 会話の文脈として読み返す直近の発言数（往復ではなく件数） */
var HISTORY_TURNS = 20;

/* やり残しの催促のしかた */
var NUDGE_LEAD_MIN = 60;      // 期限の何分前に最初の声かけをするか
var NUDGE_INTERVAL_H = 3;     // 期限を過ぎたあと、何時間おきに催促するか
var NUDGE_MAX = 8;            // 何回まで催促するか（これを超えたら「まだ要る？」と聞く）
var QUIET_START_HOUR = 22;    // この時刻から翌朝まで催促しない
var QUIET_END_HOUR = 8;

var TZ = 'Asia/Tokyo';

/** プロパティを1つ読む。無ければ既定値、それも無ければ '' */
function cfg_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v !== null && v !== '') return v;
  return CFG_DEFAULTS[key] || '';
}

/** プロパティを1つ書く */
function cfgSet_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/** 必須の設定が入っているか確かめる。足りなければ例外 */
function cfgRequire_(keys) {
  var missing = keys.filter(function (k) { return !cfg_(k); });
  if (missing.length) {
    throw new Error('スクリプト プロパティが足りません: ' + missing.join(', '));
  }
}


/* ===== 10_util.gs ===== */

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


/* ===== 20_store.gs ===== */

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


/* ===== 30_line.gs ===== */

/** LINE Messaging API とのやりとり。 */

var LINE_API = 'https://api.line.me/v2/bot';
var LINE_DATA_API = 'https://api-data.line.me/v2/bot';

function lineHeaders_() {
  return {
    Authorization: 'Bearer ' + cfg_('LINE_CHANNEL_ACCESS_TOKEN'),
    'Content-Type': 'application/json'
  };
}

/** 長い文章をLINEの吹き出しに収まる形に割る（1通5000字、1回5通まで） */
function toMessages_(text) {
  var s = String(text == null ? '' : text).trim();
  if (!s) s = '（返事を作れませんでした）';
  var out = [];
  while (s.length > 0 && out.length < 5) {
    out.push({ type: 'text', text: s.slice(0, 4900) });
    s = s.slice(4900);
  }
  return out;
}

/** 返信トークンで返す。失敗したら false */
function lineReply_(replyToken, text) {
  if (!replyToken) return false;
  var res = UrlFetchApp.fetch(LINE_API + '/message/reply', {
    method: 'post',
    headers: lineHeaders_(),
    payload: JSON.stringify({ replyToken: replyToken, messages: toMessages_(text) }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    log_('lineReply失敗', res.getResponseCode() + ' ' + res.getContentText());
    return false;
  }
  return true;
}

/**
 * 無料枠の残りを数える。
 *
 * LINEのフリープランは月200通。ただし数えられるのは「こちらから送る分」だけで、
 * 会話の返信（lineReply_）は何回でもカウントされません。上限に達しても
 * 勝手に有料へ切り替わることはなく、その月は送れなくなるだけです。
 * とはいえ催促が黙って止まると困るので、こちらで手前に線を引いておきます。
 */
function pushQuota_() {
  var props = PropertiesService.getScriptProperties();
  var month = Utilities.formatDate(now_(), TZ, 'yyyy-MM');

  if (props.getProperty('PUSH_MONTH') !== month) {   // 月が変わったら数え直す
    props.setProperty('PUSH_MONTH', month);
    props.setProperty('PUSH_COUNT', '0');
  }
  var used = Number(props.getProperty('PUSH_COUNT') || 0);
  var limit = Number(cfg_('PUSH_LIMIT')) || 190;
  return { used: used, limit: limit, left: Math.max(0, limit - used) };
}

function pushCounted_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PUSH_COUNT', String(Number(props.getProperty('PUSH_COUNT') || 0) + 1));
}

/** こちらから送る（朝のお知らせ・催促・返信が間に合わなかったとき） */
function linePush_(userId, text) {
  if (!userId) return false;

  var q = pushQuota_();
  if (q.left <= 0) {
    log_('push見送り', '今月の無料枠を使い切りました（' + q.used + '/' + q.limit + '）');
    return false;
  }
  if (q.left === 1) {
    text += '\n\n※ 今月こちらから送れる分（' + q.limit + '通）を使い切りました。' +
            '来月まで、お知らせと催促は止まります。返信はこれまでどおりできます。';
  }

  var res = UrlFetchApp.fetch(LINE_API + '/message/push', {
    method: 'post',
    headers: lineHeaders_(),
    payload: JSON.stringify({ to: userId, messages: toMessages_(text) }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    log_('linePush失敗', res.getResponseCode() + ' ' + res.getContentText());
    return false;
  }
  pushCounted_();
  return true;
}

/** 「入力中…」の表示を出す（考えている間、相手を待たせている感じを減らす） */
function lineLoading_(userId, seconds) {
  try {
    UrlFetchApp.fetch(LINE_API + '/chat/loading/start', {
      method: 'post',
      headers: lineHeaders_(),
      payload: JSON.stringify({ chatId: userId, loadingSeconds: Math.min(60, Math.max(5, seconds || 30)) }),
      muteHttpExceptions: true
    });
  } catch (e) {
    // 出せなくても本題には関係ないので黙って進む
  }
}

/** 送られてきた画像などの中身を取りに行く */
function lineContent_(messageId) {
  var res = UrlFetchApp.fetch(LINE_DATA_API + '/message/' + messageId + '/content', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + cfg_('LINE_CHANNEL_ACCESS_TOKEN') },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;
  return res.getBlob();
}

/** 表示名を取る（挨拶に使う程度） */
function lineProfileName_(userId) {
  try {
    var res = UrlFetchApp.fetch(LINE_API + '/profile/' + userId, {
      method: 'get',
      headers: lineHeaders_(),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return '';
    return tryParse_(res.getContentText(), {}).displayName || '';
  } catch (e) {
    return '';
  }
}


/* ===== 40_llm.gs ===== */

/**
 * 頭脳の窓口。どのAIを使うかは、ここ1か所で切り替わる。
 *
 *   PROVIDER = gemini … Googleの無料枠（既定）
 *   PROVIDER = claude … Anthropic。賢いが有料
 *
 * ほかのファイルは llmRun_ / llmAsk_ しか呼ばない。
 * 中身を差し替えても、道具も記憶も催促もそのまま動く。
 */

/**
 * 道具つきで考えさせ、最後の文章を返す。
 *
 * @param {string} system    指示文
 * @param {Array}  messages  会話。[{role:'user'|'assistant', content: 文字列 or ブロック配列}]
 * @param {Array}  tools     道具の定義（Anthropic の書き方）。null なら道具なし
 * @param {string} userId    道具を実行するときの持ち主
 * @return {{text: string, used: Array}}
 */
function llmRun_(system, messages, tools, userId) {
  normalize_(messages);
  return provider_() === 'claude'
    ? claudeRun_(system, messages, tools, userId)
    : geminiRun_(system, messages, tools, userId);
}

/** 道具なしで一言だけ書かせたいとき（朝のお知らせ、夜のふりかえり） */
function llmAsk_(system, userText) {
  return provider_() === 'claude'
    ? claudeAsk_(system, userText)
    : geminiAsk_(system, userText);
}

function provider_() {
  return String(cfg_('PROVIDER') || 'gemini').toLowerCase() === 'claude' ? 'claude' : 'gemini';
}

/** いま選んでいる頭脳に必要な鍵が入っているか確かめる */
function requireBrainKey_() {
  cfgRequire_(provider_() === 'claude' ? ['ANTHROPIC_API_KEY'] : ['GEMINI_API_KEY']);
}

/* ---------------- どちらでも使う小道具 ---------------- */

/**
 * 会話をAPIが受け取れる形に整える（配列そのものを書き換える）。
 * ・user と assistant が交互になっていないと弾かれるので、続いた分はつなぐ
 * ・先頭は user から始める
 */
function normalize_(messages) {
  while (messages.length && messages[0].role !== 'user') messages.shift();

  for (var i = messages.length - 1; i > 0; i--) {
    if (messages[i].role !== messages[i - 1].role) continue;
    var prev = messages[i - 1];
    var cur = messages[i];
    if (typeof prev.content === 'string' && typeof cur.content === 'string') {
      prev.content = prev.content + '\n' + cur.content;
    } else {
      prev.content = asBlocks_(prev.content).concat(asBlocks_(cur.content));
    }
    messages.splice(i, 1);
  }
  return messages;
}

function asBlocks_(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content || [];
}

/** 返ってきたブロックから文章だけ取り出してつなぐ */
function textOf_(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n')
    .trim();
}

/** 待ち時間を倍にしながら試し直す（混雑・向こうの不調のとき） */
function retryable_(code) {
  return code === 429 || code >= 500;
}


/* ===== 41_claude.gs ===== */

/**
 * Claude（Anthropic）で動かすときの中身。PROVIDER = claude のときだけ使われる。
 *
 * Claude は「この道具を使いたい」と言ってくるだけで、実行はこちらの役目。
 * 実行結果を返してもう一度聞く、を答えが出るまで繰り返す。
 */

/** 送る中身を組み立てる。モデルと考える深さはここで一括して決める */
function buildPayload_(system, messages, tools) {
  var payload = {
    model: cfg_('MODEL'),
    max_tokens: MAX_TOKENS,
    output_config: { effort: cfg_('EFFORT') },
    system: system,
    messages: messages,
    fallbacks: 'default'      // 安全側の判定で断られたとき、別のモデルが引き受け直す
  };
  if (tools && tools.length) payload.tools = tools;
  return payload;
}

/** /v1/messages を叩く。混んでいるときは少し待って計3回まで試す */
function claudeCall_(payload) {
  requireBrainKey_();
  var wait = 1000;
  var useFallback = !!payload.fallbacks;

  for (var attempt = 1; attempt <= 4; attempt++) {
    var headers = {
      'x-api-key': cfg_('ANTHROPIC_API_KEY'),
      'anthropic-version': ANTHROPIC_VERSION
    };
    if (useFallback) headers['anthropic-beta'] = FALLBACK_BETA;

    var res = UrlFetchApp.fetch(ANTHROPIC_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code === 200) return JSON.parse(body);

    // 429（混雑）と5xx（向こうの不調）だけ待って試し直す
    if (retryable_(code) && attempt < 4) {
      Utilities.sleep(wait);
      wait *= 2;
      continue;
    }

    // 引き受け直しの仕組みだけが原因なら、それを外してもう一度だけ試す
    if (code === 400 && useFallback && /fallback|beta/i.test(body)) {
      log_('fallbackを外して再試行', truncate_(body, 200));
      delete payload.fallbacks;
      useFallback = false;
      continue;
    }

    log_('claude失敗', code + ' ' + body);
    throw new Error('Claude API エラー (' + code + '): ' + truncate_(body, 300));
  }
  throw new Error('Claude API に届きませんでした');
}

/**
 * 道具つきで一往復以上させ、最後の文章を返す。
 *
 * @param {string} system      指示文
 * @param {Array}  messages    会話（この配列は書き足される）
 * @param {Array}  tools       道具の定義。null なら道具なし
 * @param {string} userId      道具を実行するときの持ち主
 * @return {{text: string, used: Array}}  返事と、使った道具の名前
 */
function claudeRun_(system, messages, tools, userId) {
  var used = [];

  for (var turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    var res = claudeCall_(buildPayload_(system, messages, tools));
    messages.push({ role: 'assistant', content: res.content });

    // 安全側の判定で断られたとき。中身が空のことがあるので先に見る
    if (res.stop_reason === 'refusal') {
      return { text: 'その内容にはお答えできませんでした。言いかたを変えてもう一度お願いします。', used: used };
    }

    if (res.stop_reason !== 'tool_use') {
      var out = textOf_(res.content);
      if (!out && res.stop_reason === 'max_tokens') {
        out = '（長くなりすぎて途中で切れました。分けて聞いてください）';
      }
      return { text: out, used: used };
    }

    // 使いたいと言われた道具を、こちらで順に実行する
    var results = [];
    res.content.forEach(function (block) {
      if (block.type !== 'tool_use') return;
      used.push(block.name);
      var out;
      try {
        out = runTool_(block.name, block.input || {}, userId);
      } catch (e) {
        out = { ok: false, error: String(e && e.message ? e.message : e) };
      }
      log_('tool:' + block.name, out);
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(out),
        is_error: out && out.ok === false
      });
    });

    if (!results.length) return { text: textOf_(res.content), used: used };
    messages.push({ role: 'user', content: results });
  }

  // 上限まで回っても終わらなかったとき。今わかっている分だけ言わせる
  return { text: '（途中までしか進められませんでした。もう一度お願いできますか）', used: used };
}

/** 道具なしで一言だけ書かせたいとき（朝のお知らせ、ふりかえりなど） */
function claudeAsk_(system, userText) {
  var res = claudeCall_(buildPayload_(system, [{ role: 'user', content: userText }], null));
  if (res.stop_reason === 'refusal') return '';
  return textOf_(res.content);
}


/* ===== 42_gemini.gs ===== */

/**
 * Gemini（Googleの無料枠）で動かすときの中身。
 *
 * 会話の持ちかたが Anthropic と違うので、入口で一度だけ形を変えてから
 * あとはずっと Gemini の形のまま往復する。
 *
 *   Anthropic          Gemini
 *   role: assistant →  role: model
 *   tool_use        →  functionCall
 *   tool_result     →  functionResponse
 *   image           →  inlineData
 *
 * ⚠ 無料枠は、送った内容がGoogleの製品改善に使われます。
 *   それが困る場合は、課金を有効にするか PROVIDER を claude にしてください。
 */

var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** 道具つきで往復する */
function geminiRun_(system, messages, tools, userId) {
  var contents = toGeminiContents_(messages);
  var decls = (tools && tools.length) ? toolDeclsGemini_() : [];
  var used = [];

  for (var turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    var res = geminiCall_(system, contents, decls);

    // 安全側の判定で止められたとき
    var blocked = res.promptFeedback && res.promptFeedback.blockReason;
    if (blocked) {
      log_('gemini拒否', blocked);
      return { text: 'その内容にはお答えできませんでした。言いかたを変えてもう一度お願いします。', used: used };
    }

    var cand = (res.candidates || [])[0];
    if (!cand) return { text: '（返事を作れませんでした）', used: used };

    var parts = (cand.content && cand.content.parts) || [];
    contents.push({ role: 'model', parts: parts });

    var calls = parts.filter(function (p) { return p.functionCall; });

    if (!calls.length) {
      var text = parts
        .filter(function (p) { return p.text; })
        .map(function (p) { return p.text; })
        .join('\n')
        .trim();

      if (!text && cand.finishReason === 'MAX_TOKENS') {
        text = '（長くなりすぎて途中で切れました。分けて聞いてください）';
      }
      if (!text && cand.finishReason === 'SAFETY') {
        text = 'その内容にはお答えできませんでした。';
      }
      return { text: text || '（返事を作れませんでした）', used: used };
    }

    // 使いたいと言われた道具を、こちらで順に実行する
    var answers = calls.map(function (p) {
      var name = p.functionCall.name;
      used.push(name);
      var out;
      try {
        out = runTool_(name, p.functionCall.args || {}, userId);
      } catch (e) {
        out = { ok: false, error: String(e && e.message ? e.message : e) };
      }
      log_('tool:' + name, out);
      return { functionResponse: { name: name, response: out } };
    });
    contents.push({ role: 'user', parts: answers });
  }

  return { text: '（途中までしか進められませんでした。もう一度お願いできますか）', used: used };
}

/** 道具なしで一言だけ */
function geminiAsk_(system, userText) {
  var res = geminiCall_(system, [{ role: 'user', parts: [{ text: userText }] }], []);
  var cand = (res.candidates || [])[0];
  if (!cand) return '';
  return ((cand.content && cand.content.parts) || [])
    .filter(function (p) { return p.text; })
    .map(function (p) { return p.text; })
    .join('\n')
    .trim();
}

/* ---------------- 通信 ---------------- */

function geminiCall_(system, contents, decls) {
  requireBrainKey_();

  var payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: contents,
    generationConfig: { maxOutputTokens: MAX_TOKENS }
  };
  if (decls && decls.length) payload.tools = [{ functionDeclarations: decls }];

  var wait = 2000;    // 無料枠は1分あたりの回数が少ないので、少し長めに待つ
  var repicked = false;

  for (var attempt = 1; attempt <= 4; attempt++) {
    var url = GEMINI_BASE + encodeURIComponent(cfg_('GEMINI_MODEL')) +
              ':generateContent?key=' + encodeURIComponent(cfg_('GEMINI_API_KEY'));

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code === 200) return JSON.parse(body);

    if (retryable_(code) && attempt < 4) {
      Utilities.sleep(wait);
      wait *= 2;
      continue;
    }

    // モデルが無くなった／名前が違うとき。使えるものへ乗り換えて、一度だけ試し直す
    if (code === 404 && !repicked) {
      repicked = true;
      log_('モデルを選び直します', ensureGeminiModel_());
      continue;
    }

    log_('gemini失敗', code + ' ' + body);
    if (code === 404) {
      throw new Error('使えるモデルが見つかりません。listGeminiModels を実行して、' +
                      '出てきた名前を GEMINI_MODEL に入れてください。');
    }
    if (code === 429) {
      throw new Error('無料枠の回数上限に当たりました。少し時間をあけてください。');
    }
    throw new Error('Gemini API エラー (' + code + '): ' + truncate_(body, 300));
  }
  throw new Error('Gemini API に届きませんでした');
}

/* ---------------- 形の変換 ---------------- */

/** Anthropic の書き方の会話を、Gemini の contents に変える */
function toGeminiContents_(messages) {
  return messages.map(function (m) {
    var parts = [];
    if (typeof m.content === 'string') {
      if (m.content) parts.push({ text: m.content });
    } else {
      (m.content || []).forEach(function (b) {
        if (b.type === 'text' && b.text) {
          parts.push({ text: b.text });
        } else if (b.type === 'image' && b.source) {
          parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
        }
      });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts };
  }).filter(function (c) { return c.parts.length; });
}

/**
 * 道具の説明を Gemini の書き方に変える。
 * Anthropic 側でだけ動く道具（web_search）は、こちらでは実行できないので外す。
 */
function toolDeclsGemini_() {
  return toolDefs_()
    .filter(function (t) { return !!t.input_schema; })
    .map(function (t) {
      return { name: t.name, description: t.description, parameters: t.input_schema };
    });
}

/* ---------------- モデルの見つけかた ---------------- */

/* 使いたい順。速くて無料枠が広い flash 系を優先する */
var GEMINI_PREFERRED = ['gemini-3-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

/* 用途が違うので秘書には使えないもの */
var GEMINI_SKIP = /embedding|aqa|imagen|image|tts|audio|video|live|vision/i;

/** 自分の鍵で文章を書けるモデルの名前を並べて返す */
function geminiModelNames_() {
  cfgRequire_(['GEMINI_API_KEY']);
  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' +
      encodeURIComponent(cfg_('GEMINI_API_KEY')),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    log_('モデル一覧が取れません', res.getContentText());
    return [];
  }
  return (tryParse_(res.getContentText(), {}).models || [])
    .filter(function (m) {
      return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
    })
    .map(function (m) { return String(m.name).replace(/^models\//, ''); })
    .filter(function (name) { return !GEMINI_SKIP.test(name); });
}

/**
 * いま設定しているモデルが使えるか確かめ、駄目なら自動で選び直す。
 * setup から呼ばれるので、ふつうは自分で気にしなくて構いません。
 */
function ensureGeminiModel_() {
  var names = geminiModelNames_();
  if (!names.length) {
    return '★ モデル一覧を取れませんでした。GEMINI_API_KEY を確かめてください。';
  }

  var current = cfg_('GEMINI_MODEL');
  if (names.indexOf(current) >= 0) return 'モデル: ' + current;

  // 使いたい順に探し、無ければ flash 系、それも無ければ先頭
  var pick = '';
  for (var i = 0; i < GEMINI_PREFERRED.length && !pick; i++) {
    if (names.indexOf(GEMINI_PREFERRED[i]) >= 0) pick = GEMINI_PREFERRED[i];
  }
  if (!pick) {
    pick = names.filter(function (n) { return n.indexOf('flash') >= 0; })[0] || names[0];
  }

  cfgSet_('GEMINI_MODEL', pick);
  return 'モデル: ' + pick + '（' + current + ' は使えないので選び直しました）';
}

/** 使えるモデルをぜんぶ見たいとき。GEMINI_MODEL を自分で決めたい場合に */
function listGeminiModels() {
  var names = geminiModelNames_();
  console.log(names.length ? '使えるモデル:\n' + names.join('\n') : '★ 取得できませんでした');
  return names;
}


/* ===== 50_tools.gs ===== */

/**
 * 秘書に持たせる道具。
 *
 * 定義（Claude に見せる説明）と、実行（こちらでやること）が対になっている。
 * 説明文は Claude が読む唯一の手がかりなので、曖昧に書かない。
 */

function toolDefs_() {
  return [
    /* ---- 予定 ---- */
    {
      name: 'add_event',
      description: '予定をGoogleカレンダーに入れる。日時が決まっている用事はこれ。日時が未定のものは add_task を使う。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '予定の名前。短く（例: 歯医者、山田さんと打合せ）' },
          start: { type: 'string', description: '開始。"2026-08-08T15:00" 形式。終日なら "2026-08-08"' },
          end: { type: 'string', description: '終了。省略すると1時間後（終日なら当日中）' },
          location: { type: 'string', description: '場所。無ければ省略' },
          description: { type: 'string', description: '補足。無ければ省略' }
        },
        required: ['title', 'start']
      }
    },
    {
      name: 'list_events',
      description: '期間を指定してカレンダーの予定を読む。「今日の予定は？」「来週空いてる？」に答えるときに使う。',
      input_schema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '開始日。"2026-08-08" 形式' },
          to: { type: 'string', description: '終了日（この日を含む）。省略すると from と同じ日' }
        },
        required: ['from']
      }
    },
    {
      name: 'update_event',
      description: '既にある予定の時間・名前・場所を変える。先に list_events で event_id を調べること。',
      input_schema: {
        type: 'object',
        properties: {
          event_id: { type: 'string' },
          title: { type: 'string' },
          start: { type: 'string', description: '"2026-08-08T15:00" 形式' },
          end: { type: 'string' },
          location: { type: 'string' }
        },
        required: ['event_id']
      }
    },
    {
      name: 'delete_event',
      description: '予定を消す。先に list_events で event_id を調べること。消す前に本人に確認する。',
      input_schema: {
        type: 'object',
        properties: { event_id: { type: 'string' } },
        required: ['event_id']
      }
    },

    /* ---- 用事（やり通すためのもの） ---- */
    {
      name: 'add_task',
      description:
        'あとでやること・やってもらうことを控える。' +
        'その場で終わらない依頼は必ずこれに残すこと。残さなければ忘れる。' +
        '期限を入れておくと、こちらから声をかけて終わるまで追いかける。',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '何をするか。動詞で終える（例: 請求書を出す）' },
          detail: { type: 'string', description: '思い出すのに要る補足。相手の名前、金額、経緯など' },
          due: { type: 'string', description: '期限。"2026-08-08T17:00" または "2026-08-08"。無ければ省略' }
        },
        required: ['title']
      }
    },
    {
      name: 'list_tasks',
      description: '控えてある用事を読む。「何が残ってる？」に答えるとき、また新しい依頼が既にあるものと重なっていないか確かめるときに使う。',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'done', 'all'], description: '既定は open（未完了）' }
        }
      }
    },
    {
      name: 'complete_task',
      description: '用事が終わったことにする。「あれ終わったよ」と言われたら、list_tasks で探してからこれを呼ぶ。',
      input_schema: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id']
      }
    },
    {
      name: 'update_task',
      description: '用事の中身や期限を直す。取りやめるときは status に canceled を入れる。',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
          due: { type: 'string' },
          status: { type: 'string', enum: ['open', 'done', 'canceled'] }
        },
        required: ['task_id']
      }
    },

    /* ---- メモ・議事録 ---- */
    {
      name: 'save_memo',
      description:
        'メモや議事録として残す。あとから探せるように、聞いた話は要約せず要点を落とさずに書く。' +
        '「これ控えといて」「議事録にして」と言われたとき、また写真から読み取った内容を残すときに使う。',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '残す本文。日付・人名・数字は省かない' },
          tags: { type: 'string', description: 'あとで探すための語をカンマ区切りで（例: 打合せ,A社,見積）' }
        },
        required: ['text']
      }
    },
    {
      name: 'search_memos',
      description: '残してあるメモを探す。「あの件どうだった？」と聞かれたら、答える前にまずこれで探す。',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '探す語。空白区切りで複数可' },
          limit: { type: 'integer', description: '既定5' }
        },
        required: ['query']
      }
    },

    /* ---- 覚える（育つところ） ---- */
    {
      name: 'remember',
      description:
        '次回以降もずっと効くことを覚える。好み、習慣、決まった段取り、人や場所の呼びかた、避けたいこと。' +
        '一度きりの事実（今日の予定、今回の金額）は覚えない。それは予定とメモの仕事。' +
        '同じことを二度聞かないために使う道具。',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['好み', '習慣', '人', '仕事', '連絡', 'その他'],
            description: '分類'
          },
          fact: { type: 'string', description: '一文で。主語を省かない（例: 打合せは午前を避けたい）' }
        },
        required: ['category', 'fact']
      }
    },
    {
      name: 'forget',
      description: '覚えていることが古くなった・間違っていたときに消す。「もうそれは違う」と言われたら使う。',
      input_schema: {
        type: 'object',
        properties: { memory_id: { type: 'string' } },
        required: ['memory_id']
      }
    },

    /* ---- 調べもの（Anthropic 側で実行される道具） ---- */
    { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }
  ];
}

/** Claude が使いたいと言った道具を実行する */
function runTool_(name, input, userId) {
  switch (name) {
    case 'add_event': return tAddEvent_(input);
    case 'list_events': return tListEvents_(input);
    case 'update_event': return tUpdateEvent_(input);
    case 'delete_event': return tDeleteEvent_(input);
    case 'add_task': return tAddTask_(input, userId);
    case 'list_tasks': return tListTasks_(input, userId);
    case 'complete_task': return tCompleteTask_(input);
    case 'update_task': return tUpdateTask_(input);
    case 'save_memo': return tSaveMemo_(input, userId);
    case 'search_memos': return tSearchMemos_(input, userId);
    case 'remember': return tRemember_(input, userId);
    case 'forget': return tForget_(input);
    default: return { ok: false, error: '知らない道具です: ' + name };
  }
}

/* ================= 予定 ================= */

function calendar_() {
  var id = cfg_('CALENDAR_ID');
  if (!id || id === 'primary') return CalendarApp.getDefaultCalendar();
  var cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('カレンダーが見つかりません: ' + id);
  return cal;
}

function tAddEvent_(a) {
  var start = parseLocal_(a.start);
  if (!start) return { ok: false, error: 'start を読めません: ' + a.start };

  var cal = calendar_();
  var opts = {};
  if (a.location) opts.location = a.location;
  if (a.description) opts.description = a.description;

  var ev;
  if (isDateOnly_(a.start)) {
    var endDay = a.end ? parseLocal_(a.end) : null;
    ev = endDay ? cal.createAllDayEvent(a.title, start, addDays_(endDay, 1), opts)
                : cal.createAllDayEvent(a.title, start, opts);
  } else {
    var end = a.end ? parseLocal_(a.end) : addMinutes_(start, 60);
    if (end <= start) end = addMinutes_(start, 60);
    ev = cal.createEvent(a.title, start, end, opts);
  }

  return {
    ok: true,
    event_id: ev.getId(),
    title: ev.getTitle(),
    when: isDateOnly_(a.start) ? fmtDate_(start) + ' 終日' : fmtDateTime_(start)
  };
}

function tListEvents_(a) {
  var from = parseLocal_(a.from);
  if (!from) return { ok: false, error: 'from を読めません: ' + a.from };
  var to = a.to ? parseLocal_(a.to) : from;
  var events = calendar_().getEvents(startOfDay_(from), addDays_(startOfDay_(to), 1));

  return {
    ok: true,
    count: events.length,
    events: events.map(function (ev) {
      return {
        event_id: ev.getId(),
        title: ev.getTitle(),
        when: ev.isAllDayEvent()
          ? fmtDate_(ev.getStartTime()) + ' 終日'
          : fmtDateTime_(ev.getStartTime()) + '〜' + Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'),
        start: toLocalIso_(ev.getStartTime()),
        location: ev.getLocation() || ''
      };
    })
  };
}

function tUpdateEvent_(a) {
  var ev = calendar_().getEventById(a.event_id);
  if (!ev) return { ok: false, error: 'その予定が見つかりません' };
  if (a.title) ev.setTitle(a.title);
  if (a.location != null) ev.setLocation(a.location);
  if (a.start) {
    var s = parseLocal_(a.start);
    var e = a.end ? parseLocal_(a.end) : addMinutes_(s, 60);
    if (!s) return { ok: false, error: 'start を読めません' };
    if (e <= s) e = addMinutes_(s, 60);
    ev.setTime(s, e);
  }
  return { ok: true, event_id: ev.getId(), title: ev.getTitle(), when: fmtDateTime_(ev.getStartTime()) };
}

function tDeleteEvent_(a) {
  var ev = calendar_().getEventById(a.event_id);
  if (!ev) return { ok: false, error: 'その予定が見つかりません' };
  var title = ev.getTitle();
  ev.deleteEvent();
  return { ok: true, deleted: title };
}

/* ================= 用事 ================= */

function tAddTask_(a, userId) {
  var due = a.due ? parseLocal_(a.due) : null;
  var rec = insert_('tasks', {
    userId: userId,
    title: a.title,
    detail: a.detail || '',
    due: due ? toLocalIso_(due) : '',
    remindAt: due ? toLocalIso_(addMinutes_(due, -NUDGE_LEAD_MIN)) : '',
    status: 'open',
    nudges: 0,
    lastNudgeAt: ''
  });
  return { ok: true, task_id: rec.id, title: rec.title, due: due ? fmtDateTime_(due) : 'なし' };
}

function tListTasks_(a, userId) {
  var want = (a && a.status) || 'open';
  var list = rows_('tasks').filter(function (r) {
    if (String(r.userId) !== String(userId)) return false;
    return want === 'all' ? true : String(r.status) === want;
  });
  list.sort(function (x, y) { return String(x.due || '9999') < String(y.due || '9999') ? -1 : 1; });

  return {
    ok: true,
    count: list.length,
    tasks: list.map(function (r) {
      var due = r.due ? parseLocal_(r.due) : null;
      return {
        task_id: r.id,
        title: r.title,
        detail: truncate_(r.detail, 200),
        due: due ? fmtDateTime_(due) : '',
        overdue: !!(due && due < now_() && r.status === 'open'),
        status: r.status
      };
    })
  };
}

function tCompleteTask_(a) {
  var rec = update_('tasks', a.task_id, { status: 'done' });
  if (!rec) return { ok: false, error: 'その用事が見つかりません' };
  return { ok: true, title: rec.title };
}

function tUpdateTask_(a) {
  var patch = {};
  if (a.title) patch.title = a.title;
  if (a.detail != null) patch.detail = a.detail;
  if (a.status) patch.status = a.status;
  if (a.due != null) {
    var due = a.due ? parseLocal_(a.due) : null;
    patch.due = due ? toLocalIso_(due) : '';
    patch.remindAt = due ? toLocalIso_(addMinutes_(due, -NUDGE_LEAD_MIN)) : '';
    patch.nudges = 0;          // 期限を引き直したら催促も数え直す
    patch.lastNudgeAt = '';
  }
  var rec = update_('tasks', a.task_id, patch);
  if (!rec) return { ok: false, error: 'その用事が見つかりません' };
  return { ok: true, title: rec.title, due: rec.due ? fmtDateTime_(parseLocal_(rec.due)) : 'なし', status: rec.status };
}

/* ================= メモ ================= */

function tSaveMemo_(a, userId) {
  var rec = insert_('memos', { userId: userId, text: a.text, tags: a.tags || '' });
  return { ok: true, memo_id: rec.id, saved: truncate_(a.text, 60) };
}

function tSearchMemos_(a, userId) {
  var words = String(a.query || '').split(/[\s、,]+/).filter(Boolean).map(function (w) { return w.toLowerCase(); });
  var limit = a.limit || 5;

  var hits = rows_('memos')
    .filter(function (r) { return String(r.userId) === String(userId); })
    .map(function (r) {
      var hay = (String(r.text) + ' ' + String(r.tags)).toLowerCase();
      var score = words.reduce(function (n, w) { return n + (hay.indexOf(w) >= 0 ? 1 : 0); }, 0);
      return { rec: r, score: score };
    })
    .filter(function (h) { return h.score > 0; });

  // 一致した語が多い順、同点なら新しい順
  hits.sort(function (x, y) {
    if (y.score !== x.score) return y.score - x.score;
    return String(y.rec.createdAt) < String(x.rec.createdAt) ? -1 : 1;
  });

  return {
    ok: true,
    count: hits.length,
    memos: hits.slice(0, limit).map(function (h) {
      return {
        memo_id: h.rec.id,
        date: fmtDate_(parseLocal_(h.rec.createdAt)),
        tags: h.rec.tags,
        text: truncate_(h.rec.text, 900)
      };
    })
  };
}

/* ================= 覚える ================= */

function tRemember_(a, userId) {
  var fact = String(a.fact || '').trim();
  if (!fact) return { ok: false, error: 'fact が空です' };

  // 同じことを二重に覚えない
  var same = rows_('memory').filter(function (r) {
    return String(r.userId) === String(userId) && String(r.fact).trim() === fact;
  })[0];
  if (same) {
    update_('memory', same.id, { hits: Number(same.hits || 0) + 1 });
    return { ok: true, memory_id: same.id, note: 'すでに覚えていました' };
  }

  var rec = insert_('memory', { userId: userId, category: a.category || 'その他', fact: fact, hits: 1 });
  return { ok: true, memory_id: rec.id, remembered: fact };
}

function tForget_(a) {
  var rec = find_('memory', a.memory_id);
  if (!rec) return { ok: false, error: 'その項目が見つかりません' };
  remove_('memory', a.memory_id);
  return { ok: true, forgot: rec.fact };
}


/* ===== 60_brain.gs ===== */

/**
 * 秘書の「人格」と「記憶」。
 *
 * 育つ仕組みは2段構え。
 *   その場で … 会話中に remember 道具で書き足す
 *   夜に    … その日の会話を読み返して、残すべきことを抜き出す（reflect_）
 * どちらも memory シートに溜まり、次の会話の指示文に混ぜられる。
 */

var MEMORY_MAX = 60;   // 指示文に混ぜる件数の上限（増やしすぎると毎回の費用が増える）

/** 覚えていることを、指示文に貼れる形にまとめる */
function memoryBlock_(userId) {
  var all = rows_('memory').filter(function (r) { return String(r.userId) === String(userId); });
  if (!all.length) return '（まだ何も覚えていません）';

  // よく効いたもの・新しいものを優先して残す
  all.sort(function (x, y) {
    var d = Number(y.hits || 0) - Number(x.hits || 0);
    if (d !== 0) return d;
    return String(y.updatedAt || '') < String(x.updatedAt || '') ? -1 : 1;
  });

  var groups = {};
  all.slice(0, MEMORY_MAX).forEach(function (r) {
    var c = r.category || 'その他';
    (groups[c] = groups[c] || []).push('- [' + r.id + '] ' + r.fact);
  });

  return Object.keys(groups).map(function (c) {
    return '【' + c + '】\n' + groups[c].join('\n');
  }).join('\n');
}

/** 会話のときの指示文 */
function systemPrompt_(userId) {
  var n = now_();
  var openTasks = rows_('tasks').filter(function (r) {
    return String(r.userId) === String(userId) && r.status === 'open';
  });

  return [
    'あなたは「' + cfg_('OWNER_NAME') + '」専属のAI秘書です。LINEのトークの中で働きます。',
    '',
    '# ふるまい',
    '- 返事は短く、結論から。LINEの吹き出しで読める長さ（3〜5行）に収める。',
    '- 敬体（です・ます）。前置き・お世辞・言われたことの復唱はしない。',
    '- 曖昧な依頼は、常識的なところを自分で埋めて実行する。聞き返すのは、間違えると取り返しがつかないときだけ。',
    '- 何かしたら、したことを一言で報告する（例:「8/8(金) 15:00 歯医者 で入れました」）。',
    '- 予定を消す・取りやめる前だけは、必ず本人に確かめる。',
    '',
    '# 日時',
    '- 今は ' + fmtDateTime_(n) + '（日本時間）。',
    '- 「明日」「来週の金曜」「夕方」は、必ずこの時刻を基準に実際の日付へ直してから道具に渡す。',
    '- 時刻の指定がない用事は、勝手に終日にせず妥当な時間帯を置き、報告のときにその旨を添える。',
    '',
    '# やり通すこと',
    '- 引き受けた依頼は、終わるまで自分の持ち物として扱う。',
    '- その場で片づかない依頼（あとでやる／期限がある／相手待ち）は、必ず add_task に残す。残さなければ忘れる。',
    '- 期限が来たら、こちらから声をかける仕組みが動く。だから期限は分かる範囲で必ず入れる。',
    '- いま抱えている用事: ' + (openTasks.length ? openTasks.length + '件' : 'なし'),
    '',
    '# 覚えること',
    '- 次回以降もずっと効くこと（好み・習慣・段取り・人の呼びかた・避けたいこと）を知ったら remember で残す。',
    '- 一度きりの事実は覚えない。予定はカレンダー、出来事はメモが受け持つ。',
    '- すでに覚えていることを、もう一度聞かない。',
    '- 覚えていたことが違っていたと分かったら forget で消してから覚え直す。',
    '',
    '# 調べもの',
    provider_() === 'claude'
      ? '- 事実関係や最新の情報が要るときは web_search を使う。憶測で答えない。'
      : '- 手元の道具（予定・用事・メモ）で確かめられないことは、憶測で断定せず「調べていません」と断る。',
    '',
    '# 覚えていること',
    memoryBlock_(userId)
  ].join('\n');
}

/**
 * 夜のふりかえり。その日の会話を読み返して、次に活きることだけを memory に足す。
 * 会話中の remember が拾いこぼしたものを回収する役目。
 */
function reflect_(userId) {
  var since = addDays_(now_(), -1);
  var lines = logSince_(userId, since);
  if (lines.length < 4) return { added: 0, note: '会話が少ないので何もしませんでした' };

  var transcript = lines.map(function (r) {
    return (r.role === 'assistant' ? '秘書: ' : '本人: ') + truncate_(r.text, 500);
  }).join('\n');

  var system = [
    'あなたはAI秘書の記憶係です。きょう一日の会話を読み、',
    '「次回以降もずっと効くこと」だけを抜き出してください。',
    '',
    '抜き出すもの: 好み、習慣、決まった段取り、人や場所の呼びかた、嫌がられたこと、うまくいった進めかた',
    '抜き出さないもの: 今日だけの予定、一度きりの数字や出来事、すでに覚えている内容と同じこと',
    '',
    'すでに覚えていること:',
    memoryBlock_(userId),
    '',
    '出力は次のJSONだけ。説明は書かないこと。何も無ければ facts を空配列にする。',
    '{"facts":[{"category":"好み|習慣|人|仕事|連絡|その他","fact":"一文"}],',
    ' "drop":["古くなった項目のid"]}'
  ].join('\n');

  var raw = llmAsk_(system, '今日の会話:\n' + truncate_(transcript, 12000));
  var parsed = extractJson_(raw);
  if (!parsed) return { added: 0, note: '読み取れる形で返ってきませんでした' };

  var added = 0;
  (parsed.facts || []).forEach(function (f) {
    if (!f || !f.fact) return;
    var r = tRemember_({ category: f.category, fact: f.fact }, userId);
    if (r.ok && r.remembered) added++;
  });

  var dropped = 0;
  (parsed.drop || []).forEach(function (id) {
    if (remove_('memory', id)) dropped++;
  });

  log_('reflect', { added: added, dropped: dropped });
  return { added: added, dropped: dropped };
}


/* ===== 70_main.gs ===== */

/**
 * LINEからの入口。
 *
 * LINE → doPost（このウェブアプリのURL） → 頭脳（Gemini/Claude） → 道具 → LINEへ返信
 *
 * GAS のウェブアプリはリクエストのヘッダを受け取れないため、
 * LINE の署名検証（X-Line-Signature）は使えません。代わりに
 * Webhook URL の末尾に ?token=（自分で決めた合言葉）を付け、それで弾きます。
 */

function doGet(e) {
  var ok = e && e.parameter && e.parameter.token === cfg_('WEBHOOK_TOKEN');
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ready: ok && !!cfg_('SPREADSHEET_ID') }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // 何があっても200を返す。返さないとLINEが何度も送り直してくる
  try {
    if (!e || !e.parameter || e.parameter.token !== cfg_('WEBHOOK_TOKEN')) {
      log_('拒否', '合言葉が違います');
      return ok_();
    }
    var body = tryParse_((e.postData && e.postData.contents) || '{}', {});
    (body.events || []).forEach(function (ev) {
      try {
        handleEvent_(ev);
      } catch (err) {
        log_('handleEvent例外', String(err && err.stack ? err.stack : err));
        if (ev.replyToken) lineReply_(ev.replyToken, 'うまく処理できませんでした。\n' + truncate_(String(err), 200));
      }
    });
  } catch (err) {
    log_('doPost例外', String(err && err.stack ? err.stack : err));
  }
  return ok_();
}

function ok_() {
  return ContentService.createTextOutput('ok');
}

/* ---------------------------------------------------------------- */

function handleEvent_(ev) {
  var userId = ev.source && ev.source.userId;
  if (!userId) return;

  // 最初に話しかけてきた人を持ち主として覚える
  var owner = cfg_('OWNER_USER_ID');
  if (!owner) {
    cfgSet_('OWNER_USER_ID', userId);
    owner = userId;
    var name = lineProfileName_(userId);
    if (name && cfg_('OWNER_NAME') === CFG_DEFAULTS.OWNER_NAME) cfgSet_('OWNER_NAME', name);
  }
  // 持ち主以外には何もしない（カレンダーやメモを触らせないため）
  if (userId !== owner) {
    if (ev.replyToken) lineReply_(ev.replyToken, 'この秘書は持ち主専用です。');
    return;
  }

  if (ev.type === 'follow') {
    lineReply_(ev.replyToken, greeting_());
    return;
  }
  if (ev.type !== 'message') return;

  // LINEは返事が無いと同じ内容を送り直してくる。二重に動かないようにする
  if (ev.webhookEventId && seen_(ev.webhookEventId)) return;

  var msg = ev.message || {};
  if (msg.type === 'text') {
    respond_(userId, ev.replyToken, String(msg.text || '').trim(), null);
  } else if (msg.type === 'image') {
    respond_(userId, ev.replyToken, '', msg.id);
  } else {
    lineReply_(ev.replyToken, '文字か写真で送ってください。');
  }
}

/** 同じイベントを二度処理しないための印（10分間おぼえる） */
function seen_(eventId) {
  var cache = CacheService.getScriptCache();
  if (cache.get(eventId)) return true;
  cache.put(eventId, '1', 600);
  return false;
}

/**
 * 本体。頭脳に考えさせて、必要なら道具を使わせて、LINEに返す。
 *
 * @param {string} text      文字メッセージ（写真だけのときは空）
 * @param {string} imageId   写真のメッセージID。無ければ null
 */
function respond_(userId, replyToken, text, imageId) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    lineReply_(replyToken, '前の用事をまだ処理しています。少しあとでもう一度送ってください。');
    return;
  }

  try {
    lineLoading_(userId, 40);

    var content = [];
    if (imageId) {
      var img = imagePart_(imageId);
      if (img.error) { lineReply_(replyToken, img.error); return; }
      content.push(img.block);
      content.push({ type: 'text', text: text || '送った写真を見て、必要なら内容をメモに残してください。' });
    } else {
      if (!text) { lineReply_(replyToken, '何をしましょうか。'); return; }
      content.push({ type: 'text', text: text });
    }

    var messages = logRecent_(userId, HISTORY_TURNS);
    messages.push({ role: 'user', content: content });

    var result = llmRun_(systemPrompt_(userId), messages, toolDefs_(), userId);
    var answer = result.text || '（返事を作れませんでした）';

    logAppend_(userId, 'user', text || '［写真］');
    logAppend_(userId, 'assistant', answer);

    // 考えるのに時間がかかると返信トークンが切れる。そのときは自分から送る
    if (!lineReply_(replyToken, answer)) linePush_(userId, answer);

  } finally {
    lock.releaseLock();
  }
}

/** LINEの写真を頭脳に渡せる形にする */
function imagePart_(messageId) {
  var blob = lineContent_(messageId);
  if (!blob) return { error: '写真を取り込めませんでした。' };

  var bytes = blob.getBytes();
  if (bytes.length > 4 * 1024 * 1024) {
    return { error: '写真が大きすぎます（4MBまで）。少し小さくして送ってください。' };
  }
  var type = blob.getContentType() || 'image/jpeg';
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(type) < 0) type = 'image/jpeg';

  return {
    block: {
      type: 'image',
      source: { type: 'base64', media_type: type, data: Utilities.base64Encode(bytes) }
    }
  };
}

function greeting_() {
  return [
    'こんにちは。秘書として動きます。',
    '',
    '・「明日15時に歯医者」→ カレンダーに入れます',
    '・「金曜までに請求書」→ 控えて、期限前に声をかけます',
    '・「これ控えといて」→ メモに残します（写真も読めます）',
    '・「今日の予定は？」「あの件どうだった？」→ 調べて答えます',
    '',
    '好みや進めかたは、話しているうちに覚えていきます。'
  ].join('\n');
}


/* ===== 80_scheduler.gs ===== */

/**
 * こちらから動くところ。
 *
 *   onMorningBrief  … 毎朝、その日の予定と残っている用事を送る
 *   onSweep         … 1時間ごとに、期限が近い／過ぎた用事を催促する
 *   onNightlyReflect… 毎晩、その日の会話から覚えることを抜き出す
 *
 * 秘書が「やり通す」のは、ここが動いているからです。
 */

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (['onMorningBrief', 'onSweep', 'onNightlyReflect'].indexOf(fn) >= 0) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('onMorningBrief').timeBased().atHour(Number(cfg_('MORNING_HOUR'))).everyDays(1).create();
  ScriptApp.newTrigger('onSweep').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('onNightlyReflect').timeBased().atHour(23).everyDays(1).create();

  return '朝のお知らせ・催促・夜のふりかえりを仕掛けました。';
}

/* ---------------- 朝のお知らせ ---------------- */

function onMorningBrief() {
  var userId = cfg_('OWNER_USER_ID');
  if (!userId) return;

  var today = now_();
  var events = tListEvents_({ from: Utilities.formatDate(today, TZ, 'yyyy-MM-dd') });
  var tasks = tListTasks_({ status: 'open' }, userId);

  var lines = ['おはようございます。' + fmtDate_(today) + 'です。', ''];

  if (events.ok && events.count) {
    lines.push('【今日の予定】');
    events.events.forEach(function (ev) {
      lines.push('・' + ev.when.replace(/^\d+\/\d+\(.\)\s*/, '') + ' ' + ev.title + (ev.location ? '（' + ev.location + '）' : ''));
    });
  } else {
    lines.push('【今日の予定】なし');
  }

  var due = (tasks.tasks || []).filter(function (t) { return t.due || t.overdue; });
  if (due.length) {
    lines.push('', '【気になる用事】');
    due.slice(0, 8).forEach(function (t) {
      lines.push('・' + t.title + (t.overdue ? '（期限切れ ' + t.due + '）' : t.due ? '（〜' + t.due + '）' : ''));
    });
  }
  var noDue = (tasks.tasks || []).length - due.length;
  if (noDue > 0) lines.push('', 'ほかに期限なしの用事が' + noDue + '件あります。');

  linePush_(userId, lines.join('\n'));
}

/* ---------------- 催促（やり通すための仕掛け） ---------------- */

function onSweep() {
  var userId = cfg_('OWNER_USER_ID');
  if (!userId) return;

  var n = now_();

  // 寝ている時間は起こさない。無料枠の消費も抑えられる
  var hour = n.getHours();
  if (hour < QUIET_END_HOUR || hour >= QUIET_START_HOUR) return;
  var messages = [];

  rows_('tasks').forEach(function (r) {
    if (String(r.userId) !== String(userId) || r.status !== 'open') return;

    var due = r.due ? parseLocal_(r.due) : null;
    var remindAt = r.remindAt ? parseLocal_(r.remindAt) : null;
    if (!due || !remindAt) return;               // 期限のないものは追いかけない
    if (n < remindAt) return;                    // まだ声をかける時刻ではない

    var nudges = Number(r.nudges || 0);
    var last = r.lastNudgeAt ? parseLocal_(r.lastNudgeAt) : null;

    // 2回目以降は間を空ける
    if (last && (n - last) < NUDGE_INTERVAL_H * 3600000) return;

    if (nudges >= NUDGE_MAX) {
      // これ以上つつかない。まだ要るのかだけ聞いて、追いかけるのをやめる
      messages.push('「' + r.title + '」は何度かお伝えしましたが、まだ動いていません。\nもう不要なら「あれは取りやめ」と送ってください。これ以降は催促しません。');
      update_('tasks', r.id, { remindAt: '', lastNudgeAt: toLocalIso_(n) });
      return;
    }

    var overdue = due < n;
    var head = overdue
      ? '【期限切れ】' + r.title + '\n期限は ' + fmtDateTime_(due) + ' でした。'
      : '【まもなく】' + r.title + '\n期限は ' + fmtDateTime_(due) + ' です。';
    var detail = r.detail ? '\n' + truncate_(r.detail, 200) : '';

    messages.push(head + detail + '\n終わっていれば「終わった」と送ってください。');
    update_('tasks', r.id, { nudges: nudges + 1, lastNudgeAt: toLocalIso_(n) });
  });

  if (messages.length) linePush_(userId, messages.join('\n\n———\n\n'));
}

/* ---------------- 夜のふりかえり ---------------- */

function onNightlyReflect() {
  var userId = cfg_('OWNER_USER_ID');
  if (!userId) return;
  try {
    reflect_(userId);
  } catch (e) {
    log_('reflect失敗', String(e));
  }
  logTrim_(600);   // ログが際限なく増えないように
}


/* ===== 90_setup.gs ===== */

/**
 * 最初の1回だけ動かすもの。
 *
 * エディタ上部の関数リストから setup を選んで実行してください。
 * （初回は「承認が必要です」と出ます。自分のアカウントで許可してください）
 */

function setup() {
  requireBrainKey_();
  cfgRequire_(['LINE_CHANNEL_ACCESS_TOKEN', 'WEBHOOK_TOKEN']);

  // 記録用のスプレッドシートを作る（すでにあればそのまま使う）
  var id = cfg_('SPREADSHEET_ID');
  if (!id) {
    var ss = SpreadsheetApp.create('AI秘書 の記録');
    id = ss.getId();
    cfgSet_('SPREADSHEET_ID', id);
    // 最初からある「シート1」は使わないので消す
    var first = ss.getSheets()[0];
    Object.keys(SHEETS).forEach(function (name) { sheet_(name); });
    if (first.getName() !== 'tasks') ss.deleteSheet(first);
  } else {
    Object.keys(SHEETS).forEach(function (name) { sheet_(name); });
  }

  // カレンダーに触れるか、ここで確かめておく
  calendar_().getName();

  // 使えるモデルかどうかを先に確かめる（違っていれば選び直す）
  var model = provider_() === 'gemini' ? ensureGeminiModel_() : 'モデル: ' + cfg_('MODEL');

  var msg = installTriggers();

  var out = [
    '準備できました。',
    '',
    '記録シート: https://docs.google.com/spreadsheets/d/' + id,
    model,
    msg,
    '',
    'このあと「デプロイ → 新しいデプロイ → ウェブアプリ」で公開し、',
    '出てきたURLの末尾に ?token=' + cfg_('WEBHOOK_TOKEN') + ' を付けたものを',
    'LINE Developers の Webhook URL に貼ってください。'
  ].join('\n');

  console.log(out);
  return out;
}

/** いまの状態を見る。うまく動かないときはこれを実行してログを見る */
function status() {
  var props = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'LINE_CHANNEL_ACCESS_TOKEN',
               'WEBHOOK_TOKEN', 'SPREADSHEET_ID', 'OWNER_USER_ID'];
  var out = { 設定: {}, 予定表: '', 用事: 0, 覚えていること: 0, 今月送った通数: '', 仕掛け: [] };

  // いま選んでいない頭脳の鍵は、無くても構わない
  var unused = provider_() === 'claude' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';

  props.forEach(function (k) {
    var v = cfg_(k);
    var hidden = k.indexOf('KEY') >= 0 || k.indexOf('TOKEN') >= 0;
    out.設定[k] = v ? (hidden ? '入っています' : v)
                    : (k === unused ? '—（いまは使いません）' : '★未設定');
  });
  out.設定.PROVIDER = provider_();
  out.設定.使うモデル = provider_() === 'claude' ? cfg_('MODEL') + ' / effort ' + cfg_('EFFORT') : cfg_('GEMINI_MODEL');

  var q = pushQuota_();
  out.今月送った通数 = q.used + ' / ' + q.limit + '（残り' + q.left + '。返信はこれに含まれません）';

  try { out.予定表 = calendar_().getName(); } catch (e) { out.予定表 = '★' + e; }
  try {
    out.用事 = rows_('tasks').filter(function (r) { return r.status === 'open'; }).length;
    out.覚えていること = rows_('memory').length;
  } catch (e) {
    out.用事 = '★' + e;
  }
  out.仕掛け = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/** LINEに1通送って、経路が通っているか確かめる */
function testPush() {
  var userId = cfg_('OWNER_USER_ID');
  if (!userId) return '★ まだ一度もLINEで話しかけられていません（OWNER_USER_ID が空です）';
  return linePush_(userId, 'テスト送信です。届いていれば経路は通っています。') ? '送りました' : '★ 送れませんでした（ログを見てください）';
}

/** 頭脳と道具まわりだけを、LINEを通さずに試す */
function testBrain() {
  var userId = cfg_('OWNER_USER_ID') || 'test-user';
  var messages = [{ role: 'user', content: '今日の予定を教えてください。' }];
  var res = llmRun_(systemPrompt_(userId), messages, toolDefs_(), userId);
  console.log('使った道具: ' + res.used.join(', '));
  console.log(res.text);
  return res.text;
}

