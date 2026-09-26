/* config.js — 公開前に書き換える設定はここだけ。
 *
 * endpoint: 相談フォームの中継（Google Apps Script のウェブアプリURL）。
 *           設定方法は gas/README.md。空のままだと送信できず、画面にその旨が出る。
 * experts:  相談先の3者。[ ] の中は提携先が決まったら書き換える。
 *           fee は運営者が紹介料を受け取るか（宅建士の成約時だけ true）。
 *           fallbackEmail は送信に失敗したときに「メールアプリで送る」で使う宛先。
 *           空なら、その専門家には代替手段を出さない。
 * replyDays: 完了画面の「目安 ◯営業日以内」。
 */
window.TG_CONFIG = {
  endpoint: '',
  replyDays: '[返信の目安日数]',
  operator: '[運営者名]',
  experts: [
    {
      id: 'takken',
      role: '宅建士',
      sub: '不動産会社',
      topics: '家を売るか迷っている／いくらで売れるか／売り方',
      org: '[提携宅建業者名]',
      license: '宅建業免許 [免許番号]',
      fee: true,
      fallbackEmail: ''
    },
    {
      id: 'bengoshi',
      role: '弁護士',
      sub: '',
      topics: '相続人どうしの話し合い／相続放棄／遺言・共有のもめごと',
      org: '[提携法律事務所名]',
      license: '',
      fee: false,
      fallbackEmail: ''
    },
    {
      id: 'zeirishi',
      role: '税理士',
      sub: '',
      topics: '相続税／売ったときの税金／空き家特例が使えるか',
      org: '[提携税理士事務所名]',
      license: '',
      fee: false,
      fallbackEmail: ''
    }
  ]
};
