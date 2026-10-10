"""import_histdata.py — HistData形式のM1 CSVを取り込み、M5 parquetに変換する。

    python fx/tools/import_histdata.py --src fx/data/raw --out fx/data/USD_JPY_M5.parquet

入力(HistData ASCII M1、セミコロン区切り、ヘッダなし):
    20230102 170000;131.062;131.070;131.055;131.061;0

■ 最重要の注意 ■
このデータは mid(またはbid)のみでスプレッドを含まない。したがって
tools/spread_model.py の SpreadModel で bid/ask を合成している。
合成である以上、バックテスト結果は「スプレッド前提が正しければ」という
条件付きの数字。実運用前に必ず業者の実スプレッド実績と突き合わせ、
迷ったら広めに設定すること。狭く見積もると、存在しないエッジがあるように
見えるという最悪の間違いを起こす。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from spread_model import SpreadModel

# HistData の時刻は EST(夏時間なし) = UTC-5 固定
SRC_TZ_OFFSET_HOURS = 5
COLUMNS = ["dt", "open", "high", "low", "close", "volume"]


def load_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, sep=";", header=None, names=COLUMNS)
    df["ts"] = (
        pd.to_datetime(df["dt"], format="%Y%m%d %H%M%S")
        .dt.tz_localize("UTC") + pd.Timedelta(hours=SRC_TZ_OFFSET_HOURS)
    )
    return df.drop(columns=["dt"])


def resample_m5(df: pd.DataFrame) -> pd.DataFrame:
    g = df.set_index("ts").resample("5min")
    return pd.DataFrame({
        "open": g["open"].first(),
        "high": g["high"].max(),
        "low": g["low"].min(),
        "close": g["close"].last(),
        "volume": g["volume"].sum(),
    }).dropna(subset=["open"]).reset_index()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path, required=True, help="M1 CSVを置いたディレクトリ")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--pip", type=float, default=0.01, help="JPYペア=0.01, 他=0.0001")
    args = p.parse_args()

    files = sorted(args.src.glob("*.csv"))
    if not files:
        raise SystemExit(f"CSVが見つかりません: {args.src}")

    frames = [load_csv(f) for f in files]
    print(f"{len(files)}ファイル / {sum(len(f) for f in frames):,}行 読み込み")

    m1 = (pd.concat(frames, ignore_index=True)
            .sort_values("ts")
            .drop_duplicates(subset="ts", keep="last"))
    out = SpreadModel(pip=args.pip).apply(resample_m5(m1))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(args.out, index=False)

    gaps = out["ts"].diff()
    print(f"\n{len(out):,}本 保存 -> {args.out}")
    print(f"期間: {out['ts'].min()} 〜 {out['ts'].max()}")
    print(f"最大の欠損: {gaps.max()}  (週末以外の大穴はデータ不良を疑う)")
    print(f"平均スプレッド: {(out['ask_c'] - out['bid_c']).mean() / args.pip:.2f} pips")
    print("\n次: python fx/tools/sanity_check.py で検証基盤を確認してから")
    print(f"    python fx/fx1.py {args.out} --strategy nakane")


if __name__ == "__main__":
    main()
