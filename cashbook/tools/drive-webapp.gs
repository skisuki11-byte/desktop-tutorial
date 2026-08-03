/**
 * Googleドライブの決まったフォルダを、出納帳の置き場所にするための小さな窓口。
 *
 *   読む（doGet）  … フォルダでいちばん新しい .json を返す
 *   書く（doPost） … 送られてきた中身を、日時つきの新しいファイルとして保存する
 *
 * 上書きはしません。毎回新しいファイルとして残るので、
 * 万一おかしくなっても、ひとつ前のファイルに戻せます。
 *
 * 【入れ方】
 *  1. script.google.com を開き、「新しいプロジェクト」
 *  2. このファイルの中身をぜんぶ貼り付ける
 *  3. FOLDER_ID を、使うフォルダのIDに書き換える
 *     （フォルダを開いたときのURL /folders/ のうしろの文字列）
 *  4. 右上「デプロイ」→「新しいデプロイ」→ 種類を「ウェブアプリ」
 *       ・次のユーザーとして実行： 自分
 *       ・アクセスできるユーザー： 全員
 *  5. 出てきた https://script.google.com/macros/s/..../exec を
 *     アプリの「設定 → 取り込み元URL」に貼って保存
 *
 *  ※ すでに前の版を入れている場合は、中身を差し替えたあと
 *     「デプロイを管理」→ 鉛筆マーク →「バージョン」を新規にして更新してください。
 *     URLは変わりません。
 *
 * ⚠ このURLを知っている人は、帳簿を読むことも書き換えることもできます。
 *   URLは会計担当だけが持ち、他の人には渡さないでください。
 */

var FOLDER_ID = 'ここにフォルダIDを貼る';

/* 読む：いちばん新しい .json をそのまま返す */
function doGet() {
  try {
    var newest = newestJson_();
    if (!newest) return out_({ error: 'フォルダに .json がありません' });
    return ContentService
      .createTextOutput(newest.getBlob().getDataAsString('UTF-8'))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return out_({ error: String(e) });
  }
}

/* 書く：日時つきの新しいファイルとして保存する（上書きしない） */
function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) || '';
    if (!body) return out_({ error: '中身が空です' });

    // 出納帳の形をしているものだけ受け取る（誤送信でフォルダを汚さないため）
    var data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      return out_({ error: 'JSONとして読めません' });
    }
    if (!data || !data.entries || !data.entries.length) {
      return out_({ error: '出納帳の形ではありません' });
    }

    var name = '出納帳_' + stamp_() + '.json';
    var file = DriveApp.getFolderById(FOLDER_ID).createFile(name, body, 'application/json');
    return out_({ ok: true, name: name, id: file.getId(), count: data.entries.length });
  } catch (err) {
    return out_({ error: String(err) });
  }
}

/* フォルダでいちばん更新の新しい .json */
function newestJson_() {
  var files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  var newest = null;
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().toLowerCase().slice(-5) !== '.json') continue;
    if (!newest || f.getLastUpdated() > newest.getLastUpdated()) newest = f;
  }
  return newest;
}

function stamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
}

function out_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
