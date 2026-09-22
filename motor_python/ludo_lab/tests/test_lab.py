from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import pandas as pd

from ludo_lab.features import build_features
from ludo_lab.settle_stake import load_stake_snapshots, settle


def history() -> pd.DataFrame:
    rows = []
    dates = pd.date_range("2024-10-20", periods=8, freq="7D")
    for index, date in enumerate(dates):
        rows.append({
            "player_id": 1,
            "player_name": "Jugador Uno",
            "team_abbreviation": "AAA",
            "game_id": str(index + 1),
            "game_date": date,
            "season": 2024,
            "matchup": "AAA vs BBB",
            "opponent_abbr": "BBB",
            "home_away": "HOME",
            "pts": 10 + index,
            "reb": 5,
            "ast": 3,
            "fgm": 4,
            "fga": 9,
            "fg3m": 2,
            "fg3a": 5,
        })
    rows.append({**rows[-1], "game_id": "100", "game_date": pd.Timestamp("2025-10-21"), "season": 2025, "pts": 30})
    rows.append({**rows[-1], "game_id": "101", "game_date": pd.Timestamp("2025-10-23"), "season": 2025, "pts": 40})
    return pd.DataFrame(rows)


class FeatureTests(unittest.TestCase):
    def test_target_game_is_never_in_rolling_feature(self):
        features = build_features(history(), prior_weight=5)
        second = features[features.game_id == "2"].iloc[0]
        self.assertEqual(second.pts_l5, 10)

    def test_season_average_resets_and_previous_season_is_separate(self):
        features = build_features(history(), prior_weight=5)
        first_new = features[features.game_id == "100"].iloc[0]
        second_new = features[features.game_id == "101"].iloc[0]
        self.assertTrue(pd.isna(first_new.pts_season))
        self.assertEqual(second_new.pts_season, 30)
        self.assertAlmostEqual(first_new.pts_prev_season, 13.5)


class StakeTests(unittest.TestCase):
    def test_latest_snapshot_and_settlement(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            columns = {
                "fecha": ["2026-05-20", "2026-05-20"],
                "jugador": ["Jugador Uno", "Jugador Uno"],
                "mercado": ["Puntos", "Puntos"],
                "linea": [19.5, 19.5],
                "tipo": ["Sobre", "Debajo"],
                "cuota": [1.8, 1.9],
            }
            pd.DataFrame(columns).to_csv(folder / "props_nba_20260519_120000.csv", index=False)
            odds = load_stake_snapshots(folder)
            pred = pd.DataFrame([{
                "game_date": "2026-05-20", "player_name": "Jugador Uno", "market": "PTS",
                "projection": 22.0, "actual": 25.0, "model_mae": 2.0, "mode": "STATIC",
            }])
            all_rows, selected = settle(pred, odds, {"min_odds": 1.2, "min_edge_score": 0.8})
            self.assertEqual(len(all_rows), 1)
            self.assertEqual(len(selected), 1)
            self.assertEqual(selected.iloc[0].settlement, "WIN")
            self.assertAlmostEqual(selected.iloc[0].profit_units, 0.8)


if __name__ == "__main__":
    unittest.main()
