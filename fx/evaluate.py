"""evaluate.py — 採用ライン7項目をすべて判定する。Phase 1 の最終判定。

    python fx/evaluate.py fx/data/USD_JPY_M5.parquet --strategy breakout
    python fx/evaluate.py fx/data/USD_JPY_M5.parquet --strategy breakout --record

docs/03 §4 の7項目を機械的に照合し、レジストリに記録する。

  1. 取引回数 200以上
  2. シャープの信頼区間下限 > DSR足切り
  3. PF 1.2以上
  4. 最良年を除いても年次リターンが正
  5. スプレッド1.5倍でPF 1.0以上
  6. パラメータ±20%でシャープが半減しない
  7. ブートストラップのシャープ5%点が0を上回る

7番目は docs/03 §6.2。点推定が1.5でも区間が[-0.2, 3.2]なら何も言えていない。

※ 相関（基準7の «既存の束との相関0.4以下»）は束が2本以上になってから
  判定する。1本目には適用しない。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))

import registry
from analysis import (mc_block_bootstrap, mc_shuffle, param_sensitivity,
                      spread_sensitivity)
from fx1 import STRATEGIES, backtest, load, stats
from walkforward import PARAM_GRIDS, run as wf_run


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("data", nargs="?", default="fx/data/USD_JPY_M5.parquet")
    p.add_argument("--strategy", default="breakout", choices=sorted(PARAM_GRIDS))
    p.add_argument("--record", action="store_true",
                   help="結果をレジストリ(fx/trials.jsonl)に記録する")
    p.add_argument("--stage", default="WF", choices=["IS", "WF", "OOS", "封印"])
    p.add_argument("--paths", type=int, default=10_000)
    args = p.parse_args()

    if not Path(args.data).exists():
        raise SystemExit(f"データがありません: {args.data}")

    df = load(args.data)
    print(f"データ: {Path(args.data).name}  "
          f"({len(df):,}本, {df.index[0]:%Y-%m-%d}〜{df.index[-1]:%Y-%m-%d})")

    # --- WFで合成曲線を作る --------------------------------------------------
    composite, records, grid_size = wf_run(df, args.strategy, 24, 6, 6, 5)
    s = stats(composite)
    prior = registry.total_trials()
    trials = prior + grid_size
    floor = registry.dsr_floor(trials, s["years"])

    print(f"\nWF合成: {composite.index[0]:%Y-%m-%d}〜{composite.index[-1]:%Y-%m-%d} "
          f"({s['years']:.1f}年)  取引{s['trades']:,}回")
    print(f"  シャープ {s['sharpe']:.2f} ± {s['sharpe_se']:.2f}  "
          f"下限 {s['sharpe_lower']:.2f}   PF {s['pf']:.2f}   "
          f"最大DD {s['max_dd']:.2%}")
    print(f"  累計試行 n={trials}（既存{prior} + 今回のグリッド{grid_size}）"
          f" → 足切り {floor:.2f}")

    # 最頻出のパラメータを感度分析の基準にする
    if grid_size > 1:
        chosen = max((tuple(sorted(r["params"].items())) for r in records),
                     key=lambda k: sum(1 for r in records
                                       if tuple(sorted(r["params"].items())) == k))
        base_params = dict(chosen)
    else:
        base_params = {}

    # --- 基準5: スプレッド感度 -----------------------------------------------
    pos_full = (STRATEGIES[args.strategy](df, **base_params) if base_params
                else STRATEGIES[args.strategy](df))
    spread = spread_sensitivity(df, pos_full)
    print(f"\nスプレッド感度  （基準パラメータ: "
          f"{', '.join(f'{k}={v}' for k, v in base_params.items()) or '―'}）")
    print(f"  {'倍率':>6} {'PF':>8} {'シャープ':>9} {'総リターン':>11}")
    for m, row in spread.iterrows():
        print(f"  {m:>5.1f}x {row['pf']:>8.3f} {row['sharpe']:>9.2f} "
              f"{row['total_return']:>+10.2%}")
    spread_pf = float(spread.loc[1.5, "pf"])
    spread_ok = spread_pf >= 1.0

    # --- 基準6: パラメータ感度 -----------------------------------------------
    if base_params:
        ps = param_sensitivity(df, STRATEGIES[args.strategy], base_params)
        measurable = ps.attrs["measurable"]
        print("\nパラメータ感度（±20%）")
        print(f"  {'条件':>14} {'値':>8} {'シャープ':>9} {'基準比':>8}")
        for _, r in ps.iterrows():
            ratio = f"{r['ratio']:>7.0%}" if np.isfinite(r["ratio"]) else "    ―"
            print(f"  {r['param']:>14} {str(r['value']):>8} "
                  f"{r['sharpe']:>9.2f} {ratio}")
        moved = ps[ps["param"] != "(基準値)"]
        if measurable:
            param_ok = bool((moved["ratio"] >= 0.5).all())
            param_detail = f"{moved['ratio'].min():.0%}"
        else:
            # 基準シャープが0以下。比率では測れないので判定不能とする
            param_ok = False
            param_detail = "判定不能"
            print("  ※ 基準シャープが0以下のため «半減したか» を比率で測れない。")
            print("    この戦略は基準2で既に落ちている。")
    else:
        print("\nパラメータ感度: 対象外（パラメータのない戦略）")
        param_ok, param_detail = True, "対象外" 

    # --- §6: モンテカルロ ----------------------------------------------------
    sh = mc_shuffle(composite, args.paths)
    if sh:
        print(f"\nモンテカルロ①トレード順序シャッフル（{args.paths:,}パス）")
        print(f"  実現した最大DD : {sh['realized_dd']:.2%} "
              f"（分布の{sh['realized_percentile']:.0%}点）")
        print(f"  DD中央 {sh['dd_median']:.2%} / "
              f"90%点 {sh['dd_p90']:.2%} / 99%点 {sh['dd_p99']:.2%}")
        if sh["realized_percentile"] < 0.5:
            print("  ※ 実現DDは分布の浅い側。運用中に今回より深いDDが普通に来る")

    bs = mc_block_bootstrap(composite, args.paths)
    if bs:
        print(f"\nモンテカルロ②ブロックブートストラップ（20営業日ブロック）")
        print(f"  シャープ 中央 {bs['sharpe_median']:.2f} / "
              f"5%点 {bs['sharpe_p05']:.2f} / 95%点 {bs['sharpe_p95']:.2f}")
        print(f"  シャープが負になる確率: {bs['prob_negative']:.1%}")
    bootstrap_ok = bool(bs and bs["sharpe_p05"] > 0)

    # --- 総合判定 ------------------------------------------------------------
    yr = composite["net"].resample("YE").sum()
    without_best = yr.drop(yr.idxmax()).sum() if len(yr) > 1 else yr.sum()

    checks = [
        ("1. 取引回数 200以上", s["trades"] >= 200, f"{s['trades']:,}"),
        (f"2. シャープ下限 > 足切り({floor:.2f})", s["sharpe_lower"] > floor,
         f"{s['sharpe_lower']:.2f}"),
        ("3. PF 1.2以上", s["pf"] >= 1.2, f"{s['pf']:.2f}"),
        ("4. 最良年を除いても正", without_best > 0, f"{without_best:+.2%}"),
        ("5. スプレッド1.5倍でPF 1.0以上", spread_ok, f"{spread_pf:.3f}"),
        ("6. パラメータ±20%で半減しない", param_ok, param_detail),
        ("7. ブートストラップ5%点 > 0", bootstrap_ok,
         f"{bs['sharpe_p05']:.2f}" if bs else "―"),
    ]

    print(f"\n{'=' * 60}\n採用ライン（docs/03 §4）\n{'=' * 60}")
    for label, ok, got in checks:
        print(f"  [{'○' if ok else '×'}] {label:<34} {got}")
    passed = all(c[1] for c in checks)
    print(f"\n  → {'合格' if passed else '不合格'}")
    if passed:
        print("\n  ※ 束に追加する前に、既存の戦略との相関0.4以下を確認すること")
        print("    （docs/03 §4 基準7。束が1本目なら不要）")

    if args.record:
        entry = registry.record(
            strategy=args.strategy, params=base_params, grid_size=grid_size,
            data_range=f"{composite.index[0]:%Y-%m-%d}〜{composite.index[-1]:%Y-%m-%d}",
            stage=args.stage, sharpe=s["sharpe"],
            note="合格" if passed else "不合格")
        print(f"\nレジストリに記録しました: trial_id={entry['trial_id']} "
              f"(累計 {registry.total_trials()} 本)")
        if args.stage == "OOS" and registry.oos_runs(args.strategy) >= 2:
            print("  ⚠ この戦略でOOSを複数回使っています。2回目以降はISと同じです。")


if __name__ == "__main__":
    main()
