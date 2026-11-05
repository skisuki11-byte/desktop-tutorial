/* api.js — 集計先（Google Apps Script）とのやりとりと、両方の画面で使う小さな道具。
 *
 * config.js の endpoint が空なら「デモ表示」。同じ呼び方のまま、この端末の
 * localStorage を集計先の代わりに使う（ほかの端末には届かない）。
 */
(function () {
  'use strict';
  var CFG = window.TOWEL_CONFIG || {};
  var DEMO = !CFG.endpoint;
  var TIMEOUT = 20000;   // GAS はしばらく使われないと起動に数秒かかるので、待ち時間は長めにとる

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- 本番：GAS ---------- */
  function remote(action, body) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    return fetch(CFG.endpoint, {
      method: 'POST',
      // text/plain にすると、ブラウザの事前確認（CORS preflight）が起きず GAS にそのまま届く
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ app: 'towel', v: 1, action: action }, body || {})),
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

  /* ---------- デモ：この端末の中だけ ---------- */
  var DEMO_KEY = 'towel.demo.v2';
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
    var now = Date.now(), H = 3600 * 1000;
    var seed = [
      ['見本 山田 花子', 'ハル', 3, 50, true, '佐藤'],
      ['見本 佐々木 誠', 'ソウタ', 2, 46, true, '佐藤'],
      ['見本 高橋 由美', '', 1, 30, false, ''],
      ['見本 田中 健一', 'リク', 5, 26, true, '鈴木'],
      ['見本 伊藤 さくら', 'ユイ', 2, 20, false, ''],
      ['見本 渡辺 直子', 'ナオ', 4, 9, false, ''],
      ['見本 中村 大輔', 'ケント', 2, 3, false, '']
    ];
    db = { seq: 0, rows: [] };
    seed.forEach(function (s) {
      db.seq += 1;
      var t = new Date(now - s[3] * H).toISOString();
      db.rows.push({
        id: db.seq, createdAt: t, updatedAt: t, name: s[0], courtname: s[1], count: s[2],
        status: 'active', paid: s[4], paidBy: s[4] ? s[5] + ' ' + shortDate(t) : '',
        handed: false, handedBy: '', memo: '', source: 'form', requestId: uuid(), token: uuid()
      });
    });
    demoSave(db);
    return db;
  }
  function pub(r) {
    return { id: r.id, name: r.name, courtname: r.courtname, count: r.count, status: r.status,
      createdAt: r.createdAt, updatedAt: r.updatedAt };
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
    function admin() { if (d.pass !== DEMO_PASS) throw { code: 'wrong_pass' }; }
    function clean(src) {
      var v = validate(src);
      if (v.errors.length) throw { code: 'invalid' };
      return v.value;
    }
    switch (action) {
      case 'ping': return { ok: true };
      case 'submit': {
        for (var i = 0; i < db.rows.length; i++) {
          if (d.requestId && db.rows[i].requestId === d.requestId) return { ok: true, item: pub(db.rows[i]), token: db.rows[i].token };
        }
        var v = clean(d);
        db.seq += 1;
        var r = { id: db.seq, createdAt: now, updatedAt: now, name: v.name, courtname: v.courtname, count: v.count,
          status: 'active', paid: false, paidBy: '', handed: false, handedBy: '', memo: '', source: 'form',
          requestId: d.requestId || uuid(), token: uuid() };
        db.rows.push(r); demoSave(db);
        return { ok: true, item: pub(r), token: r.token };
      }
      case 'mine': {
        var out = [];
        (d.items || []).forEach(function (x) { var r = find(x.id); if (r && r.token === x.token) out.push(pub(r)); });
        return { ok: true, items: out };
      }
      case 'update': {
        var r2 = own(d.id, d.token), v2 = clean(d);
        r2.name = v2.name; r2.courtname = v2.courtname; r2.count = v2.count; r2.status = 'active'; r2.updatedAt = now;
        demoSave(db); return { ok: true, item: pub(r2) };
      }
      case 'cancel': {
        var r3 = own(d.id, d.token); r3.status = 'cancelled'; r3.updatedAt = now;
        demoSave(db); return { ok: true, item: pub(r3) };
      }
      case 'admin_login': admin(); return { ok: true };
      case 'admin_list': admin(); return { ok: true, items: db.rows.map(adminView), serverTime: now };
      case 'admin_save': {
        admin();
        var r4 = find(d.id); if (!r4) throw { code: 'not_found' };
        var p = d.patch || {}, who = (d.officer || '役員') + ' ' + shortDate(now);
        if ('paid' in p) { r4.paid = !!p.paid; r4.paidBy = r4.paid ? who : ''; }
        if ('handed' in p) { r4.handed = !!p.handed; r4.handedBy = r4.handed ? who : ''; }
        if ('status' in p) r4.status = p.status === 'cancelled' ? 'cancelled' : 'active';
        if ('memo' in p) r4.memo = String(p.memo || '').slice(0, 200);
        if ('name' in p || 'count' in p || 'courtname' in p) {
          var v4 = clean({ name: p.name, courtname: p.courtname, count: p.count }, true);
          r4.name = v4.name; r4.courtname = v4.courtname; r4.count = v4.count; r4.updatedAt = now;
        }
        demoSave(db); return { ok: true, item: adminView(r4) };
      }
      case 'admin_add': {
        admin();
        var v5 = clean(d);
        db.seq += 1;
        var r5 = { id: db.seq, createdAt: now, updatedAt: now, name: v5.name, courtname: v5.courtname, count: v5.count,
          status: 'active', paid: false, paidBy: '', handed: false, handedBy: '', memo: String(d.memo || '').slice(0, 200),
          source: 'admin', requestId: d.requestId || uuid(), token: uuid() };
        db.rows.push(r5); demoSave(db); return { ok: true, item: adminView(r5) };
      }
    }
    throw { code: 'bad_request' };
  }
  function adminView(r) {
    var o = pub(r);
    o.paid = r.paid; o.paidBy = r.paidBy; o.handed = r.handed; o.handedBy = r.handedBy; o.memo = r.memo; o.source = r.source;
    return o;
  }

  /* ---------- 入力のチェック（GAS 側とそろえる） ---------- */
  function squish(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function toCount(v) {
    var s = String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).trim();
    return /^\d{1,3}$/.test(s) ? Number(s) : NaN;
  }
  function validate(src) {
    var max = Number(CFG.maxPerOrder) || 20;
    var name = squish(src.name), courtname = squish(src.courtname), count = toCount(src.count);
    var errors = [];
    if (!name) errors.push({ field: 'name', msg: 'お名前を入力してください' });
    else if (name.length > 40) errors.push({ field: 'name', msg: 'お名前は40文字以内で入力してください' });
    if (CFG.courtnameRequired && !courtname) errors.push({ field: 'courtname', msg: (CFG.courtnameLabel || 'コートネーム') + 'を入力してください' });
    else if (courtname.length > 30) errors.push({ field: 'courtname', msg: (CFG.courtnameLabel || 'コートネーム') + 'は30文字以内で入力してください' });
    if (isNaN(count)) errors.push({ field: 'count', msg: '枚数を数字で入力してください' });
    else if (count < 1) errors.push({ field: 'count', msg: '枚数は1枚以上にしてください' });
    else if (count > max) errors.push({ field: 'count', msg: '1回で申し込めるのは' + max + '枚までです。もっと必要なときは役員にご相談ください' });
    return { errors: errors, value: { name: name, courtname: courtname, count: count } };
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
    closed: '受付は終了しました。追加をご希望のときは役員にご相談ください。',
    wrong_pass: '合言葉が違います。役員のあいだで共有されている合言葉を入力してください。',
    locked: '合言葉を何度も間違えたため、10分ほど受け付けを止めています。時間をおいてお試しください。',
    no_pass: '合言葉がまだ設定されていません（設定手順は gas/README.md の「3. 合言葉を決める」）。',
    server: '集計先でエラーが起きました。時間をおいてもう一度お試しください。続くときは設定を確認してください。',
    bad_request: '送信内容を受け付けられませんでした。ページを開き直してからお試しください。'
  };
  function message(err) { return MESSAGES[(err && err.code) || 'server'] || MESSAGES.server; }

  window.TowelAPI = {
    config: CFG,
    demo: DEMO,
    demoPass: DEMO_PASS,
    call: function (action, body) { return DEMO ? demo(action, body) : remote(action, body); },
    uuid: uuid, validate: validate, toCount: toCount, squish: squish,
    shortDate: shortDate, longDate: longDate, yen: yen, no: no,
    deadlineEnd: deadlineEnd, isClosed: isClosed, message: message
  };
})();
