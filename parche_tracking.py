import os
import time
import random
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from nba_api.stats.endpoints import boxscoreadvancedv3, boxscoreplayertrackv3

load_dotenv()

# Conexión Segura a Supabase
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"), host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
}

def obtener_partidos_con_ceros():
    print("🔍 Buscando partidos con el 'Bug de los Ceros' en Tracking...")
    # Buscamos partidos donde el tracking falló y guardó un 0 literal
    query = """
        SELECT DISTINCT game_id 
        FROM player_game_logs 
        WHERE game_date >= '2025-10-01' 
        AND (potential_ast = 0 OR potential_ast IS NULL);
    """
    with engine.connect() as conn:
        return pd.read_sql(query, conn)['game_id'].tolist()

def main():
    games = obtener_partidos_con_ceros()
    print(f"🎯 Se encontraron {len(games)} partidos para re-parchar.")

    for idx, game_id in enumerate(games):
        game_id_str = str(game_id).zfill(10)
        print(f"[{idx+1}/{len(games)}] Escaneando partido {game_id_str}...")
        
        try:
            # Traer Advanced y Tracking
            df_adv = boxscoreadvancedv3.BoxScoreAdvancedV3(game_id=game_id_str, headers=HEADERS).get_data_frames()[0]
            time.sleep(1.5)
            df_track = boxscoreplayertrackv3.BoxScorePlayerTrackV3(game_id=game_id_str, headers=HEADERS).get_data_frames()[0]
            time.sleep(2) # Pausa larga para evitar baneo
            
            if df_adv.empty or df_track.empty: continue
            
            # Unimos los dataframes
            df_adv = df_adv[['personId', 'usagePercentage']] if 'usagePercentage' in df_adv.columns else pd.DataFrame(columns=['personId', 'usagePercentage'])
            df_merged = pd.merge(df_adv, df_track, on='personId', how='outer').fillna(0)
            
            # ====================================================================
            # 🛡️ EL ESCUDO ANTI-BUGS DE NOMBRES DE COLUMNAS (LA MAGIA)
            # ====================================================================
            # Buscamos cómo se llama realmente la columna de Asistencias hoy
            col_ast = next((col for col in df_merged.columns if 'potentialast' in col.lower() or 'potentialassists' in col.lower()), None)
            # Buscamos cómo se llaman las Chances de Rebote
            col_reb = next((col for col in df_merged.columns if 'reboundchances' in col.lower()), None)
            
            update_data = []
            for _, row in df_merged.iterrows():
                # Extracción Blindada
                usg = float(row.get('usagePercentage', 0))
                tch = float(row.get('touches', 0))
                passes = float(row.get('passes', 0))
                
                # Usamos el escudo para extraer Asistencias y Rebotes Potenciales
                pot_ast = float(row[col_ast]) if col_ast else 0.0
                reb_ch = float(row[col_reb]) if col_reb else 0.0

                # Solo actualizamos si realmente trajo datos
                if pot_ast > 0 or reb_ch > 0 or tch > 0:
                    update_data.append({
                        "g_id": game_id_str,
                        "p_id": int(row['personId']),
                        "usg": usg,
                        "pot_ast": pot_ast,
                        "reb_ch": reb_ch,
                        "passes": passes,
                        "tch": tch
                    })
            
            # Ejecutar el UPDATE en Supabase usando lote
            if update_data:
                update_query = text("""
                    UPDATE player_game_logs 
                    SET usage_pct = :usg, potential_ast = :pot_ast, rebound_chances = :reb_ch, 
                        passes_made = :passes, touches = :tch
                    WHERE game_id = :g_id AND player_id = :p_id;
                """)
                with engine.begin() as conn:
                    conn.execute(update_query, update_data)
                    
        except Exception as e:
            print(f"⚠️ Error en {game_id_str}: {e}")
            time.sleep(5)

    print("✅ ¡Rescate de datos completado! Las gráficas ya deberían tener vida.")

if __name__ == "__main__":
    main()