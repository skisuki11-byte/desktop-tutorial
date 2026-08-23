"""risk_math.py — 設計書 01 のリスク数値を再現する検算スクリプト。

    python fx/tools/risk_math.py

docs/01-目標とリスク設計.md に載っている表は、すべてこのスクリプトの出力。
前提を変えたくなったら（目標リターン、達成確率、原資産ボラ、税率）
下の定数を書き換えて回し直す。設計書の数字を手で書き換えないこと。

モデルの前提と限界:
  - 日次リターンは iid 正規と仮定している。実際のFXはファットテールで
    自己相関もあるため、ここで出るDDは「楽観側の推定」。
    実運用の想定DDは、この出力より深くなると考えておく。
  - シャープは年率・コスト控除後（ネット）。バックテスト値ではなく
    「実運用で持続する値」を入れること。
"""

from __future__ import annotations

from math import exp, log, sqrt
from statistics import NormalDist

import numpy as np

# --- 前提 -------------------------------------------------------------------
TARGET_RETURN = 0.40       # 目標年利
CONFIDENCE = 0.80          # 「かなりの確率」の定義
TAX_RATE = 0.20315         # 国内店頭FX 申告分離
UNDERLYING_VOL = 0.09      # USD/JPY の原資産年率ボラ想定
TRADING_DAYS = 252
N_PATHS = 200_000
EULER = 0.5772156649

N = NormalDist()
rng = np.random.default_rng(42)


def required_sharpe(target: float, vol: float, p: float) -> float:
    """P(年次リターン >= target) = p となる年率シャープ（解析解）。

    年次対数リターン X ~ N(mu - vol^2/2, vol^2) のとき
        P(e^X - 1 >= target) = p
        <=> S = mu/vol = ln(1+target)/vol + vol/2 + Phi^-1(p)
    """
    return log(1 + target) / vol + vol / 2 + N.inv_cdf(p)


def simulate(sharpe: float, vol: float, years: float = 1.0):
    """GBMでN_PATHS本の等資産曲線を生成し、(最終リターン, 最大DD) を返す。"""
    steps = int(TRADING_DAYS * years)
    dt = 1 / TRADING_DAYS
    r = rng.normal(
        sharpe * vol * dt - 0.5 * vol**2 * dt,
        vol * sqrt(dt),
        size=(N_PATHS, steps),
    )
    eq = np.exp(np.cumsum(r, axis=1))
    peak = np.maximum.accumulate(eq, axis=1)
    return eq[:, -1] - 1.0, ((peak - eq) / peak).max(axis=1)


def expected_max_sharpe(n_trials: int, years: float) -> float:
    """真のシャープ=0の戦略をn本試したときの、最良バックテストシャープ期待値。

    これ以下の成績は「偶然」と区別できない = 足切りライン。
    """
    v = 1.0 / years
    return sqrt(v) * (
        (1 - EULER) * N.inv_cdf(1 - 1 / n_trials)
        + EULER * N.inv_cdf(1 - 1 / (n_trials * exp(1)))
    )


def combined_sharpe(single: float, n: int, rho: float) -> float:
    """個別シャープsingleの戦略をn本、相関rhoで等リスク配分した合成シャープ。"""
    return single * n / sqrt(n + n * (n - 1) * rho)


def rule(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def main() -> None:
    # --- 1 -----------------------------------------------------------------
    rule(f"1) 年利{TARGET_RETURN:.0%}を確率Pで達成するのに必要な年率シャープ（税引前・ネット）")
    probs = (0.50, 0.60, 0.70, 0.80, 0.90)
    print(f"{'年率ボラ':>10} | " + " | ".join(f"P={p:.0%}" for p in probs))
    print("-" * 60)
    for vol in (0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.60, 1.00):
        row = [required_sharpe(TARGET_RETURN, vol, p) for p in probs]
        print(f"{vol:9.0%} | " + " | ".join(f"{v:5.2f}" for v in row))
    print("\n※ ボラを上げても必要シャープは頭打ちになる。リスクで勝率は買えない。")

    # --- 2 -----------------------------------------------------------------
    rule(f"2) 年利{TARGET_RETURN:.0%}をP={CONFIDENCE:.0%}で取る各構成の、実際のドローダウン")
    print(f"{'年率ボラ':>10} {'必要S':>7} {'期待年利':>9} | "
          f"{'DD中央':>7} {'DD90%':>7} {'DD99%':>7} | {'P(DD>20%)':>10} {'P(DD>50%)':>10}")
    print("-" * 88)
    for vol in (0.15, 0.20, 0.30, 0.40, 0.60):
        s = required_sharpe(TARGET_RETURN, vol, CONFIDENCE)
        _, dd = simulate(s, vol)
        print(f"{vol:9.0%} {s:7.2f} {s * vol:8.1%} | "
              f"{np.median(dd):6.1%} {np.percentile(dd, 90):6.1%} {np.percentile(dd, 99):6.1%} | "
              f"{(dd > 0.20).mean():9.1%} {(dd > 0.50).mean():9.1%}")
    print("\n※ 『最大DD20%以内』と両立させるには必要シャープが2.62まで上がる。")

    # --- 3 -----------------------------------------------------------------
    rule("3) 年利は目標にできない: 年率ボラ40%までレバレッジをかけた場合の実際の姿")
    print(f"{'ネットS':>8} {'期待年利':>9} | {'P(>=40%)':>9} {'P(年間<0)':>10} "
          f"{'DD中央':>7} {'P(DD>50%)':>10}")
    print("-" * 62)
    for s in (0.5, 0.8, 1.0, 1.5, 2.0, 2.5):
        ret, dd = simulate(s, 0.40)
        print(f"{s:8.1f} {s * 0.40:8.0%} | {(ret >= TARGET_RETURN).mean():8.1%} "
              f"{(ret < 0).mean():9.1%} {np.median(dd):6.1%} {(dd > 0.50).mean():9.1%}")
    print("\n※ ネットS=1.0 は『期待年利ちょうど40%』。しかし達成確率は約半分、")
    print("   5回に1回は年間マイナス。期待年利と達成確率はまったく別物。")

    # --- 3b ----------------------------------------------------------------
    rule("3b) 段階目標: ネットシャープごとの現実的な姿")
    print(f"{'ネットS':>8} {'運用ボラ':>9} {'期待年利':>9} | "
          f"{'P(>=40%)':>9} {'P(年間<0)':>10} {'DD中央':>7} {'DD90%':>7}")
    print("-" * 74)
    for s, vol in [(0.5, 0.40), (1.0, 0.25), (1.5, 0.30), (1.88, 0.40),
                   (2.0, 0.40), (2.62, 0.20)]:
        ret, dd = simulate(s, vol)
        print(f"{s:8.2f} {vol:8.0%} {s * vol:8.0%} | "
              f"{(ret >= TARGET_RETURN).mean():8.1%} {(ret < 0).mean():9.1%} "
              f"{np.median(dd):6.1%} {np.percentile(dd, 90):6.1%}")

    # --- 4 -----------------------------------------------------------------
    rule("4) 評価期間を3年に取ると何が変わるか（ネットS=1.5, ボラ30%）")
    ret3, dd3 = simulate(1.5, 0.30, years=3)
    print(f"  3年累積リターン  中央値 {np.median(ret3):+.0%} / "
          f"下位10% {np.percentile(ret3, 10):+.0%} / 下位1% {np.percentile(ret3, 1):+.0%}")
    print(f"  3年トータルでマイナスになる確率  {(ret3 < 0).mean():.1%}")
    print(f"  3年間の最大DD  中央 {np.median(dd3):.1%} / 90%点 {np.percentile(dd3, 90):.1%}")
    print("\n※ 単年の未達は撤退理由にしない。判定は3年累積で行う。")

    # --- 5 -----------------------------------------------------------------
    rule("5) 選択バイアス: 真のエッジがゼロでも出てしまうシャープ（=足切りライン）")
    trials = (10, 30, 100, 300, 1000)
    print(f"{'検証年数':>10} | " + " | ".join(f"{n}本試行" for n in trials))
    print("-" * 64)
    for years in (3, 5, 10, 20):
        row = [expected_max_sharpe(n, years) for n in trials]
        print(f"{years:8d}年 | " + " | ".join(f"{v:6.2f}" for v in row))
    print("\n※ データを5年→10年にするだけで足切りが下がり、通せる戦略の幅が広がる。")

    # --- 6 -----------------------------------------------------------------
    rule("6) 相関がすべてを決める: 個別S=0.7の戦略をN本束ねた合成シャープ")
    counts = (1, 2, 3, 5, 8, 12)
    print(f"{'相関':>8} | " + " | ".join(f"N={n:<3}" for n in counts))
    print("-" * 56)
    for rho in (0.0, 0.1, 0.2, 0.3, 0.5):
        row = [combined_sharpe(0.7, n, rho) for n in counts]
        print(f"{rho:8.1f} | " + " | ".join(f"{v:5.2f}" for v in row))
    print("\n※ 相関0.5は何本足しても0.95で止まる。本数より相関を下げるほうが効く。")

    # --- 7 -----------------------------------------------------------------
    rule("7) 稼働率とレバレッジ: 目標ボラ40%に届くか")
    print(f"   （USD/JPY 原資産年率ボラ {UNDERLYING_VOL:.0%} 想定）")
    print(f"{'戦略':>28} {'保有/日':>9} {'稼働率':>8} {'実効ボラ':>9} {'必要レバ':>9} {'判定':>12}")
    print("-" * 82)
    for name, minutes in [
        ("仲値アノマリー(9:00-9:55)", 55),
        ("東京時間のみ", 360),
        ("ロンドン+NY", 600),
        ("常時保有(トレンド追随)", 1440),
        ("3戦略x2通貨ペア並走", 1440 * 3),
    ]:
        duty = minutes / 1440
        eff_vol = UNDERLYING_VOL * sqrt(duty)
        lev = 0.40 / eff_vol
        verdict = "○" if lev <= 10 else ("△レバ過大" if lev <= 25 else "×届かない")
        print(f"{name:>28} {minutes:7d}分 {duty:7.1%} {eff_vol:8.2%} "
              f"{lev:8.1f}倍 {verdict:>12}")
    print("\n※ 上限10倍（設計判断⑥）に収めるには、複数戦略の並走が必要。")

    # --- 8 -----------------------------------------------------------------
    rule("8) 税引後で見た場合の要求")
    for after in (0.20, 0.30, 0.40):
        print(f"  手取り {after:.0%}  ->  税引前 {after / (1 - TAX_RATE):5.1%} が必要")
    print()
    pre = TARGET_RETURN / (1 - TAX_RATE)
    print(f"{'年率ボラ':>10} | {'税引前40%':>10} | {'税引後40%':>10} | {'差':>6}")
    print("-" * 48)
    for vol in (0.20, 0.30, 0.40):
        a = required_sharpe(TARGET_RETURN, vol, CONFIDENCE)
        b = required_sharpe(pre, vol, CONFIDENCE)
        print(f"{vol:9.0%} | {a:10.2f} | {b:10.2f} | {b - a:+6.2f}")


if __name__ == "__main__":
    main()
