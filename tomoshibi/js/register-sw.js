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
  /* 新しい版に切り替わったら読み込み直す。ただし、いつでもよいわけでは
   * ない（追記67）。この自動リロードは起きる時を選べないので、
   * あの子への手紙を打っている最中や、送ったあとの「とどきました」の
   * 最中に割りこめば、このアプリがいちばんしてはいけないことになる。
   *
   * そこで「おうちに居て、書きかけも問いかけも無いとき」だけに限る。
   * ここで見送っても、新しいサービスワーカー自体はもう有効なので、
   * 次にアプリを開いたときには確実に新しい版が出る。 */
  var swPending = false, swReloading = false;
  function isRestingMoment() {
    var home = document.getElementById('view-home');
    if (!home || !home.classList.contains('on')) return false;   // おうち以外は途中
    var t = document.getElementById('write-text');
    if (t && t.value.trim()) return false;                       // 書きかけの手紙
    var a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && a.value) return false;
    return !document.querySelector('#sheet-root .sheet');        // 問いかけの最中
  }
  function reloadWhenSafe() {
    if (swReloading) return;
    if (!isRestingMoment()) { swPending = true; return; }
    swReloading = true;
    location.reload();
  }
  navigator.serviceWorker.addEventListener('controllerchange', reloadWhenSafe);
  // おうちに戻ってきた頃あいで、あらためて切り替える
  document.addEventListener('click', function () { if (swPending) setTimeout(reloadWhenSafe, 400); });
}
