"""registry.py — 戦略レジストリ。何を何本試したかを記録する。

    python fx/registry.py                 # 一覧と現在の足切りラインを表示
    python fx/registry.py --check nakane  # 特定の戦略のOOS実行回数を確認

なぜ必要か（docs/03 §3）:
戦略を100本試して最良の1本を選べば、そのシャープには «たくさん試したこと»
による下駄が乗っている。下駄の高さは試行回数で決まるので、
**正直に数えないと足切りが甘くなり、自分を騙すことになる。**

数え方のルール:
  - パラメータグリッドを回したら、グリッドの点数を試行回数に数える
    （20通り試したら20本）
  - 「なんとなく回してみた」も1本に数える
  - OOSは1戦略につき1回だけ。2回目以降はISと同じなので警告を出す

記録は fx/trials.jsonl に追記する。これは監査証跡なのでgitに入れる。
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from math import exp, sqrt
from pathlib import Path
from statistics import NormalDist

REGISTRY = Path(__file__).resolve().parent / "trials.jsonl"
EULER = 0.5772156649


def load() -> list[dict]:
    if not REGISTRY.exists():
        return []
    with REGISTRY.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def record(strategy: str, params: dict, grid_size: int, data_range: str,
           stage: str, sharpe: float | None = None, note: str = "") -> dict:
    """1件の検証を記録する。stage は "IS" / "WF" / "OOS" / "封印"。"""
    rows = load()
    entry = {
        "trial_id": len(rows) + 1,
        "date": date.today().isoformat(),
        "strategy": strategy,
        "params": params,
        "grid_size": grid_size,
        "data_range": data_range,
        "stage": stage,
        "sharpe": round(sharpe, 4) if sharpe is not None else None,
        "note": note,
    }
    with REGISTRY.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def total_trials(rows: list[dict] | None = None) -> int:
    """累計試行回数。グリッドの点数の合計。"""
    rows = load() if rows is None else rows
    return sum(r.get("grid_size", 1) for r in rows)


def oos_runs(strategy: str, rows: list[dict] | None = None) -> int:
    rows = load() if rows is None else rows
    return sum(1 for r in rows if r["strategy"] == strategy and r["stage"] == "OOS")


def dsr_floor(trials: int, years: float) -> float:
    """真のエッジがゼロでもn本試せば出てしまうシャープ（docs/03 §3）。"""
    if trials < 2 or years <= 0:
        return 0.0
    nd = NormalDist()
    return sqrt(1.0 / years) * (
        (1 - EULER) * nd.inv_cdf(1 - 1 / trials)
        + EULER * nd.inv_cdf(1 - 1 / (trials * exp(1)))
    )


def summary(years: float = 10.0) -> None:
    rows = load()
    if not rows:
        print(f"まだ記録がありません（{REGISTRY}）")
        print("検証を1本走らせるたびに record() で追記されます。")
        return

    print(f"{'ID':>4} {'日付':>12} {'戦略':>10} {'段階':>6} {'グリッド':>8} "
          f"{'シャープ':>9}  パラメータ / 備考")
    print("-" * 92)
    for r in rows:
        p = ", ".join(f"{k}={v}" for k, v in r["params"].items()) or "―"
        sh = f"{r['sharpe']:.2f}" if r["sharpe"] is not None else "―"
        note = f"  {r['note']}" if r["note"] else ""
        print(f"{r['trial_id']:>4} {r['date']:>12} {r['strategy']:>10} "
              f"{r['stage']:>6} {r['grid_size']:>8} {sh:>9}  {p}{note}")

    n = total_trials(rows)
    print(f"\n累計試行回数: {n} 本（グリッドの点数の合計）")
    print(f"\n検証年数ごとのDSR足切りライン（これ以下は偶然と区別できない）")
    for y in (3, 5, 10):
        print(f"  {y:>2}年データ: {dsr_floor(n, y):.2f}")

    # OOSの使いすぎを検出
    strategies = {r["strategy"] for r in rows}
    warnings = [(s, oos_runs(s, rows)) for s in sorted(strategies)
                if oos_runs(s, rows) >= 2]
    if warnings:
        print("\n⚠ OOSを複数回使った戦略があります（2回目以降はISと同じ）")
        for s, c in warnings:
            print(f"  {s}: {c}回")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--check", help="この戦略のOOS実行回数を表示")
    p.add_argument("--years", type=float, default=10.0)
    args = p.parse_args()

    if args.check:
        c = oos_runs(args.check)
        print(f"{args.check}: OOS実行回数 {c}")
        if c >= 1:
            print("  ※ すでにOOSを使っています。もう一度回すとISと同じ扱いになります。")
    else:
        summary(args.years)


if __name__ == "__main__":
    main()
