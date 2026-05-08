"""
betano_nba_props_v3.py
=======================
Versión FINAL y simple.

Descubrimiento clave: Betano embebe TODOS los datos de mercados en el HTML
dentro de window["initial_state"] = {...}.

Flujo:
  1. Navegar a la URL del partido con ?bt=1&option=player&filter=all
  2. Extraer el bloque <script> con window["initial_state"]
  3. Parsear el JSON → iterar markets → filas → selecciones
  4. Guardar CSV/JSON limpio

NO necesita: clicks, escucha de red, DOM scraping complejo.
Solo requests + regex/json. Ni siquiera hace falta DrissionPage en teoría,
pero lo usamos para manejar cookies/sesión automáticamente.

Requisitos:
  pip install DrissionPage
  Chrome con: chrome --remote-debugging-port=9222 --user-data-dir="C:/chrome_debug"
"""

from DrissionPage import ChromiumPage
import json, re, os, time
from datetime import datetime

# ══════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════
DEBUG_PORT   = 9222
NBA_URL      = "https://www.betano.bet.ar/sport/baloncesto/ee-uu/nba/"
OUTPUT_DIR   = "betano_props"
PAUSA_CARGA  = 3.5   # segundos para que cargue la página
MAX_PARTIDOS = None  # None = todos los NBA

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mapeo de typeId → nombre legible del mercado
MERCADO_MAP = {
    1856: "Puntos (hitos)",
    1970: "Puntos Más/Menos",
    1853: "Asistencias (hitos)",
    1965: "Asistencias Más/Menos",
    1858: "Rebotes (hitos)",
    1973: "Rebotes Más/Menos",
    1852: "Triples (hitos)",
    1964: "Triples Más/Menos",
    1857: "Robos (hitos)",
    1975: "Robos Más/Menos",
    1854: "Tapones (hitos)",
    1967: "Tapones Más/Menos",
    3096: "PRA (hitos)",       # Puntos+Rebotes+Asistencias
    2044: "PRA Más/Menos",
    3095: "RA (hitos)",        # Rebotes+Asistencias
    2047: "RA Más/Menos",
    2040: "PR Más/Menos",      # Puntos+Rebotes
    2038: "PA Más/Menos",      # Puntos+Asistencias
    2039: "PB Más/Menos",      # Puntos+Bloqueos
    2045: "PRB Más/Menos",     # Puntos+Rebotes+Bloqueos
    1797: "Doble-Doble",
    2052: "Triple-Doble",
    1963: "Robos+Tapones Más/Menos",
    5276: "Tiros2 Más/Menos",
    5011: "Puntos 1er período",
    5012: "Asistencias 1er período",
    5013: "Rebotes 1er período",
    5277: "Tiros2 Intentados Más/Menos",
    2027: "Tiros Libres Anotados Más/Menos",
    2026: "Tiros Libres Intentados Más/Menos",
    1000210: "Tiros Campo Anotados Más/Menos",
    1000211: "Tiros Campo Intentados Más/Menos",
    2049: "Triples Intentados Más/Menos",
    1977: "Pérdidas Más/Menos",
    1960: "Faltas Más/Menos",
    4748: "Puntos H2H",
    4930: "Rebotes H2H",
    4931: "Asistencias H2H",
    4935: "Triples H2H",
    4932: "Robos H2H",
    4933: "Tapones H2H",
    4934: "Pérdidas H2H",
    2021: "Más puntos del partido",
    2020: "Más rebotes del partido",
    2017: "Más asistencias del partido",
    1979: "Más triples del partido",
    1872: "Más pérdidas del partido",
    5594: "Más robos del partido",
    5595: "Más tapones del partido",
    5596: "Más dobles del partido",
    5597: "Más tiros libres del partido",
}

# ══════════════════════════════════════════════════════════════
#  CONEXIÓN
# ══════════════════════════════════════════════════════════════
def conectar():
    print(f"[*] Conectando a Chrome en puerto {DEBUG_PORT}...")
    try:
        page = ChromiumPage(f"127.0.0.1:{DEBUG_PORT}")
        print("[+] Conectado.\n")
        return page
    except Exception as e:
        print(f"[-] Error: {e}")
        print('Abrí Chrome con: chrome --remote-debugging-port=9222 --user-data-dir="C:/chrome_debug"')
        return None


# ══════════════════════════════════════════════════════════════
#  PASO 1: obtener links de partidos NBA
# ══════════════════════════════════════════════════════════════
NBA_EQUIPOS = [
    "76ers","knicks","celtics","lakers","warriors","bucks","heat","nets",
    "bulls","raptors","cavaliers","pistons","pacers","hawks","hornets",
    "magic","wizards","timberwolves","thunder","spurs","mavericks","nuggets",
    "clippers","suns","kings","trail-blazers","jazz","pelicans","grizzlies",
    "rockets","philadelphia","new-york","boston","golden-state","milwaukee",
    "miami","brooklyn","chicago","toronto","cleveland","detroit","indiana",
    "atlanta","charlotte","orlando","washington","minnesota","oklahoma",
    "san-antonio","dallas","denver","los-angeles","phoenix","sacramento",
    "portland","utah","new-orleans","memphis","houston",
]

def es_nba(slug: str) -> bool:
    return any(eq in slug.lower() for eq in NBA_EQUIPOS)

def obtener_partidos_nba(page) -> list[dict]:
    print(f"[*] Buscando partidos NBA en {NBA_URL}")
    page.get(NBA_URL)
    time.sleep(PAUSA_CARGA)

    for _ in range(3):
        page.run_js("window.scrollBy(0, 600)")
        time.sleep(0.7)

    partidos, vistos = [], set()
    for el in page.eles("css:a[href*='cuotas-de-partido']"):
        href = el.attr("href") or ""
        if not href or href in vistos:
            continue
        vistos.add(href)
        url = href if href.startswith("http") else "https://www.betano.bet.ar" + href
        m = re.search(r'/cuotas-de-partido/([^/]+)/(\d+)', url)
        if not m:
            continue
        slug      = m.group(1)
        evento_id = m.group(2)
        nombre    = slug.replace("-", " ").title()
        if not es_nba(slug):
            continue
        partidos.append({"nombre": nombre, "id": evento_id, "url": url.rstrip("/")})

    print(f"[+] {len(partidos)} partidos NBA encontrados:")
    for p in partidos:
        print(f"    • {p['nombre']}  (id: {p['id']})")
    return partidos[:MAX_PARTIDOS] if MAX_PARTIDOS else partidos


# ══════════════════════════════════════════════════════════════
#  PASO 2: extraer initial_state del HTML
# ══════════════════════════════════════════════════════════════
def extraer_initial_state(html: str) -> dict | None:
    """Extrae y parsea window["initial_state"] del HTML de Betano."""
    # Betano usa: window["initial_state"]={...}
    patron = r'window\["initial_state"\]\s*=\s*(\{.*?\})(?=\s*</script>)'
    m = re.search(patron, html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError as e:
        print(f"    [!] Error parseando JSON: {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  PASO 3: parsear mercados de jugadores del initial_state
# ══════════════════════════════════════════════════════════════
def parsear_mercados(state: dict, nombre_partido: str) -> list[dict]:
    """
    Recorre state['data']['event']['markets'] y extrae cuotas de jugadores.
    
    Estructura del JSON:
    market.tableLayout.rows[].title = nombre jugador
    market.tableLayout.rows[].groupSelections[].selections[].name = "24+"
    market.tableLayout.rows[].groupSelections[].selections[].price = 1.57
    market.tableLayout.rows[].groupSelections[].handicap = 26.5  (para Más/Menos)
    """
    cuotas = []
    try:
        markets = state["data"]["event"]["markets"]
    except (KeyError, TypeError):
        return []

    for mkt in markets:
        type_id      = mkt.get("typeId", 0)
        mercado_nombre = MERCADO_MAP.get(type_id, f"Tipo {type_id}")
        table        = mkt.get("tableLayout")
        if not table:
            continue

        rows = table.get("rows", [])
        for row in rows:
            jugador = row.get("title", "").strip()
            if not jugador:
                continue

            group_sels = row.get("groupSelections", [])
            for grupo in group_sels:
                handicap = grupo.get("handicap", "")
                line     = grupo.get("line", "")

                sels = grupo.get("selections", [])
                for sel in sels:
                    nombre_sel = sel.get("name", "").strip()  # "24+", "Más 26.5", "Sí", etc.
                    precio     = sel.get("price")
                    if precio is None:
                        continue

                    cuotas.append({
                        "partido"  : nombre_partido,
                        "jugador"  : jugador,
                        "mercado"  : mercado_nombre,
                        "linea"    : nombre_sel,
                        "handicap" : str(line or handicap),
                        "cuota"    : str(precio),
                    })

    return cuotas


# ══════════════════════════════════════════════════════════════
#  PASO 4: scrapear un partido
# ══════════════════════════════════════════════════════════════
def scrapear_partido(page, partido: dict) -> list[dict]:
    nombre = partido["nombre"]
    url    = f"{partido['url']}?bt=1&option=player&filter=all"

    print(f"\n{'─'*60}")
    print(f"[→] {nombre}")
    print(f"    {url}")

    page.get(url)
    time.sleep(PAUSA_CARGA)

    html   = page.html
    state  = extraer_initial_state(html)

    if not state:
        print("    [!] No se encontró initial_state en el HTML.")
        # Guardar HTML para debug
        ruta = os.path.join(OUTPUT_DIR, f"debug_{partido['id']}.html")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"    [debug] HTML guardado en {ruta}")
        return []

    cuotas = parsear_mercados(state, nombre)
    print(f"    [✓] {len(cuotas)} cuotas extraídas")

    # Resumen por mercado
    from collections import Counter
    por_mercado = Counter(c["mercado"] for c in cuotas)
    for mercado, n in sorted(por_mercado.items(), key=lambda x: -x[1])[:10]:
        print(f"       {n:>4}  {mercado}")

    return cuotas


# ══════════════════════════════════════════════════════════════
#  GUARDAR
# ══════════════════════════════════════════════════════════════
def guardar(cuotas: list):
    if not cuotas:
        print("\n[!] Sin cuotas para guardar.")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # JSON
    ruta_json = os.path.join(OUTPUT_DIR, f"props_nba_{ts}.json")
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(cuotas, f, indent=2, ensure_ascii=False)

    # CSV
    ruta_csv = os.path.join(OUTPUT_DIR, f"props_nba_{ts}.csv")
    campos   = ["partido", "jugador", "mercado", "linea", "handicap", "cuota"]
    with open(ruta_csv, "w", encoding="utf-8") as f:
        f.write(",".join(campos) + "\n")
        for c in cuotas:
            f.write(",".join(str(c.get(k,"")).replace(",",";") for k in campos) + "\n")

    print(f"\n{'═'*60}")
    print(f"[✓] {len(cuotas)} cuotas guardadas")
    print(f"    JSON → {ruta_json}")
    print(f"    CSV  → {ruta_csv}")

    # Preview
    print(f"\n{'PARTIDO':<32} {'JUGADOR':<22} {'MERCADO':<20} {'LINEA':>7} {'CUOTA':>6}")
    print("─"*95)
    for c in cuotas[:30]:
        print(f"{c['partido'][:31]:<32} {c['jugador'][:21]:<22} {c['mercado'][:19]:<20} {c['linea']:>7} {c['cuota']:>6}")
    if len(cuotas) > 30:
        print(f"  ... y {len(cuotas)-30} más.")


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════
def main():
    page = conectar()
    if not page:
        return

    partidos = obtener_partidos_nba(page)
    if not partidos:
        print("[-] No se encontraron partidos NBA.")
        return

    todas = []
    for p in partidos:
        cuotas = scrapear_partido(page, p)
        todas.extend(cuotas)

    guardar(todas)

if __name__ == "__main__":
    main()