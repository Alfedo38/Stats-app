"""
stake_nba_props_v7.py
=====================
Scraper de props NBA en stake1017.com

FIXES v7 (basados en log real — timezone y scoreboard):
  - _meta_desde_fixture_dict: convierte timestamp UTC a hora Argentina (ART UTC-3)
    antes de extraer la fecha. Stake devuelve startTime en UTC; un partido
    a las 21:00 ART es 00:00 UTC del día siguiente → sin conversión la fecha
    quedaba un día adelantada (ej: 2026-05-20 en vez de 2026-05-19)
  - extraer_meta_desde_scoreboard: nueva función que lee fecha y equipos
    directamente del widget Sportradar embebido en la página. Ya viene en
    hora local, es la fuente más confiable para la fecha.
  - capturar_partido: jerarquía clara de fuentes para fecha:
    1. Scoreboard (hora local, máxima prioridad)
    2. GQL con conversión UTC→ART
    3. Pre-read preservado (FIX v6)
    4. DOM genérico (último fallback)

FIXES v6 (log anterior):
  - diag_id: set local, loguea cada UUID único una sola vez
  - Preservar fecha/equipos del pre-read cuando el read final queda vacío
  - leer_jugadores inyecta equipos DOM en meta_partido
  - corregir_metadata usa equipos reales aunque GQL no matchee
  - Diagnóstico top-keys de JSONs raw cuando hay paquetes pero 0 cuotas GQL
"""

from DrissionPage import ChromiumPage
import json, re, os, time, unicodedata, random, math
from datetime import datetime, timezone, timedelta

# Zona horaria Argentina (UTC-3)
ART = timezone(timedelta(hours=-3))
from collections import Counter, defaultdict
from typing import Optional

# ══════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════
DEBUG_PORT    = 9222
BASE_URL      = "https://pba.stake.bet.ar"
NBA_URL       = f"{BASE_URL}/sports/basketball/usa/nba"
OUTPUT_DIR    = "stake_props"
PAUSA_CARGA   = 3.5
PAUSA_TAB     = 2.0
PAUSA_JUGADOR = (0.35, 0.75)
PAUSA_PARTIDO = (5.0, 9.0)
PAUSA_GQL     = 3.0
MAX_PARTIDOS  = None

CAPTURAR_ALT_LINES = True

JUGADORES_POR_PAUSA_LARGA = 9
PAUSA_LARGA   = (1.8, 3.5)

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/raw", exist_ok=True)

MERCADO_MAP = {
    "puntos": "Puntos",
    "rebotes": "Rebotes",
    "asistencias": "Asistencias",
    "triples": "Triples",
    "tiros de 3": "Triples",
    "triples realizados": "Triples",
    "puntos + rebotes": "Puntos+Rebotes",
    "puntos + asistencias": "Puntos+Asistencias",
    "puntos + asistencias + rebotes": "PRA",
    "asistencias + rebotes": "Asistencias+Rebotes",
    "robos": "Robos",
    "bloqueos": "Tapones",
    "tapones": "Tapones",
    "robos + bloqueos": "Robos+Tapones",
    "tiros libres": "TirosLibres",
    "tiros libres realizados": "TirosLibres",
    "tiros libres intentados": "TirosLibresInt",
    "goles de campo realizados": "GolesCampo",
    "gol de campo realizado": "GolesCampo",
    "goles de campo intentados": "GolesCampoInt",
    "gol de campo intentado": "GolesCampoInt",
    "triples intentados": "TriplesInt",
    "doble doble": "DobleDoble",
    "triple doble": "TripleDoble",
    "faltas": "Faltas",
    "faltas personales": "Faltas",
    "pérdidas": "Pérdidas",
    "perdidas": "Pérdidas",
    "pérdidas de balón": "Pérdidas",
    "perdidas de balon": "Pérdidas",
    "pérdidas de balón (turnovers)": "Pérdidas",
    "puntos del primer cuarto": "PuntosPrimerCuarto",
    "rebotes del primer cuarto": "RebotesPrimerCuarto",
    "asistencias del primer cuarto": "AsistenciasPrimerCuarto",
    "triples del primer cuarto": "TriplesPrimerCuarto",
}

# ══════════════════════════════════════════════════════════════
#  STEALTH
# ══════════════════════════════════════════════════════════════

def _pausa_humana(base: float = 1.0, jitter: float = 0.5) -> None:
    t = base + random.uniform(0, jitter) + (random.expovariate(3.0) * 0.3)
    time.sleep(min(t, base + jitter + 3.0))


def _pausa_rango(rango: tuple) -> None:
    time.sleep(random.uniform(*rango))


def _scroll_humano(page, n: int = 3, delta_base: int = 450, pausa_base: float = 0.45):
    for i in range(n):
        factor = 0.6 + 0.8 * math.sin(math.pi * i / max(n - 1, 1))
        delta = int(delta_base * factor) + random.randint(-150, 150)
        delta = max(delta, 80)
        try:
            page.run_js(f"window.scrollBy({{top: {delta}, behavior: 'smooth'}})")
        except Exception:
            time.sleep(0.5)
        pausa = pausa_base * (0.7 + 0.6 * math.sin(math.pi * i / max(n - 1, 1)))
        time.sleep(pausa + random.uniform(0.05, 0.2))


def _mover_mouse_jitter(page, el=None):
    try:
        if el:
            page.actions.move_to(el, offset_x=random.randint(-5, 5),
                                 offset_y=random.randint(-3, 3))
        else:
            x = random.randint(200, 900)
            y = random.randint(150, 600)
            page.actions.move_to_location(x, y)
    except Exception:
        pass
    time.sleep(random.uniform(0.02, 0.08))


def _inyectar_stealth(page):
    scripts = [
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})",
        "delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array",
        "delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise",
        "delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol",
        "Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]})",
        "Object.defineProperty(navigator, 'languages', {get: () => ['es-AR', 'es', 'en']})",
    ]
    for s in scripts:
        try:
            page.run_js(s)
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════
#  CONEXIÓN
# ══════════════════════════════════════════════════════════════
def conectar() -> Optional[ChromiumPage]:
    print(f"[*] Conectando a Chrome en puerto {DEBUG_PORT}...")
    try:
        page = ChromiumPage(f"127.0.0.1:{DEBUG_PORT}")
        _inyectar_stealth(page)
        print("[+] Conectado y camuflado.\n")
        return page
    except Exception as e:
        print(f"[-] Error: {e}")
        print('   Abrí Chrome con: chrome --remote-debugging-port=9222 --user-data-dir="C:/chrome_debug"')
        return None


# ══════════════════════════════════════════════════════════════
#  CAPTURA GRAPHQL
# ══════════════════════════════════════════════════════════════
def iniciar_escucha(page):
    try:
        page.listen.stop()
    except Exception:
        pass
    time.sleep(0.1)
    for kwargs in [
        {},
        {"targets": True},
        {"targets": ""},
        {"targets": "http"},
    ]:
        try:
            page.listen.start(**kwargs)
            return
        except TypeError:
            continue
        except Exception:
            break


def _leer_buffer_listen(page) -> list:
    paquetes = []
    try:
        gen = page.listen.steps(count=9999, timeout=1.0)
        paquetes = list(gen)
    except Exception:
        pass
    if not paquetes:
        for attr in ("packets", "_packets", "traffic_list", "_traffic_list",
                     "data_packets", "results", "_steps"):
            try:
                buf = getattr(page.listen, attr, None)
                if buf:
                    paquetes = list(buf)
                    if paquetes:
                        break
            except Exception:
                continue
    if not paquetes:
        attrs_disponibles = [a for a in dir(page.listen)
                             if not a.startswith("__") and not callable(getattr(page.listen, a, None))]
        if attrs_disponibles:
            print(f"    [diag] listen attrs: {attrs_disponibles[:10]}")
    return paquetes


def obtener_packets_capturados(page) -> list:
    paquetes = _leer_buffer_listen(page)
    try:
        page.listen.stop()
    except Exception:
        pass
    vistos = set()
    unicos = []
    for p in paquetes:
        try:
            rid = (getattr(p, "request_id", None)
                   or getattr(p, "id", None)
                   or id(p))
            if rid in vistos:
                continue
            vistos.add(rid)
            unicos.append(p)
        except Exception:
            unicos.append(p)
    return unicos


def _body_to_json(body):
    if not body:
        return None
    if isinstance(body, (dict, list)):
        return body
    if isinstance(body, str):
        try:
            return json.loads(body)
        except Exception:
            return None
    return None


# ══════════════════════════════════════════════════════════════
#  METADATA DESDE GQL
# ══════════════════════════════════════════════════════════════
PAT_ISO_DATE = re.compile(r'(\d{4}-\d{2}-\d{2})')


def _norm_txt(texto: str) -> str:
    t = str(texto or "").replace("\xa0", " ")
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.lower().replace("+", " + ")
    return re.sub(r"\s+", " ", t).strip()


def _mercado_map_norm() -> dict:
    return {_norm_txt(k): v for k, v in MERCADO_MAP.items()}


PAT_JUGADOR = re.compile(
    r'^(.+?)\s*\((?:C|PF|SF|SG|PG|F|G|C/F|F/C|G/F|C-F|G-F)\)\s*$'
)


def _limpiar_equipo(nombre: str) -> str:
    return re.sub(r"\s+", " ", str(nombre or "")).strip()


def _extraer_equipos_de_competitors(competitors: list) -> tuple:
    if not isinstance(competitors, list):
        return "", "", []
    rows = []
    for c in competitors:
        if not isinstance(c, dict):
            continue
        name = _limpiar_equipo(
            c.get("name") or c.get("teamName") or c.get("displayName")
            or c.get("shortName") or c.get("slug") or ""
        )
        if not name:
            continue
        side = str(
            c.get("side") or c.get("type") or c.get("competitorType")
            or c.get("homeAway") or ""
        ).lower()
        order = c.get("order") or c.get("sortOrder") or c.get("position") or 0
        rows.append({"name": name, "side": side, "order": order})
    if not rows:
        return "", "", []
    equipo_local = equipo_visitante = ""
    for r in rows:
        if r["side"] in {"home", "local", "casa", "1"}:
            equipo_local = r["name"]
        elif r["side"] in {"away", "visitor", "visitante", "2"}:
            equipo_visitante = r["name"]
    nombres = [r["name"] for r in sorted(rows, key=lambda x: str(x.get("order", "")))]
    nombres_unicos = list(dict.fromkeys(nombres))
    if not equipo_local and nombres_unicos:
        equipo_local = nombres_unicos[0]
    if not equipo_visitante and len(nombres_unicos) >= 2:
        equipo_visitante = nombres_unicos[1]
    return equipo_local, equipo_visitante, nombres_unicos


def _meta_desde_fixture_dict(fixture: dict) -> dict:
    if not isinstance(fixture, dict):
        return {}
    data = fixture.get("data") or fixture.get("fixture") or {}
    if not isinstance(data, dict):
        data = {}
    raw_time = (data.get("startTime") or data.get("startDate")
                or fixture.get("startTime") or fixture.get("startDate")
                or fixture.get("startsAt") or "")
    fecha = fecha_hora = ""
    if raw_time:
        raw_str = str(raw_time)
        fecha_hora = raw_str
        # FIX v7: convertir UTC a hora Argentina (UTC-3) antes de extraer la fecha.
        # El GQL devuelve startTime en UTC; un partido a las 21:00 ART es 00:00 UTC
        # del día siguiente → sin conversión la fecha queda un día adelantada.
        try:
            # Intentar parsear como ISO con timezone (ej: "2026-05-20T00:00:00Z")
            raw_iso = raw_str.replace("Z", "+00:00")
            dt_utc = datetime.fromisoformat(raw_iso)
            if dt_utc.tzinfo is not None:
                dt_art = dt_utc.astimezone(ART)
                fecha = dt_art.strftime("%Y-%m-%d")
                fecha_hora = dt_art.strftime("%Y-%m-%d %H:%M")
            else:
                # Sin timezone en el string → asumir UTC y convertir igual
                dt_art = dt_utc.replace(tzinfo=timezone.utc).astimezone(ART)
                fecha = dt_art.strftime("%Y-%m-%d")
                fecha_hora = dt_art.strftime("%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            # Fallback: regex directo (para formatos no-ISO)
            m = re.search(r"(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?", raw_str)
            if m:
                fecha = m.group(1)
                fecha_hora = f"{fecha} {m.group(2)}" if m.group(2) else fecha
            else:
                for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%d/%m/%Y %H:%M", "%Y/%m/%d"):
                    try:
                        dt = datetime.strptime(raw_str, fmt)
                        fecha = dt.strftime("%Y-%m-%d")
                        fecha_hora = dt.strftime("%Y-%m-%d %H:%M")
                        break
                    except Exception:
                        pass
    competitors = (data.get("competitors") or fixture.get("competitors")
                   or data.get("teams") or fixture.get("teams") or [])
    local, visitante, equipos = _extraer_equipos_de_competitors(competitors)
    partido_original = _limpiar_equipo(fixture.get("name") or data.get("name") or "")
    partido_real = ""
    if visitante and local:
        partido_real = f"{visitante} - {local}"
    elif partido_original:
        partido_real = partido_original
    return {
        "partido": partido_real,
        "partido_original": partido_original,
        "fecha": fecha,
        "fecha_hora": fecha_hora,
        "equipo_local": local,
        "equipo_visitante": visitante,
        "equipos": equipos,
        "fixture_id": str(fixture.get("id") or data.get("id") or ""),
    }


def _merge_meta(base: dict, new: dict) -> dict:
    base = dict(base or {})
    for k, v in (new or {}).items():
        if k == "equipos":
            actual = base.get(k) or []
            for eq in v or []:
                if eq and eq not in actual:
                    actual.append(eq)
            if actual:
                base[k] = actual
        elif v and not base.get(k):
            base[k] = v
    return base


def extraer_meta_desde_gql(paquetes, fallback_nombre="", fallback_url="",
                            fixture_id_hint="") -> dict:
    """
    Extrae metadata del partido desde paquetes GQL.
    Prioriza el fixture que coincida con fixture_id_hint.
    """
    meta_exacto   = {}
    meta_generico = {
        "partido": "", "partido_original": "", "fecha": "", "fecha_hora": "",
        "equipo_local": "", "equipo_visitante": "", "equipos": [],
        "fixture_id": "", "url": fallback_url or "",
    }

    # FIX v6: set local para no loguear el mismo UUID 50 veces
    _diag_seen: set = set()

    def _es_fixture_objetivo(fx: dict) -> bool:
        if not fixture_id_hint:
            return False
        fx_id = str(fx.get("id") or fx.get("fixtureId") or "").strip()
        match = fx_id == fixture_id_hint or fx_id.startswith(fixture_id_hint)
        # FIX v6: Stake usa UUIDs en GQL vs números en URL → nunca matchean.
        # Logueamos cada UUID único UNA sola vez para diagnóstico sin spam.
        if not match and fx_id and fx_id not in _diag_seen:
            _diag_seen.add(fx_id)
            print(f"    [diag_id] GQL={fx_id!r}  hint={fixture_id_hint!r}")
        return match

    def recorrer(obj):
        nonlocal meta_exacto, meta_generico
        if isinstance(obj, list):
            for item in obj:
                recorrer(item)
            return
        if not isinstance(obj, dict):
            return
        for key in ("slugFixture", "fixture"):
            fx = obj.get(key)
            if isinstance(fx, dict):
                m = _meta_desde_fixture_dict(fx)
                if _es_fixture_objetivo(fx):
                    meta_exacto = _merge_meta(meta_exacto, m)
                else:
                    meta_generico = _merge_meta(meta_generico, m)
        if ("startTime" in obj or "startDate" in obj) and ("competitors" in obj or "teams" in obj):
            m = _meta_desde_fixture_dict(obj)
            if _es_fixture_objetivo(obj):
                meta_exacto = _merge_meta(meta_exacto, m)
            else:
                meta_generico = _merge_meta(meta_generico, m)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                recorrer(v)

    for pkt in paquetes:
        try:
            body = _body_to_json(pkt.response.body)
            if body:
                recorrer(body)
        except Exception:
            continue

    if meta_exacto.get("fecha"):
        meta = _merge_meta(meta_generico, meta_exacto)
        for k in ("fecha", "fecha_hora", "partido", "partido_original",
                  "equipo_local", "equipo_visitante", "equipos", "fixture_id"):
            if meta_exacto.get(k):
                meta[k] = meta_exacto[k]
    else:
        meta = meta_generico

    if not meta.get("partido"):
        meta["partido"] = fallback_nombre or "Desconocido"
    if not meta.get("partido_original"):
        meta["partido_original"] = fallback_nombre or "Desconocido"
    return meta


def _fecha_mas_cercana(fechas: list) -> str:
    hoy = datetime.now().date()
    mejor = None
    mejor_diff = 99999
    for f in fechas:
        try:
            diff = abs((datetime.strptime(f, "%Y-%m-%d").date() - hoy).days)
            if diff < mejor_diff:
                mejor_diff = diff
                mejor = f
        except Exception:
            continue
    return mejor or ""


# FIX v5: acota primero al header del partido antes de escanear toda la página
def extraer_fecha_partido(page) -> str:
    """
    Extrae la fecha del partido actual.
    FIX v5: busca primero dentro del header/bloque del partido específico
    (evita tomar fechas del sidebar o de otros partidos del listado).
    Fallback: escaneo global con heurística de fecha más cercana a hoy.
    """
    candidatas = []

    # ── Estrategia 1: <time datetime> dentro del header del partido ──────────
    # Selectores típicos del bloque principal del evento en Stake
    HEADER_SELS = [
        "css:div[class*='event-header']",
        "css:div[class*='fixture-header']",
        "css:div[class*='match-header']",
        "css:div[class*='scoreboard']",
        "css:div[class*='breadcrumb']",  # suele tener la fecha del partido actual
        "css:main",                       # contenido principal (excluye sidebar)
    ]
    for h_sel in HEADER_SELS:
        try:
            header = page.ele(h_sel, timeout=0.5)
            if not header:
                continue
            for el in header.eles("css:time[datetime]", timeout=0.5):
                m = PAT_ISO_DATE.search(el.attr("datetime") or "")
                if m:
                    candidatas.append(m.group(1))
            if candidatas:
                return _fecha_mas_cercana(candidatas)
        except Exception:
            continue

    # ── Estrategia 2: escaneo global de <time datetime> (igual que v4) ──────
    for sel in ["css:time[datetime]", "xpath://time[@datetime]"]:
        try:
            for el in page.eles(sel, timeout=1):
                m = PAT_ISO_DATE.search(el.attr("datetime") or "")
                if m:
                    candidatas.append(m.group(1))
        except Exception:
            pass

    if candidatas:
        return _fecha_mas_cercana(candidatas)

    # ── Estrategia 3: scan del HTML completo ────────────────────────────────
    try:
        fechas_html = PAT_ISO_DATE.findall(page.html[:120_000])
        candidatas = [f for f in fechas_html if int(f[:4]) >= 2025]
        if candidatas:
            return _fecha_mas_cercana(candidatas)
    except Exception:
        pass

    return datetime.now().strftime("%Y-%m-%d")


# Meses en español/inglés abreviados para parsear "19 May", "20 Jun", etc.
_MESES = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "ene": 1, "abr": 4, "ago": 8, "oct": 10, "dic": 12,
}


def extraer_meta_desde_scoreboard(page) -> dict:
    """
    FIX v7: lee fecha y nombres de equipos directamente del widget Sportradar
    que Stake embebe en la página del partido.

    El widget tiene estructura conocida:
      sr-lmt-plus-scb__us-team-name  → nombre corto del equipo (ej: "New York")
      sr-lmt-plus-scb__team-abbr     → abreviatura (ej: "NYK")
      srm-is-uppercase               → fecha local "19 May"
      sr-lmt-plus-scb__status        → contenedor con fecha y hora

    Esto es más confiable que GQL porque ya está en hora local.
    """
    resultado = {"fecha": "", "equipo_local": "", "equipo_visitante": "", "equipos": []}

    # ── Fecha y hora locales ─────────────────────────────────────────────────
    try:
        # El status contiene "19 May | 21:00" en texto combinado
        status = page.ele("css:div.sr-lmt-plus-scb__status", timeout=1.5)
        if status:
            texto = re.sub(r"\s+", " ", status.text or "").strip()
            # Formato: "19 May | 21:00" o "19 May" o "19 May 21:00"
            m = re.search(r"(\d{1,2})\s+([A-Za-z]{3,})", texto)
            if m:
                dia  = int(m.group(1))
                mes_str = m.group(2).lower()[:3]
                mes  = _MESES.get(mes_str)
                if mes:
                    año = datetime.now(ART).year
                    # Si el mes ya pasó este año, puede ser del año siguiente
                    hoy = datetime.now(ART).date()
                    from datetime import date as _date
                    candidata = _date(año, mes, dia)
                    # Si la fecha está más de 60 días en el pasado, asumir año siguiente
                    if (hoy - candidata).days > 60:
                        candidata = _date(año + 1, mes, dia)
                    resultado["fecha"] = candidata.strftime("%Y-%m-%d")

                    # Hora local si está disponible
                    m_hora = re.search(r"(\d{1,2}:\d{2})", texto)
                    if m_hora:
                        resultado["fecha_hora"] = f"{resultado['fecha']} {m_hora.group(1)}"
    except Exception:
        pass

    # ── Nombres de equipos ───────────────────────────────────────────────────
    # team1 = local (izquierda), team2 = visitante (derecha) en el widget
    try:
        nombres = page.eles("css:div.sr-lmt-plus-scb__us-team-name", timeout=1.5)
        abbrs   = page.eles("css:div.sr-lmt-plus-scb__team-abbr",    timeout=1.5)

        # Construir nombre completo: ej "New York" + "NYK" → "New York Knicks" no disponible,
        # pero al menos tenemos el nombre corto y la abreviatura
        equipos_scoreboard = []
        for i, (n, a) in enumerate(zip(nombres, abbrs)):
            nombre_corto = (n.text or "").strip()
            abrev        = (a.text or "").strip()
            if nombre_corto:
                equipos_scoreboard.append(nombre_corto)

        if len(equipos_scoreboard) >= 2:
            resultado["equipo_local"]     = equipos_scoreboard[1]  # team2 = local
            resultado["equipo_visitante"] = equipos_scoreboard[0]  # team1 = visitante
            resultado["equipos"]          = equipos_scoreboard

    except Exception:
        pass

    if resultado["fecha"] or resultado["equipo_local"]:
        partes = []
        if resultado["fecha"]:
            partes.append(f"fecha={resultado['fecha']}")
        if resultado["equipo_local"]:
            partes.append(f"local={resultado['equipo_local']}, visita={resultado['equipo_visitante']}")
        print(f"    [scoreboard] {' | '.join(partes)}")

    return resultado


# ══════════════════════════════════════════════════════════════
#  PASO 1: obtener lista de partidos
# ══════════════════════════════════════════════════════════════
def _esperar_estable(page, reintentos=8, pausa=1.5) -> bool:
    url_ant = None
    for _ in range(reintentos):
        try:
            url_act = page.url
            if url_act and url_act == url_ant:
                page.run_js("void 0")
                return True
            url_ant = url_act
        except Exception:
            pass
        time.sleep(pausa)
    return False


def obtener_partidos(page) -> list:
    print(f"[*] Navegando a {NBA_URL}")
    page.get(NBA_URL)
    time.sleep(PAUSA_CARGA)
    _esperar_estable(page)
    _inyectar_stealth(page)
    _scroll_humano(page)
    partidos, vistos = [], set()
    for el in page.eles("css:a[href*='/sports/basketball/usa/nba/']"):
        href = el.attr("href") or ""
        if not href or href in vistos:
            continue
        slug = href.rstrip("/").split("/")[-1]
        if not re.match(r'^\d+', slug):
            continue
        vistos.add(href)
        url = href if href.startswith("http") else BASE_URL + href
        m = re.match(r'^(\d+)', slug)
        pid = m.group(1) if m else slug
        nombre = re.sub(r'^\d+-', '', slug).replace("-", " ").title()
        partidos.append({"nombre": nombre[:60], "id": pid, "url": url})
    partidos = list({p["id"]: p for p in partidos}.values())
    print(f"[+] {len(partidos)} partidos NBA encontrados:")
    for p in partidos:
        print(f"    • {p['nombre'][:55]}  (id: {p['id']})")
    return partidos[:MAX_PARTIDOS] if MAX_PARTIDOS else partidos


# ══════════════════════════════════════════════════════════════
#  PASO 2: tab "Apuestas al Jugador"
# ══════════════════════════════════════════════════════════════
def clickear_tab_jugadores(page) -> bool:
    textos = ["Apuestas al Jugador", "Player Props", "Players", "Jugadores", "Jugador"]
    estrategias = []
    for texto in textos:
        estrategias += [
            f"xpath://button[normalize-space()='{texto}']",
            f"xpath://span[normalize-space()='{texto}']/ancestor::button",
            f"xpath://*[@role='tab' and normalize-space()='{texto}']",
            f"xpath://button[contains(normalize-space(),'{texto}')]",
            f"xpath://a[contains(normalize-space(),'{texto}')]",
            f"xpath://a[.//span[contains(normalize-space(),'{texto}')]]",
        ]
    for frag in ["player-props", "player_props", "jugador", "players"]:
        estrategias.append(f"xpath://a[contains(@href,'{frag}')]")
    for sel in estrategias:
        try:
            el = page.ele(sel, timeout=1.5)
            if not el:
                continue
            try:
                visible = el.states.is_displayed
                if not visible:
                    continue
            except Exception:
                pass
            try:
                el.scroll.to_see()
            except Exception:
                pass
            _mover_mouse_jitter(page, el)
            try:
                page.actions.move_to(el).click()
            except Exception:
                el.click()
            return True
        except Exception:
            continue
    return False


# ══════════════════════════════════════════════════════════════
#  PASO 3: accordions de jugadores
# ══════════════════════════════════════════════════════════════
_ACCORDION_SELECTORES = [
    "css:div.secondary-accordion.level-2",
    "css:div[class*='secondary-accordion'][class*='level-2']",
    "xpath://div[contains(@class,'accordion') and contains(@class,'level-2')]",
    "xpath://*[@data-testid='player-accordion']",
    "xpath://*[@data-testid='player-row']",
    "xpath://div[contains(@class,'accordion')]//div[contains(@class,'header')]"
    "[.//span[contains(@class,'ds-body')]]/..",
]

_HEADER_SELECTORES = [
    "css:div.header",
    "css:div[class*='header']",
    "xpath:.//div[contains(@class,'header')]",
    "xpath:.//button[contains(@class,'header')]",
]

_NOMBRE_SELECTORES = [
    "css:div.header span[data-ds-text]",
    "css:div.header span",
    "xpath:.//div[contains(@class,'header')]//span[@data-ds-text]",
    "xpath:.//div[contains(@class,'header')]//span",
    "xpath:.//button//span",
]


def _buscar_accordions(page) -> list:
    for sel in _ACCORDION_SELECTORES:
        try:
            accs = page.eles(sel)
            if accs:
                return accs
        except Exception:
            continue
    return []


def _verificar_accordion_abierto(acc, timeout=1.5) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            is_open = acc.run_js(
                "return this.classList.contains('is-open') || "
                "!!this.querySelector('.content.is-open, "
                "[class*=\'content\'][class*=\'is-open\']');"
            )
            if is_open:
                return True
        except Exception:
            pass
        try:
            cls = acc.attr("class") or ""
            if "is-open" in cls:
                return True
        except Exception:
            pass
        try:
            contenido = acc.ele(
                "xpath:.//div[contains(@class,'content') and contains(@class,'is-open')]",
                timeout=0.1
            )
            if contenido:
                return True
        except Exception:
            pass
        time.sleep(0.08)
    return False


def _nombre_desde_accordion(acc) -> str:
    for sel in _NOMBRE_SELECTORES:
        try:
            sp = acc.ele(sel, timeout=0.3)
            if sp and sp.text:
                texto = sp.text.strip()
                if texto and len(texto) > 2:
                    return texto
        except Exception:
            continue
    return ""


def _click_accordion(page, acc) -> bool:
    try:
        acc.scroll.to_see()
    except Exception:
        pass
    time.sleep(random.uniform(0.08, 0.18))
    try:
        ok = acc.run_js("""
            const header = this.querySelector(
                '.header, div[class*="header"], button[class*="header"]'
            );
            const target = header || this;
            const r = target.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            target.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x, clientY:y}));
            target.dispatchEvent(new MouseEvent('mousedown',    {bubbles:true, clientX:x, clientY:y}));
            target.dispatchEvent(new MouseEvent('mouseup',      {bubbles:true, clientX:x, clientY:y}));
            target.dispatchEvent(new MouseEvent('click',        {bubbles:true, clientX:x, clientY:y}));
            return true;
        """)
        if ok:
            return True
    except Exception:
        pass
    for sel_h in _HEADER_SELECTORES:
        try:
            h = acc.ele(sel_h, timeout=0.3)
            if not h:
                continue
            _mover_mouse_jitter(page, h)
            try:
                page.actions.move_to(h).click()
            except Exception:
                h.click()
            return True
        except Exception:
            continue
    try:
        _mover_mouse_jitter(page, acc)
        acc.click()
        return True
    except Exception:
        return False


def abrir_accordions_jugadores(page) -> list:
    accordions = _buscar_accordions(page)
    if not accordions:
        return []
    n_total = len(accordions)
    print(f"    [·] {n_total} accordions de jugadores encontrados")
    abiertos = 0
    for i, acc in enumerate(accordions):
        try:
            cls = acc.attr("class") or ""
            if "is-open" in cls:
                abiertos += 1
                continue
            exito = _click_accordion(page, acc)
            if not exito:
                continue
            if _verificar_accordion_abierto(acc, timeout=1.2):
                abiertos += 1
            else:
                time.sleep(0.25)
                _click_accordion(page, acc)
                if _verificar_accordion_abierto(acc, timeout=0.8):
                    abiertos += 1
            _pausa_rango(PAUSA_JUGADOR)
            if (i + 1) % JUGADORES_POR_PAUSA_LARGA == 0:
                print(f"       [zZz] Pausa de lectura tras {i+1} jugadores...")
                _pausa_rango(PAUSA_LARGA)
                _scroll_humano(page, n=1, delta_base=250, pausa_base=0.4)
        except Exception:
            continue
    print(f"    [·] {abiertos}/{n_total} accordions abiertos correctamente")
    try:
        return page.eles("css:div.secondary-accordion.level-2.is-open") or _buscar_accordions(page)
    except Exception:
        return _buscar_accordions(page)


def extraer_equipos_jugadores(page) -> dict:
    mapa = {}
    try:
        for acc_team in page.eles("css:div.secondary-accordion.level-1"):
            equipo = ""
            for sel in [
                "css:div.swish-title span[data-ds-text]",
                "css:div.header span[data-ds-text]",
                "xpath:.//div[contains(@class,'header')]//span[@data-ds-text]",
            ]:
                try:
                    sp = acc_team.ele(sel, timeout=0.5)
                    if sp and sp.text:
                        equipo = sp.text.strip()
                        break
                except Exception:
                    pass
            if not equipo:
                continue
            try:
                for jel in acc_team.eles(
                    "css:div.secondary-accordion.level-2 div.header span[data-ds-text]"
                ):
                    nombre_j = (jel.text or "").strip()
                    if nombre_j:
                        m = PAT_JUGADOR.match(nombre_j)
                        nombre_limpio = m.group(1).strip() if m else nombre_j
                        mapa[nombre_j] = equipo
                        mapa[nombre_limpio] = equipo
            except Exception:
                pass
    except Exception:
        pass
    return mapa


# ══════════════════════════════════════════════════════════════
#  PARSEO DE FILAS DE MERCADO
# ══════════════════════════════════════════════════════════════
_FILA_SELECTORES = [
    "xpath:.//div[contains(@class,'items-center') and contains(@class,'border-b') "
    "and .//button[@data-testid='fixture-outcome']]",
    "xpath:.//div[contains(@class,'flex-wrap') and "
    ".//button[@data-testid='fixture-outcome']]",
    "xpath:.//div[./button[@data-testid='fixture-outcome']]",
    "xpath:.//div[.//*[@data-testid='fixture-outcome']]",
]

_MERCADO_TEXTO_SELECTORES = [
    "css:span.ds-body-md-strong",
    "css:span[data-ds-text][class*='ds-body-md']",
    "xpath:.//span[contains(@class,'ds-body-md') and @data-ds-text]",
    "xpath:.//span[contains(@class,'ds-body-md-strong')]",
    "xpath:.//span[contains(@class,'market-name')]",
    "xpath:.//span[string-length(normalize-space())>4 and not(contains(@class,'odds'))]",
]

_DROPDOWN_SELECTORES = [
    "xpath:.//button[@aria-label='Open Dropdown']",
    "xpath:.//button[contains(@aria-label,'Dropdown')]",
    "xpath:.//button[contains(@aria-label,'dropdown')]",
    "xpath:.//button[contains(@aria-label,'Desplegable')]",
    "xpath:.//button[contains(@aria-label,'Abrir')]",
    "xpath:.//button[contains(@class,'select') or contains(@class,'dropdown')]",
    "xpath:.//select",
]

_CUOTA_SELECTORES = [
    "xpath:.//div[@data-testid='fixture-odds']//span[contains(@class,'ds-body-sm')]",
    "css:span.ds-body-sm-strong",
    "xpath:.//span[contains(@class,'ds-body-sm')]",
    "xpath:.//span[contains(@class,'odds')]",
    "xpath:.//span[re:match(text(), '^\\d+[,.]\\d+$')]",
]


def _normalizar_mercado(texto: str) -> str:
    t = _norm_txt(texto)
    mapa = _mercado_map_norm()
    if t in mapa:
        return mapa[t]
    t2 = t
    for sufijo in [" personales", " de balon (turnovers)", " (turnovers)"]:
        if t2.endswith(sufijo):
            t2 = t2[:-len(sufijo)].strip()
    if t2 in mapa:
        return mapa[t2]
    for kw, label in sorted(mapa.items(), key=lambda x: len(x[0]), reverse=True):
        if t.startswith(kw):
            return label
    return ""


def _extraer_linea_texto(texto: str) -> str:
    raw = str(texto or "").replace("\xa0", " ").strip()
    if not raw:
        return ""
    first = raw.splitlines()[0].strip()
    m = re.match(r"^(\d+(?:\.\d+)?)\s*[↑↓▼▲]?$", first)
    if m:
        return m.group(1)
    m = re.search(r"\b(\d+(?:\.\d+)?)\b", first)
    return m.group(1) if m else ""


def _linea_float(linea: str) -> Optional[float]:
    try:
        return float(str(linea).replace(",", "."))
    except Exception:
        return None


def _leer_linea_dropdown(fila) -> str:
    for sel in _DROPDOWN_SELECTORES:
        try:
            btn = fila.ele(sel, timeout=0.25)
            if btn:
                linea = _extraer_linea_texto(btn.text or "")
                if linea:
                    return linea
        except Exception:
            continue
    return ""


def _leer_cuota_de_boton(btn) -> str:
    for sel in _CUOTA_SELECTORES:
        try:
            span = btn.ele(sel, timeout=0.15)
            if span:
                txt = (span.text or "").strip()
                if re.match(r"^\d+[,\.]\d+$", txt):
                    return txt
        except Exception:
            continue
    return ""


def _leer_cuotas_fila(fila) -> list:
    salida = []
    for tipo_n, labels in [("Sobre", ["Sobre", "Over"]), ("Debajo", ["Debajo", "Under"])]:
        cuota_txt = ""
        for label in labels:
            try:
                btn = fila.ele(
                    f"xpath:.//button[@data-testid='fixture-outcome' and @aria-label='{label}']",
                    timeout=0.25,
                )
                if not btn:
                    continue
                cuota_txt = _leer_cuota_de_boton(btn)
                if cuota_txt:
                    break
            except Exception:
                continue
        if not cuota_txt:
            try:
                btns = fila.eles("xpath:.//button[@data-testid='fixture-outcome']")
                idx = 0 if tipo_n == "Sobre" else 1
                if len(btns) > idx:
                    cuota_txt = _leer_cuota_de_boton(btns[idx])
            except Exception:
                pass
        if cuota_txt:
            salida.append((tipo_n, cuota_txt))
    return salida


def _click_seguro(page, el) -> bool:
    try:
        _mover_mouse_jitter(page, el)
        page.actions.move_to(el).click()
        return True
    except Exception:
        try:
            el.click()
            return True
        except Exception:
            return False


def _abrir_dropdown(page, fila) -> bool:
    for sel in _DROPDOWN_SELECTORES:
        try:
            btn = fila.ele(sel, timeout=0.25)
            if not btn:
                continue
            try:
                fila.scroll.to_see()
            except Exception:
                pass
            ok = _click_seguro(page, btn)
            if ok:
                _pausa_humana(0.15, 0.15)
                return True
        except Exception:
            continue
    return False


def _opciones_dropdown(page) -> list:
    candidatos = []
    sels = [
        "xpath://*[@role='option']",
        "xpath://*[@role='listbox']//*[self::button or self::div or self::span]",
        "xpath://*[@role='menu']//*[self::button or self::div]",
        "xpath://div[contains(@class,'dropdown') or contains(@class,'popover') or contains(@class,'menu')]"
        "//*[self::button or self::div or self::span]",
        "xpath://option",
    ]
    for sel in sels:
        try:
            for el in page.eles(sel):
                txt = (el.text or "").strip()
                linea = _extraer_linea_texto(txt)
                if linea:
                    candidatos.append((linea, el))
        except Exception:
            continue
    vistos = set()
    out = []
    for linea, el in candidatos:
        if linea in vistos:
            continue
        vistos.add(linea)
        out.append((linea, el))
    return sorted(out, key=lambda x: _linea_float(x[0]) or 9999)


# ══════════════════════════════════════════════════════════════
#  HELPERS v12 — innerText + coordenadas
# ══════════════════════════════════════════════════════════════

def _snapshot_visible(page, jugador: str, mercado_texto: str) -> dict | None:
    try:
        texto = page.run_js("return document.body.innerText || '';") or ""
    except Exception:
        return None
    texto = texto.replace("\xa0", " ")
    idx = texto.lower().find(jugador.lower())
    if idx < 0:
        return None
    bloque = texto[idx : idx + 5000]
    m_mer = re.search(rf"(?im)^\s*{re.escape(mercado_texto)}\s*$", bloque)
    if not m_mer:
        return None
    sub = bloque[m_mer.end() : m_mer.end() + 600]
    flat = re.sub(r"\s+", " ", sub).strip()
    m = re.search(
        r"(?P<linea>\d{1,3}(?:[.,]\d+)?)\s+Sobre\s+(?P<over>\d+[.,]\d+)"
        r"\s+Debajo\s+(?P<under>\d+[.,]\d+)",
        flat, re.IGNORECASE,
    )
    if not m:
        return None
    return {
        "linea": m.group("linea").replace(",", "."),
        "over":  m.group("over").replace(",", "."),
        "under": m.group("under").replace(",", "."),
    }


def _abrir_dropdown_visible(page, fila) -> bool:
    try:
        fila.scroll.to_see()
    except Exception:
        pass
    time.sleep(0.06)
    ok = page.run_js(r"""
        const fila = arguments[0];
        function visible(el) {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return r.width >= 8 && r.height >= 8
                && r.bottom > 0 && r.top < window.innerHeight
                && r.right > 0 && r.left < window.innerWidth
                && cs.visibility !== 'hidden'
                && cs.display !== 'none';
        }
        const btns = fila.querySelectorAll(
            'button:not([data-testid="fixture-outcome"])'
        );
        for (const btn of btns) {
            if (!visible(btn)) continue;
            const txt = (btn.innerText || '').trim()
                .replace(/[↑↓▲▼↕\s]/g, '');
            if (!/^\d+\.?\d*$/.test(txt)) continue;
            const r = btn.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            btn.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x, clientY:y}));
            btn.dispatchEvent(new MouseEvent('mousedown',    {bubbles:true, clientX:x, clientY:y}));
            btn.dispatchEvent(new MouseEvent('mouseup',      {bubbles:true, clientX:x, clientY:y}));
            btn.dispatchEvent(new MouseEvent('click',        {bubbles:true, clientX:x, clientY:y}));
            return true;
        }
        return false;
    """, fila)
    if ok:
        time.sleep(random.uniform(0.22, 0.38))
    return bool(ok)


def _opciones_visibles_coord(page, fila, linea_principal: str) -> list:
    lp = _linea_float(linea_principal)
    if lp is None:
        return []
    result = page.run_js(r"""
        const fila      = arguments[0];
        const principal = parseFloat(String(arguments[1]).replace(',', '.'));
        let ax = 0, ay = 0;
        const btns = fila.querySelectorAll('button:not([data-testid="fixture-outcome"])');
        for (const btn of btns) {
            const cs = window.getComputedStyle(btn);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const r = btn.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) continue;
            const txt = (btn.innerText || '').trim().replace(/[↑↓▲▼↕\s]/g, '');
            if (!/^\d+\.?\d*$/.test(txt)) continue;
            ax = r.left + r.width / 2;
            ay = r.top  + r.height / 2;
            break;
        }
        if (!ax) return '[]';
        const results = [];
        const seen    = new Set();
        const maxDiff = Math.max(12, principal * 0.55);
        document.querySelectorAll('*').forEach(el => {
            if (el.closest('[data-testid="fixture-outcome"]')) return;
            if (el.children.length > 0) return;
            const r  = el.getBoundingClientRect();
            if (r.width < 6 || r.height < 6) return;
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const txt = (el.innerText || el.textContent || '')
                .trim().replace(/[↑↓▲▼↕\s]/g, '');
            if (!/^\d+\.?\d*$/.test(txt)) return;
            const val = parseFloat(txt);
            if (!Number.isFinite(val)) return;
            const cx = r.left + r.width / 2;
            const cy = r.top  + r.height / 2;
            if (Math.abs(cx - ax) > 130) return;
            if (Math.abs(cy - ay) > 650) return;
            if (Math.abs(val - principal) > maxDiff) return;
            const key = `${Math.round(cx)},${Math.round(cy)}`;
            if (seen.has(key)) return;
            seen.add(key);
            results.push({ linea: txt, x: Math.round(cx), y: Math.round(cy) });
        });
        return JSON.stringify(results);
    """, fila, str(linea_principal))
    try:
        data = json.loads(result or "[]")
    except Exception:
        return []
    seen_lines: dict = {}
    for item in data:
        lf = _linea_float(item.get("linea"))
        if lf is None:
            continue
        key = str(round(lf, 1))
        if key not in seen_lines:
            seen_lines[key] = item
    opts = list(seen_lines.values())
    opts.sort(key=lambda x: _linea_float(x.get("linea")) or 9999)
    return opts


def _click_coord(page, x: float, y: float) -> bool:
    try:
        page.actions.move_to_location(int(x), int(y)).click()
        return True
    except Exception:
        pass
    try:
        page.run_js("""
            const x = arguments[0], y = arguments[1];
            const el = document.elementFromPoint(x, y);
            if (!el) return false;
            el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX:x, clientY:y}));
            el.dispatchEvent(new MouseEvent('mousedown',     {bubbles:true, clientX:x, clientY:y}));
            el.dispatchEvent(new MouseEvent('mouseup',       {bubbles:true, clientX:x, clientY:y}));
            el.dispatchEvent(new MouseEvent('click',         {bubbles:true, clientX:x, clientY:y}));
            return true;
        """, int(x), int(y))
        return True
    except Exception:
        return False


def _orden_altlines(opciones: list, principal: str,
                    steps_abajo: int = 5, steps_arriba: int = 5) -> list:
    lp = _linea_float(principal)
    if lp is None:
        return []
    vals = sorted({
        _linea_float(op.get("linea"))
        for op in opciones
        if _linea_float(op.get("linea")) is not None
           and abs((_linea_float(op.get("linea")) or 9999) - lp) > 0.001
    })
    abajo, prev = [], lp
    for v in sorted([x for x in vals if x < lp], reverse=True):
        if abs(prev - v) > 1.51:
            break
        abajo.append(str(round(v, 1)))
        prev = v
        if len(abajo) >= steps_abajo:
            break
    arriba, prev = [], lp
    for v in sorted([x for x in vals if x > lp]):
        if abs(v - prev) > 1.51:
            break
        arriba.append(str(round(v, 1)))
        prev = v
        if len(arriba) >= steps_arriba:
            break
    out = []
    for i in range(max(len(abajo), len(arriba))):
        if i < len(abajo):
            out.append(abajo[i])
        if i < len(arriba):
            out.append(arriba[i])
    return out


def _parsear_fila(page, fila, nombre_jugador: str, nombre_partido: str,
                  fecha_partido: str = "", equipo_jugador: str = "",
                  meta_partido: dict | None = None) -> list:
    cuotas = []
    mercado_texto = ""
    for sel in _MERCADO_TEXTO_SELECTORES:
        try:
            el = fila.ele(sel, timeout=0.25)
            if el:
                mercado_texto = (el.text or "").strip()
                if mercado_texto:
                    break
        except Exception:
            continue
    if not mercado_texto:
        return []
    mercado = _normalizar_mercado(mercado_texto)
    if not mercado:
        return []
    snap = _snapshot_visible(page, nombre_jugador, mercado_texto)
    if snap:
        linea_principal = snap["linea"]
        cuotas += [
            _mk(nombre_partido, nombre_jugador, mercado, snap["linea"],
                "Sobre",  snap["over"],  fecha_partido, equipo_jugador, meta_partido, "dom"),
            _mk(nombre_partido, nombre_jugador, mercado, snap["linea"],
                "Debajo", snap["under"], fecha_partido, equipo_jugador, meta_partido, "dom"),
        ]
    else:
        linea_principal = _leer_linea_dropdown(fila)
        for tipo, cuota_txt in _leer_cuotas_fila(fila):
            cuotas.append(_mk(nombre_partido, nombre_jugador, mercado, linea_principal,
                               tipo, cuota_txt, fecha_partido, equipo_jugador, meta_partido, "dom"))
    if not CAPTURAR_ALT_LINES or not linea_principal:
        return cuotas
    if not _abrir_dropdown_visible(page, fila):
        return cuotas
    opciones = _opciones_visibles_coord(page, fila, linea_principal)
    try:
        page.actions.move_to_location(20, 20).click()
    except Exception:
        pass
    time.sleep(0.1)
    if not opciones:
        return cuotas
    targets = _orden_altlines(opciones, linea_principal)
    if not targets:
        return cuotas
    vistas = {str(c.get("linea")) for c in cuotas if c.get("linea")}
    for target in targets:
        if target in vistas:
            continue
        snap_now = _snapshot_visible(page, nombre_jugador, mercado_texto)
        linea_now = snap_now["linea"] if snap_now else linea_principal
        if not _abrir_dropdown_visible(page, fila):
            break
        opciones2 = _opciones_visibles_coord(page, fila, linea_now)
        target_opt = None
        for op in opciones2:
            if abs((_linea_float(op.get("linea")) or 9999) - (_linea_float(target) or 9998)) < 0.01:
                target_opt = op
                break
        if not target_opt:
            try:
                page.actions.move_to_location(20, 20).click()
            except Exception:
                pass
            time.sleep(0.08)
            continue
        _click_coord(page, target_opt["x"], target_opt["y"])
        time.sleep(random.uniform(0.18, 0.32))
        confirmado = False
        for _ in range(5):
            snap_alt = _snapshot_visible(page, nombre_jugador, mercado_texto)
            if snap_alt:
                lf_snap = _linea_float(snap_alt["linea"])
                lf_tgt  = _linea_float(target)
                if lf_snap is not None and lf_tgt is not None and abs(lf_snap - lf_tgt) < 0.01:
                    cuotas += [
                        _mk(nombre_partido, nombre_jugador, mercado, snap_alt["linea"],
                            "Sobre",  snap_alt["over"],  fecha_partido, equipo_jugador, meta_partido, "dom_alt"),
                        _mk(nombre_partido, nombre_jugador, mercado, snap_alt["linea"],
                            "Debajo", snap_alt["under"], fecha_partido, equipo_jugador, meta_partido, "dom_alt"),
                    ]
                    vistas.add(target)
                    confirmado = True
                    break
            time.sleep(0.1)
    return cuotas


def _mk(partido, jugador, mercado, linea, tipo, cuota, fecha="",
        equipo="", meta=None, fuente="dom") -> dict:
    meta = meta or {}
    return {
        "partido":          partido,
        "partido_original": meta.get("partido_original", ""),
        "jugador":          jugador,
        "equipo":           equipo or "",
        "equipo_local":     meta.get("equipo_local", ""),
        "equipo_visitante": meta.get("equipo_visitante", ""),
        "mercado":          mercado,
        "linea":            linea,
        "tipo":             tipo,
        "cuota":            str(cuota).replace(",", "."),
        "fuente":           fuente,
        "fecha":            fecha or meta.get("fecha", ""),
        "fecha_hora":       meta.get("fecha_hora", ""),
        "fixture_id":       meta.get("fixture_id", ""),
    }


def leer_jugadores(page, nombre_partido, fecha_partido="", meta_partido=None) -> list:
    cuotas = []
    meta_partido = meta_partido or {}
    equipo_por_jugador = extraer_equipos_jugadores(page)
    if equipo_por_jugador:
        equipos_dom = sorted({e for e in equipo_por_jugador.values() if e})
        print(f"    [meta] Equipos DOM: {', '.join(equipos_dom)}")
        # FIX v6: inyectar equipos en meta_partido para que corregir_metadata
        # pueda construir el nombre real aunque GQL no devuelva fixture exacto
        if not meta_partido.get("equipos") and equipos_dom:
            meta_partido["equipos"] = equipos_dom
        if len(equipos_dom) >= 2:
            if not meta_partido.get("equipo_local"):
                meta_partido["equipo_local"]     = equipos_dom[1]
            if not meta_partido.get("equipo_visitante"):
                meta_partido["equipo_visitante"] = equipos_dom[0]
    accs_open = abrir_accordions_jugadores(page)
    if not accs_open:
        print("    [!] No se pudieron abrir accordions")
        return []
    for acc in accs_open:
        try:
            nombre_completo = _nombre_desde_accordion(acc)
            if not nombre_completo:
                continue
            m = PAT_JUGADOR.match(nombre_completo)
            nombre_limpio = m.group(1).strip() if m else nombre_completo
            if not nombre_limpio or len(nombre_limpio) > 60:
                continue
            equipo_jugador = (equipo_por_jugador.get(nombre_limpio)
                              or equipo_por_jugador.get(nombre_completo) or "")
            filas = []
            for sel_fila in _FILA_SELECTORES:
                try:
                    filas = acc.eles(sel_fila)
                    if filas:
                        break
                except Exception:
                    continue
            nuevas = 0
            for fila in filas:
                try:
                    nuevas_fila = _parsear_fila(
                        page, fila, nombre_limpio, nombre_partido,
                        fecha_partido, equipo_jugador, meta_partido
                    )
                    cuotas.extend(nuevas_fila)
                    nuevas += len(nuevas_fila)
                except Exception:
                    continue
            estado = f"→ {nuevas} cuotas" if nuevas else "→ 0 cuotas (revisar selectores)"
            print(f"       {nombre_limpio:<30} {estado}")
        except Exception:
            continue
    return cuotas


# ══════════════════════════════════════════════════════════════
#  PARSEO GRAPHQL
# ══════════════════════════════════════════════════════════════
def _normalizar_stat_gql(stat_name: str) -> str:
    t = _norm_txt(stat_name)
    mapa = {
        "points": "Puntos",
        "rebounds": "Rebotes",
        "assists": "Asistencias",
        "threesmade": "Triples",
        "three made": "Triples",
        "3pt made": "Triples",
        "points + rebounds": "Puntos+Rebotes",
        "points+rebounds": "Puntos+Rebotes",
        "points + assists": "Puntos+Asistencias",
        "points+assists": "Puntos+Asistencias",
        "points + assists + rebounds": "PRA",
        "points+assists+rebounds": "PRA",
        "assists + rebounds": "Asistencias+Rebotes",
        "assists+rebounds": "Asistencias+Rebotes",
        "steals": "Robos",
        "blocks": "Tapones",
        "steals + blocks": "Robos+Tapones",
        "steals+blocks": "Robos+Tapones",
        "turnovers": "Perdidas",
        "personal fouls": "Faltas",
        "ft made": "TirosLibres",
        "ft attempted": "TirosLibresInt",
        "fg made": "GolesCampo",
        "fg attempted": "GolesCampoInt",
        "three attempted": "TriplesInt",
        "first quarter points": "PuntosPrimerCuarto",
        "first quarter rebounds": "RebotesPrimerCuarto",
        "first quarter assists": "AsistenciasPrimerCuarto",
        "first quarter threesmade": "TriplesPrimerCuarto",
        "first quarter three made": "TriplesPrimerCuarto",
    }
    if t in mapa:
        return mapa[t]
    return _normalizar_mercado(stat_name)


def parsear_graphql(body: dict, nombre_partido: str, fecha_partido="",
                    meta_partido=None) -> list:
    cuotas = []
    meta_partido = meta_partido or {}

    def parse_decimal(x) -> str:
        try:
            v = float(str(x).replace(",", "."))
            if 1.01 <= v <= 200:
                return str(round(v, 4))
        except Exception:
            pass
        return ""

    def leer_swish_players(slug_fixture: dict):
        if not isinstance(slug_fixture, dict):
            return
        teams = slug_fixture.get("swishGameTeams") or []
        if not isinstance(teams, list):
            return
        for team in teams:
            if not isinstance(team, dict):
                continue
            equipo = str(team.get("name") or "").strip()
            players = team.get("players") or []
            if not isinstance(players, list):
                continue
            for player in players:
                if not isinstance(player, dict):
                    continue
                jugador = str(player.get("name") or "").strip()
                if not jugador:
                    continue
                markets = player.get("markets") or []
                if not isinstance(markets, list):
                    continue
                for market in markets:
                    if not isinstance(market, dict):
                        continue
                    stat = market.get("stat") or {}
                    stat_name = str(stat.get("name") or market.get("name") or "").strip()
                    mercado = _normalizar_stat_gql(stat_name)
                    if not mercado:
                        continue
                    lines = market.get("lines") or []
                    if not isinstance(lines, list):
                        continue
                    for ln in lines:
                        if not isinstance(ln, dict):
                            continue
                        if ln.get("suspended") is True:
                            continue
                        linea = ln.get("line")
                        if linea is None or linea == "":
                            continue
                        over  = parse_decimal(ln.get("over"))
                        under = parse_decimal(ln.get("under"))
                        if over:
                            cuotas.append(_mk(
                                nombre_partido, jugador, mercado, str(linea),
                                "Sobre", over, fecha_partido,
                                equipo=equipo, meta=meta_partido, fuente="gql_alt"
                            ))
                        if under:
                            cuotas.append(_mk(
                                nombre_partido, jugador, mercado, str(linea),
                                "Debajo", under, fecha_partido,
                                equipo=equipo, meta=meta_partido, fuente="gql_alt"
                            ))

    def recorrer_swish(obj):
        if isinstance(obj, list):
            for item in obj:
                recorrer_swish(item)
            return
        if not isinstance(obj, dict):
            return
        sf = obj.get("slugFixture")
        if isinstance(sf, dict):
            leer_swish_players(sf)
        if "swishGameTeams" in obj:
            leer_swish_players(obj)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                recorrer_swish(v)

    recorrer_swish(body)

    if cuotas:
        try:
            grupos = defaultdict(set)
            for q in cuotas:
                grupos[(q.get("jugador"), q.get("mercado"))].add(str(q.get("linea")))
            multi = sum(1 for v in grupos.values() if len(v) > 1)
            if multi:
                print(f"    [GQL_ALT] {multi} grupos con lineas alternativas en GQL")
        except Exception:
            pass
        return cuotas

    mapa = _mercado_map_norm()
    mercado_keys = sorted(mapa.items(), key=lambda x: len(x[0]), reverse=True)

    def recorrer_fallback(obj, jugador_ctx="", mercado_ctx=""):
        if isinstance(obj, list):
            for item in obj:
                recorrer_fallback(item, jugador_ctx, mercado_ctx)
            return
        if not isinstance(obj, dict):
            return
        nombre = str(obj.get("name") or obj.get("title") or obj.get("label") or "")
        nombre_norm = _norm_txt(nombre)
        if nombre:
            if re.search(r'\((?:C|PF|SF|SG|PG|F|G|C/F|F/C|G/F|C-F|G-F)\)', nombre):
                jugador_ctx = nombre.strip()
            for kw, label in mercado_keys:
                if kw and kw in nombre_norm:
                    mercado_ctx = label
                    break
        precio = obj.get("price") or obj.get("odds")
        linea  = obj.get("handicap") or obj.get("line") or obj.get("points") or ""
        tipo   = str(obj.get("type") or obj.get("side") or obj.get("outcome") or "")
        if precio and mercado_ctx and jugador_ctx:
            try:
                v = float(str(precio).replace(",", "."))
                if 1.01 <= v <= 200:
                    tipo_n = (
                        "Sobre"  if any(x in tipo.lower() for x in ["over", "sobre"])
                        else "Debajo" if any(x in tipo.lower() for x in ["under", "debajo"])
                        else tipo
                    )
                    jugador_limpio = jugador_ctx.strip()
                    m_j = PAT_JUGADOR.match(jugador_limpio)
                    if m_j:
                        jugador_limpio = m_j.group(1).strip()
                    cuotas.append(_mk(
                        nombre_partido, jugador_limpio, mercado_ctx, str(linea),
                        tipo_n, str(v), fecha_partido,
                        equipo="", meta=meta_partido, fuente="gql"
                    ))
            except Exception:
                pass
        for v2 in obj.values():
            if isinstance(v2, (dict, list)):
                recorrer_fallback(v2, jugador_ctx, mercado_ctx)

    recorrer_fallback(body)
    return cuotas


# ══════════════════════════════════════════════════════════════
#  CAPTURAR PARTIDO COMPLETO  ← FIX PRINCIPAL v5
# ══════════════════════════════════════════════════════════════
def capturar_partido(page, partido: dict) -> list:
    nombre = partido["nombre"]
    url    = partido["url"]
    cuotas = []

    print(f"\n{'─'*60}")
    print(f"[→] {nombre}")
    print(f"    {url}")

    iniciar_escucha(page)
    page.get(url)
    time.sleep(PAUSA_CARGA)
    _esperar_estable(page)
    _inyectar_stealth(page)

    tab_ok = clickear_tab_jugadores(page)
    if tab_ok:
        print(f"    [✓] Tab de jugadores activado")
        time.sleep(PAUSA_TAB)
    else:
        print("    [!] Tab de jugadores no encontrado — continuando igual")
        time.sleep(1.0)

    _scroll_humano(page, n=2, delta_base=400, pausa_base=0.5)
    time.sleep(PAUSA_GQL)

    # ── FIX v7: Scoreboard del widget Sportradar — fuente más confiable ──────
    # Lee fecha en hora local y nombres de equipos directamente del HTML renderizado.
    # Tiene prioridad sobre GQL (que viene en UTC) y sobre el DOM genérico.
    meta_scoreboard = extraer_meta_desde_scoreboard(page)

    # ── Pre-leer paquetes GQL (sin parar la escucha) ─────────────────────────
    paquetes_pre = _leer_buffer_listen(page)

    meta_temp = extraer_meta_desde_gql(paquetes_pre, fallback_nombre=nombre,
                                       fallback_url=url, fixture_id_hint=partido["id"])

    # Scoreboard tiene prioridad para fecha (ya es hora local Argentina)
    # GQL tiene prioridad para nombre/equipos si el scoreboard no los tiene
    if meta_scoreboard.get("fecha"):
        meta_temp["fecha"]     = meta_scoreboard["fecha"]
        meta_temp["fecha_hora"]= meta_scoreboard.get("fecha_hora", meta_scoreboard["fecha"])
        print(f"    [meta] Fecha del scoreboard (local): {meta_scoreboard['fecha']}")
    elif not meta_temp.get("fecha"):
        fecha_dom_pre = extraer_fecha_partido(page)
        if fecha_dom_pre:
            meta_temp["fecha"] = fecha_dom_pre
            print(f"    [meta] Fecha del DOM (fallback): {fecha_dom_pre}")
    else:
        print(f"    [meta] Fecha del GQL (UTC→ART): {meta_temp['fecha']}")

    # Equipos del scoreboard si GQL no los trajo
    if not meta_temp.get("equipo_local") and meta_scoreboard.get("equipo_local"):
        meta_temp["equipo_local"]     = meta_scoreboard["equipo_local"]
        meta_temp["equipo_visitante"] = meta_scoreboard.get("equipo_visitante", "")
        meta_temp["equipos"]          = meta_scoreboard.get("equipos", [])

    nombre_real = meta_temp.get("partido_original") or nombre

    cuotas_dom = leer_jugadores(page, nombre_real,
                                meta_temp.get("fecha", ""), meta_temp)
    print(f"    [DOM] {len(cuotas_dom)} cuotas del DOM")

    # ── Leer todos los paquetes (incluyendo los de accordions) ───────────────
    paquetes = obtener_packets_capturados(page)
    print(f"    [GQL] {len(paquetes)} paquetes capturados")

    iniciar_escucha(page)

    meta_partido = extraer_meta_desde_gql(paquetes, fallback_nombre=nombre,
                                          fallback_url=url, fixture_id_hint=partido["id"])

    # FIX v7: scoreboard siempre gana para fecha (hora local)
    if meta_scoreboard.get("fecha"):
        meta_partido["fecha"]     = meta_scoreboard["fecha"]
        meta_partido["fecha_hora"]= meta_scoreboard.get("fecha_hora", meta_scoreboard["fecha"])

    # FIX v6: preservar del pre-read si el read final queda vacío
    if not meta_partido.get("fecha") and meta_temp.get("fecha"):
        meta_partido["fecha"] = meta_temp["fecha"]
        print(f"    [meta] Fecha preservada del pre-read: {meta_temp['fecha']}")
    if not meta_partido.get("equipo_local") and meta_temp.get("equipo_local"):
        meta_partido["equipo_local"]    = meta_temp["equipo_local"]
        meta_partido["equipo_visitante"]= meta_temp.get("equipo_visitante", "")
        meta_partido["equipos"]         = meta_temp.get("equipos", [])

    # Último fallback: DOM genérico
    if not meta_partido.get("fecha"):
        fecha_dom_final = extraer_fecha_partido(page)
        if fecha_dom_final:
            meta_partido["fecha"] = fecha_dom_final
            print(f"    [meta] Fecha final del DOM (último fallback): {fecha_dom_final}")

    fecha_partido = meta_partido.get("fecha") or ""
    nombre_real_final = meta_partido.get("partido_original") or nombre_real or nombre

    if nombre_real_final != nombre or fecha_partido:
        print(f"    [meta] Partido: {nombre_real_final}  |  Fecha: {fecha_partido}")

    # ── Guardar JSONs raw y parsear GQL ─────────────────────────────────────
    paq_ok = 0
    for i, res in enumerate(paquetes):
        try:
            body = res.response.body
            if not body:
                continue
            if isinstance(body, str):
                body = json.loads(body)
            if not isinstance(body, dict):
                continue
            paq_ok += 1
            ruta_raw = f"{OUTPUT_DIR}/raw/{partido['id']}_{i}.json"
            with open(ruta_raw, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
            nuevas = parsear_graphql(body, nombre_real_final, fecha_partido, meta_partido)
            cuotas.extend(nuevas)
        except Exception:
            continue

    print(f"    [GQL] {paq_ok} JSONs guardados en raw/ → {len(cuotas)} cuotas GQL")

    # FIX v6: si hay JSONs pero 0 cuotas GQL, mostrar top-keys para diagnóstico
    if paq_ok > 0 and not cuotas:
        print("    [diag_gql] 0 cuotas GQL con JSONs disponibles — top-keys de los primeros 3:")
        import glob as _glob
        raws = sorted(_glob.glob(f"{OUTPUT_DIR}/raw/{partido['id']}_*.json"))[:3]
        for ruta in raws:
            try:
                with open(ruta, encoding="utf-8") as f:
                    body_diag = json.load(f)
                if isinstance(body_diag, dict):
                    # Mostrar claves de primer nivel y de data/slugFixture si existen
                    top = list(body_diag.keys())
                    sub = {}
                    for k in ("data", "slugFixture", "fixture"):
                        if isinstance(body_diag.get(k), dict):
                            sub[k] = list(body_diag[k].keys())[:8]
                    print(f"       {os.path.basename(ruta)}: top={top[:8]}  sub={sub}")
            except Exception:
                pass
    cuotas.extend(cuotas_dom)

    cuotas, partido_final = corregir_metadata(cuotas, meta_partido)

    if not cuotas:
        print("    [!] 0 cuotas — reintentando con recarga...")
        _guardar_debug(page, partido["id"])
        iniciar_escucha(page)
        page.get(url)
        time.sleep(PAUSA_CARGA + 1)
        clickear_tab_jugadores(page)
        time.sleep(PAUSA_TAB)
        _scroll_humano(page, n=3, delta_base=450, pausa_base=0.6)
        time.sleep(PAUSA_GQL)
        paquetes2 = obtener_packets_capturados(page)
        meta2 = extraer_meta_desde_gql(paquetes2, fallback_nombre=nombre, fallback_url=url)
        cuotas_dom2 = leer_jugadores(page, nombre_real_final, fecha_partido, meta2)
        cuotas.extend(cuotas_dom2)
        print(f"    [retry] {len(cuotas_dom2)} cuotas del DOM")

    cuotas = deduplicar(cuotas)
    print(f"    [✓] Total único: {len(cuotas)} cuotas")
    return cuotas


def _guardar_debug(page, pid):
    try:
        debug_path = f"{OUTPUT_DIR}/raw/debug_{pid}.html"
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(page.html)
        print(f"    [debug] HTML guardado → {debug_path}")
        try:
            ss_path = f"{OUTPUT_DIR}/raw/debug_{pid}.png"
            page.get_screenshot(path=ss_path)
            print(f"    [debug] Screenshot → {ss_path}")
        except Exception:
            pass
    except Exception:
        pass


def corregir_metadata(cuotas: list, meta_partido: dict) -> tuple:
    meta_partido = meta_partido or {}
    equipos_dom = []
    for c in cuotas:
        eq = str(c.get("equipo") or "").strip()
        if eq and eq not in equipos_dom:
            equipos_dom.append(eq)

    # FIX v6: si no hay equipos en cuotas["equipo"], intentar sacarlos
    # de meta_partido["equipos"] que viene del DOM via extraer_equipos_jugadores
    if not equipos_dom:
        equipos_dom = [e for e in (meta_partido.get("equipos") or []) if e]

    partido_original = str(meta_partido.get("partido_original") or "").strip()
    partido_final = ""

    if partido_original and equipos_dom:
        po_norm = _norm_txt(partido_original)
        if any(_norm_txt(eq) in po_norm for eq in equipos_dom):
            partido_final = partido_original

    if not partido_final and len(equipos_dom) >= 2:
        partido_final = f"{equipos_dom[0]} - {equipos_dom[1]}"

    # FIX v6: si partido_original es el slug feo del URL (ej. "Winner Of Ec Sf1...")
    # y tenemos equipos reales, preferir los equipos reales
    if partido_final and partido_original and len(equipos_dom) >= 2:
        tiene_equipo_real = any(_norm_txt(eq) in _norm_txt(partido_final) for eq in equipos_dom)
        if not tiene_equipo_real:
            partido_final = f"{equipos_dom[0]} - {equipos_dom[1]}"

    if not partido_final:
        partido_final = partido_original or str(meta_partido.get("partido") or "").strip()
    fecha = str(meta_partido.get("fecha") or "").strip()
    fecha_hora = str(meta_partido.get("fecha_hora") or "").strip()
    if fecha and fecha_hora and not fecha_hora.startswith(fecha):
        fecha_hora = fecha
    for c in cuotas:
        if partido_final:
            c["partido"] = partido_final
        c["partido_original"] = partido_original or partido_final
        if fecha:
            c["fecha"] = fecha
        if fecha_hora:
            c["fecha_hora"] = fecha_hora
        if len(equipos_dom) >= 2:
            c["equipo_visitante"] = equipos_dom[0]
            c["equipo_local"] = equipos_dom[1]
        else:
            if c.get("equipo_local") not in equipos_dom:
                c["equipo_local"] = ""
            if c.get("equipo_visitante") not in equipos_dom:
                c["equipo_visitante"] = ""
        c["fixture_id"] = ""
    return cuotas, partido_final


# ══════════════════════════════════════════════════════════════
#  UTILS
# ══════════════════════════════════════════════════════════════
def deduplicar(cuotas: list) -> list:
    por_key = {}
    orden = []
    campos_meta = ["equipo", "equipo_local", "equipo_visitante",
                   "partido_original", "fecha", "fecha_hora", "fixture_id"]
    for c in cuotas:
        k = (c["partido"], c["jugador"], c.get("mercado", ""),
             str(c.get("linea", "")), c.get("tipo", ""), c.get("cuota", ""))
        if k not in por_key:
            por_key[k] = dict(c)
            orden.append(k)
            continue
        actual = por_key[k]
        for campo in campos_meta:
            if c.get(campo) and not actual.get(campo):
                actual[campo] = c.get(campo)
        if c.get("fuente") in ["dom", "dom_alt"] and c.get("equipo"):
            actual["fuente"] = c.get("fuente")
    return [por_key[k] for k in orden]


def guardar(cuotas: list):
    if not cuotas:
        print("\n[!] Sin cuotas para guardar.")
        print("    → Revisá los HTMLs en stake_props/raw/ para ajustar selectores.")
        return
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    ruta_json = f"{OUTPUT_DIR}/props_nba_{ts}.json"
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(cuotas, f, indent=2, ensure_ascii=False)
    ruta_csv = f"{OUTPUT_DIR}/props_nba_{ts}.csv"
    campos = ["partido", "partido_original", "fecha", "fecha_hora",
              "equipo_local", "equipo_visitante", "equipo",
              "jugador", "mercado", "linea", "tipo", "cuota", "fuente", "fixture_id"]
    with open(ruta_csv, "w", encoding="utf-8") as f:
        f.write(",".join(campos) + "\n")
        for c in cuotas:
            f.write(",".join(str(c.get(k, "")).replace(",", ";") for k in campos) + "\n")
    print(f"\n{'═'*60}")
    print(f"[✓] {len(cuotas)} cuotas guardadas")
    print(f"    JSON → {ruta_json}")
    print(f"    CSV  → {ruta_csv}")
    print("\n  Por mercado:")
    for mkt, n in Counter(c["mercado"] for c in cuotas).most_common():
        print(f"    {n:>5}  {mkt}")
    print(f"\n{'PARTIDO':<28} {'JUGADOR':<22} {'MERCADO':<18} {'LINEA':>5} {'TIPO':>7} {'CUOTA':>6}")
    print("─" * 90)
    for c in cuotas[:20]:
        print(f"{c['partido'][:27]:<28} {c['jugador'][:21]:<22} "
              f"{c.get('mercado','')[:17]:<18} {c.get('linea',''):>5} "
              f"{c.get('tipo',''):>7} {c['cuota']:>6}")
    if len(cuotas) > 20:
        print(f"  ... y {len(cuotas) - 20} más.")


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════
def main():
    page = conectar()
    if not page:
        return
    partidos = obtener_partidos(page)
    if not partidos:
        print(f"\n[!] No se encontraron partidos.")
        print(f"    URL actual: {page.url}")
        return
    todas = []
    for i, p in enumerate(partidos):
        cuotas = capturar_partido(page, p)
        todas.extend(cuotas)
        if i < len(partidos) - 1:
            t = random.uniform(*PAUSA_PARTIDO)
            print(f"    [zZz] Pausa de {t:.1f}s antes del próximo partido...")
            time.sleep(t)
    guardar(todas)


if __name__ == "__main__":
    main()
