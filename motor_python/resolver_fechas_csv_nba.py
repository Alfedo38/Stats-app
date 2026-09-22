#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
resolver_fechas_csv_nba.py — v2.0

Resuelve y corrige automáticamente las fechas de un CSV de cuotas NBA
consultando el calendario oficial de ESPN.

Mejoras sobre v1:
  - requests.Session() con reintentos automáticos (no más fallas silenciosas)
  - Matching de equipos con múltiples estrategias:
      1. Nombre completo normalizado
      2. Nombre de ciudad / apodo solo
      3. Abreviatura de 2-3 letras
  - Diccionario de aliases NBA completo (abreviaturas, ciudades, apodos)
  - Backup con timestamp — no sobreescribe backups anteriores
  - --dry-run: muestra qué cambiaría sin tocar el CSV
  - Validación de start_date (no acepta fechas absurdas)
  - Reporte de partidos sin resolver con diagnóstico de equipos detectados
  - --no-backup: no genera backup si ya tenés control de versiones

Uso:
    python3 resolver_fechas_csv_nba.py --file cuotas_procesadas/lineas_nba_*.csv
    python3 resolver_fechas_csv_nba.py --file ... --dry-run
    python3 resolver_fechas_csv_nba.py --file ... --days 7 --start-date 2026-05-19
"""

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"

# ── Límites de seguridad ─────────────────────────────────────────────────────
MAX_DAYS     = 30   # no buscar más de 30 días
MIN_DATE     = dt.date(2020, 1, 1)
MAX_DATE_ADV = 60   # no buscar más de 60 días en el futuro


def _norm_key(s: str) -> str:
    """Normaliza para lookup en _ALIAS_LOOKUP."""
    s = str(s or '').lower()
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return ' '.join(s.split())


# ============================================================
# ALIASES NBA — nombre completo, ciudad, apodo, abreviatura
# ============================================================
# Cada entry: alias_normalizado → nombre canónico
# El nombre canónico debe coincidir con lo que devuelve ESPN en displayName.

_NBA_ALIASES_RAW: dict[str, str] = {
    # Atlanta Hawks
    "atlanta hawks": "Atlanta Hawks", "hawks": "Atlanta Hawks", "atl": "Atlanta Hawks",
    # Boston Celtics
    "boston celtics": "Boston Celtics", "celtics": "Boston Celtics", "bos": "Boston Celtics",
    # Brooklyn Nets
    "brooklyn nets": "Brooklyn Nets", "nets": "Brooklyn Nets", "bkn": "Brooklyn Nets", "bk": "Brooklyn Nets",
    # Charlotte Hornets
    "charlotte hornets": "Charlotte Hornets", "hornets": "Charlotte Hornets", "cha": "Charlotte Hornets",
    # Chicago Bulls
    "chicago bulls": "Chicago Bulls", "bulls": "Chicago Bulls", "chi": "Chicago Bulls",
    # Cleveland Cavaliers
    "cleveland cavaliers": "Cleveland Cavaliers", "cavaliers": "Cleveland Cavaliers",
    "cavs": "Cleveland Cavaliers", "cle": "Cleveland Cavaliers", "cleveland": "Cleveland Cavaliers",
    # Dallas Mavericks
    "dallas mavericks": "Dallas Mavericks", "mavericks": "Dallas Mavericks",
    "mavs": "Dallas Mavericks", "dal": "Dallas Mavericks",
    # Denver Nuggets
    "denver nuggets": "Denver Nuggets", "nuggets": "Denver Nuggets", "den": "Denver Nuggets",
    # Detroit Pistons
    "detroit pistons": "Detroit Pistons", "pistons": "Detroit Pistons", "det": "Detroit Pistons",
    # Golden State Warriors
    "golden state warriors": "Golden State Warriors", "warriors": "Golden State Warriors",
    "gsw": "Golden State Warriors", "gs": "Golden State Warriors",
    # Houston Rockets
    "houston rockets": "Houston Rockets", "rockets": "Houston Rockets", "hou": "Houston Rockets",
    # Indiana Pacers
    "indiana pacers": "Indiana Pacers", "pacers": "Indiana Pacers", "ind": "Indiana Pacers",
    # LA Clippers
    "la clippers": "LA Clippers", "clippers": "LA Clippers", "lac": "LA Clippers",
    "los angeles clippers": "LA Clippers",
    # Los Angeles Lakers
    "los angeles lakers": "Los Angeles Lakers", "lakers": "Los Angeles Lakers",
    "lal": "Los Angeles Lakers", "la lakers": "Los Angeles Lakers",
    # Memphis Grizzlies
    "memphis grizzlies": "Memphis Grizzlies", "grizzlies": "Memphis Grizzlies",
    "mem": "Memphis Grizzlies",
    # Miami Heat
    "miami heat": "Miami Heat", "heat": "Miami Heat", "mia": "Miami Heat",
    # Milwaukee Bucks
    "milwaukee bucks": "Milwaukee Bucks", "bucks": "Milwaukee Bucks", "mil": "Milwaukee Bucks",
    # Minnesota Timberwolves
    "minnesota timberwolves": "Minnesota Timberwolves", "timberwolves": "Minnesota Timberwolves",
    "wolves": "Minnesota Timberwolves", "min": "Minnesota Timberwolves",
    # New Orleans Pelicans
    "new orleans pelicans": "New Orleans Pelicans", "pelicans": "New Orleans Pelicans",
    "nop": "New Orleans Pelicans", "no": "New Orleans Pelicans",
    # New York Knicks
    "new york knicks": "New York Knicks", "knicks": "New York Knicks",
    "nyk": "New York Knicks", "ny": "New York Knicks", "new york": "New York Knicks",
    # Oklahoma City Thunder
    "oklahoma city thunder": "Oklahoma City Thunder", "thunder": "Oklahoma City Thunder",
    "okc": "Oklahoma City Thunder", "oklahoma city": "Oklahoma City Thunder",
    # Orlando Magic
    "orlando magic": "Orlando Magic", "magic": "Orlando Magic", "orl": "Orlando Magic",
    # Philadelphia 76ers
    "philadelphia 76ers": "Philadelphia 76ers", "76ers": "Philadelphia 76ers",
    "sixers": "Philadelphia 76ers", "phi": "Philadelphia 76ers", "phila": "Philadelphia 76ers",
    # Phoenix Suns
    "phoenix suns": "Phoenix Suns", "suns": "Phoenix Suns", "phx": "Phoenix Suns",
    "phoenix": "Phoenix Suns",
    # Portland Trail Blazers
    "portland trail blazers": "Portland Trail Blazers", "trail blazers": "Portland Trail Blazers",
    "blazers": "Portland Trail Blazers", "por": "Portland Trail Blazers",
    # Sacramento Kings
    "sacramento kings": "Sacramento Kings", "kings": "Sacramento Kings", "sac": "Sacramento Kings",
    # San Antonio Spurs
    "san antonio spurs": "San Antonio Spurs", "spurs": "San Antonio Spurs",
    "sas": "San Antonio Spurs", "sa": "San Antonio Spurs", "san antonio": "San Antonio Spurs",
    # Toronto Raptors
    "toronto raptors": "Toronto Raptors", "raptors": "Toronto Raptors", "tor": "Toronto Raptors",
    # Utah Jazz
    "utah jazz": "Utah Jazz", "jazz": "Utah Jazz", "uta": "Utah Jazz",
    # Washington Wizards
    "washington wizards": "Washington Wizards", "wizards": "Washington Wizards",
    "was": "Washington Wizards", "wsh": "Washington Wizards",
}

# Normalizar claves para lookup
_ALIAS_LOOKUP: dict[str, str] = {
    _norm_key(k): v for k, v in _NBA_ALIASES_RAW.items()
}


def _norm_key(s: str) -> str:
    """Normaliza para lookup en _ALIAS_LOOKUP."""
    s = str(s or "").lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(s.split())


# Reconstruir con la función definida
_ALIAS_LOOKUP = {_norm_key(k): v for k, v in _NBA_ALIASES_RAW.items()}


def norm(s: str) -> str:
    """
    Normalización para matching de nombres de equipo.
    Más conservadora que v1: no elimina espacios internos para
    que "new york" != "newyork".
    """
    s = str(s or "").lower()
    # Quitar acentos
    import unicodedata
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(s.split())


def canonizar_equipo(nombre: str) -> str:
    """
    Intenta convertir un nombre de equipo (cualquier forma) a su nombre
    canónico de ESPN usando el diccionario de aliases.
    Devuelve el nombre normalizado si no encuentra match.
    """
    n = norm(nombre)
    # Primero match exacto
    if n in _ALIAS_LOOKUP:
        return norm(_ALIAS_LOOKUP[n])
    # Luego match por tokens: si algún token del alias está en n
    for alias_norm, canonical in _ALIAS_LOOKUP.items():
        tokens = alias_norm.split()
        if len(tokens) <= 2 and all(t in n.split() for t in tokens):
            return norm(canonical)
    return n


def tokens_equipo(nombre: str) -> set[str]:
    """
    Extrae tokens significativos del nombre de un equipo
    (descarta palabras genéricas como "of", "the", etc.).
    """
    stopwords = {"of", "the", "and", "de", "los", "las", "el", "la"}
    return {t for t in norm(nombre).split() if t not in stopwords and len(t) > 1}


# ============================================================
# HTTP CON REINTENTOS
# ============================================================

def _make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; ludo-scheduler/2.0)"})
    return session


# ============================================================
# FETCH SCHEDULE ESPN
# ============================================================

def fetch_nba_schedule(start_date: dt.date, days: int = 14) -> list[dict]:
    """
    Descarga el calendario NBA desde ESPN para el rango de fechas indicado.

    Usa requests.Session con reintentos automáticos.
    Si un día falla después de reintentos, lo loguea y continúa.

    Retorna lista de dicts:
      [{"fecha": "YYYY-MM-DD", "home": "...", "away": "...",
        "home_norm": "...", "away_norm": "...",
        "home_tokens": set, "away_tokens": set}]
    """
    session = _make_session()
    eventos: list[dict] = []
    errores = 0

    for i in range(days):
        d = start_date + dt.timedelta(days=i)
        ymd = d.strftime("%Y%m%d")
        fecha_iso = d.strftime("%Y-%m-%d")

        try:
            r = session.get(ESPN_URL, params={"dates": ymd}, timeout=15)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"   ⚠️  ESPN {fecha_iso}: {e}")
            errores += 1
            continue

        n_encontrados = 0
        for ev in data.get("events", []):
            comps = (ev.get("competitions", [{}])[0].get("competitors", []))
            home = away = ""
            for c in comps:
                team = c.get("team", {}) or {}
                name = team.get("displayName") or team.get("name") or ""
                ha = str(c.get("homeAway") or "").lower()
                if ha == "home":
                    home = name
                elif ha == "away":
                    away = name

            if home and away:
                eventos.append({
                    "fecha":       fecha_iso,
                    "home":        home,
                    "away":        away,
                    "home_norm":   canonizar_equipo(home),
                    "away_norm":   canonizar_equipo(away),
                    "home_tokens": tokens_equipo(home),
                    "away_tokens": tokens_equipo(away),
                })
                n_encontrados += 1

        if n_encontrados:
            print(f"   📅 {fecha_iso}: {n_encontrados} partido(s)")

    if errores:
        print(f"   ⚠️  {errores}/{days} días con error de ESPN")

    return eventos


# ============================================================
# MATCHING
# ============================================================

def _match_equipo(nombre_partido: str, equipo_norm: str, equipo_tokens: set[str]) -> bool:
    """
    True si el equipo (dado por nombre normalizado + tokens) aparece
    en el nombre del partido.

    Estrategia:
    1. Match exacto de nombre canónico completo
    2. Match de todos los tokens significativos del equipo
    3. Match de alias cortos (abreviatura de 2-3 letras)
    """
    p = norm(nombre_partido)
    p_tokens = set(p.split())

    # 1. Nombre canónico completo en el partido
    if equipo_norm in p:
        return True

    # 2. Todos los tokens del equipo están en el partido
    if equipo_tokens and equipo_tokens.issubset(p_tokens):
        return True

    # 3. Alias cortos: buscar en _ALIAS_LOOKUP si algún alias de 2-3 chars matchea
    for alias, canonical in _ALIAS_LOOKUP.items():
        if len(alias) <= 3 and norm(canonical) == equipo_norm:
            if alias in p_tokens:
                return True

    return False


def resolver_fecha_partido(partido: str, schedule: list[dict]) -> tuple[str | None, str | None]:
    """
    Retorna (fecha_ISO, descripcion_match) o (None, None).

    Descripcion_match: "home=Cleveland Cavaliers away=New York Knicks" para diagnóstico.
    """
    for ev in schedule:
        home_ok = _match_equipo(partido, ev["home_norm"], ev["home_tokens"])
        away_ok = _match_equipo(partido, ev["away_norm"], ev["away_tokens"])

        if home_ok and away_ok:
            return ev["fecha"], f"{ev['away']} @ {ev['home']}"

    return None, None


# ============================================================
# VALIDACIÓN
# ============================================================

def validar_start_date(s: str) -> dt.date:
    try:
        d = dt.datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise argparse.ArgumentTypeError(f"Formato inválido: {s!r}. Usá YYYY-MM-DD.")

    hoy = dt.date.today()
    if d < MIN_DATE:
        raise argparse.ArgumentTypeError(f"Fecha muy antigua: {d}. Mínimo: {MIN_DATE}")
    if d > hoy + dt.timedelta(days=MAX_DATE_ADV):
        raise argparse.ArgumentTypeError(f"Fecha muy futura: {d}. Máximo: {hoy + dt.timedelta(days=MAX_DATE_ADV)}")
    return d


# ============================================================
# BACKUP CON TIMESTAMP
# ============================================================

def _backup_path(path: Path) -> Path:
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    return path.with_suffix(f".backup_{ts}.csv")


# ============================================================
# MAIN
# ============================================================

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Resolver fechas NBA en CSV usando calendario ESPN.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python3 resolver_fechas_csv_nba.py                   # auto-detecta el CSV más reciente
  python3 resolver_fechas_csv_nba.py --file cuotas_procesadas/lineas_nba_20260519_1420.csv
  python3 resolver_fechas_csv_nba.py --dry-run
  python3 resolver_fechas_csv_nba.py --days 7 --start-date 2026-05-19
        """,
    )
    ap.add_argument("--file",       default="",                            help="CSV lineas_nba_*.csv. Si no se indica, usa el más reciente de cuotas_procesadas/.")
    ap.add_argument("--input-dir",  default="cuotas_procesadas",           help="Carpeta donde buscar CSVs (default: cuotas_procesadas/).")
    ap.add_argument("--days",       type=int,   default=14,                help="Días de calendario a consultar (máx 30)")
    ap.add_argument("--start-date", type=validar_start_date,
                    default=dt.date.today().strftime("%Y-%m-%d"),          help="Fecha inicio búsqueda (YYYY-MM-DD)")
    ap.add_argument("--dry-run",    action="store_true",                   help="Muestra cambios sin modificar el CSV")
    ap.add_argument("--no-backup",  action="store_true",                   help="No genera backup del CSV original")
    args = ap.parse_args()

    # Validar días
    days = min(args.days, MAX_DAYS)
    if days != args.days:
        print(f"⚠️  --days reducido a {MAX_DAYS} (máximo permitido)")

    # Parsear start_date si viene como string (cuando no se usa type=)
    start = args.start_date if isinstance(args.start_date, dt.date) else \
            dt.datetime.strptime(args.start_date, "%Y-%m-%d").date()

    # Auto-detectar CSV si no se especificó
    if args.file:
        path = Path(args.file)
        if not path.exists():
            print(f"❌ No existe: {path}")
            return 1
    else:
        input_dir = Path(args.input_dir)
        candidatos = sorted(input_dir.glob("lineas_nba_*.csv"),
                            key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidatos:
            print(f"❌ No encontré CSVs lineas_nba_*.csv en {input_dir.resolve()}")
            print("   Pasá la ruta con --file o verificá que el procesador haya generado el CSV.")
            return 1
        path = candidatos[0]
        print(f"📂 CSV auto-detectado: {path}")

    df = pd.read_csv(path)
    if "Fecha_Partido" not in df.columns or "Partido" not in df.columns:
        print("❌ El CSV no tiene columnas Fecha_Partido / Partido.")
        return 1

    print("=" * 60)
    print("📅 RESOLVER FECHAS NBA — v2.0")
    print("=" * 60)
    print(f"   Archivo:    {path}")
    print(f"   Filas:      {len(df)}")
    print(f"   Partidos:   {df['Partido'].nunique()}")
    print(f"   Rango ESPN: {start} → {start + dt.timedelta(days=days-1)}")
    print(f"   Dry run:    {'✓' if args.dry_run else '✗'}")
    print()

    print("📡 Consultando calendario ESPN...")
    schedule = fetch_nba_schedule(start, days=days)

    if not schedule:
        print("❌ No se pudo obtener el calendario ESPN. Verificá la conexión.")
        return 1

    print(f"\n✅ {len(schedule)} partidos en el calendario")

    # Resolver
    cambios      = 0
    sin_resolver: list[str] = []
    resueltos:    list[tuple[str, str, str]] = []  # (partido, fecha_vieja, fecha_nueva)

    for partido in sorted(df["Partido"].dropna().unique()):
        fecha_ok, match_desc = resolver_fecha_partido(partido, schedule)

        if not fecha_ok:
            sin_resolver.append(partido)
            continue

        mask = df["Partido"] == partido
        fechas_actuales = sorted(df.loc[mask, "Fecha_Partido"].astype(str).unique())

        if fechas_actuales != [fecha_ok]:
            fecha_vieja = fechas_actuales[0] if len(fechas_actuales) == 1 else str(fechas_actuales)
            resueltos.append((partido, fecha_vieja, fecha_ok))
            cambios += int(mask.sum())
            if not args.dry_run:
                df.loc[mask, "Fecha_Partido"] = fecha_ok
        else:
            # Ya está correcto
            resueltos.append((partido, fecha_ok, fecha_ok))

    # Reporte de cambios
    print(f"\n{'🧪 DRY RUN — ' if args.dry_run else ''}Resultado:")
    print(f"   Partidos resueltos:    {len(resueltos)}")
    print(f"   Partidos sin resolver: {len(sin_resolver)}")
    print(f"   Filas a modificar:     {cambios}")

    if resueltos:
        print("\n📋 Partidos resueltos:")
        for partido, f_vieja, f_nueva in resueltos:
            cambio = " ← CAMBIO" if f_vieja != f_nueva else ""
            print(f"   {partido[:40]:<40}  {f_vieja} → {f_nueva}{cambio}")

    if sin_resolver:
        print(f"\n⚠️  Partidos sin resolver ({len(sin_resolver)}):")
        for p in sin_resolver:
            p_norm = norm(p)
            # Mostrar qué equipos se detectaron en el nombre
            detectados = []
            for alias_norm, canonical in _ALIAS_LOOKUP.items():
                if alias_norm in p_norm or any(t in p_norm.split() for t in alias_norm.split()):
                    detectados.append(canonical)
            detectados = list(dict.fromkeys(detectados))[:4]
            diag = f"  (equipos detectados: {', '.join(detectados)})" if detectados else "  (ningún equipo reconocido)"
            print(f"   {p!r}{diag}")
        print()
        print("   Tip: si el nombre del partido es un slug placeholder (ej: 'Winner Of Ec Sf1'),")
        print("   corré primero el scraper v7+ que ya lo corrige en origen.")

    if args.dry_run:
        print("\n🧪 DRY RUN: no se modificó ningún archivo.")
        return 0

    if cambios == 0:
        print("\n✅ No hubo cambios. El CSV ya tiene fechas correctas.")
        return 0

    # Backup con timestamp
    if not args.no_backup:
        backup = _backup_path(path)
        path.rename(backup)
        print(f"\n📦 Backup: {backup}")
    else:
        print("\n📁 --no-backup: sin backup")

    df.to_csv(path, index=False)
    print(f"💾 CSV actualizado: {path}")

    # Resumen final
    print("\n📊 Distribución final:")
    resumen = df.groupby(["Fecha_Partido", "Partido"]).size().reset_index(name="cuotas")
    print(resumen.to_string(index=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())