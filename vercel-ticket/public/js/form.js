/* form.js — 各家庭が使う申し込み画面（春高バレー 応援チケット）。
 *
 * 流れ：1 入力 →［確認する］→ 2 確認（お名前・枚数・金額を大きく＋注意事項）→［申し込む］→ 3 完了
 *   - 入力はスマホ1画面に収める（お名前とコートネームを横に並べ、枚数は 日付×区分 の表）
 *   - いちばん間違えやすい注意（部員の分は入れない）は入力欄の上に、
 *     5つの注意はすべて、申し込む直前の確認画面に出す
 *   - 送った申し込みは、この端末に「受付番号と合鍵（token）」だけ覚えておき、
 *     次に開いたときは「申し込み済みです」から修正・取り消しができる（入力欄は出さず、二重の申し込みを防ぐ）
 *   - 通信が切れて同じ申し込みを2回送っても、1件にしかならない（requestId）
 */
(function () {
  'use strict';
  var API = window.TicketAPI, CFG = API.config;
  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = API.demo ? 'ticket.mine.demo.v1' : 'ticket.mine.v1';
  var grid = null;

  var state = {
    mode: 'new',          // 'new' | 'edit'
    editing: null,        // 修正中の申し込み { id, token, status }
    draft: null,          // 確認画面に出している内容 { name, courtname, grade, counts }
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
  function slim(it) { return { id: it.id, name: it.name, courtname: it.courtname, grade: it.grade || 0, counts: it.counts, status: it.status, createdAt: it.createdAt, updatedAt: it.updatedAt }; }
  function upsertMine(item, token) {
    var list = loadMine(), found = null;
    list.forEach(function (x) { if (x.id === item.id) { found = x; Object.assign(x, slim(item)); if (token) x.token = token; } });
    if (!found) { found = Object.assign(slim(item), { token: token }); list.push(found); }
    saveMine(list);
    return found;
  }
  function mineById(id) { return loadMine().filter(function (m) { return m.id === id; })[0] || null; }

  /* ---------- 画面の切り替え ----------
   * input 入力 / confirm 確認 / done 完了 / finished 完了のあと［閉じる］/ home 申し込み済みの端末で開いたとき / closed 受付終了 */
  function show(step) {
    $('form').hidden = step !== 'input';
    state.step = step;
    $('result').hidden = step !== 'confirm' && step !== 'done' && step !== 'saved';
    $('finished').hidden = step !== 'finished';
    $('closed').hidden = step !== 'closed';
    $('info').hidden = !$('info').children.length || step === 'confirm' || step === 'done' || step === 'saved';
    $('steps').hidden = !(step === 'input' || step === 'confirm' || step === 'done');
    Array.prototype.forEach.call($('steps').children, function (li) {
      var s = li.dataset.step;
      if (s === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('is-past', (step === 'confirm' && s === 'input') || (step === 'done' && s !== 'done'));
    });
    if (step === 'home' || step === 'finished' || step === 'closed') renderMine(step);
    else if (step === 'saved' && loadMine().length > 1) renderMine('home');   // 2件以上あるときだけ、下に一覧も出す
    else $('mine').hidden = true;
  }
  function goTop(el) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (el) el.focus({ preventScroll: true });
  }

  /* ---------- 設定を画面に反映 ---------- */
  function fillNotes(ul) {
    ul.textContent = '';
    (CFG.notes || []).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  }
  /* 学年の選択肢（1年・2年・3年）。見た目はボタン、中身はラジオボタン（キーボード・読み上げでも選べる） */
  function buildGrades() {
    var seg = $('grade-seg'); seg.textContent = '';
    $('field-grade').hidden = !API.useGrade;          // 学年を使わない設定（config.js の useGrade）では欄ごと出さない
    if (!API.useGrade) return;
    API.grades.forEach(function (g, i) {
      var lab = document.createElement('label'); lab.className = 'seg-opt';
      var inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'grade'; inp.value = String(g);
      if (!i) inp.id = 'grade';
      var sp = document.createElement('span'); sp.textContent = API.gradeLabel(g);
      lab.appendChild(inp); lab.appendChild(sp); seg.appendChild(lab);
    });
  }
  /* 締め切りは見出しの中に（申し込む前に必ず目に入る場所）。日付は役員の画面で決めたものが集計先から届く */
  function renderDeadline() {
    var end = API.deadlineEnd(), meta = $('band-meta');
    meta.classList.remove('is-soon');
    if (!end) { meta.hidden = true; meta.textContent = ''; $('closed-date').hidden = true; return; }
    var label = (end.getMonth() + 1) + '/' + end.getDate() + '（' + '日月火水木金土'[end.getDay()] + '）';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    var days = Math.round((endDay - today) / 86400000);   // 暦の日数で数える（当日は「今日まで」）
    if (API.isClosed()) meta.textContent = '受付終了（締切 ' + label + '）';
    else {
      meta.textContent = '締切 ' + label + (days <= 0 ? ' 今日まで' : ' あと' + days + '日');
      if (days <= 3) meta.classList.add('is-soon');
    }
    meta.hidden = false;
    $('closed-date').textContent = '締め切り：' + label;
    $('closed-date').hidden = false;
  }
  /* 役員が締め切り日を変えたら、開いている画面にもすぐ反映（受付終了・再開） */
  function onDeadlineChange() {
    renderDeadline();
    var closed = API.isClosed();
    if (closed && ['input', 'home', 'saved', 'finished'].indexOf(state.step) >= 0) home();
    else if (!closed && state.step === 'closed') home();
  }
  function applyConfig() {
    buildGrades();
    if (API.demo) $('demo-bar').hidden = false;
    // チーム名と「春高バレー」は、それぞれの途中で改行しない（切れ目でだけ折り返す）
    if (CFG.team) $('team-name').textContent = CFG.team; else $('team-line').hidden = true;
    document.title = '春高チケット申し込み';

    var label = CFG.courtnameLabel || 'コートネーム';
    $('courtname-label').textContent = label;
    $('t-code-label').textContent = label;
    if (CFG.courtnameHint) $('courtname-hint').textContent = label + '：' + CFG.courtnameHint;
    if (CFG.courtnameRequired) { $('courtname-tag').textContent = '必須'; $('courtname-tag').className = 'tag tag-req'; }

    if (CFG.headline) $('notes-headline').textContent = CFG.headline;
    fillNotes($('notes-list'));
    fillNotes($('declare-list'));
    if (!(CFG.notes || []).length) { $('notes').hidden = true; $('declare').hidden = true; }

    renderDeadline();

    // 受け取り・支払いは、フォームの下のご案内に
    [['受け取り', CFG.delivery], ['お支払い', CFG.payment]].forEach(function (it) {
      if (!it[1]) return;
      var box = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = it[0]; dd.textContent = it[1];
      box.appendChild(dt); box.appendChild(dd); $('info').appendChild(box);
    });
    if (CFG.contact) { $('contact').textContent = 'お問い合わせ：' + CFG.contact; $('foot').hidden = false; }

    // 確認・完了の表の見出し（日付 / 大人 / 高校生以下）
    var head = $('t-head');
    var th0 = document.createElement('th'); th0.scope = 'col'; th0.textContent = '日付'; head.appendChild(th0);
    API.kinds.forEach(function (k) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = k.label; head.appendChild(th); });
  }

  /* ---------- 合計（その場で更新） ---------- */
  function onInput() {
    var c = API.cleanCounts(grid.get()), n = API.totalOf(c);
    $('sum-count').textContent = String(n);
    $('sum-yen').textContent = API.yen(API.amountOf(c));
    $('sum-bar').classList.toggle('has-value', n > 0);
    drawStub(n);
    ['name', 'courtname', 'grade', 'counts'].forEach(function (f) {
      if (!$('field-' + f).classList.contains('has-error')) return;
      if (!API.validate(readForm(), REQ).errors.some(function (e) { return e.field === f; })) clearError(f);
    });
  }
  function drawStub(n) {
    var b = $('stub-badge');
    if (!b) return;   // 見出しに枚数の札がないデザインでは何もしない
    if (b.textContent !== '×' + n) { b.textContent = '×' + n; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }
  var REQ = { requireGrade: API.useGrade };   // 学年を使うときは、ご家庭の画面では必須
  function checkedGrade() { var c = document.querySelector('input[name="grade"]:checked'); return c ? c.value : ''; }
  function setGrade(g) { Array.prototype.forEach.call(document.querySelectorAll('input[name="grade"]'), function (r) { r.checked = String(g || '') === r.value; }); }
  function readForm() {
    var f = { name: $('name').value, courtname: $('courtname').value, counts: grid.get() };
    if (API.useGrade) f.grade = checkedGrade();   // 使わないときは送らない（集計先に入っている学年はそのまま残る）
    return f;
  }

  /* ---------- エラー表示（欄の横＋まとめ） ---------- */
  function clearError(f) {
    $('field-' + f).classList.remove('has-error');
    $(f + '-error').hidden = true;
    if (f !== 'counts' && $(f)) $(f).removeAttribute('aria-invalid');   // 学年を使わない設定では学年の入力欄がない
  }
  function focusField(f) { if (f === 'counts') grid.focus(); else $(f).focus(); }
  function showErrors(errors) {
    ['name', 'courtname', 'grade', 'counts'].forEach(clearError);
    var list = $('error-list');
    list.textContent = '';
    errors.forEach(function (e) {
      $('field-' + e.field).classList.add('has-error');
      var p = $(e.field + '-error'); p.textContent = e.msg; p.hidden = false;
      if (e.field !== 'counts') $(e.field).setAttribute('aria-invalid', 'true');
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + e.field; a.textContent = e.msg;
      a.addEventListener('click', function (ev) { ev.preventDefault(); focusField(e.field); });
      li.appendChild(a); list.appendChild(li);
    });
    // 欄が1つだけのまちがいは欄の横の表示で足りる。2つ以上のときだけ上にまとめる（1画面に収めるため）
    $('error-summary').hidden = errors.length < 2;
    if (errors.length >= 2) $('error-summary').focus();
    else if (errors.length === 1) focusField(errors[0].field);
  }

  /* ---------- 確認・完了のチケット ---------- */
  function fillTicket(it) {
    $('t-name').textContent = it.name;
    $('t-code').textContent = it.courtname || '';
    $('t-court').hidden = !it.courtname;
    var g = API.useGrade && it.grade;
    $('t-grade').textContent = g ? API.gradeLabel(it.grade) : '';
    $('t-grade').hidden = !g;
    $('t-code-row').hidden = !it.courtname && !g;
    var body = $('t-body'); body.textContent = '';
    API.byDay(it.counts).forEach(function (row) {
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.scope = 'row'; th.textContent = API.dayLabel(row.day); tr.appendChild(th);
      API.kinds.forEach(function (k) {
        var td = document.createElement('td'), n = Number(it.counts[row.day.id + '-' + k.id]) || 0;
        td.className = 'num' + (n ? '' : ' is-zero');
        td.textContent = n ? n + '枚' : '—';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('t-count').textContent = String(API.totalOf(it.counts));
    $('t-yen').textContent = API.yen(API.amountOf(it.counts));
    var t = $('ticket');
    t.classList.remove('is-new'); void t.offsetWidth; t.classList.add('is-new');
    drawStub(API.totalOf(it.counts));
  }

  /* ---------- 1 → 2：確認する ---------- */
  function toConfirm(ev) {
    ev.preventDefault();
    var v = API.validate(readForm(), REQ);
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
    $('declare').hidden = !(CFG.notes || []).length;
    $('confirm-actions').hidden = false;
    $('done-actions').hidden = true;
    $('done-new').hidden = true;
    $('send-error').hidden = true;
    setSending(false);
    $('result-note').textContent = '';
    $('cheer').hidden = true;
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
    var body = { name: state.draft.name, courtname: state.draft.courtname, counts: state.draft.counts, website: $('website').value };
    if (API.useGrade) body.grade = state.draft.grade;
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
      if (err && err.code === 'closed') API.call('ping').then(function () { if (API.isClosed()) { renderDeadline(); home(); goTop(); } }, function () {});
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
    $('declare').hidden = true;
    $('confirm-actions').hidden = true;
    $('done-actions').hidden = false;
    $('done-new').hidden = true; // 1家庭1申し込み：別のお名前での申し込みは出さない
    $('done-close').hidden = false; $('done-actions').classList.remove('is-single');
    $('done-edit-label').textContent = '修正する';
    $('result-note').textContent = 'スクリーンショットを撮っておくと安心です';
    $('cheer').hidden = false;
    show('done');
    goTop($('result'));
  }

  /* LINE などから開いたタブは、ブラウザによってはページから閉じられる。閉じられないときは
     「ありがとうございました」と申し込み済みの一覧だけを残し、入力欄は出さない（もう一度送ってしまわないように）。 */
  function closeDone() {
    try { window.close(); } catch (e) { /* 閉じられないブラウザでは何も起きない */ }
    setTimeout(function () { showSaved(true); }, 250);
  }

  /* 申し込み済みの内容を券面で見せ、そこから［修正する］できるようにする（閉じたあと・同じ端末で開き直したとき）。
     いちばん新しい「有効な」申し込みを出す（なければ最新の取り消し済み） */
  function latestEntry() {
    var list = loadMine();
    var active = list.filter(function (x) { return x.status !== 'cancelled'; });
    return (active.length ? active : list).slice(-1)[0] || null;
  }
  function showSaved(thanks) {
    var entry = latestEntry();
    if (!entry) { startNew(); return; }
    state.last = entry;
    state.mode = 'new';
    state.editing = null;
    state.thanks = !!thanks;
    var cancelled = entry.status === 'cancelled';
    $('result-title').textContent = cancelled ? 'この申し込みは取り消し済みです' : (thanks ? 'お申し込みありがとうございました' : '申し込み済みです');
    $('result-sub').textContent = cancelled ? 'もう一度申し込むときは、下のボタンを押してください' : '内容を直すときは「修正する」を押してください';
    $('result-sub').className = 'result-sub ' + (cancelled ? 'is-pending' : 'is-ok');
    $('mark-confirm').hidden = !cancelled; $('mark-done').hidden = cancelled;
    var c = API.cleanCounts(entry.counts);
    fillTicket({ name: entry.name, courtname: entry.courtname, grade: entry.grade, counts: c });
    $('t-no').textContent = API.no(entry.id);
    var edited = entry.updatedAt && entry.createdAt && new Date(entry.updatedAt) - new Date(entry.createdAt) > 60000;
    $('t-at').textContent = API.shortDate(edited ? entry.updatedAt : entry.createdAt) + (edited ? ' 修正' : ' 受付');
    $('t-foot').hidden = false;
    $('declare').hidden = true;
    $('send-error').hidden = true;
    $('confirm-actions').hidden = true;
    var closed = API.isClosed();
    $('done-actions').hidden = closed;               // 受付終了後は修正できない
    $('done-close').hidden = true;                   // ここからは［修正する］だけ（大きく1つ）
    $('done-actions').classList.add('is-single');
    $('done-edit-label').textContent = cancelled ? 'もう一度申し込む' : '修正する';
    $('done-new').hidden = true;
    $('result-note').textContent = closed ? '受付は終了しました。修正は役員にご相談ください。' : (thanks ? 'このページは閉じてかまいません' : 'スクリーンショットを撮っておくと安心です');
    $('cheer').hidden = cancelled;
    show('saved');
    goTop($('result'));
  }

  /* ---------- 入力に戻る（新規・修正） ---------- */
  function fillForm(it) {
    $('name').value = it ? it.name || '' : '';
    $('courtname').value = it ? it.courtname || '' : '';
    setGrade(it ? it.grade : '');
    grid.set(it ? it.counts : API.emptyCounts());
    showErrors([]);
    onInput();
  }
  function startEdit(entry) {   // 申し込み済みの内容を直す
    state.mode = 'edit';
    state.editing = { id: entry.id, token: entry.token, status: entry.status };
    $('edit-title').textContent = API.no(entry.id) + ' の内容を修正';
    $('edit-title').hidden = false;
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
    $('edit-title').hidden = true;
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
    if (API.isClosed()) show('closed');
    else if (loadMine().length) showSaved(false);
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
  function countsText(c) {
    return API.byDay(c).map(function (row) {
      return API.dayLabel(row.day) + ' ' + row.parts.map(function (p) { return p.kind.label + p.n; }).join('・');
    }).join('　');
  }
  function renderMine(step) {
    var list = loadMine(), ul = $('mine-list');
    ul.textContent = '';
    if (!list.length) { $('mine').hidden = true; return; }
    var closed = API.isClosed();
    var active = list.filter(function (x) { return x.status !== 'cancelled'; }).length;
    $('mine-title').textContent = step === 'finished' || !active ? 'この端末からの申し込み' : '申し込み済みです';
    list.slice().reverse().forEach(function (x) {
      var c = API.cleanCounts(x.counts);
      var li = document.createElement('li');
      li.className = 'mine-item' + (x.status === 'cancelled' ? ' is-cancelled' : '');
      var who = document.createElement('div'); who.className = 'mine-who';
      var b = document.createElement('b'); b.textContent = x.name + ' さん'; who.appendChild(b);
      var meta = document.createElement('p'); meta.className = 'mine-meta';
      meta.textContent = API.no(x.id) + (API.useGrade && x.grade ? '　' + API.gradeLabel(x.grade) : '') + (x.courtname ? '　' + x.courtname : '') + (x.status === 'cancelled' ? '　取り消し済み' : '');
      who.appendChild(meta);
      var detail = document.createElement('p'); detail.className = 'mine-meta'; detail.textContent = countsText(c);
      who.appendChild(detail);
      var cnt = document.createElement('p'); cnt.className = 'mine-count';
      var n = document.createElement('span'); n.className = 'num'; n.textContent = String(API.totalOf(c));
      cnt.appendChild(n); cnt.appendChild(document.createTextNode(' 枚'));
      var y = document.createElement('small'); y.className = 'num'; y.textContent = API.yen(API.amountOf(c)); cnt.appendChild(y);
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
    $('mine-new').hidden = true; // 1家庭1申し込み
    $('mine').hidden = false;
  }
  /* 開いたときに集計先へ1回問い合わせる：役員が直した分も反映し、最新の締め切り日も受け取る。
     この端末の保存領域が消えていても、集計先がクッキーの合札（60日）から申し込みを見つけて返すので、ここで覚え直す
     （LINE の中のブラウザで、しばらく開かずに保存が消えても「申し込み済み」が出る） */
  function refreshMine() {
  var list = loadMine();
  API.call('mine', { items: list.map(function (x) { return { id: x.id, token: x.token }; }) }).then(function (res) {
    var got = {};
    (res.items || []).forEach(function (it) { got[it.id] = true; upsertMine(it, it.token); });
    // 集計先から消された申し込み（テストなど）は、この端末の記録からも外す
    var kept = loadMine().filter(function (x) { return got[x.id]; });
    saveMine(kept);
    if (!kept.length) { if (state.step === 'saved' || state.step === 'home' || state.step === 'finished') startNew(); return; }
    if (!list.length && state.step === 'input' && state.mode === 'new' && !$('name').value) { home(); return; }   // クッキーから戻せた
    if (state.step === 'saved') showSaved(state.thanks);
    else if (!$('mine').hidden) renderMine($('finished').hidden ? 'home' : 'finished');
  }, function () { /* 取り直せなくても、覚えている内容で表示を続ける */ });
}

/* ---------- はじめに ---------- */
  function init() {
    grid = API.buildGrid($('grid'), 'c-', onInput);
    applyConfig();
    $('form').addEventListener('submit', toConfirm);
    ['name', 'courtname'].forEach(function (id) { $(id).addEventListener('input', onInput); });
    $('grade-seg').addEventListener('change', onInput);
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

    API.onDeadline(onDeadlineChange);

    fillForm(null);
    home();
    refreshMine();
  }
  init();
})();
