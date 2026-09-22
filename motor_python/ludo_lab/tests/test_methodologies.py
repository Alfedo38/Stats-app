from __future__ import annotations

import unittest

import pandas as pd

from ludo_lab.methodologies import (
    add_balances,
    build_methodologies,
    canonical_game_id,
    choose_method_legs,
    methodology_summary,
    normalize_candidates,
)


CONFIG = {
    "experiment_name": "test",
    "required_mode": "ADAPTIVE",
    "required_status": "ACTIVE",
    "initial_bankroll": 100000,
    "stake_per_ticket": 1000,
    "max_same_player_per_ticket": 1,
    "rule_reliability": {"PRA|UNDER": 0.82, "PF|UNDER": 0.76, "REB|UNDER": 0.73},
    "methods": [],
}


def method(name, legs, game_mode="ANY", kind="parlay"):
    return {
        "name": name, "kind": kind, "legs": legs, "game_mode": game_mode,
        "min_edge_score": 0.8, "min_rule_reliability": 0.72,
        "max_same_market": 3, "max_same_game": legs,
    }


def row(number, matchup, **changes):
    base = {
        "event_date": "2026-06-01", "player_name": f"Jugador {number}",
        "matchup": matchup, "market": "PRA", "side": "UNDER", "line": 30.5,
        "odds": 1.8, "edge_score": 1.2, "mode": "ADAPTIVE",
        "strategy_status": "ACTIVE", "settlement": "WIN",
    }
    base.update(changes)
    return base


class MethodologyTests(unittest.TestCase):
    def test_reverse_matchups_are_same_game(self):
        first = canonical_game_id("2026-06-01", "NYK vs CLE")
        second = canonical_game_id("2026-06-01", "CLE @ NYK")
        self.assertEqual(first, second)

    def test_same_game_uses_only_one_canonical_game(self):
        frame = pd.DataFrame([
            row(1, "NYK vs CLE"), row(2, "CLE @ NYK", market="PF"),
            row(3, "NYK vs CLE", market="REB"), row(4, "SAS vs OKC"),
        ])
        normalized = normalize_candidates(frame, CONFIG)
        picked = choose_method_legs(normalized, method("X3_SAME", 3, "SAME_GAME"))
        self.assertEqual(len(picked), 3)
        self.assertEqual(picked.canonical_game_id.nunique(), 1)

    def test_cross_game_uses_distinct_games(self):
        frame = pd.DataFrame([
            row(1, "NYK vs CLE"), row(2, "SAS vs OKC", market="PF"),
            row(3, "BOS vs MIA", market="REB"), row(4, "CLE @ NYK"),
        ])
        normalized = normalize_candidates(frame, CONFIG)
        picked = choose_method_legs(normalized, method("X3_CROSS", 3, "CROSS_GAME"))
        self.assertEqual(len(picked), 3)
        self.assertEqual(picked.canonical_game_id.nunique(), 3)

    def test_method_does_not_repeat_player(self):
        frame = pd.DataFrame([
            row(1, "NYK vs CLE"), row(1, "SAS vs OKC", market="PF"),
            row(2, "BOS vs MIA", market="REB"),
        ])
        normalized = normalize_candidates(frame, CONFIG)
        picked = choose_method_legs(normalized, method("X2", 2))
        self.assertEqual(len(picked), 2)
        self.assertEqual(picked.method_player_key.nunique(), 2)

    def test_builds_single_and_parlay_as_separate_methods(self):
        config = dict(CONFIG)
        config["methods"] = [method("SINGLE", 1, kind="single"), method("X2", 2)]
        frame = normalize_candidates(pd.DataFrame([
            row(1, "NYK vs CLE"), row(2, "SAS vs OKC", market="PF")
        ]), config)
        tickets, legs = build_methodologies(frame, config)
        self.assertEqual((tickets.method == "SINGLE").sum(), 2)
        self.assertEqual((tickets.method == "X2").sum(), 1)
        self.assertEqual(len(legs), 4)

    def test_balances_and_drawdown_are_reported(self):
        config = dict(CONFIG)
        config["methods"] = [method("SINGLE", 1, kind="single")]
        frame = normalize_candidates(pd.DataFrame([
            row(1, "NYK vs CLE", settlement="LOSS"),
            row(2, "SAS vs OKC", event_date="2026-06-02", settlement="WIN", odds=2.0),
        ]), config)
        tickets, _ = build_methodologies(frame, config)
        balanced = add_balances(tickets, config)
        summary = methodology_summary(balanced, config).iloc[0]
        self.assertEqual(summary.final_method_balance, 100000)
        self.assertEqual(summary.max_drawdown, 1000)
        self.assertAlmostEqual(summary.max_drawdown_pct, 0.01)


if __name__ == "__main__":
    unittest.main()
