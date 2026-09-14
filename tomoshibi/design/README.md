# ともしび — デザイン案（作り直し版）

Claude Design のキャンバスとして公開しているデザインのソース。
アートボード1枚＝`.dc.html` 1ファイル。`canvas.json` が配置と付箋を持つ。

## 方向

夜の弔い → 昼の「いっしょにいる」。

前の案（`../proposal.html`）は「別れを受け入れる」側に寄っていた。
今回は **Continuing Bonds（継続する絆／Klass, Silverman & Nickman, 1996）** に合わせ、
関係が続いていることを画面の中心に置く。灯りの橙だけを引き継ぎ、地を明るくした。

| 変更 | 前 | 今回 |
|---|---|---|
| 地 | 夜（#0e1013） | 昼（#FDFAF2） |
| 再会 | 年に一度だけ | 登録した動画をいつでも |
| 数字 | 次の節目まであと◯日 | おまいり通算◯回目 |
| 絵 | シルエット | 手描き風イラスト |
| 書体 | 明朝 | Zen Maru Gothic ＋ Zen Kaku Gothic New |

## アートボード

| ファイル | 画面 |
|---|---|
| `Main.dc.html` | おうち（ホーム）★ |
| `Onbo.dc.html` | おむかえ・写真の登録 |
| `Omairi.dc.html` | おまいり中（4動作＋季節のおそなえ） |
| `Kaeri.dc.html` | おまいりのあと（通算回数・庭に花が1つ） |
| `Ugoku.dc.html` | うごくあの子（動画） |
| `Niwa.dc.html` | おまいりの庭 |
| `Album.dc.html` | アルバム |
| `Parts.dc.html` | 配色・書体・イラストのパーツ表 |

## 通算回数にした理由

連続記録（ストリーク）は1日休むと途切れ、弔いに罪悪感を接続する。
通算は減らず、途切れず、休んでも何も失われない。庭の花も同じで枯れない。
他人の数は出さない。

## 作り直しかた

`.dc.html` を編集して、キャンバスを組み直す:

```
node "<designスキルのディレクトリ>/seed-canvas.mjs" \
  --template "<同>/payload.template.html" \
  --out tomoshibi-app.html --title "ともしび アプリデザイン" \
  --artboard Main.dc.html --artboard Onbo.dc.html ... \
  --canvas canvas.json
```

`_gen.py` は共通部分（犬のイラスト・花・タブバー）を組み立てるための補助。
`tomoshibi-app.html` は書き出し結果なので追跡しない（`.gitignore`）。
