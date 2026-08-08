/* store.js — 表示に使う数字をここで作る。
 *
 *  ・元帳（data.js の SOLAR_BASE）は読むだけ。書き換えない。
 *  ・カメラや手入力で足した分は「追記（overlay）」として端末の中に貯める。
 *  ・画面に出すときに 元帳 ＋ 追記 を重ねる。
 *    こうしておくと、元のシートを取り込み直しても追記が消えない。
 *
 *  保存先は localStorage だけ。サーバーには何も送らない
 *  （ドライブへの送信は sync.js を押したときだけ）。
 */
(function (global) {
  'use strict';

  var KEY_OVER = 'solar.overlay.v1';
  var KEY_SET = 'solar.settings.v1';

  var MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  var base = global.SOLAR_BASE;
  var overlay = {};          // { "plantId:year:month": {sales,kwh,at,source,note} }
  var settings = {};
  var changed = null;

  function load() {
    try { overlay = JSON.parse(localStorage.getItem(KEY_OVER) || '{}') || {}; } catch (e) { overlay = {}; }
    try { settings = JSON.parse(localStorage.getItem(KEY_SET) || '{}') || {}; } catch (e) { settings = {}; }
    if (!settings.year) settings.year = latestYearWithData();
  }
  function saveOverlay() {
    localStorage.setItem(KEY_OVER, JSON.stringify(overlay));
    if (changed) changed();
  }
  function saveSettings(patch) {
    Object.assign(settings, patch || {});
    localStorage.setItem(KEY_SET, JSON.stringify(settings));
    if (changed) changed();
  }

  /* ---------- 発電所 ---------- */
  function plants() { return base.plants; }
  function plant(id) {
    return base.plants.filter(function (p) { return p.id === id; })[0] || null;
  }
  /* 「市原」「市原発電所」「Ichihara」どれでも引けるようにする（カメラ読取用） */
  function plantByName(name) {
    var s = String(name || '').trim();
    if (!s) return null;
    var hit = base.plants.filter(function (p) {
      return p.id === s || p.name === s || p.name.indexOf(s) === 0 || s.indexOf(p.name.replace('発電所', '')) === 0;
    })[0];
    return hit || null;
  }

  function years() {
    var set = {};
    base.plants.forEach(function (p) {
      Object.keys(p.years).forEach(function (y) { set[y] = 1; });
    });
    Object.keys(overlay).forEach(function (k) { set[k.split(':')[1]] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }
  function latestYearWithData() {
    var ys = years();
    for (var i = ys.length - 1; i >= 0; i--) {
      if (total(ys[i], 'sales') > 0) return ys[i];
    }
    return ys[ys.length - 1];
  }

  /* ---------- 1ヶ月ぶんの数字 ---------- */
  /* month は 1〜12。返り値の sales / kwh は数字か null。 */
  function cell(plantId, year, month) {
    var p = plant(plantId);
    if (!p) return { sales: null, kwh: null };
    var b = p.years[String(year)];
    var out = {
      sales: b ? b.sales[month - 1] : null,
      kwh: b ? b.kwh[month - 1] : null,
      edited: false
    };
    var o = overlay[plantId + ':' + year + ':' + month];
    if (o) {
      if (o.sales != null) out.sales = o.sales;
      if (o.kwh != null) out.kwh = o.kwh;
      out.edited = true;
      out.source = o.source;
      out.at = o.at;
      out.note = o.note;
    }
    return out;
  }

  /* その月にかかる費用（ローン・草刈り・電気・償却資産税…）。
     シートには当年ぶんしか書かれていないので、同じ額が毎年かかるものとして
     どの年にも当てはめる。年ごとの実額は confirmed（確定利益）で確認する。 */
  function costs(plantId, month) {
    var p = plant(plantId);
    if (!p) return [];
    return p.costs[month - 1] || [];
  }
  function costTotal(plantId, month) {
    return costs(plantId, month).reduce(function (a, c) { return a + c.amount; }, 0);
  }

  /* 月の利益 ＝ 売電 － その月の費用。売電が未入力の月は null（0円ではない）。 */
  function profit(plantId, year, month) {
    var c = cell(plantId, year, month);
    if (c.sales == null) return null;
    return c.sales - costTotal(plantId, month);
  }

  /* ---------- 1年ぶん ---------- */
  /* 発電所1つの、その年の12ヶ月ぶんの行を作る。前年同月との比較も入れる。 */
  function rows(plantId, year) {
    var out = [];
    for (var m = 1; m <= 12; m++) {
      var cur = cell(plantId, year, m);
      var prev = cell(plantId, year - 1, m);
      out.push({
        month: m,
        label: MONTHS[m - 1],
        sales: cur.sales,
        kwh: cur.kwh,
        cost: costTotal(plantId, m),
        costs: costs(plantId, m),
        profit: cur.sales == null ? null : cur.sales - costTotal(plantId, m),
        prevSales: prev.sales,
        prevKwh: prev.kwh,
        diff: (cur.sales != null && prev.sales != null) ? cur.sales - prev.sales : null,
        ratio: (cur.sales != null && prev.sales) ? cur.sales / prev.sales : null,
        kwhDiff: (cur.kwh != null && prev.kwh != null) ? cur.kwh - prev.kwh : null,
        kwhRatio: (cur.kwh != null && prev.kwh) ? cur.kwh / prev.kwh : null,
        edited: cur.edited,
        source: cur.source,
        note: cur.note
      });
    }
    return out;
  }

  function sum(list) {
    var t = 0, any = false;
    list.forEach(function (v) { if (v != null) { t += v; any = true; } });
    return any ? t : null;
  }

  /* 発電所1つの年間合計。months は実績の入っている月数。 */
  function yearSummary(plantId, year) {
    var r = rows(plantId, year);
    var filled = r.filter(function (x) { return x.sales != null; });
    var kwhMonths = r.filter(function (x) { return x.kwh != null; }).length;
    // 前年同期比は「今年 実績のある月」だけで揃えて比べる（途中の年を正しく見るため）
    var prevSame = 0, prevSameOk = true;
    filled.forEach(function (x) {
      if (x.prevSales == null) prevSameOk = false; else prevSame += x.prevSales;
    });
    var sales = sum(r.map(function (x) { return x.sales; }));
    return {
      plantId: plantId,
      year: year,
      months: filled.length,
      kwhMonths: kwhMonths,
      sales: sales,
      kwh: sum(r.map(function (x) { return x.kwh; })),
      cost: r.reduce(function (a, x) { return a + x.cost; }, 0),
      costToDate: filled.reduce(function (a, x) { return a + x.cost; }, 0),
      profit: sum(r.map(function (x) { return x.profit; })),
      prevSameSales: (prevSameOk && filled.length) ? prevSame : null,
      yoy: (prevSameOk && prevSame && sales != null) ? sales / prevSame : null,
      confirmed: (plant(plantId).confirmed || {})[String(year)]
    };
  }

  /* 3基まとめ */
  function total(year, field) {
    var t = 0;
    base.plants.forEach(function (p) {
      var v = yearSummary(p.id, year)[field];
      if (v != null) t += v;
    });
    return t;
  }
  function allSummary(year) {
    var list = base.plants.map(function (p) { return yearSummary(p.id, year); });
    var sales = 0, kwh = 0, prof = 0, prev = 0, prevOk = true, months = 0, run = 0;
    list.forEach(function (s) {
      sales += s.sales || 0; kwh += s.kwh || 0; prof += s.profit || 0;
      if (s.prevSameSales == null) prevOk = false; else prev += s.prevSameSales;
      months = Math.max(months, s.months);
      // 発電所ごとに入っている月数が違うので、1ヶ月あたりも発電所ごとに割ってから足す
      if (s.months) run += s.sales / s.months;
    });
    return {
      year: year, months: months, sales: sales, kwh: kwh, profit: prof,
      runRate: run ? Math.round(run) : null,
      prevSameSales: prevOk ? prev : null,
      yoy: (prevOk && prev) ? sales / prev : null,
      each: list
    };
  }

  /* 3基合計の月別（グラフ用） */
  function monthlyAll(year, field) {
    var out = [];
    for (var m = 1; m <= 12; m++) {
      var t = 0, any = false;
      base.plants.forEach(function (p) {
        var c = cell(p.id, year, m);
        var v = field === 'profit'
          ? (c.sales == null ? null : c.sales - costTotal(p.id, m))
          : c[field];
        if (v != null) { t += v; any = true; }
      });
      out.push(any ? t : null);
    }
    return out;
  }

  /* ---------- 追記 ---------- */
  /* カメラ・手入力の結果を入れる。sales / kwh は片方だけでもよい。 */
  function put(plantId, year, month, vals) {
    if (!plant(plantId)) throw new Error('知らない発電所です: ' + plantId);
    year = Number(year); month = Number(month);
    if (!(year >= 2018 && year <= 2100)) throw new Error('年が正しくありません');
    if (!(month >= 1 && month <= 12)) throw new Error('月が正しくありません');
    var k = plantId + ':' + year + ':' + month;
    var cur = overlay[k] || {};
    overlay[k] = {
      sales: vals.sales != null ? Math.round(Number(vals.sales)) : (cur.sales != null ? cur.sales : null),
      kwh: vals.kwh != null ? Math.round(Number(vals.kwh)) : (cur.kwh != null ? cur.kwh : null),
      source: vals.source || cur.source || 'manual',
      note: vals.note || '',
      at: new Date().toISOString()
    };
    saveOverlay();
    return overlay[k];
  }
  function drop(plantId, year, month) {
    delete overlay[plantId + ':' + year + ':' + month];
    saveOverlay();
  }
  function pending() {
    return Object.keys(overlay).sort().map(function (k) {
      var a = k.split(':');
      return Object.assign({ plantId: a[0], year: Number(a[1]), month: Number(a[2]) }, overlay[k]);
    });
  }
  function clearAll() { overlay = {}; saveOverlay(); }

  /* ---------- 書式 ---------- */
  function yen(v) {
    if (v == null) return '—';
    var s = Math.abs(Math.round(v)).toLocaleString('ja-JP');
    return (v < 0 ? '△' : '') + s;
  }
  function num(v, unit) {
    if (v == null) return '—';
    return Math.round(v).toLocaleString('ja-JP') + (unit || '');
  }
  function pct(r) {
    if (r == null) return '—';
    var d = (r - 1) * 100;
    return (d >= 0 ? '+' : '△') + Math.abs(d).toFixed(1) + '%';
  }

  global.Store = {
    MONTHS: MONTHS,
    load: load,
    onChange: function (fn) { changed = fn; },
    settings: function () { return settings; },
    saveSettings: saveSettings,
    plants: plants, plant: plant, plantByName: plantByName,
    years: years, latestYearWithData: latestYearWithData,
    cell: cell, costs: costs, costTotal: costTotal, profit: profit,
    rows: rows, yearSummary: yearSummary, allSummary: allSummary,
    monthlyAll: monthlyAll,
    put: put, drop: drop, pending: pending, clearAll: clearAll,
    overlay: function () { return overlay; },
    setOverlay: function (o) { overlay = o || {}; saveOverlay(); },
    yen: yen, num: num, pct: pct
  };
})(window);
