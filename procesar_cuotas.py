import json
import glob

def parsear_cuotas_nba(json_data):
    # Betano puede devolver el evento en 'event' o el primer item de 'events'[cite: 11, 14]
    data_root = json_data.get("DATOS", {}).get("data", {})
    event = data_root.get("event") or (data_root.get("events", [{}])[0] if data_root.get("events") else None)
    
    if not event: return

    nombre_partido = event.get("name", "NBA Game")
    mercados = event.get("markets", {})
    selecciones = event.get("selections", {})
    grupos = event.get("marketGroups", [])

    print(f"\n🏀 PARTIDO: {nombre_partido}")
    print("-" * 50)
    
    # Recorremos los grupos de mercados (Puntos, Rebotes, etc.)
    for g in grupos:
        nombre_grupo = g.get("name", "")
        # Filtramos solo props de jugadores
        if any(k in nombre_grupo.lower() for k in ["puntos", "rebotes", "asistencias", "triples"]):
            for m_id in g.get("marketIds", []):
                mercado = mercados.get(str(m_id))
                if mercado:
                    # En la vista individual, el nombre del mercado es el nombre del JUGADOR[cite: 11]
                    jugador = mercado.get("name")
                    print(f"  ▶ {jugador} ({nombre_grupo})")
                    
                    for s_id in mercado.get("selectionIdList", []):
                        sel = selecciones.get(str(s_id))
                        if sel:
                            print(f"     - {sel.get('name')}: {sel.get('price')}")
                    print("  " + "." * 20)

def main():
    archivos = glob.glob("dumps_betano/PARTIDO_*.json")
    if not archivos:
        print("[-] No se encontraron archivos PARTIDO_. Ejecuta el scraper primero.")
        return

    for arc in archivos:
        try:
            with open(arc, "r", encoding="utf-8") as f:
                parsear_cuotas_nba(json.load(f))
        except Exception as e:
            print(f"[-] Error procesando {arc}: {e}")

if __name__ == "__main__":
    main()