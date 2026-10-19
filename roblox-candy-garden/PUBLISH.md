# 公開の準備

今は**非公開**（自分とテスターだけ）。この紙は「みんなに公開する前」にやることのまとめ。

## 参考にした事例

- 成功: Grow a Garden（2025）。アイコンは「大きく1つの絵＋はっきりした色」で、小さく表示されても何のゲームか分かる。説明文は短く、最初の行で遊び方が分かる
- 成功: Adopt Me!。説明文の最初に「何ができるか」、その下にアップデート情報。新しいことが分かると、また来てくれる
- 失敗: 中身と違うサムネイル（実際に無い景色・キャラ）は Roblox の規約で「誤解を招く広告」とされ、差し替えや処分の対象になる。→ 画像は**実際のゲーム画面から作る**
- 失敗: 説明文にキーワードを並べるだけ（「pet sim garden grow simulator…」）は、読みにくく、規約でもスパム扱いされうる

## 説明文（案）

最初の2行で「何をするゲームか」が分かるようにする（Grow a Garden・Adopt Me! と同じ）。新しい遊びは上の方に。
（2026-10-18 更新: 3Dペット・なかよしレベル・やくそくの種・ずかん・まもりがみの木としょんぼり雲・ひみつきちとリフォーム を追加）

**日本語**（2026-10-19 にクリエイターハブへ入れた版）
> 🍬 お菓子の庭で、ペットといっしょに育てよう！
> 種を植えて → 水をあげて → しゅうかくして → 売って、庭をかわいく大きくしよう。
> ・🐾 たまごから生まれる 8しゅるいのペット
> ・📖 ペットずかん・さくもつずかん。天気で「きんいろ」「にじいろ」の作物が出るかも
> ・🌳 この土地の まもりがみ「みんなの木」を みんなで育てよう。しょんぼり雲が来たら、みんなで げんきを あげて まもろう
> ・🏠 じぶんだけの ひみつきちを たてて、中を家具で かざろう。柵や看板も 豪華に リフォーム
> ・🎁 毎日のボーナス、きょうのおねがい、日替わりショップ

注意: 次の行は Roblox の文字チェックで保存できなかった（「不明なエラー」になる）。説明文には入れない。
- 「友だちと遊ぶと『なかよしレベル』が上がる。2人で水をあげる『やくそくの花』も」
- 「いっしょに水をあげて さかせる『やくそくの花』」と「だれかの庭を こわすことは できないよ。」（言いかえても保存できなかった）

**English**
> 🍬 Grow a candy garden with your cute pets!
> Plant → water → harvest → sell, and make your garden bigger and cuter.
> • 🐾 8 pets hatch from eggs (the Dream Phoenix is super rare)
> • 🤝 Play with friends to raise your Friendship Level — and grow a Promise Flower together
> • 📖 Pet Book & Crop Book. Weather can turn crops Golden or Rainbow
> • 🌳 Grow the Community Tree, the guardian of this land, together — and cheer it up when a gloomy cloud comes
> • 🏠 Build your own secret base, decorate the room with furniture, and give your garden a makeover
> • 🎁 Daily bonus, daily wishes, and a daily shop
> No stealing — nobody can mess with your garden.

## アイコン・サムネイル（案）

いずれも**ゲームの中で撮った画面**をもとに作る（中身と違う絵にしない）。
- アイコン（512×512）: 実った作物（いちごグミ）とグミベアのペットを大きく1つずつ。背景はピンクの空。文字は入れない（小さいと読めないため）
- サムネイル1（1920×1080）: 庭の全体。木の床・白い柵・実った畑・キラキラ
- サムネイル2: みんなの木のレベルアップの瞬間（光る飾り・紙ふぶき）
- サムネイル3: ペットのたまごが割れる場面
- 撮り方: ボタンなどの画面（UI）は Play 中だけ出るので、UI の無い絵は Studio の編集画面で撮る（Play で一度遊んで畑を実らせた状態を見せたいときは、Play 中に Windows の Snipping Tool で撮る）

## 公開前チェックリスト

- [ ] **本番の保存場所の古いテストデータを消す**（`CandyGardenV1` の `u_-1` `u_-2` `u_-3` と自分のキー）
- [ ] 作品の設定 → 「Studio から API サービスへのアクセス」がオン（保存のため）。本番では自動で有効
- [x] 最大人数を 8 にする（`Config.MaxPlots` と同じ）。クリエイターハブ → プレース → アクセス →「最大訪問者数」で設定済み（2026-10-19）
- [x] 体験のアンケート（Experience Questionnaire）に答えて、年齢の目安（Maturity）をもらう。2026-10-19 に送信（プレビューは「極少（Minimal）」）
- [ ] ログインコード（`Codes.luau`）を見直す。期限・ごほうびの量
- [ ] ゲームパスを作るなら、ID を `Config.Passes` に入れる（0 の間は画面に出ない）
- [x] 音の素材が使えるか確認（2026-10-19 に Studio で読み込めることを確認）（効果音: Daily Sounds、BGM: DistrokidOfficial。どちらも無料で使える素材。公開後に音が鳴らなければ、権利の都合で使えなくなっているので差し替える）
- [ ] スマホで遊んでみる（Studio の「テスト → デバイス」で iPhone SE・タブレットを確認）
- [x] 名前（キャンディガーデン Candy Garden）と説明文を入れる（Studio の「バーチャル空間設定」で設定済み）
- [ ] アイコン・サムネイルを入れる（アイコンは 2026-10-19 に `icon_pets.png` へ差しかえ済み。サムネイルはまだ）（クリエイターハブ → 作品 → 「場所」→ サムネイル／アイコン からアップロード）
  - 新しい版（2026-10-18、新しい3Dペットで撮り直し）: アイコン `icon_pets.png`（512×512、文字なし）、1枚目のサムネイル `thumb0_pets.jpg`（1920×1080、ペット8匹とみんなの木＋タイトル）
  - 2・3枚目は `thumb1_garden.png`・`thumb2_tree.png`。`thumb3_pals` と `icon.png` は昔のまるいペットなので使わない
- [ ] 公開範囲を「公開」にする（**それまでは非公開のまま**）
