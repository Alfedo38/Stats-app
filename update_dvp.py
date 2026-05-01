import os
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from datetime import datetime
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

def actualizar_dvp():
    print("🛡️ 1. Calculando la Defensa contra Posición (DvP) desde nuestra propia base...")
    
    # SQL Mágico: Une los partidos con las posiciones de los jugadores y saca el promedio que permite cada equipo
    # Usamos opponent_abbr (el equipo rival) para saber a quién le anotaron
    query = """
        SELECT 
            pgl.opponent_abbr as team,
            p.position,
            AVG(pgl.pts) as pts_allowed,
            AVG(pgl.reb) as reb_allowed,
            AVG(pgl.ast) as ast_allowed,
            AVG(pgl.fg3m) as threes_allow
        FROM player_game_logs pgl
        JOIN players p ON pgl.player_id = p.id
        WHERE pgl.opponent_abbr IS NOT NULL 
          AND p.position IS NOT NULL
          -- Filtramos para que no analice posiciones raras o en blanco
          AND p.position IN ('PG', 'SG', 'SF', 'PF', 'C', 'G', 'F')
        GROUP BY pgl.opponent_abbr, p.position
    """
    
    df_dvp = pd.read_sql(query, engine)
    
    if df_dvp.empty:
        print("❌ No se pudieron calcular los datos. Revisá tu tabla de jugadores.")
        return
        
    df_dvp['updated_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    print(f"-> Se calcularon {len(df_dvp)} métricas de Equipo vs Posición.")
    
    print("💾 2. Guardando en la tabla team_dvp...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE team_dvp"))
        df_dvp.to_sql('team_dvp', conn, if_exists='append', index=False)
        
    print("✅ Matriz Defensiva (DvP) actualizada con éxito.")
    
    # Te imprimo un ejemplo en pantalla para que veas la magia
    ejemplo = df_dvp[df_dvp['position'].str.contains('PG')].sort_values('ast_allowed', ascending=False).head(3)
    print("\n👀 EL RADAR LUDO: Peores equipos defendiendo Asistencias de los Bases (PG):")
    for idx, row in ejemplo.iterrows():
        print(f"   🚨 {row['team']} permite {row['ast_allowed']:.1f} AST por partido a los Bases.")

if __name__ == "__main__":
    actualizar_dvp()