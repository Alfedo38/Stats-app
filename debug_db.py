import os
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
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

print("🔍 --- RADIOGRAFÍA DE LUDOGALLINA --- 🔍\n")

# 1. Revisar la tabla de jugadores
df_players = pd.read_sql("SELECT COUNT(*) as c FROM players", engine)
print(f"1️⃣ Total de jugadores en la tabla 'players': {df_players['c'][0]}")

if df_players['c'][0] > 0:
    df_pos = pd.read_sql("SELECT position, COUNT(*) as c FROM players GROUP BY position", engine)
    print("\n2️⃣ Formato de posiciones registradas:")
    print(df_pos.to_string(index=False))

# 3. Revisar si hay equipos rivales registrados
df_opp = pd.read_sql("SELECT opponent_abbr, COUNT(*) as c FROM player_game_logs GROUP BY opponent_abbr LIMIT 5", engine)
print("\n3️⃣ Equipos rivales (opponent_abbr) en tu historial:")
print(df_opp.to_string(index=False))

# 4. Revisar si el ID conecta bien
df_join = pd.read_sql("SELECT COUNT(*) as c FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.id", engine)
print(f"\n4️⃣ Partidos que logran conectarse con un jugador (JOIN): {df_join['c'][0]}")
print("\n==============================================")