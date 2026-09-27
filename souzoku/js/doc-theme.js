/* doc-theme.js — プライバシーポリシーなどの別ページにも、アプリで選んだ「画面の色」「文字の大きさ」を当てる。
 * 端末に保存した設定（store.js と同じ場所）を読むだけで、書き込みはしない。 */
(function () {
  'use strict';
  try {
    var v = JSON.parse(localStorage.getItem('tsuguie.v1') || 'null') || {}, root = document.documentElement;
    if (v.theme === 'light' || v.theme === 'dark') root.setAttribute('data-theme', v.theme);
    if (v.textSize === 'large') root.setAttribute('data-size', 'large');
  } catch (e) { /* 使えない環境ではスマホの設定のまま */ }
  // アプリ本体（index.html）では、最初の画面ができて書体がそろうまで隠す（app.js が外す）。
  // 先に古い形（書体の入れ替わり・下のタブ）が一瞬見える「ちらつき」を防ぐ
  var me = document.currentScript;
  if (me && me.hasAttribute('data-boot')) {
    document.documentElement.classList.add('booting');
    // 書体（Google Fonts）は、ここで読み込みを始める。<link> を head に直接書くと、
    // 届くまで画面を一切描けない（スプラッシュも出ない）ため。そろうのを app.js が待つ
    var fl = document.createElement('link');
    fl.id = 'gfonts'; fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Zen+Maru+Gothic:wght@700&display=swap';
    fl.onload = fl.onerror = function () { fl.setAttribute('data-done', ''); };
    document.head.appendChild(fl);
    // 万一 app.js が動かなくても、画面が隠れたままにならないように
    setTimeout(function () { document.documentElement.classList.remove('booting'); }, 3000);
  }
})();
