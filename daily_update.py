import os
import re
import time
import random
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from nba_api.stats.endpoints import playergamelogs, boxscoreplayertrackv3

load_dotenv()

# =========================================================
# CONFIGURACION
# =========================================================
DB_PASSWORD = os.getenv("DB_PASSWORD")
if not DB_PASSWORD:
    raise ValueError("❌ Falta DB_PASSWORD en el archivo .env")

DB_USER = os.getenv("DB_USER", "postgres.xxhdctrvjsngwbagamns")
DB_HOST = os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com")
DB_PORT = int(os.getenv("DB_PORT", "6543"))
DB_NAME = os.getenv("DB_NAME", "postgres")
TABLE_NAME = os.getenv("PLAYER_LOGS_TABLE", "player_game_logs")

TIMEZONE = os.getenv("TIMEZONE", "America/Argentina/Buenos_Aires")
LEAGUE_ID = os.getenv("NBA_LEAGUE_ID", "00")
SEASON = os.getenv("NBA_SEASON", "2025-26")
PER_MODE = os.getenv("NBA_PER_MODE", "PerGame")

# Si no pasas fechas, reprocesa los ultimos 3 dias cerrados.
now_local = datetime.now(ZoneInfo(TIMEZONE))
default_end = (now_local.date() - timedelta(days=1)).isoformat()
default_start = (now_local.date() - timedelta(days=3)).isoformat()

START_DATE = os.getenv("NBA_START_DATE", default_start)   # formato YYYY-MM-DD
END_DATE = os.getenv("NBA_END_DATE", default_end)         # formato YYYY-MM-DD

# Ejemplos:
# NBA_SEASON_TYPES=Playoffs python3 daily_update.py
# NBA_SEASON_TYPES="Regular Season,Playoffs" python3 daily_update.py
SEASON_TYPES = [
    x.strip() for x in os.getenv("NBA_SEASON_TYPES", "Regular Season,Playoffs,Play-In").split(",")
    if x.strip()
]

REQUEST_TIMEOUT = int(os.getenv("NBA_REQUEST_TIMEOUT", "90"))
MAX_RETRIES = int(os.getenv("NBA_MAX_RETRIES", "5"))
SLEEP_MIN = float(os.getenv("NBA_SLEEP_MIN", "1.2"))
SLEEP_MAX = float(os.getenv("NBA_SLEEP_MAX", "2.7"))

# Si NBA no manda una metrica sharp, queda NULL, se intenta preservar la anterior,
# y al final se completa en 0 para evitar nulos en el modelo.
FILL_MISSING_SHARP_WITH_ZERO = os.getenv("NBA_FILL_MISSING_SHARP_WITH_ZERO", "1") == "1"

HEADERS = {
    "Host": "stats.nba.com",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": os.getenv(
        "NBA_USER_AGENT",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

# =========================================================
# DB
# =========================================================
db_url = URL.create(
    drivername="postgresql",
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
    query={"sslmode": "require"},
)
engine = create_engine(db_url, pool_pre_ping=True)

# =========================================================
# HELPERS
# =========================================================
def parse_iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def iso_to_nba_date(value: str) -> str:
    """YYYY-MM-DD -> MM/DD/YYYY"""
    return parse_iso_date(value).strftime("%m/%d/%Y")


def random_sleep() -> None:
    time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))


def backoff_sleep(attempt: int, base_seconds: int = 5, max_wait: int = 75) -> None:
    wait = min(max_wait, base_seconds * attempt + random.uniform(1.0, 4.0))
    print(f"   ↳ reintentando en {wait:.1f}s...")
    time.sleep(wait)


def normalize_col_name(col) -> str:
    """Convierte GAME_ID, gameId, reboundChancesTotal -> game_id, game_id, rebound_chances_total."""
    s = str(col).strip()
    s = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", s)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    s = s.replace("%", "_pct")
    s = re.sub(r"[^A-Za-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_").lower()
    return s


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out.columns = [normalize_col_name(c) for c in out.columns]
    return out


def first_existing(df: pd.DataFrame, candidates: list[str]):
    for c in candidates:
        if c in df.columns:
            return c
    return None


def ensure_game_key(df: pd.DataFrame, source_col: str = "game_id") -> pd.DataFrame:
    if df.empty or source_col not in df.columns:
        return df
    out = df.copy()
    out["game_key"] = out[source_col].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(10)
    return out


def get_db_columns(table_name: str) -> list[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                ORDER BY ordinal_position
            """),
            {"table_name": table_name},
        ).fetchall()
    return [r[0] for r in rows]


def get_players_columns() -> list[str]:
    try:
        return get_db_columns("players")
    except Exception:
        return []


def convert_min_to_decimal(value):
    """Convierte '37:47' -> 37.7833. Si ya es numero, lo devuelve."""
    if pd.isna(value):
        return pd.NA
    s = str(value).strip()
    if not s:
        return pd.NA
    if ":" in s:
        try:
            m, sec = s.split(":", 1)
            return float(m) + float(sec) / 60.0
        except Exception:
            return pd.NA
    try:
        return float(s)
    except Exception:
        return pd.NA


def infer_home_away_and_opponent(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "matchup" not in df.columns:
        return df

    out = df.copy()

    def home_away(matchup):
        m = str(matchup)
        if " vs. " in m or " vs " in m:
            return "HOME"
        if " @ " in m:
            return "AWAY"
        return pd.NA

    def opponent(matchup):
        m = str(matchup)
        if " vs. " in m:
            return m.split(" vs. ")[-1].strip()
        if " vs " in m:
            return m.split(" vs ")[-1].strip()
        if " @ " in m:
            return m.split(" @ ")[-1].strip()
        return pd.NA

    if "home_away" not in out.columns:
        out["home_away"] = out["matchup"].apply(home_away)
    else:
        out["home_away"] = out["home_away"].combine_first(out["matchup"].apply(home_away))

    if "opponent" not in out.columns:
        out["opponent"] = out["matchup"].apply(opponent)
    else:
        out["opponent"] = out["opponent"].combine_first(out["matchup"].apply(opponent))

    return out


def clean_numeric_cols(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def coalesce_alias(out: pd.DataFrame, target: str, candidates: list[str]) -> pd.DataFrame:
    """Crea/actualiza target usando la primera columna disponible entre candidates sin pisar datos buenos."""
    if out.empty:
        return out

    existing_candidates = [c for c in candidates if c in out.columns]
    if not existing_candidates and target not in out.columns:
        return out

    if target not in out.columns:
        out[target] = pd.NA

    for c in existing_candidates:
        if c == target:
            continue
        out[target] = out[target].combine_first(out[c])

    return out


def apply_boxscore_aliases(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normaliza aliases de boxscore para que coincidan con el esquema viejo de la DB.

    NBA PlayerGameLogs trae FG3M/FG3A, pero normalize_col_name los convierte en fg3_m/fg3_a.
    Muchas tablas viejas del proyecto usan fg3m/fg3a, por eso antes los triples podían
    descargarse desde NBA pero terminar descartados en prepare_for_db().
    """
    if df.empty:
        return df

    out = df.copy()

    # Triples: columnas NBA normalizadas -> columnas esperadas por el esquema viejo.
    out = coalesce_alias(out, "fg3m", ["fg3m", "fg3_m", "three_pm", "three_pointers_made"])
    out = coalesce_alias(out, "fg3a", ["fg3a", "fg3_a", "three_pa", "three_pointers_attempted"])
    out = coalesce_alias(out, "fg3_pct", ["fg3_pct", "fg3_percentage", "three_p_pct"])

    # También dejamos las variantes con guion bajo por si alguna tabla nueva usa esos nombres.
    out = coalesce_alias(out, "fg3_m", ["fg3_m", "fg3m"])
    out = coalesce_alias(out, "fg3_a", ["fg3_a", "fg3a"])

    return out

# =========================================================
# NBA FETCH
# =========================================================
def fetch_player_game_logs(measure_type: str, season_type: str) -> pd.DataFrame:
    start_nba = iso_to_nba_date(START_DATE)
    end_nba = iso_to_nba_date(END_DATE)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(
                f"📡 PlayerGameLogs {measure_type} | {season_type} | "
                f"{start_nba} a {end_nba} | intento {attempt}/{MAX_RETRIES}"
            )
            endpoint = playergamelogs.PlayerGameLogs(
                league_id_nullable=LEAGUE_ID,
                season_nullable=SEASON,
                season_type_nullable=season_type,
                per_mode_simple_nullable=PER_MODE,
                date_from_nullable=start_nba,
                date_to_nullable=end_nba,
                measure_type_player_game_logs_nullable=measure_type,
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            df = endpoint.get_data_frames()[0]
            if df.empty:
                print(f"   ! sin filas: {measure_type} | {season_type}")
                return pd.DataFrame()

            df = normalize_columns(df)
            df["season_type"] = season_type
            df["season"] = SEASON
            df = ensure_game_key(df, "game_id")
            return df

        except Exception as e:
            msg = str(e)
            print(f"   X error {measure_type} | {season_type}: {msg}")

            # Esto suele pasar cuando NBA Stats no devuelve dataset para ese season_type.
            # No conviene gastar 5 reintentos si ya sabemos que no hay resultSet.
            if "resultSet" in msg or "resultSets" in msg:
                return pd.DataFrame()

            if attempt == MAX_RETRIES:
                return pd.DataFrame()
            backoff_sleep(attempt)

    return pd.DataFrame()


def fetch_tracking_for_game(game_id: str) -> pd.DataFrame:
    """
    Tracking V3 por partido.
    Importante: NBA V3 devuelve columnas camelCase: gameId, personId, reboundChancesTotal, touches, passes.
    El bug que te dejaba 0042500222 en NULL era por no normalizar/mergear bien estas columnas.
    """
    gid = str(game_id).zfill(10)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            endpoint = boxscoreplayertrackv3.BoxScorePlayerTrackV3(
                game_id=gid,
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            df = endpoint.get_data_frames()[0]
            if df.empty:
                return pd.DataFrame()

            df = normalize_columns(df)

            # IDs
            player_col = first_existing(df, ["person_id", "player_id"])
            game_col = first_existing(df, ["game_id", "gameid"])
            if not player_col:
                print(f"      ⚠️ tracking {gid}: no encontre person_id/player_id")
                return pd.DataFrame()

            out = pd.DataFrame()
            out["game_key"] = gid if not game_col else df[game_col].astype(str).str.zfill(10)
            out["player_id"] = pd.to_numeric(df[player_col], errors="coerce")

            # Filtra filas que no sean jugadores reales.
            out = out[out["player_id"].notna()].copy()
            out["player_id"] = out["player_id"].astype(int)
            out = out[(out["player_id"] > 0) & (out["player_id"] < 1610600000)]

            # Metricas reales de PlayerTrack V3.
            touch_col = first_existing(df, ["touches", "tchs"])
            reb_col = first_existing(df, ["rebound_chances_total", "reb_chances", "rbc"])
            pass_col = first_existing(df, ["passes", "pass", "passes_made"])

            # Potential AST no viene en BoxScorePlayerTrackV3 actual.
            # Si algun dia aparece, lo toma. Si no, queda NA y luego se preserva/fill 0.
            pot_ast_col = first_existing(df, [
                "potential_ast",
                "potential_asts",
                "potential_assists",
                "potential_assist",
            ])

            out["touches"] = pd.to_numeric(df[touch_col], errors="coerce") if touch_col else pd.NA
            out["rebound_chances"] = pd.to_numeric(df[reb_col], errors="coerce") if reb_col else pd.NA
            out["passes_made"] = pd.to_numeric(df[pass_col], errors="coerce") if pass_col else pd.NA
            out["potential_ast"] = pd.to_numeric(df[pot_ast_col], errors="coerce") if pot_ast_col else pd.NA

            return out.drop_duplicates(subset=["game_key", "player_id"])

        except Exception as e:
            print(f"      X tracking game={gid} intento {attempt}/{MAX_RETRIES}: {e}")
            if attempt == MAX_RETRIES:
                return pd.DataFrame()
            backoff_sleep(attempt, base_seconds=4)

    return pd.DataFrame()


def fetch_tracking_for_games(game_ids: list[str]) -> pd.DataFrame:
    if not game_ids:
        return pd.DataFrame()

    print(f"📡 Tracking por partido: {len(game_ids)} partidos")
    parts = []
    for idx, gid in enumerate(game_ids, 1):
        gid = str(gid).zfill(10)
        print(f"   -> tracking {idx}/{len(game_ids)} game={gid}")
        df = fetch_tracking_for_game(gid)
        if not df.empty:
            parts.append(df)
        random_sleep()

    if not parts:
        return pd.DataFrame()

    return pd.concat(parts, ignore_index=True).drop_duplicates(subset=["game_key", "player_id"])

# =========================================================
# DATA PREP
# =========================================================
def build_final_dataframe() -> pd.DataFrame:
    base_parts = []
    adv_parts = []

    for stype in SEASON_TYPES:
        df_base = fetch_player_game_logs("Base", stype)
        if not df_base.empty:
            base_parts.append(df_base)
        random_sleep()

        df_adv = fetch_player_game_logs("Advanced", stype)
        if not df_adv.empty:
            adv_parts.append(df_adv)
        random_sleep()

    if not base_parts:
        return pd.DataFrame()

    base = pd.concat(base_parts, ignore_index=True).drop_duplicates(subset=["game_key", "player_id"])

    # Advanced: usage_pct
    if adv_parts:
        adv = pd.concat(adv_parts, ignore_index=True).drop_duplicates(subset=["game_key", "player_id"])
        usage_col = first_existing(adv, ["usg_pct", "usage_pct", "usage_percentage"])
        if usage_col:
            adv_small = adv[["game_key", "player_id", usage_col]].copy()
            adv_small.rename(columns={usage_col: "usage_pct"}, inplace=True)
            base = base.merge(adv_small, on=["game_key", "player_id"], how="left")
        else:
            base["usage_pct"] = pd.NA
    else:
        base["usage_pct"] = pd.NA

    # Tracking: touches / rebound_chances / passes_made / potential_ast
    unique_games = sorted(base["game_key"].dropna().astype(str).unique().tolist())
    tracking = fetch_tracking_for_games(unique_games)
    if not tracking.empty:
        base = base.merge(tracking, on=["game_key", "player_id"], how="left", suffixes=("", "_track"))

        # Si quedaron columnas duplicadas, combina sin pisar lo bueno.
        for c in ["touches", "rebound_chances", "passes_made", "potential_ast"]:
            old_c = f"{c}_track"
            if old_c in base.columns:
                if c in base.columns:
                    base[c] = base[c].combine_first(base[old_c])
                else:
                    base[c] = base[old_c]
                base.drop(columns=[old_c], inplace=True)
    else:
        for c in ["touches", "rebound_chances", "passes_made", "potential_ast"]:
            if c not in base.columns:
                base[c] = pd.NA

    # Fecha
    if "game_date" in base.columns:
        base["game_date"] = pd.to_datetime(base["game_date"], errors="coerce").dt.date

    # Local/visitante y rival desde MATCHUP.
    base = infer_home_away_and_opponent(base)

    # Aliases utiles para tu esquema.
    if "tov" in base.columns and "turnover" not in base.columns:
        base["turnover"] = base["tov"]

    if "team_abbreviation" in base.columns and "team" not in base.columns:
        base["team"] = base["team_abbreviation"]

    if "min" in base.columns and "minutes" not in base.columns:
        base["minutes"] = base["min"].apply(convert_min_to_decimal)

    if "wl" not in base.columns and "w_l" in base.columns:
        base["wl"] = base["w_l"]

    # Arregla aliases de triples: NBA normaliza FG3M/FG3A como fg3_m/fg3_a,
    # pero tu DB/modelo suele esperar fg3m/fg3a.
    base = apply_boxscore_aliases(base)

    # Limpieza numerica.
    numeric_cols = [
        "player_id", "team_id", "pts", "reb", "ast", "stl", "blk", "tov", "turnover",
        "fgm", "fga", "fg_pct", "fg3m", "fg3a", "fg3_m", "fg3_a", "fg3_pct", "ftm", "fta", "ft_pct",
        "oreb", "dreb", "rebound_off", "rebound_def", "pf", "plus_minus", "usage_pct",
        "touches", "rebound_chances", "potential_ast", "passes_made", "minutes",
    ]
    base = clean_numeric_cols(base, numeric_cols)

    # Aliases de rebotes ofensivos/defensivos para esquemas viejos.
    if "oreb" in base.columns and "rebound_off" not in base.columns:
        base["rebound_off"] = base["oreb"]
    if "dreb" in base.columns and "rebound_def" not in base.columns:
        base["rebound_def"] = base["dreb"]

    # Timestamps si la tabla los tiene.
    now_ts = datetime.now(ZoneInfo(TIMEZONE))
    base["updated_at"] = now_ts
    if "created_at" not in base.columns:
        base["created_at"] = now_ts

    return base

# =========================================================
# PRESERVAR SHARP EXISTENTE
# =========================================================
def load_existing_sharp(start_date: str, end_date: str, valid_cols: list[str]) -> pd.DataFrame:
    sharp_cols = [
        "usage_pct",
        "touches",
        "rebound_chances",
        "potential_ast",
        "passes_made",
    ]
    existing_sharp_cols = [c for c in sharp_cols if c in valid_cols]
    if not existing_sharp_cols:
        return pd.DataFrame()

    select_cols = ", ".join(["game_id", "player_id"] + existing_sharp_cols)
    sql = text(f"""
        SELECT {select_cols}
        FROM public.{TABLE_NAME}
        WHERE game_date BETWEEN CAST(:start_date AS date) AND CAST(:end_date AS date)
    """)

    try:
        with engine.connect() as conn:
            old = pd.read_sql(sql, conn, params={"start_date": start_date, "end_date": end_date})
        if old.empty:
            return old

        old = normalize_columns(old)
        old = ensure_game_key(old, "game_id")
        old["player_id"] = pd.to_numeric(old["player_id"], errors="coerce")
        old = old[old["player_id"].notna()].copy()
        old["player_id"] = old["player_id"].astype(int)

        rename_map = {c: f"old_{c}" for c in existing_sharp_cols if c in old.columns}
        return old[["game_key", "player_id"] + list(rename_map.keys())].rename(columns=rename_map)

    except Exception as e:
        print(f"⚠️ No pude cargar sharp existente: {e}")
        return pd.DataFrame()


def preserve_old_sharp_if_new_missing(df: pd.DataFrame, valid_cols: list[str]) -> pd.DataFrame:
    if df.empty:
        return df

    old = load_existing_sharp(START_DATE, END_DATE, valid_cols)
    if old.empty:
        return df

    out = df.copy()
    out = ensure_game_key(out, "game_id")
    out["player_id"] = pd.to_numeric(out["player_id"], errors="coerce")
    out = out[out["player_id"].notna()].copy()
    out["player_id"] = out["player_id"].astype(int)

    out = out.merge(old, on=["game_key", "player_id"], how="left")

    for c in ["usage_pct", "touches", "rebound_chances", "potential_ast", "passes_made"]:
        old_c = f"old_{c}"
        if c in out.columns and old_c in out.columns:
            out[c] = out[c].combine_first(out[old_c])
        elif old_c in out.columns:
            out[c] = out[old_c]

    old_cols = [c for c in out.columns if c.startswith("old_")]
    if old_cols:
        out.drop(columns=old_cols, inplace=True)

    return out

# =========================================================
# PLAYERS AUTO-REGISTER
# =========================================================
def auto_register_missing_players(df: pd.DataFrame) -> None:
    if df.empty or "player_id" not in df.columns:
        return

    name_col = first_existing(df, ["player_name", "name", "full_name"])
    if not name_col:
        return

    try:
        players_cols = get_players_columns()
        if not players_cols:
            return

        unique_players = df[["player_id", name_col]].dropna().drop_duplicates()
        unique_players["player_id"] = unique_players["player_id"].astype(int)

        with engine.connect() as conn:
            existing_ids = pd.read_sql("SELECT id FROM public.players", conn)["id"].astype(int).tolist()

        missing = unique_players[~unique_players["player_id"].isin(existing_ids)].copy()
        if missing.empty:
            return

        print(f"👤 Jugadores nuevos detectados: {len(missing)}. Registrando minimo en players...")

        rows = []
        for _, r in missing.iterrows():
            full = str(r[name_col]).strip()
            parts = full.split()
            row = {}
            if "id" in players_cols:
                row["id"] = int(r["player_id"])
            if "api_id" in players_cols:
                row["api_id"] = int(r["player_id"])
            if "full_name" in players_cols:
                row["full_name"] = full
            if "first_name" in players_cols:
                row["first_name"] = parts[0] if parts else ""
            if "last_name" in players_cols:
                row["last_name"] = " ".join(parts[1:]) if len(parts) > 1 else ""
            rows.append(row)

        if rows:
            pd.DataFrame(rows).to_sql("players", engine, if_exists="append", index=False, chunksize=100, method="multi")

    except Exception as e:
        print(f"⚠️ No se pudo auto-registrar jugadores: {e}")

# =========================================================
# SAVE
# =========================================================
def prepare_for_db(df: pd.DataFrame, valid_cols: list[str]) -> pd.DataFrame:
    if df.empty:
        return df

    out = df.copy()

    # Ultima defensa: asegurar aliases de triples antes de filtrar por columnas reales de la DB.
    out = apply_boxscore_aliases(out)

    # Si la tabla no tiene game_key, no lo insertes.
    if "game_key" in out.columns and "game_key" not in valid_cols:
        out.drop(columns=["game_key"], inplace=True)

    # Completa sharp con 0 si se desea evitar nulos en el modelo.
    if FILL_MISSING_SHARP_WITH_ZERO:
        # Estas métricas sí pueden rellenarse en 0 si faltan.
        for c in ["usage_pct", "touches", "rebound_chances", "passes_made"]:
            if c in out.columns:
                out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0)

        # potential_ast NO se inventa en 0.
        # Si NBA no manda una columna real de potential assists, debe quedar NULL.
        if "potential_ast" in out.columns:
            out["potential_ast"] = pd.to_numeric(out["potential_ast"], errors="coerce")

            # Si todo quedó en 0, probablemente son ceros artificiales del fallback viejo.
            # Mejor guardarlo como NULL para no contaminar el modelo.
            if out["potential_ast"].notna().any() and out["potential_ast"].max(skipna=True) == 0:
                out["potential_ast"] = pd.NA

    # Formato fecha compatible.
    if "game_date" in out.columns:
        out["game_date"] = pd.to_datetime(out["game_date"], errors="coerce").dt.strftime("%Y-%m-%d")

    # Solo columnas existentes en la tabla.
    keep = [c for c in out.columns if c in valid_cols]
    out = out[keep].copy()

    # Evita columnas duplicadas.
    out = out.loc[:, ~out.columns.duplicated()].copy()

    return out


def save_to_db(df: pd.DataFrame) -> int:
    if df.empty:
        print("😴 No hay filas para guardar.")
        return 0

    valid_cols = get_db_columns(TABLE_NAME)
    if not valid_cols:
        raise RuntimeError(f"No pude leer columnas de {TABLE_NAME}")

    # Preserva sharp viejo si NBA falla o viene incompleto.
    df = preserve_old_sharp_if_new_missing(df, valid_cols)

    # Registra jugadores nuevos antes de insertar logs.
    auto_register_missing_players(df)

    final_df = prepare_for_db(df, valid_cols)
    if final_df.empty:
        print("⚠️ Despues de filtrar columnas, no quedo nada para insertar.")
        return 0

    triple_cols = [c for c in ["fg3m", "fg3a", "fg3_pct", "fg3_m", "fg3_a"] if c in final_df.columns]
    if triple_cols:
        counts = {c: int(pd.to_numeric(final_df[c], errors="coerce").notna().sum()) for c in triple_cols}
        print(f"🎯 Columnas de triples a insertar: {counts}")
    else:
        print("⚠️ No encontre columnas de triples compatibles con la tabla. Revisar nombres en DB.")

    print(f"🧹 Reemplazando ventana {START_DATE} a {END_DATE} en {TABLE_NAME}...")
    print("💾 Insertando filas nuevas con la misma conexion transaccional...")

    with engine.begin() as conn:
        conn.execute(
            text(f"""
                DELETE FROM public.{TABLE_NAME}
                WHERE game_date BETWEEN CAST(:start_date AS date) AND CAST(:end_date AS date)
            """),
            {"start_date": START_DATE, "end_date": END_DATE},
        )

        final_df.to_sql(
            TABLE_NAME,
            conn,
            schema="public",
            if_exists="append",
            index=False,
            chunksize=100,
            method="multi",
        )

    return len(final_df)

# =========================================================
# MAIN
# =========================================================
def main() -> None:
    print("===========================================================")
    print("🔄 DAILY UPDATE FIXED - PLAYER GAME LOGS")
    print("===========================================================")
    print(f"Temporada: {SEASON}")
    print(f"Rango: {START_DATE} a {END_DATE}")
    print(f"Season types: {SEASON_TYPES}")

    df = build_final_dataframe()
    if df.empty:
        print("\n😴 No hubo datos nuevos para ese rango. Fin.")
        return

    rows = save_to_db(df)
    print(f"✅ Proceso terminado. Filas insertadas: {rows}")


if __name__ == "__main__":
    main()