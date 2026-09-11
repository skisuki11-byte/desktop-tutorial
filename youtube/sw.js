/* sw.js — ホーム画面に追加したあと、通信が細いところでも起動できるようにする。
 *
 *  方針は network-first。つながるときは必ず最新を取りに行き、
 *  取れた分だけ控えに残す。つながらないときだけ控えを使う。
 *  先に控えを返すやり方だと、直したのに古い画面が動き続けてしまうため。
 *
 *  Google への問い合わせ（accounts.google.com / googleapis.com）は
 *  別のオリジンなので一切触らない。認証に割り込むと事故になる。
 */
var CACHE = 'ytlab-v5';
var ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/style.css', './config.js',
  './js/store.js', './js/api.js', './js/chart.js', './js/seo.js', './js/insight.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 1つでも失敗すると全部入らないので、個別に入れて取りこぼしを防ぐ
      return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
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
  if (new URL(req.url).origin !== self.location.origin) return;   // Google への通信は素通し

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return cache.match(req).then(function (hit) { return hit || Response.error(); });
      });
    })
  );
});
