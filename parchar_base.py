import os
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from nba_api.stats.endpoints import playerindex
from dotenv import load_dotenv

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
engine = create_engine(db_url)

def aplicar_parche():
    print("🛠️ 1. Recortando los equipos rivales de tu historial...")
    # "LAL @ BOS" -> Toma las últimas 3 letras -> "BOS"
    with engine.begin() as conn:
        conn.execute(text("UPDATE player_game_logs SET opponent_abbr = RIGHT(matchup, 3) WHERE matchup IS NOT NULL;"))
    print("✅ Rivales (opponent_abbr) extraídos y guardados.\n")

    print("🛠️ 2. Descargando las posiciones oficiales de la NBA...")
    try:
        # Traemos el índice de todos los jugadores activos (1 sola llamada rapidísima)
        pi = playerindex.PlayerIndex()
        df_pos = pi.get_data_frames()[0]
        
        # Filtramos ID y Posición
        df_pos = df_pos[['PERSON_ID', 'POSITION']].dropna()
        df_pos = df_pos.rename(columns={'PERSON_ID': 'id', 'POSITION': 'position'})
        
        print(f"-> Se encontraron {len(df_pos)} posiciones. Actualizando a tus jugadores...")
        
        # Inyectamos las posiciones en tu tabla
        with engine.begin() as conn:
            for idx, row in df_pos.iterrows():
                query = text("UPDATE players SET position = :pos WHERE id = :pid")
                conn.execute(query, {"pos": row['position'], "pid": row['id']})
                
        print("✅ Posiciones actualizadas con éxito.")
    except Exception as e:
        print(f"❌ Error: {e}")

    print("\n🎉 ¡PARCHE APLICADO! La base de datos está curada.")

if __name__ == "__main__":
    aplicar_parche()
