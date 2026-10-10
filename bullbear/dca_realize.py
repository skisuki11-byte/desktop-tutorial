"""dca_realize.py — セミナーで謳われた戦略を実装・検証する。

    python bullbear/dca_realize.py

Notion記録（エフクリ社内ミーティング, 2026-08-19）で説明された戦略:
  「レバレッジ型投資信託（ブル商品）を毎日積み立てて買い、
    上昇時に利益確定→買い直しを繰り返す複利運用」
  「デイトレードのような超短期ではなく、数日〜1ヶ月程度保有する『短期』」
  「過去のクライアント実績として年率14%以上」

この説明は曖昧なので(利確の閾値・最大保有期間の具体値がない)、
以下のルールとして具体化して検証する。**これは公式のルールではなく、
検証可能な形に翻訳した一つの解釈である。**

  ルール:
    1. 毎営業日、一定額をレバレッジ型ファンド(2倍)に新規購入(建玉=ロット)
    2. 個々のロットの含み益が利確閾値(既定+8%)に達したら翌日に利確、現金化
    3. 利確閾値に届かないまま最大保有日数(既定20営業日=約1ヶ月)を超えたロットは
       強制的に手仕舞う(セミナーの「数日〜1ヶ月」という説明に対応)
    4. 現金化した分は、また毎日の新規購入に回る(複利運用)

これは「単純な買い持ち」(leverage_sim.py)がボラティリティ減衰で溶けるのに対し、
利益を早めに確定させることで減衰の影響時間を短く抑えようという狙い。
狙い自体は理屈が通っているため、実際にどこまで効くかを検証する。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from leverage_sim import LeverageFund


@dataclass
class DCARealizeParams:
    take_profit: float = 0.08     # ロットごとの利確ライン
    max_hold_days: int = 20       # 強制手仕舞いまでの最大保有日数(約1ヶ月)
    daily_invest: float = 1.0     # 毎日の新規購入額(単位は任意。相対比較に使う)
    # ★この1つのフラグが結果を桁違いに左右する(下記コメント参照)★
    reinvest_full_proceeds: bool = False


def simulate(lev_nav: pd.Series, params: DCARealizeParams) -> pd.DataFrame:
    """レバレッジ型ファンドのNAV系列(leverage_sim.LeverageFund.simulateの出力)を
    受け取り、毎日ロットを建てて利確/期限手仕舞いを繰り返すシミュレーションを行う。

    ■ reinvest_full_proceeds が結果を桁違いに左右する ■
    Notionの説明「毎日積み立てて買い、上昇時に利益確定→買い直しを繰り返す
    « 複利運用 »」は、次の2通りに解釈できてしまい、書き分けがない:

      A) False(既定): 利確した現金は « 毎日$1ずつ » 新規ロットに回す(定額積立を継続)。
         過去に積み上がった現金の額に関わらず、1日の新規建玉サイズは常に一定。
      B) True: 利確した現金は « その場で全額 » 次のロットに回す。

      実装してみて分かったのは、Aは実質的に «線形» の蓄積にしかならないこと。
      毎日1ロットが建ち、平均して1ロットが閉じるという定常状態になった時点で、
      増えるのは «1ロットあたりの平均エッジ×経過日数» という線形項だけになり、
      «複利» と呼べる指数関数的な増え方をしない。1949-1990年の日経平均のような
      年率+14%の超長期上昇相場ですら、この解釈だと資金はほぼ全損する
      (docs/09参照)。Bにして初めて、利益が次のロットの «サイズ» を押し上げ、
      文字通りの複利になる。

    現金は無利息(保守的)。手数料は « レバレッジ型ファンド自体の信託報酬 » に
    集約されているものとし、売買委託手数料は簡略化のため考慮しない
    (ネット証券の投信は購入時手数料無料が主流のため、無視しても大きくは歪まない)。
    """
    nav = lev_nav.to_numpy()
    n = len(nav)
    open_lots: list[tuple[int, float]] = []   # (購入日index, 購入時のロットサイズ, 購入時NAV)
    cash = 0.0
    contributed = 0.0                          # 外部から投入された真水の資金(積立)
    equity = np.zeros(n)
    contributed_arr = np.zeros(n)

    for t in range(n):
        still_open = []
        for buy_t, size, buy_nav in open_lots:
            ret = nav[t] / buy_nav - 1
            held = t - buy_t
            if ret >= params.take_profit or held >= params.max_hold_days:
                cash += size * (nav[t] / buy_nav)
            else:
                still_open.append((buy_t, size, buy_nav))
        open_lots = still_open

        if params.reinvest_full_proceeds:
            # 手元現金を « 全額 » 当日の新規ロットに回す。積み増しはしない
            # (現金が0でも最低限$0の建玉にはしない=完全に利益を再投資する設計)
            lot_size = cash
            cash = 0.0
            if lot_size <= 0:
                # 初回など現金が無いときだけ真水の$1を入れて種銭にする
                lot_size = params.daily_invest
                contributed += params.daily_invest
        else:
            # 既定: 定額積立。現金があれば充当し、足りない分だけ真水を追加投入
            if cash >= params.daily_invest:
                cash -= params.daily_invest
            else:
                contributed += params.daily_invest - cash
                cash = 0.0
            lot_size = params.daily_invest

        open_lots.append((t, lot_size, nav[t]))
        mtm = sum(size * (nav[t] / bn) for _, size, bn in open_lots)
        equity[t] = cash + mtm
        contributed_arr[t] = contributed

    return pd.DataFrame({
        "date": lev_nav.index,
        "equity": equity,
        "invested": (contributed_arr if params.reinvest_full_proceeds
                    else np.cumsum(np.full(n, params.daily_invest))),
    })


def stats(bt: pd.DataFrame) -> dict:
    """毎日積立があるため、単純な始値/終値比較ではなく «投じた額に対する評価額» で測る。"""
    final_equity = bt["equity"].iloc[-1]
    final_invested = bt["invested"].iloc[-1]
    moic = final_equity / final_invested   # 投下資金倍率(multiple on invested capital)

    daily_ret = bt["equity"].pct_change().dropna()
    # 積立期間中は残高が小さく歩留まりが大きいため、後半(積立が十分積み上がった後)
    # のシャープはあまり意味を持たない。ここでは参考値として全期間を出す。
    sharpe = daily_ret.mean() / daily_ret.std() * np.sqrt(252) if daily_ret.std() else 0

    peak = bt["equity"].cummax()
    dd = ((peak - bt["equity"]) / peak.replace(0, np.nan)).fillna(0)

    years = len(bt) / 252
    irr_approx = (moic) ** (1 / years) - 1  # 定額積立のCAGR近似(厳密なXIRRではない)

    return {
        "years": years, "moic": moic, "irr_approx": irr_approx,
        "max_dd": dd.max(), "sharpe": sharpe, "final_invested": final_invested,
    }


def sanity_check() -> bool:
    """検算: エッジがゼロの合成データで、この戦略が « ちゃんと減衰の影響を受ける » か。

    docs/03(FX)の哲学と同じ: 都合よく勝ちすぎるなら未来参照かバグを疑う。
    この戦略はレバレッジ型ファンドを内部で使うので、エッジがゼロでも
    ボラティリティ減衰の分だけ « 投下資金倍率が1を下回る » のが正しい
    (完全なレンジ相場・低ボラ限定ならほぼ1に近づく設計にはなっている)。
    """
    rng = np.random.default_rng(7)
    n = 252 * 10
    idx = pd.Series(
        100 * np.cumprod(1 + rng.normal(0, 0.015, n)),
        index=pd.bdate_range("2010-01-01", periods=n),
    )
    fund = LeverageFund(k=2.0, expense_ratio=0.009)
    lev_nav = fund.simulate(idx)

    bt = simulate(lev_nav, DCARealizeParams())
    s = stats(bt)
    print("検算: エッジゼロの合成データでDCA+利確戦略を回す")
    print(f"  10年・投下資金倍率(MOIC): {s['moic']:.3f}倍   年率換算: {s['irr_approx']:+.1%}")
    ok = s["moic"] < 1.05  # 大きく勝ってしまったらおかしい
    print(f"  → {'○ 想定内(大勝ちしていない)' if ok else '× エッジゼロなのに勝ちすぎている。バグを疑うこと'}")
    return ok


if __name__ == "__main__":
    ok = sanity_check()

    print(f"\n{'=' * 78}")
    print("実データ(日経平均)で セミナー戦略(DCA+8%利確+20日期限) の2通りの解釈を比較")
    print(f"{'=' * 78}")
    df = pd.read_parquet("bullbear/data/nikkei225_close.parquet")
    idx_full = df.set_index("date")["close"]
    fund = LeverageFund(k=2.0, expense_ratio=0.009)

    periods = [
        ("1949-01-01", "1990-01-01", "高度成長〜バブル"),
        ("1990-01-01", "2020-04-23", "バブル崩壊後30年"),
        ("2000-01-01", "2020-04-23", "2000年以降20年"),
        ("2010-01-01", "2020-04-23", "異次元緩和10年"),
        ("2007-01-01", "2010-01-01", "リーマンショック含む3年"),
        ("1949-01-01", "2020-04-23", "全期間70年"),
    ]

    for label_kind, reinvest in [("A) 定額積立(既定)", False), ("B) 全額再投資(複利)", True)]:
        print(f"\n--- {label_kind} ---")
        print(f"{'期間':>18} {'年数':>6} {'MOIC':>9} {'年率換算':>10} {'最大DD':>8} {'シャープ':>8}")
        print("-" * 64)
        for a, b, label in periods:
            sub = idx_full[(idx_full.index >= a) & (idx_full.index < b)]
            lev_nav = fund.simulate(sub)
            params = DCARealizeParams(reinvest_full_proceeds=reinvest)
            bt = simulate(lev_nav, params)
            s = stats(bt)
            moic_str = f"{s['moic']:.2f}x" if s['moic'] < 1000 else f"{s['moic']:.2e}x"
            irr_str = f"{s['irr_approx']:+.1%}" if abs(s['irr_approx']) < 100 else f"{s['irr_approx']:+.1e}"
            print(f"{label:>18} {s['years']:>5.1f}年 {moic_str:>9} "
                  f"{irr_str:>10} {s['max_dd']:>7.1%} {s['sharpe']:>7.2f}")

    print(f"\n{'=' * 78}")
    print("参考: 単純買い持ち(信託報酬込) と 単純に原指数(無レバ)を持つ場合")
    print(f"{'=' * 78}")
    from leverage_sim import realized_decay
    for a, b, label in periods:
        sub = idx_full[(idx_full.index >= a) & (idx_full.index < b)]
        lev_nav = fund.simulate(sub)
        yrs = len(sub) / 252
        bh_cagr = lev_nav.iloc[-1] ** (1 / yrs) - 1
        u_cagr = (sub.iloc[-1] / sub.iloc[0]) ** (1 / yrs) - 1
        print(f"  {label:>18}: レバ買い持ちCAGR {bh_cagr:>+8.1%}   無レバ買い持ちCAGR {u_cagr:>+7.1%}")

    raise SystemExit(0 if ok else 1)
