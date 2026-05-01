import os
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv

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

def cargar_csv_cuotas(archivo_csv):
    print(f"📥 Leyendo cuotas desde: {archivo_csv}...")
    try:
        df = pd.read_csv(archivo_csv)
    except FileNotFoundError:
        print(f"❌ No se encontró el archivo {archivo_csv}.")
        return
    
    # 2. DICCIONARIO DE TRADUCCIÓN
    stat_mapping = {
        'POINTS': 'PTS',
        'REBOUNDS': 'REB',
        'ASSISTS': 'AST',
        'THREESMADE': '3PT',
        'POINTS+ASSISTS+REBOUNDS': 'PRA',
        'POINTS+REBOUNDS': 'PR',
        'POINTS+ASSISTS': 'PA',
        'ASSISTS+REBOUNDS': 'RA'
    }
    
    # 3. RENOMBRAR Y PRESERVAR TODO
    # Si la estadística está en el diccionario, la traduce (ej: POINTS -> PTS).
    # Si NO está, la deja con su nombre original (ej: TURNOVERS -> TURNOVERS).
    df['prop_type'] = df['Stat'].map(stat_mapping).fillna(df['Stat'])
    
    df_validos = df.rename(columns={
        'Jugador': 'player_name',
        'Linea': 'line',
        'Over': 'over_price',
        'Under': 'under_price'
    })
    
    df_validos['matchup'] = df_validos['Partido'].str.replace(' - ', ' @ ')
    
    df_final = df_validos[['player_name', 'prop_type', 'matchup', 'line', 'over_price', 'under_price']].copy()
    
    # Solo eliminamos si por error del CSV vino la MISMA estadística con la MISMA línea dos veces
    df_final = df_final.drop_duplicates(subset=['player_name', 'prop_type', 'line'])
    
    print(f"⚙️ Se procesaron {len(df_final)} líneas (Principales, Alternativas y Extras).")
    
    # 4. SUBIR A SUPABASE
    print("🚀 Borrando cuotas viejas y subiendo TODO a Supabase...")
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM player_odds;"))
            
        df_final.to_sql('player_odds', engine, if_exists='append', index=False)
        print("🏆 ¡Tu base de datos ahora tiene el menú completo de cuotas!")
        
    except Exception as e:
        print(f"⚠️ Error al subir a la Base de Datos: {e}")

if __name__ == "__main__":
    archivo = "lineas_nba_20260430_2120.csv" 
    cargar_csv_cuotas(archivo)