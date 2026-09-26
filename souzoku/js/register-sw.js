/* register-sw.js — ホーム画面に追加したあと、オフラインでも開けるようにする。
 * 新しい版に切り替わったら、入力の途中でないときだけ読み込み直す
 * （相談の入力中や試算の途中で画面が消えないように）。 */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.update().catch(function () {});
    }).catch(function () { /* 未対応でも動く */ });
  });
  var swPending = false;
  function resting() {
    var h = location.hash || '#/home';
    return !/^#\/(sim\/new|consult\/(form|confirm))/.test(h);
  }
  function reloadWhenSafe() {
    if (!resting()) { swPending = true; return; }
    location.reload();
  }
  navigator.serviceWorker.addEventListener('controllerchange', reloadWhenSafe);
  window.addEventListener('hashchange', function () { if (swPending && resting()) location.reload(); });
}
