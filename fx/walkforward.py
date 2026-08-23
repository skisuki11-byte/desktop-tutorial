"""walkforward.py — ウォークフォワード分析。

    python fx/walkforward.py fx/data/USD_JPY_M5.parquet --strategy breakout

なぜ単一のIS/OOS分割では足りないか(docs/03 §2):
一度きりの分割だと、たまたま相性のよい期間を引いた可能性を排除できない。
学習窓をずらしながら «学習 -> その直後の未知区間で検証» を繰り返し、
検証窓だけをつないだ曲線(WF合成)で判定する。

■ 守っていること ■
  1. 判定に使うのは検証窓をつないだ合成曲線だけ。学習窓の成績では判定しない
  2. 学習窓と検証窓の間にエンバーゴ(既定5営業日)を置く。
     保有期間が数日に及ぶ戦略は、境界をまたぐポジションが情報を漏らす
  3. パラメータ探索の «グリッドの点数» を試行回数に数える。
     20通り試したら20本(docs/03 §3)。これを忘れるとDSR足切りが甘くなる
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))

from fx1 import backtest, dsr_floor, load, stats

# パラメータ探索の範囲。ここの点数がそのまま試行回数になる(docs/03 §3)
PARAM_GRIDS: dict[str, dict[str, list]] = {
    "nakane": {},                                   # パラメータなし = 1通り
    "breakout": {"n": [72, 144, 288, 576, 1152]},   # 6h/12h/1d/2d/4d 相当
}


def build_positions(df: pd.DataFrame, strategy: str, params: dict) -> pd.Series:
    """全期間ぶんの建玉を一度だけ計算する。

    窓ごとに計算し直さないのは速度のためだけでなく、検証窓の先頭でも
    «実運用と同じだけの過去» を見せるため。rolling は過去しか見ないので
    未来参照にはならない。
    """
    from fx1 import STRATEGIES
    fn = STRATEGIES[strategy]
    return fn(df, **params) if params else fn(df)


def param_combos(grid: dict[str, list]) -> list[dict]:
    if not grid:
        return [{}]
    from itertools import product
    keys = list(grid)
    return [dict(zip(keys, vals)) for vals in product(*(grid[k] for k in keys))]


def make_folds(index: pd.DatetimeIndex, train_months: int, test_months: int,
               step_months: int, embargo_days: int) -> list[tuple]:
    """(学習開始, 学習終了, 検証開始, 検証終了) の並びを作る。"""
    start, end = index[0], index[-1]
    folds = []
    train_start = start
    while True:
        train_end = train_start + pd.DateOffset(months=train_months)
        test_start = train_end + pd.offsets.BDay(embargo_days)   # ★エンバーゴ
        test_end = test_start + pd.DateOffset(months=test_months)
        if test_end > end:
            break
        folds.append((train_start, train_end, test_start, test_end))
        train_start = train_start + pd.DateOffset(months=step_months)
    return folds


def run(df: pd.DataFrame, strategy: str, train_months: int, test_months: int,
        step_months: int, embargo_days: int) -> tuple[pd.DataFrame, list[dict], int]:
    grid = PARAM_GRIDS.get(strategy, {})
    combos = param_combos(grid)

    # 全パラメータぶんの建玉を先に作る
    positions = {tuple(sorted(c.items())): build_positions(df, strategy, c)
                 for c in combos}

    folds = make_folds(df.index, train_months, test_months, step_months, embargo_days)
    if not folds:
        raise SystemExit(
            f"データ期間が短すぎます。学習{train_months}ヶ月+検証{test_months}ヶ月に足りません。")

    records, test_frames = [], []
    for i, (tr_s, tr_e, te_s, te_e) in enumerate(folds, 1):
        train_mask = (df.index >= tr_s) & (df.index < tr_e)
        test_mask = (df.index >= te_s) & (df.index < te_e)
        if not train_mask.any() or not test_mask.any():
            continue

        # --- 学習窓でパラメータを選ぶ（ここの成績は判定に使わない） ---
        best, best_sharpe = None, -np.inf
        for c in combos:
            key = tuple(sorted(c.items()))
            s = stats(backtest(df[train_mask], positions[key][train_mask]))
            if s["sharpe"] > best_sharpe:
                best, best_sharpe = c, s["sharpe"]

        # --- 選んだパラメータを、見ていない検証窓に当てる ---
        key = tuple(sorted(best.items()))
        bt_test = backtest(df[test_mask], positions[key][test_mask])
        s_test = stats(bt_test)

        test_frames.append(bt_test)
        records.append({
            "fold": i,
            "train": f"{tr_s:%Y-%m}〜{tr_e:%Y-%m}",
            "test": f"{te_s:%Y-%m}〜{te_e:%Y-%m}",
            "params": best,
            "is_sharpe": best_sharpe,
            "oos_sharpe": s_test["sharpe"],
            "oos_return": s_test["total_return"],
            "trades": s_test["trades"],
        })

    return pd.concat(test_frames).sort_index(), records, len(combos)


def report(composite: pd.DataFrame, records: list[dict], grid_size: int,
           strategy: str, prior_trials: int) -> None:
    print(f"\n{'=' * 76}")
    print(f"ウォークフォワード: {strategy}")
    print(f"{'=' * 76}")

    print(f"\n{'#':>3} {'学習窓':>18} {'検証窓':>18} {'パラメータ':>16} "
          f"{'IS':>7} {'OOS':>7} {'取引':>6}")
    print("-" * 76)
    for r in records:
        p = ", ".join(f"{k}={v}" for k, v in r["params"].items()) or "―"
        print(f"{r['fold']:>3} {r['train']:>18} {r['test']:>18} {p:>16} "
              f"{r['is_sharpe']:>7.2f} {r['oos_sharpe']:>7.2f} {r['trades']:>6}")

    is_mean = np.mean([r["is_sharpe"] for r in records])
    oos_mean = np.mean([r["oos_sharpe"] for r in records])
    print(f"\n  学習窓の平均シャープ : {is_mean:>6.2f}   ← 判定には使わない（参考）")
    print(f"  検証窓の平均シャープ : {oos_mean:>6.2f}")
    if is_mean > 0:
        decay = oos_mean / is_mean
        verdict = ("○ 劣化は許容範囲" if decay > 0.5
                   else "△ 劣化が大きい" if decay > 0.2 else "× 過剰最適化の疑い")
        print(f"  劣化率 (OOS/IS)      : {decay:>6.0%}   {verdict}")

    # --- ここからが判定に使う数字 ---
    s = stats(composite)
    trials = prior_trials + grid_size
    floor = dsr_floor(trials, s["years"])

    print(f"\n{'-' * 76}")
    print("WF合成（検証窓だけをつないだ曲線。判定はこれだけで行う）")
    print(f"{'-' * 76}")
    print(f"  期間          : {composite.index[0]:%Y-%m-%d} 〜 "
          f"{composite.index[-1]:%Y-%m-%d}  ({s['years']:.1f}年)")
    print(f"  取引回数      : {s['trades']:,}")
    print(f"  総リターン    : {s['total_return']:+.2%}  (無レバ・1倍建玉)")
    print(f"    うちコスト  : {-s['cost_drag']:+.2%}")
    print(f"  PF            : {s['pf']:.2f}")
    print(f"  最大DD        : {s['max_dd']:.2%}")
    print(f"  シャープ      : {s['sharpe']:.2f} ± {s['sharpe_se']:.2f} (SE)")
    print(f"  信頼区間下限  : {s['sharpe_lower']:.2f}   ← 採用判定はこの値")

    yr = composite["net"].resample("YE").sum()
    print("\n  年別リターン")
    for ts, v in yr.items():
        print(f"    {ts.year}: {v:>+9.2%}")
    without_best = yr.drop(yr.idxmax()).sum() if len(yr) > 1 else yr.sum()

    checks = [
        ("取引回数 200以上", s["trades"] >= 200, f"{s['trades']:,}"),
        (f"シャープ下限 > DSR足切り({floor:.2f})", s["sharpe_lower"] > floor,
         f"{s['sharpe_lower']:.2f}"),
        ("PF 1.2以上", s["pf"] >= 1.2, f"{s['pf']:.2f}"),
        ("最良年を除いても正", without_best > 0, f"{without_best:+.2%}"),
    ]
    print(f"\n  採用ライン照合  (累計試行 n={trials} "
          f"= 事前{prior_trials} + グリッド{grid_size})")
    for label, ok, got in checks:
        print(f"    [{'○' if ok else '×'}] {label:<34} {got}")
    passed = all(c[1] for c in checks)
    print(f"\n  → {'合格' if passed else '不合格'}"
          "（スプレッド感度・パラメータ感度・相関は別途）")
    if passed:
        print("\n  ※ 合格しても、まだOOS区間(2022〜)には触れていない。")
        print("    docs/03 §1 のとおり、OOSは1戦略につき1回だけ。")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("data", nargs="?", default="fx/data/USD_JPY_M5.parquet")
    p.add_argument("--strategy", default="breakout", choices=sorted(PARAM_GRIDS))
    p.add_argument("--train-months", type=int, default=24)
    p.add_argument("--test-months", type=int, default=6)
    p.add_argument("--step-months", type=int, default=6)
    p.add_argument("--embargo-days", type=int, default=5)
    p.add_argument("--trials", type=int, default=0,
                   help="この実行より前の累計試行回数（docs/03 §3）")
    args = p.parse_args()

    if not Path(args.data).exists():
        raise SystemExit(f"データがありません: {args.data}")

    df = load(args.data)
    composite, records, grid_size = run(
        df, args.strategy, args.train_months, args.test_months,
        args.step_months, args.embargo_days)
    report(composite, records, grid_size, args.strategy, args.trials)


if __name__ == "__main__":
    main()
