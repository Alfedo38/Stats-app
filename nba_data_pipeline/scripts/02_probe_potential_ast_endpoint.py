import time
import traceback
from nba_api.stats.endpoints import leaguedashptstats

NBA_HEADERS = {
    "Host": "stats.nba.com",
    "Connection": "keep-alive",
    "Accept": "application/json, text/plain, */*",
    "x-nba-stats-token": "true",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "x-nba-stats-origin": "stats",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "Accept-Language": "en-US,en;q=0.9",
}

tests = [
    ("2025-26", "Regular Season", "01/07/2026"),
    ("2025-26", "Regular Season", "01/15/2026"),
    ("2025-26", "Playoffs", "05/05/2026"),
]

for season, season_type, game_date in tests:
    print("=" * 90)
    print(f"Probando LeagueDashPtStats Passing | {season} | {season_type} | {game_date}")

    for per_mode in ["PerGame", "Totals"]:
        print("-" * 90)
        print(f"Intento con PerMode={per_mode}")

        try:
            endpoint = leaguedashptstats.LeagueDashPtStats(
                last_n_games=0,
                pt_measure_type="Passing",
                player_or_team="Player",
                per_mode_simple=per_mode,
                season=season,
                season_type_all_star=season_type,
                team_id_nullable=0,
                opponent_team_id=0,
                date_from_nullable=game_date,
                date_to_nullable=game_date,
                headers=NBA_HEADERS,
                timeout=90,
            )

            frames = endpoint.get_data_frames()
            print(f"DataFrames recibidos: {len(frames)}")

            for i, df in enumerate(frames):
                print(f"DF {i} shape={df.shape}")
                print("Columnas:")
                print(list(df.columns))

                if not df.empty:
                    print(df.head(15).to_string(index=False))

            break

        except Exception as e:
            print("ERROR:", type(e).__name__, e)
            print(traceback.format_exc()[-1200:])
            time.sleep(3)
