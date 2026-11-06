/* /api/ticket — 画面（public/js/api.js）からの問い合わせを受ける Vercel の関数。
 * 中身は lib/core.js。ここでは「同じサイトからの POST だけ受ける」「クッキーを渡す」だけを行う。
 * 必要な環境変数（Vercel の Settings → Environment Variables）：
 *   DATABASE_URL … Storage で Neon をつなぐと自動で入る
 *   ADMIN_PASS   … 役員の合言葉
 */
'use strict';
const { Pool } = require('pg');
const { createCore, parseCookies, MAX_BODY } = require('../lib/core');

let core = null;
function getCore() {
  if (!core) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, max: 3, idleTimeoutMillis: 10000 });
    core = createCore({ db: pool, env: process.env });
  }
  return core;
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) { resolve(req.body); return; }
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) { resolve(String(req.body)); return; }
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > MAX_BODY) req.destroy(); });
    req.on('end', () => resolve(raw));
    req.on('error', () => resolve(''));
  });
}

function send(res, status, body, cookies) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'bad_request' });
  // 同じサイトの画面からだけ受け付ける（ほかのサイトから送らせる攻撃をふせぐ）
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { host = ''; }
    if (host !== req.headers.host) return send(res, 403, { ok: false, error: 'bad_request' });
  }
  let d = await readBody(req);
  if (typeof d === 'string') {
    if (d.length > MAX_BODY) return send(res, 200, { ok: false, error: 'bad_request' });
    try { d = JSON.parse(d); } catch (e) { return send(res, 200, { ok: false, error: 'bad_request' }); }
  } else if (JSON.stringify(d || {}).length > MAX_BODY) return send(res, 200, { ok: false, error: 'bad_request' });
  try {
    const r = await getCore().handle(d, { cookies: parseCookies(req.headers.cookie) });
    send(res, 200, r.body, r.cookies);
  } catch (err) {
    console.error(err);
    send(res, 200, { ok: false, error: 'busy' });   // データベースにつながらないなど：少し待ってやり直してもらう
  }
};
