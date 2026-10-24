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
