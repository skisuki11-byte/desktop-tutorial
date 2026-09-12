---
name: design-best-practices
description: Apply world-class UI/UX and visual design best practices — distilled from analyzing real-world success and failure cases (Apple, Google Material, Stripe, Airbnb, Duolingo vs. Windows 8, Digg v4, Snapchat 2017, GAP logo, Juicero, MySpace) — whenever creating or redesigning a screen, layout, component, or visual style for this repo's apps (cashbook, dividend, yosou, solar, sekaishi, youtube, or any new one). Trigger on "デザイン", "UI", "UX", "見た目", "配色", "レイアウト", "画面を作って", "アプリを作って", "デザインして", or any request to design/redesign a screen or app.
---

# デザインベストプラクティス

このスキルは「世の中の成功事例・失敗事例を分析し、ベストプラクティスとして体系化したデザイン知識」を、
このリポジトリのアプリ（すべて依存ライブラリなしの静的 HTML/CSS/JS の PWA）に適用するためのものです。
デザインに関わる作業（新規画面作成・既存画面の改善・配色変更・レイアウト調整など）では、必ずこのスキルを読み、
根拠（原則・事例）を持った上で手を動かしてください。「なんとなく良さそう」ではなく「なぜ良いか」を説明できる状態を目指します。

## 使う場面

- 新しいアプリ／画面をゼロから作るとき
- 既存アプリ（cashbook, dividend, yosou, solar, sekaishi, youtube 等）の見た目・使い勝手を改善するとき
- 配色・タイポグラフィ・余白・コンポーネントの一貫性について判断が必要なとき
- 「デザインにこだわって」と言われたとき（ユーザーの恒久的な好みでもある）

## ワークフロー

1. **原則を確認する** — `references/principles.md` を読み、視覚階層・タイポグラフィ・配色・余白・一貫性・
   アクセシビリティ・モーションの各原則を思い出す。
2. **事例で裏付ける** — `references/case-studies.md` の成功/失敗事例から、今回の判断に近いものを1つ以上引用できる状態にする。
   例:「配色を1アクセントカラーに絞る（Stripe型）」「機能を削って改悪しない（Digg v4の教訓）」など。
3. **このリポジトリ向けチェックリストを適用する** — `references/checklist.md` に従い、
   ダークモード・日本語タイポグラフィ・タッチターゲット・数値の見せ方（家計簿・配当金など数値主体の画面）を確認する。
4. **実装する** — 既存アプリの `css/style.css` や `app.css` のトークン（CSS変数）を尊重しつつ、一貫性を優先する。
   新規アプリでも、他アプリと肌触りが揃うように配色・角丸・余白のスケールを合わせる。
5. **説明する** — 変更後、なぜその配色・レイアウトにしたかを1〜2文で説明できるようにする
   （ベストプラクティス＋事例に基づく判断であることを明示する）。

## 核となる原則（要約。詳細は references/principles.md）

1. **視覚的階層** — 情報の重要度に応じてサイズ・太さ・色・余白で優先順位をつける。全部強調は無強調と同じ。
2. **タイポグラフィ** — 日本語は行間 1.6〜1.8、基準フォントサイズ 16px 以上、数字は `font-variant-numeric: tabular-nums`。
3. **配色とコントラスト** — アクセントカラーは1〜2色に絞る。文字と背景のコントラスト比 4.5:1 以上（WCAG AA）。
4. **余白とグリッド** — 4/8px ベースのスペーシングスケールで統一し、余白の「なんとなく」をなくす。
5. **一貫性（デザインシステム的思考）** — 色・角丸・影・アニメーション速度を CSS 変数化し、アプリ間・画面間で使い回す。
6. **モーションとフィードバック** — 保存・成功・エラーには短い（150〜300ms）フィードバックを入れる。ただし `prefers-reduced-motion` に配慮。
7. **アクセシビリティ** — タッチターゲット 44×44px 以上、フォーカスリング維持、色だけに意味を持たせない（色覚多様性対応）。
8. **機能を壊さない改悪をしない** — 見た目を刷新しても、ユーザーが依存している核となる操作導線は削らない・迷わせない。

## 参考資料

- `references/principles.md` — 各原則の詳細と実装レベルのガイド（CSS変数の例つき）
- `references/case-studies.md` — 成功事例・失敗事例と、そこから導いた教訓
- `references/checklist.md` — このリポジトリ（家計簿・配当金・予想・太陽光・世界史・YouTube系アプリ）に適用するための実践チェックリスト
