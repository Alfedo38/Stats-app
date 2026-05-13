#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
procesar_ludo_altlines.py

Procesa cuotas de Stake para Ludo conservando líneas alternativas reales.

Diferencia clave vs procesar_ludo_fix.py:
- Por defecto NO descarta líneas alternativas.
- Solo deja una línea principal si usás --principal-only.
- Normaliza mejor nombres de mercados alternativos.
- Genera un reporte de grupos con varias líneas por jugador/stat para verificar si el scraper realmente las trajo.

Uso normal:
    python3 procesar_ludo_altlines.py

Uso recomendado para probar sin mover JSON:
    python3 procesar_ludo_altlines.py --mode new --keep-json

Si querés volver al comportamiento viejo:
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


DEFAULT_INPUT_FOLDER = "dumps_stake_final"
DEFAULT_OUTPUT_FOLDER = "cuotas_procesadas"
NEW_SCRAPER_FOLDER = "stake_props"
NEW_SCRAPER_PATTERN = "props_nba_*.json"

# Mercado del scraper -> Stat compatible con subir_cuotas.py / Ludo
MERCADO_A_STAT = {
    "Puntos": "POINTS",
    "Rebotes": "REBOUNDS",
    "Asistencias": "ASSISTS",
    "Triples": "THREESMADE",
    "Puntos+Rebotes": "POINTS+REBOUNDS",
    "Puntos+Asistencias": "POINTS+ASSISTS",
    "PRA": "PRA",
    "Asistencias+Rebotes": "ASSISTS+REBOUNDS",

    # Secundarios full game
    "TirosLibres": "FREETHROWSMADE",
    "TirosLibresInt": "FREETHROWSATTEMPTED",
    "GolesCampo": "FIELDGOALSMADE",
    "GolesCampoInt": "FIELDGOALSATTEMPTED",
    "TriplesInt": "THREEPOINTERSATTEMPTED",
    "Faltas": "PERSONALFOULS",
    "Pérdidas": "TURNOVERS",

    # Defensa / especiales
    "Robos": "STEALS",
    "Tapones": "BLOCKS",
    "Robos+Tapones": "STEALS+BLOCKS",
    "DobleDoble": "DOUBLEDOUBLE",
    "TripleDoble": "TRIPLEDOUBLE",

    # Q1: NO son full game. Por defecto se descartan.
    "PuntosPrimerCuarto": "Q1_POINTS",
    "RebotesPrimerCuarto": "Q1_REBOUNDS",
    "AsistenciasPrimerCuarto": "Q1_ASSISTS",
    "TriplesPrimerCuarto": "Q1_THREESMADE",
}

MAIN_STATS = {
    "POINTS", "REBOUNDS", "ASSISTS", "THREESMADE",
    "POINTS+REBOUNDS", "POINTS+ASSISTS", "PRA", "ASSISTS+REBOUNDS",
}

SECONDARY_STATS = {
    "FREETHROWSMADE", "FREETHROWSATTEMPTED",
    "FIELDGOALSMADE", "FIELDGOALSATTEMPTED",
    "THREEPOINTERSATTEMPTED",
    "PERSONALFOULS", "TURNOVERS",
}

DEFENSE_STATS = {"STEALS", "BLOCKS", "STEALS+BLOCKS"}
SPECIAL_STATS = {"DOUBLEDOUBLE", "TRIPLEDOUBLE"}
Q1_STATS = {"Q1_POINTS", "Q1_REBOUNDS", "Q1_ASSISTS", "Q1_THREESMADE"}

# Solo se usa si pasás --principal-only.
PRINCIPAL_SAFETY_STATS = {"POINTS", "REBOUNDS", "ASSISTS", "THREESMADE"}


def quitar_acentos(txt: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", txt)
        if unicodedata.category(c) != "Mn"
    )


def normalizar_txt(value: Any) -> str:
    txt = quitar_acentos(str(value or "").strip().lower())
    txt = txt.replace("/", "+").replace("&", "+")
    txt = re.sub(r"\s+", " ", txt)
    return txt


def mercado_a_stat(mercado_raw: Any) -> str | None:
    """
    Normaliza mercados del scraper nuevo.
    Soporta nombres con 'alternativo', 'alt line', paréntesis, etc.
    """
    raw = str(mercado_raw or "").strip()
    if raw in MERCADO_A_STAT:
        return MERCADO_A_STAT[raw]

    n = normalizar_txt(raw)

    # Q1 primero para no confundir con full game.
    is_q1 = any(tok in n for tok in [
        "primer cuarto", "1er cuarto", "1q", "q1", "1 cuarto", "1st quarter", "first quarter"
    ])

    # Limpieza de palabras frecuentes en mercados alternativos.
    n_clean = re.sub(
        r"\b(alternativo|alternativos|alternate|alt|linea|lineas|player|jugador|total|totales|mas de|menos de|over|under)\b",
        " ",
        n,
    )
    n_clean = re.sub(r"[()\[\]{}:_-]+", " ", n_clean)
    n_clean = re.sub(r"\s+", " ", n_clean).strip()

    # Combinados
    has_pts = any(tok in n_clean for tok in ["puntos", "points", "pts"])
    has_reb = any(tok in n_clean for tok in ["rebotes", "rebounds", "reb", "rebs"])
    has_ast = any(tok in n_clean for tok in ["asistencias", "assists", "assist", "ast"])
    has_three = any(tok in n_clean for tok in ["triples", "threes", "3pt", "3pm", "three pointers made"])
    has_steals = any(tok in n_clean for tok in ["robos", "steals", "stl"])
    has_blocks = any(tok in n_clean for tok in ["tapones", "blocks", "blk"])

    if is_q1:
        if has_pts:
            return "Q1_POINTS"
        if has_reb:
            return "Q1_REBOUNDS"
        if has_ast:
            return "Q1_ASSISTS"
        if has_three:
            return "Q1_THREESMADE"

    # PRA explícito
    if re.search(r"\bp\s*\+\s*r\s*\+\s*a\b", n_clean) or "pra" in n_clean:
        return "PRA"

    if has_pts and has_reb and has_ast:
        return "PRA"
    if has_pts and has_reb:
        return "POINTS+REBOUNDS"
    if has_pts and has_ast:
        return "POINTS+ASSISTS"
    if has_reb and has_ast:
        return "ASSISTS+REBOUNDS"
    if has_steals and has_blocks:
        return "STEALS+BLOCKS"

    # Simples
    if has_pts:
        return "POINTS"
    if has_reb:
        return "REBOUNDS"
    if has_ast:
        return "ASSISTS"
    if has_three:
        # Si el nombre dice intentados/attempted, no es 3PM.
        if any(tok in n_clean for tok in ["intent", "attempt", "attempted", "3pa"]):
            return "THREEPOINTERSATTEMPTED"
        return "THREESMADE"
    if has_steals:
        return "STEALS"
    if has_blocks:
        return "BLOCKS"

    if any(tok in n_clean for tok in ["tiros libres", "free throws made", "ftm"]):
        return "FREETHROWSMADE"
    if any(tok in n_clean for tok in ["libres intent", "free throws attempted", "fta"]):
        return "FREETHROWSATTEMPTED"
    if any(tok in n_clean for tok in ["goles campo intent", "field goals attempted", "fga"]):
        return "FIELDGOALSATTEMPTED"
    if any(tok in n_clean for tok in ["goles campo", "field goals made", "fgm"]):
        return "FIELDGOALSMADE"
    if any(tok in n_clean for tok in ["perdidas", "turnovers", "tov"]):
        return "TURNOVERS"
    if any(tok in n_clean for tok in ["faltas", "personal fouls", "pf"]):
        return "PERSONALFOULS"
    if "doble doble" in n_clean or "double double" in n_clean:
        return "DOUBLEDOUBLE"
    if "triple doble" in n_clean or "triple double" in n_clean:
        return "TRIPLEDOUBLE"

    return None


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
    if not txt:
        return None

    # Soporta formatos tipo "17+", "17.5", "Over 17.5", "+17.5".
    m = re.search(r"-?\d+(?:\.\d+)?", txt)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


PLACEHOLDER_PARTIDO_RE = re.compile(r"\bWinner\s+Of\b", re.IGNORECASE)


def es_partido_placeholder(nombre: Any) -> bool:
    return bool(PLACEHOLDER_PARTIDO_RE.search(str(nombre or "")))


def partido_confiable(row: dict, fallback: str = "Desconocido") -> str:
    partido = str(row.get("partido") or row.get("Partido") or "").strip()
    partido_original = str(row.get("partido_original") or "").strip()

    if partido and not es_partido_placeholder(partido):
        return partido
    if partido_original and not es_partido_placeholder(partido_original):
        return partido_original
    return partido or partido_original or fallback


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
        row.get("equipo")
        or row.get("Equipo")
        or row.get("team")
        or row.get("team_name")
        or row.get("team_abbreviation")
        or ""
    ).strip()


def stat_permitido(stat: str, args: argparse.Namespace) -> bool:
    if stat in MAIN_STATS:
        return True
    if stat in SECONDARY_STATS:
        return bool(args.include_secondary)
    if stat in DEFENSE_STATS:
        return bool(args.include_defense)
    if stat in SPECIAL_STATS:
        return bool(args.include_specials)
    if stat in Q1_STATS:
        return bool(args.include_q1)
    return False


def aplicar_barrera_principal(registros: list[dict], enabled: bool = False) -> list[dict]:
    """Conserva una sola línea por jugador/stat. Solo usar con --principal-only."""
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


def mover_o_borrar(archivos: list[Path], base: Path, subcarpeta: str, borrar: bool, keep: bool) -> None:
    if keep:
        print(f"📁 Se conservan {len(archivos)} JSON de {subcarpeta} en {base}/")
        return
    if not archivos:
        return
    if borrar:
        borrados = 0
        for arc in archivos:
            try:
                arc.unlink()
                borrados += 1
            except Exception as e:
                print(f"⚠️ No pude borrar {arc}: {e}")
        print(f"🗑️ JSON {subcarpeta} borrados: {borrados}")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_dir = base / subcarpeta / ts
    archive_dir.mkdir(parents=True, exist_ok=True)
    movidos = 0
    for arc in archivos:
        try:
            dest = unique_destination(archive_dir, arc.name)
            shutil.move(str(arc), str(dest))
            movidos += 1
        except Exception as e:
            print(f"⚠️ No pude mover {arc}: {e}")
    print(f"📦 JSON {subcarpeta} archivados en {archive_dir}: {movidos}")


def tipo_cuota(row: dict) -> str:
    raw = normalizar_txt(row.get("tipo") or row.get("side") or row.get("label") or "")
    if raw in {"sobre", "over", "mas", "mas de", "+"} or "over" in raw or "sobre" in raw or "mas" in raw:
        return "over"
    if raw in {"debajo", "under", "menos", "menos de", "-"} or "under" in raw or "debajo" in raw or "menos" in raw:
        return "under"
    return raw


def procesar_nuevo_formato(archivos: list[Path], args: argparse.Namespace) -> tuple[list[dict], list[Path], list[Path]]:
    registros: list[dict] = []
    usados: list[Path] = []
    sin_data: list[Path] = []

    for arc in archivos:
        try:
            data = json.loads(arc.read_text(encoding="utf-8"))
        except Exception:
            sin_data.append(arc)
            continue

        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            sin_data.append(arc)
            continue

        # Formato nuevo esperado: lista de cuotas con jugador/mercado/linea/tipo/cuota.
        if "tipo" not in data[0] and "cuota" not in data[0]:
            sin_data.append(arc)
            continue

        fecha_default = inferir_fecha_archivo(arc)
        grupos = defaultdict(lambda: {"over": None, "under": None, "fecha": "", "partido": "", "equipo": ""})
        mercados_no_mapeados = Counter()

        for row in data:
            jugador = str(row.get("jugador") or row.get("Jugador") or row.get("player_name") or row.get("player") or "").strip()
            mercado_raw = str(row.get("mercado") or row.get("Stat") or row.get("market") or row.get("prop") or "").strip()
            linea = row.get("linea") or row.get("Linea") or row.get("line") or row.get("threshold")
            tipo = tipo_cuota(row)
            cuota = to_float(row.get("cuota") or row.get("odds") or row.get("price"))
            partido = partido_confiable(row)
            equipo = equipo_confiable(row)
            fecha = fecha_confiable(row, fecha_default)

            if not jugador or not mercado_raw or linea is None or cuota is None:
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
            grupos[clave]["fecha"] = fecha
            grupos[clave]["partido"] = partido
            grupos[clave]["equipo"] = equipo

            if tipo == "over":
                grupos[clave]["over"] = cuota
            elif tipo == "under":
                grupos[clave]["under"] = cuota

        filas = 0
        incompletas = 0
        for (fecha, partido, jugador, equipo, stat, linea_f), vals in grupos.items():
            over = vals["over"]
            under = vals["under"]
            if over is None or under is None:
                incompletas += 1
                continue
            registros.append({
                "Fecha_Partido": fecha,
                "Partido": partido,
                "Jugador": jugador,
                "Equipo": equipo,
                "Stat": stat,
                "Linea": linea_f,
                "Over": round(over, 2),
                "Under": round(under, 2),
            })
            filas += 1

        if filas:
            usados.append(arc)
            extra = []
            if incompletas:
                extra.append(f"incompletas={incompletas}")
            if mercados_no_mapeados:
                extra.append(f"mercados_no_mapeados={len(mercados_no_mapeados)}")
            extra_txt = f" | {' | '.join(extra)}" if extra else ""
            print(f"📦 {arc.name}: {filas} filas útiles{extra_txt}")
            if mercados_no_mapeados and args.debug_unmapped:
                print("   Mercados no mapeados top:")
                for m, n in mercados_no_mapeados.most_common(15):
                    print(f"    - {m!r}: {n}")
        else:
            sin_data.append(arc)
            print(f"⚠️ {arc.name}: sin filas útiles después de filtros")
            if mercados_no_mapeados and args.debug_unmapped:
                print("   Mercados no mapeados top:")
                for m, n in mercados_no_mapeados.most_common(15):
                    print(f"    - {m!r}: {n}")

    return registros, usados, sin_data


def extraer_info_partido(obj: Any) -> dict:
    info = {"partido": "Desconocido", "fecha": "Desconocida", "equipos": []}
    if not isinstance(obj, dict):
        return info

    fixture = obj.get("slugFixture") or obj.get("fixture")
    if fixture:
        info["partido"] = fixture.get("name") or "Desconocido"
        data_match = fixture.get("data", {}) or {}
        competitors = data_match.get("competitors", []) or []
        if info["partido"] == "Desconocido" and competitors:
            nombres = [c.get("name") for c in competitors if c.get("name")]
            info["partido"] = " - ".join(nombres) if nombres else "Desconocido"
            info["equipos"] = nombres
        raw_time = data_match.get("startTime") or fixture.get("startTime")
        if raw_time:
            try:
                dt = datetime.strptime(raw_time, "%a, %d %b %Y %H:%M:%S %Z")
                info["fecha"] = dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                info["fecha"] = raw_time
        return info

    for v in obj.values():
        if isinstance(v, (dict, list)):
            res = extraer_info_partido(v)
            if res["partido"] != "Desconocido":
                return res
    return info


def buscar_swish_data(obj: Any) -> Any:
    if isinstance(obj, dict):
        if "swishGameTeams" in obj:
            return obj["swishGameTeams"]
        for v in obj.values():
            res = buscar_swish_data(v)
            if res:
                return res
    elif isinstance(obj, list):
        for item in obj:
            res = buscar_swish_data(item)
            if res:
                return res
    return None


def procesar_viejo_formato(archivos: list[Path], args: argparse.Namespace) -> tuple[list[dict], list[Path], list[Path]]:
    registros: list[dict] = []
    usados: list[Path] = []
    sin_data: list[Path] = []

    for arc in archivos:
        try:
            data = json.loads(arc.read_text(encoding="utf-8"))
        except Exception:
            sin_data.append(arc)
            continue

        meta = extraer_info_partido(data)
        teams_data = buscar_swish_data(data)
        if not teams_data:
            sin_data.append(arc)
            continue

        usados.append(arc)
        print(f"📦 Extrayendo datos viejos de: {meta['partido']} ({meta['fecha']})")

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
                        over = to_float(line.get("over"))
                        under = to_float(line.get("under"))
                        if linea is None or over is None or under is None:
                            continue
                        registros.append({
                            "Fecha_Partido": meta["fecha"],
                            "Partido": meta["partido"],
                            "Jugador": jugador,
                            "Equipo": equipo,
                            "Stat": stat,
                            "Linea": linea,
                            "Over": round(over, 2),
                            "Under": round(under, 2),
                        })

    return registros, usados, sin_data


def deduplicar_exactos(registros: list[dict]) -> list[dict]:
    vistos = set()
    out = []
    for r in registros:
        key = (
            r.get("Fecha_Partido"), r.get("Partido"), r.get("Jugador"),
            r.get("Equipo"), r.get("Stat"), float(r.get("Linea", 0)),
            float(r.get("Over", 0)), float(r.get("Under", 0)),
        )
        if key in vistos:
            continue
        vistos.add(key)
        out.append(r)
    return out


def reportar_alt_lines(registros: list[dict], max_rows: int = 25) -> None:
    grupos: dict[tuple, set[float]] = defaultdict(set)
    for r in registros:
        try:
            linea = float(r.get("Linea"))
        except Exception:
            continue
        key = (r.get("Fecha_Partido"), r.get("Partido"), r.get("Jugador"), r.get("Stat"))
        grupos[key].add(linea)

    multi = [(k, sorted(v)) for k, v in grupos.items() if len(v) > 1]
    multi.sort(key=lambda kv: len(kv[1]), reverse=True)

    print("\n🎚️ Reporte alt lines:")
    print(f"   Grupos jugador/stat con más de una línea: {len(multi)}")

    if not multi:
        print("   ⚠️ No aparecieron alt lines en los JSON procesados.")
        print("   Si Stake las muestra en pantalla, el scraper stake.py todavía no las está guardando en stake_props/props_nba_*.json.")
        return

    print(f"   Top {min(max_rows, len(multi))}:")
    for (fecha, partido, jugador, stat), lineas in multi[:max_rows]:
        lineas_txt = ", ".join(f"{x:g}" for x in lineas)
        print(f"   - {jugador:<24} {stat:<18} {len(lineas):>2} líneas: {lineas_txt}")


def procesar_y_guardar(args: argparse.Namespace) -> Path | None:
    input_path = Path(args.input_folder)
    output_path = Path(args.output_folder)
    nuevo_path = Path(args.new_folder)
    output_path.mkdir(parents=True, exist_ok=True)
    input_path.mkdir(parents=True, exist_ok=True)
    nuevo_path.mkdir(parents=True, exist_ok=True)

    candidatos_nuevos = sorted(nuevo_path.glob(NEW_SCRAPER_PATTERN))
    candidatos_viejos = [Path(p) for p in glob.glob(str(input_path / "*.json"))]

    if args.mode == "new":
        archivos_nuevos, archivos_viejos = candidatos_nuevos, []
    elif args.mode == "old":
        archivos_nuevos, archivos_viejos = [], candidatos_viejos
    elif args.mode == "both":
        archivos_nuevos, archivos_viejos = candidatos_nuevos, candidatos_viejos
    else:  # auto seguro
        archivos_nuevos = candidatos_nuevos
        archivos_viejos = [] if candidatos_nuevos else candidatos_viejos

    print("📌 Modo:", args.mode)
    print(f"   Nuevos a procesar: {len(archivos_nuevos)} ({nuevo_path}/)")
    print(f"   Viejos a procesar: {len(archivos_viejos)} ({input_path}/)")
    print(f"   Alt lines: {'CONSERVAR' if not args.principal_only else 'DESCARTAR, solo principal'}")

    registros: list[dict] = []
    usados_nuevos: list[Path] = []
    sin_data_nuevos: list[Path] = []
    usados_viejos: list[Path] = []
    sin_data_viejos: list[Path] = []

    if archivos_nuevos:
        regs, usados_nuevos, sin_data_nuevos = procesar_nuevo_formato(archivos_nuevos, args)
        registros.extend(regs)

    if archivos_viejos:
        regs, usados_viejos, sin_data_viejos = procesar_viejo_formato(archivos_viejos, args)
        registros.extend(regs)

    antes_dedup = len(registros)
    registros = deduplicar_exactos(registros)
    duplicados = antes_dedup - len(registros)

    registros = aplicar_barrera_principal(registros, enabled=args.principal_only)

    print("\n📊 Resumen:")
    print(f"   JSON nuevos usados:   {len(usados_nuevos)}")
    print(f"   JSON viejos usados:   {len(usados_viejos)}")
    print(f"   JSON sin data:        {len(sin_data_nuevos) + len(sin_data_viejos)}")
    print(f"   Duplicados exactos:   {duplicados}")
    print(f"   Líneas finales CSV:   {len(registros)}")

    if registros:
        counts = Counter(r.get("Stat", "") for r in registros)
        print("\n📌 Distribución por Stat:")
        for stat, n in counts.most_common():
            print(f"   {stat:<22} {n}")
        reportar_alt_lines(registros)

    if not registros:
        print("[-] No se encontró data válida. No se genera CSV.")
        mover_o_borrar(sin_data_nuevos, nuevo_path, "descartados", args.delete_discarded_json, args.keep_json or args.keep_discarded_json)
        mover_o_borrar(sin_data_viejos, input_path, "descartados", args.delete_discarded_json, args.keep_json or args.keep_discarded_json)
        return None

    ts = datetime.now().strftime("%Y%m%d_%H%M")
    csv_file = output_path / f"lineas_nba_{ts}.csv"
    with csv_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Fecha_Partido", "Partido", "Jugador", "Equipo", "Stat", "Linea", "Over", "Under"])
        writer.writeheader()
        writer.writerows(registros)

    print(f"\n[+] CSV creado: {csv_file}")

    mover_o_borrar(usados_nuevos, nuevo_path, "procesados", args.delete_used_json, args.keep_json)
    mover_o_borrar(sin_data_nuevos, nuevo_path, "descartados", args.delete_discarded_json, args.keep_json or args.keep_discarded_json)
    mover_o_borrar(usados_viejos, input_path, "procesados", args.delete_used_json, args.keep_json)
    mover_o_borrar(sin_data_viejos, input_path, "descartados", args.delete_discarded_json, args.keep_json or args.keep_discarded_json)

    return csv_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Procesar dumps Stake a CSV conservando alt lines reales.")
    parser.add_argument("--input-folder", default=DEFAULT_INPUT_FOLDER)
    parser.add_argument("--output-folder", default=DEFAULT_OUTPUT_FOLDER)
    parser.add_argument("--new-folder", default=NEW_SCRAPER_FOLDER)
    parser.add_argument("--mode", choices=["auto", "new", "old", "both"], default="auto")
    parser.add_argument("--keep-json", action="store_true")
    parser.add_argument("--keep-discarded-json", action="store_true")
    parser.add_argument("--delete-used-json", action="store_true")
    parser.add_argument("--delete-discarded-json", action="store_true")
    parser.add_argument("--include-secondary", action="store_true", help="Incluye FT, FGA, 3PA, faltas y pérdidas.")
    parser.add_argument("--include-defense", action="store_true", help="Incluye robos, tapones y stocks.")
    parser.add_argument("--include-specials", action="store_true", help="Incluye doble-doble/triple-doble.")
    parser.add_argument("--include-q1", action="store_true", help="Incluye mercados de primer cuarto como Q1_*. No son full game.")
    parser.add_argument("--principal-only", action="store_true", help="Descarta alt lines y conserva solo una línea principal por jugador/stat.")
    parser.add_argument("--no-principal-safety", action="store_true", help="Compatibilidad vieja. No hace falta usarlo: ahora las alt lines se conservan por defecto.")
    parser.add_argument("--debug-unmapped", action="store_true", help="Muestra mercados que no pudieron mapearse.")
    args = parser.parse_args()

    if args.keep_json and (args.delete_used_json or args.delete_discarded_json):
        parser.error("No podés usar --keep-json junto con opciones de borrado.")
    return args


def main() -> int:
    args = parse_args()
    procesar_y_guardar(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())