"""spread_model.py — 時間帯別スプレッドモデル。

HistDataは mid(またはbid)のみでスプレッドを含まない。実データも合成データも
このモデルで bid/ask を作る。両者で同じモデルを使うことが重要で、
そうでないと «合成では勝てないが実データでは勝つ» が
エッジなのかスプレッド前提の違いなのか判別できなくなる。

■ 最重要の注意 ■
合成である以上、バックテスト結果は「スプレッド前提が正しければ」という
条件付きの数字。実運用前に必ず業者の実スプレッド実績と突き合わせること。
迷ったら広めに設定する。狭く見積もると、存在しないエッジがあるように
見えるという最悪の間違いを起こす。
"""

from __future__ import annotations

import numpy as np
import pandas as pd


class SpreadModel:
    """JST基準・時間帯別スプレッド(単位 pips)。既定値はUSD/JPYの保守的な想定。"""

    def __init__(self, pip: float = 0.01) -> None:
        self.pip = pip

    def pips(self, jst_hour: np.ndarray, weekday: np.ndarray) -> np.ndarray:
        s = np.full(len(jst_hour), 0.9)               # 既定
        s[(jst_hour >= 9) & (jst_hour < 15)] = 0.8    # 東京
        s[(jst_hour >= 16) & (jst_hour < 24)] = 0.8   # 欧州〜NY
        s[(jst_hour >= 5) & (jst_hour < 8)] = 4.0     # 早朝は大きく開く
        s[(weekday == 0) & (jst_hour < 9)] = 6.0      # 月曜早朝
        return s

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        jst = df["ts"].dt.tz_convert("Asia/Tokyo")
        half = self.pips(jst.dt.hour.to_numpy(),
                         jst.dt.weekday.to_numpy()) * self.pip / 2
        out = pd.DataFrame({"ts": df["ts"], "volume": df["volume"]})
        for col, src in (("o", "open"), ("h", "high"), ("l", "low"), ("c", "close")):
            out[f"bid_{col}"] = df[src] - half
            out[f"ask_{col}"] = df[src] + half
        return out
