"""
╔══════════════════════════════════════════════════════════════════╗
║         WNBA CSV EXPORTER  v2.0                                  ║
║         Temporadas: 2024 hasta temporada actual                    ║
║                                                                  ║
║  Instalar dependencias:                                          ║
║    pip install nba_api pandas tqdm requests                      ║
║                                                                  ║
║  Ejecutar:                                                       ║
║    python wnba.py                                                ║
║                                                                  ║
║  Genera en la carpeta  ./wnba_data/ :                            ║
║    ├── teams.csv                                                 ║
║    ├── players.csv                                               ║
║    ├── games.csv                                                 ║
║    ├── player_game_stats.csv                                     ║
║    ├── player_game_stats_advanced.csv                            ║
║    ├── team_game_stats.csv                                       ║
║    ├── player_season_stats.csv                                   ║
║    ├── team_season_stats.csv                                     ║
║    └── SCHEMA_README.txt   ← instrucciones para crear las tablas ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

# ── Verificar dependencias ──────────────────────────────────────
try:
    import pandas as pd
    from nba_api.stats.endpoints import (
        LeagueGameLog,
        BoxScoreTraditionalV3,
        BoxScoreAdvancedV3,
        LeagueDashPlayerStats,
        LeagueDashTeamStats,
        CommonAllPlayers,

    )
    from tqdm import tqdm
    print("✅ Dependencias OK")
except ImportError as e:
    print(f"❌ Falta instalar: {e}")
    print("   Ejecutá: pip install nba_api pandas tqdm requests")
    sys.exit(1)


# ══════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ══════════════════════════════════════════════════════════════════
OUTPUT_DIR    = Path("./wnba_data")
LEAGUE_ID     = "10"           # 10 = WNBA

# Descarga desde 2024 hasta la temporada/año actual.
# Si querés forzar otro rango:
#   WNBA_START_SEASON=2024 WNBA_END_SEASON=2026 python wnba.py
START_SEASON  = int(os.getenv("WNBA_START_SEASON", "2024"))
END_SEASON    = int(os.getenv("WNBA_END_SEASON", str(datetime.now().year)))
SEASONS       = [str(y) for y in range(START_SEASON, END_SEASON + 1)]

# Corte de descarga: por defecto HOY.
# Si necesitás repetir una fecha específica:
#   WNBA_UNTIL_DATE=2026-05-23 python wnba.py
UNTIL_DATE    = pd.to_datetime(
    os.getenv("WNBA_UNTIL_DATE", datetime.now().date().isoformat())
).date()

FILTER_TO_UNTIL_DATE = True
SEASON_TYPES  = ["Regular Season", "Playoffs"]
DELAY         = 0.7            # segundos entre requests
DELAY_BOX     = 1.0            # para box scores
MAX_RETRIES   = 3
CHECKPOINT    = OUTPUT_DIR / ".checkpoint"   # para reanudar si se corta


# ══════════════════════════════════════════════════════════════════
# HELPERS GENERALES
# ══════════════════════════════════════════════════════════════════
def safe_request(fn, *args, retries=MAX_RETRIES, delay=DELAY, **kwargs):
    """Request con reintentos exponenciales."""
    for attempt in range(retries):
        try:
            time.sleep(delay)
            return fn(*args, **kwargs)
        except Exception as e:
            wait = delay * (2 ** attempt)
            if attempt < retries - 1:
                print(f"\n  ⚠️  Intento {attempt+1}/{retries} fallido: {e}. Reintentando en {wait:.1f}s...")
                time.sleep(wait)
            else:
                print(f"\n  ❌ Falló tras {retries} intentos: {e}")
                return None


def to_df(endpoint_result, index=0) -> pd.DataFrame:
    """Extrae DataFrame de un resultado de endpoint."""
    if endpoint_result is None:
        return pd.DataFrame()
    try:
        dfs = endpoint_result.get_data_frames()
        return dfs[index] if dfs and len(dfs) > index else pd.DataFrame()
    except Exception as e:
        print(f"  ⚠️  Error extrayendo DataFrame: {e}")
        return pd.DataFrame()


def save_csv(df: pd.DataFrame, name: str, mode="a"):
    """
    Guarda/añade un DataFrame al CSV correspondiente.
    mode='w'  → sobreescribe (para tablas simples como teams/players)
    mode='a'  → añade filas (para tablas grandes que se llenan en bucles)
    """
    path = OUTPUT_DIR / f"{name}.csv"
    header = (mode == "w") or (not path.exists())
    df.to_csv(path, mode=mode, header=header, index=False, encoding="utf-8-sig")


def checkpoint_done(key: str) -> bool:
    """Verifica si una tarea ya fue completada en una ejecución anterior."""
    if not CHECKPOINT.exists():
        return False
    return key in CHECKPOINT.read_text().splitlines()


def checkpoint_mark(key: str):
    """Marca una tarea como completada."""
    with open(CHECKPOINT, "a") as f:
        f.write(key + "\n")


def _v(row, col):
    """Devuelve el valor o None si no existe / es NaN."""
    try:
        v = row.get(col) if hasattr(row, "get") else getattr(row, col, None)
        if v is None:
            return None
        if isinstance(v, float) and pd.isna(v):
            return None
        return v
    except:
        return None


def filter_until_date(df: pd.DataFrame, date_col: str = "GAME_DATE") -> pd.DataFrame:
    """
    Deja solamente partidos con fecha <= UNTIL_DATE.
    Sirve para que la temporada actual no intente mezclar fechas futuras si el endpoint las trae.
    """
    if df.empty or not FILTER_TO_UNTIL_DATE or date_col not in df.columns:
        return df

    out = df.copy()
    parsed_dates = pd.to_datetime(out[date_col], errors="coerce").dt.date
    before = len(out)
    out = out[parsed_dates <= UNTIL_DATE].copy()
    skipped = before - len(out)

    if skipped:
        print(f"     ⏭️  {skipped} filas posteriores a {UNTIL_DATE} omitidas")

    return out


# ══════════════════════════════════════════════════════════════════
# PASO 1 — EQUIPOS
# ══════════════════════════════════════════════════════════════════
def fetch_teams():
    print("\n📋 [1/6] Equipos...")

    # Es una tabla chica: conviene refrescarla para capturar equipos nuevos.
    # Se guarda en modo "w", no duplica.
    team_ids_seen = set()
    rows = []
    now = datetime.now().isoformat()

    for season in SEASONS:
        result = safe_request(LeagueGameLog,
                              league_id=LEAGUE_ID,
                              season=season,
                              player_or_team_abbreviation="T")
        df = to_df(result)
        if df.empty:
            continue
        for _, row in df.iterrows():
            tid = int(row["TEAM_ID"])
            if tid not in team_ids_seen:
                team_ids_seen.add(tid)
                rows.append({
                    "team_id":   tid,
                    "team_abbr": row.get("TEAM_ABBREVIATION", ""),
                    "team_name": row.get("TEAM_NAME", ""),
                })

    # TeamInfoCommon no funciona con IDs de WNBA → usamos los datos del game log
    # que ya incluyen team_id, team_abbr y team_name
    for t in rows:
        t["updated_at"] = now

    save_csv(pd.DataFrame(rows), "teams", mode="w")
    print(f"  ✅ {len(rows)} equipos → teams.csv")


# ══════════════════════════════════════════════════════════════════
# PASO 2 — JUGADORAS
# ══════════════════════════════════════════════════════════════════
def fetch_players():
    print("\n👤 [2/6] Jugadoras...")

    # Es una tabla chica: conviene refrescarla para capturar rookies, traspasos o altas nuevas.
    # Se guarda en modo "w", no duplica.
    result = safe_request(CommonAllPlayers,
                          league_id=LEAGUE_ID,
                          season=SEASONS[-1],
                          is_only_current_season=0)
    df = to_df(result)
    if df.empty:
        print("  ⚠️  Sin datos de jugadoras")
        return

    rows = []
    for _, row in df.iterrows():
        full = str(row.get("DISPLAY_FIRST_LAST", ""))
        parts = full.split(" ", 1)
        rows.append({
            "player_id":  _v(row, "PERSON_ID"),
            "first_name": parts[0] if len(parts) > 0 else "",
            "last_name":  parts[1] if len(parts) > 1 else "",
            "full_name":  full,
            "is_active":  1 if str(row.get("ROSTERSTATUS", "0")) == "1" else 0,
            "team_id":    _v(row, "TEAM_ID"),
            "team_abbr":  _v(row, "TEAM_ABBREVIATION"),
            "jersey":     _v(row, "JERSEY"),
            "position":   _v(row, "POSITION"),
            "height":     _v(row, "HEIGHT"),
            "weight":     _v(row, "WEIGHT"),
            "birth_date": _v(row, "BIRTHDATE"),
            "experience": _v(row, "SEASON_EXP"),
            "school":     _v(row, "SCHOOL"),
            "country":    _v(row, "COUNTRY"),
            "draft_year": _v(row, "DRAFT_YEAR"),
            "draft_round":_v(row, "DRAFT_ROUND"),
            "draft_number":_v(row, "DRAFT_NUMBER"),
            "updated_at": datetime.now().isoformat(),
        })

    save_csv(pd.DataFrame(rows), "players", mode="w")
    print(f"  ✅ {len(rows)} jugadoras → players.csv")


# ══════════════════════════════════════════════════════════════════
# PASO 3 — PARTIDOS
# ══════════════════════════════════════════════════════════════════
def fetch_games():
    print("\n🏀 [3/6] Partidos...")
    print(f"  📅 Corte configurado: hasta {UNTIL_DATE}")

    games_path = OUTPUT_DIR / "games.csv"

    # Modo incremental: no borra games.csv.
    # Si el checkpoint se pierde, igual evita duplicados por game_id.
    existing_ids = set()
    if games_path.exists():
        try:
            existing_df = pd.read_csv(games_path, usecols=["game_id"], dtype={"game_id": str})
            existing_ids = set(existing_df["game_id"].astype(str).unique())
            print(f"  📦 games.csv existente: {len(existing_ids)} partidos ya guardados")
        except Exception as e:
            print(f"  ⚠️  No pude leer games.csv para detectar duplicados: {e}")

    now = datetime.now().isoformat()
    total_new = 0
    total_seen = 0

    for season in SEASONS:
        for stype in SEASON_TYPES:
            ck = f"games_{season}_{stype}_until_{UNTIL_DATE}"
            if checkpoint_done(ck):
                print(f"  ✅ {season} {stype}: ya descargado hasta {UNTIL_DATE}")
                continue

            print(f"  📅 {season} — {stype}")
            result = safe_request(
                LeagueGameLog,
                league_id=LEAGUE_ID,
                season=season,
                season_type_all_star=stype,
                player_or_team_abbreviation="T",
            )
            df = to_df(result)
            if df.empty:
                print(f"     ⚠️  Sin datos")
                checkpoint_mark(ck)
                continue

            df = filter_until_date(df, "GAME_DATE")

            if df.empty:
                print(f"     ⚠️  Sin partidos hasta {UNTIL_DATE}")
                checkpoint_mark(ck)
                continue

            games_dict = {}
            for _, row in df.iterrows():
                gid = str(row["GAME_ID"])
                matchup = str(row.get("MATCHUP", ""))
                if gid not in games_dict:
                    games_dict[gid] = {
                        "game_id":     gid,
                        "season":      season,
                        "season_type": stype,
                        "game_date":   str(row.get("GAME_DATE", "")),
                        "updated_at":  now,
                    }
                prefix = "home" if "vs." in matchup else "away"
                games_dict[gid][f"{prefix}_team_id"]   = int(row["TEAM_ID"])
                games_dict[gid][f"{prefix}_team_abbr"] = str(row.get("TEAM_ABBREVIATION", ""))
                games_dict[gid][f"{prefix}_pts"]       = _v(row, "PTS")
                games_dict[gid][f"{prefix}_wl"]        = str(row.get("WL", ""))

            batch = pd.DataFrame(list(games_dict.values()))
            total_seen += len(batch)

            # Rellenar columnas que pueden no existir
            for col in [
                "home_team_id", "away_team_id", "home_team_abbr", "away_team_abbr",
                "home_pts", "away_pts", "home_wl", "away_wl"
            ]:
                if col not in batch.columns:
                    batch[col] = None

            # Evitar duplicados si ya existían en CSV
            batch = batch[~batch["game_id"].astype(str).isin(existing_ids)].copy()

            if batch.empty:
                print(f"     ✅ 0 nuevos / {len(games_dict)} ya existían")
                checkpoint_mark(ck)
                continue

            save_csv(batch, "games", mode="a")
            existing_ids.update(batch["game_id"].astype(str).tolist())
            total_new += len(batch)
            checkpoint_mark(ck)
            print(f"     ✅ {len(batch)} partidos nuevos")

    print(f"  ✅ Nuevos agregados: {total_new} | revisados endpoint: {total_seen} → games.csv")


# ══════════════════════════════════════════════════════════════════
# PASO 4 — BOX SCORES (jugadoras y equipos por partido)
# ══════════════════════════════════════════════════════════════════
def fetch_box_scores():
    print("\n📊 [4/6] Box scores por partido...")

    games_path = OUTPUT_DIR / "games.csv"
    if not games_path.exists():
        print("  ❌ games.csv no encontrado. Ejecutá primero el paso 3.")
        return

    all_games = pd.read_csv(games_path, dtype={"game_id": str})
    all_game_ids = all_games[["game_id","season","season_type"]].drop_duplicates()

    # Detectar juegos ya procesados
    pgs_path = OUTPUT_DIR / "player_game_stats.csv"
    done_ids = set()
    if pgs_path.exists():
        done_df = pd.read_csv(pgs_path, usecols=["game_id"], dtype={"game_id": str})
        done_ids = set(done_df["game_id"].unique())

    pending = all_game_ids[~all_game_ids["game_id"].isin(done_ids)]
    print(f"  📌 {len(pending)} partidos pendientes de {len(all_game_ids)} totales")

    if pending.empty:
        print("  ✅ Todos los box scores ya están descargados")
        return

    # Limpiar headers si son nuevos archivos
    pgs_adv_path  = OUTPUT_DIR / "player_game_stats_advanced.csv"
    tgs_path      = OUTPUT_DIR / "team_game_stats.csv"
    first_pgs     = not pgs_path.exists()
    first_pgs_adv = not pgs_adv_path.exists()
    first_tgs     = not tgs_path.exists()

    now = datetime.now().isoformat()
    ok = 0
    err = 0

    for _, game_row in tqdm(pending.iterrows(), total=len(pending), desc="  Box scores"):
        gid     = str(game_row["game_id"])
        season  = game_row["season"]
        stype   = game_row["season_type"]

        # ── Traditional ──────────────────────────────────────
        trad    = safe_request(BoxScoreTraditionalV3, game_id=gid, delay=DELAY_BOX)
        t_play  = to_df(trad, 0)
        t_team  = to_df(trad, 2)

        # ── Advanced ─────────────────────────────────────────
        adv     = safe_request(BoxScoreAdvancedV3, game_id=gid, delay=DELAY_BOX)
        a_play  = to_df(adv, 0)

        if t_play.empty:
            err += 1
            continue

        # ── Player traditional ────────────────────────────────
        pgs_rows = []
        for _, r in t_play.iterrows():
            pgs_rows.append({
                "game_id":        gid,
                "player_id":      _v(r, "personId"),
                "player_name":    str(_v(r, "firstName") or "") + " " + str(_v(r, "familyName") or ""),
                "team_id":        _v(r, "teamId"),
                "team_abbreviation": _v(r, "teamTricode"),
                "season":         season,
                "season_type":    stype,
                "start_position": _v(r, "position"),
                "comment":        _v(r, "comment"),
                "minutes":        _v(r, "minutes"),
                "fgm":            _v(r, "fieldGoalsMade"),
                "fga":            _v(r, "fieldGoalsAttempted"),
                "fg_pct":         _v(r, "fieldGoalsPercentage"),
                "fg3m":           _v(r, "threePointersMade"),
                "fg3a":           _v(r, "threePointersAttempted"),
                "fg3_pct":        _v(r, "threePointersPercentage"),
                "ftm":            _v(r, "freeThrowsMade"),
                "fta":            _v(r, "freeThrowsAttempted"),
                "ft_pct":         _v(r, "freeThrowsPercentage"),
                "oreb":           _v(r, "reboundsOffensive"),
                "dreb":           _v(r, "reboundsDefensive"),
                "reb":            _v(r, "reboundsTotal"),
                "ast":            _v(r, "assists"),
                "stl":            _v(r, "steals"),
                "blk":            _v(r, "blocks"),
                "turnovers":      _v(r, "turnovers"),
                "pf":             _v(r, "foulsPersonal"),
                "pts":            _v(r, "points"),
                "plus_minus":     _v(r, "plusMinusPoints"),
                "updated_at":     now,
            })
        if pgs_rows:
            df_out = pd.DataFrame(pgs_rows)
            save_csv(df_out, "player_game_stats",
                     mode="w" if first_pgs else "a")
            first_pgs = False

        # ── Player advanced ───────────────────────────────────
        if not a_play.empty:
            adv_rows = []
            for _, r in a_play.iterrows():
                adv_rows.append({
                    "game_id":     gid,
                    "player_id":   _v(r, "personId"),
                    "player_name": str(_v(r, "firstName") or "") + " " + str(_v(r, "familyName") or ""),
                    "team_id":     _v(r, "teamId"),
                    "season":      season,
                    "season_type": stype,
                    "minutes":     _v(r, "minutes"),
                    "e_fg_pct":    _v(r, "effectiveFieldGoalPercentage"),
                    "ts_pct":      _v(r, "trueShootingPercentage"),
                    "usg_pct":     _v(r, "usagePercentage"),
                    "off_rating":  _v(r, "offensiveRating"),
                    "def_rating":  _v(r, "defensiveRating"),
                    "net_rating":  _v(r, "netRating"),
                    "ast_pct":     _v(r, "assistPercentage"),
                    "ast_to":      _v(r, "assistToTurnover"),
                    "ast_ratio":   _v(r, "assistRatio"),
                    "oreb_pct":    _v(r, "offensiveReboundPercentage"),
                    "dreb_pct":    _v(r, "defensiveReboundPercentage"),
                    "reb_pct":     _v(r, "reboundPercentage"),
                    "pace":        _v(r, "pace"),
                    "pie":         _v(r, "PIE"),
                    "updated_at":  now,
                })
            if adv_rows:
                save_csv(pd.DataFrame(adv_rows), "player_game_stats_advanced",
                         mode="w" if first_pgs_adv else "a")
                first_pgs_adv = False

        # ── Team traditional ──────────────────────────────────
        if not t_team.empty:
            tgs_rows = []
            for _, r in t_team.iterrows():
                tgs_rows.append({
                    "game_id":    gid,
                    "team_id":    _v(r, "teamId"),
                    "team_abbreviation": _v(r, "teamTricode"),
                    "team_name":  _v(r, "teamName"),
                    "season":     season,
                    "season_type": stype,
                    "wl":         None,
                    "minutes":    _v(r, "minutes"),
                    "fgm":        _v(r, "fieldGoalsMade"),
                    "fga":        _v(r, "fieldGoalsAttempted"),
                    "fg_pct":     _v(r, "fieldGoalsPercentage"),
                    "fg3m":       _v(r, "threePointersMade"),
                    "fg3a":       _v(r, "threePointersAttempted"),
                    "fg3_pct":    _v(r, "threePointersPercentage"),
                    "ftm":        _v(r, "freeThrowsMade"),
                    "fta":        _v(r, "freeThrowsAttempted"),
                    "ft_pct":     _v(r, "freeThrowsPercentage"),
                    "oreb":       _v(r, "reboundsOffensive"),
                    "dreb":       _v(r, "reboundsDefensive"),
                    "reb":        _v(r, "reboundsTotal"),
                    "ast":        _v(r, "assists"),
                    "stl":        _v(r, "steals"),
                    "blk":        _v(r, "blocks"),
                    "turnovers":  _v(r, "turnovers"),
                    "pf":         _v(r, "foulsPersonal"),
                    "pts":        _v(r, "points"),
                    "plus_minus": _v(r, "plusMinusPoints"),
                    "updated_at": now,
                })
            if tgs_rows:
                save_csv(pd.DataFrame(tgs_rows), "team_game_stats",
                         mode="w" if first_tgs else "a")
                first_tgs = False

        ok += 1

    print(f"  ✅ {ok} box scores OK  |  ❌ {err} errores")


# ══════════════════════════════════════════════════════════════════
# PASO 5 — STATS ACUMULADAS POR TEMPORADA (jugadoras)
# ══════════════════════════════════════════════════════════════════
def fetch_player_season_stats():
    print("\n📈 [5/6] Stats acumuladas — jugadoras...")

    pss_path = OUTPUT_DIR / "player_season_stats.csv"
    first    = not pss_path.exists()

    for season in SEASONS:
        for stype in SEASON_TYPES:
            for measure in ["Base", "Advanced"]:
                ck = f"pss_{season}_{stype}_{measure}"
                if checkpoint_done(ck):
                    print(f"  ✅ {season} {stype} {measure}: ya descargado")
                    continue

                result = safe_request(
                    LeagueDashPlayerStats,
                    league_id_nullable=LEAGUE_ID,
                    season=season,
                    season_type_all_star=stype,
                    per_mode_detailed="PerGame",
                    measure_type_detailed_defense=measure,
                )
                df = to_df(result)
                if df.empty:
                    print(f"  ⚠️  {season} {stype} {measure}: sin datos")
                    continue

                df = df.copy()
                df.columns = [c.lower() for c in df.columns]
                df.rename(columns={"tov": "turnovers"}, inplace=True)
                df["season"]      = season
                df["season_type"] = stype
                df["measure"]     = measure
                df["updated_at"]  = datetime.now().isoformat()

                save_csv(df, "player_season_stats", mode="w" if first else "a")
                first = False
                checkpoint_mark(ck)
                print(f"  ✅ {season} {stype} {measure}: {len(df)} filas")


# ══════════════════════════════════════════════════════════════════
# PASO 6 — STATS ACUMULADAS POR TEMPORADA (equipos)
# ══════════════════════════════════════════════════════════════════
def fetch_team_season_stats():
    print("\n🏟️  [6/6] Stats acumuladas — equipos...")

    tss_path = OUTPUT_DIR / "team_season_stats.csv"
    first    = not tss_path.exists()

    for season in SEASONS:
        for stype in SEASON_TYPES:
            ck = f"tss_{season}_{stype}"
            if checkpoint_done(ck):
                print(f"  ✅ {season} {stype}: ya descargado")
                continue

            result = safe_request(
                LeagueDashTeamStats,
                league_id_nullable=LEAGUE_ID,
                season=season,
                season_type_all_star=stype,
                per_mode_detailed="PerGame",
            )
            df = to_df(result)
            if df.empty:
                print(f"  ⚠️  {season} {stype}: sin datos")
                continue

            df = df.copy()
            df.columns = [c.lower() for c in df.columns]
            df.rename(columns={"tov": "turnovers"}, inplace=True)
            df["season"]      = season
            df["season_type"] = stype
            df["updated_at"]  = datetime.now().isoformat()

            save_csv(df, "team_season_stats", mode="w" if first else "a")
            first = False
            checkpoint_mark(ck)
            print(f"  ✅ {season} {stype}: {len(df)} equipos")


# ══════════════════════════════════════════════════════════════════
# GENERAR SCHEMA_README.txt
# ══════════════════════════════════════════════════════════════════
def generate_schema_readme():
    print("\n📝 Generando SCHEMA_README.txt...")

    # Leer columnas reales de cada CSV generado
    def cols(name):
        path = OUTPUT_DIR / f"{name}.csv"
        if not path.exists():
            return []
        return list(pd.read_csv(path, nrows=1).columns)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    readme = f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    WNBA DATABASE — ESQUEMA DE TABLAS                        ║
║                    Generado: {now}                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

Este archivo explica qué tablas crear en tu base de datos para importar
los CSVs generados por wnba_csv_exporter.py

Los scripts SQL están al final de cada sección.
Compatibles con: PostgreSQL · MySQL / MariaDB · SQLite

════════════════════════════════════════════════════════════════════════════════
RELACIONES ENTRE TABLAS
════════════════════════════════════════════════════════════════════════════════

  teams ──────────────────────────────────────────────────────────┐
    │                                                             │
    ├── players (team_id → teams.team_id)                         │
    │                                                             │
    ├── games   (home_team_id, away_team_id → teams.team_id)      │
    │              │                                              │
    │              ├── player_game_stats        (game_id)         │
    │              ├── player_game_stats_advanced(game_id)        │
    │              └── team_game_stats           (game_id)        │
    │                                                             │
    ├── player_season_stats (player_id, team_id)                  │
    └── team_season_stats   (team_id) ────────────────────────────┘


════════════════════════════════════════════════════════════════════════════════
1. TABLA: teams
   Archivo CSV: teams.csv
   Descripción: Un registro por equipo WNBA.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas en el CSV:
  {chr(10).join(f'  · {c}' for c in cols('teams')) or '  (ejecutá el script primero para ver columnas reales)'}

── SQL (PostgreSQL / MySQL) ──────────────────────────────────────────────────
CREATE TABLE teams (
    team_id        INT           PRIMARY KEY,   -- ID único del equipo
    team_abbr      VARCHAR(10),                 -- Abreviatura  ej: "IND"
    team_name      VARCHAR(100),                -- Nombre       ej: "Indiana Fever"
    team_city      VARCHAR(100),                -- Ciudad
    arena          VARCHAR(150),                -- Nombre del estadio
    head_coach     VARCHAR(100),                -- Entrenadora/or principal
    updated_at     TIMESTAMP                    -- Fecha de última actualización
);

── SQL (SQLite) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
    team_id     INTEGER PRIMARY KEY,
    team_abbr   TEXT,
    team_name   TEXT,
    team_city   TEXT,
    arena       TEXT,
    head_coach  TEXT,
    updated_at  TEXT
);

── Importar CSV (PostgreSQL) ─────────────────────────────────────────────────
\\COPY teams FROM 'teams.csv' WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');

── Importar CSV (MySQL) ──────────────────────────────────────────────────────
LOAD DATA INFILE '/ruta/teams.csv'
INTO TABLE teams
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\\n'
IGNORE 1 ROWS;


════════════════════════════════════════════════════════════════════════════════
2. TABLA: players
   Archivo CSV: players.csv
   Descripción: Una fila por jugadora. Incluye datos de draft, posición, país.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('players')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE players (
    player_id    INT           PRIMARY KEY,
    first_name   VARCHAR(100),
    last_name    VARCHAR(100),
    full_name    VARCHAR(200),
    is_active    SMALLINT,                -- 1 = activa, 0 = inactiva
    team_id      INT           REFERENCES teams(team_id),
    team_abbr    VARCHAR(10),
    jersey       VARCHAR(10),
    position     VARCHAR(20),             -- G, F, C, F-G, F-C, etc.
    height       VARCHAR(20),             -- ej: "6-1"
    weight       VARCHAR(20),
    birth_date   DATE,
    experience   INT,                     -- años en la liga
    school       VARCHAR(200),
    country      VARCHAR(100),
    draft_year   INT,
    draft_round  INT,
    draft_number INT,
    updated_at   TIMESTAMP
);

── Importar CSV (PostgreSQL) ─────────────────────────────────────────────────
\\COPY players FROM 'players.csv' WITH (FORMAT CSV, HEADER TRUE, ENCODING 'UTF8');


════════════════════════════════════════════════════════════════════════════════
3. TABLA: games
   Archivo CSV: games.csv
   Descripción: Un registro por partido. Score final, fecha, equipos.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('games')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE games (
    game_id        VARCHAR(20)   PRIMARY KEY,   -- ID único del partido
    season         VARCHAR(10),                 -- ej: "2024"
    season_type    VARCHAR(30),                 -- "Regular Season" o "Playoffs"
    game_date      DATE,
    home_team_id   INT           REFERENCES teams(team_id),
    away_team_id   INT           REFERENCES teams(team_id),
    home_team_abbr VARCHAR(10),
    away_team_abbr VARCHAR(10),
    home_pts       INT,
    away_pts       INT,
    home_wl        CHAR(1),                     -- "W" o "L"
    away_wl        CHAR(1),
    updated_at     TIMESTAMP
);

CREATE INDEX idx_games_season      ON games(season);
CREATE INDEX idx_games_date        ON games(game_date);
CREATE INDEX idx_games_home_team   ON games(home_team_id);
CREATE INDEX idx_games_away_team   ON games(away_team_id);


════════════════════════════════════════════════════════════════════════════════
4. TABLA: player_game_stats
   Archivo CSV: player_game_stats.csv
   Descripción: Box score tradicional. Una fila por jugadora por partido.
                Incluye puntos, rebotes, asistencias, tiros, +/-.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('player_game_stats')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE player_game_stats (
    id             BIGSERIAL     PRIMARY KEY,   -- auto-incremental
    game_id        VARCHAR(20)   REFERENCES games(game_id),
    player_id      INT           REFERENCES players(player_id),
    player_name    VARCHAR(200),
    team_id        INT           REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    season         VARCHAR(10),
    season_type    VARCHAR(30),
    start_position VARCHAR(5),                  -- titular o suplente
    comment        VARCHAR(200),                -- ej: "DND" (did not dress)
    minutes        VARCHAR(10),
    -- Tiros de campo
    fgm            SMALLINT,                    -- Field Goals Made
    fga            SMALLINT,                    -- Field Goals Attempted
    fg_pct         DECIMAL(5,3),
    -- Triples
    fg3m           SMALLINT,
    fg3a           SMALLINT,
    fg3_pct        DECIMAL(5,3),
    -- Tiros libres
    ftm            SMALLINT,
    fta            SMALLINT,
    ft_pct         DECIMAL(5,3),
    -- Rebotes
    oreb           SMALLINT,                    -- Ofensivos
    dreb           SMALLINT,                    -- Defensivos
    reb            SMALLINT,                    -- Totales
    -- Juego general
    ast            SMALLINT,                    -- Asistencias
    stl            SMALLINT,                    -- Robos
    blk            SMALLINT,                    -- Tapas/Bloqueos
    turnovers      SMALLINT,                    -- Pérdidas
    pf             SMALLINT,                    -- Faltas personales
    pts            SMALLINT,                    -- Puntos
    plus_minus     DECIMAL(6,1),
    updated_at     TIMESTAMP,
    UNIQUE (game_id, player_id)
);

CREATE INDEX idx_pgs_player ON player_game_stats(player_id);
CREATE INDEX idx_pgs_game   ON player_game_stats(game_id);
CREATE INDEX idx_pgs_team   ON player_game_stats(team_id);
CREATE INDEX idx_pgs_season ON player_game_stats(season);


════════════════════════════════════════════════════════════════════════════════
5. TABLA: player_game_stats_advanced
   Archivo CSV: player_game_stats_advanced.csv
   Descripción: Stats avanzadas por partido. Eficiencia, ritmo, porcentajes
                de uso, ratings ofensivos/defensivos, PIE, etc.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('player_game_stats_advanced')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE player_game_stats_advanced (
    id           BIGSERIAL   PRIMARY KEY,
    game_id      VARCHAR(20) REFERENCES games(game_id),
    player_id    INT         REFERENCES players(player_id),
    player_name  VARCHAR(200),
    team_id      INT         REFERENCES teams(team_id),
    season       VARCHAR(10),
    season_type  VARCHAR(30),
    minutes      VARCHAR(10),
    -- Eficiencia de tiro
    e_fg_pct     DECIMAL(5,3),   -- Effective FG% (pondera los triples)
    ts_pct       DECIMAL(5,3),   -- True Shooting % (incluye tiros libres)
    usg_pct      DECIMAL(5,3),   -- Usage % (% de posesiones que usa)
    -- Ratings
    off_rating   DECIMAL(7,2),   -- Puntos generados cada 100 posesiones
    def_rating   DECIMAL(7,2),   -- Puntos recibidos cada 100 posesiones
    net_rating   DECIMAL(7,2),   -- Diferencia off - def
    -- Asistencias
    ast_pct      DECIMAL(5,3),   -- % de canastas asistidas
    ast_to       DECIMAL(5,2),   -- Ratio asistencias/pérdidas
    ast_ratio    DECIMAL(5,2),
    -- Rebotes (porcentajes)
    oreb_pct     DECIMAL(5,3),
    dreb_pct     DECIMAL(5,3),
    reb_pct      DECIMAL(5,3),
    -- Otros
    pace         DECIMAL(6,2),   -- Posesiones por 40 minutos
    pie          DECIMAL(5,3),   -- Player Impact Estimate
    updated_at   TIMESTAMP,
    UNIQUE (game_id, player_id)
);

CREATE INDEX idx_pgsa_player ON player_game_stats_advanced(player_id);
CREATE INDEX idx_pgsa_game   ON player_game_stats_advanced(game_id);


════════════════════════════════════════════════════════════════════════════════
6. TABLA: team_game_stats
   Archivo CSV: team_game_stats.csv
   Descripción: Box score de equipo por partido. Totales de cada categoría.
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('team_game_stats')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE team_game_stats (
    id            BIGSERIAL   PRIMARY KEY,
    game_id       VARCHAR(20) REFERENCES games(game_id),
    team_id       INT         REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    team_name     VARCHAR(100),
    season        VARCHAR(10),
    season_type   VARCHAR(30),
    wl            CHAR(1),
    minutes       VARCHAR(10),
    fgm           SMALLINT,  fga  SMALLINT, fg_pct  DECIMAL(5,3),
    fg3m          SMALLINT,  fg3a SMALLINT, fg3_pct DECIMAL(5,3),
    ftm           SMALLINT,  fta  SMALLINT, ft_pct  DECIMAL(5,3),
    oreb          SMALLINT,  dreb SMALLINT, reb     SMALLINT,
    ast           SMALLINT,  stl  SMALLINT, blk     SMALLINT,
    turnovers     SMALLINT,  pf   SMALLINT, pts     SMALLINT,
    plus_minus    DECIMAL(6,1),
    updated_at    TIMESTAMP,
    UNIQUE (game_id, team_id)
);

CREATE INDEX idx_tgs_team   ON team_game_stats(team_id);
CREATE INDEX idx_tgs_game   ON team_game_stats(game_id);
CREATE INDEX idx_tgs_season ON team_game_stats(season);


════════════════════════════════════════════════════════════════════════════════
7. TABLA: player_season_stats
   Archivo CSV: player_season_stats.csv
   Descripción: Promedios por temporada de cada jugadora.
                Incluye tanto stats base (pts, reb, ast) como avanzadas
                (ts_pct, usg_pct, net_rating, etc.).
                La columna "measure" indica si es "Base" o "Advanced".
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('player_season_stats')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE player_season_stats (
    id           BIGSERIAL    PRIMARY KEY,
    player_id    INT          REFERENCES players(player_id),
    player_name  VARCHAR(200),
    team_id      INT          REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    season       VARCHAR(10),
    season_type  VARCHAR(30),
    measure      VARCHAR(20),             -- "Base" o "Advanced"
    -- Juego
    gp           SMALLINT,                -- Partidos jugados
    gs           SMALLINT,                -- Partidos como titular
    min          DECIMAL(5,2),            -- Minutos por partido
    -- Tiros (promedios)
    fgm          DECIMAL(5,2), fga  DECIMAL(5,2), fg_pct  DECIMAL(5,3),
    fg3m         DECIMAL(5,2), fg3a DECIMAL(5,2), fg3_pct DECIMAL(5,3),
    ftm          DECIMAL(5,2), fta  DECIMAL(5,2), ft_pct  DECIMAL(5,3),
    -- Rebotes
    oreb         DECIMAL(5,2), dreb DECIMAL(5,2), reb DECIMAL(5,2),
    -- Stats generales
    ast          DECIMAL(5,2), stl DECIMAL(5,2), blk DECIMAL(5,2),
    turnovers    DECIMAL(5,2), pf  DECIMAL(5,2), pts DECIMAL(5,2),
    -- Stats avanzadas (en filas con measure='Advanced')
    net_rating   DECIMAL(7,2),
    ast_pct      DECIMAL(5,3),
    ast_to       DECIMAL(5,2),
    oreb_pct     DECIMAL(5,3),
    dreb_pct     DECIMAL(5,3),
    usg_pct      DECIMAL(5,3),
    ts_pct       DECIMAL(5,3),
    e_fg_pct     DECIMAL(5,3),
    off_rating   DECIMAL(7,2),
    def_rating   DECIMAL(7,2),
    pace         DECIMAL(6,2),
    pie          DECIMAL(5,3),
    updated_at   TIMESTAMP,
    UNIQUE (player_id, team_id, season, season_type, measure)
);

CREATE INDEX idx_pss_player ON player_season_stats(player_id);
CREATE INDEX idx_pss_season ON player_season_stats(season);

── NOTA sobre measure ────────────────────────────────────────────────────────
El CSV tiene dos filas por jugadora/temporada/tipo:
  - measure='Base'     → pts, reb, ast, stl, blk, fg_pct, etc.
  - measure='Advanced' → ts_pct, usg_pct, net_rating, pie, etc.
Podés hacer JOIN o PIVOT según tu motor de base de datos.


════════════════════════════════════════════════════════════════════════════════
8. TABLA: team_season_stats
   Archivo CSV: team_season_stats.csv
   Descripción: Promedios de equipo por temporada (puntos, rebotes,
                victorias/derrotas, etc.).
════════════════════════════════════════════════════════════════════════════════

Columnas detectadas:
  {chr(10).join(f'  · {c}' for c in cols('team_season_stats')) or '  (pendiente)'}

── SQL ───────────────────────────────────────────────────────────────────────
CREATE TABLE team_season_stats (
    id           BIGSERIAL   PRIMARY KEY,
    team_id      INT         REFERENCES teams(team_id),
    team_abbreviation VARCHAR(10),
    team_name    VARCHAR(100),
    season       VARCHAR(10),
    season_type  VARCHAR(30),
    gp           SMALLINT,               -- Partidos jugados
    w            SMALLINT,               -- Victorias
    l            SMALLINT,               -- Derrotas
    win_pct      DECIMAL(5,3),           -- Porcentaje de victorias
    min          DECIMAL(5,2),
    fgm          DECIMAL(5,2), fga  DECIMAL(5,2), fg_pct  DECIMAL(5,3),
    fg3m         DECIMAL(5,2), fg3a DECIMAL(5,2), fg3_pct DECIMAL(5,3),
    ftm          DECIMAL(5,2), fta  DECIMAL(5,2), ft_pct  DECIMAL(5,3),
    oreb         DECIMAL(5,2), dreb DECIMAL(5,2), reb     DECIMAL(5,2),
    ast          DECIMAL(5,2), stl  DECIMAL(5,2), blk     DECIMAL(5,2),
    turnovers    DECIMAL(5,2), pf   DECIMAL(5,2), pts     DECIMAL(5,2),
    plus_minus   DECIMAL(6,2),
    updated_at   TIMESTAMP,
    UNIQUE (team_id, season, season_type)
);


════════════════════════════════════════════════════════════════════════════════
ORDEN DE IMPORTACIÓN (respetar por las foreign keys)
════════════════════════════════════════════════════════════════════════════════

  1. teams.csv                         ← sin dependencias
  2. players.csv                       ← depende de teams
  3. games.csv                         ← depende de teams
  4. team_game_stats.csv               ← depende de games + teams
  5. player_game_stats.csv             ← depende de games + players + teams
  6. player_game_stats_advanced.csv    ← depende de games + players
  7. player_season_stats.csv           ← depende de players + teams
  8. team_season_stats.csv             ← depende de teams


════════════════════════════════════════════════════════════════════════════════
IMPORTACIÓN RÁPIDA — SQLITE (Python)
════════════════════════════════════════════════════════════════════════════════

import sqlite3, pandas as pd

conn = sqlite3.connect("wnba.db")
for table in ["teams","players","games","team_game_stats",
              "player_game_stats","player_game_stats_advanced",
              "player_season_stats","team_season_stats"]:
    df = pd.read_csv(f"wnba_data/{{table}}.csv")
    df.to_sql(table, conn, if_exists="replace", index=False)
    print(f"{{table}}: {{len(df)}} filas")
conn.close()


════════════════════════════════════════════════════════════════════════════════
IMPORTACIÓN RÁPIDA — POSTGRESQL
════════════════════════════════════════════════════════════════════════════════

# Instalar: pip install psycopg2 sqlalchemy
from sqlalchemy import create_engine
import pandas as pd

engine = create_engine("postgresql://usuario:password@localhost/wnba_db")
for table in ["teams","players","games","team_game_stats",
              "player_game_stats","player_game_stats_advanced",
              "player_season_stats","team_season_stats"]:
    df = pd.read_csv(f"wnba_data/{{table}}.csv")
    df.to_sql(table, engine, if_exists="append", index=False, chunksize=1000)
    print(f"{{table}}: {{len(df)}} filas cargadas")


════════════════════════════════════════════════════════════════════════════════
CONSULTAS DE EJEMPLO
════════════════════════════════════════════════════════════════════════════════

-- Top 10 anotadoras temporada 2024:
SELECT player_name, team_abbreviation, gp, pts, reb, ast, fg_pct
FROM player_season_stats
WHERE season = '2024' AND season_type = 'Regular Season' AND measure = 'Base'
ORDER BY pts DESC LIMIT 10;

-- Mejor True Shooting % (mín. 15 partidos):
SELECT player_name, team_abbreviation, gp, pts, ts_pct, usg_pct
FROM player_season_stats
WHERE season = '2024' AND measure = 'Advanced' AND gp >= 15
ORDER BY ts_pct DESC LIMIT 10;

-- Partidos donde una jugadora anotó 30+ puntos:
SELECT p.full_name, g.game_date, t.team_abbr,
       pgs.pts, pgs.reb, pgs.ast, pgs.minutes
FROM player_game_stats pgs
JOIN players p ON pgs.player_id = p.player_id
JOIN games   g ON pgs.game_id   = g.game_id
JOIN teams   t ON pgs.team_id   = t.team_id
WHERE pgs.pts >= 30
ORDER BY pgs.pts DESC;

-- Standings 2024:
SELECT team_name, gp, w, l,
       ROUND(w * 100.0 / gp, 1) AS win_pct,
       pts, reb, ast
FROM team_season_stats
WHERE season = '2024' AND season_type = 'Regular Season'
ORDER BY win_pct DESC;


════════════════════════════════════════════════════════════════════════════════
Generado por wnba_csv_exporter.py  —  {now}
════════════════════════════════════════════════════════════════════════════════
"""

    readme_path = OUTPUT_DIR / "SCHEMA_README.txt"
    readme_path.write_text(readme, encoding="utf-8")
    print(f"  ✅ SCHEMA_README.txt generado en {readme_path}")


# ══════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ══════════════════════════════════════════════════════════════════
def print_summary():
    print("\n" + "═"*60)
    print("📦 ARCHIVOS GENERADOS EN ./wnba_data/")
    print("═"*60)

    csvs = [
        "teams", "players", "games",
        "player_game_stats", "player_game_stats_advanced",
        "team_game_stats", "player_season_stats", "team_season_stats"
    ]
    total_rows = 0
    for name in csvs:
        path = OUTPUT_DIR / f"{name}.csv"
        if path.exists():
            rows = sum(1 for _ in open(path, encoding="utf-8")) - 1
            size = path.stat().st_size / 1024
            total_rows += rows
            print(f"  {name+'.csv':<45} {rows:>7} filas  ({size:.0f} KB)")
        else:
            print(f"  {name+'.csv':<45} ── no generado")

    readme = OUTPUT_DIR / "SCHEMA_README.txt"
    if readme.exists():
        print(f"  {'SCHEMA_README.txt':<45} ✅")

    print("═"*60)
    print(f"  Total filas: {total_rows:,}")
    print(f"  Carpeta:     {OUTPUT_DIR.resolve()}")
    print("═"*60)


# ══════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════
def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║   WNBA CSV EXPORTER  v2.0                           ║")
    print(f"║   Temporadas: {', '.join(SEASONS):<24}     ║")
    print(f"║   Destino: ./wnba_data/                             ║")
    print("╚══════════════════════════════════════════════════════╝")
    print(f"\n⏱️  Inicio: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   Corte: descarga partidos con fecha <= {UNTIL_DATE}")
    print("   Modo incremental: no borra CSVs existentes; agrega lo nuevo.")
    print("   Si se interrumpe, volvé a ejecutar — continúa donde quedó.\n")

    # Crear carpeta de salida
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        fetch_teams()
        fetch_players()
        fetch_games()
        fetch_box_scores()
        fetch_player_season_stats()
        fetch_team_season_stats()
        generate_schema_readme()
        print_summary()
        print(f"\n✅ ¡Completado! {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    except KeyboardInterrupt:
        print("\n\n⏸️  Interrumpido. Los archivos descargados están disponibles.")
        print("   Volvé a ejecutar para continuar desde donde quedó.")
        generate_schema_readme()
        print_summary()

    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    main()
