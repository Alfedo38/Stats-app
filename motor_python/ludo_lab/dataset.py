from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from .common import OUTPUTS_DIR, atomic_csv, get_engine, load_config


ALLOWED_VIEW = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$")
CORE_COLUMNS = [
    "min", "pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta",
    "stl", "blk", "tov", "pf", "rebound_off", "rebound_def",
]


def load_history(config: dict, end_date: str | None = None) -> pd.DataFrame:
    from sqlalchemy import text

    view = str(config["source_view"])
    if not ALLOWED_VIEW.fullmatch(view):
        raise ValueError(f"Vista no permitida: {view}")
    end = end_date or config["evaluation_end"]
    query = text(f"""
        SELECT
            player_id::bigint AS player_id,
            player_name,
            team_abbreviation,
            game_id::text AS game_id,
            game_date,
            season::integer AS season,
            matchup,
            opponent_abbr,
            home_away,
            min::double precision AS min,
            pts::double precision AS pts,
            reb::double precision AS reb,
            ast::double precision AS ast,
            fgm::double precision AS fgm,
            fga::double precision AS fga,
            fg3m::double precision AS fg3m,
            fg3a::double precision AS fg3a,
            ftm::double precision AS ftm,
            fta::double precision AS fta,
            stl::double precision AS stl,
            blk::double precision AS blk,
            tov::double precision AS tov,
            pf::double precision AS pf,
            rebound_off::double precision AS rebound_off,
            rebound_def::double precision AS rebound_def
        FROM {view}
        WHERE game_date BETWEEN :start_date AND :end_date
        ORDER BY game_date, game_id, player_id
    """)
    df = pd.read_sql(
        query,
        get_engine(),
        params={"start_date": config["history_start"], "end_date": end},
    )
    return validate_history(df)


def validate_history(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise RuntimeError("La vista histórica no devolvió filas.")
    out = df.copy()
    out["game_date"] = pd.to_datetime(out["game_date"], errors="coerce").dt.normalize()
    out = out[out["game_date"].notna() & out["player_id"].notna() & out["game_id"].notna()].copy()
    out["player_id"] = pd.to_numeric(out["player_id"], errors="raise").astype("int64")
    out["season"] = pd.to_numeric(out["season"], errors="raise").astype("int64")
    for column in CORE_COLUMNS:
        if column not in out.columns:
            out[column] = np.nan
        out[column] = pd.to_numeric(out[column], errors="coerce")
    duplicates = out.duplicated(["player_id", "game_id"], keep=False)
    if duplicates.any():
        sample = out.loc[duplicates, ["player_id", "game_id", "game_date"]].head(10)
        raise RuntimeError("Hay player-game duplicados en la fuente:\n" + sample.to_string(index=False))
    required_results = ["pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a"]
    if out[required_results].isna().all(axis=1).any():
        raise RuntimeError("La fuente contiene filas sin estadísticas básicas.")
    return out.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)


def coverage_report(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for season, group in df.groupby("season"):
        row = {"season": int(season), "rows": len(group)}
        for column in CORE_COLUMNS:
            row[f"{column}_pct"] = round(float(group[column].notna().mean() * 100), 1)
        rows.append(row)
    return pd.DataFrame(rows).sort_values("season")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Extrae dataset completo y audita cobertura")
    parser.add_argument("--config", default="")
    parser.add_argument("--output", default=str(OUTPUTS_DIR / "historial_full.csv"))
    args = parser.parse_args()
    config = load_config(args.config or None)
    df = load_history(config)
    output = Path(args.output).expanduser().resolve()
    atomic_csv(df, output)
    coverage = coverage_report(df)
    atomic_csv(coverage, output.with_name(output.stem + "_coverage.csv"))
    print(f"Dataset: {len(df)} filas | {df.player_id.nunique()} jugadores | {df.game_id.nunique()} partidos")
    print(f"Fechas: {df.game_date.min().date()} → {df.game_date.max().date()}")
    print(coverage.to_string(index=False))
    print(f"Guardado: {output}")


if __name__ == "__main__":
    main()
