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

def normalizar_mercado(stat_raw):
    """
    Traductor Universal de Mercados de Stake a Acrónimos de la Base de Datos.
    EXCLUYE ROBOS Y BLOQUEOS.
    """
    stat = str(stat_raw).upper().strip()
    
    # 🚫 Doble filtro de seguridad
    if "STEAL" in stat or "BLOCK" in stat:
        return None
    
    stat_clean = stat.replace(" ", "").replace("AND", "+")
    
    # 1. Mapeo Directo Full Game
    mapping = {
        'POINTS': 'PTS',
        'REBOUNDS': 'REB',
        'ASSISTS': 'AST',
        'THREESMADE': '3PT',
        '3-POINTERSMADE': '3PT',
        'THREEPOINTERSMADE': '3PT',
        'TURNOVERS': 'TOV',
        'POINTS+ASSISTS+REBOUNDS': 'PRA',
        'POINTS+REBOUNDS': 'PR',
        'POINTS+ASSISTS': 'PA',
        'ASSISTS+REBOUNDS': 'RA',
        'FIELDGOALSMADE': 'FGM',
        'FIELDGOALSATTEMPTED': 'FGA',
        'FREETHROWSMADE': 'FTM',
        'FREETHROWSATTEMPTED': 'FTA',
        'DOUBLEDOUBLE': 'DD',
        'TRIPLEDOUBLE': 'TD'
    }
    
    if stat_clean in mapping:
        return mapping[stat_clean]
        
    # 2. Detección Inteligente del Primer Cuarto (Q1)
    if '1ST QUARTER' in stat or 'FIRST QUARTER' in stat or 'Q1' in stat:
        if 'POINT' in stat: return 'Q1_PTS'
        if 'REBOUND' in stat: return 'Q1_REB'
        if 'ASSIST' in stat: return 'Q1_AST'
        if 'THREE' in stat or '3-POINTER' in stat: return 'Q1_3PT'
        
    # 3. Detección Inteligente de la Primera Mitad (H1)
    if '1ST HALF' in stat or 'FIRST HALF' in stat or 'H1' in stat:
        if 'POINT' in stat: return 'H1_PTS'
        if 'REBOUND' in stat: return 'H1_REB'
        if 'ASSIST' in stat: return 'H1_AST'
        if 'THREE' in stat or '3-POINTER' in stat: return 'H1_3PT'

    return stat

def cargar_csv_cuotas(archivo_csv):
    print(f"📥 Leyendo cuotas desde: {archivo_csv}...")
    try:
        df = pd.read_csv(archivo_csv)
    except FileNotFoundError:
        print(f"❌ No se encontró el archivo {archivo_csv}.")
        return
    
    # 2. APLICAR TRADUCTOR UNIVERSAL
    df['prop_type'] = df['Stat'].apply(normalizar_mercado)
    
    # 3. ELIMINAR LOS DESCARTES (None)
    df = df.dropna(subset=['prop_type'])
    
    df_validos = df.rename(columns={
        'Jugador': 'player_name',
        'Linea': 'line',
        'Over': 'over_price',
        'Under': 'under_price'
    })
    
    df_validos['matchup'] = df_validos['Partido'].str.replace(' - ', ' @ ')
    
    df_final = df_validos[['player_name', 'prop_type', 'matchup', 'line', 'over_price', 'under_price']].copy()
    
    df_final = df_final.drop_duplicates(subset=['player_name', 'prop_type', 'line'])
    
    print(f"⚙️ Se procesaron {len(df_final)} mercados (PTS, REB, AST, 3PT, FGA, Q1, etc).")
    
    # 4. SUBIR A SUPABASE
    print("🚀 Borrando cuotas viejas y subiendo TODO a Supabase...")
    try:
        with engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE player_odds;")) 
            
        df_final.to_sql('player_odds', engine, if_exists='append', index=False)
        print("🏆 ¡Tu base de datos ahora tiene el arsenal limpio de cuotas!")
        
        print(f"🧹 Eliminando el archivo local {archivo_csv}...")
        os.remove(archivo_csv)
        print("✨ ¡Archivo eliminado! La carpeta quedó limpia.")
        
    except Exception as e:
        print(f"⚠️ Error al subir a la Base de Datos: {e}")

if __name__ == "__main__":
    archivos_csv = glob.glob("*.csv")
    
    if not archivos_csv:
        print("🤷‍♂️ No hay ningún archivo CSV en la carpeta para procesar.")
    else:
        archivos_csv.sort(reverse=True) 
        archivo_a_subir = archivos_csv[0]
        cargar_csv_cuotas(archivo_a_subir)