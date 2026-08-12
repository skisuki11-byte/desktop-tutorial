/* chart.js — SVGを文字列で組み立てるだけの小さな作図。ライブラリは使わない。
 * 色はCSSのトークン（--s1〜--s5 など）を参照するので、明暗テーマの切り替えに勝手について来る。
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function yen(n) { return Math.round(n).toLocaleString('ja-JP'); }

  /* ---------- 配分のドーナツ ---------- */
  /* items: [{label, value, color}] */
  function donut(items, opts) {
    opts = opts || {};
    var size = opts.size || 220;
    var r = size / 2 - 14;
    var cx = size / 2, cy = size / 2;
    var total = items.reduce(function (s, i) { return s + i.value; }, 0);
    if (total <= 0) return '<p class="hint">まだ数字がありません。</p>';

    var acc = -Math.PI / 2;   // 12時から時計回り
    var paths = items.map(function (it) {
      var ang = (it.value / total) * Math.PI * 2;
      var x1 = cx + r * Math.cos(acc), y1 = cy + r * Math.sin(acc);
      acc += ang;
      var x2 = cx + r * Math.cos(acc), y2 = cy + r * Math.sin(acc);
      var large = ang > Math.PI ? 1 : 0;
      // 円弧をそのまま太い線で描く（塗りではなく stroke なのでドーナツになる）
      return '<path d="M' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
        '" fill="none" stroke="' + it.color + '" stroke-width="26"><title>' +
        esc(it.label) + '　' + (it.value / total * 100).toFixed(1) + '%</title></path>';
    }).join('');

    var center = opts.center
      ? '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" class="c-mid">' + esc(opts.center) + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" class="c-sub">' + esc(opts.centerSub || '') + '</text>'
      : '';

    return '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size +
      '" role="img" aria-label="配分">' + paths + center + '</svg>';
  }

  /* ---------- 月別の入金（積み上げ棒） ---------- */
  /* months: [{month, total, items:[{ticker, amount}]}], colorOf: ticker -> 色 */
  function calendarBars(months, colorOf) {
    var W = 720, H = 260, padL = 56, padR = 12, padT = 16, padB = 34;
    var max = Math.max.apply(null, months.map(function (m) { return m.total; }).concat([1]));
    var step = Math.pow(10, Math.floor(Math.log10(max)));
    var top = Math.ceil(max / step) * step;
    var iw = (W - padL - padR) / 12;
    var bw = Math.min(38, iw * 0.62);

    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var v = top * g / 4;
      var y = H - padB - (v / top) * (H - padT - padB);
      grid += '<line class="c-grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="c-axis" x="' + (padL - 8) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="end">' + yen(v) + '</text>';
    }

    var bars = months.map(function (m, i) {
      var x = padL + iw * i + (iw - bw) / 2;
      var acc = 0;
      var seg = m.items.map(function (it) {
        var h = (it.amount / top) * (H - padT - padB);
        var y = H - padB - acc - h;
        acc += h;
        return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + colorOf(it.ticker) + '"><title>' +
          m.month + '月　' + esc(it.ticker) + '　' + yen(it.amount) + '円</title></rect>';
      }).join('');
      var label = '<text class="c-axis" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - padB + 20) +
        '" text-anchor="middle">' + m.month + '</text>';
      return seg + label;
    }).join('');

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="月別の入金予定">' +
      grid + bars +
      '<line class="c-base" x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '"/>' +
      '</svg>';
  }

  /* ---------- 5年の推移（累計投資 vs 残高） ---------- */
  function growth(series) {
    if (!series.length) return '';
    var W = 720, H = 280, padL = 68, padR = 14, padT = 18, padB = 40;
    var top = Math.max.apply(null, series.map(function (s) { return s.balance; }));
    var step = Math.pow(10, Math.floor(Math.log10(top)));
    top = Math.ceil(top / step) * step;
    var n = series.length;
    var iw = (W - padL - padR) / n;
    var bw = Math.min(52, iw * 0.34);

    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var v = top * g / 4;
      var y = H - padB - (v / top) * (H - padT - padB);
      grid += '<line class="c-grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="c-axis" x="' + (padL - 8) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="end">' +
        (v >= 10000 ? (v / 10000) + '万' : yen(v)) + '</text>';
    }

    var bars = series.map(function (s, i) {
      var cx = padL + iw * i + iw / 2;
      function bar(val, off, cls) {
        var h = (val / top) * (H - padT - padB);
        return '<rect class="' + cls + '" x="' + (cx + off).toFixed(1) + '" y="' + (H - padB - h).toFixed(1) +
          '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="3"/>';
      }
      return bar(s.invested, -bw - 2, 'c-invested') + bar(s.balance, 2, 'c-balance') +
        '<text class="c-axis" x="' + cx.toFixed(1) + '" y="' + (H - padB + 20) + '" text-anchor="middle">' +
        s.year + '年後</text>' +
        '<title>' + s.year + '年後　累計投資 ' + yen(s.invested) + '円／残高 ' + yen(s.balance) + '円</title>';
    }).join('');

    var legend = '<rect class="c-invested" x="' + padL + '" y="' + (H - 14) + '" width="14" height="12" rx="2"/>' +
      '<text class="c-legend" x="' + (padL + 20) + '" y="' + (H - 7) + '">累計投資</text>' +
      '<rect class="c-balance" x="' + (padL + 108) + '" y="' + (H - 14) + '" width="14" height="12" rx="2"/>' +
      '<text class="c-legend" x="' + (padL + 128) + '" y="' + (H - 7) + '">残高</text>';

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="5年の推移">' +
      grid + bars +
      '<line class="c-base" x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '"/>' +
      legend + '</svg>';
  }

  global.Chart = { donut: donut, calendarBars: calendarBars, growth: growth };

})(window);
