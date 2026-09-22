#!/usr/bin/env python3
import os
import argparse
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from nba_cache_sync import sync_cache

for env_path in [".env.local", ".env", "motor_python/.env.local", "motor_python/.env"]:
    p = Path(env_path)
    if p.exists():
        load_dotenv(p, override=False)


def make_engine():
    db_password = os.getenv("DB_PASSWORD")

    if db_password:
        db_url = URL.create(
            drivername="postgresql",
            username=os.getenv("DB_USER", "postgres.xxhdctrvjsngwbagamns"),
            password=db_password,
            host=os.getenv("DB_HOST", "aws-1-sa-east-1.pooler.supabase.com"),
            port=int(os.getenv("DB_PORT", "6543")),
            database=os.getenv("DB_NAME", "postgres"),
            query={"sslmode": "require"},
        )
        return create_engine(db_url, pool_pre_ping=True)

    raw = (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("SUPABASE_DATABASE_URL")
        or os.getenv("SUPABASE_DB_URL")
    )

    if not raw:
        raise RuntimeError("❌ No encontré DB_PASSWORD ni DATABASE_URL/POSTGRES_URL")

    return create_engine(raw, pool_pre_ping=True)


def qident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def main(argv=None, engine=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="YYYY-MM-DD")
    parser.add_argument('--check', action='store_true', help='Compara sin modificar la caché')
    args = parser.parse_args(argv)

    engine = engine if engine is not None else make_engine()

    with engine.begin() as conn:
        target_cols = [
            r[0]
            for r in conn.execute(
                text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'player_page_game_fact_cache'
                      AND is_generated = 'NEVER' AND is_identity = 'NO'
                    ORDER BY ordinal_position
                """)
            ).fetchall()
        ]

        view_cols = {
            r[0]
            for r in conn.execute(
                text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'nba_api_data'
                      AND table_name = 'v_player_page_game_fact'
                """)
            ).fetchall()
        }

        exprs = {}

        for c in target_cols:
            if c == "player_id":
                exprs[c] = """
                    CASE
                      WHEN NULLIF(b.player_id::text, '') ~ '^[0-9]+$'
                        THEN b.player_id::text::bigint
                      ELSE NULL
                    END
                """
            elif c == "game_id":
                exprs[c] = "b.game_id::text"
            elif c == "game_date":
                exprs[c] = "b.game_date::date"
            elif c == "stl_blk":
                if "stl_blk" in view_cols:
                    exprs[c] = "b.stl_blk"
                else:
                    exprs[c] = "COALESCE(b.stl, 0) + COALESCE(b.blk, 0)"
            elif c == "opponent_abbr":
                if "opponent_abbr" in view_cols:
                    exprs[c] = "b.opponent_abbr"
                else:
                    exprs[c] = """
                        UPPER(NULLIF(
                          COALESCE(
                            NULLIF(b.opponent::text, ''),
                            CASE
                              WHEN b.matchup::text ILIKE '% vs. %' THEN split_part(b.matchup::text, ' vs. ', 2)
                              WHEN b.matchup::text ILIKE '% vs %'  THEN split_part(b.matchup::text, ' vs ', 2)
                              WHEN b.matchup::text ILIKE '% @ %'   THEN split_part(b.matchup::text, ' @ ', 2)
                              ELSE NULL
                            END
                          ),
                          ''
                        ))::text
                    """
            elif c == "season":
                if "season" in view_cols:
                    exprs[c] = "b.season"
                else:
                    exprs[c] = """
                        CASE
                          WHEN b.season_id::text ~ '^[0-9]{4}$'
                            THEN b.season_id::text::integer
                          WHEN b.season_id::text ~ '^[0-9]{4}-[0-9]{2}$'
                            THEN LEFT(b.season_id::text, 4)::integer
                          WHEN EXTRACT(MONTH FROM b.game_date)::integer >= 10
                            THEN EXTRACT(YEAR FROM b.game_date)::integer
                          ELSE EXTRACT(YEAR FROM b.game_date)::integer - 1
                        END
                    """
            elif c in view_cols:
                exprs[c] = f"b.{qident(c)}"

        insert_cols = list(exprs.keys())

        if not insert_cols:
            raise RuntimeError("❌ No encontré columnas compatibles para player_page_game_fact_cache")

        sql = f"""
            SELECT
              {", ".join(exprs[c] + " AS " + qident(c) for c in insert_cols)}
            FROM nba_api_data.v_player_page_game_fact b
            WHERE b.game_date BETWEEN CAST(:s AS date) AND CAST(:e AS date)
              AND NULLIF(b.player_id::text, '') ~ '^[0-9]+$'
        """

        sync_cache(conn, 'player_page_game_fact_cache', insert_cols, sql,
                   args.start, args.end, check=args.check)

    print(f"✅ player_page_game_fact_cache {'comprobada' if args.check else 'sincronizada'}: {args.start} → {args.end}")


if __name__ == "__main__":
    main()
