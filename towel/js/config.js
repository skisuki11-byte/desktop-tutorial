/* config.js — 公開前に書き換える設定はここだけ。
 *
 * endpoint  集計先（Google Apps Script のウェブアプリURL）。設定方法は gas/README.md。
 *           空のままだと「デモ表示」になり、入力はこの端末の中にだけ保存される。
 * 空欄（'' や 0）にした項目は、画面に出さない。
 */
window.TOWEL_CONFIG = {
  endpoint: '',

  // 画面の見出しまわり
  team: '',                         // 例：'〇〇高校 男子バレーボール部'
  item: '春高バレー出場記念タオル',   // 申し込むものの名前

  // ご案内（値段と締切は申し込み画面の上、それ以外はフォームの下に出す。空欄なら出さない）
  price: 0,                         // 1枚の値段（円）。0 なら金額を出さない
  deadline: '',                     // 締切日 'YYYY-MM-DD'（その日の 23:59 まで受け付ける）
  delivery: '',                     // 受け取り方 例：'1月の壮行会でお渡しします'
  payment: '',                      // 支払い方 例：'受け取りのときに現金で'
  contact: '',                      // 問い合わせ先 例：'保護者会 役員（佐藤・鈴木）まで LINE で'

  // 入力欄
  maxPerOrder: 20,                  // 1件で申し込める最大枚数
  courtnameLabel: 'コートネーム',
  courtnameHint: '選手のコートネーム（例：ハル）',
  courtnameRequired: false,         // true にすると必須になる

  // 受付を手動で締めるとき false にする（締切日を待たずに止められる）
  accepting: true,

  // 集計画面
  target: 0,                        // 発注の目安枚数（最低ロットなど）。0 なら出さない
  sheetUrl: ''                      // 元データの Google スプレッドシートのURL（役員だけが開ける）
};
