"""Conciliar asistencias de ambos equipos; preparar archivos pequeños para la ficha."""
from __future__ import annotations

import argparse
from collections import defaultdict, Counter
from datetime import date, datetime, timedelta
import gzip
import hashlib
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

from .assist_pilot import TZ, ZONES, load, reconcile, v3_inputs
from .assist_snapshot import KINDS, summarize_game
from .rotation_pilot import IDS, Unverified, atomic_json, reconstruct, require

PART = "assist-league-v2"
PREFIX = Path("assist-league")
TEAMS = set("ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split())
ARCHIVE_TZ = ZoneInfo("America/New_York")
CHUNK = 16
LIMIT_BYTES = 280_000


def chunk_key(game_id):
    return str(int(game_id) // CHUNK)


def archive_calendar(project, first, last):
    base = (project / "maintenance-state" / "archive").resolve()
    return calendar_from_manifest(base, json.loads((base / "manifest.json").read_text()), first, last)


def calendar_from_manifest(base, manifest, first, last):
    """Lee las partes locales de Regular/Playoffs, incluso antes de publicar el índice."""
    base = base.resolve()
    games = {}
    for key, meta in manifest["parts"].items():
        if not key.startswith("facts/"):
            continue
        path = (base / meta["path"]).resolve()
        require(path.is_relative_to(base), "RUTA_DE_ARCHIVO_INVALIDA")
        raw = path.read_bytes()
        require(len(raw) == meta["bytes"] and hashlib.sha256(raw).hexdigest() == meta["sha256"],
                "HASH_DE_ARCHIVO_INVALIDO")
        for row in json.loads(gzip.decompress(raw)):
            day = str(row.get("game_date") or "")[:10]
            if not first <= day <= last or str(row.get("period_scope") or "FULL") != "FULL":
                continue
            gid = str(row.get("game_id") or "").zfill(10)
            team = row.get("team_abbreviation") or row.get("team_abbr")
            if not IDS.fullmatch(gid) or team not in TEAMS:
                continue
            old, teams = games.setdefault(gid, (day, set()))
            require(old == day, "FECHA_DE_ARCHIVO_CONTRADICTORIA")
            teams.add(team)
    return games


def game_record(project, gid, day, teams, source, offline, *, rotations=False):
    stats = source == "stats"
    kinds = KINDS["stats" if stats else "live"]
    state = project / "maintenance-state" / "assist-pilot"
    entries = [load(project, state, k, gid, offline, use_sdk=True) for k in kinds]
    parts = [entry[0] for entry in entries]
    box, pbp = v3_inputs(gid, day, *parts, calendar_tz=ARCHIVE_TZ) if stats else parts
    game = box["game"]
    codes = {game[side]["teamTricode"] for side in ("awayTeam", "homeTeam")}
    require(len(codes) == 2 and codes <= TEAMS and teams <= codes, "EQUIPOS_DISTINTOS_DEL_ARCHIVO")
    require(game.get("gameTimeUTC"), "FUENTE_SIN_HORA_VERIFICABLE")
    checked = reconcile(gid, day, box, pbp, sorted(codes)[0], calendar_tz=ARCHIVE_TZ)
    result = summarize_game(gid, day, raw_box=(parts[1]["boxScoreTraditional"] if stats else game),
                            stats_source=stats, checked=checked)
    if rotations and not stats:
        # El cotejo de gameTimeUTC ya confirmó el día oficial de la NBA.
        try:
            rotation = reconstruct(gid, day, {"game": {**game, "gameEt": day}}, pbp)
            result["rotations"] = rotation["players"]
            result["rotationExcluded"] = rotation["rejected"]
        except (ValueError, OSError, KeyError, TypeError, AttributeError) as exc:
            result["rotationExcluded"] = {"game": str(exc) if isinstance(exc, Unverified) else type(exc).__name__}
    return {"v": 2, "source": source, "sha256": dict(zip(kinds, (entry[1] for entry in entries))), **result}


def read_verified(path, gid=None, day=None, teams=None):
    require(path.stat().st_size <= LIMIT_BYTES, "RESUMEN_DEMASIADO_GRANDE")
    result = json.loads(path.read_text())
    require(result.get("v") == 2 and IDS.fullmatch(result["id"]) and path.stem == result["id"]
            and date.fromisoformat(result["date"]).isoformat() == result["date"]
            and (not gid or result["id"] == gid) and (not day or result["date"] == day)
            and (not teams or teams <= {r[0] for r in result["rosters"]}), "RESUMEN_VERIFICADO_INVALIDO")
    return result


def league_reference(teams):
    """Referencia por zona y PJ solo después de 30 muestras recientes utilizables."""
    days = sorted({row[0] for rows in teams.values() for row in rows})
    if set(teams) != TEAMS:
        return []
    rows_out = []
    for day in days:
        available = [sorted((row for row in teams[team] if row[0]<=day), reverse=True)[:20] for team in TEAMS]
        known = [[row for row in rows if row[2] is not None] for rows in available]
        # Cada equipo debe aportar al menos 5 partidos y 70 % de cobertura.
        if any(len(k)<5 or len(k)*10<7*len(a) for k,a in zip(known,available)):
            rows_out.append([day,None])
            continue
        seen = [row for rows in known for row in rows]
        rows_out.append([day,[round(sum(row[2][z] for row in seen)/len(seen),3) for z in range(len(ZONES))]])
    return rows_out



def prepare_outputs(state, calendar):
    shards, rivals, rotations = defaultdict(list), defaultdict(dict), defaultdict(list)
    final = state / PREFIX
    counts = Counter()
    # Materializamos la lista: si un archivo no concilia, no publicamos un índice nuevo.
    records = [read_verified(path) for path in sorted((final / "verified").glob("*.json"))]
    for row in records:
        season = row["id"][3:5]
        source_key = chunk_key(row["id"])
        game = {k: row[k] for k in ("id", "date", "rosters", "pairs", "names")}
        shards[source_key].append(game)
        if row.get("rotations"):
            rotations[source_key].append([row["id"], row["rotations"]])
        codes = [x[0] for x in row["rosters"]]
        player_team = {pid: code for code, roster in row["rosters"] for pid in roster}
        allowed = {code: [0]*len(ZONES) for code in codes}
        for passer, _, zone, assists in row["pairs"]:
            opponent = next(code for code in codes if code != player_team[passer])
            allowed[opponent][zone] += assists
        for code in codes:
            rivals[f"{season}/{code}"][row["id"]] = [row["date"], row["id"], allowed[code]]
            counts[code] += 1
    # Agrega los partidos conocidos que faltan, para no confundir poca cobertura con poco volumen.
    for gid, (day, teams) in calendar.items():
        for code in teams:
            rivals[f"{gid[3:5]}/{code}"].setdefault(gid, [day, gid, None])
    for key, games in shards.items():
        require(len(games) <= CHUNK, "BLOQUE_DEMASIADO_GRANDE")
        atomic_json(final / "parts" / "games" / f"{key}.json", games)
    seasons = defaultdict(dict)
    for key, rows in rivals.items():
        output = final / "parts" / "rivals" / f"{key}.json"
        # Conserva el calendario previo en corridas incrementales aunque falten capturas.
        if output.is_file():
            for row in json.loads(output.read_text()):
                if row[2] is None:
                    rows.setdefault(row[1], row)
        ordered=sorted(rows.values(), reverse=True)
        atomic_json(output, ordered)
        season, team = key.split("/")
        seasons[season][team] = ordered
    for season, teams in seasons.items():
        samples = league_reference(teams)
        if samples:
            atomic_json(final / "parts" / "rivals" / season / "NBA.json", samples)
    for key, rows in rotations.items():
        require(len(rows) <= CHUNK, "ROTACIONES_FUERA_DE_TEMPORADA")
        atomic_json(final / "parts" / "rotations" / f"{key}.json", rows)
    return counts


def archive_parts(state, directory, manifest, save_part):
    root = state / PREFIX / "parts"
    if not root.is_dir():
        return
    for path in sorted(root.glob("**/*.json")):
        rel = path.relative_to(root).with_suffix("").as_posix()
        require(re.fullmatch(r"games/\d{1,10}|rivals/\d{2}/[A-Z]{3}|rotations/\d{1,10}", rel)
                and path.stat().st_size <= LIMIT_BYTES, "PARTE_DE_ASISTENCIAS_INVALIDA")
        rows = json.loads(path.read_text())
        require(isinstance(rows, list) and 0 < len(rows) <= (366 if rel.endswith("/NBA") else CHUNK if not rel.startswith("rivals") else 150),
                "PARTE_DE_ASISTENCIAS_INVALIDA")
        name = f"{PART}/{rel}"
        manifest["parts"][name] = save_part(directory, name, rows)


def collect_games(project, state, games, first, last, *, max_games, source='nba-api',
                  rotations=False, offline=False, plan=False):
    existing, pending, enrich = 0, [], []
    for gid, (day, teams) in sorted(games.items(), key=lambda x: (x[1][0], x[0]), reverse=True):
        target = state / PREFIX / "verified" / f"{gid}.json"
        if target.is_file():
            row = read_verified(target, gid, day, teams)
            existing += 1
            if rotations and source == "nba-api" and not ("rotations" in row or "rotationExcluded" in row):
                enrich.append((gid, day, teams, target, True))
        else:
            pending.append((gid, day, teams, target, False))
    print(f"{first} a {last} · {len(games)} partidos únicos · {existing} verificados · {len(pending)} pendientes", flush=True)
    if plan:
        return None
    reasons, added, consecutive = {}, 0, 0
    for gid, day, teams, target, was_verified in (pending+enrich)[:max_games]:
        try:
            result = game_record(project, gid, day, teams, source, offline or was_verified, rotations=rotations)
            atomic_json(target, result)
            added += int(not was_verified)
            consecutive = 0
            print(f"{day} · {gid} · {sum(p[3] for p in result['pairs'])} AST verificadas", flush=True)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
            reason = str(exc) if isinstance(exc, Unverified) else type(exc).__name__
            reasons[gid] = reason
            print(f"{day} · {gid} · pendiente: {reason}", flush=True)
            network_failure = any(part in reason for part in ("HTTP_", "TIMEOUT", "Timeout", "Connection", "IMPORTACION"))
            consecutive = consecutive + 1 if network_failure else 0
            if not offline and ("HTTP_429" in reason or consecutive >= 4):
                print("Pausa: se conservan los partidos válidos y el resto queda pendiente.", flush=True)
                break
    counts = prepare_outputs(state, games)
    rotation_blocks = sum(1 for _ in (state / PREFIX / "parts" / "rotations").glob("*.json"))
    report = state / PREFIX / "reports" / f"{datetime.now(TZ):%Y%m%d-%H%M%S-%f}.json"
    atomic_json(report, {"from": first, "through": last, "source": source,
                         "requested": len(games), "verified": existing+added, "failures": reasons,
                         "teamGames": dict(sorted(counts.items())), "rotationBlocks": rotation_blocks})
    print(f"{existing+added}/{len(games)} en la ventana · {len(counts)}/30 equipos con datos acumulados · informe: {report}", flush=True)
    return existing+added


def collect_for_archive(project, state, directory, manifest, *, today=None, max_games=24):
    last = (today or datetime.now(ARCHIVE_TZ).date()) - timedelta(days=1)
    since, through = (last-timedelta(days=13)).isoformat(), last.isoformat()
    games = calendar_from_manifest(directory, manifest, since, through)
    if not games:
        print("ASISTENCIAS NBA: sin partidos recientes en el archivo; se conserva la cobertura existente.", flush=True)
        return
    collect_games(project, state, games, since, through, max_games=max_games, rotations=True)


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=root, help="Proyecto con el archivo histórico y los JSON de origen")
    parser.add_argument("--output-project", type=Path, default=root, help="Proyecto donde se leen las conexiones")
    parser.add_argument("--through", default=(datetime.now(ARCHIVE_TZ).date()-timedelta(days=1)).isoformat())
    parser.add_argument("--from", dest="since")
    parser.add_argument("--max-games", type=int, default=120, help="Máximo de partidos nuevos por corrida")
    parser.add_argument("--rotations", action="store_true", help="Reconstruye rotaciones desde liveData; no descarga endpoints adicionales")
    parser.add_argument("--source", choices=("nba-api", "stats"), default="nba-api")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan", action="store_true", help="No escribe ni consulta a la NBA")
    mode.add_argument("--collect", action="store_true", help="Completa los partidos pendientes de la muestra")
    mode.add_argument("--offline", action="store_true", help="Genera desde archivos originales ya descargados")
    args = parser.parse_args()
    try:
        last = date.fromisoformat(args.through)
        first = date.fromisoformat(args.since) if args.since else last-timedelta(days=13)
        require(0 <= (last-first).days <= 1100 and last <= datetime.now(ARCHIVE_TZ).date(), "RANGO_INVALIDO")
        require(1 <= args.max_games <= 250, "MAXIMO_INVALIDO")
        project = args.project.expanduser().resolve()
        output = args.output_project.expanduser().resolve()
        require((project / "package.json").is_file() and (output / "package.json").is_file(), "PROYECTO_INVALIDO")
        state = output / "maintenance-state"
        games = archive_calendar(project, first.isoformat(), last.isoformat())
        require(bool(games), "SIN_PARTIDOS_REGISTRADOS_EN_EL_ARCHIVO_LOCAL")
        verified = collect_games(project, state, games, first.isoformat(), last.isoformat(),
                                 max_games=args.max_games, source=args.source, rotations=args.rotations,
                                 offline=args.offline, plan=args.plan)
        return 0 if args.plan or verified else 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(2, f"No se pudo preparar la cobertura: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
