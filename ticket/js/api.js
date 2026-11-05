/* api.js — 集計先（Google Apps Script）とのやりとりと、両方の画面で使う小さな道具。
 *
 * 申し込み1件 = お名前・コートネーム・学年・枚数（日付 × 区分 の表）。
 *   counts は { '0104-adult': 2, '0104-student': 1, '0105-adult': 0, ... } の形。
 * config.js の endpoint が空なら「デモ表示」。同じ呼び方のまま、この端末の
 * localStorage を集計先の代わりに使う（ほかの端末には届かない）。
 */
(function () {
  'use strict';
  var CFG = window.TICKET_CONFIG || {};
  var DEMO = !CFG.endpoint;
  var TIMEOUT = 30000;   // GAS はしばらく使われないと起動に十数秒かかることがあるので、待ち時間は長めにとる
  var DAYS = CFG.days || [];
  var KINDS = CFG.kinds || [];
  var MAX_CELL = Number(CFG.maxPerCell) || 20;
  var GRADES = CFG.grades || [1, 2, 3];
  function gradeLabel(n) { return n ? n + '年' : '未入力'; }
  /* 1 / '1' / '1年' / '１年' → 1。学年でなければ 0（GAS 側の gradeOf_ と同じ） */
  function toGrade(v) {
    var m = String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).match(/^\s*(\d)\s*(年|年生)?\s*$/);
    var n = m ? Number(m[1]) : 0;
    return GRADES.indexOf(n) >= 0 ? n : 0;
  }
  var ITEMS = [];        // 日付 × 区分 の並び（表・CSV・合計で同じ順に使う）
  DAYS.forEach(function (d) { KINDS.forEach(function (k) { ITEMS.push({ key: d.id + '-' + k.id, day: d, kind: k }); }); });

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- 枚数と金額 ---------- */
  function emptyCounts() { var c = {}; ITEMS.forEach(function (it) { c[it.key] = 0; }); return c; }
  function cleanCounts(src) {
    var c = emptyCounts();
    ITEMS.forEach(function (it) { var n = toCount(src && src[it.key]); c[it.key] = isNaN(n) ? 0 : n; });
    return c;
  }
  function totalOf(c) { return ITEMS.reduce(function (a, it) { return a + (Number(c && c[it.key]) || 0); }, 0); }
  function amountOf(c) { return ITEMS.reduce(function (a, it) { return a + (Number(c && c[it.key]) || 0) * it.kind.price; }, 0); }
  function kindTotals(c) {   // { adult: 3, student: 2 }
    var t = {}; KINDS.forEach(function (k) { t[k.id] = 0; });
    ITEMS.forEach(function (it) { t[it.kind.id] += Number(c && c[it.key]) || 0; });
    return t;
  }
  /* 入っている日だけを [{ day, parts: [{kind, n}], total }] の形で返す（確認画面・一覧の表示用） */
  function byDay(c) {
    var out = [];
    DAYS.forEach(function (d) {
      var parts = [], sum = 0;
      KINDS.forEach(function (k) { var n = Number(c && c[d.id + '-' + k.id]) || 0; if (n) { parts.push({ kind: k, n: n }); sum += n; } });
      if (sum) out.push({ day: d, parts: parts, total: sum });
    });
    return out;
  }
  function dayLabel(d) { return d.label + '（' + d.dow + '）'; }

  /* ---------- 本番：GAS ---------- */
  function once(action, body) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    return fetch(CFG.endpoint, {
      method: 'POST',
      // text/plain にすると、ブラウザの事前確認（CORS preflight）が起きず GAS にそのまま届く
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ app: 'ticket', v: 1, action: action }, body || {})),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw { code: 'network' };
      return r.json().catch(function () { throw { code: 'server' }; });
    }, function () {
      clearTimeout(timer);
      throw { code: 'network' };
    }).then(function (res) {
      if (!res || !res.ok) throw { code: (res && res.error) || 'server' };
      return res;
    });
  }

  /* 一時的な失敗（電波の途切れ・GAS の起動待ち・混雑）は、1.5秒おいて1回だけ自動でやり直す。
     どの操作も同じ内容を2回送っても結果は変わらない（申し込み・代わりに追加は requestId で1件にまとまり、
     修正・取り消し・集金のチェックは「その値にする」操作）ので、やり直しても二重にならない */
  function remote(action, body) {
    return once(action, body).catch(function (err) {
      if (!err || (err.code !== 'network' && err.code !== 'busy')) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, 1500); }).then(function () { return once(action, body); });
    });
  }

  /* ---------- デモ：この端末の中だけ ---------- */
  var DEMO_KEY = 'ticket.demo.v1';
  var DEMO_PASS = 'demo';
  function demoLoad() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || null; } catch (e) { return null; }
  }
  function demoSave(db) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* 保存できなくても画面は動かす */ }
  }
  function demoDb() {
    var db = demoLoad();
    if (db) return db;
    // 集計画面を開いたときに「どう見えるか」がわかるよう、見本の申し込みを入れておく
    // [名前, コートネーム, [1/4大,1/4高,1/5大,1/5高,1/6大,1/6高], 何時間前, 集金済み, 集金した役員, 学年]
    var now = Date.now(), H = 3600 * 1000;
    var seed = [
      ['見本 山田 花子', 'ニコ', [2, 1, 2, 1, 2, 1], 50, true, '佐藤', 3],
      ['見本 佐々木 誠', 'ソウタ', [2, 0, 2, 0, 0, 0], 46, true, '佐藤', 2],
      ['見本 高橋 由美', '', [1, 0, 0, 0, 0, 0], 30, false, '', 1],
      ['見本 田中 健一', 'リク', [3, 2, 3, 2, 3, 2], 26, true, '鈴木', 3],
      ['見本 伊藤 さくら', 'ユイ', [0, 0, 2, 2, 0, 0], 20, false, '', 1],
      ['見本 渡辺 直子', 'ナオ', [2, 0, 2, 0, 2, 0], 9, false, '', 2]
    ];
    db = { seq: 0, rows: [] };
    seed.forEach(function (s) {
      db.seq += 1;
      var t = new Date(now - s[3] * H).toISOString(), c = {};
      ITEMS.forEach(function (it, i) { c[it.key] = s[2][i] || 0; });
      db.rows.push({
        id: db.seq, createdAt: t, updatedAt: t, name: s[0], courtname: s[1], grade: s[6] || 0, counts: c,
        status: 'active', paid: s[4], paidBy: s[4] ? s[5] + ' ' + shortDate(t) : '',
        handed: false, handedBy: '', memo: '', source: 'form', requestId: uuid(), token: uuid()
      });
    });
    demoSave(db);
    return db;
  }
  function pub(r) {
    var c = cleanCounts(r.counts);
    return { id: r.id, name: r.name, courtname: r.courtname, grade: toGrade(r.grade), counts: c, total: totalOf(c), amount: amountOf(c),
      status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }
  function adminView(r) {
    var o = pub(r);
    o.paid = r.paid; o.paidBy = r.paidBy; o.handed = r.handed; o.handedBy = r.handedBy; o.memo = r.memo; o.source = r.source;
    return o;
  }
  function demo(action, d) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(demoRun(action, d || {})); } catch (e) { reject(e); }
      }, 450);
    });
  }
  function demoRun(action, d) {
    var db = demoDb(), now = new Date().toISOString();
    function find(id) { for (var i = 0; i < db.rows.length; i++) if (db.rows[i].id === Number(id)) return db.rows[i]; return null; }
    function own(id, token) { var r = find(id); if (!r || r.token !== token) throw { code: 'not_found' }; return r; }
    function admin() { if (normPass(d.pass) !== normPass(DEMO_PASS)) throw { code: 'wrong_pass' }; }
    function clean(src) {
      var v = validate(src);
      if (v.errors.length) throw { code: 'invalid' };
      return v.value;
    }
    function make(v, source) {
      db.seq += 1;
      var r = { id: db.seq, createdAt: now, updatedAt: now, name: v.name, courtname: v.courtname, grade: v.grade || 0, counts: v.counts,
        status: 'active', paid: false, paidBy: '', handed: false, handedBy: '', memo: String(d.memo || '').slice(0, 200),
        source: source, requestId: d.requestId || uuid(), token: uuid() };
      db.rows.push(r); demoSave(db);
      return r;
    }
    switch (action) {
      case 'ping': return { ok: true };
      case 'submit': {
        for (var i = 0; i < db.rows.length; i++) {
          if (d.requestId && db.rows[i].requestId === d.requestId) return { ok: true, item: pub(db.rows[i]), token: db.rows[i].token };
        }
        var r = make(clean(d), 'form');
        return { ok: true, item: pub(r), token: r.token };
      }
      case 'mine': {
        var out = [];
        (d.items || []).forEach(function (x) { var r = find(x.id); if (r && r.token === x.token) out.push(pub(r)); });
        return { ok: true, items: out };
      }
      case 'update': {
        var r2 = own(d.id, d.token), v2 = clean(d);
        r2.name = v2.name; r2.courtname = v2.courtname; r2.counts = v2.counts; r2.status = 'active'; r2.updatedAt = now;
        if ('grade' in d) r2.grade = v2.grade;
        demoSave(db); return { ok: true, item: pub(r2) };
      }
      case 'cancel': {
        var r3 = own(d.id, d.token); r3.status = 'cancelled'; r3.updatedAt = now;
        demoSave(db); return { ok: true, item: pub(r3) };
      }
      case 'admin_login': admin(); return { ok: true };
      case 'admin_list': admin(); return { ok: true, items: db.rows.map(adminView), serverTime: now, version: 2 };
      case 'admin_save': {
        admin();
        var r4 = find(d.id); if (!r4) throw { code: 'not_found' };
        var p = d.patch || {}, who = (d.officer || '役員') + ' ' + shortDate(now);
        if ('paid' in p) { r4.paid = !!p.paid; r4.paidBy = r4.paid ? who : ''; }
        if ('handed' in p) { r4.handed = !!p.handed; r4.handedBy = r4.handed ? who : ''; }
        if ('status' in p) r4.status = p.status === 'cancelled' ? 'cancelled' : 'active';
        if ('memo' in p) r4.memo = String(p.memo || '').slice(0, 200);
        if ('name' in p || 'counts' in p || 'courtname' in p || 'grade' in p) {
          var v4 = clean({ name: p.name, courtname: p.courtname, grade: p.grade, counts: p.counts });
          r4.name = v4.name; r4.courtname = v4.courtname; r4.counts = v4.counts; r4.updatedAt = now;
          if ('grade' in p) r4.grade = v4.grade;
        }
        demoSave(db); return { ok: true, item: adminView(r4) };
      }
      case 'admin_add': {
        admin();
        return { ok: true, item: adminView(make(clean(d), 'admin')) };
      }
    }
    throw { code: 'bad_request' };
  }

  /* ---------- 入力のチェック（GAS 側とそろえる） ---------- */
  function squish(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function toCount(v) {
    var s = String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).trim();
    if (s === '') return 0;
    return /^\d{1,3}$/.test(s) ? Number(s) : NaN;
  }
  /* 合言葉の表記ゆれをそろえる（GAS 側の normPass_ と同じ） */
  function normPass(v) {
    var s = String(v == null ? '' : v);
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
    return s.replace(/\s+/g, '').replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }).toLowerCase();
  }
  /* opts.requireGrade：ご家庭の申し込み画面では学年を必ず選んでもらう（役員の画面では「未入力」も可） */
  function validate(src, opts) {
    var name = squish(src.name), courtname = squish(src.courtname), counts = emptyCounts(), bad = false, over = false;
    var rawGrade = src.grade == null ? '' : String(src.grade), grade = toGrade(rawGrade);
    ITEMS.forEach(function (it) {
      var n = toCount(src.counts && src.counts[it.key]);
      if (isNaN(n)) bad = true; else if (n > MAX_CELL) over = true; else counts[it.key] = n;
    });
    var errors = [], label = CFG.courtnameLabel || 'コートネーム';
    if (!name) errors.push({ field: 'name', msg: 'お名前を入力してください' });
    else if (name.length > 40) errors.push({ field: 'name', msg: 'お名前は40文字以内で入力してください' });
    if (CFG.courtnameRequired && !courtname) errors.push({ field: 'courtname', msg: label + 'を入力してください' });
    else if (courtname.length > 30) errors.push({ field: 'courtname', msg: label + 'は30文字以内で入力してください' });
    if ((rawGrade !== '' && !grade) || (opts && opts.requireGrade && !grade)) errors.push({ field: 'grade', msg: '学年を選んでください' });
    if (bad) errors.push({ field: 'counts', msg: '枚数は数字で入力してください' });
    else if (over) errors.push({ field: 'counts', msg: '1か所に入れられるのは' + MAX_CELL + '枚までです。もっと必要なときは役員にご相談ください' });
    else if (!totalOf(counts)) errors.push({ field: 'counts', msg: 'チケットの枚数を1枚以上入れてください' });
    return { errors: errors, value: { name: name, courtname: courtname, grade: grade, counts: counts } };
  }

  /* ---------- 枚数の表（日付 × 区分）：申し込み画面と、集計画面の「修正」で使う ---------- */
  function buildGrid(host, prefix, onChange) {
    host.textContent = '';
    host.classList.add('grid');
    var inputs = {};
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    host.appendChild(el('span', 'grid-corner'));
    KINDS.forEach(function (k) {
      var h = el('span', 'grid-kind');
      h.appendChild(el('b', null, k.label));
      h.appendChild(el('small', 'num', yen(k.price)));
      host.appendChild(h);
    });
    DAYS.forEach(function (d) {
      var dh = el('span', 'grid-day');
      dh.appendChild(el('b', null, dayLabel(d)));
      if (d.sub) dh.appendChild(el('small', null, d.sub));
      host.appendChild(dh);
      KINDS.forEach(function (k) {
        var key = d.id + '-' + k.id, cell = el('div', 'mini-step');
        var minus = el('button', 'mini-btn', '−'), plus = el('button', 'mini-btn', '＋');
        minus.type = plus.type = 'button';
        minus.setAttribute('aria-label', dayLabel(d) + ' ' + k.label + 'を1枚へらす');
        plus.setAttribute('aria-label', dayLabel(d) + ' ' + k.label + 'を1枚ふやす');
        var input = document.createElement('input');
        input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.maxLength = 3;
        input.className = 'mini-input num'; input.id = prefix + key; input.value = '0';
        input.setAttribute('aria-label', dayLabel(d) + ' ' + k.label + 'の枚数');
        function set(n) { n = Math.max(0, Math.min(MAX_CELL, n)); input.value = String(n); refresh(); if (onChange) onChange(); }
        function cur() { var n = toCount(input.value); return isNaN(n) ? 0 : n; }
        minus.addEventListener('click', function () { set(cur() - 1); });
        plus.addEventListener('click', function () { set(cur() + 1); });
        input.addEventListener('focus', function () { input.select(); });
        input.addEventListener('input', function () { refresh(); if (onChange) onChange(); });
        input.addEventListener('blur', function () { set(cur()); });
        function refresh() {
          var n = cur();
          cell.classList.toggle('has-value', n > 0);
          minus.disabled = n <= 0; plus.disabled = n >= MAX_CELL;
        }
        inputs[key] = { input: input, refresh: refresh };
        cell.appendChild(minus); cell.appendChild(input); cell.appendChild(plus);
        host.appendChild(cell);
        refresh();
      });
    });
    return {
      get: function () { var c = {}; ITEMS.forEach(function (it) { c[it.key] = inputs[it.key].input.value; }); return c; },
      set: function (c) { ITEMS.forEach(function (it) { inputs[it.key].input.value = String((c && Number(c[it.key])) || 0); inputs[it.key].refresh(); }); },
      focus: function () { inputs[ITEMS[0].key].input.focus(); }
    };
  }

  /* ---------- 表示の道具 ---------- */
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function shortDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function longDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD[d.getDay()] + '） ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }
  function no(id) { return 'No.' + ('00' + id).slice(-3); }
  function deadlineEnd() {
    if (!CFG.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(CFG.deadline)) return null;
    var p = CFG.deadline.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 23, 59, 59);
  }
  function isClosed() {
    if (CFG.accepting === false) return true;
    var end = deadlineEnd();
    return !!(end && Date.now() > end.getTime());
  }

  var MESSAGES = {
    network: '通信できませんでした。電波のよい場所で、もう一度お試しください。入力した内容は残っています。',
    busy: 'ただいま混み合っています。30秒ほど待ってから、もう一度お試しください。',
    rate: '短い時間に送信が集中しています。少し時間をおいてから、もう一度お試しください。',
    invalid: '入力内容に誤りがあります。赤い表示の欄を直してください。',
    not_found: 'この申し込みが見つかりませんでした。お手数ですが役員にお問い合わせください。',
    closed: '受付は終了しました。お困りのときは役員にご相談ください。',
    wrong_pass: '合言葉が違います。役員のあいだで共有されている合言葉を入力してください。',
    locked: '合言葉を何度も間違えたため、10分ほど受け付けを止めています。時間をおいてお試しください。',
    no_pass: '合言葉がまだ設定されていません（設定手順は gas/README.md の「3. 合言葉を決める」）。',
    server: '集計先でエラーが起きました。時間をおいてもう一度お試しください。続くときは設定を確認してください。',
    bad_request: '集計先のプログラムが古いようです。役員にお知らせください（gas/README.md の「Code.gs を直したら」の手順で更新）。'
  };
  function message(err) { return MESSAGES[(err && err.code) || 'server'] || MESSAGES.server; }

  window.TicketAPI = {
    config: CFG,
    demo: DEMO,
    demoPass: DEMO_PASS,
    days: DAYS, kinds: KINDS, items: ITEMS, grades: GRADES, useGrade: CFG.useGrade === true, maxPerCell: MAX_CELL,
    gradeLabel: gradeLabel, toGrade: toGrade,
    call: function (action, body) { return DEMO ? demo(action, body) : remote(action, body); },
    uuid: uuid, validate: validate, toCount: toCount, squish: squish,
    emptyCounts: emptyCounts, cleanCounts: cleanCounts, totalOf: totalOf, amountOf: amountOf, kindTotals: kindTotals, byDay: byDay, dayLabel: dayLabel,
    buildGrid: buildGrid,
    shortDate: shortDate, longDate: longDate, yen: yen, no: no,
    deadlineEnd: deadlineEnd, isClosed: isClosed, message: message
  };
})();
