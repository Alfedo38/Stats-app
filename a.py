import os
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

load_dotenv()

print("🚀 Iniciando carga masiva de Q1 a Supabase...")

# 1. Conexión a la Base de Datos
db_url = URL.create(
    drivername="postgresql",
    username=os.getenv("DB_USER", "postgres.xxhdctrvjsngwbagamns"),
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
    port=int(os.getenv("DB_PORT", "6543")),
    database=os.getenv("DB_NAME", "postgres"),
    query={"sslmode": os.getenv("DB_SSLMODE", "require")}
)
engine = create_engine(db_url)

# 2. Leer el CSV 
archivo_csv = "q1_qa_export.csv"
if not os.path.exists(archivo_csv):
    print(f"❌ No se encontró el archivo {archivo_csv}")
    exit()

df = pd.read_csv(archivo_csv, dtype={'game_id': str, 'season': str})
filas_originales = len(df)
print(f"📄 Archivo leído: {filas_originales} filas.")

# 3. Limpieza de Seguridad Básica
df = df.dropna(subset=['player_id', 'player_name'])
df = df.drop_duplicates(subset=['game_id', 'player_id'])

# 🟢 4. EL ESCUDO ANTI-FANTASMAS (Verificar claves foráneas)
print("🛡️ Verificando IDs válidos en la base de datos...")
try:
    # Traemos todos los IDs válidos que existen en tu tabla maestra 'players'
    with engine.connect() as conn:
        valid_players = pd.read_sql("SELECT id FROM players", conn)
        valid_ids = valid_players['id'].tolist()
        
    # Filtramos el CSV: nos quedamos solo con los jugadores que de verdad tenés registrados
    df_validado = df[df['player_id'].isin(valid_ids)]
    
    filas_descartadas = len(df) - len(df_validado)
    print(f"✅ Se validaron los IDs. Se descartaron {filas_descartadas} filas por IDs fantasmas.")
    
except Exception as e:
    print(f"⚠️ Aviso: No se pudo verificar la tabla 'players' (Error: {e}). Se intentará subir todo crudo.")
    df_validado = df

# 5. Inyección Masiva a la Base de Datos
try:
    print("⏳ Subiendo a Supabase... (esto puede tardar unos segundos)")
    
    df_validado.to_sql(
        name=os.getenv("PLAYER_Q1_STATS_TABLE", "player_q1_stats"), 
        con=engine, 
        if_exists='append', 
        index=False, 
        method='multi',      
        chunksize=1000       
    )
    print("✅ ¡Carga masiva completada con éxito!")
    
except Exception as e:
    print(f"❌ Error crítico durante la carga: {e}")