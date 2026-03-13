import os
from dotenv import load_dotenv
import time
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
from sqlalchemy import create_engine, text
from nba_api.stats.endpoints import playergamelogs
import urllib.parse

# Cargar las variables del archivo .env
load_dotenv()

# =========================================================
# CONFIGURACIÓN SEGURA DE BASE DE DATOS
# =========================================================
user_raw = "postgres.xxhdctrvjsngwbagamns"
password_raw = "ALfedo2537@"
user_encoded = urllib.parse.quote_plus(user_raw)
password_encoded = urllib.parse.quote_plus(password_raw)
host = "aws-1-sa-east-1.pooler.supabase.com"
port = "6543"
dbname = "postgres"

DB_URL = f"postgresql://{user_encoded}:{password_encoded}@{host}:{port}/{dbname}?sslmode=require"
TABLE_NAME = "player_game_logs"
engine = create_engine(DB_URL, pool_pre_ping=True)

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

def main():
    target_date, date_str = get_target_date()
    season = infer_season_from_date(target_date)

    print(f"Iniciando actualización diaria para: {target_date} ({date_str})")
    
    new_parts = []
    for season_type in SEASON_TYPES:
        raw_df = fetch_logs_for_date(date_str, season, season_type)
        if raw_df.empty: continue
        
        # Filtramos dinámicamente según las columnas que existen en tu BD
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
    
    try:
        with engine.begin() as conn:
            # Borramos los datos de ayer si el script se corre dos veces por error
            delete_query = text(f"DELETE FROM {TABLE_NAME} WHERE DATE(game_date) = :target_date")
            conn.execute(delete_query, {"target_date": target_date})
            
            # Insertamos limpios
            final_df.to_sql(TABLE_NAME, engine, if_exists='append', index=False)
            
        print(f"\n✅ ¡Éxito! Se guardaron {len(final_df)} filas del {date_str} en Supabase.")
    except Exception as e:
        print(f"\nError al guardar en la base de datos: {e}")

if __name__ == "__main__":
    main()