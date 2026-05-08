#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_picks_betano_hitos_ludo.py

Cruza cuotas de hitos Betano con predicciones Ludo y calcula EV.
Asume SQLite. Es flexible con nombres de columnas de predicciones.

Tabla de cuotas esperada:
  odds_betano_hitos

Tabla de predicciones esperada, ideal:
  ludo_predictions(player_norm, stat_key, pred_mean, pred_std, game_norm opcional)

También puede leer directamente el CSV que genera Ludo:
  ludo_predictions.csv

Detecta automáticamente columnas típicas de tu generador:
  player_name, prop_type, proj, model_mae, matchup

Uso:
  python3 generar_picks_betano_hitos_ludo.py --dry-run --top 20
  python3 generar_picks_betano_hitos_ludo.py --db ludo.db --pred-table predicciones_ludo --dry-run --top 20
  python3 generar_picks_betano_hitos_ludo.py --save-db --top 20
"""

from __future__ import annotations

import argparse
import csv
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from betano_hitos_utils import (
    DEFAULT_STD_BY_STAT,
    ev_decimal,
    implied_probability,
    normalize_text,
    prob_over_normal,
    write_csv_dicts,
)

ODDS_TABLE = "odds_betano_hitos"
PICKS_TABLE = "picks_betano_hitos"

PLAYER_COLS = ["player_norm", "jugador_norm", "player_name_norm", "player", "jugador", "player_name", "nombre_jugador"]
STAT_COLS = ["stat_key", "stat", "target", "mercado", "categoria", "prop_type"]
MEAN_COLS = ["pred_mean", "projection", "proj", "mean", "media", "y_pred", "pred", "prediccion", "valor_predicho", "ludo_pred"]
STD_COLS = ["pred_std", "std", "sigma", "desvio", "error_std", "model_mae", "mae"]
GAME_COLS = ["game_norm", "partido_norm", "game_key", "partido", "matchup"]
TEAM_COLS = ["team_abbreviation", "team", "team_abbr", "player_team", "pred_team"]
ID_COLS = ["player_id", "nba_player_id", "id_jugador"]

STAT_ALIASES = {
    "points": "PTS", "puntos": "PTS", "pts": "PTS", "PTS": "PTS",
    "rebounds": "REB", "rebotes": "REB", "reb": "REB", "REB": "REB",
    "assists": "AST", "asistencias": "AST", "ast": "AST", "AST": "AST",
    "threes": "3PM", "triples": "3PM", "3pm": "3PM", "3PM": "3PM", "3pt": "3PM", "3PT": "3PM", "fg3m": "3PM",
    "steals": "STL", "robos": "STL", "stl": "STL", "STL": "STL",
    "blocks": "BLK", "tapones": "BLK", "blk": "BLK", "BLK": "BLK",
    "pra": "PRA", "PRA": "PRA",
    "ra": "RA", "RA": "RA",
    "pr": "PR", "PR": "PR",
    "pa": "PA", "PA": "PA",
}


TEAM_ALIASES = {
    "ATL": ["atlanta", "hawks"],
    "BOS": ["boston", "celtics"],
    "BKN": ["brooklyn", "nets"],
    "CHA": ["charlotte", "hornets"],
    "CHI": ["chicago", "bulls"],
    "CLE": ["cleveland", "cavaliers"],
    "DAL": ["dallas", "mavericks"],
    "DEN": ["denver", "nuggets"],
    "DET": ["detroit", "pistons"],
    "GSW": ["golden state", "warriors"],
    "HOU": ["houston", "rockets"],
    "IND": ["indiana", "pacers"],
    "LAC": ["clippers", "los angeles clippers"],
    "LAL": ["lakers", "los angeles lakers"],
    "MEM": ["memphis", "grizzlies"],
    "MIA": ["miami", "heat"],
    "MIL": ["milwaukee", "bucks"],
    "MIN": ["minnesota", "timberwolves"],
    "NOP": ["new orleans", "pelicans"],
    "NYK": ["new york", "knicks"],
    "OKC": ["oklahoma city", "thunder"],
    "ORL": ["orlando", "magic"],
    "PHI": ["philadelphia", "76ers", "76ers"],
    "PHX": ["phoenix", "suns"],
    "POR": ["portland", "trail blazers", "trail-blazers"],
    "SAC": ["sacramento", "kings"],
    "SAS": ["san antonio", "spurs"],
    "TOR": ["toronto", "raptors"],
    "UTA": ["utah", "jazz"],
    "WAS": ["washington", "wizards"],
}


def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def table_exists(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return row is not None


def columns(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]


def qident(name: str) -> str:
    """Quote simple para nombres de columnas SQLite."""
    return '"' + str(name).replace('"', '""') + '"'


def pick_col(cols: list[str], candidates: list[str], required: bool = True) -> str | None:
    low = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand.lower() in low:
            return low[cand.lower()]
    if required:
        raise ValueError(f"No encontré ninguna columna entre {candidates}. Columnas disponibles: {cols}")
    return None


def norm_stat(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in STAT_ALIASES:
        return STAT_ALIASES[raw]
    n = normalize_text(raw)
    return STAT_ALIASES.get(n, raw.upper())


def to_float(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None or v == "":
            return default
        return float(str(v).replace(",", "."))
    except Exception:
        return default


def row_value(row: Any, col: str | None, default: Any = None) -> Any:
    if not col:
        return default
    try:
        return row[col]
    except Exception:
        if hasattr(row, "get"):
            return row.get(col, default)
        return default


def game_tokens(game_norm: str) -> set[str]:
    return {t for t in str(game_norm or "").split() if t}


def games_match(a: str, b: str) -> bool:
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    return game_tokens(a_norm) == game_tokens(b_norm)


def team_in_game(team: str, game_text: str) -> bool:
    """True si el equipo del jugador aparece en el texto del partido.

    Esto evita falsos positivos donde el jugador/stat matchea, pero el jugador
    queda asociado a un partido que no corresponde a su equipo.
    """
    team = str(team or "").upper().strip()
    if not team:
        return False
    game_norm = normalize_text(game_text)
    if not game_norm:
        return False
    aliases = TEAM_ALIASES.get(team, [team])
    return any(normalize_text(alias) in game_norm for alias in aliases)


def _build_predictions_from_iter(rows_iter, cols: list[str], args, source_name: str) -> dict[tuple[str, str], list[dict]]:
    player_col = args.player_col or pick_col(cols, PLAYER_COLS)
    stat_col = args.stat_col or pick_col(cols, STAT_COLS)
    mean_col = args.mean_col or pick_col(cols, MEAN_COLS)
    std_col = args.std_col or pick_col(cols, STD_COLS, required=False)
    game_col = args.game_col or pick_col(cols, GAME_COLS, required=False)
    team_col = args.team_col or pick_col(cols, TEAM_COLS, required=False)
    id_col = args.player_id_col or pick_col(cols, ID_COLS, required=False)

    preds: dict[tuple[str, str], list[dict]] = {}
    rows_count = 0
    for r in rows_iter:
        rows_count += 1
        player_raw = row_value(r, player_col, "")
        stat_raw = row_value(r, stat_col, "")
        mean_raw = row_value(r, mean_col, None)
        std_raw = row_value(r, std_col, None) if std_col else None
        game_raw = row_value(r, game_col, "") if game_col else ""
        team_raw = row_value(r, team_col, "") if team_col else ""
        player_id_raw = row_value(r, id_col, "") if id_col else ""

        player_norm = normalize_text(player_raw)
        stat_key = norm_stat(stat_raw)
        mean = to_float(mean_raw)
        if not player_norm or not stat_key or mean is None:
            continue

        std = to_float(std_raw) if std_col else None
        game_norm = normalize_text(game_raw) if game_col else ""
        key = (player_norm, stat_key)
        item = {
            "player_norm": player_norm,
            "player_name": str(player_raw or ""),
            "player_id": str(player_id_raw or ""),
            "team": str(team_raw or "").upper(),
            "stat_key": stat_key,
            "pred_mean": mean,
            "pred_std": std,
            "game_raw": str(game_raw or ""),
            "game_norm": game_norm,
        }

        bucket = preds.setdefault(key, [])
        # Evitamos duplicados exactos: Ludo trae varias líneas para el mismo jugador/stat/partido.
        if not any(x["game_norm"] == game_norm and abs(float(x["pred_mean"]) - mean) < 1e-9 for x in bucket):
            bucket.append(item)

    total_preds = sum(len(v) for v in preds.values())
    print(f"Predicciones cargadas: {total_preds} registros únicos | {len(preds)} claves jugador/stat desde {source_name} | filas leídas: {rows_count}")
    print(f"Columnas usadas: player={player_col}, stat={stat_col}, mean={mean_col}, std={std_col or 'DEFAULT'}, game={game_col or 'NO'}, team={team_col or 'NO'}, player_id={id_col or 'NO'}")
    return preds

def load_predictions_from_table(con: sqlite3.Connection, table: str, args) -> dict[tuple[str, str], dict]:
    cols = columns(con, table)
    player_col = args.player_col or pick_col(cols, PLAYER_COLS)
    stat_col = args.stat_col or pick_col(cols, STAT_COLS)
    mean_col = args.mean_col or pick_col(cols, MEAN_COLS)
    std_col = args.std_col or pick_col(cols, STD_COLS, required=False)
    game_col = args.game_col or pick_col(cols, GAME_COLS, required=False)

    select_cols = [player_col, stat_col, mean_col]
    if std_col:
        select_cols.append(std_col)
    if game_col:
        select_cols.append(game_col)

    sql = "SELECT " + ", ".join(qident(c) for c in select_cols) + f" FROM {qident(table)}"
    rows = con.execute(sql).fetchall()
    return _build_predictions_from_iter(rows, cols, args, table)


def load_predictions_from_csv(csv_path: str, args) -> dict[tuple[str, str], dict]:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"No existe CSV de predicciones: {csv_path}")
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        rows = list(reader)
    return _build_predictions_from_iter(rows, cols, args, str(path))

def latest_snapshot(con: sqlite3.Connection, odds_table: str) -> str:
    row = con.execute(f"SELECT snapshot_id FROM {odds_table} GROUP BY snapshot_id ORDER BY MAX(scraped_at_utc) DESC, snapshot_id DESC LIMIT 1").fetchone()
    if not row:
        raise ValueError(f"No hay snapshots en {odds_table}")
    return row["snapshot_id"]


def load_odds(con: sqlite3.Connection, odds_table: str, snapshot_id: str) -> list[sqlite3.Row]:
    return con.execute(f"""
        SELECT * FROM {odds_table}
        WHERE snapshot_id = ? AND valid = 1
    """, (snapshot_id,)).fetchall()


def find_prediction(
    odd: sqlite3.Row,
    preds: dict[tuple[str, str], list[dict]],
    require_game_match: bool = False,
    require_team_in_game: bool = False,
) -> dict | None:
    key = (odd["player_norm"], odd["stat_key"])
    candidates = preds.get(key) or []
    if not candidates:
        return None

    odd_game_raw = odd["partido"]
    odd_game = odd["game_norm"] if "game_norm" in odd.keys() else normalize_text(odd_game_raw)

    def decorate(pred: dict, game_ok: bool) -> dict:
        out = dict(pred)
        out["game_match"] = bool(game_ok)
        out["team_game_match"] = bool(team_in_game(out.get("team", ""), odd_game_raw) or team_in_game(out.get("team", ""), odd_game))
        return out

    # 1) Primero probamos mismo jugador/stat + mismo partido.
    exact_game: list[dict] = []
    for pred in candidates:
        game_ok = games_match(odd_game, pred.get("game_norm", ""))
        if game_ok:
            exact_game.append(decorate(pred, True))

    if exact_game:
        if require_team_in_game:
            exact_game = [p for p in exact_game if p.get("team_game_match")]
            if not exact_game:
                return None
        return exact_game[0]

    # 2) Si el usuario exige partido exacto, no hacemos fallback.
    if require_game_match:
        return None

    # 3) Fallback: mismo jugador/stat aunque el partido no coincida.
    fallback = [decorate(pred, False) for pred in candidates]
    if require_team_in_game:
        fallback = [p for p in fallback if p.get("team_game_match")]
        if not fallback:
            return None
    return fallback[0]

def make_pick(odd: sqlite3.Row, pred: dict, min_prob: float, min_odds: float, max_odds: float) -> dict | None:
    odds_decimal = float(odd["odds_decimal"])
    if odds_decimal < min_odds or odds_decimal > max_odds:
        return None

    stat_key = odd["stat_key"]
    mean = float(pred["pred_mean"])
    std = pred.get("pred_std")
    if std is None or std <= 0:
        std = DEFAULT_STD_BY_STAT.get(stat_key, 3.0)

    model_line = float(odd["model_line"])
    prob = prob_over_normal(mean, std, model_line)
    if prob < min_prob:
        return None

    imp = implied_probability(odds_decimal)
    ev = ev_decimal(prob, odds_decimal)
    edge = prob - imp

    return {
        "created_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "snapshot_id": odd["snapshot_id"],
        "book": odd["book"],
        "partido": odd["partido"],
        "jugador": odd["jugador"],
        "player_norm": odd["player_norm"],
        "game_norm": odd["game_norm"] if "game_norm" in odd.keys() else normalize_text(odd["partido"]),
        "pred_player": pred.get("player_name", ""),
        "player_id": pred.get("player_id", ""),
        "team": pred.get("team", ""),
        "pred_game": pred.get("game_raw", ""),
        "pred_game_norm": pred.get("game_norm", ""),
        "game_match": "1" if pred.get("game_match") else "0",
        "team_game_match": "1" if pred.get("team_game_match") else "0",
        "mercado_raw": odd["mercado_raw"],
        "linea_raw": odd["linea_raw"],
        "stat_key": stat_key,
        "side": odd["side"],
        "threshold": f"{float(odd['threshold']):.6g}",
        "model_line": f"{model_line:.6g}",
        "odds_decimal": f"{odds_decimal:.6g}",
        "pred_mean": f"{mean:.6g}",
        "pred_std": f"{std:.6g}",
        "prob_model": f"{prob:.6f}",
        "prob_implied": f"{imp:.6f}",
        "edge_prob": f"{edge:.6f}",
        "ev": f"{ev:.6f}",
        "ev_pct": f"{ev*100:.2f}",
        "row_uid": odd["row_uid"],
        "pick_uid": f"{odd['row_uid']}|{mean:.4f}|{std:.4f}",
    }


def ensure_picks_table(con: sqlite3.Connection) -> None:
    con.execute(f"""
    CREATE TABLE IF NOT EXISTS {PICKS_TABLE} (
        pick_uid TEXT PRIMARY KEY,
        created_at_utc TEXT,
        snapshot_id TEXT,
        book TEXT,
        partido TEXT,
        game_norm TEXT,
        jugador TEXT,
        player_norm TEXT,
        pred_player TEXT,
        player_id TEXT,
        team TEXT,
        pred_game TEXT,
        pred_game_norm TEXT,
        game_match INTEGER,
        team_game_match INTEGER,
        mercado_raw TEXT,
        linea_raw TEXT,
        stat_key TEXT,
        side TEXT,
        threshold REAL,
        model_line REAL,
        odds_decimal REAL,
        pred_mean REAL,
        pred_std REAL,
        prob_model REAL,
        prob_implied REAL,
        edge_prob REAL,
        ev REAL,
        ev_pct REAL,
        row_uid TEXT
    )
    """)
    existing_cols = {r[1] for r in con.execute(f"PRAGMA table_info({PICKS_TABLE})").fetchall()}
    extra_cols = {
        "game_norm": "TEXT",
        "pred_player": "TEXT",
        "player_id": "TEXT",
        "team": "TEXT",
        "pred_game": "TEXT",
        "pred_game_norm": "TEXT",
        "game_match": "INTEGER DEFAULT 0",
        "team_game_match": "INTEGER DEFAULT 0",
    }
    for col, col_type in extra_cols.items():
        if col not in existing_cols:
            con.execute(f"ALTER TABLE {PICKS_TABLE} ADD COLUMN {col} {col_type}")

    con.execute(f"CREATE INDEX IF NOT EXISTS idx_{PICKS_TABLE}_snapshot ON {PICKS_TABLE}(snapshot_id)")
    con.execute(f"CREATE INDEX IF NOT EXISTS idx_{PICKS_TABLE}_ev ON {PICKS_TABLE}(ev DESC)")
    con.commit()


def save_picks(con: sqlite3.Connection, picks: list[dict]) -> int:
    ensure_picks_table(con)
    inserted = 0
    for p in picks:
        con.execute(f"""
        INSERT OR REPLACE INTO {PICKS_TABLE} (
            pick_uid, created_at_utc, snapshot_id, book, partido, game_norm, jugador, player_norm, pred_player,
            player_id, team, pred_game, pred_game_norm, game_match, team_game_match, mercado_raw, linea_raw,
            stat_key, side, threshold, model_line, odds_decimal, pred_mean, pred_std, prob_model, prob_implied,
            edge_prob, ev, ev_pct, row_uid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            p["pick_uid"], p["created_at_utc"], p["snapshot_id"], p["book"], p["partido"], p.get("game_norm", ""), p["jugador"],
            p["player_norm"], p.get("pred_player", ""), p.get("player_id", ""), p.get("team", ""), p.get("pred_game", ""),
            p.get("pred_game_norm", ""), int(float(p.get("game_match", 0))), int(float(p.get("team_game_match", 0))), p["mercado_raw"], p["linea_raw"], p["stat_key"], p["side"], float(p["threshold"]),
            float(p["model_line"]), float(p["odds_decimal"]), float(p["pred_mean"]), float(p["pred_std"]),
            float(p["prob_model"]), float(p["prob_implied"]), float(p["edge_prob"]), float(p["ev"]),
            float(p["ev_pct"]), p["row_uid"],
        ))
        inserted += 1
    con.commit()
    return inserted


def print_table(picks: list[dict], top: int) -> None:
    print("\nTOP PICKS BETANO HITOS")
    print("-" * 140)
    print(f"{'#':>2} {'EV%':>7} {'Prob':>7} {'Imp':>7} {'Cuota':>6} {'Stat':>4} {'Jugador':<24} {'Hito':<7} {'Pred':>6} {'Std':>5} Partido")
    print("-" * 140)
    for i, p in enumerate(picks[:top], 1):
        print(
            f"{i:>2} {float(p['ev_pct']):>7.2f} {float(p['prob_model'])*100:>6.1f}% "
            f"{float(p['prob_implied'])*100:>6.1f}% {float(p['odds_decimal']):>6.2f} "
            f"{p['stat_key']:>4} {p['jugador'][:24]:<24} {p['linea_raw']:<7} "
            f"{float(p['pred_mean']):>6.2f} {float(p['pred_std']):>5.2f} {p['partido'][:40]}"
        )


def pick_score(p: dict) -> float:
    """Score estable para elegir la mejor línea cuando hay muchos hitos del mismo jugador."""
    ev_pct = to_float(p.get("ev_pct"), 0.0) or 0.0
    prob = to_float(p.get("prob_model"), 0.0) or 0.0
    pred = to_float(p.get("pred_mean"), 0.0) or 0.0
    line = to_float(p.get("model_line"), 0.0) or 0.0
    diff = pred - line
    return (ev_pct * 0.55) + (prob * 100 * 0.30) + (diff * 4.0)


def apply_front_ready_filter(picks: list[dict], args) -> list[dict]:
    """Filtro final para publicar en el front.

    Objetivo:
      - no mostrar todas las líneas de Betano;
      - dejar solo picks finales generados por Ludo;
      - máximo una línea por jugador;
      - máximo N picks.
    """
    before = len(picks)
    filtered: list[dict] = []

    for p in picks:
        ev_pct = to_float(p.get("ev_pct"), 0.0) or 0.0
        prob = to_float(p.get("prob_model"), 0.0) or 0.0
        odds = to_float(p.get("odds_decimal"), 0.0) or 0.0
        pred = to_float(p.get("pred_mean"), 0.0) or 0.0
        line = to_float(p.get("model_line"), 0.0) or 0.0
        diff = pred - line

        if ev_pct < args.front_min_ev_pct:
            continue
        if prob < args.front_min_prob:
            continue
        if odds < args.front_min_odds or odds > args.front_max_odds:
            continue
        if diff < args.front_min_diff:
            continue

        q = dict(p)
        q["_front_score"] = pick_score(q)
        filtered.append(q)

    # Primero, si llegaron varias líneas del mismo jugador/stat/partido, dejamos una sola.
    best_by_player_stat: dict[tuple[str, str, str], dict] = {}
    for p in filtered:
        key = (p.get("partido", ""), p.get("jugador", ""), p.get("stat_key", ""))
        if key not in best_by_player_stat or float(p["_front_score"]) > float(best_by_player_stat[key]["_front_score"]):
            best_by_player_stat[key] = p

    candidate = list(best_by_player_stat.values())

    # Luego, para el front, máximo una recomendación por jugador.
    if args.front_one_per_player:
        best_by_player: dict[str, dict] = {}
        for p in candidate:
            key = p.get("jugador", "")
            if key not in best_by_player or float(p["_front_score"]) > float(best_by_player[key]["_front_score"]):
                best_by_player[key] = p
        candidate = list(best_by_player.values())

    candidate.sort(key=lambda x: float(x.get("ev", 0.0)), reverse=True)
    candidate = candidate[:args.front_max_picks]

    for p in candidate:
        p.pop("_front_score", None)

    print("\nFiltro front-ready aplicado:")
    print(f"  Antes                 : {before}")
    print(f"  Tras filtros calidad  : {len(filtered)}")
    print(f"  Tras 1 jugador/stat   : {len(best_by_player_stat)}")
    print(f"  Final front           : {len(candidate)}")
    return candidate


def main() -> None:
    ap = argparse.ArgumentParser(description="Genera picks EV de hitos Betano usando predicciones Ludo.")
    ap.add_argument("--db", default=os.getenv("LUDO_DB_PATH", "ludo.db"), help="Ruta SQLite. También acepta env LUDO_DB_PATH.")
    ap.add_argument("--odds-table", default=ODDS_TABLE)
    ap.add_argument("--pred-table", default=os.getenv("LUDO_PRED_TABLE", "ludo_predictions"))
    ap.add_argument("--pred-csv", default=os.getenv("LUDO_PRED_CSV", "ludo_predictions.csv"), help="CSV generado por generar_predicciones_ludo.py. Se usa si no existe --pred-table en SQLite.")
    ap.add_argument("--snapshot-id", help="Snapshot específico. Si no se pasa, usa el último.")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--min-ev", type=float, default=0.03, help="EV mínimo decimal. 0.03 = +3%%")
    ap.add_argument("--min-prob", type=float, default=0.0)
    ap.add_argument("--min-odds", type=float, default=1.25)
    ap.add_argument("--max-odds", type=float, default=15.0)
    ap.add_argument("--output-dir", default="picks_generados")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--save-db", action="store_true", help="Guarda picks en tabla picks_betano_hitos.")

    # Overrides de columnas para adaptar a tu tabla real sin tocar código.
    ap.add_argument("--player-col")
    ap.add_argument("--stat-col")
    ap.add_argument("--mean-col")
    ap.add_argument("--std-col")
    ap.add_argument("--game-col")
    ap.add_argument("--team-col")
    ap.add_argument("--player-id-col")
    ap.add_argument("--require-game-match", action="store_true", help="Descarta picks si el partido de Ludo no coincide con el partido de Betano.")
    ap.add_argument("--require-team-in-game", action="store_true", help="Descarta picks si el team_abbreviation del jugador no aparece en el partido de Betano.")

    # Filtro final para publicar en el front: una sola línea por jugador y top N.
    ap.add_argument("--front-ready", action="store_true", help="Aplica filtro final conservador para publicar en el front.")
    ap.add_argument("--front-max-picks", type=int, default=15, help="Máximo de picks finales para el front.")
    ap.add_argument("--front-min-ev-pct", type=float, default=10.0, help="EV%% mínimo final para front-ready.")
    ap.add_argument("--front-min-prob", type=float, default=0.65, help="Probabilidad mínima final para front-ready. 0.65 = 65%%.")
    ap.add_argument("--front-min-odds", type=float, default=1.35, help="Cuota mínima final para front-ready.")
    ap.add_argument("--front-max-odds", type=float, default=3.00, help="Cuota máxima final para front-ready.")
    ap.add_argument("--front-min-diff", type=float, default=0.75, help="Diferencia mínima predicción - línea para front-ready.")
    ap.add_argument("--front-one-per-player", action="store_true", default=True, help="Deja como máximo 1 pick por jugador en front-ready.")
    args = ap.parse_args()

    print("=" * 72)
    print("🧠 GENERAR PICKS BETANO HITOS + LUDO")
    print("=" * 72)
    print(f"DB          : {args.db}")
    print(f"Odds table  : {args.odds_table}")
    print(f"Pred table  : {args.pred_table}")
    print(f"Pred CSV    : {args.pred_csv}")

    con = connect(args.db)
    if not table_exists(con, args.odds_table):
        raise SystemExit(f"No existe tabla de cuotas: {args.odds_table}. Primero corré subir_cuotas_betano_hitos.py")
    pred_source = "table" if table_exists(con, args.pred_table) else "csv"
    if pred_source == "csv" and not Path(args.pred_csv).exists():
        available = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
        raise SystemExit(
            f"No existe tabla de predicciones: {args.pred_table}.\n"
            f"Tablas disponibles en {args.db}: {available}\n"
            f"Tampoco encontré el CSV: {args.pred_csv}\n\n"
            "Soluciones posibles:\n"
            "  1) Ejecutá generar_predicciones_ludo.py --save-db y usá el mismo DB donde guarda.\n"
            "  2) Dejá ludo_predictions.csv en esta carpeta y corré con --pred-csv ludo_predictions.csv.\n"
            "  3) Pasá --pred-table con el nombre real si ya existe en otra tabla."
        )

    snapshot_id = args.snapshot_id or latest_snapshot(con, args.odds_table)
    print(f"Snapshot    : {snapshot_id}")

    if pred_source == "table":
        preds = load_predictions_from_table(con, args.pred_table, args)
    else:
        print("⚠️  No encontré tabla de predicciones en SQLite; uso CSV de Ludo.")
        preds = load_predictions_from_csv(args.pred_csv, args)
    odds = load_odds(con, args.odds_table, snapshot_id)
    print(f"Cuotas cargadas: {len(odds)}")

    picks: list[dict] = []
    unmatched = 0
    for odd in odds:
        pred = find_prediction(odd, preds, args.require_game_match, args.require_team_in_game)
        if not pred:
            unmatched += 1
            continue
        p = make_pick(odd, pred, args.min_prob, args.min_odds, args.max_odds)
        if not p:
            continue
        if float(p["ev"]) >= args.min_ev:
            picks.append(p)

    picks.sort(key=lambda x: float(x["ev"]), reverse=True)

    if args.front_ready:
        picks = apply_front_ready_filter(picks, args)
        # En modo front-ready conviene que --top no oculte picks finales.
        args.top = max(args.top, len(picks))

    game_mismatch = sum(1 for p in picks if str(p.get("game_match", "0")) != "1")
    team_mismatch = sum(1 for p in picks if str(p.get("team_game_match", "0")) != "1")
    print(f"Sin match predicción: {unmatched}")
    print(f"Picks con EV >= {args.min_ev*100:.2f}%: {len(picks)}")
    print(f"Picks sin match exacto de partido: {game_mismatch}")
    print(f"Picks cuyo equipo no aparece en el partido: {team_mismatch}")
    print_table(picks, args.top)

    suffix = "_front_ready" if args.front_ready else ""
    out_path = Path(args.output_dir) / f"picks_betano_hitos_{snapshot_id}{suffix}.csv"
    if picks:
        fields = list(picks[0].keys())
        write_csv_dicts(str(out_path), picks, fields)
        print(f"\n✅ CSV picks → {out_path}")

    if args.save_db and not args.dry_run:
        saved = save_picks(con, picks)
        print(f"✅ Picks guardados en DB: {saved} → tabla {PICKS_TABLE}")
    elif args.dry_run:
        print("\n[dry-run] No se guardó en DB.")

    con.close()


if __name__ == "__main__":
    main()
