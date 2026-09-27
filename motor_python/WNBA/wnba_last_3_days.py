#!/usr/bin/env python3
"""Completa únicamente los partidos WNBA faltantes de una ventana reciente.

La base de datos es la fuente de verdad. El script consulta el índice oficial,
limita la muestra a hoy y los N-1 días anteriores (hora de Argentina), compara
por game_id y solo descarga/sube las tablas que estén incompletas.

Ejemplos:
  python wnba_last_3_days.py --season 2026 --dry-run
  python wnba_last_3_days.py --season 2026 --apply
  python wnba_last_3_days.py --season 2026 --apply --max-games 1
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg2

from wnba_incremental_update import (
    SCRIPT_DIR,
    concat_frames,
    db_url,
    existing_ids,
    fetch_box,
    fetch_game_index,
    game_id_text,
    merge_frame,
    save_run,
)


TIMEZONE = ZoneInfo("America/Argentina/Buenos_Aires")
BOX_TABLES = ("player_game_stats", "player_game_stats_advanced", "team_game_stats")


def recent_window(days: int) -> tuple[object, object]:
    end = datetime.now(TIMEZONE).date()
    return end - timedelta(days=days - 1), end


def subset_by_ids(frame: pd.DataFrame, ids: set[str]) -> pd.DataFrame:
    if frame.empty or not ids:
        return pd.DataFrame()
    normalized_ids = frame["game_id"].map(game_id_text)
    return frame[normalized_ids.isin(ids)].copy()


def database_state(schema: str) -> dict[str, set[str]]:
    conn = psycopg2.connect(
        db_url(),
        application_name="wnba_last_3_days_lookup",
        connect_timeout=20,
    )
    try:
        return {
            table: existing_ids(conn, schema, table)
            for table in ("games", *BOX_TABLES)
        }
    finally:
        conn.close()


def upload_missing(frames: dict[str, pd.DataFrame], schema: str) -> None:
    """Inserta solo inexistentes; nunca actualiza ni borra filas históricas."""
    conn = psycopg2.connect(
        db_url(),
        application_name="wnba_last_3_days_upload",
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    conn.autocommit = False
    try:
        jobs = (
            ("games", ["game_id"]),
            ("team_game_stats", ["game_id", "team_id"]),
            ("player_game_stats", ["game_id", "player_id"]),
            ("player_game_stats_advanced", ["game_id", "player_id"]),
        )
        for table, keys in jobs:
            frame = frames.get(table, pd.DataFrame())
            inserted, _ = merge_frame(conn, schema, table, frame, keys, update=False)
            print(f"⬆️ {table}: +{inserted} filas nuevas")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Descarga los últimos días WNBA y sube únicamente lo faltante"
    )
    parser.add_argument("--season", default=str(datetime.now(TIMEZONE).year))
    parser.add_argument("--season-types", default="Regular Season,Playoffs")
    parser.add_argument("--days", type=int, default=3)
    parser.add_argument("--schema", default="wnba_api_data")
    parser.add_argument("--max-games", type=int, default=0, help="0 = todos los pendientes")
    parser.add_argument("--pause", type=float, default=1.0)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--output-root", default=str(SCRIPT_DIR / "incremental_runs"))
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--dry-run", action="store_true", help="Compara sin descargar ni escribir")
    action.add_argument("--apply", action="store_true", help="Descarga y sube únicamente faltantes")
    args = parser.parse_args()

    if args.days < 1 or args.days > 14:
        parser.error("--days debe estar entre 1 y 14")
    if args.max_games < 0:
        parser.error("--max-games no puede ser negativo")

    start, end = recent_window(args.days)
    season_types = tuple(value.strip() for value in args.season_types.split(",") if value.strip())

    print("=" * 66)
    print(f"WNBA ÚLTIMOS {args.days} DÍAS · {start} → {end}")
    print("=" * 66)

    games = fetch_game_index(args.season, season_types, args.retries, args.pause)
    if games.empty:
        print("✅ El proveedor no devolvió partidos cerrados para la temporada.")
        return 0

    games["game_id"] = games["game_id"].map(game_id_text)
    games = games[(games["game_date"] >= start) & (games["game_date"] <= end)].copy()
    games = games.sort_values(["game_date", "game_id"])
    print(f"Partidos cerrados en la ventana: {len(games)}")

    state = database_state(args.schema)
    provider_ids = set(games["game_id"])
    missing: dict[str, set[str]] = {
        table: provider_ids - state[table]
        for table in ("games", *BOX_TABLES)
    }

    for table in ("games", *BOX_TABLES):
        print(f"   {table}: {len(missing[table])} partidos faltantes")

    pending_box_ids = set().union(*(missing[table] for table in BOX_TABLES))
    pending = games[games["game_id"].isin(pending_box_ids)].copy()
    if args.max_games:
        pending = pending.head(args.max_games).copy()
        selected = set(pending["game_id"])
        for table in BOX_TABLES:
            missing[table] &= selected
        print(f"Límite aplicado: {len(pending)} box scores")

    if args.dry_run:
        if pending.empty and not missing["games"]:
            print("✅ La ventana ya está completa. No hay nada para descargar o subir.")
        else:
            print(f"🧪 Se descargarían {len(pending)} box scores; no se escribió nada.")
        return 0

    parts: dict[str, list[pd.DataFrame]] = {table: [] for table in BOX_TABLES}
    completed: set[str] = set()
    failed: list[str] = []

    for index, (_, game) in enumerate(pending.iterrows(), start=1):
        game_id = game_id_text(game["game_id"])
        print(f"[{index}/{len(pending)}] {game_id} · {game['game_date']}")
        try:
            downloaded = fetch_box(game, args.retries, args.pause)
        except Exception as exc:
            print(f"   ❌ {exc}")
            failed.append(game_id)
            continue

        required_ok = True
        for table in BOX_TABLES:
            if game_id not in missing[table]:
                continue
            frame = downloaded.get(table, pd.DataFrame())
            if frame.empty:
                print(f"   ⚠️ {table} llegó vacío")
                required_ok = False
                continue
            parts[table].append(frame)
        if required_ok:
            completed.add(game_id)

    box_frames = concat_frames(parts)
    frames: dict[str, pd.DataFrame] = {
        "games": subset_by_ids(games, missing["games"]),
        **{
            table: subset_by_ids(box_frames.get(table, pd.DataFrame()), missing[table])
            for table in BOX_TABLES
        },
    }

    if not any(not frame.empty for frame in frames.values()):
        print("✅ No quedaron filas nuevas para subir.")
        return 0

    stamp = datetime.now(TIMEZONE).strftime("%Y%m%d_%H%M%S")
    output = Path(args.output_root).expanduser() / f"last_{args.days}_days_{args.season}_{stamp}"
    save_run(output, frames)
    print(f"📁 Respaldo de esta corrida: {output}")

    upload_missing(frames, args.schema)
    print("=" * 66)
    print(f"✅ Terminado · box scores completos: {len(completed)} · fallidos: {len(failed)}")
    if failed:
        print("Se reintentarán en la próxima ejecución: " + ", ".join(failed))
    print("No se borraron, actualizaron ni reescribieron filas históricas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
