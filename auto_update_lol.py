import os
import uuid
import pandas as pd
import gdown
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# 1. CONEXIÓN A LA BASE DE DATOS
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

# 2. CONFIGURACIÓN DE GOOGLE DRIVE (¡Con tu ID real!)
FILE_ID = "1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm" 
URL_GDRIVE = f'https://drive.google.com/uc?id={FILE_ID}'
ARCHIVO_LOCAL = "data/2026_LoL_esports_match_data_from_OraclesElixir.csv"

def descargar_csv_actualizado():
    print("🌐 Descargando CSV oficial de 2026 desde Google Drive...")
    try:
        # fuzzy=True ayuda a saltar las advertencias de archivos grandes de Google Drive
        gdown.download(URL_GDRIVE, ARCHIVO_LOCAL, quiet=False, fuzzy=True)
        print("✅ Descarga completada y guardada en la carpeta 'data'.")
        return True
    except Exception as e:
        print(f"❌ Error al descargar desde Drive: {e}")
        return False

def obtener_columna(df, opciones, valor_por_defecto=None):
    for col in opciones:
        if col in df.columns: return df[col]
    return pd.Series(valor_por_defecto, index=df.index)

def actualizar_base_de_datos():
    if not os.path.exists(ARCHIVO_LOCAL):
        print(f"❌ Error: No se encontró el archivo en {ARCHIVO_LOCAL}.")
        return

    print("🧹 Borrando SOLO los datos del año 2026 en Supabase...")
    with engine.connect() as con:
        # Borramos solo 2026 para no tocar el historial antiguo
        con.execute(text("DELETE FROM player_stats_lol WHERE game_id IN (SELECT game_id FROM matches_lol WHERE season = '2026');"))
        con.execute(text("DELETE FROM matches_lol WHERE season = '2026';"))
        con.commit()
    print("✅ Datos viejos de 2026 eliminados.")

    print("📊 Procesando el nuevo archivo local...")
    df = pd.read_csv(ARCHIVO_LOCAL, low_memory=False)
    
    # Separar en Equipos y Jugadores
    df_equipos = df[df['position'] == 'team'].copy()
    df_jugadores = df[df['position'] != 'team'].copy()

    # --- INYECTAR EQUIPOS ---
    if not df_equipos.empty:
        df_equipos_limpio = pd.DataFrame({
            'game_id': df_equipos['gameid'], 'league': df_equipos['league'], 'date': pd.to_datetime(df_equipos['date']), 'season': obtener_columna(df_equipos, ['year', 'season']).astype(str),
            'team_name': df_equipos['teamname'], 'side': df_equipos['side'], 'win': df_equipos['result'] == 1, 'game_length': df_equipos['gamelength'],
            'first_blood': obtener_columna(df_equipos, ['firstblood', 'first_blood'], 0) == 1.0, 'first_tower': obtener_columna(df_equipos, ['firsttower', 'first_tower'], 0) == 1.0,
            'first_dragon': obtener_columna(df_equipos, ['firstdragon', 'first_dragon'], 0) == 1.0, 'first_baron': obtener_columna(df_equipos, ['firstbaron', 'first_baron'], 0) == 1.0,
            'towers': pd.to_numeric(obtener_columna(df_equipos, ['towkills', 'towers', 'team_towers']), errors='coerce'), 'dragons': pd.to_numeric(obtener_columna(df_equipos, ['dragons', 'team_dragons']), errors='coerce'),
            'team_kills': pd.to_numeric(obtener_columna(df_equipos, ['teamkills', 'kills'], 0), errors='coerce').fillna(0).astype(int),
            'team_deaths': pd.to_numeric(obtener_columna(df_equipos, ['teamdeaths', 'deaths'], 0), errors='coerce').fillna(0).astype(int),
            'gold_diff_at_15': pd.to_numeric(obtener_columna(df_equipos, ['gdat15', 'golddiffat15']), errors='coerce'), 'dpm': pd.to_numeric(obtener_columna(df_equipos, ['dpm', 'team_dpm']), errors='coerce'),
            'wards_placed': pd.to_numeric(obtener_columna(df_equipos, ['wardsplaced']), errors='coerce'), 'wards_cleared': pd.to_numeric(obtener_columna(df_equipos, ['wardskilled', 'wardscleared']), errors='coerce')
        }).dropna(subset=['game_id', 'team_name'])
        df_equipos_limpio['id'] = [str(uuid.uuid4()) for _ in range(len(df_equipos_limpio))]
        
        print(f"🚀 Subiendo {len(df_equipos_limpio)} partidas de equipos (2026)...")
        df_equipos_limpio.to_sql('matches_lol', engine, if_exists='append', index=False, schema='public')

    # --- INYECTAR JUGADORES ---
    if not df_jugadores.empty:
        df_jugadores_limpio = pd.DataFrame({
            'game_id': df_jugadores['gameid'], 'team_name': df_jugadores['teamname'], 'player_name': df_jugadores['playername'],
            'champion': df_jugadores['champion'], 'position': df_jugadores['position'],
            'kills': pd.to_numeric(obtener_columna(df_jugadores, ['kills'], 0), errors='coerce').fillna(0).astype(int),
            'deaths': pd.to_numeric(obtener_columna(df_jugadores, ['deaths'], 0), errors='coerce').fillna(0).astype(int),
            'assists': pd.to_numeric(obtener_columna(df_jugadores, ['assists'], 0), errors='coerce').fillna(0).astype(int),
            'creep_score': pd.to_numeric(obtener_columna(df_jugadores, ['total cs', 'minionkills'], 0), errors='coerce').fillna(0).astype(int),
            'cs_per_min': pd.to_numeric(obtener_columna(df_jugadores, ['cspm']), errors='coerce'), 'damage_share': pd.to_numeric(obtener_columna(df_jugadores, ['damageshare']), errors='coerce'),
            'gold_share': pd.to_numeric(obtener_columna(df_jugadores, ['earnedgoldshare', 'goldshare']), errors='coerce'), 'vision_score': pd.to_numeric(obtener_columna(df_jugadores, ['visionscore'], 0), errors='coerce').fillna(0).astype(int),
            'first_blood_kill': obtener_columna(df_jugadores, ['firstbloodkill'], 0) == 1.0, 'first_blood_victim': obtener_columna(df_jugadores, ['firstbloodvictim'], 0) == 1.0,
        }).dropna(subset=['game_id', 'player_name', 'team_name'])
        df_jugadores_limpio['id'] = [str(uuid.uuid4()) for _ in range(len(df_jugadores_limpio))]

        print(f"🚀 Subiendo {len(df_jugadores_limpio)} estadísticas de jugadores (2026)...")
        df_jugadores_limpio.to_sql('player_stats_lol', engine, if_exists='append', index=False, schema='public')
    
    print("🎉 ¡ACTUALIZACIÓN COMPLETADA CON ÉXITO!")

if __name__ == "__main__":
    # Primero descarga, si tiene éxito, entonces inyecta a la BD
    if descargar_csv_actualizado():
        actualizar_base_de_datos()
