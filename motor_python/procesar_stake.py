import json
import glob
import os
import csv
from datetime import datetime

# --- CONFIGURACIÓN ---
FOLDER = "dumps_stake_final"
OUTPUT_FOLDER = "cuotas_procesadas"

if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)

def extraer_info_partido(obj):
    info = {"partido": "Desconocido", "fecha": "Desconocida", "equipos": []}
    if not isinstance(obj, dict): return info

    fixture = obj.get('slugFixture') or obj.get('fixture')
    if fixture:
        info["partido"] = fixture.get("name")
        data_match = fixture.get("data", {})
        competitors = data_match.get("competitors", [])
        
        if not info["partido"] and competitors:
            nombres = [c.get("name") for c in competitors if c.get("name")]
            info["partido"] = " - ".join(nombres) if nombres else "Desconocido"
            info["equipos"] = nombres

        raw_time = data_match.get("startTime") or fixture.get("startTime")
        if raw_time:
            try:
                dt = datetime.strptime(raw_time, "%a, %d %b %Y %H:%M:%S %Z")
                info["fecha"] = dt.strftime("%Y-%m-%d %H:%M")
            except:
                info["fecha"] = raw_time
        return info

    for v in obj.values():
        if isinstance(v, (dict, list)):
            res = extraer_info_partido(v)
            if res["partido"] != "Desconocido": return res
    return info

def buscar_swish_data(obj):
    if isinstance(obj, dict):
        if 'swishGameTeams' in obj: return obj['swishGameTeams']
        for v in obj.values():
            res = buscar_swish_data(v)
            if res: return res
    elif isinstance(obj, list):
        for item in obj:
            res = buscar_swish_data(item)
            if res: return res
    return None

def procesar_y_guardar():
    archivos = glob.glob(f"{FOLDER}/*.json")
    print(f"[*] Analizando {len(archivos)} archivos de Stake...")
    
    registros = []
    
    for arc in archivos:
        with open(arc, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except: continue

            meta = extraer_info_partido(data)
            teams_data = buscar_swish_data(data)

            if not teams_data: continue

            print(f"📦 Extrayendo datos de: {meta['partido']} ({meta['fecha']})")

            for team in teams_data:
                nombre_equipo_json = team.get("name", "Desconocido")
                
                for player in team.get("players", []):
                    p_name = player.get("name")
                    for market in player.get("markets", []):
                        stat_name = market.get("stat", {}).get("name", "stat").upper()
                        
                        # 🚫 BARRERA ANTI ROBOS Y BLOQUEOS
                        if "STEAL" in stat_name or "BLOCK" in stat_name:
                            continue
                        
                        for line in market.get("lines", []):
                            if line.get("suspended"): continue
                            
                            registros.append({
                                "Fecha_Partido": meta['fecha'],
                                "Partido": meta['partido'],
                                "Jugador": p_name,
                                "Equipo": nombre_equipo_json,
                                "Stat": stat_name,
                                "Linea": line.get("line", 0.5),
                                "Over": round(line.get("over", 0), 2),
                                "Under": round(line.get("under", 0), 2)
                            })

    if not registros:
        print("[-] No se encontró data válida.")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M")
    csv_file = f"{OUTPUT_FOLDER}/lineas_nba_{ts}.csv"
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=registros[0].keys())
        writer.writeheader()
        writer.writerows(registros)

    print(f"\n[+] ¡ÉXITO! Se extrajeron {len(registros)} líneas (sin robos ni bloqueos) en: {csv_file}")

if __name__ == "__main__":
    procesar_y_guardar()