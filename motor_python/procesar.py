#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
procesar.py v3

Procesa dumps JSON de Stake y genera:
    cuotas_procesadas/lineas_nba_YYYYMMDD_HHMM.csv

Después limpia dumps_stake_final/:
- JSON usados con datos válidos  -> dumps_stake_final/procesados/YYYYMMDD_HHMMSS/
- JSON sin data útil / inválidos -> dumps_stake_final/descartados/YYYYMMDD_HHMMSS/

Así no se vuelven a procesar miles de paquetitos vacíos en cada corrida.

Uso normal:
    python3 procesar.py

No mover ningún JSON:
    python3 procesar.py --keep-json

No mover descartados/sin data:
    python3 procesar.py --keep-discarded-json

Borrar usados en vez de archivarlos:
    python3 procesar.py --delete-used-json

Borrar descartados en vez de archivarlos:
    python3 procesar.py --delete-discarded-json
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import shutil
from datetime import datetime
from pathlib import Path


DEFAULT_INPUT_FOLDER = "dumps_stake_final"
DEFAULT_OUTPUT_FOLDER = "cuotas_procesadas"


def extraer_info_partido(obj):
    info = {"partido": "Desconocido", "fecha": "Desconocida", "equipos": []}
    if not isinstance(obj, dict):
        return info

    fixture = obj.get("slugFixture") or obj.get("fixture")
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
            except Exception:
                info["fecha"] = raw_time

        return info

    for v in obj.values():
        if isinstance(v, (dict, list)):
            res = extraer_info_partido(v)
            if res["partido"] != "Desconocido":
                return res

    return info


def buscar_swish_data(obj):
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


def unique_destination(dest_dir: Path, filename: str) -> Path:
    dest = dest_dir / filename
    if not dest.exists():
        return dest

    stem = dest.stem
    suffix = dest.suffix
    i = 1

    while True:
        candidate = dest_dir / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def mover_o_borrar(
    archivos: list[Path],
    input_folder: Path,
    subcarpeta: str,
    borrar: bool = False,
    keep: bool = False,
) -> None:
    if keep:
        print(f"📁 Se conservan {len(archivos)} JSON de {subcarpeta}.")
        return

    if not archivos:
        print(f"📁 No hay JSON para {subcarpeta}.")
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
    archive_dir = input_folder / subcarpeta / ts
    archive_dir.mkdir(parents=True, exist_ok=True)

    movidos = 0
    for arc in archivos:
        try:
            dest = unique_destination(archive_dir, arc.name)
            shutil.move(str(arc), str(dest))
            movidos += 1
        except Exception as e:
            print(f"⚠️ No pude mover {arc}: {e}")

    print(f"📦 JSON {subcarpeta} archivados: {movidos}")
    print(f"📁 Carpeta: {archive_dir}")


def procesar_y_guardar(
    input_folder: str,
    output_folder: str,
    keep_json: bool = False,
    keep_discarded_json: bool = False,
    delete_used_json: bool = False,
    delete_discarded_json: bool = False,
) -> Path | None:
    input_path = Path(input_folder)
    output_path = Path(output_folder)

    output_path.mkdir(parents=True, exist_ok=True)
    input_path.mkdir(parents=True, exist_ok=True)

    archivos = [Path(p) for p in glob.glob(str(input_path / "*.json"))]
    print(f"[*] Analizando {len(archivos)} archivos de Stake...")

    registros = []
    archivos_usados: list[Path] = []
    archivos_sin_data: list[Path] = []
    archivos_invalidos: list[Path] = []

    for arc in archivos:
        try:
            with arc.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            archivos_invalidos.append(arc)
            continue

        meta = extraer_info_partido(data)
        teams_data = buscar_swish_data(data)

        if not teams_data:
            archivos_sin_data.append(arc)
            continue

        archivos_usados.append(arc)
        print(f"📦 Extrayendo datos de: {meta['partido']} ({meta['fecha']})")

        for team in teams_data:
            nombre_equipo_json = team.get("name", "Desconocido")

            for player in team.get("players", []):
                p_name = player.get("name")

                for market in player.get("markets", []):
                    stat_name = market.get("stat", {}).get("name", "stat").upper()

                    # Barrera anti robos y bloqueos.
                    if "STEAL" in stat_name or "BLOCK" in stat_name:
                        continue

                    for line in market.get("lines", []):
                        if line.get("suspended"):
                            continue

                        registros.append(
                            {
                                "Fecha_Partido": meta["fecha"],
                                "Partido": meta["partido"],
                                "Jugador": p_name,
                                "Equipo": nombre_equipo_json,
                                "Stat": stat_name,
                                "Linea": line.get("line", 0.5),
                                "Over": round(line.get("over", 0), 2),
                                "Under": round(line.get("under", 0), 2),
                            }
                        )

    print("")
    print("📊 Resumen dumps:")
    print(f"   JSON encontrados:   {len(archivos)}")
    print(f"   JSON usados:        {len(archivos_usados)}")
    print(f"   JSON sin data:      {len(archivos_sin_data)}")
    print(f"   JSON inválidos:     {len(archivos_invalidos)}")
    print(f"   Líneas extraídas:   {len(registros)}")

    csv_file: Path | None = None

    if registros:
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        csv_file = output_path / f"lineas_nba_{ts}.csv"

        with csv_file.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=registros[0].keys())
            writer.writeheader()
            writer.writerows(registros)

        if not csv_file.exists() or csv_file.stat().st_size == 0:
            print("❌ El CSV no se creó correctamente. No se archivan JSON usados.")
            return None

        print(f"\n[+] ¡ÉXITO! Se extrajeron {len(registros)} líneas (sin robos ni bloqueos) en: {csv_file}")

        mover_o_borrar(
            archivos=archivos_usados,
            input_folder=input_path,
            subcarpeta="procesados",
            borrar=delete_used_json,
            keep=keep_json,
        )
    else:
        print("[-] No se encontró data válida. No se genera CSV.")

    # Los JSON sin data / inválidos se archivan para que no ensucien futuras corridas.
    descartados = archivos_sin_data + archivos_invalidos
    mover_o_borrar(
        archivos=descartados,
        input_folder=input_path,
        subcarpeta="descartados",
        borrar=delete_discarded_json,
        keep=(keep_json or keep_discarded_json),
    )

    return csv_file


def main() -> int:
    parser = argparse.ArgumentParser(description="Procesar dumps Stake a CSV de líneas NBA.")
    parser.add_argument("--input-folder", default=DEFAULT_INPUT_FOLDER, help="Carpeta de JSON dumps.")
    parser.add_argument("--output-folder", default=DEFAULT_OUTPUT_FOLDER, help="Carpeta de salida CSV.")
    parser.add_argument("--keep-json", action="store_true", help="No mover ni borrar ningún JSON.")
    parser.add_argument("--keep-discarded-json", action="store_true", help="No mover JSON sin data/invalidos.")
    parser.add_argument("--delete-used-json", action="store_true", help="Borrar JSON usados en vez de archivarlos.")
    parser.add_argument("--delete-discarded-json", action="store_true", help="Borrar JSON sin data/invalidos en vez de archivarlos.")

    args = parser.parse_args()

    if args.keep_json and (args.delete_used_json or args.delete_discarded_json):
        print("❌ No podés usar --keep-json junto con opciones de borrado.")
        return 1

    procesar_y_guardar(
        input_folder=args.input_folder,
        output_folder=args.output_folder,
        keep_json=args.keep_json,
        keep_discarded_json=args.keep_discarded_json,
        delete_used_json=args.delete_used_json,
        delete_discarded_json=args.delete_discarded_json,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())