import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from ludo_lab.shadow_live import export_daily, init_db, pending, prepare, report, settle


class ShadowLiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "shadow.db"
        self.config = self.root / "config.json"
        self.predictions = self.root / "predictions.csv"
        self.results = self.root / "results.csv"
        cfg = {
            "version": "test", "initial_bankroll": 100000.0, "stake": 1000.0,
            "active_rules": ["PRA|UNDER", "REB|UNDER", "RA|OVER", "PF|UNDER"],
            "odds": {"min": 1.2, "max": 3.0},
            "selection": {"min_probability": 0.50, "min_ev": -0.20},
            "challenger": {"enabled": True, "player_market_window": 10,
                           "min_player_market_history": 2, "shrinkage": 1.0,
                           "max_abs_correction_mae": 0.5},
            "portfolios": [
                {"name": "CONTROL_SINGLE_TOP5", "legs": 1, "tickets": 5, "min_probability": 0.5, "min_ev": -0.2},
                {"name": "BALANCED_X2", "legs": 2, "tickets": 1, "min_probability": 0.5, "min_ev": -0.2},
                {"name": "EXPERIMENTAL_X5", "legs": 5, "tickets": 1, "min_probability": 0.5, "min_ev": -0.2},
            ],
            "promotion": {"min_settled_picks": 100, "min_dates": 20,
                          "max_best_day_profit_share": 0.35},
        }
        self.config.write_text(json.dumps(cfg), encoding="utf-8")
        rows = []
        for idx, name in enumerate(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]):
            rows.append({"player_id": idx + 1, "player_name": name, "matchup": "AAA vs BBB",
                         "event_date": "2026-10-21",
                         "prop_type": "PRA", "side": "UNDER", "line": 30.5 + idx,
                         "price": 1.8, "proj": 24.0 + idx, "model_mae": 5.0,
                         "model_key": "test", "candidate_basic": True})
        rows.append({"player_id": 1, "player_name": "Alpha", "matchup": "AAA vs BBB",
                     "event_date": "2026-10-21",
                     "prop_type": "PRA", "side": "UNDER", "line": 31.5,
                     "price": 1.6, "proj": 24.0, "model_mae": 5.0,
                     "model_key": "test", "candidate_basic": True})
        pd.DataFrame(rows).to_csv(self.predictions, index=False)
        pd.DataFrame([{"player_id": i + 1, "player_name": name, "pts": 10, "reb": 5, "ast": 5,
                       "fgm": 4, "fga": 10, "fg3m": 1, "fg3a": 4, "ftm": 1,
                       "fta": 2, "stl": 1, "blk": 0, "tov": 2, "pf": 2}
                      for i, name in enumerate(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"])]).to_csv(self.results, index=False)

    def tearDown(self):
        self.tmp.cleanup()

    def test_init_creates_ledger(self):
        init_db(self.db)
        with sqlite3.connect(self.db) as con:
            self.assertEqual(con.execute("select value from schema_meta where key='schema_version'").fetchone()[0], "1")

    def test_prepare_is_immutable_and_idempotent(self):
        first = prepare(self.predictions, "2026-10-21", self.db, self.config, run_id="run_test")
        second = prepare(self.predictions, "2026-10-21", self.db, self.config, run_id="run_test")
        self.assertFalse(first["already_exists"])
        self.assertTrue(second["already_exists"])
        self.assertEqual(first["picks"], second["picks"])
        changed = pd.read_csv(self.predictions); changed.loc[0, "line"] = 99; changed.to_csv(self.predictions, index=False)
        with self.assertRaisesRegex(ValueError, "inmutables"):
            prepare(self.predictions, "2026-10-21", self.db, self.config, run_id="run_test")

    def test_event_date_is_inferred_from_predictions(self):
        result = prepare(self.predictions, None, self.db, self.config, run_id="run_inferred")
        self.assertFalse(result["already_exists"])
        with sqlite3.connect(self.db) as con:
            date = con.execute("select event_date from runs where run_id='run_inferred'").fetchone()[0]
        self.assertEqual(date, "2026-10-21")

    def test_one_line_and_no_repeated_player_inside_parlay(self):
        prepare(self.predictions, "2026-10-21", self.db, self.config, run_id="run_lines")
        with sqlite3.connect(self.db) as con:
            duplicates = con.execute("""select count(*) from (
                select branch,player_key,market,side,count(*) n from picks
                group by branch,player_key,market,side having n>1)""").fetchone()[0]
            repeated = con.execute("""select count(*) from (
                select l.ticket_id,p.player_key,count(*) n from ticket_legs l join picks p on p.pick_id=l.pick_id
                group by l.ticket_id,p.player_key having n>1)""").fetchone()[0]
        self.assertEqual(duplicates, 0)
        self.assertEqual(repeated, 0)

    def test_settlement_is_idempotent_and_financial_log_appends_once(self):
        prepare(self.predictions, "2026-10-21", self.db, self.config, run_id="run_settle")
        first = settle(self.results, "2026-10-21", self.db)
        second = settle(self.results, "2026-10-21", self.db)
        self.assertGreater(first["picks_settled"], 0)
        self.assertEqual(second, {"picks_settled": 0, "tickets_settled": 0})
        with sqlite3.connect(self.db) as con:
            tickets = con.execute("select count(*) from ticket_settlements").fetchone()[0]
            events = con.execute("select count(*) from bankroll_events").fetchone()[0]
        self.assertEqual(tickets, events)
        files = export_daily("2026-10-21", self.db, self.root / "reports")
        self.assertTrue(all(Path(path).is_file() for path in files.values()))

    def test_pending_and_promotion_gate(self):
        prepare(self.predictions, "2026-10-21", self.db, self.config, run_id="run_report")
        self.assertGreater(len(pending(self.db)), 0)
        settle(self.results, "2026-10-21", self.db)
        self.assertEqual(len(pending(self.db)), 0)
        result = report(self.db, self.config)
        self.assertFalse(result["enough_sample"])


if __name__ == "__main__":
    unittest.main()
