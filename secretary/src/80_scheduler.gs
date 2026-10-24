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
