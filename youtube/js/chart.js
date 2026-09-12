/* chart.js — グラフを SVG で自前で描く。外部の読み込みは一切しない。
 *
 *  描き方の決めごと（どの画面でも同じにする）:
 *   ・棒は必ず 0 から始める。途中から始めると差が実際より大きく見えるため。
 *   ・目盛りと軸は薄く、数字は大きく。主役は線と棒。
 *   ・色は1系列なら1色。凡例は2系列以上のときだけ出す。
 *     増減のように色が意味を持つ場所は、色だけに頼らず必ず数字を添える
 *     （色の見え方には個人差があるため、色が読めなくても分かるようにする）。
 *   ・色は CSS の変数で持つ。明暗テーマの切り替えが1か所で済む。
 *   ・指を置いた／触れた位置の値は必ず出す。読み取りを目分量にさせない。
 *   ・幅は親要素を測ってから描く。文字を縮めずスマホでも読める大きさを守る。
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

  /* ---------- 数の見せ方 ---------- */
  function fmtInt(v) { return Math.round(v).toLocaleString('ja-JP'); }
  /* 1万以上は「万・億」で縮める。1万未満はそのまま出す。
     以前は1000以上を「k」にしていたが、5,000が「5.0k」で
     50,000が「5.0万」という不統一な並びになり、桁を読み違える。
     日本語の画面なので単位は万・億に統一する。 */
  function fmtAxis(v) {
    var a = Math.abs(v);
    // 小数を出すかは「割ったあとの値」で決める。割る前の値で決めると
    // 99,999 が「10.0万」、100,000 が「10万」と不揃いになる。
    var unit = function (x, u) {
      return (Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + u;
    };
    if (a >= 100000000) return unit(v / 100000000, '億');
    if (a >= 10000) return unit(v / 10000, '万');
    return Math.round(v).toLocaleString('ja-JP');
  }

  /* お金。円は小数を出さない（1円未満まで見せても判断が変わらないため）。
     ドルなどは額が小さいと 0 に潰れてしまうので、100未満のときだけ小数2桁を残す。 */
  function fmtMoney(v, cur) {
    var n = Number(v) || 0;
    cur = cur || 'JPY';
    var dec = (cur === 'JPY' || Math.abs(n) >= 100) ? 0 : 2;
    try {
      return n.toLocaleString('ja-JP', {
        style: 'currency', currency: cur,
        minimumFractionDigits: dec, maximumFractionDigits: dec
      });
    } catch (e) {
      return n.toFixed(dec) + ' ' + cur;
    }
  }
  function fmtPct(v) { return (Math.round(v * 10) / 10) + '%'; }
  /* 1%未満の割合。解除率のように 0.0X% の桁で効くものは、
     小数1桁だと 0.1% と 0.04% が同じ「0.0%」に潰れて比べられなくなる。
     小さいときだけ桁を増やす。 */
  function fmtRate(v) {
    var a = Math.abs(v);
    if (!a) return '0%';
    if (a < 0.01) return '0.01%未満';
    if (a < 1) return (Math.round(v * 100) / 100) + '%';
    return (Math.round(v * 10) / 10) + '%';
  }
  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m >= 60) return Math.floor(m / 60) + '時間' + (m % 60) + '分';
    return m + '分' + ('0' + s).slice(-2) + '秒';
  }
  function niceStep(max, want) {
    var raw = max / (want || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }
  function mdLabel(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : iso;
  }

  /* ---------- 共通の枠 ---------- */
  function frame(host, height) {
    host.innerHTML = '';
    host.classList.add('chart-host');
    var w = Math.max(300, Math.round(host.clientWidth || host.getBoundingClientRect().width || 640));
    var svg = el('svg', {
      width: '100%', height: height, viewBox: '0 0 ' + w + ' ' + height,
      preserveAspectRatio: 'none', role: 'img', class: 'chart'
    });
    host.appendChild(svg);
    return { svg: svg, w: w, h: height };
  }

  /* 触れた位置に出す吹き出し。グラフの上に重ねる小さなHTML。 */
  function tipFor(host) {
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.appendChild(tip);
    return {
      show: function (html, x, y) {
        tip.innerHTML = html;
        tip.hidden = false;
        var hw = host.clientWidth, tw = tip.offsetWidth;
        var left = Math.min(Math.max(x - tw / 2, 4), Math.max(4, hw - tw - 4));
        tip.style.left = left + 'px';
        tip.style.top = Math.max(0, y) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  /* 画面幅が変わったら描き直す。文字を伸び縮みさせないため。 */
  function responsive(host, draw) {
    draw();
    if (host._chartRo) host._chartRo.disconnect();
    if (typeof ResizeObserver === 'function') {
      var last = host.clientWidth, timer = null;
      host._chartRo = new ResizeObserver(function () {
        if (Math.abs(host.clientWidth - last) < 24) return;
        last = host.clientWidth;
        clearTimeout(timer);
        timer = setTimeout(draw, 120);
      });
      host._chartRo.observe(host);
    }
  }

  /* ========== 折れ線（日ごとの推移） ==========
     values: [{date:'2026-01-01', value:123}]
     compare: 直前の同じ長さの期間。比較は主役ではないので点線の灰色にする。 */
  function line(host, opt) {
    responsive(host, function () {
      var data = opt.values || [];
      if (!data.length) { host.innerHTML = '<p class="chart-empty">この期間のデータがありません</p>'; return; }

      var f = frame(host, opt.height || 220);
      var svg = f.svg, W = f.w, H = f.h;
      var padL = 44, padR = 12, padT = 14, padB = 26;
      var iw = W - padL - padR, ih = H - padT - padB;

      var cmp = opt.compare || [];
      var vals = data.map(function (d) { return d.value; }).concat(cmp.map(function (d) { return d.value; }));
      var max = Math.max.apply(null, vals.concat([1]));
      var step = niceStep(max, 4);
      var top = Math.ceil(max / step) * step || 1;

      var x = function (i, n) { return padL + (n <= 1 ? iw / 2 : iw * i / (n - 1)); };
      var y = function (v) { return padT + ih - ih * (v / top); };

      /* 目盛り。薄い横線だけ。縦線は引かない（線の邪魔になる） */
      for (var g = 0; g <= top + 1e-9; g += step) {
        svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(g), y2: y(g), class: 'c-grid' }));
        svg.appendChild(el('text', { x: padL - 8, y: y(g) + 4, class: 'c-axis c-axis-y' }, fmtAxis(g)));
      }

      function path(rows, close) {
        var d = '';
        rows.forEach(function (r, i) { d += (i ? 'L' : 'M') + x(i, rows.length) + ' ' + y(r.value); });
        if (close && rows.length) {
          d += 'L' + x(rows.length - 1, rows.length) + ' ' + y(0) + 'L' + x(0, rows.length) + ' ' + y(0) + 'Z';
        }
        return d;
      }

      if (cmp.length > 1) svg.appendChild(el('path', { d: path(cmp), class: 'c-line-cmp' }));
      svg.appendChild(el('path', { d: path(data, true), class: 'c-area' }));
      svg.appendChild(el('path', { d: path(data), class: 'c-line' }));

      /* 日付は端と真ん中だけ。全部出すと潰れて読めなくなる。 */
      [0, Math.floor((data.length - 1) / 2), data.length - 1].forEach(function (i, k, arr) {
        if (arr.indexOf(i) !== k) return;
        svg.appendChild(el('text', {
          x: x(i, data.length), y: H - 8, class: 'c-axis',
          'text-anchor': i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'
        }, mdLabel(data[i].date)));
      });

      /* 触れた位置に縦線と値 */
      var tip = tipFor(host);
      var cross = el('line', { class: 'c-cross', y1: padT, y2: padT + ih, x1: 0, x2: 0, opacity: 0 });
      var dot = el('circle', { class: 'c-dot', r: 4.5, cx: 0, cy: 0, opacity: 0 });
      svg.appendChild(cross); svg.appendChild(dot);

      var hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
      svg.appendChild(hit);
      var unit = opt.unit || '';
      function move(ev) {
        var box = host.getBoundingClientRect();
        var pt = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - box.left) / box.width * W;
        var i = Math.round((pt - padL) / (iw || 1) * (data.length - 1));
        i = Math.max(0, Math.min(data.length - 1, i));
        var px = x(i, data.length), py = y(data[i].value);
        cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('opacity', 1);
        dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('opacity', 1);
        var html = '<b>' + data[i].date + '</b>' +
          '<span>' + (opt.label || '') + ' <b>' + fmtInt(data[i].value) + unit + '</b></span>';
        if (cmp[i]) html += '<span class="tip-cmp">前の期間 ' + fmtInt(cmp[i].value) + unit + '</span>';
        tip.show(html, px / W * host.clientWidth, py / H * host.clientHeight - 12);
      }
      function leave() { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); tip.hide(); }
      hit.addEventListener('mousemove', move);
      hit.addEventListener('mouseleave', leave);
      hit.addEventListener('touchstart', move, { passive: true });
      hit.addEventListener('touchmove', move, { passive: true });
      hit.addEventListener('touchend', leave);
    });
  }

  /* ========== 横棒（内訳・順位） ==========
     rows: [{label, value, sub}]
     大小を比べるだけなので色は1色。数字は棒の横に必ず書く。 */
  function hbar(host, rows, opt) {
    opt = opt || {};
    /* 順位を見せる棒なので、必ず大きい順に並べ替える。
       APIの返す順に頼ると、並びが崩れて「どれが多いのか」が読めなくなる。 */
    if (rows && rows.length && opt.keepOrder !== true) {
      rows = rows.slice().sort(function (a, b) { return b.value - a.value; });
    }
    responsive(host, function () {
      host.innerHTML = '';
      host.classList.add('chart-host');
      if (!rows || !rows.length) { host.innerHTML = '<p class="chart-empty">この期間のデータがありません</p>'; return; }

      var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
      var total = rows.reduce(function (a, r) { return a + r.value; }, 0);
      var fmt = opt.format || fmtInt;
      var list = document.createElement('div');
      list.className = 'hbar';

      rows.forEach(function (r) {
        /* id が付いている行は押せるようにする（押した先で1本の詳細を開く）。
           付いていない行はただの内訳なので、押せる見た目にしない。
           押せないものを押せそうに見せるのは、いちばん困らせる作りなので。 */
        var row = document.createElement(r.id ? 'button' : 'div');
        row.className = 'hbar-row' + (r.id ? ' is-link' : '');
        if (r.id) {
          row.type = 'button';
          row.dataset.id = r.id;
          row.setAttribute('aria-label', r.label + 'の詳細を見る');
        }
        var share = total ? (r.value / total * 100) : 0;
        row.innerHTML =
          '<div class="hbar-head"><span class="hbar-label" title="' + esc(r.label) + '">' + esc(r.label) + '</span>' +
          '<span class="hbar-val">' + fmt(r.value) +
          (opt.share !== false && total ? ' <em>' + fmtPct(share) + '</em>' : '') +
          (r.id ? '<span class="hbar-more" aria-hidden="true"></span>' : '') + '</span></div>' +
          '<div class="hbar-track"><div class="hbar-fill" style="width:' +
          Math.max(1.5, r.value / max * 100) + '%"></div></div>' +
          (r.sub ? '<div class="hbar-sub">' + esc(r.sub) + '</div>' : '');
        list.appendChild(row);
      });
      host.appendChild(list);
    });
  }

  /* ========== 登録者の増減 ==========
     増と減は意味が反対なので上下に分ける。色の違いだけに頼らず、
     必ず数字（＋/−つき）を添える。 */
  function delta(host, rows) {
    responsive(host, function () {
      if (!rows || !rows.length) { host.innerHTML = '<p class="chart-empty">この期間のデータがありません</p>'; return; }
      var f = frame(host, 160);
      var svg = f.svg, W = f.w, H = f.h;
      var padL = 44, padR = 12, padT = 12, padB = 22;
      var iw = W - padL - padR, ih = H - padT - padB;

      var up = rows.map(function (r) { return r.gained; });
      var dn = rows.map(function (r) { return r.lost; });
      var max = Math.max.apply(null, up.concat(dn).concat([1]));
      var mid = padT + ih / 2;
      var half = ih / 2;
      var bw = Math.max(1.5, Math.min(14, iw / rows.length - 2));  // 棒どうしは2px空ける

      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: mid, y2: mid, class: 'c-grid' }));
      // 上下で同じ目盛りを使う。符号を付けないと、どちらが増でどちらが減か分からない。
      svg.appendChild(el('text', { x: padL - 8, y: padT + 10, class: 'c-axis c-axis-y' }, '＋' + fmtAxis(max)));
      svg.appendChild(el('text', { x: padL - 8, y: padT + ih, class: 'c-axis c-axis-y' }, '−' + fmtAxis(max)));

      var tip = tipFor(host);
      rows.forEach(function (r, i) {
        var cx = padL + iw * (i + 0.5) / rows.length;
        var hu = r.gained / max * half, hd = r.lost / max * half;
        var g = el('g', { class: 'c-col' });
        if (r.gained) g.appendChild(el('rect', { x: cx - bw / 2, y: mid - hu, width: bw, height: hu, rx: 2, class: 'c-up' }));
        if (r.lost) g.appendChild(el('rect', { x: cx - bw / 2, y: mid, width: bw, height: hd, rx: 2, class: 'c-down' }));
        g.appendChild(el('rect', { x: cx - Math.max(bw, 8) / 2, y: padT, width: Math.max(bw, 8), height: ih, fill: 'transparent' }));
        g.addEventListener('mouseenter', function () {
          tip.show('<b>' + r.date + '</b><span class="tip-up">＋' + fmtInt(r.gained) + '</span>' +
            '<span class="tip-down">−' + fmtInt(r.lost) + '</span>',
            cx / W * host.clientWidth, 0);
        });
        g.addEventListener('mouseleave', function () { tip.hide(); });
        svg.appendChild(g);
      });

      [0, rows.length - 1].forEach(function (i) {
        svg.appendChild(el('text', {
          x: padL + iw * (i + 0.5) / rows.length, y: H - 6, class: 'c-axis',
          'text-anchor': i === 0 ? 'start' : 'end'
        }, mdLabel(rows[i].date)));
      });
    });
  }

  /* ========== 視聴維持率 ==========
     横軸は動画の頭からの割合、縦軸はその地点をまだ見ている人の割合。
     100%の線（全員が見ている状態）を基準として薄く引く。 */
  function retention(host, points) {
    responsive(host, function () {
      if (!points || points.length < 3) {
        host.innerHTML = '<p class="chart-empty">この動画は維持率を出せるだけの再生数がありません</p>'; return;
      }
      var f = frame(host, 220);
      var svg = f.svg, W = f.w, H = f.h;
      var padL = 44, padR = 12, padT = 14, padB = 26;
      var iw = W - padL - padR, ih = H - padT - padB;

      var max = Math.max(100, Math.max.apply(null, points.map(function (p) { return p.y; })));
      var step = niceStep(max, 4);
      var top = Math.ceil(max / step) * step;
      var x = function (r) { return padL + iw * r; };
      var y = function (v) { return padT + ih - ih * (v / top); };

      for (var g = 0; g <= top + 1e-9; g += step) {
        svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(g), y2: y(g), class: 'c-grid' }));
        svg.appendChild(el('text', { x: padL - 8, y: y(g) + 4, class: 'c-axis c-axis-y' }, g + '%'));
      }
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(100), y2: y(100), class: 'c-ref' }));

      var d = '', area = '';
      points.forEach(function (p, i) { d += (i ? 'L' : 'M') + x(p.x) + ' ' + y(p.y); });
      area = d + 'L' + x(points[points.length - 1].x) + ' ' + y(0) + 'L' + x(points[0].x) + ' ' + y(0) + 'Z';
      svg.appendChild(el('path', { d: area, class: 'c-area' }));
      svg.appendChild(el('path', { d: d, class: 'c-line' }));

      ['0%', '25%', '50%', '75%', '100%'].forEach(function (lab, i) {
        svg.appendChild(el('text', {
          x: x(i / 4), y: H - 8, class: 'c-axis',
          'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle'
        }, lab));
      });

      var tip = tipFor(host);
      var cross = el('line', { class: 'c-cross', y1: padT, y2: padT + ih, x1: 0, x2: 0, opacity: 0 });
      svg.appendChild(cross);
      var hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
      svg.appendChild(hit);
      function move(ev) {
        var box = host.getBoundingClientRect();
        var pt = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - box.left) / box.width * W;
        var r = Math.max(0, Math.min(1, (pt - padL) / (iw || 1)));
        var i = Math.round(r * (points.length - 1));
        var p = points[i];
        cross.setAttribute('x1', x(p.x)); cross.setAttribute('x2', x(p.x)); cross.setAttribute('opacity', 1);
        tip.show('<b>' + Math.round(p.x * 100) + '% 地点' + (p.at ? '（' + p.at + '）' : '') + '</b>' +
          '<span>まだ見ている人 <b>' + fmtPct(p.y) + '</b></span>',
          x(p.x) / W * host.clientWidth, y(p.y) / H * host.clientHeight - 12);
      }
      hit.addEventListener('mousemove', move);
      hit.addEventListener('touchstart', move, { passive: true });
      hit.addEventListener('touchmove', move, { passive: true });
      hit.addEventListener('mouseleave', function () { cross.setAttribute('opacity', 0); tip.hide(); });
    });
  }

  /* ========== ごく小さい推移線（数字カードの中） ========== */
  function spark(host, values) {
    host.innerHTML = '';
    if (!values || values.length < 2) return;
    var W = 120, H = 28;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var span = (max - min) || 1;
    var d = '';
    values.forEach(function (v, i) {
      d += (i ? 'L' : 'M') + (W * i / (values.length - 1)) + ' ' + (H - 2 - (H - 4) * (v - min) / span);
    });
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    svg.appendChild(el('path', { d: d, class: 'c-line' }));
    host.appendChild(svg);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.Chart = {
    line: line, hbar: hbar, delta: delta, retention: retention, spark: spark,
    fmtInt: fmtInt, fmtAxis: fmtAxis, fmtPct: fmtPct, fmtRate: fmtRate, fmtDur: fmtDur,
    fmtMoney: fmtMoney, esc: esc
  };
})(window);
