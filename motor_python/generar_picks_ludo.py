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
# 1. CONFIGURACIÓN E INICIALIZACIÓN
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

# -------------------------------------------------------------------
# 2. HELPERS GLOBALES
# -------------------------------------------------------------------
def kelly_fraccional(edge_pct, odds, fraccion=0.25):
    if odds <= 1 or edge_pct <= 0: return 0.0
    ev = edge_pct / 100.0
    p_win = min((ev + 1.0) / odds, 0.99) 
    p_lose = 1 - p_win
    b = odds - 1 
    kelly = max(0.0, (b * p_win - p_lose) / b)
    return round(min(kelly * fraccion, 0.20), 4)

def obtener_bajas_equipo(team_abbr, df_inj):
    if df_inj.empty or team_abbr == '': return ""
    bajas = df_inj[df_inj['team'] == team_abbr]['injured_player'].tolist()
    return f"🚑 OUT: {', '.join(bajas[:2])}{'...' if len(bajas) > 2 else ''}" if bajas else ""

def construir_play(row, guion, analisis_dict, df_inj, usar_safe_line=False, use_ia=False):
    clave = f"{row['player_name']}_{row['prop_type']}"
    
    # Texto matemático por defecto
    fallback = f"🤖 Algoritmo Quant: Proyección de {row['proj']} frente a línea de {row['line']} ({row['hr']}). Ventaja matemática detectada: {round(row['edge'],1)}%."
    
    # Inyecta texto de Gemini SOLO si use_ia es True (para los X2)
    analisis_ia = analisis_dict.get(clave, fallback) if use_ia else fallback
    
    line_val  = float(row['s_line'])  if usar_safe_line else float(row['line'])
    odds_val  = float(row['s_odds'])  if usar_safe_line else float(row['price'])
    edge_final = (abs(row['proj'] - line_val) / max(line_val, 0.5)) * 100 if usar_safe_line else row['edge']
    stake_val = kelly_fraccional(edge_final, odds_val)
    if stake_val == 0.0: stake_val = 0.005 

    return {
        "player_id":  int(row.get('player_id', 0)) if pd.notnull(row.get('player_id')) else 0,
        "player":     row['player_name'],
        "team":       row['team_abbreviation'],
        "type":       guion,
        "prop":       row['prop_type'],
        "line":       line_val,
        "odds":       odds_val,
        "proj":       float(row['proj']),
        "edge":       round(float(row['edge']), 1),
        "analysis":   analisis_ia,
        "safe_line":  float(row['s_line']),
        "safe_odds":  float(row['s_odds']),
        "safe_prob":  float(row['s_prob']),
        "hit_rate":   row['hr'],
        "injuries":   obtener_bajas_equipo(row['team_abbreviation'], df_inj),
        "stake":      stake_val,
    }

def armar_bomba(nombre, df_subset, tipo_guion, analisis_dict, df_inj):
    # Bombas y loterías van siempre con use_ia=False para que usen texto algorítmico Quant
    plays = [construir_play(row, tipo_guion, analisis_dict, df_inj, usar_safe_line=False, use_ia=False) for _, row in df_subset.iterrows()]
    cuota_total = math.prod([max(p['odds'], 1.01) for p in plays])
    return {"name": nombre, "total_odds": round(cuota_total, 2), "plays": plays}

# -------------------------------------------------------------------
# 3. EXTRACCIÓN DE DATOS
# -------------------------------------------------------------------
def obtener_datos():
    hoy_str = datetime.now().strftime('%Y-%m-%d')
    print(f"📅 Fecha de hoy: {hoy_str}")

    print("📡 1. Extrayendo líneas de hoy...")
    query_stats = "'PTS', 'REB', 'AST', '3PT', 'PRA', 'PR', 'PA', 'RA', 'FGM', 'FGA', 'FG3A', 'FTM', 'FTA'"
    df_odds = pd.read_sql(text(f"SELECT player_name, prop_type, matchup, line, over_price, under_price FROM player_odds WHERE prop_type IN ({query_stats})"), engine)
    if df_odds.empty: return None, None, None, None

    def get_abbr(matchup):
        try:
            parts = matchup.split(' @ ') if ' @ ' in matchup else matchup.split(' vs ')
            return TEAM_MAP.get(parts[0], ''), TEAM_MAP.get(parts[1], '')
        except: return '', ''

    df_odds[['away_team', 'home_team']] = df_odds.apply(lambda r: get_abbr(r['matchup']), axis=1, result_type='expand')

    print("📊 2. Calculando Contexto Histórico Total...")
    df_logs = pd.read_sql(text("""
        SELECT pgl.player_id, pgl.player_name, pgl.team_abbreviation, p.position, pgl.game_date,
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.potential_ast,
               pgl.rebound_off, pgl.rebound_def, pgl.passes_made,
               pgl.pts, pgl.reb, pgl.ast, pgl.fgm, pgl.fga, pgl.fg3a, pgl.fg3m, pgl.ftm, pgl.fta
        FROM player_game_logs pgl
        JOIN players p ON pgl.player_id = p.id
        WHERE pgl.game_date >= '2025-10-01' AND pgl.min > 0
        ORDER BY pgl.player_id ASC, pgl.game_date ASC
    """), engine)

    if df_logs.empty: return None, None, None, None

    df_logs['game_date'] = pd.to_datetime(df_logs['game_date'])
    cols_tracking = ['touches', 'rebound_chances', 'passes_made', 'potential_ast', 'rebound_off', 'rebound_def']
    df_logs[cols_tracking] = df_logs[cols_tracking].fillna(0)

    cols_to_roll = ['min', 'usage_pct', 'touches', 'rebound_chances', 'passes_made', 'potential_ast', 'rebound_off', 'rebound_def',
                    'pts', 'reb', 'ast', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta']
    for col in cols_to_roll:
        df_logs[f'{col}_L5'] = df_logs.groupby('player_id')[col].transform(lambda x: x.rolling(5, min_periods=1).mean())
        df_logs[f'{col}_L10'] = df_logs.groupby('player_id')[col].transform(lambda x: x.rolling(10, min_periods=1).mean())
        df_logs[f'{col}_season'] = df_logs.groupby('player_id')[col].transform(lambda x: x.expanding(1).mean())

    df_logs_10 = df_logs.groupby('player_id').tail(10).copy()
    df_logs_10.rename(columns={'pts':'PTS','reb':'REB','ast':'AST','fg3m':'3PT','fgm':'FGM','fga':'FGA','fg3a':'FG3A','ftm':'FTM','fta':'FTA'}, inplace=True)
    df_logs_10['PRA'] = df_logs_10['PTS'] + df_logs_10['REB'] + df_logs_10['AST']
    df_logs_10['PR']  = df_logs_10['PTS'] + df_logs_10['REB']
    df_logs_10['PA']  = df_logs_10['PTS'] + df_logs_10['AST']
    df_logs_10['RA']  = df_logs_10['REB'] + df_logs_10['AST']

    df_stats = df_logs.groupby('player_id').tail(1).copy()
    df_stats['rest_days'] = (pd.to_datetime(hoy_str) - df_stats['game_date']).dt.days.clip(upper=7)
    df_stats['is_b2b']    = (df_stats['rest_days'] <= 1).astype(int)
    df_stats['pos_enc']   = df_stats['position'].map(POSICION_ENCODING).fillna(3)
    df_stats['ppm_L5']    = np.where(df_stats['min_L5'] > 0, df_stats['pts_L5'] / df_stats['min_L5'], 0)
    df_stats['fga_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['fga_L5'] / df_stats['min_L5'], 0)
    df_stats['ast_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['ast_L5'] / df_stats['min_L5'], 0)
    df_stats['reb_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['reb_L5'] / df_stats['min_L5'], 0)

    print("🛡️  3. DvP y Cruce de datos...")
    df_dvp = pd.read_sql("SELECT team, position, pts_allowed as dvp_pts, reb_allowed as dvp_reb, ast_allowed as dvp_ast, threes_allow as dvp_3pt FROM team_dvp", engine)
    df_inj = pd.read_sql("SELECT team, player_name as injured_player, position as inj_position FROM player_injuries WHERE status ILIKE '%%out%%'", engine)

    df_cruce = pd.merge(df_odds, df_stats, on='player_name', how='inner')
    df_cruce['is_home'] = (df_cruce['team_abbreviation'] == df_cruce['home_team']).astype(int)
    df_cruce['opp'] = df_cruce.apply(lambda r: r['home_team'] if r['is_home'] == 0 else r['away_team'], axis=1)
    df_cruce = pd.merge(df_cruce, df_dvp, left_on=['opp', 'position'], right_on=['team', 'position'], how='left').fillna(0)

    return df_cruce, df_logs_10, df_inj, df_odds

# -------------------------------------------------------------------
# 4. MOTOR CENTRAL (LUDO ENGINE)
# -------------------------------------------------------------------
def ludo_engine(df_cruce, df_logs_10, df_inj, df_odds_raw):
    if df_cruce is None or df_cruce.empty: return
    df_cruce = df_cruce.copy()

    for team in df_inj['team'].unique():
        bajas_team = df_inj[df_inj['team'] == team]
        mask_sanos = df_cruce['team_abbreviation'] == team
        if df_cruce[mask_sanos].empty: continue
        for idx_jug, jugador in df_cruce[mask_sanos].iterrows():
            pos_jug = str(jugador.get('position', 'G')).split('-')[0]
            mult_ac = 1.0
            for _, baja in bajas_team.iterrows():
                pos_baja = str(baja.get('inj_position', 'G')).split('-')[0]
                mult_ac *= POSICION_BUMP.get(pos_baja, POSICION_BUMP['G']).get(pos_jug, 1.05)
            
            mult_final = min(mult_ac, 1.25)
            for col in ['usage_pct_L5', 'usage_pct_L10', 'fga_L5', 'fga_L10', 'fg3a_L5', 'fta_L5', 'touches_L5', 'potential_ast_L5']:
                if col in df_cruce.columns:
                    val = df_cruce.at[idx_jug, col] * mult_final
                    if 'pct' in col: val = min(val, 100.0)
                    df_cruce.at[idx_jug, col] = val

    print("🧠 4. Activando Cerebros XGBoost...")
    df_cruce['piso_minimo'] = df_cruce['prop_type'].map({'PTS': 4.5, 'REB': 2.5, 'AST': 1.5, 'PRA': 9.5, 'PR': 7.5, 'PA': 6.5, 'RA': 4.5, '3PT': 0.5, 'FGM': 1.5, 'FGA': 3.5, 'FTM': 1.5, 'FTA': 1.5}).fillna(0.5)
    df_cruce = df_cruce[df_cruce['line'] >= df_cruce['piso_minimo']]

    mercados = {'PTS': 'puntos', 'REB': 'rebotes', 'AST': 'asistencias', '3PT': 'triples', 'FGM': 'tiros_anotados', 'FGA': 'tiros_intentados', 'FG3A': 'triples_intentados', 'FTM': 'libres_anotados', 'FTA': 'libres_intentados'}
    models = {k: joblib.load(f'modelos_ai/ludogallina_{v}.pkl') for k, v in mercados.items()}

    FEATURES = {
        'PTS':  ['min_L5', 'min_L10', 'usage_pct_L5', 'usage_pct_L10', 'fga_L5', 'fga_L10', 'pts_L5', 'pts_L10', 'pts_season', 'touches_L5', 'ppm_L5', 'dvp_pts', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'REB':  ['min_L5', 'min_L10', 'rebound_chances_L5', 'rebound_chances_L10', 'rebound_off_L5', 'rebound_def_L5', 'reb_L5', 'reb_L10', 'reb_season', 'touches_L5', 'reb_pm_L5', 'dvp_reb', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'AST':  ['min_L5', 'min_L10', 'passes_made_L5', 'passes_made_L10', 'potential_ast_L5', 'potential_ast_L10', 'ast_L5', 'ast_L10', 'ast_season', 'touches_L5', 'usage_pct_L5', 'ast_pm_L5', 'dvp_ast', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        '3PT':  ['min_L5', 'min_L10', 'usage_pct_L5', 'fg3a_L5', 'fg3a_L10', 'fg3m_L5', 'fg3m_L10', 'fg3m_season', 'dvp_3pt', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'FGM':  ['min_L5', 'usage_pct_L5', 'fga_L5', 'fgm_L5', 'fgm_L10', 'fgm_season', 'dvp_pts', 'is_b2b', 'is_home', 'pos_enc'],
        'FGA':  ['min_L5', 'usage_pct_L5', 'fga_L5', 'fga_L10', 'touches_L5', 'rest_days', 'fga_pm_L5', 'is_b2b', 'is_home', 'pos_enc'],
        'FG3A': ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'fg3a_L10', 'fg3a_season', 'dvp_3pt', 'rest_days', 'is_b2b', 'is_home', 'pos_enc'],
        'FTM':  ['min_L5', 'usage_pct_L5', 'fta_L5', 'ftm_L5', 'ftm_L10', 'ftm_season', 'is_b2b', 'is_home', 'pos_enc'],
        'FTA':  ['min_L5', 'usage_pct_L5', 'fta_L5', 'fta_L10', 'fta_season', 'rest_days', 'is_b2b', 'is_home', 'pos_enc']
    }

    for k, m in models.items():
        cols = FEATURES[k]
        cols_disponibles = [c for c in cols if c in df_cruce.columns]
        df_cruce.loc[:, f'pred_{k.lower()}'] = np.nan
        mask = df_cruce[cols_disponibles].notnull().all(axis=1)
        if cols_disponibles and not df_cruce[mask].empty:
            df_cruce.loc[mask, f'pred_{k.lower()}'] = m.predict(df_cruce.loc[mask, cols_disponibles])

    def get_proj(r):
        p = r['prop_type']
        if p in mercados: return r.get(f'pred_{p.lower()}', 0) or 0
        if p == 'PRA': return (r.get('pred_pts',0) or 0) + (r.get('pred_reb',0) or 0) + (r.get('pred_ast',0) or 0)
        if p == 'PR':  return (r.get('pred_pts',0) or 0) + (r.get('pred_reb',0) or 0)
        if p == 'PA':  return (r.get('pred_pts',0) or 0) + (r.get('pred_ast',0) or 0)
        if p == 'RA':  return (r.get('pred_reb',0) or 0) + (r.get('pred_ast',0) or 0)
        return 0

    df_cruce['proj'] = df_cruce.apply(get_proj, axis=1).round(1)
    df_cruce['diff'] = df_cruce['proj'] - df_cruce['line']
    df_cruce['edge'] = (df_cruce['diff'].abs() / df_cruce['line'].replace(0, np.nan)) * 100
    df_cruce['price'] = df_cruce.apply(lambda r: r['over_price'] if r['diff'] > 0 else r['under_price'], axis=1)

    def get_hr(r):
        prop, player, is_over = r['prop_type'], r['player_name'], r['diff'] > 0
        alts = df_odds_raw[(df_odds_raw['player_name'] == player) & (df_odds_raw['prop_type'] == prop)]
        
        safer = alts[alts['line'] < r['line']] if is_over else alts[alts['line'] > r['line']]
        best = safer.loc[safer['line'].idxmin() if is_over else safer['line'].idxmax()] if not safer.empty else r
        s_line, s_odds = best['line'], best['over_price'] if is_over else best['under_price']

        logs = df_logs_10[df_logs_10['player_name'] == player]
        logs_l5 = logs.tail(5)
        n_l10, n_l5 = max(len(logs), 1), max(len(logs_l5), 1)

        hit_l5 = int((logs_l5[prop] > s_line).sum() if is_over else (logs_l5[prop] < s_line).sum()) if prop in logs.columns else 0
        hit_l10 = int((logs[prop] > s_line).sum() if is_over else (logs[prop] < s_line).sum()) if prop in logs.columns else 0

        racha_l5 = logs_l5[prop].tolist() if prop in logs_l5.columns else []

        return pd.Series({
            's_line': s_line, 's_odds': s_odds, 's_prob': round((hit_l10 / n_l10) * 100, 1) if n_l10 > 0 else 0,
            'hr': f"{hit_l5}/{n_l5} | {hit_l10}/{n_l10}", 'h5': hit_l5, 'h10': hit_l10, 'l5_trend': racha_l5
        })

    df_cruce[['s_line','s_odds','s_prob','hr','hit_count_l5','hit_count_l10','l5_trend']] = df_cruce.apply(get_hr, axis=1)
    df_cruce['is_over'] = df_cruce['diff'] > 0

    print("⚖️  5. Escudo Anti-Varianza...")
    cond = [
        (df_cruce['prop_type'] == 'PTS')  & df_cruce['is_over']  & (df_cruce['edge'] >= 8)  & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7),
        (df_cruce['prop_type'] == 'PTS')  & ~df_cruce['is_over'] & (df_cruce['edge'] >= 15) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8),
        (df_cruce['prop_type'] == 'REB')  & df_cruce['is_over']  & (df_cruce['edge'] >= 8)  & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7),
        (df_cruce['prop_type'] == 'REB')  & ~df_cruce['is_over'] & (df_cruce['edge'] >= 12) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8),
        (df_cruce['prop_type'] == 'AST')  & df_cruce['is_over']  & (df_cruce['edge'] >= 6)  & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7),
        (df_cruce['prop_type'] == 'AST')  & ~df_cruce['is_over'] & (df_cruce['edge'] >= 9)  & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8),
        (df_cruce['prop_type'].isin(['FGA','FG3A','FTA','FGM','FTM'])) & df_cruce['is_over']  & (df_cruce['edge'] >= 5) & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 6),
        (df_cruce['prop_type'].isin(['FGA','FG3A','FTA','FGM','FTM'])) & ~df_cruce['is_over'] & (df_cruce['edge'] >= 8) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 7),
        (df_cruce['prop_type'].isin(['PRA','PR','PA','RA','3PT'])) & df_cruce['is_over']  & (df_cruce['edge'] >= 8)  & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7),
        (df_cruce['prop_type'].isin(['PRA','PR','PA','RA','3PT'])) & ~df_cruce['is_over'] & (df_cruce['edge'] >= 12) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8),
    ]
    df_cruce = df_cruce[np.logical_or.reduce(cond)].sort_values('edge', ascending=False).drop_duplicates(subset=['player_name', 'prop_type', 'is_over'])

    print("🤖 6. Consultando a Gemini (SOLO Picks de X2 Seguros para ahorrar API)...")
    gemini_keys = set()
    for partido in df_cruce['matchup'].unique():
        for guion in ['OVER', 'UNDER']:
            df_match = df_cruce[(df_cruce['matchup'] == partido) & (df_cruce['is_over'] == (guion == 'OVER'))]
            # Solo pasamos a Gemini los 4 mejores picks por s_prob (los de los 2 tickets X2)
            df_seg = df_match.sort_values('s_prob', ascending=False).head(4)
            for _, row in df_seg.iterrows():
                gemini_keys.add(f"{row['player_name']}_{row['prop_type']}")

    datos_para_gemini = {}
    for _, j in df_cruce[df_cruce.apply(lambda r: f"{r['player_name']}_{r['prop_type']}" in gemini_keys, axis=1)].iterrows():
        prop = j['prop_type']
        if prop in ['REB', 'RA', 'PR', 'PRA']: vol_str = f"RebPot_L10: {round(j.get('rebound_chances_L10',0),1)}"
        elif prop in ['AST', 'PA']: vol_str = f"PotAST_L10: {round(j.get('potential_ast_L10',0),1)}"
        elif prop == '3PT': vol_str = f"3PA_L10: {round(j.get('fg3a_L10',0),1)}"
        else: vol_str = f"FGA_L10: {round(j.get('fga_L10',0),1)}"
        
        datos_para_gemini[f"{j['player_name']}_{prop}"] = (
            f"Línea a evaluar: {'OVER' if j['is_over'] else 'UNDER'} {j['line']} {prop} | "
            f"Resultados últimos 5 partidos: {j.get('l5_trend', [])} | "
            f"B2B: {'Sí' if j['is_b2b'] else 'No'} | {vol_str} | DvP Rival: {round(j.get('dvp_pts',0),1)}"
        )

    analisis_dict = {}
    items_totales = list(datos_para_gemini.items())
    lotes = [dict(items_totales[i:i+15]) for i in range(0, len(items_totales), 15)]

    for idx, lote in enumerate(lotes):
        prompt = f"""Analista Quant NBA. Devuelve UN ÚNICO OBJETO JSON PLANO (no un array) con {len(lote)} claves. 
        MANTÉN la clave EXACTA que te envío. 
        Justifica tu postura técnica de forma concisa y directa (1 o 2 oraciones máximo). Evalúa la racha reciente del jugador aportada, el volumen general y cruza esa información con la debilidad defensiva del rival (DvP). Sin preámbulos.
        Datos: {json.dumps(lote)}"""
        try:
            res = client.models.generate_content(
                model="gemini-2.5-flash", contents=prompt,
                config=types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json")
            )
            if res and res.text:
                parsed_json = json.loads(res.text)
                
                # Defensa estructural contra arrays/listas no deseadas
                if isinstance(parsed_json, dict):
                    analisis_dict.update(parsed_json)
                elif isinstance(parsed_json, list):
                    for item in parsed_json:
                        if isinstance(item, dict):
                            analisis_dict.update(item)
                            
        except Exception as e:
            print(f"   ⚠️ Error AI Lote {idx+1}: {e}")

    print("🎫 7. Generando Tickets (Múltiples X2 Seguros)...")
    TICKETS_JSON = []
    for partido in df_cruce['matchup'].unique():
        for guion in ['OVER', 'UNDER']:
            df_match = df_cruce[(df_cruce['matchup'] == partido) & (df_cruce['is_over'] == (guion == 'OVER'))]
            if len(df_match) < 2: continue
            tickets = []
            
            # Formar hasta 2 tickets X2 Seguros
            df_seg = df_match.sort_values('s_prob', ascending=False).head(4)
            for i in range(0, len(df_seg), 2):
                pair = df_seg.iloc[i:i+2]
                if len(pair) == 2:
                    nombre_ticket = "🛡️ X2 SEGURO PRINCIPAL" if i == 0 else "🛡️ X2 SEGURO ALTERNATIVO"
                    tickets.append({
                        "name": nombre_ticket, 
                        "total_odds": round(pair['s_odds'].prod(), 2), 
                        # ACÁ USAMOS IA: use_ia=True
                        "plays": [construir_play(r, guion, analisis_dict, df_inj, usar_safe_line=True, use_ia=True) for _, r in pair.iterrows()]
                    })
            
            # Las bombas NO USAN IA
            if len(df_match) >= 3: tickets.append(armar_bomba("🧨 SGP X3", df_match.head(3), guion, analisis_dict, df_inj))
            if len(df_match) >= 5: tickets.append(armar_bomba("💣 SGP X5", df_match.head(5), guion, analisis_dict, df_inj))
            if tickets: TICKETS_JSON.append({"matchup": f"{partido} ({'🔥' if guion == 'OVER' else '🧊'})", "guion": guion, "tickets": tickets})

    # Loterías Globales NO USAN IA
    tickets_glob = []
    df_o = df_cruce[df_cruce['is_over']].head(20)
    df_u = df_cruce[~df_cruce['is_over']].head(20)
    if len(df_o) >= 10: tickets_glob.append(armar_bomba("🤯 MEGA X10 OVERS", df_o.head(10), "OVER", analisis_dict, df_inj))
    if len(df_o) >= 20: tickets_glob.append(armar_bomba("🎰 LOTERÍA X20 OVERS", df_o, "OVER", analisis_dict, df_inj))
    if len(df_u) >= 10: tickets_glob.append(armar_bomba("🥶 MEGA X10 UNDERS", df_u.head(10), "UNDER", analisis_dict, df_inj))
    if len(df_u) >= 20: tickets_glob.append(armar_bomba("🎰 LOTERÍA X20 UNDERS", df_u, "UNDER", analisis_dict, df_inj))
    if tickets_glob: TICKETS_JSON.append({"matchup": "🌎 GLOBALES", "guion": "MIX", "tickets": tickets_glob})

    print(f"\n💾 Guardando {sum(len(t['tickets']) for t in TICKETS_JSON)} tickets. Subiendo a Supabase...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE ludo_picks;"))
        conn.execute(text("INSERT INTO ludo_picks (json_data) VALUES (:data)"), {"data": json.dumps(TICKETS_JSON, ensure_ascii=False)})
    print("✅ ¡Finalizado!")

if __name__ == "__main__":
    start = time.time()
    c, l, i, o = obtener_datos()
    ludo_engine(c, l, i, o)
    print(f"\n⏱️  Tiempo total: {round(time.time() - start, 1)}s")