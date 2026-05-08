#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
publicar_betano_picks_supabase.py

Publica picks finales de Betano Hitos en Supabase con el MISMO formato que ludo_picks.

IMPORTANTE PARA TU FRONT ACTUAL:
- Tu API lee .limit(1) por fecha, igual que ludo_picks.
- Por eso este script inserta 1 SOLA FILA por pick_date en betano_picks.
- Dentro de json_data van muchos blocks/tickets, un ticket por cada pick Betano.

Requisitos:
- Python estándar solamente.
- Variables de entorno:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY o SUPABASE_SERVICE_ROLE_KEY

Uso:
    python3 publicar_betano_picks_supabase.py --db ludo.db --dry-run --top 20
    python3 publicar_betano_picks_supabase.py --db ludo.db --delete-pending-date --top 20

Uso con fecha manual:
    python3 publicar_betano_picks_supabase.py --db ludo.db --pick-date 2026-05-08 --delete-pending-date --top 20
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Any

PICKS_TABLE_DEFAULT = "picks_betano_hitos"
SUPABASE_TABLE_DEFAULT = "betano_picks"

FAMILY_MAP = {
    "PTS": "MAIN", "REB": "MAIN", "AST": "MAIN", "PRA": "MAIN",
    "PR":  "COMBO", "PA": "COMBO", "RA": "COMBO",
    "3PM": "SPEC",  "STL": "SPEC", "BLK": "SPEC",
}

QUALITY_EMOJI = {
    "JOYA": "💎",
    "EXCELENTE": "⭐",
    "BUENA": "🌟",
    "RADAR": "📊",
}


def get_quality(ev_pct: float) -> str:
    if ev_pct >= 10:
        return "JOYA"
    if ev_pct >= 7:
        return "EXCELENTE"
    if ev_pct >= 4:
        return "BUENA"
    return "RADAR"


def today_argentina_fallback() -> str:
    return datetime.now().date().isoformat()


def connect_sqlite(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def table_exists(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def sqlite_columns(con: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()}


def val(row: sqlite3.Row, key: str, default: Any = None) -> Any:
    try:
        return row[key]
    except Exception:
        return default


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(str(value).replace(",", "."))
    except Exception:
        return default


def clean_player_short(player: str) -> str:
    parts = str(player or "").strip().split()
    if not parts:
        return "Jugador"
    return parts[-1]


def build_analysis(stat_key: str, linea_raw: str, pred_mean: float, diff: float, ev_pct: float) -> str:
    sign = "+" if diff >= 0 else ""
    return (
        f"Hito {linea_raw} {stat_key}. "
        f"Proy {pred_mean:.1f}, diff {sign}{diff:.1f}. "
        f"EV {ev_pct:+.1f}%."
    )


def build_ticket(row: sqlite3.Row) -> dict[str, Any]:
    player = str(val(row, "jugador", "")).strip()
    stat_key = str(val(row, "stat_key", "")).strip().upper()
    linea_raw = str(val(row, "linea_raw", "")).strip()

    odds = as_float(val(row, "odds_decimal"))
    model_line = as_float(val(row, "model_line"))
    threshold = as_float(val(row, "threshold"))
    pred_mean = as_float(val(row, "pred_mean"))
    prob_model = as_float(val(row, "prob_model"))
    ev_pct = as_float(val(row, "ev_pct"))
    edge_score = as_float(val(row, "edge_prob"))
    diff = pred_mean - model_line

    quality = get_quality(ev_pct)
    emoji = QUALITY_EMOJI.get(quality, "📊")
    family = FAMILY_MAP.get(stat_key, "MAIN")

    player_id_raw = val(row, "player_id", None)
    try:
        player_id = int(player_id_raw) if player_id_raw not in (None, "", "None") else 0
    except Exception:
        player_id = 0

    team = val(row, "team", "") or val(row, "player_team", "") or ""
    hit_rate = val(row, "hit_rate", "N/D") or "N/D"
    is_vip = bool(val(row, "is_vip", False))

    ticket_name = f"{emoji} {clean_player_short(player)} — {linea_raw} {stat_key}"

    play = {
        "player_id": player_id,
        "player": player,
        "team": team,
        "prop": stat_key,
        "type": "OVER",
        "line": model_line,
        "linea_raw": linea_raw,
        "threshold": threshold,
        "odds": odds,
        "proj": round(pred_mean, 2),
        "diff": round(diff, 2),
        "edge_score": round(edge_score, 6),
        "edge_pct": round(ev_pct, 2),
        "prob_model": round(prob_model, 6),
        "quality": quality,
        "hit_rate": hit_rate,
        "analysis": build_analysis(stat_key, linea_raw, pred_mean, diff, ev_pct),
        "is_vip": is_vip,
        "book": "betano",
        "market_type": "hitos",
        "snapshot_id": val(row, "snapshot_id", None),
        "pick_uid": val(row, "pick_uid", None),
    }

    return {
        "name": ticket_name,
        "side": "OVER",
        "family": family,
        "total_odds": odds,
        "plays": [play],
    }


def build_blocks(rows: list[sqlite3.Row], pick_date: str) -> list[dict[str, Any]]:
    """Agrupa varios picks en blocks por matchup. Cada pick queda como un ticket de 1 play."""
    blocks: "OrderedDict[str, dict[str, Any]]" = OrderedDict()

    for row in rows:
        matchup = str(val(row, "partido", "NBA")).strip() or "NBA"
        if matchup not in blocks:
            blocks[matchup] = {
                "matchup": matchup,
                "game_date": pick_date,
                "guion": "OVER",
                "tickets": [],
            }
        blocks[matchup]["tickets"].append(build_ticket(row))

    return list(blocks.values())


def load_rows(args: argparse.Namespace) -> list[sqlite3.Row]:
    con = connect_sqlite(args.db)
    if not table_exists(con, args.picks_table):
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
        raise SystemExit(
            f"No existe la tabla {args.picks_table}.\n"
            f"Tablas disponibles: {tables}\n\n"
            "Primero corré generar_picks_betano_hitos_ludo.py --save-db."
        )

    cols = sqlite_columns(con, args.picks_table)
    order_col = "ev" if "ev" in cols else "ev_pct"

    where = []
    params: list[Any] = []

    if args.snapshot_id:
        where.append("snapshot_id = ?")
        params.append(args.snapshot_id)

    if "ev_pct" in cols:
        where.append("ev_pct >= ?")
        params.append(args.min_ev_pct)

    if "odds_decimal" in cols:
        where.append("odds_decimal >= ?")
        params.append(args.min_odds)
        where.append("odds_decimal <= ?")
        params.append(args.max_odds)

    sql = f"SELECT * FROM {args.picks_table}"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {order_col} DESC"
    if args.top:
        sql += " LIMIT ?"
        params.append(args.top)

    rows = con.execute(sql, params).fetchall()
    con.close()
    return rows


def supabase_request(method: str, url: str, key: str, body: Any | None = None) -> tuple[int, str]:
    data = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Prefer"] = "return=representation"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase HTTP {e.code}: {text}") from e


def insert_supabase(row_payload: dict[str, Any], args: argparse.Namespace) -> None:
    supabase_url = args.supabase_url or os.getenv("SUPABASE_URL")
    supabase_key = (
        args.supabase_key
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
    )

    if not supabase_url or not supabase_key:
        raise SystemExit(
            "Faltan credenciales de Supabase. Usá variables de entorno:\n"
            "  export SUPABASE_URL='https://xxxx.supabase.co'\n"
            "  export SUPABASE_SERVICE_KEY='...'\n"
            "o pasá --supabase-url y --supabase-key."
        )

    base = supabase_url.rstrip("/")
    table = urllib.parse.quote(args.supabase_table)

    if args.delete_pending_date:
        delete_url = (
            f"{base}/rest/v1/{table}"
            f"?pick_date=eq.{urllib.parse.quote(args.pick_date)}"
            f"&status=eq.PENDING"
        )
        status, _ = supabase_request("DELETE", delete_url, supabase_key)
        print(f"🧹 Borrado previo PENDING {args.pick_date}: HTTP {status}")

    insert_url = f"{base}/rest/v1/{table}"
    status, _ = supabase_request("POST", insert_url, supabase_key, [row_payload])
    print(f"✅ Insert Supabase: HTTP {status} | filas enviadas: 1 | blocks: {len(row_payload['json_data'])}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Publica Betano Hitos en Supabase con formato compatible con ludo_picks.")
    ap.add_argument("--db", default=os.getenv("LUDO_DB_PATH", "ludo.db"), help="Ruta a SQLite local.")
    ap.add_argument("--picks-table", default=PICKS_TABLE_DEFAULT)
    ap.add_argument("--supabase-table", default=SUPABASE_TABLE_DEFAULT)
    ap.add_argument("--supabase-url")
    ap.add_argument("--supabase-key")
    ap.add_argument("--snapshot-id")
    ap.add_argument("--pick-date", default=today_argentina_fallback())
    ap.add_argument("--status", default="PENDING")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--min-ev-pct", type=float, default=4.0)
    ap.add_argument("--min-odds", type=float, default=1.25)
    ap.add_argument("--max-odds", type=float, default=15.0)
    ap.add_argument("--output-dir", default="supabase_payloads")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delete-pending-date", action="store_true", help="Borra PENDING del pick_date antes de insertar.")
    args = ap.parse_args()

    print("=" * 72)
    print("🚀 PUBLICAR BETANO PICKS → SUPABASE")
    print("=" * 72)
    print(f"DB             : {args.db}")
    print(f"Tabla SQLite   : {args.picks_table}")
    print(f"Tabla Supabase : {args.supabase_table}")
    print(f"Pick date      : {args.pick_date}")
    print(f"Filtros        : EV% >= {args.min_ev_pct}, odds {args.min_odds}..{args.max_odds}, top {args.top}")

    rows = load_rows(args)
    print(f"Picks cargados : {len(rows)}")

    blocks = build_blocks(rows, args.pick_date)
    row_payload = {
        "json_data": blocks,
        "results_data": None,
        "pick_date": args.pick_date,
        "status": args.status,
    }

    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    out_path = Path(args.output_dir) / f"betano_picks_payload_{args.pick_date}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(row_payload, f, ensure_ascii=False, indent=2)
    print(f"🧾 Payload JSON: {out_path}")

    if blocks:
        print("\nPreview json_data:")
        print(json.dumps(blocks[:1], ensure_ascii=False, indent=2)[:2500])

    if args.dry_run:
        print("\n[dry-run] No se insertó en Supabase.")
        return

    if not blocks:
        print("No hay picks para insertar.")
        return

    insert_supabase(row_payload, args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelado.", file=sys.stderr)
        raise SystemExit(130)
