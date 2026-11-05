/* admin.js — 役員用の集計画面（春高バレー 応援チケット）。
 *
 * 役員どうしで共有する「合言葉」1つで、だれのスマホ・PCからでも同じ集計を見られる。
 * 画面は役員の3つの仕事に合わせて並べる：
 *   1. 購入する枚数を知る  → いちばん上に合計と「日付 × 区分」の内訳（チケットを買うときにそのまま使える）
 *   2. 集金する            → 「集金」の数字を押すと、まだの家庭だけが並ぶ（金額つき）
 *   3. チケットを渡す      → 「受け渡し」の数字を押すと、まだの家庭だけが並ぶ
 * 申し込みの取り消しと、集金・受け渡しの記録を外すときは、必ず確認を出す。
 * 取り消したあとも［元に戻す］で取り返せる。1分ごとに最新にする（ほかの役員のチェックも反映）。
 */
(function () {
  'use strict';
  var API = window.TicketAPI, CFG = API.config;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = API.demo ? 'ticket.admin.demo.v1' : 'ticket.admin.v1';
  var OFFICER_KEY = 'ticket.officer.v1';
  var REFRESH_MS = 60000;
  var COURT = CFG.courtnameLabel || 'コートネーム';

  var auth = null;              // { pass, officer }
  var items = [];
  var pending = {};             // id → 保存中
  var view = { q: '', f: 'all', sort: 'new', day: '' }; // day：日付で絞り込み（'' はすべての日）
  var lastLoaded = 0, timer = null, dlgTarget = null, dGrid = null;

  /* ---------- 合言葉 ---------- */
  function readAuth() { // 合言葉は、このタブを開いているあいだだけ覚える（開き直したら毎回入力）
  var raw = null;
  try { raw = sessionStorage.getItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* 読めなければ毎回入力 */ }
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function writeAuth(a, remember) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(a));
    // 「次から入力を省く」はお名前だけ。合言葉はこの端末に残さない
    if (remember) localStorage.setItem(OFFICER_KEY, a.officer || ''); else localStorage.removeItem(OFFICER_KEY);
  } catch (e) { /* 保存できなくても、この表示のあいだは使える */ }
}
function clearAuth() {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* なにもしない */ }
  }

  function showGate(msg) {
    stopTimer();
    auth = null;
    $('board').hidden = true;
    $('band-tools').hidden = true; $('pdf').hidden = true;
    $('gate').hidden = false;
    var e = $('gate-error');
    if (msg) { e.textContent = msg; e.hidden = false; } else e.hidden = true;
    try { $('officer').value = localStorage.getItem(OFFICER_KEY) || ''; } catch (err) { /* なにもしない */ }
    $('pass').value = '';
    $('pass').focus();
  }

  function onGate(ev) {
    ev.preventDefault();
    var pass = $('pass').value.trim();
    if (!pass) { $('gate-error').textContent = '合言葉を入力してください'; $('gate-error').hidden = false; $('pass').focus(); return; }
    var officerName = API.squish($('officer').value).slice(0, 12);
  if (!officerName) { $('gate-error').textContent = 'あなたのお名前を入力してください（集金・受け渡しの記録に残ります）'; $('gate-error').hidden = false; $('officer').focus(); return; }
  var btn = $('gate-submit');
    btn.disabled = true; btn.textContent = '確かめています…';
    var a = { pass: pass, officer: officerName };
    // 合言葉の確認と一覧の読み込みを、1回の問い合わせでまとめて行う（admin_list は合言葉が違えば wrong_pass を返す）
    API.call('admin_list', { pass: a.pass }).then(function (res) {
      writeAuth(a, $('remember').checked);
      enter(a, res);
    }, function (err) {
      $('gate-error').textContent = API.message(err);
      $('gate-error').hidden = false;
      $('pass').select();
    }).then(function () { btn.disabled = false; btn.textContent = '集計を見る'; });
  }

  function enter(a, res) {
    auth = a;
    $('logout').textContent = 'ログアウト' + (a.officer ? '（' + a.officer + '）' : '');
    $('gate').hidden = true;
    $('board').hidden = false;
    $('band-tools').hidden = false; $('pdf').hidden = false;
    if (res) applyList(res); else load(true);
    startTimer();
  }

  /* ---------- 読み込み ---------- */
  var loading = false;
  function applyList(res) {
    items = (res.items || []).map(normalize);
    lastLoaded = Date.now();
    render();
  }
  /* first：開いた直後／manual：［最新にする］を押したとき。どちらでもない自動更新の失敗は、
     画面にエラーを出さず「更新できませんでした」とだけ出して、次の自動更新で取り直す */
  function load(first, manual) {
    if (!auth || loading) return Promise.resolve();   // 自動更新・タブに戻ったとき・ボタンが重なっても1本だけ
    if (Object.keys(pending).length) return Promise.resolve();   // 保存中は上書きしない
    loading = true;
    $('refresh').disabled = true;
    if (first) $('updated').textContent = '読み込み中…';
    return API.call('admin_list', { pass: auth.pass }).then(applyList, function (err) {
      if (err.code === 'wrong_pass' || err.code === 'locked' || err.code === 'no_pass') { clearAuth(); showGate(API.message(err)); return; }
      if (first || manual) toast(API.message(err), true);
      markStale(true);
    }).then(function () { loading = false; $('refresh').disabled = false; });
  }
  function normalize(x) {
    var o = Object.assign({}, x);
    o.counts = API.cleanCounts(x.counts);
    o.total = API.totalOf(o.counts);
    o.amount = API.amountOf(o.counts);
    return o;
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(function () {
      markStale();
      if (document.hidden || $('dlg').open || $('ask').open) return;
      if (Date.now() - lastLoaded >= REFRESH_MS - 1000) load();
    }, 15000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function markStale(failed) {
    if (!lastLoaded) return;
    var el = $('updated'), d = new Date(lastLoaded);
    el.textContent = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ' に更新' + (failed ? '（最新の取得に失敗・自動で再試行します）' : '');
    el.classList.toggle('is-stale', Date.now() - lastLoaded > 3 * 60000);
  }

  /* ---------- 集計 ---------- */
  function stats() {
    var active = items.filter(function (x) { return x.status !== 'cancelled'; });
    var s = { orders: active.length, total: 0, amount: 0, paidOrders: 0, paidAmount: 0, handedOrders: 0, handedCount: 0,
      cancelled: items.length - active.length, cells: API.emptyCounts() };
    active.forEach(function (x) {
      s.total += x.total; s.amount += x.amount;
      API.items.forEach(function (it) { s.cells[it.key] += x.counts[it.key]; });
      if (x.paid) { s.paidOrders += 1; s.paidAmount += x.amount; }
      if (x.handed) { s.handedOrders += 1; s.handedCount += x.total; }
    });
    return s;
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* 日付 × 区分 の内訳（チケットを買うときにそのまま使う表） */
  function renderBreakdown(s) {
    var head = $('bd-head'), body = $('bd-body'), foot = $('bd-foot');
    head.textContent = ''; body.textContent = ''; foot.textContent = '';
    var h0 = el('th', null, '日付'); h0.scope = 'col'; head.appendChild(h0);
    API.kinds.forEach(function (k) { var th = el('th', 'num-col'); th.scope = 'col'; th.appendChild(el('span', null, k.label)); th.appendChild(el('small', 'num', API.yen(k.price))); head.appendChild(th); });
    var hs = el('th', 'num-col', '計'); hs.scope = 'col'; head.appendChild(hs);
    var hy = el('th', 'num-col yen-col', '金額'); hy.scope = 'col'; head.appendChild(hy);
    var kindSum = {};
    API.kinds.forEach(function (k) { kindSum[k.id] = 0; });
    API.days.forEach(function (d) {
      var tr = el('tr'), th = el('th', null, API.dayLabel(d)); th.scope = 'row'; tr.appendChild(th);
      tr.dataset.day = d.id; tr.className = 'bd-day'; tr.title = 'この日の申し込みだけを一覧で見る';
      var rowSum = 0, rowYen = 0;
      API.kinds.forEach(function (k) {
        var n = s.cells[d.id + '-' + k.id]; rowSum += n; kindSum[k.id] += n; rowYen += n * k.price;
        tr.appendChild(el('td', 'num' + (n ? '' : ' is-zero'), String(n)));
      });
      tr.appendChild(el('td', 'num row-sum', String(rowSum)));
      tr.appendChild(el('td', 'num yen-col' + (rowYen ? '' : ' is-zero'), API.yen(rowYen)));
      body.appendChild(tr);
    });
    var ft = el('th', null, '合計'); ft.scope = 'row'; foot.appendChild(ft);
    API.kinds.forEach(function (k) { foot.appendChild(el('td', 'num', String(kindSum[k.id]))); });
    foot.appendChild(el('td', 'num row-sum', String(s.total)));
    foot.appendChild(el('td', 'num yen-col', API.yen(s.amount)));
  }

  function renderKpis(s) {
    $('k-total').textContent = String(s.total);
    $('k-amount').textContent = API.yen(s.amount);
    $('k-total-sub').textContent = s.orders ? s.orders + ' 家庭から申し込み' : 'まだ申し込みはありません';
    renderBreakdown(s);
    var unpaid = s.orders - s.paidOrders, unhanded = s.orders - s.handedOrders;
    $('k-paid').textContent = String(s.paidOrders);
    $('k-paid-of').textContent = '/ ' + s.orders + ' 家庭';
    $('k-paid-meter').style.width = pct(s.paidAmount, s.amount) + '%';
    $('k-paid-meter-label').setAttribute('aria-label', '集金 ' + pct(s.paidAmount, s.amount) + '%');
    $('k-paid-sub').textContent = s.orders
      ? '集金済み ' + API.yen(s.paidAmount) + '／残り ' + API.yen(s.amount - s.paidAmount)
      : '';
    $('k-paid-go').hidden = !unpaid;
    $('k-paid-card').classList.toggle('is-complete', !!s.orders && !unpaid);
    $('k-handed').textContent = String(s.handedOrders);
    $('k-handed-of').textContent = '/ ' + s.orders + ' 家庭';
    $('k-handed-meter').style.width = pct(s.handedOrders, s.orders) + '%';
    $('k-handed-meter-label').setAttribute('aria-label', '受け渡し ' + pct(s.handedOrders, s.orders) + '%');
    $('k-handed-sub').textContent = unhanded ? 'まだ ' + unhanded + ' 家庭（' + (s.total - s.handedCount) + ' 枚）' : (s.orders ? 'すべての家庭に渡しました' : '');
    $('k-handed-go').hidden = !unhanded;
    $('k-handed-card').classList.toggle('is-complete', !!s.orders && !unhanded);

    $('f-all').textContent = String(s.orders);
    $('f-unpaid').textContent = String(unpaid);
    $('f-unhanded').textContent = String(unhanded);
    $('f-cancelled').textContent = String(s.cancelled);
  }

  /* ---------- 一覧 ---------- */
  function norm(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ''); }
  function visible() {
    var q = norm(view.q);
    var list = items.filter(function (x) {
      if (view.f === 'cancelled') { if (x.status !== 'cancelled') return false; }
      else if (x.status === 'cancelled') return false;
      if (view.f === 'unpaid' && x.paid) return false;
      if (view.f === 'unhanded' && x.handed) return false;
      if (view.day && !dayTotal(x, view.day)) return false;
      if (!q) return true;
      return norm(x.name).indexOf(q) >= 0 || norm(x.courtname).indexOf(q) >= 0 || norm(x.memo).indexOf(q) >= 0 ||
        String(x.id) === q.replace(/^no\.?0*/, '') || norm(API.no(x.id)).indexOf(q) >= 0;
    });
    var by = {
      'new': function (a, b) { return b.id - a.id; },
      old: function (a, b) { return a.id - b.id; },
      name: function (a, b) { return String(a.name).localeCompare(String(b.name), 'ja'); },
      count: function (a, b) { return b.total - a.total || a.id - b.id; }
    }[view.sort];
    return list.sort(by);
  }
  function dupNames() {
    var seen = {}, dup = {};
    items.forEach(function (x) { if (x.status === 'cancelled') return; var k = norm(x.name); if (seen[k]) dup[k] = true; seen[k] = true; });
    return dup;
  }

  var CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var WORDS = { paid: ['集金まだ', '集金済み', '集金'], handed: ['渡しまだ', '渡し済み', '受け渡し'] };

  function chip(cls, text) { return el('span', 'chip ' + cls, text); }
  function btn(cls, text, act, id) {
    var b = el('button', cls, text);
    b.type = 'button'; b.dataset.act = act; b.dataset.id = String(id);
    return b;
  }

  function flag(x, key) {
    var on = !!x[key];
    var label = el('label', 'flag flag-' + key + (pending[x.id] ? ' is-busy' : ''));
    var input = document.createElement('input');
    input.type = 'checkbox'; input.checked = on; input.disabled = !!pending[x.id] || x.status === 'cancelled';
    input.dataset.id = String(x.id); input.dataset.key = key;
    input.setAttribute('aria-label', x.name + ' さんの' + WORDS[key][2] + '（いま：' + (on ? WORDS[key][1] : WORDS[key][0]) + '）');
    var box = el('span', 'flag-box'); box.innerHTML = CHECK_SVG;
    var t = el('span', 'flag-text');
    t.appendChild(el('b', null, on ? WORDS[key][1] : WORDS[key][0]));
    var by = key === 'paid' ? x.paidBy : x.handedBy;
    if (on && by) t.appendChild(el('small', null, by));
    else if (key === 'paid' && !on) t.appendChild(el('small', 'flag-amount num', API.yen(x.amount)));
    label.appendChild(input); label.appendChild(box); label.appendChild(t);
    return label;
  }


  /* 1家庭の内訳を表に：日付を縦に並べ、いちばん下に 大人・高校生以下 の合計 */
  function detailTable(x) {
    var t = el('table', 'fam'), thead = el('thead'), tbody = el('tbody'), tfoot = el('tfoot');
    var hr = el('tr'); hr.appendChild(el('th', null, '日付'));
    API.kinds.forEach(function (k) { hr.appendChild(el('th', null, k.label)); });
    thead.appendChild(hr);
    var sum = {};
    API.kinds.forEach(function (k) { sum[k.id] = 0; });
    API.days.forEach(function (d) {
      var tr = el('tr'), any = 0;
      if (view.day === d.id) tr.classList.add('is-focus');
      tr.appendChild(el('th', null, API.dayLabel(d)));
      API.kinds.forEach(function (k) {
        var n = x.counts[d.id + '-' + k.id] || 0; sum[k.id] += n; any += n;
        tr.appendChild(el('td', n ? null : 'is-zero', n ? String(n) : '—'));
      });
      if (!any) tr.className = 'is-empty';
      tbody.appendChild(tr);
    });
    var fr = el('tr'); fr.appendChild(el('th', null, '合計'));
    API.kinds.forEach(function (k) { fr.appendChild(el('td', sum[k.id] ? null : 'is-zero', sum[k.id] + '枚')); });
    tfoot.appendChild(fr);
    t.appendChild(thead); t.appendChild(tbody); t.appendChild(tfoot);
    return t;
  }

  function dayTotal(x, day) { return API.kinds.reduce(function (a, k) { return a + (x.counts[day + '-' + k.id] || 0); }, 0); }

  /* 日付で絞り込むボタン（すべて／1/4／1/5／1/6）。上の内訳表の日付の行を押しても切り替わる */
  function setDay(day, scroll) {
    view.day = day;
    Array.prototype.forEach.call($('days-filter').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.day === day)); });
    render();
    if (scroll) $('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /* 日付を選んだときの集計（家庭数・大人・高校生以下・合計枚数・金額）。一覧の絞り込み（集金まだ など）にも合わせる */
  function renderDaySummary(list) {
    var box = $('day-summary');
    if (!box) return;
    box.textContent = '';
    // 「すべて」のときは全日程の合計、日付を選んだときはその日の合計（どちらも同じ形で出す）
    var days = view.day ? [view.day] : API.days.map(function (x) { return x.id; });
    var d = view.day ? API.days.filter(function (x) { return x.id === view.day; })[0] : null;
    var head = el('p', 'ds-head');
    head.appendChild(el('b', null, d ? API.dayLabel(d) + ' の集計' : '全日程（' + API.days.map(function (x) { return x.label; }).join('・') + '）の集計'));
    head.appendChild(el('span', null, list.length + ' 家庭' + (view.f === 'unpaid' ? '（集金まだ）' : view.f === 'unhanded' ? '（渡しまだ）' : view.f === 'cancelled' ? '（取り消し）' : '')));
    box.appendChild(head);
    var grid = el('div', 'ds-grid'), total = 0, yen = 0;
    API.kinds.forEach(function (k) {
      var n = list.reduce(function (a, x) { return a + days.reduce(function (b, day) { return b + (x.counts[day + '-' + k.id] || 0); }, 0); }, 0);
      total += n; yen += n * k.price;
      var c = el('div', 'ds-cell'); c.appendChild(el('span', 'ds-label', k.label)); var v = el('span', 'ds-value num', String(n)); v.appendChild(el('small', null, '枚')); c.appendChild(v); grid.appendChild(c);
    });
    var t = el('div', 'ds-cell ds-total'); t.appendChild(el('span', 'ds-label', '合計')); var tv = el('span', 'ds-value num', String(total)); tv.appendChild(el('small', null, '枚')); t.appendChild(tv); grid.appendChild(t);
    var y = el('div', 'ds-cell ds-yen'); y.appendChild(el('span', 'ds-label', '金額')); y.appendChild(el('span', 'ds-value num', API.yen(yen))); grid.appendChild(y);
    box.appendChild(grid);
    box.hidden = false;
  }

  function buildDayFilter() {
    var box = el('div', 'days-filter'); box.id = 'days-filter';
    box.appendChild(el('span', 'days-filter-label', '日付で見る'));
    [{ id: '', label: '全日' }].concat(API.days.map(function (d) { return { id: d.id, label: API.dayLabel(d) }; })).forEach(function (o) {
      var b = el('button', 'day-btn', o.label); b.type = 'button'; b.dataset.day = o.id; b.setAttribute('aria-pressed', String(o.id === ''));
      box.appendChild(b);
    });
    box.addEventListener('click', function (ev) { var b = ev.target.closest('button[data-day]'); if (b) setDay(b.dataset.day); });
    var line = $('result-count').closest('.toolbar-line');
    line.parentNode.insertBefore(box, line);
    var sum = el('div', 'day-summary'); sum.id = 'day-summary'; sum.hidden = true; sum.setAttribute('aria-live', 'polite');
    line.parentNode.insertBefore(sum, line);
    // 絞り込み中は「何で絞っているか」と［すべてに戻す］を、集計の上に必ず出す
    var note = el('div', 'filter-note'); note.id = 'filter-note'; note.hidden = true; note.setAttribute('role', 'status');
    note.appendChild(el('span', 'filter-note-text')); 
    var reset = el('button', 'btn btn-dark btn-sm filter-reset', '× すべてに戻す'); reset.type = 'button';
    reset.addEventListener('click', function () { resetFilters(); });
    note.appendChild(reset);
    $('days-filter').parentNode.insertBefore(note, $('days-filter'));
  }

  function render() {
    var s = stats();
    renderKpis(s);
    markStale();
    var list = visible(), dup = dupNames(), end = API.deadlineEnd();
    var ul = $('rows');
    ul.textContent = '';
    list.forEach(function (x) {
      var cancelled = x.status === 'cancelled';
      var li = el('li', 'row' + (cancelled ? ' is-cancelled' : ''));
      li.dataset.id = String(x.id);

      li.appendChild(el('div', 'cell-no', API.no(x.id)));

      var who = el('div', 'cell-who');
      var top = el('p', 'row-top');
      top.appendChild(el('span', 'row-no', API.no(x.id)));
      top.appendChild(el('span', null, API.longDate(x.createdAt) + ' 受付'));
      who.appendChild(top);
      var name = el('p', 'row-name');
      name.appendChild(el('span', null, x.name));
      name.appendChild(el('small', null, 'さん'));
      who.appendChild(name);
      if (x.courtname) { var court = el('p', 'row-court'); court.appendChild(el('span', 'row-court-label', COURT)); court.appendChild(el('b', null, x.courtname)); who.appendChild(court); }
      who.appendChild(detailTable(x));
      var chips = el('p', 'row-chips');
      if (cancelled) chips.appendChild(chip('chip-danger', '取り消し済み'));
      if (!cancelled && dup[norm(x.name)]) chips.appendChild(chip('chip-warn', '同じお名前が2件以上'));
      if (end && new Date(x.createdAt) > end) chips.appendChild(chip('chip-warn', '締切後の申し込み'));
      if (new Date(x.updatedAt) - new Date(x.createdAt) > 60000) chips.appendChild(chip('chip-info', API.shortDate(x.updatedAt) + ' に修正あり'));
      if (x.source === 'admin') chips.appendChild(chip('chip-info', '役員が追加'));
      if (API.demo && /^見本 /.test(x.name)) chips.appendChild(chip('chip-demo', '見本'));
      if (chips.children.length) who.appendChild(chips);
      if (x.memo) who.appendChild(el('p', 'row-memo', x.memo));
      li.appendChild(who);

      var cnt = el('div', 'cell-count');
      cnt.appendChild(el('span', 'num', String(x.total)));
      cnt.appendChild(el('span', 'unit', '枚'));
      cnt.appendChild(el('small', 'num', API.yen(x.amount)));
      li.appendChild(cnt);

      var paid = el('div', 'cell-paid'); paid.appendChild(flag(x, 'paid')); li.appendChild(paid);
      var handed = el('div', 'cell-handed'); handed.appendChild(flag(x, 'handed')); li.appendChild(handed);

      var menu = el('div', 'cell-menu');
      if (cancelled) menu.appendChild(btn('btn btn-ghost btn-sm', '元に戻す', 'restore', x.id));
      else {
        menu.appendChild(btn('btn btn-ghost btn-sm', '修正', 'edit', x.id));
        menu.appendChild(btn('btn btn-danger-ghost btn-sm', '取り消し', 'cancel', x.id));
      }
      li.appendChild(menu);
      ul.appendChild(li);
    });

    var empty = $('empty');
    if (!list.length) {
      empty.hidden = false;
      if (!items.length) { $('empty-title').textContent = 'まだ申し込みはありません'; $('empty-text').textContent = 'ご家庭が申し込みフォームから送ると、ここに届いた順に並びます。'; }
      else if (view.f === 'unpaid' && !view.q) { $('empty-title').textContent = '集金がまだの家庭はありません'; $('empty-text').textContent = 'すべての家庭から集金しました。'; }
      else if (view.f === 'unhanded' && !view.q) { $('empty-title').textContent = 'まだ渡していない家庭はありません'; $('empty-text').textContent = 'すべての家庭にチケットを渡しました。'; }
      else if (view.f === 'cancelled' && !view.q) { $('empty-title').textContent = '取り消した申し込みはありません'; $('empty-text').textContent = ''; }
      else { $('empty-title').textContent = '当てはまる申し込みはありません'; $('empty-text').textContent = 'さがす言葉を変えてみてください。'; }
    } else empty.hidden = true;
    renderDaySummary(list);
    renderFilterNote();
    $('result-count').textContent = list.length + ' 家庭';
  }

  var FILTER_NAMES = { unpaid: '集金まだ', unhanded: '渡しまだ', cancelled: '取り消し' };
  function renderFilterNote() {
    var note = $('filter-note'); if (!note) return;
    var parts = [];
    if (view.f !== 'all') parts.push('「' + FILTER_NAMES[view.f] + '」');
    // 日付の絞り込みは「日付で見る」のボタン自体が選択中を示すので、帯には出さない
    if (view.q) parts.push('「' + view.q + '」で検索');
    note.hidden = !parts.length;
    note.querySelector('.filter-note-text').textContent = parts.join('・') + 'の家庭だけを表示中';
    // 押したカードに「表示中」の印。もう一度押すと すべて に戻る
    [['k-paid-card', 'unpaid', 'k-paid-go', '集金がまだの家庭を見る'], ['k-handed-card', 'unhanded', 'k-handed-go', 'まだ渡していない家庭を見る']].forEach(function (c) {
      var on = view.f === c[1];
      $(c[0]).classList.toggle('is-active', on);
      $(c[0]).setAttribute('aria-pressed', String(on));
      $(c[2]).textContent = on ? '表示中 ・ もう一度押すと すべてに戻る' : c[3];
      if (on) $(c[2]).hidden = false;
    });
  }
  function resetFilters() {
    view.q = ''; $('q').value = '';
    if (view.day) { view.day = ''; Array.prototype.forEach.call($('days-filter').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.day === '')); }); }
    setFilter('all');
  }
  function setFilter(f, scroll) {
    view.f = f;
    Array.prototype.forEach.call($('filters').querySelectorAll('button'), function (x) { x.setAttribute('aria-selected', String(x.dataset.f === f)); });
    render();
    if (scroll) $('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 確認ダイアログ ---------- */
  var askResolve = null;
  function ask(o) {
    $('ask-title').textContent = o.title;
    var t = $('ask-target'); t.textContent = '';
    if (o.item) {
      t.appendChild(el('span', 'row-no', API.no(o.item.id)));
      t.appendChild(el('b', null, o.item.name + ' さん'));
      t.appendChild(el('span', 'ask-count', o.item.total + ' 枚・' + API.yen(o.item.amount)));
    }
    $('ask-body').textContent = o.body;
    $('ask-yes').textContent = o.ok;
    $('ask').showModal();
    $('ask-no').focus();   // うっかり Enter で実行されないよう、「やめる」に合わせておく
    return new Promise(function (resolve) { askResolve = resolve; });
  }
  function closeAsk(yes) {
    var r = askResolve;
    askResolve = null;          // 先に外す（close で起きる close イベントが「やめる」扱いで上書きしないように）
    if ($('ask').open) $('ask').close();
    if (r) r(!!yes);
  }

  /* ---------- 保存 ---------- */
  function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function save(id, patch, opts) {
    var x = find(id); if (!x) return Promise.reject({ code: 'not_found' });
    var before = Object.assign({}, x);
    var stamp = (auth.officer || '役員') + ' ' + API.shortDate(new Date().toISOString());
    // 先に画面に反映し、失敗したら戻す（体感を速くする）
    if ('paid' in patch) { x.paid = patch.paid; x.paidBy = patch.paid ? stamp : ''; }
    if ('handed' in patch) { x.handed = patch.handed; x.handedBy = patch.handed ? stamp : ''; }
    if ('status' in patch) x.status = patch.status;
    pending[id] = true;
    render();
    return API.call('admin_save', { pass: auth.pass, officer: auth.officer || '', id: id, patch: patch }).then(function (res) {
      delete pending[id];
      Object.assign(x, normalize(res.item));
      render();
      if (opts && opts.toast) toast(opts.toast, false, opts.undo);
      return res.item;
    }, function (err) {
      delete pending[id];
      Object.assign(x, before);
      render();
      if (err.code === 'wrong_pass') { clearAuth(); showGate(API.message(err)); }
      else toast('保存できませんでした。' + API.message(err), true);
      throw err;
    });
  }

  function onRowsChange(ev) {
    var t = ev.target;
    if (!t.matches('input[type="checkbox"][data-key]')) return;
    var id = Number(t.dataset.id), key = t.dataset.key, x = find(id);
    if (!x) return;
    var w = WORDS[key];
    if (t.checked) {
      var on = {}; on[key] = true;
      save(id, on, { toast: x.name + ' さん：' + w[1] + 'にしました' }).catch(function () {});
      return;
    }
    // 記録を外すときは確認する（誰がいつ集金したかの記録が消えるため）
    t.checked = true;
    var by = key === 'paid' ? x.paidBy : x.handedBy;
    ask({
      title: w[2] + 'の記録を外しますか？',
      item: x,
      body: '「' + w[1] + (by ? '（' + by + '）' : '') + '」の記録を消して、「' + w[0] + '」に戻します。',
      ok: '記録を外す'
    }).then(function (yes) {
      if (!yes) return;
      var off = {}; off[key] = false;
      save(id, off, { toast: x.name + ' さん：' + w[0] + 'に戻しました' }).catch(function () {});
    });
  }
  function onRowsClick(ev) {
    var b = ev.target.closest('button[data-act]');
    if (!b) return;
    var id = Number(b.dataset.id), x = find(id);
    if (!x) return;
    if (b.dataset.act === 'edit') openDialog(x);
    if (b.dataset.act === 'cancel') {
      var note = [];
      if (x.paid) note.push('集金済み');
      if (x.handed) note.push('渡し済み');
      ask({
        title: 'この申し込みを取り消しますか？',
        item: x,
        body: '合計から ' + x.total + ' 枚（' + API.yen(x.amount) + '）が外れます。' + (note.length ? 'この家庭は「' + note.join('・') + '」です。返金や回収が必要かご確認ください。' : '') + '取り消した申し込みは「取り消し」から元に戻せます。',
        ok: '取り消す'
      }).then(function (yes) {
        if (!yes) return;
        save(id, { status: 'cancelled' }, {
          toast: x.name + ' さんの申し込みを取り消しました',
          undo: function () { save(id, { status: 'active' }, { toast: '元に戻しました' }).catch(function () {}); }
        }).catch(function () {});
      });
    }
    if (b.dataset.act === 'restore') save(id, { status: 'active' }, { toast: x.name + ' さんの申し込みを元に戻しました' }).catch(function () {});
  }

  /* ---------- 修正・代わりに追加 ---------- */
  function updateDlgSum() {
    var c = API.cleanCounts(dGrid.get());
    $('d-sum').textContent = '合計 ' + API.totalOf(c) + ' 枚・' + API.yen(API.amountOf(c));
  }
  function clearDlgErrors() {
    ['name', 'courtname', 'counts'].forEach(function (f) { $('dfield-' + f).classList.remove('has-error'); $('d-' + f + '-error').hidden = true; });
  }
  function openDialog(x) {
    dlgTarget = x || null;
    $('dlg-title').textContent = x ? API.no(x.id) + ' ' + x.name + ' さんの内容を修正' : 'ご家庭の代わりに追加';
    $('d-name').value = x ? x.name : '';
    $('d-courtname').value = x ? (x.courtname || '') : '';
    dGrid.set(x ? x.counts : API.emptyCounts());
    updateDlgSum();
    $('d-memo').value = x ? (x.memo || '') : '';
    $('dlg-save').textContent = x ? '保存する' : '追加する';
    $('dlg-error').hidden = true;
    clearDlgErrors();
    $('dlg').showModal();
    $('d-name').focus();
  }
  function onDialogSave(ev) {
    ev.preventDefault();
    var v = API.validate({ name: $('d-name').value, courtname: $('d-courtname').value, counts: dGrid.get() });
    clearDlgErrors();
    if (v.errors.length) {
      v.errors.forEach(function (e) { $('dfield-' + e.field).classList.add('has-error'); var p = $('d-' + e.field + '-error'); p.textContent = e.msg; p.hidden = false; });
      if (v.errors[0].field === 'counts') dGrid.focus(); else $('d-' + v.errors[0].field).focus();
      return;
    }
    var memo = $('d-memo').value.trim().slice(0, 200);
    var b = $('dlg-save');
    b.disabled = true;
    var p;
    if (dlgTarget) {
      var id = dlgTarget.id;
      pending[id] = true;
      p = API.call('admin_save', { pass: auth.pass, officer: auth.officer || '', id: id, patch: { name: v.value.name, courtname: v.value.courtname, counts: v.value.counts, memo: memo } })
        .then(function (res) { delete pending[id]; Object.assign(find(id), normalize(res.item)); return res.item.name + ' さんの内容を修正しました'; },
          function (err) { delete pending[id]; throw err; });
    } else {
      p = API.call('admin_add', { pass: auth.pass, officer: auth.officer || '', name: v.value.name, courtname: v.value.courtname, counts: v.value.counts, memo: memo, requestId: API.uuid() })
        .then(function (res) { items.push(normalize(res.item)); return res.item.name + ' さんを追加しました（' + API.no(res.item.id) + '）'; });
    }
    p.then(function (msg) {
      $('dlg').close();
      render();
      toast(msg);
    }, function (err) {
      $('dlg-error').textContent = API.message(err);
      $('dlg-error').hidden = false;
    }).then(function () { b.disabled = false; });
  }

  /* ---------- 書き出し・コピー ---------- */
  var HEAD = ['受付番号', 'お名前', COURT].concat(API.items.map(function (it) { return it.day.label + ' ' + it.kind.label; }),
    ['枚数', '金額', '状態', '集金', '集金の記録', '受け渡し', '受け渡しの記録', '受付日時', '役員メモ']);
  function rowsForExport() {
    return items.slice().sort(function (a, b) { return a.id - b.id; }).map(function (x) {
      return [API.no(x.id), x.name, x.courtname || ''].concat(API.items.map(function (it) { return x.counts[it.key]; }),
        [x.total, x.amount, x.status === 'cancelled' ? '取り消し' : '有効',
          x.paid ? '済' : '', x.paidBy || '', x.handed ? '済' : '', x.handedBy || '', API.longDate(x.createdAt), x.memo || '']);
    });
  }
  function safeCell(v) {   // 表計算ソフトで数式として動かないように（= + - @ で始まる文字）
    var s = String(v);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }
  function csv() {
    var lines = [HEAD].concat(rowsForExport()).map(function (r) {
      return r.map(function (c) { var s = typeof c === 'number' ? String(c) : safeCell(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var d = new Date(), stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '春高チケット_申し込み_' + stamp + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('CSVを保存しました（Excel・Numbers で開けます）');
  }
  function copyText(text, done) {
    var ok = function () { toast(done); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var r = false; try { r = document.execCommand('copy'); } catch (e) { r = false; }
      ta.remove();
      if (r) ok(); else toast('コピーできませんでした。CSVで保存をお使いください', true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }
  function copyTable() {
    var text = [HEAD].concat(rowsForExport()).map(function (r) { return r.map(function (c) { return String(c).replace(/[\t\n]/g, ' '); }).join('\t'); }).join('\n');
    copyText(text, '表をコピーしました（スプレッドシートに貼り付けられます）');
  }
  function copySummary() {
    var s = stats(), d = new Date();
    var lines = [
      '【' + (CFG.item || '応援チケット') + ' 申し込み集計】',
      (d.getMonth() + 1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '） ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ' 時点（部員の分はのぞく）'
    ];
    API.days.forEach(function (day) {
      var sum = 0, yen = 0, parts = API.kinds.map(function (k) { var n = s.cells[day.id + '-' + k.id]; sum += n; yen += n * k.price; return k.label + ' ' + n; });
      lines.push(API.dayLabel(day) + '　' + parts.join('・') + '（計 ' + sum + '・' + API.yen(yen) + '）');
    });
    lines.push('合計 ' + s.total + ' 枚（' + s.orders + ' 家庭）' + API.yen(s.amount));
    lines.push('集金 ' + s.paidOrders + ' / ' + s.orders + ' 家庭（' + API.yen(s.paidAmount) + ' / ' + API.yen(s.amount) + '）');
    lines.push('受け渡し ' + s.handedOrders + ' / ' + s.orders + ' 家庭');
    var end = API.deadlineEnd();
    if (end && Date.now() < end.getTime()) lines.push('締切まで あと ' + Math.ceil((end - Date.now()) / 86400000) + ' 日');
    copyText(lines.join('\n'), '集計をコピーしました。LINE などに貼り付けられます');
  }

  /* ---------- 集計表の PDF ----------
     A4縦向きの紙面を canvas に描き、js/pdf.js で PDF ファイルにまとめる（家計簿アプリと同じ方式）。
     日本語はブラウザの文字で描くので、どの端末でも画面と同じ字形で出る。
     スマホは共有メニュー（ファイルに保存・LINEで送る）、PC はそのままダウンロード。
     中身：購入する枚数（日付×区分・計・金額）／申し込み・集金・受け渡しの状況／申し込み一覧（取り消しは除く・受付番号順） */
  var PMM = 8;                                   // 1mm あたりの画素数
  var PPG = { w: 210 * PMM, h: 297 * PMM, m: 10 * PMM };   // A4縦向き
  var PFONT = '"BIZ UDPGothic","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",Meiryo,sans-serif';
  var PCOL = { ink: '#111827', sub: '#4b5563', line: '#9aa3b8', head: '#eef1f7', foot: '#fff3c9', navy: '#12235a', zero: '#b7c1d8' };

  function pdfPage() {
    var c = document.createElement('canvas');
    c.width = PPG.w; c.height = PPG.h;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.textBaseline = 'middle';
    return { c: c, x: x };
  }
  function pFont(x, px, bold) { x.font = (bold ? '700 ' : '400 ') + px + 'px ' + PFONT; }
  function pFit(x, text, w) {          // 幅に収まらない文字は「…」で切る
    text = String(text == null ? '' : text);
    if (x.measureText(text).width <= w) return text;
    while (text.length && x.measureText(text + '…').width > w) text = text.slice(0, -1);
    return text + '…';
  }
  /* 1行ぶんのセルを描く。cols: [{w(mm), align}]、cells: 文字（'\n' で2行）、style: {bg, bold, color, size} */
  function pRow(x, top, h, cols, cells, style) {
    style = style || {};
    var left = PPG.m;
    cols.forEach(function (col, k) {
      var w = col.w * PMM, txt = cells[k] == null ? '' : String(cells[k]);
      var bg = (style.colBg && style.colBg[k]) || style.bg;
      if (bg) { x.fillStyle = bg; x.fillRect(left, top, w, h); }
      x.strokeStyle = PCOL.line; x.lineWidth = 2; x.strokeRect(left, top, w, h);
      var lines = txt.split('\n'), size = (style.size || 23) - (lines.length > 1 ? 3 : 0);
      pFont(x, size, style.bold || col.bold);
      x.fillStyle = (style.zero && style.zero[k]) ? PCOL.zero : (style.color || PCOL.ink);
      lines.forEach(function (ln, li) {
        var t = pFit(x, ln, w - 16), ty = top + h / 2 + (li - (lines.length - 1) / 2) * (size + 4);
        var align = style.center ? 'center' : (col.align || 'left');
        x.textAlign = align;
        x.fillText(t, align === 'right' ? left + w - 8 : align === 'center' ? left + w / 2 : left + 8, ty);
      });
      left += w;
    });
    x.textAlign = 'left';
  }
  function buildSummaryPages() {
    var s = stats(), d = new Date(), pages = [];
    var stamp = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '） ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
    var pg, x, y;
    function header() {
      pg = pdfPage(); x = pg.x; pages.push(pg.c);
      pFont(x, 40, true); x.fillStyle = PCOL.navy;
      x.fillText((CFG.item || '応援チケット') + ' 申し込み集計表', PPG.m, PPG.m + 22);
      pFont(x, 20); x.fillStyle = PCOL.sub;
      x.fillText((CFG.team ? CFG.team + '　' : '') + stamp + ' 時点' + (auth && auth.officer ? '　出力：' + auth.officer : '') + '　（部員の分はのぞく）', PPG.m, PPG.m + 66);
      x.fillStyle = PCOL.navy; x.fillRect(PPG.m, PPG.m + 88, PPG.w - PPG.m * 2, 4);
      y = PPG.m + 112;
    }
    function section(title, note) {
      pFont(x, 26, true); x.fillStyle = PCOL.navy; x.fillText(title, PPG.m, y + 16);
      if (note) { var tw = x.measureText(title).width; pFont(x, 19); x.fillStyle = PCOL.sub; x.fillText(note, PPG.m + tw + 20, y + 18); }
      y += 40;
    }
    header();

    // 1. 購入する枚数
    section('購入する枚数');
    var sc = [{ w: 36 }].concat(API.kinds.map(function () { return { w: 44, align: 'right' }; }), [{ w: 26, align: 'right', bold: true }, { w: 40, align: 'right' }]);
    var RH = 46;
    pRow(x, y, RH, sc, ['日付'].concat(API.kinds.map(function (k) { return k.label + '（' + API.yen(k.price) + '）'; }), ['計', '金額']), { bg: PCOL.head, bold: true, center: true, size: 21 }); y += RH;
    var kindSum = {}; API.kinds.forEach(function (k) { kindSum[k.id] = 0; });
    API.days.forEach(function (day) {
      var sum = 0, yen = 0, cells = [API.dayLabel(day)];
      API.kinds.forEach(function (k) { var n = s.cells[day.id + '-' + k.id]; sum += n; yen += n * k.price; kindSum[k.id] += n; cells.push(String(n)); });
      cells.push(String(sum)); cells.push(API.yen(yen));
      pRow(x, y, RH, sc, cells); y += RH;
    });
    pRow(x, y, RH, sc, ['合計'].concat(API.kinds.map(function (k) { return String(kindSum[k.id]); }), [String(s.total), API.yen(s.amount)]), { bg: PCOL.foot, bold: true }); y += RH + 18;

    // 2. 状況
    section('状況');
    var st = [{ w: 58 }, { w: 74 }, { w: 58 }];
    pRow(x, y, 40, st, ['申し込み', '集金', '受け渡し'], { bg: PCOL.head, bold: true, center: true, size: 20 }); y += 40;
    pRow(x, y, 48, st, [s.orders + ' 家庭・' + s.total + ' 枚・' + API.yen(s.amount),
      '済み ' + s.paidOrders + ' / ' + s.orders + ' 家庭（残り ' + API.yen(s.amount - s.paidAmount) + '）',
      '済み ' + s.handedOrders + ' / ' + s.orders + ' 家庭'], { center: true, size: 21 }); y += 48 + 22;

    // 3. 申し込み一覧（ページをまたぐときは見出しを付け直す）
    var lc = [{ w: 12, align: 'center' }, { w: 29 }, { w: 20 }].concat(API.items.map(function () { return { w: 10, align: 'right' }; }),
      [{ w: 10, align: 'right', bold: true }, { w: 20, align: 'right' }, { w: 9, align: 'center' }, { w: 9, align: 'center' }]);
    var used = lc.reduce(function (a, c) { return a + c.w; }, 0);
    lc.push({ w: (PPG.w - PPG.m * 2) / PMM - used });   // メモは残りの幅
    var LH = 42, HT = 34, HB = 30, HH = HT + HB;
    var K = API.kinds.length, I0 = 3, IN = I0 + API.items.length;      // 枚数の列は I0 から（日付ごとに K 列）
    var colX = [], lx = PPG.m;
    lc.forEach(function (c) { colX.push(lx); lx += c.w * PMM; }); colX.push(lx);
    var lhead = ['No.', 'お名前', COURT].concat(API.items.map(function () { return ''; }), ['枚数', '金額', '集金', '受渡', 'メモ']);
    var legend = API.kinds.map(function (k) { return k.short + '＝' + k.label; }).join('　');
    // 日付ごとのまとまりを見やすく：1つおきに薄く色をつけ、日付の境目に太い紺の線
    var tint = lc.map(function (c, k) { return k >= I0 && k < IN && Math.floor((k - I0) / K) % 2 === 1 ? '#eef2fa' : null; });
    function hCell(left, top, w, h, txt, size, bg, color) {
      x.fillStyle = bg; x.fillRect(left, top, w, h);
      x.strokeStyle = PCOL.line; x.lineWidth = 2; x.strokeRect(left, top, w, h);
      pFont(x, size, true); x.fillStyle = color || PCOL.ink; x.textAlign = 'center';
      x.fillText(pFit(x, txt, w - 8), left + w / 2, top + h / 2); x.textAlign = 'left';
    }
    function dayLines(top, h) {
      x.strokeStyle = PCOL.navy; x.lineWidth = 5;
      for (var k = I0; k <= IN; k += K) { x.beginPath(); x.moveTo(colX[k], top); x.lineTo(colX[k], top + h); x.stroke(); }
    }
    function listHead(cont) {
      section('申し込み一覧' + (cont ? '（つづき）' : ''), legend);
      lc.forEach(function (c, k) { if (k < I0 || k >= IN) hCell(colX[k], y, colX[k + 1] - colX[k], HH, lhead[k], 20, PCOL.head); });
      API.days.forEach(function (day, g) {
        var a = I0 + g * K;
        hCell(colX[a], y, colX[a + K] - colX[a], HT, API.dayLabel(day), 20, PCOL.navy, '#ffffff');      // 日付は1つにまとめる
        API.kinds.forEach(function (kd, j) { hCell(colX[a + j], y + HT, colX[a + j + 1] - colX[a + j], HB, kd.short, 19, g % 2 ? '#dfe6f4' : PCOL.head); });
      });
      dayLines(y, HH);
      y += HH;
    }
    listHead(false);
    var list = items.filter(function (it) { return it.status !== 'cancelled'; }).sort(function (a, b) { return a.id - b.id; });
    list.forEach(function (it) {
      if (y + LH > PPG.h - PPG.m - LH) { header(); listHead(true); }
      var zero = [];
      var cells = [('00' + it.id).slice(-3), it.name, it.courtname || ''].concat(API.items.map(function (item, k) { var n = it.counts[item.key]; zero[3 + k] = !n; return n ? String(n) : '・'; }),
        [String(it.total), API.yen(it.amount), it.paid ? '済' : '', it.handed ? '済' : '', it.memo || '']);
      pRow(x, y, LH, lc, cells, { zero: zero, colBg: tint }); dayLines(y, LH); y += LH;
    });
    if (y + LH > PPG.h - PPG.m) { header(); listHead(true); }
    pRow(x, y, LH, lc, ['合計', '', ''].concat(API.items.map(function (item) { return String(s.cells[item.key]); }),
      [String(s.total), API.yen(s.amount), '', '', '']), { bg: PCOL.foot, bold: true, size: 21 });
    dayLines(y, LH);
    pages.forEach(function (c, i) {        // ページ番号「1 / 2」を下中央に
      var px = c.getContext('2d'); pFont(px, 19); px.fillStyle = PCOL.sub; px.textAlign = 'center';
      px.fillText((i + 1) + ' / ' + pages.length, PPG.w / 2, PPG.h - PPG.m / 2);
    });
    return pages;
  }
  function pdfFileName() {
    var d = new Date();
    return '春高チケット_集計表_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '_' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + '.pdf';
  }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }
  /* まず画面にプレビューを出し、見てから保存する。
     PDF はプレビューを開く時点で作っておくので、［保存］を押した瞬間に共有メニューを出せる
     （iPhone は「押した直後」でないと共有メニューを出せないため、こうすると確実） */
  var pv = { blob: null, name: '', urls: [] };
  var MOBILE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  function pageUrl(c) {
    return new Promise(function (resolve) {
      if (!c.toBlob) { resolve(c.toDataURL('image/jpeg', 0.92)); return; }
      c.toBlob(function (b) { resolve(b ? URL.createObjectURL(b) : c.toDataURL('image/jpeg', 0.92)); }, 'image/jpeg', 0.92);
    });
  }
  function openPreview() {
    if (!items.length) { toast('まだ申し込みがありません'); return; }
    var btn = $('pdf'); btn.disabled = true; $('pdf-label').textContent = '作っています…';
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      var pages = buildSummaryPages();
      pv.name = pdfFileName();
      return Promise.all([window.PDFOut.build(pages, { page: window.PDFOut.A4 }), Promise.all(pages.map(pageUrl))]);
    }).then(function (r) {
      pv.blob = r[0]; pv.urls = r[1];
      var box = $('pv-pages'); box.textContent = '';
      pv.urls.forEach(function (u, i) {
        var img = document.createElement('img');
        img.src = u; img.alt = '集計表 ' + (i + 1) + 'ページ目'; img.className = 'pv-page';
        img.width = 1680; img.height = 2376;
        box.appendChild(img);
      });
      var n = items.filter(function (it) { return it.status !== 'cancelled'; }).length;
      $('pv-meta').textContent = 'A4縦・' + pv.urls.length + 'ページ・' + n + '家庭ぶん';
      $('pv').showModal();
      box.scrollTop = 0;
    }).catch(function (e) {
      toast('PDFを作れませんでした：' + (e && e.message ? e.message : 'もう一度お試しください'), true);
    }).then(function () { btn.disabled = false; $('pdf-label').textContent = 'PDF集計表'; });
  }
  function closePreview() { if ($('pv').open) $('pv').close(); }
  function onPreviewClosed() {
    pv.urls.forEach(function (u) { if (u.indexOf('blob:') === 0) URL.revokeObjectURL(u); });
    pv.urls = []; pv.blob = null; $('pv-pages').textContent = '';
  }
  function savePreview() {
    if (!pv.blob) return;
    var blob = pv.blob, name = pv.name, file = null;
    try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { /* 古い端末 */ }
    // スマホは共有メニュー（「"ファイル"に保存」「LINE」などを選べる）。PC やシェアできない端末はダウンロード
    if (MOBILE && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(function () {
        closePreview(); toast('PDFを保存・共有しました');
      }, function (e) {
        if (e && e.name === 'AbortError') return;         // 共有メニューを閉じただけ：プレビューはそのまま
        downloadBlob(blob, name); closePreview(); toast('PDFを保存しました');
      });
      return;
    }
    downloadBlob(blob, name);
    closePreview();
    toast(MOBILE ? 'PDFを保存しました（保存されないときは、LINE の中ではなく Safari や Chrome で開いてください）' : 'PDFをダウンロードしました');
  }

  /* ---------- お知らせ ---------- */
  var toastTimer = null, undoFn = null;
  function toast(text, isError, undo) {
    var t = $('toast');
    $('toast-text').textContent = text;
    t.classList.toggle('is-error', !!isError);
    undoFn = undo || null;
    $('toast-btn').hidden = !undo;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); undoFn = null; }, undo ? 8000 : 3500);
  }

  /* ---------- はじめに ---------- */
  function init() {
    if (API.demo) { $('demo-bar').hidden = false; $('demo-hint').hidden = false; }
    $('team-line').textContent = CFG.team || '';
    $('d-courtname-label').textContent = COURT;
    if (CFG.sheetUrl) { $('sheet-link').href = CFG.sheetUrl; $('sheet-link').hidden = false; }
    dGrid = API.buildGrid($('d-grid'), 'd-', updateDlgSum);

    $('gate-form').addEventListener('submit', onGate);
    $('refresh').addEventListener('click', function () { load(false, true); });
    $('logout').addEventListener('click', function () { clearAuth(); showGate(); });
    $('q').addEventListener('input', function () { view.q = $('q').value; render(); });
    $('sort').addEventListener('change', function () { view.sort = $('sort').value; render(); });
    buildDayFilter();
    $('bd-body').addEventListener('click', function (ev) { var tr = ev.target.closest('tr[data-day]'); if (tr) setDay(tr.dataset.day, true); });
    $('filters').addEventListener('click', function (ev) { var b = ev.target.closest('button[data-f]'); if (b) setFilter(b.dataset.f); });
    $('k-paid-card').addEventListener('click', function () { setFilter(view.f === 'unpaid' ? 'all' : 'unpaid', true); });
    $('k-handed-card').addEventListener('click', function () { setFilter(view.f === 'unhanded' ? 'all' : 'unhanded', true); });
    $('rows').addEventListener('change', onRowsChange);
    $('rows').addEventListener('click', onRowsClick);
    $('add').addEventListener('click', function () { openDialog(null); });
    $('pdf').addEventListener('click', openPreview);
    $('pv-save').addEventListener('click', savePreview);
    $('pv-close').addEventListener('click', closePreview);
    $('pv-x').addEventListener('click', closePreview);
    $('pv').addEventListener('close', onPreviewClosed);
    $('pv-save').textContent = MOBILE ? '保存・送る' : 'PDFをダウンロード';
    var ANDROID = /Android/i.test(navigator.userAgent);
    $('pv-hint').textContent = !MOBILE ? 'よければ［PDFをダウンロード］を押してください。'
      : '指2本で広げると拡大できます。［保存・送る］から' + (ANDROID ? '「ドライブに保存」' : '「"ファイル"に保存」') + 'や LINE を選べます。';
    $('csv').addEventListener('click', csv);
    $('copy-table').addEventListener('click', copyTable);
    $('copy-summary').addEventListener('click', copySummary);
    $('dlg-form').addEventListener('submit', onDialogSave);
    $('dlg-close').addEventListener('click', function () { $('dlg').close(); });
    $('ask-yes').addEventListener('click', function () { closeAsk(true); });
    $('ask-no').addEventListener('click', function () { closeAsk(false); });
    $('ask').addEventListener('cancel', function () { closeAsk(false); });   // Esc キー
    $('ask').addEventListener('close', function () { closeAsk(false); });
    $('toast-btn').addEventListener('click', function () { var f = undoFn; $('toast').classList.remove('show'); undoFn = null; if (f) f(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && auth && Date.now() - lastLoaded > 20000) load(); });

    // GAS は使われていないと起動に数秒〜十数秒かかる。合言葉を入力しているあいだに起こしておき、ログインを速くする
    if (!API.demo) API.call('ping').catch(function () {});

    var saved = readAuth();
    if (saved && saved.pass && saved.officer) { // お名前なしで覚えた端末は、もう一度入力してもらう
      enter(saved);
    } else showGate();
  }
  init();
})();
