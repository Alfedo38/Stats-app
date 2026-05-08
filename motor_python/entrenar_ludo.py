"""
Entrenamiento Ludo v2 — usa las vistas limpias creadas en Supabase.

Objetivo:
- No leer player_game_logs crudo.
- No hacer COALESCE falso de Q1.
- No recalcular DvP en Python.
- Entrenar modelos separados por mercado usando datasets adecuados.
- Guardar modelos + metadata auditable.

Requisitos de DB:
- v_ludo_train_fullgame
- v_ludo_train_fullgame_tracking_ok
- v_ludo_train_q1
- v_ludo_train_ast_tracking
- v_ludo_train_ast_fallback

Uso:
    python entrenar_ludo_v2.py
    python entrenar_ludo_v2.py --only PTS,REB,AST
    python entrenar_ludo_v2.py --models-dir modelos_ai
"""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from xgboost import XGBRegressor

load_dotenv()

# -------------------------------------------------------------------
# 1. CONFIGURACIÓN DB
# -------------------------------------------------------------------
DB_URL = URL.create(
    drivername="postgresql",
    username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"),
    host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    query={"sslmode": "require"},
)

ENGINE = create_engine(DB_URL, pool_pre_ping=True)

POSICION_ENCODING = {
    "G": 1, "G-F": 2, "F-G": 2,
    "F": 3, "F-C": 4, "C-F": 4,
    "C": 5,
}

SOURCE_VIEWS = {
    "fullgame": "v_ludo_train_fullgame",
    "tracking_ok": "v_ludo_train_fullgame_tracking_ok",
    "q1": "v_ludo_train_q1",
    "ast_tracking": "v_ludo_train_ast_tracking",
    "ast_fallback": "v_ludo_train_ast_fallback",
}

BASE_SELECT = """
SELECT
    player_id,
    player_name,
    position,
    position_group,
    team_abbreviation,
    game_id,
    game_date,
    matchup,
    opponent_abbr,

    min,
    usage_pct,
    touches,
    rebound_chances,
    passes_made,
    potential_ast,
    rebound_off,
    rebound_def,

    pts,
    reb,
    ast,
    fgm,
    fga,
    fg3m,
    fg3a,
    ftm,
    fta,

    q1_pts,
    q1_reb,
    q1_ast,
    q1_oreb,
    q1_dreb,
    has_q1_data,

    has_full_tracking,
    has_ast_tracking,
    tracking_status,

    dvp_pts_model  AS dvp_pts,
    dvp_reb_model  AS dvp_reb,
    dvp_ast_model  AS dvp_ast,
    dvp_3pt_model  AS dvp_3pt,
    dvp_fga_model  AS dvp_fga,
    dvp_fg3a_model AS dvp_fg3a,
    dvp_fta_model  AS dvp_fta,
    has_dvp_rolling
FROM {view_name}
ORDER BY player_id, game_date, game_id
"""

# -------------------------------------------------------------------
# 2. CONFIGURACIÓN DE MODELOS
# -------------------------------------------------------------------
@dataclass(frozen=True)
class ModelConfig:
    stat: str
    file_stem: str
    source: str
    features: List[str]
    target: str
    objective: str = "reg:squarederror"
    min_rows: int = 800


MODELOS_CONFIG: Dict[str, ModelConfig] = {
    # Full game clásicos
    "PTS": ModelConfig(
        stat="PTS",
        file_stem="puntos",
        source="fullgame",
        target="pts",
        features=[
            "min_L5", "min_L10", "usage_pct_L5", "usage_pct_L10",
            "fga_L5", "fga_L10", "pts_L5", "pts_L10", "pts_season",
            "touches_L5", "ppm_L5", "pts_momentum", "q1_pts_L5",
            "q1_pts_pct_L5", "dvp_pts", "dvp_fga", "rest_days", "is_b2b",
            "is_home", "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),
    "REB": ModelConfig(
        stat="REB",
        file_stem="rebotes",
        source="fullgame",
        target="reb",
        features=[
            "min_L5", "min_L10", "rebound_chances_L5", "rebound_chances_L10",
            "rebound_off_L5", "rebound_def_L5", "reb_L5", "reb_L10",
            "reb_season", "touches_L5", "reb_pm_L5", "reb_momentum",
            "q1_reb_L5", "q1_reb_pct_L5", "dvp_reb", "rest_days",
            "is_b2b", "is_home", "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),
    "AST": ModelConfig(
        stat="AST",
        file_stem="asistencias",
        source="ast_tracking",
        target="ast",
        features=[
            "min_L5", "min_L10", "passes_made_L5", "passes_made_L10",
            "potential_ast_L5", "potential_ast_L10", "ast_L5", "ast_L10",
            "ast_season", "touches_L5", "usage_pct_L5", "ast_pm_L5",
            "ast_momentum", "q1_ast_L5", "q1_ast_pct_L5", "dvp_ast",
            "rest_days", "is_b2b", "is_home", "pos_enc", "has_dvp_rolling",
        ],
    ),
    "AST_FALLBACK": ModelConfig(
        stat="AST_FALLBACK",
        file_stem="asistencias_fallback",
        source="ast_fallback",
        target="ast",
        features=[
            "min_L5", "min_L10", "usage_pct_L5", "usage_pct_L10",
            "ast_L5", "ast_L10", "ast_season", "pts_L5", "fga_L5",
            "q1_ast_L5", "q1_ast_pct_L5", "dvp_ast", "rest_days",
            "is_b2b", "is_home", "pos_enc", "has_dvp_rolling",
        ],
    ),
    "3PT": ModelConfig(
        stat="3PT",
        file_stem="triples",
        source="fullgame",
        target="fg3m",
        objective="count:poisson",
        features=[
            "min_L5", "min_L10", "usage_pct_L5", "fg3a_L5", "fg3a_L10",
            "fg3m_L5", "fg3m_L10", "fg3m_season", "dvp_3pt", "dvp_fg3a",
            "rest_days", "is_b2b", "is_home", "pos_enc", "has_dvp_rolling",
        ],
    ),
    "FGM": ModelConfig(
        stat="FGM",
        file_stem="tiros_anotados",
        source="fullgame",
        target="fgm",
        features=[
            "min_L5", "usage_pct_L5", "fga_L5", "fgm_L5", "fgm_L10",
            "fgm_season", "dvp_pts", "dvp_fga", "is_b2b", "is_home",
            "pos_enc", "has_dvp_rolling",
        ],
    ),
    "FGA": ModelConfig(
        stat="FGA",
        file_stem="tiros_intentados",
        source="fullgame",
        target="fga",
        features=[
            "min_L5", "usage_pct_L5", "fga_L5", "fga_L10", "touches_L5",
            "rest_days", "fga_pm_L5", "dvp_fga", "is_b2b", "is_home",
            "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),
    "FG3A": ModelConfig(
        stat="FG3A",
        file_stem="triples_intentados",
        source="fullgame",
        target="fg3a",
        objective="count:poisson",
        features=[
            "min_L5", "usage_pct_L5", "fg3a_L5", "fg3a_L10", "fg3a_season",
            "dvp_3pt", "dvp_fg3a", "rest_days", "is_b2b", "is_home",
            "pos_enc", "has_dvp_rolling",
        ],
    ),
    "FTM": ModelConfig(
        stat="FTM",
        file_stem="libres_anotados",
        source="fullgame",
        target="ftm",
        features=[
            "min_L5", "usage_pct_L5", "fta_L5", "ftm_L5", "ftm_L10",
            "ftm_season", "dvp_fta", "is_b2b", "is_home", "pos_enc",
            "has_dvp_rolling",
        ],
    ),
    "FTA": ModelConfig(
        stat="FTA",
        file_stem="libres_intentados",
        source="fullgame",
        target="fta",
        features=[
            "min_L5", "usage_pct_L5", "fta_L5", "fta_L10", "fta_season",
            "dvp_fta", "rest_days", "is_b2b", "is_home", "pos_enc",
            "has_dvp_rolling",
        ],
    ),

    # Combos directos. Mejora contra sumar modelo base + promedios L5.
    "PRA": ModelConfig(
        stat="PRA",
        file_stem="pra",
        source="fullgame",
        target="pra",
        features=[
            "min_L5", "min_L10", "usage_pct_L5", "pts_L5", "reb_L5", "ast_L5",
            "fga_L5", "touches_L5", "rebound_chances_L5", "potential_ast_L5",
            "pra_L5", "pra_L10", "pra_season", "pra_momentum",
            "dvp_pts", "dvp_reb", "dvp_ast", "rest_days", "is_b2b",
            "is_home", "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),
    "PR": ModelConfig(
        stat="PR",
        file_stem="pr",
        source="fullgame",
        target="pr",
        features=[
            "min_L5", "min_L10", "usage_pct_L5", "pts_L5", "reb_L5",
            "fga_L5", "rebound_chances_L5", "pr_L5", "pr_L10", "pr_season",
            "pr_momentum", "dvp_pts", "dvp_reb", "rest_days", "is_b2b",
            "is_home", "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),
    "PA": ModelConfig(
        stat="PA",
        file_stem="pa",
        source="fullgame",
        target="pa",
        features=[
            "min_L5", "min_L10", "usage_pct_L5", "pts_L5", "ast_L5",
            "fga_L5", "potential_ast_L5", "pa_L5", "pa_L10", "pa_season",
            "pa_momentum", "dvp_pts", "dvp_ast", "rest_days", "is_b2b",
            "is_home", "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),
    "RA": ModelConfig(
        stat="RA",
        file_stem="ra",
        source="fullgame",
        target="ra",
        features=[
            "min_L5", "min_L10", "reb_L5", "ast_L5", "rebound_chances_L5",
            "potential_ast_L5", "ra_L5", "ra_L10", "ra_season", "ra_momentum",
            "dvp_reb", "dvp_ast", "rest_days", "is_b2b", "is_home",
            "pos_enc", "has_full_tracking", "has_dvp_rolling",
        ],
    ),

    # Primer cuarto: siempre desde vista Q1 limpia.
    "Q1_PTS": ModelConfig(
        stat="Q1_PTS",
        file_stem="q1_puntos",
        source="q1",
        target="q1_pts",
        features=[
            "min_L5", "usage_pct_L5", "q1_pts_L5", "q1_pts_L10",
            "q1_pts_season", "pts_L5", "q1_pts_pct_L5", "dvp_pts",
            "is_b2b", "is_home", "pos_enc", "has_dvp_rolling",
        ],
    ),
    "Q1_REB": ModelConfig(
        stat="Q1_REB",
        file_stem="q1_rebotes",
        source="q1",
        target="q1_reb",
        features=[
            "min_L5", "q1_reb_L5", "q1_reb_L10", "q1_reb_season",
            "reb_L5", "q1_reb_pct_L5", "dvp_reb", "is_b2b", "is_home",
            "pos_enc", "has_dvp_rolling",
        ],
    ),
    "Q1_AST": ModelConfig(
        stat="Q1_AST",
        file_stem="q1_asistencias",
        source="q1",
        target="q1_ast",
        features=[
            "min_L5", "usage_pct_L5", "q1_ast_L5", "q1_ast_L10",
            "q1_ast_season", "ast_L5", "q1_ast_pct_L5", "dvp_ast",
            "is_b2b", "is_home", "pos_enc", "has_dvp_rolling",
        ],
    ),
}

ROLLING_BASE_COLS = [
    "min", "usage_pct", "touches", "rebound_chances", "passes_made",
    "potential_ast", "rebound_off", "rebound_def",
    "pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta",
    "q1_pts", "q1_reb", "q1_ast", "pra", "pr", "pa", "ra",
]

SEASON_COLS = [
    "pts", "reb", "ast", "fgm", "fg3m", "fg3a", "ftm", "fta",
    "q1_pts", "q1_reb", "q1_ast", "pra", "pr", "pa", "ra",
]

# -------------------------------------------------------------------
# 3. HELPERS
# -------------------------------------------------------------------
def log(msg: str) -> None:
    print(msg, flush=True)


def infer_is_home(matchup: object, team: object) -> int:
    """Inferencia para matchups tipo 'CLE @ DET' o 'CLE vs DET'."""
    if pd.isna(matchup) or pd.isna(team):
        return 0

    m = str(matchup).replace(".", "").strip()
    t = str(team).strip()

    if "@" in m:
        left, right = [x.strip() for x in m.split("@", 1)]
        if left.startswith(t) or left.endswith(t):
            return 0
        if right.startswith(t) or right.endswith(t):
            return 1
        return 0

    lowered = m.lower()
    if " vs " in lowered:
        left = m.lower().split(" vs ", 1)[0].strip()
        return 1 if left.upper().startswith(t) or left.upper().endswith(t) else 0

    # Si viene reconstruido como TEAM vs OPP, asumimos local solo como fallback débil.
    return 1


def make_model(objective: str, seed: int = 42) -> XGBRegressor:
    return XGBRegressor(
        n_estimators=500,
        learning_rate=0.03,
        max_depth=4,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=5,
        gamma=0.1,
        reg_alpha=0.05,
        reg_lambda=1.0,
        objective=objective,
        eval_metric="mae",
        random_state=seed,
        n_jobs=-1,
        early_stopping_rounds=25,
        missing=np.nan,
    )


def date_based_splits(df: pd.DataFrame, n_splits: int = 5) -> Iterable[Tuple[np.ndarray, np.ndarray]]:
    """Expanding CV por fecha: evita que una misma fecha caiga en train y validation."""
    dates = np.array(sorted(pd.to_datetime(df["game_date"]).dt.date.unique()))
    if len(dates) < n_splits + 2:
        raise ValueError(f"No hay fechas suficientes para {n_splits} folds. Fechas={len(dates)}")

    # validation chunks sobre el tramo final, con train expandiendo.
    chunks = np.array_split(dates, n_splits + 1)
    for i in range(1, len(chunks)):
        train_dates = np.concatenate(chunks[:i])
        val_dates = chunks[i]
        train_mask = pd.to_datetime(df["game_date"]).dt.date.isin(train_dates)
        val_mask = pd.to_datetime(df["game_date"]).dt.date.isin(val_dates)
        train_idx = np.flatnonzero(train_mask.to_numpy())
        val_idx = np.flatnonzero(val_mask.to_numpy())
        if len(train_idx) and len(val_idx):
            yield train_idx, val_idx


def safe_ratio(num: pd.Series, den: pd.Series) -> pd.Series:
    return np.where(den.fillna(0) > 0, num / den, 0)


def feature_importance_report(modelo: XGBRegressor, features: List[str]) -> str:
    if not hasattr(modelo, "feature_importances_"):
        return ""
    imp = dict(zip(features, modelo.feature_importances_))
    top = sorted(imp.items(), key=lambda x: x[1], reverse=True)[:7]
    return " | ".join([f"{k}={v:.3f}" for k, v in top])


def load_view(source_key: str) -> pd.DataFrame:
    view_name = SOURCE_VIEWS[source_key]
    query = text(BASE_SELECT.format(view_name=view_name))
    df = pd.read_sql(query, ENGINE)
    if df.empty:
        raise RuntimeError(f"La vista {view_name} no devolvió filas.")
    log(f"    ✅ {view_name}: {len(df)} filas | {df['player_id'].nunique()} jugadores")
    return df


def preparar_features(df_raw: pd.DataFrame, source_key: str) -> pd.DataFrame:
    df = df_raw.copy()
    df["game_date"] = pd.to_datetime(df["game_date"])
    df = df.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)

    # Targets de combos directos.
    df["pra"] = df["pts"] + df["reb"] + df["ast"]
    df["pr"] = df["pts"] + df["reb"]
    df["pa"] = df["pts"] + df["ast"]
    df["ra"] = df["reb"] + df["ast"]

    # Posición y localía.
    df["position"] = df["position"].fillna("F").replace("", "F")
    df["pos_enc"] = df["position"].map(POSICION_ENCODING).fillna(3).astype(float)
    df["is_home"] = df.apply(lambda r: infer_is_home(r.get("matchup"), r.get("team_abbreviation")), axis=1)

    # Descanso histórico por jugador.
    df["rest_days"] = df.groupby("player_id")["game_date"].diff().dt.days.fillna(3).clip(lower=0, upper=7)
    df["is_b2b"] = (df["rest_days"] <= 1).astype(int)

    # Flags numéricos.
    for flag in ["has_q1_data", "has_full_tracking", "has_ast_tracking", "has_dvp_rolling"]:
        if flag in df.columns:
            df[flag] = df[flag].fillna(0).astype(int)
        else:
            df[flag] = 0

    # Rolling con shift(1): solo partidos anteriores al target.
    for col in ROLLING_BASE_COLS:
        if col not in df.columns:
            df[col] = np.nan
        grp = df.groupby("player_id")[col]
        df[f"{col}_L5"] = grp.transform(lambda x: x.shift(1).rolling(5, min_periods=1).mean())
        df[f"{col}_L10"] = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=1).mean())

    for col in SEASON_COLS:
        grp = df.groupby("player_id")[col]
        df[f"{col}_season"] = grp.transform(lambda x: x.shift(1).expanding(min_periods=1).mean())

    # Momentum.
    df["pts_momentum"] = df["pts_L5"] - df["pts_season"]
    df["reb_momentum"] = df["reb_L5"] - df["reb_season"]
    df["ast_momentum"] = df["ast_L5"] - df["ast_season"]
    df["pra_momentum"] = df["pra_L5"] - df["pra_season"]
    df["pr_momentum"] = df["pr_L5"] - df["pr_season"]
    df["pa_momentum"] = df["pa_L5"] - df["pa_season"]
    df["ra_momentum"] = df["ra_L5"] - df["ra_season"]

    # Ratios seguros.
    df["q1_pts_pct_L5"] = safe_ratio(df["q1_pts_L5"].fillna(0), df["pts_L5"].fillna(0))
    df["q1_reb_pct_L5"] = safe_ratio(df["q1_reb_L5"].fillna(0), df["reb_L5"].fillna(0))
    df["q1_ast_pct_L5"] = safe_ratio(df["q1_ast_L5"].fillna(0), df["ast_L5"].fillna(0))

    df["ppm_L5"] = safe_ratio(df["pts_L5"].fillna(0), df["min_L5"].fillna(0))
    df["fga_pm_L5"] = safe_ratio(df["fga_L5"].fillna(0), df["min_L5"].fillna(0))
    df["ast_pm_L5"] = safe_ratio(df["ast_L5"].fillna(0), df["min_L5"].fillna(0))
    df["reb_pm_L5"] = safe_ratio(df["reb_L5"].fillna(0), df["min_L5"].fillna(0))

    # Las columnas tracking faltantes quedan como NaN. XGBoost las maneja como missing.
    # No hacemos df.fillna(0) global para no convertir faltantes reales en ceros falsos.
    log(
        f"    🧱 Features {source_key}: {len(df)} filas × {len(df.columns)} columnas | "
        f"fechas {df['game_date'].min().date()} → {df['game_date'].max().date()}"
    )
    return df


def cargar_y_preparar_sources(sources: Iterable[str]) -> Dict[str, pd.DataFrame]:
    datasets = {}
    for src in sorted(set(sources)):
        log(f"\n📡 Cargando source: {src}")
        raw = load_view(src)
        datasets[src] = preparar_features(raw, src)
    return datasets


def entrenar_un_modelo(cfg: ModelConfig, df_source: pd.DataFrame, models_dir: Path, n_splits: int) -> Optional[dict]:
    df = df_source.sort_values(["game_date", "game_id", "player_id"]).reset_index(drop=True).copy()

    missing_features = [f for f in cfg.features if f not in df.columns]
    if missing_features:
        log(f"   ❌ {cfg.stat}: faltan features: {missing_features}")
        return None

    if cfg.target not in df.columns:
        log(f"   ❌ {cfg.stat}: falta target {cfg.target}")
        return None

    train_df = df[df[cfg.target].notna()].copy()
    if cfg.objective == "count:poisson":
        train_df = train_df[train_df[cfg.target] >= 0].copy()

    if len(train_df) < cfg.min_rows:
        log(f"   ⚠️  {cfg.stat}: pocas filas ({len(train_df)} < {cfg.min_rows}). Salteado.")
        return None

    X = train_df[cfg.features].astype(float)
    y = train_df[cfg.target].astype(float)

    maes = []
    fold_rows = []
    for fold, (tr_idx, val_idx) in enumerate(date_based_splits(train_df, n_splits=n_splits), start=1):
        X_tr, X_val = X.iloc[tr_idx], X.iloc[val_idx]
        y_tr, y_val = y.iloc[tr_idx], y.iloc[val_idx]

        model = make_model(cfg.objective, seed=42 + fold)
        model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
        preds = np.clip(model.predict(X_val), 0, None)
        mae = mean_absolute_error(y_val, preds)
        maes.append(mae)
        fold_rows.append({
            "fold": fold,
            "rows_train": int(len(tr_idx)),
            "rows_val": int(len(val_idx)),
            "date_val_min": str(train_df.iloc[val_idx]["game_date"].min().date()),
            "date_val_max": str(train_df.iloc[val_idx]["game_date"].max().date()),
            "mae": round(float(mae), 4),
        })

    # Entrenamiento final con validación temporal final 85/15.
    unique_dates = np.array(sorted(pd.to_datetime(train_df["game_date"]).dt.date.unique()))
    split_date_idx = max(1, int(len(unique_dates) * 0.85))
    train_dates = set(unique_dates[:split_date_idx])
    final_train_mask = pd.to_datetime(train_df["game_date"]).dt.date.isin(train_dates).to_numpy()

    X_train, X_val = X.loc[final_train_mask], X.loc[~final_train_mask]
    y_train, y_val = y.loc[final_train_mask], y.loc[~final_train_mask]

    final_model = make_model(cfg.objective, seed=42)
    final_model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    final_preds = np.clip(final_model.predict(X_val), 0, None)
    mae_final = mean_absolute_error(y_val, final_preds)

    model_path = models_dir / f"ludogallina_{cfg.file_stem}.pkl"
    joblib.dump(final_model, model_path)

    top_features = feature_importance_report(final_model, cfg.features)
    best_iter = getattr(final_model, "best_iteration", None)

    log(
        f"   ✅ {cfg.stat.ljust(12)} | source={cfg.source.ljust(12)} | "
        f"rows={len(train_df):5d} | MAE CV={np.mean(maes):.2f} ±{np.std(maes):.2f} | "
        f"MAE Final={mae_final:.2f} | trees={best_iter} | obj={cfg.objective}"
    )
    if top_features:
        log(f"      📊 Top: {top_features}")

    meta = {
        "stat": cfg.stat,
        "source": cfg.source,
        "source_view": SOURCE_VIEWS[cfg.source],
        "target": cfg.target,
        "objective": cfg.objective,
        "features": cfg.features,
        "model_file": str(model_path),
        "rows": int(len(train_df)),
        "players": int(train_df["player_id"].nunique()),
        "games": int(train_df["game_id"].nunique()),
        "date_min": str(train_df["game_date"].min().date()),
        "date_max": str(train_df["game_date"].max().date()),
        "mae_cv": round(float(np.mean(maes)), 4),
        "mae_cv_std": round(float(np.std(maes)), 4),
        "mae_final": round(float(mae_final), 4),
        "best_iteration": None if best_iter is None else int(best_iter),
        "top_features": top_features,
        "folds": fold_rows,
    }

    meta_path = models_dir / f"ludogallina_{cfg.file_stem}.metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return meta


def entrenar_modelos(only: Optional[List[str]], models_dir: str, n_splits: int) -> List[dict]:
    selected = MODELOS_CONFIG
    if only:
        only_set = {x.strip().upper() for x in only if x.strip()}
        selected = {k: v for k, v in MODELOS_CONFIG.items() if k in only_set}
        missing = sorted(only_set - set(selected.keys()))
        if missing:
            raise ValueError(f"Modelos no reconocidos: {missing}. Disponibles: {sorted(MODELOS_CONFIG)}")

    out_dir = Path(models_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    log("\n🏋️‍♂️ LUDO TRAINER v2 — Entrenamiento con vistas limpias")
    log("=" * 72)
    log(f"Modelos a entrenar: {', '.join(selected.keys())}")
    log(f"Salida: {out_dir.resolve()}")

    needed_sources = [cfg.source for cfg in selected.values()]
    datasets = cargar_y_preparar_sources(needed_sources)

    resumen = []
    log("\n🧠 Entrenando modelos...")
    for stat, cfg in selected.items():
        meta = entrenar_un_modelo(cfg, datasets[cfg.source], out_dir, n_splits=n_splits)
        if meta:
            resumen.append(meta)

    if not resumen:
        log("\n❌ No se entrenó ningún modelo.")
        return []

    # Registry global para que Ludo.py pueda cargar modelos sin hardcodear nombres/features.
    registry = {
        "version": "ludo_trainer_v2",
        "created_at": pd.Timestamp.now().isoformat(),
        "models_dir": str(out_dir),
        "models": {m["stat"]: m for m in resumen},
    }
    with open(out_dir / "ludo_model_registry.json", "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)

    df_res = pd.DataFrame([
        {
            "stat": m["stat"],
            "source": m["source"],
            "rows": m["rows"],
            "players": m["players"],
            "games": m["games"],
            "date_min": m["date_min"],
            "date_max": m["date_max"],
            "mae_cv": m["mae_cv"],
            "mae_cv_std": m["mae_cv_std"],
            "mae_final": m["mae_final"],
            "best_iteration": m["best_iteration"],
            "model_file": m["model_file"],
        }
        for m in resumen
    ]).sort_values("mae_cv")
    df_res.to_csv(out_dir / "ludo_training_summary.csv", index=False, encoding="utf-8")

    log("\n" + "=" * 72)
    log("🏆 RESUMEN FINAL")
    log("=" * 72)
    for _, r in df_res.iterrows():
        log(
            f"   {str(r['stat']).ljust(12)} | MAE CV={r['mae_cv']:.2f} ±{r['mae_cv_std']:.2f} | "
            f"MAE Final={r['mae_final']:.2f} | rows={int(r['rows'])} | source={r['source']}"
        )

    log(f"\n✅ Modelos guardados en: {out_dir}")
    log(f"✅ Registry: {out_dir / 'ludo_model_registry.json'}")
    log(f"✅ Resumen:  {out_dir / 'ludo_training_summary.csv'}")
    return resumen


# -------------------------------------------------------------------
# 4. ENTRY POINT
# -------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Entrenamiento Ludo v2 con vistas limpias")
    parser.add_argument(
        "--only",
        default="",
        help="Modelos específicos separados por coma. Ej: PTS,REB,AST,Q1_PTS",
    )
    parser.add_argument(
        "--models-dir",
        default="modelos_ai",
        help="Carpeta donde guardar modelos y metadata.",
    )
    parser.add_argument(
        "--splits",
        type=int,
        default=5,
        help="Cantidad de folds temporales para CV.",
    )
    args = parser.parse_args()

    only = [x.strip() for x in args.only.split(",") if x.strip()] or None
    start = time.time()
    entrenar_modelos(only=only, models_dir=args.models_dir, n_splits=args.splits)
    log(f"\n⏱️ Tiempo total: {round(time.time() - start, 1)}s")


if __name__ == "__main__":
    main()