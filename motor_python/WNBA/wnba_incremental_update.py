#!/usr/bin/env python3
"""Actualizador incremental WNBA -> Postgres/Supabase.

Principios:
* La base es el estado: no depende de los CSV históricos ni de .checkpoint.
* Solo descarga box scores que todavía no existen en player_game_stats.
* Cada ejecución guarda CSV con únicamente lo descargado en esa corrida.
* Los acumulados de la temporada actual se reemplazan en una transacción;
  son snapshots pequeños y no se pueden actualizar sumando filas.

Ejemplos:
  python wnba_incremental_update.py --mode probe --season 2026
  python wnba_incremental_update.py --mode backfill --season 2026 --max-games 3
  python wnba_incremental_update.py --mode backfill --season 2026
  python wnba_incremental_update.py --mode daily --season 2026
"""

from __future__ import annotations

import argparse
import os
import random
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

try:
    from nba_api.stats.endpoints import (
        BoxScoreAdvancedV3,
        BoxScoreTraditionalV3,
        CommonAllPlayers,
        LeagueDashPlayerStats,
        LeagueDashTeamStats,
        LeagueGameLog,
    )
except ImportError as exc:
    raise SystemExit(
        "Falta nba_api. Activá motor_python/.venv o instalá requirements_wnba_incremental.txt"
    ) from exc


LEAGUE_ID = "10"
SEASON_TYPES = ("Regular Season", "Playoffs")
SCRIPT_DIR = Path(__file__).resolve().parent


def load_env() -> None:
    candidates = (
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
        SCRIPT_DIR.parent.parent / ".env.local",
        SCRIPT_DIR.parent.parent / ".env",
        Path.home() / "stats-app/.env.local",
        Path.home() / "stats-app/.env",
        Path.home() / "stats-app/motor_python/.env.local",
        Path.home() / "stats-app/motor_python/.env",
    )
    for path in candidates:
        if path.exists():
            load_dotenv(path, override=False)


def db_url() -> str:
    load_env()
    for key in (
        "DATABASE_URL",
        "SUPABASE_DATABASE_URL",
        "SUPABASE_DB_URL",
        "POSTGRES_URL",
        "POSTGRES_DATABASE_URL",
    ):
        value = os.getenv(key)
        if value:
            return clean_db_url(value)
    raise RuntimeError("Falta DATABASE_URL/SUPABASE_DATABASE_URL/POSTGRES_URL")


def clean_db_url(value: str) -> str:
    parts = urlsplit(value)
    allowed = {
        "sslmode", "sslcert", "sslkey", "sslrootcert", "connect_timeout",
        "application_name", "keepalives", "keepalives_idle",
        "keepalives_interval", "keepalives_count", "target_session_attrs",
    }
    query = [(k, v) for k, v in parse_qsl(parts.query) if k in allowed]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def qident(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError(f"Identificador SQL inválido: {value!r}")
    return '"' + value + '"'


def request(endpoint, *, retries: int, pause: float, **kwargs):
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            time.sleep(pause + random.uniform(0.0, 0.45))
            return endpoint(timeout=90, **kwargs)
        except Exception as exc:  # nba_api expone varios tipos de excepción HTTP
            last_error = exc
            if attempt == retries:
                break
            wait = min(45.0, pause * (2 ** attempt) + random.uniform(0.5, 2.0))
            print(f"   intento {attempt}/{retries} falló: {exc}; reintento en {wait:.1f}s")
            time.sleep(wait)
    raise RuntimeError(f"Endpoint {endpoint.__name__} falló tras {retries} intentos: {last_error}")


def endpoint_df(result: Any, index: int = 0) -> pd.DataFrame:
    frames = result.get_data_frames()
    return frames[index].copy() if len(frames) > index else pd.DataFrame()


def snake(value: Any) -> str:
    text = str(value).strip()
    text = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", text)
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", text)
    text = re.sub(r"[^A-Za-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_").lower()


def normalized(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [snake(c) for c in out.columns]
    return out


def val(row: pd.Series, name: str) -> Any:
    value = row.get(name)
    return None if pd.isna(value) else value


def game_id_text(value: Any) -> str:
    return str(value).replace(".0", "").zfill(10)


def fetch_game_index(season: str, season_types: Iterable[str], retries: int, pause: float) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    now = datetime.utcnow()
    for season_type in season_types:
        print(f"📡 Índice {season} · {season_type}")
        result = request(
            LeagueGameLog,
            retries=retries,
            pause=pause,
            league_id=LEAGUE_ID,
            season=season,
            season_type_all_star=season_type,
            player_or_team_abbreviation="T",
        )
        frame = normalized(endpoint_df(result))
        if frame.empty:
            print("   sin filas")
            continue

        grouped: dict[str, dict[str, Any]] = {}
        for _, item in frame.iterrows():
            gid = game_id_text(item["game_id"])
            matchup = str(item.get("matchup") or "")
            game = grouped.setdefault(gid, {
                "game_id": gid,
                "season": season,
                "season_type": season_type,
                "game_date": pd.to_datetime(item.get("game_date"), errors="coerce").date(),
                "updated_at": now,
            })
            side = "home" if "vs." in matchup or " vs " in matchup else "away"
            game[f"{side}_team_id"] = val(item, "team_id")
            game[f"{side}_team_abbr"] = val(item, "team_abbreviation")
            game[f"{side}_pts"] = val(item, "pts")
            game[f"{side}_wl"] = val(item, "wl")
        rows.extend(grouped.values())
        print(f"   {len(grouped)} partidos cerrados detectados")
    return pd.DataFrame(rows).drop_duplicates(subset=["game_id"], keep="last") if rows else pd.DataFrame()


def teams_from_games(games: pd.DataFrame) -> pd.DataFrame:
    if games.empty:
        return pd.DataFrame()
    rows: dict[int, dict[str, Any]] = {}
    now = datetime.utcnow()
    for _, game in games.iterrows():
        for side in ("home", "away"):
            team_id = game.get(f"{side}_team_id")
            if pd.isna(team_id):
                continue
            tid = int(team_id)
            abbr = game.get(f"{side}_team_abbr")
            # LeagueGameLog no trae el nombre completo. No reemplazamos por la
            # abreviatura un team_name correcto que ya exista en la base.
            rows[tid] = {"team_id": tid, "team_abbr": abbr, "team_name": None, "updated_at": now}
    return pd.DataFrame(rows.values())


def player_traditional_rows(frame: pd.DataFrame, game: pd.Series, now: datetime) -> pd.DataFrame:
    frame = normalized(frame)
    rows = []
    for _, r in frame.iterrows():
        rows.append({
            "game_id": game["game_id"], "player_id": val(r, "person_id"),
            "player_name": f"{val(r, 'first_name') or ''} {val(r, 'family_name') or ''}".strip(),
            "team_id": val(r, "team_id"), "team_abbreviation": val(r, "team_tricode"),
            "season": game["season"], "season_type": game["season_type"],
            "start_position": val(r, "position"), "comment": val(r, "comment"),
            "minutes": val(r, "minutes"), "fgm": val(r, "field_goals_made"),
            "fga": val(r, "field_goals_attempted"), "fg_pct": val(r, "field_goals_percentage"),
            "fg3m": val(r, "three_pointers_made"), "fg3a": val(r, "three_pointers_attempted"),
            "fg3_pct": val(r, "three_pointers_percentage"), "ftm": val(r, "free_throws_made"),
            "fta": val(r, "free_throws_attempted"), "ft_pct": val(r, "free_throws_percentage"),
            "oreb": val(r, "rebounds_offensive"), "dreb": val(r, "rebounds_defensive"),
            "reb": val(r, "rebounds_total"), "ast": val(r, "assists"),
            "stl": val(r, "steals"), "blk": val(r, "blocks"),
            "turnovers": val(r, "turnovers"), "pf": val(r, "fouls_personal"),
            "pts": val(r, "points"), "plus_minus": val(r, "plus_minus_points"),
            "updated_at": now,
        })
    return pd.DataFrame(rows)


def player_advanced_rows(frame: pd.DataFrame, game: pd.Series, now: datetime) -> pd.DataFrame:
    frame = normalized(frame)
    rows = []
    for _, r in frame.iterrows():
        rows.append({
            "game_id": game["game_id"], "player_id": val(r, "person_id"),
            "player_name": f"{val(r, 'first_name') or ''} {val(r, 'family_name') or ''}".strip(),
            "team_id": val(r, "team_id"), "season": game["season"],
            "season_type": game["season_type"], "minutes": val(r, "minutes"),
            "e_fg_pct": val(r, "effective_field_goal_percentage"),
            "ts_pct": val(r, "true_shooting_percentage"), "usg_pct": val(r, "usage_percentage"),
            "off_rating": val(r, "offensive_rating"), "def_rating": val(r, "defensive_rating"),
            "net_rating": val(r, "net_rating"), "ast_pct": val(r, "assist_percentage"),
            "ast_to": val(r, "assist_to_turnover"), "ast_ratio": val(r, "assist_ratio"),
            "oreb_pct": val(r, "offensive_rebound_percentage"),
            "dreb_pct": val(r, "defensive_rebound_percentage"),
            "reb_pct": val(r, "rebound_percentage"), "pace": val(r, "pace"),
            "pie": val(r, "pie"), "updated_at": now,
        })
    return pd.DataFrame(rows)


def team_traditional_rows(frame: pd.DataFrame, game: pd.Series, now: datetime) -> pd.DataFrame:
    frame = normalized(frame)
    rows = []
    for _, r in frame.iterrows():
        rows.append({
            "game_id": game["game_id"], "team_id": val(r, "team_id"),
            "team_abbreviation": val(r, "team_tricode"), "team_name": val(r, "team_name"),
            "season": game["season"], "season_type": game["season_type"], "wl": None,
            "minutes": val(r, "minutes"), "fgm": val(r, "field_goals_made"),
            "fga": val(r, "field_goals_attempted"), "fg_pct": val(r, "field_goals_percentage"),
            "fg3m": val(r, "three_pointers_made"), "fg3a": val(r, "three_pointers_attempted"),
            "fg3_pct": val(r, "three_pointers_percentage"), "ftm": val(r, "free_throws_made"),
            "fta": val(r, "free_throws_attempted"), "ft_pct": val(r, "free_throws_percentage"),
            "oreb": val(r, "rebounds_offensive"), "dreb": val(r, "rebounds_defensive"),
            "reb": val(r, "rebounds_total"), "ast": val(r, "assists"),
            "stl": val(r, "steals"), "blk": val(r, "blocks"),
            "turnovers": val(r, "turnovers"), "pf": val(r, "fouls_personal"),
            "pts": val(r, "points"), "plus_minus": val(r, "plus_minus_points"),
            "updated_at": now,
        })
    return pd.DataFrame(rows)


def fetch_box(game: pd.Series, retries: int, pause: float) -> dict[str, pd.DataFrame]:
    gid = game["game_id"]
    traditional = request(BoxScoreTraditionalV3, retries=retries, pause=pause, game_id=gid)
    advanced = request(BoxScoreAdvancedV3, retries=retries, pause=pause, game_id=gid)
    trad_frames = traditional.get_data_frames()
    adv_frames = advanced.get_data_frames()
    if not trad_frames or trad_frames[0].empty:
        raise RuntimeError(f"Box score tradicional vacío para {gid}")
    now = datetime.utcnow()
    return {
        "player_game_stats": player_traditional_rows(trad_frames[0], game, now),
        "team_game_stats": team_traditional_rows(trad_frames[2], game, now) if len(trad_frames) > 2 else pd.DataFrame(),
        "player_game_stats_advanced": player_advanced_rows(adv_frames[0], game, now) if adv_frames else pd.DataFrame(),
    }


def concat_frames(parts: dict[str, list[pd.DataFrame]]) -> dict[str, pd.DataFrame]:
    return {
        name: pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        for name, frames in parts.items()
    }


def fetch_players(season: str, retries: int, pause: float) -> pd.DataFrame:
    try:
        result = request(
            CommonAllPlayers, retries=retries, pause=pause, league_id=LEAGUE_ID,
            season=season, is_only_current_season=1,
        )
    except Exception as exc:
        print(f"⚠️ Planteles no se refrescaron: {exc}")
        return pd.DataFrame()
    frame = normalized(endpoint_df(result))
    now = datetime.utcnow()
    rows = []
    for _, r in frame.iterrows():
        name = str(val(r, "display_first_last") or "").strip()
        first, _, last = name.partition(" ")
        rows.append({
            "player_id": val(r, "person_id"), "first_name": first, "last_name": last,
            "full_name": name, "is_active": 1 if str(val(r, "rosterstatus") or "0") == "1" else 0,
            "team_id": val(r, "team_id") or None, "team_abbr": val(r, "team_abbreviation"),
            "jersey": val(r, "jersey"), "position": val(r, "position"),
            "height": val(r, "height"), "weight": val(r, "weight"),
            "birth_date": val(r, "birthdate"), "experience": val(r, "season_exp"),
            "school": val(r, "school"), "country": val(r, "country"),
            "draft_year": val(r, "draft_year"), "draft_round": val(r, "draft_round"),
            "draft_number": val(r, "draft_number"), "updated_at": now,
        })
    return pd.DataFrame(rows)


def season_snapshots(season: str, season_types: Iterable[str], retries: int, pause: float) -> dict[str, pd.DataFrame]:
    parts: dict[str, list[pd.DataFrame]] = {
        "player_season_stats_base": [], "player_season_stats_advanced": [], "team_season_stats": [],
    }
    for season_type in season_types:
        for measure, table in (("Base", "player_season_stats_base"), ("Advanced", "player_season_stats_advanced")):
            print(f"📊 Snapshot jugadoras {season_type} · {measure}")
            try:
                result = request(
                    LeagueDashPlayerStats, retries=retries, pause=pause,
                    league_id_nullable=LEAGUE_ID, season=season,
                    season_type_all_star=season_type, per_mode_detailed="PerGame",
                    measure_type_detailed_defense=measure,
                )
                frame = normalized(endpoint_df(result))
            except Exception as exc:
                print(f"   omitido: {exc}")
                continue
            if not frame.empty:
                frame = frame.rename(columns={"tov": "turnovers"})
                frame["season"], frame["season_type"], frame["measure"] = season, season_type, measure
                frame["updated_at"] = datetime.utcnow()
                parts[table].append(frame)

        print(f"📊 Snapshot equipos {season_type}")
        try:
            result = request(
                LeagueDashTeamStats, retries=retries, pause=pause,
                league_id_nullable=LEAGUE_ID, season=season,
                season_type_all_star=season_type, per_mode_detailed="PerGame",
            )
            frame = normalized(endpoint_df(result))
        except Exception as exc:
            print(f"   omitido: {exc}")
            continue
        if not frame.empty:
            frame = frame.rename(columns={"tov": "turnovers"})
            frame["season"], frame["season_type"], frame["updated_at"] = season, season_type, datetime.utcnow()
            parts["team_season_stats"].append(frame)
    return concat_frames(parts)


def existing_ids(conn, schema: str, table: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(f"select distinct game_id::text from {qident(schema)}.{qident(table)}")
        return {game_id_text(row[0]) for row in cur.fetchall()}


def table_columns(conn, schema: str, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """select column_name from information_schema.columns
               where table_schema=%s and table_name=%s order by ordinal_position""",
            (schema, table),
        )
        return [row[0] for row in cur.fetchall()]


def py_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    if hasattr(value, "item"):
        return value.item()
    return value


def stage_frame(conn, schema: str, table: str, frame: pd.DataFrame) -> tuple[str, list[str]]:
    target_cols = table_columns(conn, schema, table)
    cols = [col for col in target_cols if col in frame.columns]
    if not cols:
        raise RuntimeError(f"{schema}.{table}: ninguna columna coincide con lo descargado")
    temp = f"tmp_wnba_{table}_{os.getpid()}"
    with conn.cursor() as cur:
        cur.execute(
            f"create temp table {qident(temp)} (like {qident(schema)}.{qident(table)} including defaults) on commit drop"
        )
        values = [tuple(py_value(v) for v in row) for row in frame[cols].itertuples(index=False, name=None)]
        execute_values(
            cur,
            f"insert into {qident(temp)} ({', '.join(qident(c) for c in cols)}) values %s",
            values,
            page_size=500,
        )
    return temp, cols


def merge_frame(conn, schema: str, table: str, frame: pd.DataFrame, keys: list[str], update: bool) -> tuple[int, int]:
    if frame.empty:
        return 0, 0
    temp, cols = stage_frame(conn, schema, table, frame)
    join = " and ".join(f"t.{qident(k)} = s.{qident(k)}" for k in keys)
    updated = 0
    with conn.cursor() as cur:
        mutable = [c for c in cols if c not in keys]
        if update and mutable:
            cur.execute(
                f"update {qident(schema)}.{qident(table)} t set "
                + ", ".join(
                    f"{qident(c)} = coalesce(s.{qident(c)}, t.{qident(c)})"
                    for c in mutable
                )
                + f" from {qident(temp)} s where {join}"
            )
            updated = cur.rowcount
        cur.execute(
            f"insert into {qident(schema)}.{qident(table)} ({', '.join(qident(c) for c in cols)}) "
            f"select {', '.join('s.' + qident(c) for c in cols)} from {qident(temp)} s "
            f"where not exists (select 1 from {qident(schema)}.{qident(table)} t where {join})"
        )
        inserted = cur.rowcount
    return inserted, updated


def replace_snapshot(conn, schema: str, table: str, frame: pd.DataFrame) -> int:
    if frame.empty:
        print(f"⚠️ {table}: snapshot vacío; se conserva lo existente")
        return 0
    temp, cols = stage_frame(conn, schema, table, frame)
    pairs = frame[["season", "season_type"]].drop_duplicates().itertuples(index=False, name=None)
    with conn.cursor() as cur:
        for season, season_type in pairs:
            cur.execute(
                f"delete from {qident(schema)}.{qident(table)} where season::text=%s and season_type=%s",
                (str(season), season_type),
            )
        cur.execute(
            f"insert into {qident(schema)}.{qident(table)} ({', '.join(qident(c) for c in cols)}) "
            f"select {', '.join(qident(c) for c in cols)} from {qident(temp)}"
        )
        return cur.rowcount


def save_run(output: Path, frames: dict[str, pd.DataFrame]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for name, frame in frames.items():
        if not frame.empty:
            frame.to_csv(output / f"{name}.csv", index=False, encoding="utf-8-sig")


RUN_TABLES = (
    "teams", "players", "games", "team_game_stats", "player_game_stats",
    "player_game_stats_advanced", "player_season_stats_base",
    "player_season_stats_advanced", "team_season_stats",
)


def load_run(folder: Path) -> dict[str, pd.DataFrame]:
    if not folder.is_dir():
        raise FileNotFoundError(f"No existe la carpeta de corrida: {folder}")
    frames: dict[str, pd.DataFrame] = {}
    for table in RUN_TABLES:
        path = folder / f"{table}.csv"
        if path.exists():
            frames[table] = pd.read_csv(
                path,
                encoding="utf-8-sig",
                dtype={"game_id": str, "season": str},
                low_memory=False,
            )
            if "game_id" in frames[table].columns:
                frames[table]["game_id"] = frames[table]["game_id"].map(game_id_text)
            print(f"📄 {table}: {len(frames[table])} filas recuperadas")
    required = {"games", "player_game_stats", "player_game_stats_advanced", "team_game_stats"}
    missing = sorted(required - set(frames))
    if missing:
        raise RuntimeError("La corrida está incompleta; faltan: " + ", ".join(missing))
    return frames


def upload_frames(frames: dict[str, pd.DataFrame], schema: str) -> None:
    """Abre una conexión fresca y mantiene toda la carga en una transacción."""
    conn = psycopg2.connect(
        db_url(),
        application_name="wnba_incremental_upload",
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    conn.autocommit = False
    try:
        jobs = (
            ("teams", ["team_id"], True),
            ("players", ["player_id"], True),
            ("games", ["game_id"], True),
            ("team_game_stats", ["game_id", "team_id"], False),
            ("player_game_stats", ["game_id", "player_id"], False),
            ("player_game_stats_advanced", ["game_id", "player_id"], False),
        )
        for table, keys, update in jobs:
            inserted, updated = merge_frame(
                conn, schema, table, frames.get(table, pd.DataFrame()), keys, update
            )
            print(f"⬆️ {table}: +{inserted} nuevos · {updated} actualizados")
        for table in (
            "player_season_stats_base", "player_season_stats_advanced", "team_season_stats"
        ):
            if table in frames:
                count = replace_snapshot(conn, schema, table, frames[table])
                print(f"🔄 {table}: {count} filas del snapshot")
        conn.commit()
    except Exception:
        if not conn.closed:
            conn.rollback()
        raise
    finally:
        if not conn.closed:
            conn.close()


def print_range(frame: pd.DataFrame) -> str:
    if frame.empty or "game_date" not in frame:
        return "—"
    return f"{frame['game_date'].min()} → {frame['game_date'].max()}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Actualización incremental WNBA")
    parser.add_argument("--mode", choices=("probe", "backfill", "daily"), default="probe")
    parser.add_argument("--season", default=str(date.today().year))
    parser.add_argument("--season-types", default=",".join(SEASON_TYPES))
    parser.add_argument("--schema", default="wnba_api_data")
    parser.add_argument("--max-games", type=int, default=0, help="0 = todos los pendientes")
    parser.add_argument("--skip-season-snapshots", action="store_true")
    parser.add_argument("--pause", type=float, default=1.0)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--output-root", default=str(SCRIPT_DIR / "incremental_runs"))
    parser.add_argument(
        "--upload-run",
        help="Sube una carpeta incremental_runs ya descargada, sin llamar nuevamente a la API",
    )
    args = parser.parse_args()

    season_types = tuple(x.strip() for x in args.season_types.split(",") if x.strip())
    print("=" * 64)
    print(f"WNBA INCREMENTAL · {args.mode.upper()} · season {args.season}")
    print("=" * 64)

    if args.upload_run:
        run_folder = Path(args.upload_run).expanduser().resolve()
        print(f"♻️ Recuperando corrida: {run_folder}")
        frames = load_run(run_folder)
        upload_frames(frames, args.schema)
        print("✅ Corrida recuperada y subida. No se repitieron descargas.")
        return 0

    games = fetch_game_index(args.season, season_types, args.retries, args.pause)
    games = games[games["game_date"] <= date.today()].copy() if not games.empty else games

    # La conexión usada para comparar IDs se cierra antes de la descarga larga.
    # Supabase/pooler puede cerrar conexiones SSL que quedan ociosas varios minutos.
    lookup_conn = psycopg2.connect(db_url(), application_name="wnba_incremental_lookup")
    try:
        db_games = existing_ids(lookup_conn, args.schema, "games")
        db_boxes = existing_ids(lookup_conn, args.schema, "player_game_stats")
    finally:
        lookup_conn.close()

    new_games = games[~games["game_id"].isin(db_games)].copy()
    pending = games[~games["game_id"].isin(db_boxes)].sort_values("game_date").copy()

    print(f"Base: {len(db_games)} partidos · {len(db_boxes)} con box score")
    print(f"Proveedor: {len(games)} cerrados ({print_range(games)})")
    print(f"Pendientes: {len(new_games)} partidos nuevos · {len(pending)} box scores")

    if args.max_games > 0:
        pending = pending.head(args.max_games).copy()
        print(f"Límite de prueba: {len(pending)} box scores")

    if args.mode == "probe":
        if not pending.empty:
            probe_game = pending.iloc[0]
            print(f"🧪 Probando box score {probe_game['game_id']} · {probe_game['game_date']}")
            probe = fetch_box(probe_game, args.retries, args.pause)
            for name, frame in probe.items():
                print(f"   {name}: {len(frame)} filas")
        else:
            print("✅ No hay box scores pendientes para probar")
        print("✅ Probe terminado. No se escribió en Supabase ni en CSV históricos.")
        return 0

    parts: dict[str, list[pd.DataFrame]] = {
        "player_game_stats": [], "player_game_stats_advanced": [], "team_game_stats": [],
    }
    complete_games: list[str] = []
    failed: list[str] = []
    for index, (_, game) in enumerate(pending.iterrows(), start=1):
        print(f"[{index}/{len(pending)}] {game['game_id']} · {game['game_date']}")
        try:
            downloaded = fetch_box(game, args.retries, args.pause)
        except Exception as exc:
            print(f"   ❌ {exc}")
            failed.append(game["game_id"])
            continue
        if downloaded["player_game_stats"].empty:
            failed.append(game["game_id"])
            continue
        for name, frame in downloaded.items():
            if not frame.empty:
                parts[name].append(frame)
        complete_games.append(game["game_id"])
    box_frames = concat_frames(parts)
    games_to_write = games[games["game_id"].isin(complete_games)].copy()

    frames: dict[str, pd.DataFrame] = {
        "games": games_to_write,
        "teams": teams_from_games(games),
        **box_frames,
        "players": fetch_players(args.season, args.retries, args.pause),
    }
    if not args.skip_season_snapshots:
        frames.update(season_snapshots(args.season, season_types, args.retries, args.pause))

    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    output = Path(args.output_root).expanduser() / f"{args.mode}_{args.season}_{stamp}"
    save_run(output, frames)
    print(f"📁 CSV de esta corrida: {output}")

    # Conexión nueva: nunca estuvo ociosa durante la descarga.
    upload_frames(frames, args.schema)

    print("=" * 64)
    print(f"✅ Actualización terminada · partidos completos: {len(complete_games)} · fallidos: {len(failed)}")
    if failed:
        print("Reintentará en la próxima corrida: " + ", ".join(failed))
    print("Los CSV históricos de wnba_data no fueron leídos ni reescritos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
