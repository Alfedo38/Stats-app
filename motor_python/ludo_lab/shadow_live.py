"""Ludo Shadow Live: ledger local, picks congelados y liquidación ficticia."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "shadow_live_config.json"
DEFAULT_DB = HERE / "shadow_live.db"
DEFAULT_REPORTS = HERE / "outputs" / "shadow_live"

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  config_sha256 TEXT NOT NULL,
  predictions_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_candidates (
  candidate_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  branch TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  matchup TEXT,
  market TEXT NOT NULL,
  side TEXT NOT NULL,
  line REAL NOT NULL,
  odds REAL NOT NULL,
  projection_base REAL NOT NULL,
  correction REAL NOT NULL,
  projection_final REAL NOT NULL,
  model_mae REAL NOT NULL,
  probability REAL NOT NULL,
  break_even REAL NOT NULL,
  expected_value REAL NOT NULL,
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS picks (
  pick_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  branch TEXT NOT NULL,
  event_date TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT NOT NULL,
  matchup TEXT,
  market TEXT NOT NULL,
  side TEXT NOT NULL,
  line REAL NOT NULL,
  odds REAL NOT NULL,
  projection_base REAL NOT NULL,
  correction REAL NOT NULL,
  projection_final REAL NOT NULL,
  model_mae REAL NOT NULL,
  probability REAL NOT NULL,
  break_even REAL NOT NULL,
  expected_value REAL NOT NULL,
  model_key TEXT,
  UNIQUE(run_id, branch, player_key, market, side)
);
CREATE TABLE IF NOT EXISTS tickets (
  ticket_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  branch TEXT NOT NULL,
  event_date TEXT NOT NULL,
  portfolio TEXT NOT NULL,
  ticket_number INTEGER NOT NULL,
  legs INTEGER NOT NULL,
  stake REAL NOT NULL,
  total_odds REAL NOT NULL,
  joint_probability REAL NOT NULL,
  expected_value REAL NOT NULL,
  odds_kind TEXT NOT NULL DEFAULT 'SIMULATED_PRODUCT',
  UNIQUE(run_id, branch, portfolio, ticket_number)
);
CREATE TABLE IF NOT EXISTS ticket_legs (
  ticket_id TEXT NOT NULL REFERENCES tickets(ticket_id),
  pick_id TEXT NOT NULL REFERENCES picks(pick_id),
  leg_number INTEGER NOT NULL,
  PRIMARY KEY(ticket_id, leg_number),
  UNIQUE(ticket_id, pick_id)
);
CREATE TABLE IF NOT EXISTS pick_settlements (
  pick_id TEXT PRIMARY KEY REFERENCES picks(pick_id),
  actual REAL NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('WIN','LOSS','PUSH','VOID')),
  source TEXT NOT NULL,
  settled_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_settlements (
  ticket_id TEXT PRIMARY KEY REFERENCES tickets(ticket_id),
  result TEXT NOT NULL CHECK(result IN ('WIN','LOSS','PUSH','VOID')),
  effective_odds REAL NOT NULL,
  profit REAL NOT NULL,
  settled_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bankroll_events (
  event_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE REFERENCES tickets(ticket_id),
  branch TEXT NOT NULL,
  portfolio TEXT NOT NULL,
  event_date TEXT NOT NULL,
  profit REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_picks_date ON picks(event_date, branch);
CREATE INDEX IF NOT EXISTS idx_settlement_history ON picks(branch, player_key, market, event_date);
CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(event_date, branch, portfolio);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def stable_id(prefix: str, *parts: Any) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    return f"{prefix}_{hashlib.sha256(raw.encode()).hexdigest()[:20]}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def normalize_name(value: Any) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def load_config(path: Path | str = DEFAULT_CONFIG) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db(db_path: Path | str = DEFAULT_DB) -> None:
    with connect(db_path) as con:
        con.executescript(SCHEMA)
        con.execute(
            "INSERT OR REPLACE INTO schema_meta(key,value) VALUES('schema_version','1')"
        )


def _number(row: pd.Series, *names: str, default: float = math.nan) -> float:
    for name in names:
        if name in row.index:
            try:
                value = float(row[name])
                if math.isfinite(value):
                    return value
            except (TypeError, ValueError):
                pass
    return default


def _text(row: pd.Series, *names: str, default: str = "") -> str:
    for name in names:
        if name in row.index and pd.notna(row[name]):
            value = str(row[name]).strip()
            if value:
                return value
    return default


def _probability(projection: float, line: float, mae: float, side: str) -> float:
    sigma = max(float(mae) * 1.253314, 0.35)
    z = (line - projection) / sigma
    under = 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))
    return max(0.001, min(0.999, under if side == "UNDER" else 1.0 - under))


def _history_correction(
    con: sqlite3.Connection, player_key: str, market: str, cfg: dict[str, Any]
) -> float:
    ch = cfg["challenger"]
    rows = con.execute(
        """
        SELECT (s.actual - p.projection_base) AS residual, p.model_mae
        FROM picks p JOIN pick_settlements s ON s.pick_id=p.pick_id
        WHERE p.branch='CHALLENGER' AND p.player_key=? AND p.market=?
        ORDER BY p.event_date DESC LIMIT ?
        """,
        (player_key, market, int(ch["player_market_window"])),
    ).fetchall()
    if len(rows) < int(ch["min_player_market_history"]):
        return 0.0
    residual = sum(float(r["residual"]) for r in rows) / len(rows)
    mae = sum(float(r["model_mae"]) for r in rows) / len(rows)
    weight = len(rows) / (len(rows) + float(ch["shrinkage"]))
    cap = max(0.0, float(ch["max_abs_correction_mae"]) * mae)
    return max(-cap, min(cap, residual * weight))


def _normalize_predictions(path: Path) -> pd.DataFrame:
    source = pd.read_csv(path)
    rows: list[dict[str, Any]] = []
    for _, row in source.iterrows():
        if "candidate_basic" in row.index and str(row["candidate_basic"]).lower() in {"false", "0", "no"}:
            continue
        player_name = _text(row, "player_name", "odds_player_name")
        market = _text(row, "market", "prop_type").upper()
        side = _text(row, "side").upper()
        line = _number(row, "line")
        odds = _number(row, "odds", "price")
        projection = _number(row, "projection", "proj")
        mae = _number(row, "model_mae", default=1.0)
        if not player_name or side not in {"OVER", "UNDER"}:
            continue
        if not all(math.isfinite(x) for x in (line, odds, projection, mae)) or mae <= 0:
            continue
        player_id = _text(row, "player_id") or None
        rows.append({
            "player_key": normalize_name(player_name), "player_id": player_id,
            "player_name": player_name, "matchup": _text(row, "matchup"),
            "market": market, "side": side, "line": line, "odds": odds,
            "projection_base": projection, "model_mae": mae,
            "model_key": _text(row, "model_key") or None,
        })
    return pd.DataFrame(rows)


def _resolve_event_date(predictions: Path, explicit: str | None) -> str:
    if explicit:
        return datetime.strptime(explicit, "%Y-%m-%d").strftime("%Y-%m-%d")
    header = pd.read_csv(predictions, nrows=0)
    if "event_date" not in header.columns:
        raise ValueError(
            "El CSV no contiene event_date. Indicá --event-date o regenerá las predicciones con v1.1."
        )
    dates = (
        pd.to_datetime(pd.read_csv(predictions, usecols=["event_date"])["event_date"], errors="coerce")
        .dropna().dt.strftime("%Y-%m-%d").unique().tolist()
    )
    if len(dates) != 1:
        raise ValueError(f"Se esperaba una única event_date y se encontraron: {dates}")
    return dates[0]


def _branch_candidates(
    con: sqlite3.Connection, raw: pd.DataFrame, branch: str, cfg: dict[str, Any]
) -> pd.DataFrame:
    active = set(cfg["active_rules"])
    out = raw.copy()
    corrections = []
    for row in out.itertuples():
        correction = 0.0
        if branch == "CHALLENGER" and cfg["challenger"].get("enabled", True):
            correction = _history_correction(con, row.player_key, row.market, cfg)
        corrections.append(correction)
    out["correction"] = corrections
    out["projection_final"] = out["projection_base"] + out["correction"]
    out["probability"] = out.apply(
        lambda r: _probability(r.projection_final, r.line, r.model_mae, r.side), axis=1
    )
    out["break_even"] = 1.0 / out["odds"]
    out["expected_value"] = out["probability"] * out["odds"] - 1.0
    out["eligible"] = (
        (out["market"] + "|" + out["side"]).isin(active)
        & out["odds"].between(float(cfg["odds"]["min"]), float(cfg["odds"]["max"]))
        & (out["probability"] >= float(cfg["selection"]["min_probability"]))
        & (out["expected_value"] >= float(cfg["selection"]["min_ev"]))
    )
    out["selected"] = False
    eligible = out[out["eligible"]].sort_values(
        ["expected_value", "probability", "odds"], ascending=False
    )
    chosen = eligible.drop_duplicates(["player_key", "market", "side"], keep="first")
    out.loc[chosen.index, "selected"] = True
    out["reason"] = "ALTERNATE_LINE"
    out.loc[~out["eligible"], "reason"] = "FILTERED"
    out.loc[out["selected"], "reason"] = "SELECTED"
    return out


def _insert_candidates_and_picks(
    con: sqlite3.Connection, run_id: str, event_date: str, branch: str, frame: pd.DataFrame
) -> list[dict[str, Any]]:
    picks: list[dict[str, Any]] = []
    for idx, row in frame.iterrows():
        cid = stable_id("cand", run_id, branch, row.player_key, row.market, row.side, row.line, idx)
        values = (
            cid, run_id, branch, row.player_key, row.player_id, row.player_name, row.matchup,
            row.market, row.side, row.line, row.odds, row.projection_base, row.correction,
            row.projection_final, row.model_mae, row.probability, row.break_even,
            row.expected_value, int(row.selected), row.reason,
        )
        con.execute("INSERT INTO line_candidates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values)
        if not row.selected:
            continue
        pick_id = stable_id("pick", run_id, branch, row.player_key, row.market, row.side)
        pick = dict(row)
        pick.update(pick_id=pick_id, run_id=run_id, branch=branch, event_date=event_date)
        con.execute(
            """INSERT INTO picks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (pick_id, run_id, branch, event_date, row.player_key, row.player_id,
             row.player_name, row.matchup, row.market, row.side, row.line, row.odds,
             row.projection_base, row.correction, row.projection_final, row.model_mae,
             row.probability, row.break_even, row.expected_value, row.model_key),
        )
        picks.append(pick)
    return picks


def _build_tickets(
    con: sqlite3.Connection, run_id: str, event_date: str, branch: str,
    picks: list[dict[str, Any]], cfg: dict[str, Any]
) -> int:
    used: dict[str, set[str]] = {}
    made = 0
    for spec in cfg["portfolios"]:
        name, legs = spec["name"], int(spec["legs"])
        pool = [p for p in picks if p["probability"] >= spec["min_probability"] and p["expected_value"] >= spec["min_ev"]]
        pool.sort(key=lambda p: (p["expected_value"], p["probability"]), reverse=True)
        used.setdefault(name, set())
        for number in range(1, int(spec["tickets"]) + 1):
            selected = []
            players = set()
            for pick in pool:
                if pick["pick_id"] in used[name] or pick["player_key"] in players:
                    continue
                selected.append(pick); players.add(pick["player_key"])
                if len(selected) == legs:
                    break
            if len(selected) != legs:
                break
            used[name].update(p["pick_id"] for p in selected)
            odds = math.prod(float(p["odds"]) for p in selected)
            joint = math.prod(float(p["probability"]) for p in selected)
            ev = joint * odds - 1.0
            tid = stable_id("ticket", run_id, branch, name, number)
            con.execute(
                "INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (tid, run_id, branch, event_date, name, number, legs, float(cfg["stake"]),
                 odds, joint, ev, "REAL" if legs == 1 else "SIMULATED_PRODUCT"),
            )
            for leg_no, pick in enumerate(selected, 1):
                con.execute("INSERT INTO ticket_legs VALUES (?,?,?)", (tid, pick["pick_id"], leg_no))
            made += 1
    return made


def prepare(
    predictions: Path | str, event_date: str | None = None, db_path: Path | str = DEFAULT_DB,
    config_path: Path | str = DEFAULT_CONFIG, run_id: str | None = None,
    captured_at: str | None = None,
) -> dict[str, Any]:
    predictions, config_path = Path(predictions), Path(config_path)
    event_date = _resolve_event_date(predictions, event_date)
    init_db(db_path)
    cfg = load_config(config_path)
    input_hash, config_hash = sha256_file(predictions), sha256_file(config_path)
    run_id = run_id or stable_id("run", event_date, input_hash, captured_at or utcnow())
    raw = _normalize_predictions(predictions)
    if raw.empty:
        raise ValueError("No hay predicciones válidas para capturar")
    with connect(db_path) as con:
        existing = con.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
        if existing:
            if existing["input_sha256"] != input_hash or existing["config_sha256"] != config_hash or existing["event_date"] != event_date:
                raise ValueError("El run_id ya existe con otro contenido; los runs son inmutables")
            return {"run_id": run_id, "already_exists": True,
                    "picks": con.execute("SELECT count(*) FROM picks WHERE run_id=?", (run_id,)).fetchone()[0],
                    "tickets": con.execute("SELECT count(*) FROM tickets WHERE run_id=?", (run_id,)).fetchone()[0]}
        now = utcnow()
        con.execute(
            "INSERT INTO runs VALUES (?,?,?,?,?,?,?)",
            (run_id, event_date, captured_at or now, input_hash, config_hash, str(predictions.resolve()), now),
        )
        pick_count = ticket_count = 0
        for branch in ("BASELINE", "CHALLENGER"):
            frame = _branch_candidates(con, raw, branch, cfg)
            picks = _insert_candidates_and_picks(con, run_id, event_date, branch, frame)
            pick_count += len(picks)
            ticket_count += _build_tickets(con, run_id, event_date, branch, picks, cfg)
    return {"run_id": run_id, "already_exists": False, "picks": pick_count, "tickets": ticket_count}


MARKET_COLUMNS = {
    "PTS": "pts", "REB": "reb", "AST": "ast", "FGM": "fgm", "FGA": "fga",
    "FG3M": "fg3m", "3PT": "fg3m", "FG3A": "fg3a", "FTM": "ftm", "FTA": "fta",
    "STL": "stl", "BLK": "blk", "TOV": "tov", "PF": "pf",
}


def _actual(row: pd.Series, market: str) -> float:
    market = market.upper()
    if market in MARKET_COLUMNS:
        return _number(row, MARKET_COLUMNS[market])
    parts = {"PR": ("pts", "reb"), "PA": ("pts", "ast"), "RA": ("reb", "ast"),
             "PRA": ("pts", "reb", "ast"), "STL+BLK": ("stl", "blk")}
    if market in parts:
        vals = [_number(row, col) for col in parts[market]]
        return sum(vals) if all(math.isfinite(x) for x in vals) else math.nan
    return _number(row, market.lower())


def _result_maps(df: pd.DataFrame) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], float]]:
    by_id: dict[tuple[str, str], float] = {}
    by_name: dict[tuple[str, str], float] = {}
    long = {"market", "actual"}.issubset(df.columns)
    for _, row in df.iterrows():
        markets: Iterable[str] = [str(row["market"]).upper()] if long else list(MARKET_COLUMNS) + ["PR", "PA", "RA", "PRA", "STL+BLK"]
        for market in markets:
            value = _number(row, "actual") if long else _actual(row, market)
            if not math.isfinite(value):
                continue
            pid, pname = _text(row, "player_id"), _text(row, "player_name", "odds_player_name")
            if pid: by_id[(pid, market)] = value
            if pname: by_name[(normalize_name(pname), market)] = value
    return by_id, by_name


def _load_results_csv(path: Path) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], float]]:
    return _result_maps(pd.read_csv(path))


def _load_results_db(event_date: str) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], float]]:
    from sqlalchemy import text
    from .common import get_engine, load_config as load_lab_config

    view = str(load_lab_config()["source_view"])
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*", view):
        raise ValueError(f"Vista no permitida: {view}")
    query = text(f"""
        SELECT player_id::bigint AS player_id, player_name, game_date,
               pts::double precision AS pts, reb::double precision AS reb,
               ast::double precision AS ast, fgm::double precision AS fgm,
               fga::double precision AS fga, fg3m::double precision AS fg3m,
               fg3a::double precision AS fg3a, ftm::double precision AS ftm,
               fta::double precision AS fta, stl::double precision AS stl,
               blk::double precision AS blk, tov::double precision AS tov,
               pf::double precision AS pf
        FROM {view}
        WHERE game_date = :event_date
        ORDER BY player_id
    """)
    frame = pd.read_sql(query, get_engine(), params={"event_date": event_date})
    if frame.empty:
        raise ValueError(f"La vista {view} no devolvió resultados para {event_date}")
    return _result_maps(frame)


def _result(actual: float, line: float, side: str) -> str:
    if actual == line: return "PUSH"
    won = actual > line if side == "OVER" else actual < line
    return "WIN" if won else "LOSS"


def settle(
    results: Path | str | None, event_date: str, db_path: Path | str = DEFAULT_DB,
    source: str | None = None, from_db: bool = False,
) -> dict[str, int]:
    if from_db:
        by_id, by_name = _load_results_db(event_date)
        source_label = source or "SUPABASE_READ_ONLY"
    else:
        if results is None:
            raise ValueError("Indicá results o activá from_db")
        by_id, by_name = _load_results_csv(Path(results))
        source_label = source or str(Path(results).resolve())
    now, picks_done, tickets_done = utcnow(), 0, 0
    with connect(db_path) as con:
        picks = con.execute("SELECT * FROM picks WHERE event_date=?", (event_date,)).fetchall()
        if not picks: raise ValueError(f"No hay picks capturados para {event_date}")
        for pick in picks:
            actual = by_id.get((pick["player_id"], pick["market"])) if pick["player_id"] else None
            if actual is None: actual = by_name.get((pick["player_key"], pick["market"]))
            if actual is None: continue
            result = _result(actual, pick["line"], pick["side"])
            old = con.execute("SELECT * FROM pick_settlements WHERE pick_id=?", (pick["pick_id"],)).fetchone()
            if old:
                if float(old["actual"]) != float(actual) or old["result"] != result:
                    raise ValueError(f"Liquidación contradictoria para {pick['pick_id']}")
                continue
            con.execute("INSERT INTO pick_settlements VALUES (?,?,?,?,?)",
                        (pick["pick_id"], actual, result, source_label, now))
            picks_done += 1
        tickets = con.execute("SELECT * FROM tickets WHERE event_date=?", (event_date,)).fetchall()
        for ticket in tickets:
            legs = con.execute(
                """SELECT p.odds, s.result FROM ticket_legs l JOIN picks p ON p.pick_id=l.pick_id
                   LEFT JOIN pick_settlements s ON s.pick_id=p.pick_id WHERE l.ticket_id=? ORDER BY l.leg_number""",
                (ticket["ticket_id"],),
            ).fetchall()
            if not legs or any(r["result"] is None for r in legs): continue
            results_list = [r["result"] for r in legs]
            if "LOSS" in results_list:
                tr, effective, profit = "LOSS", 0.0, -float(ticket["stake"])
            else:
                effective = math.prod(float(r["odds"]) for r in legs if r["result"] == "WIN")
                if all(r in {"PUSH", "VOID"} for r in results_list): tr, profit = "PUSH", 0.0
                else: tr, profit = "WIN", float(ticket["stake"]) * (effective - 1.0)
            old = con.execute("SELECT * FROM ticket_settlements WHERE ticket_id=?", (ticket["ticket_id"],)).fetchone()
            if old:
                if old["result"] != tr or abs(float(old["profit"]) - profit) > 1e-8:
                    raise ValueError(f"Liquidación de ticket contradictoria: {ticket['ticket_id']}")
                continue
            con.execute("INSERT INTO ticket_settlements VALUES (?,?,?,?,?)",
                        (ticket["ticket_id"], tr, effective, profit, now))
            con.execute("INSERT INTO bankroll_events VALUES (?,?,?,?,?,?,?)",
                        (stable_id("bank", ticket["ticket_id"]), ticket["ticket_id"], ticket["branch"],
                         ticket["portfolio"], event_date, profit, now))
            tickets_done += 1
    return {"picks_settled": picks_done, "tickets_settled": tickets_done}


def export_daily(
    event_date: str, db_path: Path | str = DEFAULT_DB,
    output_dir: Path | str = DEFAULT_REPORTS,
) -> dict[str, str]:
    root = Path(output_dir).expanduser().resolve() / event_date
    root.mkdir(parents=True, exist_ok=True)
    with connect(db_path) as con:
        picks = pd.read_sql_query(
            """SELECT p.event_date,p.branch,p.player_name,p.matchup,p.market,p.side,p.line,
                      p.odds,p.projection_base,p.correction,p.projection_final,p.model_mae,
                      p.probability,p.expected_value,s.actual,s.result,s.settled_at
               FROM picks p LEFT JOIN pick_settlements s ON s.pick_id=p.pick_id
               WHERE p.event_date=? ORDER BY p.branch,p.expected_value DESC""",
            con, params=(event_date,),
        )
        tickets = pd.read_sql_query(
            """SELECT t.event_date,t.branch,t.portfolio,t.ticket_number,t.legs,t.stake,
                      t.total_odds,t.joint_probability,t.expected_value,t.odds_kind,
                      s.result,s.effective_odds,s.profit,s.settled_at,t.ticket_id
               FROM tickets t LEFT JOIN ticket_settlements s ON s.ticket_id=t.ticket_id
               WHERE t.event_date=? ORDER BY t.branch,t.portfolio,t.ticket_number""",
            con, params=(event_date,),
        )
        legs = pd.read_sql_query(
            """SELECT t.event_date,t.branch,t.portfolio,t.ticket_number,l.leg_number,
                      p.player_name,p.matchup,p.market,p.side,p.line,p.odds,
                      p.projection_final,p.probability,p.expected_value,
                      s.actual,s.result,t.ticket_id
               FROM tickets t JOIN ticket_legs l ON l.ticket_id=t.ticket_id
               JOIN picks p ON p.pick_id=l.pick_id
               LEFT JOIN pick_settlements s ON s.pick_id=p.pick_id
               WHERE t.event_date=?
               ORDER BY t.branch,t.portfolio,t.ticket_number,l.leg_number""",
            con, params=(event_date,),
        )
    paths = {
        "picks": root / "picks.csv", "tickets": root / "tickets.csv",
        "legs": root / "ticket_legs.csv",
    }
    picks.to_csv(paths["picks"], index=False)
    tickets.to_csv(paths["tickets"], index=False)
    legs.to_csv(paths["legs"], index=False)
    summary = root / "summary.txt"
    settled = tickets[tickets["result"].notna()] if "result" in tickets else tickets.iloc[0:0]
    lines = [f"LUDO SHADOW LIVE — {event_date}", "",
             f"Picks: {len(picks)} | liquidados: {int(picks['result'].notna().sum()) if 'result' in picks else 0}",
             f"Tickets: {len(tickets)} | liquidados: {len(settled)}"]
    if not settled.empty:
        for (branch, portfolio), group in settled.groupby(["branch", "portfolio"]):
            lines.append(f"{branch} | {portfolio}: {len(group)} tickets | profit={group['profit'].sum():.2f}")
    summary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    paths["summary"] = summary
    return {key: str(value) for key, value in paths.items()}


def _summary_rows(con: sqlite3.Connection, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    rows = con.execute(
        """SELECT t.branch,t.portfolio,t.event_date,t.stake,s.result,s.profit
           FROM tickets t JOIN ticket_settlements s ON s.ticket_id=t.ticket_id
           ORDER BY t.branch,t.portfolio,t.event_date,t.ticket_number"""
    ).fetchall()
    groups: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in rows: groups.setdefault((row["branch"], row["portfolio"]), []).append(row)
    out = []
    for (branch, portfolio), values in sorted(groups.items()):
        profit, peak, max_dd = 0.0, float(cfg["initial_bankroll"]), 0.0
        daily: dict[str, float] = {}
        for row in values:
            profit += float(row["profit"]); daily[row["event_date"]] = daily.get(row["event_date"], 0.0) + float(row["profit"])
            balance = float(cfg["initial_bankroll"]) + profit; peak = max(peak, balance); max_dd = max(max_dd, peak - balance)
        positive = sum(v for v in daily.values() if v > 0)
        best_share = (max(daily.values(), default=0.0) / positive) if positive > 0 else 1.0
        out.append({"branch": branch, "portfolio": portfolio, "tickets": len(values),
                    "wins": sum(r["result"] == "WIN" for r in values),
                    "losses": sum(r["result"] == "LOSS" for r in values),
                    "profit": profit, "roi": profit / sum(float(r["stake"]) for r in values),
                    "balance": float(cfg["initial_bankroll"]) + profit,
                    "max_drawdown": max_dd, "dates": len(daily), "best_day_share": best_share})
    return out


def report(db_path: Path | str = DEFAULT_DB, config_path: Path | str = DEFAULT_CONFIG) -> dict[str, Any]:
    cfg = load_config(config_path)
    with connect(db_path) as con:
        rows = _summary_rows(con, cfg)
        pick_stats = {b: con.execute(
            "SELECT count(*),count(DISTINCT p.event_date) FROM picks p JOIN pick_settlements s ON s.pick_id=p.pick_id WHERE p.branch=?", (b,)
        ).fetchone() for b in ("BASELINE", "CHALLENGER")}
    frame = pd.DataFrame(rows)
    print("\nSHADOW LIVE — CARTERAS LIQUIDADAS")
    if frame.empty: print("Todavía no hay tickets liquidados.")
    else: print(frame.to_string(index=False, formatters={"profit": "{:.2f}".format, "roi": "{:.4f}".format, "balance": "{:.2f}".format, "max_drawdown": "{:.2f}".format, "best_day_share": "{:.3f}".format}))
    promo = cfg["promotion"]
    challenger_picks, challenger_dates = map(int, pick_stats["CHALLENGER"])
    enough = challenger_picks >= promo["min_settled_picks"] and challenger_dates >= promo["min_dates"]
    comparisons = []
    if rows:
        lookup = {(r["branch"], r["portfolio"]): r for r in rows}
        for (_, portfolio), base in [(k, v) for k, v in lookup.items() if k[0] == "BASELINE"]:
            chall = lookup.get(("CHALLENGER", portfolio))
            if not chall: continue
            passes = enough and chall["roi"] > base["roi"] and chall["max_drawdown"] <= base["max_drawdown"] and chall["best_day_share"] <= promo["max_best_day_profit_share"]
            comparisons.append({"portfolio": portfolio, "promotion_ready": passes})
    print(f"\nGate challenger: {challenger_picks}/{promo['min_settled_picks']} picks; {challenger_dates}/{promo['min_dates']} fechas.")
    print("Estado: " + ("EVALUABLE" if enough else "ACUMULANDO MUESTRA; baseline sigue congelado"))
    return {"summary": rows, "challenger_picks": challenger_picks, "challenger_dates": challenger_dates, "enough_sample": enough, "comparisons": comparisons}


def pending(db_path: Path | str = DEFAULT_DB) -> pd.DataFrame:
    with connect(db_path) as con:
        return pd.read_sql_query(
            """SELECT p.event_date,p.branch,p.player_name,p.matchup,p.market,p.side,p.line,p.odds,
                      p.projection_final,p.probability,p.expected_value
               FROM picks p LEFT JOIN pick_settlements s ON s.pick_id=p.pick_id
               WHERE s.pick_id IS NULL ORDER BY p.event_date,p.branch,p.expected_value DESC""", con)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    p = sub.add_parser("prepare"); p.add_argument("--predictions", required=True); p.add_argument("--event-date"); p.add_argument("--run-id"); p.add_argument("--captured-at")
    s = sub.add_parser("settle"); group = s.add_mutually_exclusive_group(required=True); group.add_argument("--results"); group.add_argument("--from-db", action="store_true"); s.add_argument("--event-date", required=True); s.add_argument("--output-dir", default=str(DEFAULT_REPORTS))
    sub.add_parser("report")
    sub.add_parser("pending")
    d = sub.add_parser("daily-report"); d.add_argument("--event-date", required=True); d.add_argument("--output-dir", default=str(DEFAULT_REPORTS))
    args = parser.parse_args()
    if args.command == "init": init_db(args.db); print(f"Ledger listo: {Path(args.db).resolve()}")
    elif args.command == "prepare":
        result = prepare(args.predictions, args.event_date, args.db, args.config, args.run_id, args.captured_at)
        print(json.dumps(result, ensure_ascii=False, indent=2)); print("Picks congelados. Una repetición idéntica no los modifica.")
    elif args.command == "settle":
        result = settle(args.results, args.event_date, args.db, from_db=args.from_db)
        result["reports"] = export_daily(args.event_date, args.db, args.output_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "report": report(args.db, args.config)
    elif args.command == "pending":
        frame = pending(args.db); print(frame.to_string(index=False) if not frame.empty else "No hay picks pendientes.")
    elif args.command == "daily-report": print(json.dumps(export_daily(args.event_date, args.db, args.output_dir), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
