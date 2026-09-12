---
name: analysis-best-practices
description: Apply world-class analytical rigor — root-cause analysis, hypothesis-driven investigation, bias-aware statistical reasoning, and behavioral-psychology insight into why people actually act — distilled from real-world success and failure cases (John Snow's cholera map, Toyota's Five Whys, Amazon's Correction of Errors, Moneyball, Netflix vs. Blockbuster, the Challenger disaster, LTCM's collapse, Zillow Offers, Target's pregnancy-prediction backlash, Kodak's buried digital camera, the disposition effect, Save More Tomorrow, the testing effect, YouTube's watch-time-optimization backlash) — whenever analyzing data, investigating a cause, evaluating a trend, or writing up findings for this repo's apps (yosou exam predictions, youtube channel analytics, dividend/investment tracking, solar output, cashbook spending, sekaishi exam-pattern study) or any other repo. Trigger on "分析", "分析力", "原因", "なぜ", "根本原因", "考察", "傾向", "予測", "検証", "データ分析", "相関", "因果", "心理", "行動", or any request to investigate why something happened, evaluate a trend, or back a conclusion with data.
---

# 分析ベストプラクティス

「世の中の成功事例・失敗事例を分析し、ベストプラクティスとして体系化した分析力」を、実際の
データ分析・原因究明・傾向評価に適用するためのスキルです。数字を並べて雰囲気で結論を出すのではなく、
「なぜそう言えるのか」を毎回説明できる状態を目指します。`best-practice-first` の一般原則をデータ分析・
原因究明という領域に特化させたものです。

## 使う場面

- 数値データから傾向・原因・示唆を導き出すとき（アクセス数、支出、配当、発電量、出題傾向など）
- 「なぜ〇〇になったのか」を突き止めるとき（バグの原因調査、指標悪化の原因調査を含む）
- 施策・予測・主張の妥当性を検証するとき（過去データからの予測、少数事例からの一般化）
- レポート・考察・分析結果をまとめて説明するとき

## ワークフロー

1. **問いを具体化する** — 「分析して」ではなく「何が知りたいか」を1文にする。指標の悪化原因なのか、
   傾向の方向性なのか、施策の効果なのか。問いが曖昧なまま数字をいじらない。
2. **MECEに要因を分解する** — `references/principles.md` のロジックツリー／フィッシュボーン図の要領で、
   考えられる原因・切り口を漏れなく重複なく列挙してから、データで絞り込む。思いついた1つの仮説に飛びつかない。
3. **なぜを最低3〜5段掘る** — 表面的な現象（「数字が下がった」）で止めず、`references/principles.md` の
   なぜなぜ分析に従って構造的な原因（設計判断・仕組み・プロセス）まで掘り下げる。
4. **相関と因果を区別する** — 2つの数字が一緒に動いただけで因果と決めつけない。比較対象（前年同期、
   同規模の他チャンネル、施策なし群）を用意できているか、母数・サンプルサイズが十分かを確認する。
   `references/principles.md` のバイアス一覧（生存者バイアス・基準率の無視・選択バイアス）を自己点検する。
5. **事例で裏付ける** — `references/case-studies.md` の成功/失敗事例から、今回の分析の型に近いものを
   1つ以上引用できる状態にする。例:「上位だけでなく尾も見る（Moneyballの教訓）」
   「見た目の相関を除外データ抜きで信じない（チャレンジャー号の教訓）」など。
6. **このリポジトリ向けチェックリストを適用する** — `references/checklist.md` に従い、
   yosou（予想）・youtube（チャンネル分析）・dividend（配当）・solar（発電量）・cashbook（家計）・
   sekaishi（出題傾向）それぞれの落とし穴を確認する。
7. **不確実性を明示して伝える** — 「まだ偶然の可能性がある」「母数が少ない」など、断定できない部分は
   断定しない。過度に精密な数字（false precision）で確信度を偽装しない。
8. **数字の裏にいる人の心理を踏まえる** — 最終的に数字を動かしているのは人の意思決定である。
   `references/psychology.md` の損失回避・メンタルアカウンティング・内発的動機づけなどの原則に
   照らして、「なぜ人はそう行動したか」「施策は人の心理に沿っているか」まで考える。
9. **可視化が絡む場合は dataviz スキルを併用する** — グラフ・チャートで見せる分析は、`dataviz` スキルの
   色・軸・注釈の原則も併用する。

## 核となる原則（要約。詳細は references/principles.md）

1. **問いファースト** — 何を明らかにしたいかを先に決めてから数字を見る。逆はやらない。
2. **MECEな要因分解** — ロジックツリー／フィッシュボーン図で漏れなく重複なく切り分ける。
3. **なぜなぜ分析（Root Cause）** — 症状ではなく構造的原因に達するまで掘る（目安5回）。
4. **相関≠因果** — 比較対象・母数・交絡要因を確認しない限り、因果を主張しない。
5. **バイアスの自己点検** — 生存者バイアス、基準率の無視、選択バイアス、確証バイアスを疑う。
6. **整合性チェック** — 同じ結論を別の測り方でも導けるか、2通り以上の算出方法で突き合わせる。
7. **プレモータム（事前検死）** — 結論・施策を決める前に「これが外れるとしたら何が原因か」を先に考える。
8. **不確実性の明示** — サンプルが小さい・偶然の可能性がある場合はそう書く。過剰な確信を装わない。
9. **心理学の組み込み** — 損失回避・メンタルアカウンティング・内発的動機づけなど、数字を動かす
   人間の心理を踏まえて解釈し、施策を設計する。「最後は人の心が動く」ことを前提にする。

## やってはいけないこと

- 母数・比較対象なしに「増えた/減った」だけで結論を出すこと
- 1つの仮説に飛びついて他の要因を検証せずに切り捨てること
- 都合の良いデータ（うまくいった例）だけを見て、うまくいかなかった例を無視すること（生存者バイアス）
- 相関があるというだけで因果関係があるかのように書くこと
- 不確かな結論を、確信があるかのような断定的な言い方で伝えること

## 参考資料

- `references/principles.md` — 分析フレームワークの詳細（MECE・なぜなぜ分析・相関と因果・バイアス一覧など）
- `references/case-studies.md` — 成功事例・失敗事例と、そこから導いた教訓
- `references/psychology.md` — 損失回避・メンタルアカウンティング・内発的動機づけなど、分析に組み込む心理学の原則と実例
- `references/checklist.md` — このリポジトリ（yosou/youtube/dividend/solar/cashbook/sekaishi）に適用するための実践チェックリスト
