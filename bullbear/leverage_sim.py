"""leverage_sim.py — レバレッジ型指数連動ファンドのNAVを再構築する。

    python bullbear/leverage_sim.py

レバレッジ型投信・ETF（例: NEXT FUNDS 日経平均レバレッジ・インデックス連動型上場投信[1570]）
は「原指数の《日次》リターンのN倍」になるよう毎日リバランスする設計。
これは目論見書に明記された機械的なルールなので、原指数の日次リターン列さえあれば
ファンドの理論NAV（信託報酬・追跡誤差を除く）を再構築できる。

■ 死守すべき1点（FXの shift+spread に相当）■
レバレッジ型ファンドは、原指数が横ばいでも「ボラティリティ減衰」で目減りする。
これは執行の巧拙やコストの話ではなく、**日次リバランスという設計そのものから
数学的に導かれる**。この効果を無視した検証は、FXでいう未来参照と同じくらい
致命的に結果を歪める。

減衰の近似式（k倍レバレッジ、日次分散 σ²、原指数の対数リターン R）:
    レバレッジ側の対数リターン ≈ k・R − T・σ²・k・(k−1)/2
    k=2 のとき、減衰項は ≈ −T・σ²（保有日数 × 日次分散）
つまり2倍レバレッジは、原指数が最終的に無変化でも、
保有期間中の実現分散の分だけ確実に目減りする。方向とは無関係。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class LeverageFund:
    """k倍・日次リバランス型のレバレッジファンドを表す。"""

    k: float = 2.0                  # レバレッジ倍率（1570等の主流は2倍）
    expense_ratio: float = 0.009    # 信託報酬（年率）。国内レバレッジ型は0.8〜1.0%程度が目安
    inverse: bool = False           # True なら k を負に（ベア型）

    def daily_factor(self) -> float:
        return (-self.k if self.inverse else self.k)

    def simulate(self, underlying: pd.Series) -> pd.Series:
        """原指数の価格列(pd.Series, indexは日付)から、レバレッジ型のNAV(初期値1.0)を返す。

        信託報酬は日割りで毎日差し引く（実際のファンドと同じ計上方法）。
        """
        r = underlying.pct_change().fillna(0.0)
        k = self.daily_factor()
        daily_fee = self.expense_ratio / 252
        lev_ret = k * r - daily_fee
        return (1 + lev_ret).cumprod()


def theoretical_decay(daily_vol: float, days: int, k: float = 2.0) -> float:
    """近似式 T・σ²・k・(k−1)/2 による減衰(対数リターンベース)。"""
    return days * daily_vol**2 * k * (k - 1) / 2


def realized_decay(underlying: pd.Series, k: float = 2.0) -> dict:
    """実際に複利計算した場合の «原指数k倍の単純計算» との乖離を測る。

    「原指数がT_end/T_start倍になった」ときに「レバレッジ側もその k乗になる」
    という誤解を正す。この誤解こそが、レバレッジ商品を検証せずに売る
    説明資料が陥りがちな罠。
    """
    fund = LeverageFund(k=k, expense_ratio=0.0)  # 信託報酬抜きで純粋な数学効果だけ見る
    lev_nav = fund.simulate(underlying)

    underlying_total = underlying.iloc[-1] / underlying.iloc[0] - 1
    naive_kx = (1 + underlying_total) ** k - 1          # よくある誤解
    actual_lev = lev_nav.iloc[-1] - 1

    r = underlying.pct_change().dropna()
    daily_vol = r.std()
    days = len(r)
    decay_log = theoretical_decay(daily_vol, days, k)

    return {
        "underlying_total_return": underlying_total,
        "naive_k_times": naive_kx,
        "actual_leveraged_return": actual_lev,
        "gap_vs_naive": actual_lev - naive_kx,
        "daily_vol": daily_vol,
        "days": days,
        "theoretical_log_decay": decay_log,
        "implied_decay_pct": 1 - np.exp(-decay_log),  # 減衰の近似を%に変換
    }


def sanity_check() -> bool:
    """検算: レバレッジ減衰は «必ず» 起きる。起きなければ実装のバグ。

    最初、単一のランダムウォーク1本で検算しようとして誤った(下記の教訓を参照)。
    ランダムパス1本では «そのパスがたまたま上下どちらに振れたか» のノイズが
    支配的で、構造的な減衰効果と分離できない。決定論的な往復相場なら
    ノイズなしで厳密に検算できる。
    """
    failures = []

    # --- 検算A: 決定論的な往復相場（乱数なし・厳密一致が取れる） -----------
    x, n_cycles = 0.05, 500
    prices = [100.0]
    for _ in range(n_cycles):
        prices.append(prices[-1] * (1 + x))
        prices.append(prices[-1] * (1 - x))
    s = pd.Series(prices, index=pd.bdate_range("2000-01-01", periods=len(prices)))

    fund = LeverageFund(k=2.0, expense_ratio=0.0)
    lev = fund.simulate(s)
    expect_underlying = (1 + x) * (1 - x)
    expect_lev = (1 + 2 * x) * (1 - 2 * x)
    got_underlying = (s.iloc[-1] / s.iloc[0]) ** (1 / n_cycles)
    got_lev = lev.iloc[-1] ** (1 / n_cycles)

    print("検算A: 決定論的な往復相場（+5%→-5%を500回・乱数なし）")
    print(f"  原指数の1周期あたり倍率: 実測 {got_underlying:.6f}  理論 {expect_underlying:.6f}")
    print(f"  レバ側の1周期あたり倍率: 実測 {got_lev:.6f}  理論 {expect_lev:.6f}")
    ok_a = (abs(got_underlying - expect_underlying) < 1e-9
            and abs(got_lev - expect_lev) < 1e-9)
    print(f"  → {'○ 理論式と厳密一致' if ok_a else '× 不一致。実装を疑うこと'}")
    if not ok_a:
        failures.append("決定論的往復相場のシミュレーションが理論式と一致しない")

    print(f"  参考: 原指数は{(s.iloc[-1]/s.iloc[0]-1):+.1%}(ほぼ横ばい)なのに"
          f"レバ側は{(lev.iloc[-1]-1):+.1%}まで溶ける")

    # --- 検算B: モンテカルロで理論減衰式と実測が一致するか -------------------
    rng = np.random.default_rng(42)
    vol_daily, n_days, n_paths = 0.015, 252 * 10, 2000
    log_r = rng.normal(0, vol_daily, (n_paths, n_days))       # ドリフト厳密ゼロ
    simple_r = np.exp(log_r) - 1.0
    underlying_paths = np.cumprod(1 + simple_r, axis=1)
    lev_paths = np.cumprod(1 + 2.0 * simple_r, axis=1)

    naive_kx = (underlying_paths[:, -1]) ** 2
    med_naive_log = np.log(np.median(naive_kx))
    med_lev_log = np.log(np.median(lev_paths[:, -1]))
    theo = theoretical_decay(vol_daily, n_days, k=2.0)
    measured = med_naive_log - med_lev_log

    print(f"\n検算B: モンテカルロ({n_paths}パス)で理論減衰式と実測を比較")
    print(f"  理論減衰(対数): {theo:.4f}   実測: {measured:.4f}")
    ok_b = abs(theo - measured) < 0.02
    print(f"  → {'○ 理論式と整合' if ok_b else '× 理論式とずれている。実装を疑うこと'}")
    if not ok_b:
        failures.append(f"モンテカルロの実測減衰({measured:.4f})が理論値({theo:.4f})と大きくずれる")

    # --- 発見: 平均と中央値が大きく乖離する(レバレッジ商品特有の右歪度) -------
    mean_ret = lev_paths[:, -1].mean() - 1
    med_ret = np.median(lev_paths[:, -1]) - 1
    print(f"\n参考: レバレッジ型10年リターンの分布は強く右に歪む")
    print(f"  平均 {mean_ret:+.1%}  /  中央値 {med_ret:+.1%}")
    print("  « 平均リターンが高い » ことと « 典型的に儲かる » ことは別物。")
    print("  少数の極端な好走パスが平均を押し上げ、大多数は中央値の水準に留まる。")

    print()
    if failures:
        print("結果: 失敗")
        for f in failures:
            print(f"  - {f}")
        return False
    print("結果: 合格。レバレッジ減衰シミュレーションは信頼してよい。")
    return True


if __name__ == "__main__":
    ok = sanity_check()

    print(f"\n{'=' * 78}")
    print("実データ(日経平均 1949-2020)で、2倍レバレッジの «単純買い持ち» を検証")
    print(f"{'=' * 78}")
    df = pd.read_parquet("bullbear/data/nikkei225_close.parquet")
    idx = df.set_index("date")["close"]
    res = realized_decay(idx, k=2.0)
    print(f"  期間: {idx.index[0].date()} 〜 {idx.index[-1].date()}  "
          f"({res['days']:,}営業日)")
    print(f"  原指数の累積リターン         : {res['underlying_total_return']:+.1%}")
    print(f"  «2倍» という誤解での期待値    : {res['naive_k_times']:+.1%}")
    print(f"  実際のレバレッジ型(信託報酬抜き): {res['actual_leveraged_return']:+.1%}")
    fund = LeverageFund(k=2.0, expense_ratio=0.009)
    lev_with_fee = fund.simulate(idx)
    print(f"  実際のレバレッジ型(信託報酬0.9%込): {(lev_with_fee.iloc[-1]-1):+.1%}")

    raise SystemExit(0 if ok else 1)
