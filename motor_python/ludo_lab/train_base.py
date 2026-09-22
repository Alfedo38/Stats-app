from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .common import MODELS_DIR, ensure_dirs, load_config
from .dataset import load_history
from .features import build_features
from .markets import selected_markets
from .modeling import save_model, train_market


def main() -> None:
    parser = argparse.ArgumentParser(description="Entrena Ludo base solo hasta el final de 2024/25")
    parser.add_argument("--config", default="")
    parser.add_argument("--markets", default="")
    parser.add_argument("--train-end", default="")
    parser.add_argument("--output-dir", default=str(MODELS_DIR / "base"))
    args = parser.parse_args()

    config = load_config(args.config or None)
    train_end = pd.Timestamp(args.train_end or config["base_train_end"]).normalize()
    ensure_dirs()
    history = load_history(config, end_date=str(train_end.date()))
    features = build_features(history, int(config["prior_season_weight"]))
    output = Path(args.output_dir).expanduser().resolve()

    registry = {"version": "ludo_lab_v1", "train_end": str(train_end.date()), "models": {}}
    for market in selected_markets(args.markets):
        model, meta = train_market(features, market, config, train_end)
        save_model(model, meta, output)
        registry["models"][market.key] = meta
        print(f"{market.key}: MAE={meta['mae']:.3f} | naive L10={meta['naive_l10_mae']:.3f} | filas={meta['rows']}")

    (output / "registry.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Modelos de laboratorio: {output}")


if __name__ == "__main__":
    main()
