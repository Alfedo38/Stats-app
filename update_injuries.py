import os
import requests
from bs4 import BeautifulSoup
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

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

def fetch_injuries():
    print("🏥 Escaneando el reporte de lesiones oficial (CBS Sports)...")
    url = "https://www.cbssports.com/nba/injuries/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return print(f"❌ Error al conectar: {response.status_code}")
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Encontramos todos los equipos (CBS separa las lesiones por equipo)
    teams = soup.find_all('div', class_='TableBaseWrapper')
    
    injuries_list = []
    
    for team_section in teams:
        # Extraer el nombre del equipo
        team_name_tag = team_section.find('span', class_='TeamName')
        team_name = team_name_tag.text.strip() if team_name_tag else "Desconocido"
        
        # Extraer los jugadores
        rows = team_section.find_all('tr', class_='TableBase-bodyTr')
        for row in rows:
            cols = row.find_all('td')
            if len(cols) >= 5:
                # El nombre del jugador suele estar dentro de un <span> oculto en la celda
                player_tag = cols[0].find('span', class_='CellPlayerName--long')
                player_name = player_tag.text.strip() if player_tag else cols[0].text.strip()
                
                position = cols[1].text.strip()
                updated_date = cols[2].text.strip()
                status = cols[3].text.strip()
                description = cols[4].text.strip()
                
                injuries_list.append({
                    'player_name': player_name,
                    'team': team_name,
                    'position': position,
                    'status': status,
                    'description': description,
                    'updated_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })

    if not injuries_list:
        print("✅ No se encontraron lesiones o la estructura de la página cambió.")
        return

    df = pd.DataFrame(injuries_list)
    
    print(f"-> Se detectaron {len(df)} jugadores con reportes médicos.")
    
    # Guardamos en Supabase
    try:
        with engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE player_injuries"))
            df.to_sql('player_injuries', conn, if_exists='append', index=False)
        print("✅ Parte Médico actualizado en la base de datos.")
    except Exception as e:
        print(f"❌ Error guardando en BD: {e}")

if __name__ == "__main__":
    fetch_injuries()