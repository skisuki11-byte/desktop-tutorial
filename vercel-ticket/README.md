# 春高チケット申し込み（Vercel 版）

土浦日大 女子バレーボール部の「春高バレー 応援チケット」の申し込み（ご家庭）と集計（役員）。
Vercel で公開し、データは Vercel の Storage から追加する **Neon（PostgreSQL）** に入れる。

- 申し込み画面：`https://（プロジェクト名）.vercel.app/`
- 役員の集計画面：`https://（プロジェクト名）.vercel.app/admin.html`（申し込み画面からはリンクしない）

> 以前の版（`ticket/`：GitHub Pages ＋ Google Apps Script ＋ スプレッドシート）は、移行が終わるまで別システムとして残している。この版はスプレッドシートを使わない。

## しくみ

| 場所 | 中身 |
|---|---|
| `public/` | 画面（申し込み `index.html`・集計 `admin.html`・`css/`・`js/`）。設定は `public/js/config.js` |
| `api/ticket.js` | 画面からの問い合わせを受ける関数（同じサイトからの POST だけ） |
| `lib/core.js` | 申し込み・役員の操作の本体。日付・区分・値段は画面と同じ `config.js` を読む |
| `tests/` | テスト（`core.test.js`）と手元で動かすサーバー（`dev-server.js`） |

- **申し込みの「合札」を60日のクッキーで渡す**：受付番号と合鍵を、サーバーから HttpOnly のクッキーとしてスマホに残す。LINE の中のブラウザでページの保存が消えても、同じスマホなら「申し込み済み」が出て修正できる。
- **役員の合言葉**は環境変数 `ADMIN_PASS` に入れる（コード・データベースには書かない）。ひらがな／カタカナ、全角／半角、大文字／小文字の違いは同じとみなす。10分に20回まちがえると10分止まる。
- **締め切り日**は集計画面の「申し込みの締め切り」で決める。その日の 23:59（日本時間）を過ぎると、ご家庭の申し込み・修正・取り消しが止まる（役員の操作はできる）。
- テーブル（`entries`・`settings`・`counters`）は最初の問い合わせのときに自動で作る。

## 公開の手順（最初の1回）

1. https://vercel.com を開き、**Continue with GitHub** で GitHub の `skisuki11-byte` としてログインする（プランは Hobby＝無料）
2. **Add New… → Project** で `desktop-tutorial` を **Import** する（一覧に出ないときは「Adjust GitHub App Permissions」でこのリポジトリを許可）
3. 設定画面で
   - **Project Name**：`shunko-ticket` など（URL になる）
   - **Root Directory**：`vercel-ticket`
   - **Framework Preset**：Other（ビルドの設定は空のまま）
   - **Environment Variables**：`ADMIN_PASS` ＝ 役員の合言葉
   - **Deploy** を押す
4. できたプロジェクトの **Storage** タブ → **Create Database** → **Neon**（Serverless Postgres）→ 無料プラン、地域は **Tokyo**（なければ Singapore）→ このプロジェクトにつなぐ（`DATABASE_URL` などが自動で入る）
5. **Deployments** タブ → いちばん上の右の「…」→ **Redeploy**（つないだデータベースを読み込ませる）
6. 申し込み画面と `/admin.html` を開いて確かめる

以後は、GitHub の `main` に変更が入るたびに Vercel が自動で公開し直す。

## 手元での確認

```bash
cd vercel-ticket
npm install
# テスト（中身を消すので、テスト用のデータベースを使う）
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/ticket_test npm test
# 手元で動かす
DATABASE_URL=postgres://user:pass@localhost:5432/ticket_test ADMIN_PASS=demo PORT=8790 npm run dev
```

`public/js/config.js` の `endpoint` を空にすると「デモ表示」（データベースなし、この端末の中だけ。役員の合言葉は `demo`）。
