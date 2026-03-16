import requests
import json
import os
import psycopg2
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
raw_url = os.getenv("DATABASE_URL")

if raw_url and "?" in raw_url:
    DB_URL = raw_url.split("?")[0]
else:
    DB_URL = raw_url

HEADERS = {
    'User-Agent': 'MoskProps/3.0 (Data Analytics; by Alfedo)'
}

# 🏀 MEGA-DICCIONARIO DE LA NBA (Más de 150 Jugadores + 30 Equipos)
TARGETS = {
    # --- LOS 30 EQUIPOS (Spread, ML, Totales) ---
    "Lakers": {"team": "LAL", "type": "team"}, "Celtics": {"team": "BOS", "type": "team"},
    "Suns": {"team": "PHX", "type": "team"}, "Nuggets": {"team": "DEN", "type": "team"},
    "Knicks": {"team": "NYK", "type": "team"}, "Timberwolves": {"team": "MIN", "type": "team"},
    "Wolves": {"team": "MIN", "type": "team"}, "Thunder": {"team": "OKC", "type": "team"},
    "Bucks": {"team": "MIL", "type": "team"}, "Mavs": {"team": "DAL", "type": "team"},
    "Mavericks": {"team": "DAL", "type": "team"}, "Heat": {"team": "MIA", "type": "team"},
    "Sixers": {"team": "PHI", "type": "team"}, "76ers": {"team": "PHI", "type": "team"},
    "Warriors": {"team": "GSW", "type": "team"}, "Kings": {"team": "SAC", "type": "team"},
    "Pacers": {"team": "IND", "type": "team"}, "Cavs": {"team": "CLE", "type": "team"},
    "Cavaliers": {"team": "CLE", "type": "team"}, "Magic": {"team": "ORL", "type": "team"},
    "Spurs": {"team": "SAS", "type": "team"}, "Pelicans": {"team": "NOP", "type": "team"},
    "Pels": {"team": "NOP", "type": "team"}, "Clippers": {"team": "LAC", "type": "team"},
    "Bulls": {"team": "CHI", "type": "team"}, "Hawks": {"team": "ATL", "type": "team"},
    "Nets": {"team": "BKN", "type": "team"}, "Grizzlies": {"team": "MEM", "type": "team"},
    "Raptors": {"team": "TOR", "type": "team"}, "Jazz": {"team": "UTA", "type": "team"},
    "Rockets": {"team": "HOU", "type": "team"}, "Hornets": {"team": "CHA", "type": "team"},
    "Pistons": {"team": "DET", "type": "team"}, "Blazers": {"team": "POR", "type": "team"},
    "Wizards": {"team": "WAS", "type": "team"},

    # --- SÚPER ESTRELLAS Y JUGADORES MÁS APOSTADOS ---
    "LeBron": {"team": "LAL", "type": "player"}, "AD": {"team": "LAL", "type": "player"}, "Reaves": {"team": "LAL", "type": "player"}, "DLo": {"team": "LAL", "type": "player"},
    "Tatum": {"team": "BOS", "type": "player"}, "Brown": {"team": "BOS", "type": "player"}, "Derrick White": {"team": "BOS", "type": "player"}, "Porzingis": {"team": "BOS", "type": "player"}, "Jrue": {"team": "BOS", "type": "player"},
    "Booker": {"team": "PHX", "type": "player"}, "KD": {"team": "PHX", "type": "player"}, "Durant": {"team": "PHX", "type": "player"}, "Beal": {"team": "PHX", "type": "player"}, "Grayson Allen": {"team": "PHX", "type": "player"}, "Nurkic": {"team": "PHX", "type": "player"},
    "Jokic": {"team": "DEN", "type": "player"}, "Murray": {"team": "DEN", "type": "player"}, "MPJ": {"team": "DEN", "type": "player"}, "Gordon": {"team": "DEN", "type": "player"},
    "SGA": {"team": "OKC", "type": "player"}, "Shai": {"team": "OKC", "type": "player"}, "Chet": {"team": "OKC", "type": "player"}, "JDub": {"team": "OKC", "type": "player"}, "Giddey": {"team": "OKC", "type": "player"},
    "Giannis": {"team": "MIL", "type": "player"}, "Lillard": {"team": "MIL", "type": "player"}, "Dame": {"team": "MIL", "type": "player"}, "Portis": {"team": "MIL", "type": "player"},
    "Brunson": {"team": "NYK", "type": "player"}, "Randle": {"team": "NYK", "type": "player"}, "DiVincenzo": {"team": "NYK", "type": "player"}, "Hart": {"team": "NYK", "type": "player"},
    "Edwards": {"team": "MIN", "type": "player"}, "Ant": {"team": "MIN", "type": "player"}, "KAT": {"team": "MIN", "type": "player"}, "Gobert": {"team": "MIN", "type": "player"}, "Naz Reid": {"team": "MIN", "type": "player"},
    "Wemby": {"team": "SAS", "type": "player"}, "Vassell": {"team": "SAS", "type": "player"},
    "Curry": {"team": "GSW", "type": "player"}, "Steph": {"team": "GSW", "type": "player"}, "Klay": {"team": "GSW", "type": "player"}, "Draymond": {"team": "GSW", "type": "player"}, "Kuminga": {"team": "GSW", "type": "player"}, "Podz": {"team": "GSW", "type": "player"},
    "Fox": {"team": "SAC", "type": "player"}, "Sabonis": {"team": "SAC", "type": "player"}, "Monk": {"team": "SAC", "type": "player"},
    "Haliburton": {"team": "IND", "type": "player"}, "Siakam": {"team": "IND", "type": "player"}, "Turner": {"team": "IND", "type": "player"},
    "Mitchell": {"team": "CLE", "type": "player"}, "Mobley": {"team": "CLE", "type": "player"}, "Garland": {"team": "CLE", "type": "player"}, "Jarrett Allen": {"team": "CLE", "type": "player"},
    "Banchero": {"team": "ORL", "type": "player"}, "Franz": {"team": "ORL", "type": "player"}, "Wagner": {"team": "ORL", "type": "player"}, "Suggs": {"team": "ORL", "type": "player"},
    "Embiid": {"team": "PHI", "type": "player"}, "Maxey": {"team": "PHI", "type": "player"}, "Oubre": {"team": "PHI", "type": "player"},
    "Luka": {"team": "DAL", "type": "player"}, "Doncic": {"team": "DAL", "type": "player"}, "Kyrie": {"team": "DAL", "type": "player"}, "Irving": {"team": "DAL", "type": "player"}, "Lively": {"team": "DAL", "type": "player"},
    "Kawhi": {"team": "LAC", "type": "player"}, "PG13": {"team": "LAC", "type": "player"}, "Harden": {"team": "LAC", "type": "player"}, "Zubac": {"team": "LAC", "type": "player"},
    "Jimmy": {"team": "MIA", "type": "player"}, "Butler": {"team": "MIA", "type": "player"}, "Bam": {"team": "MIA", "type": "player"}, "Herro": {"team": "MIA", "type": "player"}, "Rozier": {"team": "MIA", "type": "player"},
    "Zion": {"team": "NOP", "type": "player"}, "Ingram": {"team": "NOP", "type": "player"}, "McCollum": {"team": "NOP", "type": "player"}, "Valanciunas": {"team": "NOP", "type": "player"},
    "Sengun": {"team": "HOU", "type": "player"}, "Jalen Green": {"team": "HOU", "type": "player"}, "FVV": {"team": "HOU", "type": "player"}, "VanVleet": {"team": "HOU", "type": "player"},
    "DeRozan": {"team": "CHI", "type": "player"}, "Coby White": {"team": "CHI", "type": "player"}, "Vucevic": {"team": "CHI", "type": "player"},
    "Ja Morant": {"team": "MEM", "type": "player"}, "JJJ": {"team": "MEM", "type": "player"}, "Bane": {"team": "MEM", "type": "player"}, "Smart": {"team": "MEM", "type": "player"},
    "Trae": {"team": "ATL", "type": "player"}, "Dejounte": {"team": "ATL", "type": "player"}, "Bogdanovic": {"team": "ATL", "type": "player"},
    "Lauri": {"team": "UTA", "type": "player"}, "Markkanen": {"team": "UTA", "type": "player"}, "Sexton": {"team": "UTA", "type": "player"}, "Clarkson": {"team": "UTA", "type": "player"},
    "Mikal": {"team": "BKN", "type": "player"}, "Bridges": {"team": "BKN", "type": "player"}, "Cam Thomas": {"team": "BKN", "type": "player"}, "Claxton": {"team": "BKN", "type": "player"},
    "Scottie": {"team": "TOR", "type": "player"}, "Barnes": {"team": "TOR", "type": "player"}, "Barrett": {"team": "TOR", "type": "player"}, "Quickley": {"team": "TOR", "type": "player"},
    "Kuzma": {"team": "WAS", "type": "player"}, "Poole": {"team": "WAS", "type": "player"}, "Avdija": {"team": "WAS", "type": "player"},
    "Cade": {"team": "DET", "type": "player"}, "Cunningham": {"team": "DET", "type": "player"}, "Duren": {"team": "DET", "type": "player"}, "Ivey": {"team": "DET", "type": "player"},
    "Simons": {"team": "POR", "type": "player"}, "Jerami Grant": {"team": "POR", "type": "player"}, "Ayton": {"team": "POR", "type": "player"},
    "LaMelo": {"team": "CHA", "type": "player"}, "Melo": {"team": "CHA", "type": "player"}, "Miles Bridges": {"team": "CHA", "type": "player"}, "Brandon Miller": {"team": "CHA", "type": "player"}
}

def extract_all_bodies(comment_list):
    bodies = []
    for item in comment_list:
        if 'data' in item and 'body' in item['data']:
            bodies.append(item['data']['body'].lower())
        if 'data' in item and 'replies' in item['data'] and isinstance(item['data']['replies'], dict):
            if 'data' in item['data']['replies'] and 'children' in item['data']['replies']['data']:
                bodies.extend(extract_all_bodies(item['data']['replies']['data']['children']))
    return bodies

def get_multi_thread_comments():
    print("🕵️‍♂️ Iniciando escaneo de múltiples hilos...")
    # Ahora buscamos en los DOS hilos más importantes
    queries = [
        'title:"NBA Betting and Picks"',
        'title:"Pick of the Day"'
    ]
    
    all_comments_text = []
    
    for query in queries:
        print(f"   🔍 Buscando hilo: {query}")
        url = f'https://www.reddit.com/r/sportsbook/search.json?q={query}&restrict_sr=on&sort=new&t=week'
        
        try:
            response = requests.get(url, headers=HEADERS)
            if response.status_code == 200:
                data = response.json()
                thread_id = None
                thread_title = ""
                
                if 'data' in data and len(data['data']['children']) > 0:
                    for post in data['data']['children']:
                        title = post['data']['title'].lower()
                        # Verificamos que sea el hilo correcto
                        if "nba betting and picks" in title or "pick of the day" in title:
                            thread_id = post['data']['id']
                            thread_title = post['data']['title']
                            break
                            
                if thread_id:
                    print(f"   ✅ Encontrado: {thread_title}")
                    comments_url = f"https://www.reddit.com/r/sportsbook/comments/{thread_id}.json?limit=500"
                    comments_response = requests.get(comments_url, headers=HEADERS)
                    
                    if comments_response.status_code == 200:
                        comments_data = comments_response.json()
                        if len(comments_data) > 1 and 'data' in comments_data[1]:
                            raw_comments = comments_data[1]['data']['children']
                            extracted = extract_all_bodies(raw_comments)
                            all_comments_text.extend(extracted)
                            print(f"   📥 +{len(extracted)} comentarios aspirados.")
        except Exception as e:
            print(f"❌ Error en la búsqueda de {query}: {e}")
            
    print(f"📊 Total de comentarios combinados a analizar: {len(all_comments_text)}")
    return all_comments_text

def analyze_sentiment(comments):
    print("🧠 Analizando jugadas (Jugadores y Equipos)...")
    results = {}
    
    for text in comments:
        for alias, info in TARGETS.items():
            alias_lower = alias.lower()
            if len(alias) <= 3:
                search_term = f" {alias_lower} "
            else:
                search_term = alias_lower

            if search_term in f" {text} ":
                if alias not in results:
                    results[alias] = {
                        "team": info["team"], 
                        "type": info["type"], 
                        "mentions": 0, 
                        "over": 0, 
                        "under": 0,
                        "spread_ml": 0
                    }
                
                results[alias]["mentions"] += 1
                
                # Lógica para Jugadores (Over / Under)
                if info["type"] == "player":
                    if "over" in text or " o " in text:
                        results[alias]["over"] += 1
                    elif "under" in text or " u " in text:
                        results[alias]["under"] += 1
                        
                # Lógica para Equipos (+120, -5.5, ML)
                elif info["type"] == "team":
                    if "+" in text or "-" in text or "ml" in text or "moneyline" in text or "spread" in text:
                        results[alias]["spread_ml"] += 1
                    elif "over" in text or "under" in text:
                        results[alias]["over"] += 1 # Totales de equipo

    final_trends = []
    for entity, data in results.items():
        if data["mentions"] > 0:
          # Definir el sentimiento visual según si es jugador o equipo
            if data["type"] == "team":
                if data["spread_ml"] >= data["over"]:
                    sentiment = "GANA DIRECTO (ML)" # ¡Ahora sí, en criollo!
                else:
                    sentiment = "TOTAL DE PUNTOS"
            # Hype ajustado por el inmenso volumen de dos hilos combinados
            hype = min(data["mentions"] * 5, 99) 
            trend = "up" if hype >= 45 else "down"
            
            # Agregamos una etiqueta visual al nombre si es un equipo para que lo distingas en la web
            display_name = f"{entity} (EQUIPO)" if data["type"] == "team" else entity
            
            final_trends.append({
                "player_name": display_name,
                "team_abbr": data["team"],
                "mentions": data["mentions"],
                "sentiment": sentiment,
                "hype_score": hype,
                "trend": trend
            })
            
    return sorted(final_trends, key=lambda x: x["mentions"], reverse=True)

def save_to_db(trends):
    if not DB_URL:
        print("❌ ERROR: No se encontró la URL de la base de datos.")
        return

    print(f"💾 Guardando {len(trends)} supertendencias en PostgreSQL...")
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        for t in trends:
            cur.execute("""
                INSERT INTO reddit_trends (player_name, team_abbr, mentions, sentiment, hype_score, trend, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (player_name) 
                DO UPDATE SET 
                    team_abbr = EXCLUDED.team_abbr,
                    mentions = reddit_trends.mentions + EXCLUDED.mentions,
                    sentiment = EXCLUDED.sentiment,
                    hype_score = EXCLUDED.hype_score,
                    trend = EXCLUDED.trend,
                    updated_at = EXCLUDED.updated_at;
            """, (t["player_name"], t["team_abbr"], t["mentions"], t["sentiment"], t["hype_score"], t["trend"], datetime.now()))
            
        conn.commit()
        cur.close()
        conn.close()
        print("✅ ¡Radar Social actualizado con éxito!")
    except Exception as e:
        print(f"❌ Error en la base de datos: {e}")

if __name__ == "__main__":
    comentarios = get_multi_thread_comments()
    if comentarios and len(comentarios) > 0:
        tendencias = analyze_sentiment(comentarios)
        if tendencias and len(tendencias) > 0:
            save_to_db(tendencias)
        else:
            print("🤷‍♂️ Nadie mencionó a los jugadores/equipos de nuestra lista.")
    else:
        print("🤷‍♂️ No se pudieron descargar comentarios.")