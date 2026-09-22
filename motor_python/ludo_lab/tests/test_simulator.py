from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

from ludo_lab.simulator import compatible_legs, replay, settle_ticket


class SimulatorTests(unittest.TestCase):
    def test_parlay_loss_if_one_leg_loses(self):
        legs = pd.DataFrame({"settlement": ["WIN", "LOSS", "WIN"], "odds": [1.5, 1.6, 1.7]})
        status, profit, _ = settle_ticket(legs, 1000)
        self.assertEqual(status, "LOSS")
        self.assertEqual(profit, -1000)

    def test_push_is_removed_from_parlay_price(self):
        legs = pd.DataFrame({"settlement": ["WIN", "PUSH"], "odds": [2.0, 1.8]})
        status, profit, total = settle_ticket(legs, 1000)
        self.assertEqual(status, "WIN")
        self.assertEqual(total, 2.0)
        self.assertEqual(profit, 1000)

    def test_compatible_legs_limit_same_player(self):
        group = pd.DataFrame({
            "player_key": ["a", "a", "b", "c", "d", "e"],
            "market": ["PTS", "REB", "AST", "PTS", "REB", "AST"],
            "edge_score": [2, 1.9, 1.8, 1.7, 1.6, 1.5],
            "odds": [1.5] * 6,
        })
        config = {"max_same_player_legs": 1, "max_same_market_per_ticket": 2}
        chosen = compatible_legs(group, 5, config)
        self.assertEqual(len(chosen), 5)
        self.assertEqual(chosen.player_key.nunique(), 5)

    def test_replay_persists_singles_parlay_and_balance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rows = []
            for index in range(5):
                rows.append({
                    "event_date": "2026-05-20", "player_name": f"Jugador {index}",
                    "matchup": "AAA vs BBB", "market": ["PTS", "REB", "AST", "PTS", "REB"][index],
                    "side": "OVER", "line": 10.5, "odds": 2.0, "projection": 13.0,
                    "actual": 15.0 if index < 4 else 8.0, "edge_score": 1.5 - index * 0.1,
                    "settlement": "WIN" if index < 4 else "LOSS", "mode": "STATIC",
                    "snapshot_file": "synthetic.csv",
                })
            settled = root / "settled.csv"
            pd.DataFrame(rows).to_csv(settled, index=False)
            config = root / "config.json"
            config.write_text(json.dumps({
                "initial_bankroll": 100000, "stake_per_ticket": 1000,
                "allow_negative_balance": True, "create_singles": True,
                "create_game_parlays": True, "game_parlay_min_legs": 5,
                "game_parlay_max_legs": 5, "create_slate_parlays": False,
                "slate_parlay_legs": 5, "max_same_player_legs": 1,
                "max_same_market_per_ticket": 2, "odds_method": "SIMULATED_PRODUCT_ODDS",
            }), encoding="utf-8")
            database = root / "lab.db"
            replay(SimpleNamespace(
                settled=str(settled), config=str(config), db=str(database),
                output_dir=str(root / "out"), run_name="test_run",
            ))
            connection = sqlite3.connect(database)
            tickets = connection.execute("SELECT count(*) FROM tickets").fetchone()[0]
            final = connection.execute("SELECT final_balance FROM simulation_runs").fetchone()[0]
            self.assertEqual(tickets, 6)
            self.assertEqual(final, 102000)


if __name__ == "__main__":
    unittest.main()
