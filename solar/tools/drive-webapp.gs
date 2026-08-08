/**
 * 売電結果シートの窓口（Google Apps Script）。
 *
 *   読む（doGet）  … 「累計」シートから3基ぶんの売電額・発電量を全部返す
 *   書く（doPost） … 送られてきた月の売電額・発電量を、決まったセルに入れる
 *
 * 【シートの並び】＝ 売電結果2026.xlsx の「累計」シートそのまま
 *
 *     行  … 1月〜12月が縦に12行
 *             市原発電所  6行目〜17行目
 *             富津発電所 24行目〜35行目
 *             竹原発電所 42行目〜53行目
 *     列  … 年ごとに「売電」「kWh」の2列ずつ
 *             2018年 = E,F   2019年 = G,H   2020年 = I,J
 *             2021年 = K,L   2022年 = M,N   2023年 = O,P
 *             2024年 = Q,R   2025年 = S,T   2026年 = U,V
 *           （W列から先はローン・経費なので、2027年ぶんは列を足す必要があります。
 *             足したら下の YEAR_LAST を直してください）
 *
 * 【入れ方】
 *  1. 「累計」シートのスプレッドシートを開く
 *     （xlsx のままでは Apps Script から書き込めません。まだ変換していない場合は
 *      売電結果2026.xlsx をドライブで開き、
 *      ファイル →「Googleスプレッドシートとして保存」）
 *  2. そのスプレッドシートを開き、拡張機能 → Apps Script
 *  3. このファイルの中身をぜんぶ貼り付ける
 *  4. 右上「デプロイ」→「新しいデプロイ」→ 種類を「ウェブアプリ」
 *       ・次のユーザーとして実行： 自分
 *       ・アクセスできるユーザー： 全員
 *  5. 出てきた https://script.google.com/macros/s/..../exec を
 *     アプリの「設定 → シートのURL」に貼って保存
 *
 *  ※ 中身を差し替えたときは「デプロイを管理」→ 鉛筆マーク →
 *     「バージョン」を新規にして更新してください。URLは変わりません。
 *
 * ⚠ このURLを知っている人はシートを読むことも書き換えることもできます。
 *   URLはご自身だけが持ち、他の方には渡さないでください。
 */

var SHEET_NAME = '累計';
var YEAR_FIRST = 2018;      // E列が2018年
var YEAR_LAST = 2026;      // U列が2026年（列を足したらここを増やす）
var COL_FIRST = 5;         // E列 = 5

var PLANTS = {
  ichihara: { name: '市原発電所', row0: 6 },
  futtsu: { name: '富津発電所', row0: 24 },
  takehara: { name: '竹原発電所', row0: 42 }
};

/* ---------- 読む ---------- */
function doGet() {
  try {
    var sh = sheet_();
    var out = { sheet: SHEET_NAME, plants: {} };

    for (var id in PLANTS) {
      var row0 = PLANTS[id].row0;
      // 12ヶ月 × (2018〜YEAR_LAST の売電/kWh) をまとめて1回で読む
      var width = (YEAR_LAST - YEAR_FIRST + 1) * 2;
      var block = sh.getRange(row0, COL_FIRST, 12, width).getValues();
      var years = {};
      for (var y = YEAR_FIRST; y <= YEAR_LAST; y++) {
        var off = (y - YEAR_FIRST) * 2;
        var sales = [], kwh = [], any = false;
        for (var m = 0; m < 12; m++) {
          var s = num_(block[m][off]);
          var k = num_(block[m][off + 1]);
          if (s !== null || k !== null) any = true;
          sales.push(s); kwh.push(k);
        }
        if (any) years[String(y)] = { sales: sales, kwh: kwh };
      }
      out.plants[id] = years;
    }
    return out_(out);
  } catch (e) {
    return out_({ error: String(e) });
  }
}

/* ---------- 書く ---------- */
/* 受け取る形： { writes: [ {plantId, year, month, sales, kwh} , ... ] } */
function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) || '';
    if (!body) return out_({ error: '中身が空です' });

    var data;
    try { data = JSON.parse(body); }
    catch (err) { return out_({ error: 'JSONとして読めません' }); }

    var writes = data && data.writes;
    if (!writes || !writes.length) return out_({ error: '書き込むものがありません' });
    if (writes.length > 60) return out_({ error: '一度に書けるのは60件までです' });

    var sh = sheet_();
    var done = [], skipped = [];

    for (var i = 0; i < writes.length; i++) {
      var w = writes[i];
      var p = PLANTS[w.plantId];
      var year = Number(w.year), month = Number(w.month);

      if (!p) { skipped.push({ item: w, why: '知らない発電所です' }); continue; }
      if (!(month >= 1 && month <= 12)) { skipped.push({ item: w, why: '月が1〜12ではありません' }); continue; }
      if (!(year >= YEAR_FIRST && year <= YEAR_LAST)) {
        skipped.push({ item: w, why: year + '年の列がシートにありません（列を足してから YEAR_LAST を直してください）' });
        continue;
      }

      var row = p.row0 + month - 1;
      var col = COL_FIRST + (year - YEAR_FIRST) * 2;

      if (w.sales !== null && w.sales !== undefined && w.sales !== '') {
        sh.getRange(row, col).setValue(Number(w.sales));
      }
      if (w.kwh !== null && w.kwh !== undefined && w.kwh !== '') {
        sh.getRange(row, col + 1).setValue(Number(w.kwh));
      }
      done.push({
        plant: p.name, year: year, month: month,
        cell: colName_(col) + row,
        sales: w.sales, kwh: w.kwh
      });
    }

    SpreadsheetApp.flush();
    log_(done, skipped);
    return out_({ ok: true, written: done, skipped: skipped });
  } catch (err) {
    return out_({ error: String(err) });
  }
}

/* ---------- 小道具 ---------- */
/* 「累計」タブを使う。CSVから作ったスプレッドシートはタブ名が
   「Untitled」などになることがあるので、その場合は最初のタブを使う。
   （タブが1枚しかないなら、それが累計表そのもの） */
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (sh) return sh;
  var all = ss.getSheets();
  if (all.length === 1) return all[0];
  throw new Error('「' + SHEET_NAME + '」タブが見つかりません。' +
    'タブ名を「' + SHEET_NAME + '」に変えるか、SHEET_NAME を直してください');
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : Math.round(n);
}

function colName_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

/* 書き込んだ記録を残す。あとから「いつ何を入れたか」を追えるようにするため。 */
function log_(done, skipped) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('アプリ書込履歴');
    if (!sh) {
      sh = ss.insertSheet('アプリ書込履歴');
      sh.appendRow(['日時', '発電所', '年', '月', 'セル', '売電', 'kWh', '備考']);
    }
    var t = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    for (var i = 0; i < done.length; i++) {
      var d = done[i];
      sh.appendRow([t, d.plant, d.year, d.month, d.cell, d.sales, d.kwh, '']);
    }
    for (var j = 0; j < skipped.length; j++) {
      sh.appendRow([t, '', '', '', '', '', '', '見送り: ' + skipped[j].why]);
    }
  } catch (e) { /* 履歴が残せなくても書き込み自体は成功させる */ }
}

function out_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
