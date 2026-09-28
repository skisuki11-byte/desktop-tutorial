/**
 * つぐいえ 相談フォームの中継（Google Apps Script）
 *
 * アプリから届いた相談を、相続の総合窓口にメールで転送するだけ。
 * 窓口が内容を見て、提携の不動産会社（宅建士）・弁護士・税理士に振り分ける。
 *   - どこにも書き込まない（スプレッドシート・ドライブ・DBを使わない）
 *   - ユーザーへの自動返信はしない（任意のアドレスへ送れる踏み台にしないため）
 *   - 宛先はスクリプトのプロパティに置き、アプリには含めない
 *
 * あわせて、はかる（売却シミュレーション）の「相場の目安」を返す。
 * 国土交通省「不動産情報ライブラリ」API の取引価格を、都道府県・市区町村・地区と
 * 種類で絞り、中央値などに集計して返すだけ（利用者の情報は受け取らない・保存しない）。
 * API キーはスクリプトのプロパティ REINFOLIB_KEY に置き、アプリには含めない。
 *
 * 設定は gas/README.md を参照。
 */

var MAX_PER_HOUR = 30;   // 1時間あたりの送信上限（悪用されても止まるように）
var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function doPost(e) {
  var d;
  try {
    // アプリが送るのは数KB。大きすぎる本文は読まずに断る
    if (e.postData.contents.length > 20000) return json_({ ok: false, error: 'bad_request' });
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!d || d.app !== 'tsuguie') return json_({ ok: false, error: 'bad_request' });
  if (d.action === 'ping') return json_({ ok: true });              // アプリが試算を始めたときの「温め」（初回の待ち時間を減らす）
  if (d.action === 'cities') return json_(cities_(d));
  if (d.action === 'market') return json_(market_(d));
  if (d.website) return json_({ ok: true });                      // ボット（見えない欄に入力）
  var email = str_(d.email, 120);
  // 返信先（Reply-To）に使うので、宛先を増やせる , ; < > " や空白を含むものは受け付けない
  if (!EMAIL_RE.test(email)) return json_({ ok: false, error: 'email' });
  if (!text_(d.body, 1000) && !(Array.isArray(d.topics) && d.topics.length)) return json_({ ok: false, error: 'empty' });

  var lock = LockService.getScriptLock();
  // 待ちきれないときは例外にせず「混み合っています」を返す（例外だとアプリに HTML のエラー画面が返る）
  if (!lock.tryLock(10000)) return json_({ ok: false, error: 'busy' });
  try {
    // Gmail の1日の送信上限（個人アカウントは100通）に達していたら、明日以降の案内を出してもらう
    if (MailApp.getRemainingDailyQuota && MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'quota' });
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
    if (/quota|too many times|limit exceeded/i.test(String(err && err.message || err))) return json_({ ok: false, error: 'quota' });
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
    str_(d.estimate, 600) || 'なし',
    '',
    '※相談者には自動返信メールを送っていません。お手数ですが、受付番号を添えてご返信ください。',
    '※運営者はこの内容を保存していません。'
  ].join('\n');
}

/* ======================================================
   相場の目安（不動産情報ライブラリ API）
   ====================================================== */
var REINFOLIB = 'https://www.reinfolib.mlit.go.jp/ex-api/external/';
var KIND_TYPE = { house: '宅地(土地と建物)', land: '宅地(土地)', condo: '中古マンション等' };
var MARKET_PER_HOUR = 300;

function reinfolibReq_(api, params, key) {
  var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return { url: REINFOLIB + api + '?' + q, headers: { 'Ocp-Apim-Subscription-Key': key }, muteHttpExceptions: true };
}
function reinfolib_(api, params) {
  var key = PropertiesService.getScriptProperties().getProperty('REINFOLIB_KEY');
  if (!key) return { error: 'no_key' };
  var r = reinfolibReq_(api, params, key);
  return reinfolibRes_(UrlFetchApp.fetch(r.url, r));
}
/* 複数の問い合わせを同時に投げる（2年分の取引を順番に取ると、大きな市では20秒を超えることがあるため） */
function reinfolibAll_(api, paramsList) {
  var key = PropertiesService.getScriptProperties().getProperty('REINFOLIB_KEY');
  if (!key) return [{ error: 'no_key' }];
  var reqs = paramsList.map(function (p) { return reinfolibReq_(api, p, key); });
  return UrlFetchApp.fetchAll(reqs).map(reinfolibRes_);
}
function reinfolibRes_(res) {
  var code = res.getResponseCode();
  if (code === 404) return { data: [] };           // 該当する取引がない
  if (code !== 200) return { error: 'upstream_' + code };
  try { return JSON.parse(res.getContentText('UTF-8')); } catch (e) { return { error: 'upstream_parse' }; }
}

function cities_(d) {
  var area = String(d.pref || '');
  if (!/^\d{2}$/.test(area) || Number(area) < 1 || Number(area) > 47) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), ck = 'cities-' + area;
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  if (overLimitMarket_()) return { ok: false, error: 'busy' };
  var r = reinfolib_('XIT002', { area: area });
  if (r.error) return { ok: false, error: r.error };
  var out = { ok: true, cities: (r.data || []).map(function (c) { return { id: String(c.id), name: String(c.name) }; }) };
  cache.put(ck, JSON.stringify(out), 21600);
  return out;
}

function num_(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(/[,，]/g, ''));
  return isFinite(n) ? n : NaN;
}
function quantile_(sorted, q) {
  if (!sorted.length) return NaN;
  var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* 相場の目安。市区町村・種類ごとに国の API から2年分を1回だけ取り、
   ・市区町村全体の相場（町名の一覧と件数つき：アプリで町名をリストから選べるように）
   ・取引が5件以上ある町名ごとの相場
   をまとめてキャッシュに入れる。町名を選び直しても、国の API はもう呼ばない。 */
var DISTRICT_MIN = 5;      // 町名の相場を出すのに必要な取引の件数（少ないとぶれるため、市区町村全体で出す）
var DISTRICT_LIST_MAX = 150;

/* キャッシュの名前に形式の版をつける。形式を変えたら版を上げると、古い形式の保存分（最大6時間残る）を使わずに取り直す。
   v2：市区町村全体の相場に町名の一覧（districts）がつく形式 */
var AGE_RANGE = 10;        // 建てた年の前後何年の取引で相場を出すか
var PACK_MAX_CHARS = 90000; // キャッシュ1件の上限（100KB）より小さく
var MARKET_CACHE_VER = 'v3';   // v3：建てた年で絞り込むための取引の要約（#rows）を追加
/* 国のデータの建築年（「1985年」「昭和60年」「平成2年」「令和元年」「戦前」など）を西暦に。わからなければ 0 */
function yearOf_(s) {
  s = String(s || '');
  var m = s.match(/(\d{4})/);
  if (m) return Number(m[1]);
  if (/戦前/.test(s)) return 1940;
  var era = { '明治': 1867, '大正': 1911, '昭和': 1925, '平成': 1988, '令和': 2018 };
  var w = s.match(/(明治|大正|昭和|平成|令和)\s*(元|\d+)\s*年/);
  if (w) return era[w[1]] + (w[2] === '元' ? 1 : Number(w[2]));
  return 0;
}

function marketKey_(city, kind, district) { return 'market-' + MARKET_CACHE_VER + '-' + city + '-' + kind + '-' + district; }

function stats_(picked, years, scope, district) {
  if (picked.length < 3) return { ok: true, count: picked.length, scope: scope, years: years[1] + '〜' + years[0] };
  var prices = picked.map(function (x) { return num_(x.TradePrice); }).sort(function (a, b) { return a - b; });
  var units = picked.map(function (x) { var a = num_(x.Area); return a > 0 ? num_(x.TradePrice) / a : NaN; })
    .filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; });
  return {
    ok: true, count: picked.length, scope: scope, years: years[1] + '〜' + years[0],
    municipality: String(picked[0].Municipality || ''), district: scope === 'district' ? district : '',
    median: Math.round(quantile_(prices, 0.5)), low: Math.round(quantile_(prices, 0.25)), high: Math.round(quantile_(prices, 0.75)),
    unitMedian: units.length >= 3 ? Math.round(quantile_(units, 0.5)) : null,
    unitLow: units.length >= 3 ? Math.round(quantile_(units, 0.25)) : null,
    unitHigh: units.length >= 3 ? Math.round(quantile_(units, 0.75)) : null
  };
}

/* 国の API から取り、市区町村全体と町名ごとの結果を作ってキャッシュに入れる。市区町村全体の結果を返す */
function buildMarket_(city, kind, cache) {
  var y = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
  var years = [y - 1, y - 2], rows = [];
  var results = reinfolibAll_('XIT001', years.map(function (yr) { return { year: yr, city: city, priceClassification: '01' }; }));
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) return { ok: false, error: results[i].error };
    rows = rows.concat(results[i].data || []);
  }
  rows = rows.filter(function (x) { return x.Type === KIND_TYPE[kind] && num_(x.TradePrice) > 0; });
  var byName = {};
  rows.forEach(function (x) {
    var n = String(x.DistrictName || '').trim();
    if (!n) return;
    (byName[n] = byName[n] || []).push(x);
  });
  var names = Object.keys(byName).sort(function (a, b) { return byName[b].length - byName[a].length || (a < b ? -1 : 1); });
  var whole = stats_(rows, years, 'city', '');
  whole.districts = names.slice(0, DISTRICT_LIST_MAX).map(function (n) { return { name: n, count: byName[n].length }; });
  var put = {};
  put[marketKey_(city, kind, '')] = JSON.stringify(whole);
  names.forEach(function (n) {
    if (byName[n].length >= DISTRICT_MIN) put[marketKey_(city, kind, n)] = JSON.stringify(stats_(byName[n], years, 'district', n));
  });
  // 建てた年で絞り込むための要約（価格・面積・建築年・町名の番号）。土地は建物がないので作らない
  if (kind !== 'land') {
    var idx = {};
    names.forEach(function (n, i) { idx[n] = i; });
    var pack = {
      muni: rows.length ? String(rows[0].Municipality || '') : '', years: years, names: names,
      rows: rows.map(function (x) {
        var n = String(x.DistrictName || '').trim();
        return [num_(x.TradePrice), num_(x.Area) || 0, yearOf_(x.BuildingYear), n in idx ? idx[n] : -1];
      })
    };
    var packText = JSON.stringify(pack);
    if (packText.length <= PACK_MAX_CHARS) put[marketKey_(city, kind, '#rows')] = packText;
  }
  cache.putAll(put, 21600);
  return whole;
}

function market_(d) {
  var city = String(d.city || ''), kind = String(d.kind || '');
  if (!/^\d{5}$/.test(city) || !KIND_TYPE[kind]) return { ok: false, error: 'bad_request' };
  var district = str_(d.district, 30);
  var by = Math.floor(Number(d.builtYear) || 0);
  var thisYear = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
  if (kind === 'land' || by < 1900 || by > thisYear) by = 0;
  var cache = CacheService.getScriptCache();
  // 必要な保存分を1回でまとめて読む（読み出しの往復を減らす）
  var keys = [marketKey_(city, kind, '')];
  if (district) keys.push(marketKey_(city, kind, district));
  if (by) keys.push(marketKey_(city, kind, '#rows'));
  var got = cache.getAll(keys);
  var base = marketBase_(city, kind, district, cache, got);
  if (!by || !base.ok) return base;
  var packRaw = got[marketKey_(city, kind, '#rows')] || cache.get(marketKey_(city, kind, '#rows'));
  if (!packRaw) return base;   // 大きな市などで要約を保存できなかったときは、築年数では絞らない
  return byAge_(base, JSON.parse(packRaw), by);
}

/* 建てた年の前後 AGE_RANGE 年の取引で相場を出す。町名×築年 → 町名だけ → 市区町村×築年 → 市区町村全体 の順で、5件以上そろったもの */
function byAge_(base, pack, by) {
  var from = by - AGE_RANGE, to = by + AGE_RANGE;
  function near(r) { return r[2] >= from && r[2] <= to; }
  function asRows(list) { return list.map(function (r) { return { TradePrice: r[0], Area: r[1], Municipality: pack.muni }; }); }
  function withAge(r) { r.age = { from: from, to: to }; r.districts = base.districts || []; return r; }
  if (base.scope === 'district') {
    var di = pack.names.indexOf(base.district);
    var inD = pack.rows.filter(function (r) { return r[3] === di && near(r); });
    if (inD.length >= DISTRICT_MIN) return withAge(stats_(asRows(inD), pack.years, 'district', base.district));
    return base;
  }
  var inC = pack.rows.filter(near);
  if (inC.length >= DISTRICT_MIN) return withAge(stats_(asRows(inC), pack.years, 'city', ''));
  return base;
}

function marketBase_(city, kind, district, cache, got) {
  var wholeRaw = got[marketKey_(city, kind, '')];
  var whole;
  if (wholeRaw) whole = JSON.parse(wholeRaw);
  if (!whole || !Array.isArray(whole.districts)) {   // 保存がない、または町名の一覧がない古い形式なら取り直す
    if (overLimitMarket_()) return { ok: false, error: 'busy' };
    whole = buildMarket_(city, kind, cache);
    if (!whole.ok) return whole;
  }
  if (!district) return whole;
  // 町名の相場にも、町名の一覧を添える（アプリがいつでもリストを出せるように）
  function withList(r) { r.districts = whole.districts || []; return r; }
  var hit = got[marketKey_(city, kind, district)] || cache.get(marketKey_(city, kind, district));
  if (hit) return withList(JSON.parse(hit));
  // 手で入れた町名（「安東一丁目」など）は、一覧の町名と部分一致で探す。見つからないか件数が少なければ市区町村全体
  var list = whole.districts || [];
  for (var i = 0; i < list.length; i++) {
    var n = list[i].name;
    if (list[i].count >= DISTRICT_MIN && (n === district || n.indexOf(district) >= 0 || district.indexOf(n) >= 0)) {
      var h2 = cache.get(marketKey_(city, kind, n));
      if (h2) return withList(JSON.parse(h2));
      // キャッシュから先に消えていたら、作り直す
      if (overLimitMarket_()) return whole;
      whole = buildMarket_(city, kind, cache);
      if (!whole.ok) return whole;
      var h3 = cache.get(marketKey_(city, kind, n));
      return h3 ? withList(JSON.parse(h3)) : whole;
    }
  }
  return whole;
}

function overLimitMarket_() {
  var cache = CacheService.getScriptCache();
  var key = 'mk-' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHH');
  var count = Number(cache.get(key) || 0);
  if (count + 1 > MARKET_PER_HOUR) return true;
  cache.put(key, String(count + 1), 3700);
  return false;
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
