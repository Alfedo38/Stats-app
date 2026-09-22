from __future__ import annotations

import unittest

import pandas as pd

from ludo_lab.parlays import build_parlays, normalize_candidates, settle_parlay


CONFIG = {
    "strategy_name": "test",
    "required_mode": "ADAPTIVE",
    "required_status": "ACTIVE",
    "stake_per_ticket": 1000,
    "max_same_player_per_ticket": 1,
    "max_same_market_per_ticket": 2,
    "max_leg_uses_per_date": 1,
    "rule_reliability": {"PRA|UNDER": 0.82, "PF|UNDER": 0.76, "REB|UNDER": 0.73},
    "tiers": [{
        "name": "CONSERVATIVE_X2", "legs": 2, "min_edge_score": 1.0,
        "min_rule_reliability": 0.72, "max_same_matchup_per_ticket": 1,
        "max_tickets_per_date": 1,
    }],
}


def row(number: int, **changes):
    base = {
        "event_date": "2026-06-01", "player_name": f"Jugador {number}",
        "matchup": f"T{number} vs X{number}", "market": "PRA", "side": "UNDER",
        "line": 30.5, "odds": 1.8, "edge_score": 1.2, "mode": "ADAPTIVE",
        "strategy_status": "ACTIVE", "settlement": "WIN",
    }
    base.update(changes)
    return base


class ParlayTests(unittest.TestCase):
    def test_rejects_static_and_non_active_rows(self):
        frame = pd.DataFrame([
            row(1), row(2, mode="STATIC"), row(3, strategy_status="WATCHLIST")
        ])
        result = normalize_candidates(frame, CONFIG)
        self.assertEqual(result.player_name.tolist(), ["Jugador 1"])

    def test_ticket_uses_different_players_and_matchups(self):
        frame = normalize_candidates(pd.DataFrame([
            row(1, matchup="AAA vs BBB"),
            row(2, matchup="AAA vs BBB", edge_score=1.5),
            row(3, matchup="CCC vs DDD", market="PF", edge_score=1.1),
        ]), CONFIG)
        tickets, legs = build_parlays(frame, CONFIG)
        self.assertEqual(len(tickets), 1)
        self.assertEqual(legs.player_name.nunique(), 2)
        self.assertEqual(legs.matchup.nunique(), 2)

    def test_does_not_force_ticket_without_enough_legs(self):
        frame = normalize_candidates(pd.DataFrame([row(1, edge_score=0.9)]), CONFIG)
        tickets, legs = build_parlays(frame, CONFIG)
        self.assertTrue(tickets.empty)
        self.assertTrue(legs.empty)

    def test_one_losing_leg_loses_parlay(self):
        legs = pd.DataFrame({"odds": [1.8, 1.7], "settlement": ["WIN", "LOSS"]})
        status, profit, total_odds = settle_parlay(legs, 1000)
        self.assertEqual(status, "LOSS")
        self.assertEqual(profit, -1000)
        self.assertAlmostEqual(total_odds, 3.06)

    def test_pending_ticket_has_no_profit(self):
        legs = pd.DataFrame({"odds": [1.8, 1.7], "settlement": ["WIN", "PENDING"]})
        status, profit, _ = settle_parlay(legs, 1000)
        self.assertEqual(status, "PENDING")
        self.assertIsNone(profit)

    def test_builds_x2_x3_and_x5_without_x10(self):
        config = dict(CONFIG)
        config["max_leg_uses_per_date"] = 2
        config["tiers"] = [
            {"name": "CONSERVATIVE_X2", "legs": 2, "min_edge_score": 1.0,
             "min_rule_reliability": 0.72, "max_same_matchup_per_ticket": 1,
             "max_tickets_per_date": 1},
            {"name": "SELECTIVE_X3", "legs": 3, "min_edge_score": 1.0,
             "min_rule_reliability": 0.72, "max_same_matchup_per_ticket": 1,
             "max_tickets_per_date": 1},
            {"name": "EXPERIMENTAL_X5", "legs": 5, "min_edge_score": 1.0,
             "min_rule_reliability": 0.72, "max_same_matchup_per_ticket": 1,
             "max_tickets_per_date": 1},
        ]
        markets = [("PRA", "UNDER"), ("PF", "UNDER"), ("REB", "UNDER")]
        rows = []
        for i in range(1, 11):
            market, side = markets[(i - 1) % len(markets)]
            rows.append(row(i, market=market, side=side))
        frame = normalize_candidates(pd.DataFrame(rows), config)
        tickets, _ = build_parlays(frame, config)
        self.assertEqual(set(tickets.tier), {"CONSERVATIVE_X2", "SELECTIVE_X3", "EXPERIMENTAL_X5"})
        self.assertEqual(set(tickets.legs), {2, 3, 5})


if __name__ == "__main__":
    unittest.main()
