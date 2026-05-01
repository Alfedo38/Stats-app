import os
from dotenv import load_dotenv
import requests
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from datetime import datetime
import time

load_dotenv()

# ==========================================
# CONFIGURACIÓN DE APUESTAS Y BASE DE DATOS
# ==========================================
API_KEY = os.getenv("ODDS_API_KEY")
SPORT = 'basketball_nba'
REGIONS = 'us'
BOOKMAKERS = 'draftkings' 

# 🔥 LA LISTA MAESTRA DE MERCADOS (Agregamos combinadas y triples)
MARKETS = 'player_points,player_rebounds,player_assists,player_threes,player_points_rebounds_assists,player_points_rebounds,player_points_assists,player_rebounds_assists,spreads,totals'

password_raw = os.getenv("DB_PASSWORD")
if not password_raw: raise ValueError("❌ ERROR: Falta DB_PASSWORD")

db_url = URL.create(
    drivername="postgresql",
    username="postgres.xxhdctrvjsngwbagamns",
    password=password_raw,
    host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    query={"sslmode": "require"}
)

engine = create_engine(db_url, pool_pre_ping=True)

# 🗺️ DICCIONARIO PARA TRADUCIR EL IDIOMA DEL CASINO A NUESTRA BASE
MARKET_MAPPING = {
    'player_points': 'PTS',
    'player_rebounds': 'REB',
    'player_assists': 'AST',
    'player_threes': '3PT',
    'player_points_rebounds_assists': 'PRA',
    'player_points_rebounds': 'PR',
    'player_points_assists': 'PA',
    'player_rebounds_assists': 'RA'
}

def fetch_and_save_odds():
    if not API_KEY: return print("❌ ERROR: Falta ODDS_API_KEY")

    print("1. Buscando los partidos de HOY...")
    events_res = requests.get(f"https://api.the-odds-api.com/v4/sports/{SPORT}/events?apiKey={API_KEY}")
    if events_res.status_code != 200: return print(f"Error: {events_res.text}")
        
    events = events_res.json()
    print(f"-> Se encontraron {len(events)} partidos próximos.")
    
    player_odds_list = []
    game_odds_list = []
    
    print("2. Vaciando los casinos (Descargando todas las combinadas y props)...")
    
    for event in events:
        event_id = event['id']
        home_team = event['home_team']
        away_team = event['away_team']
        matchup_name = f"{away_team} @ {home_team}"
        
        odds_url = f"https://api.the-odds-api.com/v4/sports/{SPORT}/events/{event_id}/odds?apiKey={API_KEY}&regions={REGIONS}&markets={MARKETS}&bookmakers={BOOKMAKERS}&oddsFormat=decimal"
        odds_res = requests.get(odds_url)
        time.sleep(0.5) 
        
        if odds_res.status_code != 200: continue 
            
        event_data = odds_res.json()
        
        game_data = {
            'event_id': event_id,
            'matchup': matchup_name,
            'home_team': home_team,
            'away_team': away_team,
            'spread': None,
            'total': None,
            'updated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        for bookmaker in event_data.get('bookmakers', []):
            for market in bookmaker.get('markets', []):
                market_key = market['key']
                
                # --- SPREADS Y TOTALES ---
                if market_key == 'spreads':
                    for outcome in market['outcomes']:
                        if outcome['name'] == home_team:
                            game_data['spread'] = outcome['point']
                
                elif market_key == 'totals':
                    game_data['total'] = market['outcomes'][0]['point']

                # --- LÍNEAS DE JUGADORES (Con el mapeo nuevo) ---
                elif market_key in MARKET_MAPPING:
                    prop_type = MARKET_MAPPING[market_key]
                    
                    players = {}
                    for outcome in market['outcomes']:
                        p_name = outcome['description']
                        if p_name not in players:
                            players[p_name] = {'player_name': p_name, 'prop_type': prop_type, 'line': outcome.get('point')}
                        
                        if outcome['name'] == 'Over':
                            players[p_name]['over_price'] = outcome['price']
                        else:
                            players[p_name]['under_price'] = outcome['price']
                            
                    for p_data in players.values():
                        p_data['matchup'] = matchup_name
                        p_data['updated_at'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        player_odds_list.append(p_data)

        game_odds_list.append(game_data)

    print(f"\n[Créditos API restantes: {odds_res.headers.get('x-requests-remaining')}]")
                        
    # GUARDADO EN BASE DE DATOS
    with engine.begin() as conn:
        if player_odds_list:
            df_players = pd.DataFrame(player_odds_list)
            conn.execute(text("TRUNCATE TABLE player_odds"))
            df_players.to_sql('player_odds', conn, if_exists='append', index=False, method='multi', chunksize=50)
            print(f"✅ Se guardaron {len(df_players)} líneas de jugadores (PTS, REB, AST, 3PT, PRA, etc).")
            
        if game_odds_list:
            df_games = pd.DataFrame(game_odds_list)
            conn.execute(text("TRUNCATE TABLE game_odds"))
            df_games.to_sql('game_odds', conn, if_exists='append', index=False, method='multi', chunksize=50)
            print(f"✅ Se guardó el contexto (Spreads y Totales) de {len(df_games)} partidos.")

if __name__ == "__main__":
    fetch_and_save_odds()