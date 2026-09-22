#!/usr/bin/env python3
"""
Sync actual de NBA injuries usando nbainjuries.

Pensado para cron cada 30 minutos.
- Guarda snapshots en nba_api_data.nba_injury_reports.
- NO borra histórico por defecto.
- Usa URL directa si existe: NBA_DIRECT_DATABASE_URL / DIRECT_DATABASE_URL.
"""
import os
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlparse

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values, Json
from dotenv import load_dotenv
from nbainjuries import injury

ROOT = Path(__file__).resolve().parents[1]
MOTOR_DIR = Path(__file__).resolve().parent

for env_file in [
    ROOT / ".env.local",
    ROOT / ".env",
    MOTOR_DIR / ".env.local",
    MOTOR_DIR / ".env",
]:
    if env_file.exists():
        load_dotenv(env_file, override=False)

ET_TZ = ZoneInfo("America/New_York")
UTC_TZ = ZoneInfo("UTC")

DB_ENV_CANDIDATES = [
    "NBA_DIRECT_DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "SUPABASE_DIRECT_URL",
    "DATABASE_DIRECT_URL",
    "SUPABASE_DATABASE_URL_DIRECT",
    "DATABASE_URL",
    "SUPABASE_DATABASE_URL",
    "POSTGRES_URL",
    "SUPABASE_DB_URL",
    "DB_URL",
]


def get_database_url() -> str:
    for key in DB_ENV_CANDIDATES:
        value = os.getenv(key)
        if value:
            parsed = urlparse(value)
            port = parsed.port
            if port == 6543:
                print(
                    f"⚠️ Aviso: {key} parece usar pooler/PgBouncer puerto 6543. "
                    "Para backfill o scripts pesados conviene URL directa/session pooler."
                )
            else:
                print(f"🔌 Usando DB env: {key}")
            return value
    raise RuntimeError("❌ No encontré URL de Postgres en los .env")


def round_down_minutes(dt: datetime, step: int = 15) -> datetime:
    minute = (dt.minute // step) * step
    return dt.replace(minute=minute, second=0, microsecond=0)


def normalize_player_name(name: str) -> str:
    if not name:
        return ""
    name = str(name).strip()
    if "," in name:
        last, first = name.split(",", 1)
        return f"{first.strip()} {last.strip()}".strip()
    return name


def normalize_status(status: str, reason: str = "") -> tuple[str, int]:
    text = f"{status or ''} {reason or ''}".lower()
    if "out" in text:
        return "OUT", 100
    if "doubtful" in text:
        return "DOUBTFUL", 80
    if "questionable" in text:
        return "QUESTIONABLE", 60
    if "probable" in text:
        return "PROBABLE", 25
    if "available" in text:
        return "AVAILABLE", 0
    if not status and not reason:
        return "UNKNOWN", 10
    return "UNKNOWN", 15


def parse_game_date(value):
    if value is None or pd.isna(value):
        return None
    s = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def make_snapshot_key(report_dt_et: datetime) -> str:
    return "nbainjuries_" + report_dt_et.strftime("%Y%m%d_%H%M_ET")


def ensure_schema(conn):
    required_objects = [
        "nba_api_data.nba_injury_reports",
        "nba_api_data.idx_nba_injury_reports_game_date",
        "nba_api_data.idx_nba_injury_reports_report_ts",
        "nba_api_data.idx_nba_injury_reports_player",
        "nba_api_data.idx_nba_injury_reports_status",
        "public.v_nba_injuries_latest",
        "public.v_nba_injury_absences_latest",
        "public.v_nba_injuries_last_snapshot",
    ]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT bool_and(to_regclass(object_name) IS NOT NULL) "
            "FROM unnest(%s::text[]) AS objects(object_name)",
            (required_objects,),
        )
        if cur.fetchone()[0]:
            return False

    sql = """
    CREATE SCHEMA IF NOT EXISTS nba_api_data;

    CREATE TABLE IF NOT EXISTS nba_api_data.nba_injury_reports (
        id bigserial PRIMARY KEY,
        source text NOT NULL DEFAULT 'nbainjuries',
        snapshot_key text NOT NULL,
        report_ts timestamptz NOT NULL,
        game_date date,
        game_time_et text,
        matchup text,
        team text,
        player_name_raw text NOT NULL,
        player_name text NOT NULL,
        current_status text,
        normalized_status text,
        severity integer,
        reason text,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        fetch_ts timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT nba_injury_reports_snapshot_player_uq
            UNIQUE (snapshot_key, matchup, team, player_name_raw)
    );

    CREATE INDEX IF NOT EXISTS idx_nba_injury_reports_game_date
        ON nba_api_data.nba_injury_reports (game_date);

    CREATE INDEX IF NOT EXISTS idx_nba_injury_reports_report_ts
        ON nba_api_data.nba_injury_reports (report_ts DESC);

    CREATE INDEX IF NOT EXISTS idx_nba_injury_reports_player
        ON nba_api_data.nba_injury_reports (player_name);

    CREATE INDEX IF NOT EXISTS idx_nba_injury_reports_status
        ON nba_api_data.nba_injury_reports (normalized_status);

    CREATE OR REPLACE VIEW public.v_nba_injuries_latest AS
    SELECT DISTINCT ON (game_date, matchup, team, player_name_raw)
        id,
        source,
        snapshot_key,
        report_ts,
        game_date,
        game_time_et,
        matchup,
        team,
        player_name_raw,
        player_name,
        current_status,
        normalized_status,
        severity,
        reason,
        raw,
        fetch_ts,
        created_at
    FROM nba_api_data.nba_injury_reports
    WHERE game_date IS NOT NULL
    ORDER BY game_date, matchup, team, player_name_raw, report_ts DESC, fetch_ts DESC;

    CREATE OR REPLACE VIEW public.v_nba_injury_absences_latest AS
    SELECT *
    FROM public.v_nba_injuries_latest
    WHERE normalized_status IN ('OUT', 'DOUBTFUL');

    CREATE OR REPLACE VIEW public.v_nba_injuries_last_snapshot AS
    SELECT *
    FROM nba_api_data.nba_injury_reports
    WHERE report_ts = (
        SELECT max(report_ts)
        FROM nba_api_data.nba_injury_reports
    );
    """
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    return True


def fetch_report(base_dt_et: datetime):
    print(f"📡 Descargando reporte NBA injuries: {base_dt_et.strftime('%Y-%m-%d %H:%M ET')}")
    df = injury.get_reportdata(
        datetime(
            year=base_dt_et.year,
            month=base_dt_et.month,
            day=base_dt_et.day,
            hour=base_dt_et.hour,
            minute=base_dt_et.minute,
        ),
        return_df=True,
    )
    if df is None or len(df) == 0:
        raise RuntimeError("Reporte vacío")
    return df


def fetch_report_with_fallback(base_dt_et: datetime, max_back_minutes: int = 240):
    attempts = []
    for mins_back in range(0, max_back_minutes + 1, 15):
        candidate = round_down_minutes(base_dt_et - timedelta(minutes=mins_back), 15)
        if candidate not in attempts:
            attempts.append(candidate)

    last_error = None
    for dt_et in attempts:
        try:
            df = fetch_report(dt_et)
            print(f"   ✅ Reporte encontrado | filas={len(df)}")
            return dt_et, df
        except Exception as e:
            last_error = e
            print(f"   ⚠️ No disponible: {type(e).__name__}: {e}")
    raise RuntimeError(f"No pude obtener reporte válido. Último error: {last_error}")


def prepare_rows(df: pd.DataFrame, report_dt_et: datetime):
    snapshot_key = make_snapshot_key(report_dt_et)
    report_ts = report_dt_et.astimezone(UTC_TZ)

    expected_cols = [
        "Game Date",
        "Game Time",
        "Matchup",
        "Team",
        "Player Name",
        "Current Status",
        "Reason",
    ]
    missing = [c for c in expected_cols if c not in df.columns]
    if missing:
        raise RuntimeError(f"Faltan columnas esperadas: {missing}. Columnas reales: {list(df.columns)}")

    rows = []
    for _, r in df.iterrows():
        player_raw = str(r.get("Player Name") or "").strip()
        if not player_raw or player_raw.lower() == "nan":
            continue

        current_status = str(r.get("Current Status") or "").strip()
        reason = str(r.get("Reason") or "").strip()
        if current_status.lower() == "nan":
            current_status = ""
        if reason.lower() == "nan":
            reason = ""

        normalized_status, severity = normalize_status(current_status, reason)
        raw_dict = {col: (None if pd.isna(r.get(col)) else str(r.get(col))) for col in df.columns}

        game_date = parse_game_date(r.get("Game Date"))
        game_time_et = str(r.get("Game Time") or "").strip()
        matchup = str(r.get("Matchup") or "").strip()
        team = str(r.get("Team") or "").strip()
        player_name = normalize_player_name(player_raw)

        if game_time_et.lower() == "nan":
            game_time_et = ""
        if matchup.lower() == "nan":
            matchup = ""
        if team.lower() == "nan":
            team = ""

        rows.append((
            "nbainjuries",
            snapshot_key,
            report_ts,
            game_date,
            game_time_et or None,
            matchup or None,
            team or None,
            player_raw,
            player_name,
            current_status or None,
            normalized_status,
            severity,
            reason or None,
            Json(raw_dict),
        ))
    return snapshot_key, rows


def insert_rows(conn, rows):
    if not rows:
        return 0, 0
    sql = """
    INSERT INTO nba_api_data.nba_injury_reports AS target (
        source, snapshot_key, report_ts, game_date, game_time_et, matchup, team,
        player_name_raw, player_name, current_status, normalized_status, severity, reason, raw
    )
    VALUES %s
    ON CONFLICT (snapshot_key, matchup, team, player_name_raw)
    DO UPDATE SET
        report_ts = EXCLUDED.report_ts,
        game_date = EXCLUDED.game_date,
        game_time_et = EXCLUDED.game_time_et,
        player_name = EXCLUDED.player_name,
        current_status = EXCLUDED.current_status,
        normalized_status = EXCLUDED.normalized_status,
        severity = EXCLUDED.severity,
        reason = EXCLUDED.reason,
        raw = EXCLUDED.raw,
        fetch_ts = now()
    WHERE (
        target.report_ts,
        target.game_date,
        target.game_time_et,
        target.player_name,
        target.current_status,
        target.normalized_status,
        target.severity,
        target.reason,
        target.raw
    ) IS DISTINCT FROM (
        EXCLUDED.report_ts,
        EXCLUDED.game_date,
        EXCLUDED.game_time_et,
        EXCLUDED.player_name,
        EXCLUDED.current_status,
        EXCLUDED.normalized_status,
        EXCLUDED.severity,
        EXCLUDED.reason,
        EXCLUDED.raw
    );
    """
    with conn.cursor() as cur:
        # Un solo lote: rowcount representa exactamente insertadas/actualizadas.
        execute_values(cur, sql, rows, page_size=max(len(rows), 1))
        changed = cur.rowcount
    return changed, len(rows) - changed


def prune_old(conn, days: int):
    if not days or days <= 0:
        return 0
    sql = """
    DELETE FROM nba_api_data.nba_injury_reports
    WHERE created_at < now() - (%s || ' days')::interval;
    """
    with conn.cursor() as cur:
        cur.execute(sql, (str(days),))
        deleted = cur.rowcount
    return deleted


def report_date_range(rows):
    dates = sorted({row[3] for row in rows if row[3] is not None})
    if not dates:
        raise RuntimeError("El reporte no contiene ninguna Game Date válida; no se escribió en PostgreSQL")
    return dates[0], dates[-1]


def refresh_injury_caches(conn, start_date, end_date):
    if (end_date - start_date).days > 31:
        raise RuntimeError(
            f"El reporte abarca demasiados días para refrescar cachés: {start_date} a {end_date}"
        )

    with conn.cursor() as cur:
        cur.execute(
            "SELECT to_regprocedure(%s)",
            ("public.refresh_injury_caches_window(date,date)",),
        )
        if cur.fetchone()[0] is None:
            raise RuntimeError(
                "Falta public.refresh_injury_caches_window(date,date). "
                "No se guardó el reporte para evitar dejar las cachés desactualizadas."
            )
        cur.execute(
            "SELECT public.refresh_injury_caches_window(%s, %s)",
            (start_date, end_date),
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--init-db", action="store_true", help="Crea tabla, índices y vistas si faltan")
    parser.add_argument("--prune-older-than-days", type=int, default=int(os.getenv("INJURY_PRUNE_OLDER_THAN_DAYS", "0")))
    parser.add_argument("--max-back-minutes", type=int, default=240)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", help="Fecha ET: YYYY-MM-DD")
    parser.add_argument("--hour", type=int, help="Hora ET")
    parser.add_argument("--minute", type=int, default=0)
    args = parser.parse_args()

    if args.date and args.hour is not None:
        y, m, d = [int(x) for x in args.date.split("-")]
        base_dt_et = datetime(y, m, d, args.hour, args.minute, tzinfo=ET_TZ)
    else:
        base_dt_et = round_down_minutes(datetime.now(ET_TZ), 15)

    report_dt_et, df = fetch_report_with_fallback(base_dt_et, args.max_back_minutes)
    snapshot_key, rows = prepare_rows(df, report_dt_et)
    start_date, end_date = report_date_range(rows)

    print("===========================================================")
    print("🏥 NBA INJURIES - nbainjuries")
    print("===========================================================")
    print(f"Snapshot: {snapshot_key}")
    print(f"Report ET: {report_dt_et.strftime('%Y-%m-%d %H:%M ET')}")
    print(f"Filas preparadas: {len(rows)}")
    print(f"Ventana de caché: {start_date} → {end_date}")

    if args.dry_run:
        print("🧪 DRY RUN: no se sube a Postgres")
        print(df.head(20).to_string(index=False))
        return

    db_url = get_database_url()
    conn = psycopg2.connect(db_url)
    try:
        if args.init_db:
            schema_changed = ensure_schema(conn)
            if schema_changed:
                print("✅ Schema/tabla/vistas creados o reparados")
            else:
                print("⏭️ Schema/tabla/vistas ya existían: 0 DDL")

        changed, unchanged = insert_rows(conn, rows)
        deleted = prune_old(conn, args.prune_older_than_days)
        refresh_injury_caches(conn, start_date, end_date)
        conn.commit()

        if args.prune_older_than_days > 0:
            print(f"🧹 Filas viejas borradas: {deleted}")
        else:
            print("⏭️ Poda histórica desactivada")
        print(f"✅ Filas insertadas/actualizadas: {changed}")
        print(f"⏭️ Filas idénticas sin reescribir: {unchanged}")
        print(f"✅ Cachés sincronizadas: {start_date} → {end_date}")
        print("Tabla: nba_api_data.nba_injury_reports")
        print("Vistas: public.v_nba_injuries_latest, public.v_nba_injury_absences_latest, public.v_nba_injuries_last_snapshot")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
