import os
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from dotenv import load_dotenv
from xgboost import XGBRegressor
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

os.makedirs('modelos_ai', exist_ok=True)

def entrenar_modelos():
    print("📡 1. Descargando historial masivo y contexto de Supabase...")
    # 🔥 Agregamos posición y matchup a la consulta
    query = """
        SELECT pgl.player_id, p.position, pgl.game_date, pgl.matchup, 
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.passes_made,
               pgl.pts, pgl.reb, pgl.ast, pgl.fgm, pgl.fga, pgl.fg3m, pgl.fg3a, pgl.ftm, pgl.fta
        FROM player_game_logs pgl
        JOIN players p ON pgl.player_id = p.id
        ORDER BY pgl.player_id ASC, pgl.game_date ASC
    """
    df = pd.read_sql(query, engine)
    
    # Extraemos el rival (los últimos 3 caracteres del matchup, ej: 'LAL @ HOU' -> 'HOU')
    df['opp'] = df['matchup'].astype(str).str[-3:]
    
    print("🛡️ 2. Descargando Defensa Rival (DvP)...")
    df_dvp = pd.read_sql("SELECT team, position, pts_allowed as dvp_pts, reb_allowed as dvp_reb, ast_allowed as dvp_ast, threes_allow as dvp_3pt FROM team_dvp", engine)
    
    # Cruzamos los datos históricos con el DvP
    df = pd.merge(df, df_dvp, left_on=['opp', 'position'], right_on=['team', 'position'], how='left').fillna(0)
    
    print("⏳ 3. Calculando Fatiga, L5 y Eficiencia...")
    df['game_date'] = pd.to_datetime(df['game_date'])
    
    # Calculamos días de descanso
    df['rest_days'] = df.groupby('player_id')['game_date'].diff().dt.days.fillna(3) # Asume 3 días si es el primer partido
    # Tope a los días de descanso para que un mes sin jugar no rompa la matemática
    df['rest_days'] = df['rest_days'].clip(upper=7)

    cols_tracking = ['touches', 'rebound_chances', 'passes_made']
    for col in cols_tracking:
        df[col] = df.groupby('player_id')[col].transform(lambda x: x.fillna(x.mean())).fillna(0)

    cols_to_roll = ['min', 'usage_pct', 'touches', 'rebound_chances', 'passes_made', 
                    'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta']
    
    for col in cols_to_roll:
        df[f'{col}_L5'] = df.groupby('player_id')[col].transform(lambda x: x.shift(1).rolling(window=5, min_periods=1).mean())
    
    # Calculamos Eficiencia (Puntos por minuto y Tiros por minuto)
    df['ppm_L5'] = np.where(df['min_L5'] > 0, df['pts_L5'] / df['min_L5'], 0)
    df['fga_pm_L5'] = np.where(df['min_L5'] > 0, df['fga_L5'] / df['min_L5'], 0)
    
    df_clean = df.dropna().copy()
    print(f"✅ Quedaron {len(df_clean)} registros súper enriquecidos para entrenamiento.")

    # 4. CONFIGURACIÓN DE LOS MODELOS (AHORA CON DVP, FATIGA Y EFICIENCIA)
    modelos_config = {
        'PTS': ('puntos', ['min_L5', 'usage_pct_L5', 'fga_L5', 'pts_L5', 'touches_L5', 'dvp_pts', 'rest_days', 'ppm_L5']),
        'REB': ('rebotes', ['min_L5', 'rebound_chances_L5', 'reb_L5', 'touches_L5', 'dvp_reb', 'rest_days']),
        'AST': ('asistencias', ['min_L5', 'passes_made_L5', 'ast_L5', 'touches_L5', 'usage_pct_L5', 'dvp_ast', 'rest_days']),
        '3PT': ('triples', ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'fg3m_L5', 'dvp_3pt', 'rest_days']),
        'FGM': ('tiros_anotados', ['min_L5', 'usage_pct_L5', 'fga_L5', 'fgm_L5', 'dvp_pts']),
        'FGA': ('tiros_intentados', ['min_L5', 'usage_pct_L5', 'fga_L5', 'touches_L5', 'rest_days', 'fga_pm_L5']),
        'FG3A': ('triples_intentados', ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'dvp_3pt', 'rest_days']),
        'FTM': ('libres_anotados', ['min_L5', 'usage_pct_L5', 'fta_L5', 'ftm_L5']),
        'FTA': ('libres_intentados', ['min_L5', 'usage_pct_L5', 'fta_L5', 'rest_days'])
    }

    print("\n🏋️‍♂️ 4. Iniciando el Gimnasio Quant...")
    
    for stat_objetivo, (nombre_archivo, columnas_features) in modelos_config.items():
        print(f"   -> Entrenando cerebro para: {stat_objetivo}...", end=" ")
        
        X = df_clean[columnas_features]
        target_col = 'fg3m' if stat_objetivo == '3PT' else stat_objetivo.lower()
        Y = df_clean[target_col]
        
        modelo = XGBRegressor(
            n_estimators=150,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        )
        
        modelo.fit(X, Y)
        
        ruta_guardado = f'modelos_ai/ludogallina_{nombre_archivo}.pkl'
        joblib.dump(modelo, ruta_guardado)
        print("✅ Guardado.")

    print("\n🏆 ¡Entrenamiento con Feature Engineering completado!")

if __name__ == "__main__":
    entrenar_modelos()