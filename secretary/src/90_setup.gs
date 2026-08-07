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

  var msg = installTriggers();

  var out = [
    '準備できました。',
    '',
    '記録シート: https://docs.google.com/spreadsheets/d/' + id,
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
