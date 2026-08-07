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

/** こちらから送る（朝のお知らせ・催促・返信が間に合わなかったとき） */
function linePush_(userId, text) {
  if (!userId) return false;
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
