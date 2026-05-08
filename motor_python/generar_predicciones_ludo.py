#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
LUDO v2 — GENERADOR DE PREDICCIONES

Objetivo:
- Probar compatibilidad entre:
  v_ludo_today_props_base
  + modelos_ai/ludo_model_registry.json
  + modelos .pkl

No borra nada.
No sube picks.
No toca Supabase.
Solo genera predicciones locales y un CSV.

Uso:
    python3 smoke_ludo_v2_fix.py --top 30
"""

import os
import json
import argparse
import uuid
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


# ============================================================
# 1. CONFIG
# ============================================================

load_dotenv()

MODELS_DIR = Path("modelos_ai")
REGISTRY_PATH = MODELS_DIR / "ludo_model_registry.json"
SUMMARY_PATH = MODELS_DIR / "ludo_training_summary.csv"
OUTPUT_CSV = Path("ludo_predictions.csv")

DB_URL = URL.create(
    drivername="postgresql",
    username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"),
    host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    query={"sslmode": "require"},
)

VIEW_PROPS = "v_ludo_today_props_base"


# ============================================================
# 2. HELPERS
# ============================================================

def get_engine():
    if not os.getenv("DB_PASSWORD"):
        raise RuntimeError("Falta DB_PASSWORD en el .env")
    return create_engine(DB_URL)


def normalize_key(s: str) -> str:
    """
    Normaliza nombres de columnas para hacer matching case-insensitive.
    Ej: min_L5, min_l5, MIN_L5 -> minl5
    """
    return str(s).replace("_", "").replace("-", "").lower().strip()


def build_column_lookup(df: pd.DataFrame) -> dict:
    """
    Devuelve un diccionario para encontrar columnas aunque PostgreSQL
    las haya devuelto en lowercase.
    """
    lookup = {}
    for c in df.columns:
        lookup[str(c)] = c
        lookup[str(c).lower()] = c
        lookup[normalize_key(c)] = c
    return lookup


def get_series_case_insensitive(df: pd.DataFrame, wanted: str, default=0.0) -> pd.Series:
    """
    Busca una columna sin importar mayúsculas/minúsculas.
    Si no existe, devuelve default.
    """
    lookup = build_column_lookup(df)

    candidates = [
        wanted,
        wanted.lower(),
        normalize_key(wanted),
    ]

    for c in candidates:
        if c in lookup:
            return df[lookup[c]]

    return pd.Series(default, index=df.index)


def to_numeric_safe(s: pd.Series, default=0.0) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(default)


def load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        raise FileNotFoundError(f"No existe registry: {REGISTRY_PATH}")

    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))

    if not isinstance(data, dict) or "models" not in data:
        raise ValueError("Formato inesperado en ludo_model_registry.json. No encontré clave 'models'.")

    models = data["models"]
    if not isinstance(models, dict):
        raise ValueError("Formato inesperado: registry['models'] no es dict.")

    return models


def load_summary_mae() -> dict:
    """
    Lee MAE desde ludo_training_summary.csv.
    """
    mae = {}

    if not SUMMARY_PATH.exists():
        return mae

    df = pd.read_csv(SUMMARY_PATH)
    for _, r in df.iterrows():
        stat = str(r["stat"])
        mae[stat] = float(r["mae_cv"])

    return mae


def resolve_model_path(path_str: str) -> Path:
    """
    El registry puede tener:
    modelos_ai/ludogallina_puntos.pkl
    o ruta absoluta.
    """
    p = Path(path_str)
    if p.exists():
        return p

    p2 = Path.cwd() / path_str
    if p2.exists():
        return p2

    p3 = MODELS_DIR / p.name
    if p3.exists():
        return p3

    raise FileNotFoundError(f"No encontré modelo: {path_str}")


def load_props(engine) -> pd.DataFrame:
    query = text(f"SELECT * FROM {VIEW_PROPS};")
    df = pd.read_sql(query, engine)

    if df.empty:
        raise RuntimeError(f"La vista {VIEW_PROPS} no devolvió filas.")

    return df


def add_canonical_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Crea columnas con nombres compatibles con el registry.
    PostgreSQL suele devolver min_l5, pts_l5, etc.
    El modelo espera min_L5, pts_L5, etc.

    También crea features derivadas para combos:
    PRA, PR, PA, RA.
    """
    out = df.copy()

    # Base numéricas esperadas con formato del modelo
    base_features = [
        "min_L5", "min_L10",
        "usage_pct_L5", "usage_pct_L10",
        "touches_L5", "touches_L10",
        "rebound_chances_L5", "rebound_chances_L10",
        "passes_made_L5", "passes_made_L10",
        "potential_ast_L5", "potential_ast_L10",
        "rebound_off_L5", "rebound_def_L5",

        "pts_L5", "pts_L10", "pts_season",
        "reb_L5", "reb_L10", "reb_season",
        "ast_L5", "ast_L10", "ast_season",

        "fgm_L5", "fgm_L10", "fgm_season",
        "fga_L5", "fga_L10",

        "fg3m_L5", "fg3m_L10", "fg3m_season",
        "fg3a_L5", "fg3a_L10", "fg3a_season",

        "ftm_L5", "ftm_L10", "ftm_season",
        "fta_L5", "fta_L10", "fta_season",

        "q1_pts_L5", "q1_pts_L10", "q1_pts_season",
        "q1_reb_L5", "q1_reb_L10", "q1_reb_season",
        "q1_ast_L5", "q1_ast_L10", "q1_ast_season",

        "pts_momentum", "reb_momentum", "ast_momentum",

        "q1_pts_pct_L5", "q1_reb_pct_L5", "q1_ast_pct_L5",

        "ppm_L5", "fga_pm_L5", "ast_pm_L5", "reb_pm_L5",

        "rest_days", "is_b2b", "is_home",
        "has_full_tracking", "has_ast_tracking",

        "dvp_games_prior", "has_dvp_rolling",
        "dvp_pts", "dvp_reb", "dvp_ast", "dvp_3pt",
        "dvp_fga", "dvp_fg3a", "dvp_fta",
    ]

    for feat in base_features:
        if feat not in out.columns:
            out[feat] = get_series_case_insensitive(out, feat, default=np.nan)

    # Numéricos
    for feat in base_features:
        out[feat] = pd.to_numeric(out[feat], errors="coerce")

    # Fallbacks razonables para columnas que no deben explotar
    safe_zero = [
        "is_b2b", "is_home", "has_full_tracking", "has_ast_tracking",
        "rest_days", "dvp_games_prior", "has_dvp_rolling",
    ]
    for feat in safe_zero:
        out[feat] = out[feat].fillna(0)

    # La vista diaria trae DvP latest. Si hay al menos 3 partidos previos,
    # lo marcamos como DvP rolling válido.
    out["has_dvp_rolling"] = np.where(
        out["dvp_games_prior"].fillna(0) >= 3,
        1,
        0
    )

    # Features de combos
    out["pra_L5"] = out["pts_L5"] + out["reb_L5"] + out["ast_L5"]
    out["pra_L10"] = out["pts_L10"] + out["reb_L10"] + out["ast_L10"]
    out["pra_season"] = out["pts_season"] + out["reb_season"] + out["ast_season"]
    out["pra_momentum"] = out["pra_L5"] - out["pra_season"]

    out["pr_L5"] = out["pts_L5"] + out["reb_L5"]
    out["pr_L10"] = out["pts_L10"] + out["reb_L10"]
    out["pr_season"] = out["pts_season"] + out["reb_season"]
    out["pr_momentum"] = out["pr_L5"] - out["pr_season"]

    out["pa_L5"] = out["pts_L5"] + out["ast_L5"]
    out["pa_L10"] = out["pts_L10"] + out["ast_L10"]
    out["pa_season"] = out["pts_season"] + out["ast_season"]
    out["pa_momentum"] = out["pa_L5"] - out["pa_season"]

    out["ra_L5"] = out["reb_L5"] + out["ast_L5"]
    out["ra_L10"] = out["reb_L10"] + out["ast_L10"]
    out["ra_season"] = out["reb_season"] + out["ast_season"]
    out["ra_momentum"] = out["ra_L5"] - out["ra_season"]

    # Position encoding, por si el modelo la pide
    pos_map = {
        "G": 1,
        "G-F": 2,
        "F-G": 2,
        "F": 3,
        "F-C": 4,
        "C-F": 4,
        "C": 5,
    }

    if "position" in out.columns:
        out["pos_enc"] = out["position"].map(pos_map).fillna(3)
    else:
        out["pos_enc"] = 3

    # Asegurar line y cuotas
    for col in ["line", "over_price", "under_price"]:
        out[col] = pd.to_numeric(get_series_case_insensitive(out, col, default=np.nan), errors="coerce")

    # prop_type y player_name
    if "prop_type" not in out.columns:
        out["prop_type"] = get_series_case_insensitive(out, "prop_type", default="")

    if "player_name" not in out.columns:
        out["player_name"] = get_series_case_insensitive(out, "player_name", default="")

    return out


def choose_model_key(row) -> str:
    prop = str(row.get("prop_type", "")).strip()

    # Si es AST y no hay tracking AST, usamos fallback
    if prop == "AST":
        has_ast = row.get("has_ast_tracking", 0)
        pot_l5 = row.get("potential_ast_L5", np.nan)

        try:
            has_ast = int(has_ast)
        except Exception:
            has_ast = 0

        if has_ast != 1 or pd.isna(pot_l5):
            return "AST_FALLBACK"

    return prop


def detect_missing_features(df: pd.DataFrame, registry: dict) -> dict:
    missing = {}

    for stat, info in registry.items():
        features = info.get("features", [])
        miss = [f for f in features if f not in df.columns]
        if miss:
            missing[stat] = miss

    return missing


def predict_all(df: pd.DataFrame, registry: dict, mae_dict: dict) -> pd.DataFrame:
    out = df.copy()

    out["model_key"] = out.apply(choose_model_key, axis=1)
    out["proj"] = np.nan
    out["model_mae"] = np.nan
    out["model_file"] = ""

    loaded_models = {}

    for model_key in sorted(out["model_key"].dropna().unique()):
        if model_key not in registry:
            continue

        info = registry[model_key]
        features = info.get("features", [])
        model_path = resolve_model_path(info["model_file"])

        if model_key not in loaded_models:
            loaded_models[model_key] = joblib.load(model_path)

        model = loaded_models[model_key]

        mask = out["model_key"] == model_key
        if not mask.any():
            continue

        X = out.loc[mask, features].copy()

        # Convertir todo a numérico y rellenar faltantes con 0.
        # Para smoke test sirve. En Ludo final podemos ser más fino.
        for c in X.columns:
            X[c] = pd.to_numeric(X[c], errors="coerce")

        X = X.replace([np.inf, -np.inf], np.nan).fillna(0)

        preds = model.predict(X)
        preds = np.maximum(preds, 0)

        out.loc[mask, "proj"] = preds
        out.loc[mask, "model_mae"] = float(mae_dict.get(model_key, mae_dict.get(str(out.loc[mask, "prop_type"].iloc[0]), np.nan)))
        out.loc[mask, "model_file"] = str(model_path)

    return out


def add_edges(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    out["line"] = pd.to_numeric(out["line"], errors="coerce")
    out["over_price"] = pd.to_numeric(out["over_price"], errors="coerce")
    out["under_price"] = pd.to_numeric(out["under_price"], errors="coerce")

    out["diff"] = out["proj"] - out["line"]
    out["diff_abs"] = out["diff"].abs()

    out["edge"] = np.where(
        out["line"].replace(0, np.nan).notna(),
        (out["diff_abs"] / out["line"].replace(0, np.nan)) * 100,
        np.nan,
    )

    # Score más honesto que edge porcentual:
    # diff_abs / MAE. Evita que líneas 0.5 exploten artificialmente.
    out["edge_score"] = np.where(
        out["model_mae"].replace(0, np.nan).notna(),
        out["diff_abs"] / out["model_mae"].replace(0, np.nan),
        np.nan,
    )

    out["side"] = np.where(out["diff"] > 0, "OVER", "UNDER")
    out["price"] = np.where(out["diff"] > 0, out["over_price"], out["under_price"])

    out["is_q1_calc"] = out["prop_type"].astype(str).str.startswith("Q1_")

    min_ok = np.where(
        out["is_q1_calc"],
        out["min_L5"] >= 10,
        out["min_L5"] >= 15,
    )

    mae_ok = out["diff_abs"] >= (out["model_mae"] * 0.5)

    price_ok = out["price"] > 1

    # Micro-líneas: útiles para radar, pero no deben dominar picks principales.
    out["micro_line"] = (
        ((out["prop_type"].isin(["PTS", "PRA", "PR", "PA", "RA"])) & (out["line"] < 5.5))
        | ((out["prop_type"].isin(["REB", "AST", "Q1_PTS"])) & (out["line"] <= 0.5))
        | ((out["prop_type"].isin(["FGM", "FGA"])) & (out["line"] <= 1.5))
        | ((out["prop_type"].isin(["FTA", "FTM"])) & (out["line"] <= 0.5))
    )

    out["candidate_basic"] = (
        out["proj"].notna()
        & out["model_mae"].notna()
        & min_ok
        & mae_ok
        & price_ok
    )

    return out


def print_summary(df: pd.DataFrame):
    rows = []

    for prop, g in df.groupby("prop_type"):
        rows.append({
            "prop_type": prop,
            "filas": len(g),
            "jugadores": g["player_id"].nunique() if "player_id" in g.columns else np.nan,
            "candidatos": int(g["candidate_basic"].sum()),
            "edge_prom": round(float(g["edge"].mean()), 1) if g["edge"].notna().any() else np.nan,
            "diff_prom": round(float(g["diff_abs"].mean()), 2) if g["diff_abs"].notna().any() else np.nan,
            "mae_prom": round(float(g["model_mae"].mean()), 2) if g["model_mae"].notna().any() else np.nan,
        })

    s = pd.DataFrame(rows).sort_values(["candidatos", "filas"], ascending=[False, False])

    print("\n📊 Resumen por prop:")
    print(s.to_string(index=False))


def print_top(df: pd.DataFrame, top: int):
    cols = [
        "candidate_basic",
        "player_name",
        "team_abbreviation",
        "matchup",
        "prop_type",
        "side",
        "line",
        "price",
        "proj",
        "diff",
        "edge",
        "edge_score",
        "micro_line",
        "model_mae",
        "model_key",
        "min_L5",
        "has_ast_tracking",
        "tracking_status",
    ]

    cols = [c for c in cols if c in df.columns]

    cand = df[df["candidate_basic"]].copy()

    if cand.empty:
        print("\n🎯 Candidatos básicos: 0")
        print("No hay candidatos con el filtro simple. Igual se generó CSV con predicciones.")
        return

    cand = cand.sort_values(["edge_score", "diff_abs"], ascending=False).head(top)

    print(f"\n🎯 Top {min(top, len(cand))} candidatos básicos:")
    display = cand[cols].copy()

    for c in ["line", "price", "proj", "diff", "edge", "edge_score", "model_mae", "min_L5"]:
        if c in display.columns:
            display[c] = pd.to_numeric(display[c], errors="coerce").round(2)

    print(display.to_string(index=False))




def save_predictions_db(df: pd.DataFrame, engine, run_id: str) -> None:
    cols_map = {
        "player_id": "player_id",
        "player_name": "player_name",
        "team_abbreviation": "team_abbreviation",
        "matchup": "matchup",
        "event_date": "game_date",
        "opp": "opp",
        "is_home": "is_home",
        "prop_type": "prop_type",
        "prop_group": "prop_group",
        "side": "side",
        "line": "line",
        "price": "price",
        "over_price": "over_price",
        "under_price": "under_price",
        "proj": "proj",
        "diff": "diff",
        "diff_abs": "diff_abs",
        "edge": "edge_pct",
        "edge_score": "edge_score",
        "model_key": "model_key",
        "model_mae": "model_mae",
        "min_L5": "min_l5",
        "micro_line": "micro_line",
        "candidate_basic": "candidate_basic",
        "has_full_tracking": "has_full_tracking",
        "has_ast_tracking": "has_ast_tracking",
        "tracking_status": "tracking_status",
    }

    available = [c for c in cols_map if c in df.columns]
    out = df[available].rename(columns={c: cols_map[c] for c in available}).copy()
    out["run_id"] = run_id

    # Ordenar columnas: run_id primero.
    cols = ["run_id"] + [c for c in out.columns if c != "run_id"]
    out = out[cols]

    with engine.begin() as conn:
        out.to_sql(
            "ludo_prop_predictions",
            con=conn,
            if_exists="append",
            index=False,
            method="multi",
            chunksize=1000,
        )

    print(f"🧾 Predicciones guardadas en DB: {len(out)} filas | run_id={run_id}")


# ============================================================
# 3. MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="LUDO v2 generador de predicciones")
    parser.add_argument("--top", type=int, default=30, help="Cantidad de candidatos a mostrar")
    parser.add_argument("--save-db", action="store_true", help="Guardar predicciones en tabla ludo_prop_predictions")
    parser.add_argument("--run-id", default="", help="ID opcional de corrida. Si no se indica, se genera uno.")
    args = parser.parse_args()
    run_id = args.run_id.strip() or f"ludo_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    print("🔮 LUDO v2 — GENERADOR DE PREDICCIONES")
    print("=" * 72)

    registry = load_registry()
    mae_dict = load_summary_mae()

    print(f"🆔 run_id: {run_id}")
    print(f"✅ Registry: {len(registry)} modelos")
    print(f"✅ MAE summary: {len(mae_dict)} stats")

    engine = get_engine()
    df_raw = load_props(engine)

    print(f"✅ Props cargadas desde {VIEW_PROPS}: {len(df_raw)}")
    print(
        f"   Jugadores: {df_raw['player_id'].nunique()} | "
        f"Partidos: {df_raw['matchup'].nunique()} | "
        f"Props: {df_raw['prop_type'].nunique()}"
    )

    df = add_canonical_columns(df_raw)

    missing = detect_missing_features(df, registry)
    if missing:
        print("\n⚠️ Features faltantes detectadas después del fix:")
        for stat, miss in missing.items():
            print(f"   {stat}: {miss}")
    else:
        print("\n✅ No hay features faltantes para los modelos del registry.")

    df = predict_all(df, registry, mae_dict)
    df = add_edges(df)

    print_summary(df)

    total_candidates = int(df["candidate_basic"].sum())
    print(f"\n🎯 Candidatos básicos: {total_candidates} / {len(df)}")

    print_top(df, args.top)

    export_cols = [
        "odds_player_name",
        "player_id",
        "player_name",
        "team_abbreviation",
        "matchup",
        "opp",
        "is_home",
        "prop_type",
        "prop_group",
        "line",
        "over_price",
        "under_price",
        "side",
        "price",
        "proj",
        "diff",
        "diff_abs",
        "edge",
        "edge_score",
        "micro_line",
        "model_mae",
        "model_key",
        "candidate_basic",
        "min_L5",
        "min_L10",
        "pts_L5",
        "reb_L5",
        "ast_L5",
        "has_full_tracking",
        "has_ast_tracking",
        "tracking_status",
    ]

    export_cols = [c for c in export_cols if c in df.columns]

    df[export_cols].to_csv(OUTPUT_CSV, index=False, encoding="utf-8")
    print(f"\n💾 CSV generado: {OUTPUT_CSV.resolve()}")

    if args.save_db:
        save_predictions_db(df, engine, run_id)

    print("\nNota: esto genera predicciones, NO tickets finales. Los picks se filtrarán en generar_picks_ludo.py.")


if __name__ == "__main__":
    main()