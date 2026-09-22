from __future__ import annotations

import copy
import unittest

import pandas as pd

from ludo_lab.walkforward import (
    add_group_balances,
    build_methods,
    build_portfolios,
    run_walkforward,
    summarize_groups,
)


CONFIG = {
    "experiment_name": "test",
    "required_mode": "ADAPTIVE",
    "required_status": "ACTIVE",
    "start_date": "2026-05-19",
    "end_date": "2026-05-21",
    "initial_bankroll": 100000.0,
    "stake_per_ticket": 1000.0,
    "min_odds": 1.20,
    "max_odds": 3.0,
    "min_probability": 0.50,
    "min_expected_value": -1.0,
    "mae_to_sigma": 1.2533141373,
    "probability_floor": 0.02,
    "probability_ceiling": 0.98,
    "correction": {
        "player_market_window": 5,
        "market_window": 200,
        "market_min_history": 10,
        "shrinkage_games": 2.0,
        "max_abs_correction_mae": 1.5,
    },
    "methods": [
        {"name": "SINGLE_TOP5", "legs": 1, "max_tickets_per_date": 5, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 1},
        {"name": "X2", "legs": 2, "max_tickets_per_date": 1, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 2},
        {"name": "X3", "legs": 3, "max_tickets_per_date": 1, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 2},
        {"name": "X5", "legs": 5, "max_tickets_per_date": 1, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 3},
    ],
    "portfolios": [
        {"name": "CONSERVATIVE", "tickets": [
            {"ticket_name": "SINGLE", "legs": 1, "count": 3, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 1}
        ]},
        {"name": "BALANCED", "tickets": [
            {"ticket_name": "X2", "legs": 2, "count": 1, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 2},
            {"ticket_name": "X3", "legs": 3, "count": 1, "min_probability": 0.0, "min_expected_value": -1.0, "max_same_market": 2}
        ]},
    ],
}


def source_row(player: str, date: str, line: float, **changes) -> dict:
    row = {
        "event_date": date,
        "player_name": player,
        "matchup": "NYK vs CLE",
        "market": "PRA",
        "side": "UNDER",
        "line": line,
        "odds": 1.8,
        "projection": 10.0,
        "actual": 9.0,
        "model_mae": 2.0,
        "mode": "ADAPTIVE",
        "strategy_status": "ACTIVE",
    }
    row.update(changes)
    return row


def pick_row(number: int, **changes) -> dict:
    row = {
        "event_date": "2026-05-19",
        "player_name": f"Jugador {number}",
        "wf_player_key": f"jugador{number}",
        "matchup": "NYK vs CLE",
        "canonical_game_id": "2026-05-19|CLE|NYK",
        "market": "PRA" if number % 2 else "REB",
        "side": "UNDER",
        "line": 20.5,
        "odds": 1.8,
        "projection": 15.0,
        "adjusted_projection": 15.0,
        "actual": 18.0,
        "model_mae": 3.0,
        "estimated_probability": 0.75 - number * 0.005,
        "break_even_probability": 1 / 1.8,
        "expected_value": 0.30 - number * 0.01,
        "probability_edge": 0.19 - number * 0.005,
        "wf_settlement": "WIN",
    }
    row.update(changes)
    return row


class WalkForwardTests(unittest.TestCase):
    def test_selects_only_one_line_per_player_market_date(self):
        frame = pd.DataFrame([
            source_row("Jugador A", "2026-05-19", 11.5, odds=2.0),
            source_row("Jugador A", "2026-05-19", 12.5, odds=1.8),
            source_row("Jugador A", "2026-05-19", 13.5, odds=1.5),
        ])
        picks, audit = run_walkforward(frame, CONFIG)
        self.assertEqual(len(picks), 1)
        selected = audit[audit.line_selection_status == "SELECTED"].iloc[0]
        eligible = audit[audit.line_selection_status.isin(["SELECTED", "ALTERNATE_REJECTED"])]
        self.assertEqual(selected.expected_value, eligible.expected_value.max())

    def test_current_result_cannot_change_current_selection(self):
        rows = [
            source_row("Jugador A", "2026-05-19", 11.5, odds=2.0, actual=5.0),
            source_row("Jugador A", "2026-05-19", 12.5, odds=1.8, actual=5.0),
        ]
        first, _ = run_walkforward(pd.DataFrame(rows), CONFIG)
        changed = copy.deepcopy(rows)
        for row in changed:
            row["actual"] = 40.0
        second, _ = run_walkforward(pd.DataFrame(changed), CONFIG)
        columns = ["line", "estimated_probability", "expected_value", "daily_correction"]
        pd.testing.assert_frame_equal(
            first[columns].reset_index(drop=True), second[columns].reset_index(drop=True)
        )

    def test_previous_result_changes_next_date_correction(self):
        high_residual = pd.DataFrame([
            source_row("Jugador A", "2026-05-19", 12.5, actual=15.0),
            source_row("Jugador A", "2026-05-20", 12.5, actual=10.0),
        ])
        neutral = high_residual.copy()
        neutral.loc[neutral.event_date == "2026-05-19", "actual"] = 10.0
        picks_high, _ = run_walkforward(high_residual, CONFIG)
        picks_neutral, _ = run_walkforward(neutral, CONFIG)
        high_day_two = picks_high[picks_high.event_date == "2026-05-20"].iloc[0]
        neutral_day_two = picks_neutral[picks_neutral.event_date == "2026-05-20"].iloc[0]
        self.assertGreater(high_day_two.daily_correction, neutral_day_two.daily_correction)
        self.assertLess(high_day_two.estimated_probability, neutral_day_two.estimated_probability)

    def test_methods_build_x2_x3_x5_with_distinct_players(self):
        picks = pd.DataFrame([pick_row(number) for number in range(1, 9)])
        tickets, legs = build_methods(picks, CONFIG)
        self.assertTrue({"SINGLE_TOP5", "X2", "X3", "X5"}.issubset(set(tickets.group)))
        for ticket_id, group in legs.groupby("ticket_id"):
            self.assertEqual(group.wf_player_key.nunique(), len(group), ticket_id)

    def test_portfolio_never_reuses_player_on_same_date(self):
        picks = pd.DataFrame([pick_row(number) for number in range(1, 11)])
        tickets, legs = build_portfolios(picks, CONFIG)
        self.assertFalse(tickets.empty)
        for (_, portfolio), group in legs.groupby(["event_date", "group"]):
            self.assertEqual(group.wf_player_key.nunique(), len(group), portfolio)

    def test_group_balance_and_drawdown(self):
        tickets = pd.DataFrame([
            {"ticket_id": "a", "event_date": "2026-05-19", "group": "X2", "settlement": "LOSS", "stake": 1000.0, "profit": -1000.0, "total_odds": 2.0},
            {"ticket_id": "b", "event_date": "2026-05-20", "group": "X2", "settlement": "WIN", "stake": 1000.0, "profit": 1000.0, "total_odds": 2.0},
        ])
        balanced = add_group_balances(tickets, CONFIG)
        summary = summarize_groups(balanced, CONFIG).iloc[0]
        self.assertEqual(summary.final_balance, 100000.0)
        self.assertEqual(summary.max_drawdown, 1000.0)
        self.assertAlmostEqual(summary.max_drawdown_pct, 0.01)


if __name__ == "__main__":
    unittest.main()
