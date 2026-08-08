/* app.js — 画面の組み立て。
 *
 *  ・数字を作るのは store.js、絵を描くのは chart.js。ここは並べるだけ。
 *  ・「まだ実績のない月」は 0 ではなく空欄（—）で出す。
 *    0円と書くと落ち込んだように見え、判断を誤らせるため。
 *  ・前年同期比は「今年 実績のある月」だけで前年を切り出して比べる。
 *    7月までしか入っていない年を、前年の12ヶ月と比べても意味がないため。
 */
(function () {
  'use strict';

  var S = window.Store, C = window.Chart;
  var $ = function (id) { return document.getElementById(id); };
  var PCLASS = ['p1', 'p2', 'p3'];
  var view = 'home';
  var camState = null;      // カメラで読み取り中の内容

  /* claude.ai の公開ページでは外部通信が塞がれるので、同期の画面は隠す */
  var canSync = !/(^|\.)claude\.ai$/i.test(location.hostname) &&
    !/(^|\.)claudeusercontent\.com$/i.test(location.hostname);

  function color(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
  }
  function plantColor(i) { return color(['--p1', '--p2', '--p3'][i % 3]); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function say(el, msg, kind) {
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.innerHTML = kind === 'busy' ? '<span class="spin"></span>' + esc(msg) : esc(msg);
  }
  function deltaHtml(diff, ratio) {
    if (diff == null) return '<span class="hint">前年なし</span>';
    var cls = diff >= 0 ? 'up' : 'down';
    return '<span class="delta ' + cls + '">' + (diff >= 0 ? '+' : '△') +
      Math.abs(Math.round(diff)).toLocaleString('ja-JP') +
      (ratio != null ? '（' + S.pct(ratio) + '）' : '') + '</span>';
  }

  /* ---------------- 年のチップ ---------------- */
  function yearChips(host, onPick) {
    var ys = S.years();
    host.innerHTML = '';
    ys.slice().reverse().forEach(function (y) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (y === S.settings().year ? ' on' : '');
      b.textContent = y + '年';
      b.onclick = function () { S.saveSettings({ year: y }); onPick && onPick(y); };
      host.appendChild(b);
    });
  }

  /* ================= ホーム ================= */
  function renderHome() {
    var year = S.settings().year;
    yearChips($('homeYears'), render);

    var a = S.allSummary(year);
    var lastMonth = a.months;

    $('homeScope').textContent = lastMonth
      ? year + '年 1月〜' + lastMonth + '月ぶんが入っています'
      : year + '年はまだ実績が入っていません';

    $('homeTotal').innerHTML = [
      card('3基合計の売電額', S.yen(a.sales), '円', null,
        a.yoy != null ? '前年同期 ' + S.yen(a.prevSameSales) + '円 ' + deltaHtml(a.sales - a.prevSameSales, a.yoy) : '前年と比べられません'),
      card('3基合計の発電量', S.num(a.kwh), 'kWh', null, lastMonth + 'ヶ月ぶん'),
      card('3基合計の利益', S.yen(a.profit), '円', a.profit >= 0 ? 'up' : 'down',
        '売電額から返済・経費を引いた額'),
      // 発電所ごとに入っている月数が違うので、割る月数も発電所ごとに変える。
      // 全体を一律 lastMonth で割ると、まだ入っていない発電所のぶん低く出てしまう。
      card('月あたり平均', S.yen(a.runRate), '円', null, '3基そろった1ヶ月ぶんの目安')
    ].join('');

    $('homePlants').innerHTML = a.each.map(function (s, i) {
      var p = S.plant(s.plantId);
      var gap = s.months - s.kwhMonths;
      return card(p.name, S.yen(s.sales), '円', null,
        '発電量 ' + S.num(s.kwh, ' kWh') +
        (gap > 0 ? ' <span class="hint">（' + gap + 'ヶ月ぶん未記入）</span>' : '') + '<br>' +
        '利益 <span class="delta ' + (s.profit >= 0 ? 'up' : 'down') + '">' + S.yen(s.profit) + '円</span><br>' +
        '前年同期比 ' + (s.yoy != null ? deltaHtml(s.sales - s.prevSameSales, s.yoy) : '—') +
        ' <span class="hint">（' + s.months + 'ヶ月）</span>',
        PCLASS[i]);
    }).join('');

    C.responsive($('homeChart'), function () {
      C.bars($('homeChart'), {
        labels: S.MONTHS,
        series: [
          { name: (year - 1) + '年', color: color('--prev'), faint: true, values: S.monthlyAll(year - 1, 'sales') },
          { name: year + '年', color: color('--brand-2'), values: S.monthlyAll(year, 'sales') }
        ],
        unit: '円', height: 360
      });
    });

    renderRecent();
  }

  function card(label, value, unit, cls, sub, extra) {
    return '<div class="card ' + (extra || '') + '">' +
      '<div class="card-label">' + esc(label) + '</div>' +
      '<div class="card-value' + (cls ? ' ' + cls : '') + '">' + esc(value) +
      '<span class="unit">' + esc(unit || '') + '</span></div>' +
      (sub ? '<div class="card-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function renderRecent() {
    var list = S.pending().sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); }).slice(0, 6);
    if (!list.length) {
      $('homeRecent').innerHTML = '<p class="hint">カメラや手入力で足したぶんがここに出ます。まだありません。</p>';
      return;
    }
    $('homeRecent').innerHTML = '<ul class="list">' + list.map(function (r) {
      var p = S.plant(r.plantId);
      return '<li><span class="grow">' + esc(p ? p.name : r.plantId) + ' ' +
        r.year + '年' + r.month + '月' +
        (r.source === 'camera' ? ' <span class="tag">カメラ</span>' : '') + '</span>' +
        '<span class="num">' + S.yen(r.sales) + '円</span>' +
        '<span class="hint">' + S.num(r.kwh, ' kWh') + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ================= 月別 ================= */
  function renderMonth() {
    var year = S.settings().year;
    yearChips($('monthYears'), render);

    // 発電所の絞り込み
    var cur = S.settings().plant || 'all';
    var host = $('monthPlants');
    host.innerHTML = '';
    [{ id: 'all', name: '3基すべて' }].concat(S.plants()).forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (p.id === cur ? ' on' : '');
      b.textContent = p.name;
      b.onclick = function () { S.saveSettings({ plant: p.id }); render(); };
      host.appendChild(b);
    });

    var targets = cur === 'all' ? S.plants() : [S.plant(cur)];
    $('monthPanels').innerHTML = targets.map(function (p) {
      return monthPanel(p, year);
    }).join('') + (cur === 'all' ? allMonthPanel(year) : '');
  }

  function monthPanel(p, year) {
    var rows = S.rows(p.id, year);
    var sum = S.yearSummary(p.id, year);
    var body = rows.map(function (r) {
      var future = r.sales == null;
      return '<tr class="' + (future ? 'future' : '') + '">' +
        '<td>' + r.label + (r.edited ? '<span class="tag">' + (r.source === 'camera' ? 'カメラ' : '入力') + '</span>' : '') + '</td>' +
        '<td>' + S.yen(r.sales) + '</td>' +
        '<td>' + S.num(r.kwh) + '</td>' +
        '<td>' + S.yen(r.prevSales) + '</td>' +
        '<td class="' + (r.diff == null ? '' : r.diff >= 0 ? 'up' : 'down') + '">' +
        (r.diff == null ? '—' : (r.diff >= 0 ? '+' : '△') + Math.abs(r.diff).toLocaleString('ja-JP')) + '</td>' +
        '<td class="' + (r.ratio == null ? '' : r.ratio >= 1 ? 'up' : 'down') + '">' + S.pct(r.ratio) + '</td>' +
        '<td title="' + esc(r.costs.map(function (c) { return c.name + ' ' + c.amount.toLocaleString('ja-JP'); }).join('／')) + '">' +
        S.yen(r.cost) + '</td>' +
        '<td class="' + (r.profit == null ? '' : r.profit >= 0 ? 'up' : 'down') + '">' + S.yen(r.profit) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="panel">' +
      '<div class="panel-head"><h2>' + esc(p.name) + '　' + year + '年</h2>' +
      '<span class="hint">' + p.pref + '／' + p.kw + 'kW／単価' + p.unit + '円／' + esc(p.start) + ' 稼働</span></div>' +
      '<div class="table-wrap"><table>' +
      '<thead><tr><th>月</th><th>売電額</th><th>発電量<br>kWh</th><th>前年同月<br>売電額</th>' +
      '<th>前年差</th><th>前年比</th><th>返済・経費</th><th>利益</th></tr></thead>' +
      '<tbody>' + body +
      '<tr class="total"><td>合計</td><td>' + S.yen(sum.sales) + '</td><td>' + S.num(sum.kwh) + '</td>' +
      '<td>' + S.yen(sum.prevSameSales) + '</td>' +
      '<td class="' + (sum.prevSameSales == null ? '' : sum.sales - sum.prevSameSales >= 0 ? 'up' : 'down') + '">' +
      (sum.prevSameSales == null ? '—' :
        (sum.sales - sum.prevSameSales >= 0 ? '+' : '△') + Math.abs(sum.sales - sum.prevSameSales).toLocaleString('ja-JP')) + '</td>' +
      '<td class="' + (sum.yoy == null ? '' : sum.yoy >= 1 ? 'up' : 'down') + '">' + S.pct(sum.yoy) + '</td>' +
      // 経費は「実績の入っている月ぶん」で足す。売電 − 経費 ＝ 利益 が合うようにするため
      '<td>' + S.yen(sum.costToDate) + '</td>' +
      '<td class="' + (sum.profit >= 0 ? 'up' : 'down') + '">' + S.yen(sum.profit) + '</td></tr>' +
      '</tbody></table></div>' +
      '<p class="hint mt">合計は実績の入っている' + sum.months + 'ヶ月ぶんです（経費もその月ぶんだけ足しています）。' +
      (sum.months < 12 ? '通年の返済・経費は ' + sum.cost.toLocaleString('ja-JP') + '円。' : '') +
      '「返済・経費」はシートに書かれた月々の額（ローン' +
      (p.costs[0].filter(function (c) { return c.name === 'ローン'; })[0] || { amount: 0 }).amount.toLocaleString('ja-JP') +
      '円ほか）を各年に当てはめたものです。' +
      (sum.confirmed != null ? '　この年の確定利益は ' + sum.confirmed.toLocaleString('ja-JP') + '円。' : '') +
      '</p></div>';
  }

  function allMonthPanel(year) {
    var body = '';
    for (var m = 1; m <= 12; m++) {
      var sales = 0, kwh = 0, prof = 0, prev = 0, any = false, prevOk = true, got = 0;
      S.plants().forEach(function (p) {
        var c = S.cell(p.id, year, m), pc = S.cell(p.id, year - 1, m);
        if (c.sales != null) { sales += c.sales; prof += c.sales - S.costTotal(p.id, m); any = true; got++; }
        if (c.kwh != null) kwh += c.kwh;
        if (pc.sales == null) prevOk = false; else prev += pc.sales;
      });
      // 3基そろっていない月は前年と比べても意味がないので、比較を出さずに印をつける
      var partial = any && got < S.plants().length;
      if (partial) prevOk = false;
      var diff = (any && prevOk) ? sales - prev : null;
      body += '<tr class="' + (any ? '' : 'future') + '"><td>' + S.MONTHS[m - 1] +
        (partial ? '<span class="tag">' + got + '基のみ</span>' : '') + '</td>' +
        '<td>' + S.yen(any ? sales : null) + '</td>' +
        '<td>' + S.num(any ? kwh : null) + '</td>' +
        '<td>' + S.yen(prevOk ? prev : null) + '</td>' +
        '<td class="' + (diff == null ? '' : diff >= 0 ? 'up' : 'down') + '">' +
        (diff == null ? '—' : (diff >= 0 ? '+' : '△') + Math.abs(diff).toLocaleString('ja-JP')) + '</td>' +
        '<td class="' + (diff == null ? '' : diff >= 0 ? 'up' : 'down') + '">' +
        (diff == null || !prev ? '—' : S.pct(sales / prev)) + '</td>' +
        '<td class="' + (any ? (prof >= 0 ? 'up' : 'down') : '') + '">' + S.yen(any ? prof : null) + '</td></tr>';
    }
    var a = S.allSummary(year);
    return '<div class="panel"><div class="panel-head"><h2>3基合計　' + year + '年</h2></div>' +
      '<div class="table-wrap"><table><thead><tr><th>月</th><th>売電額</th><th>発電量<br>kWh</th>' +
      '<th>前年同月</th><th>前年差</th><th>前年比</th><th>利益</th></tr></thead><tbody>' + body +
      '<tr class="total"><td>合計</td><td>' + S.yen(a.sales) + '</td><td>' + S.num(a.kwh) + '</td>' +
      '<td>' + S.yen(a.prevSameSales) + '</td>' +
      '<td class="' + (a.prevSameSales == null ? '' : a.sales - a.prevSameSales >= 0 ? 'up' : 'down') + '">' +
      (a.prevSameSales == null ? '—' : (a.sales - a.prevSameSales >= 0 ? '+' : '△') +
        Math.abs(a.sales - a.prevSameSales).toLocaleString('ja-JP')) + '</td>' +
      '<td class="' + (a.yoy == null ? '' : a.yoy >= 1 ? 'up' : 'down') + '">' + S.pct(a.yoy) + '</td>' +
      '<td class="' + (a.profit >= 0 ? 'up' : 'down') + '">' + S.yen(a.profit) + '</td></tr>' +
      '</tbody></table></div></div>';
  }

  /* ================= 年度別 ================= */
  function renderYear() {
    var ys = S.years();

    /* 12ヶ月そろっていない年には ※ を付ける。
       途中経過の年をそろった年と並べると、落ち込んだように見えてしまうため。 */
    function partial(id, y) {
      var s = S.yearSummary(id, y);
      return s.months > 0 && s.months < 12;
    }

    function tableOf(pick, fmt, mark) {
      var head = '<thead><tr><th>発電所</th>' + ys.map(function (y) { return '<th>' + y + '年</th>'; }).join('') + '</tr></thead>';
      var body = S.plants().map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td>' + ys.map(function (y) {
          return '<td>' + fmt(pick(p.id, y)) +
            (mark && partial(p.id, y) ? '<span class="tag">' + S.yearSummary(p.id, y).months + 'ヶ月</span>' : '') +
            '</td>';
        }).join('') + '</tr>';
      }).join('');
      var tot = '<tr class="total"><td>3基合計</td>' + ys.map(function (y) {
        var t = 0, any = false;
        S.plants().forEach(function (p) {
          var v = pick(p.id, y);
          if (v != null) { t += v; any = true; }
        });
        return '<td>' + fmt(any ? t : null) + '</td>';
      }).join('') + '</tr>';
      return '<table>' + head + '<tbody>' + body + tot + '</tbody></table>';
    }

    $('yearSales').innerHTML = tableOf(function (id, y) { return S.yearSummary(id, y).sales; }, S.yen, true);
    $('yearKwh').innerHTML = tableOf(function (id, y) { return S.yearSummary(id, y).kwh; }, function (v) { return S.num(v); }, true);
    $('yearProfit').innerHTML = tableOf(function (id, y) {
      var c = (S.plant(id).confirmed || {})[String(y)];
      return c == null ? null : c;
    }, S.yen);

    var labels = ys.map(function (y) { return y + '年'; });
    C.responsive($('yearChart'), function () {
      C.lines($('yearChart'), {
        labels: labels,
        series: S.plants().map(function (p, i) {
          return {
            name: p.name.replace('発電所', ''), color: plantColor(i),
            values: ys.map(function (y) {
              var s = S.yearSummary(p.id, y);
              // 途中までの年を並べると落ち込んで見えるので、12ヶ月そろった年だけ点を打つ
              return s.months === 12 ? s.sales : null;
            })
          };
        }),
        unit: '円', height: 320
      });
    });
    C.responsive($('yearProfitChart'), function () {
      C.lines($('yearProfitChart'), {
        labels: labels,
        series: S.plants().map(function (p, i) {
          return {
            name: p.name.replace('発電所', '') + '（確定利益）', color: plantColor(i),
            values: ys.map(function (y) {
              var v = (p.confirmed || {})[String(y)];
              return v == null ? null : v;
            })
          };
        }),
        unit: '円', height: 320
      });
    });
  }

  /* ================= グラフ ================= */
  function renderChart() {
    var year = S.settings().year;
    yearChips($('chartYears'), render);

    var series = S.plants().map(function (p, i) {
      return {
        name: p.name.replace('発電所', ''), color: plantColor(i),
        values: S.rows(p.id, year).map(function (r) { return r.sales; })
      };
    });
    C.responsive($('chStacked'), function () {
      C.stacked($('chStacked'), { labels: S.MONTHS, series: series, unit: '円', height: 380 });
    });

    C.responsive($('chKwh'), function () {
      C.bars($('chKwh'), {
        labels: S.MONTHS,
        series: S.plants().map(function (p, i) {
          return {
            name: p.name.replace('発電所', ''), color: plantColor(i),
            values: S.rows(p.id, year).map(function (r) { return r.kwh; })
          };
        }),
        unit: 'kWh', height: 340
      });
    });

    C.responsive($('chProfit'), function () {
      C.lines($('chProfit'), {
        labels: S.MONTHS,
        series: [{
          name: year + '年 3基合計の利益', color: color('--brand-2'),
          values: S.monthlyAll(year, 'profit')
        }],
        unit: '円', height: 320
      });
    });

    C.responsive($('chYoy'), function () {
      C.lines($('chYoy'), {
        labels: S.MONTHS,
        series: S.plants().map(function (p, i) {
          return {
            name: p.name.replace('発電所', ''), color: plantColor(i),
            values: S.rows(p.id, year).map(function (r) { return r.diff; })
          };
        }),
        unit: '円', height: 320
      });
    });
  }

  /* ================= カメラ入力 ================= */
  function setupCamera() {
    $('btnShoot').onclick = function () { $('fileShoot').click(); };
    $('btnPick').onclick = function () { $('filePick').click(); };
    $('fileShoot').onchange = function (e) { onImage(e.target.files[0]); e.target.value = ''; };
    $('filePick').onchange = function (e) { onImage(e.target.files[0]); e.target.value = ''; };

    // 手入力の選択肢
    var sp = $('mPlant');
    sp.innerHTML = S.plants().map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    var now = new Date();
    var sy = $('mYear'), ys = S.years();
    var maxY = Math.max(now.getFullYear(), ys[ys.length - 1]);
    var opts = [];
    for (var y = ys[0]; y <= maxY; y++) opts.push(y);
    sy.innerHTML = opts.map(function (y) {
      return '<option value="' + y + '"' + (y === now.getFullYear() ? ' selected' : '') + '>' + y + '年</option>';
    }).join('');
    $('mMonth').innerHTML = S.MONTHS.map(function (m, i) {
      return '<option value="' + (i + 1) + '"' + (i + 1 === now.getMonth() + 1 ? ' selected' : '') + '>' + m + '</option>';
    }).join('');

    ['mPlant', 'mYear', 'mMonth', 'mSales', 'mKwh'].forEach(function (id) {
      $(id).addEventListener('change', manualCheck);
      $(id).addEventListener('input', manualCheck);
    });

    $('btnManual').onclick = function () {
      var pid = $('mPlant').value, y = Number($('mYear').value), m = Number($('mMonth').value);
      var sales = $('mSales').value === '' ? null : Number($('mSales').value);
      var kwh = $('mKwh').value === '' ? null : Number($('mKwh').value);
      if (sales == null && kwh == null) { say($('mStatus'), '売電額か発電量のどちらかは入れてください', 'err'); return; }
      try {
        S.put(pid, y, m, { sales: sales, kwh: kwh, source: 'manual' });
        say($('mStatus'), S.plant(pid).name + ' ' + y + '年' + m + '月を保存しました', 'ok');
        $('mSales').value = ''; $('mKwh').value = '';
        manualCheck();
        render();
      } catch (e) {
        say($('mStatus'), e.message, 'err');
      }
    };
  }

  function manualCheck() {
    var pid = $('mPlant').value, y = Number($('mYear').value), m = Number($('mMonth').value);
    var sales = $('mSales').value === '' ? 0 : Number($('mSales').value);
    var kwh = $('mKwh').value === '' ? 0 : Number($('mKwh').value);
    if (!sales && !kwh) { $('mCheck').innerHTML = ''; return; }
    var w = window.OCR.sanity({ plantId: pid, year: y, month: m, sales: sales, kwh: kwh });
    $('mCheck').innerHTML = w.length
      ? '<div class="note"><strong>確認してください</strong><ul>' +
      w.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'
      : '';
  }

  function onImage(file) {
    if (!file) return;
    var key = (S.settings().apiKey || '').trim();
    var st = $('camStatus');
    if (!key) {
      say(st, 'カメラ読み取りには APIキーの登録が必要です（設定タブ）', 'err');
      return;
    }
    $('camResult').innerHTML = '';
    say(st, '画像を用意しています…', 'busy');

    window.OCR.toBase64Jpeg(file).then(function (img) {
      $('camPreview').src = img.preview;
      $('camPreview').hidden = false;
      say(st, '読み取っています…（10秒ほどかかります）', 'busy');
      return window.OCR.readImage(img.data, key, S.settings().model);
    }).then(function (res) {
      if (!res.readings.length) {
        say(st, '明細を読み取れませんでした。明細全体が入るように、明るいところで撮り直してください。', 'err');
        return;
      }
      say(st, (res.docType ? res.docType + 'として ' : '') + res.readings.length + '件を読み取りました。内容を確かめてください。', 'ok');
      showReadings(res.readings);
    }).catch(function (e) {
      say(st, e.message || String(e), 'err');
    });
  }

  /* 読み取り結果を、直せる形で並べる。押すまでは帳簿に入らない。 */
  function showReadings(list) {
    camState = list.map(function (r) {
      var p = S.plantByName(r.plant);
      return {
        plantId: p ? p.id : '',
        year: r.year || new Date().getFullYear(),
        month: r.month || 0,
        sales: r.sales || null,
        kwh: r.kwh || null,
        uncertain: !!r.uncertain,
        note: r.note || '',
        hint: r.plantHint || ''
      };
    });
    drawReadings();
  }

  function drawReadings() {
    var host = $('camResult');
    host.innerHTML = camState.map(function (r, i) {
      var warns = window.OCR.sanity(r);
      return '<div class="readout" data-i="' + i + '">' +
        '<h3>読み取り結果 ' + (camState.length > 1 ? (i + 1) + '件目' : '') + '</h3>' +
        (r.uncertain ? '<div class="note">数字がはっきり読めていません。もとの明細と見比べてください。</div>' : '') +
        (r.note ? '<p class="hint">' + esc(r.note) + '</p>' : '') +
        (r.hint ? '<p class="hint">手がかり：' + esc(r.hint) + '</p>' : '') +
        '<div class="grid2">' +
        '<label class="field"><span>発電所</span><select data-f="plantId">' +
        '<option value="">選んでください</option>' +
        S.plants().map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === r.plantId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        }).join('') + '</select></label>' +
        '<label class="field"><span>年</span><input type="number" data-f="year" value="' + (r.year || '') + '" inputmode="numeric"></label>' +
        '<label class="field"><span>月</span><input type="number" data-f="month" value="' + (r.month || '') + '" inputmode="numeric" min="1" max="12"></label>' +
        '<label class="field"><span>売電額（円）</span><input type="number" data-f="sales" value="' + (r.sales || '') + '" inputmode="numeric"></label>' +
        '<label class="field"><span>発電量（kWh）</span><input type="number" data-f="kwh" value="' + (r.kwh || '') + '" inputmode="numeric"></label>' +
        '</div>' +
        (warns.length ? '<div class="note"><strong>確認してください</strong><ul>' +
          warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="actions">' +
        '<button class="btn btn-primary btn-lg" data-act="save">この内容で取り込む</button>' +
        '<button class="btn" data-act="skip">これは使わない</button>' +
        '</div></div>';
    }).join('');

    host.querySelectorAll('.readout').forEach(function (box) {
      var i = Number(box.dataset.i);
      box.querySelectorAll('[data-f]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var f = inp.dataset.f;
          camState[i][f] = f === 'plantId' ? inp.value : (inp.value === '' ? null : Number(inp.value));
          drawReadings();
        });
      });
      box.querySelector('[data-act="save"]').onclick = function () {
        var r = camState[i];
        if (!r.plantId) { toast('発電所を選んでください'); return; }
        if (!(r.month >= 1 && r.month <= 12)) { toast('月を1〜12で入れてください'); return; }
        if (r.sales == null && r.kwh == null) { toast('売電額か発電量のどちらかは必要です'); return; }
        try {
          S.put(r.plantId, r.year, r.month, { sales: r.sales, kwh: r.kwh, source: 'camera' });
          toast(S.plant(r.plantId).name + ' ' + r.year + '年' + r.month + '月を取り込みました');
          camState.splice(i, 1);
          drawReadings();
          render();
        } catch (e) { toast(e.message); }
      };
      box.querySelector('[data-act="skip"]').onclick = function () {
        camState.splice(i, 1);
        drawReadings();
      };
    });
  }

  /* ---------------- 取り込んだぶんの一覧と、シートへの書き戻し ---------------- */
  function renderPending() {
    var list = S.pending();
    var host = $('pendingList'), acts = $('pendingActions');
    if (!list.length) {
      host.innerHTML = '<p class="hint">まだありません。</p>';
      acts.innerHTML = '';
      return;
    }
    host.innerHTML = '<ul class="list">' + list.map(function (r) {
      var p = S.plant(r.plantId);
      return '<li><span class="grow">' + esc(p ? p.name : r.plantId) + ' ' + r.year + '年' + r.month + '月' +
        (r.source === 'camera' ? ' <span class="tag">カメラ</span>' : '') + '</span>' +
        '<span class="num">' + S.yen(r.sales) + '円</span>' +
        '<span class="hint">' + S.num(r.kwh, ' kWh') + '</span>' +
        '<button class="btn" data-del="' + r.plantId + ':' + r.year + ':' + r.month + '">消す</button></li>';
    }).join('') + '</ul>';

    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.del.split(':');
        S.drop(a[0], Number(a[1]), Number(a[2]));
        render();
      };
    });

    acts.innerHTML = canSync
      ? '<button class="btn btn-primary btn-lg" id="btnPush">シートに書き込む（' + list.length + '件）</button>'
      : '<span class="hint">この画面ではシートへの書き込みは使えません。</span>';
    if (canSync) {
      $('btnPush').onclick = function () {
        var st = $('pushStatus');
        if (!window.Sync.configured()) {
          say(st, 'シートのURLがまだ設定されていません（設定タブ）', 'err');
          return;
        }
        say(st, '書き込んでいます…', 'busy');
        window.Sync.push(list.map(function (r) {
          return { plantId: r.plantId, year: r.year, month: r.month, sales: r.sales, kwh: r.kwh };
        })).then(function (res) {
          var n = (res.written || []).length;
          var cells = (res.written || []).map(function (w) { return w.cell; }).join('、');
          say(st, n + '件を書き込みました（' + cells + '）', 'ok');
          if ((res.skipped || []).length) {
            say(st, n + '件を書き込みました。' +
              res.skipped.length + '件は見送りました：' +
              res.skipped.map(function (s) { return s.why; }).join('／'), 'err');
          }
        }).catch(function (e) {
          say(st, e.message || String(e), 'err');
        });
      };
    }
  }

  /* ================= 設定 ================= */
  function setupSettings() {
    var s = S.settings();
    $('setApiKey').value = s.apiKey ? '' : '';
    $('setApiKey').placeholder = s.apiKey ? '登録済み（変えるときだけ入力）' : '未登録';
    $('setSyncUrl').value = s.syncUrl || '';
    $('syncPanel').hidden = !canSync;

    $('btnSaveKey').onclick = function () {
      var v = $('setApiKey').value.trim();
      if (!v) { say($('keyStatus'), '入力欄が空です', 'err'); return; }
      if (!/^sk-ant-/.test(v)) { say($('keyStatus'), 'APIキーは sk-ant- で始まります。貼り間違いがないか確かめてください', 'err'); return; }
      S.saveSettings({ apiKey: v });
      $('setApiKey').value = '';
      $('setApiKey').placeholder = '登録済み（変えるときだけ入力）';
      say($('keyStatus'), '保存しました。カメラ入力が使えます', 'ok');
    };
    $('btnClearKey').onclick = function () {
      S.saveSettings({ apiKey: '' });
      $('setApiKey').value = '';
      $('setApiKey').placeholder = '未登録';
      say($('keyStatus'), '消しました', 'ok');
    };

    $('btnSaveUrl').onclick = function () {
      var v = $('setSyncUrl').value.trim();
      if (v && !window.Sync.okUrl(v)) {
        say($('urlStatus'), 'https:// で始まるURLにしてください', 'err'); return;
      }
      S.saveSettings({ syncUrl: v });
      say($('urlStatus'), v ? '保存しました' : '消しました', 'ok');
      render();
    };
    $('btnClearUrl').onclick = function () {
      S.saveSettings({ syncUrl: '' });
      $('setSyncUrl').value = '';
      say($('urlStatus'), '消しました', 'ok');
      render();
    };

    $('btnPull').onclick = function () {
      var st = $('urlStatus');
      say(st, 'シートを読んでいます…', 'busy');
      window.Sync.pull().then(function (got) {
        say(st, got.plantCount + '基・' + got.monthCount + 'ヶ月ぶんを読みました', 'ok');
        var d = window.Sync.diff(got);
        if (!d.length) {
          $('pullResult').innerHTML = '<p class="hint mt">手元の数字と同じでした。取り込むものはありません。</p>';
          return;
        }
        $('pullResult').innerHTML = '<div class="note mt"><strong>' + d.length +
          'ヶ月ぶん、シートと手元で違いがあります。</strong>取り込むとシートの値になります。</div>' +
          '<div class="table-wrap"><table><thead><tr><th>発電所</th><th>年月</th>' +
          '<th>手元</th><th>シート</th></tr></thead><tbody>' +
          d.slice(0, 40).map(function (x) {
            return '<tr><td>' + esc(x.plantName) + '</td><td>' + x.year + '/' + x.month + '</td>' +
              '<td>' + S.yen(x.mineSales) + '</td><td>' + S.yen(x.sheetSales) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="actions mt"><button class="btn btn-primary" id="btnApplyPull">シートの値を取り込む</button></div>';
        $('btnApplyPull').onclick = function () {
          d.forEach(function (x) {
            S.put(x.plantId, x.year, x.month, {
              sales: x.sheetSales, kwh: x.sheetKwh, source: 'sheet'
            });
          });
          $('pullResult').innerHTML = '';
          say(st, d.length + 'ヶ月ぶんを取り込みました', 'ok');
          render();
        };
      }).catch(function (e) {
        say(st, e.message || String(e), 'err');
        $('pullResult').innerHTML = '';
      });
    };

    $('btnXlsx').onclick = exportXlsx;
    $('btnJson').onclick = function () {
      var blob = new Blob([JSON.stringify({ overlay: S.overlay(), at: new Date().toISOString() }, null, 1)],
        { type: 'application/json' });
      window.XLSXW.download(blob, '売電_入力ぶん_' + stamp() + '.json');
      say($('expStatus'), '書き出しました', 'ok');
    };
    $('btnJsonIn').onclick = function () { $('fileJson').click(); };
    $('fileJson').onchange = function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      f.text().then(function (t) {
        var d = JSON.parse(t);
        var o = d.overlay || d;
        if (typeof o !== 'object') throw new Error('形が違います');
        S.setOverlay(o);
        say($('expStatus'), Object.keys(o).length + '件を取り込みました', 'ok');
        render();
      }).catch(function (err) {
        say($('expStatus'), '読み込めませんでした：' + err.message, 'err');
      });
    };

    $('btnReset').onclick = function () {
      if (!confirm('この端末に足した入力をすべて消します。元のシートのデータは残ります。よろしいですか。')) return;
      S.clearAll();
      render();
      toast('消しました');
    };

    $('aboutList').innerHTML = [
      ['もとのデータ', window.SOLAR_BASE.source + '（' + window.SOLAR_BASE.updated + ' 時点）'],
      ['対象', S.plants().map(function (p) { return p.name; }).join('・')],
      ['保存先', 'この端末のブラウザ（localStorage）のみ'],
      ['通信', 'カメラ読み取り＝api.anthropic.com／書き戻し＝登録したシートのURL。どちらも押したときだけ'],
      ['入力ぶん', S.pending().length + '件']
    ].map(function (r) {
      return '<li><span class="grow">' + esc(r[0]) + '</span><span class="hint">' + esc(r[1]) + '</span></li>';
    }).join('');
  }

  function stamp() {
    var t = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + '-' + p(t.getHours()) + p(t.getMinutes());
  }

  function exportXlsx() {
    var X = window.XLSXW, year = S.settings().year, ys = S.years();
    var sheets = [];

    // 選んだ年の月別（発電所ごとに区切って縦に並べる）
    var rows = [[X.title(year + '年 月別'), null, null, null, null, null, null, null]];
    S.plants().forEach(function (p) {
      rows.push([]);
      rows.push([X.s(p.name, X.S.SUBT), X.s('', X.S.SUBT), X.s('', X.S.SUBT), X.s('', X.S.SUBT),
      X.s('', X.S.SUBT), X.s('', X.S.SUBT), X.s('', X.S.SUBT), X.s('', X.S.SUBT)]);
      rows.push(['月', '売電額', '発電量kWh', '前年同月', '前年差', '前年比', '返済・経費', '利益'].map(X.h));
      S.rows(p.id, year).forEach(function (r) {
        rows.push([X.s(r.label), X.n(r.sales), X.n(r.kwh), X.n(r.prevSales), X.n(r.diff),
        r.ratio == null ? X.s('') : X.n(r.ratio - 1, X.S.PCT), X.n(r.cost), X.n(r.profit)]);
      });
      var sm = S.yearSummary(p.id, year);
      rows.push([X.s('合計', X.S.TOTT), X.n(sm.sales, X.S.TOTN), X.n(sm.kwh, X.S.TOTN),
      X.n(sm.prevSameSales, X.S.TOTN),
      X.n(sm.prevSameSales == null ? null : sm.sales - sm.prevSameSales, X.S.TOTN),
      sm.yoy == null ? X.s('', X.S.TOTT) : X.n(sm.yoy - 1, X.S.PCT),
      // 画面と同じく、経費も実績の入っている月ぶんだけ足す（売電 − 経費 ＝ 利益）
      X.n(sm.costToDate, X.S.TOTN), X.n(sm.profit, X.S.TOTN)]);
    });
    sheets.push({ name: year + '年 月別', cols: [10, 14, 13, 14, 13, 10, 13, 14], rows: rows });

    // 年度別（売電・kWh・確定利益）
    function yearSheet(name, pick, pctStyle) {
      var r = [[X.s('発電所', X.S.HEAD)].concat(ys.map(function (y) { return X.h(y + '年'); }))];
      S.plants().forEach(function (p) {
        r.push([X.s(p.name)].concat(ys.map(function (y) { return X.n(pick(p.id, y)); })));
      });
      r.push([X.s('3基合計', X.S.TOTT)].concat(ys.map(function (y) {
        var t = 0, any = false;
        S.plants().forEach(function (p) {
          var v = pick(p.id, y);
          if (v != null) { t += v; any = true; }
        });
        return X.n(any ? t : null, X.S.TOTN);
      })));
      sheets.push({ name: name, cols: [16].concat(ys.map(function () { return 13; })), rows: r });
    }
    yearSheet('年度別 売電額', function (id, y) { return S.yearSummary(id, y).sales; });
    yearSheet('年度別 発電量', function (id, y) { return S.yearSummary(id, y).kwh; });
    yearSheet('年度別 確定利益', function (id, y) {
      var v = (S.plant(id).confirmed || {})[String(y)];
      return v == null ? null : v;
    });

    X.download(X.build(sheets), '売電まとめ_' + year + '年_' + stamp() + '.xlsx');
    say($('expStatus'), '書き出しました', 'ok');
  }

  /* ================= 起動 ================= */
  function render() {
    if (view === 'home') renderHome();
    else if (view === 'month') renderMonth();
    else if (view === 'year') renderYear();
    else if (view === 'chart') renderChart();
    else if (view === 'camera') { renderPending(); manualCheck(); }
    else if (view === 'settings') setupSettings();
    // ホーム以外を見ていても、直近の入力の件数は合わせておく
    if (view !== 'camera') renderPending();
    if (view !== 'home') renderRecent();
  }

  function show(name) {
    view = name;
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === name);
    });
    window.scrollTo(0, 0);
    render();
  }

  function applyTheme() {
    var t = S.settings().theme;
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  function init() {
    S.load();
    applyTheme();
    S.onChange(function () { /* 保存のたびに描き直すのは重いので、呼び出し側で render する */ });

    document.querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () { show(t.dataset.view); };
    });
    $('btnTheme').onclick = function () {
      var now = S.settings().theme;
      var next = now === 'dark' ? 'light' : now === 'light' ? '' : 'dark';
      S.saveSettings({ theme: next });
      applyTheme();
      render();
    };

    setupCamera();
    setupSettings();
    show('home');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
