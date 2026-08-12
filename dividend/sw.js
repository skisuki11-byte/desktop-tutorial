/* sw.js — ホーム画面に追加したあと、電波の無いところでも起動できるようにする。
 *
 * 方針は network-first:
 *   つながるときは必ず最新を取りに行き、取れた分をキャッシュに残す。
 *   つながらないときだけキャッシュを使う＝オフラインでも開ける。
 *   （キャッシュを先に返すと、更新しても古い画面が動き続けてしまう）
 *
 * 外部への通信は一切しないアプリなので、別オリジンの扱いは素通しでよい。
 */
var CACHE = 'dividend-v1';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/data.js',
  './js/store.js',
  './js/chart.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // 1つでも失敗すると全部入らないので、個別に入れて取りこぼしを防ぐ
      .then(function (c) {
        return Promise.all(ASSETS.map(function (u) {
          return c.add(u).catch(function () { /* 無い資産は飛ばす */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return cache.match(req).then(function (cached) {
          return cached || Response.error();
        });
      });
    })
  );
});
