import os
import uuid
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

load_dotenv()
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
engine = create_engine(db_url, pool_pre_ping=True)

archivos_csv = [
    'data/2024_LoL_esports_match_data_from_OraclesElixir.csv',
    'data/2025_LoL_esports_match_data_from_OraclesElixir.csv',
    'data/2026_LoL_esports_match_data_from_OraclesElixir.csv'
]

def obtener_columna(df, opciones, valor_por_defecto=None):
    for col in opciones:
        if col in df.columns: return df[col]
    return pd.Series(valor_por_defecto, index=df.index)

def procesar_e_insertar(archivo):
    print(f"\nProcesando JUGADORES: {archivo}...")
    try:
        df = pd.read_csv(archivo, low_memory=False)
        df_jugadores = df[df['position'] != 'team'].copy() if 'position' in df.columns else pd.DataFrame()
        if df_jugadores.empty: return
        
        df_limpio = pd.DataFrame({
            'game_id': df_jugadores['gameid'],
            'team_name': df_jugadores['teamname'], # <-- EL ESLABÓN PERDIDO AÑADIDO
            'player_name': df_jugadores['playername'],
            'champion': df_jugadores['champion'],
            'position': df_jugadores['position'],
            
            'kills': pd.to_numeric(obtener_columna(df_jugadores, ['kills'], 0), errors='coerce').fillna(0).astype(int),
            'deaths': pd.to_numeric(obtener_columna(df_jugadores, ['deaths'], 0), errors='coerce').fillna(0).astype(int),
            'assists': pd.to_numeric(obtener_columna(df_jugadores, ['assists'], 0), errors='coerce').fillna(0).astype(int),
            'creep_score': pd.to_numeric(obtener_columna(df_jugadores, ['total cs', 'minionkills'], 0), errors='coerce').fillna(0).astype(int),
            
            'cs_per_min': pd.to_numeric(obtener_columna(df_jugadores, ['cspm']), errors='coerce'),
            'damage_share': pd.to_numeric(obtener_columna(df_jugadores, ['damageshare']), errors='coerce'),
            'gold_share': pd.to_numeric(obtener_columna(df_jugadores, ['earnedgoldshare', 'goldshare']), errors='coerce'),
            'vision_score': pd.to_numeric(obtener_columna(df_jugadores, ['visionscore'], 0), errors='coerce').fillna(0).astype(int),

            # --- NUEVO: FIRST BLOOD PROPS ---
            'first_blood_kill': obtener_columna(df_jugadores, ['firstbloodkill'], 0) == 1.0,
            'first_blood_victim': obtener_columna(df_jugadores, ['firstbloodvictim'], 0) == 1.0,
        })
        
        df_limpio = df_limpio.dropna(subset=['game_id', 'player_name', 'team_name'])
        df_limpio['id'] = [str(uuid.uuid4()) for _ in range(len(df_limpio))]

        print(f"Subiendo {len(df_limpio)} jugadores...")
        df_limpio.to_sql('player_stats_lol', engine, if_exists='append', index=False, schema='public')
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    for archivo in archivos_csv:
        if os.path.exists(archivo): procesar_e_insertar(archivo)