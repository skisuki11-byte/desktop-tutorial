"""param_sweep.py — 利確ライン・最大保有日数のパラメータ感度を確認する。

    python bullbear/param_sweep.py

docs/README「次にやること」②に対応。take_profit=8%・max_hold_days=20という
値は当て推量だった。FXの検証プロトコル(docs/03 §4 基準6)と同じ考え方——
「パラメータを少し動かして崩れるなら偽物」——をここでも適用する。

■ 解釈Aはグリッド探索する意味がない ■
dca_realize.py で確認したとおり、解釈A(定額積立)は年率+14%の超長期ブル相場
ですら資金をほぼ全損する構造的な欠陥がある。パラメータをどう変えても
「複利にならない」という欠陥自体は変わらないため、ここでは解釈B(全額再投資)
だけを対象にする。

■ このグリッド探索そのものが選択バイアスを生む(FX docs/03 §3と同じ) ■
複数のパラメータ組み合わせから «最良» を選べば、その分だけ下駄が乗る。
ここでは «最良を選んで採用する» のではなく、**グリッド全体を見て
結果がパラメータにどれだけ敏感か** を確認することが目的。
特定の1点を「これが最適」と持ち出すのは、FXで戒めた過剰最適化そのもの。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from dca_realize import DCARealizeParams, simulate, stats
from leverage_sim import LeverageFund

TAKE_PROFITS = [0.04, 0.06, 0.08, 0.10, 0.15]
MAX_HOLD_DAYS = [10, 20, 30, 40]

PERIODS = [
    ("1949-01-01", "1990-01-01", "高度成長〜バブル"),
    ("1990-01-01", "2020-04-23", "バブル崩壊後30年"),
    ("2000-01-01", "2020-04-23", "2000年以降20年"),
    ("2010-01-01", "2020-04-23", "異次元緩和10年"),
]


def run_grid(idx_full: pd.Series, fund: LeverageFund) -> pd.DataFrame:
    rows = []
    for a, b, label in PERIODS:
        sub = idx_full[(idx_full.index >= a) & (idx_full.index < b)]
        lev_nav = fund.simulate(sub)
        for tp in TAKE_PROFITS:
            for mh in MAX_HOLD_DAYS:
                params = DCARealizeParams(
                    take_profit=tp, max_hold_days=mh, reinvest_full_proceeds=True)
                bt = simulate(lev_nav, params)
                s = stats(bt)
                rows.append({
                    "period": label, "take_profit": tp, "max_hold_days": mh,
                    "irr": s["irr_approx"], "max_dd": s["max_dd"], "sharpe": s["sharpe"],
                })
    return pd.DataFrame(rows)


def report(df: pd.DataFrame) -> None:
    print(f"{'期間':>18} {'年率換算(範囲)':>22} {'最大DD(範囲)':>18} {'20点の標準偏差(年率)':>16}")
    print("-" * 78)
    for label in df["period"].unique():
        sub = df[df["period"] == label]
        lo, hi = sub["irr"].min(), sub["irr"].max()
        dd_lo, dd_hi = sub["max_dd"].min(), sub["max_dd"].max()
        print(f"{label:>18} {f'{lo:+.1%} 〜 {hi:+.1%}':>22} "
              f"{f'{dd_lo:.0%} 〜 {dd_hi:.0%}':>18} {sub['irr'].std():>15.1%}")

    print(f"\n{'=' * 78}")
    print("基準点(8%・20日)と、そこから動かした場合の比較（FX基準6と同じ考え方）")
    print(f"{'=' * 78}")
    for label in df["period"].unique():
        sub = df[df["period"] == label]
        base = sub[(sub.take_profit == 0.08) & (sub.max_hold_days == 20)]["irr"].iloc[0]
        # 基準点がマイナスのとき「基準比%」は符号が反転して読み違えやすい
        # (FXのparam_sensitivityで踏んだのと同じ罠)。その場合は差分(pt)で示す。
        measurable = base > 0
        print(f"\n{label}  (基準点の年率換算: {base:+.1%})")
        col = "基準比" if measurable else "基準との差"
        print(f"  {'take_profit':>12} {'max_hold_days':>14} {'年率換算':>9} {col:>10}")
        for _, r in sub.iterrows():
            comp = f"{r['irr']/base:>9.0%}" if measurable else f"{(r['irr']-base)*100:>+8.1f}pt"
            mark = ""
            if r["take_profit"] == 0.08 and r["max_hold_days"] == 20:
                mark = "  ← 基準点"
            print(f"  {r['take_profit']:>11.0%} {r['max_hold_days']:>13d}日 "
                  f"{r['irr']:>+8.1%} {comp}{mark}")
        if not measurable:
            print("  ※ 基準点がマイナスのため比率(%)は意味を持たない。差分(pt)で見る。")


if __name__ == "__main__":
    df_price = pd.read_parquet("bullbear/data/nikkei225_close.parquet")
    idx_full = df_price.set_index("date")["close"]
    fund = LeverageFund(k=2.0, expense_ratio=0.009)

    print("=" * 78)
    print(f"感度分析: take_profit×{len(TAKE_PROFITS)} × max_hold_days×{len(MAX_HOLD_DAYS)}"
          f" = {len(TAKE_PROFITS)*len(MAX_HOLD_DAYS)}点 × {len(PERIODS)}期間"
          f" = {len(TAKE_PROFITS)*len(MAX_HOLD_DAYS)*len(PERIODS)}回のバックテスト")
    print("（解釈B=全額再投資のみ。Aは構造的欠陥がありグリッド探索の意味がない）")
    print("=" * 78)

    grid = run_grid(idx_full, fund)
    report(grid)

    print(f"\n{'=' * 78}")
    print("結論")
    print(f"{'=' * 78}")
    print("「基準比」が100%から大きく離れる組み合わせが多いほど、8%・20日という")
    print("設定は « たまたま » 良く見えていた可能性が高い。逆に大半が80〜120%に")
    print("収まっているなら、この戦略の効きは特定のパラメータへの依存が小さい。")
