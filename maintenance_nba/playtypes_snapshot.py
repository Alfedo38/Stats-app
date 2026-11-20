"""Guardar perfiles NBA Stats/Synergy por tipo de jugada y una fecha de captura."""
from __future__ import annotations

import argparse
from datetime import datetime
from math import isfinite
from pathlib import Path
import re
from time import sleep

from .assist_league import TEAMS, ARCHIVE_TZ
from .rotation_pilot import atomic_json, require

KINDS = ("PRBallHandler", "Isolation", "Transition", "Spotup", "PRRollman")
PART = "nba-playtypes-v1"


def number(row, key, limit):
    raw = row[key]
    require(not isinstance(raw, bool), "VALOR_DE_JUGADA_INVALIDO")
    n = float(raw)
    require(isfinite(n) and 0 <= n <= limit, "VALOR_DE_JUGADA_INVALIDO")
    return n


def normalize(rows, kind, team_mode, season):
    require(isinstance(rows, list) and 0 < len(rows) <= 700, "SIN_FILAS_DE_JUGADAS")
    expected = str(int(season[:4]))
    found = {}
    for row in rows:
        if not str(row["SEASON_ID"]).endswith(expected) or row["PLAY_TYPE"].lower() != kind.lower():
            raise ValueError("JUGADA_O_TEMPORADA_DISTINTA")
        mode = "defensive" if team_mode else "offensive"
        require(row["TYPE_GROUPING"].lower() == mode, "GRUPO_DE_JUGADA_DISTINTO")
        key = (str(row["TEAM_ABBREVIATION"]).upper() if team_mode else str(row["PLAYER_ID"]))
        plays = number(row, "POSS", 100_000)
        if plays < 10:
            continue
        gp = number(row, "GP", 120)
        pts = number(row, "PTS", 100_000)
        ppp = number(row, "PPP", 5)
        require(gp >= 1 and abs(pts/plays-ppp) <= .02, "TOTALES_DE_JUGADAS_NO_CONCILIAN")
        require((key in TEAMS if team_mode else re.fullmatch(r"[1-9]\d{0,9}", key)) and key not in found,
                "IDENTIDAD_DE_JUGADA_NO_UNIVOCA")
        found[key] = [round(pts/gp, 2), ppp, int(gp), int(plays)]
    require(bool(found), "SIN_MUESTRA_DE_JUGADAS")
    return found


def collect(season):
    from nba_api.stats.endpoints.synergyplaytypes import SynergyPlayTypes
    parts = {}
    for team_mode in (False, True):
        role = "teams" if team_mode else "players"
        parts[role] = {}
        for kind in KINDS:
            response = SynergyPlayTypes(league_id="00", per_mode_simple="Totals",
                                        player_or_team_abbreviation="T" if team_mode else "P",
                                        season=season, season_type_all_star="Regular Season",
                                        play_type_nullable=kind, type_grouping_nullable="defensive" if team_mode else "offensive",
                                        timeout=18)
            datasets = response.get_normalized_dict()
            require(len(datasets) == 1, "RESPUESTA_DE_JUGADAS_INCOMPLETA")
            for key, data in normalize(next(iter(datasets.values())), kind, team_mode, season).items():
                parts[role].setdefault(key, {})[kind] = data
            sleep(1.2)
    return {"version": 1, "season": season, "capturedOn": datetime.now(ARCHIVE_TZ).date().isoformat(), **parts}


def archive_parts(state, directory, manifest, save_part):
    import json
    for path in sorted((state / "nba-playtypes").glob("*.json")):
        require(re.fullmatch(r"20\d{2}-\d{2}", path.stem) and path.stat().st_size <= 500_000, "PERFIL_OFENSIVO_INVALIDO")
        data = json.loads(path.read_text())
        require(data.get("version") == 1 and data.get("season") == path.stem, "PERFIL_OFENSIVO_INVALIDO")
        name = f"{PART}/{path.stem}"
        manifest["parts"][name] = save_part(directory, name, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", required=True)
    parser.add_argument("--output-project", type=Path, default=Path.cwd())
    args = parser.parse_args()
    try:
        season = args.season
        require(re.fullmatch(r"20\d{2}-\d{2}", season) and (int(season[:4])+1)%100 == int(season[-2:]), "TEMPORADA_INVALIDA")
        root = args.output_project.expanduser()
        require((root / "package.json").is_file(), "PROYECTO_INVALIDO")
        data = collect(season)
        path = root / "maintenance-state" / "nba-playtypes" / f"{season}.json"
        atomic_json(path, data)
        print(f"{data['capturedOn']} · {len(data['players'])} jugadores y {len(data['teams'])} equipos · {path}")
    except (ImportError, OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        parser.exit(1, f"No se pudo verificar el perfil ({type(exc).__name__}). Se conserva la captura anterior.\n")


if __name__ == "__main__":
    main()
