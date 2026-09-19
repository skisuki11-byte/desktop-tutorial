/* 新しいsw.jsが出ていても、これまでは気づくタイミングがブラウザ任せ
 * だった（数時間〜1日、開かないこともある）。デプロイのたびに手元の
 * キャッシュだけ古いまま取り残される事故を防ぐため、開くたびに更新を
 * 確かめ（register-sw.js自身は毎回キャッシュ無しで取得されるので、
 * この一行は常に最新のまま届く）、新しい版に切り替わった瞬間に
 * 1回だけ自動で読み込み直す（追記61）。 */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.update().catch(function () {});
    }).catch(function () { /* 未対応でも動く */ });
  });
  var swReloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (swReloading) return;
    swReloading = true;
    location.reload();
  });
}
