/* config.js — 公開前に書き換える設定はここだけ。
 *
 * endpoint:  相談フォームの中継（Google Apps Script のウェブアプリURL）。
 *            設定方法は gas/README.md。空のままだと送信できず、画面にその旨が出る。
 * madoguchi: 相続の総合窓口。相談はここ1か所に届き、窓口が内容を見て
 *            提携の不動産会社（宅建士）・弁護士・税理士に振り分ける。
 *            [ ] の中は提携先が決まったら書き換える。
 *            fallbackEmail は送信に失敗したときに「メールアプリで送る」で使う宛先（空なら出さない）。
 * topics:    相談フォームの選択肢と、おもに答える専門家（色の表示に使う）。
 * replyDays: 完了画面の「目安 ◯営業日以内」。
 */
window.TG_CONFIG = {
  endpoint: '',
  replyDays: '[返信の目安日数]',
  operator: '[運営者名]',
  madoguchi: {
    name: '相続の総合窓口',
    org: '[窓口の運営会社]',
    fallbackEmail: '',
    members: [
      { id: 'fudosan', role: '不動産', sub: '宅建士', topics: '売る・価格', fee: true,
        org: '[提携宅建業者名]', license: '宅建業免許 [免許番号]' },
      { id: 'bengoshi', role: '弁護士', sub: '', topics: '話し合い・放棄', fee: false,
        org: '[提携法律事務所名]', license: '' },
      { id: 'zeirishi', role: '税理士', sub: '', topics: '相続税・売却の税', fee: false,
        org: '[提携税理士事務所名]', license: '' }
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
    { label: 'まだよくわからない', who: '' }
  ]
};
