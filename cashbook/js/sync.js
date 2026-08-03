/* sync.js — 「反映」を押したときだけ、決めた置き場所から最新の出納帳を読みに来る。
 *
 *  ・自動では一切動かない。押された瞬間にだけ通信する。
 *  ・読み込み先のURLは、その端末のブラウザ（localStorage）にだけ置く。
 *    リポジトリには書かない。URLを知っている人は中身を読めてしまうため。
 *  ・取り込む前に残高のつながりを検算し、結果を見せてから入れ替える。
 *
 *  claude.ai の公開ページ（Artifact）は外部への通信が塞がれているので、
 *  そちらではこの機能ごと隠す（app.js の canSync）。
 */
(function (global) {
  'use strict';

  function url() {
    var s = global.Store.settings();
    return ((s && s.syncUrl) || '').trim();
  }

  /* 受け取った中身が出納帳として筋の通ったものかを確かめ、
     取り込む前に見せる要約（件数・残高・食い違い）を返す。 */
  function inspect(d) {
    if (!d || typeof d !== 'object') throw new Error('出納帳の形をしていません');
    if (!Array.isArray(d.entries)) throw new Error('明細（entries）が入っていません');
    if (!d.opening || d.opening.amount == null) throw new Error('前年度繰越金が入っていません');

    var opening = Math.round(Number(d.opening.amount));
    if (isNaN(opening)) throw new Error('前年度繰越金が数字ではありません');

    // 記帳順（No順）に積み上げる＝手書きノートの差引残高と同じ並び
    var rows = d.entries.slice().sort(function (a, b) { return (a.no || 0) - (b.no || 0); });
    var bal = opening, mismatch = 0;
    rows.forEach(function (e) {
      bal += (Number(e.income) || 0) - (Number(e.expense) || 0);
      if (e.bookBalance != null && Math.round(Number(e.bookBalance)) !== bal) mismatch++;
    });

    return {
      title: d.title || '', opening: d.opening, entries: d.entries,
      count: rows.length, balance: bal, mismatch: mismatch
    };
  }

  /* 取り込み元として許すURLか。
     通信の中身が見られないよう https に限る。
     ただし手元での確認用に localhost だけは http でも通す
     （ブラウザ自身も localhost は安全な文脈として扱う）。 */
  function okUrl(u) {
    if (/^https:\/\//i.test(u)) return true;
    return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(u);
  }

  global.Sync = {
    url: url,
    okUrl: okUrl,
    configured: function () { return !!url(); },
    inspect: inspect,

    /* いまの帳簿を置き場所へ送る。向こうで日時つきの新しいファイルになる。
       上書きしないので、送るたびに履歴が残る。 */
    push: function () {
      var u = url();
      if (!u) return Promise.reject(new Error('取り込み元のURLがまだ設定されていません'));
      if (!okUrl(u)) return Promise.reject(new Error('取り込み元は https:// で始まるURLにしてください'));

      var d = global.Store.data();
      if (!d.entries.length) return Promise.reject(new Error('中身が空なので送りません'));

      return fetch(u, {
        method: 'POST',
        // text/plain で送るのは、事前確認（preflight）を起こさないため。
        // Google Apps Script はそれに応えられず、JSON指定だと弾かれてしまう。
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(d),
        redirect: 'follow'
      }).then(function (r) {
        if (!r.ok) throw new Error('置き場所が応答しません（' + r.status + '）');
        return r.text();
      }, function () {
        throw new Error('置き場所につながりません。URLと共有設定をご確認ください');
      }).then(function (txt) {
        var res;
        try { res = JSON.parse(txt); } catch (e) { throw new Error('返事が読めませんでした'); }
        if (res && res.error) throw new Error(res.error);
        if (!res || !res.ok) throw new Error('保存できたか確認できませんでした');
        return res;
      });
    },

    /* 押されたときだけ呼ばれる。取り込みはせず、読んで検算した結果を返すだけ。 */
    pull: function () {
      var u = url();
      if (!u) return Promise.reject(new Error('取り込み元のURLがまだ設定されていません'));
      if (!okUrl(u)) {
        return Promise.reject(new Error('取り込み元は https:// で始まるURLにしてください'));
      }
      return fetch(u, { method: 'GET', cache: 'no-store', redirect: 'follow' })
        .then(function (r) {
          if (!r.ok) throw new Error('取り込み元が応答しません（' + r.status + '）');
          return r.text();
        }, function () {
          // 通信そのものが弾かれた場合（CORS・オフラインなど）
          throw new Error('取り込み元につながりません。URLと共有設定をご確認ください');
        })
        .then(function (txt) {
          var d;
          try { d = JSON.parse(txt); }
          catch (e) { throw new Error('JSONとして読めませんでした'); }
          // 置き場所によっては {content: "...JSON..."} のように包んで返すので、それも開く
          if (d && !d.entries && d.content) {
            try { d = typeof d.content === 'string' ? JSON.parse(d.content) : d.content; }
            catch (e) { throw new Error('包まれている中身のJSONが読めませんでした'); }
          }
          return inspect(d);
        });
    }
  };
})(window);
