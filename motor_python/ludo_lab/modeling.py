from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor

from .features import feature_names
from .markets import Market


def make_model(config: dict, market: Market, seed_offset: int = 0) -> XGBRegressor:
    params = dict(config["model"])
    params["random_state"] = int(params.get("random_state", 42)) + seed_offset
    return XGBRegressor(
        objective=market.objective,
        eval_metric="mae",
        missing=np.nan,
        **params,
    )


def eligible_rows(df: pd.DataFrame, market: Market, config: dict) -> pd.DataFrame:
    out = df[df[market.target].notna()].copy()
    out = out[out["prior_games"] >= int(config["min_prior_games"])].copy()
    return out


def train_market(
    df: pd.DataFrame,
    market: Market,
    config: dict,
    train_end: pd.Timestamp,
) -> tuple[XGBRegressor, dict]:
    train = eligible_rows(df[df["game_date"] <= train_end], market, config)
    if len(train) < int(config["min_training_rows"]):
        raise RuntimeError(f"{market.key}: pocas filas para entrenar ({len(train)})")
    features = feature_names(market)
    split_date = train["game_date"].quantile(0.85)
    fitting = train[train["game_date"] < split_date]
    validation = train[train["game_date"] >= split_date]
    if fitting.empty or validation.empty:
        raise RuntimeError(f"{market.key}: no se pudo crear holdout temporal")

    probe = make_model(config, market)
    probe.fit(fitting[features], fitting[market.target])
    val_pred = np.clip(probe.predict(validation[features]), 0, None)
    mae = float(mean_absolute_error(validation[market.target], val_pred))
    rmse = float(mean_squared_error(validation[market.target], val_pred) ** 0.5)
    naive = validation[f"{market.target}_l10"]
    naive_mask = naive.notna()
    naive_mae = float(mean_absolute_error(validation.loc[naive_mask, market.target], naive[naive_mask]))

    final_model = make_model(config, market, seed_offset=100)
    final_model.fit(train[features], train[market.target])
    meta = {
        "market": market.key,
        "target": market.target,
        "objective": market.objective,
        "features": features,
        "rows": int(len(train)),
        "players": int(train.player_id.nunique()),
        "games": int(train.game_id.nunique()),
        "date_min": str(train.game_date.min().date()),
        "date_max": str(train.game_date.max().date()),
        "validation_start": str(validation.game_date.min().date()),
        "validation_end": str(validation.game_date.max().date()),
        "mae": round(mae, 6),
        "rmse": round(rmse, 6),
        "naive_l10_mae": round(naive_mae, 6),
        "train_end": str(train_end.date()),
    }
    return final_model, meta


def save_model(model, meta: dict, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    key = meta["market"].lower()
    joblib.dump(model, directory / f"{key}.joblib")
    (directory / f"{key}.metadata.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def predict_market(model, df: pd.DataFrame, market: Market, model_mae: float) -> pd.DataFrame:
    features = feature_names(market)
    prediction = np.clip(model.predict(df[features]), 0, None)
    out = df[[
        "player_id", "player_name", "team_abbreviation", "game_id", "game_date",
        "season", "matchup", "opponent_abbr", "home_away", "prior_games", "season_prior_games",
    ]].copy()
    out["market"] = market.key
    out["actual"] = pd.to_numeric(df[market.target], errors="coerce")
    out["projection"] = prediction
    out["naive_l10"] = pd.to_numeric(df[f"{market.target}_l10"], errors="coerce")
    out["error"] = out["projection"] - out["actual"]
    out["abs_error"] = out["error"].abs()
    out["model_mae"] = float(model_mae)
    return out
