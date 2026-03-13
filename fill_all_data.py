import pandas as pd
from sqlalchemy import create_engine, text
from nba_api.stats.endpoints import playergamelogs
from nba_api.stats.static import teams, players
import urllib.parse
import time

# =========================================================
# CONFIGURACIÓN (CONEXIÓN ESTABLE)
# =========================================================
user_raw = "postgres.xxhdctrvjsngwbagamns"
password_raw = "ALfedo2537@"

user_encoded = urllib.parse.quote_plus(user_raw)
password_encoded = urllib.parse.quote_plus(password_raw)

host = "aws-1-sa-east-1.pooler.supabase.com"
port = "6543"
dbname = "postgres"

DB_URL = f"postgresql://{user_encoded}:{password_encoded}@{host}:{port}/{dbname}?sslmode=require"
engine = create_engine(DB_URL, pool_pre_ping=True)

# =========================================================
# FUNCIONES INTELIGENTES DE MIGRACIÓN
# =========================================================
def get_db_columns(table_name):
    """Lee tu base de datos y devuelve solo las columnas que tú creaste"""
    try:
        with engine.connect() as conn:
            query = text("SELECT column_name FROM information_schema.columns WHERE table_name = :table")
            result = conn.execute(query, {"table": table_name})
            return [row[0] for row in result]
    except:
        return []

def fill_static_data():
    print("🏀 1/3: Actualizando Equipos y Jugadores...")
    try:
        # Equipos
        df_teams = pd.DataFrame(teams.get_teams())
        df_teams.columns = [c.lower() for c in df_teams.columns]
        valid_team_cols = get_db_columns('teams')
        if valid_team_cols:
            df_teams = df_teams[[c for c in df_teams.columns if c in valid_team_cols]]
        df_teams.to_sql('teams', engine, if_exists='append', index=False)
        
        # Jugadores
        df_players = pd.DataFrame(players.get_players())
        df_players.columns = [c.lower() for c in df_players.columns]
        valid_player_cols = get_db_columns('players')
        if valid_player_cols:
            df_players = df_players[[c for c in df_players.columns if c in valid_player_cols]]
        df_players.to_sql('players', engine, if_exists='append', index=False)
        
        print("   ✅ Equipos y Jugadores sincronizados.")
    except Exception as e:
        print("   ⚠️ Algunos datos ya estaban guardados (es normal).")

def fill_game_logs():
    print("\n📈 2/3: Iniciando carga masiva (2024-2026)...")
    seasons = ["2024-25", "2025-26"]
    types = ["Regular Season", "Playoffs"]
    
    # Obtenemos tu estructura real de la tabla
    valid_log_cols = get_db_columns('player_game_logs')
    
    if not valid_log_cols:
        print("   ❌ Error: No se pudo leer la tabla player_game_logs.")
        return

    for season in seasons:
        for s_type in types:
            print(f"   --- Procesando {season} ({s_type}) ---")
            try:
                logs = playergamelogs.PlayerGameLogs(
                    season_nullable=season, 
                    season_type_nullable=s_type,
                    per_mode_simple_nullable="PerGame"
                )
                df = logs.player_game_logs.get_data_frame()
                
                if df.empty:
                    print(f"      ! Sin datos.")
                    continue

                df.columns = [col.lower() for col in df.columns]
                
                # LA MAGIA: Filtramos para que encaje como un puzzle perfecto
                cols_to_keep = [c for c in df.columns if c in valid_log_cols]
                df = df[cols_to_keep]

                print(f"      🚀 Subiendo {len(df)} filas adaptadas a tu esquema...")
                df.to_sql("player_game_logs", engine, if_exists='append', index=False, chunksize=500)
                print(f"      ✅ Temporada {season} guardada.")
                time.sleep(3)
                
            except Exception as e:
                print(f"      ❌ Error: {str(e)[:150]}...") 
                time.sleep(5)

if __name__ == "__main__":
    print("--- INICIANDO SISTEMA INTELIGENTE DE CARGA ---")
    fill_static_data()
    fill_game_logs()
    print("\n--- ¡TODO SUBIDO A SUPABASE CON ÉXITO! ---")