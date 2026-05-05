import os
import json
import math
import time
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
import joblib
from datetime import datetime
from dotenv import load_dotenv
from google import genai
from google.genai import types
import warnings
warnings.filterwarnings('ignore')

load_dotenv()

# -------------------------------------------------------------------
# 1. CONFIGURACIÓN
# -------------------------------------------------------------------
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=os.getenv("DB_PASSWORD"), host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543, database="postgres", query={"sslmode": "require"}
)
engine = create_engine(db_url)

TEAM_MAP = {
    'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN', 'Charlotte Hornets': 'CHA',
    'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE', 'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN',
    'Detroit Pistons': 'DET', 'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
    'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA',
    'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK',
    'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
    'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR',
    'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS'
}

POSICION_ENCODING = {'G': 1, 'G-F': 2, 'F-G': 2, 'F': 3, 'F-C': 4, 'C-F': 4, 'C': 5}
POSICION_BUMP = {
    'G':  {'G': 1.20, 'F': 1.05, 'C': 1.02},
    'F':  {'G': 1.05, 'F': 1.20, 'C': 1.08},
    'C':  {'G': 1.02, 'F': 1.08, 'C': 1.20},
    'G-F':{'G': 1.12, 'F': 1.12, 'C': 1.04},
    'F-C':{'G': 1.03, 'F': 1.12, 'C': 1.15},
}

# MAE real de cada modelo — umbral mínimo para que el edge sea creíble
MAE_DICT = {
    'Q1_AST': 0.69, 'Q1_REB': 0.85, '3PT': 0.97, 'FTM': 1.12, 'FTA': 1.35,
    'AST': 1.47, 'FG3A': 1.63, 'FGM': 1.83, 'REB': 1.84, 'Q1_PTS': 2.01,
    'FGA': 2.88, 'PTS': 4.81, 'PRA': 8.12, 'PR': 6.65, 'PA': 6.28, 'RA': 3.31
}

FEATURES = {
    'PTS':    ['min_L5','min_L10','usage_pct_L5','usage_pct_L10','fga_L5','fga_L10','pts_L5','pts_L10','pts_season','touches_L5','ppm_L5','pts_momentum','q1_pts_L5','q1_pts_pct_L5','dvp_pts','rest_days','is_b2b','is_home','pos_enc'],
    'REB':    ['min_L5','min_L10','rebound_chances_L5','rebound_chances_L10','rebound_off_L5','rebound_def_L5','reb_L5','reb_L10','reb_season','touches_L5','reb_pm_L5','reb_momentum','q1_reb_L5','q1_reb_pct_L5','dvp_reb','rest_days','is_b2b','is_home','pos_enc'],
    'AST':    ['min_L5','min_L10','passes_made_L5','passes_made_L10','potential_ast_L5','potential_ast_L10','ast_L5','ast_L10','ast_season','touches_L5','usage_pct_L5','ast_pm_L5','ast_momentum','q1_ast_L5','q1_ast_pct_L5','dvp_ast','rest_days','is_b2b','is_home','pos_enc'],
    '3PT':    ['min_L5','min_L10','usage_pct_L5','fg3a_L5','fg3a_L10','fg3m_L5','fg3m_L10','fg3m_season','dvp_3pt','rest_days','is_b2b','is_home','pos_enc'],
    'FGM':    ['min_L5','usage_pct_L5','fga_L5','fgm_L5','fgm_L10','fgm_season','dvp_pts','is_b2b','is_home','pos_enc'],
    'FGA':    ['min_L5','usage_pct_L5','fga_L5','fga_L10','touches_L5','rest_days','fga_pm_L5','is_b2b','is_home','pos_enc'],
    'FG3A':   ['min_L5','usage_pct_L5','fg3a_L5','fg3a_L10','fg3a_season','dvp_3pt','rest_days','is_b2b','is_home','pos_enc'],
    'FTM':    ['min_L5','usage_pct_L5','fta_L5','ftm_L5','ftm_L10','ftm_season','is_b2b','is_home','pos_enc'],
    'FTA':    ['min_L5','usage_pct_L5','fta_L5','fta_L10','fta_season','rest_days','is_b2b','is_home','pos_enc'],
    'Q1_PTS': ['min_L5','usage_pct_L5','q1_pts_L5','q1_pts_L10','q1_pts_season','pts_L5','q1_pts_pct_L5','dvp_pts','is_b2b','is_home','pos_enc'],
    'Q1_REB': ['min_L5','q1_reb_L5','q1_reb_L10','q1_reb_season','reb_L5','dvp_reb','is_b2b','is_home','pos_enc'],
    'Q1_AST': ['min_L5','usage_pct_L5','q1_ast_L5','q1_ast_L10','q1_ast_season','ast_L5','dvp_ast','is_b2b','is_home','pos_enc'],
}

# -------------------------------------------------------------------
# 2. CLASIFICADOR DE CALIDAD
# -------------------------------------------------------------------
def clasificar_linea(h5, n5, h10, n10):
    """
    JOYA y EXCELENTE: AND estricto — ambas ventanas deben cumplir.
    BUENA: OR — basta con que una ventana cumpla (más picks pero honestos).
    Esto evita descartar jugadores en racha reciente (4/5) aunque el L10 sea menor.
    """
    if n10 < 5:
        return 'BASURA'   # muestra insuficiente → no apostamos
    pct5  = h5  / max(n5,  1)
    pct10 = h10 / max(n10, 1)
    # JOYA: racha perfecta reciente O excelente en ambas (AND)
    if pct5 >= 1.0:                      return 'JOYA'
    if pct5 >= 0.9 and pct10 >= 0.9:    return 'JOYA'
    # EXCELENTE: AND — ambas ventanas sólidas
    if pct5 >= 0.8 and pct10 >= 0.8:    return 'EXCELENTE'
    # BUENA: OR — racha reciente fuerte O consistencia histórica
    if pct5 >= 0.6 or pct10 >= 0.6:     return 'BUENA'
    return 'BASURA'

def emoji_calidad(calidad):
    return {'JOYA': '💎', 'EXCELENTE': '⭐', 'BUENA': '🌟'}.get(calidad, '📊')

def titulo_par(calidades):
    """Título honesto basado en la PEOR línea del par."""
    orden = {'JOYA': 3, 'EXCELENTE': 2, 'BUENA': 1, 'BASURA': 0}
    peor  = min(calidades, key=lambda c: orden.get(c, 0))
    return emoji_calidad(peor)

# -------------------------------------------------------------------
# 3. HELPERS
# -------------------------------------------------------------------
def kelly_fraccional(edge_pct, odds, fraccion=0.25):
    """Kelly Criterion fraccional — matemáticamente correcto."""
    if odds <= 1 or edge_pct <= 0: return 0.005
    p_win  = min((edge_pct / 100.0 + 1.0) / odds, 0.99)
    b      = odds - 1.0
    kelly  = max(0.0, (b * p_win - (1 - p_win)) / b)
    return round(min(kelly * fraccion, 0.20), 4) or 0.005

def obtener_bajas_equipo(team_abbr, df_inj):
    if df_inj.empty or not team_abbr: return ""
    bajas = df_inj[df_inj['team'] == team_abbr]['injured_player'].tolist()
    return f"🚑 OUT: {', '.join(bajas[:2])}{'...' if len(bajas) > 2 else ''}" if bajas else ""

def construir_play(row, guion, analisis_dict, df_inj):
    clave   = f"{row['player_name']}_{row['prop_type']}"
    calidad = row.get('calidad', 'BUENA')
    # Fallback enriquecido con datos clave — no solo proyección y edge
    fallback = (
        f"{emoji_calidad(calidad)} [{calidad}] {guion} {row['line']} {row['prop_type']} | "
        f"Proy: {row['proj']} | Edge: +{round(row['edge'],1)}% | "
        f"HR: {row.get('hr','')} | "
        f"{'🏠 Local' if row.get('is_home',0)==1 else '✈️ Visitante'}"
        f"{' | ⚠️ B2B' if row.get('is_b2b',0)==1 else ''}"
    )
    # Solo VIPs (JOYA/EXCELENTE) reciben análisis de IA
    raw = analisis_dict.get(clave, fallback) if row.get('is_vip', False) else fallback
    if isinstance(raw, dict):   raw = str(list(raw.values())[0]) if raw else fallback
    elif isinstance(raw, list): raw = str(raw[0]) if raw else fallback
    else:                       raw = str(raw)

    odds_val = float(row['price'])
    return {
        "player_id": int(row.get('player_id', 0)) if pd.notnull(row.get('player_id')) else 0,
        "player":    row['player_name'],
        "team":      row['team_abbreviation'],
        "type":      guion,
        "prop":      row['prop_type'],
        "line":      float(row['line']),
        "odds":      odds_val,
        "proj":      float(row['proj']),
        "edge":      round(float(row['edge']), 1),
        "analysis":  raw,
        "calidad":   calidad,
        "is_vip":    bool(row.get('is_vip', False)),
        "safe_line": float(row.get('s_line', row['line'])),
        "safe_odds": float(row.get('s_odds', row['price'])),
        "safe_prob": float(row.get('s_prob', 0)),
        "hit_rate":  row.get('hr', ""),
        "injuries":  obtener_bajas_equipo(row['team_abbreviation'], df_inj),
        "stake":     kelly_fraccional(float(row['edge']), odds_val),
    }

def armar_ticket(nombre, df_subset, tipo_guion, analisis_dict, df_inj):
    plays = [construir_play(row, tipo_guion, analisis_dict, df_inj)
             for _, row in df_subset.iterrows()]
    return {
        "name":       nombre,
        "total_odds": round(math.prod([max(p['odds'], 1.01) for p in plays]), 2),
        "plays":      plays,
        "calidades":  [p['calidad'] for p in plays],
    }

def log(msg): print(f"   {msg}")

# -------------------------------------------------------------------
# 4. EXTRACCIÓN DE DATOS
# -------------------------------------------------------------------
def obtener_datos():
    hoy_str = datetime.now().strftime('%Y-%m-%d')
    print(f"\n{'='*60}")
    print(f"📅 LUDO ENGINE — {hoy_str}")
    print(f"{'='*60}")

    print("\n📡 PASO 1 — Líneas del día (Full Game + Q1)")
    query_stats = "'PTS','REB','AST','3PT','PRA','PR','PA','RA','FGM','FGA','FG3A','FTM','FTA','Q1_PTS','Q1_REB','Q1_AST'"
    df_odds = pd.read_sql(text(f"""
        SELECT player_name, prop_type, matchup, line, over_price, under_price
        FROM player_odds WHERE prop_type IN ({query_stats})
    """), engine)

    if df_odds.empty:
        print("   ⚠️  Sin odds hoy. Abortando.")
        return None, None, None, None

    def get_abbr(m):
        try:
            parts = m.split(' @ ') if ' @ ' in m else m.split(' vs ')
            return TEAM_MAP.get(parts[0], ''), TEAM_MAP.get(parts[1], '')
        except: return '', ''

    df_odds[['away_team','home_team']] = df_odds.apply(
        lambda r: get_abbr(r['matchup']), axis=1, result_type='expand'
    )
    log(f"✅ {len(df_odds)} odds | {df_odds['matchup'].nunique()} partidos | {df_odds['prop_type'].nunique()} tipos de prop")

    print("\n📊 PASO 2 — Historial (con shift(1) para alinear con el entrenamiento)")
    df_logs = pd.read_sql(text("""
        SELECT pgl.player_id, pgl.player_name, pgl.team_abbreviation, p.position, pgl.game_date,
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.potential_ast,
               pgl.rebound_off, pgl.rebound_def, pgl.passes_made,
               pgl.pts, pgl.reb, pgl.ast, pgl.fgm, pgl.fga, pgl.fg3a, pgl.fg3m, pgl.ftm, pgl.fta,
               COALESCE(q1.q1_pts, 0) as q1_pts,
               COALESCE(q1.q1_reb, 0) as q1_reb,
               COALESCE(q1.q1_ast, 0) as q1_ast
        FROM player_game_logs pgl
        JOIN players p ON pgl.player_id = p.id
        LEFT JOIN player_q1_stats q1
            ON CAST(pgl.game_id AS INTEGER) = CAST(q1.game_id AS INTEGER)
            AND pgl.player_id = q1.player_id
        WHERE pgl.game_date >= '2025-10-01' AND pgl.min > 0
        ORDER BY pgl.player_id ASC, pgl.game_date ASC
    """), engine)

    if df_logs.empty:
        print("   ⚠️  Sin historial. Abortando.")
        return None, None, None, None

    df_logs['game_date'] = pd.to_datetime(df_logs['game_date'])
    cols_tracking = ['touches','rebound_chances','passes_made','potential_ast','rebound_off','rebound_def']
    df_logs[cols_tracking] = df_logs[cols_tracking].fillna(0)

    # ── FIX CRÍTICO: shift(1) — igual que en el entrenamiento ─────────
    # Sin shift(1), las features incluyen el partido actual → distribución
    # diferente a la que vio el modelo → predicciones sesgadas.
    cols_to_roll = [
        'min','usage_pct','touches','rebound_chances','passes_made',
        'potential_ast','rebound_off','rebound_def',
        'pts','reb','ast','fgm','fga','fg3m','fg3a','ftm','fta',
        'q1_pts','q1_reb','q1_ast'
    ]
    for col in cols_to_roll:
        df_logs[f'{col}_L5'] = df_logs.groupby('player_id')[col].transform(
            lambda x: x.shift(1).rolling(5, min_periods=1).mean()
        )
        df_logs[f'{col}_L10'] = df_logs.groupby('player_id')[col].transform(
            lambda x: x.shift(1).rolling(10, min_periods=1).mean()
        )
        df_logs[f'{col}_season'] = df_logs.groupby('player_id')[col].transform(
            lambda x: x.shift(1).expanding(min_periods=1).mean()
        )

    # Momentum = diferencia entre forma reciente y promedio de temporada
    df_logs['pts_momentum']  = df_logs['pts_L5']  - df_logs['pts_season']
    df_logs['reb_momentum']  = df_logs['reb_L5']  - df_logs['reb_season']
    df_logs['ast_momentum']  = df_logs['ast_L5']  - df_logs['ast_season']
    # Qué porcentaje del total de partido lo hace en el Q1
    df_logs['q1_pts_pct_L5'] = np.where(df_logs['pts_L5'] > 0, df_logs['q1_pts_L5'] / df_logs['pts_L5'], 0)
    df_logs['q1_reb_pct_L5'] = np.where(df_logs['reb_L5'] > 0, df_logs['q1_reb_L5'] / df_logs['reb_L5'], 0)
    df_logs['q1_ast_pct_L5'] = np.where(df_logs['ast_L5'] > 0, df_logs['q1_ast_L5'] / df_logs['ast_L5'], 0)

    # ── df de hit rate separados: FG y Q1 no se mezclan nunca ─────────
    df_hit_fg = df_logs.groupby('player_id').tail(10).copy()
    df_hit_fg.rename(columns={
        'pts':'PTS','reb':'REB','ast':'AST','fg3m':'3PT',
        'fgm':'FGM','fga':'FGA','fg3a':'FG3A','ftm':'FTM','fta':'FTA'
    }, inplace=True)
    df_hit_fg['PRA'] = df_hit_fg['PTS'] + df_hit_fg['REB'] + df_hit_fg['AST']
    df_hit_fg['PR']  = df_hit_fg['PTS'] + df_hit_fg['REB']
    df_hit_fg['PA']  = df_hit_fg['PTS'] + df_hit_fg['AST']
    df_hit_fg['RA']  = df_hit_fg['REB'] + df_hit_fg['AST']

    df_hit_q1 = df_logs.groupby('player_id').tail(10).copy()
    df_hit_q1['Q1_PTS'] = df_hit_q1['q1_pts']
    df_hit_q1['Q1_REB'] = df_hit_q1['q1_reb']
    df_hit_q1['Q1_AST'] = df_hit_q1['q1_ast']

    # Stats actuales por jugador (último partido, con shift ya aplicado)
    df_stats = df_logs.groupby('player_id').tail(1).copy()
    df_stats['rest_days'] = (pd.to_datetime(hoy_str) - df_stats['game_date']).dt.days.clip(upper=7)
    df_stats['is_b2b']    = (df_stats['rest_days'] <= 1).astype(int)
    df_stats['pos_enc']   = df_stats['position'].map(POSICION_ENCODING).fillna(3)
    df_stats['ppm_L5']    = np.where(df_stats['min_L5'] > 0, df_stats['pts_L5']  / df_stats['min_L5'], 0)
    df_stats['fga_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['fga_L5']  / df_stats['min_L5'], 0)
    df_stats['ast_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['ast_L5']  / df_stats['min_L5'], 0)
    df_stats['reb_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['reb_L5']  / df_stats['min_L5'], 0)
    df_stats = df_stats.fillna(0)

    log(f"✅ {df_logs['player_id'].nunique()} jugadores | {len(df_logs)} registros históricos")

    print("\n🛡️  PASO 3 — DvP, Lesiones y Cruce")
    df_dvp = pd.read_sql(
        "SELECT team, position, pts_allowed as dvp_pts, reb_allowed as dvp_reb, "
        "ast_allowed as dvp_ast, threes_allow as dvp_3pt FROM team_dvp", engine
    )
    df_inj = pd.read_sql(
        "SELECT team, player_name as injured_player, position as inj_position "
        "FROM player_injuries WHERE status ILIKE '%%out%%'", engine
    )

    df_cruce = pd.merge(df_odds, df_stats, on='player_name', how='inner')
    mask_ok  = (df_cruce['team_abbreviation'] == df_cruce['home_team']) | \
               (df_cruce['team_abbreviation'] == df_cruce['away_team'])
    df_cruce = df_cruce[mask_ok].copy()
    df_cruce['is_home'] = (df_cruce['team_abbreviation'] == df_cruce['home_team']).astype(int)
    df_cruce['opp']     = df_cruce.apply(
        lambda r: r['home_team'] if r['is_home'] == 0 else r['away_team'], axis=1
    )
    df_cruce = pd.merge(df_cruce, df_dvp, left_on=['opp','position'],
                        right_on=['team','position'], how='left').fillna(0)
    log(f"✅ {len(df_cruce)} props cruzadas con historial")

    return df_cruce, (df_hit_fg, df_hit_q1), df_inj, df_odds

# -------------------------------------------------------------------
# 5. MOTOR CENTRAL
# -------------------------------------------------------------------
def ludo_engine(df_cruce, logs_tuple, df_inj, df_odds_raw):
    if df_cruce is None or df_cruce.empty: return
    df_cruce = df_cruce.copy()
    df_hit_fg, df_hit_q1 = logs_tuple

    # ── Efecto Dominó por posición ────────────────────────────────────
    print("\n🚑 PASO 4 — Efecto Dominó (ajuste por bajas)")
    n_bajas = 0
    for team in df_inj['team'].unique():
        bajas_team = df_inj[df_inj['team'] == team]
        mask_sanos = df_cruce['team_abbreviation'] == team
        if df_cruce[mask_sanos].empty: continue
        for idx_j, jugador in df_cruce[mask_sanos].iterrows():
            pos_j   = str(jugador.get('position','G')).split('-')[0]
            mult_ac = 1.0
            for _, baja in bajas_team.iterrows():
                pos_b   = str(baja.get('inj_position','G')).split('-')[0]
                mult_ac *= POSICION_BUMP.get(pos_b, POSICION_BUMP['G']).get(pos_j, 1.05)
            mult = min(mult_ac, 1.25)
            for col in ['usage_pct_L5','usage_pct_L10','fga_L5','fga_L10',
                        'fg3a_L5','fta_L5','touches_L5','potential_ast_L5']:
                if col in df_cruce.columns:
                    v = df_cruce.at[idx_j, col] * mult
                    df_cruce.at[idx_j, col] = min(v, 100.0) if 'pct' in col else v
            n_bajas += 1
    log(f"✅ {len(df_inj)} bajas procesadas → ajuste aplicado a {n_bajas} filas")

    # ── XGBoost ───────────────────────────────────────────────────────
    print("\n🧠 PASO 5 — Predicciones XGBoost")
    mercados = {
        'PTS':'puntos','REB':'rebotes','AST':'asistencias','3PT':'triples',
        'FGM':'tiros_anotados','FGA':'tiros_intentados','FG3A':'triples_intentados',
        'FTM':'libres_anotados','FTA':'libres_intentados',
        'Q1_PTS':'q1_puntos','Q1_REB':'q1_rebotes','Q1_AST':'q1_asistencias'
    }
    models = {k: joblib.load(f'modelos_ai/ludogallina_{v}.pkl') for k, v in mercados.items()}

    for k, m in models.items():
        cols = [c for c in FEATURES.get(k,[]) if c in df_cruce.columns]
        df_cruce[f'pred_{k.lower()}'] = np.nan
        mask = df_cruce[cols].notnull().all(axis=1) if cols else pd.Series(False, index=df_cruce.index)
        if mask.any():
            df_cruce.loc[mask, f'pred_{k.lower()}'] = m.predict(df_cruce.loc[mask, cols])

    def get_proj(r):
        p = r['prop_type']
        g = lambda x: r.get(f'pred_{x}',0) or 0
        if p in mercados: return g(p.lower())
        if p == 'PRA': return g('pts') + g('reb') + g('ast')
        if p == 'PR':  return g('pts') + g('reb')
        if p == 'PA':  return g('pts') + g('ast')
        if p == 'RA':  return g('reb') + g('ast')
        return 0

    df_cruce['proj']    = df_cruce.apply(get_proj, axis=1).round(1)
    df_cruce['diff']    = df_cruce['proj'] - df_cruce['line']
    df_cruce['diff_abs']= df_cruce['diff'].abs()
    df_cruce['edge']    = (df_cruce['diff_abs'] / df_cruce['line'].replace(0, np.nan)) * 100
    df_cruce['price']   = df_cruce.apply(lambda r: r['over_price'] if r['diff'] > 0 else r['under_price'], axis=1)
    df_cruce['is_over'] = df_cruce['diff'] > 0
    df_cruce['is_q1']   = df_cruce['prop_type'].str.startswith('Q1_')
    log(f"✅ {len(df_cruce)} proyecciones generadas")

    # ── Filtro 1: Minutos mínimos por tipo ────────────────────────────
    print("\n🔍 PASO 6 — Filtros de calidad")
    n_antes = len(df_cruce)
    # ── Filtro 1: Minutos mínimos por tipo ────────────────────────────
    # FG: 15 min (bajamos de 18 para no perder jugadores de rol importantes)
    # Q1: 10 min (cualquier rotación válida puede tener stats de Q1)
    n_antes = len(df_cruce)
    mask_fg_min = (~df_cruce['is_q1']) & (df_cruce['min_L5'] >= 15.0)
    mask_q1_min = ( df_cruce['is_q1']) & (df_cruce['min_L5'] >= 10.0)
    df_cruce = df_cruce[mask_fg_min | mask_q1_min].copy()
    log(f"Filtro minutos: {n_antes} → {len(df_cruce)} props ({n_antes - len(df_cruce)} eliminados)")

    # ── Filtro 2: MAE como piso mínimo de credibilidad (50% del MAE) ──
    # Usamos el 50% del MAE como umbral — no el MAE completo.
    # Razón: el MAE completo (ej: 4.81 en PTS) es demasiado estricto y
    # elimina picks reales. El 50% asegura que el edge supera el ruido
    # del modelo pero sin ser tan agresivo.
    # Combinado con el hit rate, esto da el balance correcto.
    n_antes = len(df_cruce)
    df_cruce['mae'] = df_cruce['prop_type'].map(MAE_DICT).fillna(2.0)
    df_cruce = df_cruce[df_cruce['diff_abs'] >= (df_cruce['mae'] * 0.5)].copy()
    log(f"Filtro MAE×0.5: {n_antes} → {len(df_cruce)} props ({n_antes - len(df_cruce)} eliminados)")

    # ── Hit Rate con df separados FG/Q1 ──────────────────────────────
    def get_hr(r):
        prop, player, is_over = r['prop_type'], r['player_name'], r['is_over']
        hit_df = df_hit_q1 if r['is_q1'] else df_hit_fg
        logs   = hit_df[hit_df['player_name'] == player]
        l5     = logs.tail(5)
        n10, n5 = max(len(logs), 1), max(len(l5), 1)

        # Línea segura (línea alternativa más conservadora del mismo jugador/prop)
        alts  = df_odds_raw[(df_odds_raw['player_name'] == player) & (df_odds_raw['prop_type'] == prop)]
        safer = alts[alts['line'] < r['line']] if is_over else alts[alts['line'] > r['line']]
        if not safer.empty:
            best   = safer.loc[safer['line'].idxmin() if is_over else safer['line'].idxmax()]
            s_line = best['line']
            s_odds = best['over_price'] if is_over else best['under_price']
        else:
            s_line, s_odds = r['line'], r['price']

        if prop in logs.columns:
            h5  = int((l5[prop]   > s_line).sum() if is_over else (l5[prop]   < s_line).sum())
            h10 = int((logs[prop] > s_line).sum() if is_over else (logs[prop] < s_line).sum())
        else:
            h5, h10 = 0, 0

        return pd.Series({
            's_line': s_line, 's_odds': s_odds,
            's_prob': round((h10 / n10) * 100, 1),
            'hr': f"{h5}/{n5} | {h10}/{n10}",
            'hit_count_l5': h5, 'hit_count_l10': h10,
            'n_l5': n5, 'n_l10': n10,
            'calidad': clasificar_linea(h5, n5, h10, n10),
        })

    df_cruce[['s_line','s_odds','s_prob','hr','hit_count_l5','hit_count_l10','n_l5','n_l10','calidad']] = \
        df_cruce.apply(get_hr, axis=1)

    # ── Filtro 3: descartar BASURA ────────────────────────────────────
    n_antes = len(df_cruce)
    df_cruce = df_cruce[df_cruce['calidad'] != 'BASURA'].copy()
    log(f"Filtro calidad: {n_antes} → {len(df_cruce)} props ({n_antes - len(df_cruce)} eliminados)")

    if df_cruce.empty:
        print("\n⚠️  Sin picks de calidad hoy. Mejor no apostar.")
        return

    joyas      = (df_cruce['calidad'] == 'JOYA').sum()
    excelentes = (df_cruce['calidad'] == 'EXCELENTE').sum()
    buenas     = (df_cruce['calidad'] == 'BUENA').sum()
    log(f"Distribución: 💎 {joyas} JOYAS | ⭐ {excelentes} EXCELENTES | 🌟 {buenas} BUENAS")

    # ── Separar FG y Q1 antes de ordenar/rankear ─────────────────────
    calidad_ord = {'JOYA': 3, 'EXCELENTE': 2, 'BUENA': 1}
    df_cruce['calidad_ord'] = df_cruce['calidad'].map(calidad_ord).fillna(0)

    df_fg = df_cruce[~df_cruce['is_q1']].copy()
    df_q1 = df_cruce[ df_cruce['is_q1']].copy()

    # Orden: calidad desc → edge desc
    df_fg = df_fg.sort_values(['matchup','is_over','calidad_ord','edge'],
                               ascending=[True,True,False,False]) \
                  .drop_duplicates(subset=['matchup','player_name','is_over'])

    df_q1 = df_q1.sort_values(['matchup','is_over','calidad_ord','edge'],
                               ascending=[True,True,False,False]) \
                  .drop_duplicates(subset=['matchup','player_name','is_over'])

    # Rank dentro de cada partido/guion
    df_fg['rank_partido'] = df_fg.groupby(['matchup','is_over']).cumcount()
    df_q1['rank_partido'] = df_q1.groupby(['matchup','is_over']).cumcount()

    # VIP solo si JOYA o EXCELENTE Y está entre los top 4 del partido
    df_fg['is_vip'] = (df_fg['rank_partido'] < 4) & (df_fg['calidad'].isin(['JOYA','EXCELENTE']))
    df_q1['is_vip'] = False   # Q1 siempre con análisis de datos (nunca IA)

    # ── Gemini: solo VIPs, prompt enriquecido por partido ─────────────
    print("\n🤖 PASO 7 — Gemini (solo JOYA/EXCELENTE, contexto completo)")
    df_vips      = df_fg[df_fg['is_vip']].copy()
    datos_gemini = {}

    for _, j in df_vips.iterrows():
        prop  = j['prop_type']
        guion = "OVER" if j['is_over'] else "UNDER"
        clave = f"{j['player_name']}_{prop}"

        # Contexto específico por tipo de prop
        if prop in ['REB','PR','RA','PRA']:
            vol = (f"RebPot L5:{round(j.get('rebound_chances_L5',0),1)} "
                   f"Off:{round(j.get('rebound_off_L5',0),1)} Def:{round(j.get('rebound_def_L5',0),1)} "
                   f"L10:{round(j.get('rebound_chances_L10',0),1)}")
            dvp = f"Rival permite {round(j.get('dvp_reb',0),1)} REB/partido"
        elif prop in ['AST','PA']:
            vol = (f"Pases L5:{round(j.get('passes_made_L5',0),1)} "
                   f"PotAST L5:{round(j.get('potential_ast_L5',0),1)} "
                   f"L10:{round(j.get('potential_ast_L10',0),1)}")
            dvp = f"Rival permite {round(j.get('dvp_ast',0),1)} AST/partido"
        elif prop in ['3PT','FG3A']:
            vol = (f"3PA L5:{round(j.get('fg3a_L5',0),1)} "
                   f"L10:{round(j.get('fg3a_L10',0),1)} "
                   f"Season:{round(j.get('fg3m_season',0),1)}")
            dvp = f"Rival permite {round(j.get('dvp_3pt',0),1)} 3PT/partido"
        else:
            vol = (f"FGA L5:{round(j.get('fga_L5',0),1)} "
                   f"Uso L5:{round(j.get('usage_pct_L5',0),1)}% "
                   f"L10:{round(j.get('fga_L10',0),1)}")
            dvp = f"Rival permite {round(j.get('dvp_pts',0),1)} PTS/partido"

        momentum = round(j.get(f"{prop.lower().replace('3pt','fg3m')}_momentum", 0), 1)
        b2b  = " | ⚠️B2B" if j.get('is_b2b',0) == 1 else ""
        home = "🏠 Local" if j.get('is_home',0) == 1 else "✈️ Visitante"

        datos_gemini[clave] = (
            f"PARTIDO: {j['matchup']} | PICK: {guion} {j['line']} {prop} | "
            f"Calidad:{j['calidad']} | Proy:{j['proj']} | Edge:+{round(j['edge'],1)}% | "
            f"HR:{j['hr']} | {j['min_L5']:.0f}min | {home}{b2b} | "
            f"Momentum:{momentum:+.1f} | {vol} | {dvp}"
        )

    analisis_dict = {}
    if datos_gemini:
        items = list(datos_gemini.items())
        lotes = [dict(items[i:i+15]) for i in range(0, len(items), 15)]
        log(f"{len(items)} VIPs → {len(lotes)} lotes de Gemini")

        for idx, lote in enumerate(lotes):
            n = len(lote)
            log(f"⏳ Lote {idx+1}/{len(lotes)} ({n} picks)...")
            prompt = f"""Eres un analista Quant NBA de élite. Devuelve UN JSON PLANO con exactamente {n} claves.
REGLA 1: Clave EXACTA como la recibís.
REGLA 2: Valor debe ser STRING simple — nunca un objeto ni lista.
REGLA 3: 1 oración: mencioná la tendencia L5 vs L10 del jugador, el matchup DvP y por qué la línea es beatable con números concretos.
CERO markdown. CERO saltos de línea. CERO comillas internas.
Datos: {json.dumps(lote)}"""
            try:
                res = client.models.generate_content(
                    model="gemini-2.5-flash", contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.1, response_mime_type="application/json"
                    )
                )
                if res and res.text:
                    parsed = json.loads(res.text)
                    if isinstance(parsed, dict): analisis_dict.update(parsed)
                time.sleep(2)   # evitar rate limit entre lotes
            except Exception as e:
                log(f"⚠️ Error lote {idx+1}: {e}")

    log(f"✅ IA analizó {len(analisis_dict)}/{len(datos_gemini)} VIPs | resto → análisis automático")

    # ── Armado de Tickets ──────────────────────────────────────────────
    print("\n🎫 PASO 8 — Armando tickets")
    TICKETS_JSON = []
    todos_partidos = set(df_fg['matchup'].unique()) | set(df_q1['matchup'].unique())

    for partido in sorted(todos_partidos):
        for guion in ['OVER', 'UNDER']:
            is_ov   = guion == 'OVER'
            tickets = []

            # ── FULL GAME ──────────────────────────────────────────────
            fg = df_fg[(df_fg['matchup'] == partido) & (df_fg['is_over'] == is_ov)].sort_values('rank_partido')

            if not fg.empty:
                vip    = fg[fg['is_vip']].copy()
                no_vip = fg[~fg['is_vip']].copy()

                # PARLAY PRINCIPAL X2 (picks 1 y 2 VIP)
                if len(vip) >= 2:
                    p1  = vip.iloc[0:2]
                    lbl = titulo_par(p1['calidad'].tolist())
                    tickets.append(armar_ticket(f"{lbl} PARLAY PRINCIPAL X2", p1, guion, analisis_dict, df_inj))
                elif len(vip) == 1:
                    lbl = emoji_calidad(vip.iloc[0]['calidad'])
                    tickets.append(armar_ticket(f"{lbl} LÍNEA ÚNICA VIP", vip.iloc[0:1], guion, analisis_dict, df_inj))

                # PARLAY SECUNDARIO X2 (picks 3 y 4 VIP)
                if len(vip) >= 4:
                    p2  = vip.iloc[2:4]
                    lbl = titulo_par(p2['calidad'].tolist())
                    tickets.append(armar_ticket(f"{lbl} PARLAY SECUNDARIO X2", p2, guion, analisis_dict, df_inj))
                elif len(vip) == 3:
                    lbl = emoji_calidad(vip.iloc[2]['calidad'])
                    tickets.append(armar_ticket(f"{lbl} LÍNEA SECUNDARIA", vip.iloc[2:3], guion, analisis_dict, df_inj))

                # RADAR — picks BUENA (no VIP) — máximo 2
                if not no_vip.empty:
                    radar = no_vip.head(2)
                    tickets.append(armar_ticket(f"📊 RADAR X{len(radar)}", radar, guion, analisis_dict, df_inj))

                # COMBINADA X5 y MEGA X10
                if len(fg) >= 5:
                    tickets.append(armar_ticket("🧨 COMBINADA X5", fg.head(5), guion, analisis_dict, df_inj))
                if len(fg) >= 10:
                    tickets.append(armar_ticket("🤯 MEGA X10", fg.head(10), guion, analisis_dict, df_inj))

            # ── PRIMER CUARTO — pipeline 100% independiente ────────────
            q1 = df_q1[(df_q1['matchup'] == partido) & (df_q1['is_over'] == is_ov)].sort_values(['calidad_ord','edge'], ascending=False)

            if not q1.empty:
                # PARLAY 1Q PRINCIPAL X2
                if len(q1) >= 2:
                    top_q1 = q1.iloc[0:2]
                    lbl    = titulo_par(top_q1['calidad'].tolist())
                    tickets.append(armar_ticket(f"⏱️{lbl} 1Q PARLAY PRINCIPAL X2", top_q1, guion, analisis_dict, df_inj))
                elif len(q1) == 1:
                    lbl = emoji_calidad(q1.iloc[0]['calidad'])
                    tickets.append(armar_ticket(f"⏱️{lbl} 1Q LÍNEA ÚNICA", q1.iloc[0:1], guion, analisis_dict, df_inj))

                # PARLAY 1Q SECUNDARIO X2 (líneas 3 y 4)
                if len(q1) >= 4:
                    sec_q1 = q1.iloc[2:4]
                    lbl    = titulo_par(sec_q1['calidad'].tolist())
                    tickets.append(armar_ticket(f"⏱️{lbl} 1Q SECUNDARIO X2", sec_q1, guion, analisis_dict, df_inj))
                elif len(q1) == 3:
                    lbl = emoji_calidad(q1.iloc[2]['calidad'])
                    tickets.append(armar_ticket(f"⏱️{lbl} 1Q LÍNEA EXTRA", q1.iloc[2:3], guion, analisis_dict, df_inj))

                # COMBINADA 1Q X3/X4/X5
                if len(q1) >= 3:
                    n_q1 = min(len(q1), 5)
                    tickets.append(armar_ticket(f"⏱️ 1Q COMBINADA X{n_q1}", q1.head(n_q1), guion, analisis_dict, df_inj))

            if tickets:
                icono = '🔥' if is_ov else '🧊'
                TICKETS_JSON.append({
                    "matchup": f"{partido} ({icono})",
                    "guion":   guion,
                    "tickets": tickets,
                })

    # ── Combinadas Globales — solo élite ──────────────────────────────
    print("\n🌎 PASO 9 — Combinadas Globales (solo JOYA/EXCELENTE)")
    fg_ov = df_fg[ df_fg['is_over'] & df_fg['calidad'].isin(['JOYA','EXCELENTE'])].sort_values(['calidad_ord','edge'], ascending=False)
    fg_un = df_fg[~df_fg['is_over'] & df_fg['calidad'].isin(['JOYA','EXCELENTE'])].sort_values(['calidad_ord','edge'], ascending=False)
    fg_ov_all = df_fg[ df_fg['is_over']].sort_values(['calidad_ord','edge'], ascending=False)
    fg_un_all = df_fg[~df_fg['is_over']].sort_values(['calidad_ord','edge'], ascending=False)
    q1_ov = df_q1[ df_q1['is_over'] & df_q1['calidad'].isin(['JOYA','EXCELENTE'])].sort_values(['calidad_ord','edge'], ascending=False)
    q1_un = df_q1[~df_q1['is_over'] & df_q1['calidad'].isin(['JOYA','EXCELENTE'])].sort_values(['calidad_ord','edge'], ascending=False)

    globales = []
    if len(fg_ov)     >= 5:  globales.append(armar_ticket("💎 ÉLITE X5 OVERS",        fg_ov.head(5),     "OVER",  analisis_dict, df_inj))
    if len(fg_ov)     >= 10: globales.append(armar_ticket("🤯 MEGA X10 OVERS",        fg_ov.head(10),    "OVER",  analisis_dict, df_inj))
    if len(fg_ov_all) >= 20: globales.append(armar_ticket("🎰 LOTERÍA X20 OVERS",     fg_ov_all.head(20),"OVER",  analisis_dict, df_inj))
    if len(fg_un)     >= 5:  globales.append(armar_ticket("💎 ÉLITE X5 UNDERS",       fg_un.head(5),     "UNDER", analisis_dict, df_inj))
    if len(fg_un)     >= 10: globales.append(armar_ticket("🥶 MEGA X10 UNDERS",       fg_un.head(10),    "UNDER", analisis_dict, df_inj))
    if len(fg_un_all) >= 20: globales.append(armar_ticket("🎰 LOTERÍA X20 UNDERS",    fg_un_all.head(20),"UNDER", analisis_dict, df_inj))
    if len(q1_ov)     >= 3:  globales.append(armar_ticket(f"⏱️💎 1Q GLOBAL X{min(len(q1_ov),5)} OVERS",  q1_ov.head(5), "OVER",  analisis_dict, df_inj))
    if len(q1_un)     >= 3:  globales.append(armar_ticket(f"⏱️💎 1Q GLOBAL X{min(len(q1_un),5)} UNDERS", q1_un.head(5), "UNDER", analisis_dict, df_inj))

    if globales:
        TICKETS_JSON.append({"matchup": "🌎 COMBINADAS GLOBALES", "guion": "MIX", "tickets": globales})

    # ── Guardar ────────────────────────────────────────────────────────
    total = sum(len(t['tickets']) for t in TICKETS_JSON)
    print(f"\n💾 PASO 10 — Guardando {total} tickets en {len(TICKETS_JSON)} bloques...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE ludo_picks;"))
        conn.execute(text("INSERT INTO ludo_picks (json_data) VALUES (:data)"),
                     {"data": json.dumps(TICKETS_JSON, ensure_ascii=False)})

    print(f"\n{'='*60}")
    print(f"✅ PIPELINE COMPLETADO — {total} tickets generados")
    print(f"   💎 {joyas} JOYAS | ⭐ {excelentes} EXCELENTES | 🌟 {buenas} BUENAS")
    print(f"{'='*60}")

# -------------------------------------------------------------------
# 6. ENTRY POINT
# -------------------------------------------------------------------
if __name__ == "__main__":
    start = time.time()
    c, l, i, o = obtener_datos()
    ludo_engine(c, l, i, o)
    print(f"\n⏱️  Tiempo total: {round(time.time()-start, 1)}s")