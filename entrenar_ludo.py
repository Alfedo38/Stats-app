import os
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from dotenv import load_dotenv
from sklearn.ensemble import GradientBoostingRegressor
import joblib

load_dotenv()

# 1. CONFIGURACIÓN
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

# Creamos la carpeta para guardar los cerebros si no existe
os.makedirs('modelos_ai', exist_ok=True)

def entrenar_modelos():
    print("📡 1. Descargando historial masivo de Supabase (Esto puede tomar unos segundos)...")
    # Traemos todo el historial ordenado para que la máquina del tiempo funcione bien
    query = """
        SELECT player_id, game_date, min, usage_pct, touches, rebound_chances, passes_made,
               pts, reb, ast, fgm, fga, fg3m, fg3a, ftm, fta, stl, blk, tov
        FROM player_game_logs
        ORDER BY player_id ASC, game_date ASC
    """
    df = pd.read_sql(query, engine)
    
    print(f"📊 Se cargaron {len(df)} partidos históricos.")
    print("⏳ 2. Encendiendo la 'Máquina del Tiempo' (Calculando L5 sin ver el futuro)...")
    
    # 🛡️ EL SECRETO DEL EXITO: El shift(1)
    # Rellenamos los vacíos del tracking con la media del jugador para que no hayan nulos
    cols_tracking = ['touches', 'rebound_chances', 'passes_made']
    for col in cols_tracking:
        df[col] = df.groupby('player_id')[col].transform(lambda x: x.fillna(x.mean())).fillna(0)

    # Las estadísticas que queremos promediar de los últimos 5 partidos PREVIOS
    cols_to_roll = ['min', 'usage_pct', 'touches', 'rebound_chances', 'passes_made', 
                    'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'stl', 'blk', 'tov']
    
    for col in cols_to_roll:
        # Agrupamos por jugador, tomamos la columna, shift(1) desplaza 1 fila (no ve el partido actual) y saca la media de los 5 anteriores
        df[f'{col}_L5'] = df.groupby('player_id')[col].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())
    
    # Borramos los partidos donde el L5 está vacío (el primer partido de la historia de cada jugador)
    df_clean = df.dropna().copy()
    print(f"✅ Quedaron {len(df_clean)} registros válidos de entrenamiento después de limpiar.")

    # 3. CONFIGURACIÓN DE LOS MODELOS A ENTRENAR
    # Diccionario: 'ESTADISTICA_TARGET': ('nombre_del_archivo', ['features_a_mirar'])
    modelos_config = {
        'PTS': ('puntos', ['min_L5', 'usage_pct_L5', 'fga_L5', 'pts_L5', 'touches_L5']),
        'REB': ('rebotes', ['min_L5', 'rebound_chances_L5', 'reb_L5', 'touches_L5']),
        'AST': ('asistencias', ['min_L5', 'passes_made_L5', 'ast_L5', 'touches_L5', 'usage_pct_L5']),
        '3PT': ('triples', ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'fg3m_L5']),
        
        # 🔥 TUS NUEVOS MERCADOS FAVORITOS
        'FGM': ('tiros_anotados', ['min_L5', 'usage_pct_L5', 'fga_L5', 'fgm_L5']),
        'FGA': ('tiros_intentados', ['min_L5', 'usage_pct_L5', 'fga_L5', 'touches_L5']),
        'FG3A': ('triples_intentados', ['min_L5', 'usage_pct_L5', 'fg3a_L5']),
        'FTM': ('libres_anotados', ['min_L5', 'usage_pct_L5', 'fta_L5', 'ftm_L5']),
        'FTA': ('libres_intentados', ['min_L5', 'usage_pct_L5', 'fta_L5']),
        
        # 🛡️ LOS MERCADOS DEFENSIVOS / EXTRAS
        'STL': ('robos', ['min_L5', 'stl_L5', 'usage_pct_L5']),
        'BLK': ('tapones', ['min_L5', 'blk_L5', 'rebound_chances_L5']),
        'TOV': ('perdidas', ['min_L5', 'usage_pct_L5', 'tov_L5', 'touches_L5'])
    }

    print("\n🏋️‍♂️ 3. Iniciando el Gimnasio de Machine Learning...")
    
    for stat_objetivo, (nombre_archivo, columnas_features) in modelos_config.items():
        print(f"   -> Entrenando cerebro para: {stat_objetivo}...", end=" ")
        
        X = df_clean[columnas_features]
        # El target (Y) es lo que el jugador REALMENTE hizo en ese partido
        if stat_objetivo == '3PT': target_col = 'fg3m' # El nombre en la BD es fg3m
        else: target_col = stat_objetivo.lower()
        
        Y = df_clean[target_col]
        
        # Usamos Gradient Boosting: excelente para datos tabulares y predecir proyecciones
        modelo = GradientBoostingRegressor(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
        modelo.fit(X, Y)
        
        ruta_guardado = f'modelos_ai/ludogallina_{nombre_archivo}.pkl'
        joblib.dump(modelo, ruta_guardado)
        print("✅ Guardado.")

    print("\n🏆 ¡Entrenamiento masivo completado! Ludogallina ya es experta en 12 mercados distintos.")

if __name__ == "__main__":
    entrenar_modelos()