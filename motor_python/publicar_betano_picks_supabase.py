#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Publica picks Betano Hitos a Supabase en formato compatible con el front de Ludo/Stake.

Salida esperada:
- 1 fila por fecha en betano_picks
- json_data = blocks por partido
- cada block contiene tickets combinados X2 / X5 / X10 / X20
- cada ticket contiene varias plays

Regla de calidad:
- primero arma combinadas por rango de cuota objetivo
- calcula rating 1..10 por pick y por ticket
- filtra rating mínimo según riesgo del ticket
"""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import math
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None



def load_env_file() -> Optional[Path]:
    """
    Carga variables desde .env.local o .env automáticamente.

    Busca primero desde el directorio actual y desde la ubicación de este script,
    subiendo carpetas hasta encontrar el .env del proyecto. Esto evita tener que
    ejecutar manualmente `source .env.local` cada vez que se publica a Supabase.
    """
    names = (".env.local", ".env")
    bases: List[Path] = []

    def add_base(path: Path) -> None:
        path = path.resolve()
        if path not in bases:
            bases.append(path)

    cwd = Path.cwd()
    add_base(cwd)
    for parent in cwd.parents:
        add_base(parent)
        if parent == Path.home():
            break

    script_dir = Path(__file__).resolve().parent
    add_base(script_dir)
    for parent in script_dir.parents:
        add_base(parent)
        if parent == Path.home():
            break

    # Fallback explícito para tu estructura actual.
    add_base(Path.home() / "stats-app")

    seen_files = set()
    for base in bases:
        for name in names:
            env_path = (base / name).resolve()
            if env_path in seen_files:
                continue
            seen_files.add(env_path)
            if not env_path.exists() or not env_path.is_file():
                continue

            loaded = 0
            with env_path.open("r", encoding="utf-8") as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    if line.startswith("export "):
                        line = line[len("export "):].strip()
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if not key:
                        continue
                    # No pisa variables ya exportadas ni valores pasados por la terminal.
                    if key not in os.environ:
                        os.environ[key] = value
                        loaded += 1

            print(f"✅ Env cargado desde: {env_path} ({loaded} variables nuevas)")
            return env_path

    print("⚠️ No encontré .env.local ni .env para cargar credenciales automáticamente.")
    return None


load_env_file()


TARGETS = [
    {
        "label": "X2",
        "emoji": "🟠",
        "target": 2.0,
        "min_total": 1.80,
        "max_total": 2.80,
        "min_plays": 2,
        "max_plays": 3,
        "mode": "safe",
        "min_ticket_rating": 6.8,
        "min_pick_rating": 5.5,
    },
    {
        "label": "X5",
        "emoji": "🟠",
        "target": 5.0,
        "min_total": 4.60,
        "max_total": 6.20,
        "min_plays": 2,
        "max_plays": 4,
        "mode": "safe",
        "min_ticket_rating": 6.0,
        "min_pick_rating": 4.5,
    },
    {
        "label": "X10",
        "emoji": "🔥",
        "target": 10.0,
        "min_total": 9.00,
        "max_total": 12.00,
        "min_plays": 3,
        "max_plays": 5,
        "mode": "risk",
        "min_ticket_rating": 5.3,
        "min_pick_rating": 3.8,
    },
    {
        "label": "X20",
        "emoji": "🚀",
        "target": 20.0,
        "min_total": 18.00,
        "max_total": 23.50,
        "min_plays": 4,
        "max_plays": 6,
        "mode": "risk",
        "min_ticket_rating": 5.0,
        "min_pick_rating": 3.5,
    },
]

FAMILY_MAP = {
    "PTS": "MAIN",
    "REB": "MAIN",
    "AST": "MAIN",
    "PRA": "MAIN",
    "PR": "COMBO",
    "PA": "COMBO",
    "RA": "COMBO",
    "3PM": "SPEC",
    "3PT": "SPEC",
    "STL": "SPEC",
    "BLK": "SPEC",
}

TEAM_NAMES = {
    "ATL": "Atlanta Hawks",
    "BOS": "Boston Celtics",
    "BKN": "Brooklyn Nets",
    "CHA": "Charlotte Hornets",
    "CHI": "Chicago Bulls",
    "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks",
    "DEN": "Denver Nuggets",
    "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors",
    "HOU": "Houston Rockets",
    "IND": "Indiana Pacers",
    "LAC": "Los Angeles Clippers",
    "LAL": "Los Angeles Lakers",
    "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat",
    "MIL": "Milwaukee Bucks",
    "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans",
    "NYK": "New York Knicks",
    "OKC": "Oklahoma City Thunder",
    "ORL": "Orlando Magic",
    "PHI": "Philadelphia 76ers",
    "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers",
    "SAC": "Sacramento Kings",
    "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors",
    "UTA": "Utah Jazz",
    "WAS": "Washington Wizards",
}


def fnum(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def fint(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except Exception:
        return default


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def default_pick_date() -> str:
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date().isoformat()
    return datetime.now().date().isoformat()


def get(row: Dict[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in row and row[name] not in (None, ""):
            return row[name]
    return default


def normalize_stat(stat: str) -> str:
    s = (stat or "").strip().upper()
    if s == "3PT":
        return "3PM"
    return s


def display_matchup(partido: str, rows: Sequence[Dict[str, Any]]) -> str:
    # Preferimos el matchup de Ludo porque suele venir con @.
    for r in rows:
        pg = str(get(r, "pred_game", "matchup", default="") or "").strip()
        if " @ " in pg:
            return pg.replace("76Ers", "76ers")

    raw = (partido or "").replace("76Ers", "76ers").strip()
    if " @ " in raw:
        return raw

    # Intento simple: detectar 2 nombres de equipo dentro del string sin separador.
    low = raw.lower()
    found: List[Tuple[int, str]] = []
    for full in TEAM_NAMES.values():
        pos = low.find(full.lower())
        if pos >= 0:
            found.append((pos, full))
    if len(found) >= 2:
        found.sort(key=lambda x: x[0])
        return f"{found[0][1]} @ {found[1][1]}"

    return raw


def short_last_name(player: str) -> str:
    parts = [p for p in str(player or "").replace("-", " ").split() if p]
    return parts[-1] if parts else str(player or "Jugador")


def implied_prob(odds: float) -> float:
    return 1.0 / odds if odds > 0 else 0.0

def hit_l5(row: Dict[str, Any]) -> int:
    return fint(get(row, "hit_l5", default=0), 0)


def n_l5(row: Dict[str, Any]) -> int:
    return fint(get(row, "n_l5", default=0), 0)


def hit_l10(row: Dict[str, Any]) -> int:
    return fint(get(row, "hit_l10", default=0), 0)


def n_l10(row: Dict[str, Any]) -> int:
    return fint(get(row, "n_l10", default=0), 0)


def hr_l5(row: Dict[str, Any]) -> float:
    return fnum(get(row, "hr_l5", default=0.0), 0.0)


def hr_l10(row: Dict[str, Any]) -> float:
    return fnum(get(row, "hr_l10", default=0.0), 0.0)


def has_l5_elite(row: Dict[str, Any]) -> bool:
    return n_l5(row) >= 5 and hit_l5(row) >= 4


def is_l5_perfect(row: Dict[str, Any]) -> bool:
    return n_l5(row) >= 5 and hit_l5(row) >= 5


def consistency_bonus(row: Dict[str, Any]) -> float:
    """Bonus chico: prioriza 5/5 y 4/5 sin reemplazar EV/probabilidad."""
    if is_l5_perfect(row):
        if n_l10(row) >= 10 and hit_l10(row) >= 8:
            return 1.20
        return 0.95
    if has_l5_elite(row):
        if n_l10(row) >= 10 and hit_l10(row) >= 7:
            return 0.75
        return 0.50
    return 0.0


def pick_rating(row: Dict[str, Any]) -> float:
    prob = fnum(get(row, "prob_model"))
    ev_pct = fnum(get(row, "ev_pct"))
    odds = fnum(get(row, "odds_decimal"))
    pred = fnum(get(row, "pred_mean", "proj"))
    line = fnum(get(row, "model_line", "line"))
    std = max(fnum(get(row, "pred_std", "model_mae"), 1.0), 0.75)
    diff = max(0.0, pred - line)

    prob_score = clamp((prob - 0.60) / 0.38, 0.0, 1.0) * 5.0
    ev_score = clamp((ev_pct - 10.0) / 90.0, 0.0, 1.0) * 3.0
    diff_score = clamp(diff / (std * 1.25), 0.0, 1.0) * 1.5
    odds_penalty = max(0.0, odds - 2.20) * 0.35

    score = 1.0 + prob_score + ev_score + diff_score + consistency_bonus(row) - odds_penalty

    # Si bajamos cuota mínima a 1.20, solo dejamos que suba fuerte
    # cuando viene respaldado por L5/L10 o probabilidad alta.
    if odds < 1.35 and not has_l5_elite(row) and prob < 0.78:
        score -= 0.75

    return round(clamp(score, 1.0, 10.0), 2)


def publish_sort_key(row: Dict[str, Any]) -> Tuple[float, float, float, float]:
    """Orden final para publicar.

    Antes priorizábamos casi todo por EV. En hitos eso puede esconder picks
    muy consistentes de cuota media/baja. Este score prioriza primero rating
    y probabilidad, y recién después EV. No elimina ningún filtro existente.
    """
    return (
        1 if is_l5_perfect(row) else 0,
        hit_l5(row),
        hit_l10(row),
        fnum(row.get("_score_10")),
        fnum(get(row, "prob_model")),
        fnum(get(row, "ev_pct")),
        fnum(get(row, "odds_decimal")),
    )




def passes_publish_floor(row: Dict[str, Any], args: argparse.Namespace) -> bool:
    """Permite EV >= mínimo o picks fuertes por hit-rate reciente.

    Esto evita que una línea segura 5/5 quede afuera solo porque la cuota es 1.20-1.34
    o porque el EV queda apenas por debajo del corte principal.
    """
    ev_pct = fnum(get(row, "ev_pct"), 0.0)
    prob = fnum(get(row, "prob_model"), 0.0)
    if ev_pct >= args.min_ev_pct:
        return True
    if ev_pct < args.hr_override_min_ev_pct or prob < args.hr_override_min_prob:
        return False
    if is_l5_perfect(row) and (n_l10(row) < 10 or hit_l10(row) >= 7):
        return True
    if has_l5_elite(row) and n_l10(row) >= 10 and hit_l10(row) >= 8:
        return True
    return False

def quality_from_score(score: float) -> str:
    if score >= 8.0:
        return "JOYA"
    if score >= 6.5:
        return "EXCELENTE"
    if score >= 5.0:
        return "BUENA"
    return "RADAR"


def combo_total_odds(combo: Sequence[Dict[str, Any]]) -> float:
    total = 1.0
    for r in combo:
        total *= fnum(get(r, "odds_decimal"), 1.0)
    return total


def combo_valid(combo: Sequence[Dict[str, Any]]) -> bool:
    players = [str(get(r, "jugador", "player", default="")).strip().lower() for r in combo]
    if len(players) != len(set(players)):
        return False

    # Evita duplicar exactamente el mismo tipo de jugada si no hace falta.
    pick_uids = [str(get(r, "pick_uid", "row_uid", default="")) for r in combo]
    return len(pick_uids) == len(set(pick_uids))


def ticket_rating(combo: Sequence[Dict[str, Any]], label: str, total_odds: float, target: float) -> float:
    scores = [fnum(r.get("_score_10")) for r in combo]
    avg = sum(scores) / len(scores) if scores else 1.0
    closeness_bonus = max(0.0, 1.0 - abs(math.log(total_odds / target))) * 0.25
    risk_penalty = {"X2": 0.00, "X5": 0.15, "X10": 0.35, "X20": 0.60}.get(label, 0.0)
    return round(clamp(avg + closeness_bonus - risk_penalty, 1.0, 10.0), 1)


def combo_rank_score(combo: Sequence[Dict[str, Any]], cfg: Dict[str, Any]) -> float:
    total = combo_total_odds(combo)
    target = fnum(cfg["target"])
    label = str(cfg["label"])
    mode = str(cfg.get("mode", "safe"))

    avg_score = sum(fnum(r.get("_score_10")) for r in combo) / len(combo)
    avg_prob = sum(fnum(get(r, "prob_model")) for r in combo) / len(combo)
    avg_ev = sum(fnum(get(r, "ev_pct")) for r in combo) / len(combo)
    avg_odds = sum(fnum(get(r, "odds_decimal")) for r in combo) / len(combo)
    avg_hit_l5 = sum(hit_l5(r) for r in combo) / len(combo)
    avg_hit_l10 = sum(hit_l10(r) for r in combo) / len(combo)
    perfect_count = sum(1 for r in combo if is_l5_perfect(r))
    elite_count = sum(1 for r in combo if has_l5_elite(r))
    distance = abs(math.log(total / target))

    # Menor es mejor.
    if mode == "safe":
        # x2/x5: cerca del target, alta probabilidad, cuotas individuales bajas.
        return (distance * 100.0) - (avg_score * 8.0) - (avg_prob * 14.0) - (avg_hit_l5 * 3.0) - (avg_hit_l10 * 0.8) - (perfect_count * 8.0) - (elite_count * 4.0) + (avg_odds * 1.6)

    # x10/x20: cerca del target, buen score, algo más de EV, menos castigo por riesgo.
    return (distance * 100.0) - (avg_score * 7.0) - (avg_ev * 0.04) - (avg_prob * 8.0) - (avg_hit_l5 * 2.0) - (avg_hit_l10 * 0.5) - (perfect_count * 5.0) - (elite_count * 2.5)


def build_best_combo_for_target(
    picks: Sequence[Dict[str, Any]],
    cfg: Dict[str, Any],
    max_candidates: int,
) -> Optional[Tuple[float, float, Tuple[Dict[str, Any], ...]]]:
    min_pick_rating = fnum(cfg["min_pick_rating"])
    min_ticket_rating = fnum(cfg["min_ticket_rating"])
    min_total = fnum(cfg["min_total"])
    max_total = fnum(cfg["max_total"])
    min_plays = int(cfg["min_plays"])
    max_plays = int(cfg["max_plays"])

    # Para que haya variedad, ordenamos por score + EV y recortamos.
    candidates = []
    for r in picks:
        if fnum(r.get("_score_10")) < min_pick_rating:
            continue
        odds = fnum(get(r, "odds_decimal"))
        prob = fnum(get(r, "prob_model"))
        # Cuotas 1.20-1.34 solo entran si tienen base real fuerte
        # o probabilidad del modelo muy alta. Evita llenar tickets con
        # picks seguros pero sin respaldo reciente.
        if odds < 1.35 and not has_l5_elite(r) and prob < 0.78:
            continue
        candidates.append(r)
    candidates.sort(key=publish_sort_key, reverse=True)
    candidates = candidates[:max_candidates]

    best: Optional[Tuple[float, float, Tuple[Dict[str, Any], ...]]] = None

    max_size = min(max_plays, len(candidates))
    if max_size < min_plays:
        return None

    for size in range(min_plays, max_size + 1):
        for combo in itertools.combinations(candidates, size):
            if not combo_valid(combo):
                continue
            total = combo_total_odds(combo)
            if not (min_total <= total <= max_total):
                continue
            tr = ticket_rating(combo, str(cfg["label"]), total, fnum(cfg["target"]))
            if tr < min_ticket_rating:
                continue
            rank = combo_rank_score(combo, cfg)
            if best is None or rank < best[0]:
                best = (rank, total, combo)

    return best


def row_to_play(row: Dict[str, Any]) -> Dict[str, Any]:
    stat = normalize_stat(str(get(row, "stat_key", "prop", default="")))
    player = str(get(row, "jugador", "player", default="Jugador"))
    odds = fnum(get(row, "odds_decimal", "odds"))
    pred = fnum(get(row, "pred_mean", "proj"))
    line = fnum(get(row, "model_line", "line"))
    threshold = fnum(get(row, "threshold"), line + 0.5)
    ev_pct = fnum(get(row, "ev_pct"))
    prob = fnum(get(row, "prob_model"))
    diff = pred - line
    score = fnum(row.get("_score_10", pick_rating(row)))

    return {
        "player_id": fint(get(row, "player_id")),
        "player": player,
        "team": str(get(row, "team", "team_abbreviation", "pred_team", default="NBA")),
        "prop": stat,
        "type": "OVER",
        "family": FAMILY_MAP.get(stat, "MAIN"),
        "line": round(line, 2),
        "linea_raw": str(get(row, "linea_raw", default=f"{threshold:g}+")),
        "threshold": round(threshold, 2),
        "odds": round(odds, 2),
        "proj": round(pred, 2),
        "diff": round(diff, 2),
        "edge_score": round(prob - implied_prob(odds), 6),
        "edge_pct": round(ev_pct, 2),
        "prob_model": round(prob, 6),
        "quality": quality_from_score(score),
        "score_10": round(score, 2),
        "rating": f"{score:.1f}/10",
        "hit_rate": str(get(row, "hit_rate", default="N/D")),
        "hit_l5": hit_l5(row),
        "hit_l10": hit_l10(row),
        "n_l5": n_l5(row),
        "n_l10": n_l10(row),
        "analysis": f"Hito {str(get(row, 'linea_raw', default=f'{threshold:g}+'))} {stat}. Proy {pred:.1f}, diff {diff:+.1f}. EV {ev_pct:+.1f}%. HR {str(get(row, 'hit_rate', default='N/D'))}. Rating {score:.1f}/10.",
        "is_vip": False,
        "book": "betano",
        "market_type": "hitos",
        "snapshot_id": str(get(row, "snapshot_id", default="")),
        "pick_uid": str(get(row, "pick_uid", "row_uid", default="")),
    }


def make_ticket(combo: Sequence[Dict[str, Any]], cfg: Dict[str, Any], total: float) -> Dict[str, Any]:
    label = str(cfg["label"])
    emoji = str(cfg["emoji"])
    tr = ticket_rating(combo, label, total, fnum(cfg["target"]))
    plays = [row_to_play(r) for r in combo]
    return {
        "name": f"{emoji} BETANO {label} · {tr:.1f}/10 — {len(plays)} picks",
        "side": "OVER",
        "family": "MAIN",
        "total_odds": round(total, 2),
        "ticket_rating": tr,
        "plays": plays,
    }


def qident(name: str) -> str:
    """Quote simple para nombres de tabla/columna SQLite."""
    return '"' + str(name).replace('"', '""') + '"'


def latest_picks_snapshot(con: sqlite3.Connection, table: str) -> Optional[str]:
    """Devuelve el último snapshot guardado en picks_betano_hitos.

    El publicador debe usar un solo snapshot para no mezclar picks de
    corridas distintas. Priorizamos created_at_utc y, si empata, snapshot_id.
    """
    row = con.execute(
        f"""
        SELECT snapshot_id, MAX(created_at_utc) AS max_created
        FROM {qident(table)}
        WHERE snapshot_id IS NOT NULL AND TRIM(snapshot_id) <> ''
        GROUP BY snapshot_id
        ORDER BY max_created DESC, snapshot_id DESC
        LIMIT 1
        """
    ).fetchone()
    return str(row[0]) if row else None


def date_only(value: Any) -> str:
    """Normaliza una fecha a YYYY-MM-DD sin tocar timezone.

    Betano ya entrega la fecha del evento como texto en el CSV crudo. Para
    evitar corrimientos, no parseamos con datetime salvo formatos simples.
    """
    raw = str(value or "").strip()
    if not raw:
        return ""
    if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
        return raw[:10]
    if len(raw) >= 10 and raw[2] == "/" and raw[5] == "/":
        dd, mm, yy = raw[:10].split("/")
        if dd.isdigit() and mm.isdigit() and yy.isdigit():
            return f"{yy}-{mm}-{dd}"
    return raw[:10]


def game_lookup_key(value: Any) -> str:
    """Clave tolerante para matchear el partido entre CSV crudo y SQLite."""
    raw = str(value or "").replace("@", " ").replace("-", " ").lower()
    return " ".join("".join(ch if ch.isalnum() else " " for ch in raw).split())


def find_raw_props_csv(snapshot_id: str, args: argparse.Namespace) -> Optional[Path]:
    """Encuentra el CSV crudo de Betano que salió del scraper para ese snapshot."""
    if getattr(args, "raw_props_csv", None):
        explicit = Path(args.raw_props_csv)
        if not explicit.is_absolute():
            explicit = Path.cwd() / explicit
        return explicit if explicit.exists() else None

    raw_dir = Path(getattr(args, "raw_props_dir", "betano_props"))
    patterns = [
        f"props_nba_{snapshot_id}.csv",
        f"lineas_nba_{snapshot_id}.csv",
        f"*{snapshot_id}*.csv",
    ]
    for pattern in patterns:
        matches = sorted(raw_dir.glob(pattern), key=lambda x: x.stat().st_mtime, reverse=True)
        if matches:
            return matches[0]
    return None


def load_event_date_map(snapshot_id: str, args: argparse.Namespace) -> Dict[str, str]:
    """Lee partido -> fecha real del evento desde el CSV crudo del scraper.

    Esto evita publicar todos los partidos scrapeados como si fueran de hoy:
    Betano puede listar en NBA partidos de más de una fecha.
    """
    path = find_raw_props_csv(snapshot_id, args)
    if not path:
        print(f"⚠️ No encontré CSV crudo para snapshot {snapshot_id}. No filtro por fecha real de evento.")
        return {}

    event_dates: Dict[str, str] = {}
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                partido = row.get("partido") or row.get("matchup") or ""
                fecha = date_only(row.get("fecha") or row.get("game_date") or row.get("event_date") or "")
                if not partido or not fecha:
                    continue
                event_dates.setdefault(game_lookup_key(partido), fecha)
    except Exception as e:
        print(f"⚠️ No pude leer fechas reales desde {path}: {e}")
        return {}

    if event_dates:
        resumen: Dict[str, int] = defaultdict(int)
        for dt in event_dates.values():
            resumen[dt] += 1
        print(f"📅 Fechas reales leídas desde {path}: " + ", ".join(f"{k}={v} partidos" for k, v in sorted(resumen.items())))
    else:
        print(f"⚠️ El CSV crudo {path} no trae columna fecha/game_date/event_date utilizable.")
    return event_dates


def attach_and_filter_event_dates(rows: List[Dict[str, Any]], args: argparse.Namespace) -> List[Dict[str, Any]]:
    if getattr(args, "no_event_date_filter", False):
        return rows

    snapshot_id = str(getattr(args, "resolved_snapshot_id", "") or getattr(args, "snapshot_id", "") or "").strip()
    if not snapshot_id:
        return rows

    event_dates = load_event_date_map(snapshot_id, args)
    if not event_dates:
        return rows

    kept: List[Dict[str, Any]] = []
    dropped = 0
    missing = 0
    for r in rows:
        key = game_lookup_key(get(r, "partido", "matchup", default=""))
        event_date = event_dates.get(key, "")
        if event_date:
            r["event_date"] = event_date
            r["game_date"] = event_date
            if event_date != args.pick_date:
                dropped += 1
                continue
        else:
            missing += 1
        kept.append(r)

    print(f"🧹 Filtro fecha evento Betano: {len(rows)} → {len(kept)} picks | descartados otra fecha={dropped} | sin fecha={missing}")
    return kept


def block_game_date(picks: Sequence[Dict[str, Any]], fallback: str) -> str:
    counts: Dict[str, int] = defaultdict(int)
    for r in picks:
        dt = date_only(get(r, "game_date", "event_date", default=""))
        if dt:
            counts[dt] += 1
    if not counts:
        return fallback
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def load_picks(args: argparse.Namespace) -> List[Dict[str, Any]]:
    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    try:
        snapshot_id = (args.snapshot_id or "").strip()
        if not snapshot_id:
            snapshot_id = latest_picks_snapshot(con, args.sqlite_table) or ""

        if not snapshot_id:
            print("⚠️ No encontré snapshot_id en la tabla local de picks.")
            args.resolved_snapshot_id = ""
            return []

        args.resolved_snapshot_id = snapshot_id

        sql = f"""
        SELECT *
        FROM {qident(args.sqlite_table)}
        WHERE snapshot_id = ?
          AND CAST(odds_decimal AS REAL) >= ?
          AND CAST(odds_decimal AS REAL) <= ?
        ORDER BY CAST(ev_pct AS REAL) DESC
        LIMIT ?
        """
        sql_limit = args.top if args.no_event_date_filter else max(args.top * 10, args.top + 250, 500)
        params = (snapshot_id, args.min_odds, args.max_odds, sql_limit)
        rows = [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()

    for r in rows:
        r["stat_key"] = normalize_stat(str(get(r, "stat_key", "prop", default="")))
        r["_score_10"] = pick_rating(r)

    before_floor = len(rows)
    rows = [r for r in rows if passes_publish_floor(r, args)]
    print(f"🧪 Filtro publicación EV/HR: {before_floor} → {len(rows)} | EV base>={args.min_ev_pct:.1f}% o 5/5-4/5 confirmado")

    rows = attach_and_filter_event_dates(rows, args)
    rows.sort(key=publish_sort_key, reverse=True)
    return rows[: args.top]


def ticket_play_key(row: Dict[str, Any]) -> tuple:
    return (
        str(get(row, "player_id", default="")),
        str(get(row, "jugador", "player", default="")).strip().lower(),
        normalize_stat(str(get(row, "stat_key", "prop", default=""))),
        str(get(row, "linea_raw", default="")),
    )


def selected_play_keys(tickets: Sequence[Dict[str, Any]]) -> set:
    used = set()
    for ticket in tickets:
        for p in ticket.get("plays", []):
            used.add((
                str(p.get("player_id", "")),
                str(p.get("player", "")).strip().lower(),
                normalize_stat(str(p.get("prop", ""))),
                str(p.get("linea_raw", "")),
            ))
    return used


def build_radar_ticket(picks: Sequence[Dict[str, Any]], existing_tickets: Sequence[Dict[str, Any]], args: argparse.Namespace) -> Optional[Dict[str, Any]]:
    """Agrega un ticket de radar para no esconder picks sólidos.

    Los targets X2/X5/X10/X20 optimizan combinadas por cuota total. Eso puede
    dejar afuera picks muy razonables que no encajan en el producto de cuotas.
    Este radar no reemplaza las combinadas: agrega una lista corta, una por
    jugador, de picks publicables que quedaron fuera.
    """
    if not getattr(args, "include_radar_ticket", True):
        return None

    used = selected_play_keys(existing_tickets)
    candidates: List[Dict[str, Any]] = []
    seen_players = set()

    for r in sorted(picks, key=publish_sort_key, reverse=True):
        if ticket_play_key(r) in used:
            continue

        player_key = str(get(r, "jugador", "player", default="")).strip().lower()
        if not player_key or player_key in seen_players:
            continue

        odds = fnum(get(r, "odds_decimal"))
        prob = fnum(get(r, "prob_model"))
        ev_pct = fnum(get(r, "ev_pct"))
        score = fnum(r.get("_score_10"))
        stat = normalize_stat(str(get(r, "stat_key", "prop", default="")))

        if odds < args.radar_min_odds or odds > args.radar_max_odds:
            continue
        if odds < 1.35 and not has_l5_elite(r) and prob < 0.78:
            continue
        if prob < args.radar_min_prob and not has_l5_elite(r):
            continue
        if ev_pct < args.radar_min_ev_pct:
            continue
        if score < args.radar_min_rating:
            continue
        if stat not in {"PTS", "REB", "AST", "PRA", "PR", "PA", "RA", "3PM"}:
            continue

        candidates.append(r)
        seen_players.add(player_key)
        if len(candidates) >= args.radar_max_plays:
            break

    if len(candidates) < args.radar_min_plays:
        return None

    total = combo_total_odds(candidates)
    plays = [row_to_play(r) for r in candidates]
    avg_score = sum(fnum(p.get("score_10")) for p in plays) / len(plays)

    return {
        "name": f"🟠 BETANO RADAR · {avg_score:.1f}/10 — {len(plays)} picks",
        "side": "OVER",
        "family": "RADAR",
        "total_odds": round(total, 2),
        "ticket_rating": round(avg_score, 1),
        "plays": plays,
    }

def build_blocks(rows: List[Dict[str, Any]], args: argparse.Namespace) -> Tuple[List[Dict[str, Any]], int, int]:
    by_game: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        by_game[str(get(r, "partido", "matchup", default="SIN PARTIDO"))].append(r)

    blocks: List[Dict[str, Any]] = []
    total_tickets = 0
    total_plays = 0

    for partido, picks in by_game.items():
        picks.sort(key=publish_sort_key, reverse=True)
        tickets: List[Dict[str, Any]] = []

        for cfg in TARGETS:
            best = build_best_combo_for_target(picks, cfg, args.max_candidates_per_game)
            if best is None:
                if args.verbose:
                    print(f"  {partido} | {cfg['label']} sin combo posible en rango/rating estricto")
                continue
            _, total, combo = best
            ticket = make_ticket(combo, cfg, total)
            tickets.append(ticket)
            total_tickets += 1
            total_plays += len(ticket["plays"])
            if args.verbose:
                print(f"  {partido} | {cfg['label']} -> {total:.2f} ({len(combo)} plays) | rating {ticket['ticket_rating']:.1f}/10")

        radar_ticket = build_radar_ticket(picks, tickets, args)
        if radar_ticket:
            tickets.append(radar_ticket)
            total_tickets += 1
            total_plays += len(radar_ticket["plays"])
            if args.verbose:
                print(f"  {partido} | RADAR -> {len(radar_ticket['plays'])} plays | rating {radar_ticket['ticket_rating']:.1f}/10")

        if tickets:
            blocks.append({
                "matchup": display_matchup(partido, picks),
                "game_date": block_game_date(picks, args.pick_date),
                "guion": "OVER",
                "tickets": tickets,
            })

    # Orden amigable: más tickets primero, luego nombre de partido.
    blocks.sort(key=lambda b: (-len(b.get("tickets", [])), b.get("matchup", "")))
    return blocks, total_tickets, total_plays


def supabase_request(method: str, url: str, key: str, payload: Optional[Any] = None) -> Tuple[int, str]:
    data = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body


def publish_to_supabase(blocks: List[Dict[str, Any]], args: argparse.Namespace) -> None:
    url = (args.supabase_url or os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = args.supabase_key or os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

    if not url or not key:
        print("Faltan credenciales de Supabase. Usá variables de entorno:")
        print("  export SUPABASE_URL='https://xxxx.supabase.co'")
        print("  export SUPABASE_SERVICE_KEY='...'")
        print("o pasá --supabase-url y --supabase-key.")
        raise SystemExit(2)

    base = f"{url}/rest/v1/{args.supabase_table}"

    if args.delete_pending_date:
        del_url = f"{base}?pick_date=eq.{args.pick_date}&status=eq.PENDING"
        status, body = supabase_request("DELETE", del_url, key)
        print(f"🧹 Borrado previo PENDING {args.pick_date}: HTTP {status}")
        if status >= 300:
            print(body)
            raise SystemExit(1)

    row = {
        "json_data": blocks,
        "results_data": None,
        "pick_date": args.pick_date,
        "status": "PENDING",
    }

    status, body = supabase_request("POST", base, key, [row])
    print(f"✅ Insert Supabase: HTTP {status} | filas enviadas: 1 | blocks: {len(blocks)}")
    if status >= 300:
        print(body)
        raise SystemExit(1)


def print_summary(blocks: List[Dict[str, Any]]) -> None:
    print("\nResumen tickets:")
    for block in blocks:
        print(f"\n🏀 {block['matchup']}")
        for ticket in block.get("tickets", []):
            print(f"  {ticket['name']} | total {ticket['total_odds']:.2f} | plays {len(ticket['plays'])}")
            for p in ticket.get("plays", []):
                print(f"    - {p['player']} — {p['linea_raw']} {p['prop']} @ {p['odds']:.2f} | {p.get('rating', 'N/D')}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Publicar Betano Hitos como combinadas X2/X5/X10/X20 en Supabase.")
    p.add_argument("--db", default="ludo.db")
    p.add_argument("--sqlite-table", default="picks_betano_hitos")
    p.add_argument("--supabase-table", default="betano_picks")
    p.add_argument("--pick-date", default=default_pick_date())
    p.add_argument("--top", type=int, default=80)
    p.add_argument("--min-ev-pct", type=float, default=10.0)
    p.add_argument("--hr-override-min-ev-pct", type=float, default=3.0, help="EV%% mínimo para permitir picks por 5/5 o 4/5 aunque no lleguen a --min-ev-pct.")
    p.add_argument("--hr-override-min-prob", type=float, default=0.60, help="Probabilidad mínima para permitir picks por hit-rate reciente.")
    p.add_argument("--min-odds", type=float, default=1.20)
    p.add_argument("--max-odds", type=float, default=3.00)
    p.add_argument("--max-candidates-per-game", type=int, default=40)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--delete-pending-date", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--supabase-url", default=None)
    p.add_argument("--supabase-key", default=None)
    p.add_argument("--snapshot-id", default=None, help="Snapshot específico de picks_betano_hitos. Si no se pasa, usa el último snapshot local.")
    p.add_argument("--include-radar-ticket", action=argparse.BooleanOptionalAction, default=True, help="Agrega un ticket RADAR con picks sólidos que no entraron en X2/X5/X10/X20.")
    p.add_argument("--radar-min-plays", type=int, default=3)
    p.add_argument("--radar-max-plays", type=int, default=6)
    p.add_argument("--radar-min-rating", type=float, default=4.5)
    p.add_argument("--radar-min-prob", type=float, default=0.70)
    p.add_argument("--radar-min-ev-pct", type=float, default=10.0)
    p.add_argument("--radar-min-odds", type=float, default=1.20)
    p.add_argument("--radar-max-odds", type=float, default=3.00)
    p.add_argument("--raw-props-dir", default="betano_props", help="Carpeta del CSV crudo del scraper Betano para filtrar por fecha real del evento.")
    p.add_argument("--raw-props-csv", default=None, help="CSV crudo específico del scraper Betano. Si no se indica, se busca por snapshot.")
    p.add_argument("--no-event-date-filter", action="store_true", help="Desactiva el filtro por fecha real del evento de Betano.")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    print("========================================================================")
    print("🚀 PUBLICAR BETANO PICKS → SUPABASE COMBOS")
    print("========================================================================")
    print(f"DB             : {args.db}")
    print(f"Tabla SQLite   : {args.sqlite_table}")
    print(f"Tabla Supabase : {args.supabase_table}")
    print(f"Pick date      : {args.pick_date}")
    print(f"Filtros        : EV% >= {args.min_ev_pct}, odds {args.min_odds}..{args.max_odds}, top {args.top}")
    print("Prioridad picks: 5/5 y 4/5 L5 primero; L10 como desempate/confirmación; EV como complemento.")
    print("Formato        : combinadas estrictas por cuota objetivo + rating mínimo por ticket")
    print("Targets        : x2 1.80-2.80 | x5 4.60-6.20 | x10 9.00-12.00 | x20 18.00-23.50")
    print("Mínimos rating : x2 ticket 6.8/pick 5.5 | x5 6.0/4.5 | x10 5.3/3.8 | x20 5.0/3.5")
    print(f"Radar extra    : {'ON' if args.include_radar_ticket else 'OFF'} | rating>={args.radar_min_rating} prob>={args.radar_min_prob:.2f} odds {args.radar_min_odds}..{args.radar_max_odds}")

    rows = load_picks(args)
    print(f"Snapshot local : {getattr(args, 'resolved_snapshot_id', args.snapshot_id or 'AUTO')}")
    print(f"Picks cargados : {len(rows)}")

    blocks, total_tickets, total_plays = build_blocks(rows, args)

    out_dir = Path("supabase_payloads")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"betano_picks_payload_{args.pick_date}.json"
    out_path.write_text(json.dumps(blocks, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"🧾 Payload JSON: {out_path}")
    print(f"Blocks         : {len(blocks)}")
    print(f"Tickets        : {total_tickets}")
    print(f"Plays publicados: {total_plays}")

    print_summary(blocks)

    print("\nPreview json_data:")
    preview = json.dumps(blocks[:1], ensure_ascii=False, indent=2)
    if len(preview) > 5500:
        preview = preview[:5500] + "\n..."
    print(preview)

    if args.dry_run:
        print("\n[dry-run] No se insertó en Supabase.")
        return

    if not blocks:
        print("No hay blocks/tickets para publicar. No inserto fila vacía.")
        raise SystemExit(1)

    publish_to_supabase(blocks, args)


if __name__ == "__main__":
    main()