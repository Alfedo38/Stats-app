#!/usr/bin/env python3
import os
import argparse
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from nba_cache_sync import sync_cache, qi

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

    raw = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("SUPABASE_DB_URL")
    if not raw:
        raise RuntimeError("❌ No encontré DB_PASSWORD ni DATABASE_URL/POSTGRES_URL")
    return create_engine(raw, pool_pre_ping=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument('--check', action='store_true', help='Compara sin modificar la caché')
    args = parser.parse_args()

    engine = make_engine()

    with engine.begin() as conn:
        fields = list(conn.execute(text("""SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='player_period_splits_front_v2_cache'
            AND is_generated='NEVER' AND is_identity='NO' ORDER BY ordinal_position""")).scalars())
        sync_cache(conn, 'player_period_splits_front_v2_cache', fields,
            f"SELECT {', '.join(map(qi, fields))} FROM nba_api_data.v_player_period_splits_front_v2 "
            'WHERE game_date BETWEEN CAST(:s AS date) AND CAST(:e AS date)',
            args.start, args.end, check=args.check)

    print(f"✅ player_period_splits_front_v2_cache {'comprobada' if args.check else 'sincronizada'}: {args.start} → {args.end}")

if __name__ == "__main__":
    main()
