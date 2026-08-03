/* sw.js — ホーム画面に追加したあと、オフラインでも起動できるようにする。
 *
 * 方針は stale-while-revalidate:
 *   まずキャッシュを即返して素早く開き、裏で最新版を取り直してキャッシュを更新する。
 *   つまり「常に起動する」かわりに、更新は次回の起動から反映される。
 *
 * api.anthropic.com への通信（カメラ読み取り）は別オリジンなので一切触らない。
 */
var CACHE = 'cashbook-v16';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/auth.js',
  './js/xlsx.js',
  './js/pdf.js',
  './js/store.js',
  './js/sync.js',
  './js/ocr.js',
  './js/app.js',
  './data/ledger.js',
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
  // 別オリジン（api.anthropic.com など）はそのまま通す
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return cached || Response.error();
        });
        return cached || network;
      });
    })
  );
});
