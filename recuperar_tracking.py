import os
import time
import random
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv

from nba_api.stats.endpoints import boxscoreplayertrackv3

load_dotenv()

# =========================================================
# CONFIGURACIÓN SEGURA DE BASE DE DATOS
# =========================================================
password_raw = os.getenv("DB_PASSWORD")
db_url = URL.create(
    drivername="postgresql",
    username="postgres.xxhdctrvjsngwbagamns",
    password=password_raw,
    host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    query={"sslmode": "require"}
)
engine = create_engine(db_url)

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

def parchar_tracking_sharp():
    print("🚑 Iniciando Rescate de Tracking Avanzado (Motor Sharp)...")
    
    # Buscamos los IDs de los partidos que tienen huecos en Tracking
    query_games = """
        SELECT DISTINCT game_id 
        FROM player_game_logs 
        WHERE season_year = '2025-26' 
          AND (potential_ast IS NULL OR potential_ast = 0.0)
    """
    df_games = pd.read_sql(query_games, engine)
    
    if df_games.empty:
        print("✅ ¡Tu base de datos ya tiene todo el tracking completo!")
        return

    # Formateamos a 10 dígitos (ej: 0022300061) que es lo que exige la API por partido
    game_ids = [str(gid).zfill(10) for gid in df_games['game_id'].tolist()]
    print(f"🏀 Se encontraron {len(game_ids)} partidos incompletos. Iniciando descarga uno a uno...")

    for gid in game_ids:
        print(f"    -> Descargando Tracking del partido {gid}...")
        
        try:
            # Usamos la misma librería a prueba de balas del update_daily
            track_stats = boxscoreplayertrackv3.BoxScorePlayerTrackV3(game_id=gid, headers=HEADERS, timeout=60)
            df_track = track_stats.get_data_frames()[0]
            
            if not df_track.empty and 'personId' in df_track.columns:
                # 🛡️ Escudo Anti-Crash por si faltan columnas
                expected_cols = ['personId', 'touches', 'potentialAst', 'reboundChancesTotal', 'passes']
                for col in expected_cols:
                    if col not in df_track.columns:
                        df_track[col] = 0.0
                
                df_track = df_track[expected_cols]
                
                # Renombramos para Supabase
                cols_to_update = {
                    'personId': 'player_id',
                    'touches': 'touches',
                    'potentialAst': 'potential_ast', 
                    'reboundChancesTotal': 'rebound_chances',
                    'passes': 'passes_made'
                }
                df_track = df_track.rename(columns=cols_to_update)
                df_track['game_id'] = int(gid)
                
                # Subimos a staging temporal
                df_track.to_sql('tracking_staging', engine, if_exists='replace', index=False)
                
                # Actualizamos la tabla maestra
                update_query = text("""
                    UPDATE player_game_logs p
                    SET touches = NULLIF(s.touches, 0.0),
                        potential_ast = NULLIF(s.potential_ast, 0.0),
                        rebound_chances = NULLIF(s.rebound_chances, 0.0),
                        passes_made = NULLIF(s.passes_made, 0.0)
                    FROM tracking_staging s
                    WHERE p.player_id = CAST(s.player_id AS integer) 
                      AND p.game_id = CAST(s.game_id AS integer);
                    
                    DROP TABLE tracking_staging;
                """)
                
                with engine.begin() as conn:
                    conn.execute(update_query)
                print(f"    ✅ Tracking guardado para el partido {gid}.")
            else:
                print(f"    ⚠️ No se encontró data de tracking para el partido {gid}.")
                
            # Pausa aleatoria para imitar comportamiento humano y no ser baneados
            time.sleep(random.uniform(1.5, 3.5)) 
            
        except Exception as e:
            print(f"    ❌ Error descargando partido {gid}: {e}")
            time.sleep(10)

    print("\n🏆 ¡Tracking recuperado! Las gráficas de tu dashboard ahora deberían mostrar los datos reales.")

if __name__ == "__main__":
    parchar_tracking_sharp()