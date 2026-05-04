import os
import time
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from nba_api.stats.endpoints import (
    BoxScoreAdvancedV3,
    BoxScorePlayerTrackV3,
    PlayerDashPtPass,
)

load_dotenv()

# ── Conexión ───────────────────────────────────────────────────────────────────
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"), host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.nba.com/",
}

SEASON = "2025-26"

# ── Helpers ────────────────────────────────────────────────────────────────────
def safe_val(row, col, default=0.0):
    if col is None or col not in row:
        return default
    try:
        return float(row[col] or default)
    except (ValueError, TypeError):
        return default

def get_col(df, candidates):
    for col in candidates:
        if col in df.columns:
            return col
    return None

# ── 1. Traer partidos pendientes desde 2026-03-19 ─────────────────────────────
def obtener_partidos_pendientes():
    query = text("""
        SELECT DISTINCT game_id, MIN(game_date) as game_date
        FROM player_game_logs
        WHERE game_date >= '2026-03-19'
          AND (
            potential_ast IS NULL OR potential_ast = 0 OR
            rebound_chances IS NULL OR rebound_chances = 0
          )
          AND (
            CAST(game_id AS TEXT) LIKE '225%'
            OR CAST(game_id AS TEXT) LIKE '425%'
            OR CAST(game_id AS TEXT) LIKE '625%'
          )
        GROUP BY game_id
        ORDER BY game_date ASC;
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    df['game_date'] = pd.to_datetime(df['game_date'])
    print(f"📅 Rango: {df['game_date'].min().date()} → {df['game_date'].max().date()}")
    return df

# ── 2. Potential Assists via PlayerDashPtPass ──────────────────────────────────
_cache_pot_ast = {}

def obtener_potential_ast_jugador(player_id: int, team_id: int, fecha: datetime) -> float:
    fecha_str = fecha.strftime("%Y-%m-%d")
    cache_key = (player_id, fecha_str)

    if cache_key in _cache_pot_ast:
        return _cache_pot_ast[cache_key]

    date_from = fecha.strftime("%m/%d/%Y")
    date_to   = fecha.strftime("%m/%d/%Y")

    try:
        pt = PlayerDashPtPass(
            player_id=player_id,
            team_id=team_id,
            season=SEASON,
            date_from_nullable=date_from,
            date_to_nullable=date_to,
            per_mode_simple="Totals",
            headers=HEADERS,
        )
        df = pt.get_data_frames()[0]
        df.columns = [c.lower() for c in df.columns]
        time.sleep(1)

        col_fga = get_col(df, ["fga"])
        value = 0.0 if (df.empty or col_fga is None) else float(df[col_fga].sum() or 0)

    except Exception as e:
        print(f"    ⚠️  Error potential_ast jugador {player_id} ({fecha_str}): {e}")
        value = 0.0
        time.sleep(5)

    _cache_pot_ast[cache_key] = value
    return value

# ── 3. Boxscore tracking + advanced por partido ────────────────────────────────
def procesar_partido(game_id_str: str, game_date: datetime) -> list:
    adv = BoxScoreAdvancedV3(game_id=game_id_str, headers=HEADERS)
    df_adv = adv.get_data_frames()[0]
    df_adv.columns = [c.lower() for c in df_adv.columns]
    time.sleep(2)

    track = BoxScorePlayerTrackV3(game_id=game_id_str, headers=HEADERS)
    df_track = track.get_data_frames()[0]
    df_track.columns = [c.lower() for c in df_track.columns]
    time.sleep(2)

    if df_adv.empty or df_track.empty:
        return []

    col_person_t = get_col(df_track, ["personid", "player_id", "playerid"])
    col_team_t   = get_col(df_track, ["teamid", "team_id"])
    col_person_a = get_col(df_adv,   ["personid", "player_id", "playerid"])
    col_usg      = get_col(df_adv,   ["usagepercentage", "usgpct", "usg_pct"])
    col_reb_tot  = get_col(df_track, ["reboundchancestotal", "reboundchances"])
    col_reb_off  = get_col(df_track, ["reboundchancesoffensive"])
    col_reb_def  = get_col(df_track, ["reboundchancesdefensive"])
    col_touches  = get_col(df_track, ["touches", "numtouches"])

    update_data = []
    for _, row in df_track.iterrows():
        if col_person_t is None:
            continue
        p_id = int(row[col_person_t])
        t_id = int(row[col_team_t]) if col_team_t else 0

        usg = 0.0
        if col_person_a and col_usg:
            adv_row = df_adv[df_adv[col_person_a] == p_id]
            if not adv_row.empty:
                usg = safe_val(adv_row.iloc[0], col_usg)

        pot_ast = obtener_potential_ast_jugador(p_id, t_id, game_date)

        update_data.append({
            "g_id":    game_id_str,
            "p_id":    p_id,
            "usg":     usg,
            "pot_ast": pot_ast,
            "reb_ch":  safe_val(row, col_reb_tot),
            "reb_off": safe_val(row, col_reb_off),
            "reb_def": safe_val(row, col_reb_def),
            "tch":     safe_val(row, col_touches),
        })

    return update_data

# ── 4. Agregar columnas si no existen ─────────────────────────────────────────
def agregar_columnas_si_no_existen():
    queries = [
        "ALTER TABLE player_game_logs ADD COLUMN IF NOT EXISTS rebound_off FLOAT DEFAULT 0;",
        "ALTER TABLE player_game_logs ADD COLUMN IF NOT EXISTS rebound_def FLOAT DEFAULT 0;",
    ]
    with engine.begin() as conn:
        for q in queries:
            conn.execute(text(q))
    print("✅ Columnas verificadas/agregadas correctamente")

# ── 5. Main ────────────────────────────────────────────────────────────────────
def main():
    agregar_columnas_si_no_existen()

    df_games = obtener_partidos_pendientes()
    total = len(df_games)
    print(f"🎯 Procesando {total} partidos restantes...")
    mins = round((total * 29) / 60)
    print(f"⏱️  Tiempo estimado: ~{mins} minutos ({mins//60}h {mins%60}m)")

    ok, skip, err = 0, 0, 0

    for idx, game_row in df_games.iterrows():
        game_id     = game_row["game_id"]
        game_date   = game_row["game_date"]
        game_id_str = str(game_id).zfill(10)

        print(f"\n[{idx+1}/{total}] {game_id_str} ({game_date.date()}) ", end="", flush=True)

        try:
            update_data = procesar_partido(game_id_str, game_date)

            if not update_data:
                print("⚠️  Sin datos, salteando.")
                skip += 1
                continue

            validos = [r for r in update_data if any([
                r["pot_ast"] > 0, r["reb_ch"] > 0, r["tch"] > 0
            ])]

            if not validos:
                print("⚠️  Todos los valores son 0, salteando.")
                skip += 1
                continue

            update_query = text("""
                UPDATE player_game_logs
                SET
                    usage_pct       = :usg,
                    potential_ast   = :pot_ast,
                    rebound_chances = :reb_ch,
                    rebound_off     = :reb_off,
                    rebound_def     = :reb_def,
                    touches         = :tch
                WHERE game_id  = :g_id
                  AND player_id = :p_id;
            """)

            with engine.begin() as conn:
                result = conn.execute(update_query, validos)

            avg_ast = sum(r["pot_ast"] for r in validos) / len(validos)
            avg_reb = sum(r["reb_ch"]  for r in validos) / len(validos)
            print(f"✅ {result.rowcount} jugadores | pot_ast avg: {avg_ast:.1f} | reb_ch avg: {avg_reb:.1f}")
            ok += 1

        except Exception as e:
            print(f"❌ Error: {e}")
            err += 1
            time.sleep(10)

    print(f"\n{'='*55}")
    print(f"✅ Completado → OK: {ok} | Salteados: {skip} | Errores: {err}")
    print(f"{'='*55}")

if __name__ == "__main__":
    main()