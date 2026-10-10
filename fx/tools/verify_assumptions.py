"""verify_assumptions.py — 設計書の主張を、独立な方法で叩く敵対的検証スイート。

    python fx/tools/verify_assumptions.py

risk_math.py が「設計書の数字を再現する」のに対し、こちらは
**設計書が間違っていないかを疑う** ためのもの。

やること:
  検証1  必要シャープの解析解を、モンテカルロで裏取りする
  検証2  DSR足切り式を、実際にn本の無エッジ戦略を回して裏取りする
  検証3  日次iid正規という仮定が、ファットテールで崩れないか
  検証4  シャープが「推定値」であることを織り込むと、リスクがどう変わるか
  検証5  短期間でシャープを測ることに意味があるか（運用ゲートの妥当性）
  検証6  DDガバナーの効果とコスト。階段設計の比較
  検証7  ギャップリスク。レバレッジ上限の妥当性

結果は docs/05-検証結果.md にまとめてある。
"""

from __future__ import annotations

from math import exp, sqrt
from statistics import NormalDist

import numpy as np

N = NormalDist()
EULER = 0.5772156649
rng = np.random.default_rng(2024)

PATHS = 100_000        # 軽くしたいときはここを下げる
DAYS = 252


def rule(t: str) -> None:
    print(f"\n{'=' * 82}\n{t}\n{'=' * 82}")


def sharpe_se(s: float, years: float) -> float:
    """年率シャープ推定量の標準誤差（Lo 2002）。"""
    return sqrt((1 + s**2 / 2) / years)


def gbm(sharpe, vol, days=DAYS, n=PATHS, kind="normal"):
    """(最終リターン, 最大DD) を返す。sharpe は配列でもよい（推定誤差の織り込み用）。"""
    dt = 1 / DAYS
    mu = np.asarray(sharpe) * vol * dt - 0.5 * vol**2 * dt
    sd = vol * sqrt(dt)
    if mu.ndim:
        mu = mu[:, None]

    if kind == "normal":
        r = mu + sd * rng.normal(0, 1, size=(n, days))
    elif kind == "t4":                       # ファットテール（分散1に正規化）
        df = 4
        r = mu + sd * rng.standard_t(df, size=(n, days)) / sqrt(df / (df - 2))
    elif kind == "garch":                    # ボラクラスタリング
        a, b = 0.08, 0.90
        om, h = 1 - a - b, np.ones(n)
        r = np.empty((n, days))
        for t in range(days):
            z = rng.normal(0, 1, n)
            r[:, t] = (mu[:, 0] if mu.ndim else mu) + sd * np.sqrt(h) * z
            h = om + a * z**2 + b * h

    eq = np.exp(np.cumsum(r, axis=1))
    peak = np.maximum.accumulate(eq, axis=1)
    return eq[:, -1] - 1, ((peak - eq) / peak).max(axis=1)


def check_1_required_sharpe() -> None:
    rule("検証1: 必要シャープの解析解 vs モンテカルロ")
    print(f"{'ボラ':>7} {'目標確率p':>10} {'解析解S':>9} {'MC実測':>9} {'判定':>8}")
    print("-" * 50)
    for vol in (0.20, 0.30, 0.40):
        for p in (0.50, 0.80, 0.90):
            from math import log
            s = log(1.40) / vol + vol / 2 + N.inv_cdf(p)
            ret, _ = gbm(s, vol)
            got = (ret >= 0.40).mean()
            print(f"{vol:6.0%} {p:10.0%} {s:9.2f} {got:8.1%} "
                  f"{'OK' if abs(got - p) < 0.006 else '*ズレ*':>8}")


def check_2_dsr() -> None:
    rule("検証2: DSR足切り式 vs モンテカルロ（真のシャープ=0の戦略をn本試す）")

    def formula(n_trials, years):
        v = 1.0 / years
        return sqrt(v) * ((1 - EULER) * N.inv_cdf(1 - 1 / n_trials)
                          + EULER * N.inv_cdf(1 - 1 / (n_trials * exp(1))))

    print(f"{'年数':>6} {'試行n':>8} {'式':>7} {'MC実測':>8} {'判定':>8}")
    print("-" * 42)
    for years in (5, 10):
        for n_trials in (10, 100, 1000):
            days = int(DAYS * years)
            # 総乱数量を一定に保つ。大きなnほど1回の試行で精度が出るのでreps
            # を減らしてよい（最良値の分散はnが増えるほど小さくなる）。
            reps = max(200, int(4e7 / (n_trials * days)))
            best = np.empty(reps)
            for i in range(reps):
                x = rng.normal(0, 1 / sqrt(DAYS), size=(n_trials, days))
                sr = x.mean(axis=1) / x.std(axis=1) * sqrt(DAYS)
                best[i] = sr.max()
            mc, f = best.mean(), formula(n_trials, years)
            print(f"{years:5d}年 {n_trials:8d} {f:7.2f} {mc:8.2f} "
                  f"{'OK' if abs(mc - f) < 0.08 else '*ズレ*':>8}")


def check_3_fat_tails() -> None:
    rule("検証3: 日次iid正規という仮定は、ファットテールで崩れるか")
    print("  一次目標の構成（ネットS=1.5・ボラ30%）で分布だけ差し替える")
    print(f"\n{'分布の仮定':>26} | {'P(>=40%)':>9} {'P(年間<0)':>10} "
          f"{'DD中央':>7} {'DD90%':>7} {'DD99%':>7}")
    print("-" * 74)
    for label, kind in [("正規（設計書の仮定）", "normal"),
                        ("t分布 df=4（ファットテール）", "t4"),
                        ("GARCH（ボラクラスタリング）", "garch")]:
        ret, dd = gbm(1.5, 0.30, kind=kind)
        print(f"{label:>26} | {(ret >= 0.40).mean():8.1%} {(ret < 0).mean():9.1%} "
              f"{np.median(dd):6.1%} {np.percentile(dd, 90):6.1%} "
              f"{np.percentile(dd, 99):6.1%}")
    print("\n  → ほぼ動かない。年次に集計する過程で中心極限定理が効き、日次の尖りは消える。")
    print("    『ファットテールがあるからDDはもっと深い』は、原因の特定として誤り。")


def check_4_parameter_uncertainty() -> None:
    rule("検証4: シャープは推定値である。それを織り込むとリスクはどう変わるか")
    s_hat, years, vol = 1.5, 3, 0.30
    se = sharpe_se(s_hat, years)
    print(f"  OOS{years}年でシャープ{s_hat}と測定 → 標準誤差 {se:.2f}、"
          f"95%信頼区間 [{s_hat - 1.96 * se:.2f}, {s_hat + 1.96 * se:.2f}]\n")

    print(f"{'扱い':>34} | {'P(>=40%)':>9} {'P(年間<0)':>10} {'DD90%':>7} "
          f"{'DD99%':>7} {'P(DD>30%)':>10}")
    print("-" * 84)
    for label, draw in [
        ("設計書の扱い（S=1.5を確定値とする）", np.full(PATHS, s_hat)),
        ("推定誤差を織り込む（S~N(1.5, SE)）", rng.normal(s_hat, se, PATHS)),
    ]:
        ret, dd = gbm(draw, vol)
        print(f"{label:>34} | {(ret >= 0.40).mean():8.1%} {(ret < 0).mean():9.1%} "
              f"{np.percentile(dd, 90):6.1%} {np.percentile(dd, 99):6.1%} "
              f"{(dd > 0.30).mean():9.1%}")
        if not np.all(draw == s_hat):
            print(f"{'':>36}   ※ 真のシャープが0以下だった確率: {(draw <= 0).mean():.1%}")
    print("\n  → 設計書の数値は楽観。原因はファットテールではなく推定誤差。")


def check_5_measurement_period() -> None:
    rule("検証5: 短い期間でシャープを測ることに意味はあるか（運用ゲートの妥当性）")
    print(f"{'期間':>16} {'測定SE':>9} {'95%信頼区間（真S=1.5）':>26} {'判定':>14}")
    print("-" * 70)
    for label, yrs in [("デモ3ヶ月", 0.25), ("実弾3ヶ月", 0.25), ("6ヶ月", 0.5),
                       ("1年", 1.0), ("3年（OOS）", 3.0), ("9年（WF+OOS）", 9.0)]:
        s = sharpe_se(1.5, yrs)
        verdict = "使える" if s < 0.5 else ("参考程度" if s < 1.0 else "★ほぼノイズ")
        ci = f"[{1.5 - 1.96 * s:5.2f}, {1.5 + 1.96 * s:5.2f}]"
        print(f"{label:>16} {s:9.2f} {ci:>26} {verdict:>14}")
    print("\n  → 3ヶ月のシャープはSE=2.92でノイズそのもの。")
    print("    『デモ3ヶ月で実測シャープが検証値の60%以上』というゲートは統計的に無意味。")


def _run_governor(sharpe, vol, ladder, years=3, n=40_000):
    days, dt = int(DAYS * years), 1 / DAYS
    mu, sd = sharpe * vol * dt - 0.5 * vol**2 * dt, vol * sqrt(dt)
    eq = peak = np.ones(n)
    mx, dead = np.zeros(n), np.zeros(n, bool)
    for _ in range(days):
        dd = (peak - eq) / peak
        lev = np.ones(n)
        for thr, sc in ladder:
            lev = np.where(dd >= thr, sc, lev)
        if ladder:
            dead |= dd >= ladder[-1][0]
        lev = np.where(dead, 0.0, lev)
        eq = eq * np.exp(lev * (mu + sd * rng.normal(0, 1, n)))
        peak = np.maximum(peak, eq)
        mx = np.maximum(mx, (peak - eq) / peak)
    return eq - 1, mx, dead


LADDERS = {
    "設計案（10/15/20/30）": [(0.10, 0.70), (0.15, 0.50), (0.20, 0.30), (0.30, 0.0)],
    "緩め（15/22/30/40）": [(0.15, 0.70), (0.22, 0.50), (0.30, 0.30), (0.40, 0.0)],
    "2段のみ（20/35）": [(0.20, 0.50), (0.35, 0.0)],
    "ガバナーなし": [],
}


def check_6_governor() -> None:
    rule("検証6a: DDガバナーの効果とコスト（3年・ネットS=1.5・ボラ30%）")
    print(f"{'階段':>22} | {'3年中央':>9} {'下位10%':>9} {'P(3年<0)':>9} "
          f"{'DD90%':>7} {'DD99%':>7} {'停止率':>7}")
    print("-" * 80)
    for name, ladder in LADDERS.items():
        ret, dd, dead = _run_governor(1.5, 0.30, ladder)
        print(f"{name:>22} | {np.median(ret):+8.0%} {np.percentile(ret, 10):+8.0%} "
              f"{(ret < 0).mean():8.1%} {np.percentile(dd, 90):6.1%} "
              f"{np.percentile(dd, 99):6.1%} {dead.mean():6.1%}")
    print("\n  → ガバナーはDDを大きく抑えるが、リターンの約1/3を代償に払う。")

    rule("検証6b: 真のシャープが期待より低かったとき、ガバナーは効くか")
    print(f"{'真のS':>7} {'ガバナー':>10} | {'3年中央':>9} {'P(3年<0)':>9} "
          f"{'DD90%':>7} {'停止率':>7}")
    print("-" * 60)
    for s in (1.5, 0.75, 0.0):
        for label, ladder in [("なし", []), ("設計案", LADDERS["設計案（10/15/20/30）"])]:
            ret, dd, dead = _run_governor(s, 0.30, ladder)
            print(f"{s:7.2f} {label:>10} | {np.median(ret):+8.0%} "
                  f"{(ret < 0).mean():8.1%} {np.percentile(dd, 90):6.1%} {dead.mean():6.1%}")
    print("\n  → エッジがあるときは保険料、エッジがないときは命綱。")
    print("    真のS=0なら DD90% を66% → 30% に抑え、約半数を3年以内に停止させる（正しい挙動）。")


def check_7_gap_risk() -> None:
    rule("検証7: ギャップリスク。レバレッジ上限10倍は妥当か")
    print("  国内FXの必要証拠金は建玉の1/25。実効レバL倍なら証拠金は資金のL/25、")
    print("  余力は 1 - L/25。単発ギャップの損失がこれを超えると強制ロスカット。\n")
    print(f"{'実効レバ':>10} {'必要証拠金':>11} {'余力':>8} | "
          f"{'2%ギャップ':>11} {'3%ギャップ':>11} {'5%ギャップ':>11}")
    print("-" * 72)
    for lev in (4.0, 10.0, 22.7):
        buf = 1 - lev / 25
        cells = []
        for gap in (0.02, 0.03, 0.05):
            loss = lev * gap
            cells.append(f"{loss:.0%} {'✗LC' if loss > buf else '○'}")
        print(f"{lev:9.1f}倍 {lev / 25:10.0%} {buf:7.0%} | "
              + " | ".join(f"{c:>9}" for c in cells))
    print("\n  → 上限10倍なら5%ギャップでも証拠金は耐える（資金の50%を失うが退場はしない）。")
    print("    仲値単体に必要な22.7倍は、2%ギャップで即強制ロスカット。上限10倍の設定は妥当。")


def main() -> None:
    check_1_required_sharpe()
    check_2_dsr()
    check_3_fat_tails()
    check_4_parameter_uncertainty()
    check_5_measurement_period()
    check_6_governor()
    check_7_gap_risk()
    print(f"\n{'=' * 82}\n結果のまとめは docs/05-検証結果.md を参照。\n{'=' * 82}")


if __name__ == "__main__":
    main()
