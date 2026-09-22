from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import pandas as pd

from .common import LAB_DIR, OUTPUTS_DIR, atomic_csv
from .settle_stake import normalize_name


DEFAULT_CONFIG = LAB_DIR / "parlay_config.json"
DEFAULT_INPUT = OUTPUTS_DIR / "strategy_shadow_v1" / "strategy_active.csv"
DEFAULT_OUTPUT_DIR = OUTPUTS_DIR / "parlays_shadow_v1"

REQUIRED_COLUMNS = {
    "event_date", "player_name", "matchup", "market", "side", "line", "odds",
    "edge_score", "mode", "strategy_status",
}


def load_parlay_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    required = {
        "strategy_name", "required_mode", "required_status", "stake_per_ticket",
        "max_same_player_per_ticket", "max_same_market_per_ticket",
        "max_leg_uses_per_date", "rule_reliability", "tiers",
    }
    missing = required - set(config)
    if missing:
        raise ValueError(f"Faltan claves de parlays: {sorted(missing)}")
    if float(config["stake_per_ticket"]) <= 0:
        raise ValueError("stake_per_ticket debe ser positivo")
    if int(config["max_leg_uses_per_date"]) < 1:
        raise ValueError("max_leg_uses_per_date debe ser al menos 1")
    names = set()
    for tier in config["tiers"]:
        tier_required = {
            "name", "legs", "min_edge_score", "min_rule_reliability",
            "max_same_matchup_per_ticket", "max_tickets_per_date",
        }
        tier_missing = tier_required - set(tier)
        if tier_missing:
            raise ValueError(f"Tier incompleto: faltan {sorted(tier_missing)}")
        if tier["name"] in names:
            raise ValueError(f"Tier duplicado: {tier['name']}")
        names.add(tier["name"])
        if int(tier["legs"]) < 2:
            raise ValueError("Un parlay necesita al menos dos selecciones")
    return config


def normalize_candidates(frame: pd.DataFrame, config: dict) -> pd.DataFrame:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Faltan columnas en strategy_active.csv: {sorted(missing)}")
    out = frame.copy()
    out["mode"] = out["mode"].fillna("").astype(str).str.upper()
    out["strategy_status"] = out["strategy_status"].fillna("").astype(str).str.upper()
    out["market"] = out["market"].fillna("").astype(str).str.upper()
    out["side"] = out["side"].fillna("").astype(str).str.upper()
    out["event_date"] = pd.to_datetime(out["event_date"], errors="coerce").dt.date.astype("string")
    for column in ("line", "odds", "edge_score"):
        out[column] = pd.to_numeric(out[column], errors="coerce")
    out["parlay_player_key"] = out["player_name"].map(normalize_name)
    out["parlay_rule"] = out["market"] + "|" + out["side"]
    reliability = {str(key).upper(): float(value) for key, value in config["rule_reliability"].items()}
    out["rule_reliability"] = out["parlay_rule"].map(reliability)
    out = out[
        (out["mode"] == str(config["required_mode"]).upper())
        & (out["strategy_status"] == str(config["required_status"]).upper())
        & out["event_date"].notna()
        & (out["parlay_player_key"] != "")
        & out["odds"].gt(1.0)
        & out["edge_score"].notna()
        & out["rule_reliability"].notna()
    ].copy()
    out["parlay_score"] = out["edge_score"] * out["rule_reliability"]
    duplicate_key = [
        "event_date", "parlay_player_key", "matchup", "market", "side", "line"
    ]
    out = out.sort_values(
        duplicate_key + ["parlay_score", "odds"],
        ascending=[True] * len(duplicate_key) + [False, False],
    ).drop_duplicates(duplicate_key, keep="first")
    return out.reset_index(drop=True)


def _leg_identity(row: pd.Series) -> tuple:
    return (
        str(row.event_date), str(row.parlay_player_key), str(row.matchup),
        str(row.market), str(row.side), float(row.line),
    )


def choose_legs(
    pool: pd.DataFrame,
    tier: dict,
    config: dict,
    use_counts: dict[tuple, int],
) -> pd.DataFrame:
    eligible = pool[
        (pool["edge_score"] >= float(tier["min_edge_score"]))
        & (pool["rule_reliability"] >= float(tier["min_rule_reliability"]))
    ].sort_values(["parlay_score", "edge_score", "odds"], ascending=False)

    chosen = []
    player_counts: dict[str, int] = {}
    market_counts: dict[str, int] = {}
    matchup_counts: dict[str, int] = {}
    max_uses = int(config["max_leg_uses_per_date"])
    for index, row in eligible.iterrows():
        identity = _leg_identity(row)
        player = str(row.parlay_player_key)
        market = str(row.market)
        matchup = str(row.matchup)
        if use_counts.get(identity, 0) >= max_uses:
            continue
        if player_counts.get(player, 0) >= int(config["max_same_player_per_ticket"]):
            continue
        if market_counts.get(market, 0) >= int(config["max_same_market_per_ticket"]):
            continue
        if matchup_counts.get(matchup, 0) >= int(tier["max_same_matchup_per_ticket"]):
            continue
        chosen.append(index)
        player_counts[player] = player_counts.get(player, 0) + 1
        market_counts[market] = market_counts.get(market, 0) + 1
        matchup_counts[matchup] = matchup_counts.get(matchup, 0) + 1
        if len(chosen) >= int(tier["legs"]):
            break
    if len(chosen) != int(tier["legs"]):
        return pool.iloc[0:0].copy()
    return pool.loc[chosen].copy()


def settle_parlay(legs: pd.DataFrame, stake: float) -> tuple[str, float | None, float]:
    odds = pd.to_numeric(legs["odds"], errors="coerce")
    if odds.isna().any() or (odds <= 1.0).any():
        raise ValueError("Cuota inválida en un parlay")
    states = legs.get("settlement", pd.Series("PENDING", index=legs.index))
    states = states.fillna("PENDING").astype(str).str.upper()
    active_odds = odds[~states.isin(["PUSH", "VOID"])]
    total_odds = float(math.prod(active_odds)) if not active_odds.empty else 1.0
    if (states == "LOSS").any():
        return "LOSS", -stake, total_odds
    if states.isin(["PUSH", "VOID"]).all():
        return "PUSH", 0.0, 1.0
    if states.isin(["WIN", "PUSH", "VOID"]).all():
        return "WIN", stake * (total_odds - 1.0), total_odds
    return "PENDING", None, total_odds


def build_parlays(candidates: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    ticket_rows = []
    leg_rows = []
    stake = float(config["stake_per_ticket"])
    for event_date, day in candidates.groupby("event_date", sort=True):
        use_counts: dict[tuple, int] = {}
        signatures: set[tuple] = set()
        for tier in config["tiers"]:
            made = 0
            for slot in range(1, int(tier["max_tickets_per_date"]) + 1):
                legs = choose_legs(day, tier, config, use_counts)
                if legs.empty:
                    break
                signature = tuple(sorted(_leg_identity(row) for _, row in legs.iterrows()))
                if signature in signatures:
                    break
                signatures.add(signature)
                for _, row in legs.iterrows():
                    identity = _leg_identity(row)
                    use_counts[identity] = use_counts.get(identity, 0) + 1

                raw_id = f"{event_date}|{tier['name']}|{slot}|{signature}"
                ticket_id = "parlay_" + hashlib.sha256(raw_id.encode("utf-8")).hexdigest()[:16]
                settlement, profit, total_odds = settle_parlay(legs, stake)
                joint_probability = float(math.prod(legs["rule_reliability"]))
                ticket_rows.append({
                    "ticket_id": ticket_id,
                    "event_date": event_date,
                    "tier": tier["name"],
                    "legs": len(legs),
                    "stake": stake,
                    "total_odds": total_odds,
                    "estimated_joint_hit_rate": joint_probability,
                    "estimated_value": joint_probability * total_odds - 1.0,
                    "settlement": settlement,
                    "profit": profit,
                    "odds_method": "SIMULATED_PRODUCT_ODDS",
                })
                for leg_number, (_, row) in enumerate(legs.iterrows(), start=1):
                    item = row.to_dict()
                    item.update({
                        "ticket_id": ticket_id,
                        "tier": tier["name"],
                        "leg_number": leg_number,
                    })
                    leg_rows.append(item)
                made += 1
            if made == 0:
                continue
    return pd.DataFrame(ticket_rows), pd.DataFrame(leg_rows)


def summarize_tickets(tickets: pd.DataFrame) -> pd.DataFrame:
    if tickets.empty:
        return pd.DataFrame(columns=[
            "tier", "tickets", "wins", "losses", "pushes", "pending", "profit", "roi"
        ])
    rows = []
    for tier, group in tickets.groupby("tier"):
        decided = group[group["settlement"].isin(["WIN", "LOSS"])]
        profit = pd.to_numeric(group["profit"], errors="coerce").fillna(0).sum()
        stake = pd.to_numeric(decided["stake"], errors="coerce").sum()
        rows.append({
            "tier": tier,
            "tickets": len(group),
            "wins": int((group["settlement"] == "WIN").sum()),
            "losses": int((group["settlement"] == "LOSS").sum()),
            "pushes": int((group["settlement"] == "PUSH").sum()),
            "pending": int((group["settlement"] == "PENDING").sum()),
            "profit": profit,
            "roi": profit / stake if stake else float("nan"),
            "average_odds": group["total_odds"].mean(),
            "estimated_joint_hit_rate": group["estimated_joint_hit_rate"].mean(),
        })
    return pd.DataFrame(rows).sort_values("tier").reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Construye parlays ficticios desde picks adaptativos activos")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    args = parser.parse_args()

    source = Path(args.input).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"No existe: {source}")
    config = load_parlay_config(Path(args.config).expanduser().resolve())
    candidates = normalize_candidates(pd.read_csv(source), config)
    tickets, legs = build_parlays(candidates, config)
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    atomic_csv(tickets, output_dir / "parlay_tickets.csv")
    atomic_csv(legs, output_dir / "parlay_legs.csv")
    summary = summarize_tickets(tickets)
    atomic_csv(summary, output_dir / "parlay_summary.csv")

    print(f"Picks adaptativos activos elegibles: {len(candidates)}")
    print(f"Parlays creados: {len(tickets)}")
    print(summary.round(4).to_string(index=False) if not summary.empty else "No hubo parlays válidos; no se forzó ninguno.")
    print(f"\nSalida: {output_dir}")
    print("Cuotas combinadas simuladas; no son cuotas reales de Bet Builder.")


if __name__ == "__main__":
    main()
