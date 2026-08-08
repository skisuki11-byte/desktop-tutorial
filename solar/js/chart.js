/* chart.js — グラフを SVG で自前で描く。外部の読み込みは一切しない。
 *
 *  方針:
 *   ・棒は必ず 0 から。目盛りは薄く、数字は大きく。
 *   ・凡例は上、色は発電所ごとに固定（表とグラフで同じ色にする）。
 *   ・画面の幅を測ってから描く。文字を縮めないため（スマホでも読める大きさを守る）。
 *   ・data が足りない月は棒を描かない（0円として描くと落ち込んだように見えるため）。
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function niceStep(max, want) {
    var raw = max / (want || 5);
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }
  /* 幅が足りないときはラベルを短くする（「10月」→「10」、「2026年」→「'26」）。
     文字そのものを小さくするより読みやすいため。 */
  function fitLabel(lab, slot) {
    var s = String(lab);
    if (slot >= 46) return s;
    if (/月$/.test(s)) return s.slice(0, -1);
    if (/年$/.test(s)) return "'" + s.slice(2, -1);
    return s;
  }

  function fmtAxis(v) {
    var a = Math.abs(v);
    if (a >= 100000000) return (v / 100000000).toFixed(a % 100000000 ? 1 : 0) + '億';
    if (a >= 10000) return (v / 10000).toFixed(a % 10000 && a < 100000 ? 1 : 0) + '万';
    return String(Math.round(v));
  }

  /* 共通の外枠。幅は親要素から測る。 */
  function frame(host, height) {
    host.innerHTML = '';
    var w = Math.max(320, Math.round(host.clientWidth || host.getBoundingClientRect().width || 720));
    var svg = el('svg', {
      width: w, height: height, viewBox: '0 0 ' + w + ' ' + height,
      role: 'img', class: 'chart'
    });
    host.appendChild(svg);
    return { svg: svg, w: w, h: height };
  }

  function legend(svg, series, x, y) {
    var cx = x;
    series.forEach(function (s) {
      svg.appendChild(el('rect', { x: cx, y: y - 11, width: 14, height: 14, rx: 3, fill: s.color, opacity: s.faint ? .45 : 1 }));
      var t = el('text', { x: cx + 20, y: y, class: 'c-legend' }, s.name);
      svg.appendChild(t);
      cx += 20 + s.name.length * 13 + 22;
    });
  }

  /* ------------------------------------------------------------------
     棒グラフ（同じ横位置に複数系列を並べる）
     opt = { labels:[], series:[{name,color,values:[],faint}], unit, height, valueLabels }
  ------------------------------------------------------------------ */
  function bars(host, opt) {
    var H = opt.height || 340;
    var f = frame(host, H), svg = f.svg, W = f.w;
    var padL = 62, padR = 12, padT = opt.series.length > 1 ? 44 : 18, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var max = 0;
    opt.series.forEach(function (s) {
      s.values.forEach(function (v) { if (v != null && v > max) max = v; });
    });
    if (max <= 0) max = 1;
    var step = niceStep(max, 4);
    var top = Math.ceil(max / step) * step;

    if (opt.series.length > 1) legend(svg, opt.series, padL, 20);

    // 目盛り線
    for (var g = 0; g <= top + 1e-6; g += step) {
      var y = padT + plotH - (g / top) * plotH;
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, class: 'c-grid' }));
      svg.appendChild(el('text', { x: padL - 8, y: y + 5, class: 'c-axis', 'text-anchor': 'end' }, fmtAxis(g)));
    }

    var n = opt.labels.length;
    var slot = plotW / n;
    var k = opt.series.length;
    var bw = Math.max(4, Math.min(30, (slot - 8) / k));

    opt.labels.forEach(function (lab, i) {
      var x0 = padL + slot * i + (slot - bw * k) / 2;
      opt.series.forEach(function (s, si) {
        var v = s.values[i];
        if (v == null) return;
        var hh = Math.max(v > 0 ? 2 : 0, (v / top) * plotH);
        var r = el('rect', {
          x: x0 + bw * si, y: padT + plotH - hh, width: bw - 2, height: hh,
          rx: 2, fill: s.color, opacity: s.faint ? .42 : 1
        });
        r.appendChild(el('title', {}, s.name + ' ' + lab + '：' + Math.round(v).toLocaleString('ja-JP') + (opt.unit || '')));
        svg.appendChild(r);
      });
      svg.appendChild(el('text', {
        x: padL + slot * i + slot / 2, y: H - 12, class: 'c-axis', 'text-anchor': 'middle'
      }, fitLabel(lab, slot)));
    });

    svg.appendChild(el('line', { x1: padL, y1: padT + plotH, x2: W - padR, y2: padT + plotH, class: 'c-base' }));
    return svg;
  }

  /* ------------------------------------------------------------------
     積み上げ棒（発電所ごとの内訳を月別に）
     opt = { labels, series:[{name,color,values}], unit, height }
  ------------------------------------------------------------------ */
  function stacked(host, opt) {
    var H = opt.height || 340;
    var f = frame(host, H), svg = f.svg, W = f.w;
    var padL = 62, padR = 12, padT = 44, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var n = opt.labels.length, i, max = 0;
    var sums = [];
    for (i = 0; i < n; i++) {
      var t = 0, any = false;
      opt.series.forEach(function (s) { if (s.values[i] != null) { t += s.values[i]; any = true; } });
      sums.push(any ? t : null);
      if (t > max) max = t;
    }
    if (max <= 0) max = 1;
    var step = niceStep(max, 4);
    var top = Math.ceil(max / step) * step;

    legend(svg, opt.series, padL, 20);
    for (var g = 0; g <= top + 1e-6; g += step) {
      var y = padT + plotH - (g / top) * plotH;
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, class: 'c-grid' }));
      svg.appendChild(el('text', { x: padL - 8, y: y + 5, class: 'c-axis', 'text-anchor': 'end' }, fmtAxis(g)));
    }

    var slot = plotW / n;
    var bw = Math.max(8, Math.min(46, slot - 12));
    opt.labels.forEach(function (lab, idx) {
      var acc = 0;
      var x = padL + slot * idx + (slot - bw) / 2;
      opt.series.forEach(function (s) {
        var v = s.values[idx];
        if (v == null || v <= 0) return;
        var hh = (v / top) * plotH;
        var y2 = padT + plotH - ((acc + v) / top) * plotH;
        var r = el('rect', { x: x, y: y2, width: bw, height: hh, fill: s.color });
        r.appendChild(el('title', {}, s.name + ' ' + lab + '：' + Math.round(v).toLocaleString('ja-JP') + (opt.unit || '')));
        svg.appendChild(r);
        acc += v;
      });
      if (sums[idx] != null && slot > 44) {
        svg.appendChild(el('text', {
          x: x + bw / 2, y: padT + plotH - (sums[idx] / top) * plotH - 7,
          class: 'c-val', 'text-anchor': 'middle'
        }, fmtAxis(sums[idx])));
      }
      svg.appendChild(el('text', {
        x: padL + slot * idx + slot / 2, y: H - 12, class: 'c-axis', 'text-anchor': 'middle'
      }, fitLabel(lab, slot)));
    });
    svg.appendChild(el('line', { x1: padL, y1: padT + plotH, x2: W - padR, y2: padT + plotH, class: 'c-base' }));
    return svg;
  }

  /* ------------------------------------------------------------------
     折れ線（年ごとの推移）
     opt = { labels, series:[{name,color,values}], unit, height, zeroLine }
  ------------------------------------------------------------------ */
  function lines(host, opt) {
    var H = opt.height || 320;
    var f = frame(host, H), svg = f.svg, W = f.w;
    // 右端のラベル（いちばん最後の年など）が切れないよう、右側を広めに空ける
    var padL = 66, padR = 44, padT = 44, padB = 34;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var max = -Infinity, min = 0;
    opt.series.forEach(function (s) {
      s.values.forEach(function (v) {
        if (v == null) return;
        if (v > max) max = v;
        if (v < min) min = v;
      });
    });
    if (max === -Infinity) max = 1;
    var span = max - min || 1;
    var step = niceStep(span, 4);
    var top = Math.ceil(max / step) * step;
    var bot = Math.floor(min / step) * step;
    if (top === bot) top = bot + step;

    var yOf = function (v) { return padT + plotH - ((v - bot) / (top - bot)) * plotH; };
    var xOf = function (i) {
      return opt.labels.length === 1 ? padL + plotW / 2
        : padL + (plotW * i) / (opt.labels.length - 1);
    };

    legend(svg, opt.series, padL, 20);
    for (var g = bot; g <= top + 1e-6; g += step) {
      var y = yOf(g);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, class: g === 0 ? 'c-base' : 'c-grid' }));
      svg.appendChild(el('text', { x: padL - 8, y: y + 5, class: 'c-axis', 'text-anchor': 'end' }, fmtAxis(g)));
    }

    opt.series.forEach(function (s) {
      var d = '', started = false;
      s.values.forEach(function (v, i) {
        if (v == null) { started = false; return; }
        d += (started ? ' L' : ' M') + xOf(i) + ' ' + yOf(v);
        started = true;
      });
      if (d) svg.appendChild(el('path', { d: d.trim(), fill: 'none', stroke: s.color, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      s.values.forEach(function (v, i) {
        if (v == null) return;
        var c = el('circle', { cx: xOf(i), cy: yOf(v), r: 5.5, fill: s.color });
        c.appendChild(el('title', {}, s.name + ' ' + opt.labels[i] + '：' + Math.round(v).toLocaleString('ja-JP') + (opt.unit || '')));
        svg.appendChild(c);
      });
    });

    var lslot = plotW / Math.max(1, opt.labels.length);
    opt.labels.forEach(function (lab, i) {
      svg.appendChild(el('text', { x: xOf(i), y: H - 12, class: 'c-axis', 'text-anchor': 'middle' },
        fitLabel(lab, lslot)));
    });
    return svg;
  }

  /* 描いたあと画面幅が変わったら描き直す。回転や折りたたみに追随させる。 */
  function responsive(host, draw) {
    draw();
    if (host._solarRO) host._solarRO.disconnect();
    if (typeof ResizeObserver === 'function') {
      var last = host.clientWidth;
      var ro = new ResizeObserver(function () {
        var w = host.clientWidth;
        if (Math.abs(w - last) > 12) { last = w; draw(); }
      });
      ro.observe(host);
      host._solarRO = ro;
    }
  }

  global.Chart = { bars: bars, stacked: stacked, lines: lines, responsive: responsive, fmtAxis: fmtAxis };
})(window);
