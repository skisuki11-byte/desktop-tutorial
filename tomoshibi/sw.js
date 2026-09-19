/* sw.js — ホーム画面に追加したあと、オフラインでも開けるようにする。
 *
 * network-first。通信できるときは必ず最新を取り、取れた分を残す。
 * つながらないときだけキャッシュを使う＝圏外でもお参りはできる。
 * 「圏外でもお参りできること」は、この製品では体験の核にあたる。
 */
var CACHE = 'tomoshibi-v8';
var ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/capacitor-bridge.js',
  './js/theme-apply.js',
  './js/store.js',
  './js/app.js',
  './js/register-sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { /* 無い資産は飛ばす */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      // {cache:'no-store'} が肝心。これが無いと、素のfetch()はブラウザの
      // 通常のHTTPキャッシュ（Cache-Controlヘッダ）にも従ってしまい、
      // 「network-first」のつもりが実は数分〜十数分古いHTTPキャッシュの
      // 応答を「最新」として返し続けることがある。デプロイのたびに
      // 手元だけ古い版が残る不具合の実体はこれだった（追記61）。
      return fetch(req, { cache: 'no-store' }).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return cache.match(req).then(function (c) { return c || cache.match('./index.html'); });
      });
    })
  );
});
