"""Piloto NBA de asistencias: conexiones y zonas conciliadas por partido, solo local."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime
from hashlib import sha256
from importlib import import_module
from math import hypot, isfinite
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

from .rotation_pilot import MAX_BODY, Unverified, archived_games, atomic_json, canonical_id, fetch_game, name_key, require

SOURCES = {
    "live": "NBA liveData boxscore + playbyplay",
    "nba-api": "NBA liveData boxscore + playbyplay vía nba_api",
    "stats": "NBA Stats V3: resumen, boxscore y play-by-play",
}
SDK_ENDPOINTS = {
    "boxscore": ("live.nba", "BoxScore"),
    "playbyplay": ("live.nba", "PlayByPlay"),
    "boxscoresummaryv3": ("stats", "BoxScoreSummaryV3"),
    "boxscoretraditionalv3": ("stats", "BoxScoreTraditionalV3"),
    "playbyplayv3": ("stats", "PlayByPlayV3"),
}
ASSIST = re.compile(r"\(([^()]+?)\s+([1-9]\d?)\s+AST\)(?=\s|$)", re.IGNORECASE)
TZ = ZoneInfo("America/Argentina/Buenos_Aires")
ZONES = ("aro", "otros_dobles", "triple_esquina", "triple_frontal", "sin_zona")


def integer(value):
    require(not isinstance(value, bool) and re.fullmatch(r"\d{1,13}", str(value)), "ENTERO_INVALIDO")
    return int(value)


def positive(value):
    n = integer(value)
    require(n > 0, "ID_INVALIDO")
    return n


def real(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return n if isfinite(n) else None


def zone(action, three):
    """Clasificación operativa basada en coordenadas legacy, décimas de pie desde el aro."""
    x, y = real(action.get("xLegacy")), real(action.get("yLegacy"))
    xy = x is not None and y is not None and abs(x) <= 250 and -53 <= y <= 890
    if three:
        if not xy or (x == 0 and y == 0):
            return "sin_zona"
        return "triple_esquina" if abs(x) >= 220 and y <= 92 else "triple_frontal"
    # V3 redondea shotDistance a pies enteros; las coordenadas coinciden con liveData.
    d = hypot(x, y) / 10 if xy and (x != 0 or y != 0) else real(action.get("shotDistance"))
    if d is None or d < 0:
        return "sin_zona"
    return "aro" if d < 4 else "otros_dobles"


def reconcile(game_id, day, boxscore, playbyplay, team_code):
    game, pbp = boxscore["game"], playbyplay["game"]
    require(str(game["gameId"]) == game_id == str(pbp["gameId"]), "ID_DE_FUENTE_DISTINTO")
    require(str(game.get("gameStatus")) == "3", "PARTIDO_NO_FINALIZADO")
    if game.get("gameTimeUTC"):
        start = datetime.fromisoformat(game["gameTimeUTC"].replace("Z", "+00:00"))
        require(start.tzinfo is not None and start.astimezone(TZ).date().isoformat() == day, "FECHA_ARG_DISTINTA")

    teams, players = {}, {}
    expected_ast, expected_fgm = {}, {}
    for side in ("awayTeam", "homeTeam"):
        row = game[side]
        tid, abbr = positive(row["teamId"]), row["teamTricode"]
        require(tid not in teams and re.fullmatch(r"[A-Z]{3}", abbr) and abbr not in teams.values(), "EQUIPO_INVALIDO")
        teams[tid] = abbr
        require(5 <= len(row["players"]) <= 30, "PLANTEL_INVALIDO")
        for player in row["players"]:
            pid, stats = positive(player["personId"]), player["statistics"]
            require(pid not in players, "JUGADOR_DUPLICADO")
            players[pid] = tid
            expected_ast[pid] = integer(stats["assists"])
            expected_fgm[pid] = integer(stats["fieldGoalsMade"])
    require(team_code in teams.values(), "FUERA_DEL_EQUIPO_DEL_PILOTO")

    actions = pbp["actions"]
    require(isinstance(actions, list) and 0 < len(actions) <= 2500, "JUGADAS_NO_VALIDAS")
    seen, made, assists = set(), Counter(), Counter()
    counts = Counter()
    for action in actions:
        typ = str(action.get("actionType")).lower()
        if typ not in {"2pt", "3pt"} or str(action.get("shotResult")).lower() != "made":
            continue
        event, shooter, team = (positive(action[k]) for k in ("actionNumber", "personId", "teamId"))
        require(event not in seen and players.get(shooter) == team, "CANASTA_DUPLICADA_O_SIN_IDENTIDAD")
        seen.add(event)
        made[shooter] += 1
        raw_assist = action.get("assistPersonId")
        if raw_assist in (None, "", 0, "0"):
            continue
        passer = positive(raw_assist)
        require(passer != shooter and players.get(passer) == team, "ASISTIDOR_NO_VERIFICADO")
        assists[passer] += 1
        counts[teams[team], passer, shooter, zone(action, typ == "3pt")] += 1

    require(sum(made.values()) > 0 and all(made[p] == n for p, n in expected_fgm.items()), "FGM_NO_COINCIDE_CON_BOXSCORE")
    require(all(assists[p] == n for p, n in expected_ast.items()), "AST_NO_COINCIDE_CON_BOXSCORE")

    # Conserva ambos lados de los partidos del equipo: permite calcular lo que concede el rival.
    connections = [{"team": team, "passerId": passer, "shooterId": shooter, "zone": area, "assists": n}
                   for (team, passer, shooter, area), n in sorted(counts.items())]
    by_zone = {area: sum(row["assists"] for row in connections if row["zone"] == area) for area in ZONES}
    return {"gameId": game_id, "date": day, "teams": list(teams.values()), "checkedFgm": sum(made.values()),
            "checkedAssists": sum(assists.values()), "zones": by_zone, "connections": connections}


def read_cached(path):
    require(path.stat().st_size <= MAX_BODY, "FUENTE_EXCEDE_LIMITE")
    raw = path.read_bytes()
    return json.loads(raw), sha256(raw).hexdigest()


def v3_inputs(game_id, day, summary, traditional, playbyplay):
    header, box, pbp = summary["boxScoreSummary"], traditional["boxScoreTraditional"], playbyplay["game"]
    require(str(header["gameId"]) == str(box["gameId"]) == str(pbp["gameId"]) == game_id, "ID_DE_FUENTE_DISTINTO")
    require(str(header.get("gameStatus")) == "3", "PARTIDO_NO_FINALIZADO")
    start = datetime.fromisoformat(header["gameTimeUTC"].replace("Z", "+00:00"))
    require(start.tzinfo is not None and start.astimezone(TZ).date().isoformat() == day, "FECHA_ARG_DISTINTA")
    game = {k: header[k] for k in ("gameId", "gameStatus", "gameTimeUTC")}
    aliases, expected_3pm = {}, {}
    for side in ("awayTeam", "homeTeam"):
        team = box[side]
        tid = positive(team["teamId"])
        require(tid == positive(header[side + "Id"]), "EQUIPOS_DE_FUENTE_DISTINTOS")
        players = []
        for p in team["players"]:
            pid = positive(p["personId"])
            stats = p["statistics"]
            first, last = p.get("firstName") or "", p.get("familyName") or ""
            keys = {name_key(n) for n in (last, first + " " + last, p.get("nameI"), first[:1] + " " + last) if n}
            for key in keys - {""}:
                aliases.setdefault((tid, key), set()).add(pid)
            # Algunas fichas V3 dejan las estadísticas nulas en los que no jugaron.
            no_play = not stats.get("minutes") and bool(str(p.get("comment") or "").strip())
            cleaned = {}
            for k in ("fieldGoalsMade", "assists", "threePointersMade"):
                value = stats[k]
                cleaned[k] = 0 if value is None and no_play else integer(value)
            expected_3pm[pid] = cleaned["threePointersMade"]
            players.append({"personId": pid, "statistics": cleaned})
        game[side] = {"teamId": tid, "teamTricode": team["teamTricode"], "players": players}

    raw = pbp["actions"]
    require(isinstance(raw, list) and 0 < len(raw) <= 2500, "JUGADAS_NO_VALIDAS")
    actions, threes, assist_ordinals = [], Counter(), {}
    for action in raw:
        if str(action.get("isFieldGoal")) != "1" or str(action.get("shotResult", "")).lower() != "made":
            continue
        tid, pid = positive(action["teamId"]), positive(action["personId"])
        value = positive(action["shotValue"])
        require(value in (2, 3), "VALOR_DE_CANASTA_INVALIDO")
        threes[pid] += int(value == 3)
        row = {**action, "actionType": f"{value}pt", "actionNumber": positive(action["actionId"])}
        annotations = ASSIST.findall(action["description"])
        require(len(annotations) <= 1, "VARIAS_ASISTENCIAS_EN_LA_MISMA_JUGADA")
        if annotations:
            name, ordinal = annotations[0]
            candidates = aliases.get((tid, name_key(name)), set())
            require(len(candidates) == 1 and pid not in candidates, "ASISTIDOR_V3_AMBIGUO_O_NO_ENCONTRADO")
            passer = next(iter(candidates))
            nums = assist_ordinals.setdefault(passer, set())
            ordinal = int(ordinal)
            require(ordinal not in nums, "ASISTENCIA_V3_DUPLICADA")
            nums.add(ordinal)
            row["assistPersonId"] = passer
        else:
            row.pop("assistPersonId", None)
        actions.append(row)
    require(all(nums == set(range(1, len(nums) + 1)) for nums in assist_ordinals.values()), "SECUENCIA_AST_V3_INCOMPLETA")
    require(all(threes[p] == n for p, n in expected_3pm.items()), "TRIPLES_NO_COINCIDEN_CON_BOXSCORE")
    return {"game": game}, {"game": {"gameId": game_id, "actions": actions}}


def sdk_fetch(kind, gid, path):
    package, class_name = SDK_ENDPOINTS[kind]
    try:
        factory = getattr(import_module(f"nba_api.{package}.endpoints.{kind}"), class_name)
    except ModuleNotFoundError as exc:
        missing = exc.name or "no_identificada"
        raise Unverified(f"NBA_API_IMPORTACION_INCOMPLETA_{kind.upper()}: {missing}") from exc
    except (ImportError, AttributeError) as exc:
        raise Unverified(f"NBA_API_FALTA_ENDPOINT_{kind.upper()}") from exc
    try:
        extra = {"start_period": 0, "end_period": 0} if kind == "playbyplayv3" else {}
        data = factory(game_id=gid, timeout=12, **extra).get_dict()
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        response = getattr(exc, "response", None)
        status = getattr(response, "status_code", None)
        label = f"HTTP_{status}" if isinstance(status, int) else type(exc).__name__
        raise Unverified(f"{kind.upper()}_{label}") from exc
    require(isinstance(data, dict) and bool(data), f"{kind.upper()}_SIN_DATOS")
    atomic_json(path, data)
    time.sleep(0.6)


def load(project, state, kind, gid, offline, use_sdk=False):
    name = f"{kind}_{gid}.json"
    path = state / "raw" / name
    rotation = project / "maintenance-state" / "rotation-pilot" / "raw" / name
    if not path.is_file() and rotation.is_file():
        return read_cached(rotation)
    if not path.is_file():
        require(not offline, "FALTA_JSON_LOCAL_" + kind.upper())
        if use_sdk:
            sdk_fetch(kind, gid, path)
        else:
            try:
                fetch_game(kind, gid, path.parent, False)
            except HTTPError as exc:
                raise Unverified(f"{kind.upper()}_HTTP_{exc.code}") from exc
    return read_cached(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--team", default="SAS")
    parser.add_argument("--season", default="2026-27")
    parser.add_argument("--games", type=int, default=3, help="Partidos del archivo local (máximo 6)")
    parser.add_argument("--game", action="append", default=[], metavar="ID:AAAA-MM-DD")
    parser.add_argument("--before", default=datetime.now(TZ).date().isoformat())
    parser.add_argument("--offline", action="store_true", help="Solo lee JSON previamente guardados")
    parser.add_argument("--source", choices=SOURCES, default="nba-api",
                        help="nba-api usa el cliente de liveData de la biblioteca; stats usa NBA Stats V3")
    args = parser.parse_args()
    team = args.team.upper()
    if (not re.fullmatch(r"[A-Z]{3}", team) or not re.fullmatch(r"20\d{2}-\d{2}", args.season)
        or (int(args.season[:4])+1)%100 != int(args.season[-2:]) or not 1 <= args.games <= 6 or len(args.game) > 6):
        parser.error("Equipo, temporada o tamaño del piloto inválido.")
    project = args.project.expanduser().resolve()
    if not (project / "package.json").is_file():
        parser.error("No se encontró package.json en el proyecto.")
    state = project / "maintenance-state" / "assist-pilot"
    try:
        before = date.fromisoformat(args.before).isoformat()
        games = {}
        for raw in args.game:
            gid, day = raw.split(":", 1)
            gid, day = canonical_id(gid), date.fromisoformat(day).isoformat()
            require(gid[3:5] == args.season[2:4] and day < before, "PARTIDO_FUERA_DE_TEMPORADA_O_FECHA_DE_CORTE")
            require(gid not in games or games[gid] == day, "FECHAS_CONTRADICTORIAS")
            games[gid] = day
        if not games:
            games = archived_games(project, args.season, before, args.games, (team,))
        require(games, "SIN_PARTIDOS: elegí el equipo o pasá --game ID:AAAA-MM-DD")
    except (Unverified, ValueError, OSError, KeyError) as exc:
        parser.exit(2, f"No se pudo seleccionar la muestra: {exc}\n")
    accepted, excluded = [], []
    for gid, day in sorted(games.items(), key=lambda p: (p[1], p[0]), reverse=True):
        try:
            if args.source == "stats":
                parts = {}
                hashes = {}
                for kind in ("boxscoresummaryv3", "boxscoretraditionalv3", "playbyplayv3"):
                    parts[kind], hashes[kind] = load(project, state, kind, gid, args.offline, use_sdk=True)
                    if kind == "boxscoresummaryv3":
                        header = parts[kind]["boxScoreSummary"]
                        require(str(header["gameId"]) == gid, "ID_DE_FUENTE_DISTINTO")
                        require(str(header["gameStatus"]) == "3", "PARTIDO_NO_FINALIZADO")
                box, pbp = v3_inputs(gid, day, parts["boxscoresummaryv3"], parts["boxscoretraditionalv3"], parts["playbyplayv3"])
            else:
                box, box_hash = load(project, state, "boxscore", gid, args.offline, use_sdk=args.source == "nba-api")
                pbp, pbp_hash = load(project, state, "playbyplay", gid, args.offline, use_sdk=args.source == "nba-api")
                hashes = {"boxscore": box_hash, "playbyplay": pbp_hash}
            row = reconcile(gid, day, box, pbp, team)
            accepted.append({**row, "sha256": hashes})
            print(f"{gid} · {day} · {row['checkedAssists']} AST conciliadas · {row['zones']['sin_zona']} sin zona")
        except (Unverified, OSError, KeyError, ValueError, TypeError, AttributeError) as exc:
            reason = f"HTTP_{exc.code}" if isinstance(exc, HTTPError) else str(exc) if isinstance(exc, Unverified) else type(exc).__name__
            excluded.append({"gameId": gid, "date": day, "reason": reason})
            print(f"{gid} · {day} · excluido: {reason}")
    timestamp = datetime.now(TZ)
    target = state / "reports" / f"{team}-{timestamp:%Y%m%d-%H%M%S-%f}.json"
    atomic_json(target, {"version": 1, "source": SOURCES[args.source], "team": team, "season": args.season,
                         "createdAt": timestamp.isoformat(), "verified": accepted, "excluded": excluded})
    print(f"Conciliados: {len(accepted)}/{len(games)} · informe: {target}")
    return 0 if not excluded else 1


if __name__ == "__main__":
    raise SystemExit(main())
