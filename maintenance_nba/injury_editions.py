"""Guarda la edición oficial más reciente por equipo y partido, sin duplicar snapshots."""
from __future__ import annotations

import argparse
from datetime import datetime
import re
from pathlib import Path

STATUS = {"out", "doubtful", "questionable", "probable", "available"}
PENDING = "not yet submitted"
NO_ROWS = {"no injuries to report", "no injuries reported", "no player injuries reported"}
SCHEMA = Path(__file__).resolve().parents[1] / "sql" / "20261121_nba_injury_editions.sql"


def value(row, key):
    text = str(row.get(key) if row.get(key) is not None else "").strip()
    return "" if text.lower() in ("nan", "nat", "<na>") else " ".join(text.split())


def game_day(raw):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:10], fmt).date()
        except ValueError:
            pass
    return None


def team_editions(rows):
    grouped = {}
    for row in rows:
        date, team = game_day(value(row, "Game Date")), value(row, "Team")
        matchup = re.sub(r"\s+", "", value(row, "Matchup")).upper()
        if not date or not team or len(team) > 60 or not re.fullmatch(r"[A-Z]{2,3}@[A-Z]{2,3}", matchup):
            continue
        player, status, reason = (value(row, c) for c in ("Player Name", "Current Status", "Reason"))
        signals = {s.casefold().strip(".") for s in (player, status, reason)}
        mark = "pending" if PENDING in signals else "clear" if signals & NO_ROWS else "listed" if player and status.casefold() in STATUS else None
        if mark is None:
            continue
        group = grouped.setdefault((date, matchup, team), {"status": mark, "players": {}})
        if group["status"] != mark:
            raise ValueError("Edición ambigua para un equipo")
        if mark == "listed":
            record = {"name": player[:120], "status": status.upper(), "reason": reason[:600] or None}
            old = group["players"].setdefault(player.casefold(), record)
            if old != record:
                raise ValueError("Dos estados del mismo jugador en la edición oficial")
    if not grouped or any(len(g["players"]) > 30 for g in grouped.values()):
        raise ValueError("Sin ediciones de equipo verificadas")
    return [(date, matchup, team, g["status"], list(g["players"].values()))
            for (date, matchup, team), g in sorted(grouped.items())]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path.cwd())
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--init", action="store_true")
    mode.add_argument("--check", action="store_true", help="Descarga y valida una edición sin escribir")
    mode.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    try:
        from dotenv import load_dotenv
        for candidate in (".env.local", ".env"):
            load_dotenv(args.project / candidate, override=False)
        import psycopg2
        from psycopg2.extras import Json, execute_values
        from sync_nba_injuries_nbainjuries_v2 import get_database_url, fetch_report_with_fallback, round_down_minutes, ET_TZ
        if args.init:
            with psycopg2.connect(get_database_url()) as conn, conn.cursor() as cur:
                cur.execute(SCHEMA.read_text())
            print("Caché de ediciones NBA disponible.")
            return
        at, frame = fetch_report_with_fallback(round_down_minutes(datetime.now(ET_TZ)), 45)
        editions = team_editions(frame.to_dict(orient="records"))
        if args.check:
            print(f"Edición {at.isoformat()} · {len(editions)} equipos/partidos · sin escritura.")
            return
        with psycopg2.connect(get_database_url(), connect_timeout=8) as conn, conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '18s'")
            execute_values(cur, """INSERT INTO nba_api_data.nba_injury_editions AS current
                    (game_date, matchup, team, state, players, report_ts) VALUES %s
                ON CONFLICT (game_date, matchup, team) DO UPDATE
                SET state=EXCLUDED.state,players=EXCLUDED.players,report_ts=EXCLUDED.report_ts
                WHERE EXCLUDED.report_ts > current.report_ts""",
                [(day, match, team, state, Json(players), at) for day, match, team, state, players in editions],
                page_size=max(1, len(editions)))
            changed = cur.rowcount
        print(f"Edición {at.isoformat()} · {len(editions)} equipos/partidos · {changed} actualizados.")
    except Exception as error:
        parser.exit(1, f"No se pudo verificar la edición oficial ({type(error).__name__}). Se conserva el último parte.\n")


if __name__ == "__main__":
    main()
