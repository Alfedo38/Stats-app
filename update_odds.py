import os
from dotenv import load_dotenv
import requests
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from datetime import datetime
import time

# Cargar las variables del archivo .env
load_dotenv()

# ==========================================
# CONFIGURACIÓN DE APUESTAS Y BASE DE DATOS
# ==========================================
API_KEY = os.getenv("ODDS_API_KEY")
SPORT = 'basketball_nba'
REGIONS = 'us'
MARKETS = 'player_points' 
BOOKMAKERS = 'draftkings' 

password_raw = os.getenv("DB_PASSWORD")

if not password_raw:
    raise ValueError("❌ ERROR: Falta la variable DB_PASSWORD en el archivo .env")

# Conexión Segura (Sin pgbouncer, solo sslmode)
db_url = URL.create(
    drivername="postgresql",
    username="postgres.xxhdctrvjsngwbagamns",
    password=password_raw,
    host="aws-1-sa-east-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    query={"sslmode": "require"} # 👈 Volvemos a dejarlo así
)

engine = create_engine(db_url, pool_pre_ping=True)

def fetch_and_save_odds():
    if not API_KEY:
        print("❌ ERROR: No se encontró la ODDS_API_KEY en el archivo .env")
        return

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
    
    # Aquí está la magia: Usamos 'conn' para todo dentro de este bloque, método 'multi' y 'chunksize'
    with engine.begin() as conn:
        # 1. Limpiamos la tabla vieja
        conn.execute(text("TRUNCATE TABLE player_odds"))
        
        # 2. Insertamos lo nuevo suavemente en bloques de 50
        df.to_sql('player_odds', conn, if_exists='append', index=False, method='multi', chunksize=50)
        
    print("✅ Datos de apuestas guardados correctamente.")

if __name__ == "__main__":
    fetch_and_save_odds()
