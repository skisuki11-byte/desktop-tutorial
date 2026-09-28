/* config.js — 公開前に書き換える設定はここだけ。
 *
 * endpoint:  相談フォームの中継（Google Apps Script のウェブアプリURL）。
 *            設定方法は gas/README.md。空のままだと送信できず、画面にその旨が出る。
 * madoguchi: 相続の総合窓口。相談はここ1か所に届き、窓口が内容を見て
 *            提携の不動産会社（宅建士）・弁護士・税理士に振り分ける。
 *            提携先は仮（XX…）。決まったら org と license を書き換え、privacy.html の「4. 送信先」もそろえる。
 *            fallbackEmail は、中継が未設定または送信に失敗したときに、メールアプリで送る宛先。
 * topics:    相談フォームの選択肢と、おもに答える専門家（色の表示に使う）。
 * replyDays: 完了画面の「◯◯ほどが目安です」（返事が届くまでの目安）。
 */
window.TG_CONFIG = {
  version: '1.0',           // アプリのバージョン（オープニングと設定の下に出す。ここだけ変えれば両方変わる）
  endpoint: 'https://script.google.com/macros/s/AKfycbx8aT7pRsfezVnl1-DaZLE5JyfCOUN0enerjNcQ41BEw6GI-QiKMMXndpTCZpMkIVbX/exec',
  replyDays: '3日',
  operator: 'SEIICHI KISUKI',   // プライバシーポリシーにだけ載せる（アプリの画面では「運営者」とだけ書く）
  madoguchi: {
    name: '相続の総合窓口',
    org: '株式会社籠や',
    fallbackEmail: 'halufuway@gmail.com',  // 中継（endpoint）が未設定・失敗のときはメールアプリでここへ送る
    members: [
      { id: 'fudosan', role: '不動産', sub: '宅建士', topics: '売る・価格', fee: true,
        org: 'XX不動産', license: '宅建業免許（番号は決まりしだい掲載）' },   // 仮
      { id: 'bengoshi', role: '弁護士', sub: '', topics: '話し合い・放棄', fee: false,
        org: 'XX法律事務所', license: '' },   // 仮
      { id: 'zeirishi', role: '税理士', sub: '', topics: '相続税・売却の税', fee: false,
        org: 'XX税理士事務所', license: '' }   // 仮
    ]
  },
  topics: [
    { label: '売るか迷っている', who: 'fudosan' },
    { label: 'いくらで売れる？', who: 'fudosan' },
    { label: '空き家特例を使える？', who: 'zeirishi' },
    { label: '相続税が心配', who: 'zeirishi' },
    { label: '家族で話がまとまらない', who: 'bengoshi' },
    { label: '相続放棄を考えている', who: 'bengoshi' },
    { label: '遠くて管理できない', who: 'fudosan' },
    { label: '家族信託を知りたい', who: 'bengoshi' },
    { label: 'まだよくわからない', who: '' }
  ]
};
