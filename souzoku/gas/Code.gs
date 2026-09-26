/**
 * つぐいえ 相談フォームの中継（Google Apps Script）
 *
 * アプリから届いた相談を、相続の総合窓口にメールで転送するだけ。
 * 窓口が内容を見て、提携の不動産会社（宅建士）・弁護士・税理士に振り分ける。
 *   - どこにも書き込まない（スプレッドシート・ドライブ・DBを使わない）
 *   - ユーザーへの自動返信はしない（任意のアドレスへ送れる踏み台にしないため）
 *   - 宛先はスクリプトのプロパティに置き、アプリには含めない
 *
 * 設定は gas/README.md を参照。
 */

var MAX_PER_HOUR = 30;   // 1時間あたりの送信上限（悪用されても止まるように）

function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!d || d.app !== 'tsuguie') return json_({ ok: false, error: 'bad_request' });
  if (d.website) return json_({ ok: true });                      // ボット（見えない欄に入力）
  var email = str_(d.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_({ ok: false, error: 'email' });
  if (!text_(d.body, 1000) && !(Array.isArray(d.topics) && d.topics.length)) return json_({ ok: false, error: 'empty' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (overLimit_(1)) return json_({ ok: false, error: 'busy' });
    var to = PropertiesService.getScriptProperties().getProperty('TO_MADOGUCHI');
    if (!to) throw new Error('宛先が未設定: TO_MADOGUCHI');
    var ref = /^TG-\d{6}-\d{4}$/.test(d.ref) ? d.ref : 'TG-UNKNOWN';
    MailApp.sendEmail({
      to: to,
      replyTo: email,
      name: 'つぐいえ 相談窓口',
      subject: '【つぐいえ相談 ' + ref + '】' + (str_(d.area, 40) || 'エリア未記入'),
      body: format_(d, email, ref)
    });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'failed' });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

function format_(d, email, ref) {
  var topics = Array.isArray(d.topics) ? d.topics.slice(0, 10).map(function (t) { return str_(t, 30); }).join('／') : '';
  var who = Array.isArray(d.who) ? d.who.slice(0, 3).map(function (t) { return str_(t, 10); }).join('・') : '';
  return [
    '相続の総合窓口 ご担当者さま',
    '',
    'つぐいえから相談が届きました。内容に合わせて、担当の専門家（不動産・弁護士・税理士）へおつなぎください。',
    'このメールに「返信」すると、相談者に届きます。',
    '',
    '受付番号：' + ref,
    'おもに答える専門家の目安：' + (who || '未判定'),
    'お名前：' + (str_(d.name, 40) || '匿名'),
    'メールアドレス：' + email,
    '物件の場所：' + (str_(d.area, 40) || '未記入'),
    '聞きたいこと：' + (topics || 'なし'),
    '',
    '―― 相談の内容 ――',
    text_(d.body, 1000) || '（くわしい内容なし）',
    '',
    '―― 添えられた試算 ――',
    str_(d.estimate, 300) || 'なし',
    '',
    '※相談者には自動返信メールを送っていません。お手数ですが、受付番号を添えてご返信ください。',
    '※運営者はこの内容を保存していません。'
  ].join('\n');
}

function overLimit_(n) {
  var cache = CacheService.getScriptCache();
  var key = 'sent-' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH');
  var count = Number(cache.get(key) || 0);
  if (count + n > MAX_PER_HOUR) return true;
  cache.put(key, String(count + n), 3700);
  return false;
}

function str_(v, max) {
  return typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '';
}

function text_(v, max) {  // 相談本文だけは改行を残す
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 送信済みフォルダに残る控えを削除する（任意）。
 * トリガーで1日1回実行する設定にすると、7日より前の控えがゴミ箱へ移る。
 * GmailApp を使うため、初回実行時に Gmail の権限を求められる。
 */
function cleanupSent() {
  var threads = GmailApp.search('in:sent subject:"つぐいえ相談" older_than:7d', 0, 100);
  threads.forEach(function (t) { t.moveToTrash(); });
}

/** 設定の確認用：スクリプトエディタから実行すると、テストの相談が総合窓口の宛先に届く。 */
function testSend() {
  var res = doPost({ postData: { contents: JSON.stringify({
    app: 'tsuguie', ref: 'TG-000000-0000', who: ['不動産'],
    name: 'テスト', email: Session.getActiveUser().getEmail() || 'test@example.com',
    area: 'テスト県', topics: ['売るか迷っている'], body: '送信テストです。', estimate: ''
  }) } });
  console.log(res.getContent());
}
