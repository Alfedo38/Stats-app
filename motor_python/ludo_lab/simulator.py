from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .common import LAB_DIR, OUTPUTS_DIR


DEFAULT_DB = LAB_DIR / "ludo_lab.db"
DEFAULT_CONFIG = LAB_DIR / "simulation_config.json"
DEFAULT_SETTLED = OUTPUTS_DIR / "stake_settled.csv"


SCHEMA = """
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS simulation_runs (
    run_id TEXT PRIMARY KEY,
    run_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    initial_bankroll REAL NOT NULL,
    stake_per_ticket REAL NOT NULL,
    allow_negative_balance INTEGER NOT NULL,
    final_balance REAL,
    status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES simulation_runs(run_id),
    sequence_no INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    matchup TEXT,
    ticket_type TEXT NOT NULL,
    stake REAL NOT NULL,
    total_odds REAL NOT NULL,
    odds_method TEXT NOT NULL,
    settlement TEXT NOT NULL,
    profit REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    model_mode TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(run_id, sequence_no)
);
CREATE TABLE IF NOT EXISTS ticket_legs (
    ticket_id TEXT NOT NULL REFERENCES tickets(ticket_id),
    leg_no INTEGER NOT NULL,
    player_name TEXT,
    matchup TEXT,
    market TEXT NOT NULL,
    side TEXT NOT NULL,
    line REAL NOT NULL,
    odds REAL NOT NULL,
    projection REAL,
    actual REAL,
    edge_score REAL,
    settlement TEXT NOT NULL,
    snapshot_file TEXT,
    PRIMARY KEY(ticket_id, leg_no)
);
CREATE TABLE IF NOT EXISTS ledger (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES simulation_runs(run_id),
    ticket_id TEXT NOT NULL REFERENCES tickets(ticket_id),
    event_date TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    note TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_run_date ON tickets(run_id, event_date, sequence_no);
CREATE INDEX IF NOT EXISTS idx_legs_ticket ON ticket_legs(ticket_id, leg_no);
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    if float(config["initial_bankroll"]) <= 0 or float(config["stake_per_ticket"]) <= 0:
        raise ValueError("Capital inicial y stake deben ser positivos")
    if int(config["game_parlay_min_legs"]) < 2:
        raise ValueError("Una combinada necesita al menos dos selecciones")
    return config


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    return connection


def normalize_settled(frame: pd.DataFrame) -> pd.DataFrame:
    required = {
        "event_date", "player_name", "matchup", "market", "side", "line", "odds",
        "projection", "actual", "edge_score", "settlement",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Faltan columnas en stake_settled.csv: {sorted(missing)}")
    out = frame.copy()
    parsed_date = pd.to_datetime(out["event_date"], errors="coerce")
    out = out[parsed_date.notna()].copy()
    out["event_date"] = parsed_date[parsed_date.notna()].dt.date.astype(str)
    for column in ["line", "odds", "projection", "actual", "edge_score"]:
        out[column] = pd.to_numeric(out[column], errors="coerce")
    out["settlement"] = out["settlement"].astype(str).str.upper()
    out = out[
        out.event_date.notna()
        & out.odds.gt(1.0)
        & out.line.notna()
        & out.settlement.isin(["WIN", "LOSS", "PUSH", "VOID"])
    ].copy()
    out["player_key"] = out["player_name"].fillna("").astype(str).str.casefold().str.replace(r"\W+", "", regex=True)
    out = out.sort_values(["event_date", "matchup", "edge_score"], ascending=[True, True, False])
    return out.reset_index(drop=True)


def compatible_legs(group: pd.DataFrame, wanted: int, config: dict) -> pd.DataFrame:
    chosen = []
    player_counts: dict[str, int] = {}
    market_counts: dict[str, int] = {}
    for index, row in group.sort_values(["edge_score", "odds"], ascending=False).iterrows():
        player = str(row.player_key)
        market = str(row.market)
        if player_counts.get(player, 0) >= int(config["max_same_player_legs"]):
            continue
        if market_counts.get(market, 0) >= int(config["max_same_market_per_ticket"]):
            continue
        chosen.append(index)
        player_counts[player] = player_counts.get(player, 0) + 1
        market_counts[market] = market_counts.get(market, 0) + 1
        if len(chosen) >= wanted:
            break
    return group.loc[chosen].copy()


def settle_ticket(legs: pd.DataFrame, stake: float) -> tuple[str, float, float]:
    states = set(legs.settlement.astype(str).str.upper())
    active = legs[~legs.settlement.isin(["PUSH", "VOID"])]
    total_odds = float(math.prod(active.odds)) if not active.empty else 1.0
    if "LOSS" in states:
        return "LOSS", -stake, total_odds
    if active.empty:
        return "PUSH", 0.0, 1.0
    return "WIN", stake * (total_odds - 1.0), total_odds


def ticket_candidates(settled: pd.DataFrame, config: dict):
    candidates = []
    if bool(config["create_singles"]):
        for _, row in settled.iterrows():
            candidates.append(("SINGLE", str(row.event_date), str(row.matchup), pd.DataFrame([row])))

    if bool(config["create_game_parlays"]):
        minimum = int(config["game_parlay_min_legs"])
        maximum = int(config["game_parlay_max_legs"])
        for (event_date, matchup), group in settled.groupby(["event_date", "matchup"], dropna=False):
            legs = compatible_legs(group, maximum, config)
            if len(legs) >= minimum:
                candidates.append((f"PARLAY_GAME_{len(legs)}", str(event_date), str(matchup), legs))

    if bool(config["create_slate_parlays"]):
        wanted = int(config["slate_parlay_legs"])
        for event_date, group in settled.groupby("event_date"):
            # Primero una selección máxima por partido para reducir correlación.
            top_per_game = group.sort_values("edge_score", ascending=False).drop_duplicates("matchup")
            legs = compatible_legs(top_per_game, wanted, config)
            if len(legs) >= wanted:
                candidates.append((f"PARLAY_SLATE_{wanted}", str(event_date), "GLOBAL", legs))

    priority = {"SINGLE": 0}
    candidates.sort(key=lambda item: (item[1], priority.get(item[0], 1), item[2], item[0]))
    yield from candidates


def insert_ticket(
    connection: sqlite3.Connection,
    run_id: str,
    sequence: int,
    ticket_type: str,
    event_date: str,
    matchup: str,
    legs: pd.DataFrame,
    balance: float,
    config: dict,
) -> float:
    stake = float(config["stake_per_ticket"])
    settlement, profit, total_odds = settle_ticket(legs, stake)
    after = balance + profit
    ticket_id = f"{run_id}-{sequence:06d}"
    now = datetime.now(timezone.utc).isoformat()
    model_mode = str(legs["mode"].iloc[0]) if "mode" in legs.columns else ""
    connection.execute(
        """INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (ticket_id, run_id, sequence, event_date, matchup, ticket_type, stake, total_odds,
         "BOOK_ODDS" if ticket_type == "SINGLE" else str(config["odds_method"]),
         settlement, profit, balance, after, model_mode, now),
    )
    for leg_no, (_, row) in enumerate(legs.iterrows(), start=1):
        connection.execute(
            """INSERT INTO ticket_legs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ticket_id, leg_no, str(row.get("player_name", "")), str(row.get("matchup", "")),
             str(row.market), str(row.side), float(row.line), float(row.odds),
             float(row.projection) if pd.notna(row.projection) else None,
             float(row.actual) if pd.notna(row.actual) else None,
             float(row.edge_score) if pd.notna(row.edge_score) else None,
             str(row.settlement), str(row.get("snapshot_file", ""))),
        )
    connection.execute(
        "INSERT INTO ledger(run_id, ticket_id, event_date, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?)",
        (run_id, ticket_id, event_date, profit, after, settlement),
    )
    return after


def export_run(connection: sqlite3.Connection, run_id: str, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    tickets = pd.read_sql_query(
        "SELECT * FROM tickets WHERE run_id = ? ORDER BY sequence_no", connection, params=(run_id,)
    )
    legs = pd.read_sql_query(
        """SELECT l.* FROM ticket_legs l JOIN tickets t ON t.ticket_id=l.ticket_id
           WHERE t.run_id=? ORDER BY t.sequence_no,l.leg_no""", connection, params=(run_id,)
    )
    tickets.to_csv(output_dir / f"{run_id}_tickets.csv", index=False)
    legs.to_csv(output_dir / f"{run_id}_legs.csv", index=False)
    summary = (
        tickets.groupby("ticket_type")
        .agg(tickets=("ticket_id", "size"), wins=("settlement", lambda x: (x == "WIN").sum()),
             losses=("settlement", lambda x: (x == "LOSS").sum()), profit=("profit", "sum"),
             average_odds=("total_odds", "mean"))
        .reset_index()
    )
    summary["roi"] = summary.profit / (summary.tickets * tickets.stake.iloc[0])
    summary.to_csv(output_dir / f"{run_id}_summary.csv", index=False)
    print("\n" + summary.round(4).to_string(index=False))


def replay(args) -> None:
    source = Path(args.settled).expanduser().resolve()
    config_path = Path(args.config).expanduser().resolve()
    db_path = Path(args.db).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"No existe: {source}")
    config = load_config(config_path)
    settled = normalize_settled(pd.read_csv(source))
    connection = connect(db_path)
    existing = connection.execute("SELECT run_id FROM simulation_runs WHERE run_name=?", (args.run_name,)).fetchone()
    if existing:
        raise SystemExit(f"Ya existe run_name={args.run_name}. Elegí otro nombre; no se duplicó la simulación.")
    run_id = "sim_" + uuid.uuid4().hex[:12]
    balance = float(config["initial_bankroll"])
    connection.execute(
        "INSERT INTO simulation_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (run_id, args.run_name, datetime.now(timezone.utc).isoformat(), str(source), sha256(source),
         balance, float(config["stake_per_ticket"]), int(bool(config["allow_negative_balance"])),
         None, "RUNNING"),
    )
    sequence = 0
    for ticket_type, event_date, matchup, legs in ticket_candidates(settled, config):
        sequence += 1
        balance = insert_ticket(
            connection, run_id, sequence, ticket_type, event_date, matchup, legs, balance, config
        )
    connection.execute(
        "UPDATE simulation_runs SET final_balance=?, status='COMPLETED' WHERE run_id=?", (balance, run_id)
    )
    connection.commit()
    export_run(connection, run_id, Path(args.output_dir).expanduser().resolve())
    print(f"\nRun: {run_id} ({args.run_name})")
    print(f"Capital inicial: {float(config['initial_bankroll']):.2f}")
    print(f"Saldo final: {balance:.2f}")
    print(f"Tickets: {sequence}")
    print(f"Base local: {db_path}")
    if balance < 0:
        print("Saldo negativo permitido: la simulación continuó sin detenerse.")


def show(args) -> None:
    connection = connect(Path(args.db).expanduser().resolve())
    runs = pd.read_sql_query(
        "SELECT run_id,run_name,created_at,initial_bankroll,final_balance,status FROM simulation_runs ORDER BY created_at",
        connection,
    )
    print(runs.to_string(index=False) if not runs.empty else "No hay simulaciones.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Banca virtual y registro de apuestas de Ludo")
    sub = parser.add_subparsers(dest="command", required=True)
    replay_parser = sub.add_parser("replay", help="Reproduce picks históricos una sola vez")
    replay_parser.add_argument("--settled", default=str(DEFAULT_SETTLED))
    replay_parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    replay_parser.add_argument("--db", default=str(DEFAULT_DB))
    replay_parser.add_argument("--output-dir", default=str(OUTPUTS_DIR / "simulation"))
    replay_parser.add_argument("--run-name", required=True)
    replay_parser.set_defaults(func=replay)
    show_parser = sub.add_parser("show", help="Lista las simulaciones")
    show_parser.add_argument("--db", default=str(DEFAULT_DB))
    show_parser.set_defaults(func=show)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
