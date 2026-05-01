import os
import time
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv
from datetime import datetime

from nba_api.stats.endpoints import playergamelogs

load_dotenv()

# 1. CONFIGURACIÓN DE BASE DE DATOS
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

SEASONS = ['2023-24', '2024-25', '2025-26']

def fetch_with_retry(season, measure_type, retries=3):
    for attempt in range(retries):
        try:
            print(f"      -> Solicitando métricas: {measure_type} (Intento {attempt + 1})...")
            logs = playergamelogs.PlayerGameLogs(
                season_nullable=season, 
                season_type_nullable='Regular Season',
                measure_type_player_game_logs_nullable=measure_type,
                timeout=60
            )
            time.sleep(4) 
            return logs.get_data_frames()[0]
        except Exception as e:
            print(f"      ⚠️ Falla de conexión en {measure_type}: {e}. Reintentando en 10s...")
            time.sleep(10)
    print(f"      ❌ Imposible descargar {measure_type} para {season}. Continuando sin estos datos...")
    return pd.DataFrame()

def descargar_logs_completos():
    print("🏀 Iniciando Sembrado Histórico de Ludogallina (NBA Stats)...")
    df_final = pd.DataFrame()

    for season in SEASONS:
        print(f"\n📥 Procesando Temporada: {season}")
        
        df_base = fetch_with_retry(season, 'Base')
        df_adv = fetch_with_retry(season, 'Advanced')
        df_track = fetch_with_retry(season, 'Tracking')

        if df_base.empty:
            continue

        print("    ⚙️ Fusionando métricas Base y Advanced...")
        
        if not df_adv.empty:
            cols_adv = ['PLAYER_ID', 'GAME_ID', 'USG_PCT']
            cols_adv = [c for c in cols_adv if c in df_adv.columns]
            df_base = pd.merge(df_base, df_adv[cols_adv], on=['PLAYER_ID', 'GAME_ID'], how='left')

        if not df_track.empty:
            cols_track = ['PLAYER_ID', 'GAME_ID', 'TOUCHES', 'POTENTIAL_AST', 'REB_CHANCES', 'PASSES_MADE']
            cols_track = [c for c in cols_track if c in df_track.columns]
            df_base = pd.merge(df_base, df_track[cols_track], on=['PLAYER_ID', 'GAME_ID'], how='left')

        df_base['season_year'] = season
        df_base['season_type'] = 'Regular Season'
        df_base['updated_at'] = datetime.now()
        df_base['pulled_for_date'] = datetime.now().date()
        
        df_base['home_away'] = df_base['MATCHUP'].apply(lambda x: 'home' if 'vs.' in x else 'away')
        df_base['opponent_abbr'] = df_base['MATCHUP'].apply(lambda x: x.split(' ')[-1])

        df_final = pd.concat([df_final, df_base], ignore_index=True)
        print(f"    ✅ Temporada {season} lista.")

    if df_final.empty:
        print("❌ No se descargaron datos.")
        return

    print("\n🧹 Formateando columnas al esquema de Supabase...")
    column_mapping = {
        'PLAYER_ID': 'player_id', 'PLAYER_NAME': 'player_name', 'TEAM_ABBREVIATION': 'team_abbreviation',
        'TEAM_ID': 'team_id', 'TEAM_NAME': 'team_name', 'GAME_ID': 'game_id', 'GAME_DATE': 'game_date',
        'MATCHUP': 'matchup', 'WL': 'wl', 'MIN': 'min', 'PTS': 'pts', 'REB': 'reb', 'AST': 'ast',
        'FGM': 'fgm', 'FGA': 'fga', 'FG3M': 'fg3m', 'FG3A': 'fg3a', 'FTM': 'ftm', 'FTA': 'fta',
        'STL': 'stl', 'BLK': 'blk', 'TOV': 'tov', 'PF': 'pf', 'USG_PCT': 'usage_pct',
        'TOUCHES': 'touches', 'POTENTIAL_AST': 'potential_ast', 'REB_CHANCES': 'rebound_chances', 'PASSES_MADE': 'passes_made'
    }
    
    df_final = df_final.rename(columns=column_mapping)
    db_columns = list(column_mapping.values()) + ['season_year', 'season_type', 'home_away', 'opponent_abbr', 'updated_at', 'pulled_for_date']
    
    # 🔧 PARCHE DE SEGURIDAD: Rellenamos con NaN
    for col in db_columns:
        if col not in df_final.columns:
            df_final[col] = np.nan

    df_final = df_final[db_columns]
    df_final['game_date'] = pd.to_datetime(df_final['game_date']).dt.date

    # 🔧 FORZADO DE TIPOS ENTEROS
    print("    🔧 Convirtiendo IDs a formato numérico entero...")
    df_final['game_id'] = pd.to_numeric(df_final['game_id'], errors='coerce').fillna(0).astype(int)
    df_final['player_id'] = pd.to_numeric(df_final['player_id'], errors='coerce').fillna(0).astype(int)
    df_final['team_id'] = pd.to_numeric(df_final['team_id'], errors='coerce').fillna(0).astype(int)

    # 🔧 FORZADO DE TIPOS DECIMALES
    print("    🔧 Forzando métricas estadísticas a decimales (float8/float4)...")
    float_cols = ['min', 'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'stl', 'blk', 'tov', 'pf', 'usage_pct', 'touches', 'potential_ast', 'rebound_chances', 'passes_made']
    for col in float_cols:
        df_final[col] = pd.to_numeric(df_final[col], errors='coerce')

    # 🕵️‍♂️ FILTRO CAZA-FANTASMAS (CORREGIDO)
    print("    🕵️‍♂️ Filtrando jugadores retirados o no registrados en tu BD...")
    try:
        # CAMBIO CLAVE: Pedimos la columna 'id' que es como se llama en tu tabla
        df_players = pd.read_sql("SELECT id FROM players", engine)
        jugadores_validos = df_players['id'].tolist()
        
        total_antes = len(df_final)
        df_final = df_final[df_final['player_id'].isin(jugadores_validos)]
        print(f"    🗑️ Se descartaron {total_antes - len(df_final)} historiales de jugadores fantasma.")
    except Exception as e:
        print(f"    ⚠️ Falla al leer tabla players: {e}")

    print(f"🚀 Enviando {len(df_final)} registros a Supabase...")
    
    try:
        df_final.to_sql('player_game_logs_staging', engine, if_exists='replace', index=False)
        
        upsert_query = text("""
            INSERT INTO player_game_logs (
                player_id, player_name, team_abbreviation, team_id, team_name, game_id, game_date, 
                matchup, wl, min, pts, reb, ast, fgm, fga, fg3m, fg3a, ftm, fta, stl, blk, tov, pf, 
                usage_pct, touches, potential_ast, rebound_chances, passes_made, 
                season_year, season_type, home_away, opponent_abbr, updated_at, pulled_for_date
            )
            SELECT 
                player_id, player_name, team_abbreviation, team_id, team_name, game_id, game_date, 
                matchup, wl, min, pts, reb, ast, fgm, fga, fg3m, fg3a, ftm, fta, stl, blk, tov, pf, 
                usage_pct, touches, potential_ast, rebound_chances, passes_made, 
                season_year, season_type, home_away, opponent_abbr, updated_at, pulled_for_date
            FROM player_game_logs_staging
            ON CONFLICT (player_id, game_id) DO UPDATE SET
                updated_at = EXCLUDED.updated_at,
                usage_pct = COALESCE(EXCLUDED.usage_pct, player_game_logs.usage_pct);
            
            DROP TABLE player_game_logs_staging;
        """)
        
        with engine.begin() as conn:
            conn.execute(upsert_query)
            
        print("🏆 ¡Base de datos histórica poblada con éxito! Ludogallina está lista para el nivel 2.")
        
    except Exception as e:
        print(f"⚠️ Error en la subida a Base de Datos.")
        print(f"Detalle Técnico: {e}")

if __name__ == "__main__":
    descargar_logs_completos()