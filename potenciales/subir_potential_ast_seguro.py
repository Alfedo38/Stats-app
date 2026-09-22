#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
subir_potential_ast_completo.py

Cruza un CSV maestro de logs NBA contra un CSV scrapeado de asistencias potenciales
(POTENTIAL_AST), genera archivos de control y, opcionalmente, actualiza Postgres/Supabase.

Uso recomendado, primero SIN tocar la DB:

  python3 subir_potential_ast_completo.py \
    --logs player_game_log.csv \
    --potenciales asistencias_potenciales_nba_2025_26.csv \
    --fecha-format "%m/%d/%Y"

Luego, si el resumen está bien, subir a Supabase/Postgres:

  DATABASE_URL="postgresql://..." python3 subir_potential_ast_completo.py \
    --logs player_game_log.csv \
    --potenciales asistencias_potenciales_nba_2025_26.csv \
    --fecha-format "%m/%d/%Y" \
    --schema nba_api_data \
    --table player_game_logs_v2 \
    --upload-db

Por defecto:
- Solo rellena potential_ast cuando en la base/log está NULL o 0.
- NO sube ni aplica potential_ast_new = 0, para no confundir "sin dato" con "cero real".
- No pisa valores existentes no-cero, salvo que uses --overwrite-existing.

Opciones útiles:
- --allow-zero: permite aplicar ceros reales del CSV nuevo.
- --overwrite-existing: pisa también valores existentes no-cero.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import unicodedata
from typing import Iterable, Optional

import numpy as np
import pandas as pd


# ============================================================
# Helpers generales
# ============================================================

def norm_col(col: str) -> str:
    """Normaliza nombres de columnas para encontrarlas aunque cambien mayúsculas/guiones."""
    return re.sub(r"[^a-z0-9]+", "_", str(col).strip().lower()).strip("_")


def find_col(
    df: pd.DataFrame,
    candidates: Iterable[str],
    required: bool = True,
    label: str = "",
) -> Optional[str]:
    """Busca una columna por varios nombres posibles."""
    normalized = {norm_col(c): c for c in df.columns}
    for cand in candidates:
        key = norm_col(cand)
        if key in normalized:
            return normalized[key]

    if required:
        raise ValueError(
            f"No encontré la columna requerida {label or list(candidates)}. "
            f"Columnas disponibles: {list(df.columns)}"
        )
    return None


def normalize_name(value) -> str:
    """Normaliza nombres de jugadores para cruces por texto."""
    if pd.isna(value):
        return ""
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace(".", "")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_game_id(series: pd.Series) -> pd.Series:
    """
    Normaliza GAME_ID quitando .0 y ceros a la izquierda.
    Ej: 0042500175, 42500175 y 42500175.0 terminan como 42500175.
    """
    return (
        series.astype(str)
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
        .str.lstrip("0")
        .replace("", np.nan)
    )


def parse_dates(series: pd.Series, fecha_format: Optional[str], column_name: str) -> pd.Series:
    """Parsea fechas y falla si encuentra valores no interpretables."""
    if fecha_format:
        parsed = pd.to_datetime(series, format=fecha_format, errors="coerce")
    else:
        parsed = pd.to_datetime(series, errors="coerce")

    bad = parsed.isna() & series.notna()
    if bad.any():
        examples = series[bad].astype(str).head(8).tolist()
        raise ValueError(
            f"No pude parsear algunas fechas de {column_name}: {examples}. "
            f"Probá pasando --fecha-format, por ejemplo: --fecha-format '%m/%d/%Y'"
        )
    return parsed.dt.date


def read_csv_smart(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        raise FileNotFoundError(f"No existe el archivo: {path}")
    return pd.read_csv(path, low_memory=False)


# ============================================================
# Cruce y preparación de updates
# ============================================================

def choose_match_keys(logs: pd.DataFrame, pot: pd.DataFrame):
    """
    Elige la mejor clave disponible para cruzar.

    Prioridad:
    1) game_id + player_id
    2) game_date + player_id
    3) game_date + player_name + team
    4) game_date + player_name
    """
    has_game = "game_id_key" in logs.columns and "game_id_key" in pot.columns
    has_pid = "player_id_key" in logs.columns and "player_id_key" in pot.columns
    has_team = "team_key" in logs.columns and "team_key" in pot.columns

    if has_game and has_pid:
        return ["game_id_key", "player_id_key"], "game_id + player_id"
    if has_pid:
        return ["game_date_key", "player_id_key"], "game_date + player_id"
    if has_team:
        return ["game_date_key", "player_key", "team_key"], "game_date + player_name + team"
    return ["game_date_key", "player_key"], "game_date + player_name"


def prepare_dataframes(args):
    print("📥 Cargando archivos...")
    logs = read_csv_smart(args.logs)
    pot = read_csv_smart(args.potenciales)

    # Columnas del CSV maestro/export de DB
    log_player = find_col(logs, ["player_name", "PLAYER_NAME"], True, "player_name")
    log_date = find_col(logs, ["game_date", "GAME_DATE", "date"], True, "game_date")
    log_past = find_col(logs, ["potential_ast", "POTENTIAL_AST"], True, "potential_ast")
    log_pid = find_col(logs, ["player_id", "PLAYER_ID"], False)
    log_gid = find_col(logs, ["game_id", "GAME_ID"], False)
    log_team = find_col(logs, ["team_abbreviation", "TEAM_ABBREVIATION", "team", "TEAM"], False)

    # Columnas del CSV scrapeado
    pot_player = find_col(pot, ["PLAYER_NAME", "player_name", "name", "Jugador", "jugador"], True, "PLAYER_NAME")
    pot_date = find_col(pot, ["FECHA", "fecha", "GAME_DATE", "game_date", "date"], True, "FECHA/game_date")
    pot_past = find_col(
        pot,
        ["POTENTIAL_AST", "potential_ast", "potential_assists", "ast_potenciales", "asistencias_potenciales"],
        True,
        "POTENTIAL_AST",
    )
    pot_pid = find_col(pot, ["PLAYER_ID", "player_id"], False)
    pot_gid = find_col(pot, ["GAME_ID", "game_id"], False)
    pot_team = find_col(pot, ["TEAM_ABBREVIATION", "team_abbreviation", "TEAM", "team"], False)

    print("🧼 Normalizando fechas, nombres y claves...")
    logs = logs.copy()
    pot = pot.copy()

    logs["game_date_key"] = parse_dates(logs[log_date], None, log_date)
    pot["game_date_key"] = parse_dates(pot[pot_date], args.fecha_format, pot_date)

    logs["player_key"] = logs[log_player].map(normalize_name)
    pot["player_key"] = pot[pot_player].map(normalize_name)

    if log_pid and pot_pid:
        logs["player_id_key"] = pd.to_numeric(logs[log_pid], errors="coerce").astype("Int64")
        pot["player_id_key"] = pd.to_numeric(pot[pot_pid], errors="coerce").astype("Int64")

    if log_gid and pot_gid:
        logs["game_id_key"] = normalize_game_id(logs[log_gid])
        pot["game_id_key"] = normalize_game_id(pot[pot_gid])

    if log_team and pot_team:
        logs["team_key"] = logs[log_team].astype(str).str.upper().str.strip()
        pot["team_key"] = pot[pot_team].astype(str).str.upper().str.strip()

    pot["potential_ast_new"] = pd.to_numeric(pot[pot_past], errors="coerce")
    logs["potential_ast_old"] = pd.to_numeric(logs[log_past], errors="coerce")

    meta = {
        "log_player": log_player,
        "log_date": log_date,
        "log_past": log_past,
        "log_pid": log_pid,
        "log_gid": log_gid,
        "log_team": log_team,
    }
    return logs, pot, meta


def build_updates(args) -> pd.DataFrame:
    logs, pot, meta = prepare_dataframes(args)

    keys, key_label = choose_match_keys(logs, pot)
    print(f"🔑 Cruce elegido: {key_label}")

    before = len(pot)
    pot = pot.dropna(subset=["potential_ast_new"])
    if len(pot) != before:
        print(f"⚠️ Filas del CSV nuevo sin potential_ast válido descartadas: {before - len(pot):,}")

    if not args.allow_zero:
        zeros = int((pot["potential_ast_new"] <= 0).sum())
        pot = pot[pot["potential_ast_new"] > 0].copy()
        if zeros:
            print(f"🧹 Filas con potential_ast_new <= 0 descartadas: {zeros:,}")

    dup_count = int(pot.duplicated(keys, keep=False).sum())
    if dup_count:
        print(f"⚠️ Duplicados en CSV nuevo por {key_label}: {dup_count:,}. Se consolida tomando el valor máximo.")

    pot_dedup = (
        pot.groupby(keys, dropna=False, as_index=False)
        .agg(potential_ast_new=("potential_ast_new", "max"))
    )

    print("🔀 Cruzando contra player_game_log...")
    merged = logs.merge(
        pot_dedup[keys + ["potential_ast_new"]],
        on=keys,
        how="left",
        validate="m:1",
    )

    matched = merged["potential_ast_new"].notna()
    old = merged["potential_ast_old"]
    new = merged["potential_ast_new"]

    if args.overwrite_existing:
        eligible = matched
        modo = "pisar cualquier valor existente si el valor nuevo es distinto"
    else:
        eligible = matched & (old.isna() | old.eq(0))
        modo = "rellenar solo NULL o 0"

    changed = eligible & (
        old.isna()
        | (~np.isclose(old.fillna(-999999).astype(float), new.fillna(-999999).astype(float)))
    )

    merged[meta["log_past"]] = np.where(changed, new, merged[meta["log_past"]])

    # Reporte de cobertura del CSV nuevo contra logs
    log_keys_unique = logs[keys].drop_duplicates()
    pot_check = pot_dedup.merge(log_keys_unique, on=keys, how="left", indicator=True)
    unmatched_pot = pot_check[pot_check["_merge"].eq("left_only")].drop(columns=["_merge"])

    # CSV maestro actualizado, sin columnas temporales
    temp_cols = [
        c for c in merged.columns
        if c.endswith("_key") or c in ("potential_ast_old", "potential_ast_new")
    ]
    output_df = merged.drop(columns=[c for c in temp_cols if c in merged.columns])
    output_df.to_csv(args.output, index=False)

    # CSV chico de updates reales para auditar/subir DB
    base_update_cols = []
    for c in [meta["log_gid"], meta["log_pid"], meta["log_date"], meta["log_player"], meta["log_team"]]:
        if c and c not in base_update_cols:
            base_update_cols.append(c)

    updates = merged.loc[changed, base_update_cols + ["potential_ast_old", "potential_ast_new"]].copy()

    rename_updates = {}
    if meta["log_gid"]:
        rename_updates[meta["log_gid"]] = "game_id"
    if meta["log_pid"]:
        rename_updates[meta["log_pid"]] = "player_id"
    if meta["log_date"]:
        rename_updates[meta["log_date"]] = "game_date"
    if meta["log_player"]:
        rename_updates[meta["log_player"]] = "player_name"
    if meta["log_team"]:
        rename_updates[meta["log_team"]] = "team_abbreviation"
    updates = updates.rename(columns=rename_updates)

    # Fallback de claves normalizadas si faltan columnas originales
    if "game_id" not in updates.columns and "game_id_key" in merged.columns:
        updates["game_id"] = merged.loc[changed, "game_id_key"].values
    if "player_id" not in updates.columns and "player_id_key" in merged.columns:
        updates["player_id"] = merged.loc[changed, "player_id_key"].values
    if "game_date" not in updates.columns:
        updates["game_date"] = merged.loc[changed, "game_date_key"].astype(str).values

    front = [c for c in ["game_id", "player_id", "game_date", "player_name", "team_abbreviation"] if c in updates.columns]
    rest = [c for c in updates.columns if c not in front]
    updates = updates[front + rest]
    updates.to_csv(args.updates_csv, index=False)

    if len(unmatched_pot):
        unmatched_pot.to_csv(args.unmatched_csv, index=False)
        unmatched_path = args.unmatched_csv
    else:
        unmatched_path = None

    print("\n📊 RESUMEN")
    print(f"Modo actualización: {modo}")
    print(f"Permitir potential_ast_new = 0: {'sí' if args.allow_zero else 'no'}")
    print(f"Filas en logs: {len(logs):,}")
    print(f"Filas nuevas potenciales limpias: {len(pot_dedup):,}")
    print(f"Matches contra logs: {int(matched.sum()):,}")
    print(f"Filas que cambian potential_ast: {int(changed.sum()):,}")
    print(f"Archivo actualizado: {args.output}")
    print(f"Archivo solo updates DB: {args.updates_csv}")
    if unmatched_path:
        print(f"⚠️ Nuevas filas sin match guardadas en: {unmatched_path}")

    return updates


# ============================================================
# Upload a Postgres/Supabase
# ============================================================

def upload_postgres(args, updates: pd.DataFrame):
    if updates.empty:
        print("ℹ️ No hay updates para subir a DB.")
        return

    missing = [c for c in ["game_id", "player_id", "game_date", "potential_ast_new"] if c not in updates.columns]
    if missing:
        raise ValueError(f"No puedo subir a DB: faltan columnas en updates: {missing}")

    database_url = args.database_url or os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("Falta DATABASE_URL. Pasalo por env o con --database-url.")

    try:
        import psycopg2
        from psycopg2 import sql
    except ImportError as e:
        raise ImportError("Falta psycopg2. Instalalo con: pip install psycopg2-binary") from e

    upload_df = updates[["game_id", "player_id", "game_date", "potential_ast_new"]].copy()
    upload_df["game_id"] = normalize_game_id(upload_df["game_id"])
    upload_df["player_id"] = pd.to_numeric(upload_df["player_id"], errors="coerce").astype("Int64")
    upload_df["game_date"] = pd.to_datetime(upload_df["game_date"], errors="coerce").dt.date
    upload_df["potential_ast_new"] = pd.to_numeric(upload_df["potential_ast_new"], errors="coerce")
    upload_df = upload_df.dropna(subset=["game_id", "player_id", "game_date", "potential_ast_new"])

    if not args.allow_zero:
        before = len(upload_df)
        upload_df = upload_df[upload_df["potential_ast_new"] > 0].copy()
        skipped = before - len(upload_df)
        if skipped:
            print(f"🧹 Updates DB con potential_ast_new <= 0 omitidos: {skipped:,}")

    if upload_df.empty:
        print("ℹ️ Después de limpiar, no quedan filas válidas para subir a DB.")
        return

    buf = io.StringIO()
    upload_df.to_csv(buf, index=False, header=False)
    buf.seek(0)

    overwrite_condition = sql.SQL("")
    if not args.overwrite_existing:
        overwrite_condition = sql.SQL("AND (t.potential_ast IS NULL OR t.potential_ast = 0)")

    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TEMP TABLE tmp_potential_ast_update (
                    game_id TEXT,
                    player_id BIGINT,
                    game_date DATE,
                    potential_ast NUMERIC
                ) ON COMMIT DROP;
            """)
            cur.copy_expert(
                "COPY tmp_potential_ast_update (game_id, player_id, game_date, potential_ast) FROM STDIN WITH CSV",
                buf,
            )

            query = sql.SQL("""
                UPDATE {schema}.{table} AS t
                SET potential_ast = u.potential_ast
                FROM tmp_potential_ast_update AS u
                WHERE regexp_replace(t.game_id::text, '^0+', '') = u.game_id
                  AND t.player_id::bigint = u.player_id
                  AND t.game_date::date = u.game_date
                  AND t.potential_ast IS DISTINCT FROM u.potential_ast
                  {overwrite_condition}
            """).format(
                schema=sql.Identifier(args.schema),
                table=sql.Identifier(args.table),
                overwrite_condition=overwrite_condition,
            )
            cur.execute(query)
            print(f"✅ DB actualizada. Filas impactadas en {args.schema}.{args.table}: {cur.rowcount:,}")


def main():
    parser = argparse.ArgumentParser(
        description="Cruza y sube asistencias potenciales NBA a player_game_logs/player_game_logs_v2."
    )
    parser.add_argument("--logs", default="player_game_log.csv", help="CSV maestro/export de player_game_logs.")
    parser.add_argument(
        "--potenciales",
        default="asistencias_potenciales_nba_2025_26.csv",
        help="CSV nuevo scrapeado con FECHA, PLAYER_NAME y POTENTIAL_AST.",
    )
    parser.add_argument(
        "--fecha-format",
        default=None,
        help='Formato de fecha del CSV nuevo. Ej: "%m/%d/%Y" para 05/10/2026.',
    )
    parser.add_argument("--output", default="player_game_log_ACTUALIZADO.csv")
    parser.add_argument("--updates-csv", default="potential_ast_updates.csv")
    parser.add_argument("--unmatched-csv", default="potential_ast_sin_match.csv")
    parser.add_argument(
        "--overwrite-existing",
        action="store_true",
        help="También pisa valores existentes no-cero si el CSV nuevo trae otro valor.",
    )
    parser.add_argument(
        "--allow-zero",
        action="store_true",
        help="Permite aplicar potential_ast_new = 0. Por defecto se descartan ceros.",
    )
    parser.add_argument("--upload-db", action="store_true", help="Además de generar CSVs, actualiza Postgres/Supabase.")
    parser.add_argument("--database-url", default=None, help="Connection string Postgres/Supabase. También puede venir por DATABASE_URL.")
    parser.add_argument("--schema", default="nba_api_data")
    parser.add_argument("--table", default="player_game_logs_v2")
    args = parser.parse_args()

    updates = build_updates(args)
    if args.upload_db:
        upload_postgres(args, updates)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n❌ ERROR: {exc}", file=sys.stderr)
        sys.exit(1)