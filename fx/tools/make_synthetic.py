"""make_synthetic.py — エッジが存在しないダミーデータを作る。

    python fx/tools/make_synthetic.py --out fx/data/SYNTH_M5.parquet

なぜ必要か(docs/03 §7):
検証コードを書いたら、まずこのデータで回す。**必ず負けるのが正しい。**
スプレッドとスリッページの分だけ削られるため。
ここで勝ってしまったら、未来参照かコスト未計上のバグがある。

生成するもの: ドリフトなしの幾何ブラウン運動(=エッジゼロ)に、
実データと同じ bid/ask スキーマと時間帯別スプレッドを載せたM5足。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from spread_model import SpreadModel


def make(years: float, start_price: float, annual_vol: float, seed: int,
         pip: float) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # M5足を平日24時間ぶん。週末は後で落とす。
    n = int(years * 365 * 24 * 12)
    ts = pd.date_range("2016-01-04 00:00", periods=n, freq="5min", tz="UTC")

    bars_per_year = 252 * 24 * 12
    sigma = annual_vol / np.sqrt(bars_per_year)

    # ★ドリフトゼロ = エッジゼロ。ここに正のドリフトを入れてはいけない。
    log_ret = rng.normal(0.0, sigma, n)
    close = start_price * np.exp(np.cumsum(log_ret))

    # 足の中の高値安値。終値どうしの動きと整合する程度のノイズを載せる
    wick = np.abs(rng.normal(0, sigma * start_price * 0.5, n))
    open_ = np.r_[start_price, close[:-1]]
    df = pd.DataFrame({
        "ts": ts,
        "open": open_,
        "high": np.maximum(open_, close) + wick,
        "low": np.minimum(open_, close) - wick,
        "close": close,
        "volume": rng.integers(10, 200, n),
    })

    # 週末を除く(土日はFX市場が閉まる)
    wd = df["ts"].dt.weekday
    df = df[wd < 5].reset_index(drop=True)
    return SpreadModel(pip=pip).apply(df)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path("fx/data/SYNTH_M5.parquet"))
    p.add_argument("--years", type=float, default=10.0)
    p.add_argument("--price", type=float, default=110.0)
    p.add_argument("--vol", type=float, default=0.09, help="年率ボラ(USD/JPY想定)")
    p.add_argument("--pip", type=float, default=0.01)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    df = make(args.years, args.price, args.vol, args.seed, args.pip)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(args.out, index=False)

    mid = (df["bid_c"] + df["ask_c"]) / 2
    realized = mid.pct_change().std() * np.sqrt(252 * 24 * 12)
    print(f"{len(df):,}本 保存 -> {args.out}")
    print(f"期間          : {df['ts'].min()} 〜 {df['ts'].max()}")
    print(f"実現年率ボラ  : {realized:.1%}  (指定 {args.vol:.1%})")
    print(f"平均スプレッド: {(df['ask_c'] - df['bid_c']).mean() / args.pip:.2f} pips")
    print("\n※ このデータにエッジは存在しない。検証して勝ったらバグ。")


if __name__ == "__main__":
    main()
