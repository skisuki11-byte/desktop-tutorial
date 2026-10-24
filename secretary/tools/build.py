#!/usr/bin/env python3
"""src/ の .gs をぜんぶ1つにまとめて dist/secretary.gs を作る。

GASのエディタでファイルを12個作るのは面倒なので、貼り付け1回で済むようにする。
GASはもともと全ファイルを1つにつないで動かすので、まとめても動きは変わらない。

    python3 tools/build.py
"""

import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent.parent
SRC = HERE / "src"
OUT = HERE / "dist" / "secretary.gs"

HEADER = """/* =====================================================================
 * AI秘書 — これ1つで動きます
 *
 * src/ の中身をつないだものです。中身を直すときは src/ のほうを直して
 * tools/build.py を動かし直してください。
 *
 * 【使いかた】
 *  1. script.google.com で「新しいプロジェクト」
 *  2. 最初からある「コード.gs」の中身を消して、このファイルをぜんぶ貼る
 *  3. ⚙プロジェクトの設定 →「appsscript.json をエディタで表示する」にチェック
 *     → appsscript.json を src/appsscript.json の中身に差し替える
 *  4. 同じ画面の「スクリプト プロパティ」に鍵を3つ入れる
 *       GEMINI_API_KEY             … aistudio.google.com/apikey で発行（無料）
 *       LINE_CHANNEL_ACCESS_TOKEN  … LINE Developers の長期アクセストークン
 *       WEBHOOK_TOKEN              … 自分で決めた合言葉
 *  5. 関数リストから setup を選んで実行（初回は承認を求められます）
 *  6. デプロイ → ウェブアプリ → 出たURLの末尾に ?token=合言葉 を付けて
 *     LINE Developers の Webhook URL に貼る
 *
 * くわしくは README.md を見てください。
 * ===================================================================== */

"""


def main() -> None:
    files = sorted(SRC.glob("*.gs"))
    if not files:
        raise SystemExit("src に .gs がありません")

    parts = [HEADER]
    for path in files:
        text = path.read_text(encoding="utf-8").rstrip()
        parts.append(f"/* ===== {path.name} ===== */\n\n{text}\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = "\n\n".join(parts) + "\n"
    OUT.write_text(body, encoding="utf-8")

    # 同じ名前の関数が二重に入っていないか見ておく（あとから足したときの取りこぼし用）
    names = re.findall(r"^function\s+([A-Za-z0-9_]+)\s*\(", body, re.M)
    dupes = sorted({n for n in names if names.count(n) > 1})

    print(f"{len(files)} ファイル → {OUT.relative_to(HERE)}")
    print(f"  {len(body.splitlines())} 行 / 関数 {len(names)} 個")
    if dupes:
        raise SystemExit(f"★ 同じ名前の関数があります: {', '.join(dupes)}")


if __name__ == "__main__":
    main()
