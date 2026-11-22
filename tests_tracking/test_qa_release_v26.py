from datetime import date
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from maintenance_nba.injury_editions import team_editions
from maintenance_nba.qa_context_v26 import SHOTS, integrate_shots, parse_shots


class ReleaseData(unittest.TestCase):
    def test_editions_require_explicit_status(self):
        def row(team, player, status, reason):
            return {"Game Date": "11/21/2026", "Matchup": "NOP @ PHI", "Team": team,
                    "Player Name": player, "Current Status": status, "Reason": reason}
        pending = row("New Orleans Pelicans", float("nan"), "", "NOT YET SUBMITTED")
        active = row("Philadelphia 76ers", "Maxey, Tyrese", "Available", "Soreness")
        unknown = row("Otra fuente", "", "", "")
        parsed = team_editions([pending, active, unknown])
        self.assertEqual(parsed, [
            (date(2026, 11, 21), "NOP@PHI", "New Orleans Pelicans", "pending", []),
            (date(2026, 11, 21), "NOP@PHI", "Philadelphia 76ers", "listed",
             [{"name": "Maxey, Tyrese", "status": "AVAILABLE", "reason": "Soreness"}]),
        ])
        with self.assertRaises(ValueError):
            team_editions([active, {**active, "Current Status": "Out"}])

    def shots(self):
        gid = "0022600282"
        game = {"id": gid, "date": "2026-11-19", "season": "2026-27",
                "expected": {1642264: "SAS"}, "teams": {"SAS", "NOP"}}
        seed = {"HTM": "SAS", "VTM": "NOP", "GAME_DATE": "20261119", "GAME_ID": gid, "PLAYER_ID": 1642264,
                "PLAYER_NAME": "Stephon Castle", "TEAM_ID": 1610612759, "TEAM_NAME": "San Antonio Spurs",
                "SHOT_ATTEMPTED_FLAG": 1, "SHOT_MADE_FLAG": 1, "GAME_EVENT_ID": 30,
                "EVENT_TYPE": "Made Shot", "ACTION_TYPE": "Driving Layup Shot", "SHOT_TYPE": "2PT Field Goal",
                "SHOT_ZONE_BASIC": "Restricted Area", "SHOT_ZONE_AREA": "Center(C)", "SHOT_ZONE_RANGE": "Less Than 8 ft.",
                "PERIOD": 1, "MINUTES_REMAINING": 8, "SECONDS_REMAINING": 2, "SHOT_DISTANCE": 1, "LOC_X": 1, "LOC_Y": 2}
        return game, [seed, {**seed, "SHOT_MADE_FLAG": 0, "EVENT_TYPE": "Missed Shot", "GAME_EVENT_ID": 35}]

    def test_shots_must_match_box_score_and_game(self):
        game, raw = self.shots()
        shots = parse_shots(raw, 1642264, game, (2, 1))
        self.assertEqual((shots[1]["game_event_id"], shots[1]["opponent_abbr"]), (35, "NOP"))
        for counts in [(3, 1), (2, 0)]:
            with self.assertRaises(ValueError):
                parse_shots(raw, 1642264, game, counts)
        with self.assertRaises(ValueError):
            parse_shots([raw[0], {**raw[1], "GAME_DATE": "20261120"}], 1642264, game, (2, 1))

    def test_archive_preserves_old_data_and_refuses_different_event_sets(self):
        game, raw = self.shots()
        shots = parse_shots(raw, 1642264, game, (2, 1))
        name = "shots/1642264/2026-27"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage = root / SHOTS / "1642264" / (game["id"] + ".json")
            stage.parent.mkdir(parents=True)
            stage.write_text(json.dumps(shots))
            store = {"previous": [shots[0]]}
            manifest = {"parts": {name: "previous", "assist-league-v2/rotations/00226002": "untouched"}}
            def save_part(_, key, value):
                store[key] = value
                return key
            def load_part(_, key):
                return store[key]
            def identity(_, row):
                return row["player_id"], row["game_id"], row["game_event_id"]
            self.assertEqual(integrate_shots(root, root, manifest, save_part, load_part, identity), 1)
            self.assertEqual(integrate_shots(root, root, manifest, save_part, load_part, identity), 0)
            self.assertEqual(store[name], shots)
            self.assertEqual(manifest["parts"]["assist-league-v2/rotations/00226002"], "untouched")
            store[name] = [{**shots[0], "game_event_id": 999}]
            with self.assertRaises(ValueError):
                integrate_shots(root, root, manifest, save_part, load_part, identity)
            self.assertEqual(store[name][0]["game_event_id"], 999)

    def test_install_plan_leaves_exporter_and_local_configuration_untouched(self):
        source = Path(__file__).resolve().parents[1]
        original = """def snapshot():
    manifest = {}
    load_part = save_part = None
    manifest['updated_at'] = ''
"""
        with tempfile.TemporaryDirectory(prefix="qa-v26-") as directory:
            root = Path(directory)
            (root / "package.json").write_text("{}")
            (root / ".env").touch()
            (root / ".venv-maintenance/bin").mkdir(parents=True)
            (root / ".venv-maintenance/bin/python").touch()
            py = root / "maintenance_nba"
            py.mkdir()
            (py / "archive.py").write_text(original)
            for name in ("matchup_history.py", "defense_snapshot.py", "rotation_pilot.py"):
                (py / name).touch()
            result = subprocess.run([sys.executable, source / "scripts/operar-nba-v26.py", "--project", root,
                "--quotes-dir", root / "cuotas", "--plan", "--sin-cuotas"], check=True, capture_output=True, text=True)
            self.assertIn("2 temporizadores", result.stdout)
            self.assertEqual((py / "archive.py").read_text(), original)
            self.assertFalse((root / "maintenance-state").exists())


if __name__ == "__main__":
    unittest.main()
