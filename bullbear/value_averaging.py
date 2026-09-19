"""value_averaging.py — バリュー平均法(Value Averaging)でレバレッジ型ファンドを運用する。

    python bullbear/value_averaging.py

dca_realize.py の «利確8%・20日期限» という当て推量のルールに代えて、
Edleson(1988)のバリュー平均法という定式化されたルールで検証する。

■ バリュー平均法とは ■
毎期、«保有評価額がいくらであるべきか»という目標軌道 V_t を先に決めておく:

    V_t = V_(t-1) * (1 + g) + C

  g: 目標価値の期あたり成長率(既定: 月1%)
  C: 期あたりの基準拠出額(ドルコスト平均法でいう «毎月の積立額» に相当)

そのうえで、毎期«実際の評価額 P_t» を目標 V_t に一致させるように売買する:

    今期の売買額 = V_t − P_t
      プラスなら買い増し(下落した直後ほど多く買う)
      マイナスなら売却(上昇した直後ほど多く利確する)

ドルコスト平均法(毎期定額を買うだけ)と違い、**評価額が下がった直後は
多く買い、上がった直後は利益を確定する**という規律が、ルールそのものに
組み込まれている。dca_realize.py の解釈Bで «全額再投資が理屈に合う» と
分かったことを、恣意的な閾値(8%・20日)なしに定式化したもの。

■ 実務上の弱点(既知) ■
暴落直後は「目標に追いつくための購入額」が基準拠出額の何倍にも膨らむ。
無制限に買い増す前提は非現実的なので、上限(max_buy_multiple)を設ける。
上限に達した回数・規模を必ず報告し、隠さない。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from leverage_sim import LeverageFund


@dataclass
class VAParams:
    period_days: int = 21          # 1期間の営業日数(既定: 月次相当)
    growth_rate: float = 0.01      # 目標価値の期あたり成長率 g
    contribution: float = 1.0      # 期あたりの基準拠出額 C
    max_buy_multiple: float = 5.0  # 1回の購入上限(基準拠出額の何倍まで許容するか)
    allow_sell: bool = True        # False なら超過分を売らず拠出停止のみ(no-sell VA)


def simulate(lev_nav: pd.Series, params: VAParams) -> pd.DataFrame:
    """レバレッジ型ファンドのNAV系列を受け取り、バリュー平均法で運用した結果を返す。"""
    nav = lev_nav.to_numpy()
    n = len(nav)
    dates = lev_nav.index

    shares = 0.0          # 保有口数(NAV=1.0のときの«口»単位)
    target = 0.0          # 目標価値 V_t
    contributed = 0.0      # 真水で投入した累計額(買いが売りを上回った分の合計)
    capped_events = []     # 上限に達した回(日付, 必要額, 上限額)

    equity = np.zeros(n)
    target_arr = np.zeros(n)
    contributed_arr = np.zeros(n)

    for t in range(n):
        port_value = shares * nav[t]

        if t % params.period_days == 0:
            target = target * (1 + params.growth_rate) + params.contribution
            trade = target - port_value

            cap = params.contribution * params.max_buy_multiple
            if trade > cap:
                capped_events.append((dates[t], trade, cap))
                trade = cap
            if trade < 0 and not params.allow_sell:
                trade = 0.0   # no-sell版: 超過分は売らず放置し、次期の拠出を止めるだけ

            shares += trade / nav[t]
            contributed += max(trade, 0.0)
            port_value = shares * nav[t]

        equity[t] = port_value
        target_arr[t] = target
        contributed_arr[t] = contributed

    return pd.DataFrame({
        "date": dates, "equity": equity, "target": target_arr,
        "invested": contributed_arr,
    }), capped_events


def stats(bt: pd.DataFrame) -> dict:
    final_equity = bt["equity"].iloc[-1]
    final_invested = bt["invested"].iloc[-1]
    moic = final_equity / final_invested if final_invested > 0 else float("nan")

    years = len(bt) / 252
    irr_approx = moic ** (1 / years) - 1 if moic > 0 else float("nan")

    peak = bt["equity"].cummax()
    dd = ((peak - bt["equity"]) / peak.replace(0, np.nan)).fillna(0)

    daily_ret = bt["equity"].pct_change().replace([np.inf, -np.inf], np.nan).dropna()
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(252)
              if daily_ret.std() else 0)

    return {"years": years, "moic": moic, "irr_approx": irr_approx,
            "max_dd": dd.max(), "sharpe": sharpe, "final_invested": final_invested}


def sanity_check() -> bool:
    """検算: エッジゼロの合成データで、大勝ちしていないか(FXの検算哲学と同じ)。"""
    rng = np.random.default_rng(11)
    n = 252 * 10
    idx = pd.Series(
        100 * np.cumprod(1 + rng.normal(0, 0.015, n)),
        index=pd.bdate_range("2010-01-01", periods=n),
    )
    fund = LeverageFund(k=2.0, expense_ratio=0.009)
    lev_nav = fund.simulate(idx)
    bt, capped = simulate(lev_nav, VAParams())
    s = stats(bt)
    print("検算: エッジゼロの合成データでバリュー平均法を回す")
    print(f"  10年・MOIC: {s['moic']:.3f}倍   年率換算: {s['irr_approx']:+.1%}"
          f"   上限到達: {len(capped)}回")
    ok = s["moic"] < 3.0  # 大勝ちしすぎたらおかしい(目標が指数的に成長するため多少は割り引く)
    print(f"  → {'○ 想定内' if ok else '× エッジゼロなのに勝ちすぎている。バグを疑うこと'}")
    return ok


if __name__ == "__main__":
    ok = sanity_check()

    print(f"\n{'=' * 86}")
    print("実データ(日経平均)でバリュー平均法を検証。dca_realize.pyの各解釈と比較")
    print(f"{'=' * 86}")
    df = pd.read_parquet("bullbear/data/nikkei225_close.parquet")
    idx_full = df.set_index("date")["close"]
    fund = LeverageFund(k=2.0, expense_ratio=0.009)

    periods = [
        ("1949-01-01", "1990-01-01", "高度成長〜バブル"),
        ("1990-01-01", "2020-04-23", "バブル崩壊後30年"),
        ("2000-01-01", "2020-04-23", "2000年以降20年"),
        ("2010-01-01", "2020-04-23", "異次元緩和10年"),
        ("2007-01-01", "2010-01-01", "リーマンショック含む3年"),
    ]

    for label_kind, allow_sell in [("VA(売却あり・標準形)", True), ("VA(売却なし・拠出停止のみ)", False)]:
        print(f"\n--- {label_kind} ---")
        print(f"{'期間':>18} {'年数':>6} {'MOIC':>8} {'年率換算':>9} {'最大DD':>8} "
              f"{'シャープ':>8} {'上限到達':>8}")
        print("-" * 72)
        for a, b, label in periods:
            sub = idx_full[(idx_full.index >= a) & (idx_full.index < b)]
            lev_nav = fund.simulate(sub)
            params = VAParams(allow_sell=allow_sell)
            bt, capped = simulate(lev_nav, params)
            s = stats(bt)
            print(f"{label:>18} {s['years']:>5.1f}年 {s['moic']:>7.2f}x "
                  f"{s['irr_approx']:>+8.1%} {s['max_dd']:>7.1%} "
                  f"{s['sharpe']:>7.2f} {len(capped):>7d}回")

    print(f"\n{'=' * 86}")
    print("参考: 上限(基準拠出額の5倍)に達した « 必要拠出額 » の実態")
    print(f"{'=' * 86}")
    sub = idx_full[(idx_full.index >= "2007-01-01") & (idx_full.index < "2010-01-01")]
    lev_nav = fund.simulate(sub)
    _, capped = simulate(lev_nav, VAParams(allow_sell=True))
    print(f"リーマンショック含む3年間で上限到達 {len(capped)}回:")
    for date, need, cap in capped[:10]:
        print(f"  {date.date()}: 目標達成に基準拠出額の{need:.1f}倍が必要"
              f"(上限{cap:.1f}倍でキャップ)")
    if len(capped) > 10:
        print(f"  ...他{len(capped)-10}回")

    raise SystemExit(0 if ok else 1)
