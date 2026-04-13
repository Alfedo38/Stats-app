import os
import uuid
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
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

# VACIAR TABLAS VIEJAS DE LOL (NBA INTACTA)
with engine.connect() as con:
    print("🧹 Limpiando base de datos antigua de LoL...")
    con.execute(text("TRUNCATE TABLE matches_lol CASCADE;"))
    con.execute(text("TRUNCATE TABLE player_stats_lol CASCADE;"))
    con.commit()

# --- NUEVO: Memoria global para evitar choques entre el archivo 2025 y 2026 ---
registros_vistos = set()

def procesar_e_insertar(archivo):
    print(f"\nProcesando EQUIPOS: {archivo}...")
    try:
        df = pd.read_csv(archivo, low_memory=False)
        df_equipos = df[df['position'] == 'team'].copy() if 'position' in df.columns else pd.DataFrame()
        if df_equipos.empty: return
        
        df_limpio = pd.DataFrame({
            'game_id': df_equipos['gameid'],
            'league': df_equipos['league'],
            'date': pd.to_datetime(df_equipos['date']),
            'season': obtener_columna(df_equipos, ['year', 'season']).astype(str),
            'team_name': df_equipos['teamname'],
            'side': df_equipos['side'],
            'win': df_equipos['result'] == 1,
            'game_length': df_equipos['gamelength'],
            
            'first_blood': obtener_columna(df_equipos, ['firstblood', 'first_blood'], 0) == 1.0,
            'first_tower': obtener_columna(df_equipos, ['firsttower', 'first_tower'], 0) == 1.0,
            'first_dragon': obtener_columna(df_equipos, ['firstdragon', 'first_dragon'], 0) == 1.0,
            'first_baron': obtener_columna(df_equipos, ['firstbaron', 'first_baron'], 0) == 1.0,
            
            'towers': pd.to_numeric(obtener_columna(df_equipos, ['towkills', 'towers', 'team_towers']), errors='coerce'),
            'dragons': pd.to_numeric(obtener_columna(df_equipos, ['dragons', 'team_dragons']), errors='coerce'),
            
            'team_kills': pd.to_numeric(obtener_columna(df_equipos, ['teamkills', 'kills'], 0), errors='coerce').fillna(0).astype(int),
            'team_deaths': pd.to_numeric(obtener_columna(df_equipos, ['teamdeaths', 'deaths'], 0), errors='coerce').fillna(0).astype(int),
            'gold_diff_at_15': pd.to_numeric(obtener_columna(df_equipos, ['gdat15', 'golddiffat15']), errors='coerce'),
            'dpm': pd.to_numeric(obtener_columna(df_equipos, ['dpm', 'team_dpm']), errors='coerce'),
            'wards_placed': pd.to_numeric(obtener_columna(df_equipos, ['wardsplaced']), errors='coerce'),
            'wards_cleared': pd.to_numeric(obtener_columna(df_equipos, ['wardskilled', 'wardscleared']), errors='coerce')
        })
        
        df_limpio = df_limpio.dropna(subset=['game_id', 'team_name'])
        
        # --- NUEVO: FILTRO DE DUPLICADOS ---
        # 1. Filtramos duplicados que vengan dentro del mismo archivo CSV
        df_limpio = df_limpio.drop_duplicates(subset=['game_id', 'team_name'])
        
        # 2. Filtramos duplicados si el partido ya se guardó en un CSV de un año anterior
        mask = df_limpio.apply(lambda row: (row['game_id'], row['team_name']) not in registros_vistos, axis=1)
        df_limpio = df_limpio[mask]
        
        # 3. Guardamos los nuevos en la memoria para el futuro
        for _, row in df_limpio.iterrows():
            registros_vistos.add((row['game_id'], row['team_name']))

        df_limpio['id'] = [str(uuid.uuid4()) for _ in range(len(df_limpio))]

        print(f"Subiendo {len(df_limpio)} equipos...")
        if not df_limpio.empty:
            df_limpio.to_sql('matches_lol', engine, if_exists='append', index=False, schema='public')
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    for archivo in archivos_csv:
        if os.path.exists(archivo): procesar_e_insertar(archivo)