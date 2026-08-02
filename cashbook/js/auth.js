/* auth.js — パスワードによる出入り口の管理。
 *
 *  ・初回だけ … その端末で初めて開いたときにパスワードを聞く。
 *               通ればこの端末は記憶し、次回からは聞かない。
 *  ・管理者モード … 出納帳を書き換える操作はここに入らないとできない。
 *               こちらは記憶せず、切り替えるたびにパスワードが要る。
 *               ページを閉じる／再読み込みすると自動的に閲覧モードへ戻る。
 *
 *  2つは別のパスワードで、それぞれ独立している。
 *
 *  ⚠ これはブラウザの中だけで動く仕組みです。うっかり編集や、
 *    事情を知らない人の書き換えを防ぐためのもので、
 *    このページのソースを読める人に対する防御にはなりません。
 *    パスワードは平文では置かず、下のハッシュ値だけを持っています。
 */
(function (global) {
  'use strict';

  var DEVICE_KEY = 'cashbook.device.v1';
  var SALT_A = 'cashbook-2026:';
  var SALT_B = ':kaikei';
  // パスワードは2種類。平文は置かず、ハッシュ値だけを持つ。
  var LOGIN_HASH = '12435bb84d5368aa';   // 初回ログイン用
  var ADMIN_HASH = '8dd59da44f6fe70e';   // 管理者モード用（別のパスワード）

  function hash(s) {
    var str = SALT_A + s + SALT_B;
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2654435761) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) +
      ('00000000' + h2.toString(16)).slice(-8);
  }

  var admin = false;      // 画面を閉じると消える（記憶しない）

  global.Auth = {
    /* 初回ログインのパスワードとして正しいか */
    verifyLogin: function (pw) { return hash(String(pw || '')) === LOGIN_HASH; },
    /* 管理者モードのパスワードとして正しいか */
    verifyAdmin: function (pw) { return hash(String(pw || '')) === ADMIN_HASH; },

    /* この端末は初回のログインを済ませているか */
    deviceTrusted: function () {
      try { return localStorage.getItem(DEVICE_KEY) === LOGIN_HASH; }
      catch (e) { return false; }
    },
    trustDevice: function () {
      try { localStorage.setItem(DEVICE_KEY, LOGIN_HASH); } catch (e) {}
    },
    forgetDevice: function () {
      try { localStorage.removeItem(DEVICE_KEY); } catch (e) {}
      admin = false;
    },

    /* 管理者モード */
    isAdmin: function () { return admin; },
    enterAdmin: function (pw) {
      if (!this.verifyAdmin(pw)) return false;
      admin = true;
      return true;
    },
    exitAdmin: function () { admin = false; }
  };
})(window);
