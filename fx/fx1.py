"""fx1.py — 1ファイルのバックテスト。Phase 1 の本体。

    python fx/fx1.py data/USD_JPY_M5.parquet
    python fx/fx1.py data/USD_JPY_M5.parquet --strategy breakout

やることは1つだけ:「この戦略にエッジがあるか」を判定する。
発注も口座もDBも扱わない。それは検証を通過してから考える。

■ 手を抜いてはいけない2点(残りは全部省いてよい)■
  1. ポジションは必ず1本ずらす(shift)。ずらさないと同じ足の終値で
     判断して同じ足で約定したことになり、未来を見て取引したのと同じ。
  2. ポジションが動いた足でスプレッドを払わせる。これを忘れると
     どんなノイズでも儲かって見える。

設計書との対応:
  - 戦略は「ポジション比率(-1〜+1)を返す純関数」   docs/02 §4.1
  - 損益は建玉に対する « リターン » で測る          docs/01（シャープ/ボラの議論と接続するため）
  - シャープは点推定だけでなく標準誤差も出す        docs/05 検証4（点推定で判断してはいけない）
  - 採用ラインとの照合を機械的に行う                docs/03 §4
"""

from __future__ import annotations

import argparse
from math import sqrt
from pathlib import Path

import numpy as np
import pandas as pd

JST = "Asia/Tokyo"
TRADING_DAYS = 252


# --- 戦略: 価格のDataFrameを受け取り、ポジション(-1〜1)を返すだけ -------------
# 制約(docs/02 §4.1): 時刻tの出力はt以前の情報だけで決まること。
#                     資金・ロット・口座を参照しないこと。副作用を持たないこと。

def nakane(df: pd.DataFrame) -> pd.Series:
    """仲値アノマリー: JST 9:00〜9:55 だけロング。"""
    t = df.index.tz_convert(JST)
    hhmm = t.hour * 100 + t.minute
    return pd.Series(
        np.where((t.weekday < 5) & (hhmm >= 900) & (hhmm < 955), 1.0, 0.0),
        index=df.index,
    )


def breakout(df: pd.DataFrame, n: int = 288) -> pd.Series:
    """n本高値/安値のブレイクアウト(ドンチャン)。"""
    mid = df["mid"]
    high, low = mid.rolling(n).max(), mid.rolling(n).min()
    pos = pd.Series(np.nan, index=df.index)
    pos[mid >= high] = 1.0
    pos[mid <= low] = -1.0
    return pos.ffill().fillna(0.0)


STRATEGIES = {"nakane": nakane, "breakout": breakout}

# 価格を見て建玉を決める戦略。ここに入るものだけが未来参照バグを起こしうる。
#
# nakane が入っていないのは、時刻だけで建玉を決めていて価格を一切参照しないため。
# 価格を見ない戦略は、shift を忘れても «未来の価格を知る» ことが原理的にできない
# (窓が5分ずれるだけ)。安全である一方、shift のバグを検出する力もない。
# したがって検証基盤の検算には breakout のような価格依存の戦略が必要になる。
PRICE_DEPENDENT = {"breakout"}


# --- 検証 --------------------------------------------------------------------
def backtest(df: pd.DataFrame, pos: pd.Series) -> pd.DataFrame:
    """建玉比率posを受け取り、1倍(無レバ)相当のリターン系列を返す。

    コストの根拠: 0→+1 はaskで買う(mid比 +半スプレッド)、0→-1 はbidで売る
    (mid比 +半スプレッド)。よって建玉が|Δpos|動くたびに |Δpos|×半スプレッド を払う。
    往復(0→1→0)でちょうど1スプレッド分になる。
    """
    pos = pos.shift(1).fillna(0.0)                    # ★1 未来参照の防止
    mid = df["mid"]

    gross = pos * mid.pct_change().fillna(0.0)        # 建玉に対するリターン
    cost = pos.diff().abs().fillna(0.0) * df["half_spread"] / mid   # ★2 売買コスト

    return pd.DataFrame({"pos": pos, "gross": gross, "cost": cost, "net": gross - cost})


def stats(bt: pd.DataFrame) -> dict:
    net = bt["net"]
    equity = (1 + net).cumprod()
    daily = net.resample("1D").sum()
    daily = daily[bt["pos"].resample("1D").apply(lambda s: (s != 0).any())]

    n_days = max(len(daily), 1)
    years = n_days / TRADING_DAYS
    sharpe = daily.mean() / daily.std() * sqrt(TRADING_DAYS) if daily.std() else 0.0
    # docs/05 検証4: 点推定だけでは判断できない。標準誤差を必ず添える(Lo 2002)
    se = sqrt((1 + sharpe**2 / 2) / years) if years > 0 else float("inf")

    wins = net[net > 0].sum()
    losses = -net[net < 0].sum()
    trades = int((bt["pos"].diff().abs() > 0).sum() / 2)

    return {
        "trades": trades,
        "total_return": equity.iloc[-1] - 1,
        "pf": wins / losses if losses else float("inf"),
        "max_dd": (equity.cummax() - equity).div(equity.cummax()).max(),
        "sharpe": sharpe,
        "sharpe_se": se,
        "sharpe_lower": sharpe - se,     # docs/03 §4.1: 保守的な下限 S - 1.0*SE
        "years": years,
        "cost_drag": bt["cost"].sum(),
        "gross_return": bt["gross"].sum(),
        "duty": (bt["pos"] != 0).mean(),
    }


def yearly(bt: pd.DataFrame) -> pd.Series:
    return bt["net"].resample("YE").sum()


def report(df: pd.DataFrame, bt: pd.DataFrame, name: str, trials: int = 1) -> dict:
    s = stats(bt)
    yr = yearly(bt)

    print(f"\n{'=' * 66}")
    print(f"戦略: {name}")
    print(f"{'=' * 66}")
    print(f"期間          : {df.index[0]:%Y-%m-%d} 〜 {df.index[-1]:%Y-%m-%d}  ({s['years']:.1f}年)")
    print(f"取引回数      : {s['trades']:,}")
    print(f"稼働率        : {s['duty']:.1%}")
    print(f"総リターン    : {s['total_return']:+.2%}   (無レバ・1倍建玉)")
    print(f"  うち売買コスト: {-s['cost_drag']:+.2%}")
    print(f"PF            : {s['pf']:.2f}")
    print(f"最大DD        : {s['max_dd']:.2%}")
    print(f"シャープ      : {s['sharpe']:.2f}  ± {s['sharpe_se']:.2f} (SE)")
    print(f"  信頼区間下限: {s['sharpe_lower']:.2f}   ← 採用判定はこの値で行う")

    print("\n年別リターン")
    for ts, v in yr.items():
        print(f"  {ts.year}: {v:>+9.2%}")
    if len(yr) > 1:
        without_best = yr.drop(yr.idxmax())
        print(f"  最良年を除いた合計: {without_best.sum():+.2%}"
              f"   {'○ 単年依存なし' if without_best.sum() > 0 else '× 単年に依存'}")

    check_acceptance(s, yr, trials)
    return s


def dsr_floor(trials: int, years: float) -> float:
    """真のエッジがゼロでもn本試せば出てしまうシャープ(docs/03 §3)。"""
    from math import exp
    from statistics import NormalDist
    if trials < 2 or years <= 0:
        return 0.0
    nd, gamma = NormalDist(), 0.5772156649
    return sqrt(1.0 / years) * (
        (1 - gamma) * nd.inv_cdf(1 - 1 / trials)
        + gamma * nd.inv_cdf(1 - 1 / (trials * exp(1)))
    )


def check_acceptance(s: dict, yr: pd.Series, trials: int) -> None:
    """docs/03 §4 の採用ラインと機械的に照合する。"""
    floor = dsr_floor(trials, s["years"])
    without_best = yr.drop(yr.idxmax()).sum() if len(yr) > 1 else yr.sum()

    checks = [
        ("取引回数 200以上", s["trades"] >= 200, f"{s['trades']:,}"),
        (f"シャープ下限 > DSR足切り({floor:.2f})", s["sharpe_lower"] > floor,
         f"{s['sharpe_lower']:.2f}"),
        ("PF 1.2以上", s["pf"] >= 1.2, f"{s['pf']:.2f}"),
        ("最良年を除いても正", without_best > 0, f"{without_best:+.2%}"),
    ]

    print(f"\n採用ライン照合  (累計試行回数 n={trials} で足切り {floor:.2f})")
    for label, ok, got in checks:
        print(f"  [{'○' if ok else '×'}] {label:<32} {got}")
    print(f"\n  → {'合格' if all(c[1] for c in checks) else '不合格'}"
          "（スプレッド感度・パラメータ感度・相関はWF実行時に判定）")


def load(path: str) -> pd.DataFrame:
    """parquet/csvを読み、mid と half_spread を用意する。"""
    df = pd.read_parquet(path) if str(path).endswith(".parquet") else pd.read_csv(path)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.set_index("ts").sort_index()

    if "bid_c" in df and "ask_c" in df:
        df["mid"] = (df["bid_c"] + df["ask_c"]) / 2
        df["half_spread"] = (df["ask_c"] - df["bid_c"]) / 2
    else:
        raise SystemExit(
            "bid_c / ask_c が必要です。mid だけのデータはスプレッドが検証から消え、\n"
            "成績が過大評価されます。tools/import_histdata.py で bid/ask を合成してください。"
        )
    return df


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("data", nargs="?", default="data/USD_JPY_M5.parquet")
    p.add_argument("--strategy", default="nakane", choices=sorted(STRATEGIES))
    p.add_argument("--trials", type=int, default=1,
                   help="この戦略に至るまでの累計試行回数。DSR足切りに使う(docs/03 §3)")
    p.add_argument("--lookahead", action="store_true",
                   help="★検証用★ わざと未来参照する(shiftしない)。必ず成績が良く見える")
    args = p.parse_args()

    if not Path(args.data).exists():
        raise SystemExit(f"データがありません: {args.data}\n"
                         f"  ランダムウォークで検算するなら:\n"
                         f"    python fx/tools/make_synthetic.py --out {args.data}")

    df = load(args.data)
    pos = STRATEGIES[args.strategy](df)

    if args.lookahead:
        bt = backtest(df, pos.shift(-1))   # shiftを打ち消して未来参照を再現
        report(df, bt, f"{args.strategy} ★未来参照あり(バグの再現)★", args.trials)
    else:
        bt = backtest(df, pos)
        report(df, bt, args.strategy, args.trials)


if __name__ == "__main__":
    main()
