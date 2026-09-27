/* doc-theme.js — プライバシーポリシーなどの別ページにも、アプリで選んだ「画面の色」「文字の大きさ」を当てる。
 * 端末に保存した設定（store.js と同じ場所）を読むだけで、書き込みはしない。 */
(function () {
  'use strict';
  try {
    var v = JSON.parse(localStorage.getItem('tsuguie.v1') || 'null') || {}, root = document.documentElement;
    if (v.theme === 'light' || v.theme === 'dark') root.setAttribute('data-theme', v.theme);
    if (v.textSize === 'large') root.setAttribute('data-size', 'large');
  } catch (e) { /* 使えない環境ではスマホの設定のまま */ }
})();
