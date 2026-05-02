import os
import glob
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
    df['prop_type'] = df['Stat'].map(stat_mapping).fillna(df['Stat'])
    
    df_validos = df.rename(columns={
        'Jugador': 'player_name',
        'Linea': 'line',
        'Over': 'over_price',
        'Under': 'under_price'
    })
    
    df_validos['matchup'] = df_validos['Partido'].str.replace(' - ', ' @ ')
    
    df_final = df_validos[['player_name', 'prop_type', 'matchup', 'line', 'over_price', 'under_price']].copy()
    
    # Eliminamos duplicados
    df_final = df_final.drop_duplicates(subset=['player_name', 'prop_type', 'line'])
    
    print(f"⚙️ Se procesaron {len(df_final)} líneas (Principales, Alternativas y Extras).")
    
    # 4. SUBIR A SUPABASE
    print("🚀 Borrando cuotas viejas y subiendo TODO a Supabase...")
    try:
        with engine.begin() as conn:
            # TRUNCATE es mucho más rápido y limpio que DELETE
            conn.execute(text("TRUNCATE TABLE player_odds;")) 
            
        df_final.to_sql('player_odds', engine, if_exists='append', index=False)
        print("🏆 ¡Tu base de datos ahora tiene el menú completo de cuotas!")
        
        # 5. ELIMINAR EL ARCHIVO CSV DESPUÉS DE SUBIR EXITOSAMENTE
        print(f"🧹 Eliminando el archivo local {archivo_csv} para mantener orden...")
        os.remove(archivo_csv)
        print("✨ ¡Archivo eliminado! La carpeta quedó limpia para la próxima extracción.")
        
    except Exception as e:
        print(f"⚠️ Error al subir a la Base de Datos: {e}")

if __name__ == "__main__":
    # Buscar cualquier archivo .csv en la carpeta actual de forma automática
    archivos_csv = glob.glob("*.csv")
    
    if not archivos_csv:
        print("🤷‍♂️ No hay ningún archivo CSV en la carpeta para procesar.")
    else:
        # Si hay más de uno por error, agarramos el más reciente
        archivos_csv.sort(reverse=True) 
        archivo_a_subir = archivos_csv[0]
        cargar_csv_cuotas(archivo_a_subir)