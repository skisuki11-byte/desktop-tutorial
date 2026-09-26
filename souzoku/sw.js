/* sw.js — オフラインでも開けるようにする。
 * network-first：通信できるときは最新を取り、取れた分を残す。
 * つながらないときだけキャッシュを使う（記事・試算・期限は圏外でも使える）。
 * 相談の送信（POST）には一切触れない。
 */
var CACHE = 'tsuguie-v3';
var ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/config.js',
  './js/calc.js',
  './js/deadlines.js',
  './js/articles.js',
  './js/tasks.js',
  './js/areas.js',
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
      // no-store：ブラウザのHTTPキャッシュの古い応答を「最新」として掴まないため
      return fetch(req, { cache: 'no-store' }).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return cache.match(req).then(function (c) { return c || cache.match('./index.html'); });
      });
    })
  );
});
