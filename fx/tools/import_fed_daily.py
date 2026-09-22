"""import_fed_daily.py — 米連邦準備制度の日次為替レートを取り込む。

    python fx/tools/import_fed_daily.py --out fx/data/USDJPY_D1.parquet

ソース: https://github.com/datasets/exchange-rates （FRB H.10 由来、日次・現在まで更新）

■ このデータで «できないこと» を先に書く ■

1. **取引可能な価格ではない。** FRBが公表する参照レート(正午買値)であって、
   実際に約定できるレートではない。バックテストの結果は
   「そういう値動きだった」ことしか言わない。執行を含む検証にはならない。

2. **日足なので日中の戦略は検証できない。** 仲値アノマリー(JST 9:00-9:55)は
   原理的に扱えない。

3. **OHLCがない。** 1日1本の値だけ。高値安値を使う戦略は近似になる。

4. **祝日で欠損する。** 日米それぞれの休場日が抜ける。

したがってこれは «M15データが2022年3月で終わっている» という穴を
部分的に埋めるためのもので、採用判定の根拠にはしない。
レジームが変わったかどうかの目安として見る。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

# 日足では時間帯別スプレッドが意味を持たない。往復で払う実勢の目安を固定で置く。
FLAT_SPREAD_PIPS = 1.0
PIP = 0.01


def convert(csv_path: Path, country: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df = df[df["Country"] == country].copy()
    if df.empty:
        raise SystemExit(f"{country} の行がありません")

    df["ts"] = pd.to_datetime(df["Date"], utc=True)
    rate = pd.to_numeric(df["Exchange rate"], errors="coerce")
    df = df.assign(rate=rate).dropna(subset=["rate"]).sort_values("ts")
    df = df.drop_duplicates("ts", keep="last")

    half = FLAT_SPREAD_PIPS * PIP / 2
    out = pd.DataFrame({"ts": df["ts"], "volume": 0})
    for col in ("o", "h", "l", "c"):        # OHLCがないので同じ値を入れる
        out[f"bid_{col}"] = df["rate"].to_numpy() - half
        out[f"ask_{col}"] = df["rate"].to_numpy() + half
    return out.reset_index(drop=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path, default=Path("fx/data/raw/fed_daily.csv"))
    p.add_argument("--country", default="Japan")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--since", default="2000-01-01")
    args = p.parse_args()

    if not args.src.exists():
        raise SystemExit(
            f"CSVがありません: {args.src}\n"
            f"  curl -sSL -o {args.src} \\\n"
            f"    https://raw.githubusercontent.com/datasets/exchange-rates/"
            f"main/data/daily.csv")

    out = convert(args.src, args.country)
    out = out[out["ts"] >= pd.Timestamp(args.since, tz="UTC")].reset_index(drop=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(args.out, index=False)

    mid = (out["bid_c"] + out["ask_c"]) / 2
    gaps = out["ts"].diff()
    print(f"{len(out):,}本  {out['ts'].min():%Y-%m-%d} 〜 {out['ts'].max():%Y-%m-%d}")
    print(f"価格レンジ: {mid.min():.2f} 〜 {mid.max():.2f}")
    print(f"欠損(5日超): {(gaps > pd.Timedelta(days=5)).sum()}箇所（祝日連休）")
    print(f"スプレッド: {FLAT_SPREAD_PIPS} pips 固定（日足では時間帯別に意味がない）")
    print(f"\n保存 -> {args.out}")
    print("\n※ 取引可能な価格ではない。採用判定には使わない（冒頭の注意を参照）。")


if __name__ == "__main__":
    main()
