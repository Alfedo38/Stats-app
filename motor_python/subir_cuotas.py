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
import hashlib
import os
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone
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

# Tabla nueva/universal para guardar todas las líneas disponibles por book.
# Esta tabla permite múltiples líneas por jugador/mercado y separa over/under.
PROP_ODDS_TABLE = "public.player_prop_odds"
PROP_ODDS_STAGING_TABLE = "player_prop_odds_staging"
SNAPSHOTS_TABLE = "public.odds_snapshots"

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


def normalize_player_norm(value) -> str:
    """Normaliza nombres para matchear cuotas con la app: De'Aaron -> de aaron."""
    s = clean_text(value).lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_game_norm(value) -> str:
    s = clean_text(value).lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def fmt_num(value) -> str:
    try:
        n = float(value)
    except Exception:
        return str(value)
    if n.is_integer():
        return str(int(n))
    return str(n).rstrip("0").rstrip(".")


def make_row_uid(*parts) -> str:
    raw = "|".join(clean_text(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def stake_market_key(prop_type: str) -> str:
    mapping = {
        "PTS": "player_points",
        "REB": "player_rebounds",
        "AST": "player_assists",
        "3PT": "player_threes",
        "PRA": "player_points_rebounds_assists",
        "PR": "player_points_rebounds",
        "PA": "player_points_assists",
        "RA": "player_rebounds_assists",
        "FGM": "player_field_goals_made",
        "FGA": "player_field_goals_attempted",
        "FG3A": "player_threes_attempted",
        "FTM": "player_free_throws_made",
        "FTA": "player_free_throws_attempted",
        "Q1_PTS": "player_q1_points",
        "Q1_REB": "player_q1_rebounds",
        "Q1_AST": "player_q1_assists",
    }
    return mapping.get(prop_type, f"player_{prop_type.lower()}")


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

def ensure_prop_odds_tables(conn) -> None:
    """
    Asegura la tabla universal de cuotas.
    Sirve para Stake y Betano, y permite múltiples líneas por jugador/mercado.
    """
    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {SNAPSHOTS_TABLE} (
            snapshot_id TEXT PRIMARY KEY,
            book TEXT NOT NULL,
            league TEXT NOT NULL,
            scraped_at_source TEXT,
            scraped_at_utc TIMESTAMPTZ,
            source_file TEXT,
            rows_total INTEGER NOT NULL DEFAULT 0,
            rows_valid INTEGER NOT NULL DEFAULT 0,
            created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """))

    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {PROP_ODDS_TABLE} (
            row_uid TEXT PRIMARY KEY,
            snapshot_id TEXT NOT NULL,
            scraped_at_source TEXT,
            scraped_at_utc TIMESTAMPTZ,
            event_date DATE,
            book TEXT NOT NULL DEFAULT 'stake',
            sport TEXT,
            league TEXT,
            source_file TEXT,
            partido TEXT,
            game_norm TEXT,
            jugador TEXT,
            player_norm TEXT NOT NULL,
            mercado_raw TEXT,
            linea_raw TEXT,
            handicap_raw TEXT,
            odds_decimal NUMERIC(10, 4) NOT NULL,
            market_key TEXT,
            stat_key TEXT NOT NULL,
            side TEXT NOT NULL DEFAULT 'over',
            threshold NUMERIC(10, 2) NOT NULL,
            model_line NUMERIC(10, 2) NOT NULL,
            event_text TEXT,
            valid BOOLEAN NOT NULL DEFAULT TRUE,
            error TEXT,
            created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT player_prop_odds_side_check
                CHECK (side IN ('over', 'under'))
        );
    """))

    # Por si la tabla fue creada antes sin event_date.
    conn.execute(text(f"ALTER TABLE {PROP_ODDS_TABLE} ADD COLUMN IF NOT EXISTS event_date DATE;"))

    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_player_prop_odds_snapshot ON {PROP_ODDS_TABLE} (snapshot_id);"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_player_prop_odds_player_stat ON {PROP_ODDS_TABLE} (player_norm, stat_key);"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_player_prop_odds_book_player_stat ON {PROP_ODDS_TABLE} (book, player_norm, stat_key);"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_player_prop_odds_event_date ON {PROP_ODDS_TABLE} (event_date);"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_player_prop_odds_scraped ON {PROP_ODDS_TABLE} (scraped_at_utc DESC);"))

    conn.execute(text(f"""
        CREATE OR REPLACE VIEW public.latest_player_prop_odds AS
        WITH latest AS (
            SELECT
                book,
                league,
                MAX(scraped_at_utc) AS latest_scraped_at_utc
            FROM {PROP_ODDS_TABLE}
            WHERE valid = TRUE
            GROUP BY book, league
        )
        SELECT p.*
        FROM {PROP_ODDS_TABLE} p
        JOIN latest l
          ON l.book = p.book
         AND l.league = p.league
         AND l.latest_scraped_at_utc = p.scraped_at_utc
        WHERE p.valid = TRUE;
    """))


def build_stake_prop_odds(df_final: pd.DataFrame, source_file: str, snapshot_id: str, scraped_at_utc: str) -> pd.DataFrame:
    """
    Convierte cada fila de Stake en 2 filas universales:
      - side=over con over_price
      - side=under con under_price

    Si el CSV trae alt lines, quedan guardadas todas.
    Si el CSV trae solo línea principal, queda guardada solo esa línea.
    """
    rows = []

    for _, r in df_final.iterrows():
        event_date = r.get("event_date")
        player_name = clean_text(r.get("player_name"))
        prop_type = clean_text(r.get("prop_type"))
        matchup = clean_text(r.get("matchup"))
        line = float(r.get("line"))

        for side, price_col in [("over", "over_price"), ("under", "under_price")]:
            odds_decimal = float(r.get(price_col))

            row_uid = make_row_uid(
                "stake",
                event_date,
                matchup,
                player_name,
                prop_type,
                line,
                side,
                odds_decimal,
            )

            rows.append({
                "row_uid": row_uid,
                "snapshot_id": snapshot_id,
                "scraped_at_source": scraped_at_utc,
                "scraped_at_utc": scraped_at_utc,
                "event_date": event_date,
                "book": "stake",
                "sport": "basketball",
                "league": "NBA",
                "source_file": source_file,
                "partido": matchup,
                "game_norm": normalize_game_norm(matchup),
                "jugador": player_name,
                "player_norm": normalize_player_norm(player_name),
                "mercado_raw": prop_type,
                "linea_raw": fmt_num(line),
                "handicap_raw": None,
                "odds_decimal": odds_decimal,
                "market_key": stake_market_key(prop_type),
                "stat_key": prop_type,
                "side": side,
                "threshold": line,
                "model_line": line,
                "event_text": f"{player_name} {fmt_num(line)} {prop_type} {side.upper()}",
                "valid": True,
                "error": None,
            })

    return pd.DataFrame(rows)


def subir_prop_odds_stake(conn, df_final: pd.DataFrame, source_file: str) -> int:
    ensure_prop_odds_tables(conn)

    scraped_at_utc = datetime.now(timezone.utc).isoformat()
    snapshot_id = f"stake_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    df_prop = build_stake_prop_odds(
        df_final=df_final,
        source_file=source_file,
        snapshot_id=snapshot_id,
        scraped_at_utc=scraped_at_utc,
    )

    if df_prop.empty:
        return 0

    print(f"\n🎯 Subiendo cuotas universales Stake a {PROP_ODDS_TABLE}...")
    print(f"   Snapshot: {snapshot_id}")
    print(f"   Filas universales: {len(df_prop)}")

    conn.execute(text(f"DROP TABLE IF EXISTS {PROP_ODDS_STAGING_TABLE};"))

    df_prop.to_sql(
        PROP_ODDS_STAGING_TABLE,
        con=conn,
        if_exists="replace",
        index=False,
        method="multi",
        chunksize=1000,
    )

    conn.execute(text(f"""
        INSERT INTO {SNAPSHOTS_TABLE}
            (snapshot_id, book, league, scraped_at_source, scraped_at_utc, source_file, rows_total, rows_valid)
        VALUES
            (:snapshot_id, 'stake', 'NBA', :scraped_at_utc, :scraped_at_utc, :source_file, :rows_total, :rows_valid)
        ON CONFLICT (snapshot_id)
        DO UPDATE SET
            scraped_at_source = EXCLUDED.scraped_at_source,
            scraped_at_utc = EXCLUDED.scraped_at_utc,
            source_file = EXCLUDED.source_file,
            rows_total = EXCLUDED.rows_total,
            rows_valid = EXCLUDED.rows_valid;
    """), {
        "snapshot_id": snapshot_id,
        "scraped_at_utc": scraped_at_utc,
        "source_file": source_file,
        "rows_total": len(df_prop),
        "rows_valid": len(df_prop),
    })

    conn.execute(text(f"""
        INSERT INTO {PROP_ODDS_TABLE} (
            row_uid,
            snapshot_id,
            scraped_at_source,
            scraped_at_utc,
            event_date,
            book,
            sport,
            league,
            source_file,
            partido,
            game_norm,
            jugador,
            player_norm,
            mercado_raw,
            linea_raw,
            handicap_raw,
            odds_decimal,
            market_key,
            stat_key,
            side,
            threshold,
            model_line,
            event_text,
            valid,
            error
        )
        SELECT
            row_uid,
            snapshot_id,
            scraped_at_source::timestamptz::text,
            scraped_at_utc::timestamptz,
            event_date::date,
            book,
            sport,
            league,
            source_file,
            partido,
            game_norm,
            jugador,
            player_norm,
            mercado_raw,
            linea_raw,
            handicap_raw,
            odds_decimal,
            market_key,
            stat_key,
            side,
            threshold,
            model_line,
            event_text,
            valid,
            error
        FROM {PROP_ODDS_STAGING_TABLE}
        ON CONFLICT (row_uid)
        DO UPDATE SET
            snapshot_id = EXCLUDED.snapshot_id,
            scraped_at_source = EXCLUDED.scraped_at_source,
            scraped_at_utc = EXCLUDED.scraped_at_utc,
            event_date = EXCLUDED.event_date,
            book = EXCLUDED.book,
            sport = EXCLUDED.sport,
            league = EXCLUDED.league,
            source_file = EXCLUDED.source_file,
            partido = EXCLUDED.partido,
            game_norm = EXCLUDED.game_norm,
            jugador = EXCLUDED.jugador,
            player_norm = EXCLUDED.player_norm,
            mercado_raw = EXCLUDED.mercado_raw,
            linea_raw = EXCLUDED.linea_raw,
            handicap_raw = EXCLUDED.handicap_raw,
            odds_decimal = EXCLUDED.odds_decimal,
            market_key = EXCLUDED.market_key,
            stat_key = EXCLUDED.stat_key,
            side = EXCLUDED.side,
            threshold = EXCLUDED.threshold,
            model_line = EXCLUDED.model_line,
            event_text = EXCLUDED.event_text,
            valid = EXCLUDED.valid,
            error = EXCLUDED.error,
            updated_at_utc = NOW();
    """))

    conn.execute(text(f"DROP TABLE IF EXISTS {PROP_ODDS_STAGING_TABLE};"))

    return len(df_prop)


def subir_con_staging(df_final: pd.DataFrame, source_file: str = "", dry_run: bool = False) -> None:
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

        # Tabla legacy: mantiene la línea principal que ya usa la web.
        # Si en el futuro el CSV trae alt lines y esta tabla no las soporta,
        # las alt lines igualmente quedarán guardadas en player_prop_odds.
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

        inserted_prop_odds = subir_prop_odds_stake(
            conn=conn,
            df_final=df_final,
            source_file=source_file or "stake_csv",
        )

        conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE};"))

    print(f"✅ player_odds actualizada correctamente: {len(df_final)} filas")
    print(f"✅ player_prop_odds actualizada correctamente: {inserted_prop_odds} filas Stake")

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

        subir_con_staging(df_final, source_file=csv_path.name, dry_run=args.dry_run)
        archivar_csv(csv_path, no_archive=args.no_archive, dry_run=args.dry_run)

        print("\n✅ Proceso terminado correctamente.")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()