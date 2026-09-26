# つぐいえ（仮称）— 相続不動産アプリ

相続の基本知識・不動産売却シミュレーション・相続の専門家（宅建士・弁護士・税理士）への相談窓口をまとめた無料スマホアプリの構想。

- アプリ本体: [`index.html`](index.html)（PWA。依存ライブラリなし・ビルド不要）
- 企画・構想書: [`proposal.html`](proposal.html)（ブラウザで開く）
- 画面デザイン（Claude Design）: [`design/`](design/)
- 相談フォームの中継（Google Apps Script）: [`gas/`](gas/)

## 方針（要約）

- アプリは端末内で完結。試算結果は端末内のみに保存し、個人情報を持たない
- 相談フォーム（匿名可・メール必須）は「相談先をえらぶ → 入力 → 送信前の確認 → 完了」の4画面
- 送信内容は Google Apps Script で選ばれた専門家へ転送するだけで、どこにも保存しない。ユーザーへの自動返信メールは送らず、後日専門家からメールが届く
- 運営者は紹介するだけで仲介しない。紹介料は宅建士からの成約時のみ。弁護士・税理士からは受け取らない

## アプリの構成

```
index.html            画面の骨組みと下部タブ
css/style.css         見た目（design/*.dc.html のトークンをそのまま移したもの。ダークモード対応）
js/config.js          公開前に書き換える設定（中継URL・提携先の名前・返信の目安日数）
js/calc.js            売却シミュレーションの計算（仲介手数料・印紙税・譲渡所得税・空き家特例）
js/deadlines.js       相続開始日からの期限の計算
js/articles.js        「まなぶ」の記事（同梱。オフラインで読める）
js/store.js           端末内の保存（相続開始日・手続きの済・試算結果のみ）
js/app.js             画面と遷移（ホーム／まなぶ／はかる／そうだん4画面）
sw.js                 オフライン対応（network-first）
privacy.html          プライバシーポリシー
gas/Code.gs           相談をメールで転送する中継（保存しない・自動返信しない）
tests/calc.test.js    計算と期限のテスト
```

## 動かす・確かめる

- ローカルで開く: `cd souzoku && python3 -m http.server 8000` → http://localhost:8000
- テスト: `node souzoku/tests/calc.test.js`

## 公開前にやること

1. `gas/README.md` の手順で中継を用意し、`js/config.js` の `endpoint` に URL を入れる
2. `js/config.js` と `privacy.html` の `[ ]`（提携先の名前・免許番号・運営者名・返信の目安日数）を書き換える
3. ストア配信する場合は、ともしびと同じく Capacitor で包む（未着手）
