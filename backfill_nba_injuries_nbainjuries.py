#!/usr/bin/env python3
"""
Backfill histórico de NBA injuries usando nbainjuries.

Uso recomendado:
  python3 backfill_nba_injuries_nbainjuries.py --start 2021-10-01 --end 2026-05-29 --mode final-day

Notas:
- nbainjuries tiene histórico oficial desde 2021-22; si ponés 2020, va a probar pero probablemente no encuentre datos hasta 2021-22.
- final-day guarda pocos snapshots clave por día y es suficiente para análisis de ausencias por partido.
- full-30min es mucho más pesado.
"""
import os
import time
import argparse
from pathlib import Path
from datetime import datetime, date, timedelta
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
            if parsed.port == 6543:
                print(f"⚠️ {key} parece pooler/PgBouncer puerto 6543. Para backfill conviene URL directa/session pooler.")
            else:
                print(f"🔌 Usando DB env: {key}")
            return value
    raise RuntimeError("❌ No encontré URL de Postgres en los .env")


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
        id, source, snapshot_key, report_ts, game_date, game_time_et, matchup, team,
        player_name_raw, player_name, current_status, normalized_status, severity, reason,
        raw, fetch_ts, created_at
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
    WHERE report_ts = (SELECT max(report_ts) FROM nba_api_data.nba_injury_reports);
    """
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def prepare_rows(df: pd.DataFrame, report_dt_et: datetime):
    snapshot_key = make_snapshot_key(report_dt_et)
    report_ts = report_dt_et.astimezone(UTC_TZ)

    expected_cols = ["Game Date", "Game Time", "Matchup", "Team", "Player Name", "Current Status", "Reason"]
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
            "nbainjuries", snapshot_key, report_ts, game_date, game_time_et or None,
            matchup or None, team or None, player_raw, player_name, current_status or None,
            normalized_status, severity, reason or None, Json(raw_dict)
        ))
    return snapshot_key, rows


def insert_rows(conn, rows):
    if not rows:
        return 0
    sql = """
    INSERT INTO nba_api_data.nba_injury_reports (
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
        fetch_ts = now();
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, rows, page_size=1000)
    conn.commit()
    return len(rows)


def parse_hhmm_list(value: str):
    out = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        h, m = item.split(":")
        out.append((int(h), int(m)))
    return out


def iter_days(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def iter_candidate_times(start: date, end: date, mode: str, times: str, step_minutes: int):
    if mode == "final-day":
        hhmm = parse_hhmm_list(times)
        for d in iter_days(start, end):
            for h, m in hhmm:
                yield datetime(d.year, d.month, d.day, h, m, tzinfo=ET_TZ)
    elif mode == "full-30min":
        for d in iter_days(start, end):
            dt = datetime(d.year, d.month, d.day, 0, 0, tzinfo=ET_TZ)
            limit = datetime(d.year, d.month, d.day, 23, 59, tzinfo=ET_TZ)
            while dt <= limit:
                yield dt
                dt += timedelta(minutes=step_minutes)
    else:
        raise ValueError("mode inválido")


def fetch_one_report(dt_et: datetime):
    ts_plain = datetime(dt_et.year, dt_et.month, dt_et.day, dt_et.hour, dt_et.minute)
    try:
        if hasattr(injury, "check_reportvalid"):
            ok = injury.check_reportvalid(ts_plain)
            if not ok:
                return None, "invalid"
    except Exception:
        # Si check_reportvalid falla, igual intentamos get_reportdata.
        pass

    df = injury.get_reportdata(ts_plain, return_df=True)
    if df is None or len(df) == 0:
        return None, "empty"
    return df, "ok"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True, help="YYYY-MM-DD ET")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD ET")
    parser.add_argument("--mode", choices=["final-day", "full-30min"], default="final-day")
    parser.add_argument("--times", default="13:00,17:30,19:30,21:30", help="Solo final-day. Lista HH:MM ET")
    parser.add_argument("--step-minutes", type=int, default=30, help="Solo full-30min")
    parser.add_argument("--sleep", type=float, default=0.35)
    parser.add_argument("--init-db", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d").date()
    end = datetime.strptime(args.end, "%Y-%m-%d").date()
    if end < start:
        raise RuntimeError("--end no puede ser menor que --start")

    db_url = get_database_url()
    conn = None if args.dry_run else psycopg2.connect(db_url)

    checked = ok = inserted_total = skipped = failed = 0
    try:
        if conn and args.init_db:
            ensure_schema(conn)
            print("✅ Schema/tabla/vistas listas")

        for dt_et in iter_candidate_times(start, end, args.mode, args.times, args.step_minutes):
            if args.limit and checked >= args.limit:
                break
            checked += 1
            label = dt_et.strftime("%Y-%m-%d %H:%M ET")
            try:
                df, status = fetch_one_report(dt_et)
                if status != "ok":
                    skipped += 1
                    print(f"⚪ {label} | {status}")
                    time.sleep(args.sleep)
                    continue

                snapshot_key, rows = prepare_rows(df, dt_et)
                ok += 1
                if args.dry_run:
                    print(f"🧪 {label} | {snapshot_key} | filas={len(rows)}")
                else:
                    inserted = insert_rows(conn, rows)
                    inserted_total += inserted
                    print(f"✅ {label} | {snapshot_key} | filas={inserted}")
            except Exception as e:
                failed += 1
                print(f"⚠️ {label} | {type(e).__name__}: {e}")
            time.sleep(args.sleep)

        print("===========================================================")
        print("🏥 BACKFILL NBA INJURIES - RESUMEN")
        print("===========================================================")
        print(f"Candidatos revisados: {checked}")
        print(f"Reportes válidos: {ok}")
        print(f"Saltados vacío/no válido: {skipped}")
        print(f"Fallidos: {failed}")
        print(f"Filas insertadas/actualizadas: {inserted_total}")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
