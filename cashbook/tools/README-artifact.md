# 役員用ページ（claude.ai の Artifact）の更新手順

会計担当から受け取ったJSONで、役員が見るページを最新にする手順です。
**新しい会話でこのリポジトリだけを渡された場合も、これを読めば作れます。**

## 前提

- 帳簿の中身（個人名・金額）は**このリポジトリに入っていません**。毎回、会計担当から
  受け取るJSONを使います。受け取ったJSONを**リポジトリに置かないでください**。
- 反映先のArtifactのURLは、会計担当が知っています。メッセージに書かれていない場合は
  必ず本人に確認してください。**推測して別のページを上書きしないこと。**

## 手順

```bash
# 1. 受け取ったJSONを、リポジトリの外（作業用の場所）に置く
#    例: /tmp/backup.json

# 2. 単一ファイル版を組み立てる（--data で渡すので、リポジトリは汚れない）
cd cashbook
python3 tools/build_artifact.py --data /tmp/backup.json
```

うまくいくと、こう出ます。

```
取り込み: ○○件 / 現在残高 ○,○○○,○○○
saved: .../cashbook/dist/artifact.html ○○○,○○○ bytes
OK: 単一ファイルとして整合
```

- **残高が合わないJSONは、ここで止まります。**「残高が合いません」と出たら
  組み立てずに、会計担当に確認してください。勝手に直さないこと。
- 出てきた件数と残高を、会計担当のメッセージと照合してください。

```bash
# 3. できた cashbook/dist/artifact.html を Artifact として公開する
#    （Artifact ツールに、会計担当から聞いたURLを url として渡す。
#     favicon は 📒、capabilities は {"downloads": true} を維持する）
```

## 公開するときの決まり

| 項目 | 値 |
|---|---|
| ファイル | `cashbook/dist/artifact.html` |
| url | 会計担当から聞いたURL（**新規に作らない**。同じページを更新する） |
| favicon | 📒 |
| capabilities | `{"downloads": true}` |

## やってはいけないこと

- 受け取ったJSONや、実データ入りの `data/ledger.js` を**コミットしない**
- `dist/artifact.html`（実データ入り）を**コミットしない**
- Artifactの**URLをこのリポジトリに書かない**
- パスワード（ログイン用・管理者用）を**平文で書かない**。`js/auth.js` はハッシュだけを持つ

## 確認したいとき

`cashbook/` には動作確認用のスクリプトは入れていません（開発一式は会計担当が
ZIPで持っています）。中身を軽く確かめるだけなら、組み立て後に次を見てください。

- 件数と残高が、上記の出力と会計担当の申告に一致しているか
- `dist/artifact.html` に `<html>` `<head>` `<body>` `<!DOCTYPE>` が無いこと
  （build_artifact.py が自動で確認し、あれば止まります）
