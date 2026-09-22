import pandas as pd
from curl_cffi import requests
import time
from datetime import datetime

def descargar_temporada_completa(fecha_inicio, fecha_fin):
    print(f"🚀 Iniciando descarga masiva desde {fecha_inicio} hasta {fecha_fin}...")
    
    # Creamos un rango de fechas con Pandas
    fechas = pd.date_range(start=fecha_inicio, end=fecha_fin)
    lista_dataframes = []
    
    url = "https://stats.nba.com/stats/leaguedashptstats"
    
    headers = {
        'Host': 'stats.nba.com',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nba.com/',
        'Origin': 'https://www.nba.com',
    }

    for fecha in fechas:
        fecha_str = fecha.strftime("%m/%d/%Y")
        
        # Lógica inteligente: A mediados de abril de 2026 arrancaron los Playoffs
        # Si la fecha es mayor al 18 de abril, cambiamos el SeasonType
        if fecha >= pd.to_datetime("04/18/2026"):
            season_type = "Playoffs"
        else:
            season_type = "Regular Season"
            
        params = {
            "College": "", "Conference": "", "Country": "", 
            "DateFrom": fecha_str, "DateTo": fecha_str, 
            "Division": "", "DraftPick": "", "DraftYear": "", 
            "GameScope": "", "Height": "", "LastNGames": "0", 
            "LeagueID": "00", "Location": "", "Month": "0", 
            "OpponentTeamID": "0", "Outcome": "", "PORound": "", 
            "PerMode": "Totals", "PlayerExperience": "", 
            "PlayerOrTeam": "Player", "PlayerPosition": "", 
            "PtMeasureType": "Passing", "Season": "2025-26", 
            "SeasonSegment": "", "SeasonType": season_type, 
            "StarterBench": "", "TeamID": "", "VsConference": "", 
            "VsDivision": "", "Weight": ""
        }

        try:
            response = requests.get(url, params=params, headers=headers, impersonate="chrome120", timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                rows = data['resultSets'][0]['rowSet']
                
                # Si hay datos ese día (hubo partidos)
                if rows:
                    cols_headers = data['resultSets'][0]['headers']
                    df = pd.DataFrame(rows, columns=cols_headers)
                    columnas_clave = ['PLAYER_NAME', 'TEAM_ABBREVIATION', 'POTENTIAL_AST', 'AST']
                    
                    df_limpio = df[columnas_clave].copy()
                    df_limpio.insert(0, 'FECHA', fecha_str)
                    df_limpio.insert(1, 'FASE', season_type)
                    
                    lista_dataframes.append(df_limpio)
                    print(f"✅ {fecha_str} ({season_type}) - Extraído con éxito ({len(df_limpio)} jugadores)")
                else:
                    print(f"⏸️ {fecha_str} - Sin partidos programados.")
            else:
                print(f"❌ {fecha_str} - Error HTTP {response.status_code}. Pausando un poco más...")
                time.sleep(5) # Penalización si nos bloquean temporalmente
                
        except Exception as e:
            print(f"⚠️ {fecha_str} - Falló la conexión: {e}")
        
        # PAUSA OBLIGATORIA para no ser baneados por Akamai
        time.sleep(1.5)

    # Consolidar todo en un solo DataFrame gigante
    if lista_dataframes:
        print("\n⏳ Uniendo todos los días y ordenando los datos...")
        df_final = pd.concat(lista_dataframes, ignore_index=True)
        
        # Ordenamos por Equipo, luego por Jugador, y luego por Fecha cronológica
        df_final['FECHA_DT'] = pd.to_datetime(df_final['FECHA'])
        df_final = df_final.sort_values(by=['TEAM_ABBREVIATION', 'PLAYER_NAME', 'FECHA_DT']).drop(columns=['FECHA_DT'])
        
        # Guardamos el CSV maestro
        nombre_archivo = "asistencias_potenciales_nba_2025_26.csv"
        df_final.to_csv(nombre_archivo, index=False)
        print(f"\n🎉 ¡PROCESO TERMINADO! Se guardaron {len(df_final)} registros en '{nombre_archivo}'")
        
        return df_final
    else:
        print("No se extrajo ningún dato.")
        return None

if __name__ == "__main__":
    # Inicio aproximado de la temporada 2025-26
    fecha_arranque = "10/21/2025" 
    # Fecha de ayer
    fecha_corte = "05/10/2026"
    
    descargar_temporada_completa(fecha_arranque, fecha_corte)
