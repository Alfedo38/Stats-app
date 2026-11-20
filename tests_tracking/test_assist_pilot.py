from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from maintenance_nba.assist_pilot import reconcile, zone
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
