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
未実装: ペット、お天気、コミュニティの木、デイリーボーナス、課金。

## ルール

- 乱数・お金・在庫は全てサーバーで管理。Remoteは全て型を検証し、回数を制限する。
- 保存はDataStore。Studioでは「Enable Studio Access to API Services」をオンにすると保存を試せる（オフでも遊べる）。
- 同時人数は `Config.MaxPlots`（8）。Studioの Game Settings → Max Players も8にする。
