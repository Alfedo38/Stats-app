"""Prepara un resumen compacto para la ficha NBA desde un informe conciliado."""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
import re

from .assist_pilot import SOURCES, ZONES, load, positive, read_cached, reconcile, v3_inputs
from .rotation_pilot import Unverified, atomic_json, canonical_id, require

PART = "assist_connections_v1"
SNAPSHOT = Path("assist-pilot", "snapshot.json")
MAX_SNAPSHOT_BYTES = 500_000
KINDS = {
    "stats": ("boxscoresummaryv3", "boxscoretraditionalv3", "playbyplayv3"),
    "live": ("boxscore", "playbyplay"),
}


def played(player, stats_source):
    if not stats_source:
        flag = str(player["played"])
        require(flag in ("0", "1"), "INDICADOR_DE_PARTICIPACION_INVALIDO")
        return flag == "1"
    minutes = player["statistics"].get("minutes")
    if minutes in ("", None):
        return False
    match = re.fullmatch(r"(\d{1,2}):([0-5]\d)(?:\.(\d{1,3}))?", minutes)
    require(match is not None, "MINUTOS_V3_INVALIDOS")
    return any(int(part or 0) for part in match.groups())


def build_snapshot(project, report):
    require(report.get("version") == 1 and report.get("source") in SOURCES.values(), "INFORME_NO_RECONOCIDO")
    season, team = report["season"], report["team"]
    require(re.fullmatch(r"20\d{2}-\d{2}", season) and (int(season[:4])+1)%100 == int(season[-2:]),
            "TEMPORADA_INVALIDA")
    require(re.fullmatch(r"[A-Z]{3}", team), "EQUIPO_INVALIDO")
    verified = report["verified"]
    require(isinstance(verified, list) and 0 < len(verified) <= 6 and report.get("excluded") == [],
            "SE_REQUIERE_UN_INFORME_SIN_EXCLUSIONES")
    stats_source = report["source"] == SOURCES["stats"]
    kinds = KINDS["stats" if stats_source else "live"]
    state = project / "maintenance-state" / "assist-pilot"
    names, games, seen = {}, [], set()
    for game in sorted(verified, key=lambda g: (g["date"], g["gameId"])):
        gid, day = canonical_id(game["gameId"]), date.fromisoformat(game["date"]).isoformat()
        require(gid == game["gameId"] and day == game["date"] and gid not in seen and gid[3:5] == season[2:4],
                "ID_O_FECHA_DE_INFORME_INVALIDOS")
        seen.add(gid)
        hashes, parts = game["sha256"], []
        require(set(hashes) == set(kinds), "INFORME_SIN_HUELLAS_COMPLETAS")
        for kind in kinds:
            payload, digest = load(project, state, kind, gid, offline=True)
            require(digest == hashes[kind], f"NO_COINCIDE_{kind.upper()}_{gid}")
            parts.append(payload)
        box, pbp = v3_inputs(gid, day, *parts) if stats_source else parts
        checked = reconcile(gid, day, box, pbp, team)
        require(checked == {k: v for k, v in game.items() if k != "sha256"}, f"INFORME_DISTINTO_DE_LA_FUENTE_{gid}")

        raw_box = parts[1]["boxScoreTraditional"] if stats_source else box["game"]
        rosters = []
        for side in ("awayTeam", "homeTeam"):
            players = []
            side_box = raw_box[side]
            for player in side_box["players"]:
                if not played(player, stats_source):
                    continue
                pid = positive(player["personId"])
                name = player.get("name") or f"{player.get('firstName') or ''} {player.get('familyName') or ''}"
                name = " ".join(name.split())
                require(0 < len(name) <= 100, "NOMBRE_INVALIDO")
                names[str(pid)] = name
                players.append(pid)
            require(len(players) >= 5, "PLANTEL_INCOMPLETO")
            rosters.append([side_box["teamTricode"], sorted(players)])
        team_players = {code: set(players) for code, players in rosters}
        pairs = []
        for item in checked["connections"]:
            passer, shooter = item["passerId"], item["shooterId"]
            require({passer, shooter} <= team_players[item["team"]], "CONEXION_SIN_PARTICIPACION")
            pairs.append([passer, shooter, ZONES.index(item["zone"]), item["assists"]])
        games.append({"id": gid, "date": day, "rosters": rosters, "pairs": pairs})
    return {"version": 1, "team": team, "season": season, "names": names, "games": games}


def archive_part(state, directory, manifest, save_part):
    path = state / SNAPSHOT
    if not path.is_file():
        return
    require(path.stat().st_size <= MAX_SNAPSHOT_BYTES, "RESUMEN_DE_ASISTENCIAS_DEMASIADO_GRANDE")
    data, _ = read_cached(path)
    require(data.get("version") == 1 and isinstance(data.get("games"), list)
            and 0 < len(data["games"]) <= 6, "RESUMEN_DE_ASISTENCIAS_INVALIDO")
    manifest["parts"][PART] = save_part(directory, PART, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parents[1]
    parser.add_argument("--project", type=Path, default=root, help="Proyecto donde están el informe y los JSON originales")
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=root / "maintenance-state" / SNAPSHOT)
    args = parser.parse_args()
    try:
        report, _ = read_cached(args.report.expanduser())
        data = build_snapshot(args.project.expanduser(), report)
        output = args.output.expanduser()
        atomic_json(output, data)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        parser.exit(1, f"No se preparó el resumen: {exc}\n")
    assists = sum(pair[3] for game in data["games"] for pair in game["pairs"])
    print(f"Resumen local: {len(data['games'])} partidos, {assists} asistencias, {output.stat().st_size} bytes")
    print(f"Archivo: {output}")


if __name__ == "__main__":
    main()
