/* register-sw.js — ホーム画面に追加したあと、オフラインでも開けるようにする。
 * sw.js は network-first（通信できるときは毎回最新を取る）なので、開いた画面はすでに最新。
 * そのため新しい版に切り替わっても読み込み直さない（読み込み直すと画面が一瞬ちらつく）。 */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.update().catch(function () {});
    }).catch(function () { /* 未対応でも動く */ });
  });
}
