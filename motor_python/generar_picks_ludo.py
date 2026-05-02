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

load_dotenv()

# -------------------------------------------------------------------
# 1. CONFIGURACIÓN E INICIALIZACIÓN
# -------------------------------------------------------------------

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
password_raw = os.getenv("DB_PASSWORD")
db_url = URL.create(
    drivername="postgresql", username="postgres.xxhdctrvjsngwbagamns",
    password=password_raw, host="aws-1-sa-east-1.pooler.supabase.com",
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

TICKETS_JSON = []

def obtener_bajas_equipo(team_abbr, df_inj):
    if df_inj.empty or team_abbr == '': return ""
    bajas = df_inj[df_inj['team'] == team_abbr]['injured_player'].tolist()
    return f"🚑 OUT: {', '.join(bajas[:2])}{'...' if len(bajas) > 2 else ''}" if bajas else ""

# -------------------------------------------------------------------
# 2. EXTRACCIÓN Y PROCESAMIENTO DE DATOS
# -------------------------------------------------------------------
def obtener_datos():
    print("📡 1. Extrayendo líneas reales de Supabase...")
    query_stats = "'PTS', 'REB', 'AST', '3PT', 'PRA', 'PR', 'PA', 'RA', 'FGM', 'FGA', 'FG3A', 'FTM', 'FTA'"
    df_odds = pd.read_sql(f"SELECT player_name, prop_type, matchup, line, over_price, under_price FROM player_odds WHERE prop_type IN ({query_stats})", engine)
    
    if df_odds.empty: return None, None, None, None

    def get_abbr(matchup):
        try:
            parts = matchup.split(' @ ')
            return TEAM_MAP.get(parts[0], ''), TEAM_MAP.get(parts[1], '')
        except: return '', ''
    
    df_odds[['away_team', 'home_team']] = df_odds.apply(lambda r: get_abbr(r['matchup']), axis=1, result_type='expand')

    print("📊 2. Analizando historial reciente y calculando Feature Engineering (XGBoost)...")
    query_logs = """
        SELECT pgl.player_name, pgl.team_abbreviation, p.position, pgl.game_date,
               pgl.min, pgl.usage_pct, pgl.touches, pgl.rebound_chances, pgl.passes_made,
               pgl.pts, pgl.reb, pgl.ast, pgl.fgm, pgl.fga, pgl.fg3a, pgl.fg3m, pgl.ftm, pgl.fta,
               ROW_NUMBER() OVER(PARTITION BY pgl.player_id ORDER BY pgl.game_date DESC) as rn
        FROM player_game_logs pgl JOIN players p ON pgl.player_id = p.id
    """
    df_logs = pd.read_sql(query_logs, engine)
    
    df_logs['game_date'] = pd.to_datetime(df_logs['game_date'])
    df_logs['rest_days'] = df_logs.groupby('player_name')['game_date'].diff(periods=-1).dt.days.fillna(3).clip(upper=7)
    
    df_l10 = df_logs[df_logs['rn'] <= 10].copy()
    for col, parts in {'pra': ['pts','reb','ast'], 'pr': ['pts','reb'], 'pa': ['pts','ast'], 'ra': ['reb','ast']}.items():
        df_l10[col] = sum(df_l10[p] for p in parts)
    
    df_l10.rename(columns={'pts':'PTS','reb':'REB','ast':'AST','fg3m':'3PT','pra':'PRA','pr':'PR','pa':'PA','ra':'RA','fgm':'FGM', 'fga':'FGA', 'fg3a':'FG3A', 'ftm':'FTM', 'fta':'FTA'}, inplace=True)
    df_l5 = df_l10[df_l10['rn'] <= 5].copy()

    df_stats = df_l5.groupby('player_name').agg({
        'team_abbreviation':'first', 'position':'first', 'game_date':'max', 'rest_days':'first',
        'min':'mean', 'usage_pct':'mean', 'touches':'mean', 'rebound_chances':'mean', 'passes_made':'mean',
        'PTS':'mean', 'REB':'mean', 'AST':'mean', '3PT':'mean', 
        'FGM':'mean', 'FGA':'mean', 'FG3A':'mean', 'FTM':'mean', 'FTA':'mean'
    }).reset_index()

    df_stats.rename(columns={
        'min':'min_L5', 'usage_pct':'usage_pct_L5', 'touches':'touches_L5', 'rebound_chances':'rebound_chances_L5', 'passes_made':'passes_made_L5',
        'PTS':'pts_L5', 'REB':'reb_L5', 'AST':'ast_L5', '3PT':'fg3m_L5',
        'FGM':'fgm_L5', 'FGA':'fga_L5', 'FG3A':'fg3a_L5', 'FTM':'ftm_L5', 'FTA':'fta_L5', 'game_date':'last_game_date'
    }, inplace=True)
    
    df_stats['ppm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['pts_L5'] / df_stats['min_L5'], 0)
    df_stats['fga_pm_L5'] = np.where(df_stats['min_L5'] > 0, df_stats['fga_L5'] / df_stats['min_L5'], 0)

    print("🛡️ 3. Evaluando DvP y Lesiones...")
    df_dvp = pd.read_sql("SELECT team, position, pts_allowed as dvp_pts, reb_allowed as dvp_reb, ast_allowed as dvp_ast, threes_allow as dvp_3pt FROM team_dvp", engine)
    df_inj = pd.read_sql("SELECT team, player_name as injured_player FROM player_injuries WHERE status ILIKE '%%out%%'", engine)

    df_cruce = pd.merge(df_odds, df_stats, on='player_name', how='inner')
    df_cruce['opp'] = df_cruce.apply(lambda r: r['home_team'] if r['team_abbreviation']==r['away_team'] else r['away_team'], axis=1)
    df_cruce = pd.merge(df_cruce, df_dvp, left_on=['opp','position'], right_on=['team','position'], how='left').fillna(0)

    return df_cruce, df_l10, df_inj, df_odds

# -------------------------------------------------------------------
# 3. MOTOR CENTRAL (LUDO ENGINE)
# -------------------------------------------------------------------
def ludo_engine(df_cruce, df_logs_10, df_inj, df_odds_raw):
    if df_cruce is None or df_cruce.empty: return
    df_cruce = df_cruce.copy()
    
    print("🚑 Aplicando Efecto Dominó (Usage Bump) a equipos con bajas...")
    equipos_con_bajas = df_inj['team'].unique()
    for team in equipos_con_bajas:
        bajas_count = len(df_inj[df_inj['team'] == team])
        mask_sanos = df_cruce['team_abbreviation'] == team
        if df_cruce[mask_sanos].empty: continue
        multiplicador = min(1.0 + (bajas_count * 0.10), 1.30)
        
        columnas_volumen = ['usage_pct_L5', 'fga_L5', 'fg3a_L5', 'fta_L5', 'touches_L5', 'passes_made_L5']
        for col in columnas_volumen:
            if col in df_cruce.columns:
                df_cruce.loc[mask_sanos, col] *= multiplicador

    print("🧠 4. Activando Cerebros XGBoost...")
    PISOS_LOGICOS = {'PTS': 4.5, 'REB': 2.5, 'AST': 1.5, 'PRA': 9.5, 'PR': 7.5, 'PA': 6.5, 'RA': 4.5, '3PT': 0.5, 'FGM': 1.5, 'FGA': 3.5, 'FTM': 1.5, 'FTA': 1.5}
    df_cruce['piso_minimo'] = df_cruce['prop_type'].map(PISOS_LOGICOS).fillna(0.5)
    df_cruce = df_cruce[df_cruce['line'] >= df_cruce['piso_minimo']]

    mercados = {'PTS': 'puntos', 'REB': 'rebotes', 'AST': 'asistencias', '3PT': 'triples', 'FGM': 'tiros_anotados', 'FGA': 'tiros_intentados', 'FG3A': 'triples_intentados', 'FTM': 'libres_anotados', 'FTA': 'libres_intentados'}
    models = {k: joblib.load(f'modelos_ai/ludogallina_{v}.pkl') for k, v in mercados.items()}

    for k, m in models.items():
        if k == 'PTS': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'pts_L5', 'touches_L5', 'dvp_pts', 'rest_days', 'ppm_L5']
        elif k == 'REB': cols = ['min_L5', 'rebound_chances_L5', 'reb_L5', 'touches_L5', 'dvp_reb', 'rest_days']
        elif k == 'AST': cols = ['min_L5', 'passes_made_L5', 'ast_L5', 'touches_L5', 'usage_pct_L5', 'dvp_ast', 'rest_days']
        elif k == '3PT': cols = ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'fg3m_L5', 'dvp_3pt', 'rest_days']
        elif k == 'FGM': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'fgm_L5', 'dvp_pts']
        elif k == 'FGA': cols = ['min_L5', 'usage_pct_L5', 'fga_L5', 'touches_L5', 'rest_days', 'fga_pm_L5']
        elif k == 'FG3A': cols = ['min_L5', 'usage_pct_L5', 'fg3a_L5', 'dvp_3pt', 'rest_days']
        elif k == 'FTM': cols = ['min_L5', 'usage_pct_L5', 'fta_L5', 'ftm_L5']
        elif k == 'FTA': cols = ['min_L5', 'usage_pct_L5', 'fta_L5', 'rest_days']
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

    def get_real_safe_alt(r):
        prop, player, is_over = r['prop_type'], r['player_name'], r['diff'] > 0
        alts = df_odds_raw[(df_odds_raw['player_name'] == player) & (df_odds_raw['prop_type'] == prop)]
        
        if is_over:
            safer = alts[alts['line'] < r['line']]
            s_line, s_odds = (safer.loc[safer['line'].idxmin()]['line'], safer.loc[safer['line'].idxmin()]['over_price']) if not safer.empty else (r['line'], r['over_price'])
        else:
            safer = alts[alts['line'] > r['line']]
            s_line, s_odds = (safer.loc[safer['line'].idxmax()]['line'], safer.loc[safer['line'].idxmax()]['under_price']) if not safer.empty else (r['line'], r['under_price'])
                
        logs_l10 = df_logs_10[df_logs_10['player_name'] == player]
        logs_l5 = logs_l10[logs_l10['rn'] <= 5]
        
        hit_count_l5 = (logs_l5[prop] > s_line).sum() if is_over else (logs_l5[prop] < s_line).sum() if prop in logs_l5.columns else 0
        hit_count_l10 = (logs_l10[prop] > s_line).sum() if is_over else (logs_l10[prop] < s_line).sum() if prop in logs_l10.columns else 0
            
        return pd.Series({'s_line': s_line, 's_odds': s_odds, 's_prob': hit_count_l10 * 10.0, 'hr': f"{hit_count_l5}/5 | {hit_count_l10}/10", 'hit_count_l5': hit_count_l5, 'hit_count_l10': hit_count_l10})

    df_cruce[['s_line','s_odds','s_prob','hr','hit_count_l5', 'hit_count_l10']] = df_cruce.apply(get_real_safe_alt, axis=1)
    
    print("⚖️ 5. Aplicando Escudo Anti-Varianza...")
    df_cruce['is_over'] = df_cruce['diff'] > 0
    condiciones = []
    
    # Filtros optimizados para mayor calidad
    condiciones.append((df_cruce['prop_type'] == 'PTS') & (df_cruce['is_over'] == True) & (df_cruce['edge'] >= 8) & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7))
    condiciones.append((df_cruce['prop_type'] == 'PTS') & (df_cruce['is_over'] == False) & (df_cruce['edge'] >= 15) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8))
    condiciones.append((df_cruce['prop_type'] == 'REB') & (df_cruce['is_over'] == True) & (df_cruce['edge'] >= 8) & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7))
    condiciones.append((df_cruce['prop_type'] == 'REB') & (df_cruce['is_over'] == False) & (df_cruce['edge'] >= 12) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8))
    condiciones.append((df_cruce['prop_type'] == 'AST') & (df_cruce['is_over'] == True) & (df_cruce['edge'] >= 6) & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7))
    condiciones.append((df_cruce['prop_type'] == 'AST') & (df_cruce['is_over'] == False) & (df_cruce['edge'] >= 9) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8))
    condiciones.append((df_cruce['prop_type'].isin(['FGA', 'FG3A', 'FTA', 'FGM', 'FTM'])) & (df_cruce['is_over'] == True) & (df_cruce['edge'] >= 5) & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 6))
    condiciones.append((df_cruce['prop_type'].isin(['FGA', 'FG3A', 'FTA', 'FGM', 'FTM'])) & (df_cruce['is_over'] == False) & (df_cruce['edge'] >= 8) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 7))
    condiciones.append((df_cruce['prop_type'].isin(['PRA', 'PR', 'PA', 'RA', '3PT'])) & (df_cruce['is_over'] == True) & (df_cruce['edge'] >= 8) & (df_cruce['hit_count_l5'] >= 3) & (df_cruce['hit_count_l10'] >= 7))
    condiciones.append((df_cruce['prop_type'].isin(['PRA', 'PR', 'PA', 'RA', '3PT'])) & (df_cruce['is_over'] == False) & (df_cruce['edge'] >= 12) & (df_cruce['hit_count_l5'] >= 4) & (df_cruce['hit_count_l10'] >= 8))

    filtro_final = np.logical_or.reduce(condiciones)
    df_cruce = df_cruce[filtro_final]
    df_cruce = df_cruce.sort_values('edge', ascending=False).drop_duplicates(subset=['player_name', 'prop_type', 'is_over'])

# ---------------------------------------------------------
    # 🤖 6. BATCHING: MODO PREVIEW & JSON BLINDADO (FIX CLAVES)
    # ---------------------------------------------------------
    print("🤖 6. Consultando a Gemini (gemini-3-flash-preview)...")
    
    datos_para_gemini = {}
    for _, j in df_cruce.iterrows():
        guion = "OVER" if j['diff'] > 0 else "UNDER"
        prop = j['prop_type']
        
        # 1. CREAMOS LA CLAVE ÚNICA PARA QUE NO SE PISEN LOS MERCADOS
        clave_unica = f"{j['player_name']}_{prop}"
        
        vol_str = f"FGA: {round(j['fga_L5'],1)}"
        dvp_val = round(j.get('dvp_pts',0),1)
        # 2. ESCUDO ANTI-0.0: Si no hay data del rival, no le pasamos el 0.0 a la IA
        dvp_str = f"Rival permite: {dvp_val} PTS" if dvp_val > 0 else "Matchup neutral"
        
        if prop in ['REB', 'RA']:
            vol_str = f"Reb_Pot: {round(j.get('rebound_chances_L5',0),1)}"
            dvp_val = round(j.get('dvp_reb',0),1)
            dvp_str = f"Rival permite: {dvp_val} REB" if dvp_val > 0 else "Matchup neutral"
        elif prop in ['AST', 'PA']:
            vol_str = f"Pases: {round(j.get('passes_made_L5',0),1)}"
            dvp_val = round(j.get('dvp_ast',0),1)
            dvp_str = f"Rival permite: {dvp_val} AST" if dvp_val > 0 else "Matchup neutral"
        elif prop == '3PT':
            vol_str = f"3PA: {round(j.get('fg3a_L5',1),1)}"
            dvp_val = round(j.get('dvp_3pt',0),1)
            dvp_str = f"Rival permite: {dvp_val} 3PT" if dvp_val > 0 else "Matchup neutral"

        datos_para_gemini[clave_unica] = f"Línea: {guion} {j['line']} {prop} | Pos: {j['position']} | HR: {j['hr']} | {round(j['min_L5'],1)}min, Uso {round(j['usage_pct_L5'],1)}% | {vol_str} | {dvp_str}"

    # 👉 ¡ACÁ ESTÁ EL SECRETO! Calculamos la cantidad justo ANTES del prompt
    cantidad_picks = len(datos_para_gemini)

    prompt_masivo = f"""
    Analista Quant NBA. Responde SOLO con un objeto JSON.
    REGLA 1 (VITAL): Hay {cantidad_picks} picks en los datos. DEBES devolver EXACTAMENTE {cantidad_picks} elementos en tu JSON. No omitas ninguno.
    REGLA 2: Mantén la clave EXACTAMENTE igual a la provista (Ej: "Nombre_Prop").
    REGLA 3: Justificación técnica (15 a 20 palabras) conectando volumen del jugador con debilidad del rival.
    CERO markdown. CERO saltos de línea. CERO comillas dobles internas.
    Datos: {json.dumps(datos_para_gemini)}
    """
# Le contamos cuántos jugadores hay para obligarlo a hacerlos todos
    cantidad_picks = len(datos_para_gemini)
    analisis_dict = {}
    try:
        res = client.models.generate_content(
            model="gemini-3-flash-preview", 
            contents=prompt_masivo,
            config=types.GenerateContentConfig(
                max_output_tokens=8000, 
                temperature=0.1,
                safety_settings=[
                    types.SafetySetting(category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold=types.HarmBlockThreshold.BLOCK_NONE),
                ]
            )
        )
        
        if res and res.text:
            texto_limpio = res.text.replace('```json', '').replace('```', '').strip()
            
            if not texto_limpio.endswith("}"):
                print("    🔧 Detectado JSON incompleto, amputando último registro...")
                ultima_coma = texto_limpio.rfind(',')
                if ultima_coma != -1:
                    texto_limpio = texto_limpio[:ultima_coma] + "}"
                else:
                    texto_limpio += "}"
                
            analisis_dict = json.loads(texto_limpio, strict=False)
            
            # 🕵️‍♂️ EL AUDITOR: Esto te va a imprimir en consola cuántos analizó realmente
            print(f"    ✅ IA analizó {len(analisis_dict)} de los {cantidad_picks} picks solicitados.")
            if len(analisis_dict) < cantidad_picks:
                print("    ⚠️ ¡La IA se puso vaga y omitió algunos jugadores!")
            
    except Exception as e:
        print(f"    ⚠️ Error en Gemini: {e}")

    # ---------------------------------------------------------
    # 🎫 7. ARMADO DE TICKETS (X2 SEGURAS + BOMBAS MULTI-PARTIDO)
    # ---------------------------------------------------------
    TICKETS_JSON = []

    # --- FASE 1: TICKETS X2 POR PARTIDO (LÍNEAS SEGURAS) ---
    for partido in df_cruce['matchup'].unique():
        for guion in ['OVER', 'UNDER']:
            mask = (df_cruce['matchup'] == partido) & (df_cruce['diff'] > 0 if guion == 'OVER' else df_cruce['diff'] < 0)
            df_p = df_cruce[mask]
            
            # Para los X2 ordenamos por la probabilidad de la línea segura
            top = df_p.sort_values('s_prob', ascending=False).head(8) 
            
            if len(top) < 2: continue
            
            tickets = []
            for i in range(0, len(top), 2):
                pair = top.iloc[i:i+2]
                if len(pair) < 2: break
                plays = []
                for _, j in pair.iterrows():
                    clave_unica = f"{j['player_name']}_{j['prop_type']}"
                    analisis_ia = analisis_dict.get(clave_unica, f"Análisis: Proy {j['proj']} vs {j['line']}. HR: {j['hr']}.")

                    plays.append({
                        "player": j['player_name'], "team": j['team_abbreviation'], "type": guion,
                        # 🔥 CLAVE: En el X2 forzamos la línea SEGURA como principal
                        "line": float(j['s_line']), "prop": j['prop_type'], "odds": float(j['s_odds']),
                        "proj": float(j['proj']), "edge": round(float(j['edge']), 1),
                        "analysis": analisis_ia, "safe_line": float(j['s_line']), 
                        "safe_odds": float(j['s_odds']), "safe_prob": float(j['s_prob']),
                        "hit_rate": j['hr'], "injuries": obtener_bajas_equipo(j['team_abbreviation'], df_inj),
                        "stake": 1.0 # Stake sólido para las seguras
                    })
                
                # Usamos s_odds para calcular la cuota total del parley X2
                tickets.append({"name": f"X2 SEGURO - OPCIÓN {len(tickets)+1}", "total_odds": round(pair['s_odds'].prod(), 2), "plays": plays})
            
            if tickets:
                TICKETS_JSON.append({"matchup": f"{partido} ({'🛡️' if guion=='OVER' else '🧊'})", "guion": guion, "tickets": tickets})

    # --- FASE 2: COMBINADAS GLOBALES (LÍNEAS ESTÁNDAR / BOMBAS) ---
    todas_las_jugadas = []
    # Ordenamos toda la cartelera por Edge (Mayor valor/riesgo)
    df_global = df_cruce.sort_values('edge', ascending=False)

    for _, j in df_global.iterrows():
        clave_unica = f"{j['player_name']}_{j['prop_type']}"
        analisis_ia = analisis_dict.get(clave_unica, f"Análisis: Proy {j['proj']} vs {j['line']}. HR: {j['hr']}.")
        guion = "OVER" if j['diff'] > 0 else "UNDER"
        
        todas_las_jugadas.append({
            "player": j['player_name'], "team": j['team_abbreviation'], "type": guion,
            # 🔥 CLAVE: En las bombas usamos la línea ESTÁNDAR (más riesgo, más cuota)
            "line": float(j['line']), "prop": j['prop_type'], "odds": float(j['price']),
            "proj": float(j['proj']), "edge": round(float(j['edge']), 1),
            "analysis": analisis_ia, "safe_line": float(j['s_line']), 
            "safe_odds": float(j['s_odds']), "safe_prob": float(j['s_prob']),
            "hit_rate": j['hr'], "injuries": obtener_bajas_equipo(j['team_abbreviation'], df_inj),
            "stake": 0.5 # Stake bajo (modo lotería)
        })

    # Función auxiliar para no repetir código al armar los tickets
    def crear_ticket_bomba(nombre, jugadas):
        cuota_total = math.prod([p['odds'] for p in jugadas])
        return {"name": nombre, "total_odds": round(cuota_total, 2), "plays": jugadas}

    bombas_tickets = []
    
    if len(todas_las_jugadas) >= 5:
        bombas_tickets.append(crear_ticket_bomba("🧨 BOMBA X5 (Valor Medio)", todas_las_jugadas[:5]))
    
    if len(todas_las_jugadas) >= 10:
        bombas_tickets.append(crear_ticket_bomba("💣 MEGA BOMBA X10 (Alto Riesgo)", todas_las_jugadas[:10]))
        
    if len(todas_las_jugadas) >= 20:
        bombas_tickets.append(crear_ticket_bomba("🎰 LOTERÍA X20 (Modo Degenerado)", todas_las_jugadas[:20]))

    if bombas_tickets:
        # Agregamos esta sección especial al final del JSON
        TICKETS_JSON.append({
            "matchup": "🔥 COMBINADAS DE LA JORNADA", 
            "guion": "MIX", 
            "tickets": bombas_tickets
        })

    # ---------------------------------------------------------
    # 💾 8. GUARDAR EN SUPABASE
    # ---------------------------------------------------------
    print("\n💾 Subiendo cartelera de picks a Supabase...")
    json_string = json.dumps(TICKETS_JSON, ensure_ascii=False)
    
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE ludo_picks;"))
        conn.execute(text("INSERT INTO ludo_picks (json_data) VALUES (:data)"), {"data": json_string})
        
    print("✅ ¡Picks generados y subidos a la nube exitosamente!")

if __name__ == "__main__":
    c, l, i, o = obtener_datos()
    ludo_engine(c, l, i, o)