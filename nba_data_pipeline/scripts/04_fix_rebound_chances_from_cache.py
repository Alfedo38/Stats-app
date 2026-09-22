import os
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"

load_dotenv(ROOT / ".env")

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")

if not DB_URL:
    raise SystemExit("ERROR: falta DATABASE_URL en nba_data_pipeline/.env")


GAMES = [
    "0022500519",
    "0022500586",
]


def main():
    conn = psycopg2.connect(DB_URL)

    try:
        total_updated = 0

        with conn.cursor() as cur:
            for game_id in GAMES:
                path = CACHE_DIR / f"boxscore_playertrack_v3_{game_id}.csv"

                if not path.exists():
                    print(f"❌ No existe cache para {game_id}: {path}")
                    continue

                df = pd.read_csv(path)

                required = {"personId", "reboundChancesTotal"}
                missing = required - set(df.columns)

                if missing:
                    print(f"❌ {game_id} no tiene columnas necesarias: {missing}")
                    print("Columnas disponibles:", list(df.columns))
                    continue

                print(f"🏀 Procesando {game_id} desde cache | filas={len(df)}")

                updated_game = 0

                for _, row in df.iterrows():
                    player_id = row.get("personId")
                    rebound_chances = row.get("reboundChancesTotal")

                    if pd.isna(player_id) or pd.isna(rebound_chances):
                        continue

                    cur.execute(
                        """
                        UPDATE nba_api_data.player_game_logs_v2
                        SET
                            rebound_chances = COALESCE(rebound_chances, %s),
                            source_tracking = true,
                            updated_at = now()
                        WHERE game_id = %s
                          AND player_id = %s
                          AND rebound_chances IS NULL;
                        """,
                        (
                            float(rebound_chances),
                            game_id,
                            int(player_id),
                        ),
                    )

                    updated_game += cur.rowcount

                print(f"✅ {game_id}: filas actualizadas rebound_chances={updated_game}")
                total_updated += updated_game

        conn.commit()

        print("=" * 60)
        print(f"✅ Total actualizado: {total_updated}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
