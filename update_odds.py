import os
from dotenv import load_dotenv
import requests
import pandas as pd
from sqlalchemy import create_engine, text
from datetime import datetime
import urllib.parse
import time

# Cargar las variables del archivo .env
load_dotenv()

# ==========================================
# CONFIGURACIÓN DE APUESTAS Y BASE DE DATOS
# ==========================================
API_KEY = "0fc582787ff0019c1d9933447c397959"
SPORT = 'basketball_nba'
REGIONS = 'us'
MARKETS = 'player_points' 
BOOKMAKERS = 'draftkings' 

# Conexión Segura (Pooler + Password Codificado)
user_raw = "postgres.xxhdctrvjsngwbagamns"
password_raw = "ALfedo2537@"
user_encoded = urllib.parse.quote_plus(user_raw)
password_encoded = urllib.parse.quote_plus(password_raw)
host = "aws-1-sa-east-1.pooler.supabase.com"
port = "6543"
dbname = "postgres"

DB_URL = f"postgresql://{user_encoded}:{password_encoded}@{host}:{port}/{dbname}?sslmode=require"
engine = create_engine(DB_URL, pool_pre_ping=True)

def fetch_and_save_odds():
    print("1. Buscando los partidos de hoy...")
    
    events_url = f"https://api.the-odds-api.com/v4/sports/{SPORT}/events?apiKey={API_KEY}"
    events_res = requests.get(events_url)
    
    if events_res.status_code != 200:
        print(f"Error obteniendo partidos: {events_res.text}")
        return
        
    events = events_res.json()
    print(f"-> Se encontraron {len(events)} partidos próximos.")
    
    odds_list = []
    
    print("2. Descargando líneas de puntos por partido...")
    
    for event in events:
        event_id = event['id']
        matchup_name = f"{event['away_team']} @ {event['home_team']}"
        
        odds_url = f"https://api.the-odds-api.com/v4/sports/{SPORT}/events/{event_id}/odds?apiKey={API_KEY}&regions={REGIONS}&markets={MARKETS}&bookmakers={BOOKMAKERS}&oddsFormat=decimal"
        odds_res = requests.get(odds_url)
        time.sleep(0.5)
        
        if odds_res.status_code != 200:
            continue 
            
        event_data = odds_res.json()
        
        for bookmaker in event_data.get('bookmakers', []):
            for market in bookmaker.get('markets', []):
                if market['key'] == 'player_points':
                    players = {}
                    for outcome in market['outcomes']:
                        player_name = outcome['description']
                        
                        if player_name not in players:
                            players[player_name] = {
                                'player_name': player_name, 
                                'prop_type': 'PTS', 
                                'line': outcome.get('point')
                            }
                        
                        if outcome['name'] == 'Over':
                            players[player_name]['over_price'] = outcome['price']
                        else:
                            players[player_name]['under_price'] = outcome['price']
                            
                    for p_data in players.values():
                        p_data['matchup'] = matchup_name
                        p_data['updated_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        odds_list.append(p_data)

    print(f"\n[Créditos restantes este mes: {odds_res.headers.get('x-requests-remaining')}]")
                        
    if not odds_list:
        print("No se encontraron líneas de jugadores. (Quizás los casinos aún no abren las líneas del día).")
        return
        
    df = pd.DataFrame(odds_list)
    print(f"\n¡Éxito! Se descargaron {len(df)} líneas de puntos. Guardando en Supabase...")
    
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS player_odds"))
        df.to_sql('player_odds', engine, index=False)
        
    print("✅ Datos de apuestas guardados correctamente.")

if __name__ == "__main__":
    fetch_and_save_odds()