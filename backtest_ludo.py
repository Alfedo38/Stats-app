import os
import pandas as pd
import numpy as np
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
    # 🔥 AHORA TRAEMOS MATCHUP Y POSICIÓN
    query = """
        SELECT pgl.player_id, p.position, pgl.game_date, pgl.matchup,
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.passes_made,
               pgl.pts, pgl.reb, pgl.ast, pgl.fga, pgl.fg3a
        FROM player_game_logs pgl
        JOIN players p ON pgl.player_id = p.id
        ORDER BY pgl.player_id ASC, pgl.game_date ASC
    """
    df = pd.read_sql(query, engine)
    
    df['opp'] = df['matchup'].astype(str).str[-3:]
    df_dvp = pd.read_sql("SELECT team, position, pts_allowed as dvp_pts, reb_allowed as dvp_reb, ast_allowed as dvp_ast, threes_allow as dvp_3pt FROM team_dvp", engine)
    df = pd.merge(df, df_dvp, left_on=['opp', 'position'], right_on=['team', 'position'], how='left').fillna(0)
    
    print("⏳ 2. Encendiendo la Máquina del Tiempo (Calculando contexto avanzado)...")
    df['game_date'] = pd.to_datetime(df['game_date'])
    df['rest_days'] = df.groupby('player_id')['game_date'].diff().dt.days.fillna(3).clip(upper=7)

    for col in ['touches', 'rebound_chances', 'passes_made']:
        df[col] = df.groupby('player_id')[col].transform(lambda x: x.fillna(x.mean())).fillna(0)

    cols_to_roll = ['min', 'usage_pct', 'touches', 'rebound_chances', 'passes_made', 'pts', 'reb', 'ast', 'fga', 'fg3a']
    for col in cols_to_roll:
        df[f'{col}_L5'] = df.groupby('player_id')[col].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())
    
    # Eficiencia L5
    df['ppm_L5'] = np.where(df['min_L5'] > 0, df['pts_L5'] / df['min_L5'], 0)
    df['fga_pm_L5'] = np.where(df['min_L5'] > 0, df['fga_L5'] / df['min_L5'], 0)
    
    df_clean = df.dropna().copy()
    
    # 🎯 FILTRAMOS UN MES ESPECÍFICO PARA TESTEAR
    df_test = df_clean[(df_clean['game_date'] >= '2026-04-01') & (df_clean['game_date'] <= '2026-04-30')].copy()
    
    print(f"\n🧠 3. Evaluando la Inteligencia Artificial (Motor XGBoost Enriquecido) en {len(df_test)} partidos de Abril...")

    for k, m in models.items():
        # 🔥 ACTUALIZAMOS LAS COLUMNAS PARA QUE COINCIDAN CON EL ENTRENAMIENTO
        if k == 'PTS': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'pts_L5', 'touches_L5', 'dvp_pts', 'rest_days', 'ppm_L5']
        elif k == 'REB': cols = ['min_L5', 'rebound_chances_L5', 'reb_L5', 'touches_L5', 'dvp_reb', 'rest_days']
        elif k == 'AST': cols = ['min_L5', 'passes_made_L5', 'ast_L5', 'touches_L5', 'usage_pct_L5', 'dvp_ast', 'rest_days']
        elif k == 'FGA': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'touches_L5', 'rest_days', 'fga_pm_L5']
        elif k == 'FG3A': cols = ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'dvp_3pt', 'rest_days']
        
        df_test[f'pred_{k}'] = m.predict(df_test[cols])
        df_test[f'error_{k}'] = abs(df_test[f'pred_{k}'] - df_test[k.lower()])
        
        error_promedio = df_test[f'error_{k}'].mean()
        print(f"   -> Precisión en {k}: Margen de error de +/- {round(error_promedio, 2)} por partido.")

if __name__ == "__main__":
    ejecutar_backtest()