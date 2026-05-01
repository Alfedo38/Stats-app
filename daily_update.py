import os
from dotenv import load_dotenv
import time
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from nba_api.stats.endpoints import playergamelogs, boxscoreadvancedv3, boxscoreplayertrackv3

load_dotenv()

# =========================================================
# CONFIGURACIÓN SEGURA DE BASE DE DATOS
# =========================================================
password_raw = os.getenv("DB_PASSWORD")

if not password_raw:
    raise ValueError("❌ ERROR: Falta la variable DB_PASSWORD en el archivo .env")

db_url = URL.create(
    drivername="postgresql",
    username="postgres.xxhdctrvjsngwbagamns",
    password=password_raw,
    host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    query={"sslmode": "require"}
)

TABLE_NAME = "player_game_logs"
engine = create_engine(db_url, pool_pre_ping=True)

# Configuración API NBA
TIMEZONE = "America/Argentina/Buenos_Aires"
LEAGUE_ID = "00"
PER_MODE = "PerGame"
SEASON_TYPES = ["Regular Season", "Playoffs"]

REQUEST_TIMEOUT = 90
MAX_RETRIES = 5
SLEEP_MIN = 1.2
SLEEP_MAX = 2.5
DATE_MODE = "yesterday"

HEADERS = {
    "Host": "stats.nba.com",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
}

def random_sleep():
    time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))

def backoff_sleep(attempt: int, base_seconds: int = 4, max_wait: int = 60):
    wait = min(max_wait, base_seconds * attempt + random.uniform(0.5, 2.0))
    print(f"   ↳ reintentando en {wait:.1f}s...")
    time.sleep(wait)

def get_target_date():
    now_local = datetime.now(ZoneInfo(TIMEZONE))
    if DATE_MODE == "today":
        target = now_local.date()
    else:
        target = (now_local - timedelta(days=1)).date()
    date_str = target.strftime("%m/%d/%Y")
    return target, date_str

def infer_season_from_date(target_date):
    year = target_date.year
    month = target_date.month
    if month >= 10:
        start_year = year
        end_year = str(year + 1)[-2:]
    else:
        start_year = year - 1
        end_year = str(year)[-2:]
    return f"{start_year}-{end_year}"

def get_db_columns(table_name):
    try:
        with engine.connect() as conn:
            query = text("SELECT column_name FROM information_schema.columns WHERE table_name = :table")
            result = conn.execute(query, {"table": table_name})
            return [row[0] for row in result]
    except:
        return []

def fetch_logs_for_date(date_str: str, season: str, season_type: str):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"Descargando fecha={date_str} season={season} season_type={season_type} intento={attempt}/{MAX_RETRIES}")
            endpoint = playergamelogs.PlayerGameLogs(
                league_id_nullable=LEAGUE_ID, season_nullable=season, season_type_nullable=season_type,
                per_mode_simple_nullable=PER_MODE, date_from_nullable=date_str, date_to_nullable=date_str,
                player_id_nullable="", headers=HEADERS, timeout=REQUEST_TIMEOUT,
            )
            df = endpoint.player_game_logs.get_data_frame()
            if df.empty:
                print(f"   ! sin filas para {date_str} | {season_type}")
                return pd.DataFrame()
            return df
        except Exception as e:
            print(f"   X error en {date_str} | {season_type}: {e}")
            if attempt == MAX_RETRIES: raise
            backoff_sleep(attempt)

def fetch_game_sharp_metrics(game_id: str):
    """Busca métricas de tracking y avanzadas con escudo anti-errores de columnas faltantes."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # 1. Advanced Stats (Usage %)
            adv_stats = boxscoreadvancedv3.BoxScoreAdvancedV3(game_id=game_id, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            df_adv = adv_stats.get_data_frames()[0]
            if not df_adv.empty and 'personId' in df_adv.columns:
                df_adv = df_adv[['personId', 'usagePercentage']]
            else:
                df_adv = pd.DataFrame(columns=['personId', 'usagePercentage'])

            random_sleep()

            # 2. Player Tracking
            track_stats = boxscoreplayertrackv3.BoxScorePlayerTrackV3(game_id=game_id, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            df_track = track_stats.get_data_frames()[0]
            
            if not df_track.empty and 'personId' in df_track.columns:
                # 🛡️ ESCUDO ANTI-CRASH
                expected_cols = ['personId', 'touches', 'potentialAst', 'reboundChancesTotal', 'passes']
                for col in expected_cols:
                    if col not in df_track.columns:
                        df_track[col] = 0.0 # Si la NBA no la mandó, le ponemos 0.0 temporalmente
                
                df_track = df_track[expected_cols]
            else:
                df_track = pd.DataFrame(columns=['personId', 'touches', 'potentialAst', 'reboundChancesTotal', 'passes'])

            if df_adv.empty and df_track.empty:
                return pd.DataFrame()

            df_merged = pd.merge(df_adv, df_track, on='personId', how='outer')
            
            df_merged.rename(columns={
                'personId': 'player_id',
                'usagePercentage': 'usage_pct',
                'potentialAst': 'potential_ast', 
                'reboundChancesTotal': 'rebound_chances',
                'passes': 'passes_made'
            }, inplace=True)
            
            df_merged['game_id_str'] = game_id 
            df_merged['player_id'] = df_merged['player_id'].astype(int)

            return df_merged
            
        except Exception as e:
            print(f"   X Error en métricas avanzadas (Game {game_id}): {e}")
            if attempt == MAX_RETRIES: return pd.DataFrame()
            backoff_sleep(attempt)
    return pd.DataFrame()

def main():
    target_date, date_str = get_target_date()
    season = infer_season_from_date(target_date)

    print(f"Iniciando actualización diaria para: {target_date} ({date_str})")
    
    new_parts = []
    for season_type in SEASON_TYPES:
        raw_df = fetch_logs_for_date(date_str, season, season_type)
        if raw_df.empty: continue
        
        raw_df.columns = [col.lower() for col in raw_df.columns]
        valid_cols = get_db_columns(TABLE_NAME)
        if valid_cols:
            raw_df = raw_df[[c for c in raw_df.columns if c in valid_cols]]
            
        new_parts.append(raw_df)
        random_sleep()

    if not new_parts:
        print("\nNo hubo datos nuevos para esa fecha. Fin del proceso.")
        return

    final_df = pd.concat(new_parts, ignore_index=True)
    
    print("\n🔥 Descargando Métricas Sharp (Tracking & Advanced) por partido...")
    final_df['game_id_str'] = final_df['game_id'].astype(str).str.zfill(10)
    unique_games = final_df['game_id_str'].unique()
    
    sharp_dfs = []
    for idx, gid in enumerate(unique_games):
        print(f"   -> Escaneando partido {idx+1}/{len(unique_games)} (ID: {gid})")
        df_sharp = fetch_game_sharp_metrics(gid)
        if not df_sharp.empty:
            sharp_dfs.append(df_sharp)
        random_sleep()
        
    if sharp_dfs:
        all_sharp_df = pd.concat(sharp_dfs, ignore_index=True)
        final_df['player_id'] = final_df['player_id'].astype(int)
        
        final_df = pd.merge(
            final_df, 
            all_sharp_df, 
            how='left', 
            on=['game_id_str', 'player_id']
        )
        print("✅ Métricas Sharp fusionadas exitosamente.")
    else:
        print("⚠️ No se pudieron obtener métricas Sharp.")
        
    if 'game_id_str' in final_df.columns:
        final_df.drop(columns=['game_id_str'], inplace=True)

    print("\nVerificando si hay jugadores nuevos que no estén en la base de datos...")
    try:
        unique_players = final_df[['player_id', 'player_name']].drop_duplicates()
        with engine.connect() as conn:
            existing_ids = pd.read_sql("SELECT id FROM players", conn)['id'].tolist()
            
        missing_players = unique_players[~unique_players['player_id'].isin(existing_ids)]
        
        if not missing_players.empty:
            print(f"¡Se encontraron {len(missing_players)} jugadores nuevos! Registrándolos...")
            new_players_df = pd.DataFrame({
                'id': missing_players['player_id'],
                'full_name': missing_players['player_name'],
                'first_name': missing_players['player_name'].apply(lambda x: str(x).split(' ')[0] if pd.notnull(x) else ''),
                'last_name': missing_players['player_name'].apply(lambda x: ' '.join(str(x).split(' ')[1:]) if pd.notnull(x) and ' ' in str(x) else '')
            })
            new_players_df.to_sql('players', engine, if_exists='append', index=False)
            print("Jugadores registrados correctamente.")
    except Exception as e:
        print(f"Aviso: No se pudo auto-registrar jugadores. Detalle: {e}")

    valid_cols = get_db_columns(TABLE_NAME)
    final_df = final_df[[c for c in final_df.columns if c in valid_cols]]

    try:
        with engine.begin() as conn:
            delete_query = text(f"DELETE FROM {TABLE_NAME} WHERE DATE(game_date) = :target_date")
            conn.execute(delete_query, {"target_date": target_date})
            
            final_df.to_sql(TABLE_NAME, engine, if_exists='append', index=False)
            
        print(f"\n✅ ¡Éxito Total! Se guardaron {len(final_df)} estadísticas del {date_str} en Supabase.")
    except Exception as e:
        print(f"\nError al guardar en la base de datos: {e}")

if __name__ == "__main__":
    main()