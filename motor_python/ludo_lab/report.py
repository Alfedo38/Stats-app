from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .common import OUTPUTS_DIR, atomic_csv


def projection_report(predictions: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (mode, market), group in predictions.groupby(["mode", "market"]):
        naive = group.dropna(subset=["naive_l10"])
        rows.append({
            "mode": mode,
            "market": market,
            "n": len(group),
            "mae": group.abs_error.mean(),
            "rmse": group.error.pow(2).mean() ** 0.5,
            "bias": group.error.mean(),
            "naive_l10_mae": (naive.naive_l10 - naive.actual).abs().mean(),
            "beats_naive": group.abs_error.mean() < (naive.naive_l10 - naive.actual).abs().mean(),
        })
    return pd.DataFrame(rows).sort_values(["market", "mode"])


def betting_report(settled: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (mode, market, side), group in settled.groupby(["mode", "market", "side"]):
        decided = group[group.settlement != "PUSH"]
        stakes = len(decided)
        units = group.profit_units.sum()
        rows.append({
            "mode": mode,
            "market": market,
            "side": side,
            "picks": len(group),
            "wins": int((group.settlement == "WIN").sum()),
            "losses": int((group.settlement == "LOSS").sum()),
            "pushes": int((group.settlement == "PUSH").sum()),
            "hit_rate": (group.settlement == "WIN").sum() / stakes if stakes else float("nan"),
            "avg_odds": group.odds.mean(),
            "units": units,
            "roi": units / stakes if stakes else float("nan"),
            "avg_edge_score": group.edge_score.mean(),
        })
    return pd.DataFrame(rows).sort_values(["market", "mode", "side"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Informe de Ludo Laboratorio")
    parser.add_argument("--predictions", default=str(OUTPUTS_DIR / "projection_backtest.csv"))
    parser.add_argument("--settled", default=str(OUTPUTS_DIR / "stake_settled.csv"))
    parser.add_argument("--output-dir", default=str(OUTPUTS_DIR))
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser().resolve()
    pred = pd.read_csv(Path(args.predictions).expanduser())
    projections = projection_report(pred)
    atomic_csv(projections, output_dir / "report_projection.csv")
    print("PROYECCIONES")
    print(projections.round(4).to_string(index=False))

    settled_path = Path(args.settled).expanduser()
    if settled_path.is_file():
        settled = pd.read_csv(settled_path)
        bets = betting_report(settled)
        atomic_csv(bets, output_dir / "report_betting.csv")
        print("\nAPUESTAS STAKE")
        print(bets.round(4).to_string(index=False))
    else:
        print("\nSin archivo de apuestas resueltas; se omite ROI.")


if __name__ == "__main__":
    main()
