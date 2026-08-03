/* app.js — 画面の組み立てと操作 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var S = Store;

  /* 動作環境。claude.ai で公開したページは外部通信と .xlsx 保存ができないため、
     ビルド時に window.CASHBOOK_HOST で機能を切り替える。
     何も指定が無ければ（＝ローカルや自前のサーバー）すべて有効。 */
  var HOST = window.CASHBOOK_HOST || {};
  var canAI = HOST.ai !== false;      // カメラのAI読み取り
  var canXlsx = HOST.xlsx !== false;  // .xlsx での書き出し
  var canSync = HOST.sync !== false;  // 置き場所からの「反映」（外部への通信が要る）

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) { return (n == null || n === '') ? '' : Number(n).toLocaleString('ja-JP'); }
  function jpDate(d) {
    var p = d.split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  }
  function jpMonth(k) {
    var p = k.split('-');
    return p[0] + '年' + Number(p[1]) + '月';
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function color(k) { return S.COLORS[k] || '#8b95a5'; }

  /* ================= 画面切り替え ================= */
  var current = 'dash';
  function show(view) {
    current = view;
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('active', v.id === 'view-' + view);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.dataset.view === view);
    });
    render(view);
    window.scrollTo(0, 0);
  }

  function render(view) {
    if (view === 'dash') renderDash();
    else if (view === 'ledger') renderLedger();
    else if (view === 'kamoku') renderKamoku();
    else if (view === 'month') renderMonth();
    else if (view === 'report') renderReport();
    else if (view === 'settings') renderSettings();
    renderTop();
  }
  function refresh() { render(current); }

  function renderTop() {
    $('bookTitle').textContent = S.data().title;
    $('topBalance').textContent = '¥' + yen(S.currentBalance());
  }

  /* ================= 共通の絞り込みUI ================= */
  function filterBar(host, f, opts, onChange) {
    opts = opts || {};
    var range = S.dateRange();
    var kams = S.kamokuList();
    var html = '';
    html += '<div class="field"><label>開始日</label><input type="date" data-f="from" value="' + esc(f.from || '') + '"></div>';
    html += '<div class="field"><label>終了日</label><input type="date" data-f="to" value="' + esc(f.to || '') + '"></div>';
    if (opts.kamoku !== false) {
      html += '<div class="field"><label>科目</label><select data-f="kamoku"><option value="all">すべて</option>' +
        kams.map(function (k) {
          return '<option value="' + esc(k) + '"' + (f.kamoku === k ? ' selected' : '') + '>' + esc(k) + '</option>';
        }).join('') + '</select></div>';
    }
    if (opts.type !== false) {
      html += '<div class="field"><label>種別</label><select data-f="type">' +
        [['all', 'すべて'], ['in', '収入のみ'], ['out', '支出のみ']].map(function (o) {
          return '<option value="' + o[0] + '"' + (f.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>';
    }
    if (opts.q !== false) {
      html += '<div class="field"><label>検索</label><input type="search" data-f="q" placeholder="摘要・科目で検索" value="' + esc(f.q || '') + '"></div>';
    }
    if (opts.check !== false) {
      html += '<div class="field"><label>&nbsp;</label><label class="btn" style="gap:6px"><input type="checkbox" data-f="checkOnly"' +
        (f.checkOnly ? ' checked' : '') + ' style="width:auto;min-width:0">要確認のみ</label></div>';
    }
    html += '<div class="field"><label>&nbsp;</label><button class="btn" data-act="reset">全期間</button></div>';
    host.innerHTML = html;

    host.oninput = host.onchange = function (e) {
      var k = e.target.dataset.f;
      if (!k) return;
      f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      onChange();
    };
    host.onclick = function (e) {
      if (e.target.dataset.act === 'reset') {
        f.from = ''; f.to = ''; f.kamoku = 'all'; f.type = 'all'; f.q = ''; f.checkOnly = false;
        onChange();
      }
    };
    return range;
  }

  /* ================= ホーム ================= */
  /* データが1件も無いとき（公開用のからのビルドなど）に、何をすればよいか示す */
  function showEmptyGuide(on) {
    var host = $('view-dash');
    var el = $('dashEmpty');
    Array.prototype.forEach.call(host.querySelectorAll('.panel'), function (p) {
      if (p.id !== 'dashEmpty') p.hidden = on;
    });
    if (!on) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'panel';
      el.id = 'dashEmpty';
      el.innerHTML =
        '<div class="panel-head"><h2>はじめに</h2></div>' +
        '<p class="lead">この出納帳にはまだ記録がありません。どちらかで始められます。</p>' +
        '<ol class="steps">' +
        '<li><b>保存しておいたデータを読み込む</b><br>' +
        '「設定」タブ →「JSONを取り込む」（バックアップから復元）または「CSVを取り込む」</li>' +
        '<li><b>最初から入力する</b><br>' +
        '「設定」タブで帳簿名と前年度繰越金を決めてから、「出納帳」タブの' +
        '「＋ 手入力で追加」、または「カメラ読取」で追加</li>' +
        '</ol>' +
        '<p class="hint">入れたデータはこの端末の中だけに保存され、どこにも送信されません。</p>';
      host.insertBefore(el, host.firstChild);
    }
    el.hidden = false;
  }

  function renderDash() {
    var rows = S.withBalances();
    var t = S.totals(rows);
    var checks = rows.filter(function (r) { return r.check; });
    var opening = S.data().opening.amount;
    showEmptyGuide(!rows.length);

    $('dashCards').innerHTML = [
      card('現在残高', '¥' + yen(S.currentBalance()), '前年度繰越 ¥' + yen(opening), ''),
      card('収入合計', '¥' + yen(t.income), '繰越を除く', 'in'),
      card('支出合計', '¥' + yen(t.expense), rows.length + ' 件の仕訳', 'out'),
      card('要確認', checks.length + ' 件', '原本と照合してください', checks.length ? 'warn' : '')
    ].join('');

    // 月別の支出（科目別の積み上げ）
    var months = S.byMonth(rows);
    var maxExp = Math.max.apply(null, months.map(function (m) { return m.expense; }).concat([1]));
    var kams = S.expenseKamoku();
    $('dashMonth').innerHTML =
      '<div class="bars">' + months.map(function (m) {
        var segs = kams.filter(function (k) { return m.byKamoku[k]; }).map(function (k) {
          return '<div class="bar-seg" style="width:' + (m.byKamoku[k] / maxExp * 100) + '%;background:' + color(k) +
            '" title="' + esc(k) + ' ¥' + yen(m.byKamoku[k]) + '"></div>';
        }).join('');
        return '<div class="bar-row clickable" data-month="' + m.key + '">' +
          '<span class="lb">' + jpMonth(m.key) + '</span>' +
          '<span class="bar-track">' + segs + '</span>' +
          '<span class="bar-val"><span class="neg">▲' + yen(m.expense) + '</span>' +
          (m.income ? '<br><span class="pos">+' + yen(m.income) + '</span>' : '') + '</span>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="legend">' + kams.map(function (k) {
        return '<span><i style="background:' + color(k) + '"></i>' + esc(k) + '</span>';
      }).join('') + '</div>';
    $('dashMonth').onclick = function (e) {
      var row = e.target.closest('[data-month]');
      if (row) { monthF.month = row.dataset.month; show('month'); }
    };

    // 科目別の支出
    var by = S.byKamoku(rows).expense;
    var list = Object.keys(by).sort(function (a, b) { return by[b].total - by[a].total; });
    var maxK = Math.max.apply(null, list.map(function (k) { return by[k].total; }).concat([1]));
    $('dashKamoku').innerHTML = '<div class="bars">' + list.map(function (k) {
      return '<div class="bar-row clickable" data-kamoku="' + esc(k) + '">' +
        '<span class="lb">' + esc(k) + '</span>' +
        '<span class="bar-track"><div class="bar-seg" style="width:' + (by[k].total / maxK * 100) + '%;background:' + color(k) + '"></div></span>' +
        '<span class="bar-val">' + yen(by[k].total) + '<br><span class="hint">' + by[k].count + '件</span></span>' +
        '</div>';
    }).join('') + '</div>';
    $('dashKamoku').onclick = function (e) {
      var row = e.target.closest('[data-kamoku]');
      if (row) { kamokuF.open = row.dataset.kamoku; show('kamoku'); }
    };

    $('dashCheckPanel').hidden = !checks.length;
    if (checks.length) $('dashCheck').innerHTML = table(checks, { compact: true });
  }

  function card(k, v, s, cls) {
    return '<div class="card ' + (cls || '') + '"><div class="k">' + esc(k) + '</div>' +
      '<div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>';
  }

  /* ================= 出納帳 ================= */
  var ledgerF = { from: '', to: '', kamoku: 'all', type: 'all', q: '', checkOnly: false };

  function table(rows, opt) {
    opt = opt || {};
    if (!rows.length) return '<div class="empty">該当する仕訳がありません</div>';
    var h = '<table><thead><tr>' +
      '<th>No</th><th>日付</th><th>科目</th><th>内訳</th><th class="wide">摘要</th>' +
      '<th class="num">収入</th><th class="num">支出</th>' +
      (opt.compact ? '' : '<th class="num">残高</th><th></th>') +
      '</tr></thead><tbody>';
    rows.forEach(function (e) {
      h += '<tr class="' + (e.check ? 'flagged' : '') + '" data-no="' + e.no + '">' +
        '<td>' + e.no + '</td>' +
        '<td>' + jpDate(e.date) + '</td>' +
        '<td>' + esc(e.kamoku) + '</td>' +
        '<td>' + esc(e.uchiwake) + '</td>' +
        '<td class="wide">' + esc(e.tekiyo) + (e.check ? ' <span class="tag check">要確認</span>' : '') + '</td>' +
        '<td class="num pos">' + (e.income ? yen(e.income) : '') + '</td>' +
        '<td class="num neg">' + (e.expense ? yen(e.expense) : '') + '</td>' +
        (opt.compact ? '' :
          '<td class="num">' + yen(e.balance) + '</td>' +
          '<td>' + (Auth.isAdmin()
            ? '<button class="btn" data-edit="' + e.no + '">編集</button>' : '') + '</td>') +
        '</tr>';
    });
    return h + '</tbody></table>';
  }

  function renderLedger() {
    filterBar($('ledgerFilters'), ledgerF, {}, renderLedger);
    var rows = S.filterRows(S.withBalances(), ledgerF);
    var t = S.totals(rows);
    $('ledgerSummary').innerHTML =
      '<span>件数 <b>' + rows.length + '</b></span>' +
      '<span>収入 <b class="pos">¥' + yen(t.income) + '</b></span>' +
      '<span>支出 <b class="neg">¥' + yen(t.expense) + '</b></span>' +
      '<span>差引 <b>¥' + yen(t.net) + '</b></span>';
    $('ledgerTable').innerHTML = table(rows, {});
    $('ledgerTable').onclick = function (e) {
      var b = e.target.closest('[data-edit]');
      if (b) openEditor(Number(b.dataset.edit));
    };
  }

  /* ================= 科目別 ================= */
  var kamokuF = { from: '', to: '', kamoku: 'all', type: 'all', q: '', checkOnly: false, open: null };

  function renderKamoku() {
    filterBar($('kamokuFilters'), kamokuF, { kamoku: false, type: false }, renderKamoku);
    var rows = S.filterRows(S.withBalances(), kamokuF);
    var g = S.byKamoku(rows);
    var html = '';

    html += section('収入の部', g.income, S.totals(rows).income, 'pos');
    html += section('支出の部', g.expense, S.totals(rows).expense, 'neg');
    $('kamokuBody').innerHTML = html || '<div class="empty">データがありません</div>';

    $('kamokuBody').onclick = function (e) {
      var head = e.target.closest('.kam-head');
      if (head) {
        var grp = head.parentElement;
        grp.classList.toggle('open');
        kamokuF.open = grp.classList.contains('open') ? grp.dataset.k : null;
      }
    };
  }

  function section(title, groups, total, cls) {
    var keys = Object.keys(groups).sort(function (a, b) { return groups[b].total - groups[a].total; });
    if (!keys.length) return '';
    var h = '<h3 style="margin:14px 0 8px">' + esc(title) +
      ' <span class="hint">合計 ¥' + yen(total) + '</span></h3>';
    keys.forEach(function (k) {
      var g = groups[k];
      var pct = total ? (g.total / total * 100) : 0;
      var open = kamokuF.open === k;
      h += '<div class="kam-group' + (open ? ' open' : '') + '" data-k="' + esc(k) + '">' +
        '<div class="kam-head"><span class="nm"><span class="caret">▶</span>' + esc(k) + '</span>' +
        '<span class="num">' + g.count + '件</span>' +
        '<span class="num ' + cls + '">¥' + yen(g.total) + '</span>' +
        '<span class="num hint">' + pct.toFixed(1) + '%</span></div>' +
        '<div class="kam-body">';
      Object.keys(g.uchiwake).sort(function (a, b) {
        return g.uchiwake[b].total - g.uchiwake[a].total;
      }).forEach(function (u) {
        var uu = g.uchiwake[u];
        h += '<div class="kam-head" style="background:transparent;cursor:default;padding-left:26px">' +
          '<span>└ ' + esc(u) + '</span><span class="num">' + uu.count + '件</span>' +
          '<span class="num ' + cls + '">¥' + yen(uu.total) + '</span>' +
          '<span class="num hint">' + (g.total ? (uu.total / g.total * 100).toFixed(0) : 0) + '%</span></div>';
        h += '<div class="table-wrap">' + table(uu.rows, { compact: true }) + '</div>';
      });
      h += '</div></div>';
    });
    return h;
  }

  /* ================= 月別 ================= */
  var monthF = { from: '', to: '', kamoku: 'all', type: 'all', q: '', checkOnly: false, month: null };

  function renderMonth() {
    filterBar($('monthFilters'), monthF, { kamoku: false, type: false }, renderMonth);
    var rows = S.filterRows(S.withBalances(), monthF);
    var months = S.byMonth(rows);
    var kams = S.expenseKamoku();
    var opening = S.data().opening.amount;

    var h = '<table><thead><tr><th>年月</th><th class="num">収入</th>' +
      kams.map(function (k) { return '<th class="num">' + esc(k) + '</th>'; }).join('') +
      '<th class="num">支出計</th><th class="num">収支差額</th><th class="num">月末残高</th></tr></thead><tbody>';

    var run = opening, tot = { inc: 0, exp: 0, k: {} };
    months.forEach(function (m) {
      run += m.income - m.expense;
      tot.inc += m.income; tot.exp += m.expense;
      var net = m.income - m.expense;
      h += '<tr class="clickable' + (monthF.month === m.key ? ' sub' : '') + '" data-month="' + m.key + '">' +
        '<td>' + jpMonth(m.key) + '</td>' +
        '<td class="num pos">' + (m.income ? yen(m.income) : '') + '</td>' +
        kams.map(function (k) {
          tot.k[k] = (tot.k[k] || 0) + (m.byKamoku[k] || 0);
          return '<td class="num">' + (m.byKamoku[k] ? yen(m.byKamoku[k]) : '') + '</td>';
        }).join('') +
        '<td class="num neg">' + yen(m.expense) + '</td>' +
        '<td class="num ' + (net >= 0 ? 'pos' : 'neg') + '">' + yen(net) + '</td>' +
        '<td class="num">' + yen(run) + '</td></tr>';
    });
    h += '<tr class="total"><td>合計</td><td class="num">' + yen(tot.inc) + '</td>' +
      kams.map(function (k) { return '<td class="num">' + yen(tot.k[k] || 0) + '</td>'; }).join('') +
      '<td class="num">' + yen(tot.exp) + '</td>' +
      '<td class="num">' + yen(tot.inc - tot.exp) + '</td>' +
      '<td class="num">' + yen(run) + '</td></tr>';
    h += '</tbody></table>';
    $('monthTable').innerHTML = h;

    $('monthTable').onclick = function (e) {
      var tr = e.target.closest('[data-month]');
      if (!tr) return;
      monthF.month = (monthF.month === tr.dataset.month) ? null : tr.dataset.month;
      renderMonth();
    };

    if (monthF.month) {
      var det = rows.filter(function (r) { return S.monthKey(r.date) === monthF.month; });
      $('monthDetail').innerHTML = '<h3 style="margin:18px 0 8px">' + jpMonth(monthF.month) +
        ' の明細 <span class="hint">' + det.length + '件</span></h3>' +
        '<div class="table-wrap">' + table(det, { compact: true }) + '</div>';
    } else {
      $('monthDetail').innerHTML = '<p class="hint" style="margin-top:12px">行をクリックするとその月の明細が出ます。</p>';
    }
  }

  /* ================= 仕訳の編集 ================= */
  var editing = null;
  function openEditor(no) {
    if (!Auth.isAdmin()) { requireAdmin(function () { openEditor(no); }); return; }
    var e = no == null ? {
      date: todayStr(), kamoku: '消耗品', uchiwake: 'その他', tekiyo: '', income: 0, expense: 0, memo: ''
    } : S.data().entries.find(function (x) { return x.no === no; });
    if (!e) return;
    editing = no;
    $('modalTitle').textContent = no == null ? '仕訳を追加' : 'No.' + no + ' を編集';

    $('modalBody').innerHTML =
      '<div class="form-grid">' +
      '<label>日付</label><input type="date" id="fDate" value="' + esc(e.date) + '">' +
      '<label>科目</label><select id="fKamoku">' + S.kamokuList().map(function (k) {
        return '<option' + (k === e.kamoku ? ' selected' : '') + '>' + esc(k) + '</option>';
      }).join('') + '</select>' +
      '<label>内訳</label><input list="uchiList" id="fUchi" value="' + esc(e.uchiwake) + '">' +
      '<label>摘要</label><input type="text" id="fTekiyo" value="' + esc(e.tekiyo) + '">' +
      '<label>収入金額</label><input type="number" id="fIn" min="0" step="1" value="' + (e.income || 0) + '">' +
      '<label>支払金額</label><input type="number" id="fOut" min="0" step="1" value="' + (e.expense || 0) + '">' +
      '<label>メモ</label><input type="text" id="fMemo" value="' + esc(e.memo || '') + '">' +
      '<label>要確認</label><label style="justify-self:start"><input type="checkbox" id="fCheck"' +
      (e.check ? ' checked' : '') + '> 原本と要照合</label>' +
      '</div><datalist id="uchiList"></datalist>' +
      (no == null ? '' : '<div class="actions mt"><button class="btn btn-danger" id="fDel">この仕訳を削除</button></div>');

    function syncUchi() {
      $('uchiList').innerHTML = S.uchiwakeList($('fKamoku').value)
        .map(function (u) { return '<option value="' + esc(u) + '">'; }).join('');
    }
    syncUchi();
    $('fKamoku').onchange = function () {
      syncUchi();
      var list = S.uchiwakeList(this.value);
      if (list.indexOf($('fUchi').value) < 0) $('fUchi').value = list[0] || 'その他';
    };
    if ($('fDel')) $('fDel').onclick = function () {
      if (confirm('No.' + no + '「' + e.tekiyo + '」を削除します。よろしいですか？')) {
        S.remove(no); closeModal(); refresh(); toast('削除しました');
      }
    };
    $('modal').hidden = false;
  }

  function closeModal() { $('modal').hidden = true; editing = null; }

  function saveEditor() {
    var v = {
      date: $('fDate').value,
      kamoku: $('fKamoku').value,
      uchiwake: $('fUchi').value.trim() || 'その他',
      tekiyo: $('fTekiyo').value.trim(),
      income: Number($('fIn').value) || 0,
      expense: Number($('fOut').value) || 0,
      memo: $('fMemo').value.trim(),
      check: $('fCheck').checked
    };
    if (!v.date) { toast('日付を入れてください'); return; }
    if (!v.income && !v.expense) { toast('収入か支出のどちらかを入れてください'); return; }
    if (v.income && v.expense) { toast('収入と支出は同時に入れられません'); return; }
    if (editing == null) { S.add(v); toast('仕訳を追加しました'); }
    else { S.update(editing, v); toast('保存しました'); }
    closeModal(); refresh();
  }

  /* ================= カメラ読み取り ================= */
  var shots = [];      // {preview, data, name}
  var ocrRows = [];    // 読み取り結果（編集可）

  function addShots(files) {
    if (!Auth.isAdmin()) return;   // 閲覧モードでは撮影を受け付けない
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    Promise.all(list.map(function (f) {
      return OCR.toBase64Jpeg(f).then(function (r) {
        return { preview: r.preview, data: r.data, name: f.name || '撮影画像' };
      });
    })).then(function (items) {
      shots = shots.concat(items);
      renderShots();
    }).catch(function (err) { status(err.message, 'err'); });
  }

  function renderShots() {
    $('camShots').innerHTML = shots.map(function (s, i) {
      return '<div class="shot"><img src="' + s.preview + '" alt=""><button data-rm="' + i + '">✕</button></div>';
    }).join('') + (shots.length
      ? '<div style="display:flex;align-items:center"><button class="btn btn-primary btn-big" id="btnRunOcr">' +
        shots.length + '枚を読み取る</button></div>' : '');
    $('camShots').onclick = function (e) {
      var rm = e.target.dataset.rm;
      if (rm != null) { shots.splice(Number(rm), 1); renderShots(); return; }
      if (e.target.id === 'btnRunOcr') runOcr();
    };
  }

  function status(msg, cls) {
    var el = $('camStatus');
    el.className = 'status ' + (cls || '');
    el.innerHTML = msg;
  }

  function offerManualAdd() {
    $('camResult').innerHTML =
      '<div class="actions mt"><button class="btn btn-primary" id="manualAdd">写真を見ながら手入力で追加</button></div>';
    $('camResult').onclick = function (e) { if (e.target.id === 'manualAdd') openEditor(null); };
  }

  function runOcr() {
    if (!Auth.isAdmin()) { requireAdmin(function () { runOcr(); }); return; }
    if (!canAI) {
      status('このページでは外部への通信が許可されていないため、AIの自動読み取りは使えません。' +
        '上の写真を見ながら手入力で追加してください。配布版（ZIP）ではAI読み取りが使えます。', 'err');
      offerManualAdd();
      return;
    }
    var key = (S.settings().apiKey || '').trim();
    if (!key) {
      status('APIキーが未設定です。「設定」タブで登録すると自動読み取りが使えます。' +
        'キーが無い場合は下のボタンから、写真を見ながら入力できます。', 'err');
      offerManualAdd();
      return;
    }
    var model = S.settings().model || 'claude-opus-5';
    var all = [], i = 0;

    function next() {
      if (i >= shots.length) {
        ocrRows = all;
        status('読み取り完了：' + all.length + ' 行。内容を確認してから追記してください。', 'ok');
        renderOcrResult();
        return;
      }
      status('<span class="spin"></span>' + (i + 1) + ' / ' + shots.length + ' 枚目を読み取っています…（10〜30秒ほどかかります）');
      OCR.readImage(shots[i].data, key, model).then(function (r) {
        r.rows.forEach(function (row) { all.push(row); });
        if (r.note) console.info('読み取りメモ:', r.note);
        i++; next();
      }).catch(function (err) {
        status((i + 1) + '枚目でエラー: ' + esc(err.message), 'err');
        if (all.length) { ocrRows = all; renderOcrResult(); }
      });
    }
    next();
  }

  function renderOcrResult() {
    if (!ocrRows.length) { $('camResult').innerHTML = ''; return; }
    var opening = S.data().opening.date;
    var start = S.currentBalance();
    var rec = OCR.reconcile(ocrRows, start);

    var h = '<h3 style="margin:16px 0 8px">読み取り結果の確認</h3>' +
      '<p class="hint">セルを直接なおせます。残高から金額を自動補正した行は「補正」、' +
      '残高と合わない行は「不一致」と出ます。不要な行は削除してください。</p>' +
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>日付</th><th>科目</th><th>内訳</th><th class="wide">摘要</th>' +
      '<th class="num">収入</th><th class="num">支出</th><th class="num">残高</th><th>状態</th><th></th>' +
      '</tr></thead><tbody>';

    rec.forEach(function (r, idx) {
      var date = OCR.assignYear(r.month || 1, r.day || 1, opening);
      var st = r.mismatch ? '<span class="tag check">不一致</span>'
        : r.fixed ? '<span class="tag">補正</span>'
          : r.uncertain ? '<span class="tag check">要確認</span>' : '<span class="tag">OK</span>';
      h += '<tr' + (r.mismatch || r.uncertain ? ' class="flagged"' : '') + '>' +
        '<td><input class="editable" type="date" data-i="' + idx + '" data-k="date" value="' + date + '"></td>' +
        '<td><select class="editable" data-i="' + idx + '" data-k="kamoku">' +
        OCR.KAMOKU.map(function (k) {
          return '<option' + (k === r.kamoku ? ' selected' : '') + '>' + esc(k) + '</option>';
        }).join('') + '</select></td>' +
        '<td><input class="editable" data-i="' + idx + '" data-k="uchiwake" value="' + esc(r.uchiwake || 'その他') + '"></td>' +
        '<td class="wide"><input class="editable" data-i="' + idx + '" data-k="tekiyo" value="' + esc(r.tekiyo || '') + '"></td>' +
        '<td class="num"><input class="editable num" type="number" data-i="' + idx + '" data-k="income" value="' + (r.income || 0) + '"></td>' +
        '<td class="num"><input class="editable num" type="number" data-i="' + idx + '" data-k="expense" value="' + (r.expense || 0) + '"></td>' +
        '<td class="num">' + yen(r.runningBalance) + '</td>' +
        '<td>' + st + '</td>' +
        '<td><button class="btn" data-del="' + idx + '">削除</button></td>' +
        '</tr>';
    });
    h += '</tbody></table></div>' +
      '<div class="actions wrap mt">' +
      '<button class="btn btn-primary" id="ocrCommit">出納帳に ' + rec.length + ' 行を追記</button>' +
      '<button class="btn" id="ocrClear">読み取り結果を破棄</button>' +
      '</div>';
    $('camResult').innerHTML = h;

    $('camResult').oninput = $('camResult').onchange = function (e) {
      var i = e.target.dataset.i, k = e.target.dataset.k;
      if (i == null) return;
      var row = ocrRows[Number(i)];
      if (k === 'date') {
        row.month = Number(e.target.value.slice(5, 7));
        row.day = Number(e.target.value.slice(8, 10));
      } else if (k === 'income' || k === 'expense') {
        row[k] = Number(e.target.value) || 0;
        row.balance = 0;                 // 手で直したら残高チェックはやり直し
        renderOcrResult();
      } else {
        row[k] = e.target.value;
      }
    };
    $('camResult').onclick = function (e) {
      var d = e.target.dataset.del;
      if (d != null) { ocrRows.splice(Number(d), 1); renderOcrResult(); return; }
      if (e.target.id === 'ocrClear') { ocrRows = []; $('camResult').innerHTML = ''; status(''); return; }
      if (e.target.id === 'ocrCommit') commitOcr(rec);
    };
  }

  function commitOcr(rec) {
    if (!Auth.isAdmin()) { requireAdmin(function () { commitOcr(rec); }); return; }
    var opening = S.data().opening.date;
    var added = rec.map(function (r) {
      return {
        date: OCR.assignYear(r.month || 1, r.day || 1, opening),
        kamoku: r.kamoku || 'その他',
        uchiwake: r.uchiwake || 'その他',
        tekiyo: r.tekiyo || '',
        income: r.income || 0,
        expense: r.expense || 0,
        check: !!(r.uncertain || r.mismatch),
        src: 'カメラ読み取り'
      };
    }).filter(function (r) { return r.income || r.expense; });
    if (!added.length) { toast('追記できる行がありません'); return; }
    S.addMany(added);
    ocrRows = []; shots = [];
    renderShots(); $('camResult').innerHTML = '';
    status(added.length + ' 行を出納帳に追記しました。', 'ok');
    toast(added.length + ' 行を追記しました');
    renderTop();
  }

  /* ================= 収支報告書 ================= */
  var reportF = { from: '', to: '', kamoku: 'all', type: 'all', q: '', checkOnly: false, org: '', maker: '' };

  function renderReport() {
    var host = $('reportFilters');
    var r = S.dateRange();
    host.innerHTML =
      '<div class="field"><label>対象期間（開始）</label><input type="date" data-f="from" value="' + esc(reportF.from || r.from) + '"></div>' +
      '<div class="field"><label>対象期間（終了）</label><input type="date" data-f="to" value="' + esc(reportF.to || r.to) + '"></div>' +
      '<div class="field"><label>団体名</label><input type="text" data-f="org" placeholder="○○高校バレーボール部 保護者会" value="' + esc(reportF.org) + '"></div>' +
      '<div class="field"><label>会計担当</label><input type="text" data-f="maker" placeholder="山田太郎" value="' + esc(reportF.maker) + '"></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn" data-act="all">全期間にする</button></div>';
    if (!reportF.from) reportF.from = r.from;
    if (!reportF.to) reportF.to = r.to;

    host.oninput = function (e) {
      var k = e.target.dataset.f;
      if (!k) return;
      reportF[k] = e.target.value;
      drawReport();
    };
    host.onclick = function (e) {
      if (e.target.dataset.act === 'all') { reportF.from = r.from; reportF.to = r.to; renderReport(); }
    };
    drawReport();
  }

  /* 期間内のデータと、期首残高を求める */
  function reportData() {
    var all = S.withBalances();
    var inPeriod = all.filter(function (e) {
      return (!reportF.from || e.date >= reportF.from) && (!reportF.to || e.date <= reportF.to);
    });
    var before = all.filter(function (e) { return reportF.from && e.date < reportF.from; });
    var opening = S.data().opening.amount + S.totals(before).income - S.totals(before).expense;
    return { rows: inPeriod, opening: opening, groups: S.byKamoku(inPeriod), totals: S.totals(inPeriod) };
  }

  function drawReport() {
    var d = reportData();
    var t = d.totals;
    var closing = d.opening + t.net;
    var h = '';

    h += '<h1>収 支 報 告 書</h1>';
    h += '<p class="sub">' + esc(reportF.org || S.data().title) + '</p>';
    h += '<div class="meta"><span>対象期間：' + esc(reportF.from) + ' 〜 ' + esc(reportF.to) + '</span>' +
      '<span>作成日：' + todayStr().replace(/-/g, '/') + '</span></div>';

    h += '<div class="paper-table"><table><thead><tr>' +
      '<th style="width:36%">科目</th><th style="width:24%">内訳</th>' +
      '<th style="width:24%" class="num">金額（円）</th>' +
      '<th style="width:16%" class="num">件数</th></tr></thead><tbody>';

    h += '<tr class="sec"><td colspan="4">【収入の部】</td></tr>';
    h += '<tr><td>前期繰越金</td><td>－</td><td class="num">' + yen(d.opening) + '</td><td class="num">－</td></tr>';
    var incTotal = d.opening;
    Object.keys(d.groups.income).forEach(function (k) {
      var g = d.groups.income[k];
      Object.keys(g.uchiwake).forEach(function (u) {
        h += '<tr><td>' + esc(k) + '</td><td>' + esc(u) + '</td><td class="num">' +
          yen(g.uchiwake[u].total) + '</td><td class="num">' + g.uchiwake[u].count + '件</td></tr>';
      });
      incTotal += g.total;
    });
    h += '<tr class="sub"><td colspan="2">収入合計（前期繰越を含む）</td><td class="num">' +
      yen(incTotal) + '</td><td class="num"></td></tr>';

    h += '<tr class="sec"><td colspan="4">【支出の部】</td></tr>';
    S.expenseKamoku().forEach(function (k) {
      var g = d.groups.expense[k];
      if (!g) return;
      Object.keys(g.uchiwake).forEach(function (u) {
        h += '<tr><td>' + esc(k) + '</td><td>' + esc(u) + '</td><td class="num">' +
          yen(g.uchiwake[u].total) + '</td><td class="num">' + g.uchiwake[u].count + '件</td></tr>';
      });
      h += '<tr class="sub"><td colspan="2">' + esc(k) + ' 計</td><td class="num">' +
        yen(g.total) + '</td><td class="num">' + g.count + '件</td></tr>';
    });
    h += '<tr class="sub"><td colspan="2">支出合計</td><td class="num">' + yen(t.expense) + '</td><td class="num">' +
      Object.keys(d.groups.expense).reduce(function (a, k) { return a + d.groups.expense[k].count; }, 0) + '件</td></tr>';

    h += '<tr class="grand"><td colspan="2">次期繰越金（収入合計 − 支出合計）</td><td class="num">' +
      yen(closing) + '</td><td class="num"></td></tr>';
    h += '</tbody></table></div>';

    h += '<p class="note">※ 上記のとおり報告します。金額は出納帳の記録に基づいて集計しています。</p>';
    if (S.withBalances().some(function (e) { return e.check; })) {
      h += '<p class="note" style="color:#b02a37">※ 出納帳に「要確認」の行があります。原本と照合のうえ確定してください。</p>';
    }
    h += '<div class="sign">会計担当：' + esc(reportF.maker || '＿＿＿＿＿＿＿＿＿＿') + '　印</div>' +
      '<div class="sign audits"><span>監査：＿＿＿＿＿＿＿＿＿＿　印</span>' +
      '<span>監査：＿＿＿＿＿＿＿＿＿＿　印</span></div>';

    $('reportPaper').innerHTML = h;
  }


  /* ============ 収支報告書を PDF にする ============
     画面の紙面と同じ体裁を canvas に描き、A4のページに割り付ける。
     行がページに収まらなくなったら改ページし、表の見出しを次ページにも出す。 */

  var MM = 8;                       // 1mm あたりの画素数（A4 = 1680 x 2376）
  var PG = { w: 210 * MM, h: 297 * MM, margin: 16 * MM };
  var PAPER = {
    bg: '#ffffff', ink: '#111111', sub: '#555555', line: '#c9d0dc',
    head: '#eef2f8', sec: '#e8eef8', subrow: '#f4f7fc', grand: '#fff3d6', warn: '#b02a37'
  };
  var SERIF = '"Hiragino Mincho ProN","Yu Mincho",YuMincho,"MS PMincho",serif';
  var SANS = '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif';

  function newPage() {
    var c = document.createElement('canvas');
    c.width = PG.w; c.height = PG.h;
    var x = c.getContext('2d');
    x.fillStyle = PAPER.bg;
    x.fillRect(0, 0, c.width, c.height);
    x.textBaseline = 'top';
    return c;
  }

  /* 日本語は単語区切りが無いので、文字単位で折り返す */
  function wrapText(ctx, text, maxWidth) {
    var lines = [], cur = '';
    String(text).split('').forEach(function (ch) {
      var t = cur + ch;
      if (cur && ctx.measureText(t).width > maxWidth) { lines.push(cur); cur = ch; }
      else cur = t;
    });
    if (cur || !lines.length) lines.push(cur);
    return lines;
  }

  /* 報告書の中身を「行の並び」に変換する（描画とページ割りを分けるため） */
  function reportRows() {
    var d = reportData(), t = d.totals, rows = [];
    rows.push({ type: 'sec', text: '【収入の部】' });
    rows.push({ type: 'row', c: ['前期繰越金', '－', yen(d.opening), '－'] });
    var inc = d.opening;
    Object.keys(d.groups.income).forEach(function (k) {
      var g = d.groups.income[k];
      Object.keys(g.uchiwake).forEach(function (u) {
        rows.push({ type: 'row', c: [k, u, yen(g.uchiwake[u].total), g.uchiwake[u].count + '件'] });
      });
      inc += g.total;
    });
    rows.push({ type: 'sub', c: ['収入合計（前期繰越を含む）', '', yen(inc), ''] });

    rows.push({ type: 'sec', text: '【支出の部】' });
    var expCount = 0;
    S.expenseKamoku().forEach(function (k) {
      var g = d.groups.expense[k];
      if (!g) return;
      Object.keys(g.uchiwake).forEach(function (u) {
        rows.push({ type: 'row', c: [k, u, yen(g.uchiwake[u].total), g.uchiwake[u].count + '件'] });
      });
      rows.push({ type: 'sub', c: [k + ' 計', '', yen(g.total), g.count + '件'] });
      expCount += g.count;
    });
    rows.push({ type: 'sub', c: ['支出合計', '', yen(t.expense), expCount + '件'] });
    rows.push({ type: 'grand', c: ['次期繰越金（収入合計 − 支出合計）', '', yen(d.opening + t.net), ''] });
    return { rows: rows, data: d };
  }

  function buildReportPages() {
    var R = reportRows();
    var cw = PG.w - PG.margin * 2;
    var colW = [cw * 0.36, cw * 0.24, cw * 0.24, cw * 0.16];
    var colX = [PG.margin];
    for (var i = 0; i < 3; i++) colX.push(colX[i] + colW[i]);
    var pad = 2.6 * MM;
    var fs = 3.0 * MM;                 // 本文の文字サイズ
    var ROW_MIN = 5.2 * MM;
    var HEAD_H = 5.2 * MM;             // 表の見出し行
    var HEADER_H = 23.1 * MM;          // 表題〜表の直前まで
    var hasWarn = S.withBalances().some(function (e) { return e.check; });
    var FOOTER_H = (5 + 4.4 + (hasWarn ? 4.4 : 0) + 6 + 7 + 3.5) * MM;

    var measure = document.createElement('canvas').getContext('2d');

    function wrapCount(r) {
      if (r.type === 'sec') return 1;
      measure.font = (r.type === 'row' ? '' : 'bold ') + fs + 'px ' + SANS;
      var n = 1;
      [0, 1].forEach(function (i) {
        n = Math.max(n, wrapText(measure, r.c[i] || '', colW[i] - pad * 2).length);
      });
      return n;
    }
    var heights = R.rows.map(function (r) {
      return r.type === 'sec' ? ROW_MIN
        : Math.max(ROW_MIN, wrapCount(r) * (fs * 1.35) + pad * 1.6);
    });

    /* ページ割りを決める。末尾の注記と署名欄は最終ページにだけ場所を空ける。
       確定するまで数回まわす（行が押し出されてページ数が増えることがあるため）。*/
    function plan(lastPage) {
      var pages = [[]], y = PG.margin + HEADER_H + HEAD_H;
      for (var i = 0; i < R.rows.length; i++) {
        var bottom = PG.h - PG.margin - (pages.length === lastPage ? FOOTER_H : 0);
        if (y + heights[i] > bottom && pages[pages.length - 1].length) {
          pages.push([]);
          y = PG.margin + HEAD_H;
          bottom = PG.h - PG.margin - (pages.length === lastPage ? FOOTER_H : 0);
        }
        pages[pages.length - 1].push(i);
        y += heights[i];
      }
      // 最終ページに注記が入らないなら、注記だけのページを足す
      var extra = (y + FOOTER_H > PG.h - PG.margin);
      return { pages: pages, footerOwnPage: extra, count: pages.length + (extra ? 1 : 0) };
    }

    var got = plan(1);
    for (var k = 0; k < 6 && got.count !== 0; k++) {
      var again = plan(got.count);
      if (again.count === got.count) { got = again; break; }
      got = again;
    }

    /* ---- 描画 ---- */
    var canvases = [];
    function drawHeader(x) {
      var yy = PG.margin;
      x.fillStyle = PAPER.ink;
      x.font = 'bold ' + (6.5 * MM) + 'px ' + SERIF;
      var title = '収支報告書', gap = 3.2 * MM, wsum = 0;
      title.split('').forEach(function (ch) { wsum += x.measureText(ch).width + gap; });
      wsum -= gap;
      var tx = (PG.w - wsum) / 2;
      title.split('').forEach(function (ch) {
        x.fillText(ch, tx, yy); tx += x.measureText(ch).width + gap;
      });
      yy += 8 * MM;
      x.font = (3.3 * MM) + 'px ' + SANS;
      x.textAlign = 'center';
      x.fillText(reportF.org || S.data().title, PG.w / 2, yy);
      yy += 5.4 * MM;
      x.fillStyle = PAPER.sub;
      x.font = (2.8 * MM) + 'px ' + SANS;
      x.textAlign = 'right';
      x.fillText('対象期間：' + reportF.from + ' 〜 ' + reportF.to, PG.w - PG.margin, yy);
      yy += 4.2 * MM;
      x.fillText('作成日：' + todayStr().replace(/-/g, '/'), PG.w - PG.margin, yy);
      x.textAlign = 'left';
      return PG.margin + HEADER_H;
    }

    function drawTableHead(x, yy) {
      x.fillStyle = PAPER.head;
      x.fillRect(PG.margin, yy, cw, HEAD_H);
      x.font = 'bold ' + fs + 'px ' + SANS;
      x.fillStyle = PAPER.ink;
      ['科目', '内訳', '金額（円）', '件数'].forEach(function (t, i) {
        var right = i >= 2;
        x.textAlign = right ? 'right' : 'left';
        x.fillText(t, right ? colX[i] + colW[i] - pad : colX[i] + pad, yy + (HEAD_H - fs) / 2);
      });
      x.textAlign = 'left';
      strokeRow(x, yy, HEAD_H);
      return yy + HEAD_H;
    }

    function strokeRow(x, yy, h) {
      x.strokeStyle = PAPER.line;
      x.lineWidth = Math.max(1, 0.15 * MM);
      x.strokeRect(PG.margin, yy, cw, h);
      colX.slice(1).forEach(function (cx) {
        x.beginPath(); x.moveTo(cx, yy); x.lineTo(cx, yy + h); x.stroke();
      });
    }

    function drawRow(x, r, yy, h) {
      var fill = r.type === 'sec' ? PAPER.sec : r.type === 'sub' ? PAPER.subrow
        : r.type === 'grand' ? PAPER.grand : null;
      if (fill) { x.fillStyle = fill; x.fillRect(PG.margin, yy, cw, h); }
      x.fillStyle = PAPER.ink;
      if (r.type === 'sec') {
        x.font = 'bold ' + fs + 'px ' + SERIF;
        x.fillText(r.text, PG.margin + pad, yy + (h - fs) / 2);
        strokeRow(x, yy, h);
        return;
      }
      var bold = r.type !== 'row';
      x.font = (bold ? 'bold ' : '') + fs + 'px ' + (r.type === 'grand' ? SERIF : SANS);
      r.c.forEach(function (txt, i) {
        if (txt === '' || txt == null) return;
        var right = i >= 2;
        x.textAlign = right ? 'right' : 'left';
        var lines = right ? [String(txt)] : wrapText(x, txt, colW[i] - pad * 2);
        lines.forEach(function (ln, k2) {
          x.fillText(ln, right ? colX[i] + colW[i] - pad : colX[i] + pad,
            yy + pad * 0.8 + k2 * (fs * 1.35));
        });
      });
      x.textAlign = 'left';
      strokeRow(x, yy, h);
    }

    function drawFooter(x, yy) {
      yy += 5 * MM;
      x.font = (2.7 * MM) + 'px ' + SANS;
      x.fillStyle = PAPER.sub;
      x.fillText('※ 上記のとおり報告します。金額は出納帳の記録に基づいて集計しています。', PG.margin, yy);
      yy += 4.4 * MM;
      if (hasWarn) {
        x.fillStyle = PAPER.warn;
        x.fillText('※ 出納帳に「要確認」の行があります。原本と照合のうえ確定してください。', PG.margin, yy);
        yy += 4.4 * MM;
      }
      yy += 6 * MM;
      x.fillStyle = PAPER.ink;
      x.font = (3.1 * MM) + 'px ' + SANS;
      x.fillText('会計担当：' + (reportF.maker || '＿＿＿＿＿＿＿＿') + '　印', PG.margin, yy);
      yy += 7 * MM;
      // 監査は2名分
      x.fillText('監査：＿＿＿＿＿＿＿＿　印', PG.margin, yy);
      x.fillText('監査：＿＿＿＿＿＿＿＿　印', PG.margin + cw * 0.52, yy);
    }

    got.pages.forEach(function (idxs, pi) {
      var c = newPage(), x = c.getContext('2d');
      canvases.push(c);
      var y = pi === 0 ? drawHeader(x) : PG.margin;
      y = drawTableHead(x, y);
      idxs.forEach(function (i) { drawRow(x, R.rows[i], y, heights[i]); y += heights[i]; });
      if (!got.footerOwnPage && pi === got.pages.length - 1) drawFooter(x, y);
    });
    if (got.footerOwnPage) {
      var c2 = newPage();
      canvases.push(c2);
      drawFooter(c2.getContext('2d'), PG.margin);
    }

    if (canvases.length > 1) {
      canvases.forEach(function (c, i) {
        var x = c.getContext('2d');
        x.fillStyle = PAPER.sub;
        x.font = (2.7 * MM) + 'px ' + SANS;
        x.textAlign = 'center';
        x.fillText((i + 1) + ' / ' + canvases.length, PG.w / 2, PG.h - PG.margin + 4 * MM);
        x.textAlign = 'left';
      });
    }
    return canvases;
  }

  function exportReportPdf(btn) {
    var label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '作成中…'; }
    var name = '収支報告書_' + (reportF.to || todayStr()) + '.pdf';
    Promise.resolve()
      .then(function () { return PDFOut.build(buildReportPages()); })
      .then(function (blob) { return savePdf(blob, name); })
      .catch(function (e) { toast('PDFを作れませんでした：' + e.message); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
  }

  /* PDF を保存する。claude.ai の公開ページは PDF を許可していないので、
     断られたら画像（PNG）で保存し直す。 */
  function savePdf(blob, name) {
    var cd = window.claude && window.claude.downloads;
    if (!cd) { xw().download(blob, name); toast('PDFを保存しました'); return; }
    return cd.save({ filename: name, data: blob })
      .then(function () { toast('PDFを保存しました'); })
      .catch(function (e) {
        var code = e && e.code;
        if (code === 'declined') return;
        if (code !== 'rejected_extension' && code !== 'extension_not_enabled') {
          toast('保存できませんでした'); return;
        }
        // PDF が許可されない環境 → 画像で保存する
        var pages = buildReportPages();
        return new Promise(function (res) { pages[0].toBlob(res, 'image/png'); })
          .then(function (png) {
            return cd.save({ filename: name.replace(/\.pdf$/, '.png'), data: png });
          })
          .then(function () {
            toast('このページではPDFを保存できないため、画像で保存しました');
          })
          .catch(function () { toast('保存できませんでした'); });
      });
  }

  /* ---------- 置き場所からの反映 ---------- */
  /* 最後に反映した日時を出す。押していなければ何も出さない。 */
  function showSyncStatus(msg) {
    var el = $('syncStatus');
    if (!el) return;
    if (msg) { el.textContent = msg; return; }
    var at = S.settings().syncedAt;
    el.textContent = at ? '最後に反映したのは ' + at + ' です。' : '';
  }

  /* 「反映」を押したときだけ通信する。取り込む前に中身を見せて確認する。 */
  function doSync() {
    if (!Auth.isAdmin()) { requireAdmin(function () { doSync(); }); return; }
    if (!Sync.configured()) {
      toast('先に取り込み元URLを保存してください');
      return;
    }
    var btn = $('btnSync');
    btn.disabled = true;
    showSyncStatus('読みに行っています…');

    Sync.pull().then(function (got) {
      var now = S.currentBalance();
      var msg = '取り込み元の内容\n' +
        '　明細　' + got.count + ' 件\n' +
        '　現在残高　¥' + yen(got.balance) + '\n' +
        (got.mismatch ? '　⚠ 記帳残高と合わない行が ' + got.mismatch + ' 件あります\n' : '') +
        '\nいまの帳簿（' + S.data().entries.length + ' 件・¥' + yen(now) + '）を、\n' +
        'この内容で置き換えます。よろしいですか？';
      if (!confirm(msg)) { showSyncStatus(); return; }

      S.replaceAll(got);
      S.saveSettings({ syncedAt: new Date().toLocaleString('ja-JP') });
      refresh();
      showSyncStatus();
      toast(got.count + ' 件を反映しました');
    }).catch(function (e) {
      showSyncStatus('反映できませんでした：' + e.message);
      toast('反映できませんでした');
    }).then(function () {
      btn.disabled = !Auth.isAdmin();
    });
  }

  /* ================= 設定 ================= */
  function renderSettings() {
    var s = S.settings();
    $('setApiKey').value = s.apiKey || '';
    $('setModel').value = s.model || 'claude-opus-5';
    $('setTitle').value = S.data().title;
    $('setOpening').value = S.data().opening.amount;
    if ($('setSyncUrl')) $('setSyncUrl').value = s.syncUrl || '';
    showSyncStatus();

    var rows = S.withBalances();
    var checks = rows.filter(function (e) { return e.check; });
    var r = S.dateRange();
    $('aboutBody').innerHTML =
      '<p>' + esc(S.data().title) + '</p>' +
      '<ul>' +
      '<li>収録期間：' + r.from + ' 〜 ' + r.to + '</li>' +
      '<li>仕訳件数：' + rows.length + ' 件（うち要確認 ' + checks.length + ' 件）</li>' +
      '<li>前年度繰越金：¥' + yen(S.data().opening.amount) + '</li>' +
      '<li>現在残高：¥' + yen(S.currentBalance()) + '</li>' +
      '</ul>' +
      '<p class="hint">初期データは手書き出納帳の写真4枚から読み取り、差引残高で全行を検算したものです。' +
      '「要確認」は写真から文字が一意に読み取れなかった行で、金額は残高で検算済みです。</p>';
  }

  /* ================= Excel 出力 ================= */
  var X = null;
  function xw() { return window.XLSXW; }

  function sheetLedger(rows) {
    var W = xw(), S2 = W.S;
    var out = [];
    out.push([W.title(S.data().title)]);
    out.push([]);
    out.push(['No', '日付', '科目', '内訳', '摘要', '収入金額(円)', '支払金額(円)', '差引残高(円)', '要確認', '出典', 'メモ']
      .map(function (t) { return W.h(t); }));
    out.push([null, W.d(S.data().opening.date), W.s('繰越', S2.SUBT), W.s('－', S2.SUBT),
      W.s(S.data().opening.label, S2.SUBT), W.n(S.data().opening.amount, S2.SUBN), W.n(0, S2.SUBN),
      W.n(S.data().opening.amount, S2.SUBN), W.s('', S2.SUBT), W.s('', S2.SUBT), W.s('', S2.SUBT)]);
    rows.forEach(function (e) {
      var st = e.check ? S2.WT : S2.TXT, sn = e.check ? S2.WN : S2.NUM;
      out.push([
        W.n(e.no, sn), W.d(e.date, e.check ? S2.WD : S2.DATE), W.s(e.kamoku, st), W.s(e.uchiwake, st),
        W.s(e.tekiyo, st), W.n(e.income || 0, sn), W.n(e.expense || 0, sn), W.n(e.balance, sn),
        W.s(e.check ? '要確認' : '', st), W.s(e.src || '', st), W.s(e.memo || '', st)
      ]);
    });
    var t = S.totals(rows);
    out.push([null, null, null, null, W.s('合計（繰越を除く）', S2.TOTT), W.n(t.income, S2.TOTN),
      W.n(t.expense, S2.TOTN), W.n(rows.length ? rows[rows.length - 1].balance : S.data().opening.amount, S2.TOTN),
      W.s('', S2.TOTT), W.s('', S2.TOTT), W.s('', S2.TOTT)]);
    return {
      name: '出納帳', rows: out, freezeRow: 3,
      cols: [5, 12, 11, 11, 46, 14, 14, 14, 9, 15, 20]
    };
  }

  function sheetKamoku(rows) {
    var W = xw(), S2 = W.S, g = S.byKamoku(rows), t = S.totals(rows);
    var out = [[W.title('科目別・内訳別 集計')], []];
    out.push(['区分', '科目', '内訳', '件数', '金額(円)', '構成比'].map(function (x) { return W.h(x); }));
    function block(label, groups, total) {
      Object.keys(groups).forEach(function (k) {
        var gg = groups[k];
        Object.keys(gg.uchiwake).forEach(function (u) {
          var uu = gg.uchiwake[u];
          out.push([W.s(label), W.s(k), W.s(u), W.n(uu.count), W.n(uu.total),
          W.n(total ? uu.total / total : 0, S2.PCT)]);
        });
        out.push([W.s(label, S2.SUBT), W.s(k + ' 小計', S2.SUBT), W.s('', S2.SUBT),
        W.n(gg.count, S2.SUBN), W.n(gg.total, S2.SUBN),
        W.n(total ? gg.total / total : 0, S2.SUBN)]);
      });
      out.push([W.s('', S2.TOTT), W.s(label + ' 合計', S2.TOTT), W.s('', S2.TOTT),
      W.n(0, S2.TOTN), W.n(total, S2.TOTN), W.n(total ? 1 : 0, S2.TOTN)]);
      out[out.length - 1][3] = W.n(Object.keys(groups).reduce(function (a, k) {
        return a + groups[k].count;
      }, 0), S2.TOTN);
      out.push([]);
    }
    block('収入', g.income, t.income);
    block('支出', g.expense, t.expense);
    return { name: '科目別集計', rows: out, freezeRow: 3, cols: [8, 16, 16, 8, 15, 10] };
  }

  function sheetMonth(rows) {
    var W = xw(), S2 = W.S;
    var months = S.byMonth(rows), kams = S.expenseKamoku();
    var out = [[W.title('月別集計')], []];
    out.push(['年月', '収入'].concat(kams, ['支出計', '収支差額', '月末残高']).map(function (x) { return W.h(x); }));
    var run = S.data().opening.amount, tot = { i: 0, e: 0, k: {} };
    months.forEach(function (m) {
      run += m.income - m.expense;
      tot.i += m.income; tot.e += m.expense;
      out.push([W.s(jpMonth(m.key)), W.n(m.income)].concat(
        kams.map(function (k) { tot.k[k] = (tot.k[k] || 0) + (m.byKamoku[k] || 0); return W.n(m.byKamoku[k] || 0); }),
        [W.n(m.expense), W.n(m.income - m.expense), W.n(run)]));
    });
    out.push([W.s('合計', S2.TOTT), W.n(tot.i, S2.TOTN)].concat(
      kams.map(function (k) { return W.n(tot.k[k] || 0, S2.TOTN); }),
      [W.n(tot.e, S2.TOTN), W.n(tot.i - tot.e, S2.TOTN), W.n(run, S2.TOTN)]));
    var cols = [12, 13].concat(kams.map(function () { return 13; }), [13, 13, 14]);
    return { name: '月別集計', rows: out, freezeRow: 3, cols: cols };
  }

  function sheetReport() {
    var W = xw(), S2 = W.S, d = reportData(), t = d.totals;
    var out = [[W.title('収支報告書')], [W.note(reportF.org || S.data().title)],
    [W.note('対象期間：' + reportF.from + ' 〜 ' + reportF.to + '　作成日：' + todayStr())], []];
    out.push(['科目', '内訳', '金額(円)', '件数'].map(function (x) { return W.h(x); }));

    out.push([W.s('【収入の部】', S2.SUBT), W.s('', S2.SUBT), W.s('', S2.SUBT), W.s('', S2.SUBT)]);
    out.push([W.s('前期繰越金'), W.s('－'), W.n(d.opening), W.s('－')]);
    var inc = d.opening;
    Object.keys(d.groups.income).forEach(function (k) {
      var g = d.groups.income[k];
      Object.keys(g.uchiwake).forEach(function (u) {
        out.push([W.s(k), W.s(u), W.n(g.uchiwake[u].total), W.s(g.uchiwake[u].count + '件')]);
      });
      inc += g.total;
    });
    out.push([W.s('収入合計（前期繰越を含む）', S2.SUBT), W.s('', S2.SUBT), W.n(inc, S2.SUBN), W.s('', S2.SUBT)]);

    out.push([W.s('【支出の部】', S2.SUBT), W.s('', S2.SUBT), W.s('', S2.SUBT), W.s('', S2.SUBT)]);
    S.expenseKamoku().forEach(function (k) {
      var g = d.groups.expense[k];
      if (!g) return;
      Object.keys(g.uchiwake).forEach(function (u) {
        out.push([W.s(k), W.s(u), W.n(g.uchiwake[u].total), W.s(g.uchiwake[u].count + '件')]);
      });
      out.push([W.s(k + ' 計', S2.SUBT), W.s('', S2.SUBT), W.n(g.total, S2.SUBN), W.s(g.count + '件', S2.SUBT)]);
    });
    out.push([W.s('支出合計', S2.SUBT), W.s('', S2.SUBT), W.n(t.expense, S2.SUBN), W.s('', S2.SUBT)]);
    out.push([W.s('次期繰越金（収入合計 − 支出合計）', S2.TOTT), W.s('', S2.TOTT),
    W.n(d.opening + t.net, S2.TOTN), W.s('', S2.TOTT)]);
    out.push([]);
    out.push([W.note('※ 金額は出納帳の記録に基づいて集計しています。')]);
    out.push([W.note('会計担当：' + (reportF.maker || '＿＿＿＿＿＿＿＿'))]);
    return { name: '収支報告書', rows: out, cols: [30, 18, 16, 12] };
  }

  /* シートの中身をそのまま CSV にする（.xlsx を保存できない環境向け） */
  function sheetsToCsv(sheets) {
    var lines = [];
    sheets.forEach(function (sh, i) {
      if (i) lines.push('');
      lines.push('■ ' + sh.name);
      sh.rows.forEach(function (row) {
        if (!row || !row.length) { lines.push(''); return; }
        lines.push(row.map(function (c) {
          if (c == null || c.v == null || c.v === '') return '';
          if (c.t === 'n') return String(c.v);
          var v = String(c.v);
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        }).join(','));
      });
    });
    return '﻿' + lines.join('\r\n');
  }

  /* ファイルの保存。claude.ai の公開ページでは確認ダイアログ経由になる。 */
  function saveFile(data, filename) {
    var cd = window.claude && window.claude.downloads;
    if (!cd) {
      xw().download(data instanceof Blob ? data : new Blob([data], { type: 'text/plain' }), filename);
      toast('書き出しました');
      return;
    }
    cd.save({ filename: filename, data: data }).then(function () {
      toast('保存しました');
    }).catch(function (e) {
      var code = e && e.code;
      if (code === 'declined') return;                       // 利用者が断っただけ
      if (code === 'too_large') toast('データが大きすぎて保存できません');
      else if (code === 'rate_limited') toast('少し待ってから、もう一度押してください');
      else if (code === 'extension_not_enabled' || code === 'rejected_extension')
        toast('この形式はこのページでは保存できません');
      else toast('保存できませんでした');
    });
  }

  function exportXlsx(which) {
    var rows = S.withBalances();
    var sheets;
    if (which === 'ledger') sheets = [sheetLedger(rows)];
    else if (which === 'kamoku') sheets = [sheetKamoku(rows)];
    else if (which === 'month') sheets = [sheetMonth(rows)];
    else if (which === 'report') sheets = [sheetReport(), sheetLedger(rows)];
    else sheets = [sheetLedger(rows), sheetKamoku(rows), sheetMonth(rows), sheetReport()];

    if (canXlsx) saveFile(xw().build(sheets), '出納帳_' + todayStr() + '.xlsx');
    else saveFile(sheetsToCsv(sheets), '出納帳_' + todayStr() + '.csv');
  }


  /* ================= パスワードと管理者モード ================= */
  /* 初回だけ端末を記憶し、以降は聞かない。管理者モードは毎回パスワードが要る。 */

  var lockDone = null;      // パスワード画面が閉じたときに呼ぶ処理

  function showLock(mode, onOk, onCancel) {
    var first = mode === 'first';
    $('lockTitle').textContent = first ? '出納管理' : '管理者モード';
    $('lockLead').innerHTML = first
      ? 'この端末で初めて開きました。<br>パスワードを入力してください。'
      : '出納帳を編集するには<br><b>管理者用のパスワード</b>が必要です。';
    $('lockNote').textContent = first
      ? '次回からこの端末では入力不要になります。'
      : '画面を閉じるか再読み込みすると、閲覧モードに戻ります。';
    $('lockCancel').hidden = first;
    $('lockOk').textContent = first ? '開く' : '管理者にする';
    $('lockErr').hidden = true;
    $('lockPw').value = '';
    $('lockScreen').hidden = false;
    document.body.classList.toggle('locked', first);
    lockDone = { first: first, ok: onOk, cancel: onCancel };
    setTimeout(function () { $('lockPw').focus(); }, 60);
  }

  function closeLock() {
    $('lockScreen').hidden = true;
    document.body.classList.remove('locked');
    $('lockPw').value = '';
    lockDone = null;
  }

  function submitLock(e) {
    if (e) e.preventDefault();
    if (!lockDone) return;
    var pw = $('lockPw').value;
    var ok = lockDone.first ? Auth.verifyLogin(pw) : Auth.verifyAdmin(pw);
    if (!ok) {
      $('lockErr').hidden = false;
      $('lockPw').value = '';
      $('lockPw').focus();
      return;
    }
    var d = lockDone;
    closeLock();
    if (d.ok) d.ok(pw);
  }

  /* 編集操作の入り口。管理者モードでなければパスワードを聞く。 */
  function requireAdmin(run) {
    if (Auth.isAdmin()) { run(); return; }
    showLock('admin', function (pw) {
      Auth.enterAdmin(pw);
      applyAdminState();
      toast('管理者モードになりました');
      run();
    });
  }

  /* 管理者かどうかで画面の出し分けをする */
  function applyAdminState() {
    var on = Auth.isAdmin();
    document.body.classList.toggle('admin', on);
    var b = $('btnAdmin');
    b.classList.toggle('on', on);
    b.querySelector('.admin-ico').textContent = on ? '🔓' : '🔒';
    b.querySelector('.admin-txt').textContent = on ? '管理者' : '閲覧';
    b.title = on ? '押すと閲覧モードに戻ります' : '編集するには管理者モードに切り替えます';

    // 編集に関わるものは、閲覧モードでは隠す・押せなくする
    if ($('btnAddRow')) $('btnAddRow').hidden = !on;
    ['setApiKey', 'setModel', 'setTitle', 'setOpening', 'btnSaveSettings',
      'setSyncUrl', 'btnSync', 'btnSaveSyncUrl'].forEach(function (id) {
      if ($(id)) $(id).disabled = !on;
    });
    ['btnReset'].forEach(function (id) { if ($(id)) $(id).hidden = !on; });
    Array.prototype.forEach.call(document.querySelectorAll('#impCsv,#impJson'), function (el) {
      el.disabled = !on;
      if (el.parentElement) el.parentElement.style.opacity = on ? '' : '.45';
    });
    // カメラは閲覧モードでは使えない。ボタンを隠し、入力欄も止める。
    // （<label> は disabled にできないので、中の input を止めたうえで枠ごと隠す）
    if ($('camShoot')) $('camShoot').hidden = !on;
    if ($('camLockNote')) $('camLockNote').hidden = on;
    ['camCapture', 'camPick'].forEach(function (id) {
      if ($(id)) $(id).disabled = !on;
    });
    // 閲覧モードへ戻すときは、撮りかけ・読み取りかけを画面にも残さない
    if (!on) {
      shots = []; ocrRows = [];
      if ($('camShots')) $('camShots').innerHTML = '';
      if ($('camResult')) $('camResult').innerHTML = '';
      if ($('camStatus')) status('');
    }

    // いまのモードは札で示すだけにする（操作の説明は書かない）
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode-tag]'), function (el) {
      el.textContent = on ? '管理者モード' : '閲覧モード';
      el.classList.toggle('is-admin', on);
    });
  }

  function toggleAdmin() {
    if (Auth.isAdmin()) {
      Auth.exitAdmin();
      applyAdminState();
      refresh();
      toast('閲覧モードに戻りました');
      return;
    }
    requireAdmin(function () { refresh(); });
  }

  /* ================= 起動 ================= */
  /* 使えない機能の説明を、押す前に画面へ出しておく */
  function applyHostLimits() {
    if (!canXlsx) {
      [['btnExportXlsxAll', 'CSVで書き出す（全シート）'], ['btnExportXlsxLedger', 'CSV出力'],
      ['btnExportXlsxKamoku', 'CSV出力'], ['btnExportXlsxMonth', 'CSV出力'],
      ['btnExportXlsxReport', 'CSV出力']].forEach(function (p) {
        if ($(p[0])) $(p[0]).textContent = p[1];
      });
      var note = document.createElement('p');
      note.className = 'hint mt';
      note.textContent = 'このページでは .xlsx を直接保存できないため、CSVで書き出します。'
        + 'CSVはExcelでそのまま開けます。.xlsx が必要な場合は配布版（ZIP）をお使いください。';
      var host = $('btnExportXlsxAll');
      if (host && host.parentElement) host.parentElement.after(note);
    }
    if (!canAI) {
      var lead = document.querySelector('#view-camera .lead');
      if (lead) {
        lead.innerHTML = '物理ノートのページを撮影し、<b>写真を見ながら手入力</b>で出納帳に追加できます。<br>' +
          '<span class="warn">このページでは外部への通信が許可されていないため、AIの自動読み取りは動きません。' +
          '自動読み取りを使う場合は配布版（ZIP）をお使いください。</span>';
      }
      var keyPanel = $('setApiKey');
      if (keyPanel) {
        var panel = keyPanel.closest('.panel');
        if (panel) panel.hidden = true;
      }
    }
    // 外部への通信が塞がれている場所では、「反映」は動かないので出さない
    if (!canSync && $('syncPanel')) $('syncPanel').hidden = true;
  }

  function boot() {
    S.load();
    applyHostLimits();
    wireUp();
    if (Auth.deviceTrusted()) {
      start();
    } else {
      // この端末では初めて。パスワードを通すまで中身は出さない。
      showLock('first', function () {
        Auth.trustDevice();
        start();
        toast('ようこそ。次回からこの端末では入力不要です');
      });
    }
  }

  function start() {
    applyAdminState();
    show('dash');
  }

  function wireUp() {

    $('tabs').onclick = function (e) {
      var t = e.target.closest('.tab');
      if (t) show(t.dataset.view);
    };

    $('btnAddRow').onclick = function () { openEditor(null); };
    $('modalClose').onclick = $('modalCancel').onclick = closeModal;
    $('modalSave').onclick = saveEditor;
    $('modal').onclick = function (e) { if (e.target === $('modal')) closeModal(); };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modal').hidden) closeModal();
    });

    $('camCapture').onchange = function () { addShots(this.files); this.value = ''; };
    $('camPick').onchange = function () { addShots(this.files); this.value = ''; };

    $('btnPrintReport').onclick = function () { window.print(); };
    $('btnPdfReport').onclick = function () { exportReportPdf(this); };
    $('btnExportXlsxReport').onclick = function () { exportXlsx('report'); };
    $('btnExportXlsxLedger').onclick = function () { exportXlsx('ledger'); };
    $('btnExportXlsxKamoku').onclick = function () { exportXlsx('kamoku'); };
    $('btnExportXlsxMonth').onclick = function () { exportXlsx('month'); };
    $('btnExportXlsxAll').onclick = function () { exportXlsx('all'); };

    $('btnExportCsv').onclick = function () {
      saveFile(S.toCsv(S.withBalances()), '出納帳_' + todayStr() + '.csv');
    };
    $('btnExportJson').onclick = function () {
      saveFile(JSON.stringify(S.data(), null, 1), '出納帳バックアップ_' + todayStr() + '.json');
    };
    $('impCsv').onchange = function () {
      var f = this.files[0]; this.value = '';
      if (!f) return;
      f.text().then(function (txt) {
        var rows = S.parseCsv(txt);
        if (!rows.length) { toast('取り込める行がありませんでした'); return; }
        if (!confirm(rows.length + ' 行を追記します。よろしいですか？')) return;
        S.addMany(rows); refresh(); toast(rows.length + ' 行を取り込みました');
      }).catch(function (e) { toast('取り込みに失敗: ' + e.message); });
    };
    $('impJson').onchange = function () {
      var f = this.files[0]; this.value = '';
      if (!f) return;
      f.text().then(function (txt) {
        var d = JSON.parse(txt);
        if (!d.entries) throw new Error('形式が違います');
        var wasEmpty = S.data().entries.length === 0;
        if (!confirm(d.entries.length + ' 行を追記します。よろしいですか？')) return;
        // 空の帳簿への復元なら、帳簿名と前年度繰越金もそのまま戻す。
        // すでに行があるときは、勝手に上書きせず確認する。
        if (d.opening && (wasEmpty || confirm(
          '帳簿名と前年度繰越金も、このファイルの内容に合わせますか？\n' +
          '（キャンセル＝いまの設定のままで、行だけ追記します）'))) {
          S.setMeta(d.title, d.opening.amount, d.opening.date);
        }
        S.addMany(d.entries); refresh(); toast('取り込みました');
      }).catch(function (e) { toast('取り込みに失敗: ' + e.message); });
    };

    if ($('btnSync')) $('btnSync').onclick = doSync;
    if ($('btnSaveSyncUrl')) $('btnSaveSyncUrl').onclick = function () {
      if (!Auth.isAdmin()) { requireAdmin(function () { $('btnSaveSyncUrl').click(); }); return; }
      var u = $('setSyncUrl').value.trim();
      if (u && !Sync.okUrl(u)) { toast('https:// で始まるURLを入れてください'); return; }
      S.saveSettings({ syncUrl: u });
      showSyncStatus();
      toast(u ? '取り込み元を保存しました' : '取り込み元を空にしました');
    };

    $('btnSaveSettings').onclick = function () {
      if (!Auth.isAdmin()) { requireAdmin(function () { $('btnSaveSettings').click(); }); return; }
      S.saveSettings({ apiKey: $('setApiKey').value.trim(), model: $('setModel').value });
      S.setMeta($('setTitle').value.trim(), Number($('setOpening').value));
      refresh(); toast('設定を保存しました');
    };
    $('btnReset').onclick = function () {
      if (!Auth.isAdmin()) { requireAdmin(function () { $('btnReset').click(); }); return; }
      if (!confirm('追加・編集した内容をすべて捨てて、写真から読み取った直後の状態に戻します。よろしいですか？')) return;
      S.reset(); refresh(); toast('初期状態に戻しました');
    };

    $('lockForm').addEventListener('submit', submitLock);
    $('lockCancel').onclick = function () {
      var d = lockDone;
      closeLock();
      if (d && d.cancel) d.cancel();
    };
    $('btnAdmin').onclick = toggleAdmin;
    $('btnForget').onclick = function () {
      if (!confirm('この端末の記憶を消します。次に開いたときパスワードの入力が必要になります。よろしいですか？')) return;
      Auth.forgetDevice();
      toast('この端末の記憶を消しました');
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
