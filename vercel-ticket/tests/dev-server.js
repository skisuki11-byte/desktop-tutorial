// 手元で Vercel と同じように動かすためのサーバー（public/ を配り、/api/ticket を api/ticket.js に渡す）。
// 実行：DATABASE_URL=postgres://... ADMIN_PASS=... PORT=8790 node tests/dev-server.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/ticket');

const ROOT = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  if (url.pathname === '/api/ticket') return handler(req, res);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(Number(process.env.PORT) || 8790, () => console.log('http://localhost:' + (process.env.PORT || 8790) + '/'));
