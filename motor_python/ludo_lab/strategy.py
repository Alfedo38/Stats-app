from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .common import LAB_DIR, OUTPUTS_DIR, atomic_csv
from .settle_stake import normalize_name


DEFAULT_CONFIG = LAB_DIR / "strategy_config.json"
DEFAULT_OUTPUT_DIR = OUTPUTS_DIR / "strategy_shadow_v1"

REQUIRED_COLUMNS = {
    "event_date", "player_name", "matchup", "market", "side", "line", "odds",
    "projection", "actual", "edge_score", "settlement", "profit_units", "mode",
}


def load_strategy_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    required = {
        "strategy_name", "required_mode", "default_min_edge_score",
        "active_rules", "watchlist_rules", "blocked_rules",
    }
    missing = required - set(config)
    if missing:
        raise ValueError(f"Faltan claves de estrategia: {sorted(missing)}")
    if float(config["default_min_edge_score"]) < 0:
        raise ValueError("default_min_edge_score no puede ser negativo")

    seen: dict[tuple[str, str], str] = {}
    for section in ("active_rules", "watchlist_rules", "blocked_rules"):
        for raw in config[section]:
            if "market" not in raw or "side" not in raw:
                raise ValueError(f"Regla incompleta en {section}: {raw}")
            key = (str(raw["market"]).upper(), str(raw["side"]).upper())
            if key[1] not in {"OVER", "UNDER"}:
                raise ValueError(f"Lado inválido en {section}: {raw['side']}")
            if key in seen:
                raise ValueError(f"Regla duplicada {key}: {seen[key]} y {section}")
            seen[key] = section
    return config


def _rules(config: dict, section: str) -> dict[tuple[str, str], float]:
    default_edge = float(config["default_min_edge_score"])
    return {
        (str(rule["market"]).upper(), str(rule["side"]).upper()): float(
            rule.get("min_edge_score", default_edge)
        )
        for rule in config[section]
    }


def load_inputs(paths: list[Path]) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for path in paths:
        if not path.is_file():
            raise FileNotFoundError(f"No existe: {path}")
        frame = pd.read_csv(path)
        missing = REQUIRED_COLUMNS - set(frame.columns)
        if missing:
            raise ValueError(f"{path.name}: faltan columnas {sorted(missing)}")
        frame = frame.copy()
        frame["strategy_source_file"] = path.name
        frames.append(frame)
    if not frames:
        raise ValueError("No se indicaron archivos de picks")
    return pd.concat(frames, ignore_index=True)


def classify_strategy(frame: pd.DataFrame, config: dict) -> pd.DataFrame:
    out = frame.copy()
    out["mode"] = out["mode"].fillna("").astype(str).str.upper()
    out["market"] = out["market"].fillna("").astype(str).str.upper()
    out["side"] = out["side"].fillna("").astype(str).str.upper()
    out["settlement"] = out["settlement"].fillna("").astype(str).str.upper()
    out["edge_score"] = pd.to_numeric(out["edge_score"], errors="coerce")
    out["odds"] = pd.to_numeric(out["odds"], errors="coerce")
    out["line"] = pd.to_numeric(out["line"], errors="coerce")
    out["event_date"] = pd.to_datetime(out["event_date"], errors="coerce").dt.date.astype("string")
    out["strategy_player_key"] = out["player_name"].map(normalize_name)

    active = _rules(config, "active_rules")
    watchlist = _rules(config, "watchlist_rules")
    blocked = _rules(config, "blocked_rules")
    required_mode = str(config["required_mode"]).upper()

    statuses: list[str] = []
    reasons: list[str] = []
    thresholds: list[float] = []
    for row in out.itertuples(index=False):
        key = (row.market, row.side)
        threshold = active.get(key, watchlist.get(key, blocked.get(key, float(config["default_min_edge_score"]))))
        thresholds.append(threshold)
        if row.mode != required_mode:
            statuses.append("BLOCKED")
            reasons.append(f"modo requerido: {required_mode}")
        elif pd.isna(row.edge_score) or float(row.edge_score) < threshold:
            statuses.append("BLOCKED")
            reasons.append(f"edge menor que {threshold:g}")
        elif key in active:
            statuses.append("ACTIVE")
            reasons.append("regla activa provisional")
        elif key in watchlist:
            statuses.append("WATCHLIST")
            reasons.append("muestra o ventaja insuficiente")
        elif key in blocked:
            statuses.append("BLOCKED")
            reasons.append("regla bloqueada por backtest")
        else:
            statuses.append("BLOCKED")
            reasons.append("mercado/lado no aprobado")

    out["strategy_name"] = str(config["strategy_name"])
    out["strategy_status"] = statuses
    out["strategy_reason"] = reasons
    out["strategy_min_edge"] = thresholds

    duplicate_key = [
        "event_date", "strategy_player_key", "matchup", "market", "side", "line", "mode"
    ]
    out = out.sort_values(
        duplicate_key + ["edge_score", "odds"],
        ascending=[True] * len(duplicate_key) + [False, False],
        na_position="last",
    )
    out["strategy_duplicate"] = out.duplicated(duplicate_key, keep="first")
    duplicate_mask = out["strategy_duplicate"]
    out.loc[duplicate_mask, "strategy_status"] = "BLOCKED"
    out.loc[duplicate_mask, "strategy_reason"] = "pick duplicado"
    return out.reset_index(drop=True)


def summarize_strategy(frame: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (status, market, side), group in frame.groupby(
        ["strategy_status", "market", "side"], dropna=False
    ):
        decided = group[group["settlement"].isin(["WIN", "LOSS"])]
        units = pd.to_numeric(group.get("profit_units"), errors="coerce").fillna(0).sum()
        rows.append({
            "status": status,
            "market": market,
            "side": side,
            "picks": len(group),
            "wins": int((group["settlement"] == "WIN").sum()),
            "losses": int((group["settlement"] == "LOSS").sum()),
            "pushes": int((group["settlement"] == "PUSH").sum()),
            "units": units,
            "roi": units / len(decided) if len(decided) else float("nan"),
            "avg_odds": pd.to_numeric(group["odds"], errors="coerce").mean(),
            "avg_edge_score": pd.to_numeric(group["edge_score"], errors="coerce").mean(),
        })
    return pd.DataFrame(rows).sort_values(["status", "market", "side"]).reset_index(drop=True)


def write_strategy(frame: pd.DataFrame, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    atomic_csv(frame, output_dir / "strategy_audit.csv")
    atomic_csv(frame[frame.strategy_status == "ACTIVE"].copy(), output_dir / "strategy_active.csv")
    atomic_csv(frame[frame.strategy_status == "WATCHLIST"].copy(), output_dir / "strategy_watchlist.csv")
    summary = summarize_strategy(frame)
    atomic_csv(summary, output_dir / "strategy_summary.csv")
    print(summary.round(4).to_string(index=False))
    active = frame[frame.strategy_status == "ACTIVE"]
    print(f"\nPicks activos: {len(active)}")
    print(f"Picks en observación: {(frame.strategy_status == 'WATCHLIST').sum()}")
    print(f"Picks bloqueados: {(frame.strategy_status == 'BLOCKED').sum()}")
    print(f"Salida: {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Construye la estrategia adaptativa ficticia de Ludo")
    parser.add_argument("--inputs", nargs="+", required=True, help="CSV resueltos por settle_stake")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    args = parser.parse_args()

    config = load_strategy_config(Path(args.config).expanduser().resolve())
    paths = [Path(value).expanduser().resolve() for value in args.inputs]
    classified = classify_strategy(load_inputs(paths), config)
    write_strategy(classified, Path(args.output_dir).expanduser().resolve())


if __name__ == "__main__":
    main()
