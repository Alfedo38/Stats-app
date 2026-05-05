import os
import time
import pandas as pd
from datetime import date, timedelta
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# 🟢 ENDPOINTS CORRECTOS DE LA NBA (ACTUALIZADO A V3)
from nba_api.stats.endpoints import playergamelogs, boxscoreplayertrackv3

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
SEASON = os.getenv("NBA_SEASON", "2025-26")

# 🔄 MAGIA: Ventana Móvil de 3 días para atrapar datos rezagados de la NBA
ayer = (date.today() - timedelta(days=1)).isoformat()
hace_tres_dias = (date.today() - timedelta(days=3)).isoformat()

START_DATE = os.getenv("TRACKING_START", hace_tres_dias)
END_DATE = os.getenv("TRACKING_END", ayer)

# =========================================================
# 3. MOTORES DE EXTRACCIÓN
# =========================================================
def obtener_logs_masivos(measure_type: str) -> pd.DataFrame:
    """Extrae Base o Advanced para todos los jugadores en un solo llamado"""
    print(f"📡 Solicitando logs masivos: {measure_type}...")
    for attempt in range(1, 6):
        try:
            logs = playergamelogs.PlayerGameLogs(
                season_nullable=SEASON,
                date_from_nullable=START_DATE,
                date_to_nullable=END_DATE,
                measure_type_player_game_logs_nullable=measure_type
            )
            df = logs.get_data_frames()[0]
            if not df.empty:
                df.columns = [c.upper() for c in df.columns]
                return df
        except Exception as e:
            print(f"   ⚠️ Error ({measure_type}) intento {attempt}: {e}")
            time.sleep(attempt * 2)
    return pd.DataFrame()

def obtener_tracking_por_juego(game_ids: list) -> pd.DataFrame:
    """Itera por los partidos del día para sacar los potenciales (Rebotes, Asistencias, Toques)"""
    print(f"📡 Extrayendo Tracking Stats de {len(game_ids)} partidos...")
    tracking_dfs = []
    
    for idx, gid in enumerate(game_ids, 1):
        print(f"   -> Partido {idx}/{len(game_ids)} (ID: {gid})")
        for attempt in range(1, 4):
            try:
                # API Endpoint V3
                track = boxscoreplayertrackv3.BoxScorePlayerTrackV3(game_id=gid)
                df_t = track.get_data_frames()[0]
                if not df_t.empty:
                    df_t.columns = [c.upper() for c in df_t.columns]
                    tracking_dfs.append(df_t)
                time.sleep(1) # Respiro para no saturar la API
                break
            except Exception as e:
                print(f"      ⚠️ Error en juego {gid}: {e}")
                time.sleep(2)
                
    if tracking_dfs:
        return pd.concat(tracking_dfs, ignore_index=True)
    return pd.DataFrame()

# =========================================================
# 4. INSERCIÓN SEGURA (UPSERT)
# =========================================================
def guardar_en_bd(df: pd.DataFrame) -> int:
    if df.empty: return 0
    try:
        df['game_date'] = pd.to_datetime(df['game_date']).dt.strftime('%Y-%m-%d')
        
        with engine.begin() as conn:
            # 🛡️ ESCUDO ANTI-FANTASMAS
            result = conn.execute(text("SELECT id FROM players"))
            valid_ids = {row[0] for row in result}
            df_clean = df[df['player_id'].isin(valid_ids)].copy()
            
            if df_clean.empty:
                print("   ⚠️ Todos los registros descartados (jugadores fantasmas o retirados).")
                return 0

            # Borrar datos de ayer para evitar duplicados si el script se corre dos veces
            fechas_a_insertar = tuple(df_clean['game_date'].unique())
            if len(fechas_a_insertar) == 1:
                conn.execute(text("DELETE FROM player_game_logs WHERE game_date = :fecha"), {"fecha": fechas_a_insertar[0]})
            else:
                conn.execute(text("DELETE FROM player_game_logs WHERE game_date IN :fechas"), {"fechas": fechas_a_insertar})
                
            # Limpiar nulos
            cols_numericas = ['pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'rebound_off', 'rebound_def', 'usage_pct', 'touches', 'rebound_chances', 'potential_ast', 'passes_made']
            df_clean[cols_numericas] = df_clean[cols_numericas].fillna(0)

            # Usar 'conn' en lugar de 'engine' evita el Deadlock
            df_clean.to_sql('player_game_logs', conn, if_exists='append', index=False)
            
        print(f"   💾 ¡ÉXITO! Se inyectaron {len(df_clean)} boxscores a la tabla principal.")
        return len(df_clean)
    except Exception as e:
        print(f"   ❌ Error fatal al subir a la Base de Datos: {e}")
        return 0

# =========================================================
# 5. MAIN PIPELINE
# =========================================================
def actualizar_potenciales() -> None:
    print(f"===========================================================")
    print(f"🧬 ACTUALIZACIÓN DIARIA AUTOMÁTICA (POTENCIALES & TRACKING)")
    print(f"===========================================================")
    print(f"Buscando partidos desde {START_DATE} hasta {END_DATE}")

    # 1. Base y Avanzadas (Masivo)
    df_base = obtener_logs_masivos("Base")
    if df_base.empty:
        print("😴 No hubo partidos ayer o la API falló. Finalizando.")
        return
        
    df_adv = obtener_logs_masivos("Advanced")

    # 2. Tracking (Iterativo por partido)
    juegos_del_dia = df_base['GAME_ID'].unique()
    df_track = obtener_tracking_por_juego(juegos_del_dia)

    print("\n⚙️ Cruzando dimensiones...")

    # Recortar columnas necesarias de ADVANCED
    if not df_adv.empty:
        col_adv = [c for c in ['GAME_ID', 'PLAYER_ID', 'USG_PCT'] if c in df_adv.columns]
        df_adv = df_adv[col_adv]
    else:
        df_adv = pd.DataFrame(columns=['GAME_ID', 'PLAYER_ID', 'USG_PCT'])

    # === TRADUCTOR V3 A V2 PARA TRACKING (EL PARCHE MÁGICO) ===
    if not df_track.empty:
        v3_cols = ['GAMEID', 'PERSONID', 'TOUCHES', 'REBOUNDCHANCESTOTAL', 'PASSES']
        columnas_validas = [c for c in v3_cols if c in df_track.columns]
        df_track = df_track[columnas_validas]
        
        df_track = df_track.rename(columns={
            'GAMEID': 'GAME_ID',
            'PERSONID': 'PLAYER_ID',
            'REBOUNDCHANCESTOTAL': 'REB_CHANCES',
            'PASSES': 'PASSES_MADE'
        })
        
        # Blindaje: Las columnas que la NBA eliminó en V3 (como POTENTIAL_AST) se llenan con 0
        cols_final_track = ['GAME_ID', 'PLAYER_ID', 'TOUCHES', 'REB_CHANCES', 'POTENTIAL_AST', 'PASSES_MADE']
        for col in cols_final_track:
            if col not in df_track.columns:
                df_track[col] = 0
                
        df_track = df_track[cols_final_track]
    else:
        df_track = pd.DataFrame(columns=['GAME_ID', 'PLAYER_ID', 'TOUCHES', 'REB_CHANCES', 'POTENTIAL_AST', 'PASSES_MADE'])
    # ==========================================================

    df_final = df_base.copy()
    
    # Merge de las 3 tablas
    df_final = pd.merge(df_final, df_adv, on=['GAME_ID', 'PLAYER_ID'], how='left')
    df_final = pd.merge(df_final, df_track, on=['GAME_ID', 'PLAYER_ID'], how='left')

    # Mapeo a SQL
    rename_map = {
        'GAME_ID': 'game_id', 'GAME_DATE': 'game_date', 'PLAYER_ID': 'player_id',
        'PLAYER_NAME': 'player_name', 'TEAM_ID': 'team_id', 'TEAM_ABBREVIATION': 'team_abbreviation',
        'MIN': 'min', 'PTS': 'pts', 'REB': 'reb', 'AST': 'ast', 'FGM': 'fgm', 'FGA': 'fga',
        'FG3M': 'fg3m', 'FG3A': 'fg3a', 'FTM': 'ftm', 'FTA': 'fta',
        'OREB': 'rebound_off', 'DREB': 'rebound_def',
        'USG_PCT': 'usage_pct', 'TOUCHES': 'touches', 'REB_CHANCES': 'rebound_chances',
        'POTENTIAL_AST': 'potential_ast', 'PASSES_MADE': 'passes_made'
    }
    
    cols_to_keep = list(rename_map.keys())
    for col in cols_to_keep:
        if col not in df_final.columns:
            df_final[col] = 0
            
    df_final = df_final[cols_to_keep].rename(columns=rename_map)

    print("🛡️ Aplicando filtro Anti-Fantasmas y subiendo a Supabase...")
    guardar_en_bd(df_final)
    print("\n🏆 ¡Proceso de Potenciales Finalizado!")

if __name__ == "__main__":
    actualizar_potenciales()