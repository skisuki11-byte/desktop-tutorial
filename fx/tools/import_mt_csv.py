"""import_mt_csv.py — MT4/MT5形式のCSV(Date,Time,OHLCV)をparquetに変換する。

    python fx/tools/import_mt_csv.py --src fx/data/raw/USDJPY_5m_recent.csv \
        --out fx/data/USDJPY_M5.parquet

入力形式（ヘッダあり、日付はYYYYMMDD）:
    Date,Time,Open,High,Low,Close,Volume
    20200101,22:00:00,108.730,108.751,108.715,108.751,23940000

■ 時刻帯を «対照実験» で特定した ■

この形式のCSVには時刻帯の記載がない。仲値アノマリーはJST 9:00-9:55の
55分の窓なので、1時間ずれれば別の時間帯を検証したことになる。
推測せず、次の対照実験で決めた:

  東京は夏時間を採用しない。ロンドンとNYは採用する。
  したがってデータが固定オフセットなら、東京のピークだけが動かないはず。

  市場          夏時間   冬のピーク  夏のピーク  ずれ
  東京オープン   なし     0時       0時      ±0   ← 動かない
  ロンドン       あり     8時       7時      -1
  NY            あり    15時      14時      -1

東京オープン(09:00 JST)が0時にある = オフセットは UTC+0。**データはUTC。**
DST変換は不要（--tz で上書きできる）。

週境界も整合する: 日曜21-23時に開き、金曜21時台に閉じる
（NY 17:00 = 21/22 UTC）。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from spread_model import SpreadModel


def convert(src: Path, tz: str) -> pd.DataFrame:
    df = pd.read_csv(src)
    need = {"Date", "Time", "Open", "High", "Low", "Close"}
    if not need <= set(df.columns):
        raise SystemExit(f"列が足りません。必要: {sorted(need)} / 実際: {list(df.columns)}")

    dt = pd.to_datetime(df["Date"].astype(str) + " " + df["Time"].astype(str),
                        format="%Y%m%d %H:%M:%S")
    ts = (dt.dt.tz_localize("UTC") if tz == "UTC"
          else dt.dt.tz_localize(tz, ambiguous="NaT",
                                 nonexistent="NaT").dt.tz_convert("UTC"))

    out = pd.DataFrame({
        "ts": ts,
        "open": df["Open"], "high": df["High"],
        "low": df["Low"], "close": df["Close"],
        "volume": df.get("Volume", 0),
    }).dropna(subset=["ts"]).sort_values("ts").drop_duplicates("ts", keep="last")
    return out.reset_index(drop=True)


def verify_timezone(out: pd.DataFrame) -> bool:
    """変換後のUTCで «東京は動かず、ロンドン/NYは動く» ことを確かめる。

    これが崩れていたら時刻帯の仮定が誤っている。仲値の検証が無意味になるので、
    毎回自動で確認する。
    """
    h = out["ts"].dt.hour
    m = out["ts"].dt.month
    winter, summer = [11, 12, 1, 2], [5, 6, 7, 8]

    def peak(months, hours):
        sub = out[m.isin(months) & h.isin(hours)]
        return int(sub.groupby(h[sub.index])["volume"].mean().idxmax())

    cases = [("東京オープン", "なし", [22, 23, 0, 1, 2], 0),
             ("ロンドン", "あり", [6, 7, 8, 9, 10], -1),
             ("NY", "あり", [11, 12, 13, 14, 15], -1)]

    print("\n時刻帯の検算（東京は夏時間なし／ロンドン・NYはあり）")
    print(f"  {'市場':>12} {'冬':>6} {'夏':>6} {'ずれ':>6} {'期待':>6} {'判定':>5}")
    ok_all = True
    for name, _, hours, expected in cases:
        w, s = peak(winter, hours), peak(summer, hours)
        shift = s - w
        ok = shift == expected
        ok_all &= ok
        print(f"  {name:>12} {w:>5}時 {s:>5}時 {shift:>+6} {expected:>+6} "
              f"{'○' if ok else '×':>5}")
    print(f"  → {'UTCとして整合' if ok_all else '× 時刻帯を疑うこと（仲値が別の窓になる）'}")
    return ok_all


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--tz", default="UTC", help="入力の時刻帯。既定はUTC")
    p.add_argument("--pip", type=float, default=0.01)
    args = p.parse_args()

    if not args.src.exists():
        raise SystemExit(f"CSVがありません: {args.src}")

    out = convert(args.src, args.tz)
    ok = verify_timezone(out)
    out = SpreadModel(pip=args.pip).apply(out)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(args.out, index=False)

    gaps = out["ts"].diff()
    mid = (out["bid_c"] + out["ask_c"]) / 2
    span = (out["ts"].max() - out["ts"].min()).days / 365.25
    print(f"\n{len(out):,}本  {out['ts'].min()} 〜 {out['ts'].max()}  ({span:.1f}年)")
    print(f"足の間隔(中央値): {gaps.median()}")
    print(f"価格レンジ: {mid.min():.3f} 〜 {mid.max():.3f}")
    print(f"60時間超の欠損: {(gaps > pd.Timedelta(hours=60)).sum()}箇所")
    print(f"平均スプレッド: {(out['ask_c'] - out['bid_c']).mean() / args.pip:.2f} pips（合成値）")
    print(f"\n保存 -> {args.out}")
    if not ok:
        raise SystemExit("時刻帯の検算に失敗しました。--tz を確認してください。")


if __name__ == "__main__":
    main()
