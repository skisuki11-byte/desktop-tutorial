"""fetch_nikkei.py — 日経平均の日次終値(1949-)を取得してparquetに変換する。

    python bullbear/tools/fetch_nikkei.py

出典: macrotrends.net (GitHub上のミラー経由で取得。直接アクセスは環境により
遮断されうるため、公開リポジトリのcommittedファイルを使う — fx/のデータ取得と
同じ経路)。

  https://github.com/KEIKEI999/StocPriceForecast
  raw: nikkei-225-index-historical-chart-data.csv

■ このデータの限界 ■
  - 終値のみ(OHLCではない)
  - 2020-04-23で止まっている。2020-2025年の直近レジーム(コロナ後の急騰・
    2024年8月の急落・日銀の政策転換)が欠けている
  - MACROTRENDS社の利用規約により「取引目的ではなく情報提供目的」との
    但し書きがある(TERMS OF USE参照)。実運用の判断根拠にはこのデータ単独では
    不十分で、直近データでの追加検証が必須(README「次にやること」参照)
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

SRC_URL = (
    "https://raw.githubusercontent.com/KEIKEI999/StocPriceForecast/"
    "master/nikkei-225-index-historical-chart-data.csv"
)
HEADER_SKIP = 16  # macrotrendsのフォーマットは免責事項が15行続き、16行目がヘッダ


def convert(src: Path) -> pd.DataFrame:
    df = pd.read_csv(src, skiprows=HEADER_SKIP, names=["date", "close"])
    df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d")
    return df.sort_values("date").drop_duplicates("date").reset_index(drop=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path, default=Path("bullbear/data/raw/nikkei225_close_1949_2020.csv"))
    p.add_argument("--out", type=Path, default=Path("bullbear/data/nikkei225_close.parquet"))
    args = p.parse_args()

    if not args.src.exists():
        raise SystemExit(
            f"CSVがありません: {args.src}\n"
            f"  curl -sSL -o {args.src} \\\n    \"{SRC_URL}\""
        )

    df = convert(args.src)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(args.out, index=False)

    gaps = df["date"].diff().dt.days
    r = df["close"].pct_change().dropna()
    print(f"{len(df):,}本  {df['date'].min().date()} 〜 {df['date'].max().date()}")
    print(f"欠損チェック: NaN={df['close'].isna().sum()}  10日超のギャップ={int((gaps>10).sum())}件")
    print(f"日次リターン標準偏差: {r.std():.2%}  (年率換算 {r.std()*252**0.5:.1%})")
    print(f"\n保存 -> {args.out}")
    print("\n※ 2020-04-23で終了。直近レジームは別途取得が必要(README参照)")


if __name__ == "__main__":
    main()
