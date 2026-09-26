/* deadlines.js — 相続開始日（亡くなった日）から、手続きの期限を並べる。
 * 日付は "YYYY-MM-DD" の文字列で受け渡しし、時差で日付がずれないよう
 * 計算はすべて UTC の年月日で行う。
 */
(function (root) {
  'use strict';

  function parse(iso) {
    var p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function fmt(ms) {
    var d = new Date(ms);
    var m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDays(iso, n) { return fmt(parse(iso) + n * 86400000); }
  /* 月を足す。応当日がない月（1/31 → 2/31 など）は月末にそろえる。 */
  function addMonths(iso, n) {
    var p = iso.split('-').map(Number);
    var y = p[0], m = p[1] - 1 + n, d = p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return fmt(Date.UTC(y, m, Math.min(d, last)));
  }
  function daysBetween(fromISO, toISO) { return Math.round((parse(toISO) - parse(fromISO)) / 86400000); }
  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  var AKIYA_SYSTEM_END = '2027-12-31';

  function list(deathISO) {
    var taxDue = addMonths(deathISO, 10);
    var akiyaRule = (Number(deathISO.slice(0, 4)) + 3) + '-12-31';
    var akiya = akiyaRule < AKIYA_SYSTEM_END ? akiyaRule : AKIYA_SYSTEM_END;
    var items = [
      { id: 'shibou', title: '死亡届の提出', date: addDays(deathISO, 6),
        note: '7日以内。葬儀社が代わりに出すことが多い手続きです。', article: 'first3' },
      { id: 'houki', title: '相続放棄・限定承認の判断', date: addMonths(deathISO, 3),
        note: '相続を知った日から3か月以内に家庭裁判所へ。借金が多いときの選択肢です。', article: 'houki' },
      { id: 'junkaku', title: '準確定申告', date: addMonths(deathISO, 4),
        note: '亡くなった人のその年の所得税の申告。4か月以内。', article: 'first3' },
      { id: 'souzokuzei', title: '相続税の申告・納付', date: taxDue,
        note: '遺産が基礎控除（3,000万円＋600万円×法定相続人の数）を超えるときだけ。', article: 'souzokuzei' },
      { id: 'akiya', title: '空き家特例の売却期限', date: akiya,
        note: akiya === AKIYA_SYSTEM_END && akiyaRule > AKIYA_SYSTEM_END
          ? '制度の期限（2027年12月31日）が先に来ます。延長されることがあります。'
          : '相続開始から3年を経過する日の属する年の12月31日まで。最大3,000万円の控除。',
        article: 'akiya' },
      { id: 'touki', title: '相続登記の申請（義務）', date: addMonths(deathISO, 36),
        note: '相続を知った日から3年以内。正当な理由なく怠ると10万円以下の過料。', article: 'touki' },
      { id: 'shutoku', title: '取得費加算の特例の売却期限', date: addMonths(taxDue, 36),
        note: '相続税を納めた人が、申告期限から3年以内に売るときに使える特例。', article: 'shutoku' }
    ];
    return items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  /* 期限に「済」「あと何日」「過ぎた」を付け、次の期限を選ぶ。 */
  function status(deathISO, done, today) {
    today = today || todayISO();
    var items = list(deathISO).map(function (it) {
      var left = daysBetween(today, it.date);
      return Object.assign({}, it, { left: left, done: !!(done && done[it.id]), passed: left < 0 });
    });
    var next = null;
    for (var i = 0; i < items.length; i++) {
      if (!items[i].done && !items[i].passed) { next = items[i]; break; }
    }
    return { items: items, next: next };
  }

  /* 今の時期：記事の絞り込みに使う。 */
  function stage(deathISO, today) {
    if (!deathISO) return 'none';
    var m = daysBetween(deathISO, today || todayISO()) / 30.44;
    if (m < 3) return 'early';
    if (m < 10) return 'mid';
    return 'later';
  }

  var api = { list: list, status: status, stage: stage, addDays: addDays, addMonths: addMonths,
              daysBetween: daysBetween, todayISO: todayISO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TGDeadlines = api;
})(this);
