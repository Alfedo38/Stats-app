from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict, deque
from pathlib import Path
from statistics import NormalDist

import pandas as pd

from .common import LAB_DIR, OUTPUTS_DIR, atomic_csv
from .methodologies import canonical_game_id
from .parlays import settle_parlay
from .settle_stake import normalize_name


DEFAULT_CONFIG = LAB_DIR / "walkforward_config.json"
DEFAULT_INPUT = OUTPUTS_DIR / "strategy_shadow_v1" / "strategy_active.csv"
DEFAULT_OUTPUT_DIR = OUTPUTS_DIR / "walkforward_v2"

REQUIRED_COLUMNS = {
    "event_date", "player_name", "matchup", "market", "side", "line", "odds",
    "projection", "actual", "model_mae", "mode", "strategy_status",
}


def load_walkforward_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    required = {
        "experiment_name", "required_mode", "required_status", "start_date", "end_date",
        "initial_bankroll", "stake_per_ticket", "min_odds", "max_odds",
        "min_probability", "min_expected_value", "mae_to_sigma", "probability_floor",
        "probability_ceiling", "correction", "methods", "portfolios",
    }
    missing = required - set(config)
    if missing:
        raise ValueError(f"Faltan claves walk-forward: {sorted(missing)}")
    correction_required = {
        "player_market_window", "market_window", "market_min_history",
        "shrinkage_games", "max_abs_correction_mae",
    }
    correction_missing = correction_required - set(config["correction"])
    if correction_missing:
        raise ValueError(f"Faltan claves de corrección: {sorted(correction_missing)}")
    if float(config["initial_bankroll"]) <= 0 or float(config["stake_per_ticket"]) <= 0:
        raise ValueError("Capital y stake deben ser positivos")
    if float(config["min_odds"]) <= 1 or float(config["max_odds"]) <= float(config["min_odds"]):
        raise ValueError("Rango de cuotas inválido")
    method_names = [item["name"] for item in config["methods"]]
    portfolio_names = [item["name"] for item in config["portfolios"]]
    if len(method_names) != len(set(method_names)) or len(portfolio_names) != len(set(portfolio_names)):
        raise ValueError("Hay nombres duplicados en métodos o carteras")
    return config


def normalize_source(frame: pd.DataFrame, config: dict) -> pd.DataFrame:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Faltan columnas en la entrada: {sorted(missing)}")
    out = frame.copy()
    for column in ("mode", "strategy_status", "market", "side"):
        out[column] = out[column].fillna("").astype(str).str.upper()
    out["event_date"] = pd.to_datetime(out["event_date"], errors="coerce").dt.normalize()
    for column in ("line", "odds", "projection", "actual", "model_mae"):
        out[column] = pd.to_numeric(out[column], errors="coerce")
    out["wf_player_key"] = out["player_name"].map(normalize_name)
    out["canonical_game_id"] = [
        canonical_game_id(date.date().isoformat() if pd.notna(date) else "", matchup)
        for date, matchup in zip(out["event_date"], out["matchup"])
    ]
    start = pd.Timestamp(config["start_date"])
    end = pd.Timestamp(config["end_date"])
    out = out[
        (out["mode"] == str(config["required_mode"]).upper())
        & (out["strategy_status"] == str(config["required_status"]).upper())
        & out["event_date"].between(start, end)
        & (out["wf_player_key"] != "")
        & out["side"].isin(["OVER", "UNDER"])
        & out["line"].notna()
        & out["odds"].notna()
        & out["projection"].notna()
        & out["actual"].notna()
        & out["model_mae"].gt(0)
    ].copy()
    keys = [
        "event_date", "wf_player_key", "canonical_game_id", "market", "side", "line", "odds"
    ]
    out = out.sort_values(keys).drop_duplicates(keys, keep="first")
    return out.reset_index(drop=True)


def _mean(values: deque[float] | list[float]) -> float:
    return float(sum(values) / len(values)) if values else 0.0


def _correction_for(
    row: pd.Series,
    player_history: dict[tuple[str, str], deque[float]],
    market_history: dict[str, deque[float]],
    config: dict,
) -> tuple[float, int, int, float]:
    settings = config["correction"]
    player_values = player_history.get((row.wf_player_key, row.market), deque())
    market_values = market_history.get(row.market, deque())
    player_count = len(player_values)
    market_count = len(market_values)
    market_mean = (
        _mean(market_values)
        if market_count >= int(settings["market_min_history"])
        else 0.0
    )
    shrinkage = float(settings["shrinkage_games"])
    if player_count:
        raw = (sum(player_values) + shrinkage * market_mean) / (player_count + shrinkage)
    else:
        raw = market_mean
    limit = float(settings["max_abs_correction_mae"]) * float(row.model_mae)
    correction = max(-limit, min(limit, raw))
    return correction, player_count, market_count, market_mean


def _probability(row: pd.Series, config: dict) -> tuple[float, float, float, float]:
    sigma = max(float(row.model_mae) * float(config["mae_to_sigma"]), 1e-9)
    z = (float(row.line) - float(row.adjusted_projection)) / sigma
    under_probability = NormalDist().cdf(z)
    probability = under_probability if row.side == "UNDER" else 1.0 - under_probability
    probability = max(
        float(config["probability_floor"]),
        min(float(config["probability_ceiling"]), probability),
    )
    break_even = 1.0 / float(row.odds)
    expected_value = probability * float(row.odds) - 1.0
    probability_edge = probability - break_even
    return probability, break_even, expected_value, probability_edge


def _settlement(actual: float, line: float, side: str) -> str:
    if actual == line:
        return "PUSH"
    result_side = "OVER" if actual > line else "UNDER"
    return "WIN" if result_side == side else "LOSS"


def run_walkforward(frame: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    source = normalize_source(frame, config)
    settings = config["correction"]
    player_history: dict[tuple[str, str], deque[float]] = defaultdict(
        lambda: deque(maxlen=int(settings["player_market_window"]))
    )
    market_history: dict[str, deque[float]] = defaultdict(
        lambda: deque(maxlen=int(settings["market_window"]))
    )
    audit_parts: list[pd.DataFrame] = []
    chosen_parts: list[pd.DataFrame] = []

    for event_date, raw_day in source.groupby("event_date", sort=True):
        day = raw_day.copy()
        correction_values = [
            _correction_for(row, player_history, market_history, config)
            for _, row in day.iterrows()
        ]
        day["daily_correction"] = [value[0] for value in correction_values]
        day["player_market_history_games"] = [value[1] for value in correction_values]
        day["market_history_games"] = [value[2] for value in correction_values]
        day["market_prior_bias"] = [value[3] for value in correction_values]
        day["adjusted_projection"] = day["projection"] + day["daily_correction"]
        probabilities = [_probability(row, config) for _, row in day.iterrows()]
        day["estimated_probability"] = [value[0] for value in probabilities]
        day["break_even_probability"] = [value[1] for value in probabilities]
        day["expected_value"] = [value[2] for value in probabilities]
        day["probability_edge"] = [value[3] for value in probabilities]
        day["wf_settlement"] = [
            _settlement(float(actual), float(line), str(side))
            for actual, line, side in zip(day["actual"], day["line"], day["side"])
        ]
        day["line_selection_status"] = "FILTERED"
        day["line_selection_reason"] = "probabilidad/cuota/EV insuficiente"
        eligible_mask = (
            day["odds"].between(float(config["min_odds"]), float(config["max_odds"]))
            & day["estimated_probability"].ge(float(config["min_probability"]))
            & day["expected_value"].ge(float(config["min_expected_value"]))
        )
        eligible = day[eligible_mask].copy()
        group_keys = ["event_date", "wf_player_key", "market", "side"]
        eligible = eligible.sort_values(
            group_keys + ["expected_value", "estimated_probability", "odds"],
            ascending=[True] * len(group_keys) + [False, False, False],
        )
        chosen_indices = eligible.drop_duplicates(group_keys, keep="first").index
        alternate_indices = eligible.index.difference(chosen_indices)
        day.loc[alternate_indices, "line_selection_status"] = "ALTERNATE_REJECTED"
        day.loc[alternate_indices, "line_selection_reason"] = "otra línea tuvo mayor valor esperado"
        day.loc[chosen_indices, "line_selection_status"] = "SELECTED"
        day.loc[chosen_indices, "line_selection_reason"] = "mejor línea sin usar el resultado actual"
        chosen = day.loc[chosen_indices].copy()
        chosen["event_date"] = chosen["event_date"].dt.date.astype("string")
        audit_day = day.copy()
        audit_day["event_date"] = audit_day["event_date"].dt.date.astype("string")
        chosen_parts.append(chosen)
        audit_parts.append(audit_day)

        # La fecha actual se incorpora solamente después de haber elegido sus picks.
        outcomes = raw_day.sort_values(
            ["wf_player_key", "market", "projection"]
        ).drop_duplicates(["wf_player_key", "market"], keep="first")
        for _, outcome in outcomes.iterrows():
            residual = float(outcome.actual) - float(outcome.projection)
            player_history[(outcome.wf_player_key, outcome.market)].append(residual)
            market_history[outcome.market].append(residual)

    audit = pd.concat(audit_parts, ignore_index=True) if audit_parts else pd.DataFrame()
    picks = pd.concat(chosen_parts, ignore_index=True) if chosen_parts else pd.DataFrame()
    return picks, audit


def _pick_legs(
    pool: pd.DataFrame,
    spec: dict,
    used_players: set[str] | None = None,
) -> pd.DataFrame:
    used_players = used_players or set()
    eligible = pool[
        pool["estimated_probability"].ge(float(spec["min_probability"]))
        & pool["expected_value"].ge(float(spec["min_expected_value"]))
        & ~pool["wf_player_key"].isin(used_players)
    ].sort_values(
        ["expected_value", "probability_edge", "estimated_probability", "odds"],
        ascending=False,
    )
    chosen: list[int] = []
    players: set[str] = set()
    market_counts: dict[str, int] = {}
    for index, row in eligible.iterrows():
        player = str(row.wf_player_key)
        market = str(row.market)
        if player in players:
            continue
        if market_counts.get(market, 0) >= int(spec["max_same_market"]):
            continue
        chosen.append(index)
        players.add(player)
        market_counts[market] = market_counts.get(market, 0) + 1
        if len(chosen) == int(spec["legs"]):
            break
    if len(chosen) != int(spec["legs"]):
        return pool.iloc[0:0].copy()
    return pool.loc[chosen].copy()


def _ticket(
    group_name: str,
    ticket_name: str,
    event_date: str,
    legs: pd.DataFrame,
    stake: float,
    slot: int,
) -> tuple[dict, list[dict]]:
    settle_input = legs.copy()
    settle_input["settlement"] = settle_input["wf_settlement"]
    settlement, profit, total_odds = settle_parlay(settle_input, stake)
    signature = tuple(sorted(
        (str(row.wf_player_key), str(row.market), str(row.side), float(row.line))
        for _, row in legs.iterrows()
    ))
    raw = f"{group_name}|{ticket_name}|{event_date}|{slot}|{signature}"
    ticket_id = "wf_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    joint_probability = float(math.prod(legs["estimated_probability"]))
    failed = legs[legs["wf_settlement"] == "LOSS"]
    ticket_row = {
        "ticket_id": ticket_id,
        "event_date": event_date,
        "group": group_name,
        "ticket_name": ticket_name,
        "legs": len(legs),
        "stake": stake,
        "total_odds": total_odds,
        "estimated_joint_probability": joint_probability,
        "estimated_ticket_ev": joint_probability * total_odds - 1.0,
        "settlement": settlement,
        "profit": profit,
        "failed_leg_count": len(failed),
        "failed_players": " | ".join(failed["player_name"].astype(str)),
        "odds_method": "BOOK_ODDS" if len(legs) == 1 else "SIMULATED_PRODUCT_ODDS",
    }
    leg_rows = []
    for number, (_, row) in enumerate(legs.iterrows(), start=1):
        item = row.to_dict()
        item.update({
            "ticket_id": ticket_id,
            "group": group_name,
            "ticket_name": ticket_name,
            "leg_number": number,
            "ticket_settlement": settlement,
            "ticket_profit": profit,
            "ticket_total_odds": total_odds,
        })
        leg_rows.append(item)
    return ticket_row, leg_rows


def build_methods(picks: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    tickets: list[dict] = []
    legs_out: list[dict] = []
    stake = float(config["stake_per_ticket"])
    for event_date, day in picks.groupby("event_date", sort=True):
        for spec in config["methods"]:
            if int(spec["legs"]) == 1:
                eligible = day[
                    day["estimated_probability"].ge(float(spec["min_probability"]))
                    & day["expected_value"].ge(float(spec["min_expected_value"]))
                ].sort_values(["expected_value", "probability_edge"], ascending=False)
                selected_players: set[str] = set()
                slot = 0
                for _, row in eligible.iterrows():
                    if row.wf_player_key in selected_players:
                        continue
                    selected_players.add(str(row.wf_player_key))
                    slot += 1
                    ticket, leg_rows = _ticket(
                        spec["name"], spec["name"], str(event_date), pd.DataFrame([row]), stake, slot
                    )
                    tickets.append(ticket)
                    legs_out.extend(leg_rows)
                    if slot >= int(spec["max_tickets_per_date"]):
                        break
            else:
                legs = _pick_legs(day, spec)
                if legs.empty:
                    continue
                ticket, leg_rows = _ticket(
                    spec["name"], spec["name"], str(event_date), legs, stake, 1
                )
                tickets.append(ticket)
                legs_out.extend(leg_rows)
    return pd.DataFrame(tickets), pd.DataFrame(legs_out)


def build_portfolios(picks: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    tickets: list[dict] = []
    legs_out: list[dict] = []
    stake = float(config["stake_per_ticket"])
    for event_date, day in picks.groupby("event_date", sort=True):
        for portfolio in config["portfolios"]:
            used_players: set[str] = set()
            slot = 0
            for spec in portfolio["tickets"]:
                for _ in range(int(spec["count"])):
                    legs = _pick_legs(day, spec, used_players)
                    if legs.empty:
                        break
                    used_players.update(legs["wf_player_key"].astype(str))
                    slot += 1
                    ticket, leg_rows = _ticket(
                        portfolio["name"], spec["ticket_name"], str(event_date), legs, stake, slot
                    )
                    tickets.append(ticket)
                    legs_out.extend(leg_rows)
    return pd.DataFrame(tickets), pd.DataFrame(legs_out)


def add_group_balances(tickets: pd.DataFrame, config: dict) -> pd.DataFrame:
    if tickets.empty:
        return tickets.copy()
    out = tickets.sort_values(["group", "event_date", "ticket_id"]).copy()
    initial = float(config["initial_bankroll"])
    before_values: list[float] = []
    after_values: list[float] = []
    balances: dict[str, float] = defaultdict(lambda: initial)
    for row in out.itertuples(index=False):
        before = balances[row.group]
        profit = float(row.profit) if pd.notna(row.profit) else 0.0
        after = before + profit
        balances[row.group] = after
        before_values.append(before)
        after_values.append(after)
    out["balance_before"] = before_values
    out["balance_after"] = after_values
    return out.reset_index(drop=True)


def _max_drawdown(group: pd.DataFrame, initial: float) -> tuple[float, float]:
    values = [initial] + group.sort_values(["event_date", "ticket_id"])["balance_after"].tolist()
    peak = initial
    amount = 0.0
    percentage = 0.0
    for value in values:
        peak = max(peak, value)
        current = peak - value
        amount = max(amount, current)
        percentage = max(percentage, current / peak if peak else 0.0)
    return amount, percentage


def summarize_groups(tickets: pd.DataFrame, config: dict) -> pd.DataFrame:
    if tickets.empty:
        return pd.DataFrame()
    initial = float(config["initial_bankroll"])
    rows = []
    for group_name, group in tickets.groupby("group", sort=False):
        decided = group[group["settlement"].isin(["WIN", "LOSS"])]
        profit = pd.to_numeric(group["profit"], errors="coerce").fillna(0).sum()
        risked = pd.to_numeric(decided["stake"], errors="coerce").sum()
        drawdown, drawdown_pct = _max_drawdown(group, initial)
        rows.append({
            "group": group_name,
            "tickets": len(group),
            "wins": int((group["settlement"] == "WIN").sum()),
            "losses": int((group["settlement"] == "LOSS").sum()),
            "pushes": int((group["settlement"] == "PUSH").sum()),
            "pending": int((group["settlement"] == "PENDING").sum()),
            "hit_rate": (group["settlement"] == "WIN").sum() / len(decided) if len(decided) else float("nan"),
            "profit": profit,
            "roi": profit / risked if risked else float("nan"),
            "average_odds": group["total_odds"].mean(),
            "final_balance": initial + profit,
            "max_drawdown": drawdown,
            "max_drawdown_pct": drawdown_pct,
        })
    return pd.DataFrame(rows).sort_values("group").reset_index(drop=True)


def _daily(tickets: pd.DataFrame) -> pd.DataFrame:
    if tickets.empty:
        return pd.DataFrame()
    rows = []
    for (event_date, group_name), group in tickets.groupby(["event_date", "group"], sort=True):
        rows.append({
            "event_date": event_date,
            "group": group_name,
            "tickets": len(group),
            "wins": int((group["settlement"] == "WIN").sum()),
            "losses": int((group["settlement"] == "LOSS").sum()),
            "profit": pd.to_numeric(group["profit"], errors="coerce").fillna(0).sum(),
            "balance_after": group.sort_values("ticket_id").iloc[-1]["balance_after"],
            "failed_players": " | ".join(value for value in group["failed_players"].astype(str) if value),
        })
    return pd.DataFrame(rows)


def write_outputs(
    picks: pd.DataFrame,
    audit: pd.DataFrame,
    method_tickets: pd.DataFrame,
    method_legs: pd.DataFrame,
    portfolio_tickets: pd.DataFrame,
    portfolio_legs: pd.DataFrame,
    config: dict,
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    methods_balanced = add_group_balances(method_tickets, config)
    portfolios_balanced = add_group_balances(portfolio_tickets, config)
    method_summary = summarize_groups(methods_balanced, config)
    portfolio_summary = summarize_groups(portfolios_balanced, config)
    atomic_csv(audit, output_dir / "walkforward_line_audit.csv")
    atomic_csv(picks, output_dir / "walkforward_picks.csv")
    atomic_csv(methods_balanced, output_dir / "walkforward_method_tickets.csv")
    atomic_csv(method_legs, output_dir / "walkforward_method_legs.csv")
    atomic_csv(method_summary, output_dir / "walkforward_method_summary.csv")
    atomic_csv(_daily(methods_balanced), output_dir / "walkforward_method_daily.csv")
    atomic_csv(portfolios_balanced, output_dir / "walkforward_portfolio_tickets.csv")
    atomic_csv(portfolio_legs, output_dir / "walkforward_portfolio_legs.csv")
    atomic_csv(portfolio_summary, output_dir / "walkforward_portfolio_summary.csv")
    atomic_csv(_daily(portfolios_balanced), output_dir / "walkforward_portfolio_daily.csv")
    report = [
        "LUDO WALK-FORWARD V2 — DESARROLLO HISTÓRICO",
        "",
        f"Fechas: {picks['event_date'].min() if not picks.empty else '-'} → {picks['event_date'].max() if not picks.empty else '-'}",
        f"Picks con línea única: {len(picks)}",
        "",
        "MÉTODOS INDEPENDIENTES",
        method_summary.round(4).to_string(index=False) if not method_summary.empty else "Sin tickets.",
        "",
        "CARTERAS SIN REPETIR JUGADOR EN LA MISMA FECHA",
        portfolio_summary.round(4).to_string(index=False) if not portfolio_summary.empty else "Sin tickets.",
        "",
        "ADVERTENCIAS",
        "- Las reglas ACTIVE se definieron con esta muestra: es desarrollo, no validación externa.",
        "- Las cuotas combinadas son productos simulados, no cuotas reales de Bet Builder.",
        "- La probabilidad usa una aproximación normal basada en MAE y debe calibrarse con más fechas.",
        "- Ningún resultado de la fecha actual se usa antes de elegir sus picks.",
    ]
    (output_dir / "walkforward_report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Fechas procesadas: {picks['event_date'].nunique() if not picks.empty else 0}")
    print(f"Líneas originales auditadas: {len(audit)}")
    print(f"Picks con línea única: {len(picks)}")
    print("\nMÉTODOS")
    print(method_summary.round(4).to_string(index=False) if not method_summary.empty else "Sin tickets.")
    print("\nCARTERAS")
    print(portfolio_summary.round(4).to_string(index=False) if not portfolio_summary.empty else "Sin tickets.")
    print(f"\nSalida: {output_dir}")
    print("Modo ficticio; no apuesta dinero real ni escribe en Supabase.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ludo walk-forward diario con línea única y carteras")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    args = parser.parse_args()
    source_path = Path(args.input).expanduser().resolve()
    if not source_path.is_file():
        raise SystemExit(f"No existe: {source_path}")
    config = load_walkforward_config(Path(args.config).expanduser().resolve())
    picks, audit = run_walkforward(pd.read_csv(source_path), config)
    method_tickets, method_legs = build_methods(picks, config)
    portfolio_tickets, portfolio_legs = build_portfolios(picks, config)
    write_outputs(
        picks, audit, method_tickets, method_legs, portfolio_tickets, portfolio_legs,
        config, Path(args.output_dir).expanduser().resolve(),
    )


if __name__ == "__main__":
    main()
