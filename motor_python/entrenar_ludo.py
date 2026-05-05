import os
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from dotenv import load_dotenv
from xgboost import XGBRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error
import joblib
import warnings
warnings.filterwarnings('ignore')

load_dotenv()

# -------------------------------------------------------------------
# 1. CONFIGURACIÓN
# -------------------------------------------------------------------
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"), host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)
os.makedirs('modelos_ai', exist_ok=True)

# Encoding numérico de posición para que XGBoost aprenda por posición
POSICION_ENCODING = {'G': 1, 'G-F': 2, 'F-G': 2, 'F': 3, 'F-C': 4, 'C-F': 4, 'C': 5}

# -------------------------------------------------------------------
# 2. HELPERS
# -------------------------------------------------------------------
def get_opp(row):
    """Extrae el rival de forma segura sin importar el formato del matchup."""
    matchup = str(row['matchup']).replace('.', '').strip()
    team    = str(row['team_abbreviation']).strip()
    sep     = '@' if '@' in matchup else ('vs' if 'vs' in matchup.lower() else None)
    if sep:
        parts = [p.strip() for p in matchup.split(sep)]
        if len(parts) == 2:
            return parts[1] if parts[0].endswith(team) or parts[0] == team else parts[0]
    return matchup[-3:]


def calcular_rolling_dvp(df):
    """
    Rolling DvP — para cada partido solo usa la defensa del rival
    calculada con partidos ANTERIORES a esa fecha.
    Evita el Data Leakage de usar el DvP final de temporada.
    """
    print("    📐 Calculando Rolling DvP (sin Data Leakage)...")

    # Necesitamos stats reales por partido para calcular cuánto permitió cada equipo
    # Usamos los mismos logs: lo que anotó un jugador = lo que permitió el equipo rival
    df_dvp_rolling = df[['game_date', 'opp', 'position', 'pts', 'reb', 'ast', 'fg3m']].copy()
    df_dvp_rolling = df_dvp_rolling.rename(columns={
        'pts': 'pts_allowed', 'reb': 'reb_allowed',
        'ast': 'ast_allowed', 'fg3m': 'threes_allowed'
    })

    # Ordenamos y calculamos media móvil histórica por equipo+posición
    df_dvp_rolling = df_dvp_rolling.sort_values('game_date')

    for stat in ['pts_allowed', 'reb_allowed', 'ast_allowed', 'threes_allowed']:
        df_dvp_rolling[f'{stat}_roll'] = (
            df_dvp_rolling.groupby(['opp', 'position'])[stat]
            .transform(lambda x: x.shift(1).expanding(min_periods=3).mean())
        )

    # Renombramos para el merge
    df_dvp_rolling = df_dvp_rolling.rename(columns={
        'pts_allowed_roll':    'dvp_pts',
        'reb_allowed_roll':    'dvp_reb',
        'ast_allowed_roll':    'dvp_ast',
        'threes_allowed_roll': 'dvp_3pt',
    })

    return df_dvp_rolling[['game_date', 'opp', 'position', 'dvp_pts', 'dvp_reb', 'dvp_ast', 'dvp_3pt']]


def kelly_fraccional(edge_pct, odds, fraccion=0.25):
    """Kelly Criterion fraccional matemáticamente correcto."""
    if odds <= 1 or edge_pct <= 0:
        return 0.0

    ev    = edge_pct / 100.0
    p_win = (ev + 1.0) / odds
    p_win = min(p_win, 0.99)
    p_lose = 1.0 - p_win
    b      = odds - 1.0

    kelly = (b * p_win - p_lose) / b
    kelly = max(0.0, kelly)
    return round(min(kelly * fraccion, 0.20), 4)


def feature_importance_report(modelo, features, stat_name):
    """Imprime el top 5 de features más importantes del modelo."""
    imp = dict(zip(features, modelo.feature_importances_))
    top = sorted(imp.items(), key=lambda x: x[1], reverse=True)[:5]
    print(f"         📊 Top features: " + " | ".join([f"{k}={v:.3f}" for k, v in top]))


# -------------------------------------------------------------------
# 3. CARGA Y PREPARACIÓN DE DATOS
# -------------------------------------------------------------------
def cargar_datos():
    print("📡 1. Descargando historial y cruzando con datos de Q1...")
    query = text("""
        SELECT pgl.player_id, p.position, pgl.team_abbreviation, pgl.game_date, pgl.matchup,
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.passes_made,
               pgl.potential_ast, pgl.rebound_off, pgl.rebound_def,
               pgl.pts, pgl.reb, pgl.ast, pgl.fgm, pgl.fga, pgl.fg3m, pgl.fg3a, pgl.ftm, pgl.fta,
               COALESCE(q1.q1_pts, 0) as q1_pts, 
               COALESCE(q1.q1_reb, 0) as q1_reb, 
               COALESCE(q1.q1_ast, 0) as q1_ast,
               COALESCE(q1.q1_oreb, 0) as q1_oreb,
               COALESCE(q1.q1_dreb, 0) as q1_dreb
        FROM player_game_logs pgl
        JOIN players p ON pgl.player_id = p.id
        LEFT JOIN player_q1_stats q1 
               ON CAST(pgl.game_id AS INTEGER) = CAST(q1.game_id AS INTEGER) 
               AND pgl.player_id = q1.player_id
        WHERE pgl.game_date >= '2025-10-01'
          AND pgl.min >= 10
          AND (
            CAST(pgl.game_id AS TEXT) LIKE '225%%'
            OR CAST(pgl.game_id AS TEXT) LIKE '425%%'
            OR CAST(pgl.game_id AS TEXT) LIKE '625%%'
          )
        ORDER BY pgl.player_id ASC, pgl.game_date ASC
    """)
    df = pd.read_sql(query, engine)

    if df.empty:
        print("❌ No hay datos suficientes.")
        return None

    print(f"    ✅ {len(df)} registros cargados ({df['player_id'].nunique()} jugadores únicos)")
    return df


def preparar_features(df):
    print("⏳ 2. Preparando features y extrayendo momentum...")

    df['game_date'] = pd.to_datetime(df['game_date'])
    df = df.sort_values(['player_id', 'game_date'])

    df['pos_enc'] = df['position'].map(POSICION_ENCODING).fillna(3)
    df['opp'] = df.apply(get_opp, axis=1)

    df['is_home'] = df.apply(
        lambda r: 0 if str(r['matchup']).split('@')[-1].strip().startswith(r['team_abbreviation']) else 1
        if '@' in str(r['matchup']) else 1, axis=1
    )

    df['rest_days'] = df.groupby('player_id')['game_date'].diff().dt.days.fillna(3).clip(upper=7)
    df['is_b2b']    = (df['rest_days'] <= 1).astype(int)

    cols_tracking = ['touches', 'rebound_chances', 'passes_made', 'potential_ast', 'rebound_off', 'rebound_def']
    for col in cols_tracking:
        df[col] = df[col].fillna(0)

    cols_to_roll = [
        'min', 'usage_pct', 'touches', 'rebound_chances', 'passes_made',
        'potential_ast', 'rebound_off', 'rebound_def',
        'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta',
        'q1_pts', 'q1_reb', 'q1_ast'
    ]

    for col in cols_to_roll:
        df[f'{col}_L5']  = df.groupby('player_id')[col].transform(lambda x: x.shift(1).rolling(window=5,  min_periods=1).mean())
        df[f'{col}_L10'] = df.groupby('player_id')[col].transform(lambda x: x.shift(1).rolling(window=10, min_periods=1).mean())
        df[f'{col}_season'] = df.groupby('player_id')[col].transform(lambda x: x.shift(1).expanding(min_periods=1).mean())

    df['pts_momentum'] = df['pts_L5'] - df['pts_season']
    df['reb_momentum'] = df['reb_L5'] - df['reb_season']
    df['ast_momentum'] = df['ast_L5'] - df['ast_season']

    df['q1_pts_pct_L5'] = np.where(df['pts_L5'] > 0, df['q1_pts_L5'] / df['pts_L5'], 0)
    df['q1_reb_pct_L5'] = np.where(df['reb_L5'] > 0, df['q1_reb_L5'] / df['reb_L5'], 0)
    df['q1_ast_pct_L5'] = np.where(df['ast_L5'] > 0, df['q1_ast_L5'] / df['ast_L5'], 0)

    df['ppm_L5']    = np.where(df['min_L5'] > 0, df['pts_L5']  / df['min_L5'], 0)
    df['fga_pm_L5'] = np.where(df['min_L5'] > 0, df['fga_L5']  / df['min_L5'], 0)
    df['ast_pm_L5'] = np.where(df['min_L5'] > 0, df['ast_L5']  / df['min_L5'], 0)
    df['reb_pm_L5'] = np.where(df['min_L5'] > 0, df['reb_L5']  / df['min_L5'], 0)

    df_dvp_roll = calcular_rolling_dvp(df)
    df = pd.merge(df, df_dvp_roll, on=['game_date', 'opp', 'position'], how='left')

    for col in ['dvp_pts', 'dvp_reb', 'dvp_ast', 'dvp_3pt']:
        global_mean = df[col].mean()
        df[col] = df[col].fillna(global_mean)

    df = df.fillna(0)
    print(f"    ✅ Features listos. {len(df)} filas × {len(df.columns)} columnas.")
    return df


# -------------------------------------------------------------------
# 4. CONFIGURACIÓN DE MODELOS
# -------------------------------------------------------------------
MODELOS_CONFIG = {
    # ── MODELOS CLÁSICOS (PARTIDO COMPLETO) ──
    'PTS': (
        'puntos',
        ['min_L5', 'min_L10', 'usage_pct_L5', 'usage_pct_L10', 'fga_L5', 'fga_L10',
         'pts_L5', 'pts_L10', 'pts_season', 'touches_L5', 'ppm_L5',
         'pts_momentum', 'q1_pts_L5', 'q1_pts_pct_L5', 
         'dvp_pts', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'pts', 'reg:squarederror'
    ),
    'REB': (
        'rebotes',
        ['min_L5', 'min_L10', 'rebound_chances_L5', 'rebound_chances_L10',
         'rebound_off_L5', 'rebound_def_L5', 'reb_L5', 'reb_L10', 'reb_season',
         'touches_L5', 'reb_pm_L5', 
         'reb_momentum', 'q1_reb_L5', 'q1_reb_pct_L5', 
         'dvp_reb', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'reb', 'reg:squarederror'
    ),
    'AST': (
        'asistencias',
        ['min_L5', 'min_L10', 'passes_made_L5', 'passes_made_L10',
         'potential_ast_L5', 'potential_ast_L10', 'ast_L5', 'ast_L10', 'ast_season',
         'touches_L5', 'usage_pct_L5', 'ast_pm_L5',
         'ast_momentum', 'q1_ast_L5', 'q1_ast_pct_L5', 
         'dvp_ast', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'ast', 'reg:squarederror'
    ),
    '3PT': (
        'triples',
        ['min_L5', 'min_L10', 'usage_pct_L5', 'fg3a_L5', 'fg3a_L10',
         'fg3m_L5', 'fg3m_L10', 'fg3m_season',
         'dvp_3pt', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'fg3m', 'count:poisson'     
    ),
    'FGM': (
        'tiros_anotados',
        ['min_L5', 'usage_pct_L5', 'fga_L5', 'fgm_L5', 'fgm_L10', 'fgm_season',
         'dvp_pts', 'is_b2b', 'is_home', 'pos_enc'],
        'fgm', 'reg:squarederror'
    ),
    'FGA': (
        'tiros_intentados',
        ['min_L5', 'usage_pct_L5', 'fga_L5', 'fga_L10', 'touches_L5',
         'rest_days', 'fga_pm_L5', 'is_b2b', 'is_home', 'pos_enc'],
        'fga', 'reg:squarederror'
    ),
    'FG3A': (
        'triples_intentados',
        ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'fg3a_L10', 'fg3a_season',
         'dvp_3pt', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'fg3a', 'count:poisson'     
    ),
    'FTM': (
        'libres_anotados',
        ['min_L5', 'usage_pct_L5', 'fta_L5', 'ftm_L5', 'ftm_L10', 'ftm_season',
         'is_b2b', 'is_home', 'pos_enc'],
        'ftm', 'reg:squarederror'
    ),
    'FTA': (
        'libres_intentados',
        ['min_L5', 'usage_pct_L5', 'fta_L5', 'fta_L10', 'fta_season',
         'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'fta', 'reg:squarederror'
    ),
    
    # ── NUEVOS MODELOS (EXCLUSIVOS PRIMER CUARTO) ──
    'Q1_PTS': (
        'q1_puntos',
        ['min_L5', 'usage_pct_L5', 'q1_pts_L5', 'q1_pts_L10', 'q1_pts_season',
         'pts_L5', 'q1_pts_pct_L5', 'dvp_pts', 'is_b2b', 'is_home', 'pos_enc'],
        'q1_pts', 'reg:squarederror'
    ),
    'Q1_REB': (
        'q1_rebotes',
        ['min_L5', 'q1_reb_L5', 'q1_reb_L10', 'q1_reb_season',
         'reb_L5', 'dvp_reb', 'is_b2b', 'is_home', 'pos_enc'],
        'q1_reb', 'reg:squarederror'
    ),
    'Q1_AST': (
        'q1_asistencias',
        ['min_L5', 'usage_pct_L5', 'q1_ast_L5', 'q1_ast_L10', 'q1_ast_season',
         'ast_L5', 'dvp_ast', 'is_b2b', 'is_home', 'pos_enc'],
        'q1_ast', 'reg:squarederror'
    ),
}


# -------------------------------------------------------------------
# 5. ENTRENAMIENTO CON TIMESERIES CROSS-VALIDATION
# -------------------------------------------------------------------
def entrenar_modelos():
    df_raw = cargar_datos()
    if df_raw is None:
        return

    df = preparar_features(df_raw)

    print("\n🏋️‍♂️ 3. Iniciando Gimnasio Quant (TimeSeriesSplit + Early Stopping)...")
    print(f"    Estrategia: 5-fold temporal | Early stopping: 20 rondas\n")

    df_sorted = df.sort_values('game_date').reset_index(drop=True)
    tscv = TimeSeriesSplit(n_splits=5)

    resumen = []

    for stat, (nombre_archivo, features, target_col, objetivo) in MODELOS_CONFIG.items():
        features_disp = [f for f in features if f in df_sorted.columns]
        if target_col not in df_sorted.columns:
            print(f"   ⚠️  {stat}: columna target '{target_col}' no encontrada, salteando.")
            continue

        X = df_sorted[features_disp]
        y = df_sorted[target_col]

        maes_cv = []

        # Cross-validation temporal
        for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
            X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
            y_tr, y_val = y.iloc[train_idx], y.iloc[val_idx]

            m = XGBRegressor(
                n_estimators=400,
                learning_rate=0.03,
                max_depth=4,
                subsample=0.8,
                colsample_bytree=0.8,
                min_child_weight=5,
                gamma=0.1,
                objective=objetivo,
                random_state=42,
                n_jobs=-1,
                early_stopping_rounds=20,
            )
            m.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
            preds = m.predict(X_val)
            if objetivo == 'count:poisson':
                preds = np.round(preds)
            maes_cv.append(mean_absolute_error(y_val, preds))

        mae_cv_mean = np.mean(maes_cv)
        mae_cv_std  = np.std(maes_cv)

        # Entrenamiento final con todos los datos
        split_final = int(len(df_sorted) * 0.85)
        X_train_f = X.iloc[:split_final]
        X_val_f   = X.iloc[split_final:]
        y_train_f = y.iloc[:split_final]
        y_val_f   = y.iloc[split_final:]

        modelo_final = XGBRegressor(
            n_estimators=400,
            learning_rate=0.03,
            max_depth=4,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=5,
            gamma=0.1,
            objective=objetivo,
            random_state=42,
            n_jobs=-1,
            early_stopping_rounds=20,
        )
        modelo_final.fit(
            X_train_f, y_train_f,
            eval_set=[(X_val_f, y_val_f)],
            verbose=False
        )

        preds_final = modelo_final.predict(X_val_f)
        mae_final   = mean_absolute_error(y_val_f, preds_final)

        ruta = f'modelos_ai/ludogallina_{nombre_archivo}.pkl'
        joblib.dump(modelo_final, ruta)

        print(f"   ✅ {stat.ljust(6)} | "
              f"MAE CV: {mae_cv_mean:.2f} ±{mae_cv_std:.2f} | "
              f"MAE Final: {mae_final:.2f} | "
              f"Árboles: {modelo_final.best_iteration} | "
              f"Obj: {objetivo}")
        feature_importance_report(modelo_final, features_disp, stat)

        resumen.append({
            'stat': stat, 'mae_cv': round(mae_cv_mean, 3),
            'mae_cv_std': round(mae_cv_std, 3), 'mae_final': round(mae_final, 3),
            'best_iter': modelo_final.best_iteration,
            'n_features': len(features_disp)
        })

    # ── Resumen final ──────────────────────────────────────────────────
    print("\n" + "="*65)
    print("🏆 RESUMEN FINAL DEL ENTRENAMIENTO")
    print("="*65)
    df_res = pd.DataFrame(resumen).sort_values('mae_cv')
    for _, r in df_res.iterrows():
        barra = '█' * int(r['mae_cv'] * 3)
        print(f"   {r['stat'].ljust(6)} | MAE={r['mae_cv']:.2f} ±{r['mae_cv_std']:.2f} | {barra}")

    print(f"\n✅ 12 Modelos (9 Full Game + 3 Primer Cuarto) guardados en modelos_ai/")
    return resumen


# -------------------------------------------------------------------
# 6. ENTRY POINT
# -------------------------------------------------------------------
if __name__ == "__main__":
    import time
    start = time.time()
    resumen = entrenar_modelos()
    elapsed = round(time.time() - start, 1)
    print(f"\n⏱️  Tiempo total de entrenamiento: {elapsed}s")