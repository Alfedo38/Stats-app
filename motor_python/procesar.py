#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
procesar_ludo_altlines.py — v2.0

Procesa cuotas del scraper Stake para Ludo conservando líneas alternativas.

Mejoras sobre v1:
  - --include-all activa todos los mercados en un solo flag
  - Por defecto incluye MAIN + SECONDARY + DEFENSE (antes solo MAIN)
  - deduplicar_exactos: clave sin odds (Over/Under) — evita duplicados
    cuando las cuotas cambian entre runs del mismo día
  - partido_confiable: fallback a equipo_local/equipo_visitante del JSON
    cuando el nombre sigue siendo un slug placeholder ("Winner Of Ec...")
  - Validación de cuotas: Over/Under > 1.0 (filtra botones rotos)
  - procesar_viejo_formato: marcado como legacy, aún funcional
  - Reporte de partidos con nombre placeholder al final para diagnóstico
  - --dry-run: muestra resumen sin escribir CSV ni mover archivos

Uso normal (incluye main + secondary + defense):
    python3 procesar_ludo_altlines.py

Incluir todo:
    python3 procesar_ludo_altlines.py --include-all

Solo ver qué procesaría sin escribir nada:
    python3 procesar_ludo_altlines.py --dry-run

Conservar JSONs originales:
    python3 procesar_ludo_altlines.py --keep-json

Solo línea principal por jugador/stat:
    python3 procesar_ludo_altlines.py --principal-only
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import re
import shutil
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


# ============================================================
# CONFIG
# ============================================================

DEFAULT_INPUT_FOLDER  = "dumps_stake_final"
DEFAULT_OUTPUT_FOLDER = "cuotas_procesadas"
NEW_SCRAPER_FOLDER    = "stake_props"
NEW_SCRAPER_PATTERN   = "props_nba_*.json"

# Mercado del scraper → Stat compatible con subir_cuotas.py / Ludo
MERCADO_A_STAT = {
    "Puntos":              "POINTS",
    "Rebotes":             "REBOUNDS",
    "Asistencias":         "ASSISTS",
    "Triples":             "THREESMADE",
    "Puntos+Rebotes":      "POINTS+REBOUNDS",
    "Puntos+Asistencias":  "POINTS+ASSISTS",
    "PRA":                 "PRA",
    "Asistencias+Rebotes": "ASSISTS+REBOUNDS",
    "TirosLibres":         "FREETHROWSMADE",
    "TirosLibresInt":      "FREETHROWSATTEMPTED",
    "GolesCampo":          "FIELDGOALSMADE",
    "GolesCampoInt":       "FIELDGOALSATTEMPTED",
    "TriplesInt":          "THREEPOINTERSATTEMPTED",
    "Faltas":              "PERSONALFOULS",
    "Pérdidas":            "TURNOVERS",
    "Robos":               "STEALS",
    "Tapones":             "BLOCKS",
    "Robos+Tapones":       "STEALS+BLOCKS",
    "DobleDoble":          "DOUBLEDOUBLE",
    "TripleDoble":         "TRIPLEDOUBLE",
    "PuntosPrimerCuarto":       "Q1_POINTS",
    "RebotesPrimerCuarto":      "Q1_REBOUNDS",
    "AsistenciasPrimerCuarto":  "Q1_ASSISTS",
    "TriplesPrimerCuarto":      "Q1_THREESMADE",
}

MAIN_STATS = {
    "POINTS", "REBOUNDS", "ASSISTS", "THREESMADE",
    "POINTS+REBOUNDS", "POINTS+ASSISTS", "PRA", "ASSISTS+REBOUNDS",
}
SECONDARY_STATS = {
    "FREETHROWSMADE", "FREETHROWSATTEMPTED",
    "FIELDGOALSMADE", "FIELDGOALSATTEMPTED",
    "THREEPOINTERSATTEMPTED", "PERSONALFOULS", "TURNOVERS",
}
DEFENSE_STATS  = {"STEALS", "BLOCKS", "STEALS+BLOCKS"}
SPECIAL_STATS  = {"DOUBLEDOUBLE", "TRIPLEDOUBLE"}
Q1_STATS       = {"Q1_POINTS", "Q1_REBOUNDS", "Q1_ASSISTS", "Q1_THREESMADE"}

# Stats donde aplica barrera de línea principal (--principal-only)
PRINCIPAL_SAFETY_STATS = {"POINTS", "REBOUNDS", "ASSISTS", "THREESMADE"}

# Cuota mínima válida — botones rotos o deshabilitados suelen tener 0 o 1.0
MIN_CUOTA_VALIDA = 1.01

# Regex para detectar slugs placeholder de Stake
PLACEHOLDER_RE = re.compile(r"\bWinner\s+Of\b", re.IGNORECASE)


# ============================================================
# NORMALIZACIÓN
# ============================================================

def quitar_acentos(txt: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", txt)
        if unicodedata.category(c) != "Mn"
    )


def normalizar_txt(value: Any) -> str:
    txt = quitar_acentos(str(value or "").strip().lower())
    txt = txt.replace("/", "+").replace("&", "+")
    return re.sub(r"\s+", " ", txt)


def es_placeholder(nombre: Any) -> bool:
    return bool(PLACEHOLDER_RE.search(str(nombre or "")))


def partido_confiable(row: dict, fallback: str = "Desconocido") -> str:
    """
    FIX v2: si los campos partido/partido_original son slugs placeholder,
    intenta construir el nombre desde equipo_local/equipo_visitante del JSON.
    """
    for key in ("partido", "partido_original"):
        val = str(row.get(key) or "").strip()
        if val and not es_placeholder(val):
            return val

    # FIX: usar equipos del JSON si están disponibles
    local     = str(row.get("equipo_local")     or "").strip()
    visitante = str(row.get("equipo_visitante") or "").strip()
    if local and visitante:
        return f"{visitante} - {local}"
    if local:
        return local

    # Último recurso: devolver el valor aunque sea feo
    partido = str(row.get("partido") or row.get("partido_original") or "").strip()
    return partido or fallback


def fecha_confiable(row: dict, fecha_default: str) -> str:
    for key in ("fecha", "fecha_hora", "Fecha_Partido", "event_date", "date"):
        raw = str(row.get(key) or "").strip()
        if not raw:
            continue
        m = re.search(r"(\d{4}-\d{2}-\d{2})", raw)
        if m:
            return m.group(1)
    return fecha_default


def equipo_confiable(row: dict) -> str:
    return str(
        row.get("equipo") or row.get("Equipo") or row.get("team")
        or row.get("team_name") or row.get("team_abbreviation") or ""
    ).strip()


def tipo_cuota(row: dict) -> str:
    raw = normalizar_txt(row.get("tipo") or row.get("side") or row.get("label") or "")
    if "over" in raw or "sobre" in raw or "mas" in raw:
        return "over"
    if "under" in raw or "debajo" in raw or "menos" in raw:
        return "under"
    return raw


def inferir_fecha_archivo(arc: Path) -> str:
    m = re.search(r"props_nba_(\d{8})_", arc.name)
    if m:
        raw = m.group(1)
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return datetime.now().strftime("%Y-%m-%d")


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    txt = str(value).strip().replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", txt)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


# ============================================================
# MAPEO DE MERCADOS
# ============================================================

def mercado_a_stat(mercado_raw: Any) -> str | None:
    """
    Normaliza nombres de mercado del scraper a stats de Ludo.
    Primero intenta match exacto, luego fuzzy.
    """
    raw = str(mercado_raw or "").strip()
    if raw in MERCADO_A_STAT:
        return MERCADO_A_STAT[raw]

    n = normalizar_txt(raw)

    is_q1 = any(tok in n for tok in [
        "primer cuarto", "1er cuarto", "1q", "q1", "1 cuarto",
        "1st quarter", "first quarter",
    ])

    n_clean = re.sub(
        r"\b(alternativo|alternativos|alternate|alt|linea|lineas|player"
        r"|jugador|total|totales|mas de|menos de|over|under)\b",
        " ", n,
    )
    n_clean = re.sub(r"[()\[\]{}:_-]+", " ", n_clean)
    n_clean = re.sub(r"\s+", " ", n_clean).strip()

    has_pts    = any(t in n_clean for t in ["puntos", "points", "pts"])
    has_reb    = any(t in n_clean for t in ["rebotes", "rebounds", "reb", "rebs"])
    has_ast    = any(t in n_clean for t in ["asistencias", "assists", "assist", "ast"])
    has_three  = any(t in n_clean for t in ["triples", "threes", "3pt", "3pm", "three pointers made"])
    has_steals = any(t in n_clean for t in ["robos", "steals", "stl"])
    has_blocks = any(t in n_clean for t in ["tapones", "blocks", "blk"])

    if is_q1:
        if has_pts:   return "Q1_POINTS"
        if has_reb:   return "Q1_REBOUNDS"
        if has_ast:   return "Q1_ASSISTS"
        if has_three: return "Q1_THREESMADE"

    if re.search(r"\bp\s*\+\s*r\s*\+\s*a\b", n_clean) or "pra" in n_clean:
        return "PRA"

    if has_pts and has_reb and has_ast: return "PRA"
    if has_pts and has_reb:             return "POINTS+REBOUNDS"
    if has_pts and has_ast:             return "POINTS+ASSISTS"
    if has_reb and has_ast:             return "ASSISTS+REBOUNDS"
    if has_steals and has_blocks:       return "STEALS+BLOCKS"

    if has_pts:    return "POINTS"
    if has_reb:    return "REBOUNDS"
    if has_ast:    return "ASSISTS"
    if has_three:
        if any(t in n_clean for t in ["intent", "attempt", "attempted", "3pa"]):
            return "THREEPOINTERSATTEMPTED"
        return "THREESMADE"
    if has_steals: return "STEALS"
    if has_blocks: return "BLOCKS"

    if any(t in n_clean for t in ["tiros libres", "free throws made", "ftm"]):
        return "FREETHROWSMADE"
    if any(t in n_clean for t in ["libres intent", "free throws attempted", "fta"]):
        return "FREETHROWSATTEMPTED"
    if any(t in n_clean for t in ["goles campo intent", "field goals attempted", "fga"]):
        return "FIELDGOALSATTEMPTED"
    if any(t in n_clean for t in ["goles campo", "field goals made", "fgm"]):
        return "FIELDGOALSMADE"
    if any(t in n_clean for t in ["perdidas", "turnovers", "tov"]):
        return "TURNOVERS"
    if any(t in n_clean for t in ["faltas", "personal fouls", "pf"]):
        return "PERSONALFOULS"
    if "doble doble" in n_clean or "double double" in n_clean:
        return "DOUBLEDOUBLE"
    if "triple doble" in n_clean or "triple double" in n_clean:
        return "TRIPLEDOUBLE"

    return None


# ============================================================
# FILTROS
# ============================================================

def stat_permitido(stat: str, args: argparse.Namespace) -> bool:
    """
    FIX v2: por defecto incluye MAIN + SECONDARY + DEFENSE.
    --include-all activa todo en un solo flag.
    Q1 y especiales siguen siendo opt-in.
    """
    if getattr(args, "include_all", False):
        return True
    if stat in MAIN_STATS:
        return True
    # FIX: secondary y defense activos por defecto (no requieren flag)
    if stat in SECONDARY_STATS:
        return True if not getattr(args, "exclude_secondary", False) else False
    if stat in DEFENSE_STATS:
        return True if not getattr(args, "exclude_defense", False) else False
    if stat in SPECIAL_STATS:
        return bool(args.include_specials)
    if stat in Q1_STATS:
        return bool(args.include_q1)
    return False


def aplicar_barrera_principal(registros: list[dict], enabled: bool = False) -> list[dict]:
    """Conserva una sola línea por jugador/stat. Solo activo con --principal-only."""
    if not enabled:
        return registros

    grupos: dict[tuple, list[dict]] = defaultdict(list)
    salida: list[dict] = []

    for r in registros:
        stat = r.get("Stat", "")
        if stat in PRINCIPAL_SAFETY_STATS:
            k = (r.get("Fecha_Partido"), r.get("Partido"), r.get("Jugador"), stat)
            grupos[k].append(r)
        else:
            salida.append(r)

    filtradas = 0
    for _, rows in grupos.items():
        if len(rows) == 1:
            salida.append(rows[0])
            continue
        stat = rows[0].get("Stat", "")
        if stat == "THREESMADE":
            elegido = sorted(rows, key=lambda x: abs(float(x.get("Linea", 0)) - 2.5))[0]
        else:
            elegido = sorted(rows, key=lambda x: float(x.get("Linea", 0)), reverse=True)[0]
        salida.append(elegido)
        filtradas += len(rows) - 1

    if filtradas:
        print(f"🧹 Modo principal-only: {filtradas} líneas alternativas descartadas")

    return salida


# ============================================================
# DEDUPLICACIÓN
# ============================================================

def deduplicar_exactos(registros: list[dict]) -> list[dict]:
    """
    FIX v2: clave sin Over/Under para evitar duplicados cuando las cuotas
    cambian entre runs del mismo día. Se queda con el último registro
    (el más reciente, ya que los archivos se procesan en orden cronológico).
    """
    vistos: dict[tuple, dict] = {}
    for r in registros:
        key = (
            r.get("Fecha_Partido"),
            r.get("Partido"),
            r.get("Jugador"),
            r.get("Stat"),
            float(r.get("Linea", 0)),
        )
        vistos[key] = r  # sobreescribe: el último gana
    return list(vistos.values())


# ============================================================
# PROCESADOR — FORMATO NUEVO (scraper v4+)
# ============================================================

def procesar_nuevo_formato(
    archivos: list[Path], args: argparse.Namespace
) -> tuple[list[dict], list[Path], list[Path]]:
    registros: list[dict]   = []
    usados:    list[Path]   = []
    sin_data:  list[Path]   = []

    for arc in archivos:
        try:
            data = json.loads(arc.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠️  {arc.name}: error de lectura ({e})")
            sin_data.append(arc)
            continue

        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            sin_data.append(arc)
            continue

        # Verificar que es formato nuevo (tiene campo "tipo" y "cuota")
        if "tipo" not in data[0] and "cuota" not in data[0]:
            sin_data.append(arc)
            continue

        fecha_default = inferir_fecha_archivo(arc)
        # key → {over, under, meta}
        grupos: dict[tuple, dict] = defaultdict(
            lambda: {"over": None, "under": None,
                     "fecha": "", "partido": "", "equipo": "",
                     "equipo_local": "", "equipo_visitante": ""}
        )
        mercados_no_mapeados: Counter = Counter()
        cuotas_invalidas = 0

        for row in data:
            jugador    = str(row.get("jugador") or row.get("player_name") or row.get("player") or "").strip()
            mercado_raw= str(row.get("mercado") or row.get("Stat") or row.get("market") or "").strip()
            linea      = row.get("linea") or row.get("Linea") or row.get("line")
            tipo       = tipo_cuota(row)
            cuota      = to_float(row.get("cuota") or row.get("odds") or row.get("price"))
            partido    = partido_confiable(row, fallback="")
            equipo     = equipo_confiable(row)
            fecha      = fecha_confiable(row, fecha_default)
            eq_local   = str(row.get("equipo_local")     or "").strip()
            eq_visit   = str(row.get("equipo_visitante") or "").strip()

            if not jugador or not mercado_raw or linea is None or cuota is None:
                continue

            # FIX v2: validar cuota > MIN_CUOTA_VALIDA
            if cuota <= MIN_CUOTA_VALIDA:
                cuotas_invalidas += 1
                continue

            stat = mercado_a_stat(mercado_raw)
            if not stat:
                mercados_no_mapeados[mercado_raw] += 1
                continue
            if not stat_permitido(stat, args):
                continue

            linea_f = to_float(linea)
            if linea_f is None:
                continue

            clave = (fecha, partido, jugador, equipo, stat, linea_f)
            grupos[clave]["fecha"]           = fecha
            grupos[clave]["partido"]         = partido
            grupos[clave]["equipo"]          = equipo
            grupos[clave]["equipo_local"]    = eq_local
            grupos[clave]["equipo_visitante"]= eq_visit

            if tipo == "over":
                grupos[clave]["over"]  = cuota
            elif tipo == "under":
                grupos[clave]["under"] = cuota

        filas = 0
        incompletas = 0
        for (fecha, partido, jugador, equipo, stat, linea_f), vals in grupos.items():
            over  = vals["over"]
            under = vals["under"]
            # FIX v2: verificar ambas cuotas válidas antes de agregar
            if over is None or under is None:
                incompletas += 1
                continue
            if over <= MIN_CUOTA_VALIDA or under <= MIN_CUOTA_VALIDA:
                incompletas += 1
                continue

            # Nombre del partido — segundo intento usando equipos del grupo
            nombre_partido = partido
            if not nombre_partido or es_placeholder(nombre_partido):
                el = vals.get("equipo_local", "")
                ev = vals.get("equipo_visitante", "")
                if el and ev:
                    nombre_partido = f"{ev} - {el}"
                elif el:
                    nombre_partido = el

            registros.append({
                "Fecha_Partido": fecha,
                "Partido":       nombre_partido or "Desconocido",
                "Jugador":       jugador,
                "Equipo":        equipo,
                "Stat":          stat,
                "Linea":         linea_f,
                "Over":          round(over, 2),
                "Under":         round(under, 2),
            })
            filas += 1

        if filas:
            usados.append(arc)
            extras = []
            if incompletas:      extras.append(f"incompletas={incompletas}")
            if cuotas_invalidas: extras.append(f"cuotas_invalidas={cuotas_invalidas}")
            if mercados_no_mapeados:
                extras.append(f"no_mapeados={len(mercados_no_mapeados)}")
            print(f"📦 {arc.name}: {filas} filas"
                  + (f"  [{', '.join(extras)}]" if extras else ""))
            if mercados_no_mapeados and args.debug_unmapped:
                print("   Mercados no mapeados:")
                for m, n in mercados_no_mapeados.most_common(15):
                    print(f"      {m!r}: {n}")
        else:
            sin_data.append(arc)
            print(f"⚠️  {arc.name}: sin filas útiles")
            if mercados_no_mapeados and args.debug_unmapped:
                print("   Mercados no mapeados:")
                for m, n in mercados_no_mapeados.most_common(15):
                    print(f"      {m!r}: {n}")

    return registros, usados, sin_data


# ============================================================
# PROCESADOR — FORMATO VIEJO (legacy swishGameTeams)
# ============================================================

def _extraer_info_partido_legacy(obj: Any) -> dict:
    info = {"partido": "Desconocido", "fecha": "Desconocida", "equipos": []}
    if not isinstance(obj, dict):
        return info
    fixture = obj.get("slugFixture") or obj.get("fixture")
    if fixture:
        info["partido"] = fixture.get("name") or "Desconocido"
        data_match  = fixture.get("data", {}) or {}
        competitors = data_match.get("competitors", []) or []
        if info["partido"] == "Desconocido" and competitors:
            nombres = [c.get("name") for c in competitors if c.get("name")]
            info["partido"] = " - ".join(nombres) if nombres else "Desconocido"
            info["equipos"] = nombres
        raw_time = data_match.get("startTime") or fixture.get("startTime")
        if raw_time:
            try:
                from datetime import timezone, timedelta
                dt_utc = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00"))
                dt_art = dt_utc.astimezone(timezone(timedelta(hours=-3)))
                info["fecha"] = dt_art.strftime("%Y-%m-%d")
            except Exception:
                m = re.search(r"(\d{4}-\d{2}-\d{2})", str(raw_time))
                info["fecha"] = m.group(1) if m else str(raw_time)
        return info
    for v in obj.values():
        if isinstance(v, (dict, list)):
            res = _extraer_info_partido_legacy(v)
            if res["partido"] != "Desconocido":
                return res
    return info


def _buscar_swish_data(obj: Any) -> Any:
    if isinstance(obj, dict):
        if "swishGameTeams" in obj:
            return obj["swishGameTeams"]
        for v in obj.values():
            res = _buscar_swish_data(v)
            if res:
                return res
    elif isinstance(obj, list):
        for item in obj:
            res = _buscar_swish_data(item)
            if res:
                return res
    return None


def procesar_viejo_formato(
    archivos: list[Path], args: argparse.Namespace
) -> tuple[list[dict], list[Path], list[Path]]:
    """
    Legacy: procesa JSONs con estructura swishGameTeams (scraper v1-v3).
    Los JSONs del scraper actual (v4+) tienen top=['data']['stats'] y no
    contienen props — esta función los ignora correctamente.
    """
    registros: list[dict] = []
    usados:    list[Path] = []
    sin_data:  list[Path] = []

    for arc in archivos:
        try:
            data = json.loads(arc.read_text(encoding="utf-8"))
        except Exception:
            sin_data.append(arc)
            continue

        meta       = _extraer_info_partido_legacy(data)
        teams_data = _buscar_swish_data(data)
        if not teams_data:
            sin_data.append(arc)
            continue

        usados.append(arc)
        print(f"📦 [legacy] {meta['partido']} ({meta['fecha']})")

        for team in teams_data:
            equipo = team.get("name", "")
            for player in team.get("players", []):
                jugador = player.get("name", "")
                for market in player.get("markets", []):
                    stat_raw = str(market.get("stat", {}).get("name", ""))
                    stat = mercado_a_stat(stat_raw) or stat_raw.upper()
                    if not stat_permitido(stat, args):
                        continue
                    for line in market.get("lines", []):
                        if line.get("suspended"):
                            continue
                        linea = to_float(line.get("line", 0.5))
                        over  = to_float(line.get("over"))
                        under = to_float(line.get("under"))
                        if linea is None or over is None or under is None:
                            continue
                        if over <= MIN_CUOTA_VALIDA or under <= MIN_CUOTA_VALIDA:
                            continue
                        registros.append({
                            "Fecha_Partido": meta["fecha"],
                            "Partido":       meta["partido"],
                            "Jugador":       jugador,
                            "Equipo":        equipo,
                            "Stat":          stat,
                            "Linea":         linea,
                            "Over":          round(over, 2),
                            "Under":         round(under, 2),
                        })

    return registros, usados, sin_data


# ============================================================
# REPORTES
# ============================================================

def reportar_alt_lines(registros: list[dict], max_rows: int = 25) -> None:
    grupos: dict[tuple, set[float]] = defaultdict(set)
    for r in registros:
        try:
            linea = float(r.get("Linea", 0))
        except Exception:
            continue
        key = (r.get("Fecha_Partido"), r.get("Partido"), r.get("Jugador"), r.get("Stat"))
        grupos[key].add(linea)

    multi = [(k, sorted(v)) for k, v in grupos.items() if len(v) > 1]
    multi.sort(key=lambda kv: len(kv[1]), reverse=True)

    print(f"\n🎚️  Alt lines — grupos con más de una línea: {len(multi)}")
    if not multi:
        print("   ⚠️  No aparecieron alt lines. Si Stake las muestra en pantalla,")
        print("       revisá que CAPTURAR_ALT_LINES=True en el scraper.")
        return
    for (fecha, partido, jugador, stat), lineas in multi[:max_rows]:
        lineas_txt = ", ".join(f"{x:g}" for x in lineas)
        print(f"   {jugador:<24} {stat:<18} {len(lineas):>2} líneas: {lineas_txt}")
    if len(multi) > max_rows:
        print(f"   ... y {len(multi) - max_rows} grupos más.")


def reportar_partidos_placeholder(registros: list[dict]) -> None:
    """Avisa si quedaron partidos con nombre placeholder en el CSV final."""
    placeholders = {
        r.get("Partido") for r in registros
        if es_placeholder(r.get("Partido", ""))
    }
    if not placeholders:
        return
    print(f"\n⚠️  Partidos con nombre placeholder ({len(placeholders)}):")
    for p in sorted(placeholders):
        n = sum(1 for r in registros if r.get("Partido") == p)
        print(f"   {p!r} → {n} cuotas")
    print("   Revisá que el scraper esté corriendo la v7+ para corregir esto.")


# ============================================================
# GESTIÓN DE ARCHIVOS
# ============================================================

def unique_destination(dest_dir: Path, filename: str) -> Path:
    dest = dest_dir / filename
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    i = 1
    while True:
        candidate = dest_dir / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def mover_o_borrar(
    archivos: list[Path], base: Path, subcarpeta: str,
    borrar: bool, keep: bool, dry_run: bool = False,
) -> None:
    if not archivos:
        return
    if keep or dry_run:
        print(f"   📁 {len(archivos)} JSON de {subcarpeta} conservados en {base}/")
        return
    if borrar:
        borrados = sum(1 for arc in archivos if _try_unlink(arc))
        print(f"   🗑️  {borrados} JSON de {subcarpeta} borrados")
        return
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_dir = base / subcarpeta / ts
    archive_dir.mkdir(parents=True, exist_ok=True)
    movidos = sum(1 for arc in archivos if _try_move(arc, archive_dir))
    print(f"   📦 {movidos} JSON de {subcarpeta} archivados → {archive_dir}")


def _try_unlink(arc: Path) -> bool:
    try:
        arc.unlink()
        return True
    except Exception as e:
        print(f"      ⚠️  No pude borrar {arc.name}: {e}")
        return False


def _try_move(arc: Path, dest_dir: Path) -> bool:
    try:
        shutil.move(str(arc), str(unique_destination(dest_dir, arc.name)))
        return True
    except Exception as e:
        print(f"      ⚠️  No pude mover {arc.name}: {e}")
        return False


# ============================================================
# MAIN PIPELINE
# ============================================================

def procesar_y_guardar(args: argparse.Namespace) -> Path | None:
    input_path  = Path(args.input_folder)
    output_path = Path(args.output_folder)
    nuevo_path  = Path(args.new_folder)

    output_path.mkdir(parents=True, exist_ok=True)
    input_path.mkdir(parents=True, exist_ok=True)
    nuevo_path.mkdir(parents=True, exist_ok=True)

    candidatos_nuevos = sorted(nuevo_path.glob(NEW_SCRAPER_PATTERN))
    candidatos_viejos = [Path(p) for p in sorted(glob.glob(str(input_path / "*.json")))]

    if args.mode == "new":
        archivos_nuevos, archivos_viejos = candidatos_nuevos, []
    elif args.mode == "old":
        archivos_nuevos, archivos_viejos = [], candidatos_viejos
    elif args.mode == "both":
        archivos_nuevos, archivos_viejos = candidatos_nuevos, candidatos_viejos
    else:  # auto
        archivos_nuevos = candidatos_nuevos
        archivos_viejos = [] if candidatos_nuevos else candidatos_viejos

    print("=" * 60)
    print("🏀 LUDO — PROCESADOR DE CUOTAS STAKE")
    print("=" * 60)
    print(f"   Modo:        {args.mode}")
    print(f"   Alt lines:   {'SOLO PRINCIPAL' if args.principal_only else 'CONSERVAR TODAS'}")
    print(f"   Q1:          {'✓' if args.include_q1 or args.include_all else '✗'}")
    print(f"   Especiales:  {'✓' if args.include_specials or args.include_all else '✗'}")
    print(f"   Dry run:     {'✓' if args.dry_run else '✗'}")
    print(f"   Nuevos:      {len(archivos_nuevos)} archivos en {nuevo_path}/")
    print(f"   Viejos:      {len(archivos_viejos)} archivos en {input_path}/")
    print()

    if not archivos_nuevos and not archivos_viejos:
        print("[-] No hay archivos para procesar.")
        return None

    registros: list[dict] = []
    usados_nuevos = sin_data_nuevos = []
    usados_viejos = sin_data_viejos = []

    if archivos_nuevos:
        regs, usados_nuevos, sin_data_nuevos = procesar_nuevo_formato(archivos_nuevos, args)
        registros.extend(regs)

    if archivos_viejos:
        regs, usados_viejos, sin_data_viejos = procesar_viejo_formato(archivos_viejos, args)
        registros.extend(regs)

    antes_dedup = len(registros)
    registros   = deduplicar_exactos(registros)
    duplicados  = antes_dedup - len(registros)

    registros = aplicar_barrera_principal(registros, enabled=args.principal_only)

    print()
    print("📊 Resumen:")
    print(f"   JSON nuevos usados:   {len(usados_nuevos)}")
    print(f"   JSON viejos usados:   {len(usados_viejos)}")
    print(f"   JSON sin data:        {len(sin_data_nuevos) + len(sin_data_viejos)}")
    print(f"   Duplicados removidos: {duplicados}")
    print(f"   Líneas finales:       {len(registros)}")

    if not registros:
        print("[-] Sin datos válidos. No se genera CSV.")
        mover_o_borrar(sin_data_nuevos, nuevo_path, "descartados",
                       args.delete_discarded_json, args.keep_json, args.dry_run)
        return None

    # Distribución por stat
    counts = Counter(r.get("Stat", "") for r in registros)
    print("\n📌 Distribución por Stat:")
    for stat, n in counts.most_common():
        bar = "█" * min(n // 20, 30)
        print(f"   {stat:<26} {n:>5}  {bar}")

    reportar_alt_lines(registros)
    reportar_partidos_placeholder(registros)

    if args.dry_run:
        print("\n🧪 DRY RUN: no se escribe CSV ni se mueven archivos.")
        return None

    # Escribir CSV
    ts       = datetime.now().strftime("%Y%m%d_%H%M")
    csv_file = output_path / f"lineas_nba_{ts}.csv"
    campos   = ["Fecha_Partido", "Partido", "Jugador", "Equipo",
                "Stat", "Linea", "Over", "Under"]

    with csv_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        writer.writerows(registros)

    print(f"\n[+] CSV generado: {csv_file.resolve()}")

    # Gestionar archivos fuente
    mover_o_borrar(usados_nuevos,   nuevo_path,  "procesados",  args.delete_used_json,      args.keep_json)
    mover_o_borrar(sin_data_nuevos, nuevo_path,  "descartados", args.delete_discarded_json, args.keep_json or args.keep_discarded_json)
    mover_o_borrar(usados_viejos,   input_path,  "procesados",  args.delete_used_json,      args.keep_json)
    mover_o_borrar(sin_data_viejos, input_path,  "descartados", args.delete_discarded_json, args.keep_json or args.keep_discarded_json)

    return csv_file


# ============================================================
# ARGS
# ============================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Procesar dumps Stake a CSV conservando alt lines.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python3 procesar_ludo_altlines.py                    # main+secondary+defense
  python3 procesar_ludo_altlines.py --include-all      # todo
  python3 procesar_ludo_altlines.py --include-q1       # agrega Q1
  python3 procesar_ludo_altlines.py --dry-run          # solo preview
  python3 procesar_ludo_altlines.py --principal-only   # una línea por jugador/stat
        """,
    )

    # Rutas
    parser.add_argument("--input-folder",  default=DEFAULT_INPUT_FOLDER)
    parser.add_argument("--output-folder", default=DEFAULT_OUTPUT_FOLDER)
    parser.add_argument("--new-folder",    default=NEW_SCRAPER_FOLDER)

    # Modo de procesamiento
    parser.add_argument("--mode", choices=["auto", "new", "old", "both"], default="auto",
                        help="auto: usa nuevos si hay, viejos si no. (default: auto)")

    # Mercados incluidos
    grp = parser.add_argument_group("mercados")
    grp.add_argument("--include-all",       action="store_true",
                     help="Incluye TODOS los mercados (main+secondary+defense+specials+Q1).")
    grp.add_argument("--exclude-secondary", action="store_true",
                     help="Excluye FT, FGA, 3PA, faltas y pérdidas (incluidos por defecto).")
    grp.add_argument("--exclude-defense",   action="store_true",
                     help="Excluye robos, tapones y stocks (incluidos por defecto).")
    grp.add_argument("--include-specials",  action="store_true",
                     help="Incluye doble-doble y triple-doble.")
    grp.add_argument("--include-q1",        action="store_true",
                     help="Incluye mercados de primer cuarto (Q1_*).")

    # Alt lines
    parser.add_argument("--principal-only", action="store_true",
                        help="Descarta alt lines, conserva solo la línea principal.")

    # Gestión de archivos
    parser.add_argument("--keep-json",              action="store_true",
                        help="No mover ni borrar ningún JSON.")
    parser.add_argument("--keep-discarded-json",    action="store_true")
    parser.add_argument("--delete-used-json",       action="store_true")
    parser.add_argument("--delete-discarded-json",  action="store_true")

    # Diagnóstico
    parser.add_argument("--dry-run",       action="store_true",
                        help="Muestra resumen sin escribir CSV ni mover archivos.")
    parser.add_argument("--debug-unmapped", action="store_true",
                        help="Muestra mercados que no pudieron mapearse.")

    # Compatibilidad con versión anterior
    parser.add_argument("--include-secondary", action="store_true",
                        help="[deprecated] Secondary incluido por defecto. Flag ignorado.")
    parser.add_argument("--include-defense",   action="store_true",
                        help="[deprecated] Defense incluido por defecto. Flag ignorado.")
    parser.add_argument("--no-principal-safety", action="store_true",
                        help="[deprecated] Sin efecto.")

    args = parser.parse_args()

    if args.keep_json and (args.delete_used_json or args.delete_discarded_json):
        parser.error("No podés combinar --keep-json con opciones de borrado.")

    return args


def main() -> int:
    args = parse_args()
    result = procesar_y_guardar(args)
    return 0 if result or args.dry_run else 1


if __name__ == "__main__":
    raise SystemExit(main())