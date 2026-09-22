"""analysis.py — 採用ラインのうち、単純な集計では判定できないものを扱う。

docs/03 §4 の基準5・6（感度分析）と §6（モンテカルロ）の実装。

なぜ必要か:
WF合成が1本きれいに引けても、それは «1つの実現パス» にすぎない。
たまたま良い順番で並んでいただけかもしれないし、
スプレッド前提を少し変えただけで消えるエッジかもしれない。
点推定を1つ見て判断すると、そのどちらも見逃す。
"""

from __future__ import annotations

from math import sqrt

import numpy as np
import pandas as pd

from fx1 import TRADING_DAYS, backtest, stats, trade_pnls

BLOCK_DAYS = 20        # ブロックブートストラップのブロック長（自己相関を壊さない長さ）
N_PATHS = 10_000


# --- 感度分析 ---------------------------------------------------------------

def spread_sensitivity(df: pd.DataFrame, pos: pd.Series,
                       multipliers=(1.0, 1.5, 2.0)) -> pd.DataFrame:
    """スプレッドを何倍かしても生き残るか（docs/03 §4 基準5）。

    HistDataから合成したスプレッドは楽観的になりうる。
    実勢で崩れる戦略をここで落とす。
    """
    rows = []
    for m in multipliers:
        scaled = df.assign(half_spread=df["half_spread"] * m)
        s = stats(backtest(scaled, pos))
        rows.append({"multiplier": m, "pf": s["pf"], "sharpe": s["sharpe"],
                     "total_return": s["total_return"]})
    return pd.DataFrame(rows).set_index("multiplier")


def param_sensitivity(df: pd.DataFrame, strategy_fn, params: dict,
                      pct: float = 0.20) -> pd.DataFrame:
    """パラメータを±pct動かしてシャープが半減しないか（docs/03 §4 基準6）。

    最適値が «山の頂上» ではなく «高原の上» にあることを確認する。
    少し動かして崩れるなら、それは過剰最適化で拾った偽物。
    """
    base = stats(backtest(df, strategy_fn(df, **params)))["sharpe"]
    # 基準シャープが0以下だと「半減したか」を比率で測れない。
    # その戦略はそもそも基準2で落ちているので、ここは判定不能として返す。
    ratio = (lambda s: s / base) if base > 0 else (lambda s: float("nan"))
    rows = [{"param": "(基準値)", "value": "―", "sharpe": base,
             "ratio": 1.0 if base > 0 else float("nan")}]

    for key, val in params.items():
        for direction, sign in (("-20%", -1), ("+20%", +1)):
            moved = val * (1 + sign * pct)
            moved = max(1, int(round(moved))) if isinstance(val, int) else moved
            s = stats(backtest(df, strategy_fn(df, **{**params, key: moved})))["sharpe"]
            rows.append({"param": f"{key} {direction}", "value": moved,
                         "sharpe": s, "ratio": ratio(s)})
    out = pd.DataFrame(rows)
    out.attrs["measurable"] = base > 0     # 判定できたかどうか
    return out


# --- モンテカルロ -----------------------------------------------------------

def mc_shuffle(bt: pd.DataFrame, n_paths: int = N_PATHS, seed: int = 0) -> dict:
    """トレードの順序をシャッフルして最大DDの分布を見る（docs/03 §6.1）。

    «たまたま良い順番で並んでいた» のを剥がす。
    実現DDが分布の浅い側にあるなら、運用中に今回より深いDDが普通に来る。
    """
    pnl = trade_pnls(bt).to_numpy()
    if len(pnl) < 2:
        return {}
    rng = np.random.default_rng(seed)

    idx = np.argsort(rng.random((n_paths, len(pnl))), axis=1)
    paths = pnl[idx]
    eq = np.cumprod(1 + paths, axis=1)
    peak = np.maximum.accumulate(eq, axis=1)
    dd = ((peak - eq) / peak).max(axis=1)

    realized = ((np.maximum.accumulate(np.cumprod(1 + pnl))
                 - np.cumprod(1 + pnl)) / np.maximum.accumulate(np.cumprod(1 + pnl))).max()
    return {
        "realized_dd": realized,
        "dd_median": float(np.median(dd)),
        "dd_p90": float(np.percentile(dd, 90)),
        "dd_p99": float(np.percentile(dd, 99)),
        "realized_percentile": float((dd < realized).mean()),
    }


def mc_block_bootstrap(bt: pd.DataFrame, n_paths: int = N_PATHS,
                       block: int = BLOCK_DAYS, seed: int = 0) -> dict:
    """日次リターンをブロック単位でリサンプルし、シャープの信頼区間を出す。

    1日単位で混ぜると自己相関が壊れ、リスクを過小評価する。
    docs/03 §6.2: シャープの5%点が0を下回るなら不採用。
    """
    daily = bt["net"].resample("1D").sum()
    daily = daily[bt["pos"].resample("1D").apply(lambda s: (s != 0).any())].to_numpy()
    n = len(daily)
    if n < block * 3:
        return {}

    rng = np.random.default_rng(seed)
    n_blocks = int(np.ceil(n / block))
    starts = rng.integers(0, n - block, size=(n_paths, n_blocks))
    offsets = np.arange(block)
    sample = daily[(starts[:, :, None] + offsets).reshape(n_paths, -1)[:, :n]]

    mean, sd = sample.mean(axis=1), sample.std(axis=1)
    sharpe = np.where(sd > 0, mean / np.where(sd > 0, sd, 1) * sqrt(TRADING_DAYS), 0.0)
    return {
        "sharpe_median": float(np.median(sharpe)),
        "sharpe_p05": float(np.percentile(sharpe, 5)),
        "sharpe_p95": float(np.percentile(sharpe, 95)),
        "prob_negative": float((sharpe < 0).mean()),
    }
