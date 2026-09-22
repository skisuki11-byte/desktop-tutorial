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
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Calendar } from '@capacitor/calendar';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

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

// バックアップファイル（ZIP化したもの）の書き出し：
// Web版の<a download>はWKWebViewでは共有シートを出さず、どこに保存
// されたか分からなかった（追記89）。Filesystemでいったんキャッシュ領域に
// ファイルとして書き、その実ファイルをShareの共有シートに渡すことで、
// 「ファイル」に保存・AirDropなど、行き先をユーザーが選べるようにする。
//
// 動画を含むバックアップは数十〜数百MBになりうる。これをwriteFile()で
// 一度に渡すと、その丸ごとのデータをネイティブ橋渡しのメッセージとして
// シリアライズすることになり、端末のメモリを圧迫してWebViewごと強制
// 終了し、オープニング画面に戻ってしまう（追記94）。750KBずつ
// appendFileで小分けに書くことで、橋渡し1回あたりのデータ量を抑える
// （追記95でZIP形式に変えたことで、テキストではなくバイナリを扱う）。
var WRITE_CHUNK_BYTES = 750000;

// Filesystemの data は、encoding を指定しなければbase64として書かれる。
// 1バイトずつ文字コードへ変換してからbtoaする、素朴だが確実な方法
// （TextDecoderの'latin1'対応など環境依存の近道は使わない）。
function bytesToBase64(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function writeBinaryChunked(path, bytes, directory) {
  function step(offset) {
    var slice = bytes.subarray(offset, offset + WRITE_CHUNK_BYTES);
    var op = offset === 0 ? Filesystem.writeFile : Filesystem.appendFile;
    return op({ path: path, data: bytesToBase64(slice), directory: directory }).then(function () {
      var next = offset + WRITE_CHUNK_BYTES;
      if (next < bytes.length) return step(next);
      return Filesystem.getUri({ path: path, directory: directory });
    });
  }
  return step(0);
}

// 共有シートを保存先を選ばずに閉じた（AirDropやファイルアプリを選ばず、
// 外側をタップして閉じるなど）ときは、iOS側は completed:false で
// "Share canceled" を返す。これはユーザーが自分の意思でやめただけで
// 失敗ではないため、コピーの代替手段（copyOutBinary、追記107）を
// 出さずに済むよう、'canceled' として区別して返す。それ以外の失敗は
// 従来どおりsafe()がnullにする。
var saveBinaryFile = safe(function (filename, bytes, dialogTitle) {
  return writeBinaryChunked(filename, bytes, Directory.Cache).then(function (result) {
    return Share.share({ url: result.uri, dialogTitle: dialogTitle || '保存' })
      .then(function () { return true; })
      .catch(function (e) {
        var msg = (e && e.message) ? String(e.message) : '';
        if (msg.indexOf('Share canceled') >= 0) return 'canceled';
        throw e;
      });
  });
});

// バックアップのZIP圧縮・展開（追記95）：写真・動画をBase64にしてJSONに
// 埋め込む形式は、①Base64化で元サイズの約1.33倍に膨らむ、②書き出す前に
// その巨大な1本の文字列をまるごとJSのメモリ上に作る必要がある、という
// 2つの無駄があった。メタデータだけの小さいJSON（data.json）と、写真・
// 動画は生バイナリのまま別エントリ（media/<id>）にして、ZIPひとつに
// まとめる形に変える。ネイティブ・Web両方で使うため、safe()では包まず
// （isNativeにかかわらず動く）window.TomoshibiZipとして別に出す。
// entries: { 'data.json': Uint8Array, 'media/<id>': Uint8Array, ... }
function zipPack(entries) {
  return new Promise(function (resolve, reject) {
    try { resolve(zipSync(entries, { level: 6 })); }
    catch (e) { reject(e); }
  });
}
function unzipPack(bytes) {
  return new Promise(function (resolve, reject) {
    try { resolve(unzipSync(bytes)); }
    catch (e) { reject(e); }
  });
}

// カレンダーへ直接書き込む（追記93）。.icsファイル経由の共有シート／
// 「開く方法」はどちらもアプリの一覧を出すだけで、実際にカレンダーへ
// 登録するところまでは委ねられなかった（追記91・92で判明）。
// @capacitor/calendar（EventKitの薄いラッパー）でOSのカレンダーに直接
// 書き込めば、ユーザーが端末の設定で使っているカレンダー（iCloud・
// Googleなど、iOS設定でアカウント追加したものが既定になる）へそのまま
// 入る。書き込み専用の権限（iOS 17+の「イベントの追加のみ」）だけを
// リクエストする——読み取りは不要。
// events: [{title, date(Date), recurrence: 'monthly'|'yearly'|null}]
var addCalendarEvents = safe(function (events) {
  return Calendar.requestPermissions({ permissions: ['writeCalendar'] }).then(function (status) {
    if (status.writeCalendar !== 'granted') return false;
    var chain = Promise.resolve();
    events.forEach(function (ev) {
      var start = ev.date.getTime();
      var opts = {
        title: ev.title,
        startDate: start,
        endDate: start + 24 * 60 * 60 * 1000,
        isAllDay: true
      };
      if (ev.recurrence) opts.recurrence = { frequency: ev.recurrence };
      chain = chain.then(function () { return Calendar.createEvent(opts); });
    });
    return chain.then(function () { return true; });
  });
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
  saveBinaryFile: saveBinaryFile,
  addCalendarEvents: addCalendarEvents
};

// isNativeにかかわらず（Web/PWAでも）使うので、TomoshibiNativeとは別の窓口にする。
window.TomoshibiZip = {
  zip: zipPack,
  unzip: unzipPack,
  strToU8: strToU8,
  strFromU8: strFromU8
};
