#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_picks_betano_hitos_ludo.py

Cruza cuotas de hitos Betano con predicciones Ludo y calcula EV.
Usa Postgres/Supabase como fuente de cuotas y destino de picks. Es flexible con nombres de columnas de predicciones.

Tabla de cuotas esperada:
  public.player_prop_odds

Predicciones:
  lee directamente el CSV que genera Ludo: ludo_predictions.csv
  opcionalmente puede leer una tabla Postgres si la pasás con --pred-table.

Detecta automáticamente columnas típicas de tu generador:
  player_name, prop_type, proj, model_mae, matchup

Uso:
  python3 generar_picks_betano_hitos_ludo.py --dry-run --top 20
  python3 generar_picks_betano_hitos_ludo.py --db ludo.db --pred-table predicciones_ludo --dry-run --top 20
  python3 generar_picks_betano_hitos_ludo.py --save-db --top 20
"""

from __future__ import annotations

import argparse
import csv
import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from datetime import datetime, timezone
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor, execute_values
except ImportError:
    print("ERROR: falta psycopg2-binary.")
    print("Instalá con: python3 -m pip install --user psycopg2-binary")
    raise
from typing import Any

from betano_hitos_utils import (
    DEFAULT_STD_BY_STAT,
    ev_decimal,
    implied_probability,
    normalize_text,
    prob_over_normal,
    write_csv_dicts,
)


def load_env_file() -> None:
    """Carga .env.local/.env para que el cálculo de hit-rate pueda leer DB_PASSWORD.

    Importante: carga TODOS los env encontrados, no solo el primero.
    En este proyecto .env.local puede tener Supabase/API y ../.env puede tener DB_PASSWORD.
    No pisa variables ya exportadas.
    """
    candidates = []
    for base in [Path.cwd(), Path(__file__).resolve().parent, Path.home() / "stats-app"]:
        candidates.append(base / ".env.local")
        candidates.append(base / ".env")
        for parent in base.parents:
            candidates.append(parent / ".env.local")
            candidates.append(parent / ".env")
            if parent == Path.home():
                break

    seen = set()
    loaded_files = []
    loaded_keys = 0

    for env_path in candidates:
        env_path = env_path.resolve()
        if env_path in seen:
            continue
        seen.add(env_path)
        if not env_path.exists() or not env_path.is_file():
            continue

        file_loaded = 0
        try:
            with env_path.open("r", encoding="utf-8") as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    if line.startswith("export "):
                        line = line[len("export "):].strip()
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value
                        file_loaded += 1
        except Exception:
            continue

        if file_loaded:
            loaded_files.append(str(env_path))
            loaded_keys += file_loaded

    if loaded_files:
        print(f"✅ Env para hit-rate cargado: {len(loaded_files)} archivo(s), {loaded_keys} variables nuevas | DB_PASSWORD={bool(os.getenv('DB_PASSWORD'))}")
    else:
        print(f"⚠️ No se cargó ningún .env para hit-rate | DB_PASSWORD={bool(os.getenv('DB_PASSWORD'))}")


load_env_file()

ODDS_TABLE = "public.player_prop_odds"
PICKS_TABLE = "public.picks_betano_hitos"

POSTGRES_ENV_KEYS = [
    "SUPABASE_DATABASE_URL",
    "DIRECT_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_DATABASE_URL",
    "SUPABASE_POSTGRES_URL",
    "SUPABASE_DB_URL",
]

PLAYER_COLS = ["player_norm", "jugador_norm", "player_name_norm", "player", "jugador", "player_name", "nombre_jugador"]
STAT_COLS = ["stat_key", "stat", "target", "mercado", "categoria", "prop_type"]
MEAN_COLS = ["pred_mean", "projection", "proj", "mean", "media", "y_pred", "pred", "prediccion", "valor_predicho", "ludo_pred"]
STD_COLS = ["pred_std", "std", "sigma", "desvio", "error_std", "model_mae", "mae"]
GAME_COLS = ["game_norm", "partido_norm", "game_key", "partido", "matchup"]
TEAM_COLS = ["team_abbreviation", "team", "team_abbr", "player_team", "pred_team"]
ID_COLS = ["player_id", "nba_player_id", "id_jugador"]

STAT_ALIASES = {
    "points": "PTS", "puntos": "PTS", "pts": "PTS", "PTS": "PTS",
    "rebounds": "REB", "rebotes": "REB", "reb": "REB", "REB": "REB",
    "assists": "AST", "asistencias": "AST", "ast": "AST", "AST": "AST",
    "threes": "3PM", "triples": "3PM", "3pm": "3PM", "3PM": "3PM", "3pt": "3PM", "3PT": "3PM", "fg3m": "3PM",
    "steals": "STL", "robos": "STL", "stl": "STL", "STL": "STL",
    "blocks": "BLK", "tapones": "BLK", "blk": "BLK", "BLK": "BLK",
    "pra": "PRA", "PRA": "PRA",
    "ra": "RA", "RA": "RA",
    "pr": "PR", "PR": "PR",
    "pa": "PA", "PA": "PA",
}


TEAM_ALIASES = {
    "ATL": ["atlanta", "hawks"],
    "BOS": ["boston", "celtics"],
    "BKN": ["brooklyn", "nets"],
    "CHA": ["charlotte", "hornets"],
    "CHI": ["chicago", "bulls"],
    "CLE": ["cleveland", "cavaliers"],
    "DAL": ["dallas", "mavericks"],
    "DEN": ["denver", "nuggets"],
    "DET": ["detroit", "pistons"],
    "GSW": ["golden state", "warriors"],
    "HOU": ["houston", "rockets"],
    "IND": ["indiana", "pacers"],
    "LAC": ["clippers", "los angeles clippers"],
    "LAL": ["lakers", "los angeles lakers"],
    "MEM": ["memphis", "grizzlies"],
    "MIA": ["miami", "heat"],
    "MIL": ["milwaukee", "bucks"],
    "MIN": ["minnesota", "timberwolves"],
    "NOP": ["new orleans", "pelicans"],
    "NYK": ["new york", "knicks"],
    "OKC": ["oklahoma city", "thunder"],
    "ORL": ["orlando", "magic"],
    "PHI": ["philadelphia", "76ers", "76ers"],
    "PHX": ["phoenix", "suns"],
    "POR": ["portland", "trail blazers", "trail-blazers"],
    "SAC": ["sacramento", "kings"],
    "SAS": ["san antonio", "spurs"],
    "TOR": ["toronto", "raptors"],
    "UTA": ["utah", "jazz"],
    "WAS": ["washington", "wizards"],
}



def normalize_postgres_url(url: str) -> str:
    """Limpia parámetros que psycopg2 no acepta y agrega sslmode=require."""
    url = (url or "").strip().strip('"').strip("'")
    parsed = urlparse(url)
    if parsed.scheme not in ("postgresql", "postgres"):
        return url

    allowed = {"sslmode", "connect_timeout", "application_name", "target_session_attrs"}
    params = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k in allowed]
    if not any(k == "sslmode" for k, _ in params):
        params.append(("sslmode", "require"))

    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(params), parsed.fragment))


def get_database_url(cli_value: str | None = None) -> str:
    load_env_file()
    url = (cli_value or "").strip()
    if not url:
        for key in POSTGRES_ENV_KEYS:
            value = os.getenv(key)
            if value:
                url = value.strip()
                break
    if not url:
        raise RuntimeError(
            "No encontré URL Postgres/Supabase. Agregá SUPABASE_DATABASE_URL, DIRECT_URL o DATABASE_URL en .env.local "
            "o pasá --db-url."
        )
    if url.endswith(".db"):
        raise RuntimeError("Recibí un archivo .db, pero este script ahora trabaja con Postgres/Supabase.")
    return normalize_postgres_url(url)


def split_table_name(table: str) -> tuple[str, str]:
    raw = (table or "").strip().replace('"', "")
    if "." in raw:
        schema, name = raw.split(".", 1)
    else:
        schema, name = "public", raw
    return schema, name


def qname(table: str) -> str:
    schema, name = split_table_name(table)
    return f'"{schema}"."{name}"'


def qident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def connect(db_url: str | None):
    return psycopg2.connect(get_database_url(db_url), cursor_factory=RealDictCursor)


def table_exists(con, table: str) -> bool:
    with con.cursor() as cur:
        cur.execute("SELECT to_regclass(%s) AS reg", (table,))
        row = cur.fetchone()
    return bool(row and row.get("reg"))


def columns(con, table: str) -> list[str]:
    schema, name = split_table_name(table)
    with con.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, name),
        )
        return [r["column_name"] for r in cur.fetchall()]

def pick_col(cols: list[str], candidates: list[str], required: bool = True) -> str | None:
    low = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand.lower() in low:
            return low[cand.lower()]
    if required:
        raise ValueError(f"No encontré ninguna columna entre {candidates}. Columnas disponibles: {cols}")
    return None


def norm_stat(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in STAT_ALIASES:
        return STAT_ALIASES[raw]
    n = normalize_text(raw)
    return STAT_ALIASES.get(n, raw.upper())


def to_float(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None or v == "":
            return default
        return float(str(v).replace(",", "."))
    except Exception:
        return default

def to_int(v: Any, default: int = 0) -> int:
    try:
        if v is None or v == "":
            return default
        return int(float(str(v).replace(",", ".")))
    except Exception:
        return default


def get_pg_engine_optional():
    """Conexión opcional a Postgres/Supabase para calcular hit-rate L5/L10."""
    try:
        from sqlalchemy import create_engine
    except Exception:
        return None

    try:
        return create_engine(get_database_url(None), pool_pre_ping=True)
    except Exception:
        password = os.getenv("DB_PASSWORD")
        if not password:
            return None
        try:
            from sqlalchemy.engine import URL
            db_url = URL.create(
                drivername="postgresql",
                username=os.getenv("DB_USERNAME", "postgres"),
                password=password,
                host=os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
                port=int(os.getenv("DB_PORT", "6543")),
                database=os.getenv("DB_NAME", "postgres"),
                query={"sslmode": "require"},
            )
            return create_engine(db_url, pool_pre_ping=True)
        except Exception:
            return None


def load_hit_history(player_ids: list[int]):
    """Carga historial mínimo para hit-rate. Es opcional y tolerante a columnas."""
    if not player_ids:
        return None
    engine = get_pg_engine_optional()
    if engine is None:
        return None

    import pandas as pd
    from sqlalchemy import text

    base_cols = "player_id, game_date, game_id, pts, reb, ast, fg3m"
    extra_cols = ", stl, blk"
    query_template = """
        SELECT {cols}
        FROM v_ludo_train_model_ready
        WHERE player_id = ANY(:player_ids)
          AND game_date >= '2025-10-01'
          AND min > 0
        ORDER BY player_id, game_date, game_id
    """
    try:
        df = pd.read_sql(text(query_template.format(cols=base_cols + extra_cols)), engine, params={"player_ids": player_ids})
    except Exception:
        try:
            df = pd.read_sql(text(query_template.format(cols=base_cols)), engine, params={"player_ids": player_ids})
        except Exception as e:
            print(f"⚠️ No pude calcular hit-rate L5/L10 desde Postgres: {e}")
            return None

    if df.empty:
        return None

    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    for c in ["pts", "reb", "ast", "fg3m", "stl", "blk"]:
        if c not in df.columns:
            df[c] = None
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df["PTS"] = df["pts"]
    df["REB"] = df["reb"]
    df["AST"] = df["ast"]
    df["3PM"] = df["fg3m"]
    df["PRA"] = df["PTS"] + df["REB"] + df["AST"]
    df["PR"] = df["PTS"] + df["REB"]
    df["PA"] = df["PTS"] + df["AST"]
    df["RA"] = df["REB"] + df["AST"]
    df["STL"] = df["stl"]
    df["BLK"] = df["blk"]
    return df


def add_hit_rates(picks: list[dict], args) -> list[dict]:
    """Agrega hit_l5/hit_l10 a picks de hitos Betano.

    Prioridad: hito 9+ se evalúa como línea modelo 8.5, o sea valor > 8.5.
    Si no hay historial disponible, mantiene N/D sin romper nada.
    """
    if not getattr(args, "with_hit_rates", True) or not picks:
        return picks

    player_ids = sorted({to_int(p.get("player_id"), 0) for p in picks if to_int(p.get("player_id"), 0) > 0})
    hist = load_hit_history(player_ids)
    if hist is None or hist.empty:
        print("ℹ️ Hit-rate L5/L10 no disponible; se mantiene N/D.")
        return picks

    enriched = 0
    grouped = {int(pid): g.sort_values(["game_date", "game_id"]).copy() for pid, g in hist.groupby("player_id")}
    for p in picks:
        pid = to_int(p.get("player_id"), 0)
        stat = norm_stat(p.get("stat_key"))
        line = to_float(p.get("model_line"), None)
        g = grouped.get(pid)
        if g is None or line is None or stat not in g.columns:
            p.setdefault("hit_rate", "N/D")
            p.setdefault("hit_l5", "")
            p.setdefault("n_l5", "")
            p.setdefault("hit_l10", "")
            p.setdefault("n_l10", "")
            p.setdefault("hr_l5", "")
            p.setdefault("hr_l10", "")
            continue

        vals10 = g.tail(10)[stat].dropna()
        vals5 = vals10.tail(5)
        n10 = int(len(vals10))
        n5 = int(len(vals5))
        hit10 = int((vals10 > line).sum()) if n10 else 0
        hit5 = int((vals5 > line).sum()) if n5 else 0
        hr10 = hit10 / n10 if n10 else 0.0
        hr5 = hit5 / n5 if n5 else 0.0

        p["hit_l5"] = str(hit5)
        p["n_l5"] = str(n5)
        p["hit_l10"] = str(hit10)
        p["n_l10"] = str(n10)
        p["hr_l5"] = f"{hr5:.6f}"
        p["hr_l10"] = f"{hr10:.6f}"
        p["hit_rate"] = f"{hit5}/{n5} | {hit10}/{n10}"
        enriched += 1

    print(f"✅ Hit-rate L5/L10 calculado para {enriched}/{len(picks)} picks")
    return picks




def keep_by_ev_or_hit_rate(p: dict, args) -> tuple[bool, str]:
    """Filtro final del pool.

    Mantiene la lógica vieja por EV, pero permite conservar picks de cuota baja
    cuando vienen con respaldo real L5/L10. Si no hay hit-rate, solo aplica EV.
    """
    ev = float(to_float(p.get("ev"), 0.0) or 0.0)
    if ev >= args.min_ev:
        return True, "EV"

    hit5 = to_int(p.get("hit_l5"), 0)
    n5 = to_int(p.get("n_l5"), 0)
    hit10 = to_int(p.get("hit_l10"), 0)
    n10 = to_int(p.get("n_l10"), 0)
    prob = float(to_float(p.get("prob_model"), 0.0) or 0.0)

    if n5 < 5 or prob < args.hr_override_min_prob or ev < args.hr_override_min_ev:
        return False, "DESCARTADO"

    # 5/5 manda, pero usamos L10 como confirmación si está disponible.
    if hit5 >= 5 and (n10 < 10 or hit10 >= 7):
        return True, "HR_5_5"

    # 4/5 necesita mejor confirmación L10.
    if hit5 >= 4 and n10 >= 10 and hit10 >= 8:
        return True, "HR_4_5_CONF"

    return False, "DESCARTADO"

def row_value(row: Any, col: str | None, default: Any = None) -> Any:
    if not col:
        return default
    try:
        return row[col]
    except Exception:
        if hasattr(row, "get"):
            return row.get(col, default)
        return default


def game_tokens(game_norm: str) -> set[str]:
    return {t for t in str(game_norm or "").split() if t}


def games_match(a: str, b: str) -> bool:
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    return game_tokens(a_norm) == game_tokens(b_norm)


def team_in_game(team: str, game_text: str) -> bool:
    """True si el equipo del jugador aparece en el texto del partido.

    Esto evita falsos positivos donde el jugador/stat matchea, pero el jugador
    queda asociado a un partido que no corresponde a su equipo.
    """
    team = str(team or "").upper().strip()
    if not team:
        return False
    game_norm = normalize_text(game_text)
    if not game_norm:
        return False
    aliases = TEAM_ALIASES.get(team, [team])
    return any(normalize_text(alias) in game_norm for alias in aliases)


def _build_predictions_from_iter(rows_iter, cols: list[str], args, source_name: str) -> dict[tuple[str, str], list[dict]]:
    player_col = args.player_col or pick_col(cols, PLAYER_COLS)
    stat_col = args.stat_col or pick_col(cols, STAT_COLS)
    mean_col = args.mean_col or pick_col(cols, MEAN_COLS)
    std_col = args.std_col or pick_col(cols, STD_COLS, required=False)
    game_col = args.game_col or pick_col(cols, GAME_COLS, required=False)
    team_col = args.team_col or pick_col(cols, TEAM_COLS, required=False)
    id_col = args.player_id_col or pick_col(cols, ID_COLS, required=False)

    preds: dict[tuple[str, str], list[dict]] = {}
    rows_count = 0
    for r in rows_iter:
        rows_count += 1
        player_raw = row_value(r, player_col, "")
        stat_raw = row_value(r, stat_col, "")
        mean_raw = row_value(r, mean_col, None)
        std_raw = row_value(r, std_col, None) if std_col else None
        game_raw = row_value(r, game_col, "") if game_col else ""
        team_raw = row_value(r, team_col, "") if team_col else ""
        player_id_raw = row_value(r, id_col, "") if id_col else ""

        player_norm = normalize_text(player_raw)
        stat_key = norm_stat(stat_raw)
        mean = to_float(mean_raw)
        if not player_norm or not stat_key or mean is None:
            continue

        std = to_float(std_raw) if std_col else None
        game_norm = normalize_text(game_raw) if game_col else ""
        key = (player_norm, stat_key)
        item = {
            "player_norm": player_norm,
            "player_name": str(player_raw or ""),
            "player_id": str(player_id_raw or ""),
            "team": str(team_raw or "").upper(),
            "stat_key": stat_key,
            "pred_mean": mean,
            "pred_std": std,
            "game_raw": str(game_raw or ""),
            "game_norm": game_norm,
        }

        bucket = preds.setdefault(key, [])
        # Evitamos duplicados exactos: Ludo trae varias líneas para el mismo jugador/stat/partido.
        if not any(x["game_norm"] == game_norm and abs(float(x["pred_mean"]) - mean) < 1e-9 for x in bucket):
            bucket.append(item)

    total_preds = sum(len(v) for v in preds.values())
    print(f"Predicciones cargadas: {total_preds} registros únicos | {len(preds)} claves jugador/stat desde {source_name} | filas leídas: {rows_count}")
    print(f"Columnas usadas: player={player_col}, stat={stat_col}, mean={mean_col}, std={std_col or 'DEFAULT'}, game={game_col or 'NO'}, team={team_col or 'NO'}, player_id={id_col or 'NO'}")
    return preds


def load_predictions_from_table(con, table: str, args) -> dict[tuple[str, str], dict]:
    cols = columns(con, table)
    player_col = args.player_col or pick_col(cols, PLAYER_COLS)
    stat_col = args.stat_col or pick_col(cols, STAT_COLS)
    mean_col = args.mean_col or pick_col(cols, MEAN_COLS)
    std_col = args.std_col or pick_col(cols, STD_COLS, required=False)
    game_col = args.game_col or pick_col(cols, GAME_COLS, required=False)
    team_col = args.team_col or pick_col(cols, TEAM_COLS, required=False)
    id_col = args.player_id_col or pick_col(cols, ID_COLS, required=False)

    select_cols = [player_col, stat_col, mean_col]
    for col in [std_col, game_col, team_col, id_col]:
        if col and col not in select_cols:
            select_cols.append(col)

    sql = "SELECT " + ", ".join(qident(c) for c in select_cols) + f" FROM {qname(table)}"
    with con.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return _build_predictions_from_iter(rows, cols, args, table)


def load_predictions_from_csv(csv_path: str, args) -> dict[tuple[str, str], dict]:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"No existe CSV de predicciones: {csv_path}")
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        rows = list(reader)
    return _build_predictions_from_iter(rows, cols, args, str(path))


def latest_snapshot(con, odds_table: str) -> str:
    with con.cursor() as cur:
        cur.execute(
            f"""
            SELECT snapshot_id
            FROM {qname(odds_table)}
            WHERE valid = TRUE AND book = 'betano'
            GROUP BY snapshot_id
            ORDER BY MAX(scraped_at_utc) DESC NULLS LAST, snapshot_id DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"No hay snapshots en {odds_table}")
    return row["snapshot_id"]


def load_odds(con, odds_table: str, snapshot_id: str) -> list[dict]:
    with con.cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {qname(odds_table)}
            WHERE snapshot_id = %s
              AND valid = TRUE
              AND book = 'betano'
            ORDER BY partido, jugador, stat_key, threshold
            """,
            (snapshot_id,),
        )
        return cur.fetchall()

def find_prediction(
    odd: sqlite3.Row,
    preds: dict[tuple[str, str], list[dict]],
    require_game_match: bool = False,
    require_team_in_game: bool = False,
) -> dict | None:
    key = (odd["player_norm"], odd["stat_key"])
    candidates = preds.get(key) or []
    if not candidates:
        return None

    odd_game_raw = odd["partido"]
    odd_game = odd["game_norm"] if "game_norm" in odd.keys() else normalize_text(odd_game_raw)

    def decorate(pred: dict, game_ok: bool) -> dict:
        out = dict(pred)
        out["game_match"] = bool(game_ok)
        out["team_game_match"] = bool(team_in_game(out.get("team", ""), odd_game_raw) or team_in_game(out.get("team", ""), odd_game))
        return out

    # 1) Primero probamos mismo jugador/stat + mismo partido.
    exact_game: list[dict] = []
    for pred in candidates:
        game_ok = games_match(odd_game, pred.get("game_norm", ""))
        if game_ok:
            exact_game.append(decorate(pred, True))

    if exact_game:
        if require_team_in_game:
            exact_game = [p for p in exact_game if p.get("team_game_match")]
            if not exact_game:
                return None
        return exact_game[0]

    # 2) Si el usuario exige partido exacto, no hacemos fallback.
    if require_game_match:
        return None

    # 3) Fallback: mismo jugador/stat aunque el partido no coincida.
    fallback = [decorate(pred, False) for pred in candidates]
    if require_team_in_game:
        fallback = [p for p in fallback if p.get("team_game_match")]
        if not fallback:
            return None
    return fallback[0]

def make_pick(odd: sqlite3.Row, pred: dict, min_prob: float, min_odds: float, max_odds: float) -> dict | None:
    odds_decimal = float(odd["odds_decimal"])
    if odds_decimal < min_odds or odds_decimal > max_odds:
        return None

    stat_key = odd["stat_key"]
    mean = float(pred["pred_mean"])
    std = pred.get("pred_std")
    if std is None or std <= 0:
        std = DEFAULT_STD_BY_STAT.get(stat_key, 3.0)

    model_line = float(odd["model_line"])
    prob = prob_over_normal(mean, std, model_line)
    if prob < min_prob:
        return None

    imp = implied_probability(odds_decimal)
    ev = ev_decimal(prob, odds_decimal)
    edge = prob - imp

    return {
        "created_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "snapshot_id": odd["snapshot_id"],
        "book": odd["book"],
        "partido": odd["partido"],
        "jugador": odd["jugador"],
        "player_norm": odd["player_norm"],
        "game_norm": odd["game_norm"] if "game_norm" in odd.keys() else normalize_text(odd["partido"]),
        "pred_player": pred.get("player_name", ""),
        "player_id": pred.get("player_id", ""),
        "team": pred.get("team", ""),
        "pred_game": pred.get("game_raw", ""),
        "pred_game_norm": pred.get("game_norm", ""),
        "game_match": "1" if pred.get("game_match") else "0",
        "team_game_match": "1" if pred.get("team_game_match") else "0",
        "mercado_raw": odd["mercado_raw"],
        "linea_raw": odd["linea_raw"],
        "stat_key": stat_key,
        "side": odd["side"],
        "threshold": f"{float(odd['threshold']):.6g}",
        "model_line": f"{model_line:.6g}",
        "odds_decimal": f"{odds_decimal:.6g}",
        "pred_mean": f"{mean:.6g}",
        "pred_std": f"{std:.6g}",
        "prob_model": f"{prob:.6f}",
        "prob_implied": f"{imp:.6f}",
        "edge_prob": f"{edge:.6f}",
        "ev": f"{ev:.6f}",
        "ev_pct": f"{ev*100:.2f}",
        "row_uid": odd["row_uid"],
        "pick_uid": f"{odd['row_uid']}|{mean:.4f}|{std:.4f}",
    }



def ensure_picks_table(con, table: str = PICKS_TABLE) -> None:
    with con.cursor() as cur:
        cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {qname(table)} (
            pick_uid TEXT PRIMARY KEY,
            created_at_utc TIMESTAMPTZ,
            snapshot_id TEXT,
            book TEXT,
            partido TEXT,
            game_norm TEXT,
            jugador TEXT,
            player_norm TEXT,
            pred_player TEXT,
            player_id TEXT,
            team TEXT,
            pred_game TEXT,
            pred_game_norm TEXT,
            game_match INTEGER,
            team_game_match INTEGER,
            mercado_raw TEXT,
            linea_raw TEXT,
            stat_key TEXT,
            side TEXT,
            threshold NUMERIC,
            model_line NUMERIC,
            odds_decimal NUMERIC,
            pred_mean NUMERIC,
            pred_std NUMERIC,
            prob_model NUMERIC,
            prob_implied NUMERIC,
            edge_prob NUMERIC,
            ev NUMERIC,
            ev_pct NUMERIC,
            row_uid TEXT,
            hit_l5 INTEGER DEFAULT 0,
            n_l5 INTEGER DEFAULT 0,
            hit_l10 INTEGER DEFAULT 0,
            n_l10 INTEGER DEFAULT 0,
            hr_l5 NUMERIC DEFAULT 0,
            hr_l10 NUMERIC DEFAULT 0,
            hit_rate TEXT DEFAULT 'N/D',
            keep_reason TEXT
        );
        """)

        extra_cols = {
            "game_norm": "TEXT",
            "pred_player": "TEXT",
            "player_id": "TEXT",
            "team": "TEXT",
            "pred_game": "TEXT",
            "pred_game_norm": "TEXT",
            "game_match": "INTEGER DEFAULT 0",
            "team_game_match": "INTEGER DEFAULT 0",
            "hit_l5": "INTEGER DEFAULT 0",
            "n_l5": "INTEGER DEFAULT 0",
            "hit_l10": "INTEGER DEFAULT 0",
            "n_l10": "INTEGER DEFAULT 0",
            "hr_l5": "NUMERIC DEFAULT 0",
            "hr_l10": "NUMERIC DEFAULT 0",
            "hit_rate": "TEXT DEFAULT 'N/D'",
            "keep_reason": "TEXT",
        }
        existing = set(columns(con, table))
        for col, col_type in extra_cols.items():
            if col not in existing:
                cur.execute(f"ALTER TABLE {qname(table)} ADD COLUMN {qident(col)} {col_type}")

        schema, name = split_table_name(table)
        cur.execute(f'CREATE INDEX IF NOT EXISTS "idx_{name}_snapshot" ON {qname(table)} (snapshot_id)')
        cur.execute(f'CREATE INDEX IF NOT EXISTS "idx_{name}_ev" ON {qname(table)} (ev DESC)')
    con.commit()


def save_picks(con, picks: list[dict], table: str = PICKS_TABLE) -> int:
    ensure_picks_table(con, table)

    if picks:
        snapshot_id = str(picks[0].get("snapshot_id", "")).strip()
        if snapshot_id:
            with con.cursor() as cur:
                cur.execute(f"DELETE FROM {qname(table)} WHERE snapshot_id = %s", (snapshot_id,))

    if not picks:
        con.commit()
        return 0

    cols = [
        "pick_uid", "created_at_utc", "snapshot_id", "book", "partido", "game_norm", "jugador", "player_norm", "pred_player",
        "player_id", "team", "pred_game", "pred_game_norm", "game_match", "team_game_match", "mercado_raw", "linea_raw",
        "stat_key", "side", "threshold", "model_line", "odds_decimal", "pred_mean", "pred_std", "prob_model", "prob_implied",
        "edge_prob", "ev", "ev_pct", "row_uid", "hit_l5", "n_l5", "hit_l10", "n_l10", "hr_l5", "hr_l10", "hit_rate", "keep_reason",
    ]

    values = []
    for p in picks:
        values.append((
            p["pick_uid"], p["created_at_utc"], p["snapshot_id"], p["book"], p["partido"], p.get("game_norm", ""), p["jugador"],
            p["player_norm"], p.get("pred_player", ""), p.get("player_id", ""), p.get("team", ""), p.get("pred_game", ""),
            p.get("pred_game_norm", ""), to_int(p.get("game_match", 0)), to_int(p.get("team_game_match", 0)), p["mercado_raw"], p["linea_raw"], p["stat_key"], p["side"],
            to_float(p["threshold"], 0.0), to_float(p["model_line"], 0.0), to_float(p["odds_decimal"], 0.0), to_float(p["pred_mean"], 0.0), to_float(p["pred_std"], 0.0),
            to_float(p["prob_model"], 0.0), to_float(p["prob_implied"], 0.0), to_float(p["edge_prob"], 0.0), to_float(p["ev"], 0.0),
            to_float(p["ev_pct"], 0.0), p["row_uid"],
            to_int(p.get("hit_l5"), 0), to_int(p.get("n_l5"), 0), to_int(p.get("hit_l10"), 0), to_int(p.get("n_l10"), 0),
            to_float(p.get("hr_l5"), 0.0) or 0.0, to_float(p.get("hr_l10"), 0.0) or 0.0, str(p.get("hit_rate", "N/D") or "N/D"),
            str(p.get("keep_reason", "") or ""),
        ))

    insert_cols = ", ".join(qident(c) for c in cols)
    update_cols = [c for c in cols if c != "pick_uid"]
    update_sql = ", ".join(f"{qident(c)} = EXCLUDED.{qident(c)}" for c in update_cols)
    sql = f"""
        INSERT INTO {qname(table)} ({insert_cols})
        VALUES %s
        ON CONFLICT (pick_uid) DO UPDATE SET {update_sql}
    """
    with con.cursor() as cur:
        execute_values(cur, sql, values, page_size=1000)
    con.commit()
    return len(values)

def print_table(picks: list[dict], top: int) -> None:
    print("\nTOP PICKS BETANO HITOS")
    print("-" * 140)
    print(f"{'#':>2} {'EV%':>7} {'Prob':>7} {'Imp':>7} {'Cuota':>6} {'Stat':>4} {'Jugador':<24} {'Hito':<7} {'HR':>11} {'Pred':>6} {'Std':>5} Partido")
    print("-" * 140)
    for i, p in enumerate(picks[:top], 1):
        print(
            f"{i:>2} {float(p['ev_pct']):>7.2f} {float(p['prob_model'])*100:>6.1f}% "
            f"{float(p['prob_implied'])*100:>6.1f}% {float(p['odds_decimal']):>6.2f} "
            f"{p['stat_key']:>4} {p['jugador'][:24]:<24} {p['linea_raw']:<7} "
            f"{str(p.get('hit_rate', 'N/D'))[:11]:>11} {float(p['pred_mean']):>6.2f} {float(p['pred_std']):>5.2f} {p['partido'][:40]}"
        )


def pick_score(p: dict) -> float:
    """Score estable para elegir la mejor línea cuando hay muchos hitos del mismo jugador."""
    ev_pct = to_float(p.get("ev_pct"), 0.0) or 0.0
    prob = to_float(p.get("prob_model"), 0.0) or 0.0
    pred = to_float(p.get("pred_mean"), 0.0) or 0.0
    line = to_float(p.get("model_line"), 0.0) or 0.0
    diff = pred - line
    return (ev_pct * 0.55) + (prob * 100 * 0.30) + (diff * 4.0)


def apply_front_ready_filter(picks: list[dict], args) -> list[dict]:
    """Filtro final para publicar en el front.

    Objetivo:
      - no mostrar todas las líneas de Betano;
      - dejar solo picks finales generados por Ludo;
      - máximo una línea por jugador;
      - máximo N picks.
    """
    before = len(picks)
    filtered: list[dict] = []

    for p in picks:
        ev_pct = to_float(p.get("ev_pct"), 0.0) or 0.0
        prob = to_float(p.get("prob_model"), 0.0) or 0.0
        odds = to_float(p.get("odds_decimal"), 0.0) or 0.0
        pred = to_float(p.get("pred_mean"), 0.0) or 0.0
        line = to_float(p.get("model_line"), 0.0) or 0.0
        diff = pred - line

        if ev_pct < args.front_min_ev_pct:
            continue
        if prob < args.front_min_prob:
            continue
        if odds < args.front_min_odds or odds > args.front_max_odds:
            continue
        if diff < args.front_min_diff:
            continue

        q = dict(p)
        q["_front_score"] = pick_score(q)
        filtered.append(q)

    # Primero, si llegaron varias líneas del mismo jugador/stat/partido, dejamos una sola.
    best_by_player_stat: dict[tuple[str, str, str], dict] = {}
    for p in filtered:
        key = (p.get("partido", ""), p.get("jugador", ""), p.get("stat_key", ""))
        if key not in best_by_player_stat or float(p["_front_score"]) > float(best_by_player_stat[key]["_front_score"]):
            best_by_player_stat[key] = p

    candidate = list(best_by_player_stat.values())

    # Luego, para el front, máximo una recomendación por jugador.
    if args.front_one_per_player:
        best_by_player: dict[str, dict] = {}
        for p in candidate:
            key = p.get("jugador", "")
            if key not in best_by_player or float(p["_front_score"]) > float(best_by_player[key]["_front_score"]):
                best_by_player[key] = p
        candidate = list(best_by_player.values())

    candidate.sort(key=lambda x: float(x.get("ev", 0.0)), reverse=True)
    candidate = candidate[:args.front_max_picks]

    for p in candidate:
        p.pop("_front_score", None)

    print("\nFiltro front-ready aplicado:")
    print(f"  Antes                 : {before}")
    print(f"  Tras filtros calidad  : {len(filtered)}")
    print(f"  Tras 1 jugador/stat   : {len(best_by_player_stat)}")
    print(f"  Final front           : {len(candidate)}")
    return candidate



def main() -> None:
    ap = argparse.ArgumentParser(description="Genera picks EV de hitos Betano usando predicciones Ludo y Postgres/Supabase.")
    ap.add_argument("--db-url", default=None, help="URL Postgres/Supabase. Si no se pasa, usa .env.local.")
    ap.add_argument("--db", default=None, help="Compatibilidad: ignorado salvo que sea una URL Postgres. Ya no se usa ludo.db.")
    ap.add_argument("--odds-table", default=ODDS_TABLE)
    ap.add_argument("--picks-table", default=PICKS_TABLE)
    ap.add_argument("--pred-table", default=os.getenv("LUDO_PRED_TABLE", ""), help="Tabla Postgres opcional de predicciones. Si no existe, usa CSV.")
    ap.add_argument("--pred-csv", default=os.getenv("LUDO_PRED_CSV", "ludo_predictions.csv"), help="CSV generado por generar_predicciones_ludo.py.")
    ap.add_argument("--snapshot-id", help="Snapshot específico. Si no se pasa, usa el último de public.player_prop_odds.")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--min-ev", type=float, default=0.03, help="EV mínimo decimal. 0.03 = +3%%")
    ap.add_argument("--min-prob", type=float, default=0.0)
    ap.add_argument("--min-odds", type=float, default=1.20)
    ap.add_argument("--max-odds", type=float, default=15.0)
    ap.add_argument("--output-dir", default="picks_generados")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--save-db", action="store_true", help="Guarda picks en tabla Postgres public.picks_betano_hitos.")
    ap.add_argument("--with-hit-rates", action=argparse.BooleanOptionalAction, default=True, help="Calcula hit-rate L5/L10 desde v_ludo_train_model_ready si está disponible.")
    ap.add_argument("--hr-override-min-ev", type=float, default=0.03, help="EV decimal mínimo para conservar picks por 5/5 o 4/5 aunque no lleguen a --min-ev. 0.03 = +3%%.")
    ap.add_argument("--hr-override-min-prob", type=float, default=0.60, help="Probabilidad mínima para conservar picks por hit-rate.")

    ap.add_argument("--player-col")
    ap.add_argument("--stat-col")
    ap.add_argument("--mean-col")
    ap.add_argument("--std-col")
    ap.add_argument("--game-col")
    ap.add_argument("--team-col")
    ap.add_argument("--player-id-col")
    ap.add_argument("--require-game-match", action="store_true", help="Descarta picks si el partido de Ludo no coincide con el partido de Betano.")
    ap.add_argument("--require-team-in-game", action="store_true", help="Descarta picks si el team_abbreviation del jugador no aparece en el partido de Betano.")

    ap.add_argument("--front-ready", action="store_true", help="Aplica filtro final conservador para publicar en el front.")
    ap.add_argument("--front-max-picks", type=int, default=15, help="Máximo de picks finales para el front.")
    ap.add_argument("--front-min-ev-pct", type=float, default=10.0, help="EV%% mínimo final para front-ready.")
    ap.add_argument("--front-min-prob", type=float, default=0.65, help="Probabilidad mínima final para front-ready. 0.65 = 65%%.")
    ap.add_argument("--front-min-odds", type=float, default=1.35, help="Cuota mínima final para front-ready.")
    ap.add_argument("--front-max-odds", type=float, default=3.00, help="Cuota máxima final para front-ready.")
    ap.add_argument("--front-min-diff", type=float, default=0.75, help="Diferencia mínima predicción - línea para front-ready.")
    ap.add_argument("--front-one-per-player", action="store_true", default=True, help="Deja como máximo 1 pick por jugador en front-ready.")
    args = ap.parse_args()

    effective_url = args.db_url or (args.db if args.db and not str(args.db).endswith(".db") else None)

    print("=" * 72)
    print("🧠 GENERAR PICKS BETANO HITOS + LUDO · POSTGRES")
    print("=" * 72)
    print(f"Odds table  : {args.odds_table}")
    print(f"Picks table : {args.picks_table}")
    print(f"Pred table  : {args.pred_table or 'NO / CSV'}")
    print(f"Pred CSV    : {args.pred_csv}")

    con = connect(effective_url)
    try:
        if not table_exists(con, args.odds_table):
            raise SystemExit(f"No existe tabla de cuotas: {args.odds_table}. Primero corré subir_cuotas_betano_hitos.py")

        pred_source = "table" if args.pred_table and table_exists(con, args.pred_table) else "csv"
        if pred_source == "csv" and not Path(args.pred_csv).exists():
            raise SystemExit(
                f"No encontré tabla de predicciones Postgres usable ni el CSV: {args.pred_csv}\n"
                "Ejecutá generar_predicciones_ludo.py para generar ludo_predictions.csv."
            )

        snapshot_id = args.snapshot_id or latest_snapshot(con, args.odds_table)
        print(f"Snapshot    : {snapshot_id}")

        if pred_source == "table":
            preds = load_predictions_from_table(con, args.pred_table, args)
        else:
            print("⚠️  Uso CSV de Ludo para predicciones.")
            preds = load_predictions_from_csv(args.pred_csv, args)

        odds = load_odds(con, args.odds_table, snapshot_id)
        print(f"Cuotas cargadas desde Postgres: {len(odds)}")

        picks: list[dict] = []
        unmatched = 0
        for odd in odds:
            pred = find_prediction(odd, preds, args.require_game_match, args.require_team_in_game)
            if not pred:
                unmatched += 1
                continue
            p = make_pick(odd, pred, args.min_prob, args.min_odds, args.max_odds)
            if not p:
                continue
            picks.append(p)

        picks = add_hit_rates(picks, args)

        before_ev_filter = len(picks)
        kept: list[dict] = []
        kept_by_reason = {"EV": 0, "HR_5_5": 0, "HR_4_5_CONF": 0}
        for p in picks:
            ok, reason = keep_by_ev_or_hit_rate(p, args)
            if ok:
                p["keep_reason"] = reason
                kept_by_reason[reason] = kept_by_reason.get(reason, 0) + 1
                kept.append(p)
        picks = kept
        print(
            f"Filtro EV/HR: {before_ev_filter} → {len(picks)} | "
            f"EV={kept_by_reason.get('EV', 0)} | "
            f"5/5={kept_by_reason.get('HR_5_5', 0)} | "
            f"4/5+L10={kept_by_reason.get('HR_4_5_CONF', 0)}"
        )

        picks.sort(key=lambda x: (
            to_int(x.get("hit_l5"), 0) >= 5,
            to_int(x.get("hit_l5"), 0),
            to_int(x.get("hit_l10"), 0),
            float(x.get("ev", 0.0)),
        ), reverse=True)

        if args.front_ready:
            picks = apply_front_ready_filter(picks, args)
            args.top = max(args.top, len(picks))

        game_mismatch = sum(1 for p in picks if str(p.get("game_match", "0")) != "1")
        team_mismatch = sum(1 for p in picks if str(p.get("team_game_match", "0")) != "1")
        print(f"Sin match predicción: {unmatched}")
        print(f"Picks finales EV/HR: {len(picks)} | EV mínimo base={args.min_ev*100:.2f}%")
        print(f"Picks sin match exacto de partido: {game_mismatch}")
        print(f"Picks cuyo equipo no aparece en el partido: {team_mismatch}")
        print_table(picks, args.top)

        suffix = "_front_ready" if args.front_ready else ""
        out_path = Path(args.output_dir) / f"picks_betano_hitos_{snapshot_id}{suffix}.csv"
        if picks:
            fields = list(picks[0].keys())
            write_csv_dicts(str(out_path), picks, fields)
            print(f"\n✅ CSV picks → {out_path}")

        if args.save_db and not args.dry_run:
            saved = save_picks(con, picks, args.picks_table)
            print(f"✅ Picks guardados en Postgres: {saved} → tabla {args.picks_table}")
        elif args.dry_run:
            print("\n[dry-run] No se guardó en Postgres.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
