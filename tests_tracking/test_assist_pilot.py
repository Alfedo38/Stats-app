from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from maintenance_nba.assist_pilot import reconcile, sdk_fetch, v3_inputs, zone
from maintenance_nba.rotation_pilot import Unverified

GAME = "0022600278"
DAY = "2026-11-19"


def fixtures():
    def team(tid, abbr, ids):
        return {"teamId": tid, "teamTricode": abbr, "players": [
            {"personId": pid, "statistics": {"assists": 2 if pid == 11 else 0,
                                             "fieldGoalsMade": 2 if pid == 12 else int(pid == 22)}}
            for pid in ids
        ]}
    box = {"game": {"gameId": GAME, "gameStatus": 3, "gameTimeUTC": "2026-11-20T01:00:00Z",
                    "homeTeam": team(1, "SAS", range(11, 16)), "awayTeam": team(2, "LAC", range(21, 26))}}
    pbp = {"game": {"gameId": GAME, "actions": [
        {"actionNumber": 1, "teamId": 1, "personId": 12, "assistPersonId": 11, "actionType": "2pt", "shotResult": "Made", "shotDistance": 1},
        {"actionNumber": 2, "teamId": 1, "personId": 12, "assistPersonId": 11, "actionType": "3pt", "shotResult": "Made", "xLegacy": -225, "yLegacy": 40},
        {"actionNumber": 3, "teamId": 2, "personId": 22, "actionType": "2pt", "shotResult": "Made", "shotDistance": 14},
        {"actionNumber": 4, "teamId": 1, "personId": 12, "actionType": "3pt", "shotResult": "Missed"},
        {"actionNumber": 5, "teamId": 1, "personId": 12, "actionType": "freethrow", "shotResult": "Made"},
    ]}}
    return box, pbp


def fixtures_v3():
    box, pbp = fixtures()
    game = box["game"]
    header = {k: game[k] for k in ("gameId", "gameStatus", "gameTimeUTC")}
    names = {11: ("Stephon", "Castle"), 12: ("Victor", "Wembanyama")}
    teams = {}
    for key in ("awayTeam", "homeTeam"):
        team = game[key]
        header[key+"Id"] = team["teamId"]
        for row in team["players"]:
            pid = row["personId"]
            first, last = names.get(pid, ("Jugador", f"Apellido{pid}"))
            row.update(firstName=first, familyName=last, nameI=f"{first[0]}. {last}")
            row["statistics"]["threePointersMade"] = int(pid == 12)
        teams[key] = team
    actions = pbp["game"]["actions"]
    for i, row in enumerate(actions):
        row.update(actionId=100+i, description=f"Tiro {i}")
        row["isFieldGoal"] = int(row["actionType"] in ("2pt", "3pt"))
        if row["isFieldGoal"]:
            row["shotValue"] = int(row["actionType"][0])
    actions[0]["description"] += " (S. Castle 1 AST)"
    actions[1]["description"] += " (Castle 2 AST)"
    # La segunda fuente identifica al pasador por texto, no por personId.
    for row in actions:
        row.pop("assistPersonId", None)
    return {"boxScoreSummary": header}, {"boxScoreTraditional": {"gameId": GAME, **teams}}, pbp


class TestAssistPilot(unittest.TestCase):
    def test_connections_only_count_verified_assisted_baskets(self):
        box, pbp = fixtures()
        report = reconcile(GAME, DAY, box, pbp, "SAS")
        self.assertEqual((report["checkedAssists"], report["checkedFgm"]), (2, 3))
        self.assertEqual(report["zones"]["aro"], 1)
        self.assertEqual(report["zones"]["triple_esquina"], 1)
        self.assertEqual({(r["passerId"], r["shooterId"]) for r in report["connections"]}, {(11, 12)})

    def test_rejects_missing_assister_duplicate_shot_and_wrong_date(self):
        box, pbp = fixtures()
        missing = deepcopy(pbp)
        del missing["game"]["actions"][0]["assistPersonId"]
        with self.assertRaisesRegex(Unverified, "AST_NO_COINCIDE"):
            reconcile(GAME, DAY, box, missing, "SAS")
        duplicate = deepcopy(pbp)
        duplicate["game"]["actions"].append(duplicate["game"]["actions"][0])
        with self.assertRaisesRegex(Unverified, "DUPLICADA"):
            reconcile(GAME, DAY, box, duplicate, "SAS")
        with self.assertRaisesRegex(Unverified, "FECHA_ARG_DISTINTA"):
            reconcile(GAME, "2026-11-20", box, pbp, "SAS")

    def test_excludes_ongoing_and_uses_unknown_zone_without_coordinates(self):
        box, pbp = fixtures()
        box["game"]["gameStatus"] = 2
        with self.assertRaisesRegex(Unverified, "NO_FINALIZADO"):
            reconcile(GAME, DAY, box, pbp, "SAS")
        self.assertEqual(zone({"shotDistance": 24}, three=True), "sin_zona")
        self.assertEqual(zone({"xLegacy": 20, "yLegacy": 231}, three=True), "triple_frontal")

    def test_same_coordinates_keep_zone_when_v3_rounds_reported_distance(self):
        coordinates = {"xLegacy": -37, "yLegacy": 9}
        self.assertEqual(zone({**coordinates, "shotDistance": 4}, False), "aro")
        self.assertEqual(zone({**coordinates, "shotDistance": 3.77}, False), "aro")
        self.assertEqual(zone({"shotDistance": 5}, False), "otros_dobles")

    def test_v3_reconstructs_from_same_team_names_and_official_shot_value(self):
        summary, traditional, pbp = fixtures_v3()
        # El mismo apellido en el rival no hace ambiguo al jugador de SAS.
        traditional["boxScoreTraditional"]["awayTeam"]["players"][0]["familyName"] = "Castle"
        box, plays = v3_inputs(GAME, DAY, summary, traditional, pbp)
        report = reconcile(GAME, DAY, box, plays, "SAS")
        self.assertEqual(report["checkedAssists"], 2)
        self.assertEqual(report["zones"]["triple_esquina"], 1)
        self.assertEqual({(r["passerId"], r["shooterId"]) for r in report["connections"]}, {(11, 12)})

    def test_v3_rejects_ambiguous_teammate_and_missing_ordinal(self):
        summary, traditional, pbp = fixtures_v3()
        ambiguous = deepcopy(traditional)
        ambiguous["boxScoreTraditional"]["homeTeam"]["players"][2]["familyName"] = "Castle"
        with self.assertRaisesRegex(Unverified, "ASISTIDOR_V3_AMBIGUO"):
            v3_inputs(GAME, DAY, summary, ambiguous, pbp)
        gap = deepcopy(pbp)
        gap["game"]["actions"][1]["description"] = "Tiro (Castle 3 AST)"
        with self.assertRaisesRegex(Unverified, "SECUENCIA_AST_V3"):
            v3_inputs(GAME, DAY, summary, traditional, gap)

    def test_v3_rejects_wrong_team_and_wrong_three_count(self):
        summary, traditional, pbp = fixtures_v3()
        wrong_team = deepcopy(summary)
        wrong_team["boxScoreSummary"]["homeTeamId"] = 3
        with self.assertRaisesRegex(Unverified, "EQUIPOS_DE_FUENTE_DISTINTOS"):
            v3_inputs(GAME, DAY, wrong_team, traditional, pbp)
        wrong_value = deepcopy(pbp)
        wrong_value["game"]["actions"][1]["shotValue"] = 2
        with self.assertRaisesRegex(Unverified, "TRIPLES_NO_COINCIDEN"):
            v3_inputs(GAME, DAY, summary, traditional, wrong_value)

    def test_sdk_uses_live_class_defaults_and_requests_all_v3_periods(self):
        with TemporaryDirectory() as temp:
            for kind, cls, module_name, extra in (
                ("boxscore", "BoxScore", "nba_api.live.nba.endpoints.boxscore", {}),
                ("playbyplayv3", "PlayByPlayV3", "nba_api.stats.endpoints.playbyplayv3", {"start_period": 0, "end_period": 0}),
            ):
                calls = []
                def factory(**kwargs):
                    calls.append(kwargs)
                    return SimpleNamespace(get_dict=lambda: {"ok": True})
                with patch("maintenance_nba.assist_pilot.import_module", return_value=SimpleNamespace(**{cls: factory})) as import_, patch(
                    "maintenance_nba.assist_pilot.time.sleep"
                ):
                    path = Path(temp) / f"{kind}.json"
                    sdk_fetch(kind, GAME, path)
                    import_.assert_called_once_with(module_name)
                    self.assertEqual(calls, [{"game_id": GAME, "timeout": 12, **extra}])
                    self.assertEqual(json.loads(path.read_text()), {"ok": True})

    def test_cli_stats_offline_accepts_verified_fixture(self):
        with TemporaryDirectory() as temp:
            project = Path(temp)
            (project / "package.json").write_text("{}")
            raw = project / "maintenance-state" / "assist-pilot" / "raw"
            raw.mkdir(parents=True)
            kinds = ("boxscoresummaryv3", "boxscoretraditionalv3", "playbyplayv3")
            for name, data in zip(kinds, fixtures_v3()):
                (raw / f"{name}_{GAME}.json").write_text(json.dumps(data))
            run = subprocess.run([sys.executable, "-m", "maintenance_nba.assist_pilot", "--project", temp,
                                  "--source", "stats", "--offline", "--before", "2026-11-21",
                                  "--game", f"{GAME}:{DAY}"], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            target, = (project / "maintenance-state" / "assist-pilot" / "reports").glob("*.json")
            result = json.loads(target.read_text())
            self.assertEqual(result["verified"][0]["checkedAssists"], 2)
            self.assertEqual(set(result["verified"][0]["sha256"]), set(kinds))

    def test_offline_writes_auditable_result_with_no_database(self):
        with TemporaryDirectory() as temp:
            project = Path(temp)
            (project / "package.json").write_text("{}")
            raw = project / "maintenance-state" / "rotation-pilot" / "raw"
            raw.mkdir(parents=True)
            box, pbp = fixtures()
            for name, data in (("boxscore", box), ("playbyplay", pbp)):
                (raw / f"{name}_{GAME}.json").write_text(json.dumps(data))
            run = subprocess.run([sys.executable, "-m", "maintenance_nba.assist_pilot", "--project", temp,
                                  "--offline", "--before", "2026-11-21", "--game", f"{GAME}:{DAY}"],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            target, = (project / "maintenance-state" / "assist-pilot" / "reports").glob("*.json")
            report = json.loads(target.read_text())
            self.assertEqual(report["verified"][0]["checkedAssists"], 2)
            self.assertEqual(len(report["verified"][0]["sha256"]["playbyplay"]), 64)
            self.assertEqual(report["excluded"], [])


if __name__ == "__main__":
    unittest.main()
