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
