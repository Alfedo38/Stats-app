from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import pandas as pd

from .common import LAB_DIR, OUTPUTS_DIR, atomic_csv
from .parlays import settle_parlay
from .settle_stake import normalize_name


DEFAULT_CONFIG = LAB_DIR / "methodology_config.json"
DEFAULT_INPUT = OUTPUTS_DIR / "strategy_shadow_v1" / "strategy_active.csv"
DEFAULT_OUTPUT_DIR = OUTPUTS_DIR / "methodologies_shadow_v1"

REQUIRED_COLUMNS = {
    "event_date", "player_name", "matchup", "market", "side", "line", "odds",
    "edge_score", "mode", "strategy_status",
}
GAME_RE = re.compile(r"\b([A-Z]{2,4})\s*(?:VS\.?|V\.?|@)\s*([A-Z]{2,4})\b", re.IGNORECASE)


def canonical_game_id(event_date: object, matchup: object) -> str:
    date = str(event_date)
    text = re.sub(r"\s+", " ", str(matchup or "").strip().upper())
    match = GAME_RE.search(text)
    if match:
        teams = sorted([match.group(1).upper(), match.group(2).upper()])
        return f"{date}|{teams[0]}|{teams[1]}"
    tokens = [token for token in re.findall(r"\b[A-Z]{2,4}\b", text) if token not in {"VS", "AT"}]
    if len(tokens) >= 2:
        teams = sorted(tokens[:2])
        return f"{date}|{teams[0]}|{teams[1]}"
    fallback = normalize_name(text)
    return f"{date}|UNKNOWN|{fallback}"


def load_methodology_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    required = {
        "experiment_name", "required_mode", "required_status", "initial_bankroll",
        "stake_per_ticket", "max_same_player_per_ticket", "rule_reliability", "methods",
    }
    missing = required - set(config)
    if missing:
        raise ValueError(f"Faltan claves de metodologías: {sorted(missing)}")
    if float(config["initial_bankroll"]) <= 0 or float(config["stake_per_ticket"]) <= 0:
        raise ValueError("Capital y stake deben ser positivos")
    names = set()
    allowed_modes = {"ANY", "SAME_GAME", "CROSS_GAME"}
    for method in config["methods"]:
        needed = {
            "name", "kind", "legs", "game_mode", "min_edge_score",
            "min_rule_reliability", "max_same_market", "max_same_game",
        }
        absent = needed - set(method)
        if absent:
            raise ValueError(f"Método incompleto: faltan {sorted(absent)}")
        if method["name"] in names:
            raise ValueError(f"Método duplicado: {method['name']}")
        names.add(method["name"])
        if method["kind"] not in {"single", "parlay"}:
            raise ValueError(f"kind inválido: {method['kind']}")
        if method["game_mode"] not in allowed_modes:
            raise ValueError(f"game_mode inválido: {method['game_mode']}")
        if int(method["legs"]) < 1:
            raise ValueError("legs debe ser al menos 1")
    return config


def normalize_candidates(frame: pd.DataFrame, config: dict) -> pd.DataFrame:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Faltan columnas: {sorted(missing)}")
    out = frame.copy()
    for column in ("mode", "strategy_status", "market", "side"):
        out[column] = out[column].fillna("").astype(str).str.upper()
    out["event_date"] = pd.to_datetime(out["event_date"], errors="coerce").dt.date.astype("string")
    for column in ("line", "odds", "edge_score"):
        out[column] = pd.to_numeric(out[column], errors="coerce")
    if "settlement" not in out:
        out["settlement"] = "PENDING"
    out["settlement"] = out["settlement"].fillna("PENDING").astype(str).str.upper()
    out["method_player_key"] = out["player_name"].map(normalize_name)
    out["method_rule"] = out["market"] + "|" + out["side"]
    reliability = {str(key).upper(): float(value) for key, value in config["rule_reliability"].items()}
    out["rule_reliability"] = out["method_rule"].map(reliability)
    out["canonical_game_id"] = [
        canonical_game_id(date, matchup) for date, matchup in zip(out["event_date"], out["matchup"])
    ]
    out = out[
        (out["mode"] == str(config["required_mode"]).upper())
        & (out["strategy_status"] == str(config["required_status"]).upper())
        & out["event_date"].notna()
        & (out["method_player_key"] != "")
        & out["odds"].gt(1.0)
        & out["edge_score"].notna()
        & out["rule_reliability"].notna()
    ].copy()
    out["method_score"] = out["edge_score"] * out["rule_reliability"]
    keys = ["event_date", "method_player_key", "canonical_game_id", "market", "side", "line"]
    out = out.sort_values(keys + ["method_score", "odds"], ascending=[True] * len(keys) + [False, False])
    return out.drop_duplicates(keys, keep="first").reset_index(drop=True)


def _choose_greedy(pool: pd.DataFrame, method: dict) -> pd.DataFrame:
    chosen = []
    players: dict[str, int] = {}
    markets: dict[str, int] = {}
    games: dict[str, int] = {}
    ordered = pool.sort_values(["method_score", "edge_score", "odds"], ascending=False)
    for index, row in ordered.iterrows():
        player = str(row.method_player_key)
        market = str(row.market)
        game = str(row.canonical_game_id)
        if players.get(player, 0) >= int(method.get("max_same_player", 1)):
            continue
        if markets.get(market, 0) >= int(method["max_same_market"]):
            continue
        if games.get(game, 0) >= int(method["max_same_game"]):
            continue
        chosen.append(index)
        players[player] = players.get(player, 0) + 1
        markets[market] = markets.get(market, 0) + 1
        games[game] = games.get(game, 0) + 1
        if len(chosen) == int(method["legs"]):
            break
    if len(chosen) != int(method["legs"]):
        return pool.iloc[0:0].copy()
    return pool.loc[chosen].copy()


def choose_method_legs(day: pd.DataFrame, method: dict) -> pd.DataFrame:
    eligible = day[
        (day["edge_score"] >= float(method["min_edge_score"]))
        & (day["rule_reliability"] >= float(method["min_rule_reliability"]))
    ].copy()
    if len(eligible) < int(method["legs"]):
        return eligible.iloc[0:0].copy()
    mode = method["game_mode"]
    if mode == "SAME_GAME":
        candidates = []
        for _, game in eligible.groupby("canonical_game_id"):
            picked = _choose_greedy(game, method)
            if len(picked) == int(method["legs"]):
                candidates.append(picked)
        if not candidates:
            return eligible.iloc[0:0].copy()
        return max(candidates, key=lambda frame: float(frame["method_score"].sum()))
    if mode == "CROSS_GAME":
        cross = dict(method)
        cross["max_same_game"] = 1
        return _choose_greedy(eligible, cross)
    return _choose_greedy(eligible, method)


def _ticket_rows(method: dict, event_date: str, legs: pd.DataFrame, config: dict, slot: int = 1):
    stake = float(config["stake_per_ticket"])
    settlement, profit, total_odds = settle_parlay(legs, stake)
    games = int(legs["canonical_game_id"].nunique())
    game_scope = "SAME_GAME" if games == 1 else "CROSS_GAME"
    signature_items = []
    for _, row in legs.iterrows():
        signature_items.append((
            str(row.method_player_key), str(row.canonical_game_id), str(row.market),
            str(row.side), float(row.line),
        ))
    signature = tuple(sorted(signature_items))
    raw = f"{event_date}|{method['name']}|{slot}|{signature}"
    ticket_id = "method_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    failed = legs[legs["settlement"] == "LOSS"]
    ticket = {
        "ticket_id": ticket_id,
        "event_date": event_date,
        "method": method["name"],
        "kind": method["kind"],
        "game_mode_requested": method["game_mode"],
        "game_scope_actual": game_scope,
        "legs": len(legs),
        "stake": stake,
        "total_odds": total_odds,
        "estimated_joint_hit_rate": float(math.prod(legs["rule_reliability"])),
        "settlement": settlement,
        "profit": profit,
        "failed_leg_count": len(failed),
        "failed_players": " | ".join(failed["player_name"].astype(str)),
        "leg_signature": json.dumps(signature, ensure_ascii=False),
        "odds_method": "BOOK_ODDS" if len(legs) == 1 else "SIMULATED_PRODUCT_ODDS",
    }
    leg_rows = []
    for number, (_, row) in enumerate(legs.iterrows(), start=1):
        item = row.to_dict()
        item.update({
            "ticket_id": ticket_id,
            "method": method["name"],
            "leg_number": number,
            "ticket_settlement": settlement,
            "ticket_profit": profit,
            "ticket_total_odds": total_odds,
            "game_scope_actual": game_scope,
        })
        leg_rows.append(item)
    return ticket, leg_rows


def build_methodologies(candidates: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    tickets = []
    legs_out = []
    methods = config["methods"]
    for event_date, day in candidates.groupby("event_date", sort=True):
        for method in methods:
            method = dict(method)
            method["max_same_player"] = int(config["max_same_player_per_ticket"])
            if method["kind"] == "single":
                eligible = day[
                    (day["edge_score"] >= float(method["min_edge_score"]))
                    & (day["rule_reliability"] >= float(method["min_rule_reliability"]))
                ].copy()
                for slot, (_, row) in enumerate(eligible.iterrows(), start=1):
                    ticket, ticket_legs = _ticket_rows(
                        method, str(event_date), pd.DataFrame([row]), config, slot
                    )
                    tickets.append(ticket)
                    legs_out.extend(ticket_legs)
                continue
            picked = choose_method_legs(day, method)
            if picked.empty:
                continue
            ticket, ticket_legs = _ticket_rows(method, str(event_date), picked, config)
            tickets.append(ticket)
            legs_out.extend(ticket_legs)

    ticket_frame = pd.DataFrame(tickets)
    leg_frame = pd.DataFrame(legs_out)
    if ticket_frame.empty:
        return ticket_frame, leg_frame
    ticket_frame["duplicate_signature_across_methods"] = ticket_frame.duplicated(
        ["event_date", "leg_signature"], keep=False
    )
    return ticket_frame, leg_frame


def add_balances(tickets: pd.DataFrame, config: dict) -> pd.DataFrame:
    if tickets.empty:
        return tickets.copy()
    out = tickets.copy()
    method_order = {method["name"]: position for position, method in enumerate(config["methods"])}
    out["method_order"] = out["method"].map(method_order).fillna(999)
    out = out.sort_values(["event_date", "method_order", "ticket_id"]).reset_index(drop=True)
    initial = float(config["initial_bankroll"])
    common = initial
    method_balances: dict[str, float] = {}
    common_before = []
    common_after = []
    method_before = []
    method_after = []
    for row in out.itertuples(index=False):
        profit = float(row.profit) if pd.notna(row.profit) else 0.0
        current_method = method_balances.get(row.method, initial)
        common_before.append(common)
        method_before.append(current_method)
        common += profit
        current_method += profit
        method_balances[row.method] = current_method
        common_after.append(common)
        method_after.append(current_method)
    out["common_balance_before"] = common_before
    out["common_balance_after"] = common_after
    out["method_balance_before"] = method_before
    out["method_balance_after"] = method_after
    return out.drop(columns=["method_order"])


def _drawdown(group: pd.DataFrame, initial: float) -> tuple[float, float]:
    values = [initial] + group.sort_values(["event_date", "ticket_id"])["method_balance_after"].tolist()
    peak = values[0]
    max_amount = 0.0
    max_pct = 0.0
    for value in values:
        peak = max(peak, value)
        amount = peak - value
        pct = amount / peak if peak else 0.0
        max_amount = max(max_amount, amount)
        max_pct = max(max_pct, pct)
    return max_amount, max_pct


def methodology_summary(tickets: pd.DataFrame, config: dict) -> pd.DataFrame:
    if tickets.empty:
        return pd.DataFrame()
    rows = []
    initial = float(config["initial_bankroll"])
    for method, group in tickets.groupby("method", sort=False):
        decided = group[group["settlement"].isin(["WIN", "LOSS"])]
        profit = pd.to_numeric(group["profit"], errors="coerce").fillna(0).sum()
        risked = pd.to_numeric(decided["stake"], errors="coerce").sum()
        drawdown, drawdown_pct = _drawdown(group, initial)
        rows.append({
            "method": method,
            "tickets": len(group),
            "wins": int((group["settlement"] == "WIN").sum()),
            "losses": int((group["settlement"] == "LOSS").sum()),
            "pushes": int((group["settlement"] == "PUSH").sum()),
            "pending": int((group["settlement"] == "PENDING").sum()),
            "hit_rate": (group["settlement"] == "WIN").sum() / len(decided) if len(decided) else float("nan"),
            "profit": profit,
            "roi": profit / risked if risked else float("nan"),
            "average_odds": group["total_odds"].mean(),
            "final_method_balance": initial + profit,
            "max_drawdown": drawdown,
            "max_drawdown_pct": drawdown_pct,
        })
    return pd.DataFrame(rows).sort_values("method").reset_index(drop=True)


def daily_report(tickets: pd.DataFrame) -> pd.DataFrame:
    if tickets.empty:
        return pd.DataFrame()
    rows = []
    for (event_date, method), group in tickets.groupby(["event_date", "method"], sort=True):
        rows.append({
            "event_date": event_date,
            "method": method,
            "tickets": len(group),
            "wins": int((group["settlement"] == "WIN").sum()),
            "losses": int((group["settlement"] == "LOSS").sum()),
            "pending": int((group["settlement"] == "PENDING").sum()),
            "profit": pd.to_numeric(group["profit"], errors="coerce").fillna(0).sum(),
            "method_balance_after": group.iloc[-1]["method_balance_after"],
            "common_balance_after": group.iloc[-1]["common_balance_after"],
            "failed_players": " | ".join(value for value in group["failed_players"].astype(str) if value),
        })
    return pd.DataFrame(rows)


def write_outputs(tickets: pd.DataFrame, legs: pd.DataFrame, config: dict, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    balanced = add_balances(tickets, config)
    summary = methodology_summary(balanced, config)
    daily = daily_report(balanced)
    atomic_csv(balanced, output_dir / "methodology_tickets.csv")
    atomic_csv(legs, output_dir / "methodology_legs.csv")
    atomic_csv(summary, output_dir / "methodology_summary.csv")
    atomic_csv(daily, output_dir / "methodology_daily.csv")
    parlays_daily = daily[daily["method"] != "SINGLE"] if not daily.empty else daily
    report = [
        "LUDO — LABORATORIO DE METODOLOGÍAS",
        "",
        "RESUMEN",
        summary.round(4).to_string(index=False) if not summary.empty else "Sin tickets.",
        "",
        "PARLAYS DÍA POR DÍA",
        parlays_daily.round(4).to_string(index=False) if not parlays_daily.empty else "Sin parlays.",
        "",
        "Las cuotas de parlays son productos simulados, no cuotas reales de Bet Builder.",
    ]
    (output_dir / "methodology_report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(summary.round(4).to_string(index=False) if not summary.empty else "Sin tickets.")
    if not balanced.empty:
        print(f"\nBanca común final: {balanced.iloc[-1].common_balance_after:.2f}")
    print(f"Salida: {output_dir}")
    print("Parlays con cuotas simuladas; metodologías todavía experimentales.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Compara metodologías ficticias de Ludo")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    args = parser.parse_args()
    source = Path(args.input).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"No existe: {source}")
    config = load_methodology_config(Path(args.config).expanduser().resolve())
    candidates = normalize_candidates(pd.read_csv(source), config)
    tickets, legs = build_methodologies(candidates, config)
    print(f"Picks activos elegibles: {len(candidates)}")
    print(f"Tickets construidos: {len(tickets)}")
    write_outputs(tickets, legs, config, Path(args.output_dir).expanduser().resolve())


if __name__ == "__main__":
    main()
