import os
import json
import math
import time
import pandas as pd
import numpy as np
from scipy.stats import norm
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
import joblib
from datetime import datetime
from dotenv import load_dotenv

from google import genai

load_dotenv()

# 1. CONFIGURACIÓN DE GEMINI
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options={'api_version': 'v1beta'}
)

# 2. CONFIGURACIÓN DE BASE DE DATOS
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

TEAM_MAP = {
    'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
    'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
    'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
    'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
    'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
    'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
    'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
    'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
    'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
    'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS'
}

TICKETS_JSON = []

def obtener_bajas_equipo(team_abbr, df_inj):
    if df_inj.empty or team_abbr == '': return ""
    bajas = df_inj[df_inj['team'] == team_abbr]['injured_player'].tolist()
    if not bajas: return ""
    return f"🚑 OUT: {', '.join(bajas[:2])}{'...' if len(bajas) > 2 else ''}"

def obtener_datos():
    print("📡 1. Extrayendo líneas CORE y de VOLUMEN (Tiros) de Supabase...")
    # 🔥 Agregamos FGM, FGA, FG3A, FTM, FTA al filtro de mercados
    query_stats = "'PTS', 'REB', 'AST', '3PT', 'PRA', 'PR', 'PA', 'RA', 'FGM', 'FGA', 'FG3A', 'FTM', 'FTA'"
    df_odds = pd.read_sql(f"SELECT player_name, prop_type, matchup, line, over_price, under_price FROM player_odds WHERE prop_type IN ({query_stats})", engine)
    
    if df_odds.empty: return None, None, None

    def get_abbr(matchup):
        try:
            parts = matchup.split(' @ ')
            return TEAM_MAP.get(parts[0], ''), TEAM_MAP.get(parts[1], '')
        except: return '', ''
    
    df_odds[['away_team', 'home_team']] = df_odds.apply(lambda r: get_abbr(r['matchup']), axis=1, result_type='expand')

    print("📊 2. Analizando historial reciente (L10)...")
    query_logs = """
        SELECT pgl.player_name, pgl.team_abbreviation, p.position, pgl.game_date,
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.passes_made,
               pgl.pts, pgl.reb, pgl.ast, pgl.fgm, pgl.fga, pgl.fg3a, pgl.fg3m, pgl.ftm, pgl.fta,
               ROW_NUMBER() OVER(PARTITION BY pgl.player_id ORDER BY pgl.game_date DESC) as rn
        FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.id
    """
    df_logs = pd.read_sql(query_logs, engine)
    
    df_l10 = df_logs[df_logs['rn'] <= 10].copy()
    
    for col, parts in {'pra': ['pts','reb','ast'], 'pr': ['pts','reb'], 'pa': ['pts','ast'], 'ra': ['reb','ast']}.items():
        df_l10[col] = sum(df_l10[p] for p in parts)
    
    df_l10.rename(columns={
        'pts':'PTS','reb':'REB','ast':'AST','fg3m':'3PT',
        'pra':'PRA','pr':'PR','pa':'PA','ra':'RA',
        'fgm':'FGM', 'fga':'FGA', 'fg3a':'FG3A', 'ftm':'FTM', 'fta':'FTA'
    }, inplace=True)

    df_l5 = df_l10[df_l10['rn'] <= 5].copy()

    df_stats = df_l5.groupby('player_name').agg({
        'team_abbreviation':'first', 'position':'first', 'game_date':'max',
        'min':'mean', 'usage_pct':'mean', 'touches':'mean', 'rebound_chances':'mean', 'passes_made':'mean',
        'PTS':'mean', 'REB':'mean', 'AST':'mean', '3PT':'mean', 
        'FGM':'mean', 'FGA':'mean', 'FG3A':'mean', 'FTM':'mean', 'FTA':'mean'
    }).reset_index()

    df_stats.rename(columns={
        'min':'min_L5', 'usage_pct':'usage_pct_L5', 'touches':'touches_L5', 'rebound_chances':'rebound_chances_L5', 'passes_made':'passes_made_L5',
        'PTS':'pts_L5', 'REB':'reb_L5', 'AST':'ast_L5', '3PT':'fg3m_L5',
        'FGM':'fgm_L5', 'FGA':'fga_L5', 'FG3A':'fg3a_L5', 'FTM':'ftm_L5', 'FTA':'fta_L5', 'game_date':'last_game_date'
    }, inplace=True)

    print("🛡️ 3. Evaluando DvP y Lesiones...")
    df_dvp = pd.read_sql("SELECT team, position, pts_allowed as dvp_pts, reb_allowed as dvp_reb, ast_allowed as dvp_ast, threes_allow as dvp_3pt FROM team_dvp", engine)
    df_inj = pd.read_sql("SELECT team, player_name as injured_player FROM player_injuries WHERE status ILIKE '%%out%%'", engine)

    df_cruce = pd.merge(df_odds, df_stats, on='player_name', how='inner')
    df_cruce['opp'] = df_cruce.apply(lambda r: r['home_team'] if r['team_abbreviation']==r['away_team'] else r['away_team'], axis=1)
    df_cruce = pd.merge(df_cruce, df_dvp, left_on=['opp','position'], right_on=['team','position'], how='left').fillna(0)

    return df_cruce, df_l10, df_inj

def ludo_engine(df_cruce, df_logs_10, df_inj):
    if df_cruce is None or df_cruce.empty: return
    print("🧠 4. Activando los 13 Cerebros (Stats Base + Tiros)...")
    
    # 🔥 Agregamos los cerebros de tiros que ya entrenaste
    mercados = {
        'PTS': 'puntos', 'REB': 'rebotes', 'AST': 'asistencias', '3PT': 'triples',
        'FGM': 'tiros_anotados', 'FGA': 'tiros_intentados', 'FG3A': 'triples_intentados',
        'FTM': 'libres_anotados', 'FTA': 'libres_intentados'
    }
    models = {k: joblib.load(f'modelos_ai/ludogallina_{v}.pkl') for k, v in mercados.items()}

    for k, m in models.items():
        if k == 'PTS': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'pts_L5', 'touches_L5']
        elif k == 'REB': cols = ['min_L5', 'rebound_chances_L5', 'reb_L5', 'touches_L5']
        elif k == 'AST': cols = ['min_L5', 'passes_made_L5', 'ast_L5', 'touches_L5', 'usage_pct_L5']
        elif k == '3PT': cols = ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'fg3m_L5']
        elif k == 'FGM': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'fgm_L5']
        elif k == 'FGA': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'touches_L5']
        elif k == 'FG3A': cols = ['min_L5', 'usage_pct_L5', 'fg3a_L5']
        elif k == 'FTM': cols = ['min_L5', 'usage_pct_L5', 'fta_L5', 'ftm_L5']
        elif k == 'FTA': cols = ['min_L5', 'usage_pct_L5', 'fta_L5']
        
        df_cruce[f'pred_{k.lower()}'] = m.predict(df_cruce[cols])

    def get_proj(r):
        p = r['prop_type']
        if p in mercados.keys(): return r[f'pred_{p.lower()}']
        if p == 'PRA': return r['pred_pts'] + r['pred_reb'] + r['pred_ast']
        if p == 'PR': return r['pred_pts'] + r['pred_reb']
        if p == 'PA': return r['pred_pts'] + r['pred_ast']
        if p == 'RA': return r['pred_reb'] + r['pred_ast']
        return 0

    df_cruce['proj'] = df_cruce.apply(get_proj, axis=1).round(1)
    df_cruce['diff'] = df_cruce['proj'] - df_cruce['line']
    df_cruce['edge'] = (df_cruce['diff'].abs() / df_cruce['line']) * 100
    df_cruce['price'] = df_cruce.apply(lambda r: r['over_price'] if r['diff'] > 0 else r['under_price'], axis=1)

    def get_safe(r):
        mu, prop = r['proj'], r['prop_type']
        logs_l10 = df_logs_10[df_logs_10['player_name'] == r['player_name']]
        logs_l5 = logs_l10[logs_l10['rn'] <= 5]
        
        std = logs_l10[prop].std() if not logs_l10.empty and prop in logs_l10.columns else 2.0
        std = 1.5 if pd.isna(std) or std == 0 else std
        is_over = r['diff'] > 0
        
        if is_over:
            safe = max(0.5, math.floor(norm.ppf(0.25, loc=mu, scale=std)) + 0.5)
            if safe >= r['line']: safe = max(0.5, r['line'] - 1)
            prob = 1 - norm.cdf(safe, loc=mu, scale=std)
            hit_count_l5 = (logs_l5[prop] > r['line']).sum()
            hit_count_l10 = (logs_l10[prop] > r['line']).sum()
        else:
            safe = math.floor(norm.ppf(0.75, loc=mu, scale=std)) + 0.5
            if safe <= r['line']: safe = r['line'] + 1
            prob = norm.cdf(safe, loc=mu, scale=std)
            hit_count_l5 = (logs_l5[prop] < r['line']).sum()
            hit_count_l10 = (logs_l10[prop] < r['line']).sum()
            
        odds = max(1.15, min(1/prob if prob > 0.01 else 99, 1.80))
        return pd.Series({'s_line': safe, 's_odds': round(odds, 2), 's_prob': round(prob*100, 1), 
                          'hr': f"{hit_count_l5}/5 | {hit_count_l10}/10 {'Overs' if is_over else 'Unders'}", 
                          'hit_count_l5': hit_count_l5, 'hit_count_l10': hit_count_l10})

    df_cruce = df_cruce.copy()
    df_cruce[['s_line','s_odds','s_prob','hr','hit_count_l5', 'hit_count_l10']] = df_cruce.apply(get_safe, axis=1)
    
    print("⚖️ 5. Aplicando Filtro Doble (>= 4/5 Y >= 8/10)...")
    df_cruce = df_cruce[(df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8)]
    
    df_cruce['is_over'] = df_cruce['diff'] > 0
    df_cruce = df_cruce.sort_values('edge', ascending=False).drop_duplicates(subset=['player_name', 'prop_type', 'is_over'])

    bombas = df_cruce[df_cruce['edge'] >= 10].copy()
    
    sin_saldo = False

    for partido in bombas['matchup'].unique():
        for guion in ['OVER', 'UNDER']:
            mask = (bombas['matchup'] == partido) & (bombas['diff'] > 0 if guion == 'OVER' else bombas['diff'] < 0)
            df_p = bombas[mask]
            
            limite = 8 if guion == 'OVER' else 4
            top = df_p.sort_values('edge', ascending=False).head(limite)
            
            if len(top) < 2: continue
            
            tickets = []
            for i in range(0, len(top), 2):
                pair = top.iloc[i:i+2]
                if len(pair) < 2: break
                plays = []
                for _, j in pair.iterrows():
                    analisis = ""
                    if sin_saldo:
                        analisis = f"Análisis Técnico: Proyección {j['proj']} vs línea {j['s_line']}. Hit Rate de {j['hr']}."
                    else:
                        for intento in range(2):
                            try:
                                time.sleep(0.5) 
                                prompt = (
                                    f"Actúa como un analista experto de la NBA. Responde ESTRICTAMENTE en español. "
                                    f"En máximo 25 palabras, justifica por qué el {guion} "
                                    f"de la línea de {j['line']} {j['prop_type']} es una apuesta sólida para {j['player_name']} (Tiene {j['hr']}). "
                                    f"Aporta un dato táctico del enfrentamiento contra {j['opp']}."
                                )
                                res = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
                                if res and res.text:
                                    analisis = res.text.strip().replace('"', '')
                                    print(f"    ✅ Scouting AI generado: {j['player_name']} ({j['prop_type']}) - {j['hr']}")
                                    break
                            except Exception as e:
                                error_msg = str(e)
                                if "429" in error_msg and ("depleted" in error_msg.lower() or "billing" in error_msg.lower() or "credits" in error_msg.lower()):
                                    print(f"\n    ❌ SALDO AGOTADO: Activando modo matemático...")
                                    sin_saldo = True 
                                    analisis = f"Análisis Técnico: Proyección {j['proj']} vs línea {j['s_line']}. Hit Rate de {j['hr']}."
                                    break 
                                else:
                                    analisis = f"Análisis Técnico: Proyección {j['proj']} vs línea {j['s_line']}. Hit Rate de {j['hr']}."
                                    break

                    plays.append({
                        "player": j['player_name'], "team": j['team_abbreviation'], "type": guion,
                        "line": float(j['line']), "prop": j['prop_type'], "odds": float(j['price']),
                        "proj": float(j['proj']), "edge": round(float(j['edge']), 1),
                        "analysis": analisis, "safe_line": float(j['s_line']), 
                        "safe_odds": float(j['s_odds']), "safe_prob": float(j['s_prob']),
                        "hit_rate": j['hr'], "injuries": obtener_bajas_equipo(j['team_abbreviation'], df_inj)
                    })
                
                tickets.append({"name": f"X2 - OPCIÓN {len(tickets)+1}", "total_odds": round(pair['price'].prod(), 2), "plays": plays})
            if tickets:
                TICKETS_JSON.append({"matchup": f"{partido} ({'🔥' if guion=='OVER' else '🧊'})", "guion": guion, "tickets": tickets})

    with open('picks_hoy.json', 'w', encoding='utf-8') as f:
        json.dump(TICKETS_JSON, f, ensure_ascii=False, indent=4)
    print("\n✅ Proceso completado. Archivo JSON exportado incluyendo mercados de volumen y filtro Doble Check.")

if __name__ == "__main__":
    c, l, i = obtener_datos()
    ludo_engine(c, l, i)