from __future__ import annotations

import argparse
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

from .common import OUTPUTS_DIR, atomic_csv, load_config
from .markets import STAKE_TO_MARKET


SNAPSHOT_RE = re.compile(r"props_nba_(\d{8})_(\d{6})\.csv$")


def normalize_name(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", "", text.casefold())


def snapshot_time(path: Path) -> pd.Timestamp | None:
    match = SNAPSHOT_RE.match(path.name)
    if not match:
        return None
    return pd.to_datetime(match.group(1) + match.group(2), format="%Y%m%d%H%M%S", errors="coerce")


def load_stake_snapshots(directory: Path) -> pd.DataFrame:
    frames = []
    required = {"fecha", "jugador", "mercado", "linea", "tipo", "cuota"}
    for path in sorted(directory.glob("props_nba_*.csv")):
        captured = snapshot_time(path)
        if captured is None or pd.isna(captured):
            continue
        try:
            frame = pd.read_csv(path)
        except Exception as exc:
            print(f"Se omite {path.name}: {exc}")
            continue
        if not required.issubset(frame.columns):
            continue
        frame = frame.copy()
        frame["snapshot_at"] = captured
        frame["snapshot_file"] = path.name
        frames.append(frame)
    if not frames:
        raise RuntimeError(f"No encontré snapshots Stake válidos en {directory}")

    odds = pd.concat(frames, ignore_index=True)
    stated_date = pd.to_datetime(odds["fecha"], errors="coerce").dt.normalize()
    if "fecha_hora" in odds.columns:
        event_at = pd.to_datetime(odds["fecha_hora"], errors="coerce")
    else:
        event_at = pd.Series(pd.NaT, index=odds.index, dtype="datetime64[ns]")
    fallback_days = (stated_date - odds["snapshot_at"].dt.normalize()).dt.days
    safe_fallback = stated_date.where(fallback_days.between(0, 3))
    odds["event_at"] = event_at
    odds["event_date"] = event_at.dt.normalize().combine_first(safe_fallback)
    odds["market"] = odds["mercado"].astype(str).str.casefold().map(STAKE_TO_MARKET)
    odds["player_key"] = odds["jugador"].map(normalize_name)
    odds["line"] = pd.to_numeric(odds["linea"], errors="coerce")
    odds["odds"] = pd.to_numeric(odds["cuota"], errors="coerce")
    side = odds["tipo"].fillna("").astype(str).str.casefold()
    odds["side"] = np.select(
        [side.isin(["sobre", "over", "mas", "más"]), side.isin(["debajo", "under", "menos"])],
        ["OVER", "UNDER"],
        default="",
    )
    odds = odds.dropna(subset=["event_date", "market", "line", "odds"])
    odds = odds[(odds.player_key != "") & (odds.side != "")]

    # Una captura nunca puede resolver una apuesta de un evento anterior. Si existe
    # hora, se exige además que la captura sea anterior al comienzo del partido.
    before_date = odds.snapshot_at.dt.normalize() <= odds.event_date
    before_tipoff = odds.event_at.isna() | (odds.snapshot_at <= odds.event_at)
    odds = odds[before_date & before_tipoff].copy()
    keys = ["event_date", "player_key", "market", "line", "side"]
    odds = odds.sort_values("snapshot_at").drop_duplicates(keys, keep="last")
    return odds


def settle(predictions: pd.DataFrame, odds: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    pred = predictions.copy()
    pred["game_date"] = pd.to_datetime(pred["game_date"], errors="coerce").dt.normalize()
    pred["player_key"] = pred["player_name"].map(normalize_name)
    merged = odds.merge(
        pred,
        left_on=["event_date", "player_key", "market"],
        right_on=["game_date", "player_key", "market"],
        how="inner",
        suffixes=("_stake", "_prediction"),
    )
    if merged.empty:
        raise RuntimeError("No hubo cruces entre cuotas Stake y predicciones.")
    merged["model_side"] = np.where(merged.projection > merged.line, "OVER", "UNDER")
    merged = merged[merged.side == merged.model_side].copy()
    merged["diff"] = merged.projection - merged.line
    merged["edge_score"] = merged["diff"].abs() / merged["model_mae"].replace(0, np.nan)
    merged["result"] = np.select(
        [merged.actual > merged.line, merged.actual < merged.line],
        ["OVER", "UNDER"],
        default="PUSH",
    )
    merged["settlement"] = np.select(
        [merged.result == "PUSH", merged.result == merged.side],
        ["PUSH", "WIN"],
        default="LOSS",
    )
    merged["profit_units"] = np.select(
        [merged.settlement == "WIN", merged.settlement == "LOSS"],
        [merged.odds - 1.0, -1.0],
        default=0.0,
    )
    selected = merged[
        (merged.odds >= float(config["min_odds"]))
        & (merged.edge_score >= float(config["min_edge_score"]))
    ].copy()
    return merged, selected


def main() -> None:
    parser = argparse.ArgumentParser(description="Cruza el backtest con cuotas históricas Stake y resuelve picks")
    parser.add_argument("--config", default="")
    parser.add_argument("--predictions", default=str(OUTPUTS_DIR / "projection_backtest.csv"))
    parser.add_argument("--stake-dir", default=str(Path(__file__).resolve().parents[1] / "stake_props"))
    parser.add_argument("--output", default=str(OUTPUTS_DIR / "stake_settled.csv"))
    args = parser.parse_args()

    config = load_config(args.config or None)
    predictions = pd.read_csv(Path(args.predictions).expanduser())
    odds = load_stake_snapshots(Path(args.stake_dir).expanduser().resolve())
    all_rows, selected = settle(predictions, odds, config)
    output = Path(args.output).expanduser().resolve()
    atomic_csv(all_rows, output.with_name(output.stem + "_all.csv"))
    atomic_csv(selected, output)
    print(f"Cuotas históricas normalizadas: {len(odds)}")
    print(f"Cruces modelo-cuota: {len(all_rows)}")
    print(f"Picks seleccionados: {len(selected)}")
    print(f"Guardado: {output}")


if __name__ == "__main__":
    main()
