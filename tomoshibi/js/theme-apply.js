/* privacy.html専用。アプリ本体と同じ保存キーを読み、選ばれている配色（昼/夜）を
 * このページにも反映する。夜を選んでいる人が、暗い画面からいきなり眩しい白い
 * ページに切り替わらないようにするためだけの、小さな同期。store.jsの読み込み
 * ロジック（localStorageのtomoshibi.v2）をそのまま使い、二重実装しない。
 */
(function () {
  'use strict';
  if (window.Store && Store.state && Store.state.theme === 'night') {
    document.documentElement.setAttribute('data-theme', 'night');
  }
})();
