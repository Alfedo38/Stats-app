from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import gzip
import hashlib
import json
import unittest
from unittest.mock import patch

from maintenance_nba.assist_league import PART, archive_calendar, archive_parts, chunk_key, main
from maintenance_nba.assist_snapshot import KINDS
from maintenance_nba.playtypes_snapshot import normalize
from maintenance_nba.rotation_pilot import atomic_json, Unverified
from test_assist_pilot import DAY, GAME, fixtures_v3


def save_part(directory, key, rows):
    data = gzip.compress(json.dumps(rows).encode(), mtime=0)
    digest = hashlib.sha256(data).hexdigest()
    relative = Path('objects', key, digest+'.json.gz')
    target = directory / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path":relative.as_posix(), "sha256":digest, "bytes":len(data), "rows":len(rows)}


class LeagueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.project = Path(self.tmp.name)
        self.project.joinpath("package.json").write_text("{}")
        self.state = self.project / "maintenance-state"
        self.archive = self.state / "archive"
        self.pending = "0022600279"
        rows = [[{"game_id": GAME, "game_date": DAY, "team_abbreviation": team}] for team in ("SAS", "LAC")]
        rows.append([{"game_id": self.pending, "game_date": DAY, "team_abbreviation": "LAC"}])
        rows.append([{"game_id": self.pending, "game_date": DAY, "team_abbreviation": "BOS"}])
        parts = {f"facts/{i}": save_part(self.archive, f"facts/{i}", part) for i, part in enumerate(rows)}
        atomic_json(self.archive / "manifest.json", {"parts": parts})
        fixtures = fixtures_v3()
        # Starts after midnight in Argentina, but belongs to the Nov 19 NBA slate.
        fixtures[0]["boxScoreSummary"]["gameTimeUTC"] = "2026-11-20T03:30:00Z"
        for side in ("homeTeam", "awayTeam"):
            for row in fixtures[1]["boxScoreTraditional"][side]["players"]:
                row["statistics"]["minutes"] = "10:00"
        for kind, data in zip(KINDS["stats"], fixtures):
            atomic_json(self.state / "assist-pilot" / "raw" / f"{kind}_{GAME}.json", data)

    def cli(self, *args):
        stdout = StringIO()
        with patch("sys.argv", ["assist_league", "--project", str(self.project), "--output-project",
                                  str(self.project), "--source", "stats", "--from", DAY, "--through", DAY, *args]), \
                patch("maintenance_nba.assist_league.datetime") as clock, redirect_stdout(stdout):
            from datetime import datetime
            clock.now.return_value = datetime.fromisoformat("2026-11-20T12:00:00-03:00")
            result = main()
        return result, stdout.getvalue()

    def test_league_plan_is_read_only_and_deduplicates_teams(self):
        self.assertEqual(archive_calendar(self.project, DAY, DAY)[GAME], (DAY, {"SAS", "LAC"}))
        code, output = self.cli("--plan")
        self.assertEqual(code, 0)
        self.assertIn("2 partidos únicos", output)
        self.assertFalse((self.state / "assist-league").exists())

    def test_partial_coverage_publishes_only_verified_games_and_can_resume(self):
        self.assertEqual(self.cli("--offline")[0], 0)
        root = self.state / "assist-league"
        games = json.loads((root / "parts" / "games" / f"{chunk_key(GAME)}.json").read_text())
        self.assertEqual([g["id"] for g in games], [GAME])
        self.assertEqual([r[0] for r in games[0]["rosters"]], ["LAC", "SAS"])
        admitted = json.loads((root / "parts" / "rivals" / "26" / "LAC.json").read_text())
        self.assertEqual(dict((row[1], row[2]) for row in admitted),
                         {GAME:[1,0,1,0,0], self.pending:None})
        self.assertIn("1 verificados · 1 pendientes", self.cli("--plan")[1])
        manifest = {"parts": {}}
        archive_parts(self.state, self.archive, manifest, save_part)
        self.assertIn(f"{PART}/games/{chunk_key(GAME)}", manifest["parts"])
        self.assertIn(f"{PART}/rivals/26/LAC", manifest["parts"])
        self.assertNotIn(f"{PART}/rivals/26/NYK", manifest["parts"])

    def test_profile_uses_per_game_points_and_rejects_conflicting_efficiency(self):
        row = {"SEASON_ID": "22026", "PLAY_TYPE": "Transition", "TYPE_GROUPING": "offensive",
               "PLAYER_ID": 11, "POSS": 30, "PTS": 36, "GP": 6, "PPP": 1.2}
        self.assertEqual(normalize([row], "Transition", False, "2026-27")["11"], [6,1.2,6,30])
        row["PPP"]=.8
        with self.assertRaises(Unverified):
            normalize([row], "Transition", False, "2026-27")
