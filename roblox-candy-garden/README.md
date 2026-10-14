# キャンディガーデン（仮）

お菓子の庭で、みんなで育てる協力型のRobloxゲーム。方針は [HANDOFF.md](HANDOFF.md)、環境は [SETUP-STATUS.md](SETUP-STATUS.md) を参照。

## 動かし方

1. Studioで空のPlace（Baseplate）を開く。
2. このフォルダで `rojo serve` を実行する。
3. StudioのプラグインタブでRojoを開き、**Connect**を押す。
4. ▶ Play（またはF5）。

マップ・植物・UIは全てコードで生成する（素材は使わない）。

## 構成

- `src/ReplicatedStorage/Shared/` Config（作物の数値）, Remotes, I18n（日本語/英語）
- `src/ServerScriptService/` Main と Services（Data, World, Garden, Shop, RateLimit）
- `src/StarterPlayer/StarterPlayerScripts/Client/` UI, Tutorial, Style

## 実装済み（縦のスライス）

区画 → 種を植える → 育つ → 収穫 → 売る → コイン表示 → 保存、初回チュートリアル。
ペット（Pals）: たまごを買う（確率を表示）→ 孵化演出 → 最大3匹を連れ歩く → 売値ボーナス。
お天気: 最初は起動60秒後、以後は約5分ごとに90秒、きらきら確率が上がる。お知らせ・残り時間チップ・降る粒子つき。
コミュニティの木: サーバー全員の収穫が成長ポイントになる協力要素。レベルが上がると、サーバーにいる全員にコインを配り、木が大きく飾りが増える。奪い合いの代わりの仕組み（進み具合はサーバーごと）。
おしゃれ（アバターアイテム）: ぼうし7・せなか5・トレイル3。全てコードで作った見た目で、コインで買える（無料の道）。最初にうさみみをプレゼント。
見た目: 子供が触りやすい作り（太い縁取り、丸いフォント、64px前後の大きなボタン、下の中央にドック）。Robloxの移動スティックとジャンプボタンの場所を避けて配置。
デイリーボーナス: 1日1回、ログインでもらえる。7日で一巡（種のおまけつき）。受け取れるときは自動で開く（初めての人のチュートリアル中は開かない）。休んだら連続日数が半分になって再開（0には戻さない）。日付はサーバーのUTC。
未実装: 本番のゲームパスID設定（上の「収益化」参照）、シーズンパス、期間限定ショップ。

## 収益化（ロバックス）の設定

方針: 序盤に課金を迫らない／ランダム要素にロバックスを使わない（中身が決まった商品だけ）／全ての見た目はコインでも手に入る。
パスは `Config.Passes` の `id` が 0 の間は画面に出ない・買えない。作ったら、IDを入れるだけで有効になる。

1. create.roblox.com → 作品 → Candy Garden Test → 収益化 → ゲームパス で、2つ作る。
   - `coins2x`「売値2倍」（便利さ）
   - `gold`「ゴールドパック」（限定の見た目: ゴールドのつばさ）
2. 各パスのIDを `src/ReplicatedStorage/Shared/Config.luau` の `Config.Passes` に入れる。
3. 値段は、公開前に自分で決める（Grow a Garden系は149〜699ロバックス帯と言われるが、出典が弱いので参考まで）。
4. たまごなどのランダム要素を将来ロバックスで売る場合は、全ての確率を表示し、`PolicyService` で対象外の人への扱いを分ける（公式: Paid random items policy）。

## 開発メモ

- Rojoは**Play中は変更を取り込まない**。Playを止めてから同期を待ち、次のPlayを始める。
- `execute_luau` は実行中のゲームと別のモジュールのコピーを作る。ゲーム内の状態を見るときは、UIやAttributeなど実物を読む。

## ルール

- 乱数・お金・在庫は全てサーバーで管理。Remoteは全て型を検証し、回数を制限する。
- 保存はDataStore。Studioでは「Enable Studio Access to API Services」をオンにすると保存を試せる（オフでも遊べる）。
- 同時人数は `Config.MaxPlots`（8）。Studioの Game Settings → Max Players も8にする。
