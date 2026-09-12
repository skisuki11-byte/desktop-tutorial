---
name: session-optimization
description: Standing operating policy for running Claude Code sessions in this repo efficiently — choosing the right model (Opus for complex design/architecture/investigation, Sonnet for normal implementation, Haiku for routine/repetitive chores) and managing context so a session lasts longer within usage limits before hitting compaction or context-rot quality loss. Always apply as a default habit when starting substantial work (new app/feature, multi-file investigation, redesign, long-running PR babysitting), not only when the user explicitly asks about "セッション最適化", "モデルの使い分け", "トークン節約", "コンテキストを長く使いたい", "コストを抑えたい", or "セッションの使い方を振り返って".
---

# セッション最適化ポリシー

このリポジトリで作業する際の恒久方針。「複雑な調査・設計・構築には高性能モデル、定型的な
繰り返し作業には軽量モデル」を毎回自然に使い分け、コンテキストを無駄遣いしないことで、
同じ利用枠の中でより長く・多くの作業をこなせるようにする。`best-practice-first` と同様、
言われた時だけでなく毎回のデフォルト動作として適用する。

## 前提：このセッション自身の過去ログは見えない

Claude Code には個々のセッションのトークン数・コストを遡って集計するツールがない。
「これまでの使い方を振り返って」と頼まれても、実測値ではなく一般的な無駄遣いパターン
（下記チェックリスト）に照らして自己点検することしかできない。だからこそ、振り返りを
一回やって終わりにするのではなく、このスキルとして恒久的な運用ルールに落とし込み、
以後すべてのセッションで自動的に効くようにする。

## 世の中の成功・失敗事例（根拠）

詳細は `references/case-studies.md` を参照。要点:

1. **成功: Anthropicのマルチエージェント研究システム** — 司令塔にOpus、並列サブエージェント
   にSonnetを使う設計で、単体Opusより90.2%高い成果を出した。ただしトークン消費は通常の
   チャットの約15倍にもなる。→ 教訓: 「強いモデルに全部投げる」も「全部安いモデルで済ます」
   も間違いで、役割に応じて使い分けてこそ効果とコストが釣り合う。
2. **成功: プロンプトキャッシュ** — 同じ前置き（システムプロンプト・スキル・CLAUDE.md等）を
   使い回すとコスト最大90%減・レイテンシ最大85%減。ある企業はキャッシュヒット率を7%→84%に
   上げてコストを59〜70%削減した。→ 教訓: 大きく安定した内容（このスキル群など）は不用意に
   書き換えず、会話の先頭側を安定させることでキャッシュが効き続ける。
3. **失敗: AutoGPT（2023）** — コスト上限も終了条件もない自律ループで、1タスク平均$14.40、
   ひどい場合は数百ドルを浪費。同じ検索を繰り返すだけの無限ループが典型例。→ 教訓: 自律的・
   反復的な処理には必ず終了条件とチェックポイントを設け、「進捗を出さない繰り返し」を許さない。
4. **失敗: コンテキスト・ロット（Chroma社の2025年研究）** — 18の最先端モデル全てが、入力が
   長くなるほど性能劣化。最大コンテキストの50%付近で性能が45.5%も急落する例も。情報が
   文脈の中盤にあると精度が3割以上落ちる「Lost in the Middle」も確認された。→ 教訓: 1つの
   セッションに無関係な作業を詰め込んで肥大化させない。読み込む情報は必要な範囲に絞る。
5. **成功: Anthropic公式「Effective context engineering for AI agents」（2025年9月）** —
   compaction（生のツール出力は使い終わったら消す）・structured note-taking（コンテキスト外
   にメモを書き、後で読み戻す）・sub-agent architectures（重いサブタスクは専用の
   サブエージェントに分岐させ、結果の要約だけ本流に合流させる）の3本柱。→ 教訓: この
   スキルの委譲方針は3番目にすでに沿っていたが、2番目（`TaskCreate`/`TaskUpdate`による
   進捗の外部化）は促されても使っていなかった実例がある。複数ステップのセッションでは
   使うこと。

## 実践ルール（このリポジトリでの具体的な使い分け）

詳細と対応表は `references/checklist.md` を参照。要約:

- **モデルの使い分け**
  - 高性能モデル（Opus）: 新しいアプリの設計、複数アプリ・複数ファイルにまたがる調査、
    デザイン刷新の企画・意思決定、原因不明のバグの根本調査。
  - 標準モデル（Sonnet, デフォルト）: 通常の実装・修正・レビュー対応・PRのやり取り。
  - 軽量モデル（Haiku）: 単純なファイル検索、定型フォーマットの確認、繰り返しのステータス
    確認など「判断がほぼ要らない」作業。`Agent` ツールの `model` パラメータや、`Explore`
    エージェントの活用で、サブタスク単位で軽量モデルに逃がす。
- **コンテキストを膨らませない**
  - 大きなファイルを丸ごと読まず、`Grep`/`Glob` で当たりを付けてから必要な範囲だけ `Read`。
  - 使わないツールのスキーマは `ToolSearch` で必要な時だけ読み込む（このセッションで既に
    そう構成されている仕組みを維持する）。
  - 無関係な新しい作業は、同じスレッドを引き伸ばすのではなく新しいセッション/PRに分ける。
- **ループ・自動化には必ず終了条件を持たせる**
  - `ScheduleWakeup`/Routineでのポーリングは短すぎる間隔を避け、進捗のない繰り返しを
    続けない。AutoGPTの教訓通り、無限に回さない。
- **キャッシュを活かす**
  - CLAUDE.md やスキルなど安定した大きな内容は不要に書き換えない。会話の先頭を安定させる。
- **長い調査・並行作業はサブエージェントに逃がす**
  - 独立して進められる調査は `Agent`(`run_in_background`)で並行させ、メインの会話を
    無駄なポーリングで埋めない。
- **進捗はコンテキストの記憶任せにせず外部化する**
  - 3ステップ以上・複数の作業にまたがるセッションでは `TaskCreate`/`TaskUpdate` で
    進捗を管理する（structured note-taking）。促されたら使う。
- **最適化の軸を混同しない**
  - Message Batches API（非同期50%引き）はClaude Codeの対話的セッションには関係ない。
    別の文脈（Claude APIを直接使った大量非同期処理）の話。
