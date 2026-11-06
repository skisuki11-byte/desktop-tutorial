/* core.js — 春高チケット（Vercel 版）の集計先：申し込み・役員の操作。
 *
 * ・データは PostgreSQL（Vercel の Storage から追加した Neon）に入れる。db は query(text, params) を持つもの（pg の Pool）
 * ・日付・区分・値段・学年は画面と同じ public/js/config.js を読む（画面と食い違いが起きない）
 * ・申し込みの「合札」（受付番号と合鍵）を 60 日のクッキーでも渡す。
 *   LINE の中のブラウザでページの保存領域が消えても、同じスマホなら自分の申し込みが出る
 * ・役員の合言葉は環境変数 ADMIN_PASS（コードやデータベースには書かない）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

/* ---------- 設定（画面と同じ config.js を読む） ---------- */
function loadConfig() {
  const win = {};
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'config.js'), 'utf8');
  vm.runInNewContext(src, { window: win });
  return win.TICKET_CONFIG;
}
const CFG = loadConfig();
const DAYS = CFG.days.map((d) => ({ id: d.id, label: d.label }));
const KINDS = CFG.kinds.map((k) => ({ id: k.id, label: k.label, price: k.price }));
const ITEMS = [];
DAYS.forEach((d) => KINDS.forEach((k) => ITEMS.push({ key: d.id + '-' + k.id, header: d.label + ' ' + k.label, price: k.price })));
const GRADES = CFG.grades || [1, 2, 3];

const VERSION = 3;            // 画面側（admin.js の SERVER_VERSION）が「古い集計先」を見分けるのに使う
const MAX_CELL = 50;
const MAX_TOTAL = 200;
const MAX_SUBMIT_PER_HOUR = 300;
const MAX_FAIL = 20;          // 合言葉の失敗を10分あたり何回まで受け付けるか
const MAX_BODY = 20000;
const COOKIE_DAYS = 60;       // 申し込みの合札をスマホに残す日数（1.5ヶ月の受付期間より長く）
const MINE_COOKIE = 'tk_mine';
const OFFICER_COOKIE = 'tk_officer';

/* ---------- テーブル（最初の1回だけ作る） ---------- */
const SCHEMA = `
create table if not exists entries (
  id serial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  courtname text not null default '',
  grade integer not null default 0,
  counts jsonb not null,
  total integer not null default 0,
  amount integer not null default 0,
  status text not null default 'active',
  paid boolean not null default false,
  paid_by text not null default '',
  handed boolean not null default false,
  handed_by text not null default '',
  memo text not null default '',
  source text not null default 'form',
  request_id text unique,
  token text not null
);
create table if not exists settings (key text primary key, value text not null);
create table if not exists counters (key text primary key, n integer not null, expires timestamptz not null);
`;
let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) schemaReady = db.query(SCHEMA).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ---------- 小さな道具 ---------- */
function squish(v) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : ''; }
function normPass(s) {
  s = String(s == null ? '' : s).normalize('NFKC');
  return s.replace(/\s+/g, '').replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).toLowerCase();
}
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function gradeOf(v) {
  const m = String(v == null ? '' : v).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).match(/^\s*(\d)\s*(年|年生)?\s*$/);
  const n = m ? Number(m[1]) : 0;
  return GRADES.indexOf(n) >= 0 ? n : 0;
}
function totalOf(c) { return ITEMS.reduce((a, it) => a + (c[it.key] || 0), 0); }
function amountOf(c) { return ITEMS.reduce((a, it) => a + (c[it.key] || 0) * it.price, 0); }
function cleanCounts(src) {
  const c = {};
  ITEMS.forEach((it) => { const n = Number(src && src[it.key]); c[it.key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; });
  return c;
}
function validYmd(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), t = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2020 && y <= 2100 && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
function tokyo(dt, withYear) {   // 日本時間で 'M/d H:mm'（withYear なら 'yyyy/MM/dd HH:mm'）
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(dt).forEach((x) => { p[x.type] = x.value; });
  if (withYear) return p.year + '/' + ('0' + p.month).slice(-2) + '/' + ('0' + p.day).slice(-2) + ' ' + ('0' + p.hour).slice(-2) + ':' + p.minute;
  return p.month + '/' + p.day + ' ' + p.hour + ':' + p.minute;
}
function fail(code) { const e = new Error(code); e.code = code; e.app = true; return e; }   // 画面に返すエラー（invalid・closed など）

/* 入力のチェック（画面側 api.js の validate とそろえる） */
function validate(d) {
  const name = squish(d.name), courtname = squish(d.courtname), counts = {};
  if (!name || name.length > 40) throw fail('invalid');
  if (courtname.length > 30) throw fail('invalid');
  const src = d.counts && typeof d.counts === 'object' ? d.counts : {};
  ITEMS.forEach((it) => {
    let raw = String(src[it.key] == null ? '' : src[it.key]).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
    if (raw === '') raw = '0';
    if (!/^\d{1,3}$/.test(raw)) throw fail('invalid');
    const n = Number(raw);
    if (n > MAX_CELL) throw fail('invalid');
    counts[it.key] = n;
  });
  const total = totalOf(counts);
  if (total < 1 || total > MAX_TOTAL) throw fail('invalid');
  let grade;                                   // 送ってこなければ undefined（今の学年をそのままにする）
  if ('grade' in d && d.grade !== null && String(d.grade) !== '') {
    grade = gradeOf(d.grade);
    if (!grade) throw fail('invalid');
  } else if ('grade' in d) grade = 0;
  return { name, courtname, counts, grade };
}

/* ---------- 返す形（ご家庭向けは pub、役員向けは adminView） ---------- */
function pub(r) {
  const c = cleanCounts(r.counts);
  return {
    id: Number(r.id), name: r.name, courtname: r.courtname || '', grade: gradeOf(r.grade), counts: c,
    total: totalOf(c), amount: amountOf(c), status: r.status === 'cancelled' ? 'cancelled' : 'active',
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString()
  };
}
function adminView(r) {
  const o = pub(r);
  o.paid = !!r.paid; o.paidBy = r.paid_by || ''; o.handed = !!r.handed; o.handedBy = r.handed_by || '';
  o.memo = r.memo || ''; o.source = r.source === 'admin' ? 'admin' : 'form';
  return o;
}

/* ---------- クッキー（合札） ---------- */
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* 壊れた値は無視 */ } }
  });
  return out;
}
function cookie(name, value, days) {
  return name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + Math.round(days * 86400) + '; HttpOnly; Secure; SameSite=Lax';
}
function readMineCookie(cookies) {   // [{ id, token }]
  try {
    const list = JSON.parse(Buffer.from(cookies[MINE_COOKIE] || '', 'base64url').toString('utf8') || '[]');
    return Array.isArray(list) ? list.filter((x) => x && Number.isInteger(x.id) && typeof x.token === 'string').slice(-10) : [];
  } catch (e) { return []; }
}
function mineCookie(list) { return cookie(MINE_COOKIE, Buffer.from(JSON.stringify(list.slice(-10))).toString('base64url'), COOKIE_DAYS); }

/* ---------- 集計先の本体 ---------- */
function createCore(opts) {
  const db = opts.db;
  const env = opts.env || {};
  const now = opts.now || (() => new Date());

  async function deadline() {
    const r = await db.query("select value from settings where key = 'deadline'");
    const v = r.rows[0] ? r.rows[0].value : '';
    return validYmd(v) ? v : '';
  }
  async function isClosed() {
    const d = await deadline();
    return !!d && now().getTime() > new Date(d + 'T23:59:59+09:00').getTime();
  }
  /* 回数の数え上げ（一定時間で 0 に戻る）。上限を超えていたら false */
  async function countUp(key, ttlSec, max) {
    const r = await db.query(
      `insert into counters (key, n, expires) values ($1, 1, now() + make_interval(secs => $2))
       on conflict (key) do update set
         n = case when counters.expires < now() then 1 else counters.n + 1 end,
         expires = case when counters.expires < now() then now() + make_interval(secs => $2) else counters.expires end
       returning n`, [key, ttlSec]);
    return r.rows[0].n <= max;
  }
  async function failCount() {
    const r = await db.query("select n from counters where key = 'fail' and expires > now()");
    return r.rows[0] ? r.rows[0].n : 0;
  }
  async function checkPass(d) {
    const pass = env.ADMIN_PASS;
    if (!pass) return 'no_pass';
    if (await failCount() >= MAX_FAIL) return 'locked';
    if (typeof d.pass !== 'string' || !safeEqual(normPass(d.pass), normPass(pass))) {
      await countUp('fail', 600, Number.MAX_SAFE_INTEGER);
      return 'wrong_pass';
    }
    return null;
  }
  async function findOwn(d) {
    const id = Number(d.id);
    if (!Number.isInteger(id) || typeof d.token !== 'string' || !d.token) throw fail('not_found');
    const r = await db.query('select * from entries where id = $1', [id]);
    const row = r.rows[0];
    if (!row || !safeEqual(row.token, d.token)) throw fail('not_found');
    return row;
  }
  async function updateValues(id, v, extra) {
    const sets = ['name = $2', 'courtname = $3', 'counts = $4', 'total = $5', 'amount = $6', 'updated_at = now()'];
    const params = [id, v.name, v.courtname, JSON.stringify(v.counts), totalOf(v.counts), amountOf(v.counts)];
    if (v.grade !== undefined) { params.push(v.grade || 0); sets.push('grade = $' + params.length); }
    Object.keys(extra || {}).forEach((k) => { params.push(extra[k]); sets.push(k + ' = $' + params.length); });
    const r = await db.query('update entries set ' + sets.join(', ') + ' where id = $1 returning *', params);
    return r.rows[0];
  }
  async function insertEntry(v, source, requestId, memo) {
    const token = crypto.randomUUID();
    const rid = requestId || crypto.randomUUID();
    // 通信が切れて同じ申し込みが2回届いても、1件にまとめる（request_id は重ならない）
    const r = await db.query(
      `insert into entries (name, courtname, grade, counts, total, amount, memo, source, request_id, token)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (request_id) do nothing returning *`,
      [v.name, v.courtname, v.grade || 0, JSON.stringify(v.counts), totalOf(v.counts), amountOf(v.counts), memo || '', source, rid, token]);
    if (r.rows[0]) return r.rows[0];
    return (await db.query('select * from entries where request_id = $1', [rid])).rows[0];
  }

  /* 1回の問い合わせ。返り値 { body, cookies[] }（cookies はそのまま Set-Cookie にする） */
  async function handle(d, ctx) {
    const cookies = (ctx && ctx.cookies) || {};
    const out = [];
    if (!d || d.app !== 'ticket') return { body: { ok: false, error: 'bad_request' }, cookies: out };
    await ensureSchema(db);
    const reply = (body) => ({ body, cookies: out });
    try {
      switch (d.action) {
        case 'ping': return reply({ ok: true, deadline: await deadline() });

        case 'submit': {
          if (d.website) return reply({ ok: true, item: { id: 0, name: '', courtname: '', counts: {}, total: 0, amount: 0, status: 'active' }, token: '' });
          if (await isClosed()) throw fail('closed');
          if (!(await countUp('submit:' + Math.floor(now().getTime() / 3600000), 3600, MAX_SUBMIT_PER_HOUR))) return reply({ ok: false, error: 'rate' });
          const v = validate(d);
          const row = await insertEntry(v, 'form', str(d.requestId, 64), '');
          const mine = readMineCookie(cookies).filter((x) => x.id !== row.id);
          mine.push({ id: row.id, token: row.token });
          out.push(mineCookie(mine));
          return reply({ ok: true, item: pub(row), token: row.token });
        }

        case 'mine': {
          // 画面が覚えている分と、クッキーの合札の分を合わせて返す（クッキーから見つかった分は合鍵も返し、画面に覚え直してもらう）
          const fromPage = Array.isArray(d.items) ? d.items.slice(0, 10) : [];
          const fromCookie = readMineCookie(cookies);
          const want = new Map();
          fromPage.concat(fromCookie).forEach((x) => { if (x && Number.isInteger(Number(x.id)) && typeof x.token === 'string') want.set(Number(x.id), x.token); });
          const ids = Array.from(want.keys());
          const rows = ids.length ? (await db.query('select * from entries where id = any($1::int[])', [ids])).rows : [];
          const items = [], keep = [];
          rows.sort((a, b) => a.id - b.id).forEach((r) => {
            if (!safeEqual(r.token, want.get(r.id))) return;
            items.push(Object.assign(pub(r), { token: r.token }));
            keep.push({ id: r.id, token: r.token });
          });
          if (keep.length || fromCookie.length) out.push(mineCookie(keep));   // 見るたびに 60 日に延ばす
          return reply({ ok: true, items, deadline: await deadline() });
        }

        case 'update': {
          if (await isClosed()) throw fail('closed');
          const v = validate(d);
          const row = await findOwn(d);
          return reply({ ok: true, item: pub(await updateValues(row.id, v, { status: 'active' })) });
        }

        case 'cancel': {
          if (await isClosed()) throw fail('closed');
          const row = await findOwn(d);
          const r = await db.query("update entries set status = 'cancelled', updated_at = now() where id = $1 returning *", [row.id]);
          return reply({ ok: true, item: pub(r.rows[0]) });
        }

        case 'officer':   // 役員の画面：この端末で覚えておいた名前（合言葉は覚えない）
          return reply({ ok: true, officer: str(cookies[OFFICER_COOKIE], 12) });
      }

      // ここから下は役員だけ
      if (['admin_login', 'admin_list', 'admin_save', 'admin_add', 'admin_settings'].indexOf(d.action) < 0) return reply({ ok: false, error: 'bad_request' });
      const bad = await checkPass(d);
      if (bad) return reply({ ok: false, error: bad });
      if ('remember' in d) {   // 「次からお名前を省く」：名前だけをクッキーに残す（空なら消す）
        const nm = str(d.remember, 12);
        out.push(nm ? cookie(OFFICER_COOKIE, nm, COOKIE_DAYS) : cookie(OFFICER_COOKIE, '', 0));
      }
      const who = str(d.officer, 12) || '役員';
      switch (d.action) {
        case 'admin_login': return reply({ ok: true });
        case 'admin_list': {
          const rows = (await db.query('select * from entries order by id')).rows;
          return reply({ ok: true, items: rows.map(adminView), serverTime: now().toISOString(), version: VERSION, deadline: await deadline() });
        }
        case 'admin_save': {
          const p = d.patch || {};
          const id = Number(d.id);
          const cur = Number.isInteger(id) ? (await db.query('select * from entries where id = $1', [id])).rows[0] : null;
          if (!cur) throw fail('not_found');
          const stamp = who + ' ' + tokyo(now());
          const extra = {};
          if ('paid' in p) { extra.paid = !!p.paid; extra.paid_by = p.paid ? stamp : ''; }
          if ('handed' in p) { extra.handed = !!p.handed; extra.handed_by = p.handed ? stamp : ''; }
          if ('status' in p) extra.status = p.status === 'cancelled' ? 'cancelled' : 'active';
          if ('memo' in p) extra.memo = str(p.memo, 200);
          let row;
          if ('name' in p || 'courtname' in p || 'counts' in p || 'grade' in p) row = await updateValues(id, validate(p), extra);
          else if (Object.keys(extra).length) {
            const keys = Object.keys(extra);
            const r = await db.query('update entries set ' + keys.map((k, i) => k + ' = $' + (i + 2)).join(', ') + ' where id = $1 returning *',
              [id].concat(keys.map((k) => extra[k])));
            row = r.rows[0];
          } else row = cur;
          return reply({ ok: true, item: adminView(row) });
        }
        case 'admin_add': {
          const v = validate(d);
          const row = await insertEntry(v, 'admin', str(d.requestId, 64), str(d.memo, 200));
          return reply({ ok: true, item: adminView(row) });
        }
        case 'admin_settings': {
          const v = String(d.deadline == null ? '' : d.deadline).trim();
          if (v === '') { await db.query("delete from settings where key = 'deadline'"); return reply({ ok: true, deadline: '' }); }
          if (!validYmd(v)) throw fail('invalid');
          await db.query("insert into settings (key, value) values ('deadline', $1) on conflict (key) do update set value = excluded.value", [v]);
          return reply({ ok: true, deadline: v });
        }
      }
      return reply({ ok: false, error: 'bad_request' });
    } catch (err) {
      if (err && err.app) return reply({ ok: false, error: err.code });
      console.error(err);
      return reply({ ok: false, error: 'server' });
    }
  }

  return { handle };
}

module.exports = { createCore, parseCookies, ensureSchema, CFG, ITEMS, VERSION, MAX_BODY, MINE_COOKIE, OFFICER_COOKIE, _test: { normPass, validate, gradeOf, tokyo, validYmd } };
