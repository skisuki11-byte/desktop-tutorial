/* capacitor-src/bridge.js — ネイティブ機能への窓口。
 *
 * このファイルは esbuild で js/capacitor-bridge.js にまとめられる（scripts/build-bridge.js）。
 * app.js は一切バンドラを使わないので、npmパッケージ（@capacitor/*）を直接読めない。
 * ここで window.TomoshibiNative という素のオブジェクトに変換して橋渡しする。
 *
 * ブラウザ／PWAで開いたとき（Capacitor.isNativePlatform()===false）は、
 * すべての関数が何もせずnullを返す。app.js側は isNative を見て分岐する必要すらなく、
 * ただ呼ぶだけでよい（＝この会社のポリシー通り、ネイティブ有無で挙動が壊れない）。
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileOpener } from '@capacitor-community/file-opener';

var isNative = Capacitor.isNativePlatform();

function safe(fn) {
  return function () {
    if (!isNative) return Promise.resolve(null);
    try { return fn.apply(null, arguments).catch(function () { return null; }); }
    catch (e) { return Promise.resolve(null); }
  };
}

var hapticSuccess = safe(function () {
  return Haptics.notification({ type: NotificationType.Success });
});

var requestNotifyPermission = safe(function () {
  return LocalNotifications.requestPermissions().then(function (r) { return r.display === 'granted'; });
});

// 節目の通知は同じIDで上書きスケジュールする。会話の都度キャンセル→再登録するので
// 重複・古い日付が残ることはない。IDは固定の小さい整数（節目の種類は最大6つ）。
var MILESTONE_IDS = [4901, 4902, 4903, 4904, 4905, 4906];

var cancelMilestoneNotifications = safe(function () {
  return LocalNotifications.cancel({ notifications: MILESTONE_IDS.map(function (id) { return { id: id }; }) });
});

// items: [{id(0〜5対応), title, body, date(Date, 午前9時などローカル時刻)}]
var scheduleMilestoneNotifications = safe(function (items) {
  var notifications = items.map(function (it, i) {
    return {
      id: MILESTONE_IDS[i] || (4900 + i),
      title: it.title,
      body: it.body,
      schedule: { at: it.date },
      sound: undefined
    };
  });
  if (!notifications.length) return Promise.resolve(null);
  return LocalNotifications.schedule({ notifications: notifications });
});

var takePhoto = safe(function () {
  return Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
    quality: 85,
    promptLabelHeader: '写真をえらぶ',
    promptLabelPhoto: 'アルバムからえらぶ',
    promptLabelPicture: 'カメラで撮る'
  }).then(function (photo) {
    if (!photo || !photo.webPath) return null;
    return fetch(photo.webPath).then(function (r) { return r.blob(); }).then(function (blob) {
      return new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg', lastModified: Date.now() });
    });
  });
});

// テキストファイルの書き出し（バックアップJSON・カレンダーics共用）：
// Web版の<a download>はWKWebViewでは共有シートを出さず、どこに保存
// されたか分からなかった（追記89）。Filesystemでいったんキャッシュ領域に
// ファイルとして書き、その実ファイルをShareの共有シートに渡すことで、
// 「ファイル」に保存・AirDropなど、行き先をユーザーが選べるようにする。
var saveTextFile = safe(function (filename, text, dialogTitle) {
  return Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8
  }).then(function (result) {
    return Share.share({ url: result.uri, dialogTitle: dialogTitle || '保存' });
  }).then(function () { return true; });
});

// カレンダー（.ics）の場合はShareの共有シート（コピー・ファイルに保存・
// AirDropなど、UIActivityViewController）ではなく、その書類を開ける
// アプリの一覧（カレンダー・Googleカレンダーなど、iOSの「開く方法」＝
// UIDocumentInteractionController）を出したい。共有シートとは別物の
// OSの仕組みで、FileOpenerプラグインが窓口になる（追記92）。
var openTextFileWith = safe(function (filename, text, mimeType) {
  return Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8
  }).then(function (result) {
    return FileOpener.open({ filePath: result.uri, contentType: mimeType, openWithDefault: true });
  }).then(function () { return true; });
});

// スプラッシュ／ステータスバーは起動直後の一瞬だけの見た目なので、失敗しても
// 何も起きなくていい（safe()と同じ理由でtry/catchのみ、Promiseの結果は使わない）。
function hideSplash() {
  if (!isNative) return;
  try { SplashScreen.hide(); } catch (e) {}
}
function setStatusBarStyle(dark) {
  if (!isNative) return;
  try { StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch (e) {}
}

window.TomoshibiNative = {
  isNative: isNative,
  hapticSuccess: hapticSuccess,
  requestNotifyPermission: requestNotifyPermission,
  scheduleMilestoneNotifications: scheduleMilestoneNotifications,
  cancelMilestoneNotifications: cancelMilestoneNotifications,
  takePhoto: takePhoto,
  hideSplash: hideSplash,
  setStatusBarStyle: setStatusBarStyle,
  saveTextFile: saveTextFile,
  openTextFileWith: openTextFileWith
};
