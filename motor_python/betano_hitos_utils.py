#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
betano_hitos_utils.py
Utilidades compartidas para normalizar cuotas de Betano NBA, especialmente mercados de hitos.
No depende de pandas.
"""

from __future__ import annotations

import csv
import glob
import hashlib
import math
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BOOK = "betano"
SPORT = "basketball"
LEAGUE = "NBA"

# Mercados de HITOS que sí queremos evaluar con Ludo.
# market_key queda estable para DB; stat_key debe coincidir con tus predicciones.
HITOS_MARKET_MAP = {
    "puntos (hitos)": ("player_points_hito", "PTS"),
    "rebotes (hitos)": ("player_rebounds_hito", "REB"),
    "asistencias (hitos)": ("player_assists_hito", "AST"),
    "triples (hitos)": ("player_threes_hito", "3PM"),
    "robos (hitos)": ("player_steals_hito", "STL"),
    "tapones (hitos)": ("player_blocks_hito", "BLK"),
    "pra (hitos)": ("player_pra_hito", "PRA"),
    "ra (hitos)": ("player_ra_hito", "RA"),
    "pr (hitos)": ("player_pr_hito", "PR"),
    "pa (hitos)": ("player_pa_hito", "PA"),
}

# Desvíos por defecto para aproximación normal cuando tu tabla de predicciones no trae std/sigma.
# Ajustables después con backtesting.
DEFAULT_STD_BY_STAT = {
    "PTS": 5.5,
    "REB": 2.7,
    "AST": 2.8,
    "3PM": 1.5,
    "STL": 0.9,
    "BLK": 0.85,
    "PRA": 7.2,
    "RA": 4.2,
    "PR": 6.2,
    "PA": 6.4,
}

TEAM_FIXES = {
    "76ers": "sixers",
    "76ers": "sixers",
    "76ers": "sixers",
    "76ers": "sixers",
}


def strip_accents(text: str) -> str:
    text = "" if text is None else str(text)
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def normalize_text(text: str) -> str:
    """Normaliza nombres para matchear DB: minúsculas, sin acentos, sin signos raros."""
    text = strip_accents(text).lower().strip()
    text = text.replace("’", "'").replace("`", "'")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_market(market: str) -> str:
    return normalize_text(market).replace(" ", " ")


def market_lookup_key(market: str) -> str:
    # Queremos conservar paréntesis conceptualmente, pero normalize_text los borra.
    # Entonces mapeamos por patrones.
    m = strip_accents(str(market)).lower().strip()
    m = re.sub(r"\s+", " ", m)
    return m


def is_hito_market(market: str) -> bool:
    return market_lookup_key(market) in HITOS_MARKET_MAP


def parse_hito_line(linea: str) -> tuple[float | None, float | None, str | None]:
    """
    Convierte '24+' en:
      threshold = 24.0  -> el hito real: 24 o más
      model_line = 23.5 -> línea para calcular P(X > 23.5)
    """
    s = str(linea or "").strip().replace(",", ".")
    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)\s*\+$", s)
    if not m:
        return None, None, f"linea_hito_invalida:{linea}"
    threshold = float(m.group(1))
    # Continuity correction: 24+ equivale a over 23.5.
    model_line = threshold - 0.5
    return threshold, model_line, None


def parse_decimal(value: str) -> tuple[float | None, str | None]:
    try:
        odd = float(str(value).replace(",", "."))
        if odd <= 1.0:
            return None, f"cuota_invalida:{value}"
        return odd, None
    except Exception:
        return None, f"cuota_invalida:{value}"


def snapshot_from_filename(path: str) -> str:
    stem = Path(path).stem
    m = re.search(r"(20\d{6}_\d{6})", stem)
    if m:
        return m.group(1)
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def snapshot_datetime_from_filename(path: str, source_tz: str) -> tuple[str, str]:
    """Devuelve scraped_at_source y scraped_at_utc en ISO."""
    snap = snapshot_from_filename(path)
    try:
        dt = datetime.strptime(snap, "%Y%m%d_%H%M%S").replace(tzinfo=ZoneInfo(source_tz))
    except Exception:
        dt = datetime.now(tz=ZoneInfo(source_tz))
    return dt.isoformat(timespec="seconds"), dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def latest_file(input_dir: str, patterns: list[str]) -> str:
    files: list[str] = []
    for pat in patterns:
        files.extend(glob.glob(str(Path(input_dir) / pat)))
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        raise FileNotFoundError(f"No encontré CSV en {input_dir} con patrones: {patterns}")
    return max(files, key=os.path.getmtime)


def row_uid(*parts: object) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def prob_over_normal(mean: float, std: float, line: float) -> float:
    if std <= 0:
        return 1.0 if mean > line else 0.0
    z = (line - mean) / std
    return max(0.0, min(1.0, 1.0 - normal_cdf(z)))


def implied_probability(decimal_odds: float) -> float:
    return 1.0 / decimal_odds


def ev_decimal(prob: float, decimal_odds: float) -> float:
    return prob * decimal_odds - 1.0


def read_csv_dicts(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv_dicts(path: str, rows: list[dict], fieldnames: list[str]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
