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
    """Extrae nombre del partido, fecha y mapeo de competidores."""
    info = {"partido": "Desconocido", "fecha": "Desconocida", "equipos": []}
    
    if not isinstance(obj, dict): return info

    # Buscamos la sección de fixture (donde vive la metadata)
    fixture = obj.get('slugFixture') or obj.get('fixture')
    if fixture:
        # 1. Intentar obtener nombre directo o construirlo de competidores
        info["partido"] = fixture.get("name")
        data_match = fixture.get("data", {})
        competitors = data_match.get("competitors", [])
        
        if not info["partido"] and competitors:
            # Si no hay nombre, lo armamos: "Equipo A - Equipo B"
            nombres = [c.get("name") for c in competitors if c.get("name")]
            info["partido"] = " - ".join(nombres) if nombres else "Desconocido"
            info["equipos"] = nombres

        # 2. Intentar obtener la fecha (startTime)[cite: 5]
        raw_time = data_match.get("startTime") or fixture.get("startTime")
        if raw_time:
            try:
                # Soporta formato: "Thu, 30 Apr 2026 23:00:00 GMT"
                dt = datetime.strptime(raw_time, "%a, %d %b %Y %H:%M:%S %Z")
                info["fecha"] = dt.strftime("%Y-%m-%d %H:%M")
            except:
                info["fecha"] = raw_time
        return info

    # Búsqueda recursiva si no está en la raíz
    for v in obj.values():
        if isinstance(v, (dict, list)):
            res = extraer_info_partido(v)
            if res["partido"] != "Desconocido": return res
    return info

def buscar_swish_data(obj):
    """Busca la tabla de jugadores de Swish (Stake)."""
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
    print(f"[*] Analizando {len(archivos)} archivos...")
    
    registros = []
    
    for arc in archivos:
        with open(arc, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except: continue

            # Extraemos la metadata del partido
            meta = extraer_info_partido(data)
            teams_data = buscar_swish_data(data)

            if not teams_data: continue

            print(f"📦 Procesando: {meta['partido']} ({meta['fecha']})")

            for team in teams_data:
                # El equipo que viene en el JSON suele ser el correcto del bloque
                nombre_equipo_json = team.get("name", "Desconocido")
                
                for player in team.get("players", []):
                    p_name = player.get("name")
                    for market in player.get("markets", []):
                        stat_name = market.get("stat", {}).get("name", "stat").upper()
                        for line in market.get("lines", []):
                            if line.get("suspended"): continue
                            
                            registros.append({
                                "Fecha_Partido": meta['fecha'],
                                "Partido": meta['partido'],
                                "Jugador": p_name,
                                "Equipo": nombre_equipo_json,
                                "Stat": stat_name,
                                "Linea": line.get("line"),
                                "Over": round(line.get("over", 0), 2),
                                "Under": round(line.get("under", 0), 2)
                            })

    if not registros:
        print("[-] No se encontró data válida.")
        return

    # Guardar resultados
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    csv_file = f"{OUTPUT_FOLDER}/lineas_nba_{ts}.csv"
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=registros[0].keys())
        writer.writeheader()
        writer.writerows(registros)

    print(f"\n[+] ¡ÉXITO! Se generó: {csv_file}")

if __name__ == "__main__":
    procesar_y_guardar()