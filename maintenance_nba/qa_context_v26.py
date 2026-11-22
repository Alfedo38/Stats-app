"""Plan y descarga por cruces. Guarda tiros conciliados y marcas en almacenes locales."""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import date, datetime
from collections import defaultdict
import json
import math
from pathlib import Path
from time import sleep
from zoneinfo import ZoneInfo

from . import matchup_history as mh
from .rotation_pilot import atomic_json

SHOTS = "qa-shots-v26"
TEXT_FIELDS = ("EVENT_TYPE", "ACTION_TYPE", "SHOT_TYPE", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA", "SHOT_ZONE_RANGE")
FILE_LIMIT = 120_000


def small_int(value, lo, hi):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value or not lo <= value <= hi:
        raise ValueError("Número fuera de rango en box score o tiros")
    return int(value)


def box_counts(directory, manifest, player):
    key = f"facts/{player}"
    if key not in manifest["parts"]:
        return {}
    out = {}
    for row in mh.archive_rows(directory, manifest["parts"][key]):
        try:
            if isinstance(row["fga"], bool) or isinstance(row["fgm"], bool):
                continue
            attempts = small_int(float(row["fga"]), 0, 90)
            made = small_int(float(row["fgm"]), 0, attempts)
            gid = mh.game_id(row["game_id"])
        except (TypeError, ValueError, KeyError):
            continue
        if gid:
            out[gid] = attempts, made
    return out


def parse_shots(raw, pid, game, box):
    attempts, made = box
    if not isinstance(raw, list) or (len(raw) != attempts or attempts < 1):
        raise ValueError("La cantidad de tiros no concilia con FGA")
    seen, out = set(), []
    team = game["expected"][pid]
    for r in raw:
        home, away = r["HTM"], r["VTM"]
        if (mh.game_id(r["GAME_ID"]) != game["id"] or mh.positive_id(r["PLAYER_ID"]) != pid
                or r["GAME_DATE"] != game["date"].replace("-", "") or {home, away} != game["teams"]
                or small_int(r["SHOT_ATTEMPTED_FLAG"], 1, 1) != 1):
            raise ValueError("Tiro de otro juego, jugador o fecha")
        event = small_int(r["GAME_EVENT_ID"], 0, 5000)
        if event in seen:
            raise ValueError("Evento de tiro duplicado")
        seen.add(event)
        row = {s.lower(): str(r[s])[:120] for s in TEXT_FIELDS}
        out.append(dict(row, game_id=game["id"], game_event_id=event, game_date=game["date"], season=game["season"],
                        season_type=mh.PHASES[game["id"][:3]], player_id=pid, player_name=str(r["PLAYER_NAME"])[:120],
                        team_id=mh.positive_id(r["TEAM_ID"]), team_name=str(r["TEAM_NAME"])[:80],
                        team_abbr=team, opponent_abbr=home if team == away else away,
                        period=small_int(r["PERIOD"], 1, 10), minutes_remaining=small_int(r["MINUTES_REMAINING"], 0, 12),
                        seconds_remaining=small_int(r["SECONDS_REMAINING"], 0, 59),
                        shot_distance=small_int(r["SHOT_DISTANCE"], 0, 100), loc_x=small_int(r["LOC_X"], -550, 550),
                        loc_y=small_int(r["LOC_Y"], -550, 1000), shot_attempted_flag=1, shot_made_flag=small_int(r["SHOT_MADE_FLAG"], 0, 1),
                        home_team_abbr=home, away_team_abbr=away))
    if sum(s["shot_made_flag"] for s in out) != made:
        raise ValueError("La cantidad de conversiones no concilia con FGM")
    return sorted(out, key=lambda r: r["game_event_id"])


def download_shots(pid, game, counts):
    from nba_api.stats.endpoints.shotchartdetail import ShotChartDetail
    result = ShotChartDetail(league_id="00", team_id=0, player_id=pid, game_id_nullable=game["id"],
                             season_nullable=game["season"], season_type_all_star=mh.PHASES[game["id"][:3]],
                             context_measure_simple="FGA", timeout=16)
    return parse_shots(result.get_normalized_dict()["Shot_Chart_Detail"], pid, game, counts)


def integrate_shots(state, directory, manifest, save_part, load_part, identity):
    grouped = defaultdict(list)
    files = sorted((Path(state) / SHOTS).glob("*/*.json"))
    if len(files) > 8000:
        raise ValueError("Demasiados bloques de tiros en espera")
    for path in files:
        if path.stat().st_size > FILE_LIMIT or mh.game_id(path.stem) != path.stem:
            raise ValueError("Bloque local de tiros inválido")
        pid, data = mh.positive_id(path.parent.name), json.loads(path.read_bytes())
        if not isinstance(data, list) or not 1 <= len(data) <= 90 or len({identity("shots", r) for r in data}) != len(data):
            raise ValueError("Eventos de tiros locales inválidos")
        for row in data:
            if (row["player_id"] != pid or row["game_id"] != path.stem or not mh.valid_season(row["season"])
                    or mh.seasons(date.fromisoformat(row["game_date"]))[0] != row["season"]):
                raise ValueError("Clave de tiros local no coincide con el bloque")
            grouped[f'shots/{pid}/{row["season"]}'].append(row)
    changed, updated = 0, {}
    for name, add in grouped.items():
        old = load_part(directory, manifest["parts"][name]) if name in manifest["parts"] else []
        found = {identity("shots", r): r for r in old}
        scope = {r["game_id"] for r in add}
        new_ids = {identity("shots", r) for r in add}
        if len(found) != len(old) or any(mh.game_id(r["game_id"]) in scope and k not in new_ids for k, r in found.items()):
            raise ValueError("Los tiros existentes no concilian con los eventos nuevos")
        for row in add:
            ident = identity("shots", row)
            previous = found.get(ident)
            if previous and (str(previous.get("game_date"))[:10] != row["game_date"] or
                             previous.get("shot_made_flag") not in (None, "", row["shot_made_flag"], str(row["shot_made_flag"]))):
                raise ValueError("El tiro existente no concilia con la fecha o el resultado de la fuente")
            if previous is None:
                changed += 1
                found[ident] = row
        if len(found) != len(old):
            updated[name] = save_part(directory, name, [r for k, r in sorted(found.items())])
    manifest["parts"].update(updated)
    return changed


def coverage(state, pid, opponent, before):
    directory = Path(state) / "archive"
    manifest = json.loads((directory / "manifest.json").read_text())
    selected = mh.seasons(before)
    archive, games, conflicts = mh.plan(directory, set(selected), before.isoformat(), pid, opponent)
    staged, local_marks = mh.local_games(Path(state) / mh.FILENAME)
    archives = defaultdict(set)
    for season in selected:
        meta = manifest["parts"].get(f"shots/{pid}/{season}")
        if meta:
            for row in mh.archive_rows(directory, meta):
                gid = mh.game_id(row.get("game_id"))
                if gid and str(row.get("player_id")) == str(pid):
                    archives[gid].add(row.get("game_event_id"))
    box = box_counts(directory, manifest, pid)
    rows = []
    for g in games:
        gid = g["id"]
        facts = box.get(gid)
        qtd = len(archives[gid])
        shots = "sin-boxscore" if facts is None else "sin-intentos" if facts[0] == 0 else "archivados" if qtd == facts[0] else "preparados" if (Path(state) / SHOTS / str(pid) / (gid + ".json")).exists() else "pendientes"
        marks = "archivadas" if pid in g.get("archived", set()) else "preparadas" if pid in local_marks.get(gid, set()) else "sin-muestra" if gid in staged else "pendientes"
        rows.append((g, facts, shots, marks, qtd))
    return archive, rows, conflicts


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=("plan", "collect"))
    p.add_argument("--project", type=Path, required=True)
    p.add_argument("--player", type=mh.positive_id, required=True)
    p.add_argument("--opponent", choices=sorted(mh.TEAMS))
    p.add_argument("--before", type=date.fromisoformat)
    p.add_argument("--limit", type=int, default=12, help="Máximo de solicitudes a la NBA (1–40)")
    args = p.parse_args()
    today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    before = args.before or today
    if not 1 <= args.limit <= 40 or before > today:
        p.error("Fecha o límite fuera de rango")
    state = args.project / "maintenance-state"
    try:
        archive, rows, conflicts = coverage(state, args.player, args.opponent, before)
    except (OSError, KeyError, TypeError, ValueError) as e:
        p.exit(1, f"No se pudo verificar el archivo local ({type(e).__name__}).\n")
    print(json.dumps({"archivo": archive, "cruces": len(rows), "conflictos": conflicts, "muestra": [
            {"id": g["id"], "fecha": g["date"], "temporada": g["season"], "tiros": shots, "tiros_archivo": archived,
             "fga": counts[0] if counts else None, "marcas": marks} for g, counts, shots, marks, archived in rows]}, ensure_ascii=False, indent=2), flush=True)
    if args.action == "plan":
        return 0
    jobs = [(kind, g, counts) for g, counts, shots, marks, _ in rows
            for kind, needed in (("marcas", marks == "pendientes"), ("tiros", shots == "pendientes")) if needed][:args.limit]
    for i, (kind, g, counts) in enumerate(jobs):
        if i:
            sleep(1.5)
        try:
            if kind == "marcas":
                data = mh.download(g)
                with closing(mh.connect(state / mh.FILENAME)) as db:
                    mh.store_game(db, g, data)
            else:
                data = download_shots(args.player, g, counts)
                atomic_json(state / SHOTS / str(args.player) / (g["id"] + ".json"), data)
            print(f"{g['id']} · {kind}: {len(data)} filas locales verificadas.", flush=True)
        except Exception as e:
            print(f"{g['id']} · {kind}: pendiente ({type(e).__name__}); se conserva lo descargado.", flush=True)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


def integrate_release(state, directory, manifest, save_part, load_part, identity):
    """Los bloques se anexan al mismo índice, bajo el bloqueo del exportador."""
    try:
        count = integrate_shots(state, directory, manifest, save_part, load_part, identity)
        if count:
            print(f"TIROS HISTÓRICOS: {count} filas nuevas conciliadas.", flush=True)
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(f"TIROS HISTÓRICOS: se conservó la cobertura anterior ({type(error).__name__}).", flush=True)
    try:
        # La instalación sobre una copia local conserva el código de usuario.
        try:
            from .qa_playtypes_v26 import archive_parts
        except ModuleNotFoundError as error:
            if error.name != "maintenance_nba.qa_playtypes_v26":
                raise
            from .playtypes_snapshot import archive_parts
        staged = {"parts": {}}
        archive_parts(state, directory, staged, save_part)
        if staged["parts"]:
            manifest["parts"].update(staged["parts"])
            print(f"PERFIL OFENSIVO: {len(staged['parts'])} bloques disponibles.", flush=True)
    except (ImportError, OSError, ValueError, TypeError, KeyError) as error:
        print(f"PERFIL OFENSIVO: se conservó la cobertura anterior ({type(error).__name__}).", flush=True)
