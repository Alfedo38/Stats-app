from __future__ import annotations

import numpy as np
import pandas as pd

from .dataset import CORE_COLUMNS, validate_history
from .markets import Market


DERIVED = ["pr", "pa", "ra", "pra", "stl_blk"]
ALL_STATS = CORE_COLUMNS + DERIVED
WINDOWS = (5, 10, 20)


def _home_flag(home_away: pd.Series) -> pd.Series:
    values = home_away.fillna("").astype(str).str.upper().str.strip()
    return values.isin(["HOME", "H", "LOCAL"]).astype("int8")


def build_features(history: pd.DataFrame, prior_weight: int = 5) -> pd.DataFrame:
    df = validate_history(history).copy()
    df["pr"] = df["pts"] + df["reb"]
    df["pa"] = df["pts"] + df["ast"]
    df["ra"] = df["reb"] + df["ast"]
    df["pra"] = df["pts"] + df["reb"] + df["ast"]
    df["stl_blk"] = df["stl"] + df["blk"]
    df["is_home"] = _home_flag(df["home_away"])

    dates = df.groupby("player_id", sort=False)["game_date"]
    df["rest_days"] = dates.diff().dt.days.clip(lower=0, upper=14).fillna(7).astype(float)
    df["prior_games"] = df.groupby("player_id", sort=False).cumcount().astype("int32")
    df["season_prior_games"] = df.groupby(["player_id", "season"], sort=False).cumcount().astype("int32")

    calculated: dict[str, pd.Series | np.ndarray] = {}
    for stat in ALL_STATS:
        player_group = df.groupby("player_id", sort=False)[stat]
        shifted = player_group.shift(1)
        for window in WINDOWS:
            calculated[f"{stat}_l{window}"] = shifted.groupby(df["player_id"]).transform(
                lambda series, w=window: series.rolling(w, min_periods=1).mean()
            )
        calculated[f"{stat}_std10"] = shifted.groupby(df["player_id"]).transform(
            lambda series: series.rolling(10, min_periods=3).std()
        )
        season_group = df.groupby(["player_id", "season"], sort=False)[stat]
        current = season_group.transform(
            lambda series: series.shift(1).expanding(min_periods=1).mean()
        )
        calculated[f"{stat}_season"] = current
        completed = df.groupby(["player_id", "season"], sort=False)[stat].mean()
        lookup = {(int(pid), int(season) + 1): value for (pid, season), value in completed.items()}
        prior = pd.Series(
            [lookup.get((int(pid), int(season)), np.nan) for pid, season in zip(df.player_id, df.season)],
            index=df.index, dtype="float64",
        )
        calculated[f"{stat}_prev_season"] = prior
        n = df["season_prior_games"].astype(float)
        blended = (current.fillna(0) * n + prior.fillna(0) * prior_weight) / (n + prior_weight)
        calculated[f"{stat}_blend"] = np.where(
            current.notna() & prior.notna(), blended, current.combine_first(prior)
        )
        calculated[f"{stat}_trend"] = calculated[f"{stat}_l5"] - calculated[f"{stat}_l20"]

    df = pd.concat([df, pd.DataFrame(calculated, index=df.index)], axis=1)
    return df.sort_values(["game_date", "game_id", "player_id"]).reset_index(drop=True)


def feature_names(market: Market) -> list[str]:
    features = ["is_home", "rest_days", "prior_games", "season_prior_games"]
    for stat in market.component_stats:
        features.extend([
            f"{stat}_l5", f"{stat}_l10", f"{stat}_l20", f"{stat}_std10",
            f"{stat}_season", f"{stat}_prev_season", f"{stat}_blend", f"{stat}_trend",
        ])
    return list(dict.fromkeys(features))
