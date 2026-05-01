import os
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
import joblib
from dotenv import load_dotenv

load_dotenv()

# 1. CONEXIÓN
password_raw = os.getenv("DB_PASSWORD")
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=password_raw, host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)

# 2. CARGAMOS LOS CEREBROS
mercados = {
    'PTS': 'puntos', 'REB': 'rebotes', 'AST': 'asistencias',
    'FGA': 'tiros_intentados', 'FG3A': 'triples_intentados'
}
models = {k: joblib.load(f'modelos_ai/ludogallina_{v}.pkl') for k, v in mercados.items()}

def ejecutar_backtest():
    print("📡 1. Descargando historial de Supabase...")
    query = """
        SELECT player_id, player_name, game_date, min, usage_pct, touches, rebound_chances, passes_made,
               pts, reb, ast, fga, fg3a
        FROM player_game_logs
        ORDER BY player_id ASC, game_date ASC
    """
    df = pd.read_sql(query, engine)
    
    print("⏳ 2. Encendiendo la Máquina del Tiempo (Calculando L5 sin espiar el futuro)...")
    # Llenamos vacíos de tracking
    for col in ['touches', 'rebound_chances', 'passes_made']:
        df[col] = df.groupby('player_id')[col].transform(lambda x: x.fillna(x.mean())).fillna(0)

    # Calculamos el L5 PREVIO a cada partido
    cols_to_roll = ['min', 'usage_pct', 'touches', 'rebound_chances', 'passes_made', 'pts', 'reb', 'ast', 'fga', 'fg3a']
    for col in cols_to_roll:
        df[f'{col}_L5'] = df.groupby('player_id')[col].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())
    
    df_clean = df.dropna().copy()
    
    # 🔥 EL PARCHE: Homologamos el formato de fecha para que pueda comparar
    df_clean['game_date'] = pd.to_datetime(df_clean['game_date'])
    
    # 🎯 FILTRAMOS UN MES ESPECÍFICO PARA TESTEAR (Ej: Abril 2026)
    df_test = df_clean[(df_clean['game_date'] >= '2026-04-01') & (df_clean['game_date'] <= '2026-04-30')].copy()
    
    print(f"\n🧠 3. Evaluando la Inteligencia Artificial en {len(df_test)} partidos de Abril...")

    for k, m in models.items():
        if k == 'PTS': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'pts_L5', 'touches_L5']
        elif k == 'REB': cols = ['min_L5', 'rebound_chances_L5', 'reb_L5', 'touches_L5']
        elif k == 'AST': cols = ['min_L5', 'passes_made_L5', 'ast_L5', 'touches_L5', 'usage_pct_L5']
        elif k == 'FGA': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'touches_L5']
        elif k == 'FG3A': cols = ['min_L5', 'usage_pct_L5', 'fg3a_L5']
        
        # Hacemos la predicción
        df_test[f'pred_{k}'] = m.predict(df_test[cols])
        
        # Calculamos el Error Absoluto (Por cuántos puntos/rebotes le erramos a la realidad)
        # La realidad es la columna en minúscula (ej: pts), la predicción es pred_PTS
        df_test[f'error_{k}'] = abs(df_test[f'pred_{k}'] - df_test[k.lower()])
        
        error_promedio = df_test[f'error_{k}'].mean()
        
        print(f"   -> Precisión en {k}: Margen de error de +/- {round(error_promedio, 2)} por partido.")

if __name__ == "__main__":
    ejecutar_backtest()