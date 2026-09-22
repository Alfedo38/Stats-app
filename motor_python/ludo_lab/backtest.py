from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .common import OUTPUTS_DIR, atomic_csv, ensure_dirs, load_config
from .dataset import load_history
from .features import build_features
from .markets import Market, selected_markets
from .modeling import eligible_rows, predict_market, train_market


def _date_blocks(start: pd.Timestamp, end: pd.Timestamp, days: int):
    current = start
    while current <= end:
        block_end = min(current + pd.Timedelta(days=days - 1), end)
        yield current, block_end
        current = block_end + pd.Timedelta(days=1)


def run_static(df: pd.DataFrame, market: Market, config: dict, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    train_end = pd.Timestamp(config["base_train_end"]).normalize()
    model, meta = train_market(df, market, config, train_end)
    test = eligible_rows(df[(df.game_date >= start) & (df.game_date <= end)], market, config)
    result = predict_market(model, test, market, meta["mae"])
    result["mode"] = "STATIC"
    result["model_train_end"] = train_end
    return result


def run_adaptive(df: pd.DataFrame, market: Market, config: dict, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    outputs = []
    block_days = int(config["adaptive_retrain_days"])
    for block_start, block_end in _date_blocks(start, end, block_days):
        train_end = block_start - pd.Timedelta(days=1)
        model, meta = train_market(df, market, config, train_end)
        test = eligible_rows(
            df[(df.game_date >= block_start) & (df.game_date <= block_end)], market, config
        )
        if test.empty:
            continue
        result = predict_market(model, test, market, meta["mae"])
        result["mode"] = "ADAPTIVE"
        result["model_train_end"] = train_end
        outputs.append(result)
        print(f"{market.key}: {block_start.date()} → {block_end.date()} | train≤{train_end.date()} | {len(result)}")
    return pd.concat(outputs, ignore_index=True) if outputs else pd.DataFrame()


def summarize(predictions: pd.DataFrame) -> pd.DataFrame:
    if predictions.empty:
        return pd.DataFrame()
    grouped = predictions.groupby(["mode", "market"], dropna=False)
    rows = []
    for (mode, market), group in grouped:
        valid_naive = group.dropna(subset=["naive_l10"])
        rows.append({
            "mode": mode,
            "market": market,
            "predictions": len(group),
            "mae": group.abs_error.mean(),
            "rmse": (group.error.pow(2).mean()) ** 0.5,
            "bias": group.error.mean(),
            "naive_l10_mae": (valid_naive.naive_l10 - valid_naive.actual).abs().mean(),
        })
    return pd.DataFrame(rows).sort_values(["market", "mode"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest temporal de Ludo")
    parser.add_argument("--config", default="")
    parser.add_argument("--markets", default="")
    parser.add_argument("--mode", choices=["static", "adaptive", "both"], default="static")
    parser.add_argument("--start", default="")
    parser.add_argument("--end", default="")
    parser.add_argument("--output", default=str(OUTPUTS_DIR / "projection_backtest.csv"))
    args = parser.parse_args()

    config = load_config(args.config or None)
    start = pd.Timestamp(args.start or config["evaluation_start"]).normalize()
    end = pd.Timestamp(args.end or config["evaluation_end"]).normalize()
    if start > end:
        raise ValueError("La fecha inicial es posterior a la final")

    ensure_dirs()
    history = load_history(config, end_date=str(end.date()))
    df = build_features(history, int(config["prior_season_weight"]))
    outputs = []
    for market in selected_markets(args.markets):
        if args.mode in {"static", "both"}:
            outputs.append(run_static(df, market, config, start, end))
        if args.mode in {"adaptive", "both"}:
            outputs.append(run_adaptive(df, market, config, start, end))

    predictions = pd.concat([frame for frame in outputs if not frame.empty], ignore_index=True)
    output = Path(args.output).expanduser().resolve()
    atomic_csv(predictions, output)
    summary = summarize(predictions)
    summary_path = output.with_name(output.stem + "_summary.csv")
    atomic_csv(summary, summary_path)
    print("\n" + summary.round(4).to_string(index=False))
    print(f"\nPredicciones: {output}")
    print(f"Resumen: {summary_path}")


if __name__ == "__main__":
    main()
