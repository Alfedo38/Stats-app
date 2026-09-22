from __future__ import annotations

import unittest

import pandas as pd

from ludo_lab.strategy import classify_strategy, summarize_strategy


CONFIG = {
    "strategy_name": "test_strategy",
    "required_mode": "ADAPTIVE",
    "default_min_edge_score": 0.8,
    "active_rules": [
        {"market": "PRA", "side": "UNDER"},
        {"market": "REB", "side": "UNDER"},
    ],
    "watchlist_rules": [{"market": "PA", "side": "UNDER"}],
    "blocked_rules": [{"market": "PRA", "side": "OVER"}],
}


def row(**changes):
    base = {
        "event_date": "2026-06-01", "player_name": "Jugador Uno", "matchup": "AAA vs BBB",
        "market": "PRA", "side": "UNDER", "line": 30.5, "odds": 1.8,
        "projection": 27.0, "actual": 26.0, "edge_score": 1.2,
        "settlement": "WIN", "profit_units": 0.8, "mode": "ADAPTIVE",
        "strategy_source_file": "test.csv",
    }
    base.update(changes)
    return base


class StrategyTests(unittest.TestCase):
    def test_only_adaptive_approved_side_is_active(self):
        frame = pd.DataFrame([
            row(),
            row(player_name="Jugador Dos", mode="STATIC"),
            row(player_name="Jugador Tres", side="OVER"),
            row(player_name="Jugador Cuatro", market="PA"),
        ])
        result = classify_strategy(frame, CONFIG)
        statuses = dict(zip(result.player_name, result.strategy_status))
        self.assertEqual(statuses["Jugador Uno"], "ACTIVE")
        self.assertEqual(statuses["Jugador Dos"], "BLOCKED")
        self.assertEqual(statuses["Jugador Tres"], "BLOCKED")
        self.assertEqual(statuses["Jugador Cuatro"], "WATCHLIST")

    def test_low_edge_is_blocked(self):
        result = classify_strategy(pd.DataFrame([row(edge_score=0.79)]), CONFIG)
        self.assertEqual(result.iloc[0].strategy_status, "BLOCKED")
        self.assertIn("edge", result.iloc[0].strategy_reason)

    def test_duplicate_keeps_highest_edge(self):
        frame = pd.DataFrame([row(edge_score=1.0), row(edge_score=1.4, odds=1.7)])
        result = classify_strategy(frame, CONFIG)
        active = result[result.strategy_status == "ACTIVE"]
        self.assertEqual(len(active), 1)
        self.assertEqual(active.iloc[0].edge_score, 1.4)
        self.assertEqual((result.strategy_reason == "pick duplicado").sum(), 1)

    def test_summary_calculates_units_and_roi(self):
        frame = classify_strategy(pd.DataFrame([
            row(player_name="A", settlement="WIN", profit_units=0.8),
            row(player_name="B", settlement="LOSS", profit_units=-1.0),
        ]), CONFIG)
        summary = summarize_strategy(frame)
        active = summary[summary.status == "ACTIVE"].iloc[0]
        self.assertEqual(active.picks, 2)
        self.assertAlmostEqual(active.units, -0.2)
        self.assertAlmostEqual(active.roi, -0.1)


if __name__ == "__main__":
    unittest.main()
