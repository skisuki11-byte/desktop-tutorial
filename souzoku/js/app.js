/* app.js — つぐいえの画面と遷移（v2）。
 *
 * 画面は Claude Design のキャンバス「つぐいえ アプリデザイン v2」（design/）を移したもの。
 * ハッシュで画面を切り替える（#/home, #/task/<id>, #/learn, #/sim, #/consult …）。
 *
 * 導線：
 *   ホーム → やること（くわしく学ぶ）→「済」にする → 次のやること
 *   やることの途中 → はかる（手取り）→ 結果 → 総合窓口に相談
 *
 * 保存の方針：
 *   - 相続開始日・やることの「済」・試算結果 → 端末の中（store.js）
 *   - 相談フォームの入力 → メモリだけ。送ったら消す。どこにも保存しない
 */
(function () {
  'use strict';

  var CFG = window.TG_CONFIG, S = window.TGStore, CALC = window.TGCalc,
      DL = window.TGDeadlines, ARTS = window.TG_ARTICLES, TASKS = window.TG_TASKS;
  var MADO = CFG.madoguchi;
  var view = document.getElementById('view');
  var tabbar = document.getElementById('tabbar');

  /* ---------- 小さな道具 ---------- */
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function comma(n) { return Math.round(n).toLocaleString('ja-JP'); }
  /* 円 → 「1,897万円」「72.6万円」「5,000円」 */
  function yen(y) {
    var neg = y < 0; y = Math.abs(Math.round(y));
    var s;
    if (y < 10000) s = comma(y) + '円';
    else {
      var man = y / 10000;
      s = man >= 100 ? comma(Math.round(man)) + '万円' : (Math.round(man * 10) / 10).toLocaleString('ja-JP') + '万円';
    }
    return (neg ? '−' : '') + s;
  }
  function manFloor(y) { return comma(Math.floor(Math.max(0, y) / 10000)); }
  function dateJP(iso) {
    if (!iso) return '';
    var p = iso.split('-').map(Number);
    return p[0] + '年' + p[1] + '月' + p[2] + '日';
  }
  function num(v) {
    var n = parseFloat(String(v).replace(/[,，\s]/g, '').replace(/[０-９．]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }));
    return isFinite(n) ? n : NaN;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function articleById(id) {
    for (var i = 0; i < ARTS.length; i++) if (ARTS[i].id === id) return ARTS[i];
    return null;
  }
  function memberById(id) {
    for (var i = 0; i < MADO.members.length; i++) if (MADO.members[i].id === id) return MADO.members[i];
    return null;
  }
  var toastTimer = null;
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2400);
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  /* ---------- 絵 ---------- */
  function svg(inner, size, extra) {
    return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + inner + '</svg>';
  }
  var PATHS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><circle cx="12" cy="15" r="2"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2M16 12v4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    doc: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h8M8 16h5"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M9 7l3 4 3-4M12 11v6M9 12.5h6M9 15h6"/>',
    bank: '<path d="M4 21h16M6 21V10M18 21V10M12 3l9 5H3z"/>',
    scale: '<path d="M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6zM8 21h8"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'
  };
  function icon(name, size) { return svg(PATHS[name] || PATHS.doc, size); }
  /* いえまる：案内役。mood = 'calm' | 'happy' */
  function buddy(size, mood) {
    var eyes = mood === 'happy'
      ? '<path d="M23 40 Q26 37 29 40" fill="none" stroke="#22213F" stroke-width="2.4" stroke-linecap="round"/><path d="M35 40 Q38 37 41 40" fill="none" stroke="#22213F" stroke-width="2.4" stroke-linecap="round"/>'
      : '<circle cx="26" cy="40" r="2.8" fill="#22213F"/><circle cx="38" cy="40" r="2.8" fill="#22213F"/>';
    var mouth = mood === 'happy'
      ? '<path d="M28 46 Q32 50.5 36 46" fill="none" stroke="#22213F" stroke-width="2.2" stroke-linecap="round"/>'
      : '<path d="M28.5 46 Q32 49.5 35.5 46" fill="none" stroke="#22213F" stroke-width="2.2" stroke-linecap="round"/>';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<path d="M10 30 L32 10 L54 30 Z" fill="#5B4FE0" stroke="#5B4FE0" stroke-width="6" stroke-linejoin="round"/>' +
      '<rect x="41" y="12" width="7" height="12" rx="2" fill="#5B4FE0"/>' +
      '<rect x="15" y="27" width="34" height="29" rx="9" fill="#FFF4CF"/>' + eyes +
      '<ellipse cx="21" cy="46" rx="3.2" ry="2" fill="#FFB8A8"/><ellipse cx="43" cy="46" rx="3.2" ry="2" fill="#FFB8A8"/>' + mouth + '</svg>';
  }
  function say(text, size) {
    return '<div class="buddy">' + buddy(size || 52) + '<div class="bubble">' + text + '</div></div>';
  }
  var AV = { fudosan: ['av-sun', 'home'], bengoshi: ['av-sky', 'scale'], zeirishi: ['av-mint', 'calc'] };
  function trio() {
    return '<div class="trio">' + MADO.members.map(function (m) {
      return '<span class="' + AV[m.id][0] + '">' + icon(AV[m.id][1], 16) + '</span>';
    }).join('') + '</div>';
  }

  var DISCLAIMER = '概算です。この試算は端末にだけ保存しています。';
  var KIND = { house: '戸建て', land: '土地だけ', condo: 'マンション' };

  /* ======================================================
     ホーム
     ====================================================== */
  var showDone = false;
  function chipFor(it, nextId) {
    if (it.done) return '<span class="chip done">済</span>';
    if (it.passed) return '<span class="chip past">過ぎました</span>';
    return '<span class="chip ' + (it.id === nextId ? 'next' : 'wait') + '">あと' + comma(it.left) + '日</span>';
  }
  function taskRow(it, nextId) {
    var t = TASKS[it.id] || {};
    if (it.done) {
      return '<a class="task-row done" href="#/task/' + it.id + '"><span class="check-dot">' + icon('check', 16) + '</span>' +
        '<span class="t"><b>' + h(it.title) + '</b></span></a>';
    }
    return '<a class="task-row' + (it.id === nextId ? ' next' : '') + '" href="#/task/' + it.id + '">' +
      '<span class="ico-box tone-' + (t.tone || 'violet') + '">' + icon(t.icon) + '</span>' +
      '<span class="t"><b>' + h(it.title) + '</b><span>' + dateJP(it.date) + '</span></span>' + chipFor(it, nextId) + '</a>';
  }
  function tilesHTML() {
    return '<div class="tiles">' +
      '<a class="tile sun" href="#/sim"><span class="ico">' + icon('calc', 24) + '</span><b>売ったら<br>いくら残る？</b><span class="s">手取りをはかる</span></a>' +
      '<a class="tile violet" href="#/consult"><span class="ico">' + icon('chat', 24) + '</span><b>専門家に<br>聞いてみる</b><span class="s">' + h(MADO.name) + '</span></a>' +
      '</div>';
  }
  function vHome() {
    var st = S.get();
    if (!st.deathISO) {
      return '' +
        say('いえまるです。手続きを、ひとつずつ案内するよ', 64) +
        '<h1 class="title">亡くなった日を教えてください</h1>' +
        '<p class="lead">期限と残り日数を出します。日付はこの端末にだけ保存します。</p>' +
        '<div class="card"><div class="field">' +
          '<label for="death">亡くなった日</label>' +
          '<input id="death" class="input" type="date" max="' + DL.todayISO() + '">' +
          '<p class="err" id="death-err" hidden>日付を入れてください。</p>' +
        '</div></div>' +
        '<button class="btn" data-act="set-death">やることを出す</button>' +
        '<div class="sec-row"><h2 class="sec">日付を入れずに使う</h2></div>' + tilesHTML() +
        '<p class="note">このアプリは無料です。<a href="#/learn/senmonka">運営のしくみ（紹介料について）</a></p>';
    }
    var s = DL.status(st.deathISO, st.done);
    var doneCount = s.items.filter(function (i) { return i.done; }).length, total = s.items.length;
    var nextId = s.next ? s.next.id : '';
    var hero = '<div class="hero">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="strong" style="font-size:16px;opacity:.92">やることの進み具合</span>' +
      '<span class="round num" style="font-size:22px;font-weight:900">' + doneCount + '<span style="font-size:16px;font-weight:700;opacity:.85"> / ' + total + ' 済み</span></span></div>' +
      '<div class="meter" aria-hidden="true"><i style="width:' + Math.round(doneCount / total * 100) + '%"></i></div>' +
      '<hr>' +
      (s.next
        ? '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px"><div style="display:flex;flex-direction:column"><span class="sub">次の期限</span><span class="strong">' + h(s.next.title) + '</span><span class="sub">' + dateJP(s.next.date) + 'まで</span></div>' +
          '<span class="days">' + (s.next.left === 0 ? '今日' : comma(s.next.left) + '<small>日</small>') + '</span></div>'
        : '<div class="strong">期限のある手続きは、ひととおり過ぎました</div>') +
      '</div>';
    var open = s.items.filter(function (i) { return !i.done; });
    var done = s.items.filter(function (i) { return i.done; });
    var bubble = s.next && s.next.left <= 60 ? '次の期限が近いよ。まずは中身を読んでみよう'
      : doneCount === total ? 'ぜんぶ済みました。本当におつかれさまでした' : 'ひとつずつ、いっしょに進めよう';
    return '' +
      '<div class="buddy">' + buddy(52) + '<div class="bubble">' + bubble + '</div>' +
        '<a class="icon-btn" href="#/settings" aria-label="設定">' + icon('gear') + '</a></div>' +
      hero + tilesHTML() +
      '<div class="sec-row"><h2 class="sec">やること</h2><span class="note">タップでくわしく</span></div>' +
      '<div class="task-list">' + open.map(function (it) { return taskRow(it, nextId); }).join('') +
        (done.length
          ? '<button class="done-head" data-act="toggle-done" aria-expanded="' + showDone + '"><span class="check-dot">' + icon('check', 14) + '</span>済んだこと ' + done.length + 'つ' + (showDone ? '（とじる）' : '（ひらく）') + '</button>' +
            (showDone ? done.map(function (it) { return taskRow(it, nextId); }).join('') : '')
          : '') +
      '</div>';
  }

  /* ======================================================
     やることの詳細（学ぶ → 済にする）
     ====================================================== */
  function taskStatus(id) {
    var st = S.get();
    if (st.deathISO) {
      var s = DL.status(st.deathISO, st.done);
      for (var i = 0; i < s.items.length; i++) if (s.items[i].id === id) return { item: s.items[i], status: s };
    }
    var list = DL.list('2000-01-01');
    for (var j = 0; j < list.length; j++) if (list[j].id === id) return { item: Object.assign({}, list[j], { date: '', left: null, done: !!st.done[id] }), status: null };
    return null;
  }
  function vTask(id) {
    var t = TASKS[id], ts = taskStatus(id);
    if (!t || !ts) return vNotFound();
    var it = ts.item;
    var chip = !it.date ? '' : chipFor(it, ts.status && ts.status.next ? ts.status.next.id : '');
    var steps = t.steps.map(function (s, i) {
      var cta = s.cta === 'sim' ? '<a class="btn sun" href="#/sim/new">いまの家で試算する →</a>'
        : s.cta === 'consult' ? '<a class="btn sun" href="#/consult">総合窓口に聞く →</a>' : '';
      return '<li><div class="rail"><span class="no">' + (i + 1) + '</span>' + (i < t.steps.length - 1 ? '<span class="line"></span>' : '') + '</div>' +
        '<div class="body"><b>' + h(s.t) + '</b><span>' + h(s.d) + '</span>' + cta + '</div></li>';
    }).join('');
    var help = '';
    if (t.help && t.help.to === 'consult') {
      help = '<div class="help"><div style="display:flex;align-items:center;gap:10px">' + trio() + '<b style="font-size:15px">' + h(t.help.text) + '</b></div>' +
        '<p>不動産・弁護士・税理士のうち、ぴったりの専門家が答えます。</p>' +
        '<a class="btn ghost" href="#/consult">' + h(MADO.name) + 'に相談する</a></div>';
    }
    return '' +
      '<a class="back" href="#/home">‹ ホーム</a>' +
      '<div class="task-hero tone-' + t.tone + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start"><span class="ico-box big">' + icon(t.icon, 30) + '</span>' + chip + '</div>' +
        '<h1 class="title">' + h(it.title) + '</h1>' +
        '<div class="meta">' + (it.date ? dateJP(it.date) + 'まで・' : '') + '読むのに' + t.min + '分</div>' +
        '<p>' + h(t.summary) + '</p></div>' +
      '<h2 class="sec">まず知っておきたいこと</h2>' +
      '<div class="fact-grid">' + t.facts.map(function (f) {
        return '<div class="fact"><b>' + h(f.big) + '<small>' + h(f.unit) + '</small></b><span>' + h(f.text) + '</span></div>';
      }).join('') + '</div>' +
      '<h2 class="sec">やることの流れ</h2><ol class="steps">' + steps + '</ol>' +
      '<h2 class="sec">用意するもの</h2><div class="pills">' + t.bring.map(function (b) { return '<span class="pill">' + h(b) + '</span>'; }).join('') + '</div>' +
      '<div class="card" style="display:flex;gap:12px;align-items:flex-start"><span class="ico-box tone-sky">' + icon('pin') + '</span>' +
        '<div style="display:flex;flex-direction:column"><span class="card-label">どこで</span><span style="font-size:16px;line-height:1.7">' + h(t.where) + '</span></div></div>' +
      '<div class="buddy" style="align-items:flex-start">' + buddy(44) + '<div class="bubble tail-l"><b>いえまるのひとこと</b><br>' + h(t.tip) + '</div></div>' +
      help +
      '<p class="note">2026年9月時点の制度です。</p>' +
      '<div class="dock"><div class="dock-in">' +
        (it.done
          ? '<div style="display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;color:var(--mint-ink);min-height:40px"><span class="check-dot" style="width:26px;height:26px">' + icon('check', 16) + '</span>「済」にしました</div>' +
            '<button class="btn ghost" data-act="undone" data-id="' + id + '">「済」を取り消す</button>'
          : '<button class="btn mint" data-act="done" data-id="' + id + '">' + icon('check', 20) + '終わったので「済」にする</button>' +
            '<span class="note center">当てはまらない場合も「済」にできます</span>') +
      '</div></div>';
  }
  function showDoneSheet(id) {
    var st = S.get();
    var s = DL.status(st.deathISO, st.done);
    var doneCount = s.items.filter(function (i) { return i.done; }).length, total = s.items.length;
    var next = s.next;
    if (!next) for (var i = 0; i < s.items.length; i++) if (!s.items[i].done) { next = s.items[i]; break; }
    var t = next ? TASKS[next.id] : null;
    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<span class="grabber" aria-hidden="true"></span>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">' + buddy(84, 'happy') +
        '<h2 id="sheet-title" class="title" style="font-size:24px">' + (next ? 'ひとつ進みました' : 'ぜんぶ済みました') + '</h2>' +
        '<p class="lead">' + (next ? 'おつかれさまでした。' : '本当におつかれさまでした。') + '</p></div>' +
      '<div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700"><span>やることの進み具合</span><span class="num">' + doneCount + ' / ' + total + ' 済み</span></div>' +
        '<div class="meter light" aria-hidden="true"><i style="width:' + Math.round(doneCount / total * 100) + '%"></i></div></div>' +
      (next
        ? '<div class="next-card"><span class="card-label" style="font-weight:700">次のやること</span><div class="row">' +
            '<span class="ico-box tone-' + t.tone + '">' + icon(t.icon) + '</span>' +
            '<span style="flex:1;display:flex;flex-direction:column"><b style="font-size:16px">' + h(next.title) + '</b><span class="card-label">' + dateJP(next.date) + 'まで</span></span>' +
            chipFor(next, next.id) + '</div></div>' +
          '<a class="btn" href="#/task/' + next.id + '" data-close>次のやることを見る</a>'
        : '<a class="btn" href="#/sim" data-close>家を売った場合の手取りをはかる</a>') +
      '<div style="display:flex;justify-content:space-between"><a class="text-btn" href="#/home" data-close style="display:inline-flex;align-items:center;text-decoration:none">ホームにもどる</a>' +
        '<button class="text-btn" data-undo="' + id + '" style="color:var(--faint)">「済」を取り消す</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var btn = wrap.querySelector('.btn'); if (btn) btn.focus();
    function close() { wrap.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') { close(); render(); } }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) { close(); render(); return; }
      if (e.target.closest('[data-close]')) { close(); return; }
      var u = e.target.closest('[data-undo]');
      if (u) { S.toggleDone(u.getAttribute('data-undo')); close(); render(); toast('「済」を取り消しました'); }
    });
  }

  /* ======================================================
     設定
     ====================================================== */
  var confirmClear = false;
  function vSettings() {
    var st = S.get();
    return '' +
      '<a class="back" href="#/home">‹ ホーム</a>' +
      '<h1 class="title">設定</h1>' +
      (S.isPersistent() ? '' : '<div class="notice coral"><p>この環境では端末に保存できません。アプリを閉じると入力が消えます。</p></div>') +
      '<div class="card" style="display:flex;flex-direction:column;gap:12px"><div class="field"><label for="death2">亡くなった日（相続開始日）</label>' +
        '<input id="death2" class="input" type="date" max="' + DL.todayISO() + '" value="' + h(st.deathISO) + '"></div>' +
        '<button class="btn small" data-act="save-death">日付を保存する</button></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card-title">バックアップ</div>' +
        '<p class="note">機種変更に備えて、試算結果とやることの記録をファイルに書き出せます。相談の内容は保存していないので含まれません。</p>' +
        '<button class="btn ghost" data-act="export">ファイルに書き出す</button>' +
        '<label class="btn ghost" for="import-file" style="cursor:pointer">ファイルから読み込む</label>' +
        '<input id="import-file" type="file" accept="application/json,.json" class="sr-only">' +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card-title">すべて消す</div>' +
        '<p class="note">亡くなった日、やることの記録、試算結果をこの端末から消します。元に戻せません。</p>' +
        (confirmClear
          ? '<button class="btn danger" data-act="clear-yes">本当に消す</button><button class="btn ghost" data-act="clear-no">やめる</button>'
          : '<button class="btn danger" data-act="clear">すべて消す</button>') +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:6px">' +
        '<div class="card-title">このアプリについて</div>' +
        '<p class="note">つぐいえは無料です。運営者（' + h(CFG.operator) + '）は' + h(MADO.name) + 'をご紹介するだけで、仲介や交渉はしません。不動産の売買が成約したときだけ、提携の不動産会社から紹介料を受け取ります（あなたの支払いは増えません）。弁護士・税理士からは受け取りません。</p>' +
        '<a href="privacy.html">プライバシーポリシー</a>' +
      '</div>';
  }

  /* ======================================================
     まなぶ
     ====================================================== */
  var learnFilter = 'now';
  function vLearn() {
    var st = S.get(), stg = DL.stage(st.deathISO);
    var order = DL.list(st.deathISO || '2000-01-01');
    var guides = order.map(function (it) {
      var t = TASKS[it.id];
      return '<a class="art-row" href="#/task/' + it.id + '"><span class="ico-box tone-' + t.tone + '">' + icon(t.icon) + '</span>' +
        '<span class="t"><b>' + h(it.title) + '</b><span>' + (st.done[it.id] ? '済・' : '') + '読むのに' + t.min + '分</span></span></a>';
    }).join('');
    var list = ARTS;
    if (learnFilter === 'now' && stg !== 'none') list = ARTS.filter(function (a) { return a.stages.indexOf(stg) >= 0; });
    var rows = list.map(function (a) {
      return '<a class="art-row" href="#/learn/' + a.id + '"><span class="ico-box tone-violet">' + icon('book') + '</span>' +
        '<span class="t"><b>' + h(a.title) + '</b><span>' + h(a.tag) + '・' + a.min + '分</span></span></a>';
    }).join('');
    return '' +
      '<h1 class="title">まなぶ</h1>' +
      say('やることごとに、手順と用意するものをまとめたよ', 48) +
      '<h2 class="sec">やることガイド</h2>' +
      '<div class="card flat">' + guides + '</div>' +
      '<h2 class="sec">知っておきたいこと</h2>' +
      '<div class="seg" role="tablist" aria-label="記事の絞り込み">' +
        '<button role="tab" data-act="filter" data-v="now" aria-selected="' + (learnFilter === 'now') + '">いまの時期</button>' +
        '<button role="tab" data-act="filter" data-v="all" aria-selected="' + (learnFilter === 'all') + '">すべて（' + ARTS.length + '本）</button>' +
      '</div>' +
      (learnFilter === 'now' && stg === 'none' ? '<p class="note">ホームで亡くなった日を入れると、いまの時期に合う記事にしぼります。</p>' : '') +
      '<div class="card flat">' + rows + '</div>' +
      '<p class="note">記事は一般的な情報です。あなたの場合の税額や法的な判断は、専門家にご確認ください。</p>';
  }
  function vArticle(id) {
    var a = articleById(id);
    if (!a) return vNotFound();
    var cta = '';
    if (a.cta === 'sim') cta = '<a class="btn" href="#/sim/new">手取りを試算する</a>';
    if (a.cta === 'consult') cta = '<a class="btn" href="#/consult">' + h(MADO.name) + 'に相談する</a>';
    return '' +
      '<a class="back" href="#/learn">‹ まなぶ</a>' +
      '<div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">' + h(a.tag) + '・' + a.min + '分で読めます</span><h1 class="title">' + h(a.title) + '</h1></div>' +
      '<article class="article">' + a.body + '</article>' +
      '<p class="note">2026年9月時点の制度にもとづく一般的な説明です。制度は改正されることがあります。</p>' + cta;
  }

  /* ======================================================
     はかる
     ====================================================== */
  function vSimList() {
    var ests = S.get().estimates;
    var list = ests.map(function (e) {
      var r = CALC.estimate(e.input);
      return '<a class="task-row" href="#/sim/' + h(e.id) + '"><span class="ico-box tone-sun">' + icon('house') + '</span>' +
        '<span class="t"><b>' + h(e.name) + '</b><span>' + dateJP(e.createdISO) + '・' + h(KIND[e.input.kind] || '') + '</span></span>' +
        '<span style="text-align:right"><span class="card-label">手取り</span><br><b class="round num" style="font-size:18px">' + manFloor(r.main.net) + '万円</b></span></a>';
    }).join('');
    return '' +
      '<h1 class="title">はかる</h1>' +
      '<div class="result" style="gap:10px">' +
        '<span class="round" style="font-size:24px;font-weight:900;line-height:1.35">売ったら、<br>いくら残る？</span>' +
        '<span style="font-size:16px;line-height:1.7">6つの質問で、税金や特例まで入れた手取りがわかります。</span>' +
        '<a class="btn" href="#/sim/new" style="margin-top:6px">試算をはじめる</a></div>' +
      '<p class="note">結果はこの端末にだけ保存します。</p>' +
      (list ? '<h2 class="sec">保存した試算</h2><div class="task-list">' + list + '</div>' : '');
  }

  var draft = null, simStep = 0, simErr = '';
  function newDraft() {
    return { name: '', kind: 'house', price: '', acqKnown: '', acqPrice: '', acqYear: '', acqYearUnknown: false,
      heirs: '2', vacant: null, builtBefore1981: null, livedAlone: null, renovateOrDemolish: null,
      otherCost: '', holdTaxYear: '', holdOtherYear: '' };
  }
  function draftFrom(e) {
    var i = e.input;
    function man(y) { return y ? String(Math.round(y / 10000 * 10) / 10) : ''; }
    return { name: e.name, kind: i.kind, price: man(i.price), acqKnown: i.acqKnown ? 'yes' : 'no', acqPrice: man(i.acqPrice),
      acqYear: i.acqYear ? String(i.acqYear) : '', acqYearUnknown: !i.acqYear, heirs: String(i.heirs),
      vacant: i.vacant, builtBefore1981: i.kind === 'house' ? i.builtBefore1981 : null, livedAlone: i.kind === 'house' ? i.livedAlone : null,
      renovateOrDemolish: i.kind === 'house' ? i.renovateOrDemolish : null,
      otherCost: man(i.otherCost), holdTaxYear: man(i.holdTaxYear), holdOtherYear: man(i.holdOtherYear) };
  }
  var SIM_STEPS = [
    { id: 'basic', q: 'どんな不動産？', say: 'まずは、どんな家か教えてね' },
    { id: 'price', q: 'いくらで<br>売れそう？', say: 'だいたいで大丈夫。あとで直せるよ' },
    { id: 'acq', q: '親が買ったときのこと', say: 'わからなくても計算できるよ' },
    { id: 'heirs', q: '何人で受け継いだ？', say: 'いっしょに相続した人の数だよ' },
    { id: 'cond', q: 'いまの状態は？', say: '空き家特例が使えるか、見てみよう' },
    { id: 'cost', q: '費用のこと', say: 'わかるところだけで大丈夫' }
  ];
  function yn(key, q) {
    var v = draft[key];
    function b(val, label) {
      return '<button type="button" data-act="yn" data-k="' + key + '" data-v="' + val + '" aria-pressed="' + (v === val) + '">' + label + '</button>';
    }
    return '<div class="yn" role="group" aria-label="' + h(q) + '"><div class="yn-q">' + q + '</div><div class="yn-btns">' +
      b(true, 'はい') + b(false, 'いいえ') + b('unk', 'わからない') + '</div></div>';
  }
  function vSimNew() {
    if (!draft) { draft = newDraft(); simStep = 0; }
    var step = SIM_STEPS[simStep], body = '';
    if (step.id === 'basic') {
      body = '<div class="field"><label for="s-name">呼び名 <span class="tag-opt">任意</span></label>' +
        '<input id="s-name" class="input" data-bind="name" maxlength="30" placeholder="例：静岡の実家" value="' + h(draft.name) + '"></div>' +
        '<fieldset><legend class="label">種類</legend><div class="choices">' +
        ['house', 'land', 'condo'].map(function (k) {
          return '<label class="choice"><input type="radio" name="s-kind" data-bind="kind" value="' + k + '"' + (draft.kind === k ? ' checked' : '') + '>' + KIND[k] + '</label>';
        }).join('') + '</div></fieldset>';
    } else if (step.id === 'price') {
      body = '<div class="field"><label for="s-price">売れそうな価格</label>' +
        '<div class="bigbox"><input id="s-price" data-bind="price" inputmode="decimal" placeholder="2000" value="' + h(draft.price) + '"><span>万円</span></div>' +
        '<div class="quick">' + [500, 1000, 2000, 3000].map(function (v) {
          return '<button type="button" class="chipbtn" data-act="quick" data-v="' + v + '" aria-pressed="' + (String(num(draft.price)) === String(v)) + '">' + comma(v) + '万</button>';
        }).join('') + '</div></div>' +
        '<div class="notice sun">わからなければ、国土交通省の「不動産情報ライブラリ」で近所の売れた値段を調べられます。</div>';
    } else if (step.id === 'acq') {
      body = '<fieldset><legend class="label">買ったときの値段を知っている？</legend><div class="choices">' +
          '<label class="choice"><input type="radio" name="s-acq" data-bind="acqKnown" value="yes"' + (draft.acqKnown === 'yes' ? ' checked' : '') + '>知っている</label>' +
          '<label class="choice"><input type="radio" name="s-acq" data-bind="acqKnown" value="no"' + (draft.acqKnown === 'no' ? ' checked' : '') + '>わからない（売る値段の5%で計算）</label>' +
        '</div></fieldset>' +
        '<div class="field"' + (draft.acqKnown === 'yes' ? '' : ' hidden') + ' id="acq-price-field"><label for="s-acqp">買ったときの値段（土地と建物の合計）</label>' +
          '<div class="suffix"><input id="s-acqp" class="input" data-bind="acqPrice" inputmode="decimal" value="' + h(draft.acqPrice) + '"><span>万円</span></div></div>' +
        '<div class="field"><label for="s-acqy">買った年（西暦）</label>' +
          '<div class="suffix"><input id="s-acqy" class="input" data-bind="acqYear" inputmode="numeric" maxlength="4" placeholder="1985" value="' + h(draft.acqYear) + '"' + (draft.acqYearUnknown ? ' disabled' : '') + '><span>年</span></div>' +
          '<label class="check"><input type="checkbox" data-bind="acqYearUnknown"' + (draft.acqYearUnknown ? ' checked' : '') + '>わからない（かなり前に買った）</label>' +
          '<p class="hint">親が買った日から数えて5年を超えると、税金が安くなります。</p></div>';
    } else if (step.id === 'heirs') {
      body = '<div class="quick" role="radiogroup" aria-label="相続した人の数">' + [1, 2, 3, 4, 5, 6].map(function (n) {
          return '<button type="button" class="chipbtn" role="radio" style="min-width:64px;justify-content:center;font-size:16px" data-act="heirs" data-v="' + n + '" aria-checked="' + (String(draft.heirs) === String(n)) + '" aria-pressed="' + (String(draft.heirs) === String(n)) + '">' + n + '人' + (n === 6 ? '以上' : '') + '</button>';
        }).join('') + '</div>' +
        '<p class="hint">等分で計算します。</p>';
    } else if (step.id === 'cond') {
      body = '<div class="card flat">' +
          yn('vacant', '相続してから、住んだり貸したり事業に使ったりしていない') +
          (draft.kind === 'house'
            ? yn('builtBefore1981', '1981年（昭和56年）5月31日以前に建てた') +
              yn('livedAlone', '亡くなる直前、ほかに住んでいる人はいなかった') +
              yn('renovateOrDemolish', '耐震改修か取り壊しをする（買主がする場合も）')
            : '') +
        '</div>' +
        (draft.kind !== 'house' ? '<p class="note">空き家特例は戸建てだけが対象です。</p>' : '<p class="note">「わからない」は、特例なしで計算します。</p>');
    } else if (step.id === 'cost') {
      body = '<div class="field"><label for="s-other">売るときのその他の費用 <span class="tag-opt">任意</span></label>' +
          '<div class="suffix"><input id="s-other" class="input" data-bind="otherCost" inputmode="decimal" placeholder="0" value="' + h(draft.otherCost) + '"><span>万円</span></div>' +
          '<p class="hint">片付け・解体など。仲介手数料は自動で入ります。</p></div>' +
        '<h2 class="sec" style="font-size:16px;margin-top:6px">持ち続けた場合（1年あたり）</h2>' +
        '<div class="grid-2">' +
          '<div class="field"><label for="s-htax">固定資産税など</label><div class="suffix"><input id="s-htax" class="input" data-bind="holdTaxYear" inputmode="decimal" placeholder="0" value="' + h(draft.holdTaxYear) + '"><span>万円</span></div></div>' +
          '<div class="field"><label for="s-hother">管理・保険など</label><div class="suffix"><input id="s-hother" class="input" data-bind="holdOtherYear" inputmode="decimal" placeholder="0" value="' + h(draft.holdOtherYear) + '"><span>万円</span></div></div>' +
        '</div>';
    }
    var last = simStep === SIM_STEPS.length - 1;
    var dots = '<div class="dots" aria-hidden="true" style="grid-template-columns:repeat(' + SIM_STEPS.length + ',minmax(0,1fr))">' +
      SIM_STEPS.map(function (_, i) { return '<span' + (i <= simStep ? ' class="on"' : '') + '></span>'; }).join('') + '</div>';
    return '' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><a class="back" href="#/sim">× やめる</a><span class="step num" style="color:var(--faint)">' + (simStep + 1) + ' / ' + SIM_STEPS.length + '</span></div>' +
      dots + say(step.say, 56) +
      '<h1 class="title" style="font-size:28px">' + step.q + '</h1>' +
      body +
      (simErr ? '<p class="err" role="alert">' + h(simErr) + '</p>' : '') +
      '<div class="btn-col" style="margin-top:8px">' +
        '<button class="btn" data-act="sim-next">' + (last ? '結果を見る' : '次へ') + '</button>' +
        (simStep > 0 ? '<button class="btn ghost" data-act="sim-back">もどる</button>' : '') +
      '</div>';
  }
  function simValidate() {
    var step = SIM_STEPS[simStep].id;
    if (step === 'price') {
      var p = num(draft.price);
      if (!(p > 0)) return '売れそうな価格を万円で入れてください。';
      if (p > 1000000) return '価格が大きすぎます。万円の単位で入れてください（例：2000）。';
    }
    if (step === 'acq') {
      if (!draft.acqKnown) return '買ったときの値段を知っているか、選んでください。';
      if (draft.acqKnown === 'yes' && !(num(draft.acqPrice) >= 0)) return '買ったときの値段を入れてください。';
      if (!draft.acqYearUnknown) {
        var y = num(draft.acqYear), now = new Date().getFullYear();
        if (!(y >= 1900 && y <= now)) return '買った年を西暦で入れるか、「わからない」を選んでください。';
      }
    }
    if (step === 'cost') {
      var bad = ['otherCost', 'holdTaxYear', 'holdOtherYear'].some(function (k) { return draft[k] !== '' && !(num(draft[k]) >= 0); });
      if (bad) return '費用は数字（万円）で入れてください。わからなければ空のままで大丈夫です。';
    }
    return '';
  }
  function simFinish() {
    var d = draft, st = S.get();
    function manToYen(v) { var n = num(v); return n > 0 ? Math.round(n * 10000) : 0; }
    var input = {
      kind: d.kind, price: manToYen(d.price), acqKnown: d.acqKnown === 'yes', acqPrice: manToYen(d.acqPrice),
      acqYear: d.acqYearUnknown ? 0 : (num(d.acqYear) | 0), heirs: Number(d.heirs) || 1,
      vacant: d.vacant === true, unusedAfter: d.vacant === true,
      builtBefore1981: d.builtBefore1981 === true, livedAlone: d.livedAlone === true, renovateOrDemolish: d.renovateOrDemolish === true,
      otherCost: manToYen(d.otherCost), holdTaxYear: manToYen(d.holdTaxYear), holdOtherYear: manToYen(d.holdOtherYear),
      deathISO: st.deathISO, saleISO: DL.todayISO()
    };
    var e = { id: uid(), name: d.name.trim() || '相続した' + (d.kind === 'land' ? '土地' : KIND[d.kind]), createdISO: DL.todayISO(), input: input };
    S.addEstimate(e);
    draft = null; simStep = 0; simErr = '';
    go('#/sim/' + e.id);
  }

  var confirmDelEst = false;
  function vSimResult(id) {
    var e = S.getEstimate(id);
    if (!e) return vNotFound();
    var r = CALC.estimate(e.input), m = r.main, inp = e.input;
    var total = Math.max(1, m.price), cost = m.fee + m.stamp + m.other;
    var pNet = Math.max(0, m.net) / total * 100, pCost = cost / total * 100, pTax = m.tax / total * 100;
    var html = '' +
      '<a class="back" href="#/sim">‹ はかる</a>' +
      '<div style="display:flex;flex-direction:column;gap:2px"><span class="eyebrow">' + h(e.name) + '・' + dateJP(e.createdISO) + '</span><h1 class="title">試算の結果</h1></div>' +
      '<div class="result"><span class="k">売ったときの手取り' + (r.exemptionApplied ? '（空き家特例あり）' : '') + '</span>' +
        '<span class="v">' + manFloor(m.net) + '<small>万円</small></span>' +
        '<span class="r">幅 ' + manFloor(r.rangeLow) + '万〜' + manFloor(r.rangeHigh) + '万円（売却価格±10%）</span></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:8px">' +
        '<b style="font-size:15px">' + yen(m.price) + 'のうちわけ</b>' +
        '<div class="stack" aria-hidden="true"><i style="width:' + pNet + '%;background:var(--violet)"></i><i style="width:' + pCost + '%;background:var(--sky)"></i><i style="width:' + pTax + '%;background:var(--coral)"></i></div>' +
        '<div class="kv"><span><i class="sw" style="background:var(--violet)"></i>手取り</span><b>' + yen(m.net) + '</b></div>' +
        '<div class="kv"><span><i class="sw" style="background:var(--sky)"></i>仲介手数料（上限）</span><b>' + yen(m.fee) + '</b></div>' +
        '<div class="kv"><span><i class="sw" style="background:var(--sky)"></i>印紙税' + (m.other ? '・その他' : '') + '</span><b>' + yen(m.stamp + m.other) + '</b></div>' +
        '<div class="kv"><span><i class="sw" style="background:var(--coral)"></i>税金（' + (m.longTerm ? '長期 20.315%' : '短期 39.63%') + '）</span><b>' + (m.tax ? yen(m.tax) : '0円') + '</b></div>' +
        (inp.heirs > 1 ? '<div class="kv total"><span>1人あたり（' + inp.heirs + '人で等分）</span><b>' + yen(m.perHeir) + '</b></div>' : '') +
        (m.acqRough ? '<div class="kv sub"><span>買った値段は、売る値段の5%（' + yen(m.acqUsed) + '）として計算しました</span></div>' : '') +
        (inp.vacant && inp.price <= 8000000 ? '<div class="kv sub"><span>800万円以下の空き家等は、仲介手数料の上限が33万円です（事前の合意が前提）</span></div>' : '') +
      '</div>';
    if (r.exemptionApplied) {
      var ratio = r.without.net / Math.max(1, m.net) * 100;
      html += '<div class="card" style="display:flex;flex-direction:column;gap:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">空き家特例で変わる手取り</b><span class="badge">差 ' + manFloor(r.without.tax - m.tax) + '万円</span></div>' +
        '<div class="cmp"><div class="row"><span>特例あり</span><b class="num">' + manFloor(m.net) + '万円</b></div><div class="bar" style="background:var(--violet);width:100%"></div></div>' +
        '<div class="cmp"><div class="row"><span>特例なし</span><b class="num">' + manFloor(r.without.net) + '万円</b></div><div class="bar" style="background:var(--coral);width:' + Math.max(4, ratio) + '%"></div></div>' +
        '<a href="#/task/akiya" style="font-size:15px;font-weight:700">空き家特例の要件を読む →</a></div>';
    } else if (inp.kind === 'house' && r.without.gain > 0) {
      html += '<div class="card" style="display:flex;flex-direction:column;gap:8px"><b style="font-size:15px">空き家特例は、まだ使えるか確かめられていません</b>' +
        '<p class="note">あと、これがそろえば使えます。</p>' +
        '<ul class="reasons">' + r.akiya.reasons.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul>' +
        '<a href="#/task/akiya" style="font-size:15px;font-weight:700">空き家特例のやることを読む →</a></div>';
    }
    if (r.holdYear > 0) {
      html += '<div class="card" style="display:flex;align-items:center;gap:14px"><span class="ico-box big tone-coral" style="width:48px;height:48px">' + icon('clock', 24) + '</span>' +
        '<div style="display:flex;flex-direction:column"><span class="card-label">売らずに持ち続けると</span>' +
        '<span class="round num" style="font-size:22px;font-weight:900">10年で約' + manFloor(r.hold10) + '万円</span>' +
        '<span class="note">固定資産税・管理など 年' + yen(r.holdYear) + '（修繕費は含みません）</span></div></div>';
    }
    html += '<div class="btn-col"><button class="btn" data-act="consult-with" data-id="' + h(e.id) + '">この結果を添えて専門家に聞く</button>' +
      '<button class="btn ghost" data-act="sim-again" data-id="' + h(e.id) + '">条件を変えてもう一度</button></div>' +
      '<p class="note">' + DISCLAIMER + '</p>' +
      (confirmDelEst
        ? '<div class="btn-col"><button class="btn danger" data-act="del-est-yes" data-id="' + h(e.id) + '">本当に削除する</button><button class="btn ghost" data-act="del-est-no">やめる</button></div>'
        : '<button class="btn danger" data-act="del-est">この試算を削除</button>');
    return html;
  }
  function estimateSummary(e) {
    var r = CALC.estimate(e.input);
    return e.name + '（' + (KIND[e.input.kind] || '') + '）／売却想定 ' + yen(e.input.price) +
      '／手取り 約' + manFloor(r.main.net) + '万円（' + (r.exemptionApplied ? '空き家特例あり' : '空き家特例なし') + '）' +
      '／相続人 ' + e.input.heirs + '人／' + dateJP(e.createdISO) + 'の試算';
  }

  /* ======================================================
     そうだん（総合窓口 → 入力 → 確認 → 完了）
     入力はメモリにだけ持ち、送ったら消す。
     ====================================================== */
  var cs;
  function resetConsult() {
    cs = { name: '', email: '', area: '', topics: {}, body: '', attachId: '', agree: false, website: '',
      sending: false, error: '', errors: {}, ref: '', sentEmail: '', sentText: '', viaMail: false, mailHref: '' };
  }
  resetConsult();
  function topicsChosen() { return CFG.topics.filter(function (t) { return cs.topics[t.label]; }); }
  function whoOf(topics) {
    var seen = {};
    topics.forEach(function (t) { if (t.who) seen[t.who] = true; });
    return MADO.members.filter(function (m) { return seen[m.id]; });
  }

  function vConsult() {
    var members = MADO.members.map(function (m) {
      return '<div class="member"><span class="av ' + AV[m.id][0] + '">' + icon(AV[m.id][1], 26) + '</span><b>' + h(m.role) + '</b>' +
        '<span>' + (m.sub ? h(m.sub) + '<br>' : '') + h(m.topics) + '</span></div>';
    }).join('');
    return '' +
      '<h1 class="title">そうだん</h1>' +
      '<div class="mado"><span class="free">無料</span><h2>' + h(MADO.name) + '</h2>' +
        '<p>どこに聞けばいいか分からなくても大丈夫。ぴったりの専門家が答えます。</p>' +
        '<div class="members">' + members + '</div></div>' +
      '<div class="perks"><div class="perk"><b>電話なし</b><span>連絡はメールだけ</span></div>' +
        '<div class="perk"><b>匿名OK</b><span>名前は任意</span></div>' +
        '<div class="perk"><b>残さない</b><span>アプリに保存なし</span></div></div>' +
      '<h2 class="sec">相談の流れ</h2>' +
      '<ol class="card flow"><li><span class="n">1</span>アプリから相談を送る</li>' +
        '<li><span class="n">2</span>窓口が内容を見て、担当の専門家を決める</li>' +
        '<li><span class="n">3</span>後日、専門家からメールで返事が届く</li></ol>' +
      '<div class="notice dashed"><b style="color:var(--ink)">お金のこと</b>' +
        '<span>相談は無料。紹介料は、不動産の売買が成約したときだけ不動産会社から受け取ります（あなたの負担なし）。弁護士・税理士からは受け取りません。運営者は仲介しません。</span></div>' +
      '<a class="btn" href="#/consult/form">相談をはじめる</a>';
  }

  function vConsultForm() {
    var ests = S.get().estimates, er = cs.errors;
    var attach = '';
    var att = cs.attachId ? S.getEstimate(cs.attachId) : null;
    if (att) {
      var r = CALC.estimate(att.input);
      attach = '<label class="attach" for="c-attach1"><input id="c-attach1" type="checkbox" checked data-act-change="attach1">' +
        '<span class="t"><b>試算結果を添える</b><span>' + h(att.name) + '・手取り ' + manFloor(r.main.net) + '万円</span></span></label>';
    } else if (ests.length) {
      attach = '<div class="field"><label for="c-attach">試算結果を添える <span class="tag-opt">任意</span></label>' +
        '<select id="c-attach" class="select" data-cbind="attachId"><option value="">添えない</option>' +
        ests.map(function (e) {
          var rr = CALC.estimate(e.input);
          return '<option value="' + h(e.id) + '">' + h(e.name) + '・手取り' + manFloor(rr.main.net) + '万円</option>';
        }).join('') + '</select></div>';
    }
    return '' +
      '<a class="back" href="#/consult">‹ ' + h(MADO.name) + '</a>' +
      '<div style="display:flex;flex-direction:column;gap:4px"><span class="step">1 / 2　入力</span><h1 class="title">なにを聞きたい？</h1></div>' +
      '<fieldset><legend class="label">あてはまるものを選ぶ <span class="tag-req">必須</span></legend>' +
        '<div class="chips">' + CFG.topics.map(function (t) {
          return '<button type="button" class="chipbtn" data-act="topic" data-v="' + h(t.label) + '" aria-pressed="' + !!cs.topics[t.label] + '">' +
            '<span class="dot ' + (t.who || 'none') + '"></span>' + h(t.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="legend" style="margin-top:10px"><span><i class="dot fudosan"></i>おもに不動産</span><span><i class="dot bengoshi"></i>おもに弁護士</span><span><i class="dot zeirishi"></i>おもに税理士</span></div>' +
        (er.body ? '<p class="err">' + h(er.body) + '</p>' : '') +
      '</fieldset>' +
      '<div class="field"><label for="c-body">くわしく <span class="tag-opt">任意・1,000字まで</span></label>' +
        '<textarea id="c-body" class="textarea" data-cbind="body" maxlength="1000" rows="4">' + h(cs.body) + '</textarea></div>' +
      '<div class="field"><label for="c-mail">返事を受け取るメール <span class="tag-req">必須</span></label>' +
        '<input id="c-mail" class="input" type="email" data-cbind="email" maxlength="120" autocomplete="email" inputmode="email" value="' + h(cs.email) + '"' + (er.email ? ' aria-invalid="true" aria-describedby="e-mail"' : '') + '>' +
        (er.email ? '<p class="err" id="e-mail">' + h(er.email) + '</p>' : '') +
        '<p class="hint">返事を送るために使います。</p></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label for="c-name">お名前 <span class="tag-opt">任意</span></label><input id="c-name" class="input" data-cbind="name" maxlength="40" autocomplete="nickname" placeholder="ニックネーム可" value="' + h(cs.name) + '"></div>' +
        '<div class="field"><label for="c-area">物件の場所 <span class="tag-opt">任意</span></label><input id="c-area" class="input" data-cbind="area" maxlength="40" placeholder="市区町村まで" value="' + h(cs.area) + '"></div>' +
      '</div>' +
      attach +
      '<div class="hp" aria-hidden="true"><label for="c-web">ウェブサイト</label><input id="c-web" tabindex="-1" autocomplete="off" data-cbind="website"></div>' +
      '<button class="btn" data-act="to-confirm" style="margin-top:4px">入力内容を確認する</button>' +
      '<p class="note center">まだ送信されません</p>';
  }
  function consultValidate() {
    var e = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cs.email.trim())) e.email = 'メールアドレスを正しく入れてください（例：name@example.jp）。';
    if (!topicsChosen().length && !cs.body.trim()) e.body = '聞きたいことを選ぶか、くわしく書いてください。';
    cs.errors = e;
    return !Object.keys(e).length;
  }

  function vConsultConfirm() {
    if (!cs.email) { go('#/consult'); return ''; }
    var est = cs.attachId ? S.getEstimate(cs.attachId) : null;
    function row(k, v, cls) {
      return '<div class="review-row"><div class="review-body"><span class="k">' + k + '</span><span class="v' + (cls ? ' ' + cls : '') + '">' + v + '</span>' +
        (cls === 'mail' ? '<span class="err" style="font-size:16px">打ち間違いがあると返事が届きません</span>' : '') +
        '</div><a class="link-btn" href="#/consult/form">修正</a></div>';
    }
    var tp = topicsChosen().map(function (t) { return t.label; }).join('／');
    var who = whoOf(topicsChosen());
    return '' +
      '<a class="back" href="#/consult/form">‹ 入力にもどる</a>' +
      '<div style="display:flex;flex-direction:column;gap:4px"><span class="step">2 / 2　送信前の確認</span><h1 class="title">この内容で送ります</h1><p class="lead" style="font-size:16px">まだ送信されていません。</p></div>' +
      '<div class="card flat">' +
        row('返事を受け取るメール', h(cs.email.trim()), 'mail') +
        row('聞きたいこと', h([tp, cs.body.trim()].filter(Boolean).join('\n'))) +
        row('お名前・物件の場所', h((cs.name.trim() || '匿名') + '・' + (cs.area.trim() || '未記入'))) +
        row('添える試算', est ? h(estimateSummary(est)) : '添えない') +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="card-label">送信先</span>' +
        '<div class="dest"><span class="ico-box" style="background:var(--violet);color:var(--on-violet)">' + icon('chat') + '</span>' +
        '<span class="t"><b>' + h(MADO.name) + '</b><span>運営：' + h(MADO.org) + '</span></span></div>' +
        '<p class="note">内容に合わせて、不動産・弁護士・税理士に共有されます' +
          (who.length ? '（今回はおもに' + who.map(function (m) { return m.role; }).join('・') + '）' : '') + '。</p>' +
        '<p class="note">紹介料：不動産の売買が成約したときだけ、運営者が不動産会社から受け取ります（あなたの負担なし）。</p></div>' +
      '<div class="notice violet"><div class="notice-title">送ったあとのこと</div>' +
        '<div class="after-row"><span class="num-dot">1</span><span>後日、担当の専門家から<b>メールで返事が届きます</b>。</span></div>' +
        '<div class="after-row"><span class="num-dot">2</span><span><b>自動返信メールは届きません</b>。</span></div></div>' +
      '<label class="check" for="c-agree"><input id="c-agree" type="checkbox" data-act-change="agree"' + (cs.agree ? ' checked' : '') + '>' +
        '<span>' + h(MADO.name) + 'と、提携の専門家に内容を送ることに同意します（<a href="privacy.html">プライバシーポリシー</a>）</span></label>' +
      (cs.error ? '<div class="notice coral" role="alert"><div class="notice-title">送信できませんでした</div><p>' + h(cs.error) + '</p>' +
        (MADO.fallbackEmail ? '<a class="btn ghost" href="' + h(mailtoHref()) + '">メールアプリで送る</a>' : '') + '</div>' : '') +
      '<div class="btn-col">' +
        '<button class="btn" id="send-btn" data-act="send"' + (cs.agree && !cs.sending ? '' : ' disabled') + '>' + (cs.sending ? '送信中…' : CFG.endpoint ? 'この内容で送信する' : 'メールアプリで送信する') + '</button>' +
        (CFG.endpoint ? '' : '<p class="note center">メールアプリが開きます。宛先と本文は入力済みです。</p>') +
        '<a class="btn ghost" href="#/consult/form">入力にもどって直す</a>' +
      '</div>';
  }

  function makeRef() {
    var d = new Date();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return 'TG-' + String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
      String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }
  function consultText(ref) {
    var est = cs.attachId ? S.getEstimate(cs.attachId) : null;
    var tp = topicsChosen();
    return [
      '受付番号：' + ref,
      '送信先：' + MADO.name,
      'お名前：' + (cs.name.trim() || '匿名'),
      'メールアドレス：' + cs.email.trim(),
      '物件の場所：' + (cs.area.trim() || '未記入'),
      '聞きたいこと：' + (tp.map(function (t) { return t.label; }).join('／') || 'なし'),
      '',
      cs.body.trim() || '（くわしい内容なし）',
      '',
      '添える試算：' + (est ? estimateSummary(est) : 'なし')
    ].join('\n');
  }
  function mailtoHref() {
    var ref = cs.ref || makeRef();
    return 'mailto:' + MADO.fallbackEmail +
      '?subject=' + encodeURIComponent('【つぐいえ相談 ' + ref + '】' + (cs.area.trim() || 'エリア未記入')) +
      '&body=' + encodeURIComponent(consultText(ref));
  }

  function send() {
    if (cs.sending) return;
    if (!CFG.endpoint) {
      if (MADO.fallbackEmail) { sendViaMail(); return; }
      cs.error = '送信先がまだ設定されていません（運営者の設定待ちです）。時間をおいてお試しください。';
      render(); return;
    }
    var ref = makeRef();
    var est = cs.attachId ? S.getEstimate(cs.attachId) : null;
    var tp = topicsChosen();
    var payload = {
      app: 'tsuguie', v: 2, ref: ref,
      topics: tp.map(function (t) { return t.label; }),
      who: whoOf(tp).map(function (m) { return m.role; }),
      name: cs.name.trim(), email: cs.email.trim(), area: cs.area.trim(), body: cs.body.trim(),
      estimate: est ? estimateSummary(est) : '', website: cs.website
    };
    cs.sending = true; cs.error = ''; render();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    fetch(CFG.endpoint, {
      method: 'POST',
      // text/plain にして、ブラウザの事前確認（CORS preflight）を避ける
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'bad_response' }; });
    }).then(function (j) {
      clearTimeout(timer);
      if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'failed');
      cs.sentText = consultText(ref);
      cs.ref = ref; cs.sentEmail = cs.email.trim();
      // 送ったら入力は消す（完了画面に出す分だけ残す）
      cs.name = ''; cs.email = ''; cs.area = ''; cs.body = ''; cs.topics = {}; cs.attachId = '';
      cs.sending = false;
      go('#/consult/done');
    }).catch(function (err) {
      clearTimeout(timer);
      cs.sending = false;
      var code = err && err.message;
      cs.error = code === 'busy' ? '送信が混み合っています。少し時間をおいてから、もう一度お試しください。'
        : code === 'email' ? 'メールアドレスの形式を確認してください。'
        : '通信できませんでした。電波の良いところで、もう一度「この内容で送信する」を押してください。';
      render();
    });
  }

  /* 中継（GAS）が未設定のあいだは、メールアプリで窓口あてに送ってもらう */
  function sendViaMail() {
    cs.ref = makeRef();
    cs.mailHref = mailtoHref();
    cs.sentText = consultText(cs.ref);
    cs.sentEmail = cs.email.trim();
    cs.viaMail = true;
    cs.name = ''; cs.email = ''; cs.area = ''; cs.body = ''; cs.topics = {}; cs.attachId = '';
    var href = cs.mailHref;
    go('#/consult/done');
    setTimeout(function () { location.href = href; }, 60);
  }

  function vConsultDone() {
    if (!cs.ref) { go('#/consult'); return ''; }
    if (cs.viaMail) {
      return '' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-top:12px">' + buddy(88) +
          '<h1 class="title">あと少しです</h1>' +
          '<div class="ref"><span>受付番号</span><b>' + h(cs.ref) + '</b></div></div>' +
        '<div class="notice violet"><div class="notice-title">メールアプリで「送信」を押してください</div>' +
          '<p>宛先と本文は入力済みです。送信すると、' + h(MADO.name) + 'に届きます。</p>' +
          '<a class="btn" href="' + h(cs.mailHref) + '">メールアプリを開く</a></div>' +
        '<div class="card" style="display:flex;flex-direction:column;gap:8px"><b>開かないときは</b>' +
          '<p style="margin:0">下のあて先に、内容をコピーして送ってください。</p>' +
          '<p class="round" style="margin:0;font-size:19px;font-weight:900;word-break:break-all">' + h(MADO.fallbackEmail) + '</p>' +
          '<button class="btn small outline-ink" data-act="copy">内容をコピーする</button></div>' +
        '<div class="notice sun"><div class="notice-title">自動返信メールは届きません</div>' +
          '<p>後日、担当の専門家から返事が届きます（目安 ' + h(CFG.replyDays) + '営業日）。</p></div>' +
        '<a class="btn ghost" href="#/home">ホームにもどる</a>';
    }
    return '' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-top:12px">' + buddy(88, 'happy') +
        '<h1 class="title">送信しました</h1>' +
        '<div class="ref"><span>受付番号</span><b>' + h(cs.ref) + '</b></div></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:6px"><b style="font-size:15px">このあと</b>' +
        '<p style="margin:0">後日、担当の専門家から <b style="word-break:break-all">' + h(cs.sentEmail) + '</b> あてに返事が届きます（目安 ' + h(CFG.replyDays) + '営業日）。</p></div>' +
      '<div class="notice sun"><div class="notice-title">自動返信メールは届きません</div>' +
        '<p>受付番号と内容は、この画面でお控えください。</p>' +
        '<button class="btn small outline-ink" data-act="copy">送った内容をコピーする</button></div>' +
      '<div class="card" style="display:flex;gap:12px;align-items:center"><span class="ico-box tone-mint">' + icon('lock') + '</span>' +
        '<span>送った内容は、このアプリに残りません。</span></div>' +
      '<p class="note">返事が来ないときは、迷惑メールフォルダもご確認ください。</p>' +
      (MADO.fallbackEmail ? '<a class="btn ghost" href="mailto:' + h(MADO.fallbackEmail) + '?subject=' + h(encodeURIComponent('【つぐいえ相談 ' + cs.ref + '】再送')) + '&body=' + h(encodeURIComponent(cs.sentText)) + '">メールアプリで送り直す</a>' : '') +
      '<a class="btn" href="#/home">ホームにもどる</a>';
  }

  function vNotFound() {
    return '<h1 class="title">ページが見つかりません</h1><a class="btn" href="#/home">ホームにもどる</a>';
  }

  /* ======================================================
     ルーター
     ====================================================== */
  var NO_TAB = /^(task\/.+|sim\/new|consult\/(form|confirm|done))$/;
  var lastPath = null;
  function route() { return (location.hash || '#/home').replace(/^#\/?/, '') || 'home'; }
  function render() {
    var p = route(), parts = p.split('/'), html;
    var sheet = document.querySelector('.sheet-wrap'); if (sheet) sheet.remove();
    if (lastPath !== p) { confirmClear = false; confirmDelEst = false; simErr = ''; }
    if (lastPath === 'consult/done' && p !== 'consult/done') resetConsult();
    if (lastPath === 'sim/new' && p !== 'sim/new') { draft = null; simStep = 0; }
    switch (parts[0]) {
      case 'home': html = vHome(); break;
      case 'task': html = vTask(parts[1]); break;
      case 'settings': html = vSettings(); break;
      case 'learn': html = parts[1] ? vArticle(parts[1]) : vLearn(); break;
      case 'sim': html = parts[1] === 'new' ? vSimNew() : parts[1] ? vSimResult(parts[1]) : vSimList(); break;
      case 'consult':
        html = parts[1] === 'form' ? vConsultForm() : parts[1] === 'confirm' ? vConsultConfirm()
          : parts[1] === 'done' ? vConsultDone() : vConsult();
        break;
      default: html = vNotFound();
    }
    if (html === '') return; // go() で別の画面へ移った
    view.innerHTML = html;
    var noTab = NO_TAB.test(p);
    view.classList.toggle('no-tab', noTab && parts[0] !== 'task');
    view.classList.toggle('has-dock', parts[0] === 'task');
    tabbar.hidden = noTab;
    var tab = parts[0] === 'settings' || parts[0] === 'task' ? 'home' : parts[0];
    Array.prototype.forEach.call(tabbar.querySelectorAll('a'), function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (lastPath !== p) {
      window.scrollTo(0, 0);
      try { view.focus({ preventScroll: true }); } catch (e) { /* 古い端末 */ }
    }
    lastPath = p;
  }

  /* ======================================================
     操作
     ====================================================== */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el || !(view.contains(el))) return;
    var act = el.getAttribute('data-act');
    switch (act) {
      case 'set-death': {
        var v = document.getElementById('death').value;
        if (!v) { document.getElementById('death-err').hidden = false; return; }
        S.setDeath(v); render(); break;
      }
      case 'save-death': {
        var v2 = document.getElementById('death2').value;
        if (!v2) { toast('日付を入れてください'); return; }
        S.setDeath(v2); toast('保存しました'); break;
      }
      case 'toggle-done': showDone = !showDone; render(); break;
      case 'done': {
        var id = el.getAttribute('data-id');
        if (!S.get().deathISO) { S.toggleDone(id); render(); toast('「済」にしました'); break; }
        S.toggleDone(id); render(); showDoneSheet(id); break;
      }
      case 'undone': S.toggleDone(el.getAttribute('data-id')); render(); toast('「済」を取り消しました'); break;
      case 'filter': learnFilter = el.getAttribute('data-v'); render(); break;
      case 'export': {
        var blob = new Blob([S.exportJSON()], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tsuguie-backup-' + DL.todayISO() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        break;
      }
      case 'clear': confirmClear = true; render(); break;
      case 'clear-no': confirmClear = false; render(); break;
      case 'clear-yes': S.clearAll(); confirmClear = false; toast('すべて消しました'); go('#/home'); break;
      case 'yn': {
        var raw = el.getAttribute('data-v');
        draft[el.getAttribute('data-k')] = raw === 'true' ? true : raw === 'false' ? false : 'unk';
        render(); break;
      }
      case 'quick': draft.price = el.getAttribute('data-v'); render(); break;
      case 'heirs': draft.heirs = el.getAttribute('data-v'); render(); break;
      case 'sim-next': {
        simErr = simValidate();
        if (simErr) { render(); return; }
        if (simStep === SIM_STEPS.length - 1) { simFinish(); return; }
        simStep++; render(); window.scrollTo(0, 0); break;
      }
      case 'sim-back': simErr = ''; simStep = Math.max(0, simStep - 1); render(); break;
      case 'sim-again': {
        var src = S.getEstimate(el.getAttribute('data-id'));
        draft = src ? draftFrom(src) : newDraft(); simStep = 1; go('#/sim/new'); break;
      }
      case 'del-est': confirmDelEst = true; render(); break;
      case 'del-est-no': confirmDelEst = false; render(); break;
      case 'del-est-yes': S.removeEstimate(el.getAttribute('data-id')); toast('削除しました'); go('#/sim'); break;
      case 'consult-with': cs.attachId = el.getAttribute('data-id'); go('#/consult'); break;
      case 'topic': {
        var t = el.getAttribute('data-v');
        if (cs.topics[t]) delete cs.topics[t]; else cs.topics[t] = true;
        el.setAttribute('aria-pressed', String(!!cs.topics[t]));
        break;
      }
      case 'to-confirm':
        if (consultValidate()) { cs.agree = false; cs.error = ''; go('#/consult/confirm'); }
        else { render(); var bad = view.querySelector('.err'); if (bad) bad.scrollIntoView({ block: 'center' }); }
        break;
      case 'send': send(); break;
      case 'copy': {
        var text = cs.sentText;
        var ok = function () { toast('コピーしました'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok, function () { fallbackCopy(text) ? ok() : toast('コピーできませんでした'); });
        } else if (fallbackCopy(text)) ok(); else toast('コピーできませんでした');
        break;
      }
    }
  });
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* 入力：画面を描き直さずに状態だけ更新する（フォーカスを失わないため） */
  function onInput(ev) {
    var el = ev.target;
    var k = el.getAttribute('data-bind');
    if (k && draft) {
      if (el.type === 'checkbox') {
        draft[k] = el.checked;
        if (k === 'acqYearUnknown') { var y = document.getElementById('s-acqy'); if (y) y.disabled = el.checked; }
      } else if (el.type === 'radio') {
        if (el.checked) draft[k] = el.value;
        if (k === 'acqKnown') { var f = document.getElementById('acq-price-field'); if (f) f.hidden = el.value !== 'yes'; }
        if (k === 'kind' && el.value !== 'house') { draft.builtBefore1981 = null; draft.livedAlone = null; draft.renovateOrDemolish = null; }
      } else {
        draft[k] = el.value;
        if (k === 'price') Array.prototype.forEach.call(view.querySelectorAll('[data-act="quick"]'), function (b) {
          b.setAttribute('aria-pressed', String(String(num(el.value)) === b.getAttribute('data-v')));
        });
      }
    }
    var ck = el.getAttribute('data-cbind');
    if (ck) {
      cs[ck] = el.value;
      if (ck === 'email' && cs.errors.email) { delete cs.errors.email; var em = document.getElementById('e-mail'); if (em) em.remove(); el.removeAttribute('aria-invalid'); }
    }
    var chg = el.getAttribute('data-act-change');
    if (chg === 'agree') {
      cs.agree = el.checked;
      var sb = document.getElementById('send-btn');
      if (sb) sb.disabled = !cs.agree || cs.sending;
    }
    if (chg === 'attach1' && !el.checked) cs.attachId = '';
    if (el.id === 'import-file' && el.files && el.files[0]) {
      var reader = new FileReader();
      reader.onload = function () {
        try { S.importJSON(String(reader.result)); toast('読み込みました'); render(); }
        catch (e) { toast(e.message || '読み込めませんでした'); }
      };
      reader.readAsText(el.files[0]);
      el.value = '';
    }
  }
  view.addEventListener('input', onInput);
  view.addEventListener('change', onInput);

  window.addEventListener('hashchange', render);
  render();
})();
