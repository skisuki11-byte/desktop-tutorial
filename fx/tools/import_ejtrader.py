"""import_ejtrader.py — 公開GitHubリポジトリのFXヒストリカルをparquetに変換する。

    python fx/tools/import_ejtrader.py --symbol USDJPY --timeframe m15 \
        --out fx/data/USDJPY_M15.parquet

ソース: https://github.com/ejtraderLabs/historical-data
  Date,open,high,low,close,tick_volume  というヘッダ付きCSV。

■ このデータについて確認したこと（推測ではなく実測）■

1. 時刻は EET/EEST（UTC+2、夏時間は+3）。MT5サーバー時刻の標準。
   根拠: ティック出来高の日内プロファイルが
     - 冬(11-2月)は 2時、夏(4-10月)は 3時 に東京オープンのピーク
     - 10時にロンドンオープン、15-17時にNY のピーク
   夏時間の切替が実在するので、固定オフセットで変換してはいけない。
   **1時間ずれると仲値アノマリー(JST 9:00-9:55)は別の時間帯を見ることになる。**

2. 価格は1000倍された整数。80163.0 = 80.163円。

3. bid/ask を持たない（mid のみ）。SpreadModel で合成する。
   合成である以上、結果は「スプレッド前提が正しければ」という条件付き。

4. 土日のバーが存在しない。月曜00:00開始・金曜23:xx終了という
   EETサーバーの週境界と整合する。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from spread_model import SpreadModel

# MT5のEETサーバーはEUの夏時間規則に従う（3月最終日曜〜10月最終日曜）
SERVER_TZ = "Europe/Athens"

# シンボルごとの価格スケールとpip
SPECS = {
    "USDJPY": {"scale": 1000.0, "pip": 0.01},
    "EURJPY": {"scale": 1000.0, "pip": 0.01},
    "GBPJPY": {"scale": 1000.0, "pip": 0.01},
    "AUDJPY": {"scale": 1000.0, "pip": 0.01},
    "EURUSD": {"scale": 100000.0, "pip": 0.0001},
    "GBPUSD": {"scale": 100000.0, "pip": 0.0001},
    "AUDUSD": {"scale": 100000.0, "pip": 0.0001},
    "USDCHF": {"scale": 100000.0, "pip": 0.0001},
    "USDCAD": {"scale": 100000.0, "pip": 0.0001},
}


def convert(csv_path: Path, symbol: str) -> tuple[pd.DataFrame, float]:
    spec = SPECS[symbol]
    df = pd.read_csv(csv_path, parse_dates=["Date"])

    # EET/EEST -> UTC。ambiguous/nonexistent は夏時間切替の1時間に起きる
    ts = (df["Date"]
          .dt.tz_localize(SERVER_TZ, ambiguous="NaT", nonexistent="NaT")
          .dt.tz_convert("UTC"))
    dropped = int(ts.isna().sum())
    if dropped:
        print(f"  夏時間の切替で曖昧な {dropped} 本を除外")

    out = pd.DataFrame({
        "ts": ts,
        "open": df["open"] / spec["scale"],
        "high": df["high"] / spec["scale"],
        "low": df["low"] / spec["scale"],
        "close": df["close"] / spec["scale"],
        "volume": df["tick_volume"],
    }).dropna(subset=["ts"]).sort_values("ts").drop_duplicates("ts", keep="last")

    return out.reset_index(drop=True), spec["pip"]


def report(out: pd.DataFrame, pip: float) -> None:
    print(f"\n{len(out):,}本  {out['ts'].min()} 〜 {out['ts'].max()}")
    span = (out["ts"].max() - out["ts"].min()).days / 365.25
    print(f"期間: {span:.1f}年")

    gaps = out["ts"].diff()
    step = gaps.median()
    print(f"足の間隔(中央値): {step}")

    # 週末以外の大穴はデータ不良を疑う（docs/03 §9）。
    # EETサーバーの週末ギャップは金23:45→月00:00で約48時間あるため、
    # しきい値を36時間にすると週末を全部拾ってしまう（実測: 489箇所＝ほぼ週末の数）。
    # 60時間にすると本当の穴だけが残る。
    big = gaps[gaps > pd.Timedelta(hours=60)]
    print(f"60時間超の欠損: {len(big)}箇所（週末=約48時間は除外済み）")
    for idx, g in big.nlargest(5).items():
        print(f"    {out['ts'][idx - 1]} から {g}")

    mid = (out["bid_c"] + out["ask_c"]) / 2
    print(f"価格レンジ: {mid.min():.3f} 〜 {mid.max():.3f}")
    print(f"平均スプレッド: {(out['ask_c'] - out['bid_c']).mean() / pip:.2f} pips（合成値）")

    # 時刻変換が正しいかの検算: JST 9-11時に東京の出来高ピークが来るはず
    # 実測したJSTの出来高プロファイルに照らして検算する。
    # 静かなのは 5-8時(アジア早朝)。3-5時はまだNY引けの余韻があって静かではない。
    jst = out["ts"].dt.tz_convert("Asia/Tokyo")
    v = out.groupby(jst.dt.hour)["volume"].mean()
    checks = [
        ("東京オープン", v.loc[9:10].mean(), v.loc[7:8].mean(), "9時に立ち上がる"),
        ("ロンドン", v.loc[16:17].mean(), v.loc[13:14].mean(), "16時に立ち上がる"),
        ("NY", v.loc[22:23].mean(), v.loc[19:20].mean(), "22時に立ち上がる"),
    ]
    print("\n時刻変換の検算（JST基準の出来高プロファイル）")
    ok_all = True
    for name, active, quiet, why in checks:
        ok = active > quiet * 1.15
        ok_all &= ok
        print(f"  {name:<12} {active:>6.0f} vs 直前 {quiet:>6.0f}  "
              f"({active / quiet:.2f}倍)  {'○' if ok else '×'} {why}")
    print(f"  → {'変換は正しい' if ok_all else '× 変換を疑うこと（1時間ずれると仲値が別の窓になる）'}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path, default=None)
    p.add_argument("--symbol", default="USDJPY", choices=sorted(SPECS))
    p.add_argument("--timeframe", default="m15")
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    src = args.src or Path(f"fx/data/raw/{args.symbol}_{args.timeframe}.csv")
    if not src.exists():
        raise SystemExit(
            f"CSVがありません: {src}\n"
            f"  curl -sSL -o {src} \\\n"
            f"    https://raw.githubusercontent.com/ejtraderLabs/historical-data/"
            f"main/{args.symbol}/{args.symbol}{args.timeframe}.csv")

    print(f"読み込み: {src}")
    out, pip = convert(src, args.symbol)
    out = SpreadModel(pip=pip).apply(out)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(args.out, index=False)
    report(out, pip)
    print(f"\n保存 -> {args.out}")


if __name__ == "__main__":
    main()
