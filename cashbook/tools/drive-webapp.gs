/**
 * Googleドライブの決まったフォルダから、いちばん新しい出納帳JSONを返すだけの小さな窓口。
 *
 * 【入れ方】
 *  1. script.google.com を開き、「新しいプロジェクト」
 *  2. このファイルの中身をぜんぶ貼り付ける
 *  3. FOLDER_ID を、使うフォルダのIDに書き換える
 *     （フォルダを開いたときのURL /folders/ のうしろの文字列）
 *  4. 右上「デプロイ」→「新しいデプロイ」→ 種類を「ウェブアプリ」
 *       ・次のユーザーとして実行： 自分
 *       ・アクセスできるユーザー： 全員
 *     （「全員」でないとアプリから読めません。かわりに、
 *       このURLを知っている人は帳簿を読めてしまうので、URLは他言しないでください）
 *  5. 出てきた https://script.google.com/macros/s/..../exec を
 *     アプリの「設定 → 取り込み元URL」に貼って保存
 *
 * 【使い方】
 *  会計担当がアプリで「バックアップ（JSON）」を書き出し、
 *  そのファイルをこのフォルダに入れる。あとは「最新を反映する」を押すだけ。
 *  いちばん更新の新しい .json を自動で選びます。
 */

var FOLDER_ID = 'ここにフォルダIDを貼る';

function doGet() {
  try {
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var files = folder.getFiles();
    var newest = null;

    while (files.hasNext()) {
      var f = files.next();
      var name = f.getName().toLowerCase();
      // .json という名前のものだけを見る
      if (name.slice(-5) !== '.json') continue;
      if (!newest || f.getLastUpdated() > newest.getLastUpdated()) newest = f;
    }

    if (!newest) return out({ error: 'フォルダに .json がありません' });

    // 中身をそのまま返す。アプリ側で残高を検算してから取り込む。
    return ContentService
      .createTextOutput(newest.getBlob().getDataAsString('UTF-8'))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return out({ error: String(e) });
  }
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
