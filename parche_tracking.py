import os
import time
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from nba_api.stats.endpoints import boxscoreadvancedv3, boxscoreplayertrackv3

load_dotenv()

# Conexión
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"), host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.nba.com/",
}

def obtener_partidos_recientes_vacios():
    # Solo buscamos partidos de la temporada actual (2025-2026) que tengan 0 en tracking
    query = """
        SELECT DISTINCT game_id 
        FROM player_game_logs 
        WHERE game_date >= '2025-10-01' 
        AND (potential_ast = 0 OR potential_ast IS NULL OR rebound_chances = 0)
        LIMIT 200; 
    """
    with engine.connect() as conn:
        return pd.read_sql(query, conn)['game_id'].tolist()

def main():
    games = obtener_partidos_recientes_vacios()
    print(f"🎯 Rescatando Tracking Data para {len(games)} partidos...")

    for idx, game_id in enumerate(games):
        # La API de la NBA exige que el game_id tenga 10 dígitos (ej: 0022500001)
        game_id_str = str(game_id).zfill(10)
        print(f"[{idx+1}/{len(games)}] Procesando {game_id_str}...")
        
        try:
            # 1. Traer Datos Avanzados (Usage Rate)
            adv = boxscoreadvancedv3.BoxScoreAdvancedV3(game_id=game_id_str, headers=HEADERS)
            df_adv = adv.get_data_frames()[0]
            time.sleep(2) # Pausa obligatoria para no ser bloqueado
            
            # 2. Traer Datos de Tracking (Potenciales y Touches)
            track = boxscoreplayertrackv3.BoxScorePlayerTrackV3(game_id=game_id_str, headers=HEADERS)
            df_track = track.get_data_frames()[0]
            time.sleep(2)

            if df_adv.empty or df_track.empty: continue

            # Normalizamos columnas a minúsculas para no fallar
            df_adv.columns = [c.lower() for c in df_adv.columns]
            df_track.columns = [c.lower() for c in df_track.columns]

            # Mapeo de columnas corregido para la v3 de la NBA
            # USG% suele venir como 'usagepercentage'
            # Potential Ast suele venir como 'assistspotential'
            # Rebound Chances suele venir como 'reboundchances'
            
            update_data = []
            for _, row in df_track.iterrows():
                p_id = int(row['personid'])
                
                # Buscamos el Usage en el otro dataframe
                adv_row = df_adv[df_adv['personid'] == p_id]
                usg = float(adv_row['usagepercentage'].iloc[0]) if not adv_row.empty else 0.0

                update_data.append({
                    "g_id": game_id_str,
                    "p_id": p_id,
                    "usg": usg,
                    "pot_ast": float(row.get('assistspotential', 0)),
                    "reb_ch": float(row.get('reboundchances', 0)),
                    "tch": float(row.get('touches', 0))
                })
            
            if update_data:
                update_query = text("""
                    UPDATE player_game_logs 
                    SET usage_pct = :usg, potential_ast = :pot_ast, 
                        rebound_chances = :reb_ch, touches = :tch
                    WHERE game_id = :g_id AND player_id = :p_id;
                """)
                with engine.begin() as conn:
                    conn.execute(update_query, update_data)
                    
        except Exception as e:
            print(f"⚠️ Error en {game_id_str}: {e}")
            time.sleep(10) # Si hay error, esperamos más por las dudas

    print("✅ ¡Actualización de Tracking completada!")

if __name__ == "__main__":
    main()