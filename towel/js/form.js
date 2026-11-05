/* form.js — 各家庭が使う申し込み画面。
 *
 * 流れ：1 入力 →［確認する］→ 2 確認（お名前と枚数を大きく表示）→［申し込む］→ 3 完了
 *   - 入力はスマホ1画面に収める（見出しを小さく、欄は3つ、ボタンまでスクロールなしで届く）
 *   - 確認でも完了でも［修正する］で入力に戻れる。完了の画面には［閉じる］も置く
 *   - 送った申し込みは、この端末に「受付番号と合鍵（token）」だけ覚えておき、
 *     次に開いたときは「申し込み済みです」から修正・取り消しができる（入力欄は出さず、二重の申し込みを防ぐ）
 *   - 通信が切れて同じ申し込みを2回送っても、1件にしかならない（requestId）
 */
(function () {
  'use strict';
  var API = window.TowelAPI, CFG = API.config;
  var $ = function (id) { return document.getElementById(id); };
  var MAX = Number(CFG.maxPerOrder) || 20;
  var PRICE = Number(CFG.price) || 0;
  var STORE_KEY = API.demo ? 'towel.mine.demo.v2' : 'towel.mine.v1';
  var NEW_TITLE = '1家庭1回、まとめてお申し込みください';

  var state = {
    mode: 'new',          // 'new' | 'edit'
    editing: null,        // 修正中の申し込み { id, token, status }
    draft: null,          // 確認画面に出している内容 { name, courtname, count }
    last: null,           // 完了した申し込み
    sending: false,
    requestId: API.uuid() // 同じ申し込みの再送を1件にまとめるための番号（成功したら新しくする）
  };

  /* ---------- この端末に覚えておく申し込み ---------- */
  function loadMine() {
    try { var a = JSON.parse(localStorage.getItem(STORE_KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveMine(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-10))); } catch (e) { /* 保存できない端末でも申し込み自体はできる */ }
  }
  function slim(it) { return { id: it.id, name: it.name, courtname: it.courtname, count: it.count, status: it.status, createdAt: it.createdAt, updatedAt: it.updatedAt }; }
  function upsertMine(item, token) {
    var list = loadMine(), found = null;
    list.forEach(function (x) { if (x.id === item.id) { found = x; Object.assign(x, slim(item)); if (token) x.token = token; } });
    if (!found) { found = Object.assign(slim(item), { token: token }); list.push(found); }
    saveMine(list);
    return found;
  }
  function mineById(id) { return loadMine().filter(function (m) { return m.id === id; })[0] || null; }

  /* ---------- 画面の切り替え ----------
   * input    入力
   * confirm  確認
   * done     完了
   * finished 完了のあと［閉じる］（閉じられないブラウザ用）
   * home     この端末から申し込み済みで開いたとき
   * closed   受付終了 */
  function show(step) {
    $('form').hidden = step !== 'input';
    $('result').hidden = step !== 'confirm' && step !== 'done';
    $('finished').hidden = step !== 'finished';
    $('closed').hidden = step !== 'closed';
    $('info').hidden = !$('info').children.length || step === 'confirm' || step === 'done';
    $('steps').hidden = !(step === 'input' || step === 'confirm' || step === 'done');
    Array.prototype.forEach.call($('steps').children, function (li) {
      var s = li.dataset.step;
      if (s === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('is-past', (step === 'confirm' && s === 'input') || (step === 'done' && s !== 'done'));
    });
    if (step === 'home' || step === 'finished' || step === 'closed') renderMine(step); else $('mine').hidden = true;
  }
  function goTop(el) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (el) el.focus({ preventScroll: true });
  }

  /* ---------- 設定を画面に反映 ---------- */
  function applyConfig() {
    if (API.demo) $('demo-bar').hidden = false;
    // チーム名と「春高バレー 出場記念」は、それぞれの途中で改行しない（切れ目でだけ折り返す）
    var tl = $('team-line'); tl.textContent = '';
    (CFG.team ? [CFG.team, '春高バレー 出場記念'] : ['春高バレー 出場記念']).forEach(function (t, i) {
      if (i) tl.appendChild(document.createTextNode(' '));
      var sp = document.createElement('span'); sp.textContent = t; tl.appendChild(sp);
    });
    if (CFG.item) document.title = CFG.item + ' 申し込み';

    var label = CFG.courtnameLabel || 'コートネーム';
    $('courtname-label').textContent = label;
    $('t-code-label').textContent = label;
    if (CFG.courtnameHint) $('courtname-hint').textContent = CFG.courtnameHint;
    if (CFG.courtnameRequired) { $('courtname-tag').textContent = '必須'; $('courtname-tag').className = 'tag tag-req'; }

    // 値段と締切は見出しの中に（申し込む前に必ず目に入る場所）
    var meta = [], end = API.deadlineEnd();
    if (PRICE > 0) meta.push('1枚 ' + API.yen(PRICE));
    if (end) {
      var days = Math.ceil((end.getTime() - Date.now()) / 86400000);
      var dl = '締切 ' + (end.getMonth() + 1) + '/' + end.getDate() + '（' + '日月火水木金土'[end.getDay()] + '）';
      if (days >= 0) dl += days === 0 ? ' 今日まで' : ' あと' + days + '日';
      meta.push(dl);
      if (days >= 0 && days <= 3) $('band-meta').classList.add('is-soon');
    }
    if (meta.length) { $('band-meta').textContent = meta.join('　'); $('band-meta').hidden = false; }

    // 受け取り・支払いは、フォームの下のご案内に
    [['受け取り', CFG.delivery], ['お支払い', CFG.payment]].forEach(function (it) {
      if (!it[1]) return;
      var box = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = it[0]; dd.textContent = it[1];
      box.appendChild(dt); box.appendChild(dd); $('info').appendChild(box);
    });
    if (CFG.contact) { $('contact').textContent = 'お問い合わせ：' + CFG.contact; $('foot').hidden = false; }
  }

  /* ---------- 枚数 ---------- */
  function currentCount() { var n = API.toCount($('count').value); return isNaN(n) ? 0 : n; }
  function setCount(n) {
    n = Math.max(1, Math.min(MAX, n));
    $('count').value = String(n);
    onInput();
    var b = $('towel-badge');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  function drawTowel(n) {
    $('towel-stack').dataset.count = String(Math.min(Math.max(n, 1), 3));
    $('towel-badge').textContent = '×' + (n || 0);
  }

  function onInput() {
    var n = currentCount();
    $('minus').disabled = n <= 1;
    $('plus').disabled = n >= MAX;
    drawTowel(n);
    $('count-hint').textContent = '1〜' + MAX + '枚' + (PRICE > 0 && n ? '　合計 ' + API.yen(PRICE * n) : '');
    // 直したらその欄のエラー表示は消す（確認に進むときにもう一度確かめる）
    ['name', 'courtname', 'count'].forEach(function (f) {
      if (!$('field-' + f).classList.contains('has-error')) return;
      if (!API.validate(readForm()).errors.some(function (e) { return e.field === f; })) clearError(f);
    });
  }
  function readForm() { return { name: $('name').value, courtname: $('courtname').value, count: $('count').value }; }

  /* ---------- エラー表示（欄の横＋まとめ） ---------- */
  function clearError(f) {
    $('field-' + f).classList.remove('has-error');
    $(f + '-error').hidden = true;
    $(f).removeAttribute('aria-invalid');
  }
  function showErrors(errors) {
    ['name', 'courtname', 'count'].forEach(clearError);
    var list = $('error-list');
    list.textContent = '';
    errors.forEach(function (e) {
      $('field-' + e.field).classList.add('has-error');
      var p = $(e.field + '-error'); p.textContent = e.msg; p.hidden = false;
      $(e.field).setAttribute('aria-invalid', 'true');
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + e.field; a.textContent = e.msg;
      a.addEventListener('click', function (ev) { ev.preventDefault(); $(e.field).focus(); });
      li.appendChild(a); list.appendChild(li);
    });
    // 欄が1つだけのまちがいは欄の横の表示で足りる。2つ以上のときだけ上にまとめる（1画面に収めるため）
    $('error-summary').hidden = errors.length < 2;
    if (errors.length >= 2) $('error-summary').focus();
    else if (errors.length === 1) $(errors[0].field).focus();
  }

  /* ---------- 1 → 2：確認する ---------- */
  function fillTicket(it) {
    $('t-name').textContent = it.name;
    $('t-code').textContent = it.courtname || '';
    $('t-code-row').hidden = !it.courtname;
    $('t-count').textContent = String(it.count);
    if (PRICE > 0) { $('t-yen').textContent = API.yen(PRICE * it.count); $('t-yen-row').hidden = false; }
    else $('t-yen-row').hidden = true;
    var t = $('ticket');
    t.classList.remove('is-new'); void t.offsetWidth; t.classList.add('is-new');
    drawTowel(it.count);
  }

  function toConfirm(ev) {
    ev.preventDefault();
    var v = API.validate(readForm());
    if (v.errors.length) { showErrors(v.errors); return; }
    showErrors([]);
    state.draft = v.value;
    var edit = state.mode === 'edit';
    $('result-title').textContent = edit ? '修正した内容' : '申し込み内容';
    $('result-sub').textContent = edit ? 'まだ保存されていません' : 'まだ申し込みは終わっていません';
    $('result-sub').className = 'result-sub is-pending';
    $('mark-confirm').hidden = false; $('mark-done').hidden = true;
    fillTicket(v.value);
    $('t-foot').hidden = !edit;
    if (edit) { $('t-no').textContent = API.no(state.editing.id); $('t-at').textContent = 'この番号の内容を書きかえます'; }
    $('confirm-actions').hidden = false;
    $('done-actions').hidden = true;
    $('done-new').hidden = true;
    $('send-error').hidden = true;
    setSending(false);
    $('result-note').textContent = edit ? 'よければ「保存する」を押してください' : 'よければ「申し込む」を押してください';
    show('confirm');
    goTop($('result'));
  }

  /* ---------- 2 → 3：申し込む ---------- */
  function setSending(on) {
    state.sending = on;
    var btn = $('confirm-send'), edit = state.mode === 'edit';
    btn.disabled = on;
    $('confirm-back').disabled = on;
    btn.textContent = '';
    if (on) { var s = document.createElement('span'); s.className = 'spinner'; btn.appendChild(s); }
    btn.appendChild(document.createTextNode(on ? (edit ? '保存中…' : '送信中…') : (edit ? '保存する' : '申し込む')));
  }

  function send() {
    if (state.sending || !state.draft) return;
    $('send-error').hidden = true;
    var body = { name: state.draft.name, courtname: state.draft.courtname, count: state.draft.count, website: $('website').value };
    var edit = state.mode === 'edit';
    setSending(true);
    var p = edit
      ? API.call('update', Object.assign(body, { id: state.editing.id, token: state.editing.token })).then(function (res) { return upsertMine(res.item); })
      : API.call('submit', Object.assign(body, { requestId: state.requestId })).then(function (res) { state.requestId = API.uuid(); return upsertMine(res.item, res.token); });
    p.then(function (entry) {
      setSending(false);
      showDone(entry, edit);
    }, function (err) {
      setSending(false);
      var el = $('send-error');
      el.textContent = err && err.code === 'invalid' ? '入力内容に誤りがあります。「修正する」で直してください。' : API.message(err);
      el.hidden = false;
    });
  }

  /* ---------- 3：完了 ---------- */
  function showDone(entry, edited) {
    state.last = entry;
    state.mode = 'new';
    state.editing = null;
    $('result-title').textContent = edited ? '修正を保存しました' : '申し込みが完了しました';
    $('result-sub').textContent = edited ? '役員の集計も新しい内容になりました' : '役員の集計に届きました';
    $('result-sub').className = 'result-sub is-ok';
    $('mark-confirm').hidden = true; $('mark-done').hidden = false;
    fillTicket(entry);
    $('t-no').textContent = API.no(entry.id);
    $('t-at').textContent = API.shortDate(edited ? entry.updatedAt : entry.createdAt) + (edited ? ' 修正' : ' 受付');
    $('t-foot').hidden = false;
    $('confirm-actions').hidden = true;
    $('done-actions').hidden = false;
    $('done-new').hidden = false;
    $('result-note').textContent = 'スクリーンショットを撮っておくと安心です';
    show('done');
    goTop($('result'));
  }

  /* LINE などから開いたタブは、ブラウザによってはページから閉じられる。閉じられないときは
     「ありがとうございました」と申し込み済みの一覧だけを残し、入力欄は出さない（もう一度送ってしまわないように）。 */
  function closeDone() {
    try { window.close(); } catch (e) { /* 閉じられないブラウザでは何も起きない */ }
    setTimeout(function () { show('finished'); goTop($('finished')); }, 250);
  }

  /* ---------- 入力に戻る（新規・修正） ---------- */
  function fillForm(it) {
    $('name').value = it ? it.name || '' : '';
    $('courtname').value = it ? it.courtname || '' : '';
    $('count').value = String(it ? it.count || 1 : 1);
    showErrors([]);
    onInput();
  }
  function startEdit(entry) {   // 申し込み済みの内容を直す
    state.mode = 'edit';
    state.editing = { id: entry.id, token: entry.token, status: entry.status };
    $('form-title').textContent = API.no(entry.id) + ' の内容を修正';
    $('cancel-edit').hidden = false;
    $('danger-zone').hidden = entry.status === 'cancelled';
    $('withdraw-confirm').hidden = true; $('withdraw').hidden = false; $('withdraw-error').hidden = true;
    $('form-note').textContent = entry.status === 'cancelled'
      ? '取り消し済みの申し込みです。保存すると、もう一度申し込んだことになります'
      : 'まだ保存されません。次の画面で内容を確かめます';
    fillForm(entry);
    show('input');
    goTop();
  }
  function backToInput() {      // 確認画面の［修正する］：入力した内容を残したまま戻る
    show('input');
    goTop();
  }
  function startNew(focus) {
    state.mode = 'new';
    state.editing = null;
    state.draft = null;
    $('form-title').textContent = NEW_TITLE;
    $('cancel-edit').hidden = true;
    $('danger-zone').hidden = true;
    $('form-note').textContent = 'まだ送信されません。次の画面で内容を確かめます';
    fillForm(null);
    show(API.isClosed() ? 'closed' : 'input');
    if (focus) { goTop(); $('name').focus({ preventScroll: true }); }
  }
  function home() {             // 申し込み済みの端末で開いたとき・修正をやめたとき
    state.mode = 'new';
    state.editing = null;
    var hasMine = loadMine().length > 0;
    if (API.isClosed()) show('closed');
    else if (hasMine) show('home');
    else startNew();
  }

  function withdraw() {
    if (!state.editing || state.sending) return;
    var btn = $('withdraw-yes');
    btn.disabled = true; btn.textContent = '取り消しています…';
    API.call('cancel', { id: state.editing.id, token: state.editing.token }).then(function (res) {
      btn.disabled = false; btn.textContent = '取り消す';
      upsertMine(res.item);
      home();
      $('mine-lead').textContent = API.no(res.item.id) + ' を取り消しました。';
      goTop();
    }, function (err) {
      btn.disabled = false; btn.textContent = '取り消す';
      $('withdraw-error').textContent = API.message(err);
      $('withdraw-error').hidden = false;
    });
  }

  /* ---------- この端末からの申し込み一覧 ---------- */
  function renderMine(step) {
    var list = loadMine(), ul = $('mine-list');
    ul.textContent = '';
    if (!list.length) { $('mine').hidden = true; return; }
    var closed = API.isClosed();
    var active = list.filter(function (x) { return x.status !== 'cancelled'; }).length;
    $('mine-title').textContent = step === 'finished' ? 'この端末からの申し込み' : (active ? '申し込み済みです' : 'この端末からの申し込み');
    list.slice().reverse().forEach(function (x) {
      var li = document.createElement('li');
      li.className = 'mine-item' + (x.status === 'cancelled' ? ' is-cancelled' : '');
      var who = document.createElement('div'); who.className = 'mine-who';
      var b = document.createElement('b'); b.textContent = x.name + ' さん'; who.appendChild(b);
      var meta = document.createElement('p'); meta.className = 'mine-meta';
      meta.textContent = API.no(x.id) + (x.courtname ? '　' + x.courtname : '') + (x.status === 'cancelled' ? '　取り消し済み' : '');
      who.appendChild(meta);
      var cnt = document.createElement('p'); cnt.className = 'mine-count';
      var n = document.createElement('span'); n.className = 'num'; n.textContent = String(x.count);
      cnt.appendChild(n); cnt.appendChild(document.createTextNode(' 枚'));
      li.appendChild(who); li.appendChild(cnt);
      if (!closed) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-ghost btn-sm';
        btn.textContent = x.status === 'cancelled' ? 'もう一度申し込む' : '修正・取り消し';
        btn.addEventListener('click', function () { startEdit(x); });
        li.appendChild(btn);
      }
      ul.appendChild(li);
    });
    $('mine-lead').textContent = closed ? '受付は終了しました。修正は役員にご相談ください。' : '内容を直したいときは「修正・取り消し」を押してください。';
    $('mine-new').hidden = closed;
    $('mine').hidden = false;
  }
  function refreshMine() {   // 役員が直した分も反映するため、開いたときに最新の内容を取り直す
    var list = loadMine();
    if (!list.length) return;
    API.call('mine', { items: list.map(function (x) { return { id: x.id, token: x.token }; }) }).then(function (res) {
      (res.items || []).forEach(function (it) { upsertMine(it); });
      if (!$('mine').hidden) renderMine($('finished').hidden ? 'home' : 'finished');
    }, function () { /* 取り直せなくても、覚えている内容で表示を続ける */ });
  }

  /* ---------- はじめに ---------- */
  function init() {
    applyConfig();
    $('form').addEventListener('submit', toConfirm);
    ['name', 'courtname', 'count'].forEach(function (id) { $(id).addEventListener('input', onInput); });
    $('count').addEventListener('blur', function () { var n = currentCount(); if (n) setCount(n); });
    $('count').addEventListener('focus', function () { $('count').select(); });
    $('minus').addEventListener('click', function () { setCount((currentCount() || 1) - 1); });
    $('plus').addEventListener('click', function () { setCount((currentCount() || 0) + 1); });
    $('cancel-edit').addEventListener('click', function () { home(); goTop(); });
    $('withdraw').addEventListener('click', function () { $('withdraw-confirm').hidden = false; $('withdraw').hidden = true; $('withdraw-yes').focus(); });
    $('withdraw-no').addEventListener('click', function () { $('withdraw-confirm').hidden = true; $('withdraw').hidden = false; $('withdraw').focus(); });
    $('withdraw-yes').addEventListener('click', withdraw);

    $('confirm-back').addEventListener('click', backToInput);
    $('confirm-send').addEventListener('click', send);
    $('done-edit').addEventListener('click', function () { var x = state.last && mineById(state.last.id); if (x) startEdit(x); });
    $('done-close').addEventListener('click', closeDone);
    $('done-new').addEventListener('click', function () { startNew(true); });
    $('mine-new').addEventListener('click', function () { startNew(true); });

    // GAS は起動に数秒かかることがある。入力を始めた時点で起こしておく
    var warmed = false;
    $('form').addEventListener('focusin', function () { if (!warmed) { warmed = true; API.call('ping').catch(function () {}); } });

    fillForm(null);
    home();
    refreshMine();
  }
  init();
})();
