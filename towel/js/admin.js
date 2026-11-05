/* admin.js — 役員用の集計画面。
 *
 * 役員どうしで共有する「合言葉」1つで、だれのスマホ・PCからでも同じ集計を見られる。
 * 画面は役員の3つの仕事に合わせて並べる：
 *   1. 業者に発注する数を知る      → いちばん上に合計枚数
 *   2. 集金する                    → 「集金」の数字を押すと、まだの家庭だけが並ぶ
 *   3. タオルを渡す                → 「受け渡し」の数字を押すと、まだの家庭だけが並ぶ
 * 申し込みの取り消しと、集金・受け渡しの記録を外すときは、必ず確認を出す。
 * 取り消したあとも［元に戻す］で取り返せる。1分ごとに最新にする（ほかの役員のチェックも反映）。
 */
(function () {
  'use strict';
  var API = window.TowelAPI, CFG = API.config;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = API.demo ? 'towel.admin.demo.v1' : 'towel.admin.v1';
  var OFFICER_KEY = 'towel.officer.v1';
  var REFRESH_MS = 60000;
  var PRICE = Number(CFG.price) || 0;
  var COURT = CFG.courtnameLabel || 'コートネーム';

  var auth = null;              // { pass, officer }
  var items = [];
  var pending = {};             // id → 保存中
  var view = { q: '', f: 'all', sort: 'new' };
  var lastLoaded = 0, timer = null, dlgTarget = null;

  /* ---------- 合言葉 ---------- */
  function readAuth() {
    var raw = null;
    try { raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch (e) { /* 読めなければ毎回入力 */ }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeAuth(a, remember) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(a));
      if (remember) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY);
      localStorage.setItem(OFFICER_KEY, a.officer || '');
    } catch (e) { /* 保存できなくても、この表示のあいだは使える */ }
  }
  function clearAuth() {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* なにもしない */ }
  }

  function showGate(msg) {
    stopTimer();
    auth = null;
    $('board').hidden = true;
    $('band-tools').hidden = true;
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
    var btn = $('gate-submit');
    btn.disabled = true; btn.textContent = '確かめています…';
    var a = { pass: pass, officer: API.squish($('officer').value).slice(0, 12) };
    API.call('admin_login', { pass: a.pass }).then(function () {
      writeAuth(a, $('remember').checked);
      enter(a);
    }, function (err) {
      $('gate-error').textContent = API.message(err);
      $('gate-error').hidden = false;
      $('pass').select();
    }).then(function () { btn.disabled = false; btn.textContent = '集計を見る'; });
  }

  function enter(a) {
    auth = a;
    $('gate').hidden = true;
    $('board').hidden = false;
    $('band-tools').hidden = false;
    load(true);
    startTimer();
  }

  /* ---------- 読み込み ---------- */
  function load(first) {
    if (!auth) return Promise.resolve();
    if (Object.keys(pending).length) return Promise.resolve();   // 保存中は上書きしない
    $('refresh').disabled = true;
    if (first) $('updated').textContent = '読み込み中…';
    return API.call('admin_list', { pass: auth.pass }).then(function (res) {
      items = (res.items || []).map(function (x) { return Object.assign({}, x); });
      lastLoaded = Date.now();
      render();
    }, function (err) {
      if (err.code === 'wrong_pass' || err.code === 'locked' || err.code === 'no_pass') { clearAuth(); showGate(API.message(err)); return; }
      toast(API.message(err), true);
      markStale();
    }).then(function () { $('refresh').disabled = false; });
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
  function markStale() {
    if (!lastLoaded) return;
    var el = $('updated'), d = new Date(lastLoaded);
    el.textContent = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ' に更新';
    el.classList.toggle('is-stale', Date.now() - lastLoaded > 3 * 60000);
  }

  /* ---------- 集計 ---------- */
  function stats() {
    var active = items.filter(function (x) { return x.status !== 'cancelled'; });
    var s = { orders: active.length, total: 0, paidOrders: 0, paidCount: 0, handedOrders: 0, handedCount: 0, cancelled: items.length - active.length };
    active.forEach(function (x) {
      s.total += x.count;
      if (x.paid) { s.paidOrders += 1; s.paidCount += x.count; }
      if (x.handed) { s.handedOrders += 1; s.handedCount += x.count; }
    });
    return s;
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  function renderKpis(s) {
    $('k-total').textContent = String(s.total);
    $('k-total-sub').textContent = s.orders ? s.orders + ' 家庭から申し込み' : 'まだ申し込みはありません';
    var target = Number(CFG.target) || 0;
    if (target > 0) {
      $('k-target').hidden = false;
      $('k-target-meter').style.width = Math.min(100, pct(s.total, target)) + '%';
      $('k-target-meter-label').setAttribute('aria-label', '発注の目安 ' + target + '枚に対して ' + pct(s.total, target) + '%');
      $('k-target-sub').textContent = s.total >= target ? '発注の目安 ' + target + ' 枚に届きました' : '発注の目安 ' + target + ' 枚まで あと ' + (target - s.total) + ' 枚';
    }
    var unpaid = s.orders - s.paidOrders, unhanded = s.orders - s.handedOrders;
    $('k-paid').textContent = String(s.paidOrders);
    $('k-paid-of').textContent = '/ ' + s.orders + ' 家庭';
    $('k-paid-meter').style.width = pct(s.paidOrders, s.orders) + '%';
    $('k-paid-meter-label').setAttribute('aria-label', '集金 ' + pct(s.paidOrders, s.orders) + '%');
    $('k-paid-sub').textContent = unpaid
      ? 'まだ ' + unpaid + ' 家庭' + (PRICE > 0 ? '（' + API.yen(PRICE * (s.total - s.paidCount)) + '）' : '')
      : (s.orders ? 'すべての家庭から集金しました' : '');
    if (PRICE > 0 && s.orders) $('k-paid-sub').textContent += '　集金済み ' + API.yen(PRICE * s.paidCount);
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
      if (!q) return true;
      return norm(x.name).indexOf(q) >= 0 || norm(x.courtname).indexOf(q) >= 0 || norm(x.memo).indexOf(q) >= 0 ||
        String(x.id) === q.replace(/^no\.?0*/, '') || norm(API.no(x.id)).indexOf(q) >= 0;
    });
    var by = {
      'new': function (a, b) { return b.id - a.id; },
      old: function (a, b) { return a.id - b.id; },
      name: function (a, b) { return String(a.name).localeCompare(String(b.name), 'ja'); },
      count: function (a, b) { return b.count - a.count || a.id - b.id; }
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

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
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
    label.appendChild(input); label.appendChild(box); label.appendChild(t);
    return label;
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
      if (x.courtname) {
        var court = el('p', 'row-court');
        court.appendChild(el('span', 'row-court-label', COURT));
        court.appendChild(el('b', null, x.courtname));
        who.appendChild(court);
      }
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
      cnt.appendChild(el('span', 'num', String(x.count)));
      cnt.appendChild(el('span', 'unit', '枚'));
      if (PRICE > 0) cnt.appendChild(el('small', null, API.yen(PRICE * x.count)));
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
      else if (view.f === 'unhanded' && !view.q) { $('empty-title').textContent = 'まだ渡していない家庭はありません'; $('empty-text').textContent = 'すべての家庭に渡しました。'; }
      else if (view.f === 'cancelled' && !view.q) { $('empty-title').textContent = '取り消した申し込みはありません'; $('empty-text').textContent = ''; }
      else { $('empty-title').textContent = '当てはまる申し込みはありません'; $('empty-text').textContent = 'さがす言葉を変えてみてください。'; }
    } else empty.hidden = true;
    var sumShown = list.reduce(function (a, x) { return a + x.count; }, 0);
    $('result-count').textContent = list.length + ' 家庭・' + sumShown + ' 枚';
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
      var n = el('b', null, o.item.name + ' さん'); t.appendChild(n);
      t.appendChild(el('span', 'ask-count', o.item.count + ' 枚'));
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
      Object.assign(x, res.item);
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
      save(id, (function () { var p = {}; p[key] = true; return p; })(), { toast: x.name + ' さん：' + w[1] + 'にしました' }).catch(function () {});
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
      var p = {}; p[key] = false;
      save(id, p, { toast: x.name + ' さん：' + w[0] + 'に戻しました' }).catch(function () {});
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
        body: '合計から ' + x.count + ' 枚が外れます。' + (note.length ? 'この家庭は「' + note.join('・') + '」です。返金や回収が必要かご確認ください。' : '') + '取り消した申し込みは「取り消し」から元に戻せます。',
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
  function openDialog(x) {
    dlgTarget = x || null;
    $('dlg-title').textContent = x ? API.no(x.id) + ' ' + x.name + ' さんの内容を修正' : 'ご家庭の代わりに追加';
    $('d-name').value = x ? x.name : '';
    $('d-courtname').value = x ? (x.courtname || '') : '';
    $('d-count').value = x ? String(x.count) : '1';
    $('d-memo').value = x ? (x.memo || '') : '';
    $('dlg-save').textContent = x ? '保存する' : '追加する';
    $('dlg-error').hidden = true;
    ['name', 'courtname', 'count'].forEach(function (f) { $('dfield-' + f).classList.remove('has-error'); $('d-' + f + '-error').hidden = true; });
    $('dlg').showModal();
    $('d-name').focus();
  }
  function onDialogSave(ev) {
    ev.preventDefault();
    var v = API.validate({ name: $('d-name').value, courtname: $('d-courtname').value, count: $('d-count').value });
    ['name', 'courtname', 'count'].forEach(function (f) { $('dfield-' + f).classList.remove('has-error'); $('d-' + f + '-error').hidden = true; });
    if (v.errors.length) {
      v.errors.forEach(function (e) { $('dfield-' + e.field).classList.add('has-error'); var p = $('d-' + e.field + '-error'); p.textContent = e.msg; p.hidden = false; });
      $('d-' + v.errors[0].field).focus();
      return;
    }
    var memo = $('d-memo').value.trim().slice(0, 200);
    var b = $('dlg-save');
    b.disabled = true;
    var p;
    if (dlgTarget) {
      var id = dlgTarget.id;
      pending[id] = true;
      p = API.call('admin_save', { pass: auth.pass, officer: auth.officer || '', id: id, patch: { name: v.value.name, courtname: v.value.courtname, count: v.value.count, memo: memo } })
        .then(function (res) { delete pending[id]; Object.assign(find(id), res.item); return res.item.name + ' さんの内容を修正しました'; },
          function (err) { delete pending[id]; throw err; });
    } else {
      p = API.call('admin_add', { pass: auth.pass, officer: auth.officer || '', name: v.value.name, courtname: v.value.courtname, count: v.value.count, memo: memo, requestId: API.uuid() })
        .then(function (res) { items.push(res.item); return res.item.name + ' さんを追加しました（' + API.no(res.item.id) + '）'; });
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
  function rowsForExport() {
    return items.slice().sort(function (a, b) { return a.id - b.id; }).map(function (x) {
      return [API.no(x.id), x.name, x.courtname || '', x.count, x.status === 'cancelled' ? '取り消し' : '有効',
        x.paid ? '済' : '', x.paidBy || '', x.handed ? '済' : '', x.handedBy || '', API.longDate(x.createdAt), x.memo || ''];
    });
  }
  var HEAD = ['受付番号', 'お名前', COURT, '枚数', '状態', '集金', '集金の記録', '受け渡し', '受け渡しの記録', '受付日時', '役員メモ'];
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
    a.download = '春高タオル_申し込み_' + stamp + '.csv';
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
      '【' + (CFG.item || '記念タオル') + ' 申し込み集計】',
      (d.getMonth() + 1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '） ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ' 時点',
      '合計 ' + s.total + ' 枚（' + s.orders + ' 家庭）',
      '集金 ' + s.paidOrders + ' / ' + s.orders + ' 家庭' + (PRICE > 0 ? '（' + API.yen(PRICE * s.paidCount) + ' / ' + API.yen(PRICE * s.total) + '）' : ''),
      '受け渡し ' + s.handedOrders + ' / ' + s.orders + ' 家庭'
    ];
    var end = API.deadlineEnd();
    if (end && Date.now() < end.getTime()) lines.push('締切まで あと ' + Math.ceil((end - Date.now()) / 86400000) + ' 日');
    copyText(lines.join('\n'), '集計をコピーしました。LINE などに貼り付けられます');
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
    $('team-line').textContent = (CFG.team ? CFG.team + '　' : '') + '役員用';
    $('d-courtname-label').textContent = COURT;
    if (CFG.sheetUrl) { $('sheet-link').href = CFG.sheetUrl; $('sheet-link').hidden = false; }

    $('gate-form').addEventListener('submit', onGate);
    $('refresh').addEventListener('click', function () { load(); });
    $('logout').addEventListener('click', function () { clearAuth(); showGate(); });
    $('q').addEventListener('input', function () { view.q = $('q').value; render(); });
    $('sort').addEventListener('change', function () { view.sort = $('sort').value; render(); });
    $('filters').addEventListener('click', function (ev) { var b = ev.target.closest('button[data-f]'); if (b) setFilter(b.dataset.f); });
    $('k-paid-card').addEventListener('click', function () { setFilter('unpaid', true); });
    $('k-handed-card').addEventListener('click', function () { setFilter('unhanded', true); });
    $('rows').addEventListener('change', onRowsChange);
    $('rows').addEventListener('click', onRowsClick);
    $('add').addEventListener('click', function () { openDialog(null); });
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

    var saved = readAuth();
    if (saved && saved.pass) {
      try { $('remember').checked = !!localStorage.getItem(KEY); } catch (e) { /* なにもしない */ }
      enter(saved);
    } else showGate();
  }
  init();
})();
