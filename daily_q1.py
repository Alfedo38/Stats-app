import os
import time
import random
import re
from datetime import datetime, date, timedelta
from json import JSONDecodeError

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# 🟢 HÍBRIDO: LeagueGameFinder (Calendario) + PlayByPlayV3 (Constructor de Boxscore)
from nba_api.stats.endpoints import leaguegamefinder, playbyplayv3

load_dotenv()

# =========================================================
# 1. CONFIGURACIÓN BASE DE DATOS
# =========================================================
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"), host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)

# =========================================================
# 2. CONFIG NBA / ACTUALIZACIÓN DIARIA AUTOMÁTICA
# =========================================================
LEAGUE_ID = "00"
SEASON = os.getenv("NBA_SEASON", "2025-26")

# 🔄 MAGIA: Calcula siempre la fecha de ayer
ayer = (date.today() - timedelta(days=1)).isoformat()
START_DATE = os.getenv("Q1_BACKFILL_START", ayer)
END_DATE = os.getenv("Q1_BACKFILL_END", ayer)

REGULAR_START = os.getenv("NBA_REGULAR_START", "2025-10-21")
REGULAR_END = os.getenv("NBA_REGULAR_END", "2026-04-12")
PLAYIN_START = os.getenv("NBA_PLAYIN_START", "2026-04-14")
PLAYIN_END = os.getenv("NBA_PLAYIN_END", "2026-04-17")
PLAYOFFS_START = os.getenv("NBA_PLAYOFFS_START", "2026-04-18")

REQUEST_TIMEOUT = int(os.getenv("NBA_REQUEST_TIMEOUT", "90"))
MAX_RETRIES = int(os.getenv("NBA_MAX_RETRIES", "5"))
SLEEP_MIN = float(os.getenv("NBA_SLEEP_MIN", "1.6"))
SLEEP_MAX = float(os.getenv("NBA_SLEEP_MAX", "3.2"))

HEADERS = {
    "Host": "stats.nba.com",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

# =========================================================
# 3. HELPERS
# =========================================================
def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()

def random_sleep() -> None:
    time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))

def backoff_sleep(attempt: int, base_seconds: int = 5, max_wait: int = 90) -> None:
    wait = min(max_wait, base_seconds * attempt + random.uniform(1.0, 4.0))
    print(f"   -> reintentando en {wait:.1f}s...")
    time.sleep(wait)

def infer_season_type_from_game_id(game_id: str, game_date: date) -> str:
    gid = str(game_id).zfill(10)
    prefix = gid[:3]
    if prefix == "002": return "Regular Season"
    if prefix == "004": return "Playoffs"
    if prefix == "005": return "Play-In"
    if prefix == "006": return "NBA Cup"
    
    if parse_date(REGULAR_START) <= game_date <= parse_date(REGULAR_END): return "Regular Season"
    if parse_date(PLAYIN_START) <= game_date <= parse_date(PLAYIN_END): return "Play-In"
    if game_date >= parse_date(PLAYOFFS_START): return "Playoffs"
    return "Unknown"

# =========================================================
# 4. MOTOR QUANT: RECONSTRUCTOR DE PLAY-BY-PLAY (V3)
# =========================================================
def parse_play_by_play_to_q1_boxscore(pbp_df: pd.DataFrame, game_id: str, game_date: date, season_type: str) -> pd.DataFrame:
    """Recibe PlayByPlayV3 y reconstruye stats del Q1."""
    if pbp_df.empty: return pd.DataFrame()

    pbp_df.columns = [c.upper() for c in pbp_df.columns]
    if 'PERIOD' not in pbp_df.columns: return pd.DataFrame()

    q1_events = pbp_df[pbp_df['PERIOD'] == 1].copy()
    if q1_events.empty: return pd.DataFrame()

    stats = {}

    def get_or_create_player(pid, name, tid, tabbr):
        if pd.isna(pid) or pid == 0: return None
        try:
            if int(pid) >= 1610600000: return None
        except: return None
            
        if pid not in stats:
            stats[pid] = {
                'game_id': str(game_id).zfill(10),
                'game_date': game_date, 'season': SEASON, 'season_type': season_type,
                'team_id': tid, 'team_abbreviation': tabbr,
                'player_id': int(pid), 'player_name': name,
                'q1_min': "12:00", 'q1_pts': 0, 'q1_reb': 0, 'q1_ast': 0, 'q1_oreb': 0, 'q1_dreb': 0
            }
        return int(pid)

    apellido_a_pid = {}
    for _, row in pbp_df.iterrows():
        pid = row.get('PERSONID', 0)
        try:
            if pd.isna(pid) or int(pid) >= 1610600000: continue
        except: continue
            
        name = str(row.get('PLAYERNAME', ''))
        if pid and name and name != 'nan':
            apellido = name.split(' ')[-1].lower()
            apellido_a_pid[apellido] = {
                'pid': int(pid), 'name': name,
                'tid': row.get('TEAMID', pd.NA), 'tabbr': row.get('TEAMTRICODE', pd.NA)
            }

    for _, row in q1_events.iterrows():
        action = str(row.get('ACTIONTYPE', '')).lower().strip()
        subaction = str(row.get('SUBTYPE', '')).lower().strip()
        desc = str(row.get('DESCRIPTION', '')).lower()
        
        pid1 = row.get('PERSONID', 0)
        pname1 = row.get('PLAYERNAME', pd.NA)
        tid1 = row.get('TEAMID', pd.NA)
        tabbr1 = row.get('TEAMTRICODE', pd.NA)
        
        p = get_or_create_player(pid1, pname1, tid1, tabbr1)

        # PUNTOS
        if action == 'made shot':
            if p:
                if '3pt' in desc or '3-pt' in desc: stats[p]['q1_pts'] += 3
                else: stats[p]['q1_pts'] += 2
        elif action == 'free throw' and 'made' in desc:
            if p: stats[p]['q1_pts'] += 1

        # REBOTES
        elif action == 'rebound':
            if p:
                stats[p]['q1_reb'] += 1
                if subaction == 'offensive' or 'offensive rebound' in desc: stats[p]['q1_oreb'] += 1
                else: stats[p]['q1_dreb'] += 1

        # ASISTENCIAS
        if 'ast)' in desc or 'assist' in desc:
            match = re.search(r'\(([^0-9]+)\s+\d+\s+ast\)', desc)
            if match:
                apellido_ast = match.group(1).strip().split(' ')[-1].lower()
                ast_data = apellido_a_pid.get(apellido_ast)
                if ast_data:
                    p_ast = get_or_create_player(ast_data['pid'], ast_data['name'], ast_data['tid'], ast_data['tabbr'])
                    if p_ast: stats[p_ast]['q1_ast'] += 1

    return pd.DataFrame(list(stats.values()))

# =========================================================
# 5. NBA FETCH
# =========================================================
def fetch_all_season_games() -> pd.DataFrame:
    print(f"📡 Buscando partidos...")
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            finder = leaguegamefinder.LeagueGameFinder(season_nullable=SEASON, league_id_nullable=LEAGUE_ID, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            df = finder.get_data_frames()[0]
            if df.empty: return pd.DataFrame()

            df = df.drop_duplicates(subset=['GAME_ID']).copy()
            df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE']).dt.date
            
            out = df[['GAME_ID', 'GAME_DATE']].copy()
            out.rename(columns={'GAME_ID': 'game_id', 'GAME_DATE': 'game_date'}, inplace=True)
            out['season'] = SEASON
            out['season_type'] = out.apply(lambda r: infer_season_type_from_game_id(r['game_id'], r['game_date']), axis=1)
            
            return out
        except Exception as e:
            print(f"   X Error obteniendo el calendario (intento {attempt}): {e}")
            backoff_sleep(attempt)

    return pd.DataFrame()

def fetch_q1_stats_for_game(game_id: str, game_date: date, season_type: str) -> pd.DataFrame:
    gid = str(game_id).zfill(10)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            pbp = playbyplayv3.PlayByPlayV3(
                game_id=gid, start_period=0, end_period=0, 
                headers=HEADERS, timeout=REQUEST_TIMEOUT,
            )
            df_pbp = pbp.get_data_frames()[0]
            if df_pbp.empty: return pd.DataFrame()
            return parse_play_by_play_to_q1_boxscore(df_pbp, gid, game_date, season_type)
        except Exception as e:
            print(f"   X error Q1 game={gid} (intento {attempt}): {e}")
            backoff_sleep(attempt)

    return pd.DataFrame()

# =========================================================
# 6. INSERCIÓN EN BASE DE DATOS
# =========================================================
def guardar_en_bd(df: pd.DataFrame) -> int:
    if df.empty: return 0
    try:
        # Formatear la fecha para postgres
        df['game_date'] = pd.to_datetime(df['game_date']).dt.strftime('%Y-%m-%d')
        
        with engine.begin() as conn:
            # 🛡️ ESCUDO ANTI-FANTASMAS (Foreign Key Violation)
            # Buscamos qué IDs existen realmente en la tabla "players"
            result = conn.execute(text("SELECT id FROM players"))
            valid_ids = {row[0] for row in result}
            
            # Filtramos: Solo dejamos los jugadores que la base de datos conoce
            df_clean = df[df['player_id'].isin(valid_ids)].copy()
            
            if df_clean.empty:
                print("   ⚠️ Todos los registros fueron descartados (no estaban en la tabla players).")
                return 0

            # Eliminamos posibles registros duplicados del mismo día antes de insertar
            fechas_a_insertar = tuple(df_clean['game_date'].unique())
            if len(fechas_a_insertar) == 1:
                conn.execute(text("DELETE FROM player_q1_stats WHERE game_date = :fecha"), {"fecha": fechas_a_insertar[0]})
            else:
                conn.execute(text("DELETE FROM player_q1_stats WHERE game_date IN :fechas"), {"fechas": fechas_a_insertar})
                
            # Insertamos la nueva data limpia
            df_clean.to_sql('player_q1_stats', conn, if_exists='append', index=False)
            
        print(f"   💾 OK! Se subieron {len(df_clean)} filas Q1 a Supabase.")
        return len(df_clean) # Retornamos la cantidad real insertada
    except Exception as e:
        print(f"   ❌ Error fatal al subir a la Base de Datos: {e}")
        return 0

# =========================================================
# 7. MAIN PIPELINE
# =========================================================
def actualizar_diariamente() -> None:
    print(f"===========================================================")
    print(f"🔄 ACTUALIZACIÓN DIARIA AUTOMÁTICA Q1")
    print(f"===========================================================")
    print(f"Buscando partidos desde {START_DATE} hasta {END_DATE}")

    all_games = fetch_all_season_games()
    if all_games.empty:
        print("❌ Fallo en la conexión. No se pudo descargar el calendario.")
        return

    start_d = parse_date(START_DATE)
    end_d = parse_date(END_DATE)

    target_games = all_games[(all_games['game_date'] >= start_d) & (all_games['game_date'] <= end_d)].copy()
    target_games = target_games.sort_values('game_date')

    if target_games.empty:
        print(f"😴 No hubo partidos jugados en ese rango de fechas. Finalizando.")
        return

    print(f"✅ Se encontraron {len(target_games)} partidos para procesar.\n")

    total_rows = 0
    grouped = target_games.groupby('game_date')

    for d, group in grouped:
        print(f"📅 Extrayendo data de la jornada: {d}")
        q1_parts = []
        for idx, row in enumerate(group.itertuples(index=False), start=1):
            print(f"   -> Procesando partido {idx}/{len(group)} (ID: {row.game_id})")
            q1 = fetch_q1_stats_for_game(row.game_id, d, row.season_type)
            if not q1.empty:
                q1_parts.append(q1)
            random_sleep()

        if q1_parts:
            day_df = pd.concat(q1_parts, ignore_index=True).drop_duplicates(subset=["game_id", "player_id"])
            # Sumamos al total solo las filas que pasaron el filtro y se insertaron
            filas_insertadas = guardar_en_bd(day_df)
            total_rows += filas_insertadas

    print(f"\n🏆 ¡Actualización completada! Se inyectaron {total_rows} registros válidos a la base de datos.")

if __name__ == "__main__":
    actualizar_diariamente()