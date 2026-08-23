"""sanity_check.py — 検証基盤が壊れていないことを機械的に確かめる。

    python fx/tools/sanity_check.py

docs/03 §7 のランダムウォーク検算を、毎回手で確認する代わりに自動化したもの。
戦略を追加したり backtest() を触ったりしたら、まずこれを通すこと。

確かめること:
  1. エッジゼロのデータで、すべての戦略が負ける
     -> 勝ったら未来参照かコスト未計上のバグ
  2. グロスリターンがほぼゼロ、損失がほぼ全額コストである
     -> ずれていたら損益計算そのものが誤り
  3. わざと shift を外すと勝つ
     -> 勝たないなら、このテスト自体に検出力がない(★1が無意味になる)

3番目が重要。「負けたからOK」だけだと、実は何もしていないコードでも通ってしまう。
バグを入れたときに «ちゃんと壊れる» ことまで確認して、はじめてテストになる。
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from fx1 import PRICE_DEPENDENT, STRATEGIES, backtest, load, stats
from make_synthetic import make

DATA = Path(__file__).resolve().parent.parent / "data" / "SYNTH_M5.parquet"

# エッジゼロでもグロスはゼロぴったりにはならない。乱数なので散らばる。
# 累積グロスの標準偏差は σ×√(稼働率×年数) なので、許容幅もそれに比例させる。
# 固定値(例: ±2%)にすると、常時建玉の戦略では必ず外れて偽の失敗を出す。
SYNTH_ANNUAL_VOL = 0.106    # make_synthetic の実現ボラ
GROSS_SIGMA_LIMIT = 3.0     # 3σを超えたら損益計算を疑う
LOOKAHEAD_MIN_SHARPE = 1.0  # バグを入れたらこれ以上のシャープが出ないとおかしい


def ensure_data() -> None:
    if DATA.exists():
        return
    print(f"合成データがないので作成します -> {DATA}")
    DATA.parent.mkdir(parents=True, exist_ok=True)
    make(years=10.0, start_price=110.0, annual_vol=0.09, seed=42, pip=0.01) \
        .to_parquet(DATA, index=False)


def main() -> int:
    ensure_data()
    df = load(str(DATA))
    failures: list[str] = []

    print(f"データ: {DATA.name}  ({len(df):,}本, "
          f"{df.index[0]:%Y-%m-%d}〜{df.index[-1]:%Y-%m-%d})")
    print("エッジは存在しない。負けるのが正しい。\n")

    header = (f"{'戦略':>10} {'総リターン':>11} {'グロス':>9} {'乖離':>8} "
              f"{'コスト':>9} {'シャープ':>9} {'判定':>8}")
    print(header)
    print("-" * len(header))

    for name, fn in sorted(STRATEGIES.items()):
        s = stats(backtest(df, fn(df)))
        ok = s["total_return"] < 0

        sd = SYNTH_ANNUAL_VOL * np.sqrt(s["duty"] * s["years"])
        sigmas = abs(s["gross_return"]) / sd if sd else 0.0
        gross_ok = sigmas < GROSS_SIGMA_LIMIT

        if not ok:
            failures.append(
                f"{name}: エッジゼロのデータで勝っている "
                f"({s['total_return']:+.2%})。未来参照かコスト未計上を疑うこと")
        if not gross_ok:
            failures.append(
                f"{name}: グロスリターン {s['gross_return']:+.2%} が理論分布から "
                f"{sigmas:.1f}σ 離れている。損益計算を確認すること")

        print(f"{name:>10} {s['total_return']:>+10.2%} {s['gross_return']:>+8.2%} "
              f"{sigmas:>7.1f}σ {-s['cost_drag']:>+8.2%} {s['sharpe']:>8.2f} "
              f"{'○' if ok and gross_ok else '× 失敗':>8}")

    # --- 検出力の確認: わざとバグを入れて、ちゃんと壊れるか --------------------
    print("\n検出力の確認（わざと shift を外す = 未来参照バグの再現）")
    print("-" * len(header))
    for name, fn in sorted(STRATEGIES.items()):
        s = stats(backtest(df, fn(df).shift(-1)))
        if name not in PRICE_DEPENDENT:
            # 価格を見ない戦略は原理的に未来参照が起きない。窓が5分ずれるだけ。
            print(f"{name:>10} {s['total_return']:>+10.2%} {'':>8} {'':>7} {'':>8} "
                  f"{s['sharpe']:>8.2f} {'― 対象外':>8}")
            continue
        detected = s["sharpe"] > LOOKAHEAD_MIN_SHARPE
        if not detected:
            failures.append(
                f"{name}: shiftを外しても成績が良くならない(シャープ {s['sharpe']:.2f})。"
                f"このテストに検出力がない")
        print(f"{name:>10} {s['total_return']:>+10.2%} {'':>8} {'':>7} {'':>8} "
              f"{s['sharpe']:>8.2f} {'○ 検出可' if detected else '× 検出力なし':>8}")
    print("  ※ 価格を見ない戦略(仲値など)は shift のバグが原理的に起きないため対象外。")

    print()
    if failures:
        print("=" * 66)
        print("失敗")
        print("=" * 66)
        for f in failures:
            print(f"  - {f}")
        return 1

    print("=" * 66)
    print("すべて合格。検証基盤は信頼してよい。")
    print("=" * 66)
    print("\n※ このテストが保証するのは «損益計算が正しいこと» だけ。")
    print("  戦略にエッジがあるかどうかは実データで別途検証すること。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
