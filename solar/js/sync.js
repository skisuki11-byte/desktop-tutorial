/* sync.js — Googleドライブに置いた「売電結果」シートと、押したときだけやりとりする。
 *
 *  ・自動では通信しない。ボタンを押した瞬間だけ動く。
 *  ・窓口は Apps Script のウェブアプリ（tools/drive-webapp.gs）。
 *    そのURLは端末のブラウザ（localStorage）にだけ置き、リポジトリには書かない。
 *  ・書き込みは「累計」シートの決まったセルに入れる。行＝月、列＝年で決まる。
 *
 *  ⚠ このURLを知っている人はシートを読むことも書き換えることもできる。
 *
 *  claude.ai の公開ページ（Artifact）は外部通信が塞がれているので、
 *  そこでは同期の画面ごと隠す（app.js の canSync）。
 */
(function (global) {
  'use strict';

  function url() {
    var s = global.Store.settings();
    return ((s && s.syncUrl) || '').trim();
  }

  /* 通信の中身が見られないよう https に限る。手元での確認用に localhost だけ通す。 */
  function okUrl(u) {
    if (/^https:\/\//i.test(u)) return true;
    return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(u);
  }

  function need() {
    var u = url();
    if (!u) throw new Error('シートのURLがまだ設定されていません（設定タブ）');
    if (!okUrl(u)) throw new Error('シートのURLは https:// で始まるものにしてください');
    return u;
  }

  /* 返ってきた中身が売電シートの形をしているか確かめる */
  function inspect(d) {
    if (!d || typeof d !== 'object') throw new Error('シートの形をしていません');
    if (d.error) throw new Error(String(d.error));
    if (!d.plants || typeof d.plants !== 'object') throw new Error('発電所のデータが入っていません');
    var months = 0, plants = 0;
    Object.keys(d.plants).forEach(function (pid) {
      plants++;
      var ys = d.plants[pid] || {};
      Object.keys(ys).forEach(function (y) {
        (ys[y].sales || []).forEach(function (v) { if (v != null) months++; });
      });
    });
    if (!plants) throw new Error('発電所が1つも入っていません');
    return { plants: d.plants, plantCount: plants, monthCount: months, sheet: d.sheet || '' };
  }

  /* 取り込んだシートの値と、いまの手元の値の食い違いを並べる。
     取り込む前に必ず見せる（黙って置き換えない）。 */
  function diff(fetched) {
    var out = [];
    Object.keys(fetched.plants).forEach(function (pid) {
      var p = global.Store.plant(pid);
      if (!p) return;
      var ys = fetched.plants[pid];
      Object.keys(ys).forEach(function (y) {
        for (var m = 1; m <= 12; m++) {
          var got = ys[y].sales[m - 1];
          var kwh = (ys[y].kwh || [])[m - 1];
          var mine = global.Store.cell(pid, Number(y), m);
          if (got == null && kwh == null) continue;
          if (mine.sales !== got || (kwh != null && mine.kwh !== kwh)) {
            out.push({
              plantId: pid, plantName: p.name, year: Number(y), month: m,
              mineSales: mine.sales, sheetSales: got,
              mineKwh: mine.kwh, sheetKwh: kwh
            });
          }
        }
      });
    });
    return out;
  }

  global.Sync = {
    url: url,
    okUrl: okUrl,
    configured: function () { return !!url(); },
    inspect: inspect,
    diff: diff,

    /* シートを読む。取り込みはせず、読んで確かめた結果を返すだけ。 */
    pull: function () {
      var u;
      try { u = need(); } catch (e) { return Promise.reject(e); }
      return fetch(u, { method: 'GET', cache: 'no-store', redirect: 'follow' })
        .then(function (r) {
          if (!r.ok) throw new Error('シートが応答しません（' + r.status + '）');
          return r.text();
        }, function () {
          throw new Error('シートにつながりません。URLと公開設定をご確認ください');
        })
        .then(function (txt) {
          var d;
          try { d = JSON.parse(txt); }
          catch (e) { throw new Error('JSONとして読めませんでした。ウェブアプリの公開設定（アクセスできるユーザー＝全員）をご確認ください'); }
          return inspect(d);
        });
    },

    /* 追記ぶんをシートの該当セルへ書き込む。
       writes = [{plantId, year, month, sales, kwh}] */
    push: function (writes) {
      var u;
      try { u = need(); } catch (e) { return Promise.reject(e); }
      if (!writes || !writes.length) return Promise.reject(new Error('書き込むものがありません'));

      return fetch(u, {
        method: 'POST',
        // text/plain で送るのは事前確認（preflight）を起こさないため。
        // Apps Script はそれに応えられず、JSON指定だと弾かれてしまう。
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ writes: writes, from: 'solar-app', at: new Date().toISOString() }),
        redirect: 'follow'
      }).then(function (r) {
        if (!r.ok) throw new Error('シートが応答しません（' + r.status + '）');
        return r.text();
      }, function () {
        throw new Error('シートにつながりません。URLと公開設定をご確認ください');
      }).then(function (txt) {
        var res;
        try { res = JSON.parse(txt); } catch (e) { throw new Error('返事が読めませんでした'); }
        if (res && res.error) throw new Error(res.error);
        if (!res || !res.ok) throw new Error('書き込めたか確認できませんでした');
        return res;   // { ok:true, written:[{plant,year,month,cell}], skipped:[] }
      });
    }
  };
})(window);
