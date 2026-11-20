import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from hashlib import sha256

from maintenance_nba.assist_pilot import SOURCES, reconcile
from maintenance_nba.assist_snapshot import PART, SNAPSHOT, archive_part, build_snapshot
from maintenance_nba.rotation_pilot import Unverified
from test_assist_pilot import DAY, GAME, fixtures


class TestAssistSnapshot(unittest.TestCase):
    def make_report(self, project):
        box, pbp = fixtures()
        for side in ("awayTeam", "homeTeam"):
            for p in box["game"][side]["players"]:
                p["name"] = f"Jugador {p['personId']}"
                p["played"] = "1"
        # Una persona en el boxscore no necesariamente entró al partido.
        box["game"]["homeTeam"]["players"].append({
            "personId": 16, "name": "Suplente DNP", "played": "0",
            "statistics": {"assists": 0, "fieldGoalsMade": 0},
        })
        raw = project / "maintenance-state" / "assist-pilot" / "raw"
        raw.mkdir(parents=True)
        hashes = {}
        for kind, data in (("boxscore", box), ("playbyplay", pbp)):
            payload = json.dumps(data).encode()
            (raw / f"{kind}_{GAME}.json").write_bytes(payload)
            hashes[kind] = sha256(payload).hexdigest()
        return {"version": 1, "season": "2026-27", "source": SOURCES["nba-api"], "team": "SAS",
                "excluded": [], "verified": [{**reconcile(GAME, DAY, box, pbp, "SAS"), "sha256": hashes}]}

    def test_snapshot_has_compact_counts_distinguishes_dnp_and_can_be_archived(self):
        with TemporaryDirectory() as tmp:
            project = Path(tmp)
            data = build_snapshot(project, self.make_report(project))
            game, = data["games"]
            self.assertIn(13, game["rosters"][1][1])
            self.assertNotIn(16, game["rosters"][1][1])
            self.assertNotIn("16", data["names"])
            self.assertEqual(game["pairs"], [[11, 12, 0, 1], [11, 12, 2, 1]])
            self.assertNotIn("actions", game)
            state = project / "maintenance-state"
            path = state / SNAPSHOT
            path.write_text(json.dumps(data))
            manifest = {"parts": {}}
            archive_part(state, None, manifest, lambda directory, key, payload: payload)
            self.assertEqual(manifest["parts"][PART], data)

    def test_report_changed_after_conciliation_is_rejected(self):
        with TemporaryDirectory() as tmp:
            project = Path(tmp)
            report = self.make_report(project)
            report["verified"][0]["connections"][0]["assists"] = 9
            with self.assertRaisesRegex(Unverified, "INFORME_DISTINTO_DE_LA_FUENTE"):
                build_snapshot(project, report)

    def test_saved_inputs_must_match_report(self):
        with TemporaryDirectory() as tmp:
            project = Path(tmp)
            report = self.make_report(project)
            report["verified"][0]["sha256"]["playbyplay"] = "a"*64
            with self.assertRaisesRegex(Unverified, "NO_COINCIDE_PLAYBYPLAY"):
                build_snapshot(project, report)


if __name__ == "__main__":
    unittest.main()
