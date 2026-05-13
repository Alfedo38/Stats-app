#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
generar_picks_ludo.py — Ludo v4.4

Lee:
- Último run de ludo_prop_predictions
- Historial limpio desde v_ludo_train_model_ready

Hace:
- Calcula hit rate L5/L10 contra la línea real.
- Deduplica líneas alternativas: 1 línea por jugador + prop + lado.
- Clasifica picks: JOYA / EXCELENTE / BUENA / RADAR.
- Permite JOYA por consistencia aunque falte tracking: 5/5 y 9/10+.
- Separa mercados:
    MAIN = PTS, REB, AST, PRA, PR, PA, RA, 3PT
    TECH = FGM, FGA, FG3A, FTM, FTA
    Q1   = Q1_PTS, Q1_REB, Q1_AST
- Arma tickets por fecha y un solo bloque por partido:
    MAIN / TECH / Q1 separados dentro del mismo partido
    X2 / X5 / X10 / Radar / Micro-líneas
    Sin singles
    Sin bloque GLOBAL por defecto
- Guarda historial en ludo_picks con INSERT, pick_date y run_id.
- Exporta CSV auditables.

Uso:
    python3 generar_picks_ludo.py
    python3 generar_picks_ludo.py --run-id ludo_20260507_122000_634622
    python3 generar_picks_ludo.py --dry-run
    python3 generar_picks_ludo.py --top 60
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


# ============================================================
# CONFIG
# ============================================================

load_dotenv()

OUT_CSV = Path("ludo_picks_audit.csv")
OUT_JSON = Path("ludo_picks_preview.json")

QUALITY_ORDER = {
    "JOYA": 4,
    "EXCELENTE": 3,
    "BUENA": 2,
    "RADAR": 1,
    "DESCARTAR": 0,
}

EMOJI = {
    "JOYA": "💎",
    "EXCELENTE": "⭐",
    "BUENA": "🌟",
    "RADAR": "📊",
    "DESCARTAR": "🗑️",
}

FAMILY_LABELS = {
    "MAIN": "🏀 FULL GAME",
    "TECH": "🎯 TÉCNICOS",
    "Q1": "⏱️ 1Q",
    "OTHER": "OTROS",
}


# ============================================================
# DB
# ============================================================

def get_engine():
    password = os.getenv("DB_PASSWORD")
    if not password:
        raise RuntimeError("Falta DB_PASSWORD en .env")

    db_url = URL.create(
        drivername="postgresql",
        username="postgres.xxhdctrvjsngwbagamns",
        password=password,
        host="aws-1-sa-east-1.pooler.supabase.com",
        port=6543,
        database="postgres",
        query={"sslmode": "require"},
    )
    return create_engine(db_url, pool_pre_ping=True)


# ============================================================
# LOADERS
# ============================================================

def get_latest_run_id(engine) -> str:
    q = text("""
        SELECT run_id
        FROM ludo_prop_predictions
        GROUP BY run_id
        ORDER BY MAX(created_at) DESC
        LIMIT 1;
    """)
    with engine.begin() as conn:
        run_id = conn.execute(q).scalar_one_or_none()

    if not run_id:
        raise RuntimeError("No hay runs en ludo_prop_predictions.")

    return str(run_id)


def load_predictions(engine, run_id: str) -> pd.DataFrame:
    q = text("""
        SELECT *
        FROM ludo_prop_predictions
        WHERE run_id = :run_id
        ORDER BY edge_score DESC NULLS LAST;
    """)
    df = pd.read_sql(q, engine, params={"run_id": run_id})

    if df.empty:
        raise RuntimeError(f"No hay predicciones para run_id={run_id}")

    return df


def load_history(engine, player_ids: list[int]) -> pd.DataFrame:
    if not player_ids:
        return pd.DataFrame()

    q = text("""
        SELECT
            player_id,
            player_name,
            game_date,
            game_id,
            pts,
            reb,
            ast,
            fg3m AS "3PT",
            fgm,
            fga,
            fg3a,
            ftm,
            fta,
            q1_pts,
            q1_reb,
            q1_ast
        FROM v_ludo_train_model_ready
        WHERE player_id = ANY(:player_ids)
          AND game_date >= '2025-10-01'
          AND min > 0
        ORDER BY player_id, game_date, game_id;
    """)

    df = pd.read_sql(q, engine, params={"player_ids": player_ids})
    if df.empty:
        return df

    df["game_date"] = pd.to_datetime(df["game_date"])

    df["PTS"] = df["pts"]
    df["REB"] = df["reb"]
    df["AST"] = df["ast"]

    df["FGM"] = df["fgm"]
    df["FGA"] = df["fga"]
    df["FG3A"] = df["fg3a"]
    df["FTM"] = df["ftm"]
    df["FTA"] = df["fta"]

    df["PRA"] = df["PTS"] + df["REB"] + df["AST"]
    df["PR"] = df["PTS"] + df["REB"]
    df["PA"] = df["PTS"] + df["AST"]
    df["RA"] = df["REB"] + df["AST"]

    df["Q1_PTS"] = df["q1_pts"]
    df["Q1_REB"] = df["q1_reb"]
    df["Q1_AST"] = df["q1_ast"]

    return df


# ============================================================
# BASIC HELPERS
# ============================================================

def market_family(prop: str) -> str:
    prop = str(prop)

    if prop in {"PTS", "REB", "AST", "PRA", "PR", "PA", "RA", "3PT"}:
        return "MAIN"

    if prop in {"FGM", "FGA", "FG3A", "FTM", "FTA"}:
        return "TECH"

    if prop in {"Q1_PTS", "Q1_REB", "Q1_AST"}:
        return "Q1"

    return "OTHER"


def as_float(value, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def as_int(value, default: int = 0) -> int:
    try:
        if pd.isna(value):
            return default
        return int(value)
    except Exception:
        return default


def get_run_date(preds: pd.DataFrame) -> str:
    if "created_at" in preds.columns and preds["created_at"].notna().any():
        dt = pd.to_datetime(preds["created_at"], errors="coerce").max()
        if pd.notna(dt):
            return dt.strftime("%Y-%m-%d")
    return pd.Timestamp.now().strftime("%Y-%m-%d")


# ============================================================
# HIT RATE
# ============================================================

def calc_hit_rate_for_row(row, hist: pd.DataFrame) -> pd.Series:
    player_id = row["player_id"]
    prop = str(row["prop_type"])
    side = str(row["side"])
    line = as_float(row["line"])

    h = hist[hist["player_id"] == player_id].copy()
    if h.empty or prop not in h.columns:
        return pd.Series({
            "hit_l5": 0,
            "n_l5": 0,
            "hit_l10": 0,
            "n_l10": 0,
            "hr_l5": 0.0,
            "hr_l10": 0.0,
            "hr_text": "0/0 | 0/0",
        })

    h = h.sort_values(["game_date", "game_id"]).tail(10)
    last5 = h.tail(5)

    values10 = pd.to_numeric(h[prop], errors="coerce").dropna()
    values5 = pd.to_numeric(last5[prop], errors="coerce").dropna()

    if side == "OVER":
        hit10 = int((values10 > line).sum())
        hit5 = int((values5 > line).sum())
    else:
        hit10 = int((values10 < line).sum())
        hit5 = int((values5 < line).sum())

    n10 = int(len(values10))
    n5 = int(len(values5))

    hr10 = hit10 / n10 if n10 else 0.0
    hr5 = hit5 / n5 if n5 else 0.0

    return pd.Series({
        "hit_l5": hit5,
        "n_l5": n5,
        "hit_l10": hit10,
        "n_l10": n10,
        "hr_l5": hr5,
        "hr_l10": hr10,
        "hr_text": f"{hit5}/{n5} | {hit10}/{n10}",
    })


# ============================================================
# QUALITY
# ============================================================

def line_min_ok(row) -> bool:
    prop = str(row["prop_type"])
    line = as_float(row["line"])

    min_lines = {
        "PTS": 5.5,
        "PRA": 8.5,
        "PR": 7.5,
        "PA": 7.5,
        "RA": 3.5,
        "REB": 1.5,
        "AST": 1.5,
        "3PT": 0.5,

        "FGA": 3.5,
        "FGM": 1.5,
        "FG3A": 1.5,
        "FTA": 0.5,
        "FTM": 0.5,

        "Q1_PTS": 1.5,
        "Q1_REB": 0.5,
        "Q1_AST": 0.5,
    }

    return line >= min_lines.get(prop, 1.5)


def is_micro_line(row) -> bool:
    prop = str(row["prop_type"])
    line = as_float(row["line"])

    if prop in {"PTS", "PRA", "PR", "PA", "RA"} and line < 5.5:
        return True
    if prop in {"REB", "AST", "Q1_PTS"} and line <= 0.5:
        return True
    if prop in {"FTA", "FTM"} and line <= 0.5:
        return True
    if prop in {"FGM", "FGA"} and line <= 1.5:
        return True

    return bool(row.get("micro_line", False))


def is_consistency_joya(row) -> bool:
    """
    JOYA por consistencia:
    Permitida aunque falte tracking si el historial contra línea es elite.
    """
    edge_score = as_float(row.get("edge_score"))
    hr5 = as_float(row.get("hr_l5"))
    hr10 = as_float(row.get("hr_l10"))
    price = as_float(row.get("price"))

    return (
        hr5 >= 1.00
        and hr10 >= 0.90
        and edge_score >= 1.50
        and price >= 1.28
        and not bool(row.get("micro_line_final", False))
        and bool(row.get("line_min_ok", False))
    )


def classify_pick(row) -> str:
    edge_score = as_float(row.get("edge_score"))
    hit_l5 = as_int(row.get("hit_l5"))
    hit_l10 = as_int(row.get("hit_l10"))
    n10 = as_int(row.get("n_l10"))
    price = as_float(row.get("price"))

    if n10 < 5:
        return "DESCARTAR"

    if not bool(row.get("candidate_basic", False)):
        return "DESCARTAR"

    if not bool(row.get("line_min_ok", False)) and not bool(row.get("micro_line_final", False)):
        return "DESCARTAR"

    # Micro-líneas: no son picks principales. Quedan para auditoría, no para tickets.
    if bool(row.get("micro_line_final", False)):
        if edge_score >= 1.35 and price >= 1.45 and hit_l5 >= 4 and hit_l10 >= 7:
            return "RADAR"
        return "DESCARTAR"

    # JOYA por consistencia: 5/5 y 9/10+ aunque falte tracking.
    if is_consistency_joya(row):
        return "JOYA"

    # JOYA normal: muy estricta.
    if edge_score >= 1.80 and price >= 1.35 and hit_l5 >= 4 and hit_l10 >= 8:
        return "JOYA"

    # EXCELENTE: ya no permite 3/5 + 7/10.
    if edge_score >= 1.35 and price >= 1.28 and (
        (hit_l5 >= 4 and hit_l10 >= 7)
        or (hit_l5 >= 3 and hit_l10 >= 9)
    ):
        return "EXCELENTE"

    # BUENA: usable para VALUE, pero sin 3/5 + 6/10.
    if edge_score >= 1.10 and price >= 1.28 and (
        (hit_l5 >= 3 and hit_l10 >= 7)
        or (hit_l5 >= 4 and hit_l10 >= 6)
    ):
        return "BUENA"

    # RADAR: fuerte enough para auditoría, pero no se muestra como ticket por defecto.
    if edge_score >= 0.90 and price >= 1.25 and (
        (hit_l5 >= 3 and hit_l10 >= 7)
        or (hit_l5 >= 4 and hit_l10 >= 6)
    ):
        return "RADAR"

    return "DESCARTAR"



def downgrade_quality(quality: str, max_quality: str) -> str:
    if QUALITY_ORDER.get(quality, 0) > QUALITY_ORDER.get(max_quality, 0):
        return max_quality
    return quality


def apply_penalties(row) -> str:
    """
    Penalizaciones v4.5 sin tracking.

    Antes:
    - Bajaba calidad si faltaba tracking.
    - Bajaba AST_FALLBACK por venir de modelo fallback.

    Ahora:
    - NO usa tracking_status.
    - NO castiga AST_FALLBACK.
    - Solo ajusta por cuota baja, porque eso sí afecta valor real.
    """
    quality = str(row["quality"])

    if quality == "DESCARTAR":
        return quality

    price = as_float(row.get("price"))
    consistency_joya = bool(row.get("consistency_joya", False))

    # Penalización suave por cuota baja.
    # No descartamos: solo evitamos vender como JOYA algo que paga demasiado poco.
    if not consistency_joya:
        if price < 1.35:
            quality = downgrade_quality(quality, "EXCELENTE")
        if price < 1.28:
            quality = downgrade_quality(quality, "BUENA")

    return quality


def add_quality(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    numeric_cols = [
        "edge_score", "line", "price", "proj", "diff", "diff_abs",
        "model_mae", "min_l5", "edge_pct", "hr_l5", "hr_l10",
        "hit_l5", "hit_l10", "n_l5", "n_l10",
    ]

    for col in numeric_cols:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")

    out["market_family"] = out["prop_type"].apply(market_family)
    out["micro_line_final"] = out.apply(is_micro_line, axis=1)
    out["line_min_ok"] = out.apply(line_min_ok, axis=1)

    out["consistency_joya"] = out.apply(is_consistency_joya, axis=1)
    out["quality"] = out.apply(classify_pick, axis=1)
    out["quality"] = out.apply(apply_penalties, axis=1)
    out["quality_ord"] = out["quality"].map(QUALITY_ORDER).fillna(0).astype(int)

    out["bucket"] = np.select(
        [
            out["quality"] == "DESCARTAR",
            out["micro_line_final"],
            out["quality"].isin(["JOYA", "EXCELENTE"]),
            out["quality"].isin(["BUENA", "RADAR"]),
        ],
        [
            "DESCARTADO",
            "MICRO_LINE",
            "MAIN",
            "RADAR",
        ],
        default="DESCARTADO",
    )

    return out


# ============================================================
# DEDUPE
# ============================================================

def dedupe_alternatives(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deja una sola alternativa por jugador + prop + lado.

    Cambio v4.3:
    - Para picks fuertes prioriza seguridad real de línea:
      OVER = línea más baja disponible.
      UNDER = línea más alta disponible.
    - Después mira edge/score/cuota.
    Esto evita elegir una línea más agresiva solo porque paga más.
    """
    out = df.copy()

    out["line_safety_sort"] = np.where(
        out["side"].astype(str).str.upper() == "OVER",
        -pd.to_numeric(out["line"], errors="coerce"),
        pd.to_numeric(out["line"], errors="coerce"),
    )

    out = out.sort_values(
        [
            "quality_ord",
            "consistency_joya",
            "hit_l5",
            "hit_l10",
            "hr_l5",
            "hr_l10",
            "edge_score",
            "line_safety_sort",
            "price",
            "diff_abs",
        ],
        ascending=[False, False, False, False, False, False, False, False, False, False],
    ).drop_duplicates(
        subset=["player_id", "prop_type", "side"],
        keep="first",
    ).copy()

    return out


# ============================================================
# FILTRO TEMPORAL DE VISIBILIDAD
# ============================================================

def apply_visibility_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Filtro de visibilidad v4.5 sin tracking.

    Mantiene filtros sanos:
    - mínimo 3 aciertos en L5
    - BUENA/RADAR necesita respaldo reciente
    - no usa tracking_status para descartar
    """
    out = df.copy()

    for col in ["hit_l5", "hit_l10", "hr_l5", "hr_l10", "edge_score"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)

    active = out["quality"] != "DESCARTAR"

    # Nada visible con menos de 3 aciertos en L5.
    weak_l5 = active & (out["hit_l5"] < 3)

    # Radar/Buena mínimo: 3/5 + 7/10, o 4/5 aunque L10 sea menor.
    radar_like = active & out["quality"].isin(["BUENA", "RADAR"])
    radar_ok = (
        ((out["hit_l5"] >= 3) & (out["hit_l10"] >= 7))
        | (out["hit_l5"] >= 4)
    )
    weak_radar = radar_like & (~radar_ok)

    # Sin castigo por tracking faltante.
    to_discard = weak_l5 | weak_radar

    out.loc[to_discard, "quality"] = "DESCARTAR"
    out.loc[to_discard, "quality_ord"] = 0
    out.loc[to_discard, "bucket"] = "DESCARTADO"

    return out


# ============================================================
# TICKETS
# ============================================================

def quality_badge(quality: str) -> str:
    return EMOJI.get(str(quality), "📊")


def play_to_dict(row) -> dict:
    quality = str(row["quality"])
    emoji = quality_badge(quality)

    edge_score = round(as_float(row.get("edge_score")), 2)
    edge_pct = round(as_float(row.get("edge_pct")), 1) if pd.notna(row.get("edge_pct")) else None

    analysis = (
        f"{emoji} [{quality}] {row['side']} {row['line']} {row['prop_type']} | "
        f"Proy {round(as_float(row['proj']), 2)} | "
        f"Diff {round(as_float(row['diff']), 2)} | "
        f"Score {edge_score} | "
        f"HR {row['hr_text']} | "
        f"{'Local' if as_int(row.get('is_home')) == 1 else 'Visitante'}"
    )

    return {
        "player_id": as_int(row.get("player_id"), default=0),
        "player": row["player_name"],
        "team": row["team_abbreviation"],
        "matchup": row["matchup"],
        "type": row["side"],
        "prop": row["prop_type"],
        "family": row.get("market_family", market_family(row["prop_type"])),
        "line": as_float(row["line"]),
        "odds": as_float(row["price"]),
        "proj": round(as_float(row["proj"]), 2),
        "diff": round(as_float(row["diff"]), 2),
        "edge": edge_score,
        "edge_score": edge_score,
        "edge_pct": edge_pct,
        "quality": quality,
        "calidad": quality,
        "is_vip": quality in {"JOYA", "EXCELENTE"},
        "hit_rate": row["hr_text"],
        "micro_line": bool(row.get("micro_line_final", False)),
        "consistency_joya": bool(row.get("consistency_joya", False)),
        "tracking_status": row.get("tracking_status"),
        "model_key": row.get("model_key"),
        "safe_line": as_float(row["line"]),
        "safe_odds": as_float(row["price"]),
        "safe_prob": round(as_float(row.get("hr_l10")) * 100, 1),
        "stake": 0.01,
        "analysis": analysis,
    }


def make_ticket(name: str, rows: pd.DataFrame) -> dict:
    plays = [play_to_dict(r) for _, r in rows.iterrows()]
    total_odds = math.prod([max(as_float(p["odds"], 1.01), 1.01) for p in plays])

    sides = sorted({str(p.get("type", "")) for p in plays if p.get("type")})
    families = sorted({str(p.get("family", "")) for p in plays if p.get("family")})

    return {
        "name": name,
        "side": sides[0] if len(sides) == 1 else "MIX",
        "family": families[0] if len(families) == 1 else "MIX",
        "total_odds": round(total_odds, 2),
        "pick_count": len(plays),
        "plays": plays,
        "calidades": [p["quality"] for p in plays],
    }


def sort_for_ticket(rows: pd.DataFrame) -> pd.DataFrame:
    if rows.empty:
        return rows.copy()

    return rows.sort_values(
        ["quality_ord", "consistency_joya", "edge_score", "hr_l10", "hr_l5", "price"],
        ascending=[False, False, False, False, False, False],
    )


def pick_unique(rows: pd.DataFrame, n: int, used_players: Optional[set] = None) -> pd.DataFrame:
    """
    Selecciona hasta n picks sin repetir jugador dentro del mismo ticket.
    """
    if used_players is None:
        used_players = set()

    if rows.empty or n <= 0:
        return rows.iloc[0:0].copy()

    rows = sort_for_ticket(rows)
    picked = []
    local_used = set(used_players)

    for _, r in rows.iterrows():
        pid = r.get("player_id")
        if pid in local_used:
            continue
        picked.append(r)
        local_used.add(pid)
        if len(picked) >= n:
            break

    if not picked:
        return rows.iloc[0:0].copy()

    return pd.DataFrame(picked)


def ticket_pool(
    df: pd.DataFrame,
    matchup: Optional[str] = None,
    side: Optional[str] = None,
    family: Optional[str] = None,
) -> pd.DataFrame:
    g = df.copy()

    if matchup is not None:
        g = g[g["matchup"] == matchup].copy()

    if side is not None:
        g = g[g["side"] == side].copy()

    if family is not None:
        g = g[g["market_family"] == family].copy()

    g = g[
        (g["quality"] != "DESCARTAR")
        & (~g["micro_line_final"])
        & (g["line_min_ok"])
    ].copy()

    return g


def pool_main_principal(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    """
    FULL GAME PRINCIPAL X2.
    Ultra estricto: 4/5 o 5/5 + mínimo 8/10.
    """
    g = ticket_pool(df, matchup=matchup, side=side, family="MAIN")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE"]))
        & (g["edge_score"] >= 1.25)
        & (g["hit_l5"] >= 4)
        & (g["hit_l10"] >= 8)
        & (g["price"] >= 1.28)
    ].copy()


def pool_main_secondary(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    """
    FULL GAME SECUNDARIO X2.
    Estricto, pero no tanto como principal: 4/5 + 7/10 mínimo.
    """
    g = ticket_pool(df, matchup=matchup, side=side, family="MAIN")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE", "BUENA"]))
        & (g["edge_score"] >= 1.10)
        & (g["hit_l5"] >= 4)
        & (g["hit_l10"] >= 7)
        & (g["price"] >= 1.28)
    ].copy()


def pool_main_value(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    """
    FULL GAME VALUE X2 / combinadas.
    Moderado, pero sin 3/5 + 6/10.
    """
    g = ticket_pool(df, matchup=matchup, side=side, family="MAIN")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE", "BUENA", "RADAR"]))
        & (g["edge_score"] >= 0.95)
        & (g["price"] >= 1.25)
        & (
            ((g["hit_l5"] >= 3) & (g["hit_l10"] >= 8))
            | ((g["hit_l5"] >= 4) & (g["hit_l10"] >= 6))
        )
    ].copy()


def pool_main_combo(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    """
    FULL GAME combinadas/mega. Misma base de value, pero se usa con menor prioridad.
    """
    return pool_main_value(df, matchup=matchup, side=side)



# ============================================================
# HR-FIRST TICKETS
# ============================================================

def _hr_quality(row) -> str:
    """
    Calidad basada SOLO en cumplimiento reciente.
    """
    hit_l5 = as_int(row.get("hit_l5"))
    hit_l10 = as_int(row.get("hit_l10"))

    if hit_l5 >= 5 and hit_l10 >= 9:
        return "JOYA"
    if (hit_l5 >= 5 and hit_l10 >= 8) or (hit_l5 >= 4 and hit_l10 >= 9):
        return "EXCELENTE"
    if hit_l5 >= 4 and hit_l10 >= 8:
        return "BUENA"

    return "RADAR"


def sort_for_hr_ticket(rows: pd.DataFrame) -> pd.DataFrame:
    if rows.empty:
        return rows.copy()

    out = rows.copy()

    for col in ["hit_l5", "hit_l10", "hr_l5", "hr_l10", "edge_score", "price"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)

    return out.sort_values(
        ["hit_l5", "hit_l10", "hr_l5", "hr_l10", "edge_score", "price"],
        ascending=[False, False, False, False, False, False],
    )


def pick_unique_hr(rows: pd.DataFrame, n: int, used_players: Optional[set] = None) -> pd.DataFrame:
    """
    Selecciona picks HR sin repetir jugador dentro del mismo ticket.
    Esto evita combinadas correlacionadas tipo PTS + PR + PRA del mismo jugador.
    """
    if used_players is None:
        used_players = set()

    if rows.empty or n <= 0:
        return rows.iloc[0:0].copy()

    rows = sort_for_hr_ticket(rows)

    picked = []
    local_used = set(used_players)

    for _, r in rows.iterrows():
        pid = r.get("player_id")
        if pid in local_used:
            continue

        picked.append(r)
        local_used.add(pid)

        if len(picked) >= n:
            break

    if not picked:
        return rows.iloc[0:0].copy()

    return pd.DataFrame(picked)


def hr_ticket_pool(
    df: pd.DataFrame,
    matchup: Optional[str] = None,
    side: Optional[str] = None,
    family: Optional[str] = "MAIN",
    min_hit_l5: int = 4,
    min_hit_l10: int = 8,
    min_price: float = 1.20,
) -> pd.DataFrame:
    """
    Pool basado principalmente en hit-rate reciente.

    No depende de:
    - tracking_status
    - quality previa
    - edge_score mínimo
    - candidate_basic

    Sí mantiene barreras sanas:
    - línea mínima
    - no micro-líneas
    - precio válido
    - muestra completa L5/L10
    """
    g = df.copy()

    if matchup is not None:
        g = g[g["matchup"] == matchup].copy()

    if side is not None:
        g = g[g["side"] == side].copy()

    if family is not None:
        g = g[g["market_family"] == family].copy()

    for col in ["hit_l5", "hit_l10", "n_l5", "n_l10", "price", "edge_score", "hr_l5", "hr_l10"]:
        if col in g.columns:
            g[col] = pd.to_numeric(g[col], errors="coerce").fillna(0)

    g = g[
        (g["n_l5"] >= 5)
        & (g["n_l10"] >= 10)
        & (g["hit_l5"] >= min_hit_l5)
        & (g["hit_l10"] >= min_hit_l10)
        & (g["price"] >= min_price)
        & (~g["micro_line_final"])
        & (g["line_min_ok"])
    ].copy()

    if g.empty:
        return g

    # Recalificamos para que el front no muestre DESCARTAR en tickets HR.
    g["quality"] = g.apply(_hr_quality, axis=1)
    g["quality_ord"] = g["quality"].map(QUALITY_ORDER).fillna(0).astype(int)
    g["bucket"] = "HR"

    return sort_for_hr_ticket(g)


def add_hr_candidate_ticket(
    candidates: list[dict],
    name: str,
    rows: pd.DataFrame,
    min_len: int,
    max_len: int,
    priority: int,
) -> None:
    """
    Agrega ticket HR. Nunca genera singles.
    """
    if min_len < 2:
        min_len = 2

    picked = pick_unique_hr(rows, max_len)

    if len(picked) < min_len:
        return

    ticket = make_ticket(name.replace("{n}", str(len(picked))), picked)
    candidates.append({
        "priority": priority,
        "ticket": ticket,
        "signature": ticket_signature(ticket),
    })


def add_hr_matchup_candidates(candidates: list[dict], df: pd.DataFrame, matchup: str) -> None:
    """
    Candidatos HR por partido.

    Reglas:
    - ELITE: 5/5 + 9/10+
    - FUERTE: 4/5 + 8/10+
    - X5: solo si hay 5 jugadores distintos que cumplan HR fuerte
    """
    # Side-specific: OVERS y UNDERS separados.
    for side in ["OVER", "UNDER"]:
        elite = hr_ticket_pool(
            df,
            matchup=matchup,
            side=side,
            family="MAIN",
            min_hit_l5=5,
            min_hit_l10=9,
            min_price=1.20,
        )

        fuerte = hr_ticket_pool(
            df,
            matchup=matchup,
            side=side,
            family="MAIN",
            min_hit_l5=4,
            min_hit_l10=8,
            min_price=1.20,
        )

        add_hr_candidate_ticket(
            candidates,
            f"💎 HR {side} ELITE X2",
            elite,
            min_len=2,
            max_len=2,
            priority=180,
        )

        add_hr_candidate_ticket(
            candidates,
            f"🔥 HR {side} FUERTE X2",
            fuerte,
            min_len=2,
            max_len=2,
            priority=170,
        )

        add_hr_candidate_ticket(
            candidates,
            f"🧨 HR {side} FUERTE X5",
            fuerte,
            min_len=5,
            max_len=5,
            priority=150,
        )

        # Si no llega a X5, permite X3/X4 para no perder buen material por partido.
        add_hr_candidate_ticket(
            candidates,
            f"📊 HR {side} COMBO X{{n}}",
            fuerte,
            min_len=3,
            max_len=5,
            priority=130,
        )

    # Mixtos por partido: mezcla OVER/UNDER si del mismo partido no alcanza por lado.
    elite_mix = hr_ticket_pool(
        df,
        matchup=matchup,
        side=None,
        family="MAIN",
        min_hit_l5=5,
        min_hit_l10=9,
        min_price=1.20,
    )

    fuerte_mix = hr_ticket_pool(
        df,
        matchup=matchup,
        side=None,
        family="MAIN",
        min_hit_l5=4,
        min_hit_l10=8,
        min_price=1.20,
    )

    add_hr_candidate_ticket(
        candidates,
        "💎 HR MIX ELITE X2",
        elite_mix,
        min_len=2,
        max_len=2,
        priority=175,
    )

    add_hr_candidate_ticket(
        candidates,
        "🔥 HR MIX FUERTE X2",
        fuerte_mix,
        min_len=2,
        max_len=2,
        priority=165,
    )

    add_hr_candidate_ticket(
        candidates,
        "🧨 HR MIX FUERTE X5",
        fuerte_mix,
        min_len=5,
        max_len=5,
        priority=145,
    )

    add_hr_candidate_ticket(
        candidates,
        "📊 HR MIX COMBO X{n}",
        fuerte_mix,
        min_len=3,
        max_len=5,
        priority=125,
    )


def pool_tech_x2(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    """
    TECH X2: FGM/FGA/FG3A/FTM/FTA.
    Sin 3/5 + 6/10.
    """
    g = ticket_pool(df, matchup=matchup, side=side, family="TECH")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE", "BUENA", "RADAR"]))
        & (g["edge_score"] >= 0.90)
        & (g["price"] >= 1.30)
        & (
            ((g["hit_l5"] >= 3) & (g["hit_l10"] >= 7))
            | (g["hit_l5"] >= 4)
        )
    ].copy()


def pool_tech_value(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    g = ticket_pool(df, matchup=matchup, side=side, family="TECH")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE", "BUENA", "RADAR"]))
        & (g["edge_score"] >= 0.85)
        & (g["price"] >= 1.25)
        & (
            ((g["hit_l5"] >= 3) & (g["hit_l10"] >= 7))
            | (g["hit_l5"] >= 4)
        )
    ].copy()


def pool_q1_x2(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    """
    1Q X2. Sin 3/5 + 6/10.
    """
    g = ticket_pool(df, matchup=matchup, side=side, family="Q1")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE", "BUENA", "RADAR"]))
        & (g["edge_score"] >= 0.85)
        & (g["price"] >= 1.35)
        & (
            ((g["hit_l5"] >= 3) & (g["hit_l10"] >= 7))
            | (g["hit_l5"] >= 4)
        )
    ].copy()


def pool_q1_value(df: pd.DataFrame, matchup: Optional[str] = None, side: Optional[str] = None) -> pd.DataFrame:
    g = ticket_pool(df, matchup=matchup, side=side, family="Q1")
    return g[
        (g["quality"].isin(["JOYA", "EXCELENTE", "BUENA", "RADAR"]))
        & (g["edge_score"] >= 0.80)
        & (g["price"] >= 1.30)
        & (
            ((g["hit_l5"] >= 3) & (g["hit_l10"] >= 7))
            | (g["hit_l5"] >= 4)
        )
    ].copy()

def add_ticket_if_enough(tickets: list, name: str, rows: pd.DataFrame, min_len: int, max_len: int) -> None:
    """
    No genera singles. min_len debe ser 2 o más salvo que explícitamente quieras otra cosa.
    """
    picked = pick_unique(rows, max_len)
    if len(picked) >= min_len:
        tickets.append(make_ticket(name.replace("{n}", str(len(picked))), picked))


def build_global_tickets(df: pd.DataFrame, run_date: str) -> list[dict]:
    tickets = []

    # MAIN
    add_ticket_if_enough(tickets, "💎 FULL GAME FIJOS DEL DÍA X{n}", pool_main_principal(df), 2, 5)
    add_ticket_if_enough(tickets, "🔥 MAIN OVERS X{n}", pool_main_value(df, side="OVER"), 2, 5)
    add_ticket_if_enough(tickets, "🧊 MAIN UNDERS X{n}", pool_main_value(df, side="UNDER"), 2, 5)
    add_ticket_if_enough(tickets, "🤯 MAIN MEGA OVERS X{n}", pool_main_combo(df, side="OVER"), 8, 10)
    add_ticket_if_enough(tickets, "🥶 MAIN MEGA UNDERS X{n}", pool_main_combo(df, side="UNDER"), 8, 10)

    # TECH
    add_ticket_if_enough(tickets, "🎯 TÉCNICOS X2 DEL DÍA", pool_tech_x2(df), 2, 2)
    add_ticket_if_enough(tickets, "🎯 TÉCNICOS VALUE X{n}", pool_tech_value(df), 3, 5)
    add_ticket_if_enough(tickets, "🎯 TÉCNICOS AMPLIADA X{n}", pool_tech_value(df), 6, 10)

    # Q1
    add_ticket_if_enough(tickets, "⏱️ 1Q X2 DEL DÍA", pool_q1_x2(df), 2, 2)
    add_ticket_if_enough(tickets, "⏱️ 1Q VALUE X{n}", pool_q1_value(df), 3, 5)
    add_ticket_if_enough(tickets, "⏱️ 1Q AMPLIADA X{n}", pool_q1_value(df), 5, 8)

    # Mixta value global.
    mixed = pd.concat([
        pool_main_value(df),
        pool_tech_x2(df),
        pool_q1_x2(df),
    ], ignore_index=True)
    add_ticket_if_enough(tickets, "🧨 MIXTA VALUE DEL DÍA X{n}", mixed, 5, 5)

    # Radar global.
    radar = df[
        (df["quality"].isin(["BUENA", "RADAR"]))
        & (~df["micro_line_final"])
        & (df["line_min_ok"])
    ].copy()
    add_ticket_if_enough(tickets, "📊 RADAR GLOBAL X{n}", radar, 3, 10)

    # Micro-líneas, pero sin single.
    micro = df[(df["bucket"] == "MICRO_LINE") & (df["quality"] != "DESCARTAR")].copy()
    add_ticket_if_enough(tickets, "🧪 MICRO-LÍNEAS DEL DÍA X{n}", micro, 2, 8)

    if not tickets:
        return []

    return [{
        "matchup": f"🌎 GLOBAL — {run_date}",
        "guion": "MIX",
        "tickets": tickets,
    }]


def ticket_signature(ticket: dict) -> tuple:
    """
    Firma para evitar tickets idénticos dentro del mismo partido.
    """
    plays = ticket.get("plays", [])
    sig = []
    for p in plays:
        sig.append((
            p.get("player_id"),
            p.get("type"),
            p.get("prop"),
            float(p.get("line", 0)),
        ))
    return tuple(sorted(sig))


def add_candidate_ticket(
    candidates: list[dict],
    name: str,
    rows: pd.DataFrame,
    min_len: int,
    max_len: int,
    priority: int,
) -> None:
    """
    Agrega un ticket candidato. Nunca genera singles.
    """
    if min_len < 2:
        min_len = 2

    picked = pick_unique(rows, max_len)
    if len(picked) < min_len:
        return

    ticket = make_ticket(name.replace("{n}", str(len(picked))), picked)
    candidates.append({
        "priority": priority,
        "ticket": ticket,
        "signature": ticket_signature(ticket),
    })


def add_main_side_candidates(candidates: list[dict], df: pd.DataFrame, matchup: str, side: str) -> None:
    """
    FULL GAME por side:
    - PRINCIPAL X2: ultra estricto.
    - SECUNDARIO X2: estricto, intenta ser distinto del principal.
    - VALUE X2: moderado, puede reutilizar 1 jugador si no hay más material, pero nunca es idéntico.
    - COMBINADA/MEGA: menor prioridad.
    """
    label = "🏀 FULL GAME"

    principal_pool = pool_main_principal(df, matchup=matchup, side=side)
    secondary_pool = pool_main_secondary(df, matchup=matchup, side=side)
    value_pool = pool_main_value(df, matchup=matchup, side=side)
    combo_pool = pool_main_combo(df, matchup=matchup, side=side)

    principal = pick_unique(principal_pool, 2)
    principal_sig = None
    if len(principal) >= 2:
        ticket = make_ticket(f"💎 {label} {side} PRINCIPAL X2", principal)
        principal_sig = ticket_signature(ticket)
        candidates.append({"priority": 120, "ticket": ticket, "signature": principal_sig})

    # Secundario: primero intenta sin jugadores del principal.
    used_principal = set(principal["player_id"].tolist()) if len(principal) >= 2 else set()
    secundario = pick_unique(secondary_pool[~secondary_pool["player_id"].isin(used_principal)].copy(), 2)
    if len(secundario) < 2:
        # Si no alcanza, permite reutilizar, pero la firma evitará duplicado exacto.
        secundario = pick_unique(secondary_pool, 2)
    if len(secundario) >= 2:
        ticket = make_ticket(f"⭐ {label} {side} SECUNDARIO X2", secundario)
        if ticket_signature(ticket) != principal_sig:
            candidates.append({"priority": 108, "ticket": ticket, "signature": ticket_signature(ticket)})

    # Value: intenta no repetir los 2 del principal/secundario, pero no se queda sin ticket si hay poco material.
    used_strict = set()
    if len(principal) >= 2:
        used_strict.update(principal["player_id"].tolist())
    if len(secundario) >= 2:
        used_strict.update(secundario["player_id"].tolist())

    value_x2 = pick_unique(value_pool[~value_pool["player_id"].isin(used_strict)].copy(), 2)
    if len(value_x2) < 2:
        value_x2 = pick_unique(value_pool, 2)
    if len(value_x2) >= 2:
        ticket = make_ticket(f"🌟 {label} {side} VALUE X2", value_x2)
        candidates.append({"priority": 96, "ticket": ticket, "signature": ticket_signature(ticket)})

    combo = pick_unique(value_pool, 5)
    if len(combo) >= 5:
        ticket = make_ticket(f"🧨 {label} {side} COMBINADA X5", combo)
        candidates.append({"priority": 74, "ticket": ticket, "signature": ticket_signature(ticket)})
    elif len(combo) >= 3:
        ticket = make_ticket(f"🧨 {label} {side} COMBINADA X{len(combo)}", combo)
        candidates.append({"priority": 70, "ticket": ticket, "signature": ticket_signature(ticket)})

    mega = pick_unique(combo_pool, 10)
    if len(mega) >= 10:
        ticket = make_ticket(f"🤯 {label} {side} MEGA X10", mega)
        candidates.append({"priority": 18, "ticket": ticket, "signature": ticket_signature(ticket)})
    elif len(mega) >= 6:
        ticket = make_ticket(f"🎰 {label} {side} AMPLIADA X{len(mega)}", mega)
        candidates.append({"priority": 16, "ticket": ticket, "signature": ticket_signature(ticket)})

def add_tech_side_candidates(candidates: list[dict], df: pd.DataFrame, matchup: str, side: str) -> None:
    x2_pool = pool_tech_x2(df, matchup=matchup, side=side)
    value_pool = pool_tech_value(df, matchup=matchup, side=side)

    add_candidate_ticket(candidates, f"🎯 TÉCNICOS {side} X2", x2_pool, min_len=2, max_len=2, priority=68)

    # TECH value X2 con jugadores distintos si hay más material.
    first = pick_unique(x2_pool, 2)
    used = set(first["player_id"].tolist()) if len(first) >= 2 else set()
    add_candidate_ticket(
        candidates,
        f"🎯 TÉCNICOS {side} VALUE X2",
        value_pool[~value_pool["player_id"].isin(used)].copy(),
        min_len=2,
        max_len=2,
        priority=58,
    )

    value = pick_unique(value_pool, 5)
    if len(value) >= 5:
        ticket = make_ticket(f"🧨 TÉCNICOS {side} VALUE X5", value)
        candidates.append({"priority": 46, "ticket": ticket, "signature": ticket_signature(ticket)})
    elif len(value) >= 3:
        ticket = make_ticket(f"🧨 TÉCNICOS {side} VALUE X{len(value)}", value)
        candidates.append({"priority": 43, "ticket": ticket, "signature": ticket_signature(ticket)})

def add_q1_side_candidates(candidates: list[dict], df: pd.DataFrame, matchup: str, side: str) -> None:
    x2_pool = pool_q1_x2(df, matchup=matchup, side=side)
    value_pool = pool_q1_value(df, matchup=matchup, side=side)

    add_candidate_ticket(candidates, f"⏱️ 1Q {side} X2", x2_pool, min_len=2, max_len=2, priority=62)

    first = pick_unique(x2_pool, 2)
    used = set(first["player_id"].tolist()) if len(first) >= 2 else set()
    add_candidate_ticket(
        candidates,
        f"⏱️ 1Q {side} VALUE X2",
        value_pool[~value_pool["player_id"].isin(used)].copy(),
        min_len=2,
        max_len=2,
        priority=52,
    )

    value = pick_unique(value_pool, 5)
    if len(value) >= 5:
        ticket = make_ticket(f"🧨 1Q {side} VALUE X5", value)
        candidates.append({"priority": 40, "ticket": ticket, "signature": ticket_signature(ticket)})
    elif len(value) >= 3:
        ticket = make_ticket(f"🧨 1Q {side} VALUE X{len(value)}", value)
        candidates.append({"priority": 37, "ticket": ticket, "signature": ticket_signature(ticket)})

def select_matchup_tickets(candidates: list[dict], max_tickets: int = 8) -> list[dict]:
    """
    Selecciona tickets finales del partido.
    Prioridad: X2 > X5 > TECH/Q1 > Radar > Mega.
    Evita tickets idénticos.
    """
    ordered = sorted(candidates, key=lambda x: x["priority"], reverse=True)

    selected = []
    seen_signatures = set()

    for item in ordered:
        sig = item["signature"]
        if sig in seen_signatures:
            continue
        selected.append(item["ticket"])
        seen_signatures.add(sig)
        if len(selected) >= max_tickets:
            break

    return selected


def build_matchup_block(df: pd.DataFrame, matchup: str, run_date: str, max_tickets: int = 8) -> Optional[dict]:
    """
    Un solo bloque por partido, con tickets internos ordenados.
    """
    candidates = []

    # HR-FIRST por partido: arma tickets usando 4/5, 5/5 y 8/10+ sin depender de tracking/edge.
    add_hr_matchup_candidates(candidates, df, matchup)

    # Primero FULL GAME, porque es el corazón de Ludo.
    for side in ["OVER", "UNDER"]:
        add_main_side_candidates(candidates, df, matchup, side)

    # Luego técnicos: queremos que aparezcan si hay material, pero sin saturar.
    for side in ["OVER", "UNDER"]:
        add_tech_side_candidates(candidates, df, matchup, side)

    # Luego 1Q: también controlado.
    for side in ["OVER", "UNDER"]:
        add_q1_side_candidates(candidates, df, matchup, side)

    tickets = select_matchup_tickets(candidates, max_tickets=max_tickets)

    if not tickets:
        return None

    return {
        "pick_date": run_date,
        "game_date": run_date,
        "matchup": matchup,
        "guion": "MIX",
        "tickets": tickets,
    }


def build_tickets(df: pd.DataFrame, run_date: str, include_global: bool = False, max_tickets_per_matchup: int = 8) -> list[dict]:
    out = df.copy()
    tickets_json = []

    # Global queda apagado por defecto. Si se pide, se conserva para análisis.
    if include_global:
        tickets_json.extend(build_global_tickets(out, run_date))

    for matchup in sorted(out["matchup"].dropna().unique()):
        block = build_matchup_block(out, matchup, run_date, max_tickets=max_tickets_per_matchup)
        if block:
            tickets_json.append(block)

    return tickets_json


# ============================================================
# SAVE
# ============================================================

def count_tickets_in_blocks(tickets_json: list[dict]) -> int:
    total = 0
    if not isinstance(tickets_json, list):
        return 0
    for block in tickets_json:
        if not isinstance(block, dict):
            continue
        tickets = block.get("tickets", [])
        if isinstance(tickets, list):
            total += len(tickets)
    return total


def save_ludo_picks(
    engine,
    tickets_json: list[dict],
    dry_run: bool,
    run_id: str,
    run_date: str,
) -> None:
    OUT_JSON.write_text(json.dumps(tickets_json, ensure_ascii=False, indent=2), encoding="utf-8")

    total_tickets = count_tickets_in_blocks(tickets_json)

    if dry_run:
        print(f"🧪 DRY RUN: no se guarda en ludo_picks. Preview: {OUT_JSON.resolve()}")
        return

    # Barrera crítica: no insertar picks vacíos ni pisar picks anteriores.
    if not tickets_json or total_tickets <= 0:
        print(f"🛑 No hay tickets visibles para {run_date}. No se inserta ludo_picks.")
        print("   No se marcan picks anteriores como SUPERSEDED.")
        print(f"📄 Preview local vacío: {OUT_JSON.resolve()}")
        return

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE ludo_picks
                SET status = 'SUPERSEDED'
                WHERE pick_date = :pick_date
                  AND status = 'PENDING'
            """),
            {"pick_date": run_date},
        )
        conn.execute(
            text("""
                INSERT INTO ludo_picks (pick_date, run_id, json_data, status)
                VALUES (:pick_date, :run_id, CAST(:json_data AS jsonb), 'PENDING')
            """),
            {
                "pick_date": run_date,
                "run_id": run_id,
                "json_data": json.dumps(tickets_json, ensure_ascii=False),
            },
        )

    print(f"💾 ludo_picks insertado con historial | pick_date={run_date} | run_id={run_id}")
    print("♻️ Picks anteriores de la misma fecha marcados como SUPERSEDED")
    print(f"📄 Preview local: {OUT_JSON.resolve()}")


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Generador de picks Ludo v4.4")
    parser.add_argument("--run-id", default="", help="Run ID de ludo_prop_predictions. Si no se indica, usa el último.")
    parser.add_argument("--dry-run", action="store_true", help="No guarda en ludo_picks.")
    parser.add_argument("--top", type=int, default=60, help="Cantidad de picks a mostrar en terminal.")
    parser.add_argument("--include-global", action="store_true", help="Incluye bloque GLOBAL por fecha. Por defecto se oculta.")
    parser.add_argument("--max-tickets-per-matchup", type=int, default=8, help="Máximo de tickets por partido.")
    args = parser.parse_args()

    engine = get_engine()
    run_id = args.run_id.strip() or get_latest_run_id(engine)

    print("🎯 LUDO v4.4 — GENERADOR DE PICKS")
    print("=" * 72)
    print(f"🆔 run_id: {run_id}")

    preds = load_predictions(engine, run_id)
    run_date = get_run_date(preds)
    print(f"📅 fecha global: {run_date}")
    print(f"✅ Predicciones cargadas: {len(preds)}")

    player_ids = sorted(preds["player_id"].dropna().astype(int).unique().tolist())
    hist = load_history(engine, player_ids)
    print(f"✅ Historial cargado: {len(hist)} filas | {hist['player_id'].nunique() if not hist.empty else 0} jugadores")

    print("🧮 Calculando hit rates...")
    hr = preds.apply(lambda r: calc_hit_rate_for_row(r, hist), axis=1)
    df = pd.concat([preds, hr], axis=1)

    print("🔍 Clasificando calidad...")
    df = add_quality(df)

    before_dedupe = len(df)
    df = dedupe_alternatives(df)
    after_dedupe = len(df)
    print(f"🧹 Dedupe alternativas: {before_dedupe} → {after_dedupe} filas")

    before_visibility = int((df["quality"] != "DESCARTAR").sum())
    df = apply_visibility_filter(df)
    after_visibility = int((df["quality"] != "DESCARTAR").sum())
    print(f"🧯 Filtro visibilidad v4.4: {before_visibility} → {after_visibility} picks/radar visibles")

    audit_cols = [
        "run_id", "game_date", "player_name", "team_abbreviation", "matchup",
        "prop_type", "market_family", "side", "line", "price",
        "proj", "diff", "diff_abs", "edge_pct", "edge_score",
        "model_mae", "model_key", "min_l5", "candidate_basic",
        "micro_line_final", "line_min_ok", "consistency_joya",
        "hit_l5", "n_l5", "hit_l10", "n_l10", "hr_l5", "hr_l10",
        "hr_text", "quality", "bucket", "tracking_status",
    ]
    audit_cols = [c for c in audit_cols if c in df.columns]
    df[audit_cols].to_csv(OUT_CSV, index=False, encoding="utf-8")
    print(f"📄 Auditoría CSV: {OUT_CSV.resolve()}")

    resumen = (
        df.groupby(["market_family", "bucket", "quality"])
        .size()
        .reset_index(name="cantidad")
        .sort_values(["market_family", "bucket", "quality"], ascending=[True, True, True])
    )

    print("\n📊 Distribución:")
    print(resumen.to_string(index=False))

    selected = df[df["quality"] != "DESCARTAR"].copy()
    selected = sort_for_ticket(selected)

    print(f"\n✅ Picks/Radar seleccionados: {len(selected)} / {len(df)}")

    if not selected.empty:
        show_cols = [
            "quality", "bucket", "market_family", "game_date", "player_name", "team_abbreviation",
            "prop_type", "side", "line", "price", "proj", "diff", "edge_score",
            "hr_text", "consistency_joya", "model_key", "tracking_status",
        ]
        show_cols = [c for c in show_cols if c in selected.columns]

        display = selected[show_cols].head(args.top).copy()
        for c in ["line", "price", "proj", "diff", "edge_score"]:
            if c in display.columns:
                display[c] = pd.to_numeric(display[c], errors="coerce").round(2)

        print(f"\n🏆 Top {min(args.top, len(selected))}:")
        print(display.to_string(index=False))

    # ============================================================
    # Generar y guardar PICKS por fecha real de partido.
    # ============================================================
    if "game_date" in df.columns:
        df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce").dt.date
    else:
        df["game_date"] = pd.to_datetime(run_date, errors="coerce").date()

    if df["game_date"].isna().any():
        fallback_date = pd.to_datetime(run_date, errors="coerce").date()
        df["game_date"] = df["game_date"].fillna(fallback_date)

    game_dates = sorted(df["game_date"].dropna().unique())

    print("\n📅 Fechas de partido detectadas para picks:")
    for gd in game_dates:
        day_df = df[df["game_date"] == gd]
        print(f"   {gd} | filas={len(day_df)} | partidos={day_df['matchup'].nunique()}")

    all_preview = {}
    grand_total_tickets = 0
    grand_total_blocks = 0

    for gd in game_dates:
        gd_str = str(gd)
        df_day = df[df["game_date"] == gd].copy()

        tickets_json = build_tickets(
            df_day,
            run_date=gd_str,
            include_global=args.include_global,
            max_tickets_per_matchup=args.max_tickets_per_matchup,
        )

        total_tickets = sum(len(b["tickets"]) for b in tickets_json)
        grand_total_tickets += total_tickets
        grand_total_blocks += len(tickets_json)
        all_preview[gd_str] = tickets_json

        print(f"\n🎫 {gd_str} | Tickets generados: {total_tickets} bloques={len(tickets_json)}")

        if tickets_json:
            print("🧾 Resumen tickets:")
            for block in tickets_json:
                print(f"   {block['matchup']} | tickets={len(block['tickets'])}")
                for t in block["tickets"][:8]:
                    print(f"      - {t['name']} | picks={len(t['plays'])} | cuota={t['total_odds']}")

        save_ludo_picks(
            engine,
            tickets_json,
            dry_run=args.dry_run,
            run_id=run_id,
            run_date=gd_str,
        )

    # Preview combinado local por fecha.
    OUT_JSON.write_text(
        json.dumps(all_preview, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\n📦 Total general: {grand_total_tickets} tickets | {grand_total_blocks} bloques | fechas={len(game_dates)}")
    print("\n✅ Proceso terminado.")


if __name__ == "__main__":
    main()