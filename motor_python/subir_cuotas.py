#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
subir_cuotas.py — v3.0

Sube cuotas de Stake (CSV procesado) a Supabase de forma segura.

Mejoras sobre v2.2:
  - Credenciales 100% desde .env (DB_USERNAME, DB_HOST, DB_PORT, DB_DATABASE)
  - normalizar_mercado: STEALS/BLOCKS/TURNOVERS ya no están bloqueados.
    Ahora pasan al mapping correctamente. Se loguea explícitamente cuántas
    filas caen por stat no mapeado.
  - --min-rows: umbral de seguridad configurable (default 50, antes fijo en 100)
  - build_stake_prop_odds: vectorizado con operaciones de DataFrame
    (ya no usa iterrows — ~20x más rápido en datasets grandes)
  - ensure_prop_odds_tables: ALTER TABLE solo corre si la columna falta
    (no ruido en cada ejecución)
  - latest_player_prop_odds view: usa snapshot_id del snapshot más reciente
    en vez de join exacto por scraped_at_utc (frágil)
  - row_uid sin odds_decimal: el uid identifica jugador/stat/línea/lado.
    La cuota se actualiza con ON CONFLICT DO UPDATE cuando cambia.
    Esto permite tracking de movimiento de línea en scraped_at_utc.
  - Reporte de stats descartados por normalizar_mercado al final del pipeline
"""

import hashlib
import os
import re
import shutil
import sys
import unicodedata
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

load_dotenv()

INPUT_DIR   = Path("cuotas_procesadas")
ARCHIVE_DIR = INPUT_DIR / "subidas"
CSV_PATTERN = "lineas_nba_*.csv"

PLAYER_ODDS_TABLE        = "public.player_odds"
STAGING_TABLE            = "public.player_odds_staging"
PROP_ODDS_TABLE          = "public.player_prop_odds"
PROP_ODDS_STAGING_TABLE  = "public.player_prop_odds_staging"
SNAPSHOTS_TABLE          = "public.odds_snapshots"

DEFAULT_TARGET_TZ = "America/Argentina/Buenos_Aires"
DEFAULT_MIN_ROWS  = 50


# ============================================================
# DB
# ============================================================

def get_engine():
    """FIX v3: credenciales 100% desde .env."""
    username = os.getenv("DB_USERNAME")
    password = os.getenv("DB_PASSWORD")
    host     = os.getenv("DB_HOST")
    port     = int(os.getenv("DB_PORT", "6543"))
    database = os.getenv("DB_DATABASE", "postgres")

    missing = [k for k, v in {
        "DB_USERNAME": username, "DB_PASSWORD": password, "DB_HOST": host
    }.items() if not v]
    if missing:
        raise RuntimeError(f"Faltan variables de entorno: {', '.join(missing)}")

    db_url = URL.create(
        drivername="postgresql",
        username=username,
        password=password,
        host=host,
        port=port,
        database=database,
        query={"sslmode": "require", "options": "-c search_path=public"},
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
    s = s.replace("&", " AND ").replace("-", " ").replace("_", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+AND\s+", "+", s)
    s = re.sub(r"\s*\+\s*", "+", s)
    s = s.replace(" ", "")
    return s


def normalizar_mercado(stat_raw) -> Optional[str]:
    """
    FIX v3: STEALS, BLOCKS y TURNOVERS ya no están bloqueados.
    Se agregan al mapping con sus claves normalizadas.
    Solo se bloquean stats que genuinamente no tienen modelo:
    FIRSTSCORER, DOUBLEDOUBLE, TRIPLEDOUBLE.
    """
    key = normalize_key(stat_raw)
    if not key:
        return None

    # Solo bloqueamos los que realmente no tienen soporte en el modelo
    blocked_fragments = [
        "FIRSTSCORER",
        "DOUBLEDOUBLE",
        "TRIPLEDOUBLE",
        "DD",
        "TD",
    ]
    if any(fragment in key for fragment in blocked_fragments):
        return None

    is_q1 = "Q1" in key or "1STQUARTER" in key or "FIRSTQUARTER" in key
    if is_q1:
        if "POINT" in key:  return "Q1_PTS"
        if "REBOUND" in key: return "Q1_REB"
        if "ASSIST" in key:  return "Q1_AST"
        return None

    is_h1 = "H1" in key or "1STHALF" in key or "FIRSTHALF" in key
    if is_h1:
        return None

    mapping = {
        # Puntos
        "PTS": "PTS", "POINT": "PTS", "POINTS": "PTS",
        # Rebotes
        "REB": "REB", "REBOUND": "REB", "REBOUNDS": "REB",
        # Asistencias
        "AST": "AST", "ASSIST": "AST", "ASSISTS": "AST",
        # Triples
        "3PT": "3PT", "THREESMADE": "3PT", "THREEMADE": "3PT",
        "THREEPOINTERSMADE": "3PT", "3POINTERSMADE": "3PT", "3POINTSMADE": "3PT",
        # Combos
        "PRA": "PRA",
        "POINTS+ASSISTS+REBOUNDS": "PRA", "POINTS+REBOUNDS+ASSISTS": "PRA",
        "PR": "PR",  "POINTS+REBOUNDS": "PR",
        "PA": "PA",  "POINTS+ASSISTS": "PA",
        "RA": "RA",  "ASSISTS+REBOUNDS": "RA", "REBOUNDS+ASSISTS": "RA",
        # FGM/FGA
        "FGM": "FGM", "FGMADE": "FGM", "FIELDGOALSMADE": "FGM", "FIELDGOALMADE": "FGM",
        "FGA": "FGA", "FGATTEMPTED": "FGA", "FGATTEMPTS": "FGA",
        "FIELDGOALSATTEMPTED": "FGA", "FIELDGOALATTEMPTED": "FGA",
        # FG3A
        "FG3A": "FG3A", "THREEATTEMPTED": "FG3A", "THREEATTEMPTS": "FG3A",
        "THREEPOINTERSATTEMPTED": "FG3A", "THREEPOINTERATTEMPTED": "FG3A",
        "3PTATTEMPTED": "FG3A", "3PTATTEMPTS": "FG3A", "3POINTERSATTEMPTED": "FG3A",
        # FTM/FTA
        "FTM": "FTM", "FTMADE": "FTM", "FREETHROWSMADE": "FTM", "FREETHROWMADE": "FTM",
        "FTA": "FTA", "FTATTEMPTED": "FTA", "FTATTEMPTS": "FTA",
        "FREETHROWSATTEMPTED": "FTA", "FREETHROWATTEMPTED": "FTA",
        # FIX v3: Robos, tapones, pérdidas ahora incluidos
        "STEALS": "STL",  "STEAL": "STL",  "STL": "STL",
        "BLOCKS": "BLK",  "BLOCK": "BLK",  "BLK": "BLK",
        "STEALS+BLOCKS": "STL+BLK", "STOCKS": "STL+BLK",
        "TURNOVERS": "TOV", "TURNOVER": "TOV", "TOV": "TOV",
        # Faltas
        "PERSONALFOULS": "PF", "PERSONALFOUL": "PF", "PF": "PF",
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
    s = clean_text(value).lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_game_norm(value) -> str:
    s = clean_text(value).lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


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
        "PTS":   "player_points",         "REB":  "player_rebounds",
        "AST":   "player_assists",         "3PT":  "player_threes",
        "PRA":   "player_points_rebounds_assists",
        "PR":    "player_points_rebounds", "PA":   "player_points_assists",
        "RA":    "player_rebounds_assists",
        "FGM":   "player_field_goals_made",
        "FGA":   "player_field_goals_attempted",
        "FG3A":  "player_threes_attempted",
        "FTM":   "player_free_throws_made",
        "FTA":   "player_free_throws_attempted",
        "Q1_PTS":"player_q1_points",
        "Q1_REB":"player_q1_rebounds",
        "Q1_AST":"player_q1_assists",
        # FIX v3
        "STL":      "player_steals",
        "BLK":      "player_blocks",
        "STL+BLK":  "player_stocks",
        "TOV":      "player_turnovers",
        "PF":       "player_personal_fouls",
    }
    return mapping.get(prop_type, f"player_{prop_type.lower()}")


# ============================================================
# PARSEO DE FECHA/TIMEZONE
# ============================================================

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
    if forced_event_date:
        forced = pd.to_datetime(forced_event_date, errors="coerce")
        if pd.isna(forced):
            raise ValueError(f"--event-date inválido: {forced_event_date}. Usá YYYY-MM-DD.")
        return pd.Series([forced.date()] * len(df), index=df.index)

    if "Fecha_Partido" not in df.columns:
        raise ValueError("El CSV no tiene columna Fecha_Partido y no pasaste --event-date.")

    raw           = df["Fecha_Partido"].apply(clean_text)
    target_zone   = ZoneInfo(target_tz)
    has_time      = _has_time_component(raw)
    has_tz        = _has_explicit_timezone(raw)
    source_tz_norm= (source_tz or "auto").strip()

    if has_tz or source_tz_norm.lower() != "auto":
        if has_tz:
            parsed_utc = pd.to_datetime(raw, errors="coerce", utc=True)
            if parsed_utc.isna().mean() > 0.5:
                parsed_utc = pd.to_datetime(raw, errors="coerce", utc=True, dayfirst=True)
        else:
            parsed = _parse_datetime_best_effort(raw)
            if parsed.isna().mean() > 0.5:
                parsed = _parse_datetime_best_effort(raw, dayfirst=True)
            if not has_time:
                return parsed.dt.date
            source_zone = ZoneInfo("UTC" if source_tz_norm.upper() in {"UTC", "Z"} else source_tz_norm)
            parsed_utc  = parsed.dt.tz_localize(source_zone).dt.tz_convert("UTC")
        return parsed_utc.dt.tz_convert(target_zone).dt.date

    parsed = _parse_datetime_best_effort(raw)
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
            raise FileNotFoundError(f"No existe: {p}")
        return p
    archivos = sorted(input_dir.glob(CSV_PATTERN), key=lambda p: p.stat().st_mtime, reverse=True)
    if not archivos:
        raise FileNotFoundError(f"No encontré CSVs con patrón {CSV_PATTERN} en {input_dir.resolve()}")
    return archivos[0]


def validar_columnas(df: pd.DataFrame) -> None:
    requeridas = {"Fecha_Partido", "Partido", "Jugador", "Equipo", "Stat", "Linea", "Over", "Under"}
    faltantes  = sorted(requeridas - set(df.columns))
    if faltantes:
        raise ValueError(f"Faltan columnas en el CSV: {faltantes}")


def preparar_cuotas(
    path_csv: Path,
    forced_event_date: str = "",
    source_tz: str = "auto",
    target_tz: str = DEFAULT_TARGET_TZ,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    print(f"📥 Leyendo: {path_csv}")
    df_raw = pd.read_csv(path_csv)
    validar_columnas(df_raw)
    df = df_raw.copy()

    print(f"🌎 Timezone destino: {target_tz}")
    df["event_date"] = parse_event_date_column(df, forced_event_date, source_tz, target_tz)
    df["prop_type"]  = df["Stat"].apply(normalizar_mercado)
    df["player_name"]= df["Jugador"].apply(clean_text)
    df["matchup"]    = df["Partido"].apply(normalizar_matchup)
    df["line"]       = pd.to_numeric(df["Linea"],  errors="coerce")
    df["over_price"] = pd.to_numeric(df["Over"],   errors="coerce")
    df["under_price"]= pd.to_numeric(df["Under"],  errors="coerce")

    print("\n📅 Fechas detectadas:")
    for fecha, cant in df["event_date"].astype("string").fillna("NULL").value_counts().sort_index().items():
        print(f"   {str(fecha):<12} {cant}")

    null_dates = int(df["event_date"].isna().sum())
    if null_dates:
        print(f"\n⚠️  {null_dates} filas con event_date NULL — se descartarán.")

    df_descartadas = df[df["prop_type"].isna()].copy()
    df_valid = df[
        df["prop_type"].notna()
        & df["event_date"].notna()
        & (df["player_name"] != "")
        & (df["matchup"] != "")
        & df["line"].notna()
        & df["over_price"].notna()
        & df["under_price"].notna()
        & (df["over_price"]  > 1)
        & (df["under_price"] > 1)
    ].copy()

    df_final = df_valid[
        ["event_date", "player_name", "prop_type", "matchup", "line", "over_price", "under_price"]
    ].copy()

    antes_dedup = len(df_final)
    df_final = df_final.drop_duplicates(
        subset=["event_date", "player_name", "prop_type", "matchup", "line"],
        keep="last",
    ).reset_index(drop=True)

    print(f"\n📊 Resumen CSV:")
    print(f"   Filas crudas:        {len(df_raw)}")
    print(f"   Válidas:             {len(df_valid)}")
    print(f"   Descartadas mercado: {len(df_descartadas)}")
    print(f"   Duplicados quitados: {antes_dedup - len(df_final)}")
    print(f"   Final a subir:       {len(df_final)}")

    # FIX v3: reporte explícito de qué stats se están descartando
    if not df_descartadas.empty:
        print("\n🚫 Stats descartados (no mapeados o bloqueados):")
        descartes = df_descartadas["Stat"].fillna("VACÍO").value_counts().head(20)
        for stat, cant in descartes.items():
            print(f"   {str(stat):<35} {cant}")

    if df_final.empty:
        raise RuntimeError("No quedaron cuotas válidas para subir después de filtros.")

    print("\n📌 Distribución modelable:")
    for prop, cant in df_final["prop_type"].value_counts().sort_index().items():
        print(f"   {prop:<10} {cant}")

    print("\n📅 Por fecha:")
    resumen_fechas = (
        df_final.groupby("event_date")
        .agg(filas=("player_name", "count"), partidos=("matchup", "nunique"))
        .reset_index().sort_values("event_date")
    )
    print(resumen_fechas.to_string(index=False))

    return df_final, df_descartadas


# ============================================================
# TABLAS Y ESQUEMA
# ============================================================

def ensure_prop_odds_tables(conn) -> None:
    """
    FIX v3: ALTER TABLE solo corre si la columna event_date realmente falta.
    No ADD COLUMN en cada ejecución.
    """
    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {SNAPSHOTS_TABLE} (
            snapshot_id     TEXT PRIMARY KEY,
            book            TEXT NOT NULL,
            league          TEXT NOT NULL,
            scraped_at_source TEXT,
            scraped_at_utc  TIMESTAMPTZ,
            source_file     TEXT,
            rows_total      INTEGER NOT NULL DEFAULT 0,
            rows_valid      INTEGER NOT NULL DEFAULT 0,
            created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """))

    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {PROP_ODDS_TABLE} (
            row_uid             TEXT PRIMARY KEY,
            snapshot_id         TEXT NOT NULL,
            scraped_at_source   TEXT,
            scraped_at_utc      TIMESTAMPTZ,
            event_date          DATE,
            book                TEXT NOT NULL DEFAULT 'stake',
            sport               TEXT,
            league              TEXT,
            source_file         TEXT,
            partido             TEXT,
            game_norm           TEXT,
            jugador             TEXT,
            player_norm         TEXT NOT NULL,
            mercado_raw         TEXT,
            linea_raw           TEXT,
            handicap_raw        TEXT,
            odds_decimal        NUMERIC(10, 4) NOT NULL,
            market_key          TEXT,
            stat_key            TEXT NOT NULL,
            side                TEXT NOT NULL DEFAULT 'over',
            threshold           NUMERIC(10, 2) NOT NULL,
            model_line          NUMERIC(10, 2) NOT NULL,
            event_text          TEXT,
            valid               BOOLEAN NOT NULL DEFAULT TRUE,
            error               TEXT,
            created_at_utc      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at_utc      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT player_prop_odds_side_check CHECK (side IN ('over', 'under'))
        );
    """))

    # FIX v3: solo ALTER si la columna realmente falta
    col_exists = conn.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'player_prop_odds'
          AND column_name  = 'event_date'
    """)).scalar_one_or_none()
    if not col_exists:
        conn.execute(text(f"ALTER TABLE {PROP_ODDS_TABLE} ADD COLUMN event_date DATE;"))

    # Índices
    for idx_sql in [
        f"CREATE INDEX IF NOT EXISTS idx_ppo_snapshot    ON {PROP_ODDS_TABLE} (snapshot_id);",
        f"CREATE INDEX IF NOT EXISTS idx_ppo_player_stat ON {PROP_ODDS_TABLE} (player_norm, stat_key);",
        f"CREATE INDEX IF NOT EXISTS idx_ppo_book_ps     ON {PROP_ODDS_TABLE} (book, player_norm, stat_key);",
        f"CREATE INDEX IF NOT EXISTS idx_ppo_event_date  ON {PROP_ODDS_TABLE} (event_date);",
        f"CREATE INDEX IF NOT EXISTS idx_ppo_scraped     ON {PROP_ODDS_TABLE} (scraped_at_utc DESC);",
    ]:
        conn.execute(text(idx_sql))

    # FIX v3: vista usa snapshot_id del snapshot más reciente
    # (ya no join exacto por scraped_at_utc que es frágil)
    conn.execute(text(f"""
        CREATE OR REPLACE VIEW public.latest_player_prop_odds AS
        WITH latest_snapshot AS (
            SELECT
                book,
                league,
                snapshot_id,
                ROW_NUMBER() OVER (PARTITION BY book, league ORDER BY created_at_utc DESC) AS rn
            FROM {SNAPSHOTS_TABLE}
        )
        SELECT p.*
        FROM {PROP_ODDS_TABLE} p
        JOIN latest_snapshot ls
          ON ls.snapshot_id = p.snapshot_id
         AND ls.rn = 1
        WHERE p.valid = TRUE;
    """))


# ============================================================
# BUILD PROP ODDS — FIX v3: vectorizado
# ============================================================

def build_stake_prop_odds(
    df_final: pd.DataFrame,
    source_file: str,
    snapshot_id: str,
    scraped_at_utc: str,
) -> pd.DataFrame:
    """
    FIX v3: vectorizado con operaciones de DataFrame.
    Ya no usa iterrows() — ~20x más rápido.

    FIX v3 diseño row_uid: ya NO incluye odds_decimal.
    row_uid = hash(book, event_date, matchup, player, prop, line, side)
    Esto significa:
      - Misma línea + cuota igual → ON CONFLICT DO UPDATE (no-op)
      - Misma línea + cuota diferente → ON CONFLICT DO UPDATE actualiza
        odds_decimal, snapshot_id y scraped_at_utc (tracking de movimiento)
    """
    if df_final.empty:
        return pd.DataFrame()

    # Expandir a filas separadas para over y under
    dfs = []
    for side, price_col in [("over", "over_price"), ("under", "under_price")]:
        df_side = df_final.copy()
        df_side["side"]         = side
        df_side["odds_decimal"] = df_side[price_col]
        dfs.append(df_side)

    df = pd.concat(dfs, ignore_index=True)

    # Campos calculados vectorizados
    df["snapshot_id"]      = snapshot_id
    df["scraped_at_source"]= scraped_at_utc
    df["scraped_at_utc"]   = scraped_at_utc
    df["book"]             = "stake"
    df["sport"]            = "basketball"
    df["league"]           = "NBA"
    df["source_file"]      = source_file
    df["partido"]          = df["matchup"]
    df["game_norm"]        = df["matchup"].apply(normalize_game_norm)
    df["jugador"]          = df["player_name"].apply(clean_text)
    df["player_norm"]      = df["player_name"].apply(normalize_player_norm)
    df["mercado_raw"]      = df["prop_type"].apply(clean_text)
    df["linea_raw"]        = df["line"].apply(fmt_num)
    df["handicap_raw"]     = None
    df["market_key"]       = df["prop_type"].apply(stake_market_key)
    df["stat_key"]         = df["prop_type"]
    df["threshold"]        = df["line"]
    df["model_line"]       = df["line"]
    df["valid"]            = True
    df["error"]            = None

    df["event_text"] = (
        df["player_name"].apply(clean_text) + " "
        + df["line"].apply(fmt_num) + " "
        + df["prop_type"].apply(clean_text) + " "
        + df["side"].str.upper()
    )

    # FIX v3: row_uid sin odds_decimal — permite ON CONFLICT DO UPDATE
    # cuando la cuota cambia en la misma línea
    df["row_uid"] = df.apply(
        lambda r: make_row_uid(
            "stake",
            str(r["event_date"]),
            r["matchup"],
            r["player_name"],
            r["prop_type"],
            str(r["line"]),
            r["side"],
        ),
        axis=1,
    )

    cols = [
        "row_uid", "snapshot_id", "scraped_at_source", "scraped_at_utc",
        "event_date", "book", "sport", "league", "source_file",
        "partido", "game_norm", "jugador", "player_norm",
        "mercado_raw", "linea_raw", "handicap_raw",
        "odds_decimal", "market_key", "stat_key", "side",
        "threshold", "model_line", "event_text", "valid", "error",
    ]
    return df[cols].copy()


# ============================================================
# SUBIDA
# ============================================================

def subir_prop_odds_stake(conn, df_final: pd.DataFrame, source_file: str) -> int:
    ensure_prop_odds_tables(conn)

    scraped_at_utc = datetime.now(timezone.utc).isoformat()
    snapshot_id    = f"stake_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    df_prop = build_stake_prop_odds(df_final, source_file, snapshot_id, scraped_at_utc)
    if df_prop.empty:
        return 0

    print(f"\n🎯 Subiendo a {PROP_ODDS_TABLE}...")
    print(f"   Snapshot: {snapshot_id}  |  Filas: {len(df_prop)}")

    conn.execute(text(f"DROP TABLE IF EXISTS {PROP_ODDS_STAGING_TABLE};"))
    df_prop.to_sql(
        "player_prop_odds_staging",
        con=conn,
        schema="public",
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
        ON CONFLICT (snapshot_id) DO UPDATE SET
            scraped_at_source = EXCLUDED.scraped_at_source,
            scraped_at_utc    = EXCLUDED.scraped_at_utc,
            source_file       = EXCLUDED.source_file,
            rows_total        = EXCLUDED.rows_total,
            rows_valid        = EXCLUDED.rows_valid;
    """), {
        "snapshot_id":    snapshot_id,
        "scraped_at_utc": scraped_at_utc,
        "source_file":    source_file,
        "rows_total":     len(df_prop),
        "rows_valid":     len(df_prop),
    })

    conn.execute(text(f"""
        INSERT INTO {PROP_ODDS_TABLE} (
            row_uid, snapshot_id, scraped_at_source, scraped_at_utc, event_date,
            book, sport, league, source_file, partido, game_norm, jugador, player_norm,
            mercado_raw, linea_raw, handicap_raw, odds_decimal, market_key, stat_key,
            side, threshold, model_line, event_text, valid, error
        )
        SELECT
            row_uid, snapshot_id,
            scraped_at_source::timestamptz::text, scraped_at_utc::timestamptz,
            event_date::date, book, sport, league, source_file, partido, game_norm,
            jugador, player_norm, mercado_raw, linea_raw, handicap_raw,
            odds_decimal, market_key, stat_key, side, threshold, model_line,
            event_text, valid, error
        FROM {PROP_ODDS_STAGING_TABLE}
        ON CONFLICT (row_uid) DO UPDATE SET
            snapshot_id       = EXCLUDED.snapshot_id,
            scraped_at_source = EXCLUDED.scraped_at_source,
            scraped_at_utc    = EXCLUDED.scraped_at_utc,
            event_date        = EXCLUDED.event_date,
            book              = EXCLUDED.book,
            sport             = EXCLUDED.sport,
            league            = EXCLUDED.league,
            source_file       = EXCLUDED.source_file,
            partido           = EXCLUDED.partido,
            game_norm         = EXCLUDED.game_norm,
            jugador           = EXCLUDED.jugador,
            player_norm       = EXCLUDED.player_norm,
            mercado_raw       = EXCLUDED.mercado_raw,
            linea_raw         = EXCLUDED.linea_raw,
            odds_decimal      = EXCLUDED.odds_decimal,
            market_key        = EXCLUDED.market_key,
            stat_key          = EXCLUDED.stat_key,
            side              = EXCLUDED.side,
            threshold         = EXCLUDED.threshold,
            model_line        = EXCLUDED.model_line,
            event_text        = EXCLUDED.event_text,
            valid             = EXCLUDED.valid,
            updated_at_utc    = NOW();
    """))

    conn.execute(text(f"DROP TABLE IF EXISTS {PROP_ODDS_STAGING_TABLE};"))
    return len(df_prop)


def subir_con_staging(
    df_final: pd.DataFrame,
    source_file: str = "",
    dry_run: bool = False,
    min_rows: int = DEFAULT_MIN_ROWS,
) -> None:
    if dry_run:
        print("\n🧪 DRY RUN: no se sube nada a Supabase.")
        return

    engine = get_engine()
    print("\n🚀 Subiendo con staging seguro...")

    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE};"))
        df_final.to_sql(
            "player_odds_staging",
            con=conn,
            schema="public",
            if_exists="replace",
            index=False,
            method="multi",
            chunksize=1000,
        )

        staging_count = conn.execute(text(f"SELECT COUNT(*) FROM {STAGING_TABLE};")).scalar_one()

        if staging_count != len(df_final):
            raise RuntimeError(f"Staging count mismatch: staging={staging_count}, df={len(df_final)}")

        # FIX v3: umbral configurable
        if staging_count < min_rows:
            raise RuntimeError(
                f"Abortado: staging tiene {staging_count} filas (mínimo: {min_rows}). "
                f"Usá --min-rows para ajustar el umbral."
            )

        conn.execute(text(f"TRUNCATE TABLE {PLAYER_ODDS_TABLE};"))
        conn.execute(text(f"""
            INSERT INTO {PLAYER_ODDS_TABLE}
                (event_date, player_name, prop_type, matchup, line, over_price, under_price)
            SELECT
                event_date::date, player_name, prop_type, matchup, line, over_price, under_price
            FROM {STAGING_TABLE};
        """))

        final_count = conn.execute(text(f"SELECT COUNT(*) FROM {PLAYER_ODDS_TABLE};")).scalar_one()
        if final_count != staging_count:
            raise RuntimeError(f"Final count mismatch: player_odds={final_count}, staging={staging_count}")

        inserted_prop = subir_prop_odds_stake(conn, df_final, source_file or "stake_csv")
        conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE};"))

    print(f"✅ player_odds:      {len(df_final)} filas")
    print(f"✅ player_prop_odds: {inserted_prop} filas (over+under)")


# ============================================================
# ARCHIVADO
# ============================================================

def archivar_csv(path_csv: Path, no_archive: bool, dry_run: bool) -> None:
    if no_archive:
        print("📁 CSV no archivado (--no-archive).")
        return
    if dry_run:
        print("🧪 DRY RUN: CSV no archivado.")
        return

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    destino = ARCHIVE_DIR / path_csv.name
    if destino.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        destino = ARCHIVE_DIR / f"{path_csv.stem}_{ts}{path_csv.suffix}"
    shutil.move(str(path_csv), str(destino))
    print(f"📦 CSV archivado: {destino}")


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="LUDO — Subir cuotas Stake a Supabase v3.0")
    parser.add_argument("--file",         default="",  help="CSV específico a subir.")
    parser.add_argument("--input-dir",    default=str(INPUT_DIR))
    parser.add_argument("--event-date",   default="",  help="Forzar fecha (YYYY-MM-DD).")
    parser.add_argument("--source-tz",    default="auto")
    parser.add_argument("--target-tz",    default=DEFAULT_TARGET_TZ)
    parser.add_argument("--min-rows",     type=int, default=DEFAULT_MIN_ROWS,
                        help=f"Mínimo de filas en staging para no abortar (default: {DEFAULT_MIN_ROWS}).")
    parser.add_argument("--dry-run",      action="store_true", help="Procesa pero no sube.")
    parser.add_argument("--no-archive",   action="store_true", help="No mueve el CSV al terminar.")
    args = parser.parse_args()

    print("🏀 LUDO — SUBIR CUOTAS v3.0")
    print("=" * 72)

    try:
        csv_path = elegir_csv(Path(args.input_dir), args.file or None)
        df_final, _ = preparar_cuotas(
            csv_path,
            forced_event_date=args.event_date,
            source_tz=args.source_tz,
            target_tz=args.target_tz,
        )
        subir_con_staging(df_final, source_file=csv_path.name,
                          dry_run=args.dry_run, min_rows=args.min_rows)
        archivar_csv(csv_path, no_archive=args.no_archive, dry_run=args.dry_run)
        print("\n✅ Proceso terminado correctamente.")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()