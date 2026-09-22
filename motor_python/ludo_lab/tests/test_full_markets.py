from __future__ import annotations

import unittest

import pandas as pd

from ludo_lab.features import build_features, feature_names
from ludo_lab.markets import MARKETS


class FullMarketTests(unittest.TestCase):
    def test_expected_market_set(self):
        self.assertEqual(set(MARKETS), {
            "PTS", "REB", "AST", "PR", "PA", "RA", "PRA", "FGM", "FGA", "FG3M", "FG3A",
            "FTM", "FTA", "STL", "BLK", "STL+BLK", "TOV", "PF",
        })

    def test_minutes_and_extra_targets_are_lagged(self):
        rows = []
        for index in range(7):
            rows.append({
                "player_id": 1, "player_name": "Jugador", "team_abbreviation": "AAA",
                "game_id": str(index), "game_date": pd.Timestamp("2024-10-01") + pd.Timedelta(days=index),
                "season": 2024, "matchup": "AAA vs BBB", "opponent_abbr": "BBB", "home_away": "HOME",
                "min": 20 + index, "pts": 10 + index, "reb": 5, "ast": 3,
                "fgm": 4, "fga": 9, "fg3m": 1, "fg3a": 3, "ftm": 1, "fta": 2,
                "stl": index % 2, "blk": 1, "tov": 2, "pf": 2,
                "rebound_off": 1, "rebound_def": 4,
            })
        features = build_features(pd.DataFrame(rows), prior_weight=5)
        second = features[features.game_id == "1"].iloc[0]
        self.assertEqual(second.min_l5, 20)
        self.assertEqual(second.ftm_l5, 1)
        self.assertEqual(second.stl_blk_l5, 1)

    def test_every_market_has_existing_feature_columns(self):
        for market in MARKETS.values():
            names = feature_names(market)
            self.assertTrue(names)
            for component in market.component_stats:
                self.assertIn(f"{component}_l10", names)


if __name__ == "__main__":
    unittest.main()
