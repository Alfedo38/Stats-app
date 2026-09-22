"""
Entrenamiento Ludo v35 — gold view + todos los mercados principales.

Objetivo:
- Entrenar PTS/REB/AST/combos/tiros/libres + BLK/STL/STL+BLK/TOV/PF.
- Usar L5 + L10 + L20 + season, tendencias y volatilidad.
- Leer columnas dinámicamente para no romper si la vista usa nombres ligeramente distintos.
- Guardar modelos + metadata + registry auditable.

Uso recomendado:
    python3 entrenar_ludo.py --probe
    python3 entrenar_ludo.py --only BLK,STL,STL+BLK,TOV,PF --models-dir modelos_ai
    python3 entrenar_ludo.py --models-dir modelos_ai

Fuente por defecto:
    nba_api_data.v_ludo_train_all_markets_gold

También podés cambiar fuente:
    python3 entrenar_ludo.py --source-view nba_api_data.v_ludo_player_page_history_unified
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
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
# 1. DB
# -------------------------------------------------------------------
DB_URL = URL.create(
    drivername="postgresql",
    username=os.getenv("DB_USERNAME") or os.getenv("DB_USER") or "postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST") or "aws-1-sa-east-1.pooler.supabase.com",
    port=int(os.getenv("DB_PORT") or 6543),
    database=os.getenv("DB_NAME") or "postgres",
    query={"sslmode": "require"},
)
ENGINE = create_engine(DB_URL, pool_pre_ping=True)

DEFAULT_SOURCE_VIEW = "nba_api_data.v_ludo_train_all_markets_gold"

POSICION_ENCODING = {
    "G": 1, "PG": 1, "SG": 1,
    "G-F": 2, "F-G": 2,
    "F": 3, "SF": 3, "PF": 3,
    "F-C": 4, "C-F": 4,
    "C": 5,
}

# Canonical column -> possible DB column names, checked case-insensitively.
COLUMN_ALIASES: Dict[str, List[str]] = {
    "player_id": ["player_id", "person_id"],
    "player_name": ["player_name", "name", "display_first_last"],
    "position": ["position", "start_position", "pos"],
    "position_group": ["position_group", "pos_group"],
    "team_abbreviation": ["team_abbreviation", "team_abbr", "team"],
    "game_id": ["game_id", "nba_game_id"],
    "game_date": ["game_date", "date", "event_date"],
    "season": ["season", "season_year"],
    "matchup": ["matchup", "game_matchup"],
    "opponent_abbr": ["opponent_clean", "opponent_abbr", "opponent", "opp", "opponent_team_abbr"],
    "home_away": ["home_away_clean", "home_away", "loc", "location"],

    "min": ["min_clean", "min", "minutes", "period_minutes"],
    "usage_pct": ["usage_pct", "usg", "usg_pct"],
    "touches": ["touches", "tch"],
    "rebound_chances": ["rebound_chances", "reb_chances", "chance_reb"],
    "passes_made": ["passes_made", "passes"],
    "potential_ast": ["potential_ast", "pot_ast", "potential_assists"],
    "rebound_off": ["rebound_off", "oreb", "off_reb", "offensive_rebounds"],
    "rebound_def": ["rebound_def", "dreb", "def_reb", "defensive_rebounds"],

    "pts": ["pts", "points"],
    "reb": ["reb", "rebounds"],
    "ast": ["ast", "assists"],
    "fgm": ["fgm", "field_goals_made", "fieldgoalsmade"],
    "fga": ["fga", "field_goals_attempted", "fieldgoalsattempted"],
    "fg3m": ["fg3m", "3ptm", "threepm", "three_pt_made", "threesmade"],
    "fg3a": ["fg3a", "3pta", "threepa", "three_pt_attempted", "threepointersattempted"],
    "ftm": ["ftm", "free_throws_made", "freethrowsmade"],
    "fta": ["fta", "free_throws_attempted", "freethrowsattempted"],
    "stl": ["stl", "steals"],
    "blk": ["blk", "blocks"],
    "tov": ["tov", "turnover", "turnovers", "to"],
    "pf": ["pf", "personal_fouls", "personalfouls"],

    "q1_pts": ["q1_pts", "pts_q1", "period1_pts"],
    "q1_reb": ["q1_reb", "reb_q1", "period1_reb"],
    "q1_ast": ["q1_ast", "ast_q1", "period1_ast"],
    "q1_oreb": ["q1_oreb", "oreb_q1", "period1_oreb"],
    "q1_dreb": ["q1_dreb", "dreb_q1", "period1_dreb"],
    "has_q1_data": ["has_q1_data"],

    "has_full_tracking": ["has_full_tracking"],
    "has_ast_tracking": ["has_ast_tracking"],
    "tracking_status": ["tracking_status"],
    "has_dvp_rolling": ["has_dvp_rolling"],

    "dvp_pts": ["dvp_pts_model", "dvp_pts", "dvp_points"],
    "dvp_reb": ["dvp_reb_model", "dvp_reb"],
    "dvp_ast": ["dvp_ast_model", "dvp_ast"],
    "dvp_3pt": ["dvp_3pt_model", "dvp_3pt", "dvp_fg3m"],
    "dvp_fga": ["dvp_fga_model", "dvp_fga"],
    "dvp_fg3a": ["dvp_fg3a_model", "dvp_fg3a"],
    "dvp_fta": ["dvp_fta_model", "dvp_fta"],
    "dvp_stl": ["dvp_stl_model", "dvp_stl"],
    "dvp_blk": ["dvp_blk_model", "dvp_blk"],
    "dvp_tov": ["dvp_tov_model", "dvp_tov"],
    "dvp_pf": ["dvp_pf_model", "dvp_pf"],
}

NUMERIC_CANONICAL = {
    "player_id", "min", "usage_pct", "touches", "rebound_chances", "passes_made",
    "potential_ast", "rebound_off", "rebound_def", "pts", "reb", "ast", "fgm", "fga",
    "fg3m", "fg3a", "ftm", "fta", "stl", "blk", "tov", "pf", "q1_pts", "q1_reb",
    "q1_ast", "q1_oreb", "q1_dreb", "has_q1_data", "has_full_tracking", "has_ast_tracking",
    "has_dvp_rolling", "dvp_pts", "dvp_reb", "dvp_ast", "dvp_3pt", "dvp_fga", "dvp_fg3a",
    "dvp_fta", "dvp_stl", "dvp_blk", "dvp_tov", "dvp_pf",
}

# -------------------------------------------------------------------
# 2. MODELOS
# -------------------------------------------------------------------
@dataclass(frozen=True)
class ModelConfig:
    stat: str
    file_stem: str
    target: str
    features: List[str]
    objective: str = "reg:squarederror"
    min_rows: int = 800
    allow_main: bool = True


def base_context_features() -> List[str]:
    return ["rest_days", "is_b2b", "is_home", "pos_enc", "has_full_tracking", "has_dvp_rolling"]


def trend_features(prefix: str) -> List[str]:
    return [f"{prefix}_trend_L5_L20", f"{prefix}_std_L10", f"{prefix}_std_L20"]


MODELOS_CONFIG: Dict[str, ModelConfig] = {
    "PTS": ModelConfig("PTS", "puntos", "pts", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L10", "usage_pct_L20",
        "fga_L5", "fga_L10", "fga_L20", "pts_L5", "pts_L10", "pts_L20", "pts_season",
        "touches_L5", "touches_L20", "ppm_L5", "pts_momentum", "q1_pts_L5", "q1_pts_pct_L5",
        "dvp_pts", "dvp_fga", *trend_features("pts"), *base_context_features()
    ]),
    "REB": ModelConfig("REB", "rebotes", "reb", [
        "min_L5", "min_L10", "min_L20", "rebound_chances_L5", "rebound_chances_L10", "rebound_chances_L20",
        "rebound_off_L5", "rebound_def_L5", "reb_L5", "reb_L10", "reb_L20", "reb_season",
        "touches_L5", "reb_pm_L5", "reb_momentum", "q1_reb_L5", "q1_reb_pct_L5",
        "dvp_reb", *trend_features("reb"), *base_context_features()
    ]),
    "AST": ModelConfig("AST", "asistencias", "ast", [
        "min_L5", "min_L10", "min_L20", "passes_made_L5", "passes_made_L10", "passes_made_L20",
        "potential_ast_L5", "potential_ast_L10", "potential_ast_L20", "ast_L5", "ast_L10", "ast_L20",
        "ast_season", "touches_L5", "touches_L20", "usage_pct_L5", "ast_pm_L5", "ast_momentum",
        "q1_ast_L5", "q1_ast_pct_L5", "dvp_ast", *trend_features("ast"), *base_context_features()
    ]),
    "3PT": ModelConfig("3PT", "triples", "fg3m", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "fg3a_L5", "fg3a_L10", "fg3a_L20",
        "fg3m_L5", "fg3m_L10", "fg3m_L20", "fg3m_season", "dvp_3pt", "dvp_fg3a",
        *trend_features("fg3m"), *base_context_features()
    ], objective="count:poisson"),
    "FGM": ModelConfig("FGM", "tiros_anotados", "fgm", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L20", "fga_L5", "fga_L20",
        "fgm_L5", "fgm_L10", "fgm_L20", "fgm_season", "dvp_pts", "dvp_fga", *trend_features("fgm"),
        *base_context_features()
    ]),
    "FGA": ModelConfig("FGA", "tiros_intentados", "fga", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L20", "fga_L5", "fga_L10", "fga_L20",
        "touches_L5", "touches_L20", "fga_pm_L5", "dvp_fga", *trend_features("fga"), *base_context_features()
    ]),
    "FG3A": ModelConfig("FG3A", "triples_intentados", "fg3a", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "fg3a_L5", "fg3a_L10", "fg3a_L20",
        "fg3a_season", "dvp_3pt", "dvp_fg3a", *trend_features("fg3a"), *base_context_features()
    ], objective="count:poisson"),
    "FTM": ModelConfig("FTM", "libres_anotados", "ftm", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L20", "fta_L5", "fta_L20",
        "ftm_L5", "ftm_L10", "ftm_L20", "ftm_season", "dvp_fta", *trend_features("ftm"),
        *base_context_features()
    ]),
    "FTA": ModelConfig("FTA", "libres_intentados", "fta", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L20", "fta_L5", "fta_L10", "fta_L20",
        "fta_season", "dvp_fta", *trend_features("fta"), *base_context_features()
    ]),
    "PRA": ModelConfig("PRA", "pra", "pra", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L20", "pts_L5", "reb_L5", "ast_L5",
        "pts_L20", "reb_L20", "ast_L20", "fga_L5", "touches_L5", "rebound_chances_L5", "potential_ast_L5",
        "pra_L5", "pra_L10", "pra_L20", "pra_season", "pra_momentum", "dvp_pts", "dvp_reb", "dvp_ast",
        *trend_features("pra"), *base_context_features()
    ]),
    "PR": ModelConfig("PR", "pr", "pr", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "pts_L5", "reb_L5", "pts_L20", "reb_L20",
        "fga_L5", "rebound_chances_L5", "pr_L5", "pr_L10", "pr_L20", "pr_season", "pr_momentum",
        "dvp_pts", "dvp_reb", *trend_features("pr"), *base_context_features()
    ]),
    "PA": ModelConfig("PA", "pa", "pa", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "pts_L5", "ast_L5", "pts_L20", "ast_L20",
        "fga_L5", "potential_ast_L5", "pa_L5", "pa_L10", "pa_L20", "pa_season", "pa_momentum",
        "dvp_pts", "dvp_ast", *trend_features("pa"), *base_context_features()
    ]),
    "RA": ModelConfig("RA", "ra", "ra", [
        "min_L5", "min_L10", "min_L20", "reb_L5", "ast_L5", "reb_L20", "ast_L20", "rebound_chances_L5",
        "potential_ast_L5", "ra_L5", "ra_L10", "ra_L20", "ra_season", "ra_momentum", "dvp_reb", "dvp_ast",
        *trend_features("ra"), *base_context_features()
    ]),
    "TOV": ModelConfig("TOV", "perdidas", "tov", [
        "min_L5", "min_L10", "min_L20", "usage_pct_L5", "usage_pct_L10", "usage_pct_L20",
        "touches_L5", "touches_L10", "touches_L20", "passes_made_L5", "passes_made_L20",
        "potential_ast_L5", "ast_L5", "tov_L5", "tov_L10", "tov_L20", "tov_season", "dvp_tov",
        *trend_features("tov"), *base_context_features()
    ], objective="count:poisson", allow_main=True),
    "PF": ModelConfig("PF", "faltas", "pf", [
        "min_L5", "min_L10", "min_L20", "pf_L5", "pf_L10", "pf_L20", "pf_season", "blk_L5", "stl_L5",
        "reb_L5", "dvp_pf", *trend_features("pf"), *base_context_features()
    ], objective="count:poisson", allow_main=False),
    "STL": ModelConfig("STL", "robos", "stl", [
        "min_L5", "min_L10", "min_L20", "stl_L5", "stl_L10", "stl_L20", "stl_season",
        "touches_L5", "passes_made_L5", "dvp_stl", *trend_features("stl"), *base_context_features()
    ], objective="count:poisson", allow_main=False),
    "BLK": ModelConfig("BLK", "tapones", "blk", [
        "min_L5", "min_L10", "min_L20", "blk_L5", "blk_L10", "blk_L20", "blk_season",
        "reb_L5", "rebound_chances_L5", "dvp_blk", *trend_features("blk"), *base_context_features()
    ], objective="count:poisson", allow_main=False),
    "STL+BLK": ModelConfig("STL+BLK", "robos_tapones", "stl_blk", [
        "min_L5", "min_L10", "min_L20", "stl_blk_L5", "stl_blk_L10", "stl_blk_L20", "stl_blk_season",
        "stl_L5", "blk_L5", "reb_L5", "touches_L5", "dvp_stl", "dvp_blk", *trend_features("stl_blk"),
        *base_context_features()
    ], objective="count:poisson", allow_main=False),
}

ROLLING_BASE_COLS = [
    "min", "usage_pct", "touches", "rebound_chances", "passes_made", "potential_ast",
    "rebound_off", "rebound_def", "pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a",
    "ftm", "fta", "stl", "blk", "tov", "pf", "q1_pts", "q1_reb", "q1_ast",
    "pra", "pr", "pa", "ra", "stl_blk",
]
SEASON_COLS = [
    "pts", "reb", "ast", "fgm", "fg3m", "fg3a", "ftm", "fta", "stl", "blk", "tov", "pf",
    "q1_pts", "q1_reb", "q1_ast", "pra", "pr", "pa", "ra", "stl_blk",
]
STD_COLS = [
    "pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "stl", "blk", "tov",
    "pf", "pra", "pr", "pa", "ra", "stl_blk", "min", "usage_pct", "touches",
]

# -------------------------------------------------------------------
# 3. HELPERS
# -------------------------------------------------------------------
def log(msg: str) -> None:
    print(msg, flush=True)


def parse_view_name(view_name: str) -> Tuple[str, str]:
    parts = view_name.split(".")
    if len(parts) == 1:
        return "public", parts[0]
    return parts[-2], parts[-1]


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def column_catalog(view_name: str) -> Dict[str, str]:
    schema, table = parse_view_name(view_name)
    q = text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name = :table
    """)
    with ENGINE.connect() as conn:
        rows = conn.execute(q, {"schema": schema, "table": table}).fetchall()
    if not rows:
        raise RuntimeError(f"No encontré columnas para {view_name}. Revisá schema/nombre.")
    return {str(r[0]).lower(): str(r[0]) for r in rows}


def select_expr_for(canonical: str, available: Dict[str, str]) -> str:
    aliases = COLUMN_ALIASES.get(canonical, [canonical])
    for alias in aliases:
        if alias.lower() in available:
            col = quote_ident(available[alias.lower()])
            # usage_pct puede venir como 22.8 o 0.228. No normalizamos acá para no asumir.
            return f"{col} AS {quote_ident(canonical)}"
    if canonical in NUMERIC_CANONICAL:
        return f"NULL::double precision AS {quote_ident(canonical)}"
    if canonical == "game_date":
        return f"NULL::date AS {quote_ident(canonical)}"
    return f"NULL::text AS {quote_ident(canonical)}"


def build_select(view_name: str) -> str:
    available = column_catalog(view_name)
    canonical_cols = list(COLUMN_ALIASES.keys())
    exprs = [select_expr_for(c, available) for c in canonical_cols]
    schema, table = parse_view_name(view_name)
    order_parts = []
    for c in ["player_id", "game_date", "game_id"]:
        for alias in COLUMN_ALIASES[c]:
            if alias.lower() in available:
                order_parts.append(quote_ident(available[alias.lower()]))
                break
    order_sql = ", ".join(order_parts) if order_parts else "1"
    return f"SELECT\n  " + ",\n  ".join(exprs) + f"\nFROM {quote_ident(schema)}.{quote_ident(table)}\nORDER BY {order_sql}"


def probe_source(view_name: str) -> None:
    available = column_catalog(view_name)
    log(f"\n🔎 Probe columnas: {view_name}")
    for canonical, aliases in COLUMN_ALIASES.items():
        found = next((available[a.lower()] for a in aliases if a.lower() in available), None)
        status = found or "—"
        log(f"  {canonical.ljust(20)} <- {status}")


def infer_is_home(matchup: object, team: object, home_away: object = None) -> int:
    if home_away is not None and not pd.isna(home_away):
        val = str(home_away).upper().strip()
        if val in {"HOME", "H", "LOCAL"}:
            return 1
        if val in {"AWAY", "A", "VISITOR", "VISITANTE"}:
            return 0
    if pd.isna(matchup) or pd.isna(team):
        return 0
    m = str(matchup).replace(".", "").strip()
    t = str(team).strip().upper()
    if "@" in m:
        left, right = [x.strip().upper() for x in m.split("@", 1)]
        if left.startswith(t) or left.endswith(t):
            return 0
        if right.startswith(t) or right.endswith(t):
            return 1
    if " VS " in m.upper():
        left = re.split(r"\s+VS\s+", m.upper(), maxsplit=1)[0]
        return 1 if left.startswith(t) or left.endswith(t) else 0
    return 0


def make_model(objective: str, seed: int = 42) -> XGBRegressor:
    return XGBRegressor(
        n_estimators=650,
        learning_rate=0.025,
        max_depth=4,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=5,
        gamma=0.1,
        reg_alpha=0.05,
        reg_lambda=1.1,
        objective=objective,
        eval_metric="mae",
        random_state=seed,
        n_jobs=-1,
        early_stopping_rounds=30,
        missing=np.nan,
    )


def date_based_splits(df: pd.DataFrame, n_splits: int = 5) -> Iterable[Tuple[np.ndarray, np.ndarray]]:
    dates = np.array(sorted(pd.to_datetime(df["game_date"]).dt.date.unique()))
    if len(dates) < n_splits + 2:
        raise ValueError(f"No hay fechas suficientes para {n_splits} folds. Fechas={len(dates)}")
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
    return pd.Series(np.where(den.fillna(0) > 0, num.fillna(0) / den.fillna(0), 0), index=num.index)


def feature_importance_report(modelo: XGBRegressor, features: List[str]) -> str:
    if not hasattr(modelo, "feature_importances_"):
        return ""
    imp = dict(zip(features, modelo.feature_importances_))
    top = sorted(imp.items(), key=lambda x: x[1], reverse=True)[:10]
    return " | ".join([f"{k}={v:.3f}" for k, v in top])


def load_source(view_name: str) -> pd.DataFrame:
    query = text(build_select(view_name))
    df = pd.read_sql(query, ENGINE)
    if df.empty:
        raise RuntimeError(f"La fuente {view_name} no devolvió filas.")
    log(f"✅ {view_name}: {len(df)} filas | {df['player_id'].nunique()} jugadores")
    return df


def preparar_features(df_raw: pd.DataFrame) -> pd.DataFrame:
    df = df_raw.copy()
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df[df["game_date"].notna()].copy()

    # Numéricos.
    for col in NUMERIC_CANONICAL:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["player_id"] = pd.to_numeric(df["player_id"], errors="coerce")
    df = df[df["player_id"].notna()].copy()
    df["player_id"] = df["player_id"].astype(int)

    df = df.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)

    # Defaults seguros.
    for col in ["pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "stl", "blk", "tov", "pf"]:
        if col not in df.columns:
            df[col] = np.nan

    # Targets directos y combos.
    df["pra"] = df["pts"] + df["reb"] + df["ast"]
    df["pr"] = df["pts"] + df["reb"]
    df["pa"] = df["pts"] + df["ast"]
    df["ra"] = df["reb"] + df["ast"]
    df["stl_blk"] = df["stl"] + df["blk"]

    # Posición y localía.
    df["position"] = df.get("position", pd.Series(index=df.index, dtype=object)).fillna("").replace("", np.nan)
    df["position"] = df["position"].fillna(df.get("position_group", pd.Series(index=df.index, dtype=object))).fillna("F")
    df["pos_enc"] = df["position"].astype(str).str.upper().map(POSICION_ENCODING).fillna(3).astype(float)
    df["is_home"] = df.apply(lambda r: infer_is_home(r.get("matchup"), r.get("team_abbreviation"), r.get("home_away")), axis=1)

    # Descanso histórico por jugador.
    df["rest_days"] = df.groupby("player_id")["game_date"].diff().dt.days.fillna(3).clip(lower=0, upper=7)
    df["is_b2b"] = (df["rest_days"] <= 1).astype(int)

    # Flags.
    for flag in ["has_q1_data", "has_full_tracking", "has_ast_tracking", "has_dvp_rolling"]:
        if flag not in df.columns:
            df[flag] = 0
        df[flag] = pd.to_numeric(df[flag], errors="coerce").fillna(0).astype(int)

    # Normalización de usage: si viene 22.8, pasarlo a 0.228.
    if "usage_pct" in df.columns:
        med = df["usage_pct"].dropna().median()
        if pd.notna(med) and med > 1.5:
            df["usage_pct"] = df["usage_pct"] / 100.0

    # Rolling con shift(1): no usa el partido target.
    windows = [5, 10, 20]
    for col in ROLLING_BASE_COLS:
        if col not in df.columns:
            df[col] = np.nan
        grp = df.groupby("player_id")[col]
        for w in windows:
            df[f"{col}_L{w}"] = grp.transform(lambda x, ww=w: x.shift(1).rolling(ww, min_periods=1).mean())

    # Volatilidad.
    for col in STD_COLS:
        if col not in df.columns:
            df[col] = np.nan
        grp = df.groupby("player_id")[col]
        df[f"{col}_std_L10"] = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=3).std())
        df[f"{col}_std_L20"] = grp.transform(lambda x: x.shift(1).rolling(20, min_periods=5).std())

    # Season expanding.
    for col in SEASON_COLS:
        if col not in df.columns:
            df[col] = np.nan
        grp = df.groupby("player_id")[col]
        df[f"{col}_season"] = grp.transform(lambda x: x.shift(1).expanding(min_periods=1).mean())

    # Tendencias L5 vs L20.
    for col in SEASON_COLS + ["min", "usage_pct", "touches"]:
        if f"{col}_L5" in df.columns and f"{col}_L20" in df.columns:
            df[f"{col}_trend_L5_L20"] = df[f"{col}_L5"] - df[f"{col}_L20"]

    # Momentum viejo compatible.
    for col in ["pts", "reb", "ast", "pra", "pr", "pa", "ra"]:
        df[f"{col}_momentum"] = df.get(f"{col}_L5", np.nan) - df.get(f"{col}_season", np.nan)

    # Ratios seguros.
    # Fix específico: FGA necesita tendencia L5 vs L20.
    # En algunos builds la lista de trend cols no incluye fga, pero el modelo FGA sí la usa.
    if "fga_trend_L5_L20" not in df.columns and "fga_L5" in df.columns and "fga_L20" in df.columns:
        df["fga_trend_L5_L20"] = df["fga_L5"] - df["fga_L20"]

    df["q1_pts_pct_L5"] = safe_ratio(df.get("q1_pts_L5", pd.Series(0, index=df.index)), df.get("pts_L5", pd.Series(0, index=df.index)))
    df["q1_reb_pct_L5"] = safe_ratio(df.get("q1_reb_L5", pd.Series(0, index=df.index)), df.get("reb_L5", pd.Series(0, index=df.index)))
    df["q1_ast_pct_L5"] = safe_ratio(df.get("q1_ast_L5", pd.Series(0, index=df.index)), df.get("ast_L5", pd.Series(0, index=df.index)))
    df["ppm_L5"] = safe_ratio(df.get("pts_L5", pd.Series(0, index=df.index)), df.get("min_L5", pd.Series(0, index=df.index)))
    df["fga_pm_L5"] = safe_ratio(df.get("fga_L5", pd.Series(0, index=df.index)), df.get("min_L5", pd.Series(0, index=df.index)))
    df["ast_pm_L5"] = safe_ratio(df.get("ast_L5", pd.Series(0, index=df.index)), df.get("min_L5", pd.Series(0, index=df.index)))
    df["reb_pm_L5"] = safe_ratio(df.get("reb_L5", pd.Series(0, index=df.index)), df.get("min_L5", pd.Series(0, index=df.index)))

    log(
        f"🧱 Features: {len(df)} filas × {len(df.columns)} columnas | "
        f"fechas {df['game_date'].min().date()} → {df['game_date'].max().date()}"
    )
    return df


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

    # Evitar entrenar sobre partidos sin muestra previa: sin L20/L10 el modelo aprende demasiado ruido.
    if f"{cfg.target}_L10" in train_df.columns:
        train_df = train_df[train_df[f"{cfg.target}_L10"].notna()].copy()

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
        f"   ✅ {cfg.stat.ljust(12)} | rows={len(train_df):6d} | "
        f"MAE CV={np.mean(maes):.3f} ±{np.std(maes):.3f} | "
        f"MAE Final={mae_final:.3f} | trees={best_iter} | main={cfg.allow_main}"
    )
    if top_features:
        log(f"      📊 Top: {top_features}")

    meta = {
        "stat": cfg.stat,
        "target": cfg.target,
        "objective": cfg.objective,
        "features": cfg.features,
        "allow_main": cfg.allow_main,
        "model_file": str(model_path),
        "rows": int(len(train_df)),
        "players": int(train_df["player_id"].nunique()),
        "games": int(train_df["game_id"].nunique()) if "game_id" in train_df.columns else 0,
        "date_min": str(train_df["game_date"].min().date()),
        "date_max": str(train_df["game_date"].max().date()),
        "mae_cv": round(float(np.mean(maes)), 4),
        "mae_cv_std": round(float(np.std(maes)), 4),
        "mae_final": round(float(mae_final), 4),
        "best_iteration": None if best_iter is None else int(best_iter),
        "top_features": top_features,
        "folds": fold_rows,
    }
    with open(models_dir / f"ludogallina_{cfg.file_stem}.metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return meta


def entrenar_modelos(only: Optional[List[str]], models_dir: str, n_splits: int, source_view: str) -> List[dict]:
    selected = MODELOS_CONFIG
    if only:
        only_set = {x.strip().upper() for x in only if x.strip()}
        selected = {k: v for k, v in MODELOS_CONFIG.items() if k in only_set}
        missing = sorted(only_set - set(selected.keys()))
        if missing:
            raise ValueError(f"Modelos no reconocidos: {missing}. Disponibles: {sorted(MODELOS_CONFIG)}")

    out_dir = Path(models_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    log("\n🏋️‍♂️ LUDO TRAINER v35 — Gold view + All Markets + L20")
    log("=" * 82)
    log(f"Fuente: {source_view}")
    log(f"Modelos: {', '.join(selected.keys())}")
    log(f"Salida: {out_dir.resolve()}")

    raw = load_source(source_view)
    df = preparar_features(raw)

    resumen = []
    log("\n🧠 Entrenando modelos...")
    for stat, cfg in selected.items():
        meta = entrenar_un_modelo(cfg, df, out_dir, n_splits=n_splits)
        if meta:
            meta["source_view"] = source_view
            resumen.append(meta)

    if not resumen:
        log("\n❌ No se entrenó ningún modelo.")
        return []

    registry = {
        "version": "ludo_trainer_v35_gold_all_markets",
        "created_at": pd.Timestamp.now().isoformat(),
        "source_view": source_view,
        "models_dir": str(out_dir),
        "notes": "Gold view: bio position, season, opponent_clean, Q1, passes_made, tracking flags, DVP básico, L5/L10/L20, trends, volatilidad y mercados BLK/STL/STL+BLK/TOV/PF.",
        "models": {m["stat"]: m for m in resumen},
    }
    with open(out_dir / "ludo_model_registry.json", "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)

    df_res = pd.DataFrame([
        {
            "stat": m["stat"], "target": m["target"], "rows": m["rows"], "players": m["players"],
            "games": m["games"], "date_min": m["date_min"], "date_max": m["date_max"],
            "mae_cv": m["mae_cv"], "mae_cv_std": m["mae_cv_std"], "mae_final": m["mae_final"],
            "allow_main": m["allow_main"], "model_file": m["model_file"],
        }
        for m in resumen
    ]).sort_values("mae_cv")
    df_res.to_csv(out_dir / "ludo_training_summary.csv", index=False, encoding="utf-8")

    log("\n" + "=" * 82)
    log("🏆 RESUMEN FINAL")
    log("=" * 82)
    for _, r in df_res.iterrows():
        log(
            f"   {str(r['stat']).ljust(8)} | MAE CV={r['mae_cv']:.3f} ±{r['mae_cv_std']:.3f} | "
            f"Final={r['mae_final']:.3f} | rows={int(r['rows'])} | main={bool(r['allow_main'])}"
        )
    log(f"\n✅ Modelos guardados en: {out_dir}")
    log(f"✅ Registry: {out_dir / 'ludo_model_registry.json'}")
    log(f"✅ Resumen:  {out_dir / 'ludo_training_summary.csv'}")
    return resumen


def main() -> None:
    parser = argparse.ArgumentParser(description="Entrenamiento Ludo v35 gold all markets")
    parser.add_argument("--only", default="", help="Modelos separados por coma. Ej: PTS,REB,TOV,PF")
    parser.add_argument("--models-dir", default="modelos_ai", help="Carpeta canónica de modelos")
    parser.add_argument("--splits", type=int, default=5, help="Folds temporales")
    parser.add_argument("--source-view", default=DEFAULT_SOURCE_VIEW, help="Vista/fuente histórica")
    parser.add_argument("--probe", action="store_true", help="Solo inspecciona columnas disponibles y sale")
    args = parser.parse_args()

    if args.probe:
        probe_source(args.source_view)
        return

    only = [x.strip() for x in args.only.split(",") if x.strip()] or None
    start = time.time()
    entrenar_modelos(only=only, models_dir=args.models_dir, n_splits=args.splits, source_view=args.source_view)
    log(f"\n⏱️ Tiempo total: {round(time.time() - start, 1)}s")


if __name__ == "__main__":
    main()
