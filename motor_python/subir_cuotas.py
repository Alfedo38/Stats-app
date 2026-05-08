#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
subir_cuotas.py — Ludo v2.2

Objetivo:
- Leer CSVs de cuotas_procesadas/.
- Normalizar mercados de Stake.
- Guardar event_date desde Fecha_Partido.
- Convertir fechas/horarios a Argentina (-03) cuando corresponda.
- Subir cuotas a player_odds de forma segura usando staging.
- No borrar el CSV: moverlo a cuotas_procesadas/subidas/.
- Evitar contaminar player_odds con CSVs equivocados.

Uso:
    python3 subir_cuotas.py
    python3 subir_cuotas.py --file cuotas_procesadas/lineas_nba_20260507_1127.csv
    python3 subir_cuotas.py --file cuotas_procesadas/subidas/lineas_nba_20260507_1127.csv --no-archive
    python3 subir_cuotas.py --dry-run
    python3 subir_cuotas.py --event-date 2026-05-07 --dry-run
    python3 subir_cuotas.py --source-tz UTC --dry-run
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


# ============================================================
# CONFIG
# ============================================================

load_dotenv()

INPUT_DIR = Path("cuotas_procesadas")
ARCHIVE_DIR = INPUT_DIR / "subidas"
CSV_PATTERN = "lineas_nba_*.csv"

PLAYER_ODDS_TABLE = "player_odds"
STAGING_TABLE = "player_odds_staging"
DEFAULT_TARGET_TZ = "America/Argentina/Buenos_Aires"


def get_engine():
    password = os.getenv("DB_PASSWORD")
    if not password:
        raise RuntimeError("Falta DB_PASSWORD en el archivo .env")

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
# NORMALIZACIÓN
# ============================================================

def clean_text(value) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def normalize_key(value) -> str:
    s = clean_text(value).upper()

    s = s.replace("&", " AND ")
    s = s.replace("-", " ")
    s = s.replace("_", " ")
    s = re.sub(r"\s+", " ", s).strip()

    s = re.sub(r"\s+AND\s+", "+", s)
    s = re.sub(r"\s*\+\s*", "+", s)
    s = s.replace(" ", "")

    return s


def normalizar_mercado(stat_raw) -> Optional[str]:
    key = normalize_key(stat_raw)

    if not key:
        return None

    blocked_fragments = [
        "STEAL", "STEALS",
        "BLOCK", "BLOCKS",
        "PERSONALFOUL", "PERSONALFOULS",
        "FIRSTSCORER",
        "DOUBLEDOUBLE",
        "TRIPLEDOUBLE",
        "DD",
        "TD",
        "TURNOVER",
        "TURNOVERS",
    ]

    if any(fragment in key for fragment in blocked_fragments):
        return None

    is_q1 = (
        "Q1" in key
        or "1STQUARTER" in key
        or "FIRSTQUARTER" in key
    )

    if is_q1:
        if "POINT" in key:
            return "Q1_PTS"
        if "REBOUND" in key:
            return "Q1_REB"
        if "ASSIST" in key:
            return "Q1_AST"
        return None

    is_h1 = (
        "H1" in key
        or "1STHALF" in key
        or "FIRSTHALF" in key
    )
    if is_h1:
        return None

    mapping = {
        "PTS": "PTS",
        "POINT": "PTS",
        "POINTS": "PTS",

        "REB": "REB",
        "REBOUND": "REB",
        "REBOUNDS": "REB",

        "AST": "AST",
        "ASSIST": "AST",
        "ASSISTS": "AST",

        "3PT": "3PT",
        "THREESMADE": "3PT",
        "THREEMADE": "3PT",
        "THREEPOINTERSMADE": "3PT",
        "3POINTERSMADE": "3PT",
        "3POINTSMADE": "3PT",

        "PRA": "PRA",
        "POINTS+ASSISTS+REBOUNDS": "PRA",
        "POINTS+REBOUNDS+ASSISTS": "PRA",

        "PR": "PR",
        "POINTS+REBOUNDS": "PR",

        "PA": "PA",
        "POINTS+ASSISTS": "PA",

        "RA": "RA",
        "ASSISTS+REBOUNDS": "RA",
        "REBOUNDS+ASSISTS": "RA",

        "FGM": "FGM",
        "FGMADE": "FGM",
        "FIELDGOALSMADE": "FGM",
        "FIELDGOALMADE": "FGM",

        "FGA": "FGA",
        "FGATTEMPTED": "FGA",
        "FGATTEMPTS": "FGA",
        "FIELDGOALSATTEMPTED": "FGA",
        "FIELDGOALATTEMPTED": "FGA",
        "FIELDGOALATTEMPTS": "FGA",

        "FG3A": "FG3A",
        "THREEATTEMPTED": "FG3A",
        "THREEATTEMPTS": "FG3A",
        "THREEPOINTERSATTEMPTED": "FG3A",
        "THREEPOINTERATTEMPTED": "FG3A",
        "3PTATTEMPTED": "FG3A",
        "3PTATTEMPTS": "FG3A",
        "3POINTERSATTEMPTED": "FG3A",

        "FTM": "FTM",
        "FTMADE": "FTM",
        "FREETHROWSMADE": "FTM",
        "FREETHROWMADE": "FTM",

        "FTA": "FTA",
        "FTATTEMPTED": "FTA",
        "FTATTEMPTS": "FTA",
        "FREETHROWSATTEMPTED": "FTA",
        "FREETHROWATTEMPTED": "FTA",
        "FREETHROWATTEMPTS": "FTA",
    }

    return mapping.get(key)


def normalizar_matchup(partido_raw) -> str:
    partido = clean_text(partido_raw)

    if " @ " in partido:
        return partido

    if " - " in partido:
        return partido.replace(" - ", " @ ")

    return partido


def _has_time_component(raw: pd.Series) -> bool:
    joined = " ".join(raw.dropna().astype(str).head(50).tolist())
    return bool(re.search(r"\d{1,2}:\d{2}|T\d{1,2}:\d{2}", joined))


def _has_explicit_timezone(raw: pd.Series) -> bool:
    joined = " ".join(raw.dropna().astype(str).head(50).tolist()).upper()
    return bool(re.search(r"\bUTC\b|\bGMT\b|Z\b|[+-]\d{2}:?\d{2}\b", joined))


def _parse_datetime_best_effort(raw: pd.Series, dayfirst: bool = False) -> pd.Series:
    parsed = pd.to_datetime(raw, errors="coerce", dayfirst=dayfirst)

    if parsed.isna().mean() > 0.5:
        extracted = raw.str.extract(
            r"(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            expand=False,
        )
        parsed = pd.to_datetime(extracted, errors="coerce", dayfirst=dayfirst)

    return parsed


def parse_event_date_column(
    df: pd.DataFrame,
    forced_event_date: str = "",
    source_tz: str = "auto",
    target_tz: str = DEFAULT_TARGET_TZ,
) -> pd.Series:
    """
    Devuelve event_date agrupado por día local de Argentina.

    Reglas:
    - Si --event-date está presente, usa esa fecha para todas las filas.
    - Si Fecha_Partido trae timezone explícito, convierte a target_tz.
    - Si --source-tz UTC u otro IANA está presente, interpreta fechas con hora como origen y convierte.
    - Si Fecha_Partido es solo fecha o fecha/hora local sin timezone, conserva la fecha tal cual.

    Nota: si el CSV tiene solo '2026-05-08' sin hora, no hay forma segura de saber
    si en Argentina era 2026-05-07. Para eso el scraper debe guardar hora, o usar
    --event-date si el archivo contiene una sola fecha real.
    """
    if forced_event_date:
        forced = pd.to_datetime(forced_event_date, errors="coerce")
        if pd.isna(forced):
            raise ValueError(f"--event-date inválido: {forced_event_date}. Usá formato YYYY-MM-DD.")
        return pd.Series([forced.date()] * len(df), index=df.index)

    if "Fecha_Partido" not in df.columns:
        raise ValueError("El CSV no tiene columna Fecha_Partido y no pasaste --event-date.")

    raw = df["Fecha_Partido"].apply(clean_text)
    target_zone = ZoneInfo(target_tz)

    has_time = _has_time_component(raw)
    has_tz = _has_explicit_timezone(raw)
    source_tz_norm = (source_tz or "auto").strip()

    if has_tz or source_tz_norm.lower() != "auto":
        if has_tz:
            parsed_utc = pd.to_datetime(raw, errors="coerce", utc=True)
            if parsed_utc.isna().mean() > 0.5:
                parsed_utc = pd.to_datetime(raw, errors="coerce", utc=True, dayfirst=True)
        else:
            parsed = _parse_datetime_best_effort(raw, dayfirst=False)
            if parsed.isna().mean() > 0.5:
                parsed = _parse_datetime_best_effort(raw, dayfirst=True)

            # Si no hay hora, no hacemos shift de medianoche porque puede mover fechas mal.
            if not has_time:
                return parsed.dt.date

            if source_tz_norm.upper() in {"UTC", "Z"}:
                source_zone = ZoneInfo("UTC")
            else:
                source_zone = ZoneInfo(source_tz_norm)

            parsed_utc = parsed.dt.tz_localize(source_zone).dt.tz_convert("UTC")

        local_dt = parsed_utc.dt.tz_convert(target_zone)
        return local_dt.dt.date

    parsed = _parse_datetime_best_effort(raw, dayfirst=False)
    if parsed.isna().mean() > 0.5:
        parsed = _parse_datetime_best_effort(raw, dayfirst=True)

    return parsed.dt.date


# ============================================================
# CARGA Y VALIDACIÓN CSV
# ============================================================

def elegir_csv(input_dir: Path, explicit_file: Optional[str]) -> Path:
    if explicit_file:
        p = Path(explicit_file)
        if not p.exists():
            raise FileNotFoundError(f"No existe el archivo indicado: {p}")
        return p

    archivos = sorted(
        input_dir.glob(CSV_PATTERN),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not archivos:
        raise FileNotFoundError(
            f"No encontré CSVs con patrón {CSV_PATTERN} en {input_dir.resolve()}"
        )

    return archivos[0]


def validar_columnas(df: pd.DataFrame) -> None:
    requeridas = {
        "Fecha_Partido",
        "Partido",
        "Jugador",
        "Equipo",
        "Stat",
        "Linea",
        "Over",
        "Under",
    }

    faltantes = sorted(requeridas - set(df.columns))
    if faltantes:
        raise ValueError(f"Faltan columnas requeridas en el CSV: {faltantes}")


def preparar_cuotas(
    path_csv: Path,
    forced_event_date: str = "",
    source_tz: str = "auto",
    target_tz: str = DEFAULT_TARGET_TZ,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    print(f"📥 Leyendo cuotas desde: {path_csv}")

    df_raw = pd.read_csv(path_csv)
    validar_columnas(df_raw)

    df = df_raw.copy()

    print(f"🌎 Timezone destino para event_date: {target_tz}")
    if source_tz and source_tz.lower() != "auto":
        print(f"🕒 Timezone origen forzado: {source_tz}")
    else:
        print("🕒 Timezone origen: auto")

    df["event_date"] = parse_event_date_column(
        df,
        forced_event_date=forced_event_date,
        source_tz=source_tz,
        target_tz=target_tz,
    )
    df["prop_type"] = df["Stat"].apply(normalizar_mercado)

    df["player_name"] = df["Jugador"].apply(clean_text)
    df["matchup"] = df["Partido"].apply(normalizar_matchup)

    df["line"] = pd.to_numeric(df["Linea"], errors="coerce")
    df["over_price"] = pd.to_numeric(df["Over"], errors="coerce")
    df["under_price"] = pd.to_numeric(df["Under"], errors="coerce")

    print("\n📅 Fechas detectadas:")
    fechas = (
        df["event_date"]
        .astype("string")
        .fillna("NULL")
        .value_counts()
        .sort_index()
    )
    for fecha, cant in fechas.items():
        print(f"   {str(fecha).ljust(12)} {cant}")

    null_dates = int(df["event_date"].isna().sum())
    if null_dates > 0:
        print(f"\n⚠️ Filas con event_date NULL: {null_dates}. Se descartarán.")
        print("   Tip: si la fecha no se parsea, usá --event-date YYYY-MM-DD")

    df_descartadas = df[df["prop_type"].isna()].copy()

    df_valid = df[df["prop_type"].notna()].copy()

    df_valid = df_valid[
        df_valid["event_date"].notna()
        & (df_valid["player_name"] != "")
        & (df_valid["matchup"] != "")
        & df_valid["line"].notna()
        & df_valid["over_price"].notna()
        & df_valid["under_price"].notna()
        & (df_valid["over_price"] > 1)
        & (df_valid["under_price"] > 1)
    ].copy()

    df_final = df_valid[
        [
            "event_date",
            "player_name",
            "prop_type",
            "matchup",
            "line",
            "over_price",
            "under_price",
        ]
    ].copy()

    antes_dedup = len(df_final)
    df_final = df_final.drop_duplicates(
        subset=["event_date", "player_name", "prop_type", "matchup", "line"],
        keep="last",
    ).reset_index(drop=True)

    print("\n📊 Resumen CSV:")
    print(f"   Filas crudas:        {len(df_raw)}")
    print(f"   Modelables:          {len(df_valid)}")
    print(f"   Descartadas mercado: {len(df_descartadas)}")
    print(f"   Duplicados quitados: {antes_dedup - len(df_final)}")
    print(f"   Final a subir:       {len(df_final)}")

    if not df_descartadas.empty:
        print("\n🚫 Mercados descartados:")
        descartes = (
            df_descartadas["Stat"]
            .fillna("VACÍO")
            .value_counts()
            .head(20)
        )
        for stat, cant in descartes.items():
            print(f"   {str(stat).ljust(35)} {cant}")

    if df_final.empty:
        raise RuntimeError("Después de limpiar, no quedó ninguna cuota válida para subir.")

    print("\n📌 Distribución modelable:")
    resumen = df_final["prop_type"].value_counts().sort_index()
    for prop, cant in resumen.items():
        print(f"   {prop.ljust(8)} {cant}")

    print("\n📅 Distribución final por fecha:")
    resumen_fechas = (
        df_final.groupby("event_date")
        .agg(filas=("player_name", "count"), partidos=("matchup", "nunique"))
        .reset_index()
        .sort_values("event_date")
    )
    print(resumen_fechas.to_string(index=False))

    return df_final, df_descartadas


# ============================================================
# SUBIDA SEGURA
# ============================================================

def subir_con_staging(df_final: pd.DataFrame, dry_run: bool = False) -> None:
    if dry_run:
        print("\n🧪 DRY RUN activo: no se sube nada a Supabase.")
        return

    engine = get_engine()

    print("\n🚀 Subiendo cuotas con staging seguro...")

    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE};"))

        df_final.to_sql(
            STAGING_TABLE,
            con=conn,
            if_exists="replace",
            index=False,
            method="multi",
            chunksize=1000,
        )

        staging_count = conn.execute(
            text(f"SELECT COUNT(*) FROM {STAGING_TABLE};")
        ).scalar_one()

        if staging_count != len(df_final):
            raise RuntimeError(
                f"Staging count mismatch: staging={staging_count}, dataframe={len(df_final)}"
            )

        if staging_count < 100:
            raise RuntimeError(
                f"Abortado por seguridad: staging tiene muy pocas filas ({staging_count})."
            )

        conn.execute(text(f"TRUNCATE TABLE {PLAYER_ODDS_TABLE};"))

        conn.execute(text(f"""
            INSERT INTO {PLAYER_ODDS_TABLE}
                (
                    event_date,
                    player_name,
                    prop_type,
                    matchup,
                    line,
                    over_price,
                    under_price
                )
            SELECT
                event_date::date,
                player_name,
                prop_type,
                matchup,
                line,
                over_price,
                under_price
            FROM {STAGING_TABLE};
        """))

        final_count = conn.execute(
            text(f"SELECT COUNT(*) FROM {PLAYER_ODDS_TABLE};")
        ).scalar_one()

        if final_count != staging_count:
            raise RuntimeError(
                f"Final count mismatch: player_odds={final_count}, staging={staging_count}"
            )

        conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE};"))

    print(f"✅ player_odds actualizada correctamente: {len(df_final)} filas")


# ============================================================
# ARCHIVADO
# ============================================================

def archivar_csv(path_csv: Path, no_archive: bool, dry_run: bool) -> None:
    if no_archive:
        print("📁 No se archiva el CSV porque usaste --no-archive.")
        return

    if dry_run:
        print("🧪 DRY RUN: no se archiva el CSV.")
        return

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    destino = ARCHIVE_DIR / path_csv.name

    if destino.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        destino = ARCHIVE_DIR / f"{path_csv.stem}_{ts}{path_csv.suffix}"

    shutil.move(str(path_csv), str(destino))
    print(f"📦 CSV archivado en: {destino}")


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Subir cuotas de Stake a player_odds de forma segura.")
    parser.add_argument(
        "--file",
        default="",
        help="CSV específico a subir. Si no se indica, usa el último lineas_nba_*.csv de cuotas_procesadas/.",
    )
    parser.add_argument(
        "--input-dir",
        default=str(INPUT_DIR),
        help="Carpeta donde buscar lineas_nba_*.csv.",
    )
    parser.add_argument(
        "--event-date",
        default="",
        help="Forzar fecha del evento en formato YYYY-MM-DD si Fecha_Partido no se puede parsear.",
    )
    parser.add_argument(
        "--source-tz",
        default="auto",
        help="Timezone origen de Fecha_Partido si trae hora sin zona. Ej: UTC. Default: auto.",
    )
    parser.add_argument(
        "--target-tz",
        default=DEFAULT_TARGET_TZ,
        help=f"Timezone destino para agrupar event_date. Default: {DEFAULT_TARGET_TZ}.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Procesa y valida, pero no sube a Supabase ni archiva.",
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="No mueve el CSV a cuotas_procesadas/subidas/ después de subir.",
    )

    args = parser.parse_args()

    input_dir = Path(args.input_dir)

    print("🏀 LUDO — SUBIR CUOTAS v2.2")
    print("=" * 72)

    try:
        csv_path = elegir_csv(input_dir, args.file or None)
        df_final, _ = preparar_cuotas(
            csv_path,
            forced_event_date=args.event_date,
            source_tz=args.source_tz,
            target_tz=args.target_tz,
        )

        subir_con_staging(df_final, dry_run=args.dry_run)
        archivar_csv(csv_path, no_archive=args.no_archive, dry_run=args.dry_run)

        print("\n✅ Proceso terminado correctamente.")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()