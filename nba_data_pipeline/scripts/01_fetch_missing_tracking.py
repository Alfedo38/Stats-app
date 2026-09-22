import os
import time
import random
import traceback
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

from nba_api.stats.endpoints import boxscoreplayertrackv3


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env")

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")

if not DB_URL:
    raise SystemExit("ERROR: falta DATABASE_URL en nba_data_pipeline/.env")


def norm_col(c):
    return str(c).strip().replace(" ", "_").replace("-", "_").replace(".", "_").upper()


def find_col(df, candidates):
    cols = {norm_col(c): c for c in df.columns}
    for cand in candidates:
        key = norm_col(cand)
        if key in cols:
            return cols[key]
    return None


def to_float(v):
    if pd.isna(v):
        return None
    try:
        return float(v)
    except Exception:
        return None


def fetch_queue(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                game_id,
                season,
                season_type,
                game_date
            FROM nba_api_data.missing_tracking_games
            WHERE status IN ('pending', 'partial', 'error')
            ORDER BY game_date, game_id;
        """)
        return cur.fetchall()


def mark_game(conn, game_id, status, error=None):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE nba_api_data.missing_tracking_games
            SET
                status = %s,
                attempts = attempts + 1,
                last_error = %s,
                updated_at = now()
            WHERE game_id = %s;
        """, (status, error, game_id))
    conn.commit()


def recalc_game_status(conn, game_id):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE touches IS NULL) AS missing_touches,
                COUNT(*) FILTER (WHERE passes_made IS NULL) AS missing_passes_made,
                COUNT(*) FILTER (WHERE potential_ast IS NULL) AS missing_potential_ast,
                COUNT(*) FILTER (WHERE rebound_chances IS NULL) AS missing_rebound_chances,
                COUNT(*) FILTER (WHERE usage_pct IS NULL) AS missing_usage_pct
            FROM nba_api_data.player_game_logs_v2
            WHERE game_id = %s;
        """, (game_id,))
        row = cur.fetchone()

    total_missing = sum(int(row[k] or 0) for k in row.keys())
    status = "done" if total_missing == 0 else "partial"

    with conn.cursor() as cur:
        cur.execute("""
            UPDATE nba_api_data.missing_tracking_games
            SET
                missing_touches = %s,
                missing_passes_made = %s,
                missing_potential_ast = %s,
                missing_rebound_chances = %s,
                missing_usage_pct = %s,
                status = %s,
                updated_at = now()
            WHERE game_id = %s;
        """, (
            row["missing_touches"],
            row["missing_passes_made"],
            row["missing_potential_ast"],
            row["missing_rebound_chances"],
            row["missing_usage_pct"],
            status,
            game_id,
        ))
    conn.commit()
    return status, row


def pick_player_tracking_df(frames):
    best_df = None
    best_score = -1

    for df in frames:
        if df is None or df.empty:
            continue

        ncols = {norm_col(c) for c in df.columns}
        score = 0

        wanted_cols = [
            "PERSON_ID",
            "PLAYER_ID",
            "PLAYERID",
            "TOUCHES",
            "PASSES_MADE",
            "PASSES",
            "POTENTIAL_AST",
            "POTENTIAL_ASSISTS",
            "REB_CHANCES",
            "REBOUND_CHANCES",
            "REBOUND_CHANCES_TOTAL",
        ]

        for wanted in wanted_cols:
            if norm_col(wanted) in ncols:
                score += 1

        if score > best_score:
            best_score = score
            best_df = df

    return best_df


def fetch_tracking_df(game_id):
    print(f"📡 NBA API BoxScorePlayerTrackV3 game_id={game_id}")

    endpoint = boxscoreplayertrackv3.BoxScorePlayerTrackV3(
        game_id=game_id,
        timeout=60
    )

    frames = endpoint.get_data_frames()
    df = pick_player_tracking_df(frames)

    if df is None or df.empty:
        raise RuntimeError(f"No vino DataFrame útil para game_id={game_id}")

    cache_path = CACHE_DIR / f"boxscore_playertrack_v3_{game_id}.csv"
    df.to_csv(cache_path, index=False)

    return df


def update_tracking_rows(conn, game_id, df):
    player_col = find_col(df, [
        "PERSON_ID",
        "PLAYER_ID",
        "PLAYERID",
        "personId",
        "playerId",
    ])

    touches_col = find_col(df, ["TOUCHES", "touches"])
    passes_col = find_col(df, ["PASSES_MADE", "passesMade", "PASSES", "passes"])
    potential_ast_col = find_col(df, ["POTENTIAL_AST", "POTENTIAL_ASSISTS", "potentialAst", "potentialAssists"])
    rebound_chances_col = find_col(df, ["REB_CHANCES", "REBOUND_CHANCES", "REBOUND_CHANCES_TOTAL", "reboundChances"])

    print("Columnas detectadas:")
    print(f"  player_id       = {player_col}")
    print(f"  touches         = {touches_col}")
    print(f"  passes_made     = {passes_col}")
    print(f"  potential_ast   = {potential_ast_col}")
    print(f"  rebound_chances = {rebound_chances_col}")

    if not player_col:
        raise RuntimeError(f"No encontré columna de player_id. Columnas: {list(df.columns)}")

    updated = 0

    with conn.cursor() as cur:
        for _, r in df.iterrows():
            player_id = r.get(player_col)

            if pd.isna(player_id):
                continue

            player_id = int(player_id)

            touches = to_float(r.get(touches_col)) if touches_col else None
            passes_made = to_float(r.get(passes_col)) if passes_col else None
            potential_ast = to_float(r.get(potential_ast_col)) if potential_ast_col else None
            rebound_chances = to_float(r.get(rebound_chances_col)) if rebound_chances_col else None

            cur.execute("""
                UPDATE nba_api_data.player_game_logs_v2
                SET
                    touches = COALESCE(touches, %s),
                    passes_made = COALESCE(passes_made, %s),
                    potential_ast = COALESCE(potential_ast, %s),
                    rebound_chances = COALESCE(rebound_chances, %s),
                    source_tracking = true,
                    updated_at = now()
                WHERE game_id = %s
                  AND player_id = %s;
            """, (
                touches,
                passes_made,
                potential_ast,
                rebound_chances,
                game_id,
                player_id,
            ))

            updated += cur.rowcount

    conn.commit()
    return updated


def main():
    conn = psycopg2.connect(DB_URL)

    try:
        queue = fetch_queue(conn)
        print(f"🎯 Partidos pendientes: {len(queue)}")

        if not queue:
            print("No hay partidos pendientes.")
            return

        for item in queue:
            game_id = item["game_id"]
            print("=" * 70)
            print(f"🏀 Procesando {game_id} | {item['season_type']} | {item['game_date']}")

            try:
                df = fetch_tracking_df(game_id)
                print(f"✅ Filas recibidas: {len(df)}")
                print(f"📌 Columnas: {list(df.columns)}")

                updated = update_tracking_rows(conn, game_id, df)
                print(f"✅ Filas actualizadas en v2: {updated}")

                status, missing = recalc_game_status(conn, game_id)
                print(f"📊 Status final {game_id}: {status} | faltantes: {dict(missing)}")

                time.sleep(random.uniform(1.5, 3.5))

            except Exception as e:
                err = f"{type(e).__name__}: {e}"
                print(f"❌ Error en {game_id}: {err}")
                print(traceback.format_exc())
                mark_game(conn, game_id, "error", err)
                time.sleep(random.uniform(3.0, 6.0))

    finally:
        conn.close()


if __name__ == "__main__":
    main()
